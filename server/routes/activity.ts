import { Hono } from 'hono';
import { getStore } from '../store.js';
import type { ActivityItem } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/activity — Unified activity feed across all systems
app.get('/', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '30');
  const activities: ActivityItem[] = [];

  // Session events
  for (const session of store.sessionLog.sessions) {
    activities.push({
      id: `act-session-${session.started_at}`,
      type: 'session_ended',
      title: `Session completed — ${session.items_shipped} items shipped`,
      detail: session.objective,
      timestamp: session.ended_at,
      source: 'system',
      links: [],
    });
  }

  // Changelog entries
  for (const entry of store.changelog.entries) {
    activities.push({
      id: `act-chg-${entry.id}`,
      type: 'changelog_entry',
      title: entry.title,
      detail: entry.description,
      timestamp: `${entry.date}T12:00:00Z`,
      source: 'user',
      links: entry.backlog_item ? [{ type: 'backlog', id: entry.backlog_item }] : [],
    });
  }

  // Recently completed backlog items
  for (const item of store.backlog.items.filter(i => i.status === 'completed' && i.completed)) {
    activities.push({
      id: `act-done-${item.id}`,
      type: 'item_completed',
      title: `Completed: ${item.title}`,
      detail: `${item.size} · ${item.category}`,
      timestamp: `${item.completed}T12:00:00Z`,
      source: 'user',
      links: [{ type: 'backlog', id: item.id }],
    });
  }

  // Issues
  for (const issue of store.issues.issues) {
    if (issue.status === 'resolved' && issue.resolved) {
      activities.push({
        id: `act-fix-${issue.id}`,
        type: 'issue_resolved',
        title: `Resolved: ${issue.title}`,
        detail: issue.resolution || '',
        timestamp: `${issue.resolved}T12:00:00Z`,
        source: 'user',
        links: [{ type: 'issue', id: issue.id }],
      });
    }
    activities.push({
      id: `act-bug-${issue.id}`,
      type: 'issue_created',
      title: `Issue: ${issue.title}`,
      detail: `${issue.severity} · ${issue.symptoms}`,
      timestamp: `${issue.discovered}T12:00:00Z`,
      source: issue.discovered_in_run ? 'system' : 'user',
      links: [{ type: 'issue', id: issue.id }],
    });
  }

  // Diagnostic runs
  for (const run of store.runs) {
    const icon = run.result === 'all_pass' ? '✓' : run.result === 'partial_pass' ? '◐' : '✗';
    activities.push({
      id: `act-run-${run.id}`,
      type: run.result === 'all_pass' ? 'diagnostic_run' : 'diagnostic_failed',
      title: `${icon} Diagnostic: ${run.action_id} — ${run.result.replace('_', ' ')}`,
      detail: run.outcomes.filter(o => !o.pass).map(o => o.id).join(', ') || 'All passed',
      timestamp: run.timestamp,
      source: 'system',
      links: [{ type: 'run', id: run.id }],
    });
  }

  // Sort by timestamp descending, limit
  activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return c.json({ ok: true, data: { activities: activities.slice(0, limit) } });
});

export default app;
