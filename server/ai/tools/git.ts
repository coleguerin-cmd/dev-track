import { execSync } from 'child_process';
import { getProjectRoot } from '../../project-config.js';
import type { ToolModule } from './types.js';

function git(cmd: string, timeout = 10000): string {
  return execSync(cmd, { cwd: getProjectRoot(), encoding: 'utf-8', timeout }).trim();
}

export const gitTools: ToolModule = {
  domain: 'git',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_git_status',
        description: 'Get current git status (modified files, staged changes, branch)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Checking git status',
      execute: async () => {
        try { return { status: git('git status --porcelain -b', 5000) }; }
        catch (e: any) { return { error: e.message }; }
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_git_diff',
        description: 'Get the git diff (unstaged changes or specific file diff)',
        parameters: { type: 'object', properties: {
          file: { type: 'string', description: 'Optional specific file to diff' },
          staged: { type: 'boolean', description: 'Show staged changes instead' },
        }},
      }},
      label: 'Reading git diff',
      execute: async (args) => {
        try {
          let cmd = 'git diff';
          if (args.staged) cmd = 'git diff --staged';
          if (args.file) cmd += ` -- "${args.file}"`;
          const result = git(cmd);
          const maxLen = 8000;
          if (result.length > maxLen) return { diff: result.substring(0, maxLen) + '\n... (truncated)', truncated: true };
          return { diff: result };
        } catch (e: any) { return { error: e.message }; }
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_git_log',
        description: 'Get git commit history with full messages, author, and dates',
        parameters: { type: 'object', properties: {
          count: { type: 'number', description: 'Number of commits (default 20)' },
          format: { type: 'string', enum: ['oneline', 'detailed'], description: 'Output format (default: detailed)' },
          since: { type: 'string', description: 'Only commits after this date (e.g., "2026-01-01")' },
          path: { type: 'string', description: 'Only commits affecting this file/directory' },
        }},
      }},
      label: 'Reading git log',
      execute: async (args) => {
        try {
          const count = args.count || 20;
          const format = args.format || 'detailed';
          let cmd = format === 'oneline'
            ? `git log --oneline -${count}`
            : `git log --format="%H%n%an%n%ai%n%s%n%b%n---COMMIT---" -${count}`;
          if (args.since) cmd += ` --since="${args.since}"`;
          if (args.path) cmd += ` -- "${args.path}"`;
          const result = git(cmd, 15000);

          if (format === 'oneline') return { log: result };

          // Parse detailed format
          const commits = result.split('---COMMIT---').filter(Boolean).map(block => {
            const lines = block.trim().split('\n');
            return {
              hash: lines[0] || '',
              author: lines[1] || '',
              date: lines[2] || '',
              subject: lines[3] || '',
              body: lines.slice(4).join('\n').trim(),
            };
          });
          return { commits, total: commits.length };
        } catch (e: any) { return { error: e.message }; }
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_git_branches',
        description: 'List git branches with current branch indicated',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Listing branches',
      execute: async () => {
        try { return { branches: git('git branch -a --format="%(refname:short) %(objectname:short)"', 5000) }; }
        catch (e: any) { return { error: e.message }; }
      },
    },
  ],
};
