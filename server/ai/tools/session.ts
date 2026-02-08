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
          log: (store.sessions.sessions || []).slice(-5),
          total_sessions: store.sessions.sessions?.length || 0,
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
        }, required: ['objective'] },
      }},
      label: 'Starting session',
      execute: async (args) => {
        const store = getStore();
        store.sessionCurrent = {
          id: store.sessions.next_id,
          date: new Date().toISOString().split('T')[0],
          developer: 'user',
          status: 'active',
          objective: args.objective,
          appetite: args.appetite || '4h',
          started_at: new Date().toISOString(),
          ended_at: null,
          duration_hours: 0,
          items_shipped: 0, points: 0,
          roadmap_items_completed: [], issues_resolved: [],
          ideas_captured: [], changelog_ids: [],
          retro: null, next_suggestion: null, ai_observation: null,
        };
        store.sessions.next_id++;
        store.saveSessionCurrent();
        store.saveSessionLog();
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
          next_suggestion: { type: 'string', description: 'What to do next' },
          ai_observation: { type: 'string', description: 'AI behavioral observation' },
        }, required: ['items_shipped', 'retro'] },
      }},
      label: 'Ending session',
      execute: async (args) => {
        const store = getStore();
        const current = store.sessionCurrent;
        if (!current) return { error: 'No active session' };

        const startTime = new Date(current.started_at).getTime();
        const duration = Math.round((Date.now() - startTime) / 3600000 * 10) / 10;

        current.status = 'completed';
        current.ended_at = new Date().toISOString();
        current.duration_hours = duration;
        current.items_shipped = args.items_shipped || 0;
        current.points = args.points || 0;
        current.retro = args.retro || null;
        current.next_suggestion = args.next_suggestion || null;
        current.ai_observation = args.ai_observation || null;

        store.sessions.sessions.push(current);
        store.saveSessionLog();

        store.sessionCurrent = null;
        store.saveSessionCurrent();

        return { ended: current };
      },
    },
  ],
};
