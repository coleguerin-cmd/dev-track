/**
 * Tool Registry — All tools the chat agent can call.
 * 
 * Each tool wraps an existing dev-track API/store capability.
 * Tools are defined in OpenAI function-calling format for compatibility
 * across all providers (Anthropic and Google both accept this format).
 * 
 * The agent has FULL access to read and write all dev-track data.
 */

import { getStore } from '../store.js';
import type { AIToolDefinition } from './service.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: AIToolDefinition[] = [
  // ── Backlog ──
  {
    type: 'function',
    function: {
      name: 'list_backlog',
      description: 'List all backlog items, optionally filtered by horizon (now/next/later) or status',
      parameters: {
        type: 'object',
        properties: {
          horizon: { type: 'string', enum: ['now', 'next', 'later'], description: 'Filter by horizon' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Filter by status' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_backlog_item',
      description: 'Create a new backlog item',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique kebab-case ID' },
          title: { type: 'string', description: 'Item title' },
          summary: { type: 'string', description: 'Detailed description' },
          horizon: { type: 'string', enum: ['now', 'next', 'later'], description: 'Priority horizon' },
          size: { type: 'string', enum: ['S', 'M', 'L', 'XL'], description: 'Estimated size' },
          category: { type: 'string', description: 'Category (core, ui, feature, etc.)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        },
        required: ['id', 'title', 'summary', 'horizon', 'size'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_backlog_item',
      description: 'Update an existing backlog item (status, horizon, size, etc.)',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Item ID to update' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
          horizon: { type: 'string', enum: ['now', 'next', 'later'] },
          size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
          summary: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },

  // ── Issues ──
  {
    type: 'function',
    function: {
      name: 'list_issues',
      description: 'List all issues, optionally filtered by status or severity',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'resolved'], description: 'Filter by status' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by severity' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_issue',
      description: 'Create a new issue/bug report',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Issue title' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          symptoms: { type: 'string', description: 'What is happening' },
          root_cause: { type: 'string', description: 'Why it is happening (if known)' },
          files: { type: 'array', items: { type: 'string' }, description: 'Affected files' },
        },
        required: ['title', 'severity', 'symptoms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_issue',
      description: 'Resolve an issue with a resolution description',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue ID (e.g., ISS-007)' },
          resolution: { type: 'string', description: 'How it was fixed' },
        },
        required: ['id', 'resolution'],
      },
    },
  },

  // ── Changelog ──
  {
    type: 'function',
    function: {
      name: 'list_changelog',
      description: 'List recent changelog entries',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max entries to return (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_changelog_entry',
      description: 'Add a new changelog entry for completed work',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What shipped' },
          description: { type: 'string', description: 'Detailed description' },
          type: { type: 'string', enum: ['feature', 'enhancement', 'fix', 'refactor', 'docs', 'chore'] },
          scope: { type: 'string', description: 'Area of the codebase affected' },
          files_changed: { type: 'array', items: { type: 'string' } },
          backlog_item: { type: 'string', description: 'Related backlog item ID' },
        },
        required: ['title', 'description', 'type'],
      },
    },
  },

  // ── Ideas ──
  {
    type: 'function',
    function: {
      name: 'list_ideas',
      description: 'List all captured ideas',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_idea',
      description: 'Capture a new idea with description, pros, cons, and open questions',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: ['feature', 'architecture', 'ux', 'business', 'integration'] },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'category'],
      },
    },
  },

  // ── State & Health ──
  {
    type: 'function',
    function: {
      name: 'get_project_state',
      description: 'Get the current project state including health ratings for all systems',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quick_status',
      description: 'Get a quick one-line status summary of the project',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Brain (AI Notes & Preferences) ──
  {
    type: 'function',
    function: {
      name: 'get_brain_notes',
      description: 'Get AI brain notes (observations, suggestions, warnings, decisions)',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['observation', 'suggestion', 'warning', 'decision', 'preference', 'reminder'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_brain_note',
      description: 'Add a brain note — an observation, suggestion, warning, or decision',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['observation', 'suggestion', 'warning', 'decision', 'preference', 'reminder'] },
          content: { type: 'string', description: 'The note content' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          related_items: { type: 'array', items: { type: 'string' }, description: 'Related issue/backlog IDs' },
        },
        required: ['type', 'content'],
      },
    },
  },

  // ── Codebase ──
  {
    type: 'function',
    function: {
      name: 'get_codebase_stats',
      description: 'Get codebase statistics (total files, lines, functions, components, etc.)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_modules',
      description: 'Get all system modules with their descriptions, files, and dependencies',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description: 'Search across files, functions, routes, and pages in the codebase',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_details',
      description: 'Get detailed information about a specific file (exports, imports, dependencies)',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path' },
        },
        required: ['file_path'],
      },
    },
  },

  // ── Git ──
  {
    type: 'function',
    function: {
      name: 'get_git_status',
      description: 'Get current git status (modified files, staged changes, branch)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_git_diff',
      description: 'Get the git diff (unstaged changes or specific file diff)',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Optional specific file to diff' },
          staged: { type: 'boolean', description: 'Show staged changes instead' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_git_log',
      description: 'Get recent git commit history',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits (default 10)' },
        },
      },
    },
  },

  // ── Docs ──
  {
    type: 'function',
    function: {
      name: 'list_docs',
      description: 'List all design docs and decision docs',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_doc',
      description: 'Read the contents of a design or decision document',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['design', 'decision'] },
          filename: { type: 'string', description: 'Filename (e.g., SPEC.md)' },
        },
        required: ['type', 'filename'],
      },
    },
  },

  // ── Session ──
  {
    type: 'function',
    function: {
      name: 'get_session_info',
      description: 'Get current session plan and recent session history',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Metrics ──
  {
    type: 'function',
    function: {
      name: 'get_velocity',
      description: 'Get velocity metrics (items shipped per session, points, trends)',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Read File ──
  {
    type: 'function',
    function: {
      name: 'read_project_file',
      description: 'Read any file from the project directory. Use for examining source code, configs, or any file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative path from project root' },
          max_lines: { type: 'number', description: 'Max lines to read (default 200)' },
        },
        required: ['file_path'],
      },
    },
  },
];

// ─── Friendly labels for UI ──────────────────────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  list_backlog: 'Listing backlog items',
  create_backlog_item: 'Creating backlog item',
  update_backlog_item: 'Updating backlog item',
  list_issues: 'Listing issues',
  create_issue: 'Creating issue',
  resolve_issue: 'Resolving issue',
  list_changelog: 'Reading changelog',
  add_changelog_entry: 'Adding changelog entry',
  list_ideas: 'Listing ideas',
  capture_idea: 'Capturing idea',
  get_project_state: 'Checking project state',
  get_quick_status: 'Getting quick status',
  get_brain_notes: 'Reading brain notes',
  add_brain_note: 'Adding brain note',
  get_codebase_stats: 'Getting codebase stats',
  get_modules: 'Loading modules',
  search_codebase: 'Searching codebase',
  get_file_details: 'Examining file',
  get_git_status: 'Checking git status',
  get_git_diff: 'Reading git diff',
  get_git_log: 'Reading git log',
  list_docs: 'Listing docs',
  get_doc: 'Reading document',
  get_session_info: 'Getting session info',
  get_velocity: 'Loading velocity metrics',
  read_project_file: 'Reading file',
};

// ─── Tool Execution ──────────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    const result = await executeToolInner(name, args);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || 'Tool execution failed' });
  }
}

async function executeToolInner(name: string, args: Record<string, any>): Promise<any> {
  const store = getStore();

  switch (name) {
    // ── Backlog ──
    case 'list_backlog': {
      let items = store.backlog.items || [];
      if (args.horizon) items = items.filter((i: any) => i.horizon === args.horizon);
      if (args.status) items = items.filter((i: any) => i.status === args.status);
      return { items, total: items.length };
    }
    case 'create_backlog_item': {
      const item = {
        id: args.id,
        title: args.title,
        summary: args.summary,
        horizon: args.horizon || 'later',
        size: args.size || 'M',
        status: 'pending',
        category: args.category || 'feature',
        design_doc: null,
        depends_on: [],
        assignee: null,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
        completed: null,
        tags: args.tags || [],
      };
      store.backlog.items.push(item as any);
      store.saveBacklog();
      return { created: item };
    }
    case 'update_backlog_item': {
      const items = store.backlog.items || [];
      const item = items.find((i: any) => i.id === args.id);
      if (!item) return { error: `Item ${args.id} not found` };
      if (args.status) (item as any).status = args.status;
      if (args.horizon) (item as any).horizon = args.horizon;
      if (args.size) (item as any).size = args.size;
      if (args.summary) (item as any).summary = args.summary;
      if (args.title) (item as any).title = args.title;
      (item as any).updated = new Date().toISOString().split('T')[0];
      if (args.status === 'completed') (item as any).completed = new Date().toISOString().split('T')[0];
      store.saveBacklog();
      return { updated: item };
    }

    // ── Issues ──
    case 'list_issues': {
      let issues = store.issues.issues || [];
      if (args.status) issues = issues.filter((i: any) => i.status === args.status);
      if (args.severity) issues = issues.filter((i: any) => i.severity === args.severity);
      return { issues, total: issues.length };
    }
    case 'create_issue': {
      const nextId = store.issues.next_id || 1;
      const issue = {
        id: `ISS-${String(nextId).padStart(3, '0')}`,
        title: args.title,
        action_id: null,
        status: 'open',
        severity: args.severity || 'medium',
        assignee: null,
        discovered: new Date().toISOString().split('T')[0],
        discovered_in_run: null,
        symptoms: args.symptoms,
        root_cause: args.root_cause || null,
        files: args.files || [],
        backlog_item: null,
        resolution: null,
        resolved: null,
        notes: null,
      };
      store.issues.issues.push(issue as any);
      store.issues.next_id = nextId + 1;
      store.saveIssues();
      return { created: issue };
    }
    case 'resolve_issue': {
      const issue = (store.issues.issues || []).find((i: any) => i.id === args.id);
      if (!issue) return { error: `Issue ${args.id} not found` };
      (issue as any).status = 'resolved';
      (issue as any).resolution = args.resolution;
      (issue as any).resolved = new Date().toISOString().split('T')[0];
      store.saveIssues();
      return { resolved: issue };
    }

    // ── Changelog ──
    case 'list_changelog': {
      const entries = store.changelog.entries || [];
      const limit = args.limit || 10;
      return { entries: entries.slice(-limit), total: entries.length };
    }
    case 'add_changelog_entry': {
      const entries = store.changelog.entries || [];
      const lastId = entries.length > 0 ? entries[entries.length - 1].id : 'CHG-000';
      const numPart = parseInt(lastId.replace('CHG-', '')) + 1;
      const entry = {
        id: `CHG-${String(numPart).padStart(3, '0')}`,
        date: new Date().toISOString().split('T')[0],
        session: null,
        title: args.title,
        description: args.description,
        type: args.type || 'enhancement',
        scope: args.scope || 'general',
        files_changed: args.files_changed || [],
        backlog_item: args.backlog_item || null,
        breaking: false,
      };
      entries.push(entry as any);
      store.saveChangelog();
      return { created: entry };
    }

    // ── Ideas ──
    case 'list_ideas': {
      const ideasPath = path.resolve(process.cwd(), 'data/ideas/items.json');
      const data = JSON.parse(fs.readFileSync(ideasPath, 'utf-8'));
      return { ideas: data.ideas, total: data.ideas.length };
    }
    case 'capture_idea': {
      const ideasPath = path.resolve(process.cwd(), 'data/ideas/items.json');
      const data = JSON.parse(fs.readFileSync(ideasPath, 'utf-8'));
      const idea = {
        id: `IDEA-${String(data.next_id).padStart(3, '0')}`,
        title: args.title,
        description: args.description,
        category: args.category || 'feature',
        status: 'captured',
        source: `chat ${new Date().toISOString().split('T')[0]}`,
        related_ideas: [],
        promoted_to: null,
        pros: args.pros || [],
        cons: args.cons || [],
        open_questions: args.open_questions || [],
        notes: null,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
      };
      data.ideas.push(idea);
      data.next_id++;
      fs.writeFileSync(ideasPath, JSON.stringify(data, null, 2));
      return { created: idea };
    }

    // ── State ──
    case 'get_project_state':
      return store.state;
    case 'get_quick_status':
      return { status: store.getQuickStatusLine() };

    // ── Brain ──
    case 'get_brain_notes': {
      const notesPath = path.resolve(process.cwd(), 'data/brain/notes.json');
      const data = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
      let notes = data.notes || [];
      if (args.type) notes = notes.filter((n: any) => n.type === args.type);
      return { notes, total: notes.length };
    }
    case 'add_brain_note': {
      const notesPath = path.resolve(process.cwd(), 'data/brain/notes.json');
      const data = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
      const nextId = data.next_id || (data.notes.length + 1);
      const note = {
        id: `BN-${String(nextId).padStart(3, '0')}`,
        type: args.type,
        content: args.content,
        priority: args.priority || 'medium',
        related_items: args.related_items || [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      data.notes.push(note);
      data.next_id = nextId + 1;
      fs.writeFileSync(notesPath, JSON.stringify(data, null, 2));
      return { created: note };
    }

    // ── Codebase ──
    case 'get_codebase_stats': {
      const analysisPath = path.resolve(process.cwd(), 'data/codebase/analysis.json');
      if (!fs.existsSync(analysisPath)) return { error: 'No scan data. Run a codebase scan first.' };
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
      return { stats: analysis.stats, scanned_at: analysis.scanned_at };
    }
    case 'get_modules': {
      const analysisPath = path.resolve(process.cwd(), 'data/codebase/analysis.json');
      if (!fs.existsSync(analysisPath)) return { error: 'No scan data.' };
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
      return { modules: analysis.modules };
    }
    case 'search_codebase': {
      const analysisPath = path.resolve(process.cwd(), 'data/codebase/analysis.json');
      if (!fs.existsSync(analysisPath)) return { error: 'No scan data.' };
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
      const q = args.query.toLowerCase();
      const results: any[] = [];
      for (const file of analysis.files) {
        if (file.path.toLowerCase().includes(q)) results.push({ type: 'file', name: file.name, path: file.path });
        for (const exp of file.exports) {
          if (exp.name.toLowerCase().includes(q)) results.push({ type: exp.kind, name: exp.name, file: file.path });
        }
      }
      return { results: results.slice(0, 30), total: results.length };
    }
    case 'get_file_details': {
      const analysisPath = path.resolve(process.cwd(), 'data/codebase/analysis.json');
      if (!fs.existsSync(analysisPath)) return { error: 'No scan data.' };
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
      const file = analysis.files.find((f: any) => f.path === args.file_path);
      if (!file) return { error: `File ${args.file_path} not found in scan data` };
      return { file };
    }

    // ── Git ──
    case 'get_git_status': {
      try {
        const result = execSync('git status --porcelain -b', { cwd: process.cwd(), encoding: 'utf-8', timeout: 5000 });
        return { status: result.trim() };
      } catch (e: any) { return { error: e.message }; }
    }
    case 'get_git_diff': {
      try {
        let cmd = 'git diff';
        if (args.staged) cmd = 'git diff --staged';
        if (args.file) cmd += ` -- "${args.file}"`;
        const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 10000 });
        // Truncate large diffs
        const maxLen = 8000;
        if (result.length > maxLen) return { diff: result.substring(0, maxLen) + '\n... (truncated)', truncated: true };
        return { diff: result.trim() };
      } catch (e: any) { return { error: e.message }; }
    }
    case 'get_git_log': {
      try {
        const count = args.count || 10;
        const result = execSync(`git log --oneline -${count}`, { cwd: process.cwd(), encoding: 'utf-8', timeout: 5000 });
        return { log: result.trim() };
      } catch (e: any) { return { error: e.message }; }
    }

    // ── Docs ──
    case 'list_docs': {
      const designs = store.listDesignDocs();
      const decisions = store.listDecisions();
      return { designs, decisions };
    }
    case 'get_doc': {
      const content = args.type === 'design'
        ? store.getDesignDoc(args.filename)
        : store.getDecision(args.filename);
      if (!content) return { error: `Document ${args.filename} not found` };
      // Truncate very long docs
      const maxLen = 6000;
      if (content.length > maxLen) return { content: content.substring(0, maxLen) + '\n\n... (truncated)', truncated: true };
      return { content };
    }

    // ── Session ──
    case 'get_session_info': {
      return {
        current: store.sessionCurrent,
        log: (store.sessionLog.sessions || []).slice(-3),
      };
    }

    // ── Metrics ──
    case 'get_velocity':
      return store.velocity;

    // ── Read File ──
    case 'read_project_file': {
      const filePath = path.resolve(process.cwd(), args.file_path);
      if (!fs.existsSync(filePath)) return { error: `File not found: ${args.file_path}` };
      const content = fs.readFileSync(filePath, 'utf-8');
      const maxLines = args.max_lines || 200;
      const lines = content.split('\n');
      if (lines.length > maxLines) {
        return {
          content: lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines)`,
          total_lines: lines.length,
          truncated: true,
        };
      }
      return { content, total_lines: lines.length };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
