import { Hono } from 'hono';
import { getIntegrationManager } from '../integrations/manager.js';

const app = new Hono();

// GET /api/v1/integrations — List all available plugins
app.get('/', (c) => {
  const manager = getIntegrationManager();
  return c.json({ ok: true, data: { plugins: manager.getAvailablePlugins() } });
});

// GET /api/v1/integrations/health — Health of all active integrations (dashboard)
app.get('/health', async (c) => {
  const manager = getIntegrationManager();
  const health = await manager.getAllHealth();
  return c.json({ ok: true, data: { integrations: health } });
});

// GET /api/v1/integrations/:id — Get plugin detail + masked creds
app.get('/:id', (c) => {
  const manager = getIntegrationManager();
  const plugins = manager.getAvailablePlugins();
  const plugin = plugins.find(p => p.id === c.req.param('id'));
  if (!plugin) return c.json({ ok: false, error: 'Plugin not found' }, 404);

  const maskedCreds = manager.getCredentialsMasked(plugin.id);
  return c.json({ ok: true, data: { plugin, credentials: maskedCreds } });
});

// POST /api/v1/integrations/:id/credentials — Save credentials
app.post('/:id/credentials', async (c) => {
  const manager = getIntegrationManager();
  const pluginId = c.req.param('id');
  const body = await c.req.json();

  // Merge with existing (so user can update single fields)
  const existing = manager.getRawCredentials(pluginId);
  const merged = { ...existing };
  for (const [key, value] of Object.entries(body.credentials || {})) {
    if (typeof value === 'string' && value.trim()) {
      merged[key] = value.trim();
    }
  }

  manager.setCredentials(pluginId, merged);
  return c.json({ ok: true, data: { saved: true } });
});

// POST /api/v1/integrations/:id/enable
app.post('/:id/enable', async (c) => {
  const manager = getIntegrationManager();
  manager.setEnabled(c.req.param('id'), true);
  return c.json({ ok: true });
});

// POST /api/v1/integrations/:id/disable
app.post('/:id/disable', async (c) => {
  const manager = getIntegrationManager();
  manager.setEnabled(c.req.param('id'), false);
  return c.json({ ok: true });
});

// POST /api/v1/integrations/:id/test — Test connection
app.post('/:id/test', async (c) => {
  const manager = getIntegrationManager();
  const result = await manager.testConnection(c.req.param('id'));
  return c.json({ ok: true, data: result });
});

// GET /api/v1/integrations/:id/health — Get health for a single plugin
app.get('/:id/health', async (c) => {
  const manager = getIntegrationManager();
  const health = await manager.getHealth(c.req.param('id'));
  return c.json({ ok: true, data: health });
});

// GET /api/v1/integrations/:id/events — Get recent events
app.get('/:id/events', async (c) => {
  const manager = getIntegrationManager();
  const events = await manager.getRecentEvents(c.req.param('id'));
  return c.json({ ok: true, data: { events } });
});

// POST /api/v1/integrations/:id/actions/:actionId — Execute an action
app.post('/:id/actions/:actionId', async (c) => {
  const manager = getIntegrationManager();
  const result = await manager.executeAction(c.req.param('id'), c.req.param('actionId'));
  return c.json({ ok: true, data: result });
});

export default app;
