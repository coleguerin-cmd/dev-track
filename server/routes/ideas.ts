import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import type { Idea, IdeaStatus, IdeaCategory } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/ideas
app.get('/', (c) => {
  const store = getStore();
  const status = c.req.query('status') as IdeaStatus | undefined;
  const category = c.req.query('category') as IdeaCategory | undefined;
  const priority = c.req.query('priority');

  let ideas = store.ideas.ideas;
  if (status) ideas = ideas.filter(i => i.status === status);
  if (category) ideas = ideas.filter(i => i.category === category);
  if (priority) ideas = ideas.filter(i => i.priority === priority);

  return c.json({ ok: true, data: { ideas, total: store.ideas.ideas.length } });
});

// GET /api/v1/ideas/:id
app.get('/:id', (c) => {
  const store = getStore();
  const idea = store.ideas.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);
  return c.json({ ok: true, data: idea });
});

// POST /api/v1/ideas
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();
  const now = new Date().toISOString().split('T')[0];

  const idea: Idea = {
    id: `IDEA-${String(store.ideas.next_id).padStart(3, '0')}`,
    title: body.title,
    description: body.description || '',
    category: body.category || 'feature',
    status: body.status || 'captured',
    priority: body.priority || 'P2',
    source: body.source || 'conversation',
    related_ideas: body.related_ideas || [],
    promoted_to: null,
    pros: body.pros || [],
    cons: body.cons || [],
    open_questions: body.open_questions || [],
    notes: body.notes || null,
    tags: body.tags || [],
    created: now,
    updated: now,
  };

  store.ideas.ideas.push(idea);
  store.ideas.next_id++;
  store.saveIdeas();

  store.addActivity({
    type: 'idea_captured',
    entity_type: 'idea',
    entity_id: idea.id,
    title: `Idea captured: ${idea.title}`,
    actor: 'user',
    metadata: { category: idea.category, source: idea.source },
  });

  broadcast({ type: 'idea_updated', data: idea, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: idea }, 201);
});

// PATCH /api/v1/ideas/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const idea = store.ideas.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);

  const body = await c.req.json();
  if (body.title !== undefined) idea.title = body.title;
  if (body.description !== undefined) idea.description = body.description;
  if (body.category !== undefined) idea.category = body.category;
  if (body.status !== undefined) idea.status = body.status;
  if (body.priority !== undefined) idea.priority = body.priority;
  if (body.pros !== undefined) idea.pros = body.pros;
  if (body.cons !== undefined) idea.cons = body.cons;
  if (body.open_questions !== undefined) idea.open_questions = body.open_questions;
  if (body.notes !== undefined) idea.notes = body.notes;
  if (body.related_ideas !== undefined) idea.related_ideas = body.related_ideas;
  if (body.tags !== undefined) idea.tags = body.tags;
  idea.updated = new Date().toISOString().split('T')[0];

  store.saveIdeas();
  broadcast({ type: 'idea_updated', data: idea, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: idea });
});

// POST /api/v1/ideas/:id/promote — Promote idea to roadmap item
app.post('/:id/promote', async (c) => {
  const store = getStore();
  const idea = store.ideas.ideas.find(i => i.id === c.req.param('id'));
  if (!idea) return c.json({ ok: false, error: 'Idea not found' }, 404);

  const body = await c.req.json();
  idea.status = 'promoted';
  idea.promoted_to = body.roadmap_id || body.backlog_id || idea.id;
  idea.updated = new Date().toISOString().split('T')[0];

  store.saveIdeas();

  store.addActivity({
    type: 'idea_promoted',
    entity_type: 'idea',
    entity_id: idea.id,
    title: `Idea promoted: ${idea.title}`,
    actor: 'user',
    metadata: { promoted_to: idea.promoted_to },
  });

  broadcast({ type: 'idea_updated', data: idea, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: idea });
});

export default app;
