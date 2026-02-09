/**
 * Centralized project configuration — resolves data directory, project info, and paths.
 * 
 * Priority for data directory:
 *   1. Explicit setDataDir() call (from CLI start command)
 *   2. DEV_TRACK_DATA_DIR environment variable
 *   3. .dev-track/config.json in current working directory (project-local)
 *   4. ./data/ relative to cwd (legacy default for dev-track-on-dev-track)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectConfig {
  projectId: string;
  name: string;
  dataDir: string;
  projectPath: string;
  port?: number;
}

export interface ProjectRegistryEntry {
  id: string;
  name: string;
  path: string;
  dataDir: string;
  port?: number;
  lastAccessed: string;
  created: string;
}

export interface ProjectRegistry {
  projects: ProjectRegistryEntry[];
}

export interface GlobalSettings {
  defaultPort: number;
  portRange: [number, number];
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const DEVTRACK_HOME = path.join(os.homedir(), '.dev-track');
const REGISTRY_PATH = path.join(DEVTRACK_HOME, 'projects.json');
const GLOBAL_SETTINGS_PATH = path.join(DEVTRACK_HOME, 'settings.json');

export function getDevTrackHome(): string {
  return DEVTRACK_HOME;
}

/**
 * Get the global profile path — profiles are user-level, not project-level.
 * Stored at ~/.dev-track/profile.json so they follow the user across all projects.
 * Migrates from old per-project locations on first access.
 */
export function getGlobalProfilePath(): string {
  ensureDevTrackHome();
  const globalPath = path.join(DEVTRACK_HOME, 'profile.json');

  if (!fs.existsSync(globalPath)) {
    // Migration: check per-project local dir first, then legacy ai/ dir
    try {
      const localPath = path.join(getLocalDataDir(), 'profiles.json');
      if (fs.existsSync(localPath)) {
        fs.copyFileSync(localPath, globalPath);
        return globalPath;
      }
    } catch { /* getLocalDataDir may not be ready yet */ }

    try {
      const oldPath = path.join(getDataDir(), 'ai/profiles.json');
      if (fs.existsSync(oldPath)) {
        fs.copyFileSync(oldPath, globalPath);
        return globalPath;
      }
    } catch { /* getDataDir may not be ready yet */ }

    // No existing profile — create a skeleton for new users
    const username = os.userInfo().username || 'user';
    const skeleton = {
      profiles: [{
        id: `user-${username}`,
        name: username,
        role: '',
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
        behavior: {
          session_length_preference: 'medium',
          context_window_habits: 'normal',
          communication_style: 'direct',
        },
        ai_observed: null,
        ai_instructions: '',
        context_notes: [],
        session_observations: { observations: [] },
      }],
    };
    fs.writeFileSync(globalPath, JSON.stringify(skeleton, null, 2));
  }

  return globalPath;
}

// ─── State ──────────────────────────────────────────────────────────────────

let _dataDir: string | null = null;
let _projectRoot: string | null = null;
let _projectConfig: ProjectConfig | null = null;

/**
 * Explicitly set the data directory. Used by CLI and server startup.
 */
export function setDataDir(dir: string): void {
  _dataDir = path.resolve(dir);
}

/**
 * Explicitly set the project root directory.
 */
export function setProjectRoot(dir: string): void {
  _projectRoot = path.resolve(dir);
}

/**
 * Set the full project config (from CLI init/start).
 */
export function setProjectConfig(config: ProjectConfig): void {
  _projectConfig = config;
  _dataDir = path.resolve(config.dataDir);
  _projectRoot = path.resolve(config.projectPath);
}

/**
 * Get the data directory — the resolved path where all JSON tracking data lives.
 */
export function getDataDir(): string {
  if (_dataDir) return _dataDir;

  // Check environment variable
  if (process.env.DEV_TRACK_DATA_DIR) {
    _dataDir = path.resolve(process.env.DEV_TRACK_DATA_DIR);
    return _dataDir;
  }

  // Check for .dev-track/config.json in cwd
  const localConfigPath = path.join(process.cwd(), '.dev-track', 'config.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
      if (config.dataDir) {
        // Resolve ~ to home directory
        const resolved = config.dataDir.replace(/^~/, os.homedir());
        _dataDir = path.resolve(resolved);
        _projectRoot = process.cwd();
        _projectConfig = config;
        return _dataDir;
      }
    } catch {}
  }

  // Legacy default: ./data/ relative to cwd (dev-track developing itself)
  _dataDir = path.resolve(process.cwd(), 'data');
  return _dataDir;
}

/**
 * Get the project root — where .dev-track/ and .credentials.json live.
 */
export function getProjectRoot(): string {
  if (_projectRoot) return _projectRoot;
  // Default to cwd
  _projectRoot = process.cwd();
  return _projectRoot;
}

/**
 * Get the local (personal, gitignored) data directory.
 * Used for user profiles, preferences, and other user-specific data.
 * Created automatically if it doesn't exist.
 */
export function getLocalDataDir(): string {
  const localDir = path.join(getDataDir(), 'local');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

/**
 * Get the global credentials path — credentials are user-level, not project-level.
 * Stored at ~/.dev-track/credentials.json so they follow the user across all projects.
 */
export function getGlobalCredentialsPath(): string {
  ensureDevTrackHome();
  return path.join(DEVTRACK_HOME, 'credentials.json');
}

/**
 * Get the credentials file path.
 * Priority: per-project .credentials.json → global ~/.dev-track/credentials.json
 * Migrates per-project credentials to global on first access if global doesn't exist.
 */
export function getCredentialsPath(): string {
  const projectCredsPath = path.join(getProjectRoot(), '.credentials.json');
  const globalCredsPath = getGlobalCredentialsPath();

  // If per-project file exists, it takes priority (override support)
  if (fs.existsSync(projectCredsPath)) {
    // Migrate to global if global doesn't exist yet
    if (!fs.existsSync(globalCredsPath)) {
      try {
        fs.copyFileSync(projectCredsPath, globalCredsPath);
        console.log('[credentials] Migrated per-project credentials to global ~/.dev-track/credentials.json');
      } catch { /* best effort */ }
    }
    return projectCredsPath;
  }

  // Fall back to global credentials
  if (fs.existsSync(globalCredsPath)) {
    return globalCredsPath;
  }

  // Neither exists — return global path (will be created on first save)
  return globalCredsPath;
}

/**
 * Get the path where new credentials should be saved.
 * Always saves to global unless per-project override exists.
 */
export function getCredentialsSavePath(): string {
  const projectCredsPath = path.join(getProjectRoot(), '.credentials.json');
  // If project has its own overrides, keep writing there
  if (fs.existsSync(projectCredsPath)) {
    return projectCredsPath;
  }
  // Otherwise save globally
  return getGlobalCredentialsPath();
}

/**
 * Get the current project config, if loaded.
 */
export function getProjectConfig(): ProjectConfig | null {
  // Ensure getDataDir() has been called to try loading config
  getDataDir();
  return _projectConfig;
}

/**
 * Get the project name (from config, or fallback to directory name).
 */
export function getProjectName(): string {
  const config = getProjectConfig();
  if (config?.name) return config.name;
  
  // Try reading from data/config.json
  try {
    const configPath = path.join(getDataDir(), 'config.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (data.project) return data.project;
    }
  } catch {}

  return path.basename(getProjectRoot());
}

// ─── Global Registry ────────────────────────────────────────────────────────

export function ensureDevTrackHome(): void {
  if (!fs.existsSync(DEVTRACK_HOME)) {
    fs.mkdirSync(DEVTRACK_HOME, { recursive: true });
  }
  if (!fs.existsSync(path.join(DEVTRACK_HOME, 'projects'))) {
    fs.mkdirSync(path.join(DEVTRACK_HOME, 'projects'), { recursive: true });
  }
}

export function loadRegistry(): ProjectRegistry {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.projects && Array.isArray(parsed.projects)) {
          return parsed;
        }
        console.warn('[registry] Invalid registry format, preserving file. Expected { projects: [] }');
      }
    }
  } catch (err: any) {
    console.error(`[registry] Failed to read ${REGISTRY_PATH}: ${err.message}. NOT wiping — returning empty.`);
  }
  return { projects: [] };
}

export function saveRegistry(registry: ProjectRegistry): void {
  ensureDevTrackHome();
  // Defensive: never save an empty registry if the file already has entries
  // This prevents race conditions from wiping the file
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const existing = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8').trim());
      if (existing?.projects?.length > registry.projects.length) {
        // Merge: keep entries from existing that aren't in the new registry
        const newIds = new Set(registry.projects.map(p => p.id));
        for (const proj of existing.projects) {
          if (!newIds.has(proj.id)) {
            registry.projects.push(proj);
          }
        }
      }
    }
  } catch { /* file doesn't exist or is corrupt — safe to overwrite */ }
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function registerProject(entry: ProjectRegistryEntry): void {
  const registry = loadRegistry();
  const existing = registry.projects.findIndex(p => p.id === entry.id);
  if (existing >= 0) {
    registry.projects[existing] = entry;
  } else {
    registry.projects.push(entry);
  }
  saveRegistry(registry);
}

export function loadGlobalSettings(): GlobalSettings {
  try {
    if (fs.existsSync(GLOBAL_SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_PATH, 'utf-8'));
    }
  } catch {}
  return { defaultPort: 24680, portRange: [24680, 24699] };
}

export function saveGlobalSettings(settings: GlobalSettings): void {
  ensureDevTrackHome();
  fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * Scaffold the data directory for a new project with all required subdirectories and files.
 */
export function scaffoldDataDir(dataDir: string, projectName: string): void {
  const dirs = [
    '',
    'backlog',
    'changelog',
    'session',
    'issues',
    'metrics',
    'actions',
    'brain',
    'ideas',
    'ai',
    'codebase',
    'designs',
    'decisions',
    'runs',
  ];

  for (const dir of dirs) {
    const full = path.join(dataDir, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
  }

  // Create default files if they don't exist
  const defaults: Record<string, any> = {
    'config.json': {
      project: projectName,
      description: '',
      created: new Date().toISOString().split('T')[0],
      version: '0.1',
      settings: {
        max_now_items: 999,
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
      last_updated: new Date().toISOString().split('T')[0],
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
      totals: {
        total_sessions: 0,
        total_items_shipped: 0,
        total_points: 0,
        avg_items_per_session: 0,
        avg_points_per_session: 0,
        total_issues_found: 0,
        total_issues_resolved: 0,
      },
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
    'local/profiles.json': { profiles: [] },
  };

  for (const [file, content] of Object.entries(defaults)) {
    const fullPath = path.join(dataDir, file);
    if (!fs.existsSync(fullPath)) {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
    }
  }
}

/**
 * Find an available port in the configured range.
 */
export async function findAvailablePort(preferred?: number): Promise<number> {
  const settings = loadGlobalSettings();
  const [min, max] = settings.portRange;
  const startPort = preferred || settings.defaultPort;

  for (let port = startPort; port <= max; port++) {
    if (await isPortAvailable(port)) return port;
  }

  // If all in range are taken, try the preferred port anyway
  return startPort;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}
