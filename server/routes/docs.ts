import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Doc, DocType, DocStatus } from '../../shared/types.js';

const app = new Hono();

// ─── Doc Registry CRUD ──────────────────────────────────────────────────────

// GET /api/v1/docs — list all docs from registry
app.get('/', (c) => {
  const store = getStore();
  const type = c.req.query('type') as DocType | undefined;
  const status = c.req.query('status') as DocStatus | undefined;
  const system = c.req.query('system');
  const auto = c.req.query('auto_generated');

  let docs = store.docsRegistry.docs;
  if (type) docs = docs.filter(d => d.type === type);
  if (status) docs = docs.filter(d => d.status === status);
  if (system) docs = docs.filter(d => d.systems.includes(system));
  if (auto !== undefined) docs = docs.filter(d => d.auto_generated === (auto === 'true'));

  return c.json({ ok: true, data: { docs, total: store.docsRegistry.docs.length } });
});

// GET /api/v1/docs/:id — get doc metadata + content
app.get('/:id', (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const content = store.getDocContent(id);
  return c.json({ ok: true, data: { ...doc, content } });
});

// POST /api/v1/docs — create a new doc
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();
  const now = new Date().toISOString().split('T')[0];

  const doc: Doc = {
    id: body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    title: body.title,
    type: body.type || 'wiki',
    content: '', // stored in .md file, not in registry
    systems: body.systems || [],
    roadmap_items: body.roadmap_items || [],
    epics: body.epics || [],
    auto_generated: body.auto_generated || false,
    last_generated: body.auto_generated ? now : null,
    generation_sources: body.generation_sources || [],
    author: body.author || 'user',
    status: body.status || 'published',
    tags: body.tags || [],
    created: now,
    updated: now,
  };

  if (store.docsRegistry.docs.find(d => d.id === doc.id)) {
    return c.json({ ok: false, error: `Doc "${doc.id}" already exists` }, 409);
  }

  // Write content to .md file
  if (body.content) {
    store.writeDocContent(doc.id, body.content);
  }

  // Save to registry (without content — that's in the .md file)
  store.docsRegistry.docs.push(doc);
  store.saveDocsRegistry();

  store.addActivity({
    type: 'doc_updated',
    entity_type: 'doc',
    entity_id: doc.id,
    title: `Doc created: ${doc.title}`,
    actor: doc.author,
    metadata: { type: doc.type, auto_generated: doc.auto_generated },
  });

  broadcast({ type: 'file_changed', data: { file: `docs/${doc.id}.md` }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: doc }, 201);
});

// PATCH /api/v1/docs/:id — update doc
app.patch('/:id', async (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const body = await c.req.json();

  if (body.title !== undefined) doc.title = body.title;
  if (body.type !== undefined) doc.type = body.type;
  if (body.systems !== undefined) doc.systems = body.systems;
  if (body.roadmap_items !== undefined) doc.roadmap_items = body.roadmap_items;
  if (body.epics !== undefined) doc.epics = body.epics;
  if (body.status !== undefined) doc.status = body.status;
  if (body.tags !== undefined) doc.tags = body.tags;
  if (body.auto_generated !== undefined) doc.auto_generated = body.auto_generated;
  if (body.generation_sources !== undefined) doc.generation_sources = body.generation_sources;

  // Update content if provided
  if (body.content !== undefined) {
    store.writeDocContent(id, body.content);
    if (doc.auto_generated) doc.last_generated = new Date().toISOString().split('T')[0];
  }

  doc.updated = new Date().toISOString().split('T')[0];
  store.saveDocsRegistry();

  broadcast({ type: 'file_changed', data: { file: `docs/${id}.md` }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: doc });
});

// DELETE /api/v1/docs/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const idx = store.docsRegistry.docs.findIndex(d => d.id === id);
  if (idx === -1) return c.json({ ok: false, error: 'Doc not found' }, 404);

  const removed = store.docsRegistry.docs.splice(idx, 1)[0];
  store.deleteDocContent(id);
  store.saveDocsRegistry();

  return c.json({ ok: true, data: removed });
});

// POST /api/v1/docs/:id/regenerate — flag for AI regeneration
app.post('/:id/regenerate', async (c) => {
  const store = getStore();
  const id = c.req.param('id');
  const doc = store.docsRegistry.docs.find(d => d.id === id);
  if (!doc) return c.json({ ok: false, error: 'Doc not found' }, 404);
  if (!doc.auto_generated) return c.json({ ok: false, error: 'Doc is not auto-generated' }, 400);

  // Mark as needing regeneration — the automation engine will pick this up
  doc.last_generated = null;
  doc.updated = new Date().toISOString().split('T')[0];
  store.saveDocsRegistry();

  return c.json({ ok: true, data: doc });
});

// ─── Legacy endpoints (backward compat) ─────────────────────────────────────

// GET /api/v1/docs/designs — list design doc files
app.get('/designs', (c) => {
  const store = getStore();
  const files = store.listDesignDocs();
  return c.json({ ok: true, data: { files } });
});

app.get('/designs/:filename', (c) => {
  const store = getStore();
  const content = store.getDesignDoc(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Design doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

app.get('/decisions', (c) => {
  const store = getStore();
  const files = store.listDecisions();
  return c.json({ ok: true, data: { files } });
});

app.get('/decisions/:filename', (c) => {
  const store = getStore();
  const content = store.getDecision(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Decision doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

export default app;
