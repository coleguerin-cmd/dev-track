import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { SessionPlan, SessionEntry } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/session/current
app.get('/current', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: store.sessionCurrent });
});

// POST /api/v1/session/start
app.post('/start', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const session: SessionPlan = {
    date: new Date().toISOString().split('T')[0],
    started_at: new Date().toISOString(),
    ended_at: null,
    status: 'active',
    developer: body.developer || 'default',
    objective: body.objective || '',
    appetite: body.appetite || '4h',
    items: body.items || [],
    wont_do: body.wont_do || [],
    notes: '',
  };

  store.sessionCurrent = session;
  store.saveSessionCurrent();
  broadcast({ type: 'session_updated', data: session, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: session });
});

// PATCH /api/v1/session/current
app.patch('/current', async (c) => {
  const store = getStore();
  if (!store.sessionCurrent) {
    return c.json({ ok: false, error: 'No active session' }, 400);
  }

  const body = await c.req.json();
  if (body.notes !== undefined) store.sessionCurrent.notes = body.notes;
  if (body.objective !== undefined) store.sessionCurrent.objective = body.objective;
  if (body.items !== undefined) store.sessionCurrent.items = body.items;
  if (body.wont_do !== undefined) store.sessionCurrent.wont_do = body.wont_do;

  store.saveSessionCurrent();
  broadcast({ type: 'session_updated', data: store.sessionCurrent, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: store.sessionCurrent });
});

// POST /api/v1/session/end
app.post('/end', async (c) => {
  const store = getStore();
  if (!store.sessionCurrent) {
    return c.json({ ok: false, error: 'No active session' }, 400);
  }

  const body = await c.req.json();
  const now = new Date().toISOString();
  const startTime = new Date(store.sessionCurrent.started_at).getTime();
  const durationHours = Math.round((Date.now() - startTime) / 3600000 * 10) / 10;

  // Create session log entry
  const entry: SessionEntry = {
    date: store.sessionCurrent.date,
    developer: store.sessionCurrent.developer,
    started_at: store.sessionCurrent.started_at,
    ended_at: now,
    duration_hours: durationHours,
    objective: store.sessionCurrent.objective,
    items_planned: store.sessionCurrent.items.length,
    items_shipped: body.items_shipped || 0,
    shipped: body.shipped || [],
    discovered: body.discovered || [],
    next_session_suggestion: body.next_session_suggestion || '',
    handoff_message: body.handoff_message,
  };

  store.sessionLog.sessions.push(entry);

  // Trim to max history
  const max = store.config.settings.max_session_history;
  if (store.sessionLog.sessions.length > max) {
    // TODO: Archive older sessions
    store.sessionLog.sessions = store.sessionLog.sessions.slice(-max);
  }

  // Clear current session
  store.sessionCurrent = null;

  store.saveSessionLog();
  store.saveSessionCurrent();
  broadcast({ type: 'session_updated', data: { ended: entry }, timestamp: now });
  return c.json({ ok: true, data: entry });
});

// GET /api/v1/session/log
app.get('/log', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '10');
  const sessions = store.sessionLog.sessions.slice(-limit);
  return c.json({ ok: true, data: { sessions } });
});

// GET /api/v1/session/log/latest
app.get('/log/latest', (c) => {
  const store = getStore();
  const latest = store.sessionLog.sessions.length > 0
    ? store.sessionLog.sessions[store.sessionLog.sessions.length - 1]
    : null;
  return c.json({ ok: true, data: latest });
});

export default app;
