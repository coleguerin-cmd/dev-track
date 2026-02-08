import fs from 'fs';
import path from 'path';
import { getProjectRoot } from '../../project-config.js';
import type { ToolModule } from './types.js';

export const fileTools: ToolModule = {
  domain: 'files',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'read_project_file',
        description: 'Read any file from the project directory. Use for examining source code, configs, or any file.',
        parameters: { type: 'object', properties: {
          file_path: { type: 'string', description: 'Relative path from project root' },
          max_lines: { type: 'number', description: 'Max lines to read (default 200)' },
          offset: { type: 'number', description: 'Start reading from this line (0-indexed)' },
        }, required: ['file_path'] },
      }},
      label: 'Reading file',
      execute: async (args) => {
        const filePath = path.resolve(getProjectRoot(), args.file_path);
        if (!fs.existsSync(filePath)) return { error: `File not found: ${args.file_path}` };
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const offset = args.offset || 0;
        const maxLines = args.max_lines || 200;
        const slice = lines.slice(offset, offset + maxLines);
        return {
          content: slice.join('\n'),
          total_lines: lines.length,
          showing: { from: offset, to: Math.min(offset + maxLines, lines.length) },
          truncated: lines.length > offset + maxLines,
        };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'write_project_file',
        description: 'Write or create a file in the project directory. Use carefully — this modifies the codebase.',
        parameters: { type: 'object', properties: {
          file_path: { type: 'string', description: 'Relative path from project root' },
          content: { type: 'string', description: 'File content to write' },
          create_dirs: { type: 'boolean', description: 'Create parent directories if they don\'t exist (default true)' },
        }, required: ['file_path', 'content'] },
      }},
      label: 'Writing file',
      execute: async (args) => {
        const filePath = path.resolve(getProjectRoot(), args.file_path);
        if (args.create_dirs !== false) {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, args.content, 'utf-8');
        return { written: args.file_path, size: args.content.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'list_directory',
        description: 'List files and directories at a given path. Use to explore project structure.',
        parameters: { type: 'object', properties: {
          dir_path: { type: 'string', description: 'Relative directory path (default: project root)' },
          recursive: { type: 'boolean', description: 'List recursively (default false, max 500 entries)' },
          ignore: { type: 'array', items: { type: 'string' }, description: 'Patterns to ignore (e.g., ["node_modules", ".git"])' },
        }},
      }},
      label: 'Listing directory',
      execute: async (args) => {
        const dirPath = path.resolve(getProjectRoot(), args.dir_path || '.');
        if (!fs.existsSync(dirPath)) return { error: `Directory not found: ${args.dir_path || '.'}` };

        const ignore = new Set(args.ignore || ['node_modules', '.git', 'dist', '.next', '.dev-track']);
        const entries: { name: string; type: 'file' | 'dir'; path: string; size?: number }[] = [];

        function walk(dir: string, prefix: string, depth: number) {
          if (entries.length >= 500) return;
          const items = fs.readdirSync(dir).sort();
          for (const item of items) {
            if (ignore.has(item) || item.startsWith('.')) continue;
            const full = path.join(dir, item);
            const rel = prefix ? `${prefix}/${item}` : item;
            try {
              const stat = fs.statSync(full);
              if (stat.isDirectory()) {
                entries.push({ name: item, type: 'dir', path: rel });
                if (args.recursive && depth < 4) walk(full, rel, depth + 1);
              } else {
                entries.push({ name: item, type: 'file', path: rel, size: stat.size });
              }
            } catch {}
          }
        }

        walk(dirPath, args.dir_path || '', 0);
        return { entries, total: entries.length, truncated: entries.length >= 500 };
      },
    },
  ],
};
