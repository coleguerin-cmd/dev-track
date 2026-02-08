import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Release } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/releases
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status');

  let releases = store.releases.releases;
  if (status) releases = releases.filter(r => r.status === status);

  return c.json({ ok: true, data: { releases, total: store.releases.releases.length } });
});

// GET /api/v1/releases/:id
app.get('/:id', (c) => {
  const store = getStore();
  const release = store.releases.releases.find(r => r.id === c.req.param('id'));
  if (!release) return c.json({ ok: false, error: 'Release not found' }, 404);

  // Enrich with changelog entries and items
  const changelogs = store.changelog.entries.filter(e => release.changelog_ids.includes(e.id));
  const items = store.roadmap.items.filter(i => release.roadmap_items_shipped.includes(i.id));

  return c.json({ ok: true, data: { release, changelogs, items } });
});

// POST /api/v1/releases
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const now = new Date().toISOString().split('T')[0];
  const release: Release = {
    id: body.id || `v${body.version}`,
    version: body.version,
    title: body.title || '',
    milestone_id: body.milestone_id || null,
    status: body.status || 'draft',
    release_notes: body.release_notes || '',
    changelog_ids: body.changelog_ids || [],
    roadmap_items_shipped: body.roadmap_items_shipped || [],
    issues_resolved: body.issues_resolved || [],
    total_commits: body.total_commits || 0,
    files_changed: body.files_changed || 0,
    contributors: body.contributors || [],
    published_date: body.status === 'published' ? now : null,
    created: now,
    ai_summary: body.ai_summary || null,
  };

  if (store.releases.releases.find(r => r.id === release.id)) {
    return c.json({ ok: false, error: `Release "${release.id}" already exists` }, 409);
  }

  store.releases.releases.push(release);
  store.saveReleases();

  if (release.status === 'published') {
    store.addActivity({
      type: 'release_published',
      entity_type: 'release',
      entity_id: release.id,
      title: `Release published: ${release.version} — ${release.title}`,
      actor: 'user',
      metadata: { version: release.version },
    });
  }

  broadcast({ type: 'release_updated', data: release, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: release }, 201);
});

// PATCH /api/v1/releases/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const release = store.releases.releases.find(r => r.id === c.req.param('id'));
  if (!release) return c.json({ ok: false, error: 'Release not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) release.title = body.title;
  if (body.status !== undefined) {
    release.status = body.status;
    if (body.status === 'published' && !release.published_date) {
      release.published_date = new Date().toISOString().split('T')[0];
    }
  }
  if (body.release_notes !== undefined) release.release_notes = body.release_notes;
  if (body.changelog_ids !== undefined) release.changelog_ids = body.changelog_ids;
  if (body.roadmap_items_shipped !== undefined) release.roadmap_items_shipped = body.roadmap_items_shipped;
  if (body.issues_resolved !== undefined) release.issues_resolved = body.issues_resolved;
  if (body.ai_summary !== undefined) release.ai_summary = body.ai_summary;

  store.saveReleases();

  broadcast({ type: 'release_updated', data: release, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: release });
});

// POST /api/v1/releases/:id/publish
app.post('/:id/publish', async (c) => {
  const store = getStore();
  const release = store.releases.releases.find(r => r.id === c.req.param('id'));
  if (!release) return c.json({ ok: false, error: 'Release not found' }, 404);

  release.status = 'published';
  release.published_date = new Date().toISOString().split('T')[0];
  store.saveReleases();

  store.addActivity({
    type: 'release_published',
    entity_type: 'release',
    entity_id: release.id,
    title: `Release published: ${release.version} — ${release.title}`,
    actor: 'user',
    metadata: { version: release.version },
  });

  broadcast({ type: 'release_updated', data: release, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: release });
});

export default app;
