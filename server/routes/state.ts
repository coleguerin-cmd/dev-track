import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';

const app = new Hono();

// GET /api/v1/state
app.get('/', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: store.state });
});

// GET /api/v1/state/summary
app.get('/summary', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: { summary: store.state.summary, completion: store.state.overall_completion } });
});

// PATCH /api/v1/state
app.patch('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  if (body.overall_completion !== undefined) store.state.overall_completion = body.overall_completion;
  if (body.summary !== undefined) store.state.summary = body.summary;
  store.state.last_updated = new Date().toISOString().split('T')[0];

  store.saveState();
  broadcast({ type: 'state_updated', data: store.state, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: store.state });
});

// PATCH /api/v1/state/systems/:id
app.patch('/systems/:id', async (c) => {
  const store = getStore();
  const systemId = c.req.param('id');
  const body = await c.req.json();

  const system = store.state.systems.find(s => s.id === systemId);
  if (!system) {
    return c.json({ ok: false, error: `System ${systemId} not found` }, 404);
  }

  if (body.rating !== undefined) system.rating = body.rating;
  if (body.notes !== undefined) system.notes = body.notes;
  if (body.status !== undefined) system.status = body.status;
  store.state.last_updated = new Date().toISOString().split('T')[0];

  store.saveState();
  broadcast({ type: 'state_updated', data: store.state, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: system });
});

export default app;
