/**
 * Codebase Scanner
 * 
 * Walks a project directory and extracts structural information:
 * - Files with line counts and function counts
 * - Exported functions, components, hooks, classes
 * - Import relationships (who imports whom)
 * - API routes (Next.js App Router)
 * - External API calls (fetch, SDK usage)
 * - Database operations (Drizzle, SQL)
 * - Pages and their component trees
 */

import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileInfo {
  path: string;           // Relative to project root
  name: string;
  extension: string;
  lines: number;
  size: number;
  type: 'page' | 'api_route' | 'component' | 'hook' | 'utility' | 'config' | 'schema' | 'style' | 'test' | 'other';
  exports: ExportInfo[];
  imports: ImportInfo[];
  externalCalls: ExternalCall[];
  dbOperations: string[];
}

export interface ExportInfo {
  name: string;
  kind: 'function' | 'component' | 'hook' | 'class' | 'constant' | 'type' | 'default';
  line: number;
  isDefault: boolean;
  params?: string;
  description?: string;
}

export interface ImportInfo {
  source: string;          // The module path
  names: string[];         // Named imports
  isDefault: boolean;
  isExternal: boolean;     // node_modules vs local
}

export interface ExternalCall {
  service: string;         // 'fetch', 'supabase', 'openai', etc.
  detail: string;          // URL pattern or method
  line: number;
}

export interface ApiRoute {
  path: string;            // /api/v1/chat
  methods: string[];       // GET, POST, etc.
  file: string;
  handlers: string[];
}

export interface PageRoute {
  path: string;            // /work/contacts
  file: string;
  components: string[];
}

export interface SystemModule {
  name: string;
  description: string;
  shortDescription: string;    // One-liner for graph nodes
  files: string[];
  exports: { name: string; kind: string; file: string }[];
  dependencies: string[];  // Other modules this one depends on
  externalServices: string[];
  fileTypeSummary: Record<string, number>;  // e.g. { component: 5, hook: 2 }
  keyExports: string[];  // Most important export names for quick understanding
}

export interface CodebaseAnalysis {
  scanned_at: string;
  project_root: string;
  stats: {
    total_files: number;
    total_lines: number;
    total_functions: number;
    total_components: number;
    total_api_routes: number;
    total_pages: number;
    total_external_services: number;
    file_types: Record<string, number>;
  };
  files: FileInfo[];
  api_routes: ApiRoute[];
  pages: PageRoute[];
  modules: SystemModule[];
  external_services: { name: string; usage_count: number; files: string[] }[];
  dependency_edges: { from: string; to: string; imports: string[] }[];
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', '.pglite',
  '.local_storage', 'coverage', '__pycache__', '.cache',
]);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export async function scanCodebase(projectRoot: string, srcDir?: string): Promise<CodebaseAnalysis> {
  const scanRoot = srcDir ? path.join(projectRoot, srcDir) : projectRoot;
  const files: FileInfo[] = [];

  walkDir(scanRoot, projectRoot, files);

  // Extract high-level structures
  const apiRoutes = extractApiRoutes(files);
  const pages = extractPages(files, projectRoot);
  const depEdges = buildDependencyEdges(files);
  const externalServices = aggregateExternalServices(files);
  const modules = inferModules(files, projectRoot);

  const stats = {
    total_files: files.length,
    total_lines: files.reduce((sum, f) => sum + f.lines, 0),
    total_functions: files.reduce((sum, f) => sum + f.exports.filter(e => e.kind === 'function' || e.kind === 'hook').length, 0),
    total_components: files.reduce((sum, f) => sum + f.exports.filter(e => e.kind === 'component').length, 0),
    total_api_routes: apiRoutes.length,
    total_pages: pages.length,
    total_external_services: externalServices.length,
    file_types: {} as Record<string, number>,
  };

  for (const f of files) {
    stats.file_types[f.type] = (stats.file_types[f.type] || 0) + 1;
  }

  return {
    scanned_at: new Date().toISOString(),
    project_root: projectRoot,
    stats,
    files,
    api_routes: apiRoutes,
    pages,
    modules,
    external_services: externalServices,
    dependency_edges: depEdges,
  };
}

function walkDir(dir: string, projectRoot: string, results: FileInfo[]): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, projectRoot, results);
    } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      const info = analyzeFile(fullPath, projectRoot);
      if (info) results.push(info);
    }
  }
}

function analyzeFile(filePath: string, projectRoot: string): FileInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const ext = path.extname(filePath);
    const name = path.basename(filePath);

    return {
      path: relativePath,
      name,
      extension: ext,
      lines: lines.length,
      size: content.length,
      type: classifyFile(relativePath, content),
      exports: extractExports(content, lines),
      imports: extractImports(content),
      externalCalls: extractExternalCalls(content, lines),
      dbOperations: extractDbOperations(content),
    };
  } catch {
    return null;
  }
}

// ─── File Classification ────────────────────────────────────────────────────

function classifyFile(relativePath: string, content: string): FileInfo['type'] {
  const p = relativePath.toLowerCase();

  // API routes: Next.js app router, Hono/Express route files, or files in routes/ dirs
  if (p.includes('/api/') && (p.endsWith('route.ts') || p.endsWith('route.js'))) return 'api_route';
  if (p.includes('/routes/') && !p.includes('node_modules')) return 'api_route';
  if (content.match(/new\s+Hono\s*\(/) || content.match(/app\.(get|post|patch|put|delete)\s*\(/)) {
    if (p.includes('/routes/') || p.includes('/api/')) return 'api_route';
  }

  // Pages / Views
  if (p.endsWith('page.tsx') || p.endsWith('page.ts') || p.endsWith('page.jsx')) return 'page';
  if (p.includes('/views/') || p.includes('/pages/')) return 'page';

  // Tests
  if (p.includes('.test.') || p.includes('.spec.') || p.includes('__test__')) return 'test';

  // Schemas
  if (p.includes('schema') || p.endsWith('.schema.ts') || p.includes('/types')) return 'schema';

  // Styles
  if (p.endsWith('.css') || p.endsWith('.scss')) return 'style';

  // Config
  if (p.endsWith('.config.ts') || p.endsWith('.config.js') || p.endsWith('.config.mjs')) return 'config';
  if (p.includes('tsconfig') || p.includes('tailwind') || p.includes('postcss') || p.includes('vite.config')) return 'config';

  // Hooks
  if (p.includes('/hooks/') || content.match(/^export\s+(default\s+)?function\s+use[A-Z]/m)) return 'hook';

  // Components (React components that export PascalCase functions)
  if (p.includes('/components/') || (
    content.match(/export\s+(default\s+)?function\s+[A-Z]/) &&
    (p.endsWith('.tsx') || p.endsWith('.jsx'))
  )) return 'component';

  // Utilities
  if (p.includes('/lib/') || p.includes('/utils/') || p.includes('/helpers/')) return 'utility';

  // Integrations
  if (p.includes('/integrations/') || p.includes('/plugins/')) return 'utility';

  return 'other';
}

// ─── Export Extraction ──────────────────────────────────────────────────────

function extractExports(content: string, lines: string[]): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // Named function exports
  const funcPattern = /^export\s+(async\s+)?function\s+(\w+)\s*(\([^)]*\))?/gm;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    const name = match[2];
    const lineNum = content.substring(0, match.index).split('\n').length;
    exports.push({
      name,
      kind: name.startsWith('use') && name[3]?.toUpperCase() === name[3] ? 'hook' :
            name[0]?.toUpperCase() === name[0] ? 'component' : 'function',
      line: lineNum,
      isDefault: false,
      params: match[3]?.trim(),
    });
  }

  // Export default function
  const defaultFuncPattern = /^export\s+default\s+(async\s+)?function\s+(\w+)?/gm;
  while ((match = defaultFuncPattern.exec(content)) !== null) {
    const name = match[2] || 'default';
    const lineNum = content.substring(0, match.index).split('\n').length;
    exports.push({
      name,
      kind: name[0]?.toUpperCase() === name[0] ? 'component' : 'function',
      line: lineNum,
      isDefault: true,
    });
  }

  // Const exports (arrow functions, objects)
  const constPattern = /^export\s+const\s+(\w+)\s*[=:]/gm;
  while ((match = constPattern.exec(content)) !== null) {
    const name = match[1];
    const lineNum = content.substring(0, match.index).split('\n').length;
    // Check if it's a component (starts with uppercase) or a hook
    const afterDecl = content.substring(match.index, match.index + 200);
    const isArrowComponent = /=\s*(\([^)]*\)|)\s*=>/.test(afterDecl) && name[0]?.toUpperCase() === name[0];
    exports.push({
      name,
      kind: name.startsWith('use') ? 'hook' : isArrowComponent ? 'component' : 'constant',
      line: lineNum,
      isDefault: false,
    });
  }

  // Type/interface exports
  const typePattern = /^export\s+(type|interface)\s+(\w+)/gm;
  while ((match = typePattern.exec(content)) !== null) {
    exports.push({
      name: match[2],
      kind: 'type',
      line: content.substring(0, match.index).split('\n').length,
      isDefault: false,
    });
  }

  // Class exports
  const classPattern = /^export\s+(default\s+)?class\s+(\w+)/gm;
  while ((match = classPattern.exec(content)) !== null) {
    exports.push({
      name: match[2],
      kind: 'class',
      line: content.substring(0, match.index).split('\n').length,
      isDefault: !!match[1],
    });
  }

  return exports;
}

// ─── Import Extraction ──────────────────────────────────────────────────────

function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importPattern = /^import\s+(?:(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+)?['"]([@\w./-]+)['"]/gm;

  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const defaultImport = match[1];
    const namedImports = match[2]?.split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean) || [];
    const source = match[3];

    const names = defaultImport ? [defaultImport, ...namedImports] : namedImports;
    const isExternal = !source.startsWith('.') && !source.startsWith('@/') && !source.startsWith('~/');

    imports.push({ source, names, isDefault: !!defaultImport, isExternal });
  }

  return imports;
}

// ─── External Call Detection ────────────────────────────────────────────────

function extractExternalCalls(content: string, lines: string[]): ExternalCall[] {
  const calls: ExternalCall[] = [];

  // fetch() calls
  const fetchPattern = /fetch\s*\(\s*[`'"](https?:\/\/[^`'"]+)/g;
  let match;
  while ((match = fetchPattern.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    const url = match[1];
    const service = identifyService(url);
    calls.push({ service, detail: url.substring(0, 80), line });
  }

  // Common SDK patterns
  const sdkPatterns: [RegExp, string][] = [
    [/supabase\.(from|storage|auth|rpc)\s*\(/g, 'supabase'],
    [/openai\.(chat|completions|embeddings|audio)/g, 'openai'],
    [/anthropic\.(messages|completions)/g, 'anthropic'],
    [/new\s+OpenAI\s*\(/g, 'openai'],
    [/createClient\s*<.*Database/g, 'supabase'],
    [/helicone/gi, 'helicone'],
    [/deepgram/gi, 'deepgram'],
    [/sentry\./gi, 'sentry'],
  ];

  for (const [pattern, service] of sdkPatterns) {
    while ((match = pattern.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      calls.push({ service, detail: match[0].substring(0, 60), line });
    }
  }

  return calls;
}

function identifyService(url: string): string {
  if (url.includes('api.github.com')) return 'github';
  if (url.includes('api.vercel.com')) return 'vercel';
  if (url.includes('supabase.co') || url.includes('supabase.io')) return 'supabase';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('api.anthropic.com')) return 'anthropic';
  if (url.includes('api.helicone.ai')) return 'helicone';
  if (url.includes('api.deepgram.com')) return 'deepgram';
  if (url.includes('sentry.io')) return 'sentry';
  if (url.includes('upstash.io')) return 'upstash';
  if (url.includes('cloudflare.com')) return 'cloudflare';
  if (url.includes('amazonaws.com')) return 'aws';
  return new URL(url).hostname.split('.').slice(-2).join('.');
}

// ─── DB Operation Detection ─────────────────────────────────────────────────

function extractDbOperations(content: string): string[] {
  const ops: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\.select\s*\(/g, 'SELECT'],
    [/\.insert\s*\(/g, 'INSERT'],
    [/\.update\s*\(/g, 'UPDATE'],
    [/\.delete\s*\(/g, 'DELETE'],
    [/pool\.query\s*\(/g, 'RAW_QUERY'],
    [/\.execute\s*\(/g, 'EXECUTE'],
    [/drizzle|pgTable|createTable/g, 'SCHEMA'],
  ];

  for (const [pattern, op] of patterns) {
    if (pattern.test(content)) ops.push(op);
  }
  return [...new Set(ops)];
}

// ─── High-Level Structure Extraction ────────────────────────────────────────

function extractApiRoutes(files: FileInfo[]): ApiRoute[] {
  return files
    .filter(f => f.type === 'api_route')
    .map(f => {
      // Try Next.js pattern first: exported GET, POST, etc.
      let methods = f.exports
        .filter(e => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(e.name))
        .map(e => e.name);

      // If no explicit method exports, scan file content for Hono/Express patterns
      if (methods.length === 0) {
        const content = (() => {
          try { return require('fs').readFileSync(require('path').resolve(f.path), 'utf-8'); } catch { return ''; }
        })();
        const methodPatterns = ['get', 'post', 'put', 'patch', 'delete'];
        methods = methodPatterns
          .filter(m => new RegExp(`app\\.${m}\\s*\\(`).test(content))
          .map(m => m.toUpperCase());
      }

      // Generate route path from file path
      let urlPath = f.path;
      // Next.js app router pattern
      urlPath = urlPath
        .replace(/^apps\/web\/src\/app/, '')
        .replace(/\/route\.(ts|js)$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1');
      // Generic routes/ directory pattern (e.g., server/routes/backlog.ts → /api/v1/backlog)
      if (f.path.includes('/routes/')) {
        const routeName = f.path.split('/routes/').pop()?.replace(/\.(ts|js)$/, '') || '';
        urlPath = `/api/v1/${routeName}`;
      }

      if (methods.length === 0) methods = ['GET']; // Default fallback

      return { path: urlPath, methods, file: f.path, handlers: methods };
    });
}

function extractPages(files: FileInfo[], projectRoot: string): PageRoute[] {
  return files
    .filter(f => f.type === 'page')
    .map(f => {
      const urlPath = f.path
        .replace(/^apps\/web\/src\/app/, '')
        .replace(/\/page\.(tsx?|jsx?)$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1') || '/';
      const components = f.imports
        .filter(i => !i.isExternal)
        .flatMap(i => i.names)
        .filter(n => n[0]?.toUpperCase() === n[0]);
      return { path: urlPath, file: f.path, components };
    });
}

function buildDependencyEdges(files: FileInfo[]): { from: string; to: string; imports: string[] }[] {
  const edges: { from: string; to: string; imports: string[] }[] = [];

  for (const file of files) {
    for (const imp of file.imports) {
      if (!imp.isExternal && imp.source.startsWith('.')) {
        // Resolve relative path
        const fromDir = path.dirname(file.path);
        let resolved = path.posix.join(fromDir, imp.source);
        // Try to find matching file
        const target = files.find(f =>
          f.path === resolved ||
          f.path === resolved + '.ts' ||
          f.path === resolved + '.tsx' ||
          f.path === resolved + '/index.ts' ||
          f.path === resolved + '/index.tsx'
        );
        if (target) {
          edges.push({ from: file.path, to: target.path, imports: imp.names });
        }
      }
    }
  }

  return edges;
}

function aggregateExternalServices(files: FileInfo[]): { name: string; usage_count: number; files: string[] }[] {
  const services: Record<string, Set<string>> = {};

  for (const file of files) {
    for (const call of file.externalCalls) {
      if (!services[call.service]) services[call.service] = new Set();
      services[call.service].add(file.path);
    }
  }

  return Object.entries(services)
    .map(([name, fileSet]) => ({ name, usage_count: fileSet.size, files: [...fileSet] }))
    .sort((a, b) => b.usage_count - a.usage_count);
}

function inferModules(files: FileInfo[], projectRoot: string): SystemModule[] {
  // Generic directory-based grouping that works with any project structure.
  // Strategy: group by the deepest meaningful directory (2-3 levels deep).
  // If a directory has 1-2 files, merge up to parent. If it has many, it's its own module.
  const groups: Record<string, FileInfo[]> = {};

  for (const file of files) {
    const parts = file.path.split('/');
    let key: string;

    if (parts.length === 1) {
      key = 'root';
    } else if (parts.length === 2) {
      key = parts[0];
    } else {
      const genericDirs = new Set(['src', 'lib', 'app', 'source', 'pkg']);
      if (genericDirs.has(parts[1]) && parts.length > 3) {
        key = parts.slice(0, 3).join('/');
      } else {
        key = parts.slice(0, 2).join('/');
      }
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  }

  // Merge tiny groups (1-2 files) into their parent if a parent group exists
  const mergedGroups: Record<string, FileInfo[]> = {};
  const sortedKeys = Object.keys(groups).sort();

  for (const key of sortedKeys) {
    const groupFiles = groups[key];
    if (groupFiles.length <= 2 && key.includes('/')) {
      const parentKey = key.split('/').slice(0, -1).join('/');
      if (groups[parentKey] && groups[parentKey].length > 0) {
        if (!mergedGroups[parentKey]) mergedGroups[parentKey] = [...(groups[parentKey] || [])];
        mergedGroups[parentKey].push(...groupFiles);
        continue;
      }
    }
    if (!mergedGroups[key]) mergedGroups[key] = [];
    mergedGroups[key].push(...groupFiles);
  }

  // Remove empty groups and build modules
  return Object.entries(mergedGroups)
    .filter(([_, moduleFiles]) => moduleFiles.length > 0)
    .map(([dirPath, moduleFiles]) => {
      const allExports = moduleFiles.flatMap(f =>
        f.exports.map(e => ({ name: e.name, kind: e.kind, file: f.path }))
      );
      const allExternalServices = [...new Set(
        moduleFiles.flatMap(f => f.externalCalls.map(c => c.service))
      )];
      const deps = [...new Set(
        moduleFiles.flatMap(f =>
          f.imports.filter(i => !i.isExternal && !i.source.startsWith('.')).map(i => i.source)
        )
      )];

      // File type breakdown for description generation
      const fileTypeSummary: Record<string, number> = {};
      for (const f of moduleFiles) {
        fileTypeSummary[f.type] = (fileTypeSummary[f.type] || 0) + 1;
      }

      // Key exports — the most "important" ones (components, main functions, not types/constants)
      const keyExports = allExports
        .filter(e => e.kind === 'function' || e.kind === 'component' || e.kind === 'hook' || e.kind === 'class')
        .map(e => e.name)
        .slice(0, 8);

      const name = generateModuleName(dirPath);

      // Generate rich descriptions
      const { description, shortDescription } = generateModuleDescription(
        name, dirPath, moduleFiles, allExports, allExternalServices, fileTypeSummary, keyExports
      );

      return {
        name,
        description,
        shortDescription,
        files: moduleFiles.map(f => f.path),
        exports: allExports.filter(e => e.kind !== 'type').slice(0, 50),
        dependencies: deps,
        externalServices: allExternalServices,
        fileTypeSummary,
        keyExports,
      };
    })
    .sort((a, b) => b.files.length - a.files.length);
}

// ─── Module Description Generation ──────────────────────────────────────────
// Creates plain-English descriptions from code analysis — no special comments needed.

function generateModuleDescription(
  name: string,
  dirPath: string,
  moduleFiles: FileInfo[],
  allExports: { name: string; kind: string; file: string }[],
  externalServices: string[],
  fileTypeSummary: Record<string, number>,
  keyExports: string[],
): { description: string; shortDescription: string } {
  const parts: string[] = [];
  const totalFiles = moduleFiles.length;
  const totalLines = moduleFiles.reduce((s, f) => s + f.lines, 0);
  const componentCount = fileTypeSummary['component'] || 0;
  const hookCount = fileTypeSummary['hook'] || 0;
  const routeCount = fileTypeSummary['api_route'] || 0;
  const pageCount = fileTypeSummary['page'] || 0;
  const utilCount = fileTypeSummary['utility'] || 0;
  const configCount = fileTypeSummary['config'] || 0;
  const schemaCount = fileTypeSummary['schema'] || 0;

  const dbOps = [...new Set(moduleFiles.flatMap(f => f.dbOperations))];
  const hasDb = dbOps.length > 0;

  const lowerName = name.toLowerCase();
  const lowerDir = dirPath.toLowerCase();

  // ── Build the opening sentence based on what this module IS ──

  if (routeCount > 0 && lowerName.includes('route')) {
    // API route module
    const routeNames = moduleFiles
      .filter(f => f.type === 'api_route')
      .map(f => f.name.replace(/\.(ts|js)$/, ''))
      .filter(n => n !== 'index');
    const short = `Handles API requests for ${routeNames.length} endpoints`;
    parts.push(`This module handles all the HTTP API endpoints for the application.`);
    if (routeNames.length > 0) {
      parts.push(`It contains ${routeCount} route file${routeCount > 1 ? 's' : ''} covering: ${routeNames.slice(0, 6).join(', ')}${routeNames.length > 6 ? `, and ${routeNames.length - 6} more` : ''}.`);
    }
    parts.push(`Routes receive HTTP requests, process them, and return JSON responses.`);
    if (hasDb) parts.push(`It reads and writes data to the persistence layer.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (pageCount > 0 || (lowerName.includes('view') && componentCount === 0)) {
    // Views / pages module
    const viewNames = moduleFiles
      .filter(f => f.type === 'page')
      .map(f => f.name.replace(/\.(tsx?|jsx?)$/, ''));
    const short = `${viewNames.length} main screens of the web app`;
    parts.push(`These are the main pages of the web application - what users see and interact with.`);
    if (viewNames.length > 0) {
      parts.push(`Includes ${viewNames.length} screens: ${viewNames.slice(0, 6).join(', ')}${viewNames.length > 6 ? `, and ${viewNames.length - 6} more` : ''}.`);
    }
    parts.push(`Each page fetches data from the API and renders interactive UI.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (componentCount > 0 && (lowerName.includes('component') || lowerDir.includes('component'))) {
    // UI components module
    const compNames = allExports.filter(e => e.kind === 'component').map(e => e.name);
    const short = `Reusable UI building blocks (${compNames.length} components)`;
    parts.push(`A library of reusable UI components that the pages are built from.`);
    if (compNames.length > 0) {
      parts.push(`Contains ${compNames.length} component${compNames.length > 1 ? 's' : ''}: ${compNames.slice(0, 5).join(', ')}${compNames.length > 5 ? '...' : ''}.`);
    }
    parts.push(`These handle individual pieces of the interface like buttons, panels, cards, and visualizations.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (hookCount > 0 && (lowerName.includes('hook') || lowerDir.includes('hook'))) {
    // Hooks module
    const hookNames = allExports.filter(e => e.kind === 'hook').map(e => e.name);
    const short = `Shared logic hooks (${hookNames.length} hooks)`;
    parts.push(`Custom React hooks that provide shared logic and state management across the UI.`);
    if (hookNames.length > 0) {
      parts.push(`Includes: ${hookNames.slice(0, 5).join(', ')}.`);
    }

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerDir.includes('integration') || lowerDir.includes('plugin')) {
    // Integrations module
    const short = `Connects to external services (${externalServices.length > 0 ? externalServices.join(', ') : 'plugins'})`;
    parts.push(`Handles connections to external tools and services.`);
    if (externalServices.length > 0) {
      parts.push(`Integrates with: ${externalServices.join(', ')}.`);
    }
    parts.push(`Each integration can be configured with API credentials and provides data to the rest of the application.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerDir.includes('analyzer') || lowerDir.includes('scanner')) {
    const short = `Scans and analyzes project source code`;
    parts.push(`Scans the project's source code to extract structure and metadata.`);
    parts.push(`Identifies files, functions, imports, API routes, database operations, and external service usage.`);
    parts.push(`This powers the codebase visualization and architecture graphs.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (schemaCount > 0 || lowerDir.includes('schema') || lowerDir.includes('types') || lowerDir.includes('shared')) {
    const typeCount = allExports.filter(e => e.kind === 'type').length;
    const short = `Shared type definitions and data structures`;
    parts.push(`Contains shared type definitions and data structures used across the project.`);
    if (typeCount > 0) parts.push(`Defines ${typeCount} types and interfaces.`);
    parts.push(`This ensures the server, UI, and other modules all agree on the shape of data.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerName.includes('server') && !lowerName.includes('route')) {
    const short = `Core HTTP server and application entry point`;
    parts.push(`The core server that runs the application.`);
    parts.push(`It starts the HTTP server, mounts API routes, and manages the application lifecycle.`);
    if (externalServices.length > 0) {
      parts.push(`Connects to: ${externalServices.join(', ')}.`);
    }

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerDir.includes('store') || lowerDir.includes('data')) {
    const short = `Data persistence and storage layer`;
    parts.push(`The data persistence layer that stores and retrieves all project information.`);
    if (hasDb) {
      parts.push(`Performs database operations: ${dbOps.join(', ')}.`);
    } else {
      parts.push(`Manages reading and writing JSON data files.`);
    }

    return { description: parts.join(' '), shortDescription: short };
  }

  if (utilCount > 0 || lowerDir.includes('util') || lowerDir.includes('lib') || lowerDir.includes('helper')) {
    const funcNames = allExports.filter(e => e.kind === 'function').map(e => e.name);
    const short = `Helper functions and utilities`;
    parts.push(`Utility functions and helpers used by other parts of the application.`);
    if (funcNames.length > 0) {
      parts.push(`Key functions: ${funcNames.slice(0, 5).join(', ')}.`);
    }

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerDir.includes('cli') || lowerDir.includes('command')) {
    const short = `Command-line interface`;
    parts.push(`Provides a command-line interface for interacting with the application from the terminal.`);
    if (keyExports.length > 0) {
      parts.push(`Commands include: ${keyExports.slice(0, 5).join(', ')}.`);
    }

    return { description: parts.join(' '), shortDescription: short };
  }

  if (configCount > 0) {
    const short = `Project configuration files`;
    parts.push(`Configuration files that control how the project is built, tested, and deployed.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  if (lowerDir === 'root') {
    const short = `Root-level project files`;
    parts.push(`Top-level project files: configuration, entry points, and setup.`);

    return { description: parts.join(' '), shortDescription: short };
  }

  // Fallback — generate from what we know
  const funcCount = allExports.filter(e => e.kind === 'function' || e.kind === 'hook').length;
  const short = `${totalFiles} files, ${funcCount > 0 ? `${funcCount} functions` : `${totalLines.toLocaleString()} lines`}`;
  parts.push(`This module contains ${totalFiles} files with ${totalLines.toLocaleString()} lines of code.`);
  if (keyExports.length > 0) {
    parts.push(`Key exports: ${keyExports.slice(0, 5).join(', ')}.`);
  }
  if (externalServices.length > 0) {
    parts.push(`Uses external services: ${externalServices.join(', ')}.`);
  }

  return { description: parts.join(' '), shortDescription: short };
}

// ─── Edge Relationship Labels ───────────────────────────────────────────────
// Generates plain-English relationship descriptions between modules.

export function generateEdgeLabel(
  sourceModule: SystemModule,
  targetModule: SystemModule,
  importNames: string[],
): string {
  const targetLower = targetModule.name.toLowerCase();
  const sourceLower = sourceModule.name.toLowerCase();

  // What kind of things are being imported?
  const targetExportKinds = new Map<string, string>();
  for (const exp of targetModule.exports) {
    targetExportKinds.set(exp.name, exp.kind);
  }

  const importedKinds: Record<string, number> = {};
  for (const imp of importNames) {
    const kind = targetExportKinds.get(imp) || 'unknown';
    importedKinds[kind] = (importedKinds[kind] || 0) + 1;
  }

  // Describe the relationship based on what's being used
  if (targetLower.includes('store') || targetLower.includes('data')) {
    return 'reads and writes project data';
  }
  if (targetLower.includes('route') && targetLower.includes('api')) {
    return 'handles API requests through';
  }
  if (targetLower.includes('component')) {
    return 'uses UI components from';
  }
  if (targetLower.includes('hook')) {
    return 'uses shared logic from';
  }
  if (targetLower.includes('integration') || targetLower.includes('plugin')) {
    return 'connects to external services via';
  }
  if (targetLower.includes('schema') || targetLower.includes('type') || targetLower.includes('shared')) {
    return 'uses type definitions from';
  }
  if (targetLower.includes('util') || targetLower.includes('lib') || targetLower.includes('helper')) {
    return 'uses helper functions from';
  }
  if (targetLower.includes('analyzer') || targetLower.includes('scanner')) {
    return 'triggers code analysis via';
  }
  if (targetLower.includes('server') && !targetLower.includes('route')) {
    if (sourceLower.includes('route')) return 'routes are registered on';
    return 'depends on server infrastructure from';
  }
  if (targetLower.includes('view') || targetLower.includes('page')) {
    return 'renders pages from';
  }

  // Fallback based on imported kinds
  if (importedKinds['component'] > 0) return 'renders components from';
  if (importedKinds['hook'] > 0) return 'uses hooks from';
  if (importedKinds['function'] > 0) return `uses ${importNames.length} function${importNames.length > 1 ? 's' : ''} from`;
  if (importedKinds['class'] > 0) return 'extends classes from';
  if (importedKinds['constant'] > 0) return 'reads configuration from';

  return `depends on (${importNames.length} import${importNames.length > 1 ? 's' : ''})`;
}

function generateModuleName(dirPath: string): string {
  // Turn directory paths into readable names:
  // "server/routes" → "Server Routes"
  // "ui/src/views" → "UI Views"
  // "ui/src/components" → "UI Components"
  // "server/integrations" → "Server Integrations"
  // "shared" → "Shared"
  // "cli" → "CLI"
  const parts = dirPath.split('/').filter(p => p !== 'src');
  return parts
    .map(p => {
      if (p === 'ui') return 'UI';
      if (p === 'cli') return 'CLI';
      if (p === 'api') return 'API';
      if (p === 'ws') return 'WebSocket';
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(' ');
}
