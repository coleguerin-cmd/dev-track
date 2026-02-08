#!/usr/bin/env node

/**
 * dev-track CLI — project intelligence system.
 * 
 * Usage:
 *   dev-track init                          Initialize dev-track in current project
 *   dev-track start                         Start dev-track server for current project
 *   dev-track projects                      List all registered projects
 *   dev-track <resource> <action> [id]      Interact with dev-track API
 * 
 * Resources: session, backlog, issue, action, changelog, state, metrics, status
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';

const DEVTRACK_HOME = path.join(os.homedir(), '.dev-track');
const REGISTRY_PATH = path.join(DEVTRACK_HOME, 'projects.json');
const SETTINGS_PATH = path.join(DEVTRACK_HOME, 'settings.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {}
  return fallback;
}

function writeJSON(filePath: string, data: any) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── API Client (for resource commands) ─────────────────────────────────────

function getBaseUrl(): string {
  // Try reading port from .dev-track/.port
  const portFile = path.join(process.cwd(), '.dev-track', '.port');
  if (fs.existsSync(portFile)) {
    const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim());
    if (port) return `http://127.0.0.1:${port}`;
  }
  return process.env.DEV_TRACK_URL || 'http://127.0.0.1:24680';
}

async function api(apiPath: string, options?: RequestInit) {
  const res = await fetch(`${getBaseUrl()}/api/v1${apiPath}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`Error: ${json.error}`);
    process.exit(1);
  }
  return json.data;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    }
  }
  return flags;
}

// ─── Init Command ───────────────────────────────────────────────────────────

async function initProject(flags: Record<string, string>) {
  const cwd = process.cwd();
  const dirName = path.basename(cwd);
  const projectName = flags.name || dirName;
  const projectId = slugify(projectName);

  console.log(`\n  Initializing dev-track for: ${projectName}`);
  console.log(`  Project path: ${cwd}`);

  // Check if already initialized
  const localConfig = path.join(cwd, '.dev-track', 'config.json');
  if (fs.existsSync(localConfig)) {
    const existing = readJSON(localConfig, {} as any);
    console.log(`\n  Already initialized as "${existing.name}" (${existing.projectId})`);
    console.log(`  Data directory: ${existing.dataDir}`);
    console.log(`\n  Run 'dev-track start' to launch the server.`);
    return;
  }

  // Create central data directory
  const dataDir = path.join(DEVTRACK_HOME, 'projects', projectId, 'data');
  console.log(`  Data directory: ${dataDir}`);

  ensureDir(dataDir);

  // Scaffold all data subdirectories and default files
  const subdirs = [
    'backlog', 'changelog', 'session', 'issues', 'metrics',
    'actions', 'brain', 'ideas', 'ai', 'ai/conversations',
    'codebase', 'designs', 'decisions', 'runs',
  ];
  for (const dir of subdirs) {
    ensureDir(path.join(dataDir, dir));
  }

  // Create default data files
  const today = new Date().toISOString().split('T')[0];
  const defaults: Record<string, any> = {
    'config.json': {
      project: projectName,
      description: '',
      created: today,
      version: '0.1',
      settings: {
        max_now_items: 3,
        max_session_history: 10,
        max_run_history_per_action: 20,
        auto_archive_resolved_issues_after_days: 7,
        changelog_window_days: 14,
        completed_backlog_window_days: 14,
        summary_period: 'monthly',
        verbosity: {
          changelog_entries: 'detailed',
          session_retros: 'summary',
          issue_commentary: 'detailed',
          design_docs: 'detailed',
          diagnostic_output: 'summary',
          backlog_descriptions: 'detailed',
          ai_context_loading: 'efficient',
        },
        developers: [],
      },
    },
    'state.json': {
      last_updated: today,
      overall_completion: 0,
      summary: `Fresh project: ${projectName}`,
      systems: [],
      remaining: { must_have: [], important: [], nice_to_have: [] },
    },
    'backlog/items.json': { items: [] },
    'changelog/entries.json': { entries: [] },
    'changelog/summaries.json': { summaries: [] },
    'session/current.json': null,
    'session/log.json': { sessions: [] },
    'issues/items.json': { issues: [], next_id: 1 },
    'metrics/velocity.json': {
      sessions: [],
      totals: { total_sessions: 0, total_items_shipped: 0, total_points: 0, avg_items_per_session: 0, avg_points_per_session: 0, total_issues_found: 0, total_issues_resolved: 0 },
      point_values: { S: 1, M: 2, L: 5, XL: 8 },
    },
    'actions/registry.json': { actions: [] },
    'brain/notes.json': { notes: [] },
    'brain/preferences.json': { preferences: {} },
    'brain/context-recovery.json': { briefing: '', hot_context: [], warnings: [], suggestions: [] },
    'ideas/items.json': { ideas: [], next_id: 1 },
    'ai/config.json': {
      providers: { openai: { enabled: true }, anthropic: { enabled: true }, google: { enabled: true }, helicone: { enabled: false } },
      features: { planning_chat: { enabled: true, model_override: null } },
      budget: { daily_limit_usd: 5.0, warn_at_usd: 3.0, pause_on_limit: true },
      defaults: { chat_model: '', fast_model: '', reasoning_model: '' },
    },
    'ai/profiles.json': { profiles: [] },
  };

  for (const [file, content] of Object.entries(defaults)) {
    const fullPath = path.join(dataDir, file);
    if (!fs.existsSync(fullPath)) {
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    }
  }

  // Create .dev-track/ in project
  const devTrackDir = path.join(cwd, '.dev-track');
  ensureDir(devTrackDir);

  const config = {
    projectId,
    name: projectName,
    dataDir: dataDir.replace(os.homedir(), '~'),
    projectPath: cwd,
    port: null,
  };
  writeJSON(localConfig, config);

  // Create .credentials.json if it doesn't exist
  const credsPath = path.join(cwd, '.credentials.json');
  if (!fs.existsSync(credsPath)) {
    writeJSON(credsPath, { ai: {} });
  }

  // Generate cursor rule from template
  const rulesDir = path.join(devTrackDir, 'rules');
  ensureDir(rulesDir);
  generateCursorRule(rulesDir, projectName);

  // Register in global registry
  const registry = readJSON<{ projects: any[] }>(REGISTRY_PATH, { projects: [] });
  const existingIdx = registry.projects.findIndex((p: any) => p.id === projectId);
  const entry = {
    id: projectId,
    name: projectName,
    path: cwd,
    dataDir,
    port: null,
    lastAccessed: new Date().toISOString(),
    created: new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    registry.projects[existingIdx] = entry;
  } else {
    registry.projects.push(entry);
  }
  writeJSON(REGISTRY_PATH, registry);

  // Add .dev-track to .gitignore if not already there
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const additions: string[] = [];
    if (!gitignore.includes('.dev-track/')) additions.push('.dev-track/');
    if (!gitignore.includes('.credentials.json')) additions.push('.credentials.json');
    if (additions.length > 0) {
      fs.appendFileSync(gitignorePath, `\n# dev-track\n${additions.join('\n')}\n`);
      console.log(`  Updated .gitignore`);
    }
  }

  console.log('\n  ✓ Project initialized successfully!');
  console.log(`  ✓ Data directory: ${dataDir}`);
  console.log(`  ✓ Config: ${localConfig}`);
  console.log(`  ✓ Cursor rule: ${path.join(rulesDir, 'dev-track.mdc')}`);
  console.log(`\n  Next: run 'dev-track start' to launch the dashboard.\n`);
}

function generateCursorRule(rulesDir: string, projectName: string) {
  // Try to copy from template, fall back to a minimal rule
  const devTrackRoot = findDevTrackRoot();
  const templatePath = devTrackRoot ? path.join(devTrackRoot, 'templates', 'dev-track.mdc') : null;
  const outputPath = path.join(rulesDir, 'dev-track.mdc');

  if (templatePath && fs.existsSync(templatePath)) {
    let content = fs.readFileSync(templatePath, 'utf-8');
    // Replace template placeholders
    content = content.replace(/\{project\}/g, projectName);
    fs.writeFileSync(outputPath, content);
  } else {
    // Minimal cursor rule
    const rule = `---
description: "dev-track project intelligence — loaded on every interaction for this project"
alwaysApply: true
---

# dev-track — Project Intelligence System

## Quick Status
${projectName} | Fresh project | No sessions yet

## System
Project tracking managed by dev-track.
Data lives in ~/.dev-track/projects/.
Run 'dev-track start' to launch the dashboard.

## AFTER EVERY CODE CHANGE — mandatory checklist
1. Write a changelog entry
2. If a backlog item was completed, update its status
3. If a bug was found/fixed, create/update an issue
This is not optional. Do it inline, not at session end.
`;
    fs.writeFileSync(outputPath, rule);
  }
}

function findDevTrackRoot(): string | null {
  // Find where the dev-track package is installed
  // When npm linked, this resolves through the symlink
  try {
    const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
    const root = path.resolve(path.dirname(thisFile), '..');
    if (fs.existsSync(path.join(root, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      if (pkg.name === 'dev-track') return root;
    }
  } catch {}
  return null;
}

// ─── Start Command ──────────────────────────────────────────────────────────

async function startServer(flags: Record<string, string>) {
  const cwd = process.cwd();
  const localConfig = path.join(cwd, '.dev-track', 'config.json');

  // Check if initialized
  if (!fs.existsSync(localConfig)) {
    console.error('\n  Error: dev-track not initialized in this directory.');
    console.error('  Run \'dev-track init\' first.\n');
    process.exit(1);
  }

  const config = readJSON(localConfig, {} as any);
  const dataDir = config.dataDir?.replace(/^~/, os.homedir());

  if (!dataDir || !fs.existsSync(dataDir)) {
    console.error(`\n  Error: Data directory not found: ${dataDir}`);
    console.error('  Run \'dev-track init\' to recreate it.\n');
    process.exit(1);
  }

  // Determine port
  const requestedPort = flags.port ? parseInt(flags.port) : config.port || 24680;
  
  console.log(`\n  Starting dev-track for: ${config.name}`);
  console.log(`  Data: ${dataDir}`);

  // Find the dev-track server entry point
  const devTrackRoot = findDevTrackRoot();
  if (!devTrackRoot) {
    console.error('\n  Error: Cannot find dev-track package. Is it installed/linked?');
    process.exit(1);
  }

  // Write port file for CLI lookups
  const portFile = path.join(cwd, '.dev-track', '.port');
  fs.writeFileSync(portFile, String(requestedPort));

  // Update last accessed in registry
  const registry = readJSON<{ projects: any[] }>(REGISTRY_PATH, { projects: [] });
  const projectEntry = registry.projects.find((p: any) => p.id === config.projectId);
  if (projectEntry) {
    projectEntry.lastAccessed = new Date().toISOString();
    projectEntry.port = requestedPort;
    writeJSON(REGISTRY_PATH, registry);
  }

  // Start the server using tsx (for development/linked mode)
  const serverEntry = path.join(devTrackRoot, 'server', 'index.ts');
  const serverArgs = [
    serverEntry,
    '--data-dir', dataDir,
    '--port', String(requestedPort),
    '--project-root', cwd,
  ];

  console.log(`  Port: ${requestedPort}`);
  console.log(`  Server: ${serverEntry}\n`);

  // Use tsx to run the TypeScript server directly
  const child = spawn('npx', ['tsx', ...serverArgs], {
    stdio: 'inherit',
    shell: true,
    cwd: devTrackRoot,
    env: {
      ...process.env,
      DEV_TRACK_DATA_DIR: dataDir,
      DEV_TRACK_PORT: String(requestedPort),
    },
  });

  child.on('exit', (code) => {
    // Clean up port file
    try { fs.unlinkSync(portFile); } catch {}
    process.exit(code || 0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    try { fs.unlinkSync(portFile); } catch {}
  });

  // Open browser after a short delay
  if (flags['no-browser'] !== 'true') {
    setTimeout(() => {
      const url = `http://localhost:${requestedPort}`;
      try {
        const openCmd = process.platform === 'win32' ? 'start' :
          process.platform === 'darwin' ? 'open' : 'xdg-open';
        execSync(`${openCmd} ${url}`, { stdio: 'ignore' });
      } catch {}
    }, 2000);
  }
}

// ─── Projects Command ───────────────────────────────────────────────────────

function listProjects() {
  const registry = readJSON<{ projects: any[] }>(REGISTRY_PATH, { projects: [] });

  if (registry.projects.length === 0) {
    console.log('\n  No projects registered. Run \'dev-track init\' in a project directory.\n');
    return;
  }

  console.log('\n  Registered projects:\n');
  for (const p of registry.projects) {
    const exists = fs.existsSync(p.path);
    const dataExists = fs.existsSync(p.dataDir);
    const status = exists && dataExists ? '✓' : '✗';
    console.log(`  ${status} ${p.name} (${p.id})`);
    console.log(`    Path: ${p.path}`);
    console.log(`    Data: ${p.dataDir}`);
    if (p.port) console.log(`    Port: ${p.port}`);
    console.log(`    Last: ${p.lastAccessed || 'never'}\n`);
  }
}

// ─── Dev Command (run both server + UI for dev-track development) ───────────

async function devMode(flags: Record<string, string>) {
  console.log('\n  Starting dev-track in development mode...\n');
  
  const devTrackRoot = findDevTrackRoot() || process.cwd();
  
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    cwd: devTrackRoot,
  });

  child.on('exit', (code) => process.exit(code || 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
}

// ─── Resource Commands (legacy API interaction) ─────────────────────────────

async function handleResourceCommand(resource: string, action: string, rest: string[], flags: Record<string, string>) {
  const id = rest.find(r => !r.startsWith('--'));

  switch (resource) {
    case 'session': {
      if (action === 'start') {
        const objective = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/session/start', {
          method: 'POST',
          body: JSON.stringify({ objective, appetite: flags.appetite || '4h', developer: flags.developer || 'default' }),
        });
        console.log(`Session started: ${data.objective}`);
      } else if (action === 'status') {
        const data = await api('/session/current');
        if (!data) { console.log('No active session'); return; }
        console.log(`Session: ${data.status}\nObjective: ${data.objective}\nAppetite: ${data.appetite}\nItems: ${data.items?.length || 0}`);
      } else if (action === 'end') {
        const retro = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/session/end', { method: 'POST', body: JSON.stringify({ next_session_suggestion: retro, handoff_message: flags.handoff }) });
        console.log(`Session ended: ${data.duration_hours}h`);
      } else if (action === 'log') {
        const data = await api(`/session/log?limit=${flags.limit || 5}`);
        for (const s of data.sessions.reverse()) console.log(`${s.date} | ${s.duration_hours}h | ${s.items_shipped} shipped | ${s.objective}`);
      }
      break;
    }
    case 'backlog': {
      if (action === 'list') {
        const horizon = flags.horizon || '';
        const data = await api(`/backlog${horizon ? `?horizon=${horizon}` : ''}`);
        for (const item of data.items) {
          const status = item.status === 'in_progress' ? '●' : item.status === 'completed' ? '✓' : '○';
          console.log(`${status} [${item.horizon}] ${item.title} (${item.size}) — ${item.summary || ''}`);
        }
        console.log(`\nTotal: ${data.total} items`);
      } else if (action === 'add') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/backlog', { method: 'POST', body: JSON.stringify({ title, horizon: flags.horizon || 'later', size: flags.size || 'M', category: flags.category || 'general', summary: flags.summary || '' }) });
        console.log(`Created: ${data.id} — ${data.title} [${data.horizon}]`);
      } else if (action === 'complete') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        await api(`/backlog/${id}/complete`, { method: 'POST' });
        console.log(`Completed: ${id}`);
      } else if (action === 'move') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        const horizon = flags.horizon || flags.to;
        if (!horizon) { console.error('Provide --horizon'); process.exit(1); }
        await api(`/backlog/${id}/move`, { method: 'POST', body: JSON.stringify({ horizon }) });
        console.log(`Moved ${id} → ${horizon}`);
      } else if (action === 'update') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        const updates: any = {};
        if (flags.status) updates.status = flags.status;
        if (flags.title) updates.title = flags.title;
        if (flags.size) updates.size = flags.size;
        if (flags.summary) updates.summary = flags.summary;
        if (flags.assignee) updates.assignee = flags.assignee;
        await api(`/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log(`Updated: ${id}`);
      }
      break;
    }
    case 'issue': {
      if (action === 'list') {
        const params = new URLSearchParams();
        if (flags.status) params.set('status', flags.status);
        if (flags.action) params.set('action_id', flags.action);
        const data = await api(`/issues?${params}`);
        for (const issue of data.issues) {
          const sev = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[issue.severity] || '⚪';
          console.log(`${sev} ${issue.id} ${issue.title} [${issue.status}]`);
        }
        console.log(`\nOpen: ${data.counts.open} | Critical: ${data.counts.critical}`);
      } else if (action === 'create') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/issues', { method: 'POST', body: JSON.stringify({ title, severity: flags.severity || 'medium', action_id: flags.action || null, symptoms: flags.symptoms || '', files: flags.files ? flags.files.split(',') : [] }) });
        console.log(`Created: ${data.id} — ${data.title}`);
      } else if (action === 'resolve') {
        if (!id) { console.error('Provide issue ID'); process.exit(1); }
        const resolution = flags.resolution || rest.filter(r => !r.startsWith('--') && r !== id).join(' ');
        await api(`/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) });
        console.log(`Resolved: ${id}`);
      }
      break;
    }
    case 'action': {
      if (action === 'list' || action === 'health') {
        const data = await api('/actions');
        for (const a of data.actions) {
          const health = { green: '🟢', yellow: '🟡', red: '🔴', unknown: '⚪' }[a.health];
          console.log(`${health} ${a.name} — ${a.pass_rate.passed}/${a.pass_rate.total} pass — ${a.open_issues} issues`);
        }
      } else if (action === 'run') {
        if (!id) { console.error('Provide action ID'); process.exit(1); }
        console.log(`Running diagnostic for ${id}...`);
        const data = await api(`/actions/${id}/run`, { method: 'POST', body: JSON.stringify({ trigger: 'cli' }) });
        console.log(`Result: ${data.result}`);
        for (const o of data.outcomes) console.log(`  ${o.pass ? '✓' : '✗'} ${o.id}: ${o.detail || 'no detail'}`);
      }
      break;
    }
    case 'changelog': {
      if (action === 'add') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const items = flags.items ? flags.items.split('|') : [];
        const data = await api('/changelog', { method: 'POST', body: JSON.stringify({ title, category: flags.category || 'general', description: flags.description || '', items }) });
        console.log(`Added: ${data.id} — ${data.title}`);
      } else if (action === 'list') {
        const data = await api(`/changelog?limit=${flags.limit || 10}`);
        for (const e of data.entries) console.log(`${e.date} [${e.category}] ${e.title}`);
      }
      break;
    }
    case 'state': {
      if (action === 'get') {
        const data = await api('/state');
        console.log(`Health: ${data.overall_completion}%\nSummary: ${data.summary}`);
        for (const s of data.systems) console.log(`  ${s.rating}/10 ${s.name} [${s.status}]`);
      } else if (action === 'update') {
        if (!id) { console.error('Provide system ID'); process.exit(1); }
        const updates: any = {};
        if (flags.rating) updates.rating = parseInt(flags.rating);
        if (flags.notes) updates.notes = flags.notes;
        if (flags.status) updates.status = flags.status;
        await api(`/state/systems/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log(`Updated: ${id}`);
      }
      break;
    }
    case 'metrics': {
      if (action === 'velocity' || action === 'summary') {
        const data = await api('/metrics/summary');
        console.log(`Sessions: ${data.velocity.total_sessions}\nItems shipped: ${data.velocity.total_items_shipped}\nTotal points: ${data.velocity.total_points}\nAvg items/session: ${data.velocity.avg_items_per_session}`);
        console.log(`\nBacklog — Now: ${data.backlog.now} | Next: ${data.backlog.next} | Later: ${data.backlog.later}`);
        console.log(`Issues — Open: ${data.issues.open} | Critical: ${data.issues.critical}`);
      }
      break;
    }
    case 'status': {
      const data = await api('/config/quick-status');
      if (action === 'line') {
        console.log(data.status_line);
      } else {
        console.log(JSON.stringify(data.status, null, 2));
      }
      break;
    }
    default:
      console.error(`Unknown resource: ${resource}`);
      process.exit(1);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const [,, command, action, ...rest] = process.argv;
const flags = parseFlags(rest);

async function main() {
  if (!command) {
    console.log(`
  dev-track — AI-native project intelligence

  Commands:
    init                          Initialize dev-track in current project
    start [--port N]              Start server for current project
    projects                      List all registered projects
    dev                           Run in development mode (server + UI)

  Resource commands (requires running server):
    session   start|status|end|log
    backlog   list|add|complete|move|update
    issue     list|create|resolve|update
    action    list|run|health
    changelog add|list
    state     get|update
    metrics   velocity|summary
    status    line|full
`);
    return;
  }

  switch (command) {
    case 'init':
      await initProject(flags);
      break;
    case 'start':
      await startServer(flags);
      break;
    case 'projects':
      listProjects();
      break;
    case 'dev':
      await devMode(flags);
      break;
    default:
      // Legacy resource commands
      await handleResourceCommand(command, action, rest, flags);
      break;
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
