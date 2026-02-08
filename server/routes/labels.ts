import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Label } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/labels
app.get('/', (c) => {
  const store = getStore();

  // Recompute entity counts
  const labels = store.labels.labels.map(label => {
    let count = 0;
    count += store.roadmap.items.filter(i => i.tags.includes(label.id)).length;
    count += store.issues.issues.filter(i => i.tags.includes(label.id)).length;
    count += store.ideas.ideas.filter(i => i.tags.includes(label.id)).length;
    count += store.epics.epics.filter(e => e.tags.includes(label.id)).length;
    count += store.systems.systems.filter(s => s.tags.includes(label.id)).length;
    label.entity_count = count;
    return label;
  });

  return c.json({ ok: true, data: { labels } });
});

// POST /api/v1/labels
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const label: Label = {
    id: body.id || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: body.name,
    color: body.color || '#6366f1',
    description: body.description || '',
    entity_count: 0,
  };

  if (store.labels.labels.find(l => l.id === label.id)) {
    return c.json({ ok: false, error: `Label "${label.id}" already exists` }, 409);
  }

  store.labels.labels.push(label);
  store.saveLabels();

  broadcast({ type: 'label_updated', data: label, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: label }, 201);
});

// PATCH /api/v1/labels/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const label = store.labels.labels.find(l => l.id === c.req.param('id'));
  if (!label) return c.json({ ok: false, error: 'Label not found' }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) label.name = body.name;
  if (body.color !== undefined) label.color = body.color;
  if (body.description !== undefined) label.description = body.description;

  store.saveLabels();

  broadcast({ type: 'label_updated', data: label, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: label });
});

// DELETE /api/v1/labels/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.labels.labels.findIndex(l => l.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Label not found' }, 404);

  const removed = store.labels.labels.splice(idx, 1)[0];
  store.saveLabels();

  broadcast({ type: 'label_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

export default app;
