import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { getAutomationEngine } from '../automation/engine.js';
import type { Automation } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/automations
app.get('/', (c) => {
  const store = getStore();
  const enabled = c.req.query('enabled');

  let automations = store.automations.automations;
  if (enabled !== undefined) {
    automations = automations.filter(a => a.enabled === (enabled === 'true'));
  }

  return c.json({ ok: true, data: { automations, total: store.automations.automations.length } });
});

// GET /api/v1/automations/:id
app.get('/:id', (c) => {
  const store = getStore();
  const automation = store.automations.automations.find(a => a.id === c.req.param('id'));
  if (!automation) return c.json({ ok: false, error: 'Automation not found' }, 404);
  return c.json({ ok: true, data: automation });
});

// POST /api/v1/automations
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const automation: Automation = {
    id: body.id || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: body.name,
    description: body.description || '',
    enabled: body.enabled ?? true,
    trigger: body.trigger,
    conditions: body.conditions || [],
    actions: body.actions || [],
    ai_driven: body.ai_driven || false,
    ai_prompt: body.ai_prompt || null,
    last_fired: null,
    fire_count: 0,
    created: new Date().toISOString().split('T')[0],
  };

  if (store.automations.automations.find(a => a.id === automation.id)) {
    return c.json({ ok: false, error: `Automation "${automation.id}" already exists` }, 409);
  }

  store.automations.automations.push(automation);
  store.saveAutomations();

  broadcast({ type: 'automation_updated', data: automation, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: automation }, 201);
});

// PATCH /api/v1/automations/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const automation = store.automations.automations.find(a => a.id === c.req.param('id'));
  if (!automation) return c.json({ ok: false, error: 'Automation not found' }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) automation.name = body.name;
  if (body.description !== undefined) automation.description = body.description;
  if (body.enabled !== undefined) automation.enabled = body.enabled;
  if (body.trigger !== undefined) automation.trigger = body.trigger;
  if (body.conditions !== undefined) automation.conditions = body.conditions;
  if (body.actions !== undefined) automation.actions = body.actions;
  if (body.ai_driven !== undefined) automation.ai_driven = body.ai_driven;
  if (body.ai_prompt !== undefined) automation.ai_prompt = body.ai_prompt;

  store.saveAutomations();

  broadcast({ type: 'automation_updated', data: automation, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: automation });
});

// POST /api/v1/automations/:id/toggle
app.post('/:id/toggle', async (c) => {
  const store = getStore();
  const automation = store.automations.automations.find(a => a.id === c.req.param('id'));
  if (!automation) return c.json({ ok: false, error: 'Automation not found' }, 404);

  automation.enabled = !automation.enabled;
  store.saveAutomations();

  broadcast({ type: 'automation_updated', data: automation, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: automation });
});

// DELETE /api/v1/automations/:id
app.delete('/:id', (c) => {
  const store = getStore();
  const idx = store.automations.automations.findIndex(a => a.id === c.req.param('id'));
  if (idx === -1) return c.json({ ok: false, error: 'Automation not found' }, 404);

  const removed = store.automations.automations.splice(idx, 1)[0];
  store.saveAutomations();

  broadcast({ type: 'automation_updated', data: { removed: removed.id }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: removed });
});

// POST /api/v1/automations/trigger — manually fire a trigger
app.post('/trigger', async (c) => {
  const body = await c.req.json();
  const trigger = body.trigger || 'manual';
  const data = body.data || {};

  const engine = getAutomationEngine();
  await engine.fire({ trigger, data, timestamp: new Date().toISOString() });

  return c.json({ ok: true, data: { triggered: trigger } });
});

// POST /api/v1/automations/:id/fire — manually fire a specific automation
app.post('/:id/fire', async (c) => {
  const store = getStore();
  const automation = store.automations.automations.find(a => a.id === c.req.param('id'));
  if (!automation) return c.json({ ok: false, error: 'Automation not found' }, 404);

  const engine = getAutomationEngine();
  await engine.fire({ trigger: automation.trigger as any, data: { manual: true, automation_id: automation.id } });

  return c.json({ ok: true, data: { fired: automation.id } });
});

export default app;
