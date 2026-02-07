import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { getStore } from './store.js';
import { setupWebSocket } from './ws.js';
import { startWatcher } from './watcher.js';

// Route imports
import stateRoutes from './routes/state.js';
import sessionRoutes from './routes/session.js';
import backlogRoutes from './routes/backlog.js';
import issuesRoutes from './routes/issues.js';
import actionsRoutes from './routes/actions.js';
import changelogRoutes from './routes/changelog.js';
import runsRoutes from './routes/runs.js';
import metricsRoutes from './routes/metrics.js';
import docsRoutes from './routes/docs.js';
import configRoutes from './routes/config.js';
import integrationsRoutes from './routes/integrations.js';
import brainRoutes from './routes/brain.js';
import ideasRoutes from './routes/ideas.js';
import activityRoutes from './routes/activity.js';
import codebaseRoutes from './routes/codebase.js';

const PORT = parseInt(process.env.DEV_TRACK_PORT || '24680');
const app = new Hono();

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use('*', cors({
  origin: ['http://localhost:24680', 'http://localhost:24681', 'http://127.0.0.1:24680', 'http://127.0.0.1:24681'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// ─── API Routes ─────────────────────────────────────────────────────────────

app.route('/api/v1/state', stateRoutes);
app.route('/api/v1/session', sessionRoutes);
app.route('/api/v1/backlog', backlogRoutes);
app.route('/api/v1/issues', issuesRoutes);
app.route('/api/v1/actions', actionsRoutes);
app.route('/api/v1/changelog', changelogRoutes);
app.route('/api/v1/runs', runsRoutes);
app.route('/api/v1/metrics', metricsRoutes);
app.route('/api/v1/docs', docsRoutes);
app.route('/api/v1/config', configRoutes);
app.route('/api/v1/integrations', integrationsRoutes);
app.route('/api/v1/brain', brainRoutes);
app.route('/api/v1/ideas', ideasRoutes);
app.route('/api/v1/activity', activityRoutes);
app.route('/api/v1/codebase', codebaseRoutes);

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

// Health check
app.get('/api/health', (c) => {
  return c.json({ ok: true, uptime: process.uptime(), port: PORT });
});

// ─── Static File Serving (built UI) ────────────────────────────────────────

const UI_DIST = path.resolve(process.cwd(), 'dist', 'ui');
const UI_DEV = path.resolve(process.cwd(), 'ui');

app.get('*', (c) => {
  // Try to serve from dist/ui first (production build)
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

    // SPA fallback — serve index.html for all unmatched routes
    const indexPath = path.join(UI_DIST, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/html' } });
    }
  } catch {
    // Fall through
  }

  // Dev mode fallback — show message pointing to Vite dev server
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head><title>dev-track</title></head>
      <body style="background:#0a0a0b;color:#fafafa;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h1 style="font-size:2rem;margin-bottom:1rem;">dev-track</h1>
          <p style="color:#a1a1aa;">API server running on port ${PORT}</p>
          <p style="color:#a1a1aa;">UI dev server: <a href="http://localhost:24681" style="color:#3b82f6;">http://localhost:24681</a></p>
          <p style="color:#71717a;font-size:0.875rem;margin-top:2rem;">Run <code style="background:#18181b;padding:2px 6px;border-radius:4px;">npm run dev</code> for both servers</p>
        </div>
      </body>
    </html>
  `);
});

// ─── Start Server ───────────────────────────────────────────────────────────

console.log('\n  ╔══════════════════════════════════════╗');
console.log('  ║         dev-track server              ║');
console.log('  ╚══════════════════════════════════════╝\n');

// Initialize store (loads all data files)
const store = getStore();
console.log(`  Project: ${store.config.project}`);
console.log(`  Health:  ${store.state.overall_completion}%`);
console.log(`  Status:  ${store.getQuickStatusLine()}\n`);

const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '127.0.0.1',
}, (info) => {
  console.log(`  API:     http://127.0.0.1:${info.port}/api/v1/`);
  console.log(`  Health:  http://127.0.0.1:${info.port}/api/health`);
  console.log(`  WS:      ws://127.0.0.1:${info.port}/ws\n`);
});

// Attach WebSocket to the HTTP server
setupWebSocket(server as unknown as import('http').Server);

// Start file watcher
startWatcher();

console.log('  Ready.\n');
