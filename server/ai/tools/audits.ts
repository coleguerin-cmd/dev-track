import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const auditTools: ToolModule = {
  domain: 'audits',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_audit_runs',
        description: 'List past automation audit runs. Shows when automations ran, what they did, cost, and status. Use to understand what the system has been doing autonomously.',
        parameters: { type: 'object', properties: {
          trigger_type: { type: 'string', enum: ['scheduled', 'event', 'manual', 'requested'], description: 'Filter by trigger type' },
          status: { type: 'string', enum: ['running', 'completed', 'failed', 'cancelled'], description: 'Filter by run status' },
          automation_id: { type: 'string', description: 'Filter by automation ID' },
          since: { type: 'string', description: 'Only runs after this ISO date' },
          limit: { type: 'number', description: 'Max runs to return (default: 20)' },
        }},
      }},
      label: 'Listing audit runs',
      execute: async (args) => {
        const store = getStore();
        const result = store.listAuditRuns({
          trigger_type: args.trigger_type,
          status: args.status,
          automation_id: args.automation_id,
          since: args.since,
          limit: args.limit || 20,
        });
        return result;
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_audit_run',
        description: 'Get full detail of a specific audit run including thinking chain, tool calls, changes made, and suggestions',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Audit run ID (e.g., "run-0001")' },
        }, required: ['id'] },
      }},
      label: 'Reading audit run detail',
      execute: async (args) => {
        const store = getStore();
        const run = store.getAuditRun(args.id);
        if (!run) return { error: `Audit run "${args.id}" not found` };
        // Return summary without full step content to save tokens
        return {
          ...run,
          steps: run.steps.map(s => ({
            index: s.index,
            type: s.type,
            timestamp: s.timestamp,
            tool_name: s.tool_name,
            tool_args: s.tool_args,
            tool_result_preview: s.tool_result_preview,
            content: s.content ? s.content.substring(0, 500) : undefined,
            tokens: s.tokens,
            cost_usd: s.cost_usd,
          })),
        };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_audit_stats',
        description: 'Get aggregate audit statistics: runs today/this week, costs, changes, breakdowns by automation and trigger type',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Getting audit statistics',
      execute: async () => {
        const store = getStore();
        return store.getAuditStats();
      },
    },
  ],
};
