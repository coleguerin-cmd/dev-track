# API Reference

> DevTrack exposes a comprehensive REST API via Hono on port **24680**. All endpoints are prefixed with `/api/v1/`. The API supports JSON request/response bodies, SSE streaming for AI chat, and WebSocket for real-time updates.

---

## Table of Contents

1. [Overview](#overview)
2. [Roadmap Items](#roadmap-items)
3. [Epics](#epics)
4. [Milestones](#milestones)
5. [Releases](#releases)
6. [Issues](#issues)
7. [Ideas](#ideas)
8. [Systems](#systems)
9. [Changelog](#changelog)
10. [Sessions](#sessions)
11. [AI Chat & Configuration](#ai-chat--configuration)
12. [Automations & Audits](#automations--audits)
13. [Documentation](#documentation)
14. [Activity Feed](#activity-feed)
15. [Codebase](#codebase)
16. [Git](#git)
17. [Brain](#brain)
18. [Project Management](#project-management)
19. [WebSocket](#websocket)

---

## Overview

### Base URL

```
http://localhost:24680/api/v1
```

### Authentication

Currently no authentication is required (local-only tool). Future versions will add auth for multi-user and cloud deployment.

### Request Format

- All POST/PATCH/PUT requests accept JSON body
- Content-Type: `application/json`

### Response Format

**Success Response:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Error message describing what went wrong"
}
```

### Common Patterns

| Pattern | Description |
|---------|-------------|
| `GET /resource` | List all items, supports query params for filtering |
| `GET /resource/:id` | Get single item by ID |
| `POST /resource` | Create new item |
| `PATCH /resource/:id` | Partial update (deep-merged with existing) |
| `DELETE /resource/:id` | Delete item |
| `POST /resource/:id/action` | Perform action on item |

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (validation error) |
| `404` | Not found |
| `409` | Conflict (duplicate ID) |
| `500` | Server error |

---

## Roadmap Items

Roadmap items are the core work units — features, tasks, enhancements, and chores.

### List Roadmap Items

```http
GET /roadmap
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `horizon` | string | Filter by horizon: `now`, `next`, `later`, `shipped` |
| `status` | string | Filter by status: `pending`, `in_progress`, `completed`, `cancelled` |
| `epic_id` | string | Filter by parent epic |
| `milestone_id` | string | Filter by target milestone |
| `category` | string | Filter by category |
| `type` | string | Filter by type: `feature`, `enhancement`, `infrastructure`, `research`, `chore` |
| `assignee` | string | Filter by assignee |

**Response:**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "ai-chat-agent",
        "title": "AI chat agent with full tool access",
        "summary": "Implement a chat interface with access to all DevTrack tools",
        "type": "feature",
        "horizon": "shipped",
        "priority": "P1",
        "size": "L",
        "status": "completed",
        "category": "ai",
        "epic_id": "ai-intelligence-engine",
        "milestone_id": null,
        "depends_on": [],
        "blocked_by": [],
        "related_issues": [],
        "spawned_from": null,
        "assignee": null,
        "tags": ["ai", "chat"],
        "design_doc": null,
        "acceptance_criteria": ["Tool calls work", "Streaming works"],
        "created": "2026-02-01",
        "updated": "2026-02-08",
        "started": "2026-02-01",
        "completed": "2026-02-05",
        "ai_notes": "Shipped in session 5",
        "estimated_sessions": 3
      }
    ],
    "total": 46
  }
}
```

### Get Single Item

```http
GET /roadmap/:id
```

### Create Roadmap Item

```http
POST /roadmap
```

**Request Body:**
```json
{
  "id": "my-feature",
  "title": "My new feature",
  "summary": "Detailed description of what this feature does",
  "horizon": "next",
  "size": "M",
  "priority": "P1",
  "type": "feature",
  "category": "core",
  "epic_id": "my-epic",
  "milestone_id": "v0-3",
  "tags": ["important"],
  "acceptance_criteria": [
    "User can do X",
    "System handles Y"
  ]
}
```

**Required Fields:** `title`, `summary`, `horizon`, `size`

**Notes:**
- `id` auto-generated from title if not provided
- WIP limit enforced: max 3 items in "now" horizon by default
- Returns 400 if WIP limit exceeded

### Update Roadmap Item

```http
PATCH /roadmap/:id
```

Accepts any subset of RoadmapItem fields. Deep-merged with existing data.

**Example — Move to in_progress:**
```json
{
  "status": "in_progress"
}
```

**Example — Update multiple fields:**
```json
{
  "title": "Updated title",
  "priority": "P0",
  "tags": ["urgent", "blocking"]
}
```

### Delete Roadmap Item

```http
DELETE /roadmap/:id
```

### Move Item (Change Horizon)

```http
POST /roadmap/:id/move
```

```json
{
  "horizon": "now"
}
```

Returns 400 if moving to "now" would exceed WIP limit.

### Complete Item

```http
POST /roadmap/:id/complete
```

Sets status to `completed`, records completion date, moves to `shipped` horizon.

### Reopen Item

```http
POST /roadmap/:id/reopen
```

Sets status back to `pending`, clears completion date.

---

## Epics

Epics group related roadmap items into strategic initiatives.

### List Epics

```http
GET /epics
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `planning`, `active`, `completed`, `cancelled` |
| `milestone_id` | string | Filter by milestone |

**Response includes computed progress:**
```json
{
  "ok": true,
  "data": {
    "epics": [
      {
        "id": "ai-intelligence-engine",
        "title": "AI Intelligence Engine",
        "description": "Multi-provider AI with tool calling",
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
        "ai_summary": "Core AI functionality mostly complete"
      }
    ],
    "total": 8
  }
}
```

### Create Epic

```http
POST /epics
```

```json
{
  "id": "my-epic",
  "title": "My Epic",
  "description": "Strategic initiative to improve X",
  "priority": "P1",
  "color": "#8b5cf6",
  "status": "planning",
  "milestone_id": "v0-3"
}
```

### Update Epic

```http
PATCH /epics/:id
```

### Delete Epic

```http
DELETE /epics/:id
```

**Note:** Does NOT delete child roadmap items — they become ungrouped (epic_id set to null).

---

## Milestones

Time-bound delivery targets containing epics and roadmap items.

### List Milestones

```http
GET /milestones
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `planning`, `active`, `completed`, `missed` |

### Create Milestone

```http
POST /milestones
```

```json
{
  "id": "v0-3-alpha",
  "title": "v0.3 Alpha Release",
  "description": "First public alpha with core features",
  "version": "0.3.0",
  "target_date": "2026-03-01",
  "status": "planning"
}
```

### Update / Delete

```http
PATCH /milestones/:id
DELETE /milestones/:id
```

---

## Releases

Versioned bundles of shipped work with release notes.

### List Releases

```http
GET /releases
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `draft`, `published` |

### Create Release

```http
POST /releases
```

```json
{
  "id": "v0.2.0",
  "version": "0.2.0",
  "title": "Entity Model v2",
  "milestone_id": "v0-2-entity-model",
  "release_notes": "## What's New\n\n- 14 entity types\n- Horizon-based planning",
  "roadmap_items_shipped": ["entity-model-v2", "horizon-planning"],
  "issues_resolved": ["ISS-001", "ISS-002"]
}
```

### Update Release

```http
PATCH /releases/:id
```

### Publish Release

```http
POST /releases/:id/publish
```

Marks as `published` with current date.

---

## Issues

Bugs, problems, and technical debt with full investigation tracking.

### List Issues

```http
GET /issues
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `open`, `in_progress`, `resolved`, `wont_fix` |
| `severity` | string | Filter: `critical`, `high`, `medium`, `low` |

### Create Issue

```http
POST /issues
```

```json
{
  "title": "Login page crashes on mobile",
  "severity": "high",
  "type": "bug",
  "symptoms": "TypeError when tapping submit button on iOS Safari",
  "root_cause": "Touch event handler not bound correctly",
  "files": ["ui/src/views/Login.tsx"],
  "roadmap_item": "fix-mobile-login",
  "tags": ["mobile", "urgent"]
}
```

**Auto-generated:** ID in format `ISS-XXX`

### Update Issue

```http
PATCH /issues/:id
```

### Resolve Issue

```http
POST /issues/:id/resolve
```

```json
{
  "resolution": "Fixed touch event binding with useCallback hook"
}
```

Sets status to `resolved`, records resolution date.

---

## Ideas

Captured concepts with pros, cons, and open questions.

### List Ideas

```http
GET /ideas
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `captured`, `exploring`, `validated`, `promoted`, `dismissed`, `parked` |
| `category` | string | Filter: `feature`, `architecture`, `ux`, `business`, `integration`, `core`, `security` |

### Create Idea

```http
POST /ideas
```

```json
{
  "title": "Voice input for chat",
  "description": "Integrate speech-to-text for faster chat input",
  "category": "feature",
  "priority": "medium",
  "pros": [
    "Faster for brain dumps",
    "Hands-free operation"
  ],
  "cons": [
    "Transcription quality varies",
    "Privacy concerns"
  ],
  "open_questions": [
    "Which provider? Deepgram vs Whisper?",
    "How to handle background noise?"
  ]
}
```

**Auto-generated:** ID in format `IDEA-XXX`

### Update Idea

```http
PATCH /ideas/:id
```

**Example — Promote to roadmap:**
```json
{
  "status": "promoted",
  "promoted_to": "voice-input-feature"
}
```

---

## Systems

Architecture components with AI-assessed health scores.

### List Systems

```http
GET /systems
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `healthy`, `degraded`, `critical`, `unknown`, `planned` |

### Create System

```http
POST /systems
```

```json
{
  "id": "payment-service",
  "name": "Payment Service",
  "description": "Handles all payment processing",
  "status": "healthy",
  "health_score": 85,
  "tech_stack": ["Node.js", "Stripe", "PostgreSQL"],
  "dependencies": ["database", "auth-service"],
  "owner": "payments-team"
}
```

### Update System

```http
PATCH /systems/:id
```

---

## Changelog

Detailed record of completed work.

### List Changelog

```http
GET /changelog
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max entries (default 20) |

### Add Entry

```http
POST /changelog
```

```json
{
  "title": "Fixed login crash on mobile",
  "description": "Resolved touch event binding issue causing TypeError on iOS Safari. Used useCallback to ensure stable handler reference.",
  "type": "fix",
  "scope": "ui",
  "files_changed": ["ui/src/views/Login.tsx", "ui/src/hooks/useAuth.ts"],
  "roadmap_item": "fix-mobile-login",
  "issues_resolved": ["ISS-035"]
}
```

**Auto-generated:** ID in format `CL-XXX`, date, session number

---

## Sessions

Development sessions with objectives, velocity, and retrospectives.

### Get Session Info

```http
GET /session
```

Returns current session (if active) and recent history.

### Start Session

```http
POST /session/start
```

```json
{
  "objective": "Fix mobile login issues and add error handling",
  "appetite": "2h"
}
```

### End Session

```http
POST /session/end
```

```json
{
  "items_shipped": 3,
  "retro": "Fixed 3 mobile bugs, discovered 1 new performance issue",
  "next_suggestion": "Address the performance issue before release",
  "ai_observation": "Developer showed strong debugging skills"
}
```

---

## AI Chat & Configuration

### Send Message (SSE Stream)

```http
POST /ai/chat
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "message": "What are the open issues?",
  "conversationId": "conv-123"
}
```

**SSE Events:**

```
event: text_delta
data: {"content": "Here are the "}

event: tool_call_start
data: {"tool_call": {"id": "tc_1", "function": {"name": "list_issues", "arguments": "{}"}}}

event: tool_call_result
data: {"tool_call_id": "tc_1", "result": "{\"issues\": [...]}"}

event: message_complete
data: {"content": "full response text", "tool_calls": [...]}

event: done
data: {"model": "claude-sonnet-4-5-20250929", "provider": "anthropic", "usage": {"input_tokens": 1500, "output_tokens": 500}}

event: error
data: {"error": "Rate limit exceeded"}
```

### Get AI Config

```http
GET /ai/config
```

### Update AI Config

```http
PUT /ai/config
```

Deep-merged with existing config.

### List Available Models

```http
GET /ai/models
```

Returns all discovered models across providers with tier classification.

### List Conversations

```http
GET /ai/conversations
```

### Get Conversation

```http
GET /ai/conversations/:id
```

---

## Automations & Audits

### List Automations

```http
GET /automations
```

### Update Automation

```http
PATCH /automations/:id
```

### Fire Automation (Manual Run)

```http
POST /automations/:id/fire
```

```json
{
  "force": true
}
```

The `force` flag bypasses cooldown for manual execution.

### List Audit Runs

```http
GET /audits
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `running`, `completed`, `failed`, `cancelled` |
| `trigger_type` | string | Filter: `scheduled`, `event`, `manual`, `requested` |
| `automation_id` | string | Filter by automation |
| `since` | string | ISO date, only runs after this date |
| `limit` | number | Max results (default 50) |

### Get Audit Run Detail

```http
GET /audits/:id
```

Returns full audit run with:
- Thinking chain
- Tool calls made
- Changes made
- Suggestions generated
- Errors encountered
- Cost breakdown

### Get Audit Stats

```http
GET /audits/stats
```

Aggregate statistics: runs today/week, costs, changes breakdown.

---

## Documentation

### List Docs

```http
GET /docs
```

Returns registry with metadata for all docs.

### Get Doc Content

```http
GET /docs/:id
```

Returns full markdown content.

### Create Doc

```http
POST /docs
```

```json
{
  "id": "my-guide",
  "title": "My Guide",
  "type": "wiki",
  "content": "# My Guide\n\nContent here...",
  "systems": ["server"],
  "tags": ["guide"]
}
```

### Update Doc

```http
PATCH /docs/:id
```

**Important:** The `content` field must be the complete markdown text.

### Delete Doc

```http
DELETE /docs/:id
```

### Generate Docs (AI)

```http
POST /docs/generate
```

```json
{
  "mode": "initialize"
}
```

| Mode | Description |
|------|-------------|
| `initialize` | Full scan, generate all docs from scratch |
| `update` | Incremental update of changed docs only |

### Get Design Docs

```http
GET /docs/designs
GET /docs/designs/:filename
```

---

## Activity Feed

### List Activity

```http
GET /activity
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by event type |
| `entity_type` | string | Filter by entity type |
| `entity_id` | string | Filter by specific entity |
| `since` | string | ISO date, only events after |
| `limit` | number | Max results (default 20, max 100) |

**Event Types:**
- `item_created`, `item_completed`, `item_moved`
- `issue_opened`, `issue_resolved`
- `session_started`, `session_ended`
- `release_published`
- `system_health_changed`
- `idea_captured`, `idea_promoted`
- `doc_updated`
- `milestone_reached`, `epic_completed`
- `changelog_entry`

---

## Codebase

### Get Scan Stats

```http
GET /codebase/stats
```

### Get Modules

```http
GET /codebase/modules
```

### Get Files

```http
GET /codebase/files
```

### Trigger Scan

```http
POST /codebase/scan
```

```json
{
  "src_dir": "server"
}
```

Optional `src_dir` to scan specific subdirectory.

### Search Codebase

```http
GET /codebase/search?q=query
```

Searches across files, functions, routes, and pages.

### Get File Details

```http
GET /codebase/files/:path
```

Returns file metadata: exports, imports, dependencies.

### Read File Content

```http
GET /codebase/read?path=server/index.ts&max_lines=200
```

### List Directory

```http
GET /codebase/dir?path=server/routes
```

---

## Git

### Get Status

```http
GET /git/status
```

Returns modified files, staged changes, current branch.

### Get Diff

```http
GET /git/diff
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `file` | string | Specific file to diff |
| `staged` | boolean | Show staged changes |

### Get Log

```http
GET /git/log
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `count` | number | Number of commits (default 20) |
| `since` | string | Only commits after this date |
| `path` | string | Only commits affecting this path |
| `format` | string | `oneline` or `detailed` |

### Get Branches

```http
GET /git/branches
```

---

## Brain

AI memory system: notes, preferences, context recovery.

### Get Brain Notes

```http
GET /brain/notes
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter: `observation`, `suggestion`, `warning`, `decision`, `preference`, `reminder` |

### Add Brain Note

```http
POST /brain/notes
```

```json
{
  "type": "observation",
  "content": "Developer prefers detailed explanations",
  "priority": "medium",
  "related_items": ["ISS-035"]
}
```

### Get Preferences

```http
GET /brain/preferences
```

### Update Preferences

```http
PATCH /brain/preferences
```

Merged with existing preferences.

### Get Context Recovery

```http
GET /brain/context-recovery
```

### Write Context Recovery

```http
POST /brain/context-recovery
```

```json
{
  "briefing": "Session 10 focused on docs system...",
  "hot_context": ["Working on epic-hierarchy-ui", "ISS-034 is critical"],
  "warnings": ["Helicone integration failing"],
  "suggestions": ["Test chat agent in browser"]
}
```

### Get User Profile

```http
GET /brain/profile
```

### Update User Profile

```http
PATCH /brain/profile
```

---

## Project Management

### Get Project Config

```http
GET /config
```

### Update Config

```http
PUT /config
```

### Get Project Info

```http
GET /project
```

### List All Projects

```http
GET /projects
```

### Switch Project

```http
POST /projects/switch
```

```json
{
  "projectId": "my-other-project"
}
```

Hot-swaps data directory without server restart.

### Initialize Project (AI)

```http
POST /init
```

Triggers AI-powered project analysis and data population.

### Health Check

```http
GET /api/health
```

Returns server uptime, port, project name, data directory.

### Quick Status

```http
GET /quick-status
```

Returns one-line status summary.

---

## WebSocket

Connect to `ws://localhost:24680/ws` for real-time events.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:24680/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data);
};
```

### Event Format

```json
{
  "type": "file_changed",
  "file": "data/issues/items.json",
  "timestamp": "2026-02-08T14:30:00.000Z"
}
```

### Event Types

| Type | Description |
|------|-------------|
| `file_changed` | Data file was modified |
| `roadmap_updated` | Roadmap item changed |
| `issue_updated` | Issue changed |
| `session_started` | New session started |
| `session_ended` | Session completed |
| `scan_complete` | Codebase scan finished |
| `automation_complete` | Automation run finished |
| `docs_generated` | Doc generation finished |
| `activity_event` | New activity feed event |

---

## Related Documentation

- [System Overview](system-overview) — Architecture context
- [Data Model Reference](data-model-reference) — Entity type definitions
- [System: Server](system-server) — Server implementation details
- [Getting Started](getting-started) — Installation and setup
