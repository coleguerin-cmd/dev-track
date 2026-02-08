import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const releaseTools: ToolModule = {
  domain: 'releases',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_releases',
        description: 'List all releases. Releases bundle shipped roadmap items, resolved issues, and changelog entries into versioned packages.',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['draft', 'published'], description: 'Filter by status' },
        }},
      }},
      label: 'Listing releases',
      execute: async (args) => {
        const store = getStore();
        let releases = store.releases.releases || [];
        if (args.status) releases = releases.filter((r: any) => r.status === args.status);
        return { releases, total: releases.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_release',
        description: 'Create a new draft release',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Unique release ID (e.g., "v0.3.0")' },
          version: { type: 'string', description: 'Semver version' },
          title: { type: 'string', description: 'Release title' },
          milestone_id: { type: 'string', description: 'Associated milestone' },
          release_notes: { type: 'string', description: 'Release notes (markdown)' },
          changelog_ids: { type: 'array', items: { type: 'string' }, description: 'Changelog entry IDs included' },
          roadmap_items_shipped: { type: 'array', items: { type: 'string' }, description: 'Roadmap item IDs shipped' },
          issues_resolved: { type: 'array', items: { type: 'string' }, description: 'Issue IDs resolved' },
        }, required: ['id', 'version', 'title'] },
      }},
      label: 'Creating release',
      execute: async (args) => {
        const store = getStore();
        const existing = (store.releases.releases || []).find((r: any) => r.id === args.id);
        if (existing) return { duplicate: true, existing, message: `Release "${args.id}" already exists.` };
        const now = new Date().toISOString().split('T')[0];
        const release = {
          id: args.id, version: args.version, title: args.title,
          milestone_id: args.milestone_id || null,
          status: 'draft' as const,
          release_notes: args.release_notes || '',
          changelog_ids: args.changelog_ids || [],
          roadmap_items_shipped: args.roadmap_items_shipped || [],
          issues_resolved: args.issues_resolved || [],
          total_commits: 0, files_changed: 0, contributors: [],
          published_date: null, created: now,
          ai_summary: null,
        };
        store.releases.releases.push(release as any);
        store.saveReleases();
        return { created: release };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_release',
        description: 'Update a draft release',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Release ID' },
          title: { type: 'string' },
          release_notes: { type: 'string' },
          milestone_id: { type: 'string' },
          changelog_ids: { type: 'array', items: { type: 'string' } },
          roadmap_items_shipped: { type: 'array', items: { type: 'string' } },
          issues_resolved: { type: 'array', items: { type: 'string' } },
          ai_summary: { type: 'string' },
        }, required: ['id'] },
      }},
      label: 'Updating release',
      execute: async (args) => {
        const store = getStore();
        const release = (store.releases.releases || []).find((r: any) => r.id === args.id);
        if (!release) return { error: `Release "${args.id}" not found` };
        for (const key of ['title', 'release_notes', 'milestone_id', 'changelog_ids', 'roadmap_items_shipped', 'issues_resolved', 'ai_summary']) {
          if (args[key] !== undefined) (release as any)[key] = args[key];
        }
        store.saveReleases();
        return { updated: release };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'publish_release',
        description: 'Publish a draft release — marks it as published with current date',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Release ID to publish' },
        }, required: ['id'] },
      }},
      label: 'Publishing release',
      execute: async (args) => {
        const store = getStore();
        const release = (store.releases.releases || []).find((r: any) => r.id === args.id);
        if (!release) return { error: `Release "${args.id}" not found` };
        if ((release as any).status === 'published') return { error: 'Release is already published.' };
        (release as any).status = 'published';
        (release as any).published_date = new Date().toISOString().split('T')[0];
        store.saveReleases();
        return { published: release };
      },
    },
  ],
};
