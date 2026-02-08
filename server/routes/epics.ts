import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Epic } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/epics
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status');
  const milestone_id = c.req.query('milestone_id');

  let epics = store.epics.epics;
  if (status) epics = epics.filter(e => e.status === status);
  if (milestone_id) epics = epics.filter(e => e.milestone_id === milestone_id);

  // Enrich with computed progress
  epics.forEach(e => store.recomputeEpicProgress(e.id));

  return c.json({ ok: true, data: { epics, total: store.epics.epics.length } });
});

// GET /api/v1/epics/:id
app.get('/:id', (c) => {
  const store = getStore();
  const epic = store.epics.epics.find(e => e.id === c.req.param('id'));
  if (!epic) return c.json({ ok: false, error: 'Epic not found' }, 404);

  store.recomputeEpicProgress(epic.id);

  // Include child roadmap items
  const items = store.roadmap.items.filter(i => i.epic_id === epic.id);

  return c.json({ ok: true, data: { epic, items } });
});

// POST /api/v1/epics
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const now = new Date().toISOString().split('T')[0];
  const epic: Epic = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    description: body.description || '',
    status: body.status || 'planning',
    priority: body.priority || 'P2',
    color: body.color || '#6366f1',
    milestone_id: body.milestone_id || null,
    item_count: 0,
    completed_count: 0,
    progress_pct: 0,
    tags: body.tags || [],
    created: now,
    updated: now,
    completed: null,
    ai_summary: null,
  };

  if (store.epics.epics.find(e => e.id === epic.id)) {
    return c.json({ ok: false, error: `Epic "${epic.id}" already exists` }, 409);
  }

  store.epics.epics.push(epic);
  store.saveEpics();

  store.addActivity({
    type: 'item_created',
    entity_type: 'epic',
    entity_id: epic.id,
    title: `Epic created: ${epic.title}`,
    actor: 'user',
    metadata: { priority: epic.priority },
  });

  broadcast({ type: 'epic_updated', data: epic, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: epic }, 201);
});

// PATCH /api/v1/epics/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const epic = store.epics.epics.find(e => e.id === c.req.param('id'));
  if (!epic) return c.json({ ok: false, error: 'Epic not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) epic.title = body.title;
  if (body.description !== undefined) epic.description = body.description;
  if (body.status !== undefined) {
    epic.status = body.status;
    if (body.status === 'completed' && !epic.completed) {
      epic.completed = new Date().toISOString().split('T')[0];
    }
  }
  if (body.priority !== undefined) epic.priority = body.priority;
  if (body.color !== undefined) epic.color = body.color;
  if (body.milestone_id !== undefined) epic.milestone_id = body.milestone_id;
  if (body.tags !== undefined) epic.tags = body.tags;
  if (body.ai_summary !== undefined) epic.ai_summary = body.ai_summary;

  epic.updated = new Date().toISOString().split('T')[0];
  store.recomputeEpicProgress(epic.id);
  store.saveEpics();

  broadcast({ type: 'epic_updated', data: epic, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: epic });
});

// DELETE /api/v1/epics/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.epics.epics.findIndex(e => e.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Epic not found' }, 404);

  const removed = store.epics.epics.splice(idx, 1)[0];

  // Unlink roadmap items
  store.roadmap.items.filter(i => i.epic_id === removed.id).forEach(i => { i.epic_id = null; });
  store.saveRoadmap();
  store.saveEpics();

  broadcast({ type: 'epic_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

export default app;
