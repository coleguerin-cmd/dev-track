# System: Web UI (React + Tailwind)

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: undefined/100 | Status: Healthy

---

## Overview

The Web UI is a single-page React application that provides the primary interface for DevTrack. Built with modern web technologies (React 18, Vite, Tailwind CSS, TypeScript), it delivers a fast, responsive, and information-dense experience inspired by Linear and Cursor's minimalist dark themes. The UI connects to the Hono API server and features real-time updates via WebSocket, drag-and-drop Kanban boards, interactive architecture graphs, and an embedded AI chat assistant.

**Key Philosophy**: The UI prioritizes information density and rapid navigation over visual flourish. Every view is designed for developers who want to see project state at a glance and take action immediately.

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | React 18 | Component-based UI with hooks |
| **Build Tool** | Vite | Lightning-fast HMR and optimized builds |
| **Styling** | Tailwind CSS 3.4 | Utility-first CSS with custom design tokens |
| **Type Safety** | TypeScript 5.3 | Full type coverage across components and API |
| **State Management** | React useState/useEffect | Local state, no global store needed |
| **Routing** | Client-side view switching | localStorage-persisted active view |
| **Real-time** | WebSocket + SSE | File change notifications and AI streaming |
| **Drag & Drop** | @dnd-kit | Kanban board interactions |
| **Graphs** | react-flow + dagre | Interactive codebase architecture visualization |
| **Markdown** | react-markdown + remark-gfm | Rich docs and changelog rendering |
| **Charts** | recharts + custom SVG | Velocity metrics and radar charts |
| **Icons** | lucide-react | Consistent SVG icon system (no emoji) |

### Project Structure

```
ui/
├── index.html              # Entry point
├── vite.config.ts          # Vite configuration with proxy setup
├── tailwind.config.js      # Custom design system tokens
├── postcss.config.js       # Tailwind PostCSS setup
├── tsconfig.json           # TypeScript configuration
└── src/
    ├── main.tsx            # React mount point
    ├── App.tsx             # Root component with routing and layout
    ├── styles/
    │   └── globals.css     # Tailwind imports + custom utilities
    ├── api/
    │   ├── client.ts       # Typed API client (15KB, all endpoints)
    │   └── useWebSocket.ts # WebSocket hook for real-time updates
    ├── components/
    │   ├── Sidebar.tsx             # Main navigation with project switcher
    │   ├── ChatSidebar.tsx         # AI chat with SSE streaming (69KB)
    │   ├── StatusBadge.tsx         # Badge components (Health, Size, Status, Severity, etc.)
    │   ├── RadarChart.tsx          # Custom SVG radar chart (zero deps)
    │   ├── NotificationTray.tsx    # Toast notifications + bell panel
    │   └── graph/
    │       ├── GraphNode.tsx       # Custom react-flow node with rich tooltips
    │       ├── GraphEdge.tsx       # Custom edge with relationship labels
    │       └── NodeDetailPanel.tsx # Detailed module/file info panel
    └── views/
        ├── Dashboard.tsx       # Health overview, AI briefing, pipeline, activity
        ├── Backlog.tsx         # Three-column Kanban with drag-and-drop (56KB)
        ├── Systems.tsx         # Architecture map with health scores
        ├── Issues.tsx          # Bug tracker with severity filtering
        ├── Ideas.tsx           # Idea funnel with pros/cons/questions
        ├── Codebase.tsx        # File stats, module explorer, search
        ├── CodebaseGraph.tsx   # Interactive architecture graph (3 views)
        ├── Audits.tsx          # Automation audit runs with detail drill-down
        ├── Sessions.tsx        # Session history with retros
        ├── Changelog.tsx       # Chronological feed of shipped work
        ├── Docs.tsx            # Wiki with markdown rendering and ToC
        ├── Metrics.tsx         # Velocity charts and category breakdowns
        ├── Settings.tsx        # Profile, AI Config, Integrations (70KB)
        └── Actions.tsx         # Manual automation triggers
```

### Configuration

**Vite Config** (`ui/vite.config.ts`):
- Dev server on port `24681`
- Proxies `/api` requests to `http://localhost:24680`
- Proxies `/ws` WebSocket to `ws://localhost:24680`
- Path aliases: `@shared` → `../shared`, `@` → `src`
- Build output: `../dist/ui`

**Tailwind Config** (`ui/tailwind.config.js`):
- Custom color system with 5-layer surface depth (`surface-0` through `surface-4`)
- Semantic color tokens for status, size badges, accents
- Custom animations: `fade-in`, `slide-in`, `pulse-subtle`
- Tight spacing for information density
- Dark mode by default (no light theme)

**Global Styles** (`ui/src/styles/globals.css`):
- Inter font for sans-serif, JetBrains Mono for code
- Custom scrollbar styling (6px width, rounded)
- Utility classes: `.card`, `.card-hover`, `.badge`, `.btn-*`, `.input`, `.label`
- Markdown prose styles for audit rendering (`.audit-markdown`)

## Core Components

### App.tsx — Root Layout & Routing

The main application component manages:
- **View State**: localStorage-persisted active view (dashboard, backlog, systems, etc.)
- **Layout**: Sidebar (left) + Main content (center) + Optional ChatSidebar (right)
- **Real-time Updates**: WebSocket connection with event deduplication
- **Notifications**: Toast system + notification bell with unread count
- **Chat Integration**: Resizable AI chat sidebar with SSE streaming

**Key Implementation Detail**: The app intentionally does NOT unmount/remount views on every WebSocket event (ISS-039 fix). Views manage their own data refresh to preserve internal state like scroll position, expanded items, and tab selection.

```typescript
// View switching without destroying state
const [view, setView] = useState<View>('dashboard');
const renderView = () => {
  switch (view) {
    case 'dashboard': return <Dashboard />;
    case 'backlog': return <Backlog />;
    // ... etc
  }
};
```

### Sidebar.tsx — Navigation & Project Switcher

**Features**:
- 12 navigation items grouped into Main, Data, and Config sections
- Keyboard shortcuts displayed on hover (D, B, Y, I, E, X, A, S, C, O, M, ,)
- Real-time connection status indicator
- Project switcher dropdown with hot-swap capability
- Status line display (project health summary)
- Issue count badges (open issues, critical issues)

**Navigation Groups**:
- **Main**: Dashboard, Roadmap, Systems, Issues, Ideas, Codebase, Audits
- **Data**: Sessions, Changelog, Docs, Metrics
- **Config**: Settings

**Project Switching**: Calls `/api/v1/projects/switch` endpoint, then reloads the page to reinitialize all data with the new project context.

### ChatSidebar.tsx — AI Assistant

**69KB component** providing embedded AI chat with:
- **Two Tabs**: Chat (AI conversation) + Activity (session changes feed)
- **Model Selection**: Dropdown to choose from available AI models (Anthropic, OpenAI, Google)
- **SSE Streaming**: Real-time token-by-token streaming from `/api/v1/ai/chat/stream`
- **Tool Call Visualization**: Expandable sections showing function calls, arguments, and results
- **Conversation Persistence**: localStorage-backed message history
- **Session Activity Feed**: Tracks entity changes (created, updated, resolved) during the session
- **Resizable**: Drag handle to adjust width (300px - 800px)

**Implementation Notes**:
- Uses `EventSource` for SSE streaming with automatic reconnection
- Parses SSE events: `content_start`, `content_delta`, `tool_call_start`, `tool_call_result`, `content_complete`
- Maintains conversation context across page navigation
- Supports Markdown rendering in assistant responses (react-markdown + remark-gfm)

### StatusBadge.tsx — Badge Component Library

Reusable badge components with consistent styling:
- **HealthDot**: Color-coded status indicator (healthy, degraded, critical, unknown, planned)
- **SizeBadge**: S/M/L/XL with color coding (cyan, blue, purple, orange)
- **StatusBadge**: Item/issue status (pending, in_progress, completed, open, resolved, etc.)
- **SeverityBadge**: Issue severity (critical, high, medium, low)
- **HorizonBadge**: Roadmap horizon (now, next, later, shipped)
- **PriorityBadge**: Priority levels (P0, P1, P2, P3)
- **CategoryTag**: Generic category labels
- **HealthBar**: Horizontal progress bar with color gradient

All badges use Tailwind's custom color tokens for consistency.

### NotificationTray.tsx — Real-time Notifications

**Two-part system**:
1. **Toast Notifications**: Bottom-left overlay, auto-dismiss after 5 seconds, max 3 visible
2. **Notification Bell**: Top-right header icon with unread count and dropdown panel

**Notification Types**:
- `issue`: Bug/issue events
- `backlog`: Roadmap item changes
- `changelog`: New changelog entries
- `idea`: New ideas captured
- `brain_note`: AI observations/suggestions
- `session`: Session start/end events
- `ai`: AI automation completions

**WebSocket Integration**: Converts `WSEvent` messages into notifications with deduplication (same title within 2 seconds ignored).

### RadarChart.tsx — Custom SVG Radar Chart

**Zero-dependency** radar/spider chart for AI-observed user attributes:
- Renders 5-8 dimensions on a polygon
- Scales values 0-100
- Custom SVG path generation
- Used in Settings > Profile tab to visualize intelligence scores

**Attributes Displayed**:
- Speed (how fast user works)
- Clarity (communication precision)
- Autonomy (self-direction)
- Scope Control (feature creep resistance)
- Closure (task completion drive)

### Graph Components (react-flow)

**GraphNode.tsx**:
- Custom node component for codebase architecture graph
- Displays module/file name, kind badge, line count, export count
- Color-coded by kind (backend, frontend, integration, data, shared, etc.)
- Shows short description, key exports, and HTTP methods (for API routes)
- Hover state with highlighting and dimming effects

**GraphEdge.tsx**:
- Custom edge component with relationship labels
- Displays dependency type (imports, uses, extends, etc.)
- Animated flow for active paths
- Color-coded by relationship strength

**NodeDetailPanel.tsx**:
- Right-side panel showing detailed module information
- Lists all files in module, exports, external services
- Displays file type breakdown
- Shows full description and architecture context

## Views (Pages)

### Dashboard.tsx — Project Overview

**Purpose**: Single-pane view of project health, active work, and AI insights.

**Sections**:
1. **Health Ring**: Circular progress indicator with percentage and status label
2. **Stats Grid**: Total items shipped, open issues, session count, velocity
3. **Now/Next Columns**: Current sprint items and upcoming work
4. **Recent Issues**: Top 5 open issues with severity badges
5. **AI Briefing**: Collapsible panel with context recovery notes and suggestions
6. **Brain Notes**: AI observations, warnings, and suggestions (dismissible)
7. **Activity Feed**: Recent events (items shipped, issues resolved, sessions ended)
8. **Recent Ideas**: Captured ideas awaiting triage
9. **Recent Changelog**: Last 5 shipped features
10. **Quick Actions**: Initialize Project, Initialize Docs buttons

**Data Sources**: Calls 10+ API endpoints on mount to aggregate dashboard data.

### Backlog.tsx — Roadmap Kanban

**56KB view** with two modes:
1. **Kanban Mode**: Three-column board (Now / Next / Later)
2. **Epic Mode**: Grouped by epic with progress tracking

**Features**:
- **Drag & Drop**: @dnd-kit powered, moves items between horizons
- **Inline Forms**: Create new items and epics without modal dialogs
- **Expandable Cards**: Click to see full details, acceptance criteria, dependencies
- **Status Management**: Quick status toggles (pending, in_progress, completed)
- **Epic Assignment**: Assign items to epics with color-coded badges
- **Filtering**: Filter by status, category, epic
- **Issue Linking**: Shows related issues with severity indicators
- **Completion Actions**: Mark complete, reopen, cancel

**Drag & Drop Implementation**:
```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const horizon = over.id as Horizon; // 'now', 'next', 'later'
  moveItem(active.id as string, horizon);
};
```

### Systems.tsx — Architecture Health Map

**Purpose**: Visual overview of all tracked systems with health scores.

**Features**:
- Grid layout of system cards
- Health score bar (0-100) with color gradient
- Status indicator (healthy, degraded, critical, unknown, planned)
- Tech stack tags
- Click to view system details (future: drill-down to modules)

**Data Source**: `/api/v1/systems`

### Issues.tsx — Bug Tracker

**Purpose**: Manage open issues, track resolutions, filter by severity.

**Features**:
- Tab filtering: All, Open, In Progress, Resolved
- Severity badges with color coding
- Status badges (open, in_progress, resolved, wont_fix)
- Expandable issue cards showing symptoms, root cause, resolution
- Quick actions: Mark in progress, resolve, reopen
- Related roadmap item links
- File path display for affected files

**Data Source**: `/api/v1/issues`

### Ideas.tsx — Idea Funnel

**Purpose**: Capture and triage ideas before they become roadmap items.

**Features**:
- Status tabs: Captured, Exploring, Validated, Promoted, Dismissed
- Category badges (feature, architecture, ux, business, integration, core, security)
- Priority indicators (low, medium, high, critical)
- Expandable cards with pros, cons, open questions
- Quick actions: Promote to backlog, change status, edit
- Related ideas linking

**Data Source**: `/api/v1/ideas`

### Codebase.tsx — File Explorer & Search

**Purpose**: Browse codebase structure, search files/functions, view stats.

**Tabs**:
1. **Architecture**: Interactive react-flow graph (delegates to CodebaseGraph.tsx)
2. **Overview**: Stats summary (files, lines, functions, components, routes, pages, services)
3. **Files**: Sortable table with file type filtering
4. **Pages**: UI pages with component lists
5. **API**: API routes with HTTP methods
6. **Modules**: Logical groupings with exports and dependencies
7. **Services**: External service usage tracking

**Search**: Real-time search across files, functions, routes, pages (calls `/api/v1/codebase/search`)

**Scan Action**: Manual trigger to refresh codebase scan (calls `/api/v1/codebase/scan`)

### CodebaseGraph.tsx — Interactive Architecture Visualization

**Purpose**: Visual representation of codebase structure using react-flow.

**Three View Modes**:
1. **Module View**: High-level modules with dependencies
2. **File View**: All files with import/export relationships
3. **Service View**: External service dependencies

**Features**:
- Dagre auto-layout for hierarchical positioning
- Zoom and pan controls
- Node selection with detail panel
- Relationship edge labels
- Search-based highlighting
- Minimap for navigation

**Layout Algorithm**: Uses `dagre` library to compute node positions based on dependencies.

### Audits.tsx — Automation Audit Viewer

**38KB view** for reviewing automation runs.

**Features**:
- List of audit runs with status, trigger type, duration, cost
- Expandable detail view showing:
  - AI thinking chain (markdown-rendered)
  - Tool calls with arguments and results
  - Changes made (entities created/updated/deleted)
  - Suggestions for future improvements
- Filter by automation ID, trigger type, status
- Stats summary: runs today/this week, total cost, changes count
- Manual automation trigger buttons

**Data Source**: `/api/v1/audits/runs`

### Sessions.tsx — Session History

**Purpose**: Review past work sessions with objectives and retros.

**Features**:
- Chronological list of sessions
- Displays objective, appetite (time budget), duration
- Items shipped count and story points
- Retrospective notes
- AI observations about developer behavior
- Next session suggestions

**Data Source**: `/api/v1/session/log`

### Changelog.tsx — Shipped Work Feed

**Purpose**: Chronological record of completed work.

**Features**:
- Type badges (feature, enhancement, fix, refactor, docs, chore)
- Scope indicators (area of codebase affected)
- File change lists
- Linked to roadmap items
- Session attribution

**Data Source**: `/api/v1/changelog`

### Docs.tsx — Wiki & Documentation

**23KB view** with markdown rendering.

**Features**:
- Two-tab layout: Wiki (general docs) + Design (technical specs)
- Document list with type badges (wiki, design, decision, adr, rfc, auto-generated)
- Markdown rendering with:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Syntax highlighting (rehype-highlight)
  - Auto-generated table of contents (rehype-slug)
- Initialize Docs button (runs AI doc generation)
- Update Docs button (refreshes existing docs)
- New Doc form with type selection

**Markdown Rendering**:
```typescript
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSlug, rehypeHighlight]}
>
  {docContent}
</ReactMarkdown>
```

**Data Source**: `/api/v1/docs`

### Metrics.tsx — Velocity & Analytics

**Purpose**: Track development velocity and category breakdowns.

**Charts**:
1. **Velocity Over Time**: Line chart of items shipped per session
2. **Points Per Session**: Story point burn rate
3. **Category Breakdown**: Pie chart of work distribution
4. **Issue Resolution Rate**: Open vs resolved over time

**Library**: Uses `recharts` for responsive SVG charts.

**Data Source**: `/api/v1/velocity`, `/api/v1/activity`

### Settings.tsx — Configuration Hub

**70KB view** with three tabs:

**1. Profile Tab**:
- AI-observed user attributes with radar chart
- Intelligence score breakdown (speed, clarity, autonomy, scope control, closure)
- Communication style toggles
- Behavior preferences (session length, context window, prompt-to-closure)
- Custom AI instructions textarea
- Session observation history (AI-to-AI feedback)

**2. AI Config Tab**:
- Provider toggles (Anthropic, OpenAI, Google)
- Feature-specific model overrides (chat, fast, reasoning)
- Automation settings:
  - Global enable/disable
  - Scheduler on/off
  - Triggers on/off
  - Default model tier
  - Max concurrent runs (UI only, not enforced — ISS-031)
  - Cooldown minutes
- Budget controls:
  - Daily spending limit
  - Warning threshold
  - Pause on limit toggle
  - Total spent display
- Default model selection (chat, fast, reasoning)

**3. Integrations Tab**:
- Plugin cards for each integration (GitHub, Helicone, Vercel, Linear, Slack, etc.)
- Setup guides with credential fields
- Test connection buttons with pass/fail indicators
- Last tested timestamp
- Enable/disable toggles
- Secure credential input (password fields with show/hide)

**Data Sources**: `/api/v1/profile`, `/api/v1/ai/config`, `/api/v1/integrations`

### Actions.tsx — Manual Automation Triggers

**Purpose**: Manually run automations outside of scheduled/event triggers.

**Features**:
- List of all automations with descriptions
- Manual trigger buttons
- Last fired timestamp
- Fire count display
- Loading states during execution

**Data Source**: `/api/v1/automations`

## API Client (`ui/src/api/client.ts`)

**15KB typed API client** organized by domain:

```typescript
// State
state.get()
state.update(data)

// Session
session.getCurrent()
session.start(data)
session.end(data)
session.getLog(limit)

// Roadmap (backlog)
roadmap.list(params)
roadmap.get(id)
roadmap.create(data)
roadmap.update(id, data)
roadmap.move(id, horizon)
roadmap.complete(id)
roadmap.reopen(id)
roadmap.remove(id)

// Epics
epics.list(params)
epics.create(data)
epics.update(id, data)

// Milestones
milestones.list(params)
milestones.create(data)
milestones.update(id, data)

// Issues
issues.list(params)
issues.create(data)
issues.update(id, data)
issues.resolve(id, resolution)

// Ideas
ideas.list(params)
ideas.create(data)
ideas.update(id, data)

// Changelog
changelog.list(limit)
changelog.add(data)

// Docs
docs.list(params)
docs.get(id)
docs.create(data)
docs.update(id, data)

// Codebase
codebase.stats()
codebase.scan()
codebase.files(params)
codebase.search(query)

// Config
config.get()
config.quickStatus()
config.update(data)

// And more: ai, brain, activity, audits, integrations, init
```

**Error Handling**: All requests throw on non-ok responses with error messages from the API.

## WebSocket Integration (`ui/src/api/useWebSocket.ts`)

**Real-time Update Hook**:

```typescript
const { connected, subscribe } = useWebSocket(handleMessage);
```

**Event Types**:
- `file_changed`: Data file modified (issues, roadmap, sessions, etc.)
- `session_started`: New session began
- `session_ended`: Session closed
- `item_completed`: Roadmap item marked done
- `issue_resolved`: Issue closed
- `automation_completed`: AI automation finished

**Connection Management**:
- Auto-reconnect on disconnect (3-second delay)
- Connection status indicator in sidebar
- WebSocket URL: `ws://localhost:24680/ws` (dev) or `wss://` (production)

**Usage Pattern**:
```typescript
const handleWSMessage = useCallback((event: WSEvent) => {
  const notif = wsEventToNotification(event);
  if (notif) {
    setNotifications(prev => [notif, ...prev]);
    setToasts(prev => [...prev, notif]);
  }
}, []);

useWebSocket(handleWSMessage);
```

## Design System

### Color Palette

**Surface Layers** (depth hierarchy):
- `surface-0`: #0a0a0b (deepest background, used for inputs)
- `surface-1`: #111113 (main app background)
- `surface-2`: #18181b (cards, panels)
- `surface-3`: #1f1f23 (elevated surfaces, hover states)
- `surface-4`: #27272b (highest elevation, active states)

**Borders**:
- `border`: #2a2a2e (default)
- `border-subtle`: #1f1f23 (low contrast)
- `border-strong`: #3f3f46 (high contrast, focus states)

**Text**:
- `text-primary`: #fafafa (headings, primary content)
- `text-secondary`: #a1a1aa (body text, labels)
- `text-tertiary`: #71717a (muted text, placeholders)

**Accents**:
- `accent-blue`: #3b82f6 (primary actions, links)
- `accent-green`: #22c55e (success, health)
- `accent-yellow`: #eab308 (warnings, medium priority)
- `accent-red`: #ef4444 (errors, critical issues)
- `accent-purple`: #a855f7 (in-progress, next horizon)
- `accent-orange`: #f97316 (high priority, XL size)
- `accent-cyan`: #06b6d4 (S size, hooks)

**Status Colors**:
- `status-pass`: #22c55e (completed, resolved, healthy)
- `status-fail`: #ef4444 (critical, failed)
- `status-warn`: #eab308 (degraded, medium severity)
- `status-info`: #3b82f6 (informational)
- `status-neutral`: #71717a (unknown, pending)

### Typography

**Fonts**:
- **Sans-serif**: Inter (400, 500, 600, 700 weights)
- **Monospace**: JetBrains Mono (400, 500 weights)

**Font Sizes**:
- `text-2xs`: 0.625rem / 10px (badges, timestamps)
- `text-xs`: 0.75rem / 12px (labels, secondary text)
- `text-sm`: 0.875rem / 14px (body text, buttons)
- `text-base`: 1rem / 16px (headings, primary content)
- `text-lg`: 1.125rem / 18px (section headings)
- `text-xl`: 1.25rem / 20px (page titles)

### Spacing & Layout

**Philosophy**: Tight spacing for information density. Prefer compact cards over spacious layouts.

**Padding**:
- Cards: `p-3` to `p-4` (12-16px)
- Buttons: `px-3 py-1.5` (12px x 6px)
- Badges: `px-1.5 py-0.5` (6px x 2px)

**Gaps**:
- Between cards: `gap-2` to `gap-3` (8-12px)
- Between sections: `gap-4` to `gap-6` (16-24px)

### Animations

**Defined Animations**:
- `animate-fade-in`: 0.15s ease-out opacity transition
- `animate-slide-in`: 0.2s ease-out slide from top with fade
- `animate-pulse-subtle`: 2s infinite gentle opacity pulse

**Transition Classes**:
- `transition-colors`: Smooth color transitions on hover/focus
- `transition-all`: Smooth transitions for multiple properties

## Development Workflow

### Running the UI

**Development Mode**:
```bash
npm run dev:ui
# or
vite ui --port 24681
```

**Build for Production**:
```bash
npm run build:ui
# Output: dist/ui/
```

**Serve Built UI**:
```bash
npm run serve
# Hono server serves static files from dist/ui
```

### Hot Module Replacement (HMR)

Vite provides instant HMR for:
- React component changes
- CSS/Tailwind updates
- TypeScript edits

**No full page reload** required during development.

### Debugging

**React DevTools**: Inspect component hierarchy and state
**Network Tab**: Monitor API calls to `/api/v1/*`
**WebSocket**: Check connection status in sidebar
**Console**: WebSocket connection logs: `[ws] Connected`, `[ws] Disconnected`

### Adding a New View

1. Create `ui/src/views/NewView.tsx`
2. Add view type to `App.tsx`:
   ```typescript
   type View = 'dashboard' | 'backlog' | ... | 'newview';
   ```
3. Add to `renderView()` switch statement
4. Add navigation item to `Sidebar.tsx`:
   ```typescript
   const NAV_ITEMS = [
     // ...
     { id: 'newview', label: 'New View', icon: IconName, shortcut: 'N', group: 'main' }
   ];
   ```
5. Create API client methods in `ui/src/api/client.ts` if needed

### Adding a New Component

1. Create `ui/src/components/NewComponent.tsx`
2. Export component function
3. Import and use in views
4. Add to design system if it's a reusable UI element

## Known Issues & Limitations

### Open Issues

**ISS-039 (Resolved)**: Views were unmounting/remounting on every WebSocket event, destroying internal state. Fixed by removing global refreshKey and letting views manage their own data refresh.

**ISS-031**: Max Concurrent automation setting in Settings > AI Config is cosmetic only. The automation engine doesn't enforce it because it processes automations sequentially within each trigger fire. Low priority since cooldown prevents overlap.

**ISS-043**: Anthropic prompt caching not working (0 cache reads on 130K token prompts). Possible Helicone proxy interference or missing API parameters. Blocking 90% cost savings on repeated prompts.

### Limitations

**No Global State Management**: Uses local React state in each view. This means data doesn't automatically sync across views. Refreshing one view doesn't update another. Acceptable trade-off for simplicity.

**No Offline Support**: Requires active server connection. WebSocket disconnect shows warning but doesn't queue actions.

**No Mobile Optimization**: Designed for desktop/laptop screens (1280px+). Mobile layout not tested.

**No Light Theme**: Dark mode only. Light theme would require extensive color token remapping.

**No Accessibility Audit**: ARIA labels and keyboard navigation not fully implemented. Screen reader support unknown.

## Performance Characteristics

**Bundle Size** (production build):
- Total: ~800KB (uncompressed)
- React + ReactDOM: ~140KB
- react-flow: ~200KB
- Other deps: ~460KB

**Load Time** (local dev):
- Initial page load: <500ms
- Vite HMR update: <100ms
- API request latency: 5-20ms (local server)

**Memory Usage**:
- Idle: ~50MB
- With large codebase graph: ~150MB
- With chat history: ~80MB

**Rendering Performance**:
- Dashboard: <50ms render time
- Backlog Kanban: <100ms (50+ items)
- Codebase Graph: <200ms (100+ nodes)

## Future Enhancements

**Planned Features** (from roadmap):
- Epic hierarchy tree view (in progress)
- Milestone Gantt chart
- Dependency graph visualization
- Real-time collaborative editing
- Keyboard shortcut overlay (press `?`)
- Command palette (Cmd+K)
- Customizable dashboard widgets
- Export views to PDF/PNG
- Dark theme variants (blue, purple, green)

**AI-Driven Ideas** (from ideas backlog):
- Smart search with AI-powered relevance
- Predictive issue detection from code changes
- Automated retrospective generation
- Voice-to-text for rapid idea capture
- Context-aware quick actions

## Cross-References

**Related Systems**:
- [System: Server (Hono API)](system-server) — Backend API that UI connects to
- [System: AI Intelligence Layer](system-ai) — Powers chat sidebar and automations
- [System: Data Layer](system-data) — JSON storage that API reads/writes

**Related Docs**:
- [Getting Started](getting-started) — Setup instructions
- [Architecture Overview](architecture-overview) — High-level system design
- [API Reference](api-reference) — Complete API endpoint documentation

**Related Issues**:
- [ISS-031](ISS-031) — Max Concurrent setting not enforced
- [ISS-043](ISS-043) — Anthropic prompt caching not working

**Related Epics**:
- [epic-hierarchy-ui] — Epic/hierarchy visibility (in progress)

---

**Last Updated**: 2026-02-09 | **Maintainer**: AI System | **Status**: Active Development