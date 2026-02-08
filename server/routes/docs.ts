import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { runAgent } from '../ai/runner.js';
import { AuditRecorder } from '../automation/recorder.js';
import { formatStateCacheForPrompt, getStateCache } from '../ai/state-cache.js';
import { getDataDir } from '../project-config.js';
import type { Doc, DocType, DocStatus } from '../../shared/types.js';

const app = new Hono();

// ─── Generation Status Tracking ─────────────────────────────────────────────

interface DocGenStatus {
  running: boolean;
  mode: 'initialize' | 'update' | null;
  started_at: string | null;
  docs_total: number;
  docs_completed: number;
  current_doc: string | null;
  completed_docs: { id: string; completed_at: string; cost: number }[];
  errors: string[];
  total_cost: number;
}

let _genStatus: DocGenStatus = {
  running: false, mode: null, started_at: null,
  docs_total: 0, docs_completed: 0, current_doc: null,
  completed_docs: [], errors: [], total_cost: 0,
};

function getStatusPath(): string {
  return path.join(getDataDir(), 'ai/docs-generation-status.json');
}

function saveStatus() {
  try {
    const statusPath = getStatusPath();
    const dir = path.dirname(statusPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify(_genStatus, null, 2));
  } catch { /* ignore */ }
  // Broadcast status update for UI polling
  broadcast({ type: 'docs_generation_status', data: _genStatus, timestamp: new Date().toISOString() });
}

function loadStatus(): DocGenStatus {
  try {
    const statusPath = getStatusPath();
    if (fs.existsSync(statusPath)) {
      return JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return _genStatus;
}

function resetStatus(mode: 'initialize' | 'update', total: number) {
  _genStatus = {
    running: true, mode, started_at: new Date().toISOString(),
    docs_total: total, docs_completed: 0, current_doc: null,
    completed_docs: [], errors: [], total_cost: 0,
  };
  saveStatus();
}

function wasRecentlyCompleted(docId: string, withinMs: number = 3600000): boolean {
  // Check if this doc was completed within the last hour (resumability)
  const status = loadStatus();
  const entry = status.completed_docs?.find(d => d.id === docId);
  if (!entry) return false;
  return (Date.now() - new Date(entry.completed_at).getTime()) < withinMs;
}

// Track cost in ai/config.json budget
function trackCost(cost: number) {
  try {
    const configPath = path.join(getDataDir(), 'ai/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.budget = config.budget || {};
    config.budget.total_spent_usd = (config.budget.total_spent_usd || 0) + cost;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch { /* ignore */ }
}

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

// GET /api/v1/docs/generate/status — get current generation progress
app.get('/generate/status', (c) => {
  return c.json({ ok: true, data: _genStatus });
});

// POST /api/v1/docs/generate — trigger AI-powered doc generation
// Body: { mode: 'initialize' | 'update' }
// Initialize: monolithic Opus 4.5 pass (rich holistic first-time generation)
// Update: per-doc Sonnet coordinator (efficient incremental updates)
app.post('/generate', async (c) => {
  if (_genStatus.running) {
    return c.json({ ok: false, error: 'Doc generation already in progress', data: _genStatus }, 409);
  }

  let mode: 'initialize' | 'update' = 'update';
  try {
    const body = await c.req.json();
    mode = body?.mode === 'initialize' ? 'initialize' : 'update';
  } catch { /* default to update */ }

  // Fire async — don't block the response
  if (mode === 'initialize') {
    runInitializeMode().catch(err => {
      console.error('[docs-generate] initialize failed:', err.message);
      _genStatus.running = false;
      _genStatus.errors.push(err.message);
      saveStatus();
    });
  } else {
    runUpdateMode().catch(err => {
      console.error('[docs-generate] update failed:', err.message);
      _genStatus.running = false;
      _genStatus.errors.push(err.message);
      saveStatus();
    });
  }

  return c.json({ ok: true, data: { mode, status: 'started' } });
});

// ─── Initialize Mode: Monolithic Opus 4.5 ───────────────────────────────────

async function runInitializeMode() {
  const store = getStore();
  const stateCache = formatStateCacheForPrompt();
  const docs = store.docsRegistry.docs;

  // Check which docs are already up to date (resumability)
  const skipDocs = docs.filter(d => wasRecentlyCompleted(d.id)).map(d => d.id);
  const skipNote = skipDocs.length > 0
    ? `\n\nNOTE: These docs were recently updated — SKIP them: ${skipDocs.join(', ')}`
    : '';

  resetStatus('initialize', docs.length - skipDocs.length);

  const systemPrompt = 'You are the DevTrack documentation generator. You have full access to all DevTrack tools. Generate comprehensive, high-quality documentation for the entire project. Be thorough and detailed. Write for a layman — someone who has never seen the codebase.';

  const userMessage = `You are generating comprehensive documentation for this project from scratch.

${stateCache}

## Instructions

1. **Scan the codebase** using list_directory and read_project_file to understand the project structure, key files, and architecture.
2. **Read existing docs** using list_docs to see what exists in the registry.
3. **For each doc**, generate rich markdown content using update_doc. IMPORTANT: The content parameter must be a complete markdown string.
4. **Create any missing docs** using create_doc if systems exist without corresponding doc pages.
5. Write each doc as a comprehensive wiki page:
   - Well-structured with clear headings and sections
   - Include code snippets and file references where relevant
   - Cross-reference other docs (e.g., "See [System Overview](system-overview) for architecture")
   - Minimum 100 lines for major docs, 50+ for system docs
6. **system-overview**: Definitive architecture document with ASCII diagrams, component relationships, data flow.
7. **getting-started**: Complete onboarding guide for a new developer.
8. **api-reference**: Every API endpoint with method, path, request/response format.
9. **data-model-reference**: Every entity type with fields, relationships, examples.
10. **system-* docs**: Deep dive into architecture, key files, how it works, configuration.

If the registry is empty, CREATE the doc structure first:
- system-overview, getting-started, data-model-reference, api-reference
- One system-* doc per tracked system
${skipNote}`;

  const recorder = new AuditRecorder('docs-initialize', 'Documentation Initialization', 'manual', 'manual', { mode: 'initialize' });

  try {
    const result = await runAgent(systemPrompt, userMessage, {
      task: 'doc_generation',
      model: 'claude-opus-4-5-20251101', // Force Opus 4.5 for Helicone cost tracking
      maxIterations: 20,
      recorder,
      heliconeProperties: {
        User: 'devtrack-docs-generator',
        Source: 'docs-generation',
        Mode: 'initialize',
        Trigger: 'manual',
        AutomationName: 'docs-initialize',
        ModelOverride: 'opus-4.5',
      },
    });

    console.log(`[docs-generate] initialize completed: ${result.iterations} iterations, ${result.tool_calls_made.length} tool calls, $${result.cost.toFixed(4)}`);
    recorder.finalize(result.content, result.iterations);
    trackCost(result.cost);

    _genStatus.running = false;
    _genStatus.total_cost = result.cost;
    _genStatus.docs_completed = _genStatus.docs_total; // Mark all done
    saveStatus();

    broadcast({ type: 'docs_generated', data: { mode: 'initialize', cost: result.cost }, timestamp: new Date().toISOString() });
  } catch (err: any) {
    recorder.fail(err.message || 'Unknown error');
    _genStatus.running = false;
    _genStatus.errors.push(err.message);
    saveStatus();
    throw err;
  }
}

// ─── Update Mode: Per-Doc Sonnet Coordinator ─────────────────────────────────

async function runUpdateMode() {
  const store = getStore();
  const stateCache = formatStateCacheForPrompt();
  const docs = store.docsRegistry.docs.filter(d => d.auto_generated);

  // Filter to stale docs only (not updated today, or never generated)
  const today = new Date().toISOString().split('T')[0];
  const staleDocs = docs.filter(d => {
    if (wasRecentlyCompleted(d.id)) return false; // Skip recently done (resumability)
    if (!d.last_generated) return true; // Never generated
    return d.last_generated < today; // Generated before today
  });

  if (staleDocs.length === 0) {
    console.log('[docs-generate] update: all docs are current, nothing to do');
    _genStatus = { running: false, mode: 'update', started_at: new Date().toISOString(), docs_total: 0, docs_completed: 0, current_doc: null, completed_docs: [], errors: [], total_cost: 0 };
    saveStatus();
    return;
  }

  resetStatus('update', staleDocs.length);
  console.log(`[docs-generate] update: ${staleDocs.length} stale docs to update`);

  for (const doc of staleDocs) {
    _genStatus.current_doc = doc.id;
    saveStatus();

    console.log(`[docs-generate] updating: ${doc.id} ("${doc.title}")`);

    try {
      await generateSingleDoc(doc, stateCache);

      _genStatus.docs_completed++;
      _genStatus.completed_docs.push({ id: doc.id, completed_at: new Date().toISOString(), cost: 0 });
      saveStatus();

      console.log(`[docs-generate] completed: ${doc.id} (${_genStatus.docs_completed}/${_genStatus.docs_total})`);
    } catch (err: any) {
      console.error(`[docs-generate] failed: ${doc.id}:`, err.message);
      _genStatus.errors.push(`${doc.id}: ${err.message}`);
      saveStatus();
      // Continue to next doc — don't fail the whole batch
    }
  }

  _genStatus.running = false;
  _genStatus.current_doc = null;
  saveStatus();

  broadcast({ type: 'docs_generated', data: { mode: 'update', completed: _genStatus.docs_completed, total: _genStatus.docs_total, cost: _genStatus.total_cost }, timestamp: new Date().toISOString() });
  console.log(`[docs-generate] update complete: ${_genStatus.docs_completed}/${_genStatus.docs_total} docs, $${_genStatus.total_cost.toFixed(2)}`);
}

async function generateSingleDoc(doc: any, stateCache: string) {
  const systemsContext = doc.systems?.length > 0
    ? `This doc covers these systems: ${doc.systems.join(', ')}.`
    : '';

  const systemPrompt = `You are a documentation writer for DevTrack. Update or generate content for a single document. Write for a layman. Be comprehensive but focused on this specific topic.`;

  const userMessage = `Update the document "${doc.title}" (id: ${doc.id}).

${stateCache}

${systemsContext}

## Instructions
1. Read the current content of this doc using get_doc with id "${doc.id}".
2. If the doc covers specific systems, read the relevant source files using read_project_file.
3. Generate updated, comprehensive markdown content.
4. Call update_doc with id "${doc.id}" and the FULL markdown content as a string in the content parameter.
5. The content must be complete — not a reference, not a filename, but the actual markdown text.

Write at least 50 lines of content. Include headings, descriptions, code examples where relevant, and cross-references to other docs.`;

  const recorder = new AuditRecorder(`docs-update-${doc.id}`, `Doc Update: ${doc.title}`, 'manual', 'manual', { doc_id: doc.id });

  try {
    const result = await runAgent(systemPrompt, userMessage, {
      task: 'incremental_update', // Routes to Sonnet
      maxIterations: 5,
      recorder,
      heliconeProperties: {
        User: 'devtrack-docs-generator',
        Source: 'docs-generation',
        Mode: 'update',
        DocId: doc.id,
        Trigger: 'manual',
        AutomationName: `docs-update-${doc.id}`,
      },
    });

    recorder.finalize(result.content, result.iterations);
    trackCost(result.cost);
    _genStatus.total_cost += result.cost;

    // Update the completed entry with actual cost
    const entry = _genStatus.completed_docs.find(d => d.id === doc.id);
    if (entry) entry.cost = result.cost;
  } catch (err: any) {
    recorder.fail(err.message || 'Unknown error');
    throw err;
  }
}

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
