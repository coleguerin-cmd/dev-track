import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { ChangelogEntry, ChangeType } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/changelog
app.get('/', (c) => {
  const store = getStore();
  const limit = parseInt(c.req.query('limit') || '50');
  const since = c.req.query('since');
  const type = c.req.query('type') as ChangeType | undefined;
  const scope = c.req.query('scope');
  const release_id = c.req.query('release_id');

  let entries = store.changelog.entries;
  if (since) entries = entries.filter(e => e.date >= since);
  if (type) entries = entries.filter(e => e.type === type);
  if (scope) entries = entries.filter(e => e.scope === scope);
  if (release_id) entries = entries.filter(e => e.release_id === release_id);

  const sorted = [...entries].reverse().slice(0, limit);
  return c.json({ ok: true, data: { entries: sorted, total: store.changelog.entries.length } });
});

// POST /api/v1/changelog
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const today = new Date().toISOString().split('T')[0];
  const nextId = store.changelog.entries.length + 1;

  const entry: ChangelogEntry = {
    id: body.id || `CL-${String(nextId).padStart(3, '0')}`,
    date: body.date || today,
    session: body.session ?? null,
    title: body.title,
    description: body.description || '',
    type: body.type || 'chore',
    scope: body.scope || body.category || 'general',
    roadmap_item: body.roadmap_item || body.backlog_item || null,
    epic_id: body.epic_id || null,
    issues_resolved: body.issues_resolved || [],
    release_id: body.release_id || null,
    files_changed: body.files_changed || body.files_touched || [],
    commit_hashes: body.commit_hashes || [],
    breaking: body.breaking || false,
    tags: body.tags || [],
  };

  store.changelog.entries.push(entry);
  store.saveChangelog();

  store.addActivity({
    type: 'changelog_entry',
    entity_type: 'changelog',
    entity_id: entry.id,
    title: `${entry.type}: ${entry.title}`,
    actor: 'user',
    metadata: { type: entry.type, scope: entry.scope },
  });

  broadcast({ type: 'changelog_updated', data: entry, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: entry }, 201);
});

export default app;
