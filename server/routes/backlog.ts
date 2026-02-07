import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { BacklogItem, Horizon } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/backlog
app.get('/', (c) => {
  const store = getStore();
  const horizon = c.req.query('horizon') as Horizon | undefined;
  const status = c.req.query('status');
  const assignee = c.req.query('assignee');
  const category = c.req.query('category');

  let items = store.backlog.items;
  if (horizon) items = items.filter(i => i.horizon === horizon);
  if (status) items = items.filter(i => i.status === status);
  if (assignee) items = items.filter(i => i.assignee === assignee);
  if (category) items = items.filter(i => i.category === category);

  return c.json({ ok: true, data: { items, total: store.backlog.items.length } });
});

// GET /api/v1/backlog/:id
app.get('/:id', (c) => {
  const store = getStore();
  const item = store.backlog.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);
  return c.json({ ok: true, data: item });
});

// POST /api/v1/backlog
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  // WIP limit check
  if (body.horizon === 'now') {
    const nowCount = store.backlog.items.filter(
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
  const item: BacklogItem = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    horizon: body.horizon || 'later',
    size: body.size || 'M',
    status: body.status || 'pending',
    category: body.category || 'general',
    summary: body.summary || '',
    design_doc: body.design_doc || null,
    depends_on: body.depends_on || [],
    assignee: body.assignee || null,
    created: now,
    updated: now,
    completed: null,
    tags: body.tags || [],
  };

  // Check for duplicate ID
  if (store.backlog.items.find(i => i.id === item.id)) {
    return c.json({ ok: false, error: `Item with id "${item.id}" already exists` }, 409);
  }

  store.backlog.items.push(item);
  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item }, 201);
});

// PATCH /api/v1/backlog/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const item = store.backlog.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  const body = await c.req.json();

  // WIP limit check if moving to now
  if (body.horizon === 'now' && item.horizon !== 'now') {
    const nowCount = store.backlog.items.filter(
      i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled'
    ).length;
    if (nowCount >= store.config.settings.max_now_items) {
      return c.json({
        ok: false,
        error: `WIP limit reached: ${nowCount}/${store.config.settings.max_now_items} items in Now.`,
      }, 400);
    }
  }

  if (body.title !== undefined) item.title = body.title;
  if (body.horizon !== undefined) item.horizon = body.horizon;
  if (body.size !== undefined) item.size = body.size;
  if (body.status !== undefined) item.status = body.status;
  if (body.category !== undefined) item.category = body.category;
  if (body.summary !== undefined) item.summary = body.summary;
  if (body.design_doc !== undefined) item.design_doc = body.design_doc;
  if (body.depends_on !== undefined) item.depends_on = body.depends_on;
  if (body.assignee !== undefined) item.assignee = body.assignee;
  if (body.tags !== undefined) item.tags = body.tags;
  item.updated = new Date().toISOString().split('T')[0];

  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/backlog/:id/complete
app.post('/:id/complete', async (c) => {
  const store = getStore();
  const item = store.backlog.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  item.status = 'completed';
  item.completed = new Date().toISOString().split('T')[0];
  item.updated = item.completed;

  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/backlog/:id/move
app.post('/:id/move', async (c) => {
  const store = getStore();
  const item = store.backlog.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  const body = await c.req.json();
  const targetHorizon = body.horizon as Horizon;
  if (!targetHorizon) return c.json({ ok: false, error: 'horizon is required' }, 400);

  // WIP check
  if (targetHorizon === 'now' && item.horizon !== 'now') {
    const nowCount = store.backlog.items.filter(
      i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled'
    ).length;
    if (nowCount >= store.config.settings.max_now_items) {
      return c.json({
        ok: false,
        error: `WIP limit reached: ${nowCount}/${store.config.settings.max_now_items} items in Now.`,
      }, 400);
    }
  }

  item.horizon = targetHorizon;
  item.updated = new Date().toISOString().split('T')[0];

  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// POST /api/v1/backlog/:id/reopen
app.post('/:id/reopen', async (c) => {
  const store = getStore();
  const item = store.backlog.items.find(i => i.id === c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404);

  if (item.status !== 'completed' && item.status !== 'cancelled') {
    return c.json({ ok: false, error: 'Item is not completed or cancelled' }, 400);
  }

  item.status = 'pending';
  item.completed = null;
  item.updated = new Date().toISOString().split('T')[0];

  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: item, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: item });
});

// DELETE /api/v1/backlog/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.backlog.items.findIndex(i => i.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Item not found' }, 404);

  const removed = store.backlog.items.splice(idx, 1)[0];
  store.saveBacklog();
  broadcast({ type: 'backlog_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

export default app;
