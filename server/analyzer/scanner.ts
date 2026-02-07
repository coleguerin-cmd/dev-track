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
  files: string[];
  exports: { name: string; kind: string; file: string }[];
  dependencies: string[];  // Other modules this one depends on
  externalServices: string[];
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
  if (p.includes('/api/') && (p.endsWith('route.ts') || p.endsWith('route.js'))) return 'api_route';
  if (p.endsWith('page.tsx') || p.endsWith('page.ts') || p.endsWith('page.jsx')) return 'page';
  if (p.includes('.test.') || p.includes('.spec.') || p.includes('__test__')) return 'test';
  if (p.includes('schema') || p.endsWith('.schema.ts')) return 'schema';
  if (p.endsWith('.css') || p.endsWith('.scss')) return 'style';
  if (p.endsWith('.config.ts') || p.endsWith('.config.js') || p.endsWith('.config.mjs')) return 'config';
  if (p.includes('/hooks/') || content.match(/^export\s+(default\s+)?function\s+use[A-Z]/m)) return 'hook';
  if (p.includes('/components/') || content.match(/export\s+(default\s+)?function\s+[A-Z]/)) return 'component';
  if (p.includes('/lib/') || p.includes('/utils/') || p.includes('/helpers/')) return 'utility';
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
      const methods = f.exports
        .filter(e => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(e.name))
        .map(e => e.name);
      const urlPath = f.path
        .replace(/^apps\/web\/src\/app/, '')
        .replace(/\/route\.(ts|js)$/, '')
        .replace(/\[([^\]]+)\]/g, ':$1');
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
  // Group files by top-level directory structure
  const groups: Record<string, FileInfo[]> = {};

  for (const file of files) {
    const parts = file.path.split('/');
    // Find a meaningful grouping key
    let key = 'other';
    if (parts.includes('lib')) {
      const libIdx = parts.indexOf('lib');
      key = parts.slice(0, libIdx + 2).join('/');
    } else if (parts.includes('components')) {
      const compIdx = parts.indexOf('components');
      key = parts.slice(0, compIdx + 2).join('/');
    } else if (parts.includes('app') && parts.includes('api')) {
      key = 'api';
    } else if (parts.includes('app')) {
      key = 'pages';
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  }

  return Object.entries(groups)
    .filter(([_, files]) => files.length > 0)
    .map(([name, moduleFiles]) => {
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

      return {
        name: name.split('/').pop() || name,
        description: `${moduleFiles.length} files, ${allExports.filter(e => e.kind === 'function' || e.kind === 'hook').length} functions`,
        files: moduleFiles.map(f => f.path),
        exports: allExports.filter(e => e.kind !== 'type').slice(0, 50),
        dependencies: deps,
        externalServices: allExternalServices,
      };
    })
    .sort((a, b) => b.files.length - a.files.length);
}
