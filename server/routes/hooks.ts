/**
 * Hooks & Activity Reporting Routes
 * 
 * POST /api/v1/hooks/commit — Git post-commit hook endpoint
 * POST /api/v1/hooks/activity — Activity report from external AI (Cursor, etc.)
 * GET  /api/v1/hooks/change-queue — Read the change queue
 * POST /api/v1/hooks/change-queue/mark-processed — Mark entries as processed
 * GET  /api/v1/hooks/install-script — Generate installable git hook script
 */

import { Hono } from 'hono';
import { execSync } from 'child_process';
import { getStore } from '../store.js';
import { getProjectRoot } from '../project-config.js';
import {
  queueCommit,
  queueActivityReport,
  getUnprocessedChanges,
  getRecentChanges,
  markProcessed,
  formatChangeQueueForPrompt,
} from '../automation/change-queue.js';
import type { CommitEntry, ActivityReport } from '../automation/change-queue.js';

const app = new Hono();

/**
 * POST /api/v1/hooks/commit
 * Called by git post-commit hook. Receives commit info, queues it,
 * and optionally classifies it with Haiku.
 */
app.post('/commit', async (c) => {
  const body = await c.req.json();
  const { hash, message, files, author } = body;

  if (!hash || !message) {
    return c.json({ ok: false, error: 'hash and message are required' }, 400);
  }

  const commit: CommitEntry = {
    hash,
    message,
    files: files || [],
    author: author || 'unknown',
  };

  // Quick heuristic classification (no AI cost)
  // Look for issue/roadmap references in commit message
  const issueMatches = message.match(/ISS-\d+/gi) || [];
  const itemMatches = message.match(/(?:fix|resolve|close|complete|implement)\s+/gi) || [];
  const relatedItems: string[] = [...issueMatches];

  // Check if changed files map to known roadmap items or systems
  const store = getStore();
  const openIssues = (store.issues.issues || []).filter((i: any) => i.status === 'open');
  for (const issue of openIssues) {
    const issueFiles = issue.files || [];
    const overlap = (files || []).some((f: string) =>
      issueFiles.some((isf: string) => {
        // Support glob patterns like "server/ai/*.ts"
        if (isf.includes('*')) {
          const prefix = isf.split('*')[0];
          return f.startsWith(prefix);
        }
        return f === isf || f.endsWith(isf);
      })
    );
    if (overlap && !relatedItems.includes(issue.id)) {
      relatedItems.push(issue.id);
    }
  }

  commit.related_items = relatedItems;
  if (relatedItems.length > 0) {
    commit.classification = `Possibly related to: ${relatedItems.join(', ')}`;
  } else if (itemMatches.length > 0) {
    commit.classification = 'Contains fix/resolve/complete keywords — may resolve an item';
  }

  const entry = queueCommit(commit);

  // Log to activity feed
  store.addActivity({
    type: 'system_health_changed',
    entity_type: 'commit',
    entity_id: hash.substring(0, 7),
    title: `Git commit: ${message.substring(0, 80)}`,
    actor: author || 'external',
    metadata: {
      hash,
      files_count: (files || []).length,
      related_items: relatedItems,
    },
  });

  console.log(`[hooks] Commit queued: ${hash.substring(0, 7)} "${message.substring(0, 60)}" (${(files || []).length} files, ${relatedItems.length} related items)`);

  return c.json({ ok: true, data: { entry_id: entry.id, related_items: relatedItems, classification: commit.classification } });
});

/**
 * POST /api/v1/hooks/activity
 * Called by external AI (Cursor via curl in cursor rule) to report what it did.
 * Single simple endpoint — external AI doesn't need to understand DevTrack internals.
 */
app.post('/activity', async (c) => {
  const body = await c.req.json();
  const { source, action, description, files, related_issue, related_roadmap, related_idea } = body;

  if (!description) {
    return c.json({ ok: false, error: 'description is required' }, 400);
  }

  const report: ActivityReport = {
    source: source || 'external',
    action: action || 'update',
    description,
    files: files || [],
    related_issue: related_issue || undefined,
    related_roadmap: related_roadmap || undefined,
    related_idea: related_idea || undefined,
  };

  const entry = queueActivityReport(report);

  // Log to activity feed
  const store = getStore();
  store.addActivity({
    type: 'system_health_changed',
    entity_type: 'activity_report',
    entity_id: entry.id,
    title: `Activity report (${report.source}): ${description.substring(0, 80)}`,
    actor: report.source,
    metadata: { action: report.action, files_count: (files || []).length },
  });

  console.log(`[hooks] Activity reported: ${report.source}/${report.action} — "${description.substring(0, 60)}"`);

  return c.json({ ok: true, data: { entry_id: entry.id } });
});

/**
 * GET /api/v1/hooks/change-queue
 * Read the change queue (for UI display or debugging)
 */
app.get('/change-queue', (c) => {
  const hours = parseInt(c.req.query('hours') || '24');
  const unprocessedOnly = c.req.query('unprocessed') === 'true';

  const entries = unprocessedOnly ? getUnprocessedChanges() : getRecentChanges(hours);
  return c.json({ ok: true, data: { entries, total: entries.length, formatted: formatChangeQueueForPrompt() } });
});

/**
 * POST /api/v1/hooks/change-queue/mark-processed
 * Mark entries as processed after an automation consumes them
 */
app.post('/change-queue/mark-processed', async (c) => {
  const body = await c.req.json();
  const { entry_ids } = body;
  if (!Array.isArray(entry_ids)) {
    return c.json({ ok: false, error: 'entry_ids array required' }, 400);
  }
  markProcessed(entry_ids);
  return c.json({ ok: true, data: { processed: entry_ids.length } });
});

/**
 * GET /api/v1/hooks/install-script
 * Generate a git post-commit hook script for the current project
 */
app.get('/install-script', (c) => {
  const port = 24680;
  const script = `#!/bin/sh
# DevTrack post-commit hook — reports commits to the change queue
# Install: copy this to .git/hooks/post-commit and chmod +x

HASH=$(git rev-parse HEAD)
MESSAGE=$(git log -1 --format=%s)
FILES=$(git diff --name-only HEAD~1 2>/dev/null | head -50)
AUTHOR=$(git log -1 --format=%an)

# Build JSON payload
FILES_JSON=$(echo "$FILES" | jq -R -s 'split("\\n") | map(select(length > 0))')

curl -s -X POST "http://127.0.0.1:${port}/api/v1/hooks/commit" \\
  -H "Content-Type: application/json" \\
  -d "{\\"hash\\": \\"$HASH\\", \\"message\\": $(echo "$MESSAGE" | jq -R .), \\"files\\": $FILES_JSON, \\"author\\": \\"$AUTHOR\\"}" \\
  > /dev/null 2>&1 &

# Don't block the commit — fire and forget
`;

  return c.text(script, 200, { 'Content-Type': 'text/plain' });
});

export default app;
