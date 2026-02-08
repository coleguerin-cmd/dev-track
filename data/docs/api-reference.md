# API Reference

> DevTrack exposes a REST API via Hono on port **24680**. All endpoints are prefixed with `/api/v1/`. The API supports JSON request/response bodies, SSE streaming for AI chat, and WebSocket for real-time updates.

---

## Base URL

```
http://localhost:24680/api/v1
```

## Authentication

Currently no authentication is required (local-only tool). Future versions will add auth for multi-user and cloud deployment.

## Common Patterns

- **List endpoints** return `{ items: [...], total: number }` or `{ entity_name: [...], total: number }`
- **Create endpoints** accept JSON body, return the created entity
- **Update endpoints** use `PATCH` with partial JSON body (deep-merged)
- **Delete endpoints** return `{ deleted: true }`
- **Errors** return `{ error: "message" }` with appropriate HTTP status

---

## Roadmap Items

### List Roadmap Items
```
GET /roadmap
```
Query params: `horizon`, `status`, `epic_id`, `category`

**Response:**
```json
{
  "items": [
    {
      "id": "ai-chat-agent",
      "title": "AI chat agent with full tool access",
      "horizon": "shipped",
      "priority": "P1",
      "status": "completed",
      "epic_id": "ai-intelligence-engine",
      ...
    }
  ],
  "total": 46
}
```

### Create Roadmap Item
```
POST /roadmap
```
```json
{
  "id": "my-feature",
  "title": "My new feature",
  "summary": "Description of the feature",
  "horizon": "next",
  "size": "M",
  "priority": "P1",
  "type": "feature",
  "epic_id": "my-epic"
}
```

### Update Roadmap Item
```
PATCH /roadmap/:id
```
Accepts any subset of RoadmapItem fields. Deep-merged with existing data.

### Delete Roadmap Item
```
DELETE /roadmap/:id
```

### Move Item (Change Horizon)
```
POST /roadmap/:id/move
```
```json
{ "horizon": "now" }
```

### Complete Item
```
POST /roadmap/:id/complete
```

### Reopen Item
```
POST /roadmap/:id/reopen
```

---

## Epics

### List Epics
```
GET /epics
```
Query params: `status`, `milestone_id`

Returns epics with computed progress (item_count, completed_count, progress_pct) and child items.

### Create Epic
```
POST /epics
```
```json
{
  "id": "my-epic",
  "title": "My Epic",
  "description": "Strategic initiative",
  "priority": "P1",
  "color": "#8b5cf6"
}
```

### Update Epic
```
PATCH /epics/:id
```

### Delete Epic
```
DELETE /epics/:id
```
Does NOT delete child roadmap items — they become ungrouped.

---

## Milestones

### List Milestones
```
GET /milestones
```
Query params: `status`

### Create / Update / Delete
```
POST /milestones
PATCH /milestones/:id
DELETE /milestones/:id
```

---

## Releases

### List Releases
```
GET /releases
```
Query params: `status` (`draft` | `published`)

### Create Release
```
POST /releases
```

### Update Release
```
PATCH /releases/:id
```

### Publish Release
```
POST /releases/:id/publish
```
Marks as published with current date.

---

## Issues

### List Issues
```
GET /issues
```
Query params: `status`, `severity`

### Create Issue
```
POST /issues
```
```json
{
  "title": "Login page crashes on mobile",
  "severity": "high",
  "symptoms": "TypeError when tapping submit button on iOS Safari",
  "root_cause": "Touch event handler not bound correctly",
  "files": ["ui/src/views/Login.tsx"]
}
```

### Update Issue
```
PATCH /issues/:id
```

### Resolve Issue
```
POST /issues/:id/resolve
```
```json
{
  "resolution": "Fixed touch event binding with useCallback"
}
```

---

## Ideas

### List Ideas
```
GET /ideas
```
Query params: `status`, `category`

### Create Idea
```
POST /ideas
```
```json
{
  "title": "Voice input for chat",
  "description": "Integrate Deepgram for voice-to-text in the chat sidebar",
  "category": "feature",
  "priority": "medium",
  "pros": ["Faster for brain dumps"],
  "cons": ["Transcription quality varies"],
  "open_questions": ["Which provider?"]
}
```

### Update Idea
```
PATCH /ideas/:id
```

---

## Systems

### List Systems
```
GET /systems
```
Query params: `status`

### Create / Update System
```
POST /systems
PATCH /systems/:id
```

---

## Changelog

### List Changelog
```
GET /changelog
```
Query params: `limit` (default 20)

### Add Entry
```
POST /changelog
```
```json
{
  "title": "Fixed login crash on mobile",
  "description": "Detailed description of what was done",
  "type": "fix",
  "scope": "ui",
  "files_changed": ["ui/src/views/Login.tsx"],
  "backlog_item": "fix-mobile-login"
}
```

---

## Sessions

### Get Session Info
```
GET /session
```
Returns current session and recent history.

### Start Session
```
POST /session/start
```
```json
{
  "objective": "Fix mobile login issues",
  "appetite": "2h"
}
```

### End Session
```
POST /session/end
```
```json
{
  "items_shipped": 3,
  "retro": "Fixed 3 mobile bugs, discovered 1 new issue",
  "next_suggestion": "Address the new performance issue"
}
```

---

## AI Chat

### Send Message (SSE Stream)
```
POST /ai/chat
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
data: {"tool_call": {"id": "tc_1", "function": {"name": "list_issues"}}}

event: tool_call_result
data: {"tool_call_id": "tc_1", "result": "{\"issues\": [...]}"}

event: message_complete
data: {"content": "full response text", "tool_calls": [...]}

event: done
data: {"model": "claude-sonnet-4-20250514", "usage": {...}}
```

### Get AI Config
```
GET /ai/config
```

### Update AI Config
```
PUT /ai/config
```
Deep-merged with existing config.

### List Models
```
GET /ai/models
```
Returns all discovered models across providers.

### List Conversations
```
GET /ai/conversations
```

---

## Automations

### List Automations
```
GET /automations
```

### Fire Automation
```
POST /automations/:id/fire
```
```json
{ "force": true }
```
The `force` flag bypasses cooldown for manual execution.

---

## Audits

### List Audit Runs
```
GET /audits
```
Query params: `status`, `trigger_type`, `automation_id`, `since`, `limit`

### Get Audit Run Detail
```
GET /audits/:id
```
Returns full audit run with thinking chain, tool calls, changes, and suggestions.

### Get Audit Stats
```
GET /audits/stats
```
Aggregate statistics: runs today/week, costs, changes breakdown.

---

## Docs

### List Docs
```
GET /docs
```
Returns registry with metadata for all docs.

### Get Doc Content
```
GET /docs/:id
```
Returns full markdown content.

### Create / Update / Delete Doc
```
POST /docs
PATCH /docs/:id
DELETE /docs/:id
```

### Generate Docs (AI)
```
POST /docs/generate
```
```json
{ "mode": "initialize" }
```
Modes: `initialize` (full scan) or `update` (incremental).

### Get Design Docs
```
GET /docs/designs
GET /docs/designs/:filename
```

---

## Activity Feed

### List Activity
```
GET /activity
```
Query params: `type`, `entity_type`, `entity_id`, `since`, `limit`

---

## Codebase

### Get Scan Results
```
GET /codebase/stats
GET /codebase/modules
GET /codebase/files
```

### Trigger Scan
```
POST /codebase/scan
```

### Search Codebase
```
GET /codebase/search?q=query
```

### Get File Details
```
GET /codebase/files/:path
```

---

## Git

### Get Status
```
GET /git/status
```

### Get Diff
```
GET /git/diff
```
Query params: `file`, `staged`

### Get Log
```
GET /git/log
```
Query params: `count`, `since`, `path`, `format`

### Get Branches
```
GET /git/branches
```

---

## WebSocket

Connect to `ws://localhost:24680/ws` for real-time events.

**Event Format:**
```json
{
  "type": "file_changed",
  "file": "data/issues/items.json",
  "timestamp": "2026-02-08T14:30:00Z"
}
```

Event types: `file_changed`, `scan_complete`, `automation_complete`, `docs_generated`

---

## Project Management

### Get Project Config
```
GET /config
```

### Update Config
```
PUT /config
```

### List Projects
```
GET /projects
```

### Switch Project
```
POST /projects/switch
```
```json
{ "project": "my-other-project" }
```

### Initialize Project
```
POST /init
```
Triggers AI-powered project analysis and data population.

---

## Related Documentation

- [System Overview](system-overview) — Architecture context
- [Data Model Reference](data-model-reference) — Entity type definitions
- [System: Server](system-server) — Server implementation details
