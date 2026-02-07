import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Issue, IssueStatus, IssueSeverity } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/issues
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status') as IssueStatus | undefined;
  const severity = c.req.query('severity') as IssueSeverity | undefined;
  const action_id = c.req.query('action_id');
  const assignee = c.req.query('assignee');

  let issues = store.issues.issues;
  if (status) issues = issues.filter(i => i.status === status);
  if (severity) issues = issues.filter(i => i.severity === severity);
  if (action_id) issues = issues.filter(i => i.action_id === action_id);
  if (assignee) issues = issues.filter(i => i.assignee === assignee);

  return c.json({
    ok: true,
    data: {
      issues,
      counts: {
        total: store.issues.issues.length,
        open: store.issues.issues.filter(i => i.status === 'open' || i.status === 'in_progress').length,
        critical: store.issues.issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length,
      },
    },
  });
});

// GET /api/v1/issues/:id
app.get('/:id', (c) => {
  const store = getStore();
  const issue = store.issues.issues.find(i => i.id === c.req.param('id'));
  if (!issue) return c.json({ ok: false, error: 'Issue not found' }, 404);
  return c.json({ ok: true, data: issue });
});

// POST /api/v1/issues
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const issue: Issue = {
    id: `ISS-${String(store.issues.next_id).padStart(3, '0')}`,
    title: body.title,
    action_id: body.action_id || null,
    status: 'open',
    severity: body.severity || 'medium',
    assignee: body.assignee || null,
    discovered: new Date().toISOString().split('T')[0],
    discovered_in_run: body.discovered_in_run || null,
    symptoms: body.symptoms || '',
    root_cause: body.root_cause || null,
    files: body.files || [],
    backlog_item: body.backlog_item || null,
    resolution: null,
    resolved: null,
    notes: body.notes || '',
  };

  store.issues.issues.push(issue);
  store.issues.next_id++;

  // Update action open_issues count
  if (issue.action_id) {
    const action = store.actions.actions.find(a => a.id === issue.action_id);
    if (action) {
      action.open_issues = store.issues.issues.filter(
        i => i.action_id === issue.action_id && (i.status === 'open' || i.status === 'in_progress')
      ).length;
      store.saveActions();
    }
  }

  store.saveIssues();
  broadcast({ type: 'issue_created', data: issue, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: issue }, 201);
});

// PATCH /api/v1/issues/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const issue = store.issues.issues.find(i => i.id === c.req.param('id'));
  if (!issue) return c.json({ ok: false, error: 'Issue not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) issue.title = body.title;
  if (body.status !== undefined) issue.status = body.status;
  if (body.severity !== undefined) issue.severity = body.severity;
  if (body.assignee !== undefined) issue.assignee = body.assignee;
  if (body.symptoms !== undefined) issue.symptoms = body.symptoms;
  if (body.root_cause !== undefined) issue.root_cause = body.root_cause;
  if (body.files !== undefined) issue.files = body.files;
  if (body.backlog_item !== undefined) issue.backlog_item = body.backlog_item;
  if (body.notes !== undefined) issue.notes = body.notes;

  store.saveIssues();
  broadcast({ type: 'issue_updated', data: issue, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: issue });
});

// POST /api/v1/issues/:id/resolve
app.post('/:id/resolve', async (c) => {
  const store = getStore();
  const issue = store.issues.issues.find(i => i.id === c.req.param('id'));
  if (!issue) return c.json({ ok: false, error: 'Issue not found' }, 404);

  const body = await c.req.json();
  issue.status = 'resolved';
  issue.resolution = body.resolution || 'Resolved';
  issue.resolved = new Date().toISOString().split('T')[0];

  // Update action open_issues count
  if (issue.action_id) {
    const action = store.actions.actions.find(a => a.id === issue.action_id);
    if (action) {
      action.open_issues = store.issues.issues.filter(
        i => i.action_id === issue.action_id && (i.status === 'open' || i.status === 'in_progress')
      ).length;
      store.saveActions();
    }
  }

  store.saveIssues();
  broadcast({ type: 'issue_resolved', data: issue, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: issue });
});

export default app;
