# System: Web UI (React + Tailwind)

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 75/100 ✅ Healthy

---

## Overview

The Web UI is a React single-page application providing 12+ views for project management, AI chat, codebase visualization, and system monitoring. Built with Vite for development and Tailwind CSS for styling. Features a Cursor-inspired minimalist dark theme with Lucide icons throughout.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 75/100 |
| Views | 12 (Dashboard, Roadmap, Systems, Issues, Ideas, Codebase, Sessions, Changelog, Docs, Metrics, Settings, Actions) |
| Components | 9+ reusable components |
| Tech Stack | React 18, Vite, Tailwind CSS, TypeScript |
| Dev Port | 24681 |
| Dependencies | server (API) |

## Views

| View | File | Description |
|------|------|-------------|
| **Dashboard** | `views/Dashboard.tsx` | Health ring, stats, AI briefing, brain notes, pipeline, recent activity |
| **Backlog** | `views/Backlog.tsx` | Three-column Kanban (Now/Next/Later) with drag-and-drop (@dnd-kit) |
| **Systems** | `views/Systems.tsx` | Architecture map with health scores and dependencies |
| **Issues** | `views/Issues.tsx` | Bug tracker with severity, status, resolution tracking |
| **Ideas** | `views/Ideas.tsx` | Idea funnel with pros/cons/questions, filter tabs |
| **Codebase** | `views/Codebase.tsx` | File stats, module list, search |
| **CodebaseGraph** | `views/CodebaseGraph.tsx` | react-flow interactive architecture graph (3 views) |
| **Sessions** | `views/Sessions.tsx` | Session history with objectives, items shipped, retros |
| **Changelog** | `views/Changelog.tsx` | Chronological feed of shipped work |
| **Docs** | `views/Docs.tsx` | Wiki with markdown rendering, ToC, navigation |
| **Metrics** | `views/Metrics.tsx` | Velocity charts, category breakdowns |
| **Settings** | `views/Settings.tsx` | Profile (AI-observed), AI Config, Integrations tabs |

## Key Components

| Component | Description |
|-----------|-------------|
| `Sidebar.tsx` | Navigation with grouped sections, project switcher, Lucide icons |
| `StatusBadge.tsx` | HealthDot, SizeBadge, StatusBadge, SeverityBadge, HorizonBadge, CategoryTag |
| `RadarChart.tsx` | Custom SVG radar/spider chart (zero dependencies) |
| `NotificationTray.tsx` | Toast notifications + bell panel with unread count |
| `ChatSidebar.tsx` | AI chat with SSE streaming, tool call visualization |
| `graph/GraphNode.tsx` | Custom react-flow node with descriptions |
| `graph/GraphEdge.tsx` | Custom react-flow edge with relationship labels |
| `graph/NodeDetailPanel.tsx` | Rich detail panel for graph nodes |

## API Client

`ui/src/api/client.ts` — Typed fetch wrapper for all API endpoints. Organized by domain (state, session, backlog, issues, changelog, etc.).

`ui/src/api/useWebSocket.ts` — WebSocket hook for real-time updates. Converts file_changed events to view refreshes and notifications.

## Design System

- **Theme:** Dark mode, Cursor-inspired minimalism
- **Icons:** Lucide React (SVG, no emoji)
- **Spacing:** Tight, information-dense
- **Typography:** Clean hierarchy, professional
- **Colors:** Health green/yellow/red, severity badges, category tags
- **DnD:** @dnd-kit for Kanban drag-and-drop

## Recent Changes

- Lucide icons replaced all emoji throughout (CL-021)
- Dashboard overhauled with health ring, compact stats, collapsible AI briefing (CL-030)
- Settings rebuilt with Profile, AI Config, Integrations tabs (CL-022)
- AI-observed profile with radar charts and intelligence scoring (CL-023)
- Notification tray with toasts and bell panel (CL-024)
- Kanban DnD wired up with @dnd-kit (CL-031)
- Project switcher with hot-swap (CL-036)
