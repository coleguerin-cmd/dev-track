#!/usr/bin/env npx tsx
/**
 * DevTrack Data Audit + Fix — Session 7
 * Corrects stale data after v2 migration.
 */

import fs from 'fs';
import path from 'path';

const DATA = path.resolve(process.argv[2] || path.join(process.cwd(), 'data'));
const today = '2026-02-08';

function read<T>(f: string, fb: T): T {
  const p = path.join(DATA, f);
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fb; } catch { return fb; }
}
function write(f: string, d: any) {
  const p = path.join(DATA, f);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  console.log(`  ✓ ${f}`);
}

// ─── 1. Roadmap Items ───────────────────────────────────────────────────────
console.log('\n── Fixing roadmap items ──');
const roadmap = read<any>('roadmap/items.json', { items: [] });

for (const item of roadmap.items) {
  // Move completed items to shipped horizon
  if (item.status === 'completed' && item.horizon !== 'shipped') {
    item.horizon = 'shipped';
    item.updated = today;
  }

  // Fix entity-model-v2-refactor → completed
  if (item.id === 'entity-model-v2-refactor') {
    item.status = 'completed';
    item.completed = today;
    item.horizon = 'shipped';
    item.updated = today;
    item.summary = 'Complete rewrite: 14 entity types (shared/types.ts), data migration script, store refactor (new data paths), 7 new route files (roadmap, epics, milestones, releases, systems, labels, automations), 6 existing routes updated, AI tools updated (actions→systems), UI overhauled (new Systems view, API client expanded, notifications, sidebar, dashboard). Migration preserves all existing data. Backward compat maintained.';
    item.design_doc = 'designs/ENTITY-MODEL-V2.md';
  }

  // Fix ai-chat-agent summary
  if (item.id === 'ai-chat-agent') {
    item.summary = 'Persistent sidebar chat agent with ~40 tools across 16 domains, multi-provider model routing (OpenAI/Anthropic/Google), streaming, tool call visualization. Foundation built: AIService, ModelRouter, modular tool registry (server/ai/tools/), ChatService, SSE API, sidebar UI. API keys configurable in Integrations. Next: test with real conversations in browser, polish UX.';
    item.updated = today;
    item.related_issues = ['ISS-008'];
  }

  // Fix user-profiles → completed (built in session 5, ISS-010 resolved)
  if (item.id === 'user-profiles') {
    item.status = 'completed';
    item.completed = today;
    item.horizon = 'shipped';
    item.updated = today;
    item.summary = 'AI-observed user profiles with IQ-scale intelligence score (128), cognitive profile radar chart (8 dimensions), technical skills radar chart (8 dimensions). All AI-set, read-only. Deep assessment notes. Behavior patterns user-adjustable. SVG radar charts built from scratch. Session observations array. AI-to-AI guidance section. Loaded at session start, injected into system prompts.';
    item.related_issues = ['ISS-010'];
  }

  // Fix type classifications
  if (item.id === 'boot-ui') item.type = 'chore';
  if (item.id === 'ts-build') item.type = 'chore';
  if (item.id === 'kanban-dnd') item.type = 'enhancement';
  if (item.id === 'test-integrations') item.type = 'chore';

  // Fix global-search summary (says "backlog")
  if (item.id === 'global-search') {
    item.summary = 'Floating search bar at top of every page. Searches roadmap, issues, ideas, changelog, codebase, systems. Grouped results with quick-jump.';
    item.updated = today;
  }

  // Fix init-wizard summary (says "state.json + backlog")
  if (item.id === 'init-wizard') {
    item.summary = 'dev-track init: scan codebase, AI infers systems, generates systems.json + roadmap items + context briefing. Populates all v2 entities from codebase analysis.';
    item.updated = today;
  }

  // Fix ui-design-overhaul — partially done (Lucide icons, Cursor aesthetic done in session 5)
  if (item.id === 'ui-design-overhaul') {
    item.summary = 'Phase 1 DONE (session 5): Lucide SVG icons throughout, Cursor-minimal sidebar nav, dark theme with proper hierarchy, notification tray. Phase 2 TODO: tighter spacing, better typography on detail views, richer information density like Linear, polish card designs.';
    item.status = 'in_progress';
    item.started = '2026-02-08';
    item.updated = today;
  }
}

write('roadmap/items.json', roadmap);

// ─── 2. Systems ─────────────────────────────────────────────────────────────
console.log('\n── Fixing systems ──');
const systems = read<any>('systems/systems.json', { systems: [] });

const systemUpdates: Record<string, any> = {
  'server': {
    description: '22 route files (v2: roadmap, epics, milestones, releases, systems, labels, automations + existing). Hono framework, WebSocket + file watcher. Multi-project hot-swap. Build passes clean.',
    health_score: 90,
    tech_stack: ['Hono', 'TypeScript', 'Node.js'],
    dependencies: ['data-layer'],
    dependents: ['web-ui', 'cli'],
  },
  'web-ui': {
    description: '12+ views: Dashboard, Roadmap (kanban DnD), Systems (new), Issues, Ideas, Codebase (react-flow graph), Sessions, Changelog, Docs, Metrics, Settings. AI chat sidebar. Notification tray. Project switcher. Lucide icons throughout.',
    health_score: 75,
    tech_stack: ['React', 'Vite', 'Tailwind', 'TypeScript'],
    dependencies: ['server'],
  },
  'ai-intelligence': {
    description: 'AIService across OpenAI/Anthropic/Google with Helicone proxy. Auto-model-discovery. Task-aware ModelRouter with fallback chains. ~40 tools across 16 domain modules (server/ai/tools/). ChatService with multi-turn agent loop. SSE streaming. User profiles injected into system prompts.',
    health_score: 75,
    tech_stack: ['OpenAI', 'Anthropic', 'Google AI', 'TypeScript'],
    dependencies: ['server', 'data-layer'],
  },
  'cli': {
    description: 'Full command set (init, start, status, backlog, issues, changelog, context, projects). Multi-project support (init, start, list). Never fully tested against live server.',
    health_score: 55,
    tech_stack: ['TypeScript', 'Node.js'],
    dependencies: ['server'],
  },
  'data-layer': {
    description: 'v2 entity model: 14 entities, ~500 lines of shared types. Store reads from v2 paths with backward compat. File watcher syncs. JSON-based with typed interfaces. Data directories: roadmap/, systems/, releases/, activity/, labels/, automations/, docs/, issues/, ideas/, session/, brain/, ai/, metrics/.',
    health_score: 95,
    tech_stack: ['TypeScript', 'JSON'],
  },
  'integrations': {
    description: '8 plugins: GitHub (zero-config via gh CLI), Vercel, Supabase, Sentry, Helicone, Upstash, AWS EC2, Cloudflare. Helicone BYOK configured for AI cost tracking. Others untested with real creds (ISS-003).',
    health_score: 60,
    tech_stack: ['TypeScript'],
    dependencies: ['server'],
  },
  'codebase-visualizer': {
    description: 'react-flow graph with 3 views (module, file, dependency). Plain-English module descriptions and relationship labels. Rich detail panel. Scanner-generated descriptions from code analysis.',
    health_score: 80,
    tech_stack: ['React', 'react-flow', 'dagre'],
    dependencies: ['codebase-scanner', 'server'],
  },
  'codebase-scanner': {
    description: 'Generic module inference via directory analysis. generateModuleDescription() and generateEdgeLabel() for rich descriptions. Auto-discovery approach — no annotations needed.',
    health_score: 80,
    tech_stack: ['TypeScript'],
    dependencies: ['data-layer'],
  },
  'brain': {
    description: 'AI memory system: notes (observations, suggestions, warnings, decisions), user preferences, context recovery for session handoff, user profiles with AI-observed intelligence scoring. Loaded by AI chat at every conversation start.',
    health_score: 85,
    tech_stack: ['TypeScript', 'JSON'],
    dependencies: ['data-layer'],
  },
  'cursor-rule': {
    description: 'alwaysApply frontmatter, mandatory pre/post checklist at top, inline Quick Status + Last Session Briefing (auto-regenerated), file map, session lifecycle instructions, AI autonomy permissions, standing instructions. ISS-006 (AI drift) partially addressed — structural enforcement still needed.',
    health_score: 70,
  },
  'session-tracking': {
    description: '6 sessions logged (v2 unified Session type). 19+ changelog entries. Velocity tracked with point values. Session log migrated to v2 format with session IDs.',
    health_score: 75,
    dependencies: ['data-layer'],
  },
};

for (const sys of systems.systems) {
  const updates = systemUpdates[sys.id];
  if (updates) {
    if (updates.description) sys.description = updates.description;
    if (updates.health_score) sys.health_score = updates.health_score;
    if (updates.tech_stack) sys.tech_stack = updates.tech_stack;
    if (updates.dependencies) sys.dependencies = updates.dependencies;
    if (updates.dependents) sys.dependents = updates.dependents;
    sys.last_assessed = today;
    sys.updated = today;
  }
}

write('systems/systems.json', systems);

// ─── 3. State ───────────────────────────────────────────────────────────────
console.log('\n── Fixing state ──');
const avgHealth = Math.round(systems.systems.reduce((s: number, sys: any) => s + sys.health_score, 0) / systems.systems.length);

write('state.json', {
  last_updated: today,
  overall_health: avgHealth,
  summary: `7 sessions (current). Entity Model v2 shipped — 14 entities, enterprise-grade PM architecture. 22 roadmap items, 19 issues (3 open), 37+ ideas captured. ~40 AI tools across 16 domains. Multi-project support with hot-swap. 11 systems tracked. Next priorities: test AI chat in browser, complete UI design overhaul, build AI watcher for structural enforcement.`,
});

// ─── 4. Milestone ───────────────────────────────────────────────────────────
console.log('\n── Fixing milestone ──');
const milestones = read<any>('roadmap/milestones.json', { milestones: [] });
for (const ms of milestones.milestones) {
  if (ms.id === 'v0-2-entity-model') {
    ms.status = 'active';
    ms.description = 'v0.2 milestone: Entity model v2 refactor (types, store, routes, tools, UI), AI chat agent polish, multi-project architecture, UI design system. Foundation for dogfooding on real projects.';
    ms.updated = today;
  }
}
write('roadmap/milestones.json', milestones);

// ─── 5. Issues — fix types ─────────────────────────────────────────────────
console.log('\n── Fixing issue types ──');
const issues = read<any>('issues/items.json', { issues: [], next_id: 20 });
for (const iss of issues.issues) {
  if (iss.id === 'ISS-007') iss.type = 'ux';
  if (iss.id === 'ISS-012') iss.type = 'tech_debt';
  if (iss.id === 'ISS-006') iss.type = 'tech_debt';
  if (iss.id === 'ISS-003') iss.type = 'bug';
}
write('issues/items.json', issues);

// ─── 6. Epic progress ──────────────────────────────────────────────────────
console.log('\n── Fixing epic progress ──');
const epics = read<any>('roadmap/epics.json', { epics: [] });
for (const epic of epics.epics) {
  if (epic.id === 'entity-model-v2') {
    const items = roadmap.items.filter((i: any) => i.epic_id === 'entity-model-v2');
    epic.item_count = items.length;
    epic.completed_count = items.filter((i: any) => i.status === 'completed').length;
    epic.progress_pct = items.length > 0 ? Math.round((epic.completed_count / epic.item_count) * 100) : 0;
    epic.updated = today;
    // If all items complete, complete the epic
    if (epic.completed_count === epic.item_count && epic.item_count > 0) {
      epic.status = 'completed';
      epic.completed = today;
    }
    epic.ai_summary = 'Entity model v2 refactor complete. 14 entity types defined, data migrated, store rewritten, 7 new route files, AI tools updated, UI overhauled. Foundation for enterprise-grade PM.';
  }
}
write('roadmap/epics.json', epics);

console.log(`\n✅ Audit fix complete. Overall health: ${avgHealth}%`);
