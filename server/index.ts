import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  setDataDir,
  setProjectRoot,
  setProjectConfig,
  getDataDir,
  getProjectRoot,
  getProjectName,
  getProjectConfig,
  loadRegistry,
  registerProject,
  findAvailablePort,
} from './project-config.js';
import { getStore, reloadStore } from './store.js';
import { setupWebSocket } from './ws.js';
import { startWatcher } from './watcher.js';
import { startScheduler } from './automation/scheduler.js';
import { getAutomationEngine } from './automation/engine.js';

// Route imports — v2 entities
import stateRoutes from './routes/state.js';
import sessionRoutes from './routes/session.js';
import roadmapRoutes from './routes/roadmap.js';
import epicsRoutes from './routes/epics.js';
import milestonesRoutes from './routes/milestones.js';
import releasesRoutes from './routes/releases.js';
import systemsRoutes from './routes/systems.js';
import issuesRoutes from './routes/issues.js';
import changelogRoutes from './routes/changelog.js';
import labelsRoutes from './routes/labels.js';
import automationsRoutes from './routes/automations.js';
import metricsRoutes from './routes/metrics.js';
import docsRoutes from './routes/docs.js';
import configRoutes from './routes/config.js';
import integrationsRoutes from './routes/integrations.js';
import brainRoutes from './routes/brain.js';
import ideasRoutes from './routes/ideas.js';
import activityRoutes from './routes/activity.js';
import codebaseRoutes from './routes/codebase.js';
import gitRoutes from './routes/git.js';
import aiRoutes from './routes/ai.js';
import initRoutes from './routes/init.js';
import auditsRoutes from './routes/audits.js';

// ─── Parse CLI flags ────────────────────────────────────────────────────────

function parseArgs(): { dataDir?: string; port?: number; projectRoot?: string } {
  const args = process.argv.slice(2);
  const result: { dataDir?: string; port?: number; projectRoot?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data-dir' && args[i + 1]) {
      result.dataDir = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      result.port = parseInt(args[++i]);
    } else if (args[i] === '--project-root' && args[i + 1]) {
      result.projectRoot = args[++i];
    }
  }

  return result;
}

const cliArgs = parseArgs();

// Apply CLI flags (highest priority)
if (cliArgs.dataDir) setDataDir(cliArgs.dataDir);
if (cliArgs.projectRoot) setProjectRoot(cliArgs.projectRoot);

// Resolve port: CLI flag > env var > project config > default
const PORT = cliArgs.port
  || parseInt(process.env.DEV_TRACK_PORT || '0')
  || getProjectConfig()?.port
  || 24680;

const app = new Hono();

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return `http://localhost:${PORT}`;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin;
    return `http://localhost:${PORT}`;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ─── API Routes (v2) ────────────────────────────────────────────────────────

// Core entities
app.route('/api/v1/roadmap', roadmapRoutes);
app.route('/api/v1/epics', epicsRoutes);
app.route('/api/v1/milestones', milestonesRoutes);
app.route('/api/v1/releases', releasesRoutes);
app.route('/api/v1/systems', systemsRoutes);
app.route('/api/v1/issues', issuesRoutes);
app.route('/api/v1/changelog', changelogRoutes);
app.route('/api/v1/session', sessionRoutes);
app.route('/api/v1/ideas', ideasRoutes);
app.route('/api/v1/labels', labelsRoutes);
app.route('/api/v1/automations', automationsRoutes);

// Supporting
app.route('/api/v1/state', stateRoutes);
app.route('/api/v1/metrics', metricsRoutes);
app.route('/api/v1/docs', docsRoutes);
app.route('/api/v1/config', configRoutes);
app.route('/api/v1/integrations', integrationsRoutes);
app.route('/api/v1/brain', brainRoutes);
app.route('/api/v1/activity', activityRoutes);
app.route('/api/v1/codebase', codebaseRoutes);
app.route('/api/v1/git', gitRoutes);
app.route('/api/v1/ai', aiRoutes);
app.route('/api/v1/init', initRoutes);
app.route('/api/v1/audits', auditsRoutes);

// Backward compat: /api/v1/backlog → /api/v1/roadmap
app.route('/api/v1/backlog', roadmapRoutes);

// Quick status shortcut
app.get('/api/v1/quick-status', (c) => {
  const store = getStore();
  return c.json({
    ok: true,
    data: {
      status: store.getQuickStatus(),
      status_line: store.getQuickStatusLine(),
    },
  });
});

// Project info endpoint
app.get('/api/v1/project', (c) => {
  return c.json({
    ok: true,
    data: {
      name: getProjectName(),
      id: getProjectConfig()?.projectId || path.basename(getProjectRoot()),
      dataDir: getDataDir(),
      projectRoot: getProjectRoot(),
      port: PORT,
    },
  });
});

// All registered projects
app.get('/api/v1/projects', (c) => {
  const registry = loadRegistry();
  return c.json({
    ok: true,
    data: {
      projects: registry.projects,
      current: getProjectConfig()?.projectId || path.basename(getProjectRoot()),
    },
  });
});

// Switch to a different project (hot-swap data directory)
app.post('/api/v1/projects/switch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { projectId } = body;

  if (!projectId) {
    return c.json({ ok: false, error: 'projectId is required' }, 400);
  }

  const registry = loadRegistry();
  const project = registry.projects.find(p => p.id === projectId);

  if (!project) {
    return c.json({ ok: false, error: `Project "${projectId}" not found in registry` }, 404);
  }

  const dataDir = project.dataDir.replace(/^~/, os.homedir());
  if (!fs.existsSync(dataDir)) {
    return c.json({ ok: false, error: `Data directory not found: ${dataDir}` }, 404);
  }

  setDataDir(dataDir);
  setProjectRoot(project.path);

  project.lastAccessed = new Date().toISOString();
  registerProject(project);

  reloadStore();
  startWatcher();

  const store = getStore();
  console.log(`\n  [switch] Switched to project: ${project.name}`);
  console.log(`  [switch] Data: ${dataDir}`);
  console.log(`  [switch] Status: ${store.getQuickStatusLine()}\n`);

  return c.json({
    ok: true,
    data: {
      name: project.name,
      id: project.id,
      dataDir,
      projectRoot: project.path,
      status: store.getQuickStatusLine(),
    },
  });
});

// Health check
app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    uptime: process.uptime(),
    port: PORT,
    project: getProjectName(),
    dataDir: getDataDir(),
  });
});

// ─── Static File Serving (built UI) ────────────────────────────────────────

const PACKAGE_ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..');
const UI_DIST = path.resolve(PACKAGE_ROOT, 'dist', 'ui');

app.get('*', (c) => {
  const reqPath = c.req.path === '/' ? '/index.html' : c.req.path;
  const filePath = path.join(UI_DIST, reqPath);

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      return new Response(content, {
        headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' },
      });
    }

    const indexPath = path.join(UI_DIST, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/html' } });
    }
  } catch {
    // Fall through
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head><title>dev-track</title></head>
      <body style="background:#0a0a0b;color:#fafafa;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h1 style="font-size:2rem;margin-bottom:1rem;">dev-track</h1>
          <p style="color:#a1a1aa;">API server running on port ${PORT}</p>
          <p style="color:#a1a1aa;">Project: <strong>${getProjectName()}</strong></p>
          <p style="color:#a1a1aa;">UI dev server: <a href="http://localhost:24681" style="color:#3b82f6;">http://localhost:24681</a></p>
          <p style="color:#71717a;font-size:0.875rem;margin-top:2rem;">Run <code style="background:#18181b;padding:2px 6px;border-radius:4px;">npm run dev</code> for both servers</p>
        </div>
      </body>
    </html>
  `);
});

// ─── Start Server ───────────────────────────────────────────────────────────

const projectName = getProjectName();

console.log('\n  ╔══════════════════════════════════════╗');
console.log('  ║         dev-track server v2           ║');
console.log('  ╚══════════════════════════════════════╝\n');

const store = getStore();
console.log(`  Project:  ${projectName}`);
console.log(`  Data:     ${getDataDir()}`);
console.log(`  Health:   ${store.state.overall_health}%`);
console.log(`  Status:   ${store.getQuickStatusLine()}\n`);

const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '127.0.0.1',
}, (info) => {
  console.log(`  API:     http://127.0.0.1:${info.port}/api/v1/`);
  console.log(`  Health:  http://127.0.0.1:${info.port}/api/health`);
  console.log(`  WS:      ws://127.0.0.1:${info.port}/ws\n`);
});

setupWebSocket(server as unknown as import('http').Server);
startWatcher();

// Start automation engine + scheduler
getAutomationEngine(); // Initialize singleton
startScheduler();

console.log('  Ready.\n');
