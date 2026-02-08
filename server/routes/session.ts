import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { getAutomationEngine } from '../automation/engine.js';
import type { Session } from '../../shared/types.js';

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

  const session: Session = {
    id: store.sessions.next_id,
    date: new Date().toISOString().split('T')[0],
    developer: body.developer || 'user',
    objective: body.objective || '',
    appetite: body.appetite || '4h',
    status: 'active',
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_hours: 0,
    items_shipped: 0,
    points: 0,
    roadmap_items_completed: [],
    issues_resolved: [],
    ideas_captured: [],
    changelog_ids: [],
    retro: null,
    next_suggestion: null,
    ai_observation: null,
  };

  store.sessionCurrent = session;
  store.sessions.next_id++;
  store.saveSessionCurrent();
  store.saveSessionLog();

  store.addActivity({
    type: 'session_started',
    entity_type: 'session',
    entity_id: String(session.id),
    title: `Session ${session.id} started: ${session.objective}`,
    actor: session.developer,
    metadata: { objective: session.objective, appetite: session.appetite },
  });

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
  if (body.objective !== undefined) store.sessionCurrent.objective = body.objective;
  if (body.appetite !== undefined) store.sessionCurrent.appetite = body.appetite;
  if (body.roadmap_items_completed !== undefined) store.sessionCurrent.roadmap_items_completed = body.roadmap_items_completed;
  if (body.issues_resolved !== undefined) store.sessionCurrent.issues_resolved = body.issues_resolved;
  if (body.ideas_captured !== undefined) store.sessionCurrent.ideas_captured = body.ideas_captured;
  if (body.changelog_ids !== undefined) store.sessionCurrent.changelog_ids = body.changelog_ids;
  if (body.items_shipped !== undefined) store.sessionCurrent.items_shipped = body.items_shipped;
  if (body.points !== undefined) store.sessionCurrent.points = body.points;

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

  // Finalize session
  store.sessionCurrent.status = 'completed';
  store.sessionCurrent.ended_at = now;
  store.sessionCurrent.duration_hours = durationHours;

  if (body.items_shipped !== undefined) store.sessionCurrent.items_shipped = body.items_shipped;
  if (body.points !== undefined) store.sessionCurrent.points = body.points;
  if (body.roadmap_items_completed !== undefined) store.sessionCurrent.roadmap_items_completed = body.roadmap_items_completed;
  if (body.issues_resolved !== undefined) store.sessionCurrent.issues_resolved = body.issues_resolved;
  if (body.ideas_captured !== undefined) store.sessionCurrent.ideas_captured = body.ideas_captured;
  if (body.changelog_ids !== undefined) store.sessionCurrent.changelog_ids = body.changelog_ids;
  if (body.retro !== undefined) store.sessionCurrent.retro = body.retro;
  if (body.next_suggestion !== undefined) store.sessionCurrent.next_suggestion = body.next_suggestion;
  if (body.ai_observation !== undefined) store.sessionCurrent.ai_observation = body.ai_observation;

  // Add to session log
  store.sessions.sessions.push(store.sessionCurrent);

  // Trim to max history
  const max = store.config.settings.max_session_history;
  if (store.sessions.sessions.length > max) {
    store.sessions.sessions = store.sessions.sessions.slice(-max);
  }

  const completedSession = store.sessionCurrent;

  // Clear current
  store.sessionCurrent = null;

  store.saveSessionLog();
  store.saveSessionCurrent();

  store.addActivity({
    type: 'session_ended',
    entity_type: 'session',
    entity_id: String(completedSession.id),
    title: `Session ${completedSession.id} ended: ${completedSession.items_shipped} items shipped`,
    actor: completedSession.developer,
    metadata: {
      duration_hours: durationHours,
      items_shipped: completedSession.items_shipped,
      points: completedSession.points,
    },
  });

  broadcast({ type: 'session_updated', data: { ended: completedSession }, timestamp: now });

  // Fire automation trigger (non-blocking)
  getAutomationEngine().fire({ trigger: 'session_ended', data: completedSession }).catch(() => {});

  return c.json({ ok: true, data: completedSession });
});

// GET /api/v1/session/log
app.get('/log', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '20');
  const sessions = store.sessions.sessions.slice(-limit);
  return c.json({ ok: true, data: { sessions } });
});

// GET /api/v1/session/log/latest
app.get('/log/latest', (c) => {
  const store = getStore();
  const latest = store.sessions.sessions.length > 0
    ? store.sessions.sessions[store.sessions.sessions.length - 1]
    : null;
  return c.json({ ok: true, data: latest });
});

export default app;
