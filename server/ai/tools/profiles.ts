import fs from 'fs';
import path from 'path';
import { getDataDir } from '../../project-config.js';
import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

function getProfilesPath() { return path.join(getDataDir(), 'ai/profiles.json'); }
function markProfileWrite() { try { getStore().markWrite('ai/profiles.json'); } catch {} }

export const profileTools: ToolModule = {
  domain: 'profiles',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_user_profile',
        description: 'Get the active user profile (AI-observed attributes, intelligence scores, behavior patterns)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Reading user profile',
      execute: async () => {
        try {
          const data = JSON.parse(fs.readFileSync(getProfilesPath(), 'utf-8'));
          return { profile: data.profiles?.[0] || null };
        } catch { return { profile: null }; }
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_user_profile',
        description: 'Update the active user profile (behavior patterns, AI instructions, context notes, AI-observed scores)',
        parameters: { type: 'object', properties: {
          behavior: { type: 'object', description: 'Behavior pattern updates (session_length_preference, context_window_habits, etc.)' },
          ai_instructions: { type: 'string', description: 'Custom AI instructions' },
          context_notes: { type: 'array', items: { type: 'string' }, description: 'Context notes about the user' },
          ai_observed: { type: 'object', description: 'AI-observed attributes update (intelligence_score, attributes, etc.)' },
        }},
      }},
      label: 'Updating user profile',
      execute: async (args) => {
        const profilesPath = getProfilesPath();
        let data: any = { profiles: [] };
        try { data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8')); } catch {}

        if (data.profiles.length === 0) {
          data.profiles.push({ id: 'user-001', name: 'User', role: '', created: new Date().toISOString().split('T')[0] });
        }

        const profile = data.profiles[0];
        if (args.behavior) profile.behavior = { ...profile.behavior, ...args.behavior };
        if (args.ai_instructions !== undefined) profile.ai_instructions = args.ai_instructions;
        if (args.context_notes) profile.context_notes = args.context_notes;
        if (args.ai_observed) profile.ai_observed = { ...profile.ai_observed, ...args.ai_observed };
        profile.updated = new Date().toISOString().split('T')[0];

        markProfileWrite();
        fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
        return { updated: profile };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'add_session_observation',
        description: 'Add a session observation to the user profile (AI-to-AI feedback)',
        parameters: { type: 'object', properties: {
          session: { type: 'number', description: 'Session number' },
          notes: { type: 'string', description: 'Observation notes' },
          attribute_signals: { type: 'object', description: 'Attribute signals observed (key: description)' },
          observer: { type: 'string', description: 'Which AI platform observed this' },
        }, required: ['notes'] },
      }},
      label: 'Adding session observation',
      execute: async (args) => {
        const profilesPath = getProfilesPath();
        let data: any = { profiles: [] };
        try { data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8')); } catch {}
        if (data.profiles.length === 0) return { error: 'No user profile exists' };

        const profile = data.profiles[0];
        if (!profile.session_observations) profile.session_observations = { observations: [] };

        const obs = {
          session: args.session || null,
          date: new Date().toISOString().split('T')[0],
          observer: args.observer || 'dev-track-chat',
          source: 'in-app chat',
          notes: args.notes,
          attribute_signals: args.attribute_signals || {},
        };
        profile.session_observations.observations.push(obs);

        markProfileWrite();
        fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
        return { added: obs };
      },
    },
  ],
};
