import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';

const app = new Hono();

// GET /api/v1/config
app.get('/', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: store.config });
});

// PATCH /api/v1/config
app.patch('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  // Deep merge settings
  if (body.settings) {
    if (body.settings.max_now_items !== undefined)
      store.config.settings.max_now_items = body.settings.max_now_items;
    if (body.settings.max_session_history !== undefined)
      store.config.settings.max_session_history = body.settings.max_session_history;
    if (body.settings.verbosity) {
      store.config.settings.verbosity = {
        ...store.config.settings.verbosity,
        ...body.settings.verbosity,
      };
    }
    if (body.settings.developers !== undefined)
      store.config.settings.developers = body.settings.developers;
  }

  if (body.description !== undefined) store.config.description = body.description;

  store.saveConfig();
  broadcast({ type: 'settings_changed', data: store.config, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: store.config });
});

// GET /api/v1/quick-status
app.get('/quick-status', (c) => {
  const store = getStore();
  return c.json({
    ok: true,
    data: {
      status: store.getQuickStatus(),
      status_line: store.getQuickStatusLine(),
    },
  });
});

export default app;
