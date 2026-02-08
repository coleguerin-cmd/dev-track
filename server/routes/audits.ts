import { Hono } from 'hono';
import { getStore } from '../store.js';

const app = new Hono();

// GET /api/v1/audits — List audit runs (from index)
app.get('/', async (c) => {
  const store = getStore();
  const params = {
    trigger_type: c.req.query('trigger_type'),
    status: c.req.query('status'),
    automation_id: c.req.query('automation_id'),
    since: c.req.query('since'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
  };
  const result = store.listAuditRuns(params);
  return c.json({ ok: true, data: result });
});

// GET /api/v1/audits/stats — Analytics summary
app.get('/stats', async (c) => {
  const store = getStore();
  const stats = store.getAuditStats();
  return c.json({ ok: true, data: stats });
});

// GET /api/v1/audits/:id — Full run detail
app.get('/:id', async (c) => {
  const store = getStore();
  const run = store.getAuditRun(c.req.param('id'));
  if (!run) return c.json({ ok: false, error: 'Audit run not found' }, 404);
  return c.json({ ok: true, data: run });
});

// PATCH /api/v1/audits/:id/suggestions/:sid — Approve/dismiss a suggestion
app.patch('/:id/suggestions/:sid', async (c) => {
  const store = getStore();
  const body = await c.req.json();
  const status = body.status;
  if (!status || !['approved', 'dismissed'].includes(status)) {
    return c.json({ ok: false, error: 'status must be "approved" or "dismissed"' }, 400);
  }
  const updated = store.updateAuditSuggestion(c.req.param('id'), c.req.param('sid'), status);
  if (!updated) return c.json({ ok: false, error: 'Run or suggestion not found' }, 404);
  return c.json({ ok: true });
});

export default app;
