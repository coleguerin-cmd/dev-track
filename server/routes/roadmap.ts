import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { getAutomationEngine } from '../automation/engine.js';
import type { RoadmapItem, Horizon } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/roadmap
app.get('/', (c) => {
  const store = getStore();
  const horizon = c.req.query('horizon') as Horizon | undefined;
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  const category = c.req.query('category');
  const epic_id = c.req.query('epic_id');
  const milestone_id = c.req.query('milestone_id');
  const type = c.req.query('type');

  let items = store.roadmap.items;
  if (horizon) items = items.filter(i => i.horizon === horizon);
  if (status) items = items.filter(i => i.status === status);
  if (assignee) items = items.filter(i => i.assignee === assignee);
  if (category) items = items.filter(i => i.category === category);
  if (epic_id) items = items.filter(i => i.epic_id === epic_id);
  if (milestone_id) items = items.filter(i => i.milestone_id === milestone_id);
  if (type) items = items.filter(i => i.type === type);

  return c.json({ ok: true, data: { items, total: store.roadmap.items.length } });
});

// GET /api/v1/roadmap/:id
app.get('/:id', (c) => {
  const store = getStore();
  const item = store.roadmap.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);
  return c.json({ ok: true, data: item });
});

// POST /api/v1/roadmap
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  // WIP limit check
  if (body.horizon === 'now') {
    const nowCount = store.roadmap.items.filter(
      i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled'
    ).length;
    if (nowCount >= store.config.settings.max_now_items) {
      return c.json({
        ok: false,
        error: `WIP limit reached: ${nowCount}/${store.config.settings.max_now_items} items in Now. Demote one first.`,
      }, 400);
    }
  }

  const now = new Date().toISOString().split('T')[0];
  const item: RoadmapItem = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    summary: body.summary || '',
    type: body.type || 'feature',
    horizon: body.horizon || 'later',
    priority: body.priority || 'P2',
    size: body.size || 'M',
    status: body.status || 'pending',
    category: body.category || 'general',
    epic_id: body.epic_id || null,
    milestone_id: body.milestone_id || null,
    depends_on: body.depends_on || [],
    blocked_by: body.blocked_by || [],
    related_issues: body.related_issues || [],
    spawned_from: body.spawned_from || null,
    assignee: body.assignee || null,
    tags: body.tags || [],
    design_doc: body.design_doc || null,
    acceptance_criteria: body.acceptance_criteria || [],
    created: now,
    updated: now,
    started: body.status === 'in_progress' ? now : null,
    completed: null,
    ai_notes: body.ai_notes || null,
    estimated_sessions: body.estimated_sessions || null,
  };

  if (store.roadmap.items.find(i => i.id === item.id)) {
    return c.json({ ok: false, error: `Item with id "${item.id}" already exists` }, 409);
  }

  store.roadmap.items.push(item);
  store.saveRoadmap();

  // Update epic/milestone progress
  if (item.epic_id) store.recomputeEpicProgress(item.epic_id);
  if (item.milestone_id) store.recomputeMilestoneProgress(item.milestone_id);

  // Activity
  store.addActivity({
    type: 'item_created',
    entity_type: 'roadmap',
    entity_id: item.id,
    title: `Created: ${item.title}`,
    actor: 'user',
    metadata: { horizon: item.horizon, size: item.size, type: item.type },
  });

  broadcast({ type: 'roadmap_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item }, 201);
});

// PATCH /api/v1/roadmap/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const item = store.roadmap.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  const body = await c.req.json();

  // WIP limit check if moving to now
  if (body.horizon === 'now' && item.horizon !== 'now') {
    const nowCount = store.roadmap.items.filter(
      i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled'
    ).length;
    if (nowCount >= store.config.settings.max_now_items) {
      return c.json({
        ok: false,
        error: `WIP limit reached: ${nowCount}/${store.config.settings.max_now_items} items in Now.`,
      }, 400);
    }
  }

  const oldEpicId = item.epic_id;
  const oldMilestoneId = item.milestone_id;

  if (body.title !== undefined) item.title = body.title;
  if (body.summary !== undefined) item.summary = body.summary;
  if (body.type !== undefined) item.type = body.type;
  if (body.horizon !== undefined) item.horizon = body.horizon;
  if (body.priority !== undefined) item.priority = body.priority;
  if (body.size !== undefined) item.size = body.size;
  if (body.status !== undefined) {
    if (body.status === 'in_progress' && !item.started) item.started = new Date().toISOString().split('T')[0];
    if (body.status === 'completed' && !item.completed) item.completed = new Date().toISOString().split('T')[0];
    item.status = body.status;
  }
  if (body.category !== undefined) item.category = body.category;
  if (body.epic_id !== undefined) item.epic_id = body.epic_id;
  if (body.milestone_id !== undefined) item.milestone_id = body.milestone_id;
  if (body.depends_on !== undefined) item.depends_on = body.depends_on;
  if (body.blocked_by !== undefined) item.blocked_by = body.blocked_by;
  if (body.related_issues !== undefined) item.related_issues = body.related_issues;
  if (body.spawned_from !== undefined) item.spawned_from = body.spawned_from;
  if (body.assignee !== undefined) item.assignee = body.assignee;
  if (body.tags !== undefined) item.tags = body.tags;
  if (body.design_doc !== undefined) item.design_doc = body.design_doc;
  if (body.acceptance_criteria !== undefined) item.acceptance_criteria = body.acceptance_criteria;
  if (body.ai_notes !== undefined) item.ai_notes = body.ai_notes;
  if (body.estimated_sessions !== undefined) item.estimated_sessions = body.estimated_sessions;

  item.updated = new Date().toISOString().split('T')[0];

  // State transition validation: completed/cancelled items must be in shipped horizon
  if ((item.status === 'completed' || item.status === 'cancelled') && item.horizon !== 'shipped') {
    item.horizon = 'shipped' as any;
  }

  store.saveRoadmap();

  // Recompute progress for affected epics/milestones
  if (oldEpicId) store.recomputeEpicProgress(oldEpicId);
  if (item.epic_id && item.epic_id !== oldEpicId) store.recomputeEpicProgress(item.epic_id);
  if (oldMilestoneId) store.recomputeMilestoneProgress(oldMilestoneId);
  if (item.milestone_id && item.milestone_id !== oldMilestoneId) store.recomputeMilestoneProgress(item.milestone_id);

  broadcast({ type: 'roadmap_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/roadmap/:id/complete
app.post('/:id/complete', async (c) => {
  const store = getStore();
  const item = store.roadmap.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  const now = new Date().toISOString().split('T')[0];
  item.status = 'completed';
  item.completed = now;
  item.updated = now;

  store.saveRoadmap();

  if (item.epic_id) { store.recomputeEpicProgress(item.epic_id); store.saveEpics(); }
  if (item.milestone_id) { store.recomputeMilestoneProgress(item.milestone_id); store.saveMilestones(); }

  store.addActivity({
    type: 'item_completed',
    entity_type: 'roadmap',
    entity_id: item.id,
    title: `Completed: ${item.title}`,
    actor: 'user',
    metadata: { size: item.size, type: item.type },
  });

  // Fire automation trigger (non-blocking)
  getAutomationEngine().fire({ trigger: 'item_completed', data: item }).catch(() => {});

  broadcast({ type: 'roadmap_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/roadmap/:id/move
app.post('/:id/move', async (c) => {
  const store = getStore();
  const item = store.roadmap.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  const body = await c.req.json();
  const targetHorizon = body.horizon as Horizon;
  if (!targetHorizon) return c.json({ ok: false, error: 'horizon is required' }, 400);

  if (targetHorizon === 'now' && item.horizon !== 'now') {
    const nowCount = store.roadmap.items.filter(
      i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled'
    ).length;
    if (nowCount >= store.config.settings.max_now_items) {
      return c.json({
        ok: false,
        error: `WIP limit reached: ${nowCount}/${store.config.settings.max_now_items} items in Now.`,
      }, 400);
    }
  }

  const oldHorizon = item.horizon;
  item.horizon = targetHorizon;
  item.updated = new Date().toISOString().split('T')[0];

  store.saveRoadmap();

  store.addActivity({
    type: 'item_moved',
    entity_type: 'roadmap',
    entity_id: item.id,
    title: `Moved "${item.title}" from ${oldHorizon} → ${targetHorizon}`,
    actor: 'user',
    metadata: { from: oldHorizon, to: targetHorizon },
  });

  broadcast({ type: 'roadmap_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/roadmap/:id/reopen
app.post('/:id/reopen', async (c) => {
  const store = getStore();
  const item = store.roadmap.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  if (item.status !== 'completed' && item.status !== 'cancelled') {
    return c.json({ ok: false, error: 'Item is not completed or cancelled' }, 400);
  }

  item.status = 'pending';
  item.completed = null;
  item.updated = new Date().toISOString().split('T')[0];

  store.saveRoadmap();

  if (item.epic_id) { store.recomputeEpicProgress(item.epic_id); store.saveEpics(); }
  if (item.milestone_id) { store.recomputeMilestoneProgress(item.milestone_id); store.saveMilestones(); }

  broadcast({ type: 'roadmap_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// DELETE /api/v1/roadmap/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.roadmap.items.findIndex(i => i.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Item not found' }, 404);

  const removed = store.roadmap.items.splice(idx, 1)[0];
  store.saveRoadmap();

  if (removed.epic_id) { store.recomputeEpicProgress(removed.epic_id); store.saveEpics(); }
  if (removed.milestone_id) { store.recomputeMilestoneProgress(removed.milestone_id); store.saveMilestones(); }

  broadcast({ type: 'roadmap_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

export default app;
