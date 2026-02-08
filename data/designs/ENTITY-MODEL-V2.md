# DevTrack Entity Model v2 — Complete Specification

## Overview

This spec defines every entity in DevTrack, their fields, relationships, and lifecycle flows.
Designed for: enterprise-grade project + product management, fully AI-managed.

---

## Entity Hierarchy

```
Ideas (funnel — anything goes)
  ↓ promote
Roadmap Items (committed features — we're building this)
  ↓ group into
Epics (themes — "Auth System", "Payment Flow")
  ↓ target
Milestones (delivery checkpoints — "v0.2", "MVP Launch")
  ↓ bundle into
Releases (shipped versions with release notes)

Issues (bugs/problems — separate from features)
  ↔ linked to Roadmap Items

Systems (live architecture map — health, ownership, dependencies)
  ← fed by codebase scanner, issues, integrations

Sessions (work blocks with retros)
  → produce Changelog entries

Docs (wiki — auto-generated + human-edited)
  ← synthesized from all entities
```

---

## 1. Ideas

**Purpose:** Capture anything. Wild, half-formed, crazy. Low ceremony. Most die here.

```typescript
interface Idea {
  id: string;              // IDEA-001
  title: string;
  description: string;
  category: IdeaCategory;  // feature | architecture | ux | business | integration | core | security | process
  status: IdeaStatus;      // captured | exploring | validated | promoted | parked | rejected
  priority: Priority;      // low | medium | high | critical
  source: string;          // "conversation", "ai-audit", "user", "session-6"
  related_ideas: string[]; // IDEA-xxx references
  promoted_to: string | null; // Roadmap item ID if promoted
  pros: string[];
  cons: string[];
  open_questions: string[];
  notes: string | null;
  tags: string[];          // NEW: cross-cutting labels
  created: string;
  updated: string;
}
```

**Lifecycle:** captured → exploring → validated → promoted (becomes Roadmap item) OR parked/rejected
**AI behavior:** Capture from conversation automatically. Suggest promotion when validated + aligned with roadmap.

---

## 2. Roadmap Items (replaces Backlog)

**Purpose:** Committed features and tasks. If it's here, we're building it.

```typescript
interface RoadmapItem {
  id: string;              // kebab-case: "auth-overhaul", "payment-flow"
  title: string;
  summary: string;         // detailed description (markdown)
  type: ItemType;          // feature | enhancement | infrastructure | research | chore
  horizon: Horizon;        // now | next | later | shipped
  priority: Priority;      // P0 (critical) | P1 (high) | P2 (medium) | P3 (low)
  size: Size;              // S | M | L | XL
  status: ItemStatus;      // pending | in_progress | in_review | completed | cancelled
  category: string;        // core, ui, backend, integrations, etc.
  
  // Relationships
  epic_id: string | null;  // parent Epic
  milestone_id: string | null; // target Milestone
  depends_on: string[];    // IDs of blocking items
  blocked_by: string[];    // IDs this blocks
  related_issues: string[]; // linked issue IDs
  spawned_from: string | null; // IDEA-xxx if promoted from idea
  
  // Metadata
  assignee: string | null;
  tags: string[];          // cross-cutting labels
  design_doc: string | null;
  acceptance_criteria: string[]; // NEW: definition of done
  
  // Tracking
  created: string;
  updated: string;
  started: string | null;
  completed: string | null;
  
  // AI
  ai_notes: string | null; // AI's assessment of this item
  estimated_sessions: number | null; // AI-predicted effort
}
```

**Lifecycle:** pending → in_progress → in_review → completed → (auto-moves to shipped horizon)
**AI behavior:** Auto-estimate sessions from size + historical velocity. Suggest priority changes based on dependencies and blockers. Auto-move to "shipped" when completed.

---

## 3. Epics

**Purpose:** Group related roadmap items into themes. "Auth System" contains: login, signup, OAuth, 2FA, password reset.

```typescript
interface Epic {
  id: string;              // kebab-case: "auth-system", "payment-flow"
  title: string;
  description: string;
  status: EpicStatus;      // planning | active | completed | cancelled
  priority: Priority;
  color: string;           // hex color for UI grouping
  milestone_id: string | null; // target milestone
  
  // Computed (from child items)
  item_count: number;
  completed_count: number;
  progress_pct: number;    // 0-100
  
  tags: string[];
  created: string;
  updated: string;
  completed: string | null;
  
  ai_summary: string | null; // AI-generated epic status summary
}
```

**AI behavior:** Auto-calculate progress from child items. Suggest new items when gaps detected. Auto-complete when all children complete.

---

## 4. Milestones

**Purpose:** Delivery checkpoints. "v0.2 — Dogfooding Ready", "MVP Launch". Roadmap items target milestones.

```typescript
interface Milestone {
  id: string;              // kebab-case: "v0-2-dogfood", "mvp-launch"
  title: string;
  description: string;
  version: string | null;  // semver: "0.2.0", "1.0.0"
  status: MilestoneStatus; // planning | active | completed | missed
  target_date: string | null; // target delivery date
  completed_date: string | null;
  
  // Computed
  total_items: number;
  completed_items: number;
  progress_pct: number;
  blocking_issues: number; // open issues blocking this milestone
  
  tags: string[];
  created: string;
  updated: string;
  
  ai_prediction: string | null; // "At current velocity, ships in ~3 sessions"
}
```

**AI behavior:** Predict completion date from velocity. Warn when at risk. Auto-suggest version bump type (major/minor/patch) from changelog types. Suggest "good milestone checkpoint" when enough features ship.

---

## 5. Releases

**Purpose:** Shipped versions. Bundle changelog entries into release notes.

```typescript
interface Release {
  id: string;              // "v0.2.0", "v1.0.0"
  version: string;         // semver
  title: string;           // "Dogfooding Ready"
  milestone_id: string | null;
  status: ReleaseStatus;   // draft | published
  
  // Content
  release_notes: string;   // markdown — AI-generated from changelogs
  changelog_ids: string[]; // CL-xxx entries included
  roadmap_items_shipped: string[]; // item IDs shipped in this release
  issues_resolved: string[]; // ISS-xxx resolved
  
  // Stats
  total_commits: number;
  files_changed: number;
  contributors: string[];
  
  published_date: string | null;
  created: string;
  
  ai_summary: string | null; // one-paragraph AI summary
}
```

**AI behavior:** Auto-draft release notes from changelog + roadmap items. Suggest when to release based on accumulated changes. Generate user-facing vs developer-facing notes.

---

## 6. Issues

**Purpose:** Bugs, problems, things broken. Separate from features.

```typescript
interface Issue {
  id: string;              // ISS-001
  title: string;
  status: IssueStatus;     // open | in_progress | resolved | wont_fix
  severity: Severity;      // critical | high | medium | low
  type: IssueType;         // bug | security | performance | ux | tech_debt
  
  // Details
  symptoms: string;
  root_cause: string | null;
  resolution: string | null;
  files: string[];
  
  // Relationships
  roadmap_item: string | null; // related feature
  epic_id: string | null;
  milestone_id: string | null; // blocking which milestone
  blocked_by_issue: string | null; // depends on another issue
  
  // Metadata
  assignee: string | null;
  tags: string[];
  discovered: string;
  discovered_by: string;   // "ai-audit", "user", "session-6", "integration:sentry"
  resolved: string | null;
  
  notes: string | null;
}
```

---

## 7. Systems (replaces Actions)

**Purpose:** Live architecture map. Each system has health, ownership, dependencies. Fed by scanner + AI analysis.

```typescript
interface System {
  id: string;              // "server", "web-ui", "auth", "payments"
  name: string;
  description: string;     // AI-generated plain-English description
  status: SystemStatus;    // healthy | degraded | critical | unknown | planned
  
  // Health (AI-assessed, not manual)
  health_score: number;    // 0-100
  health_signals: HealthSignal[]; // what's contributing to the score
  last_assessed: string;
  
  // Metadata
  owner: string | null;
  tech_stack: string[];    // ["Hono", "TypeScript", "PostgreSQL"]
  modules: string[];       // codebase module IDs
  dependencies: string[];  // other system IDs this depends on
  dependents: string[];    // systems that depend on this
  
  // Metrics
  open_issues: number;
  recent_commits: number;  // last 30 days
  test_coverage: number | null;
  
  tags: string[];
  created: string;
  updated: string;
}

interface HealthSignal {
  type: string;            // "issue_count" | "test_coverage" | "dependency_freshness" | "complexity" | "activity"
  score: number;           // 0-100
  detail: string;          // "3 open issues (1 high)"
}
```

**AI behavior:** Auto-assess health from codebase analysis, issue counts, git activity, integration status. Update on every scan/session end. Proactively create issues when health degrades.

---

## 8. Changelog

**Purpose:** What shipped and why. Two sub-types.

```typescript
interface ChangelogEntry {
  id: string;              // CL-001
  date: string;
  session: number | null;
  title: string;
  description: string;
  type: ChangeType;        // feature | enhancement | fix | refactor | docs | chore
  scope: string;           // area affected
  
  // Relationships
  roadmap_item: string | null;
  epic_id: string | null;
  issues_resolved: string[];
  release_id: string | null;
  
  // Files
  files_changed: string[];
  
  // Git
  commit_hashes: string[]; // linked git commits
  
  breaking: boolean;
  tags: string[];
}
```

**Git History sub-view:** Parsed from conventional commits, grouped by day, auto-linked to roadmap items.

---

## 9. Sessions

**Purpose:** Work blocks with objectives and retros.

```typescript
interface Session {
  id: number;              // auto-increment
  date: string;
  objective: string;
  appetite: string;        // "4h"
  status: SessionStatus;   // active | completed
  
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
  
  // AI observation
  ai_observation: string | null; // session-end behavioral observation
}
```

---

## 10. Docs

**Purpose:** Living wiki. Auto-generated + human-edited.

```typescript
interface Doc {
  id: string;              // slug: "auth-system", "api-reference"
  title: string;
  type: DocType;           // design | decision | adr | rfc | wiki | auto-generated
  content: string;         // markdown
  
  // Relationships
  systems: string[];       // related system IDs
  roadmap_items: string[]; // related features
  epics: string[];
  
  // Auto-generation
  auto_generated: boolean;
  last_generated: string | null;
  generation_sources: string[]; // what data fed this doc
  
  // Metadata
  author: string;          // "ai" | "user"
  status: DocStatus;       // draft | published | archived
  tags: string[];
  created: string;
  updated: string;
}
```

**AI behavior:** Auto-generate system docs from codebase analysis + roadmap + issues + sessions. Keep updated on every scan. Human can edit, AI won't overwrite human edits (tracks sections as auto vs manual).

---

## 11. Activity Feed

**Purpose:** Unified timeline of everything happening.

```typescript
interface ActivityEvent {
  id: string;
  timestamp: string;
  type: ActivityType;      // item_created | item_completed | issue_opened | issue_resolved | 
                           // session_started | session_ended | release_published | system_health_changed |
                           // idea_captured | doc_updated | milestone_reached | epic_completed
  entity_type: string;     // "roadmap" | "issue" | "idea" | "session" | etc.
  entity_id: string;
  title: string;           // human-readable description
  actor: string;           // "user" | "ai" | "system" | "integration:github"
  metadata: Record<string, any>; // entity-specific data
}
```

---

## 12. Labels / Tags

**Purpose:** Cross-cutting concerns that span all entities.

```typescript
interface Label {
  id: string;              // "security", "tech-debt", "customer-facing"
  name: string;
  color: string;           // hex
  description: string;
  entity_count: number;    // how many things have this label
}
```

Applied to: Roadmap Items, Issues, Epics, Ideas, Docs, Systems.

---

## 13. Automations

**Purpose:** AI-driven rules that fire on events.

```typescript
interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger; // "issue_created" | "item_completed" | "session_ended" | "health_changed" | "scheduled"
  conditions: AutomationCondition[]; // e.g., { field: "severity", op: "eq", value: "critical" }
  actions: AutomationAction[]; // e.g., { type: "move_to_horizon", value: "now" } | { type: "create_issue" } | { type: "notify" }
  
  // AI automations
  ai_driven: boolean;      // true = AI decides when to fire (no rigid conditions)
  ai_prompt: string | null; // instruction for AI-driven automations
  
  last_fired: string | null;
  fire_count: number;
  created: string;
}
```

**Built-in automations:**
- When issue severity=critical → auto-promote to Now horizon
- When roadmap item completed → generate changelog entry
- When session ends → audit data freshness, update system health, write context recovery
- When milestone all items complete → suggest release
- Nightly: full project audit, health reassessment, stale data cleanup

---

## 14. Brain (AI Memory)

Keep as-is: notes, preferences, context-recovery, profiles. Not user-facing as primary navigation.

---

## Enums

```typescript
type Priority = 'P0' | 'P1' | 'P2' | 'P3';  // or 'critical' | 'high' | 'medium' | 'low'
type Size = 'S' | 'M' | 'L' | 'XL';
type Horizon = 'now' | 'next' | 'later' | 'shipped';
type ItemType = 'feature' | 'enhancement' | 'infrastructure' | 'research' | 'chore';
type ItemStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';
type EpicStatus = 'planning' | 'active' | 'completed' | 'cancelled';
type MilestoneStatus = 'planning' | 'active' | 'completed' | 'missed';
type IssueType = 'bug' | 'security' | 'performance' | 'ux' | 'tech_debt';
type ChangeType = 'feature' | 'enhancement' | 'fix' | 'refactor' | 'docs' | 'chore';
type SystemStatus = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'planned';
type DocType = 'design' | 'decision' | 'adr' | 'rfc' | 'wiki' | 'auto-generated';
```

---

## Data Files

```
data/
  config.json                    # Project config
  state.json                     # → becomes systems.json
  roadmap/
    items.json                   # Roadmap items (was backlog/items.json)
    epics.json                   # Epics
    milestones.json              # Milestones
  releases/
    releases.json                # Release history
  issues/
    items.json                   # Issues (keep)
  ideas/
    items.json                   # Ideas (keep)
  changelog/
    entries.json                 # Changelog (keep, enhance)
  session/
    current.json                 # Current session
    log.json                     # Session history
  systems/
    systems.json                 # System health map (was state.json systems[])
    analysis.json                # Codebase analysis (was codebase/analysis.json)
  docs/
    *.md                         # Wiki/design docs
    registry.json                # Doc metadata (auto-gen status, relationships)
  activity/
    feed.json                    # Activity feed (rolling window, last 500)
  labels/
    labels.json                  # Label definitions
  automations/
    automations.json             # Automation rules
  brain/
    notes.json                   # AI brain notes
    preferences.json             # Preferences
    context-recovery.json        # Session handoff
  ai/
    config.json                  # AI provider config
    profiles.json                # User profiles
    conversations/               # Chat history
  metrics/
    velocity.json                # Velocity data
```

---

## Migration Path

1. `backlog/items.json` → `roadmap/items.json` (rename fields, add new fields with defaults)
2. `state.json` systems[] → `systems/systems.json` (extract into own file)
3. `actions/registry.json` → deprecated (merge relevant data into systems)
4. `codebase/analysis.json` → `systems/analysis.json` (move)
5. Create empty files for: epics, milestones, releases, activity feed, labels, automations, doc registry
6. Update all imports, routes, store, tools

All existing data preserved. New fields get sensible defaults. Nothing deleted.
