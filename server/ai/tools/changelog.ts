import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const changelogTools: ToolModule = {
  domain: 'changelog',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_changelog',
        description: 'List recent changelog entries',
        parameters: { type: 'object', properties: {
          limit: { type: 'number', description: 'Max entries to return (default 10)' },
        }},
      }},
      label: 'Reading changelog',
      execute: async (args) => {
        const store = getStore();
        const entries = store.changelog.entries || [];
        const limit = args.limit || 10;
        return { entries: entries.slice(-limit), total: entries.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'add_changelog_entry',
        description: 'Add a new changelog entry for completed work',
        parameters: { type: 'object', properties: {
          title: { type: 'string', description: 'What shipped' },
          description: { type: 'string', description: 'Detailed description' },
          type: { type: 'string', enum: ['feature', 'enhancement', 'fix', 'refactor', 'docs', 'chore'] },
          scope: { type: 'string', description: 'Area of the codebase affected' },
          files_changed: { type: 'array', items: { type: 'string' } },
          backlog_item: { type: 'string', description: 'Related backlog item ID' },
        }, required: ['title', 'description', 'type'] },
      }},
      label: 'Adding changelog entry',
      execute: async (args) => {
        const store = getStore();
        const entries = store.changelog.entries || [];
        const lastId = entries.length > 0 ? entries[entries.length - 1].id : 'CL-000';
        const numPart = parseInt(lastId.replace(/^(CL|CHG|chg)-/i, '')) + 1;
        const entry = {
          id: `CL-${String(numPart).padStart(3, '0')}`,
          date: new Date().toISOString().split('T')[0],
          session: null, title: args.title, description: args.description,
          type: args.type || 'enhancement', scope: args.scope || 'general',
          files_changed: args.files_changed || [],
          backlog_item: args.backlog_item || null, breaking: false,
        };
        entries.push(entry as any);
        store.saveChangelog();
        return { created: entry };
      },
    },
  ],
};
