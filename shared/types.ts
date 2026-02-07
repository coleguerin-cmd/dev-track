// ─── Core Enums ─────────────────────────────────────────────────────────────

export type Horizon = 'now' | 'next' | 'later';
export type Size = 'S' | 'M' | 'L' | 'XL';
export type ItemStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';
export type ActionHealth = 'green' | 'yellow' | 'red' | 'unknown';
export type SystemStatus = 'production' | 'v1_complete' | 'partial' | 'planned' | 'deprioritized';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type RunResult = 'all_pass' | 'partial_pass' | 'fail' | 'error';
export type RunTrigger = 'manual' | 'cli' | 'deploy_hook' | 'scheduled';

export type Verbosity = 'detailed' | 'summary' | 'minimal';
export type DiagnosticVerbosity = 'full_output' | 'summary' | 'pass_fail_only';
export type AIContextLevel = 'verbose' | 'efficient' | 'minimal';

// ─── Config ─────────────────────────────────────────────────────────────────

export interface DevTrackConfig {
  project: string;
  description: string;
  created: string;
  version: string;
  settings: {
    max_now_items: number;
    max_session_history: number;
    max_run_history_per_action: number;
    auto_archive_resolved_issues_after_days: number;
    changelog_window_days: number;
    completed_backlog_window_days: number;
    summary_period: 'weekly' | 'biweekly' | 'monthly';
    verbosity: {
      changelog_entries: Verbosity;
      session_retros: Verbosity;
      issue_commentary: Verbosity;
      design_docs: Verbosity;
      diagnostic_output: DiagnosticVerbosity;
      backlog_descriptions: Verbosity;
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

// ─── State ──────────────────────────────────────────────────────────────────

export interface ProjectState {
  last_updated: string;
  overall_completion: number;
  summary: string;
  systems: SystemRating[];
  remaining: {
    must_have: RemainingItem[];
    important: RemainingItem[];
    nice_to_have: RemainingItem[];
  };
}

export interface SystemRating {
  id: string;
  name: string;
  status: SystemStatus;
  rating: number; // 0-10
  notes: string;
}

export interface RemainingItem {
  item: string;
  done: boolean;
  completed?: string;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface SessionPlan {
  date: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  developer: string;
  objective: string;
  appetite: string;
  items: SessionItem[];
  wont_do: string[];
  notes: string;
}

export interface SessionItem {
  backlog_id: string;
  title: string;
  status: ItemStatus;
}

export interface SessionLog {
  sessions: SessionEntry[];
}

export interface SessionEntry {
  date: string;
  developer: string;
  started_at: string;
  ended_at: string;
  duration_hours: number;
  objective: string;
  items_planned: number;
  items_shipped: number;
  shipped: ShippedItem[];
  discovered: string[];
  next_session_suggestion: string;
  handoff_message?: string; // For multi-dev communication
}

export interface ShippedItem {
  title: string;
  size: Size;
  category: string;
}

// ─── Backlog ────────────────────────────────────────────────────────────────

export interface BacklogItem {
  id: string;
  title: string;
  horizon: Horizon;
  size: Size;
  status: ItemStatus;
  category: string;
  summary: string;
  design_doc: string | null;
  depends_on: string[];
  assignee: string | null;
  created: string;
  updated: string;
  completed: string | null;
  tags: string[];
}

export interface BacklogData {
  items: BacklogItem[];
}

// ─── Changelog ──────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  id: string;
  date: string;
  session_date: string;
  category: string;
  title: string;
  description: string;
  items: string[];
  files_touched: string[];
  backlog_item: string | null;
  breaking: boolean;
}

export interface ChangelogData {
  entries: ChangelogEntry[];
}

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

export interface ChangelogSummaries {
  summaries: ChangelogSummary[];
}

// ─── Actions ────────────────────────────────────────────────────────────────

export interface ActionScript {
  name: string;
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface ExpectedOutcome {
  id: string;
  description: string;
}

export interface Action {
  id: string;
  name: string;
  description: string;
  playbook: string;
  scripts: ActionScript[];
  expected_outcomes: ExpectedOutcome[];
  health: ActionHealth;
  pass_rate: { passed: number; total: number };
  open_issues: number;
  last_run: string | null;
  created: string;
}

export interface ActionsRegistry {
  actions: Action[];
}

// ─── Issues ─────────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  title: string;
  action_id: string | null;
  status: IssueStatus;
  severity: IssueSeverity;
  assignee: string | null;
  discovered: string;
  discovered_in_run: string | null;
  symptoms: string;
  root_cause: string | null;
  files: string[];
  backlog_item: string | null;
  resolution: string | null;
  resolved: string | null;
  notes: string;
}

export interface IssuesData {
  issues: Issue[];
  next_id: number;
}

// ─── Runs ───────────────────────────────────────────────────────────────────

export interface RunOutcome {
  id: string;
  pass: boolean;
  detail: string;
}

export interface DiagnosticRun {
  id: string;
  action_id: string;
  timestamp: string;
  trigger: RunTrigger;
  duration_seconds: number;
  result: RunResult;
  outcomes: RunOutcome[];
  issues_created: string[];
  issues_resolved: string[];
  script_outputs: Record<string, string>;
  notes: string;
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
}

// ─── AI Brain ───────────────────────────────────────────────────────────────

export type BrainNoteType = 'observation' | 'suggestion' | 'warning' | 'decision' | 'preference' | 'reminder';
export type BrainNotePriority = 'low' | 'medium' | 'high' | 'critical';

export interface BrainNote {
  id: string;
  type: BrainNoteType;
  priority: BrainNotePriority;
  title: string;
  content: string;
  context: string;         // What triggered this note (session, diagnostic, user conversation)
  actionable: boolean;     // Does this require user action?
  action_taken: boolean;   // Has the user/AI acted on it?
  related_items: string[]; // Links to backlog items, issues, ideas
  created: string;
  expires: string | null;  // Auto-dismiss after this date
  dismissed: boolean;
}

export interface BrainNotesData {
  notes: BrainNote[];
  next_id: number;
}

export interface UserPreference {
  key: string;
  value: string;
  learned_from: string;  // How did we learn this? "user said", "observed pattern", "explicit setting"
  confidence: number;    // 0-1
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
  briefing: string;          // One paragraph: "Last session you shipped X, found bug Y, planned to do Z"
  hot_context: string[];     // Critical items the AI should know right now
  warnings: string[];        // Things going wrong
  suggestions: string[];     // What the AI thinks should happen next
}

// ─── Ideas ──────────────────────────────────────────────────────────────────

export type IdeaStatus = 'captured' | 'exploring' | 'validated' | 'promoted' | 'parked' | 'rejected';
export type IdeaCategory = 'feature' | 'architecture' | 'integration' | 'ux' | 'performance' | 'business' | 'process' | 'other';

export interface Idea {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  source: string;          // Where did this come from? "voice chat 2026-02-07", "debugging session", "shower thought"
  related_ideas: string[]; // Links to other ideas
  promoted_to: string | null; // Backlog item ID if promoted
  pros: string[];
  cons: string[];
  open_questions: string[];
  notes: string;
  created: string;
  updated: string;
}

export interface IdeasData {
  ideas: Idea[];
  next_id: number;
}

// ─── Activity Feed ──────────────────────────────────────────────────────────

export type ActivityType = 
  | 'session_started' | 'session_ended'
  | 'item_created' | 'item_completed' | 'item_moved'
  | 'issue_created' | 'issue_resolved'
  | 'diagnostic_run' | 'diagnostic_failed'
  | 'changelog_entry'
  | 'idea_captured' | 'idea_promoted'
  | 'brain_note' | 'brain_warning'
  | 'integration_alert';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  source: string;   // 'ai' | 'user' | 'system' | 'integration'
  links: { type: string; id: string }[];
}

// ─── API Types ──────────────────────────────────────────────────────────────

export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface WSEvent {
  type:
    | 'state_updated'
    | 'backlog_updated'
    | 'session_updated'
    | 'issue_created'
    | 'issue_updated'
    | 'issue_resolved'
    | 'run_completed'
    | 'action_health_changed'
    | 'changelog_updated'
    | 'file_changed'
    | 'settings_changed';
  data: unknown;
  timestamp: string;
}
