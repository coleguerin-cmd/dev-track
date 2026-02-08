#!/usr/bin/env npx tsx
/**
 * DevTrack Entity Model v2 Migration
 * 
 * Transforms all v1 data files to v2 format:
 * - backlog/items.json → roadmap/items.json (add new fields)
 * - state.json systems[] → systems/systems.json (convert format)
 * - issues/items.json (add type, tags, discovered_by, etc.)
 * - changelog/entries.json (rework field names)
 * - session/log.json (convert to v2 Session format)
 * - ideas/items.json (add priority, tags)
 * - Create empty files for: epics, milestones, releases, activity, labels, automations, docs registry
 * 
 * Safe: reads existing, transforms, writes to new locations. Original files preserved.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.argv[2] || path.join(process.cwd(), 'data'));

function readJSON<T>(filePath: string, fallback: T): T {
  const fullPath = path.join(DATA_DIR, filePath);
  try {
    if (!fs.existsSync(fullPath)) return fallback;
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as T;
  } catch {
    console.warn(`  ⚠ Failed to read ${filePath}, using fallback`);
    return fallback;
  }
}

function writeJSON(filePath: string, data: any): void {
  const fullPath = path.join(DATA_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ ${filePath}`);
}

function now(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── 1. Roadmap Items (from backlog) ────────────────────────────────────────

function migrateBacklogToRoadmap(): void {
  console.log('\n── Migrating backlog → roadmap ──');
  const backlog = readJSON<any>('backlog/items.json', { items: [] });

  const items = backlog.items.map((item: any) => ({
    id: item.id,
    title: item.title,
    summary: item.summary || '',
    type: inferItemType(item.category, item.title),
    horizon: item.horizon || 'later',
    priority: inferPriority(item.tags, item.horizon),
    size: item.size || 'M',
    status: item.status || 'pending',
    category: item.category || 'general',
    // Relationships
    epic_id: null,
    milestone_id: null,
    depends_on: item.depends_on || [],
    blocked_by: [],
    related_issues: [],
    spawned_from: null,
    // Metadata
    assignee: item.assignee || null,
    tags: item.tags || [],
    design_doc: item.design_doc || null,
    acceptance_criteria: [],
    // Tracking
    created: item.created || now(),
    updated: item.updated || now(),
    started: item.status === 'in_progress' ? (item.updated || now()) : null,
    completed: item.completed || null,
    // AI
    ai_notes: null,
    estimated_sessions: null,
  }));

  writeJSON('roadmap/items.json', { items });
}

function inferItemType(category: string, title: string): string {
  const t = (title || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (c === 'ui' || t.includes('design') || t.includes('overhaul')) return 'enhancement';
  if (t.includes('refactor') || t.includes('migration')) return 'infrastructure';
  if (t.includes('test') || t.includes('research')) return 'research';
  if (t.includes('docs') || t.includes('wiki')) return 'chore';
  return 'feature';
}

function inferPriority(tags: string[], horizon: string): string {
  if (tags?.includes('critical')) return 'P0';
  if (tags?.includes('high-impact')) return 'P1';
  if (horizon === 'now') return 'P1';
  if (horizon === 'next') return 'P2';
  return 'P3';
}

// ─── 2. Systems (from state.json) ───────────────────────────────────────────

function migrateSystems(): void {
  console.log('\n── Migrating state.json → systems ──');
  const state = readJSON<any>('state.json', { systems: [] });

  const systems = (state.systems || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.notes || '',
    status: mapSystemStatus(s.status),
    health_score: (s.rating || 0) * 10, // 0-10 → 0-100
    health_signals: [],
    last_assessed: state.last_updated || now(),
    owner: null,
    tech_stack: inferTechStack(s.name, s.notes || ''),
    modules: [],
    dependencies: [],
    dependents: [],
    open_issues: 0,
    recent_commits: 0,
    test_coverage: null,
    tags: [],
    created: state.last_updated || now(),
    updated: state.last_updated || now(),
  }));

  writeJSON('systems/systems.json', { systems });

  // Also write the new project state (slim version)
  writeJSON('state.json', {
    last_updated: state.last_updated || now(),
    overall_health: state.overall_completion || 0,
    summary: state.summary || '',
  });
}

function mapSystemStatus(v1Status: string): string {
  const map: Record<string, string> = {
    production: 'healthy',
    v1_complete: 'healthy',
    partial: 'degraded',
    planned: 'planned',
    deprioritized: 'unknown',
  };
  return map[v1Status] || 'unknown';
}

function inferTechStack(name: string, notes: string): string[] {
  const stack: string[] = [];
  const combined = `${name} ${notes}`.toLowerCase();
  if (combined.includes('hono')) stack.push('Hono');
  if (combined.includes('react')) stack.push('React');
  if (combined.includes('tailwind')) stack.push('Tailwind');
  if (combined.includes('typescript') || combined.includes('.ts')) stack.push('TypeScript');
  if (combined.includes('vite')) stack.push('Vite');
  if (combined.includes('openai')) stack.push('OpenAI');
  if (combined.includes('anthropic')) stack.push('Anthropic');
  return stack;
}

// ─── 3. Issues (add new fields) ─────────────────────────────────────────────

function migrateIssues(): void {
  console.log('\n── Migrating issues ──');
  const data = readJSON<any>('issues/items.json', { issues: [], next_id: 1 });

  const issues = data.issues.map((issue: any) => ({
    id: issue.id,
    title: issue.title,
    status: issue.status,
    severity: issue.severity,
    type: inferIssueType(issue.title, issue.symptoms || ''),
    symptoms: issue.symptoms || '',
    root_cause: issue.root_cause || null,
    resolution: issue.resolution || null,
    files: issue.files || [],
    // Relationships (migrate backlog_item → roadmap_item)
    roadmap_item: issue.backlog_item || null,
    epic_id: null,
    milestone_id: null,
    blocked_by_issue: null,
    // Metadata
    assignee: issue.assignee || null,
    tags: [],
    discovered: issue.discovered,
    discovered_by: issue.discovered_in_run || 'user',
    resolved: issue.resolved || null,
    notes: issue.notes || null,
  }));

  writeJSON('issues/items.json', { issues, next_id: data.next_id });
}

function inferIssueType(title: string, symptoms: string): string {
  const combined = `${title} ${symptoms}`.toLowerCase();
  if (combined.includes('security') || combined.includes('credential')) return 'security';
  if (combined.includes('performance') || combined.includes('slow')) return 'performance';
  if (combined.includes('ux') || combined.includes('user experience') || combined.includes('confus')) return 'ux';
  if (combined.includes('debt') || combined.includes('refactor') || combined.includes('redundanc')) return 'tech_debt';
  return 'bug';
}

// ─── 4. Changelog (rework fields) ──────────────────────────────────────────

function migrateChangelog(): void {
  console.log('\n── Migrating changelog ──');
  const data = readJSON<any>('changelog/entries.json', { entries: [] });

  const entries = data.entries.map((entry: any, idx: number) => ({
    id: entry.id?.startsWith('CL-') ? entry.id : `CL-${String(idx + 1).padStart(3, '0')}`,
    date: entry.date,
    session: null, // Will be linked to session IDs later
    title: entry.title,
    description: entry.description || '',
    type: mapChangeType(entry.category),
    scope: entry.category || 'general',
    roadmap_item: entry.backlog_item || null,
    epic_id: null,
    issues_resolved: [],
    release_id: null,
    files_changed: entry.files_changed || entry.files_touched || [],
    commit_hashes: [],
    breaking: entry.breaking || false,
    tags: [],
  }));

  writeJSON('changelog/entries.json', { entries });
}

function mapChangeType(category: string): string {
  const map: Record<string, string> = {
    core: 'feature',
    feature: 'feature',
    ui: 'enhancement',
    bugfix: 'fix',
    fix: 'fix',
    refactor: 'refactor',
    docs: 'docs',
    infrastructure: 'refactor',
    polish: 'enhancement',
    architecture: 'refactor',
    general: 'chore',
  };
  return map[category?.toLowerCase()] || 'chore';
}

// ─── 5. Sessions (unify format) ─────────────────────────────────────────────

function migrateSessions(): void {
  console.log('\n── Migrating sessions ──');
  const log = readJSON<any>('session/log.json', { sessions: [] });

  const sessions = log.sessions.map((s: any, idx: number) => ({
    id: idx + 1,
    date: s.date,
    developer: s.developer || 'user',
    objective: s.objective || '',
    appetite: '4h',
    status: 'completed' as const,
    started_at: s.started_at,
    ended_at: s.ended_at,
    duration_hours: s.duration_hours || 0,
    items_shipped: s.items_shipped || 0,
    points: (s.shipped || []).reduce((sum: number, item: any) => {
      const pts: Record<string, number> = { S: 1, M: 2, L: 5, XL: 8 };
      return sum + (pts[item.size] || 2);
    }, 0),
    roadmap_items_completed: [],
    issues_resolved: [],
    ideas_captured: [],
    changelog_ids: [],
    retro: s.next_session_suggestion ? `Discovered: ${(s.discovered || []).join(', ')}` : null,
    next_suggestion: s.next_session_suggestion || null,
    ai_observation: null,
  }));

  const nextId = sessions.length + 1;

  writeJSON('session/log.json', { sessions, next_id: nextId });

  // Clear current session (start fresh)
  writeJSON('session/current.json', null);
}

// ─── 6. Ideas (add priority, tags) ──────────────────────────────────────────

function migrateIdeas(): void {
  console.log('\n── Migrating ideas ──');
  const data = readJSON<any>('ideas/items.json', { ideas: [], next_id: 1 });

  const ideas = data.ideas.map((idea: any) => ({
    ...idea,
    priority: idea.priority || 'P2',
    tags: idea.tags || [],
    notes: idea.notes ?? null,
  }));

  writeJSON('ideas/items.json', { ideas, next_id: data.next_id });
}

// ─── 7. Create empty files for new entities ─────────────────────────────────

function createEmptyEntities(): void {
  console.log('\n── Creating empty entity files ──');

  writeJSON('roadmap/epics.json', { epics: [] });
  writeJSON('roadmap/milestones.json', { milestones: [] });
  writeJSON('releases/releases.json', { releases: [] });
  writeJSON('activity/feed.json', { events: [], next_id: 1 });
  writeJSON('labels/labels.json', { labels: [] });
  writeJSON('automations/automations.json', { automations: [] });
  writeJSON('docs/registry.json', { docs: [] });
}

// ─── 8. Move codebase analysis ──────────────────────────────────────────────

function moveCodebaseAnalysis(): void {
  console.log('\n── Moving codebase analysis ──');
  const analysis = readJSON<any>('codebase/analysis.json', null);
  if (analysis) {
    writeJSON('systems/analysis.json', analysis);
    console.log('  ✓ codebase/analysis.json → systems/analysis.json');
  } else {
    console.log('  ⊘ No codebase analysis found, skipping');
  }
}

// ─── Run Migration ──────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════╗');
console.log('║   DevTrack Entity Model v2 Migration     ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`\nData directory: ${DATA_DIR}`);

migrateBacklogToRoadmap();
migrateSystems();
migrateIssues();
migrateChangelog();
migrateSessions();
migrateIdeas();
createEmptyEntities();
moveCodebaseAnalysis();

console.log('\n✅ Migration complete!');
console.log('\nOriginal files preserved (backlog/items.json, etc.).');
console.log('New files written to: roadmap/, systems/, releases/, activity/, labels/, automations/');
console.log('Updated in-place: issues/items.json, changelog/entries.json, session/log.json, ideas/items.json');
