import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { broadcast } from '../ws.js';
import type { Idea, IdeasData, IdeaStatus, IdeaCategory } from '../../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

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

// GET /api/v1/ideas
app.get('/', (c) => {
  const data = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
  const status = c.req.query('status') as IdeaStatus | undefined;
  const category = c.req.query('category') as IdeaCategory | undefined;

  let ideas = data.ideas;
  if (status) ideas = ideas.filter(i => i.status === status);
  if (category) ideas = ideas.filter(i => i.category === category);

  return c.json({ ok: true, data: { ideas, total: data.ideas.length } });
});

// GET /api/v1/ideas/:id
app.get('/:id', (c) => {
  const data = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
  const idea = data.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);
  return c.json({ ok: true, data: idea });
});

// POST /api/v1/ideas
app.post('/', async (c) => {
  const data = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
  const body = await c.req.json();
  const now = new Date().toISOString().split('T')[0];

  const idea: Idea = {
    id: `IDEA-${String(data.next_id).padStart(3, '0')}`,
    title: body.title,
    description: body.description || '',
    category: body.category || 'feature',
    status: body.status || 'captured',
    source: body.source || 'conversation',
    related_ideas: body.related_ideas || [],
    promoted_to: null,
    pros: body.pros || [],
    cons: body.cons || [],
    open_questions: body.open_questions || [],
    notes: body.notes || '',
    created: now,
    updated: now,
  };

  data.ideas.push(idea);
  data.next_id++;
  writeJSON('ideas/items.json', data);

  broadcast({ type: 'file_changed', data: { type: 'idea_captured', idea }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: idea }, 201);
});

// PATCH /api/v1/ideas/:id
app.patch('/:id', async (c) => {
  const data = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
  const idea = data.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) idea.title = body.title;
  if (body.description !== undefined) idea.description = body.description;
  if (body.category !== undefined) idea.category = body.category;
  if (body.status !== undefined) idea.status = body.status;
  if (body.pros !== undefined) idea.pros = body.pros;
  if (body.cons !== undefined) idea.cons = body.cons;
  if (body.open_questions !== undefined) idea.open_questions = body.open_questions;
  if (body.notes !== undefined) idea.notes = body.notes;
  if (body.related_ideas !== undefined) idea.related_ideas = body.related_ideas;
  idea.updated = new Date().toISOString().split('T')[0];

  writeJSON('ideas/items.json', data);
  return c.json({ ok: true, data: idea });
});

// POST /api/v1/ideas/:id/promote — Promote idea to backlog item
app.post('/:id/promote', async (c) => {
  const data = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
  const idea = data.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);

  const body = await c.req.json();
  idea.status = 'promoted';
  idea.promoted_to = body.backlog_id || idea.id;
  idea.updated = new Date().toISOString().split('T')[0];

  writeJSON('ideas/items.json', data);
  broadcast({ type: 'file_changed', data: { type: 'idea_promoted', idea }, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: idea });
});

export default app;
