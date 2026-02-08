import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const stateTools: ToolModule = {
  domain: 'state',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_project_state',
        description: 'Get the current project state including overall health and system statuses',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Checking project state',
      execute: async () => {
        const store = getStore();
        return {
          ...store.state,
          systems: store.systems.systems.map(s => ({
            id: s.id, name: s.name, status: s.status,
            health_score: s.health_score, description: s.description,
          })),
        };
      },
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
        description: 'Update project state — overall health, summary, or a specific system',
        parameters: { type: 'object', properties: {
          overall_health: { type: 'number', description: 'Overall health percentage (0-100)' },
          summary: { type: 'string', description: 'Updated project summary' },
          system_id: { type: 'string', description: 'System ID to update (e.g., "server", "web-ui")' },
          system_health_score: { type: 'number', description: 'New health score for the system (0-100)' },
          system_description: { type: 'string', description: 'Updated description for the system' },
          system_status: { type: 'string', enum: ['healthy', 'degraded', 'critical', 'unknown', 'planned'] },
        }},
      }},
      label: 'Updating project state',
      execute: async (args) => {
        const store = getStore();
        if (args.overall_health !== undefined) store.state.overall_health = args.overall_health;
        if (args.summary) store.state.summary = args.summary;
        if (args.system_id) {
          const sys = store.systems.systems.find(s => s.id === args.system_id);
          if (sys) {
            if (args.system_health_score !== undefined) sys.health_score = args.system_health_score;
            if (args.system_description) sys.description = args.system_description;
            if (args.system_status) sys.status = args.system_status as any;
            sys.updated = new Date().toISOString().split('T')[0];
            sys.last_assessed = sys.updated;
          }
          store.saveSystems();
        }
        store.state.last_updated = new Date().toISOString().split('T')[0];
        store.saveState();
        return { updated: store.state };
      },
    },
  ],
};
