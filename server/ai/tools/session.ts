import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const sessionTools: ToolModule = {
  domain: 'session',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_session_info',
        description: 'Get current session plan and recent session history',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Getting session info',
      execute: async () => {
        const store = getStore();
        return {
          current: store.sessionCurrent,
          log: (store.sessionLog.sessions || []).slice(-5),
          total_sessions: store.sessionLog.sessions?.length || 0,
        };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'start_session',
        description: 'Start a new working session with an objective',
        parameters: { type: 'object', properties: {
          objective: { type: 'string', description: 'What to accomplish this session' },
          appetite: { type: 'string', description: 'Time budget (e.g., "2h", "4h")' },
          items: { type: 'array', items: { type: 'string' }, description: 'Backlog item IDs to work on' },
        }, required: ['objective'] },
      }},
      label: 'Starting session',
      execute: async (args) => {
        const store = getStore();
        store.sessionCurrent = {
          status: 'active',
          objective: args.objective,
          appetite: args.appetite || '4h',
          started_at: new Date().toISOString(),
          items: args.items || [],
          notes: [],
        } as any;
        store.saveSessionCurrent();
        return { started: store.sessionCurrent };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'end_session',
        description: 'End the current session with a retro summary',
        parameters: { type: 'object', properties: {
          items_shipped: { type: 'number', description: 'Number of items completed' },
          points: { type: 'number', description: 'Total story points completed' },
          retro: { type: 'string', description: 'Session retrospective' },
          next_session_suggestion: { type: 'string', description: 'What to do next' },
        }, required: ['items_shipped', 'retro'] },
      }},
      label: 'Ending session',
      execute: async (args) => {
        const store = getStore();
        const current = store.sessionCurrent;
        if (!current) return { error: 'No active session' };

        const startTime = (current as any).started_at ? new Date((current as any).started_at).getTime() : Date.now();
        const duration = Math.round((Date.now() - startTime) / 3600000 * 10) / 10;

        const entry = {
          date: new Date().toISOString().split('T')[0],
          objective: (current as any).objective,
          duration_hours: duration,
          items_shipped: args.items_shipped || 0,
          points: args.points || 0,
          retro: args.retro,
          next_session_suggestion: args.next_session_suggestion || '',
        };

        store.sessionLog.sessions.push(entry as any);
        store.saveSessionLog();

        store.sessionCurrent = null;
        store.saveSessionCurrent();

        return { ended: entry };
      },
    },
  ],
};
