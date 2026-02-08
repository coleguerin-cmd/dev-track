import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const stateTools: ToolModule = {
  domain: 'state',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_project_state',
        description: 'Get the current project state including health ratings for all systems',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Checking project state',
      execute: async () => getStore().state,
    },
    {
      definition: { type: 'function', function: {
        name: 'get_quick_status',
        description: 'Get a quick one-line status summary of the project',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Getting quick status',
      execute: async () => ({ status: getStore().getQuickStatusLine() }),
    },
    {
      definition: { type: 'function', function: {
        name: 'update_project_state',
        description: 'Update project state — overall health, summary, or a specific system rating',
        parameters: { type: 'object', properties: {
          overall_completion: { type: 'number', description: 'Overall health percentage (0-100)' },
          summary: { type: 'string', description: 'Updated project summary' },
          system_id: { type: 'string', description: 'System ID to update (e.g., "server", "web-ui")' },
          system_rating: { type: 'number', description: 'New rating for the system (1-10)' },
          system_notes: { type: 'string', description: 'Updated notes for the system' },
          system_status: { type: 'string', description: 'New status for the system' },
        }},
      }},
      label: 'Updating project state',
      execute: async (args) => {
        const store = getStore();
        if (args.overall_completion !== undefined) store.state.overall_completion = args.overall_completion;
        if (args.summary) store.state.summary = args.summary;
        if (args.system_id) {
          const sys = store.state.systems.find((s: any) => s.id === args.system_id);
          if (sys) {
            if (args.system_rating !== undefined) (sys as any).rating = args.system_rating;
            if (args.system_notes) (sys as any).notes = args.system_notes;
            if (args.system_status) (sys as any).status = args.system_status;
          } else {
            // Create new system entry
            store.state.systems.push({
              id: args.system_id, name: args.system_id,
              status: args.system_status || 'unknown',
              rating: args.system_rating || 5,
              notes: args.system_notes || '',
            } as any);
          }
        }
        store.state.last_updated = new Date().toISOString().split('T')[0];
        store.saveState();
        return { updated: store.state };
      },
    },
  ],
};
