import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const activityTools: ToolModule = {
  domain: 'activity',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_activity',
        description: 'Query the activity feed — a timeline of all events (items shipped, issues resolved, sessions, etc.). Returns most recent first.',
        parameters: { type: 'object', properties: {
          limit: { type: 'number', description: 'Max events to return (default: 20, max: 100)' },
          type: { type: 'string', description: 'Filter by event type (e.g., item_completed, issue_resolved, session_ended)' },
          entity_type: { type: 'string', description: 'Filter by entity type (e.g., roadmap_item, issue, session, idea)' },
          entity_id: { type: 'string', description: 'Filter by specific entity ID' },
          since: { type: 'string', description: 'Only events after this ISO date (YYYY-MM-DD)' },
        }},
      }},
      label: 'Querying activity feed',
      execute: async (args) => {
        const store = getStore();
        let events = [...(store.activity.events || [])].reverse(); // newest first
        if (args.type) events = events.filter((e: any) => e.type === args.type);
        if (args.entity_type) events = events.filter((e: any) => e.entity_type === args.entity_type);
        if (args.entity_id) events = events.filter((e: any) => e.entity_id === args.entity_id);
        if (args.since) events = events.filter((e: any) => e.timestamp >= args.since);
        const limit = Math.min(args.limit || 20, 100);
        events = events.slice(0, limit);
        return { events, total: events.length, has_more: (store.activity.events || []).length > limit };
      },
    },
  ],
};
