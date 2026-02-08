import fs from 'fs';
import path from 'path';
import { getDataDir } from './project-config.js';
import type {
  DevTrackConfig,
  ProjectState,
  RoadmapData,
  RoadmapItem,
  EpicsData,
  MilestonesData,
  ReleasesData,
  SystemsData,
  IssuesData,
  ChangelogData,
  SessionsData,
  Session,
  IdeasData,
  ActivityFeedData,
  ActivityEvent,
  LabelsData,
  AutomationsData,
  DocsRegistryData,
  VelocityData,
  QuickStatus,
  BrainNotesData,
  BrainPreferences,
  ContextRecovery,
} from '../shared/types.js';

// ─── File Helpers ───────────────────────────────────────────────────────────

function readJSON<T>(filePath: string, fallback: T): T {
  const fullPath = path.join(getDataDir(), filePath);
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
  const fullPath = path.join(getDataDir(), filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readMarkdown(filePath: string): string {
  const fullPath = path.join(getDataDir(), filePath);
  try {
    if (!fs.existsSync(fullPath)) return '';
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return '';
  }
}

function listFiles(dirPath: string, ext: string): string[] {
  const fullPath = path.join(getDataDir(), dirPath);
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
  // Core config
  config: DevTrackConfig;
  state: ProjectState;

  // v2 Entities
  roadmap: RoadmapData;
  epics: EpicsData;
  milestones: MilestonesData;
  releases: ReleasesData;
  systems: SystemsData;
  issues: IssuesData;
  changelog: ChangelogData;
  sessions: SessionsData;
  sessionCurrent: Session | null;
  ideas: IdeasData;
  activity: ActivityFeedData;
  labels: LabelsData;
  automations: AutomationsData;
  docsRegistry: DocsRegistryData;
  velocity: VelocityData;

  // Backward compat aliases
  get backlog(): RoadmapData { return this.roadmap; }

  // Track write timestamps for debouncing watcher
  private _lastWriteTime: Record<string, number> = {};

  constructor() {
    this.config = readJSON<DevTrackConfig>('config.json', {
      project: 'unknown',
      description: '',
      created: new Date().toISOString().split('T')[0],
      version: '0.2',
      settings: {
        max_now_items: 3,
        max_session_history: 20,
        auto_archive_resolved_issues_after_days: 7,
        changelog_window_days: 14,
        completed_items_window_days: 14,
        summary_period: 'monthly',
        verbosity: {
          changelog_entries: 'detailed',
          session_retros: 'summary',
          issue_commentary: 'detailed',
          design_docs: 'detailed',
          diagnostic_output: 'summary',
          roadmap_descriptions: 'detailed',
          ai_context_loading: 'efficient',
        },
        developers: [],
      },
    });

    this.state = readJSON<ProjectState>('state.json', {
      last_updated: new Date().toISOString().split('T')[0],
      overall_health: 0,
      summary: '',
    });

    // v2 entities — read from new paths, fallback to old paths for backward compat
    this.roadmap = readJSON<RoadmapData>('roadmap/items.json', null as any)
      || readJSON<RoadmapData>('backlog/items.json', { items: [] });

    this.epics = readJSON<EpicsData>('roadmap/epics.json', { epics: [] });
    this.milestones = readJSON<MilestonesData>('roadmap/milestones.json', { milestones: [] });
    this.releases = readJSON<ReleasesData>('releases/releases.json', { releases: [] });
    this.systems = readJSON<SystemsData>('systems/systems.json', { systems: [] });
    this.issues = readJSON<IssuesData>('issues/items.json', { issues: [], next_id: 1 });
    this.changelog = readJSON<ChangelogData>('changelog/entries.json', { entries: [] });

    // Sessions — v2 format
    const sessionsData = readJSON<SessionsData>('session/log.json', { sessions: [], next_id: 1 });
    this.sessions = sessionsData;
    this.sessionCurrent = readJSON<Session | null>('session/current.json', null);

    this.ideas = readJSON<IdeasData>('ideas/items.json', { ideas: [], next_id: 1 });
    this.activity = readJSON<ActivityFeedData>('activity/feed.json', { events: [], next_id: 1 });
    this.labels = readJSON<LabelsData>('labels/labels.json', { labels: [] });
    this.automations = readJSON<AutomationsData>('automations/automations.json', { automations: [] });
    this.docsRegistry = readJSON<DocsRegistryData>('docs/registry.json', { docs: [] });

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

    console.log(`[store] Loaded: ${this.roadmap.items.length} roadmap items, ${this.issues.issues.length} issues, ${this.systems.systems.length} systems, ${this.epics.epics.length} epics`);
  }

  // ─── Write Methods ──────────────────────────────────────────────────────

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

  saveRoadmap(): void {
    this.markWrite('roadmap/items.json');
    writeJSON('roadmap/items.json', this.roadmap);
  }

  /** @deprecated Use saveRoadmap() */
  saveBacklog(): void {
    this.saveRoadmap();
  }

  saveEpics(): void {
    this.markWrite('roadmap/epics.json');
    writeJSON('roadmap/epics.json', this.epics);
  }

  saveMilestones(): void {
    this.markWrite('roadmap/milestones.json');
    writeJSON('roadmap/milestones.json', this.milestones);
  }

  saveReleases(): void {
    this.markWrite('releases/releases.json');
    writeJSON('releases/releases.json', this.releases);
  }

  saveSystems(): void {
    this.markWrite('systems/systems.json');
    writeJSON('systems/systems.json', this.systems);
  }

  saveIssues(): void {
    this.markWrite('issues/items.json');
    writeJSON('issues/items.json', this.issues);
  }

  saveChangelog(): void {
    this.markWrite('changelog/entries.json');
    writeJSON('changelog/entries.json', this.changelog);
  }

  saveSessionCurrent(): void {
    this.markWrite('session/current.json');
    writeJSON('session/current.json', this.sessionCurrent);
  }

  saveSessionLog(): void {
    this.markWrite('session/log.json');
    writeJSON('session/log.json', this.sessions);
  }

  saveIdeas(): void {
    this.markWrite('ideas/items.json');
    writeJSON('ideas/items.json', this.ideas);
  }

  saveActivity(): void {
    this.markWrite('activity/feed.json');
    writeJSON('activity/feed.json', this.activity);
  }

  saveLabels(): void {
    this.markWrite('labels/labels.json');
    writeJSON('labels/labels.json', this.labels);
  }

  saveAutomations(): void {
    this.markWrite('automations/automations.json');
    writeJSON('automations/automations.json', this.automations);
  }

  saveDocsRegistry(): void {
    this.markWrite('docs/registry.json');
    writeJSON('docs/registry.json', this.docsRegistry);
  }

  // ─── Doc Content Helpers ──────────────────────────────────────────────

  getDocContent(id: string): string {
    return readMarkdown(`docs/${id}.md`);
  }

  writeDocContent(id: string, content: string): void {
    const fullPath = path.join(getDataDir(), `docs/${id}.md`);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.markWrite(`docs/${id}.md`);
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  deleteDocContent(id: string): void {
    const fullPath = path.join(getDataDir(), `docs/${id}.md`);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  saveVelocity(): void {
    this.markWrite('metrics/velocity.json');
    writeJSON('metrics/velocity.json', this.velocity);
  }

  // ─── Activity Feed Helper ─────────────────────────────────────────────

  addActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent {
    const full: ActivityEvent = {
      ...event,
      id: `ACT-${String(this.activity.next_id).padStart(4, '0')}`,
      timestamp: new Date().toISOString(),
    };
    this.activity.events.push(full);
    this.activity.next_id++;

    // Rolling window — keep last 500
    if (this.activity.events.length > 500) {
      this.activity.events = this.activity.events.slice(-500);
    }

    this.saveActivity();
    return full;
  }

  // ─── Reload from disk (for file watcher) ──────────────────────────────

  reloadFile(relativePath: string): void {
    const n = relativePath.replace(/\\/g, '/');

    if (n === 'config.json') {
      this.config = readJSON('config.json', this.config);
    } else if (n === 'state.json') {
      this.state = readJSON('state.json', this.state);
    } else if (n === 'roadmap/items.json' || n === 'backlog/items.json') {
      this.roadmap = readJSON('roadmap/items.json', this.roadmap);
    } else if (n === 'roadmap/epics.json') {
      this.epics = readJSON('roadmap/epics.json', this.epics);
    } else if (n === 'roadmap/milestones.json') {
      this.milestones = readJSON('roadmap/milestones.json', this.milestones);
    } else if (n === 'releases/releases.json') {
      this.releases = readJSON('releases/releases.json', this.releases);
    } else if (n === 'systems/systems.json') {
      this.systems = readJSON('systems/systems.json', this.systems);
    } else if (n === 'issues/items.json') {
      this.issues = readJSON('issues/items.json', this.issues);
    } else if (n === 'changelog/entries.json') {
      this.changelog = readJSON('changelog/entries.json', this.changelog);
    } else if (n === 'session/current.json') {
      this.sessionCurrent = readJSON('session/current.json', this.sessionCurrent);
    } else if (n === 'session/log.json') {
      this.sessions = readJSON('session/log.json', this.sessions);
    } else if (n === 'ideas/items.json') {
      this.ideas = readJSON('ideas/items.json', this.ideas);
    } else if (n === 'activity/feed.json') {
      this.activity = readJSON('activity/feed.json', this.activity);
    } else if (n === 'labels/labels.json') {
      this.labels = readJSON('labels/labels.json', this.labels);
    } else if (n === 'automations/automations.json') {
      this.automations = readJSON('automations/automations.json', this.automations);
    } else if (n === 'docs/registry.json') {
      this.docsRegistry = readJSON('docs/registry.json', this.docsRegistry);
    } else if (n === 'metrics/velocity.json') {
      this.velocity = readJSON('metrics/velocity.json', this.velocity);
    }
  }

  // ─── Computed Helpers ─────────────────────────────────────────────────

  getQuickStatus(): QuickStatus {
    const nowItems = this.roadmap.items
      .filter(i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled')
      .map(i => ({ title: i.title, size: i.size, status: i.status }));

    const openIssues = this.issues.issues.filter(i => i.status === 'open' || i.status === 'in_progress');
    const criticalIssues = openIssues.filter(i => i.severity === 'critical');

    const lastSession = this.sessions.sessions.length > 0
      ? this.sessions.sessions[this.sessions.sessions.length - 1]
      : null;

    return {
      project: this.config.project,
      health: this.state.overall_health,
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
      active_epics: this.epics.epics.filter(e => e.status === 'active').length,
      active_milestones: this.milestones.milestones.filter(m => m.status === 'active').length,
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
    const issueStr = `Issues: ${qs.open_issues.total}${qs.open_issues.critical > 0 ? ` (${qs.open_issues.critical} crit)` : ''}`;
    const epicStr = qs.active_epics > 0 ? ` | Epics: ${qs.active_epics}` : '';
    const msStr = qs.active_milestones > 0 ? ` | Milestones: ${qs.active_milestones}` : '';

    return `${qs.project} | ${qs.health}% health | Now: ${nowStr || 'none'} | ${sessionStr} | ${lastStr} | ${issueStr}${epicStr}${msStr}`;
  }

  // ─── Epic progress computation ────────────────────────────────────────

  recomputeEpicProgress(epicId: string): void {
    const epic = this.epics.epics.find(e => e.id === epicId);
    if (!epic) return;

    const items = this.roadmap.items.filter(i => i.epic_id === epicId);
    epic.item_count = items.length;
    epic.completed_count = items.filter(i => i.status === 'completed').length;
    epic.progress_pct = items.length > 0
      ? Math.round((epic.completed_count / epic.item_count) * 100)
      : 0;

    if (epic.completed_count === epic.item_count && epic.item_count > 0 && epic.status === 'active') {
      epic.status = 'completed';
      epic.completed = new Date().toISOString().split('T')[0];
    }

    epic.updated = new Date().toISOString().split('T')[0];
  }

  // ─── Milestone progress computation ───────────────────────────────────

  recomputeMilestoneProgress(milestoneId: string): void {
    const ms = this.milestones.milestones.find(m => m.id === milestoneId);
    if (!ms) return;

    const items = this.roadmap.items.filter(i => i.milestone_id === milestoneId);
    ms.total_items = items.length;
    ms.completed_items = items.filter(i => i.status === 'completed').length;
    ms.progress_pct = items.length > 0
      ? Math.round((ms.completed_items / ms.total_items) * 100)
      : 0;

    const blockingIssues = this.issues.issues.filter(
      i => i.milestone_id === milestoneId && (i.status === 'open' || i.status === 'in_progress')
    );
    ms.blocking_issues = blockingIssues.length;

    ms.updated = new Date().toISOString().split('T')[0];
  }

  // ─── Design Docs ──────────────────────────────────────────────────────

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
