import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { broadcast } from '../ws.js';
import { getDataDir } from '../project-config.js';
import type { BrainNote, BrainNotesData, BrainPreferences, ContextRecovery, BrainNoteType, BrainNotePriority } from '../../shared/types.js';

const DATA_DIR = getDataDir();

function readJSON<T>(file: string, fallback: T): T {
  const p = path.join(DATA_DIR, file);
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : fallback; } catch { return fallback; }
}
function writeJSON(file: string, data: unknown) {
  const p = path.join(DATA_DIR, file);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

const app = new Hono();

// ─── Notes ──────────────────────────────────────────────────────────────────

// GET /api/v1/brain/notes — active notes (not dismissed, not expired)
app.get('/notes', (c) => {
  const data = readJSON<BrainNotesData>('brain/notes.json', { notes: [], next_id: 1 });
  const now = new Date().toISOString();
  const active = data.notes.filter(n =>
    !n.dismissed && (!n.expires || n.expires > now)
  );
  const typeFilter = c.req.query('type') as BrainNoteType | undefined;
  const filtered = typeFilter ? active.filter(n => n.type === typeFilter) : active;
  return c.json({ ok: true, data: { notes: filtered, total_active: active.length } });
});

// GET /api/v1/brain/notes/all — everything including dismissed
app.get('/notes/all', (c) => {
  const data = readJSON<BrainNotesData>('brain/notes.json', { notes: [], next_id: 1 });
  return c.json({ ok: true, data });
});

// POST /api/v1/brain/notes — AI or user creates a note
app.post('/notes', async (c) => {
  const data = readJSON<BrainNotesData>('brain/notes.json', { notes: [], next_id: 1 });
  const body = await c.req.json();

  const note: BrainNote = {
    id: `BN-${String(data.next_id).padStart(3, '0')}`,
    type: body.type || 'observation',
    priority: body.priority || 'medium',
    title: body.title,
    content: body.content || '',
    context: body.context || '',
    actionable: body.actionable ?? false,
    action_taken: false,
    related_items: body.related_items || [],
    created: new Date().toISOString(),
    expires: body.expires || null,
    dismissed: false,
  };

  data.notes.push(note);
  data.next_id++;
  writeJSON('brain/notes.json', data);

  broadcast({ type: 'file_changed', data: { type: 'brain_note', note }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: note }, 201);
});

// PATCH /api/v1/brain/notes/:id
app.patch('/notes/:id', async (c) => {
  const data = readJSON<BrainNotesData>('brain/notes.json', { notes: [], next_id: 1 });
  const note = data.notes.find(n => n.id === c.req.param('id'));
  if (!note) return c.json({ ok: false, error: 'Note not found' }, 404);

  const body = await c.req.json();
  if (body.dismissed !== undefined) note.dismissed = body.dismissed;
  if (body.action_taken !== undefined) note.action_taken = body.action_taken;
  if (body.content !== undefined) note.content = body.content;
  if (body.priority !== undefined) note.priority = body.priority;

  writeJSON('brain/notes.json', data);
  return c.json({ ok: true, data: note });
});

// POST /api/v1/brain/notes/:id/dismiss
app.post('/notes/:id/dismiss', async (c) => {
  const data = readJSON<BrainNotesData>('brain/notes.json', { notes: [], next_id: 1 });
  const note = data.notes.find(n => n.id === c.req.param('id'));
  if (!note) return c.json({ ok: false, error: 'Note not found' }, 404);
  note.dismissed = true;
  writeJSON('brain/notes.json', data);
  return c.json({ ok: true });
});

// ─── Preferences ────────────────────────────────────────────────────────────

app.get('/preferences', (c) => {
  const data = readJSON<BrainPreferences>('brain/preferences.json', { preferences: [], learned_patterns: [] });
  return c.json({ ok: true, data });
});

app.post('/preferences', async (c) => {
  const data = readJSON<BrainPreferences>('brain/preferences.json', { preferences: [], learned_patterns: [] });
  const body = await c.req.json();

  if (body.preference) {
    const existing = data.preferences.find(p => p.key === body.preference.key);
    if (existing) {
      existing.value = body.preference.value;
      existing.confidence = body.preference.confidence ?? existing.confidence;
      existing.updated = new Date().toISOString();
    } else {
      data.preferences.push({
        key: body.preference.key,
        value: body.preference.value,
        learned_from: body.preference.learned_from || 'explicit',
        confidence: body.preference.confidence ?? 0.8,
        updated: new Date().toISOString(),
      });
    }
  }

  if (body.pattern) {
    const existing = data.learned_patterns.find(p => p.pattern === body.pattern.pattern);
    if (existing) {
      existing.frequency++;
      existing.last_seen = new Date().toISOString();
    } else {
      data.learned_patterns.push({
        pattern: body.pattern.pattern,
        frequency: 1,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        notes: body.pattern.notes || '',
      });
    }
  }

  writeJSON('brain/preferences.json', data);
  return c.json({ ok: true, data });
});

// ─── Context Recovery ───────────────────────────────────────────────────────

app.get('/context', (c) => {
  const data = readJSON<ContextRecovery>('brain/context-recovery.json', {
    last_generated: null, briefing: '', hot_context: [], warnings: [], suggestions: [],
  });
  return c.json({ ok: true, data });
});

app.post('/context', async (c) => {
  const body = await c.req.json();
  const data: ContextRecovery = {
    last_generated: new Date().toISOString(),
    briefing: body.briefing || '',
    hot_context: body.hot_context || [],
    warnings: body.warnings || [],
    suggestions: body.suggestions || [],
  };
  writeJSON('brain/context-recovery.json', data);
  return c.json({ ok: true, data });
});

export default app;
