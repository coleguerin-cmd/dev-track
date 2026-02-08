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
          description: 'List all backlog items, optionally filtered by horizon (now/next/later) or status',
          parameters: {
            type: 'object',
            properties: {
              horizon: { type: 'string', enum: ['now', 'next', 'later'], description: 'Filter by horizon' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Filter by status' },
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
        return { items, total: items.length };
      },
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'create_backlog_item',
          description: 'Create a new backlog item',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique kebab-case ID' },
              title: { type: 'string', description: 'Item title' },
              summary: { type: 'string', description: 'Detailed description' },
              horizon: { type: 'string', enum: ['now', 'next', 'later'], description: 'Priority horizon' },
              size: { type: 'string', enum: ['S', 'M', 'L', 'XL'], description: 'Estimated size' },
              category: { type: 'string', description: 'Category (core, ui, feature, etc.)' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
              depends_on: { type: 'array', items: { type: 'string' }, description: 'IDs of items this depends on' },
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
          horizon: args.horizon || 'later', size: args.size || 'M',
          status: 'pending', category: args.category || 'feature',
          design_doc: null, depends_on: args.depends_on || [], assignee: null,
          created: today, updated: today, completed: null,
          tags: args.tags || [],
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
          description: 'Update an existing backlog item (status, horizon, size, title, summary, etc.)',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Item ID to update' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
              horizon: { type: 'string', enum: ['now', 'next', 'later'] },
              size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
              summary: { type: 'string' },
              title: { type: 'string' },
              category: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
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
        for (const key of ['status', 'horizon', 'size', 'summary', 'title', 'category', 'tags']) {
          if (args[key] !== undefined) (item as any)[key] = args[key];
        }
        (item as any).updated = new Date().toISOString().split('T')[0];
        if (args.status === 'completed') (item as any).completed = new Date().toISOString().split('T')[0];
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
