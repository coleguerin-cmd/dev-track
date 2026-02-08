import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const epicTools: ToolModule = {
  domain: 'epics',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_epics',
        description: 'List all epics with progress, item counts, and status. Epics group roadmap items into strategic initiatives.',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'cancelled'], description: 'Filter by status' },
          milestone_id: { type: 'string', description: 'Filter by milestone' },
        }},
      }},
      label: 'Listing epics',
      execute: async (args) => {
        const store = getStore();
        let epics = store.epics.epics || [];
        if (args.status) epics = epics.filter((e: any) => e.status === args.status);
        if (args.milestone_id) epics = epics.filter((e: any) => e.milestone_id === args.milestone_id);
        // Enrich with child item info
        const items = store.backlog.items || [];
        const enriched = epics.map((epic: any) => {
          const children = items.filter((i: any) => i.epic_id === epic.id);
          const openIssues = (store.issues?.issues || []).filter((iss: any) => {
            if (iss.status === 'resolved' || iss.status === 'wont_fix') return false;
            const rm = iss.roadmap_item;
            return rm && children.some((c: any) => c.id === rm);
          });
          return {
            ...epic,
            item_count: children.length,
            completed_count: children.filter((i: any) => i.status === 'completed').length,
            progress_pct: children.length > 0 ? Math.round((children.filter((i: any) => i.status === 'completed').length / children.length) * 100) : 0,
            open_issues: openIssues.length,
            child_items: children.map((i: any) => ({ id: i.id, title: i.title, status: i.status, horizon: i.horizon })),
          };
        });
        return { epics: enriched, total: enriched.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_epic',
        description: 'Create a new epic to group related roadmap items under a strategic initiative',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Unique kebab-case ID (e.g., "ai-intelligence-engine")' },
          title: { type: 'string', description: 'Epic title' },
          description: { type: 'string', description: 'What this epic encompasses' },
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'cancelled'], description: 'Status (default: planning)' },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Priority (default: P1)' },
          color: { type: 'string', description: 'Hex color for UI display (default: #6366f1)' },
          milestone_id: { type: 'string', description: 'Optional milestone this epic belongs to' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        }, required: ['id', 'title', 'description'] },
      }},
      label: 'Creating epic',
      execute: async (args) => {
        const store = getStore();
        const existing = (store.epics.epics || []).find((e: any) => e.id === args.id);
        if (existing) return { duplicate: true, existing, message: `Epic "${args.id}" already exists.` };
        const now = new Date().toISOString().split('T')[0];
        const epic = {
          id: args.id, title: args.title, description: args.description,
          status: args.status || 'planning',
          priority: args.priority || 'P1',
          color: args.color || '#6366f1',
          milestone_id: args.milestone_id || null,
          item_count: 0, completed_count: 0, progress_pct: 0,
          tags: args.tags || [],
          created: now, updated: now, completed: null,
          ai_summary: null,
        };
        store.epics.epics.push(epic as any);
        store.saveEpics();
        return { created: epic };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_epic',
        description: 'Update an existing epic (title, description, status, priority, color, milestone)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Epic ID to update' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'cancelled'] },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          color: { type: 'string' },
          milestone_id: { type: 'string', description: 'Milestone ID or null to unset' },
          tags: { type: 'array', items: { type: 'string' } },
          ai_summary: { type: 'string', description: 'AI-generated summary of the epic' },
        }, required: ['id'] },
      }},
      label: 'Updating epic',
      execute: async (args) => {
        const store = getStore();
        const epic = (store.epics.epics || []).find((e: any) => e.id === args.id);
        if (!epic) return { error: `Epic "${args.id}" not found` };
        for (const key of ['title', 'description', 'status', 'priority', 'color', 'milestone_id', 'tags', 'ai_summary']) {
          if (args[key] !== undefined) (epic as any)[key] = args[key];
        }
        (epic as any).updated = new Date().toISOString().split('T')[0];
        if (args.status === 'completed') (epic as any).completed = new Date().toISOString().split('T')[0];
        store.saveEpics();
        return { updated: epic };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'delete_epic',
        description: 'Delete an epic. Does NOT delete child roadmap items — they become ungrouped.',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Epic ID to delete' },
        }, required: ['id'] },
      }},
      label: 'Deleting epic',
      execute: async (args) => {
        const store = getStore();
        const idx = (store.epics.epics || []).findIndex((e: any) => e.id === args.id);
        if (idx === -1) return { error: `Epic "${args.id}" not found` };
        const removed = store.epics.epics.splice(idx, 1);
        // Unset epic_id on child items
        for (const item of store.backlog.items) {
          if ((item as any).epic_id === args.id) (item as any).epic_id = null;
        }
        store.saveEpics();
        store.saveBacklog();
        return { deleted: removed[0] };
      },
    },
  ],
};
