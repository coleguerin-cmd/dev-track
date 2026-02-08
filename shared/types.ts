// ═══════════════════════════════════════════════════════════════════════════
// DevTrack Entity Model v2 — Complete Type Definitions
// 14 entities, enterprise-grade project + product management
// ═══════════════════════════════════════════════════════════════════════════

// ─── Core Enums ─────────────────────────────────────────────────────────────

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Size = 'S' | 'M' | 'L' | 'XL';
export type Horizon = 'now' | 'next' | 'later' | 'shipped';
export type ItemType = 'feature' | 'enhancement' | 'infrastructure' | 'research' | 'chore';
export type ItemStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export type EpicStatus = 'planning' | 'active' | 'completed' | 'cancelled';
export type MilestoneStatus = 'planning' | 'active' | 'completed' | 'missed';
export type ReleaseStatus = 'draft' | 'published';

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueType = 'bug' | 'security' | 'performance' | 'ux' | 'tech_debt';

export type ChangeType = 'feature' | 'enhancement' | 'fix' | 'refactor' | 'docs' | 'chore';
export type SystemStatus = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'planned';
export type SessionStatus = 'active' | 'completed';

export type DocType = 'design' | 'decision' | 'adr' | 'rfc' | 'wiki' | 'auto-generated';
export type DocStatus = 'draft' | 'published' | 'archived';

export type IdeaStatus = 'captured' | 'exploring' | 'validated' | 'promoted' | 'parked' | 'rejected';
export type IdeaCategory = 'feature' | 'architecture' | 'integration' | 'ux' | 'performance' | 'business' | 'process' | 'security' | 'core' | 'other';

export type AutomationTrigger = 'issue_created' | 'item_completed' | 'session_ended' | 'health_changed' | 'scheduled';

// Config-level enums
export type Verbosity = 'detailed' | 'summary' | 'minimal';
export type DiagnosticVerbosity = 'full_output' | 'summary' | 'pass_fail_only';
export type AIContextLevel = 'verbose' | 'efficient' | 'minimal';

// Activity feed
export type ActivityType =
  | 'item_created' | 'item_completed' | 'item_moved'
  | 'issue_opened' | 'issue_resolved'
  | 'session_started' | 'session_ended'
  | 'release_published'
  | 'system_health_changed'
  | 'idea_captured' | 'idea_promoted'
  | 'doc_updated'
  | 'milestone_reached' | 'epic_completed'
  | 'changelog_entry';

// ─── Config ─────────────────────────────────────────────────────────────────

export interface DevTrackConfig {
  project: string;
  description: string;
  created: string;
  version: string;
  settings: {
    max_now_items: number;
    max_session_history: number;
    auto_archive_resolved_issues_after_days: number;
    changelog_window_days: number;
    completed_items_window_days: number;
    summary_period: 'weekly' | 'biweekly' | 'monthly';
    verbosity: {
      changelog_entries: Verbosity;
      session_retros: Verbosity;
      issue_commentary: Verbosity;
      design_docs: Verbosity;
      diagnostic_output: DiagnosticVerbosity;
      roadmap_descriptions: Verbosity;
      ai_context_loading: AIContextLevel;
    };
    developers: Developer[];
  };
}

export interface Developer {
  id: string;
  name: string;
  role: 'lead' | 'developer' | 'contributor';
}

// ─── 1. Ideas ───────────────────────────────────────────────────────────────

export interface Idea {
  id: string;              // IDEA-001
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  priority: Priority;
  source: string;
  related_ideas: string[];
  promoted_to: string | null;
  pros: string[];
  cons: string[];
  open_questions: string[];
  notes: string | null;
  tags: string[];
  created: string;
  updated: string;
}

export interface IdeasData {
  ideas: Idea[];
  next_id: number;
}

// ─── 2. Roadmap Items (replaces Backlog) ────────────────────────────────────

export interface RoadmapItem {
  id: string;
  title: string;
  summary: string;
  type: ItemType;
  horizon: Horizon;
  priority: Priority;
  size: Size;
  status: ItemStatus;
  category: string;

  // Relationships
  epic_id: string | null;
  milestone_id: string | null;
  depends_on: string[];
  blocked_by: string[];
  related_issues: string[];
  spawned_from: string | null;

  // Metadata
  assignee: string | null;
  tags: string[];
  design_doc: string | null;
  acceptance_criteria: string[];

  // Tracking
  created: string;
  updated: string;
  started: string | null;
  completed: string | null;

  // AI
  ai_notes: string | null;
  estimated_sessions: number | null;
}

/** @deprecated Use RoadmapItem */
export type BacklogItem = RoadmapItem;

export interface RoadmapData {
  items: RoadmapItem[];
}

/** @deprecated Use RoadmapData */
export type BacklogData = RoadmapData;

// ─── 3. Epics ───────────────────────────────────────────────────────────────

export interface Epic {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: Priority;
  color: string;
  milestone_id: string | null;

  // Computed from child items
  item_count: number;
  completed_count: number;
  progress_pct: number;

  tags: string[];
  created: string;
  updated: string;
  completed: string | null;

  ai_summary: string | null;
}

export interface EpicsData {
  epics: Epic[];
}

// ─── 4. Milestones ──────────────────────────────────────────────────────────

export interface Milestone {
  id: string;
  title: string;
  description: string;
  version: string | null;
  status: MilestoneStatus;
  target_date: string | null;
  completed_date: string | null;

  // Computed
  total_items: number;
  completed_items: number;
  progress_pct: number;
  blocking_issues: number;

  tags: string[];
  created: string;
  updated: string;

  ai_prediction: string | null;
}

export interface MilestonesData {
  milestones: Milestone[];
}

// ─── 5. Releases ────────────────────────────────────────────────────────────

export interface Release {
  id: string;
  version: string;
  title: string;
  milestone_id: string | null;
  status: ReleaseStatus;

  release_notes: string;
  changelog_ids: string[];
  roadmap_items_shipped: string[];
  issues_resolved: string[];

  total_commits: number;
  files_changed: number;
  contributors: string[];

  published_date: string | null;
  created: string;

  ai_summary: string | null;
}

export interface ReleasesData {
  releases: Release[];
}

// ─── 6. Issues ──────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  severity: IssueSeverity;
  type: IssueType;

  // Details
  symptoms: string;
  root_cause: string | null;
  resolution: string | null;
  files: string[];

  // Relationships
  roadmap_item: string | null;
  epic_id: string | null;
  milestone_id: string | null;
  blocked_by_issue: string | null;

  // Metadata
  assignee: string | null;
  tags: string[];
  discovered: string;
  discovered_by: string;
  resolved: string | null;

  notes: string | null;
}

export interface IssuesData {
  issues: Issue[];
  next_id: number;
}

// ─── 7. Systems (replaces Actions + State.systems) ──────────────────────────

export interface HealthSignal {
  type: string;  // issue_count | test_coverage | dependency_freshness | complexity | activity
  score: number; // 0-100
  detail: string;
}

export interface System {
  id: string;
  name: string;
  description: string;
  status: SystemStatus;

  // Health (AI-assessed)
  health_score: number;
  health_signals: HealthSignal[];
  last_assessed: string;

  // Metadata
  owner: string | null;
  tech_stack: string[];
  modules: string[];
  dependencies: string[];
  dependents: string[];

  // Metrics
  open_issues: number;
  recent_commits: number;
  test_coverage: number | null;

  tags: string[];
  created: string;
  updated: string;
}

export interface SystemsData {
  systems: System[];
}

// ─── 8. Changelog ───────────────────────────────────────────────────────────

export interface ChangelogEntry {
  id: string;              // CL-001
  date: string;
  session: number | null;
  title: string;
  description: string;
  type: ChangeType;
  scope: string;

  // Relationships
  roadmap_item: string | null;
  epic_id: string | null;
  issues_resolved: string[];
  release_id: string | null;

  // Files
  files_changed: string[];

  // Git
  commit_hashes: string[];

  breaking: boolean;
  tags: string[];
}

export interface ChangelogData {
  entries: ChangelogEntry[];
}

// ─── 9. Sessions ────────────────────────────────────────────────────────────

export interface Session {
  id: number;
  date: string;
  developer: string;
  objective: string;
  appetite: string;
  status: SessionStatus;

  started_at: string;
  ended_at: string | null;
  duration_hours: number;

  // What happened
  items_shipped: number;
  points: number;
  roadmap_items_completed: string[];
  issues_resolved: string[];
  ideas_captured: string[];
  changelog_ids: string[];

  retro: string | null;
  next_suggestion: string | null;

  ai_observation: string | null;
}

export interface SessionsData {
  sessions: Session[];
  next_id: number;
}

// ─── 10. Docs ───────────────────────────────────────────────────────────────

export interface Doc {
  id: string;
  title: string;
  type: DocType;
  content: string;

  // Relationships
  systems: string[];
  roadmap_items: string[];
  epics: string[];

  // Auto-generation
  auto_generated: boolean;
  last_generated: string | null;
  generation_sources: string[];

  // Metadata
  author: string;
  status: DocStatus;
  tags: string[];
  created: string;
  updated: string;
}

export interface DocsRegistryData {
  docs: Doc[];
}

// ─── 11. Activity Feed ──────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: ActivityType;
  entity_type: string;
  entity_id: string;
  title: string;
  actor: string;
  metadata: Record<string, any>;
}

export interface ActivityFeedData {
  events: ActivityEvent[];
  next_id: number;
}

// ─── 12. Labels ─────────────────────────────────────────────────────────────

export interface Label {
  id: string;
  name: string;
  color: string;
  description: string;
  entity_count: number;
}

export interface LabelsData {
  labels: Label[];
}

// ─── 13. Automations ────────────────────────────────────────────────────────

export interface AutomationCondition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
  value: any;
}

export interface AutomationAction {
  type: string;
  value?: any;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];

  ai_driven: boolean;
  ai_prompt: string | null;

  last_fired: string | null;
  fire_count: number;
  created: string;
}

export interface AutomationsData {
  automations: Automation[];
}

// ─── 14. Brain (AI Memory) ──────────────────────────────────────────────────

export type BrainNoteType = 'observation' | 'suggestion' | 'warning' | 'decision' | 'preference' | 'reminder';
export type BrainNotePriority = 'low' | 'medium' | 'high' | 'critical';

export interface BrainNote {
  id: string;
  type: BrainNoteType;
  priority: BrainNotePriority;
  title: string;
  content: string;
  context: string;
  actionable: boolean;
  action_taken: boolean;
  related_items: string[];
  created: string;
  expires: string | null;
  dismissed: boolean;
}

export interface BrainNotesData {
  notes: BrainNote[];
  next_id: number;
}

export interface UserPreference {
  key: string;
  value: string;
  learned_from: string;
  confidence: number;
  updated: string;
}

export interface LearnedPattern {
  pattern: string;
  frequency: number;
  first_seen: string;
  last_seen: string;
  notes: string;
}

export interface BrainPreferences {
  preferences: UserPreference[];
  learned_patterns: LearnedPattern[];
}

export interface ContextRecovery {
  last_generated: string | null;
  briefing: string;
  hot_context: string[];
  warnings: string[];
  suggestions: string[];
}

// ─── Project State (v2: derived from Systems) ───────────────────────────────

export interface ProjectState {
  last_updated: string;
  overall_health: number;   // 0-100, computed from systems
  summary: string;
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export interface SessionMetric {
  date: string;
  developer: string;
  duration_hours: number;
  items_shipped: number;
  by_size: Record<Size, number>;
  by_category: Record<string, number>;
  points: number;
  issues_found: number;
  issues_resolved: number;
}

export interface MetricsTotals {
  total_sessions: number;
  total_items_shipped: number;
  total_points: number;
  avg_items_per_session: number;
  avg_points_per_session: number;
  total_issues_found: number;
  total_issues_resolved: number;
}

export interface VelocityData {
  sessions: SessionMetric[];
  totals: MetricsTotals;
  point_values: Record<Size, number>;
}

// ─── Quick Status ───────────────────────────────────────────────────────────

export interface QuickStatus {
  project: string;
  health: number;
  now_items: { title: string; size: Size; status: ItemStatus }[];
  session: { status: SessionStatus; duration_hours?: number } | null;
  last_session: { date: string; items_shipped: number } | null;
  open_issues: { total: number; critical: number };
  active_epics: number;
  active_milestones: number;
}

// ─── WebSocket Events ───────────────────────────────────────────────────────

export interface WSEvent {
  type:
    | 'roadmap_updated'
    | 'epic_updated'
    | 'milestone_updated'
    | 'release_updated'
    | 'system_updated'
    | 'session_updated'
    | 'issue_created'
    | 'issue_updated'
    | 'issue_resolved'
    | 'changelog_updated'
    | 'idea_updated'
    | 'label_updated'
    | 'automation_updated'
    | 'activity_event'
    | 'file_changed'
    | 'settings_changed';
  data: unknown;
  timestamp: string;
}

// ─── API Types ──────────────────────────────────────────────────────────────

export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Deprecated (kept for migration compatibility) ──────────────────────────

/** @deprecated v1 system rating — use System instead */
export interface SystemRating {
  id: string;
  name: string;
  status: string;
  rating: number;
  notes: string;
}

/** @deprecated v1 actions — removed in v2 */
export type ActionHealth = 'green' | 'yellow' | 'red' | 'unknown';

/** @deprecated v1 session plan — use Session instead */
export interface SessionPlan {
  date: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  developer: string;
  objective: string;
  appetite: string;
  items: { backlog_id: string; title: string; status: string }[];
  wont_do: string[];
  notes: string;
}

/** @deprecated v1 session entry — use Session instead */
export interface SessionEntry {
  date: string;
  developer: string;
  started_at: string;
  ended_at: string;
  duration_hours: number;
  objective: string;
  items_planned: number;
  items_shipped: number;
  shipped: { title: string; size: Size; category: string }[];
  discovered: string[];
  next_session_suggestion: string;
  handoff_message?: string;
}

// ─── 15. Audit Runs ─────────────────────────────────────────────────────────

export type AuditTriggerType = 'scheduled' | 'event' | 'manual' | 'requested';
export type AuditRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AuditStepType = 'thinking' | 'tool_call' | 'tool_result';
export type AuditSuggestionStatus = 'pending' | 'approved' | 'dismissed';

export interface AuditStep {
  index: number;
  type: AuditStepType;
  timestamp: string;
  // For thinking steps
  content?: string;
  // For tool_call / tool_result steps
  tool_name?: string;
  tool_args?: Record<string, any>;
  tool_result?: string;
  tool_result_preview?: string;
  // Per-step cost tracking
  tokens?: { input: number; output: number };
  cost_usd?: number;
}

export interface AuditChange {
  entity_type: string;
  entity_id: string;
  action: 'created' | 'updated' | 'deleted' | 'resolved';
  description: string;
  tool_name: string;
  field?: string;
  before?: any;
  after?: any;
}

export interface AuditSuggestion {
  id: string;
  description: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
  status: AuditSuggestionStatus;
  entity_type?: string;
  entity_id?: string;
}

export interface AuditRun {
  id: string;
  automation_id: string;
  automation_name: string;
  trigger: {
    type: AuditTriggerType;
    source: string;
    context: Record<string, any>;
  };
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: AuditRunStatus;
  model: string;
  provider: string;
  iterations: number;
  tokens: { input: number; output: number; total: number };
  cost_usd: number;
  steps: AuditStep[];
  summary: string;
  changes_made: AuditChange[];
  suggestions: AuditSuggestion[];
  errors: string[];
}

/** Lightweight index entry for listing without loading full run files */
export interface AuditRunIndex {
  id: string;
  automation_id: string;
  automation_name: string;
  trigger_type: AuditTriggerType;
  trigger_source: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: AuditRunStatus;
  model: string;
  cost_usd: number;
  iterations: number;
  summary: string;
  changes_count: number;
  changes_by_action?: { created: number; updated: number; deleted: number; resolved: number };
  suggestions_count: number;
  suggestions_pending: number;
  errors_count: number;
}

export interface AuditIndexData {
  runs: AuditRunIndex[];
  next_id: number;
}

// ─── Deprecated ─────────────────────────────────────────────────────────────

/** @deprecated v1 session log — use SessionsData instead */
export interface SessionLog {
  sessions: SessionEntry[];
}

/** @deprecated v1 changelog summary */
export interface ChangelogSummary {
  period: string;
  focus: string;
  items_shipped: number;
  points: number;
  highlights: string[];
  issues_found: number;
  issues_resolved: number;
  key_decisions: string[];
}

/** @deprecated v1 changelog summaries */
export interface ChangelogSummaries {
  summaries: ChangelogSummary[];
}
