import { Hono } from 'hono';
import { getStore } from '../store.js';
import type { ActivityType } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/activity — Unified activity feed
app.get('/', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '50');
  const type = c.req.query('type') as ActivityType | undefined;
  const entity_type = c.req.query('entity_type');
  const since = c.req.query('since');

  let events = store.activity.events;
  if (type) events = events.filter(e => e.type === type);
  if (entity_type) events = events.filter(e => e.entity_type === entity_type);
  if (since) events = events.filter(e => e.timestamp >= since);

  // Most recent first
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);

  return c.json({
    ok: true,
    data: {
      events: sorted,
      total: store.activity.events.length,
    },
  });
});

export default app;
