import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

function readIdeas() { const store = getStore(); return store.ideas; }
function writeIdeas(_data: any) { const store = getStore(); store.saveIdeas(); }

function normalizeTitle(t: string) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }

function findSimilarIdea(ideas: any[], title: string) {
  const norm = normalizeTitle(title);
  if (!norm) return null;
  for (const idea of ideas) {
    if (idea.status === 'dismissed') continue;
    const existNorm = normalizeTitle(idea.title);
    // Exact match
    if (existNorm === norm) return idea;
    // Containment (one is a substring of the other)
    if (existNorm.includes(norm) || norm.includes(existNorm)) {
      if (Math.min(existNorm.length, norm.length) / Math.max(existNorm.length, norm.length) > 0.5) return idea;
    }
    // Word overlap: if 70%+ words match
    const normWords = norm.split(' ').filter(Boolean);
    const existWords = existNorm.split(' ').filter(Boolean);
    const overlap = normWords.filter(w => existWords.includes(w)).length;
    if (normWords.length > 2 && overlap / Math.max(normWords.length, existWords.length) > 0.7) return idea;
  }
  return null;
}

export const ideaTools: ToolModule = {
  domain: 'ideas',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_ideas',
        description: 'List all captured ideas, optionally filtered by status or category',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['captured', 'exploring', 'validated', 'promoted', 'dismissed'] },
          category: { type: 'string', enum: ['feature', 'architecture', 'ux', 'business', 'integration', 'core', 'security'] },
        }},
      }},
      label: 'Listing ideas',
      execute: async (args) => {
        const data = readIdeas();
        let ideas = data.ideas || [];
        if (args.status) ideas = ideas.filter((i: any) => i.status === args.status);
        if (args.category) ideas = ideas.filter((i: any) => i.category === args.category);
        return { ideas, total: ideas.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'capture_idea',
        description: 'Capture a new idea with description, pros, cons, and open questions',
        parameters: { type: 'object', properties: {
          title: { type: 'string' }, description: { type: 'string' },
          category: { type: 'string', enum: ['feature', 'architecture', 'ux', 'business', 'integration', 'core', 'security'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
        }, required: ['title', 'description', 'category'] },
      }},
      label: 'Capturing idea',
      execute: async (args) => {
        const data = readIdeas();
        // Dedup check — prevent duplicates
        const existing = findSimilarIdea(data.ideas || [], args.title);
        if (existing) {
          return { duplicate: true, existing, message: `Similar idea already exists: ${existing.id} "${existing.title}". Use update_idea to modify it instead.` };
        }
        const today = new Date().toISOString().split('T')[0];
        const idea = {
          id: `IDEA-${String(data.next_id).padStart(3, '0')}`,
          title: args.title, description: args.description,
          category: args.category || 'feature', status: 'captured',
          priority: args.priority || 'medium',
          source: `chat ${today}`, related_ideas: [], promoted_to: null,
          pros: args.pros || [], cons: args.cons || [],
          open_questions: args.open_questions || [], notes: null,
          created: today, updated: today,
        };
        data.ideas.push(idea);
        data.next_id++;
        writeIdeas(data);
        return { created: idea };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_idea',
        description: 'Update an existing idea (status, priority, notes, pros, cons, etc.)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Idea ID (e.g., IDEA-015)' },
          status: { type: 'string', enum: ['captured', 'exploring', 'validated', 'promoted', 'dismissed'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          notes: { type: 'string' },
          promoted_to: { type: 'string', description: 'Backlog item ID if promoted' },
        }, required: ['id'] },
      }},
      label: 'Updating idea',
      execute: async (args) => {
        const data = readIdeas();
        const idea = data.ideas.find((i: any) => i.id === args.id);
        if (!idea) return { error: `Idea ${args.id} not found` };
        for (const key of ['status', 'priority', 'notes', 'promoted_to']) {
          if (args[key] !== undefined) idea[key] = args[key];
        }
        idea.updated = new Date().toISOString().split('T')[0];
        writeIdeas(data);
        return { updated: idea };
      },
    },
  ],
};
