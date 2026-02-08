# System: Codebase Scanner & Visualizer

> **Auto-generated** | Last refreshed: 2026-02-09 | Scanner: 80/100 | Visualizer: 80/100 ✅ Healthy

---

## Overview

Two tightly coupled systems that analyze and visualize codebases. The **Scanner** performs static analysis to infer modules, dependencies, and descriptions. The **Visualizer** renders interactive architecture graphs using react-flow.

## Codebase Scanner

### Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 80/100 |
| File | `server/analyzer/scanner.ts` |
| Approach | Auto-discovery — no annotations needed |
| Dependencies | data-layer |

### Capabilities

- **Module inference** — Groups files into logical modules by directory
- **Description generation** — `generateModuleDescription()` creates plain-English descriptions from file types, exports, services, and DB operations
- **Edge labeling** — `generateEdgeLabel()` describes relationships between modules
- **File analysis** — Exports, imports, function signatures, external service calls
- **Stats** — Total files, lines, functions, components, routes, pages

### Design Philosophy (IDEA-017, validated)

Instead of requiring special code annotations (`@dt-description`, etc.), the scanner is smart enough to understand code from its existing structure. This:
- Avoids code pollution with special comments
- Works across all languages
- Makes the code itself the source of truth
- Produces better descriptions than annotations could

### Current Scan Stats

| Metric | Value |
|--------|-------|
| Total Files | 59 |
| Total Lines | ~10,000 |
| Functions | 19 |
| Components | 22 |
| API Routes | 16 |
| Pages | 12 |
| External Services | 6 |

---

## Codebase Visualizer

### Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 80/100 |
| Tech Stack | React, react-flow, dagre |
| Dependencies | codebase-scanner, server |

### Three Graph Views

1. **Module Architecture** — High-level system modules with descriptions and relationships
2. **File Dependencies** — Individual file import/export relationships
3. **Dependency Graph** — External package dependencies

### Components

| Component | Description |
|-----------|-------------|
| `CodebaseGraph.tsx` | Main view with view switcher and controls |
| `graph/GraphNode.tsx` | Custom node with short description, health indicator |
| `graph/GraphEdge.tsx` | Custom edge with relationship labels on hover |
| `graph/NodeDetailPanel.tsx` | Rich detail panel: full description, stats, file types, exports, connections |

### Key Features

- **Plain-English descriptions** on every node (ISS-007 fix)
- **Relationship labels** on edges ("handles API requests", "stores data using")
- **Rich detail panel** with full context on click
- **dagre layout** for automatic graph positioning
- **Layman-friendly** — designed for non-developers to understand architecture
