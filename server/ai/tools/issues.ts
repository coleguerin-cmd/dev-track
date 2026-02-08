import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const issueTools: ToolModule = {
  domain: 'issues',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_issues',
        description: 'List all issues, optionally filtered by status or severity',
        parameters: { type: 'object', properties: {
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved'], description: 'Filter by status' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by severity' },
        }},
      }},
      label: 'Listing issues',
      execute: async (args) => {
        const store = getStore();
        let issues = store.issues.issues || [];
        if (args.status) issues = issues.filter((i: any) => i.status === args.status);
        if (args.severity) issues = issues.filter((i: any) => i.severity === args.severity);
        return { issues, total: issues.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_issue',
        description: 'Create a new issue/bug report',
        parameters: { type: 'object', properties: {
          title: { type: 'string', description: 'Issue title' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          symptoms: { type: 'string', description: 'What is happening' },
          root_cause: { type: 'string', description: 'Why it is happening (if known)' },
          files: { type: 'array', items: { type: 'string' }, description: 'Affected files' },
          backlog_item: { type: 'string', description: 'Related backlog item ID' },
        }, required: ['title', 'severity', 'symptoms'] },
      }},
      label: 'Creating issue',
      execute: async (args) => {
        const store = getStore();
        const nextId = store.issues.next_id || 1;
        const issue = {
          id: `ISS-${String(nextId).padStart(3, '0')}`, title: args.title,
          action_id: null, status: 'open', severity: args.severity || 'medium',
          assignee: null, discovered: new Date().toISOString().split('T')[0],
          discovered_in_run: null, symptoms: args.symptoms,
          root_cause: args.root_cause || null, files: args.files || [],
          backlog_item: args.backlog_item || null, resolution: null, resolved: null, notes: null,
        };
        store.issues.issues.push(issue as any);
        store.issues.next_id = nextId + 1;
        store.saveIssues();
        return { created: issue };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_issue',
        description: 'Update an issue (status, severity, symptoms, root_cause, notes)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Issue ID (e.g., ISS-007)' },
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved'] },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          symptoms: { type: 'string' },
          root_cause: { type: 'string' },
          notes: { type: 'string' },
        }, required: ['id'] },
      }},
      label: 'Updating issue',
      execute: async (args) => {
        const store = getStore();
        const issue = (store.issues.issues || []).find((i: any) => i.id === args.id);
        if (!issue) return { error: `Issue ${args.id} not found` };
        for (const key of ['status', 'severity', 'symptoms', 'root_cause', 'notes']) {
          if (args[key] !== undefined) (issue as any)[key] = args[key];
        }
        store.saveIssues();
        return { updated: issue };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'resolve_issue',
        description: 'Resolve an issue with a resolution description',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Issue ID (e.g., ISS-007)' },
          resolution: { type: 'string', description: 'How it was fixed' },
        }, required: ['id', 'resolution'] },
      }},
      label: 'Resolving issue',
      execute: async (args) => {
        const store = getStore();
        const issue = (store.issues.issues || []).find((i: any) => i.id === args.id);
        if (!issue) return { error: `Issue ${args.id} not found` };
        (issue as any).status = 'resolved';
        (issue as any).resolution = args.resolution;
        (issue as any).resolved = new Date().toISOString().split('T')[0];
        store.saveIssues();
        return { resolved: issue };
      },
    },
  ],
};
