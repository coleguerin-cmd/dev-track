/**
 * Docs Generator — AI-powered documentation generation engine.
 * 
 * Two-step process:
 * 1. Discovery agent: scans project, produces a doc plan (what pages to create)
 * 2. Per-doc writers: each page gets a focused agent that generates content
 * 
 * Supports:
 * - Initialize mode: full deep scan with Opus, builds from zero
 * - Update mode: diff-based incremental updates with Sonnet
 * - Phased generation: architecture → operational → implementation → cross-ref
 * - Parallel execution with shared rate limiting
 * - Checkpoint/resume on server restart
 * - Edit history tracking (who wrote what, when, cost)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getStore } from '../store.js';
import { getDataDir, getProjectRoot } from '../project-config.js';
import { broadcast } from '../ws.js';
import { runAgent } from './runner.js';
import { AuditRecorder } from '../automation/recorder.js';
import { formatStateCacheForPrompt, getStateCache, buildStateCache } from './state-cache.js';
import type { DocPlan, DocPlanPage, DocLayer, DocEdit } from '../../shared/types.js';

// ─── Git Diff Utilities ──────────────────────────────────────────────────────

/**
 * Get git diff for specific files since a given commit or date.
 * Returns a summary of changes, not the full diff (to keep token count low).
 */
function getGitDiffSummary(sinceDate?: string, files?: string[]): string {
  try {
    const root = getProjectRoot();
    const since = sinceDate || '7 days ago';
    const fileFilter = files?.length ? `-- ${files.join(' ')}` : '';
    
    // Get changed files with stats
    const stat = execSync(
      `git diff --stat --since="${since}" HEAD ${fileFilter}`,
      { cwd: root, encoding: 'utf-8', timeout: 10000 }
    ).trim();

    // Get commit messages
    const log = execSync(
      `git log --oneline --since="${since}" -20`,
      { cwd: root, encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (!stat && !log) return 'No changes detected.';

    return [
      log ? `Recent commits:\n${log}` : '',
      stat ? `\nFile changes:\n${stat}` : '',
    ].filter(Boolean).join('\n');
  } catch {
    return 'Git diff unavailable.';
  }
}

/**
 * Check if source files relevant to a doc have changed since the doc was last generated.
 */
function hasSourceFilesChanged(doc: any): boolean {
  if (!doc.last_generated) return true; // Never generated
  
  try {
    const root = getProjectRoot();
    // Check if any relevant files changed since last generation
    const systems = doc.systems || [];
    const systemDirs = systems.map((s: string) => {
      // Map system IDs to likely directory paths
      if (s === 'server') return 'server/';
      if (s === 'web-ui') return 'ui/';
      if (s === 'cli') return 'cli/';
      if (s === 'data-layer') return 'shared/';
      return `server/${s.replace(/-/g, '')}/`;
    });

    if (systemDirs.length === 0) return true; // Can't determine relevance, assume stale

    const since = doc.last_generated;
    const changes = execSync(
      `git log --oneline --since="${since}" -- ${systemDirs.join(' ')}`,
      { cwd: root, encoding: 'utf-8', timeout: 5000 }
    ).trim();

    return changes.length > 0;
  } catch {
    return true; // On error, assume stale
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GenerationStatus {
  running: boolean;
  mode: 'initialize' | 'update' | null;
  phase: 'planning' | 'architecture' | 'operational' | 'implementation' | 'cross-ref' | 'done' | null;
  started_at: string | null;
  plan: DocPlan | null;
  docs_total: number;
  docs_completed: number;
  current_doc: string | null;
  completed_docs: { id: string; completed_at: string; cost: number; layer: string }[];
  errors: string[];
  total_cost: number;
}

// ─── Status Management ───────────────────────────────────────────────────────

let _status: GenerationStatus = {
  running: false, mode: null, phase: null, started_at: null, plan: null,
  docs_total: 0, docs_completed: 0, current_doc: null,
  completed_docs: [], errors: [], total_cost: 0,
};

function getStatusPath(): string {
  return path.join(getDataDir(), 'ai/docs-generation-status.json');
}

function getPlanPath(): string {
  return path.join(getDataDir(), 'ai/docs-plan.json');
}

export function getGenerationStatus(): GenerationStatus {
  return _status;
}

function updateStatus(updates: Partial<GenerationStatus>) {
  Object.assign(_status, updates);
  // Persist to disk for resumability
  try {
    const dir = path.join(getDataDir(), 'ai');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getStatusPath(), JSON.stringify(_status, null, 2));
  } catch { /* ignore */ }
  broadcast({ type: 'docs_generation_status', data: _status, timestamp: new Date().toISOString() });
}

function savePlan(plan: DocPlan) {
  try {
    const dir = path.join(getDataDir(), 'ai');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getPlanPath(), JSON.stringify(plan, null, 2));
  } catch { /* ignore */ }
}

function loadPlan(): DocPlan | null {
  try {
    const p = getPlanPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { /* ignore */ }
  return null;
}

function trackCost(cost: number) {
  _status.total_cost += cost;
  try {
    const configPath = path.join(getDataDir(), 'ai/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.budget = config.budget || {};
    config.budget.total_spent_usd = (config.budget.total_spent_usd || 0) + cost;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch { /* ignore */ }
}

// Check if a doc was completed in the current or recent run
function isCompleted(docId: string): boolean {
  return _status.completed_docs.some(d => d.id === docId);
}

// ─── Doc Structure Template ──────────────────────────────────────────────────

const DOC_STRUCTURE_TEMPLATE = `
Suggested documentation structure for any software project.
Adapt this to fit the project — not every project needs every page.

LAYER: architecture (what is it, how does it fit together)
- Project Overview: high-level architecture, system diagram, tech stack, how components connect
- One page per major system/module: what it does, key components, dependencies, design decisions

LAYER: operational (how do I use it, how do I work on it)
- Getting Started: prerequisites, installation, first run, basic workflow
- Configuration Guide: settings, environment variables, feature flags
- API Reference: every endpoint with method, path, request/response format, examples
- Deployment: how to build, deploy, and monitor

LAYER: implementation (how does this specific thing WORK — the "if I got hit by a bus" layer)
- Data Model Reference: every entity type, every field, relationships, constraints
- Business Logic: formulas, calculations, data transformations, algorithms
- For complex features: dedicated deep-dive pages (e.g., "Billing Calculations", "Auth Flow")

LAYER: design (why was it built this way)
- Architecture Decision Records: key choices and tradeoffs
- Design docs for major features

Use judgment: a billing system needs "Billing Calculations" docs. A UI framework needs "Component API" docs.
A simple CLI tool might only need 5-6 pages. A complex platform might need 30+.
`;

// ─── Discovery Agent ─────────────────────────────────────────────────────────

async function runDiscoveryAgent(mode: 'initialize' | 'update'): Promise<DocPlan> {
  const store = getStore();
  const stateCache = formatStateCacheForPrompt();
  const existingDocs = store.docsRegistry.docs.map(d =>
    `- ${d.id}: "${d.title}" (layer: ${d.layer || 'unknown'}, ${d.auto_generated ? 'auto' : 'manual'}, updated: ${d.updated}, size: ${store.getDocContent(d.id).length} chars)`
  ).join('\n');

  const designDocs = store.listDesignDocs().map(f => `- designs/${f}`).join('\n');

  const systemPrompt = `You are a documentation architect. Analyze a project and produce a documentation plan.
Output ONLY valid JSON matching this schema — no markdown, no explanation, just the JSON:
{
  "pages": [
    {
      "id": "kebab-case-id",
      "title": "Human Readable Title",
      "layer": "architecture|operational|implementation|design",
      "description": "What this page should cover in 1-2 sentences",
      "source_files": ["path/to/relevant/file.ts"],
      "parent_id": null,
      "sort_order": 0,
      "complexity": "low|medium|high|deep"
    }
  ]
}

Complexity guide:
- "low": simple overview, 1-2 source files, config page (5 iterations)
- "medium": standard system doc, 3-5 source files (8 iterations)
- "high": complex system with business logic, 5-10 source files (15 iterations)
- "deep": critical implementation doc with formulas/calculations spanning many files (20+ iterations)`;

  const userMessage = `${mode === 'initialize' ? 'Plan a complete documentation suite from scratch.' : 'Evaluate the existing docs and plan what needs to be added, updated, or restructured.'}

${stateCache}

## Existing Documentation
${existingDocs || 'No docs exist yet.'}

## Design Docs (read-only reference)
${designDocs || 'None.'}

## Structure Template
${DOC_STRUCTURE_TEMPLATE}

## Instructions
${mode === 'initialize'
  ? `Scan the project and create a comprehensive doc plan. Use list_directory and read_project_file to understand the codebase structure. Create pages for ALL four layers. Don't just mirror the existing docs — think about what THIS project needs. Sub-pages are supported (set parent_id to the parent page's id).`
  : `Review existing docs and identify: (1) pages that need updating (source code changed), (2) new pages that should be added (new systems/features), (3) pages that should be split (if >25KB), (4) pages that should be merged or removed. Output the full plan including existing pages that are current (mark them so we can skip them).`
}

Output ONLY the JSON. No markdown fences, no explanation.`;

  const result = await runAgent(systemPrompt, userMessage, {
    task: 'incremental_update', // Cheap model for planning
    maxIterations: 5,
    maxTokens: 8192,
    heliconeProperties: {
      User: 'devtrack-docs-discovery',
      Source: 'docs-generation',
      Mode: mode,
      Phase: 'discovery',
    },
  });

  trackCost(result.cost);

  // Parse the doc plan from the agent's response
  let pages: DocPlanPage[] = [];
  try {
    // Try to extract JSON — handle markdown code fences, raw JSON, or text-wrapped JSON
    let jsonStr = result.content;
    const codeFenceMatch = result.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeFenceMatch) jsonStr = codeFenceMatch[1];
    const jsonMatch = jsonStr.match(/\{[\s\S]*"pages"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      pages = (parsed.pages || []).map((p: any, i: number) => ({
        id: p.id,
        title: p.title,
        layer: p.layer || 'architecture',
        description: p.description || '',
        source_files: p.source_files || [],
        parent_id: p.parent_id || undefined,
        sort_order: p.sort_order ?? i,
        exists: !!store.docsRegistry.docs.find(d => d.id === p.id),
        complexity: p.complexity || (p.layer === 'implementation' ? 'high' : 'medium'),
      }));
    }
  } catch (e: any) {
    console.error('[docs-discovery] Failed to parse doc plan:', e.message);
    // Fallback: generate plan from existing docs + systems
    const systems = store.systems?.systems || [];
    pages = [
      { id: 'system-overview', title: 'System Architecture Overview', layer: 'architecture' as DocLayer, description: 'High-level architecture', source_files: [], sort_order: 0, exists: true, complexity: 'high' as const },
      { id: 'getting-started', title: 'Getting Started Guide', layer: 'operational' as DocLayer, description: 'Setup and first run', source_files: [], sort_order: 1, exists: true, complexity: 'medium' as const },
      { id: 'api-reference', title: 'API Reference', layer: 'operational' as DocLayer, description: 'All API endpoints', source_files: [], sort_order: 2, exists: true, complexity: 'high' as const },
      { id: 'data-model-reference', title: 'Data Model Reference', layer: 'implementation' as DocLayer, description: 'All entity types and fields', source_files: [], sort_order: 3, exists: true, complexity: 'deep' as const },
      ...systems.map((s: any, i: number) => ({
        id: `system-${s.id}`, title: `System: ${s.name}`, layer: 'architecture' as DocLayer,
        description: `Architecture and implementation of ${s.name}`, source_files: [],
        sort_order: 10 + i, exists: !!store.docsRegistry.docs.find(d => d.id === `system-${s.id}`),
        complexity: 'medium' as const,
      })),
    ];
  }

  // Estimate cost based on complexity (drives iteration count which drives token usage)
  const costPerComplexity: Record<string, number> = { low: 0.25, medium: 0.50, high: 0.90, deep: 1.50 };
  const estimatedCost = pages.reduce((sum, p) => sum + (costPerComplexity[p.complexity] || 0.50), 0);
  const estimatedMinutes = Math.ceil(pages.length * 2.5); // ~2.5 min per doc on Sonnet

  const plan: DocPlan = {
    id: `plan-${Date.now()}`,
    mode,
    created_at: new Date().toISOString(),
    model: mode === 'initialize' ? 'claude-opus-4-5-20251101' : 'sonnet',
    pages,
    estimated_cost_usd: Math.round(estimatedCost * 100) / 100,
    estimated_minutes: estimatedMinutes,
  };

  savePlan(plan);
  return plan;
}

// ─── Per-Doc Writer ──────────────────────────────────────────────────────────

const LAYER_PROMPTS: Record<string, string> = {
  architecture: `Write ARCHITECTURE documentation. Explain what this component/system IS, how it fits into the larger system, its key design decisions, and how it connects to other components. Include diagrams using Mermaid syntax (\`\`\`mermaid). Write for someone who has never seen the codebase.`,

  operational: `Write OPERATIONAL documentation. Explain how to USE, CONFIGURE, and WORK WITH this component. Include setup instructions, configuration options, common workflows, and troubleshooting. Include code examples and command-line snippets.`,

  implementation: `Write IMPLEMENTATION documentation. This is the "hit by a bus" layer — document HOW things work internally. For every function you find: what does it calculate? What are the inputs? What is the output? If there's a formula, write it out explicitly (result = fieldA + fieldB * rate). Document every business rule, every data transformation, every edge case. Read the actual source files and trace the logic.`,

  design: `Write DESIGN documentation. Explain WHY architectural decisions were made. What alternatives were considered? What tradeoffs were accepted? Reference any existing design docs. This helps future developers understand the reasoning behind the code.`,
};

async function writeDoc(page: DocPlanPage, stateCache: string, mode: 'initialize' | 'update'): Promise<number> {
  const store = getStore();
  const layerPrompt = LAYER_PROMPTS[page.layer] || LAYER_PROMPTS.architecture;

  // Check if doc exists — if not, create it
  let doc = store.docsRegistry.docs.find(d => d.id === page.id);
  if (!doc) {
    const now = new Date().toISOString().split('T')[0];
    doc = {
      id: page.id, title: page.title, type: 'auto-generated' as any, content: '',
      parent_id: page.parent_id || null, sort_order: page.sort_order, layer: page.layer,
      systems: [], roadmap_items: [], epics: [],
      auto_generated: true, last_generated: null, generation_sources: ['codebase', 'systems'],
      last_edited_by: 'ai' as const, last_edited_at: now, edit_history: [],
      author: 'ai', status: 'published' as any, tags: ['auto-generated', page.layer],
      created: now, updated: now,
    } as any;
    store.docsRegistry.docs.push(doc as any);
    store.saveDocsRegistry();
  }

  const sourceFilesHint = page.source_files.length > 0
    ? `Key source files to read: ${page.source_files.join(', ')}`
    : 'Use list_directory and read_project_file to find relevant source files.';

  // For update mode: provide diff context so the agent knows what changed
  let diffContext = '';
  if (mode === 'update' && doc) {
    const lastGen = (doc as any).last_generated || (doc as any).updated;
    const gitDiff = getGitDiffSummary(lastGen, page.source_files.length > 0 ? page.source_files : undefined);
    
    // Get recent changelog entries
    const store2 = getStore();
    const recentChangelog = store2.changelog.entries
      .filter((e: any) => !lastGen || e.date >= lastGen)
      .slice(-5)
      .map((e: any) => `- [${e.id}] ${e.title}`)
      .join('\n');

    if (gitDiff !== 'No changes detected.' || recentChangelog) {
      diffContext = `\n## What Changed Since Last Generation (${lastGen || 'unknown'})

### Git Changes
${gitDiff}

### Recent Changelog
${recentChangelog || 'No new entries.'}

Update the document to reflect these changes. Maintain existing structure — only change what needs updating.`;
    }
  }

  const systemPrompt = `You are a documentation writer. ${layerPrompt}

When you call update_doc, you MUST include the "content" parameter with the FULL markdown text as a string.
Use Mermaid syntax for diagrams (\`\`\`mermaid blocks), NOT ASCII art.
Write at least 80 lines of content. Be comprehensive and specific to THIS project.`;

  const userMessage = `${mode === 'update' ? 'Update' : 'Generate'} documentation for: "${page.title}" (id: ${page.id})
Layer: ${page.layer}
Description: ${page.description}

${stateCache}

${sourceFilesHint}
${diffContext}

## Instructions
1. Read the current content using get_doc with id "${page.id}" (if it exists).
2. ${mode === 'update' ? 'Check the diff context above. Read any changed source files.' : 'Read relevant source files to understand the actual implementation.'}
3. Write comprehensive content appropriate for the "${page.layer}" layer.
4. Call update_doc with id="${page.id}" and content="<your full markdown text>".

The content parameter MUST be the complete markdown document as a string.`;

  // Iteration budget driven by AI-estimated complexity from the doc plan
  const complexityBudget: Record<string, number> = { low: 5, medium: 8, high: 15, deep: 22 };
  const maxIters = complexityBudget[page.complexity] || 8;

  const recorder = new AuditRecorder(`docs-${page.id}`, `Doc: ${page.title}`, 'manual', 'manual', { doc_id: page.id, layer: page.layer });

  try {
    const result = await runAgent(systemPrompt, userMessage, {
      task: mode === 'initialize' ? 'doc_generation' : 'incremental_update',
      maxIterations: maxIters,
      maxTokens: 16384,
      recorder,
      heliconeProperties: {
        User: 'devtrack-docs-generator',
        Source: 'docs-generation',
        Mode: mode,
        Phase: page.layer,
        DocId: page.id,
        Layer: page.layer,
      },
    });

    recorder.finalize(result.content, result.iterations);
    let totalCost = result.cost;
    trackCost(result.cost);

    // ─── Verification: check if the doc was actually written ──────────
    const postContent = store.getDocContent(page.id);
    const preLength = doc ? (store.getDocContent(page.id)?.length || 0) : 0;
    const contentWritten = postContent.length > 5000 || (postContent.length > preLength + 500);

    if (!contentWritten) {
      console.warn(`[docs-gen] Verification FAILED for ${page.id}: content length ${postContent.length} (was ${preLength}). Retrying with direct prompt...`);
      
      // Retry with a simpler, more direct prompt — just write the content
      try {
        const retryPrompt = `The previous attempt to write documentation for "${page.title}" failed to produce content. 

Read the current doc with get_doc id="${page.id}", then read 2-3 relevant source files, then call update_doc with id="${page.id}" and a COMPLETE markdown document as the content parameter.

The content MUST be a full markdown string, at least 50 lines. Do not skip the content parameter.`;

        const retryResult = await runAgent(
          `You are a documentation writer. Write comprehensive documentation. When calling update_doc, the content parameter is REQUIRED and must be the FULL markdown text.`,
          retryPrompt,
          { task: 'incremental_update', maxIterations: 5, maxTokens: 16384, heliconeProperties: { ...{ User: 'devtrack-docs-generator', Source: 'docs-retry', DocId: page.id } } },
        );
        
        totalCost += retryResult.cost;
        trackCost(retryResult.cost);

        const retryContent = store.getDocContent(page.id);
        if (retryContent.length > postContent.length + 500) {
          console.log(`[docs-gen] Retry SUCCESS for ${page.id}: ${retryContent.length} chars`);
        } else {
          console.warn(`[docs-gen] Retry also failed for ${page.id}. Content: ${retryContent.length} chars. Moving on.`);
        }
      } catch (retryErr: any) {
        console.error(`[docs-gen] Retry error for ${page.id}:`, retryErr.message);
      }
    }

    // Record edit history
    const docRef = store.docsRegistry.docs.find(d => d.id === page.id);
    if (docRef) {
      const finalContent = store.getDocContent(page.id);
      const edit: DocEdit = {
        timestamp: new Date().toISOString(),
        actor: 'ai',
        actor_detail: `${result.iterations} iterations, ${mode} mode${!contentWritten ? ' (retry needed)' : ''}`,
        summary: `Generated ${page.layer} documentation (${Math.round(finalContent.length / 1024)}KB)`,
        cost_usd: totalCost,
      };
      if (!docRef.edit_history) docRef.edit_history = [];
      docRef.edit_history.push(edit as any);
      (docRef as any).last_edited_by = 'ai';
      (docRef as any).last_edited_at = new Date().toISOString().split('T')[0];
      (docRef as any).layer = page.layer;
      (docRef as any).parent_id = page.parent_id || null;
      (docRef as any).sort_order = page.sort_order;
      store.saveDocsRegistry();
    }

    return totalCost;
  } catch (err: any) {
    recorder.fail(err.message || 'Unknown error');
    throw err;
  }
}

// ─── Parallel Pool ───────────────────────────────────────────────────────────

async function runPool<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const running = new Set<Promise<void>>();

  while (queue.length > 0 || running.size > 0) {
    while (running.size < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      const p = handler(item).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size > 0) await Promise.race(running);
  }
}

// ─── Main Generation Orchestrator ────────────────────────────────────────────

export async function generateDocs(mode: 'initialize' | 'update'): Promise<void> {
  if (_status.running) {
    throw new Error('Doc generation already in progress');
  }

  // Rebuild state cache
  buildStateCache();

  updateStatus({
    running: true, mode, phase: 'planning', started_at: new Date().toISOString(),
    docs_total: 0, docs_completed: 0, current_doc: null,
    completed_docs: [], errors: [], total_cost: 0, plan: null,
  });

  try {
    // Step 0: For update mode, pre-check which docs actually have source changes
    if (mode === 'update') {
      const store = getStore();
      const autoDocs = store.docsRegistry.docs.filter(d => d.auto_generated);
      const staleCount = autoDocs.filter(d => hasSourceFilesChanged(d)).length;
      const thinCount = autoDocs.filter(d => (store.getDocContent(d.id)?.length || 0) < 5000).length;
      console.log(`[docs-gen] Pre-check: ${staleCount} docs with source changes, ${thinCount} with thin content`);
      if (staleCount === 0 && thinCount === 0) {
        console.log('[docs-gen] All docs are current — nothing to update');
        updateStatus({ running: false, phase: 'done', docs_total: 0, docs_completed: 0 });
        return;
      }
    }

    // Step 1: Discovery — produce doc plan
    console.log(`[docs-gen] Step 1: Running discovery agent (${mode})...`);
    const plan = await runDiscoveryAgent(mode);
    updateStatus({ plan, docs_total: plan.pages.length, phase: 'architecture' });
    console.log(`[docs-gen] Plan: ${plan.pages.length} pages, est. $${plan.estimated_cost_usd}, ~${plan.estimated_minutes} min`);

    // Step 2: Generate docs by phase
    const stateCache = formatStateCacheForPrompt();
    const phases: DocLayer[] = ['architecture', 'operational', 'implementation', 'design'];
    const concurrency = mode === 'initialize' ? 2 : 3; // Lower concurrency for Opus

    for (const phase of phases) {
      const phaseDocs = plan.pages.filter(p => p.layer === phase && !isCompleted(p.id));
      if (phaseDocs.length === 0) continue;

      updateStatus({ phase });
      console.log(`[docs-gen] Phase: ${phase} — ${phaseDocs.length} docs`);

      await runPool(phaseDocs, concurrency, async (page) => {
        updateStatus({ current_doc: page.id });
        console.log(`[docs-gen]   Writing: ${page.id} (${page.layer})`);

        try {
          const cost = await writeDoc(page, stateCache, mode);
          _status.docs_completed++;
          _status.completed_docs.push({
            id: page.id, completed_at: new Date().toISOString(),
            cost, layer: page.layer,
          });
          updateStatus({});
          console.log(`[docs-gen]   Done: ${page.id} ($${cost.toFixed(2)}) [${_status.docs_completed}/${_status.docs_total}]`);
        } catch (err: any) {
          console.error(`[docs-gen]   Failed: ${page.id}: ${err.message}`);
          _status.errors.push(`${page.id}: ${err.message}`);
          updateStatus({});
          // Continue — don't fail the whole run
        }
      });
    }

    // Step 3: Done
    updateStatus({ running: false, phase: 'done', current_doc: null });
    console.log(`[docs-gen] Complete: ${_status.docs_completed}/${_status.docs_total} docs, $${_status.total_cost.toFixed(2)}, ${_status.errors.length} errors`);

    broadcast({
      type: 'docs_generated',
      data: { mode, completed: _status.docs_completed, total: _status.docs_total, cost: _status.total_cost },
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    updateStatus({ running: false, phase: null });
    console.error(`[docs-gen] Fatal error:`, err.message);
    throw err;
  }
}
