import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { scanCodebase, type CodebaseAnalysis } from '../analyzer/scanner.js';

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
  // Default: scan parent directory (the project root above dev-track)
  const projectRoot = body.project_root || path.resolve(process.cwd(), '..');
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
