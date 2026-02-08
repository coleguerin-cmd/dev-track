# Data Model & Entity Reference

> DevTrack's entity model v2 defines **14 entity types** in `shared/types.ts` (~778 lines). All types are shared between the server, UI, and CLI to ensure type safety across the entire stack.

---

## Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Core Enums](#core-enums)
4. [Ideas](#1-ideas)
5. [Roadmap Items](#2-roadmap-items)
6. [Epics](#3-epics)
7. [Milestones](#4-milestones)
8. [Releases](#5-releases)
9. [Issues](#6-issues)
10. [Systems](#7-systems)
11. [Changelog](#8-changelog)
12. [Sessions](#9-sessions)
13. [Docs](#10-docs)
14. [Activity Feed](#11-activity-feed)
15. [Labels](#12-labels)
16. [Automations](#13-automations)
17. [Brain](#14-brain)
18. [Data Storage](#data-storage)

---

## Overview

DevTrack uses a **JSON file-based** data model where each entity type is stored in its own file within the `data/` directory. This approach provides:

- **Simplicity**: No database setup or migrations
- **Git-committability**: Project state can be version-controlled
- **AI readability**: JSON is easily parsed by AI models
- **Portability**: Copy the `data/` folder to move a project

### Entity Summary

| # | Entity | File | ID Format | Count |
|---|--------|------|-----------|-------|
| 1 | Ideas | `ideas/items.json` | `IDEA-001` | 68 |
| 2 | Roadmap Items | `roadmap/items.json` | kebab-case | 46 |
| 3 | Epics | `roadmap/epics.json` | kebab-case | 8 |
| 4 | Milestones | `roadmap/milestones.json` | kebab-case | 1 |
| 5 | Releases | `releases/releases.json` | `v0.2.0` | 0 |
| 6 | Issues | `issues/items.json` | `ISS-001` | 41 |
| 7 | Systems | `systems/systems.json` | kebab-case | 11 |
| 8 | Changelog | `changelog/entries.json` | `CL-001` | 86 |
| 9 | Sessions | `session/log.json` | numeric | 10 |
| 10 | Docs | `docs/registry.json` | kebab-case | 14 |
| 11 | Activity | `activity/feed.json` | `ACT-001` | 200+ |
| 12 | Labels | `labels/labels.json` | kebab-case | 0 |
| 13 | Automations | `automations/automations.json` | kebab-case | 5 |
| 14 | Brain | `brain/notes.json` | `BN-001` | 18 |

---

## Entity Relationship Diagram

```
                         ┌────────────┐
                         │  Milestone │
                         │  (target)  │
                         └─────┬──────┘
                               │ contains
                         ┌─────▼──────┐         ┌──────────┐
                         │    Epic    │◄────────│  Release │
                         │  (group)   │         │ (bundle) │
                         └─────┬──────┘         └────┬─────┘
                               │ contains            │ ships
                         ┌─────▼──────────┐         │
                         │  Roadmap Item  │─────────┘
                         │   (feature)    │
                         └──┬──────────┬──┘
            spawned_from    │          │ related_issues
                      ┌─────▼───┐  ┌───▼─────┐
                      │  Idea   │  │  Issue  │
                      │(concept)│  │  (bug)  │
                      └─────────┘  └─────────┘

  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐
  │  System  │  │ Changelog │  │ Session  │  │  Brain  │
  │  (arch)  │  │ (history) │  │  (work)  │  │  (AI)   │
  └──────────┘  └───────────┘  └──────────┘  └─────────┘

  ┌──────────┐  ┌─────────┐  ┌────────────┐  ┌─────────┐
  │ Activity │  │  Label  │  │ Automation │  │   Doc   │
  │  (feed)  │  │  (tag)  │  │ (AI task)  │  │ (wiki)  │
  └──────────┘  └─────────┘  └────────────┘  └─────────┘
```

### Key Relationships

| From | To | Relationship |
|------|-----|--------------|
| Roadmap Item | Epic | `epic_id` — belongs to |
| Roadmap Item | Milestone | `milestone_id` — targets |
| Roadmap Item | Idea | `spawned_from` — promoted from |
| Roadmap Item | Issue | `related_issues` — addresses |
| Roadmap Item | Roadmap Item | `depends_on`, `blocked_by` |
| Epic | Milestone | `milestone_id` — targets |
| Release | Milestone | `milestone_id` — delivers |
| Release | Roadmap Item | `roadmap_items_shipped` — bundles |
| Release | Issue | `issues_resolved` — fixes |
| Changelog | Roadmap Item | `roadmap_item` — documents |
| Changelog | Session | `session` — recorded during |
| Issue | Roadmap Item | `roadmap_item` — related to |
| Doc | System | `systems` — documents |

---

## Core Enums

These enums are used across multiple entity types. All are defined in `shared/types.ts`.

### Priority

```typescript
type Priority = 'P0' | 'P1' | 'P2' | 'P3';
```

| Value | Meaning | Description |
|-------|---------|-------------|
| `P0` | Critical | Drop everything, fix now |
| `P1` | High | Must do this week |
| `P2` | Medium | Should do soon (default) |
| `P3` | Low | Nice to have |

### Size

```typescript
type Size = 'S' | 'M' | 'L' | 'XL';
```

| Value | Points | Typical Effort |
|-------|--------|----------------|
| `S` | 1 | < 1 hour |
| `M` | 2 | 1-4 hours |
| `L` | 5 | 1-2 days |
| `XL` | 8 | 3+ days |

### Horizon

```typescript
type Horizon = 'now' | 'next' | 'later' | 'shipped';
```

| Value | Description |
|-------|-------------|
| `now` | Currently working on (WIP limited) |
| `next` | Up next, ready to start |
| `later` | Backlog, not prioritized |
| `shipped` | Completed or cancelled |

### ItemType

```typescript
type ItemType = 'feature' | 'enhancement' | 'infrastructure' | 'research' | 'chore';
```

### ItemStatus

```typescript
type ItemStatus = 'pending' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';
```

### IssueSeverity

```typescript
type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
```

### SystemStatus

```typescript
type SystemStatus = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'planned';
```

---

## 1. Ideas

**File**: `data/ideas/items.json`  
**ID Format**: `IDEA-001`, `IDEA-002`, ...  
**Auto-increment**: Yes (`next_id` field)

Ideas are captured concepts that haven't been committed to the roadmap. They flow through a lifecycle from capture to either promotion (becomes a roadmap item) or dismissal.

### Schema

```typescript
interface Idea {
  id: string;              // "IDEA-001"
  title: string;           // "AI-powered chaos testing"
  description: string;     // Full description with markdown
  category: IdeaCategory;  // 'feature' | 'architecture' | 'ux' | ...
  status: IdeaStatus;      // 'captured' | 'exploring' | 'validated' | ...
  priority: Priority;      // P0-P3
  source: string;          // Origin: "conversation session-8"
  related_ideas: string[]; // ["IDEA-002"] — for clustering
  promoted_to: string | null; // Roadmap item ID if promoted
  pros: string[];          // Arguments for
  cons: string[];          // Arguments against
  open_questions: string[];// Unresolved questions
  notes: string | null;    // Additional context
  tags: string[];
  created: string;         // ISO date "2026-02-01"
  updated: string;         // ISO date
}

type IdeaCategory = 'feature' | 'architecture' | 'integration' | 'ux' | 
                    'performance' | 'business' | 'process' | 'security' | 
                    'core' | 'other';

type IdeaStatus = 'captured' | 'exploring' | 'validated' | 'promoted' | 
                  'parked' | 'rejected';
```

### Example

```json
{
  "id": "IDEA-052",
  "title": "Voice input for chat",
  "description": "Integrate speech-to-text for faster chat input using Deepgram or Whisper",
  "category": "feature",
  "status": "exploring",
  "priority": "P2",
  "source": "session-8 brainstorm",
  "related_ideas": ["IDEA-048", "IDEA-055"],
  "promoted_to": null,
  "pros": [
    "Faster for brain dumps",
    "Hands-free operation",
    "Better for mobile"
  ],
  "cons": [
    "Transcription quality varies",
    "Privacy concerns",
    "Adds dependency"
  ],
  "open_questions": [
    "Which provider? Deepgram vs Whisper?",
    "How to handle background noise?",
    "Local vs cloud processing?"
  ],
  "notes": "Could be killer feature for mobile use case",
  "tags": ["voice", "ux", "mobile"],
  "created": "2026-02-05",
  "updated": "2026-02-08"
}
```

### Status Lifecycle

```
captured → exploring → validated → promoted
                    ↘ parked
                    ↘ rejected
```

---

## 2. Roadmap Items

**File**: `data/roadmap/items.json`  
**Alias**: `data/backlog/items.json` (backward compat)  
**ID Format**: kebab-case slugs like `ai-chat-agent`

Roadmap items are the core work units. They use a **horizon-based** planning model instead of traditional sprints.

### Schema

```typescript
interface RoadmapItem {
  id: string;              // "ai-chat-agent"
  title: string;
  summary: string;         // Detailed description
  type: ItemType;          // 'feature' | 'enhancement' | ...
  horizon: Horizon;        // 'now' | 'next' | 'later' | 'shipped'
  priority: Priority;      // P0-P3
  size: Size;              // S | M | L | XL
  status: ItemStatus;      // 'pending' | 'in_progress' | ...
  category: string;        // "core", "ui", "architecture"

  // Relationships
  epic_id: string | null;        // Parent epic
  milestone_id: string | null;   // Target milestone
  depends_on: string[];          // Other item IDs
  blocked_by: string[];          // Blocking items
  related_issues: string[];      // Related issue IDs
  spawned_from: string | null;   // "IDEA-052" if promoted

  // Metadata
  assignee: string | null;
  tags: string[];
  design_doc: string | null;     // Path to design doc
  acceptance_criteria: string[]; // Definition of done

  // Tracking
  created: string;
  updated: string;
  started: string | null;        // When moved to in_progress
  completed: string | null;      // When completed

  // AI
  ai_notes: string | null;        // AI observations
  estimated_sessions: number | null; // AI effort estimate
}
```

### Example

```json
{
  "id": "ai-chat-agent",
  "title": "AI chat agent with full tool access",
  "summary": "Implement a chat interface that gives the AI access to all DevTrack tools for natural language project management",
  "type": "feature",
  "horizon": "shipped",
  "priority": "P1",
  "size": "L",
  "status": "completed",
  "category": "ai",
  "epic_id": "ai-intelligence-engine",
  "milestone_id": null,
  "depends_on": ["ai-service-multi-provider"],
  "blocked_by": [],
  "related_issues": ["ISS-012"],
  "spawned_from": null,
  "assignee": null,
  "tags": ["ai", "chat", "core"],
  "design_doc": null,
  "acceptance_criteria": [
    "Tool calls execute correctly",
    "Streaming works smoothly",
    "Conversation history persists"
  ],
  "created": "2026-02-01",
  "updated": "2026-02-08",
  "started": "2026-02-01",
  "completed": "2026-02-05",
  "ai_notes": "Shipped in session 5. Core feature complete.",
  "estimated_sessions": 3
}
```

### Horizon Rules

- **now**: Limited to `max_now_items` (default 3) to enforce WIP limits
- **shipped**: Items automatically move here when status is `completed` or `cancelled`

---

## 3. Epics

**File**: `data/roadmap/epics.json`  
**ID Format**: kebab-case slugs

Epics group related roadmap items into strategic initiatives. Progress is computed from child items.

### Schema

```typescript
interface Epic {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;      // 'planning' | 'active' | 'completed' | 'cancelled'
  priority: Priority;
  color: string;           // Hex color "#8b5cf6"
  milestone_id: string | null;

  // Computed (updated when child items change)
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

### Example

```json
{
  "id": "ai-intelligence-engine",
  "title": "AI Intelligence Engine",
  "description": "Multi-provider AI with tool calling, model routing, and agent capabilities",
  "status": "active",
  "priority": "P0",
  "color": "#8b5cf6",
  "milestone_id": null,
  "item_count": 8,
  "completed_count": 6,
  "progress_pct": 75,
  "tags": ["ai", "core"],
  "created": "2026-02-01",
  "updated": "2026-02-08",
  "completed": null,
  "ai_summary": "Core AI functionality mostly complete. Chat agent shipped. Automation engine operational."
}
```

---

## 4. Milestones

**File**: `data/roadmap/milestones.json`

Time-bound delivery targets that contain epics and roadmap items.

### Schema

```typescript
interface Milestone {
  id: string;
  title: string;
  description: string;
  version: string | null;  // Semver "0.3.0"
  status: MilestoneStatus; // 'planning' | 'active' | 'completed' | 'missed'
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
  ai_prediction: string | null; // AI timeline prediction
}
```

---

## 5. Releases

**File**: `data/releases/releases.json`

Versioned bundles of shipped work with release notes.

### Schema

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
**Auto-increment**: Yes

Bugs, problems, and technical debt with full investigation tracking.

### Schema

```typescript
interface Issue {
  id: string;              // "ISS-035"
  title: string;
  status: IssueStatus;     // 'open' | 'in_progress' | 'resolved' | 'wont_fix'
  severity: IssueSeverity; // 'critical' | 'high' | 'medium' | 'low'
  type: IssueType;         // 'bug' | 'security' | 'performance' | 'ux' | 'tech_debt'

  symptoms: string;        // What is happening
  root_cause: string | null; // Why it's happening
  resolution: string | null; // How it was fixed
  files: string[];         // Affected files

  roadmap_item: string | null;
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

### Example

```json
{
  "id": "ISS-034",
  "title": "File watcher only fires generic file_changed",
  "status": "open",
  "severity": "critical",
  "type": "bug",
  "symptoms": "File watcher detects changes but doesn't provide semantic information about what entity changed",
  "root_cause": "Watcher implementation only tracks file paths, not content",
  "resolution": null,
  "files": ["server/watcher.ts"],
  "roadmap_item": null,
  "epic_id": null,
  "milestone_id": null,
  "blocked_by_issue": null,
  "assignee": null,
  "tags": ["watcher", "data-layer"],
  "discovered": "2026-02-08",
  "discovered_by": "nightly-audit",
  "resolved": null,
  "notes": "This blocks proper automation triggering"
}
```

---

## 7. Systems

**File**: `data/systems/systems.json`

Architecture components with AI-assessed health scores.

### Schema

```typescript
interface System {
  id: string;
  name: string;
  description: string;     // AI-generated description
  status: SystemStatus;    // 'healthy' | 'degraded' | 'critical' | ...
  health_score: number;    // 0-100
  health_signals: HealthSignal[];
  last_assessed: string;

  owner: string | null;
  tech_stack: string[];
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

interface HealthSignal {
  type: string;  // 'issue_count' | 'test_coverage' | 'activity' | ...
  score: number; // 0-100
  detail: string;
}
```

---

## 8. Changelog

**File**: `data/changelog/entries.json`  
**ID Format**: `CL-001`, `CL-002`, ...

Detailed record of completed work.

### Schema

```typescript
interface ChangelogEntry {
  id: string;
  date: string;
  session: number | null;
  title: string;
  description: string;
  type: ChangeType;        // 'feature' | 'enhancement' | 'fix' | 'refactor' | 'docs' | 'chore'
  scope: string;

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

---

## 9. Sessions

**File**: `data/session/log.json`  
**Current Session**: `data/session/current.json`

Development sessions with objectives, velocity, and retrospectives.

### Schema

```typescript
interface Session {
  id: number;
  date: string;
  developer: string;
  objective: string;
  appetite: string;        // "2h", "4h"
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

  retro: string | null;
  next_suggestion: string | null;
  ai_observation: string | null;
}
```

---

## 10. Docs

**File**: `data/docs/registry.json` (metadata)  
**Content**: `data/docs/*.md` (markdown files)

Wiki pages with auto-generation support.

### Schema

```typescript
interface Doc {
  id: string;
  title: string;
  type: DocType;           // 'design' | 'decision' | 'adr' | 'rfc' | 'wiki' | 'auto-generated'
  content: string;         // Stored separately in .md file

  systems: string[];
  roadmap_items: string[];
  epics: string[];

  auto_generated: boolean;
  last_generated: string | null;
  generation_sources: string[];

  author: string;
  status: DocStatus;       // 'draft' | 'published' | 'archived'
  tags: string[];
  created: string;
  updated: string;
}
```

---

## 11. Activity Feed

**File**: `data/activity/feed.json`  
**ID Format**: `ACT-001`

Timeline of all events with actor attribution.

### Schema

```typescript
interface ActivityEvent {
  id: string;
  timestamp: string;
  type: ActivityType;
  entity_type: string;
  entity_id: string;
  title: string;
  actor: string;           // 'user' | 'ai' | 'system' | 'automation'
  metadata: Record<string, any>;
}

type ActivityType =
  | 'item_created' | 'item_completed' | 'item_moved'
  | 'issue_opened' | 'issue_resolved'
  | 'session_started' | 'session_ended'
  | 'release_published'
  | 'system_health_changed'
  | 'idea_captured' | 'idea_promoted'
  | 'doc_updated'
  | 'milestone_reached' | 'epic_completed'
  | 'changelog_entry';
```

---

## 12. Labels

**File**: `data/labels/labels.json`

Color-coded tags for cross-entity categorization.

### Schema

```typescript
interface Label {
  id: string;
  name: string;
  color: string;           // Hex color
  description: string;
  entity_count: number;    // Computed
}
```

---

## 13. Automations

**File**: `data/automations/automations.json`

Trigger-based AI-driven tasks.

### Schema

```typescript
interface Automation {
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

type AutomationTrigger = 'issue_created' | 'item_completed' | 'session_ended' | 
                         'health_changed' | 'scheduled' | 'file_changed' | 'manual';
```

---

## 14. Brain

**Files**:
- `data/brain/notes.json` — AI observations
- `data/brain/preferences.json` — User preferences
- `data/brain/context-recovery.json` — Session handoff

### Brain Note Schema

```typescript
interface BrainNote {
  id: string;              // "BN-001"
  type: BrainNoteType;     // 'observation' | 'suggestion' | 'warning' | 'decision' | 'preference' | 'reminder'
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
```

### Context Recovery Schema

```typescript
interface ContextRecovery {
  briefing: string;        // Session summary paragraph
  hot_context: string[];   // Key context items
  warnings: string[];      // Active warnings
  suggestions: string[];   // Suggestions for next session
  last_updated: string;
}
```

---

## Data Storage

### File Structure

```
data/
├── config.json              # DevTrackConfig
├── state.json               # ProjectState
├── integrations.json        # Plugin credentials
├── roadmap/
│   ├── items.json           # RoadmapData
│   ├── epics.json           # EpicsData
│   ├── milestones.json      # MilestonesData
│   └── releases.json        # ReleasesData
├── systems/
│   └── systems.json         # SystemsData
├── issues/
│   └── items.json           # IssuesData
├── ideas/
│   └── items.json           # IdeasData
├── changelog/
│   └── entries.json         # ChangelogData
├── session/
│   ├── log.json             # SessionsData
│   └── current.json         # Session | null
├── activity/
│   └── feed.json            # ActivityFeedData
├── brain/
│   ├── notes.json           # BrainNotesData
│   ├── preferences.json     # BrainPreferences
│   └── context-recovery.json# ContextRecovery
├── ai/
│   ├── config.json          # AI configuration
│   ├── profiles.json        # User profiles
│   └── conversations/       # Chat transcripts
├── automations/
│   ├── automations.json     # AutomationsData
│   └── audits/              # Audit runs
├── docs/
│   ├── registry.json        # DocsRegistryData
│   └── *.md                 # Doc content
├── metrics/
│   └── velocity.json        # VelocityData
└── labels/
    └── labels.json          # LabelsData
```

### Store Class

The `Store` class in `server/store.ts` provides typed access to all entities:

```typescript
class Store {
  config: DevTrackConfig;
  state: ProjectState;
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

  // Save methods
  saveRoadmap(): void;
  saveEpics(): void;
  saveIssues(): void;
  // ... etc
}
```

### Write Tracking

The Store tracks write timestamps to prevent file watcher feedback loops:

```typescript
markWrite(filePath: string): void;
isRecentWrite(filePath: string, withinMs = 1000): boolean;
```

---

## Related Documentation

- [System Overview](system-overview) — How all systems connect
- [API Reference](api-reference) — REST endpoints for all entities
- [System: Data Layer](system-data-layer) — Deep dive into persistence
- [Getting Started](getting-started) — Installation and setup
