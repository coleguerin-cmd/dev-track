import { Hono } from 'hono';
import { getStore } from '../store.js';

const app = new Hono();

// GET /api/v1/docs/designs
app.get('/designs', (c) => {
  const store = getStore();
  const files = store.listDesignDocs();
  return c.json({ ok: true, data: { files } });
});

// GET /api/v1/docs/designs/:filename
app.get('/designs/:filename', (c) => {
  const store = getStore();
  const content = store.getDesignDoc(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Design doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

// GET /api/v1/docs/decisions
app.get('/decisions', (c) => {
  const store = getStore();
  const files = store.listDecisions();
  return c.json({ ok: true, data: { files } });
});

// GET /api/v1/docs/decisions/:filename
app.get('/decisions/:filename', (c) => {
  const store = getStore();
  const content = store.getDecision(c.req.param('filename'));
  if (!content) return c.json({ ok: false, error: 'Decision doc not found' }, 404);
  return c.json({ ok: true, data: { filename: c.req.param('filename'), content } });
});

export default app;
