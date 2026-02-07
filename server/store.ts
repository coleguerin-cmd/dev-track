import fs from 'fs';
import path from 'path';
import type {
  DevTrackConfig,
  ProjectState,
  SessionPlan,
  SessionLog,
  BacklogData,
  ChangelogData,
  ChangelogSummaries,
  ActionsRegistry,
  IssuesData,
  DiagnosticRun,
  VelocityData,
  QuickStatus,
  BacklogItem,
  Issue,
  ChangelogEntry,
  SessionEntry,
  Action,
} from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

// ─── File Helpers ───────────────────────────────────────────────────────────

function readJSON<T>(filePath: string, fallback: T): T {
  const fullPath = path.join(DATA_DIR, filePath);
  try {
    if (!fs.existsSync(fullPath)) return fallback;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[store] Failed to read ${filePath}, using fallback`);
    return fallback;
  }
}

function writeJSON<T>(filePath: string, data: T): void {
  const fullPath = path.join(DATA_DIR, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readMarkdown(filePath: string): string {
  const fullPath = path.join(DATA_DIR, filePath);
  try {
    if (!fs.existsSync(fullPath)) return '';
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return '';
  }
}

function listFiles(dirPath: string, ext: string): string[] {
  const fullPath = path.join(DATA_DIR, dirPath);
  try {
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath)
      .filter(f => f.endsWith(ext) && !f.startsWith('_'))
      .sort();
  } catch {
    return [];
  }
}

// ─── Store Class ────────────────────────────────────────────────────────────

export class Store {
  config: DevTrackConfig;
  state: ProjectState;
  sessionCurrent: SessionPlan | null;
  sessionLog: SessionLog;
  backlog: BacklogData;
  changelog: ChangelogData;
  changelogSummaries: ChangelogSummaries;
  actions: ActionsRegistry;
  issues: IssuesData;
  runs: DiagnosticRun[];
  velocity: VelocityData;

  // Track write timestamps for debouncing watcher
  private _lastWriteTime: Record<string, number> = {};

  constructor() {
    this.config = readJSON<DevTrackConfig>('config.json', {
      project: 'unknown',
      description: '',
      created: new Date().toISOString().split('T')[0],
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
    });

    this.state = readJSON<ProjectState>('state.json', {
      last_updated: new Date().toISOString().split('T')[0],
      overall_completion: 0,
      summary: '',
      systems: [],
      remaining: { must_have: [], important: [], nice_to_have: [] },
    });

    this.sessionCurrent = readJSON<SessionPlan | null>('session/current.json', null);
    this.sessionLog = readJSON<SessionLog>('session/log.json', { sessions: [] });
    this.backlog = readJSON<BacklogData>('backlog/items.json', { items: [] });
    this.changelog = readJSON<ChangelogData>('changelog/entries.json', { entries: [] });
    this.changelogSummaries = readJSON<ChangelogSummaries>('changelog/summaries.json', { summaries: [] });
    this.actions = readJSON<ActionsRegistry>('actions/registry.json', { actions: [] });
    this.issues = readJSON<IssuesData>('issues/items.json', { issues: [], next_id: 1 });
    this.velocity = readJSON<VelocityData>('metrics/velocity.json', {
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
    });

    // Load recent runs
    this.runs = this.loadRecentRuns();

    console.log(`[store] Loaded: ${this.backlog.items.length} backlog items, ${this.issues.issues.length} issues, ${this.actions.actions.length} actions`);
  }

  private loadRecentRuns(): DiagnosticRun[] {
    const files = listFiles('runs', '.json');
    return files
      .slice(-50) // Last 50 runs
      .map(f => readJSON<DiagnosticRun>(`runs/${f}`, null as unknown as DiagnosticRun))
      .filter(Boolean);
  }

  // ─── Write Methods (update in-memory + persist to disk) ─────────────────

  markWrite(filePath: string): void {
    this._lastWriteTime[filePath] = Date.now();
  }

  isRecentWrite(filePath: string, withinMs = 1000): boolean {
    const t = this._lastWriteTime[filePath];
    return !!t && Date.now() - t < withinMs;
  }

  saveConfig(): void {
    this.markWrite('config.json');
    writeJSON('config.json', this.config);
  }

  saveState(): void {
    this.markWrite('state.json');
    writeJSON('state.json', this.state);
  }

  saveSessionCurrent(): void {
    this.markWrite('session/current.json');
    if (this.sessionCurrent) {
      writeJSON('session/current.json', this.sessionCurrent);
    }
  }

  saveSessionLog(): void {
    this.markWrite('session/log.json');
    writeJSON('session/log.json', this.sessionLog);
  }

  saveBacklog(): void {
    this.markWrite('backlog/items.json');
    writeJSON('backlog/items.json', this.backlog);
  }

  saveChangelog(): void {
    this.markWrite('changelog/entries.json');
    writeJSON('changelog/entries.json', this.changelog);
  }

  saveActions(): void {
    this.markWrite('actions/registry.json');
    writeJSON('actions/registry.json', this.actions);
  }

  saveIssues(): void {
    this.markWrite('issues/items.json');
    writeJSON('issues/items.json', this.issues);
  }

  saveVelocity(): void {
    this.markWrite('metrics/velocity.json');
    writeJSON('metrics/velocity.json', this.velocity);
  }

  saveRun(run: DiagnosticRun): void {
    const filename = `${run.id}.json`;
    this.markWrite(`runs/${filename}`);
    writeJSON(`runs/${filename}`, run);
    this.runs.push(run);
    // Keep in-memory list trimmed
    if (this.runs.length > 50) this.runs = this.runs.slice(-50);
  }

  // ─── Reload from disk (for file watcher) ────────────────────────────────

  reloadFile(relativePath: string): void {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized === 'config.json') {
      this.config = readJSON('config.json', this.config);
    } else if (normalized === 'state.json') {
      this.state = readJSON('state.json', this.state);
    } else if (normalized === 'session/current.json') {
      this.sessionCurrent = readJSON('session/current.json', this.sessionCurrent);
    } else if (normalized === 'session/log.json') {
      this.sessionLog = readJSON('session/log.json', this.sessionLog);
    } else if (normalized === 'backlog/items.json') {
      this.backlog = readJSON('backlog/items.json', this.backlog);
    } else if (normalized === 'changelog/entries.json') {
      this.changelog = readJSON('changelog/entries.json', this.changelog);
    } else if (normalized === 'actions/registry.json') {
      this.actions = readJSON('actions/registry.json', this.actions);
    } else if (normalized === 'issues/items.json') {
      this.issues = readJSON('issues/items.json', this.issues);
    } else if (normalized === 'metrics/velocity.json') {
      this.velocity = readJSON('metrics/velocity.json', this.velocity);
    } else if (normalized.startsWith('runs/')) {
      this.runs = this.loadRecentRuns();
    }
  }

  // ─── Computed Helpers ───────────────────────────────────────────────────

  getQuickStatus(): QuickStatus {
    const nowItems = this.backlog.items
      .filter(i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled')
      .map(i => ({ title: i.title, size: i.size, status: i.status }));

    const openIssues = this.issues.issues.filter(i => i.status === 'open' || i.status === 'in_progress');
    const criticalIssues = openIssues.filter(i => i.severity === 'critical');

    const lastSession = this.sessionLog.sessions.length > 0
      ? this.sessionLog.sessions[this.sessionLog.sessions.length - 1]
      : null;

    return {
      project: this.config.project,
      health: this.state.overall_completion,
      now_items: nowItems,
      session: this.sessionCurrent
        ? {
            status: this.sessionCurrent.status,
            duration_hours: this.sessionCurrent.started_at
              ? Math.round((Date.now() - new Date(this.sessionCurrent.started_at).getTime()) / 3600000 * 10) / 10
              : undefined,
          }
        : null,
      last_session: lastSession
        ? { date: lastSession.date, items_shipped: lastSession.items_shipped }
        : null,
      open_issues: { total: openIssues.length, critical: criticalIssues.length },
    };
  }

  getQuickStatusLine(): string {
    const qs = this.getQuickStatus();
    const nowStr = qs.now_items.map(i => `${i.title} (${i.size}, ${i.status})`).join(', ');
    const sessionStr = qs.session
      ? `Session: ${qs.session.status}${qs.session.duration_hours ? ` ${qs.session.duration_hours}h` : ''}`
      : 'Session: none';
    const lastStr = qs.last_session
      ? `Last: ${qs.last_session.date}, ${qs.last_session.items_shipped} shipped`
      : 'Last: none';
    const issueStr = `Open issues: ${qs.open_issues.total}${qs.open_issues.critical > 0 ? ` (${qs.open_issues.critical} crit)` : ''}`;

    return `${qs.project} | ${qs.health}% health | Now: ${nowStr || 'none'} | ${sessionStr} | ${lastStr} | ${issueStr}`;
  }

  // ─── Design Docs ────────────────────────────────────────────────────────

  listDesignDocs(): string[] {
    return listFiles('designs', '.md');
  }

  getDesignDoc(filename: string): string {
    return readMarkdown(`designs/${filename}`);
  }

  listDecisions(): string[] {
    return listFiles('decisions', '.md');
  }

  getDecision(filename: string): string {
    return readMarkdown(`decisions/${filename}`);
  }

  getPlaybook(filename: string): string {
    return readMarkdown(`actions/playbooks/${filename}`);
  }
}

// Singleton
let _store: Store | null = null;

export function getStore(): Store {
  if (!_store) _store = new Store();
  return _store;
}

export function reloadStore(): Store {
  _store = new Store();
  return _store;
}
