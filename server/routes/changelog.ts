import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { ChangelogEntry } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/changelog
app.get('/', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '50');
  const since = c.req.query('since');
  const category = c.req.query('category');

  let entries = store.changelog.entries;
  if (since) entries = entries.filter(e => e.date >= since);
  if (category) entries = entries.filter(e => e.category === category);

  // Most recent first
  const sorted = [...entries].reverse().slice(0, limit);
  return c.json({ ok: true, data: { entries: sorted, total: store.changelog.entries.length } });
});

// GET /api/v1/changelog/summaries
app.get('/summaries', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: store.changelogSummaries });
});

// POST /api/v1/changelog
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const today = new Date().toISOString().split('T')[0];
  const entry: ChangelogEntry = {
    id: `chg-${today}-${body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}`,
    date: today,
    session_date: today,
    category: body.category || 'general',
    title: body.title,
    description: body.description || '',
    items: body.items || [],
    files_touched: body.files_touched || [],
    backlog_item: body.backlog_item || null,
    breaking: body.breaking || false,
  };

  store.changelog.entries.push(entry);
  store.saveChangelog();
  broadcast({ type: 'changelog_updated', data: entry, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: entry }, 201);
});

export default app;
