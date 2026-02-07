import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { scanCodebase, generateEdgeLabel, type CodebaseAnalysis } from '../analyzer/scanner.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'codebase', 'analysis.json');

let cachedAnalysis: CodebaseAnalysis | null = null;

function loadCache(): CodebaseAnalysis | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveCache(analysis: CodebaseAnalysis): void {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(analysis, null, 2));
}

const app = new Hono();

// POST /api/v1/codebase/scan — Trigger a fresh scan
app.post('/scan', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // Default: scan the current project (cwd). When dev-track lives inside another
  // project as .dev-track/, pass project_root explicitly to scan the host project.
  const projectRoot = body.project_root || process.cwd();
  const srcDir = body.src_dir; // Optional: scan only a subdirectory

  console.log(`[codebase] Scanning ${projectRoot}${srcDir ? `/${srcDir}` : ''}...`);
  const startTime = Date.now();

  const analysis = await scanCodebase(projectRoot, srcDir);
  cachedAnalysis = analysis;
  saveCache(analysis);

  const duration = Date.now() - startTime;
  console.log(`[codebase] Scan complete: ${analysis.stats.total_files} files, ${analysis.stats.total_lines} lines in ${duration}ms`);

  return c.json({
    ok: true,
    data: {
      stats: analysis.stats,
      scanned_at: analysis.scanned_at,
      duration_ms: duration,
    },
  });
});

// GET /api/v1/codebase/stats — Quick stats
app.get('/stats', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: null });
  return c.json({
    ok: true,
    data: {
      stats: analysis.stats,
      scanned_at: analysis.scanned_at,
    },
  });
});

// GET /api/v1/codebase/files — All files with metadata
app.get('/files', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { files: [] } });

  const type = c.req.query('type'); // page, api_route, component, etc.
  const search = c.req.query('search')?.toLowerCase();

  let files = analysis.files;
  if (type) files = files.filter(f => f.type === type);
  if (search) files = files.filter(f =>
    f.path.toLowerCase().includes(search) ||
    f.exports.some(e => e.name.toLowerCase().includes(search))
  );

  // Return simplified for list view
  return c.json({
    ok: true,
    data: {
      files: files.map(f => ({
        path: f.path,
        name: f.name,
        type: f.type,
        lines: f.lines,
        exports_count: f.exports.length,
        external_calls: f.externalCalls.length,
        db_operations: f.dbOperations,
      })),
      total: files.length,
    },
  });
});

// GET /api/v1/codebase/files/:path — File detail
app.get('/files/*', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: false, error: 'No scan data' }, 404);

  const filePath = c.req.path.replace('/api/v1/codebase/files/', '');
  const file = analysis.files.find(f => f.path === filePath);
  if (!file) return c.json({ ok: false, error: 'File not found in scan' }, 404);

  // Find files that import this file
  const importedBy = analysis.dependency_edges
    .filter(e => e.to === filePath)
    .map(e => ({ file: e.from, imports: e.imports }));

  // Find files this file imports
  const dependsOn = analysis.dependency_edges
    .filter(e => e.from === filePath)
    .map(e => ({ file: e.to, imports: e.imports }));

  return c.json({ ok: true, data: { file, imported_by: importedBy, depends_on: dependsOn } });
});

// GET /api/v1/codebase/routes — All API routes
app.get('/routes', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { routes: [] } });
  return c.json({ ok: true, data: { routes: analysis.api_routes } });
});

// GET /api/v1/codebase/pages — All pages
app.get('/pages', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { pages: [] } });
  return c.json({ ok: true, data: { pages: analysis.pages } });
});

// GET /api/v1/codebase/modules — System modules
app.get('/modules', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { modules: [] } });
  return c.json({ ok: true, data: { modules: analysis.modules } });
});

// GET /api/v1/codebase/services — External service usage
app.get('/services', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { services: [] } });
  return c.json({ ok: true, data: { services: analysis.external_services } });
});

// GET /api/v1/codebase/dependencies — Dependency graph edges
app.get('/dependencies', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { edges: [] } });

  const file = c.req.query('file'); // Optional: edges for a specific file
  let edges = analysis.dependency_edges;
  if (file) {
    edges = edges.filter(e => e.from === file || e.to === file);
  }

  return c.json({ ok: true, data: { edges, total: edges.length } });
});

// GET /api/v1/codebase/graph — Pre-computed graph data for react-flow
app.get('/graph', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { nodes: [], edges: [] } });

  const view = c.req.query('view') || 'modules'; // modules | files | routes
  const filterModule = c.req.query('module');

  interface GraphNode {
    id: string;
    type: string;
    data: {
      label: string;
      kind: string;
      lines: number;
      exports: number;
      files?: number;
      services: string[];
      methods?: string[];
      fileType?: string;
      description?: string;
      shortDescription?: string;
      keyExports?: string[];
      fileTypeSummary?: Record<string, number>;
    };
  }

  interface GraphEdge {
    id: string;
    source: string;
    target: string;
    data: { imports: string[]; label: string; relationship?: string };
  }

  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];

  if (view === 'modules') {
    // Module-level architecture graph
    const moduleMap = new Map<string, typeof analysis.modules[0]>();
    for (const mod of analysis.modules) {
      moduleMap.set(mod.name, mod);
    }

    // Build module nodes
    for (const mod of analysis.modules) {
      const totalLines = analysis.files
        .filter(f => mod.files.includes(f.path))
        .reduce((sum, f) => sum + f.lines, 0);

      nodes.push({
        id: mod.name,
        type: 'moduleNode',
        data: {
          label: mod.name,
          kind: inferModuleKind(mod),
          lines: totalLines,
          exports: mod.exports.length,
          files: mod.files.length,
          services: mod.externalServices,
          description: mod.description,
          shortDescription: mod.shortDescription,
          keyExports: mod.keyExports,
          fileTypeSummary: mod.fileTypeSummary,
        },
      });
    }

    // Build inter-module edges from file-level dependency edges
    const moduleEdgeMap = new Map<string, Set<string>>();
    for (const edge of analysis.dependency_edges) {
      const fromModule = analysis.modules.find(m => m.files.includes(edge.from));
      const toModule = analysis.modules.find(m => m.files.includes(edge.to));
      if (fromModule && toModule && fromModule.name !== toModule.name) {
        const key = `${fromModule.name}→${toModule.name}`;
        if (!moduleEdgeMap.has(key)) moduleEdgeMap.set(key, new Set());
        for (const imp of edge.imports) moduleEdgeMap.get(key)!.add(imp);
      }
    }

    for (const [key, imports] of moduleEdgeMap) {
      const [source, target] = key.split('→');
      const sourceMod = moduleMap.get(source);
      const targetMod = moduleMap.get(target);
      const relationship = (sourceMod && targetMod)
        ? generateEdgeLabel(sourceMod, targetMod, [...imports])
        : `${imports.size} imports`;
      edges.push({
        id: `e-${source}-${target}`,
        source,
        target,
        data: { imports: [...imports], label: relationship, relationship },
      });
    }
  } else if (view === 'files') {
    // File-level dependency graph
    let files = analysis.files;
    if (filterModule) {
      const mod = analysis.modules.find(m => m.name === filterModule);
      if (mod) files = files.filter(f => mod.files.includes(f.path));
    }

    for (const file of files) {
      nodes.push({
        id: file.path,
        type: 'fileNode',
        data: {
          label: file.name,
          kind: file.type,
          lines: file.lines,
          exports: file.exports.length,
          services: file.externalCalls.map(c => c.service),
          fileType: file.type,
        },
      });
    }

    let depEdges = analysis.dependency_edges;
    if (filterModule) {
      const filePaths = new Set(files.map(f => f.path));
      depEdges = depEdges.filter(e => filePaths.has(e.from) && filePaths.has(e.to));
    }

    for (const edge of depEdges) {
      edges.push({
        id: `e-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        data: { imports: edge.imports, label: edge.imports.join(', ') },
      });
    }
  } else if (view === 'routes') {
    // API route map
    for (const route of analysis.api_routes) {
      nodes.push({
        id: `route:${route.path}`,
        type: 'routeNode',
        data: {
          label: route.path,
          kind: 'api_route',
          lines: 0,
          exports: route.handlers.length,
          methods: route.methods,
          services: [],
        },
      });

      // Find the handler file and its external services
      const handlerFile = analysis.files.find(f => f.path === route.file);
      if (handlerFile) {
        const fileNodeId = route.file;
        // Add file node if not already added
        if (!nodes.find(n => n.id === fileNodeId)) {
          nodes.push({
            id: fileNodeId,
            type: 'fileNode',
            data: {
              label: handlerFile.name,
              kind: handlerFile.type,
              lines: handlerFile.lines,
              exports: handlerFile.exports.length,
              services: handlerFile.externalCalls.map(c => c.service),
              fileType: handlerFile.type,
            },
          });
        }

        edges.push({
          id: `e-route-${route.path}-${fileNodeId}`,
          source: `route:${route.path}`,
          target: fileNodeId,
          data: { imports: route.handlers, label: route.handlers.join(', ') },
        });

        // Add external service nodes
        const services = [...new Set(handlerFile.externalCalls.map(c => c.service))];
        for (const svc of services) {
          const svcId = `svc:${svc}`;
          if (!nodes.find(n => n.id === svcId)) {
            nodes.push({
              id: svcId,
              type: 'serviceNode',
              data: { label: svc, kind: 'external_service', lines: 0, exports: 0, services: [svc] },
            });
          }
          edges.push({
            id: `e-${fileNodeId}-${svcId}`,
            source: fileNodeId,
            target: svcId,
            data: { imports: [], label: svc },
          });
        }
      }
    }
  }

  return c.json({ ok: true, data: { nodes, edges, view } });
});

function inferModuleKind(mod: { name: string; files: string[]; externalServices: string[] }): string {
  const name = mod.name.toLowerCase();
  if (name.includes('route') || name.includes('api') || name.includes('server')) return 'backend';
  if (name.includes('view') || name.includes('component') || name.includes('page') || name.includes('ui')) return 'frontend';
  if (name.includes('integration') || name.includes('plugin')) return 'integration';
  if (name.includes('data') || name.includes('store') || name.includes('schema')) return 'data';
  if (name.includes('util') || name.includes('lib') || name.includes('shared')) return 'shared';
  if (mod.externalServices.length > 0) return 'integration';
  return 'other';
}

// GET /api/v1/codebase/search — Search across files, functions, routes
app.get('/search', (c) => {
  const analysis = cachedAnalysis || loadCache();
  if (!analysis) return c.json({ ok: true, data: { results: [] } });

  const q = c.req.query('q')?.toLowerCase();
  if (!q) return c.json({ ok: true, data: { results: [] } });

  const results: { type: string; name: string; detail: string; file: string; line?: number }[] = [];

  for (const file of analysis.files) {
    // Search file paths
    if (file.path.toLowerCase().includes(q)) {
      results.push({ type: 'file', name: file.name, detail: file.path, file: file.path });
    }
    // Search exports
    for (const exp of file.exports) {
      if (exp.name.toLowerCase().includes(q)) {
        results.push({ type: exp.kind, name: exp.name, detail: file.path, file: file.path, line: exp.line });
      }
    }
  }

  // Search API routes
  for (const route of analysis.api_routes) {
    if (route.path.toLowerCase().includes(q)) {
      results.push({ type: 'api_route', name: route.path, detail: `${route.methods.join(', ')}`, file: route.file });
    }
  }

  // Search pages
  for (const page of analysis.pages) {
    if (page.path.toLowerCase().includes(q)) {
      results.push({ type: 'page', name: page.path, detail: page.file, file: page.file });
    }
  }

  return c.json({ ok: true, data: { results: results.slice(0, 50), total: results.length } });
});

export default app;
