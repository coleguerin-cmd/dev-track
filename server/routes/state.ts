import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';

const app = new Hono();

// GET /api/v1/state — project state overview
app.get('/', (c) => {
  const store = getStore();

  // Compute overall health from systems
  const systemHealths = store.systems.systems.map(s => s.health_score);
  const avgHealth = systemHealths.length > 0
    ? Math.round(systemHealths.reduce((a, b) => a + b, 0) / systemHealths.length)
    : store.state.overall_health;

  return c.json({
    ok: true,
    data: {
      ...store.state,
      overall_health: avgHealth,
      systems_count: store.systems.systems.length,
      open_issues: store.issues.issues.filter(i => i.status === 'open' || i.status === 'in_progress').length,
    },
  });
});

// GET /api/v1/state/summary
app.get('/summary', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: { summary: store.state.summary, health: store.state.overall_health } });
});

// PATCH /api/v1/state
app.patch('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  if (body.overall_health !== undefined) store.state.overall_health = body.overall_health;
  if (body.summary !== undefined) store.state.summary = body.summary;
  store.state.last_updated = new Date().toISOString().split('T')[0];

  store.saveState();
  broadcast({ type: 'system_updated', data: store.state, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: store.state });
});

export default app;
