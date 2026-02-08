import { getStore } from '../../store.js';
import { getDataDir, getProjectRoot, getProjectName, getProjectConfig, loadRegistry } from '../../project-config.js';
import type { ToolModule } from './types.js';

export const configTools: ToolModule = {
  domain: 'config',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_project_config',
        description: 'Get project configuration (name, settings, developer preferences)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Reading project config',
      execute: async () => ({
        config: getStore().config,
        project_name: getProjectName(),
        project_id: getProjectConfig()?.projectId,
        data_dir: getDataDir(),
        project_root: getProjectRoot(),
      }),
    },
    {
      definition: { type: 'function', function: {
        name: 'update_project_config',
        description: 'Update project configuration (name, description, settings)',
        parameters: { type: 'object', properties: {
          project: { type: 'string', description: 'Project name' },
          description: { type: 'string', description: 'Project description' },
          max_now_items: { type: 'number', description: 'Max items in Now horizon' },
        }},
      }},
      label: 'Updating project config',
      execute: async (args) => {
        const store = getStore();
        if (args.project) store.config.project = args.project;
        if (args.description) store.config.description = args.description;
        if (args.max_now_items) store.config.settings.max_now_items = args.max_now_items;
        store.saveConfig();
        return { updated: store.config };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'list_registered_projects',
        description: 'List all dev-track projects registered on this machine',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Listing registered projects',
      execute: async () => {
        const registry = loadRegistry();
        return { projects: registry.projects, total: registry.projects.length };
      },
    },
  ],
};
