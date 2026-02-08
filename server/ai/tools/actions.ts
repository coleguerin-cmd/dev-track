import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

// v2: Actions are deprecated. These tools now proxy to Systems.
export const actionTools: ToolModule = {
  domain: 'systems',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_systems',
        description: 'List all systems with their health status and scores',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'critical', 'unknown', 'planned'], description: 'Filter by status' },
        }},
      }},
      label: 'Listing systems',
      execute: async (args) => {
        const store = getStore();
        let systems = store.systems.systems;
        if (args.status) systems = systems.filter((s: any) => s.status === args.status);
        return { systems, total: systems.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_system',
        description: 'Update a system\'s health, description, status, or tech stack',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'System ID' },
          status: { type: 'string', enum: ['healthy', 'degraded', 'critical', 'unknown', 'planned'] },
          health_score: { type: 'number', description: 'Health score 0-100' },
          description: { type: 'string' },
          name: { type: 'string' },
          tech_stack: { type: 'array', items: { type: 'string' } },
        }, required: ['id'] },
      }},
      label: 'Updating system',
      execute: async (args) => {
        const store = getStore();
        const system = store.systems.systems.find((s: any) => s.id === args.id);
        if (!system) return { error: `System ${args.id} not found` };
        for (const key of ['status', 'health_score', 'description', 'name', 'tech_stack']) {
          if (args[key] !== undefined) (system as any)[key] = args[key];
        }
        system.updated = new Date().toISOString().split('T')[0];
        system.last_assessed = system.updated;
        store.saveSystems();
        return { updated: system };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_system',
        description: 'Create a new system entry for the architecture map',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Unique system ID (kebab-case)' },
          name: { type: 'string', description: 'Display name' },
          description: { type: 'string', description: 'What this system does' },
          status: { type: 'string', enum: ['healthy', 'degraded', 'critical', 'unknown', 'planned'] },
          health_score: { type: 'number', description: 'Initial health score 0-100' },
          tech_stack: { type: 'array', items: { type: 'string' }, description: 'Technologies used' },
        }, required: ['id', 'name', 'description'] },
      }},
      label: 'Creating system',
      execute: async (args) => {
        const store = getStore();
        const now = new Date().toISOString().split('T')[0];
        const system = {
          id: args.id, name: args.name, description: args.description,
          status: args.status || 'unknown',
          health_score: args.health_score ?? 50,
          health_signals: [], last_assessed: now,
          owner: null, tech_stack: args.tech_stack || [],
          modules: [], dependencies: [], dependents: [],
          open_issues: 0, recent_commits: 0, test_coverage: null,
          tags: [], created: now, updated: now,
        };
        store.systems.systems.push(system as any);
        store.saveSystems();
        return { created: system };
      },
    },
  ],
};
