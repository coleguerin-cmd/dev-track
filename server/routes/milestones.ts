import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Milestone } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/milestones
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status');

  let milestones = store.milestones.milestones;
  if (status) milestones = milestones.filter(m => m.status === status);

  // Recompute progress
  milestones.forEach(m => store.recomputeMilestoneProgress(m.id));

  return c.json({ ok: true, data: { milestones, total: store.milestones.milestones.length } });
});

// GET /api/v1/milestones/:id
app.get('/:id', (c) => {
  const store = getStore();
  const ms = store.milestones.milestones.find(m => m.id === c.req.param('id'));
  if (!ms) return c.json({ ok: false, error: 'Milestone not found' }, 404);

  store.recomputeMilestoneProgress(ms.id);

  const items = store.roadmap.items.filter(i => i.milestone_id === ms.id);
  const epics = store.epics.epics.filter(e => e.milestone_id === ms.id);
  const issues = store.issues.issues.filter(i => i.milestone_id === ms.id);

  return c.json({ ok: true, data: { milestone: ms, items, epics, issues } });
});

// POST /api/v1/milestones
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const now = new Date().toISOString().split('T')[0];
  const ms: Milestone = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    description: body.description || '',
    version: body.version || null,
    status: body.status || 'planning',
    target_date: body.target_date || null,
    completed_date: null,
    total_items: 0,
    completed_items: 0,
    progress_pct: 0,
    blocking_issues: 0,
    tags: body.tags || [],
    created: now,
    updated: now,
    ai_prediction: null,
  };

  if (store.milestones.milestones.find(m => m.id === ms.id)) {
    return c.json({ ok: false, error: `Milestone "${ms.id}" already exists` }, 409);
  }

  store.milestones.milestones.push(ms);
  store.saveMilestones();

  store.addActivity({
    type: 'item_created',
    entity_type: 'milestone',
    entity_id: ms.id,
    title: `Milestone created: ${ms.title}`,
    actor: 'user',
    metadata: { version: ms.version, target_date: ms.target_date },
  });

  broadcast({ type: 'milestone_updated', data: ms, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: ms }, 201);
});

// PATCH /api/v1/milestones/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const ms = store.milestones.milestones.find(m => m.id === c.req.param('id'));
  if (!ms) return c.json({ ok: false, error: 'Milestone not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) ms.title = body.title;
  if (body.description !== undefined) ms.description = body.description;
  if (body.version !== undefined) ms.version = body.version;
  if (body.status !== undefined) {
    ms.status = body.status;
    if (body.status === 'completed' && !ms.completed_date) {
      ms.completed_date = new Date().toISOString().split('T')[0];
    }
  }
  if (body.target_date !== undefined) ms.target_date = body.target_date;
  if (body.tags !== undefined) ms.tags = body.tags;
  if (body.ai_prediction !== undefined) ms.ai_prediction = body.ai_prediction;

  ms.updated = new Date().toISOString().split('T')[0];
  store.recomputeMilestoneProgress(ms.id);
  store.saveMilestones();

  broadcast({ type: 'milestone_updated', data: ms, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: ms });
});

// DELETE /api/v1/milestones/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.milestones.milestones.findIndex(m => m.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Milestone not found' }, 404);

  const removed = store.milestones.milestones.splice(idx, 1)[0];

  // Unlink items and epics
  store.roadmap.items.filter(i => i.milestone_id === removed.id).forEach(i => { i.milestone_id = null; });
  store.epics.epics.filter(e => e.milestone_id === removed.id).forEach(e => { e.milestone_id = null; });
  store.saveRoadmap();
  store.saveEpics();
  store.saveMilestones();

  broadcast({ type: 'milestone_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

export default app;
