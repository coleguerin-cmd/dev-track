import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { getAutomationEngine } from '../automation/engine.js';
import type { Issue, IssueStatus, IssueSeverity, IssueType } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/issues
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status') as IssueStatus | undefined;
  const severity = c.req.query('severity') as IssueSeverity | undefined;
  const type = c.req.query('type') as IssueType | undefined;
  const assignee = c.req.query('assignee');
  const milestone_id = c.req.query('milestone_id');
  const epic_id = c.req.query('epic_id');

  let issues = store.issues.issues;
  if (status) issues = issues.filter(i => i.status === status);
  if (severity) issues = issues.filter(i => i.severity === severity);
  if (type) issues = issues.filter(i => i.type === type);
  if (assignee) issues = issues.filter(i => i.assignee === assignee);
  if (milestone_id) issues = issues.filter(i => i.milestone_id === milestone_id);
  if (epic_id) issues = issues.filter(i => i.epic_id === epic_id);

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
    status: 'open',
    severity: body.severity || 'medium',
    type: body.type || 'bug',
    symptoms: body.symptoms || '',
    root_cause: body.root_cause || null,
    resolution: null,
    files: body.files || [],
    roadmap_item: body.roadmap_item || null,
    epic_id: body.epic_id || null,
    milestone_id: body.milestone_id || null,
    blocked_by_issue: body.blocked_by_issue || null,
    assignee: body.assignee || null,
    tags: body.tags || [],
    discovered: new Date().toISOString().split('T')[0],
    discovered_by: body.discovered_by || 'user',
    resolved: null,
    notes: body.notes || null,
  };

  store.issues.issues.push(issue);
  store.issues.next_id++;
  store.saveIssues();

  store.addActivity({
    type: 'issue_opened',
    entity_type: 'issue',
    entity_id: issue.id,
    title: `Issue opened: ${issue.title}`,
    actor: issue.discovered_by,
    metadata: { severity: issue.severity, type: issue.type },
  });

  broadcast({ type: 'issue_created', data: issue, timestamp: new Date().toISOString() });

  // Fire automation trigger (non-blocking)
  getAutomationEngine().fire({ trigger: 'issue_created', data: issue }).catch(() => {});

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
  if (body.type !== undefined) issue.type = body.type;
  if (body.symptoms !== undefined) issue.symptoms = body.symptoms;
  if (body.root_cause !== undefined) issue.root_cause = body.root_cause;
  if (body.files !== undefined) issue.files = body.files;
  if (body.roadmap_item !== undefined) issue.roadmap_item = body.roadmap_item;
  if (body.epic_id !== undefined) issue.epic_id = body.epic_id;
  if (body.milestone_id !== undefined) issue.milestone_id = body.milestone_id;
  if (body.blocked_by_issue !== undefined) issue.blocked_by_issue = body.blocked_by_issue;
  if (body.assignee !== undefined) issue.assignee = body.assignee;
  if (body.tags !== undefined) issue.tags = body.tags;
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

  store.saveIssues();

  // Update milestone blocking count
  if (issue.milestone_id) {
    store.recomputeMilestoneProgress(issue.milestone_id);
    store.saveMilestones();
  }

  store.addActivity({
    type: 'issue_resolved',
    entity_type: 'issue',
    entity_id: issue.id,
    title: `Issue resolved: ${issue.title}`,
    actor: 'user',
    metadata: { severity: issue.severity },
  });

  broadcast({ type: 'issue_resolved', data: issue, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: issue });
});

// POST /api/v1/issues/:id/reopen
app.post('/:id/reopen', async (c) => {
  const store = getStore();
  const issue = store.issues.issues.find(i => i.id === c.req.param('id'));
  if (!issue) return c.json({ ok: false, error: 'Issue not found' }, 404);

  if (issue.status !== 'resolved' && issue.status !== 'wont_fix') {
    return c.json({ ok: false, error: 'Issue is not resolved' }, 400);
  }

  issue.status = 'open';
  issue.resolution = null;
  issue.resolved = null;

  store.saveIssues();

  if (issue.milestone_id) {
    store.recomputeMilestoneProgress(issue.milestone_id);
    store.saveMilestones();
  }

  broadcast({ type: 'issue_updated', data: issue, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: issue });
});

export default app;
