import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const metricsTools: ToolModule = {
  domain: 'metrics',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_velocity',
        description: 'Get velocity metrics (items shipped per session, points, trends)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Loading velocity metrics',
      execute: async () => getStore().velocity,
    },
    {
      definition: { type: 'function', function: {
        name: 'update_velocity',
        description: 'Update velocity totals after a session',
        parameters: { type: 'object', properties: {
          items_shipped: { type: 'number', description: 'Items shipped to add' },
          points: { type: 'number', description: 'Points to add' },
          issues_found: { type: 'number' },
          issues_resolved: { type: 'number' },
        }},
      }},
      label: 'Updating velocity',
      execute: async (args) => {
        const store = getStore();
        const t = store.velocity.totals as any;
        if (args.items_shipped) t.total_items_shipped += args.items_shipped;
        if (args.points) t.total_points += args.points;
        if (args.issues_found) t.total_issues_found += args.issues_found;
        if (args.issues_resolved) t.total_issues_resolved += args.issues_resolved;
        t.total_sessions = store.velocity.sessions?.length || t.total_sessions;
        if (t.total_sessions > 0) {
          t.avg_items_per_session = Math.round((t.total_items_shipped / t.total_sessions) * 10) / 10;
          t.avg_points_per_session = Math.round((t.total_points / t.total_sessions) * 10) / 10;
        }
        store.saveVelocity();
        return { updated: store.velocity.totals };
      },
    },
  ],
};
