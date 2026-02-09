import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const backlogTools: ToolModule = {
  domain: 'backlog',
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'list_backlog',
          description: 'List roadmap items, optionally filtered by horizon, status, epic, or category. Use summary=true for lightweight scanning (returns id+title+status+updated+priority only — 90% fewer tokens). Use filters to avoid loading shipped/completed items unnecessarily.',
          parameters: {
            type: 'object',
            properties: {
              horizon: { type: 'string', enum: ['now', 'next', 'later', 'shipped'], description: 'Filter by horizon' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Filter by status' },
              epic_id: { type: 'string', description: 'Filter by epic ID' },
              category: { type: 'string', description: 'Filter by category' },
              summary: { type: 'boolean', description: 'If true, return only id, title, status, updated, priority, horizon, epic_id (much fewer tokens)' },
            },
          },
        },
      },
      label: 'Listing backlog items',
      execute: async (args) => {
        const store = getStore();
        let items = store.backlog.items || [];
        if (args.horizon) items = items.filter((i: any) => i.horizon === args.horizon);
        if (args.status) items = items.filter((i: any) => i.status === args.status);
        if (args.epic_id) items = items.filter((i: any) => i.epic_id === args.epic_id);
        if (args.category) items = items.filter((i: any) => i.category === args.category);
        if (args.summary) {
          const summaryItems = items.map((i: any) => ({
            id: i.id, title: i.title, status: i.status, updated: i.updated,
            priority: i.priority, horizon: i.horizon, epic_id: i.epic_id, size: i.size,
          }));
          return { items: summaryItems, total: summaryItems.length, mode: 'summary' };
        }
        return { items, total: items.length };
      },
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'create_backlog_item',
          description: 'Create a new roadmap item. Assign to an epic with epic_id for proper grouping.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique kebab-case ID' },
              title: { type: 'string', description: 'Item title' },
              summary: { type: 'string', description: 'Detailed description' },
              type: { type: 'string', enum: ['feature', 'enhancement', 'infrastructure', 'research', 'chore'], description: 'Item type (default: feature)' },
              horizon: { type: 'string', enum: ['now', 'next', 'later'], description: 'Priority horizon' },
              priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Priority (default: P2)' },
              size: { type: 'string', enum: ['S', 'M', 'L', 'XL'], description: 'Estimated size' },
              category: { type: 'string', description: 'Category (core, ui, feature, etc.)' },
              epic_id: { type: 'string', description: 'Epic this item belongs to' },
              milestone_id: { type: 'string', description: 'Milestone this item targets' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
              depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of items this depends on' },
              blocked_by: { type: 'array', items: { type: 'string' }, description: 'IDs of items blocking this' },
              related_issues: { type: 'array', items: { type: 'string' }, description: 'Related issue IDs' },
              spawned_from: { type: 'string', description: 'Idea ID if promoted from ideas (e.g., IDEA-052)' },
              acceptance_criteria: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria' },
              ai_notes: { type: 'string', description: 'AI observations about this item' },
              estimated_sessions: { type: 'number', description: 'Estimated sessions to complete' },
            },
            required: ['id', 'title', 'summary', 'horizon', 'size'],
          },
        },
      },
      label: 'Creating backlog item',
      execute: async (args) => {
        const store = getStore();
        // Dedup check — prevent duplicates by ID or similar title
        const existingById = (store.backlog.items || []).find((i: any) => i.id === args.id);
        if (existingById) {
          return { duplicate: true, existing: existingById, message: `Backlog item with ID "${args.id}" already exists. Use update_backlog_item to modify it.` };
        }
        const normTitle = args.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        const existingByTitle = (store.backlog.items || []).find((i: any) => {
          if (i.status === 'completed' || i.status === 'cancelled') return false;
          const existNorm = i.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          if (existNorm === normTitle) return true;
          const words = normTitle.split(' ').filter(Boolean);
          const existWords = existNorm.split(' ').filter(Boolean);
          const overlap = words.filter((w: string) => existWords.includes(w)).length;
          return words.length > 2 && overlap / Math.max(words.length, existWords.length) > 0.7;
        });
        if (existingByTitle) {
          return { duplicate: true, existing: existingByTitle, message: `Similar backlog item already exists: "${existingByTitle.id}" "${existingByTitle.title}". Use update_backlog_item to modify it.` };
        }
        const today = new Date().toISOString().split('T')[0];
        const item = {
          id: args.id, title: args.title, summary: args.summary,
          type: args.type || 'feature',
          horizon: args.horizon || 'later',
          priority: args.priority || 'P2',
          size: args.size || 'M',
          status: 'pending', category: args.category || 'feature',
          epic_id: args.epic_id || null,
          milestone_id: args.milestone_id || null,
          depends_on: args.depends_on || [],
          blocked_by: args.blocked_by || [],
          related_issues: args.related_issues || [],
          spawned_from: args.spawned_from || null,
          assignee: null,
          tags: args.tags || [],
          design_doc: null,
          acceptance_criteria: args.acceptance_criteria || [],
          created: today, updated: today, started: null, completed: null,
          ai_notes: args.ai_notes || null,
          estimated_sessions: args.estimated_sessions || null,
        };
        store.backlog.items.push(item as any);
        store.saveBacklog();
        return { created: item };
      },
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'update_backlog_item',
          description: 'Update a roadmap item — status, horizon, epic assignment, priority, and all other fields',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Item ID to update' },
              title: { type: 'string' },
              summary: { type: 'string' },
              type: { type: 'string', enum: ['feature', 'enhancement', 'infrastructure', 'research', 'chore'] },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
              horizon: { type: 'string', enum: ['now', 'next', 'later', 'shipped'] },
              priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
              size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
              category: { type: 'string' },
              epic_id: { type: 'string', description: 'Epic ID to assign to (or null to unassign)' },
              milestone_id: { type: 'string', description: 'Milestone ID (or null to unassign)' },
              tags: { type: 'array', items: { type: 'string' } },
              depends_on: { type: 'array', items: { type: 'string' } },
              blocked_by: { type: 'array', items: { type: 'string' } },
              related_issues: { type: 'array', items: { type: 'string' } },
              spawned_from: { type: 'string' },
              acceptance_criteria: { type: 'array', items: { type: 'string' } },
              ai_notes: { type: 'string' },
              estimated_sessions: { type: 'number' },
            },
            required: ['id'],
          },
        },
      },
      label: 'Updating backlog item',
      execute: async (args) => {
        const store = getStore();
        const item = (store.backlog.items || []).find((i: any) => i.id === args.id);
        if (!item) return { error: `Item ${args.id} not found` };
        for (const key of ['title', 'summary', 'type', 'status', 'horizon', 'priority', 'size', 'category', 'epic_id', 'milestone_id', 'tags', 'depends_on', 'blocked_by', 'related_issues', 'spawned_from', 'acceptance_criteria', 'ai_notes', 'estimated_sessions']) {
          if (args[key] !== undefined) (item as any)[key] = args[key];
        }
        (item as any).updated = new Date().toISOString().split('T')[0];
        if (args.status === 'completed') {
          (item as any).completed = new Date().toISOString().split('T')[0];
        }
        // State transition validation: completed/cancelled items must be in shipped horizon
        const status = (item as any).status;
        const horizon = (item as any).horizon;
        if ((status === 'completed' || status === 'cancelled') && horizon !== 'shipped') {
          (item as any).horizon = 'shipped';
        }
        // Prevent moving shipped items back to active horizons without reopening
        if (horizon === 'shipped' && args.horizon && args.horizon !== 'shipped' && status === 'completed') {
          return { error: `Cannot move completed item "${item.id}" to ${args.horizon}. Change status first (e.g., to in_progress) to reopen it.` };
        }
        store.saveBacklog();
        return { updated: item };
      },
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'delete_backlog_item',
          description: 'Delete a backlog item by ID',
          parameters: { type: 'object', properties: { id: { type: 'string', description: 'Item ID to delete' } }, required: ['id'] },
        },
      },
      label: 'Deleting backlog item',
      execute: async (args) => {
        const store = getStore();
        const idx = store.backlog.items.findIndex((i: any) => i.id === args.id);
        if (idx === -1) return { error: `Item ${args.id} not found` };
        const removed = store.backlog.items.splice(idx, 1);
        store.saveBacklog();
        return { deleted: removed[0] };
      },
    },
  ],
};
