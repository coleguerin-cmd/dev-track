import { Hono } from 'hono';
import { getStore } from '../store.js';

const app = new Hono();

// GET /api/v1/runs
app.get('/', (c) => {
  const store = getStore();
  const action_id = c.req.query('action_id');
  const limit = parseInt(c.req.query('limit') || '20');

  let runs = store.runs;
  if (action_id) runs = runs.filter(r => r.action_id === action_id);

  const sorted = [...runs].reverse().slice(0, limit);
  return c.json({ ok: true, data: { runs: sorted } });
});

// GET /api/v1/runs/:id
app.get('/:id', (c) => {
  const store = getStore();
  const run = store.runs.find(r => r.id === c.req.param('id'));
  if (!run) return c.json({ ok: false, error: 'Run not found' }, 404);
  return c.json({ ok: true, data: run });
});

export default app;
