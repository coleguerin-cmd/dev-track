import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const actionTools: ToolModule = {
  domain: 'actions',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_actions',
        description: 'List all tracked actions/features with their health status',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Listing actions',
      execute: async () => {
        const store = getStore();
        return { actions: store.actions.actions || [], total: (store.actions.actions || []).length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_action',
        description: 'Create a new tracked action/feature with health monitoring',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Unique action ID (kebab-case)' },
          name: { type: 'string', description: 'Action name' },
          description: { type: 'string', description: 'What this action/feature does' },
          health: { type: 'string', enum: ['green', 'yellow', 'red', 'unknown'], description: 'Current health status' },
          owner: { type: 'string', description: 'Who owns this action' },
          playbook: { type: 'string', description: 'Path to playbook/runbook file' },
        }, required: ['id', 'name', 'description'] },
      }},
      label: 'Creating action',
      execute: async (args) => {
        const store = getStore();
        const action = {
          id: args.id, name: args.name, description: args.description,
          health: args.health || 'unknown', owner: args.owner || null,
          playbook: args.playbook || null,
          pass_rate: { passed: 0, failed: 0, total: 0 },
          open_issues: 0, last_run: null,
          created: new Date().toISOString().split('T')[0],
        };
        store.actions.actions.push(action as any);
        store.saveActions();
        return { created: action };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_action',
        description: 'Update an action (health, description, owner, etc.)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Action ID' },
          health: { type: 'string', enum: ['green', 'yellow', 'red', 'unknown'] },
          description: { type: 'string' },
          name: { type: 'string' },
          owner: { type: 'string' },
          open_issues: { type: 'number' },
        }, required: ['id'] },
      }},
      label: 'Updating action',
      execute: async (args) => {
        const store = getStore();
        const action = (store.actions.actions || []).find((a: any) => a.id === args.id);
        if (!action) return { error: `Action ${args.id} not found` };
        for (const key of ['health', 'description', 'name', 'owner', 'open_issues']) {
          if (args[key] !== undefined) (action as any)[key] = args[key];
        }
        store.saveActions();
        return { updated: action };
      },
    },
  ],
};
