# dev-track — Build Phases

> **Estimated total effort**: 3-5 focused sessions
> **Dogfood project**: Pillar (use it immediately, iterate based on real usage)

---

## Phase 0: Data Layer + Cursor Rule (Session 1, ~2-3 hours)

**Goal**: Replace existing NEXT_SPRINT.md / CURRENT_STATE.md / CHANGELOG.md with structured `.dev-track/data/` files. Write the cursor rule. Start using it immediately.

### Tasks

1. **Create `.dev-track/data/` directory structure**
   - All JSON files with initial schemas
   - Migrate existing Pillar data into the new format

2. **Migrate existing content**
   - `CURRENT_STATE.md` → `data/state.json`
   - `NEXT_SPRINT.md` items → `data/backlog/items.json`
   - `CHANGELOG.md` entries → `data/changelog/entries.json`
   - Existing design sections → `data/designs/*.md`
   - Known bugs → `data/issues/items.json`
   - "new entry" diagnostic → `data/actions/playbooks/new-entry.md`

3. **Write the cursor rule**
   - `templates/dev-track.mdc` → install to `.cursor/rules/dev-track.mdc`
   - Quick Status line with real Pillar data
   - All trigger patterns
   - File map and interaction rules

4. **Create action registry**
   - Register existing tracked actions: new-entry, email-upload
   - Write playbooks for each (new-entry already exists as a cursor rule)

5. **Validate**
   - Open new Cursor chat window
   - Say "let's go" — AI should read session plan + state + now items
   - Say "new entry" — AI should read playbook and execute
   - Say "what's the backlog" — AI should read items.json

### Deliverable
AI and human using structured files for project management. No server yet — just files + cursor rule. But immediately better than 700-line markdown.

### What we learn
- Are the schemas right? Do we need more/fewer fields?
- Is the cursor rule triggering correctly?
- Is the context budget actually smaller?
- Which operations does the AI do most often?

---

## Phase 1: Local Server + API (Session 2, ~3-4 hours)

**Goal**: Stand up the Hono server on port 24680. REST API for all data operations. File watching. WebSocket stub.

### Tasks

1. **Initialize the project**
   - `package.json` with dependencies: hono, chokidar, ws, better-sqlite3 (optional), tsx
   - TypeScript config
   - Dev script: `npm run dev` starts the server with hot reload (tsx watch)

2. **In-memory data store**
   - `server/store.ts`: Reads all JSON files on startup, holds in memory
   - Type-safe interfaces matching all JSON schemas
   - Read/write functions that sync to disk

3. **File watcher**
   - `server/watcher.ts`: chokidar watches `data/` directory
   - On change: reload affected file into store
   - Debounce to avoid echo from our own writes

4. **REST API routes**
   - All endpoints from SPEC.md §3.1
   - Validation on inputs (WIP limits, required fields, auto-increment IDs)
   - JSON responses

5. **Static file serving**
   - Serve `ui/dist/` from root path
   - API at `/api/v1/*`
   - (UI doesn't exist yet — just serve a placeholder index.html)

6. **WebSocket foundation**
   - `server/ws.ts`: Basic WebSocket server at `/ws`
   - Broadcast events when store changes
   - Client connection tracking

7. **Script runner**
   - `server/script-runner.ts`: Spawn child processes
   - Capture stdout/stderr
   - Stream output over WebSocket
   - Timeout handling

### Deliverable
Server running at localhost:24680 with full API. CLI can call it. AI can call it. File changes sync both ways. No UI yet but the engine is running.

### Tech decisions to make
- Hono vs Express (Hono recommended — lighter, faster, modern)
- tsx for dev, tsc for build
- Whether to use better-sqlite3 now or defer

---

## Phase 2: Web UI — Dashboard + Backlog (Session 3, ~4-5 hours)

**Goal**: React frontend with the two most important views: Dashboard and Backlog board.

### Tasks

1. **Vite + React + Tailwind setup**
   - `ui/` directory with Vite config
   - Tailwind CSS with dark theme (match Cursor aesthetic)
   - API client module (fetch wrapper for localhost:24680/api/v1/*)
   - WebSocket hook for live updates

2. **App shell**
   - Sidebar navigation
   - View router (simple client-side routing, no need for a framework)
   - Dark theme, clean typography
   - Quick Status bar at bottom

3. **Dashboard view**
   - Health score display
   - Current session info
   - Now items with status
   - Action health cards
   - Recent activity feed
   - Last session summary

4. **Backlog board**
   - Three-column Kanban (Now / Next / Later)
   - Cards with title, size badge, status, category tag
   - Click to expand with full detail
   - Drag-and-drop between columns (use dnd-kit or similar)
   - New item form
   - WIP limit indicator on Now column
   - Inline status update

5. **WebSocket integration**
   - Connect to ws://localhost:24680/ws
   - Update dashboard in real-time when AI changes files
   - Reconnect logic

### Deliverable
Functional dashboard and backlog board. Open localhost:24680 in a browser tab alongside Cursor. See project state, manage backlog, watch live updates as AI works.

### Design principles
- Dense information display (not wasteful whitespace)
- Keyboard navigable
- Fast (no loading spinners for local data)
- Color-coded: health green/yellow/red, size S/M/L/XL badges, category tags

---

## Phase 3: Actions + Issues + Diagnostics (Session 4, ~3-4 hours)

**Goal**: The debugging power layer. Action health monitoring, issue tracking, diagnostic runner with live output.

### Tasks

1. **Actions view**
   - Action cards with health indicators
   - Expected outcomes with pass/fail badges
   - "Run Diagnostic" button → spawns scripts on server
   - Live terminal output in a drawer/modal (streamed via WebSocket)
   - Outcome marking UI (checkboxes for pass/fail)
   - Run history list

2. **Issues view**
   - Issue list with filters (status, severity, action)
   - Issue detail with all fields
   - Create issue form (auto-links to action if context available)
   - Resolve issue flow
   - Link to backlog items

3. **Diagnostic → Cursor bridge**
   - When diagnostic has failures, generate a Cursor-ready prompt
   - "Copy to Cursor" button
   - Include: what failed, run file path, investigation steps

4. **CLI enhancements**
   - `dev-track action run <id>` — runs diagnostic from terminal
   - `dev-track issue create` — create issues from AI/terminal
   - Output formatting for terminal readability

### Deliverable
Full debugging workflow: monitor action health → run diagnostics → see results → create issues → copy investigation prompt to Cursor → AI fixes → mark resolved.

---

## Phase 4: Sessions + Changelog + Docs + Metrics (Session 5, ~3-4 hours)

**Goal**: Complete the remaining views. The full lifecycle is now visible.

### Tasks

1. **Sessions/Timeline view**
   - Visual session history (vertical timeline)
   - Current session with live progress
   - Session detail: items shipped, discoveries, retro
   - Start/end session from UI (in addition to CLI/AI)

2. **Changelog view**
   - Chronological feed of shipped items
   - Filterable by category, date range
   - Linked to backlog items and sessions
   - Rich display (items list, files touched)

3. **Docs view**
   - File browser for `data/designs/` and `data/decisions/`
   - Markdown rendering (use react-markdown or marked)
   - Side-by-side browser + renderer
   - Links from backlog items open in docs view

4. **Metrics view**
   - Velocity chart (items/points per session over time)
   - Category breakdown (pie/bar chart)
   - Aggregate stats cards
   - Issue trend (found vs resolved over time)
   - Use lightweight chart library (recharts or chart.js)

5. **Session management integration**
   - Session start/end updates all relevant views
   - Dashboard reflects active session
   - Velocity auto-updates on session end

### Deliverable
Complete web UI with all views functional. The full project lifecycle is visible and manageable from the dashboard.

---

## Phase 5: Polish + CLI + Portability (Session 6, ~2-3 hours)

**Goal**: Production-quality tool. Installable in any project. Documentation.

### Tasks

1. **CLI as standalone tool**
   - Make CLI installable: `npm install -g dev-track` or `npx dev-track`
   - `dev-track init` scaffolds `.dev-track/` in any project
   - `dev-track serve` starts the server
   - `dev-track status-line --update` regenerates cursor rule Quick Status

2. **Cursor rule template**
   - Generic template in `templates/dev-track.mdc`
   - `dev-track init` copies it to `.cursor/rules/dev-track.mdc`
   - Auto-fills project name from package.json or prompt

3. **UI polish**
   - Keyboard shortcuts (B for backlog, D for dashboard, etc.)
   - Toast notifications for mutations
   - Responsive layout (works at narrow widths)
   - Error states and empty states
   - Loading transitions

4. **Documentation**
   - README with installation, usage, philosophy
   - Example data for reference
   - Contributing guide (if open-sourcing)

5. **Build + distribution**
   - `npm run build` produces distributable server + UI bundle
   - Server can serve pre-built UI assets (no Vite in production)
   - Single command: `dev-track serve` runs everything

### Deliverable
Installable tool that works on any project. Clear documentation. Ready to share or open-source.

---

## Future Phases (Post-MVP)

### Phase 6: Multi-Project Dashboard
- `dev-track dashboard --projects ~/proj1 ~/proj2`
- Aggregate view across projects
- Project switcher in sidebar
- Cross-project metrics

### Phase 7: Automated Diagnostics
- Deploy hook integration (Vercel, GitHub Actions)
- Post-deploy health checks without human intervention
- Notification system (issues auto-created from failures)
- Sentry webhook → auto-creates issues

### Phase 8: Background Agents
- AI agents that run on triggers (not in Cursor)
- R&D agent: explores codebases, writes design proposals
- Docs agent: keeps documentation in sync with code changes
- Diagnostic agent: runs health checks on schedule

### Phase 9: Desktop App
- Tauri wrapper around the web UI
- System tray icon with health indicator
- Native notifications
- Auto-start server on boot

### Phase 10: Cursor Extension
- VS Code/Cursor sidebar panel
- Deep integration with editor (open files from issues, jump to code from backlog)
- Status bar indicator

---

## Effort Summary

| Phase | What | Effort | Cumulative |
|-------|------|--------|------------|
| 0 | Data + cursor rule | ~2-3h | 2-3h |
| 1 | Server + API | ~3-4h | 5-7h |
| 2 | UI: Dashboard + Backlog | ~4-5h | 9-12h |
| 3 | UI: Actions + Issues + Diagnostics | ~3-4h | 12-16h |
| 4 | UI: Sessions + Changelog + Docs + Metrics | ~3-4h | 15-20h |
| 5 | Polish + CLI + Portability | ~2-3h | 17-23h |

**Total to MVP: 3-5 focused sessions (~17-23 hours)**

With AI-assisted development, this is very achievable. You built 17 features in one Pillar session. Building dev-track's MVP is roughly the same complexity as 3-5 of those features.

---

## Key Risk: Don't Over-Engineer Phase 0

The biggest risk is spending too long on the data model before using it. Phase 0 should be fast and scrappy:

- Don't optimize JSON schemas — just make them work
- Don't worry about edge cases — handle them when you hit them
- Don't try to migrate every line of existing docs — migrate the important stuff, leave the rest
- The point of Phase 0 is to START USING IT and learn what actually matters

Then Phase 1-5 are informed by real usage, not speculation.
