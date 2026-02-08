import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { System } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/systems
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status');

  let systems = store.systems.systems;
  if (status) systems = systems.filter(s => s.status === status);

  return c.json({ ok: true, data: { systems, total: store.systems.systems.length } });
});

// GET /api/v1/systems/:id
app.get('/:id', (c) => {
  const store = getStore();
  const system = store.systems.systems.find(s => s.id === c.req.param('id'));
  if (!system) return c.json({ ok: false, error: 'System not found' }, 404);

  // Enrich: related issues
  const issues = store.issues.issues.filter(i =>
    i.files.some(f => system.modules.some(m => f.includes(m))) ||
    (i.roadmap_item && store.roadmap.items.find(r => r.id === i.roadmap_item)?.category === system.id)
  );

  return c.json({ ok: true, data: { system, related_issues: issues } });
});

// POST /api/v1/systems
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const now = new Date().toISOString().split('T')[0];
  const system: System = {
    id: body.id || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: body.name,
    description: body.description || '',
    status: body.status || 'unknown',
    health_score: body.health_score ?? 50,
    health_signals: body.health_signals || [],
    last_assessed: now,
    owner: body.owner || null,
    tech_stack: body.tech_stack || [],
    modules: body.modules || [],
    dependencies: body.dependencies || [],
    dependents: body.dependents || [],
    open_issues: 0,
    recent_commits: 0,
    test_coverage: body.test_coverage ?? null,
    tags: body.tags || [],
    created: now,
    updated: now,
  };

  if (store.systems.systems.find(s => s.id === system.id)) {
    return c.json({ ok: false, error: `System "${system.id}" already exists` }, 409);
  }

  store.systems.systems.push(system);
  store.saveSystems();

  broadcast({ type: 'system_updated', data: system, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: system }, 201);
});

// PATCH /api/v1/systems/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const system = store.systems.systems.find(s => s.id === c.req.param('id'));
  if (!system) return c.json({ ok: false, error: 'System not found' }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) system.name = body.name;
  if (body.description !== undefined) system.description = body.description;
  if (body.status !== undefined) system.status = body.status;
  if (body.health_score !== undefined) system.health_score = body.health_score;
  if (body.health_signals !== undefined) system.health_signals = body.health_signals;
  if (body.owner !== undefined) system.owner = body.owner;
  if (body.tech_stack !== undefined) system.tech_stack = body.tech_stack;
  if (body.modules !== undefined) system.modules = body.modules;
  if (body.dependencies !== undefined) system.dependencies = body.dependencies;
  if (body.dependents !== undefined) system.dependents = body.dependents;
  if (body.test_coverage !== undefined) system.test_coverage = body.test_coverage;
  if (body.tags !== undefined) system.tags = body.tags;

  system.last_assessed = new Date().toISOString().split('T')[0];
  system.updated = new Date().toISOString().split('T')[0];

  store.saveSystems();

  broadcast({ type: 'system_updated', data: system, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: system });
});

// DELETE /api/v1/systems/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.systems.systems.findIndex(s => s.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'System not found' }, 404);

  const removed = store.systems.systems.splice(idx, 1)[0];
  store.saveSystems();

  broadcast({ type: 'system_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

// GET /api/v1/systems/health — overview of all system health
app.get('/health', (c) => {
  const store = getStore();
  const overview = store.systems.systems.map(s => ({
    id: s.id,
    name: s.name,
    status: s.status,
    health_score: s.health_score,
    open_issues: s.open_issues,
  }));

  const avgHealth = overview.length > 0
    ? Math.round(overview.reduce((sum, s) => sum + s.health_score, 0) / overview.length)
    : 0;

  return c.json({
    ok: true,
    data: {
      systems: overview,
      average_health: avgHealth,
      total: overview.length,
      healthy: overview.filter(s => s.status === 'healthy').length,
      degraded: overview.filter(s => s.status === 'degraded').length,
      critical: overview.filter(s => s.status === 'critical').length,
    },
  });
});

export default app;
