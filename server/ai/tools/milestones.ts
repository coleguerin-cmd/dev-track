import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const milestoneTools: ToolModule = {
  domain: 'milestones',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_milestones',
        description: 'List all milestones with progress tracking. Milestones represent time-bound delivery targets containing epics and roadmap items.',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'missed'], description: 'Filter by status' },
        }},
      }},
      label: 'Listing milestones',
      execute: async (args) => {
        const store = getStore();
        let milestones = store.milestones.milestones || [];
        if (args.status) milestones = milestones.filter((m: any) => m.status === args.status);
        // Enrich with computed fields
        const items = store.backlog.items || [];
        const issues = store.issues?.issues || [];
        const enriched = milestones.map((ms: any) => {
          const msItems = items.filter((i: any) => i.milestone_id === ms.id);
          const msEpics = (store.epics.epics || []).filter((e: any) => e.milestone_id === ms.id);
          // Also include items from epics assigned to this milestone
          const epicIds = new Set(msEpics.map((e: any) => e.id));
          const epicItems = items.filter((i: any) => i.epic_id && epicIds.has(i.epic_id) && i.milestone_id !== ms.id);
          const allItems = [...msItems, ...epicItems];
          const blocking = issues.filter((iss: any) =>
            iss.status !== 'resolved' && iss.status !== 'wont_fix' &&
            iss.roadmap_item && allItems.some((i: any) => i.id === iss.roadmap_item)
          );
          return {
            ...ms,
            total_items: allItems.length,
            completed_items: allItems.filter((i: any) => i.status === 'completed').length,
            progress_pct: allItems.length > 0 ? Math.round((allItems.filter((i: any) => i.status === 'completed').length / allItems.length) * 100) : 0,
            blocking_issues: blocking.length,
            epics: msEpics.map((e: any) => ({ id: e.id, title: e.title, status: e.status })),
          };
        });
        return { milestones: enriched, total: enriched.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_milestone',
        description: 'Create a new milestone (time-bound delivery target)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Unique kebab-case ID (e.g., "v0.3-alpha")' },
          title: { type: 'string', description: 'Milestone title' },
          description: { type: 'string', description: 'What this milestone delivers' },
          version: { type: 'string', description: 'Version tag (e.g., "0.3.0")' },
          target_date: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'missed'] },
          tags: { type: 'array', items: { type: 'string' } },
        }, required: ['id', 'title', 'description'] },
      }},
      label: 'Creating milestone',
      execute: async (args) => {
        const store = getStore();
        const existing = (store.milestones.milestones || []).find((m: any) => m.id === args.id);
        if (existing) return { duplicate: true, existing, message: `Milestone "${args.id}" already exists.` };
        const now = new Date().toISOString().split('T')[0];
        const milestone = {
          id: args.id, title: args.title, description: args.description,
          version: args.version || null,
          status: args.status || 'planning',
          target_date: args.target_date || null,
          completed_date: null,
          total_items: 0, completed_items: 0, progress_pct: 0, blocking_issues: 0,
          tags: args.tags || [],
          created: now, updated: now,
          ai_prediction: null,
        };
        store.milestones.milestones.push(milestone as any);
        store.saveMilestones();
        return { created: milestone };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_milestone',
        description: 'Update an existing milestone',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Milestone ID to update' },
          title: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
          status: { type: 'string', enum: ['planning', 'active', 'completed', 'missed'] },
          target_date: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          ai_prediction: { type: 'string', description: 'AI prediction about timeline/risk' },
        }, required: ['id'] },
      }},
      label: 'Updating milestone',
      execute: async (args) => {
        const store = getStore();
        const ms = (store.milestones.milestones || []).find((m: any) => m.id === args.id);
        if (!ms) return { error: `Milestone "${args.id}" not found` };
        for (const key of ['title', 'description', 'version', 'status', 'target_date', 'tags', 'ai_prediction']) {
          if (args[key] !== undefined) (ms as any)[key] = args[key];
        }
        (ms as any).updated = new Date().toISOString().split('T')[0];
        if (args.status === 'completed') (ms as any).completed_date = new Date().toISOString().split('T')[0];
        store.saveMilestones();
        return { updated: ms };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'delete_milestone',
        description: 'Delete a milestone. Does NOT delete associated epics or items.',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Milestone ID to delete' },
        }, required: ['id'] },
      }},
      label: 'Deleting milestone',
      execute: async (args) => {
        const store = getStore();
        const idx = (store.milestones.milestones || []).findIndex((m: any) => m.id === args.id);
        if (idx === -1) return { error: `Milestone "${args.id}" not found` };
        const removed = store.milestones.milestones.splice(idx, 1);
        store.saveMilestones();
        return { deleted: removed[0] };
      },
    },
  ],
};
