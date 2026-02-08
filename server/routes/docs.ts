import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { runAgent } from '../ai/runner.js';
import { AuditRecorder } from '../automation/recorder.js';
import type { Doc, DocType, DocStatus } from '../../shared/types.js';

const app = new Hono();

// ─── Legacy endpoints (must be before /:id to avoid shadowing) ──────────────

// GET /api/v1/docs/designs — list design doc files
app.get('/designs', (c) => {
  const store = getStore();
  const files = store.listDesignDocs();
  return c.json({ ok: true, data: { files } });
});

app.get('/designs/:filename', (c) => {
  const store = getStore();
  const content = store.getDesignDoc(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Design doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

app.get('/decisions', (c) => {
  const store = getStore();
  const files = store.listDecisions();
  return c.json({ ok: true, data: { files } });
});

app.get('/decisions/:filename', (c) => {
  const store = getStore();
  const content = store.getDecision(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Decision doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

// ─── Doc Generation (AI-powered — must be before /:id) ──────────────────────

// POST /api/v1/docs/generate — trigger AI-powered doc generation
// Body: { mode: 'initialize' | 'update' }
app.post('/generate', async (c) => {
  let mode = 'update';
  try {
    const body = await c.req.json();
    mode = body?.mode || 'update';
  } catch { /* default to update */ }

  const store = getStore();

  // Build context for the AI
  const existingDocs = store.docsRegistry.docs.map(d => `- ${d.id}: "${d.title}" (${d.type}, updated: ${d.updated})`).join('\n');
  const systemsList = store.systems?.systems?.map((s: any) => `- ${s.id}: ${s.name} (health: ${s.health}/100)`).join('\n') || 'No systems tracked yet';
  const recentChangelog = store.changelog.entries.slice(-10).map((e: any) => `- [${e.id}] ${e.title}`).join('\n');
  const openIssues = store.issues.issues.filter((i: any) => i.status === 'open').map((i: any) => `- ${i.id}: ${i.title} (${i.severity})`).join('\n');
  const nowItems = store.roadmap.items.filter((i: any) => i.horizon === 'now' && i.status !== 'completed').map((i: any) => `- ${i.id}: ${i.title}`).join('\n');

  const initializePrompt = `You are the DevTrack Documentation Generator. Your job is to create comprehensive, high-quality documentation for this project from scratch.

## Instructions

1. **Scan the codebase** using list_directory and read_project_file to understand the project structure, key files, and architecture.
2. **Read existing docs** using list_docs to see what already exists in the registry.
3. **Read all relevant data**: systems, roadmap items, issues, ideas, changelog, session history, git log.
4. **For each doc in the registry**, generate rich, comprehensive markdown content using update_doc. Each doc should be:
   - Written for a layman who doesn't understand how the tools are put together
   - Well-structured with clear headings, sections, and examples
   - Include code snippets where relevant
   - Cross-reference other docs and entities
   - Minimum 100 lines per doc, more for major docs like system-overview
5. **Create any missing docs** that should exist (e.g., if there's a system without a corresponding doc page).
6. **For system-overview**: Create the definitive architecture document with diagrams (ASCII), component relationships, data flow, and how everything connects.
7. **For getting-started**: Write a complete onboarding guide that someone new to the project can follow.
8. **For api-reference**: Document every API endpoint with method, path, request/response format, and examples.
9. **For data-model-reference**: Document every entity type with all fields, relationships, and examples.
10. **For each system-* doc**: Deep dive into that system's architecture, key files, how it works, configuration, and troubleshooting.

## Current State
Existing docs:\n${existingDocs}

Systems:\n${systemsList}

Recent changelog:\n${recentChangelog}

Open issues:\n${openIssues}

Now items:\n${nowItems}

Be thorough. This is the first full documentation pass. Read source files to understand implementations. Don't just describe from metadata — actually look at the code.

IMPORTANT: If the docs registry is empty or has few entries, you need to CREATE the doc structure first using create_doc before writing content. A good doc structure for any project includes:
- system-overview (architecture overview)
- getting-started (onboarding guide)
- data-model-reference (entity/data documentation)
- api-reference (API endpoint documentation)
- One system-* doc for each tracked system
Create these with create_doc if they don't exist, then update their content with update_doc.`;

  const updatePrompt = `You are the DevTrack Documentation Updater. Your job is to incrementally update existing documentation to reflect recent changes.

## Instructions

1. **List all docs** and check their last_generated dates.
2. **Read recent changelog** (last 10-20 entries) to understand what changed since docs were last updated.
3. **Read recent session log** to understand the latest work.
4. **Check git log** for recent commits and what files changed.
5. **For each doc that is stale** (last_generated is before the latest changes):
   - Read the current content
   - Read relevant source files if the doc covers code that changed
   - Update the content to reflect current state
   - Use update_doc to save the updated content
6. **Check if new docs are needed** — new systems, new major features, etc.
7. **Don't rewrite docs that are current** — only update what's stale.
8. **Keep the existing structure and tone** — just update facts, stats, and descriptions.

## Current State
Existing docs:\n${existingDocs}

Systems:\n${systemsList}

Recent changelog:\n${recentChangelog}

Open issues:\n${openIssues}

Now items:\n${nowItems}

Focus on accuracy over comprehensiveness. Update what's wrong, don't rewrite what's right.`;

  const systemPrompt = mode === 'initialize'
    ? 'You are the DevTrack documentation generator. You have full access to all DevTrack tools. Generate comprehensive, high-quality documentation for the entire project. Be thorough and detailed.'
    : 'You are the DevTrack documentation updater. You have full access to all DevTrack tools. Update stale documentation to reflect recent changes. Be efficient — only update what needs updating.';

  const userMessage = mode === 'initialize' ? initializePrompt : updatePrompt;

  // Create audit recorder for tracking
  const recorder = new AuditRecorder(
    'docs-generate',
    `Documentation ${mode === 'initialize' ? 'Initialization' : 'Update'}`,
    'manual',
    'manual',
    { mode },
  );

  // Fire async — don't block the response
  (async () => {
    try {
      const result = await runAgent(systemPrompt, userMessage, {
        task: mode === 'initialize' ? 'deep_audit' : 'incremental_update',
        maxIterations: mode === 'initialize' ? 30 : 15,
        recorder,
        heliconeProperties: {
          User: 'devtrack-docs-generator',
          Source: 'docs-generation',
          Mode: mode,
          Trigger: 'manual',
          AutomationName: `docs-${mode}`,
        },
      });

      console.log(`[docs-generate] ${mode} completed: ${result.iterations} iterations, ${result.tool_calls_made.length} tool calls, $${result.cost.toFixed(4)}`);
      recorder.finalize(result.content, result.iterations);

      // Track cost
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { getDataDir } = await import('../project-config.js');
        const configPath = path.join(getDataDir(), 'ai/config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.budget = config.budget || {};
        config.budget.total_spent_usd = (config.budget.total_spent_usd || 0) + result.cost;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      } catch { /* ignore cost tracking failure */ }

      broadcast({
        type: 'docs_generated',
        data: { mode, iterations: result.iterations, tool_calls: result.tool_calls_made.length, cost: result.cost },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[docs-generate] ${mode} failed:`, err.message);
      recorder.fail(err.message || 'Unknown error');
    }
  })();

  return c.json({ ok: true, data: { mode, status: 'started' } });
});

// ─── Doc Registry CRUD ──────────────────────────────────────────────────────

// GET /api/v1/docs — list all docs from registry
app.get('/', (c) => {
  const store = getStore();
  const type = c.req.query('type') as DocType | undefined;
  const status = c.req.query('status') as DocStatus | undefined;
  const system = c.req.query('system');
  const auto = c.req.query('auto_generated');

  let docs = store.docsRegistry.docs;
  if (type) docs = docs.filter(d => d.type === type);
  if (status) docs = docs.filter(d => d.status === status);
  if (system) docs = docs.filter(d => d.systems.includes(system));
  if (auto !== undefined) docs = docs.filter(d => d.auto_generated === (auto === 'true'));

  return c.json({ ok: true, data: { docs, total: store.docsRegistry.docs.length } });
});

// GET /api/v1/docs/:id — get doc metadata + content
app.get('/:id', (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const content = store.getDocContent(id);
  return c.json({ ok: true, data: { ...doc, content } });
});

// POST /api/v1/docs — create a new doc
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();
  const now = new Date().toISOString().split('T')[0];

  const doc: Doc = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    type: body.type || 'wiki',
    content: '', // stored in .md file, not in registry
    systems: body.systems || [],
    roadmap_items: body.roadmap_items || [],
    epics: body.epics || [],
    auto_generated: body.auto_generated || false,
    last_generated: body.auto_generated ? now : null,
    generation_sources: body.generation_sources || [],
    author: body.author || 'user',
    status: body.status || 'published',
    tags: body.tags || [],
    created: now,
    updated: now,
  };

  if (store.docsRegistry.docs.find(d => d.id === doc.id)) {
    return c.json({ ok: false, error: `Doc "${doc.id}" already exists` }, 409);
  }

  // Write content to .md file
  if (body.content) {
    store.writeDocContent(doc.id, body.content);
  }

  // Save to registry (without content — that's in the .md file)
  store.docsRegistry.docs.push(doc);
  store.saveDocsRegistry();

  store.addActivity({
    type: 'doc_updated',
    entity_type: 'doc',
    entity_id: doc.id,
    title: `Doc created: ${doc.title}`,
    actor: doc.author,
    metadata: { type: doc.type, auto_generated: doc.auto_generated },
  });

  broadcast({ type: 'file_changed', data: { file: `docs/${doc.id}.md` }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: doc }, 201);
});

// PATCH /api/v1/docs/:id — update doc
app.patch('/:id', async (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const body = await c.req.json();

  if (body.title !== undefined) doc.title = body.title;
  if (body.type !== undefined) doc.type = body.type;
  if (body.systems !== undefined) doc.systems = body.systems;
  if (body.roadmap_items !== undefined) doc.roadmap_items = body.roadmap_items;
  if (body.epics !== undefined) doc.epics = body.epics;
  if (body.status !== undefined) doc.status = body.status;
  if (body.tags !== undefined) doc.tags = body.tags;
  if (body.auto_generated !== undefined) doc.auto_generated = body.auto_generated;
  if (body.generation_sources !== undefined) doc.generation_sources = body.generation_sources;

  // Update content if provided
  if (body.content !== undefined) {
    store.writeDocContent(id, body.content);
    if (doc.auto_generated) doc.last_generated = new Date().toISOString().split('T')[0];
  }

  doc.updated = new Date().toISOString().split('T')[0];
  store.saveDocsRegistry();

  broadcast({ type: 'file_changed', data: { file: `docs/${id}.md` }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: doc });
});

// DELETE /api/v1/docs/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const idx = store.docsRegistry.docs.findIndex(d => d.id === id);
  if (idx === -1) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const removed = store.docsRegistry.docs.splice(idx, 1)[0];
  store.deleteDocContent(id);
  store.saveDocsRegistry();

  return c.json({ ok: true, data: removed });
});

// POST /api/v1/docs/:id/regenerate — flag for AI regeneration
app.post('/:id/regenerate', async (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);
  if (!doc.auto_generated) return c.json({ ok: false, error: 'Doc is not auto-generated' }, 400);

  // Mark as needing regeneration — the automation engine will pick this up
  doc.last_generated = null;
  doc.updated = new Date().toISOString().split('T')[0];
  store.saveDocsRegistry();

  return c.json({ ok: true, data: doc });
});

export default app;
