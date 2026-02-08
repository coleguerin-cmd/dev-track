/**
 * AI State Cache — Compressed project state summary for efficient AI context.
 * 
 * Instead of every audit/agent run reading 130K+ tokens of raw data via tools,
 * the state cache provides a pre-built ~2-5K token summary that captures:
 * - Project identity and health
 * - Systems with health scores
 * - Current roadmap items (now horizon)
 * - Open issues by severity
 * - Recent changelog entries
 * - Session velocity stats
 * - Doc registry status
 * 
 * The cache is rebuilt when stale (>30 min) or on demand.
 * Automations and doc generators use this instead of raw store reads.
 */

import fs from 'fs';
import path from 'path';
import { getStore } from '../store.js';
import { getDataDir } from '../project-config.js';

export interface StateCache {
  generated_at: string;
  project_name: string;
  overall_health: number;
  project_summary: string;
  systems_summary: string;
  roadmap_now: string;
  roadmap_next_count: number;
  roadmap_later_count: number;
  open_issues: string;
  recent_changelog: string;
  velocity_summary: string;
  docs_status: string;
  active_session: string | null;
  token_estimate: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let _memoryCache: StateCache | null = null;
let _lastBuilt = 0;

function getCachePath(): string {
  return path.join(getDataDir(), 'ai/state-cache.json');
}

/**
 * Build a fresh state cache from the current store data.
 */
export function buildStateCache(): StateCache {
  const store = getStore();
  const now = new Date().toISOString();

  // Project basics
  const projectName = store.config?.project || 'Unknown Project';
  const health = store.state?.overall_health || 0;

  // Systems summary (compressed)
  const systems = store.systems?.systems || [];
  const systemsSummary = systems.length > 0
    ? systems.map((s: any) => `- ${s.name}: ${s.health}/100 (${s.tech_stack?.join(', ') || 'no stack'})`).join('\n')
    : 'No systems tracked.';

  // Roadmap items by horizon
  const roadmapItems = store.roadmap?.items || [];
  const nowItems = roadmapItems.filter((i: any) => i.horizon === 'now' && i.status !== 'completed');
  const nextItems = roadmapItems.filter((i: any) => i.horizon === 'next' && i.status !== 'completed');
  const laterItems = roadmapItems.filter((i: any) => i.horizon === 'later' && i.status !== 'completed');
  const shippedCount = roadmapItems.filter((i: any) => i.status === 'completed').length;
  
  const roadmapNow = nowItems.length > 0
    ? nowItems.map((i: any) => `- [${i.id}] ${i.title} (${i.size}, ${i.status}, P${i.priority?.replace('P','') || '?'})`).join('\n')
    : 'No items in Now horizon.';

  // Open issues
  const issues = store.issues?.issues || [];
  const openIssues = issues.filter((i: any) => i.status === 'open');
  const issuesSummary = openIssues.length > 0
    ? openIssues.map((i: any) => `- [${i.id}] ${i.title} (${i.severity})`).join('\n')
    : 'No open issues.';

  // Recent changelog (last 8 entries)
  const changelog = store.changelog?.entries || [];
  const recent = changelog.slice(-8);
  const changelogSummary = recent.length > 0
    ? recent.map((e: any) => `- [${e.id}] ${e.title} (session ${e.session || '?'})`).join('\n')
    : 'No changelog entries.';

  // Velocity
  const velocity = store.velocity;
  const velocitySummary = velocity?.totals
    ? `${velocity.totals.total_sessions} sessions, ${velocity.totals.total_items_shipped} items shipped, ${velocity.totals.total_points} points. Avg: ${velocity.totals.avg_items_per_session} items/session, ${velocity.totals.avg_points_per_session} pts/session.`
    : 'No velocity data.';

  // Docs status
  const docs = store.docsRegistry?.docs || [];
  const docsSummary = docs.length > 0
    ? `${docs.length} docs in registry. Last updated: ${docs.map((d: any) => d.updated).sort().pop() || 'never'}. Auto-generated: ${docs.filter((d: any) => d.auto_generated).length}.`
    : 'No docs in registry.';

  // Active session
  let sessionInfo: string | null = null;
  try {
    const currentPath = path.join(getDataDir(), 'session/current.json');
    if (fs.existsSync(currentPath)) {
      const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
      if (current && current.status === 'active') {
        sessionInfo = `Session ${current.session_id}: "${current.objective}" (started ${current.started_at})`;
      }
    }
  } catch { /* ignore */ }

  // Build the project summary paragraph
  const projectSummary = [
    `${projectName} is at ${health}% health.`,
    `${systems.length} tracked systems, ${shippedCount} items shipped, ${openIssues.length} open issues.`,
    nowItems.length > 0 ? `Currently working on: ${nowItems.map((i: any) => i.title).join(', ')}.` : 'No active work items.',
    sessionInfo ? `Active session: ${sessionInfo}.` : 'No active session.',
  ].join(' ');

  // Estimate tokens (rough: 4 chars ≈ 1 token)
  const allText = [projectSummary, systemsSummary, roadmapNow, issuesSummary, changelogSummary, velocitySummary, docsSummary].join('\n');
  const tokenEstimate = Math.ceil(allText.length / 4);

  const cache: StateCache = {
    generated_at: now,
    project_name: projectName,
    overall_health: health,
    project_summary: projectSummary,
    systems_summary: systemsSummary,
    roadmap_now: roadmapNow,
    roadmap_next_count: nextItems.length,
    roadmap_later_count: laterItems.length,
    open_issues: issuesSummary,
    recent_changelog: changelogSummary,
    velocity_summary: velocitySummary,
    docs_status: docsSummary,
    active_session: sessionInfo,
    token_estimate: tokenEstimate,
  };

  // Persist to disk
  try {
    const cachePath = getCachePath();
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch { /* ignore write failure */ }

  // Update memory cache
  _memoryCache = cache;
  _lastBuilt = Date.now();

  return cache;
}

/**
 * Get the state cache — returns cached version if fresh, rebuilds if stale.
 */
export function getStateCache(maxAgeMs: number = CACHE_TTL_MS): StateCache {
  // Check memory cache first
  if (_memoryCache && (Date.now() - _lastBuilt) < maxAgeMs) {
    return _memoryCache;
  }

  // Check disk cache
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as StateCache;
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < maxAgeMs) {
        _memoryCache = cached;
        _lastBuilt = Date.now() - age;
        return cached;
      }
    }
  } catch { /* rebuild */ }

  // Cache is stale or missing — rebuild
  return buildStateCache();
}

/**
 * Force rebuild the cache (call after major data changes).
 */
export function invalidateStateCache(): void {
  _memoryCache = null;
  _lastBuilt = 0;
}

/**
 * Format the state cache as a text block for AI system prompts.
 * This is the primary way automations and doc generators consume the cache.
 */
export function formatStateCacheForPrompt(cache?: StateCache): string {
  const c = cache || getStateCache();
  return `## Project State (cached ${c.generated_at})

**${c.project_name}** — ${c.overall_health}% health
${c.project_summary}

### Systems
${c.systems_summary}

### Roadmap (Now)
${c.roadmap_now}
(${c.roadmap_next_count} next, ${c.roadmap_later_count} later)

### Open Issues
${c.open_issues}

### Recent Changelog
${c.recent_changelog}

### Velocity
${c.velocity_summary}

### Docs
${c.docs_status}
${c.active_session ? `\n### Active Session\n${c.active_session}` : ''}`;
}
