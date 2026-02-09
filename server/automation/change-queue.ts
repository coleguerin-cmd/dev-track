/**
 * Change Queue — Accumulates changes from multiple sources:
 * - Git commit hooks (with Haiku micro-classification)
 * - Activity reports from external AI (Cursor)
 * - Session checkpoints (git diff + entity diff)
 * 
 * Automations read the queue instead of scanning everything.
 * Queue is persisted to data/ai/change-queue.json.
 */

import fs from 'fs';
import path from 'path';
import { getDataDir } from '../project-config.js';
import { getStore } from '../store.js';

export interface ChangeQueueEntry {
  id: string;
  type: 'commit' | 'activity_report' | 'session_checkpoint' | 'entity_diff';
  timestamp: string;
  processed: boolean;
  data: CommitEntry | ActivityReport | SessionCheckpoint | EntityDiff;
}

export interface CommitEntry {
  hash: string;
  message: string;
  files: string[];
  author?: string;
  classification?: string; // Haiku-generated: "Likely resolves ISS-040" etc.
  related_items?: string[]; // Inferred roadmap/issue IDs
}

export interface ActivityReport {
  source: string; // 'cursor', 'claude', 'user', etc.
  action: string; // 'commit', 'fix', 'feature', 'idea', 'refactor', 'discussion'
  description: string;
  files?: string[];
  related_issue?: string;
  related_roadmap?: string;
  related_idea?: string;
}

export interface SessionCheckpoint {
  session_id: number;
  started_at: string;
  git_head_start: string;
  git_head_end?: string;
  commits?: string[]; // commit hashes during session
  files_changed?: string[];
  entities_created?: string[]; // entity IDs created during session
  entities_updated?: string[]; // entity IDs updated during session
}

export interface EntityDiff {
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: any;
  new_value: any;
}

export interface ChangeQueue {
  entries: ChangeQueueEntry[];
  last_processed: string | null;
  checkpoint: SessionCheckpoint | null;
}

const QUEUE_FILE = 'ai/change-queue.json';

function getQueuePath(): string {
  return path.join(getDataDir(), QUEUE_FILE);
}

function readQueue(): ChangeQueue {
  try {
    const p = getQueuePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { entries: [], last_processed: null, checkpoint: null };
}

function writeQueue(queue: ChangeQueue): void {
  const p = getQueuePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Mark as internal write so watcher ignores
  const store = getStore();
  store.markWrite(QUEUE_FILE);
  fs.writeFileSync(p, JSON.stringify(queue, null, 2) + '\n', 'utf-8');
}

let _nextId = 1;

function genId(): string {
  return `chg-${Date.now()}-${_nextId++}`;
}

/**
 * Add a commit entry to the queue
 */
export function queueCommit(commit: CommitEntry): ChangeQueueEntry {
  const queue = readQueue();
  const entry: ChangeQueueEntry = {
    id: genId(),
    type: 'commit',
    timestamp: new Date().toISOString(),
    processed: false,
    data: commit,
  };
  queue.entries.push(entry);
  // Keep last 200 entries
  if (queue.entries.length > 200) {
    queue.entries = queue.entries.slice(-200);
  }
  writeQueue(queue);
  return entry;
}

/**
 * Add an activity report from external AI
 */
export function queueActivityReport(report: ActivityReport): ChangeQueueEntry {
  const queue = readQueue();
  const entry: ChangeQueueEntry = {
    id: genId(),
    type: 'activity_report',
    timestamp: new Date().toISOString(),
    processed: false,
    data: report,
  };
  queue.entries.push(entry);
  if (queue.entries.length > 200) {
    queue.entries = queue.entries.slice(-200);
  }
  writeQueue(queue);
  return entry;
}

/**
 * Start a session checkpoint — record git HEAD and current state
 */
export function startCheckpoint(sessionId: number, gitHead: string): void {
  const queue = readQueue();
  queue.checkpoint = {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    git_head_start: gitHead,
  };
  writeQueue(queue);
}

/**
 * Complete a checkpoint — record end state and compute diffs
 */
export function completeCheckpoint(
  gitHeadEnd: string,
  commits: string[],
  filesChanged: string[],
  entitiesCreated: string[],
  entitiesUpdated: string[],
): SessionCheckpoint | null {
  const queue = readQueue();
  if (!queue.checkpoint) return null;

  queue.checkpoint.git_head_end = gitHeadEnd;
  queue.checkpoint.commits = commits;
  queue.checkpoint.files_changed = filesChanged;
  queue.checkpoint.entities_created = entitiesCreated;
  queue.checkpoint.entities_updated = entitiesUpdated;

  // Also add as a queue entry
  const entry: ChangeQueueEntry = {
    id: genId(),
    type: 'session_checkpoint',
    timestamp: new Date().toISOString(),
    processed: false,
    data: { ...queue.checkpoint },
  };
  queue.entries.push(entry);

  const completed = { ...queue.checkpoint };
  queue.checkpoint = null;
  writeQueue(queue);
  return completed;
}

/**
 * Get unprocessed entries (for automations to consume)
 */
export function getUnprocessedChanges(): ChangeQueueEntry[] {
  const queue = readQueue();
  return queue.entries.filter(e => !e.processed);
}

/**
 * Get all recent entries (last N hours)
 */
export function getRecentChanges(hours: number = 24): ChangeQueueEntry[] {
  const queue = readQueue();
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  return queue.entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
}

/**
 * Mark entries as processed
 */
export function markProcessed(entryIds: string[]): void {
  const queue = readQueue();
  const idSet = new Set(entryIds);
  for (const entry of queue.entries) {
    if (idSet.has(entry.id)) entry.processed = true;
  }
  queue.last_processed = new Date().toISOString();
  writeQueue(queue);
}

/**
 * Get current checkpoint (for session tracking)
 */
export function getCurrentCheckpoint(): SessionCheckpoint | null {
  const queue = readQueue();
  return queue.checkpoint;
}

/**
 * Format change queue for automation prompt context
 */
export function formatChangeQueueForPrompt(): string {
  const unprocessed = getUnprocessedChanges();
  if (unprocessed.length === 0) {
    return '### Change Queue\nNo unprocessed changes in the queue.';
  }

  const lines = ['### Change Queue', `${unprocessed.length} unprocessed changes:`, ''];

  for (const entry of unprocessed) {
    switch (entry.type) {
      case 'commit': {
        const c = entry.data as CommitEntry;
        lines.push(`- **Commit** ${c.hash?.substring(0, 7)}: ${c.message}`);
        if (c.files.length > 0) lines.push(`  Files: ${c.files.slice(0, 10).join(', ')}${c.files.length > 10 ? ` (+${c.files.length - 10} more)` : ''}`);
        if (c.classification) lines.push(`  Classification: ${c.classification}`);
        if (c.related_items?.length) lines.push(`  Related: ${c.related_items.join(', ')}`);
        break;
      }
      case 'activity_report': {
        const r = entry.data as ActivityReport;
        lines.push(`- **Activity** (${r.source}): ${r.action} — ${r.description}`);
        if (r.related_issue) lines.push(`  Issue: ${r.related_issue}`);
        if (r.related_roadmap) lines.push(`  Roadmap: ${r.related_roadmap}`);
        break;
      }
      case 'session_checkpoint': {
        const s = entry.data as SessionCheckpoint;
        lines.push(`- **Session ${s.session_id} checkpoint**: ${s.commits?.length || 0} commits, ${s.files_changed?.length || 0} files changed`);
        if (s.entities_created?.length) lines.push(`  Created: ${s.entities_created.join(', ')}`);
        if (s.entities_updated?.length) lines.push(`  Updated: ${s.entities_updated.join(', ')}`);
        break;
      }
    }
  }

  return lines.join('\n');
}
