# Data Model &amp; Entity Reference

> DevTrack's entity model v2 defines **14 entity types** in `shared/types.ts` (~778 lines). All types are shared between the server, UI, and CLI to ensure type safety across the entire stack.

---

## Entity Relationship Diagram

```
                    ┌──────────┐
                    │ Milestone│
                    │ (v0.2.0) │
                    └────┬─────┘
                         │ has many
                    ┌────▼─────┐        ┌──────────┐
                    │   Epic   │◄───────│  Release  │
                    │ (group)  │        │ (v0.2.0)  │
                    └────┬─────┘        └──────────┘
                         │ has many          ▲
                    ┌────▼─────────┐         │ bundles
                    │ Roadmap Item │─────────┘
                    │ (feature)    │
                    └──┬───────┬──┘
           spawned_from│       │ related_issues
                  ┌────▼──┐ ┌─▼──────┐
                  │ Idea  │ │ Issue  │
                  └───────┘ └────────┘

  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌───────┐
  │ System  │  │ Changelog │  │ Session  │  │ Brain │
  │ (arch)  │  │ (history) │  │ (work)   │  │ (AI)  │
  └─────────┘  └───────────┘  └──────────┘  └───────┘

  ┌──────────┐  ┌────────┐  ┌────────────┐  ┌──────┐
  │ Activity │  │ Label  │  │ Automation │  │ Doc  │
  │ (feed)   │  │ (tag)  │  │ (AI task)  │  │(wiki)│
  └──────────┘  └────────┘  └────────────┘  └──────┘
```

---

## Core Enums

These enums are used across multiple entity types:

```typescript
// Priority levels (P0 = critical, P3 = nice-to-have)
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

// Size estimates for effort
type Size = 'S' | 'M' | 'L' | 'XL';

// Planning horizons for roadmap items
type Horizon = 'now' | 'next' | 'later' | 'shipped';

// Item types for roadmap items
type ItemType = 'feature' | 'enhancement' | 'infrastructure' | 'research' | 'chore';

// Status for roadmap items
type ItemStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

// Issue severity levels
type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

// System health status
type SystemStatus = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'planned';
```

---

## 1. Ideas

**File**: `data/ideas/items.json`
**ID Format**: `IDEA-001`, `IDEA-002`, ...

Ideas are captured concepts that haven't been committed to the roadmap yet. They flow through a lifecycle: captured → exploring → validated → promoted (becomes a roadmap item) or dismissed.

```typescript
interface Idea {
  id: string;              // "IDEA-001"
  title: string;           // "AI-powered chaos testing"
  description: string;     // Full description with markdown
  category: IdeaCategory;  // 'feature' | 'architecture' | 'ux' | 'business' | ...
  status: IdeaStatus;      // 'captured' | 'exploring' | 'validated' | 'promoted' | 'dismissed'
  priority: Priority;      // P0-P3
  source: string;          // Where it came from ("conversation session-8")
  related_ideas: string[]; // ["IDEA-002", "IDEA-015"] — for clustering
  promoted_to: string | null; // Roadmap item ID if promoted
  pros: string[];          // Arguments for
  cons: string[];          // Arguments against
  open_questions: string[];// Unresolved questions
  notes: string | null;    // Additional context
  tags: string[];
  created: string;         // ISO date
  updated: string;         // ISO date
}
```

**Current State**: 68 ideas captured, organized into 8 clusters via `related_ideas` connections.

---

## 2. Roadmap Items

**File**: `data/roadmap/items.json` (aliased as `data/backlog/items.json`)
**ID Format**: kebab-case slugs like `ai-chat-agent`, `entity-model-v2-refactor`

Roadmap items are the work to be done. They use a **horizon-based** planning model (Now/Next/Later) instead of traditional sprints.

```typescript
interface RoadmapItem {
  id: string;              // "ai-chat-agent"
  title: string;
  summary: string;         // Detailed description
  type: ItemType;          // 'feature' | 'enhancement' | 'infrastructure' | 'chore'
  horizon: Horizon;        // 'now' | 'next' | 'later' | 'shipped'
  priority: Priority;      // P0-P3
  size: Size;              // S | M | L | XL
  status: ItemStatus;      // 'pending' | 'in_progress' | 'completed' | 'cancelled'
  category: string;        // "core", "ui", "architecture"

  // Relationships
  epic_id: string | null;        // Parent epic
  milestone_id: string | null;   // Target milestone
  depends_on: string[];          // Other item IDs this depends on
  blocked_by: string[];          // Items blocking this
  related_issues: string[];      // Related issue IDs
  spawned_from: string | null;   // Idea ID if promoted ("IDEA-052")

  // Metadata
  assignee: string | null;
  tags: string[];
  design_doc: string | null;     // Path to design doc
  acceptance_criteria: string[]; // Definition of done

  // Tracking
  created: string;
  updated: string;
  started: string | null;
  completed: string | null;

  // AI
  ai_notes: string | null;        // AI observations
  estimated_sessions: number | null; // AI estimate of effort
}
```

**Current State**: 46 roadmap items (18 shipped, 2 in progress, 26 pending).

---

## 3. Epics

**File**: `data/roadmap/epics.json`
**ID Format**: kebab-case slugs like `ai-intelligence-engine`

Epics group related roadmap items into strategic initiatives. Progress is computed from child items.

```typescript
interface Epic {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;      // 'planning' | 'active' | 'completed' | 'cancelled'
  priority: Priority;
  color: string;           // Hex color for UI ("#8b5cf6")
  milestone_id: string | null;

  // Computed from child items
  item_count: number;
  completed_count: number;
  progress_pct: number;    // 0-100

  tags: string[];
  created: string;
  updated: string;
  completed: string | null;
  ai_summary: string | null;
}
```

**Current State**: 8 epics (2 completed, 4 active, 2 planning).

---

## 4. Milestones

**File**: `data/roadmap/milestones.json`

Time-bound delivery targets that contain epics and roadmap items.

```typescript
interface Milestone {
  id: string;              // "v0-2-entity-model"
  title: string;
  description: string;
  version: string | null;  // Semver "0.2.0"
  status: MilestoneStatus; // 'planning' | 'active' | 'completed' | 'missed'
  target_date: string | null;
  completed_date: string | null;
  total_items: number;
  completed_items: number;
  progress_pct: number;
  blocking_issues: number;
  tags: string[];
  created: string;
  updated: string;
  ai_prediction: string | null;
}
```

---

## 5. Releases

**File**: `data/roadmap/releases.json`

Versioned bundles of shipped work with release notes.

```typescript
interface Release {
  id: string;              // "v0.2.0"
  version: string;         // Semver
  title: string;
  milestone_id: string | null;
  status: ReleaseStatus;   // 'draft' | 'published'
  release_notes: string;   // Markdown
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
```

---

## 6. Issues

**File**: `data/issues/items.json`
**ID Format**: `ISS-001`, `ISS-002`, ...

Bugs, problems, and technical debt with full investigation tracking.

```typescript
interface Issue {
  id: string;              // "ISS-035"
  title: string;
  status: IssueStatus;     // 'open' | 'in_progress' | 'resolved' | 'wont_fix'
  severity: IssueSeverity;  // 'critical' | 'high' | 'medium' | 'low'
  type: IssueType;         // 'bug' | 'security' | 'performance' | 'ux' | 'tech_debt'

  symptoms: string;        // What is happening
  root_cause: string | null; // Why it's happening
  resolution: string | null; // How it was fixed
  files: string[];         // Affected files

  roadmap_item: string | null;    // Related roadmap item
  epic_id: string | null;
  milestone_id: string | null;
  blocked_by_issue: string | null;

  assignee: string | null;
  tags: string[];
  discovered: string;
  discovered_by: string;   // "user", "session-8", "nightly-audit"
  resolved: string | null;
  notes: string | null;
}
```

**Current State**: 41 issues (36 resolved, 5 open).

---

## 7. Systems

**File**: `data/systems/systems.json`

Architecture components with AI-assessed health scores.

```typescript
interface System {
  id: string;              // "server", "web-ui"
  name: string;            // "Server (Hono API)"
  description: string;     // AI-generated description
  status: SystemStatus;    // 'healthy' | 'degraded' | 'critical'
  health_score: number;    // 0-100
  health_signals: HealthSignal[];
  last_assessed: string;
  owner: string | null;
  tech_stack: string[];    // ["Hono", "TypeScript", "Node.js"]
  modules: string[];
  dependencies: string[];  // Other system IDs
  dependents: string[];
  open_issues: number;
  recent_commits: number;
  test_coverage: number | null;
  tags: string[];
  created: string;
  updated: string;
}
```

---

## 8. Changelog

**File**: `data/changelog/entries.json`
**ID Format**: `CL-001`, `CL-002`, ...

Detailed record of completed work, linked to sessions, roadmap items, and issues.

```typescript
interface ChangelogEntry {
  id: string;              // "CL-083"
  date: string;
  session: number | null;  // Session number
  title: string;
  description: string;     // Detailed description
  type: ChangeType;        // 'feature' | 'enhancement' | 'fix' | 'refactor' | 'docs' | 'chore'
  scope: string;           // "ui", "server", "full-stack"
  roadmap_item: string | null;
  epic_id: string | null;
  issues_resolved: string[];
  release_id: string | null;
  files_changed: string[];
  commit_hashes: string[];
  breaking: boolean;
  tags: string[];
}
```

**Current State**: 83 changelog entries across 10 sessions.

---

## 9. Sessions

**File**: `data/session/log.json`

Development sessions with objectives, velocity metrics, and retrospectives.

```typescript
interface Session {
  id: number;
  date: string;
  developer: string;
  objective: string;
  appetite: string;        // Time budget ("2h", "4h")
  status: SessionStatus;   // 'active' | 'completed'
  started_at: string;
  ended_at: string | null;
  duration_hours: number;
  items_shipped: number;
  points: number;
  roadmap_items_completed: string[];
  issues_resolved: string[];
  ideas_captured: string[];
  changelog_ids: string[];
  retro: string | null;    // Session retrospective
  next_suggestion: string | null;
  ai_observation: string | null;
}
```

---

## 10-14. Supporting Entities

### Docs (`data/docs/registry.json` + `data/docs/*.md`)
Wiki pages with auto-generation support. Content stored as separate markdown files.

### Activity Feed (`data/activity/feed.json`)
Timeline of all events with actor attribution (User, DevTrack AI, External).

### Labels (`data/labels/labels.json`)
Color-coded tags for cross-entity categorization.

### Automations (`data/automations/automations.json`)
Trigger-based AI-driven tasks with conditions, actions, and AI prompts.

### Brain (`data/brain/`)
AI memory system: notes, preferences, context recovery, and user profiles.

---

## Data Storage Pattern

All entities follow the same JSON file pattern:

```typescript
// Read
const data = JSON.parse(fs.readFileSync('data/issues/items.json'));

// Write
fs.writeFileSync('data/issues/items.json', JSON.stringify(data, null, 2));
```

The `Store` class in `server/store.ts` provides typed access to all entities with automatic file I/O, write tracking (to prevent watcher feedback loops), and backward compatibility aliases.

---

## Related Documentation

- [System Overview](system-overview) — How all systems connect
- [API Reference](api-reference) — REST endpoints for all entities
- [System: Data Layer](system-data-layer) — Deep dive into persistence
