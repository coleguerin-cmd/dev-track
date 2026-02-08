import fs from 'fs';
import path from 'path';
import { getDataDir, getProjectRoot } from '../../project-config.js';
import type { ToolModule } from './types.js';

function getAnalysis(): any | null {
  const p = path.join(getDataDir(), 'codebase/analysis.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export const codebaseTools: ToolModule = {
  domain: 'codebase',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'get_codebase_stats',
        description: 'Get codebase statistics (total files, lines, functions, components, etc.)',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Getting codebase stats',
      execute: async () => {
        const analysis = getAnalysis();
        if (!analysis) return { error: 'No scan data. Run a codebase scan first via the Codebase view.' };
        return { stats: analysis.stats, scanned_at: analysis.scanned_at };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_modules',
        description: 'Get all system modules with their descriptions, files, and dependencies',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Loading modules',
      execute: async () => {
        const analysis = getAnalysis();
        if (!analysis) return { error: 'No scan data.' };
        return { modules: analysis.modules };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'search_codebase',
        description: 'Search across files, functions, routes, and pages in the codebase',
        parameters: { type: 'object', properties: {
          query: { type: 'string', description: 'Search query' },
        }, required: ['query'] },
      }},
      label: 'Searching codebase',
      execute: async (args) => {
        const analysis = getAnalysis();
        if (!analysis) return { error: 'No scan data.' };
        const q = args.query.toLowerCase();
        const results: any[] = [];
        for (const file of analysis.files) {
          if (file.path.toLowerCase().includes(q)) results.push({ type: 'file', name: file.name, path: file.path });
          for (const exp of file.exports) {
            if (exp.name.toLowerCase().includes(q)) results.push({ type: exp.kind, name: exp.name, file: file.path });
          }
        }
        return { results: results.slice(0, 50), total: results.length };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_file_details',
        description: 'Get detailed information about a specific file from scan data (exports, imports, dependencies)',
        parameters: { type: 'object', properties: {
          file_path: { type: 'string', description: 'Relative file path' },
        }, required: ['file_path'] },
      }},
      label: 'Examining file',
      execute: async (args) => {
        const analysis = getAnalysis();
        if (!analysis) return { error: 'No scan data.' };
        const file = analysis.files.find((f: any) => f.path === args.file_path);
        if (!file) return { error: `File ${args.file_path} not found in scan data` };
        return { file };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'scan_codebase',
        description: 'Trigger a fresh codebase scan of the project. Returns summary stats when complete.',
        parameters: { type: 'object', properties: {
          src_dir: { type: 'string', description: 'Subdirectory to scan (optional, default: entire project)' },
        }},
      }},
      label: 'Scanning codebase',
      execute: async (args) => {
        try {
          const { scanCodebase } = await import('../../analyzer/scanner.js');
          const projectRoot = getProjectRoot();
          const analysis = await scanCodebase(projectRoot, args.src_dir || undefined);
          // Save to cache
          const cachePath = path.join(getDataDir(), 'codebase/analysis.json');
          fs.writeFileSync(cachePath, JSON.stringify(analysis, null, 2));
          return { scanned: true, stats: analysis.stats, modules: analysis.modules.length, files: analysis.files.length };
        } catch (err: any) {
          return { error: `Scan failed: ${err.message}` };
        }
      },
    },
  ],
};
