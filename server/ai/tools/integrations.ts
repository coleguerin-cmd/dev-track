import type { ToolModule } from './types.js';

export const integrationTools: ToolModule = {
  domain: 'integrations',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_integrations_status',
        description: 'Get status of all configured integrations (enabled, configured, test results)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Checking integrations',
      execute: async () => {
        try {
          const { IntegrationManager } = await import('../../integrations/manager.js');
          const manager = new IntegrationManager();
          const plugins = manager.getAvailablePlugins();
          return {
            plugins: plugins.map(p => ({
              id: p.id, name: p.name, enabled: p.enabled,
              configured: p.configured, test_result: p.test_result, last_tested: p.last_tested,
            })),
            active: plugins.filter(p => p.enabled && p.configured).length,
            total: plugins.length,
          };
        } catch (err: any) { return { error: err.message }; }
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'test_integration',
        description: 'Test an integration connection (e.g., "github", "helicone", "vercel")',
        parameters: { type: 'object', properties: {
          plugin_id: { type: 'string', description: 'Plugin ID to test' },
        }, required: ['plugin_id'] },
      }},
      label: 'Testing integration',
      execute: async (args) => {
        try {
          const { IntegrationManager } = await import('../../integrations/manager.js');
          const manager = new IntegrationManager();
          const result = await manager.testConnection(args.plugin_id);
          return result;
        } catch (err: any) { return { error: err.message }; }
      },
    },
  ],
};
