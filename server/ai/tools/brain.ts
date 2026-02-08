import fs from 'fs';
import path from 'path';
import { getDataDir } from '../../project-config.js';
import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

function readJSON(file: string) { return JSON.parse(fs.readFileSync(path.join(getDataDir(), file), 'utf-8')); }
function writeJSON(file: string, data: any) {
  // Mark write so the file watcher ignores this change (prevents feedback loops)
  try { getStore().markWrite(file); } catch {}
  fs.writeFileSync(path.join(getDataDir(), file), JSON.stringify(data, null, 2));
}

export const brainTools: ToolModule = {
  domain: 'brain',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_brain_notes',
        description: 'Get AI brain notes (observations, suggestions, warnings, decisions)',
        parameters: { type: 'object', properties: {
          type: { type: 'string', enum: ['observation', 'suggestion', 'warning', 'decision', 'preference', 'reminder'] },
        }},
      }},
      label: 'Reading brain notes',
      execute: async (args) => {
        const data = readJSON('brain/notes.json');
        let notes = data.notes || [];
        if (args.type) notes = notes.filter((n: any) => n.type === args.type);
        return { notes, total: notes.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'add_brain_note',
        description: 'Add a brain note — an observation, suggestion, warning, or decision',
        parameters: { type: 'object', properties: {
          type: { type: 'string', enum: ['observation', 'suggestion', 'warning', 'decision', 'preference', 'reminder'] },
          content: { type: 'string', description: 'The note content' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          related_items: { type: 'array', items: { type: 'string' }, description: 'Related issue/backlog IDs' },
        }, required: ['type', 'content'] },
      }},
      label: 'Adding brain note',
      execute: async (args) => {
        const data = readJSON('brain/notes.json');
        const nextId = data.next_id || (data.notes.length + 1);
        const note = {
          id: `BN-${String(nextId).padStart(3, '0')}`, type: args.type,
          content: args.content, priority: args.priority || 'medium',
          related_items: args.related_items || [],
          created: new Date().toISOString(), updated: new Date().toISOString(),
        };
        data.notes.push(note);
        data.next_id = nextId + 1;
        writeJSON('brain/notes.json', data);
        return { created: note };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_context_recovery',
        description: 'Read the context recovery briefing (session handoff data)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Reading context recovery',
      execute: async () => readJSON('brain/context-recovery.json'),
    },
    {
      definition: { type: 'function', function: {
        name: 'write_context_recovery',
        description: 'Write context recovery briefing for the next session',
        parameters: { type: 'object', properties: {
          briefing: { type: 'string', description: 'Session summary paragraph' },
          hot_context: { type: 'array', items: { type: 'string' }, description: 'Key context items' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Active warnings' },
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Suggestions for next session' },
        }, required: ['briefing'] },
      }},
      label: 'Writing context recovery',
      execute: async (args) => {
        const data = {
          last_generated: new Date().toISOString(),
          briefing: args.briefing,
          hot_context: args.hot_context || [],
          warnings: args.warnings || [],
          suggestions: args.suggestions || [],
        };
        writeJSON('brain/context-recovery.json', data);
        return { written: true };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_preferences',
        description: 'Read stored user/AI preferences',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Reading preferences',
      execute: async () => readJSON('brain/preferences.json'),
    },
    {
      definition: { type: 'function', function: {
        name: 'update_preferences',
        description: 'Update user/AI preferences (merge with existing)',
        parameters: { type: 'object', properties: {
          preferences: { type: 'object', description: 'Key-value preferences to merge' },
        }, required: ['preferences'] },
      }},
      label: 'Updating preferences',
      execute: async (args) => {
        const data = readJSON('brain/preferences.json');
        Object.assign(data.preferences || data, args.preferences);
        writeJSON('brain/preferences.json', data);
        return { updated: true };
      },
    },
  ],
};
