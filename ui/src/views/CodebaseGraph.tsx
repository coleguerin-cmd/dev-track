import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

import { nodeTypes } from '../components/graph/GraphNode';
import { edgeTypes } from '../components/graph/GraphEdge';
import { NodeDetailPanel } from '../components/graph/NodeDetailPanel';
import type { GraphNodeData } from '../components/graph/GraphNode';
import type { GraphEdgeData } from '../components/graph/GraphEdge';

type GraphView = 'modules' | 'files' | 'routes';

function getBase() { return `${localStorage.getItem('devtrack-api-origin') || ''}/api/v1`; }
const BASE = getBase();

// ─── Dagre Layout ────────────────────────────────────────────────────────────

function getLayoutedElements(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  direction: 'TB' | 'LR' = 'TB',
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80, edgesep: 20 });

  for (const node of nodes) {
    // Estimate node dimensions based on type
    const width = node.type === 'serviceNode' ? 100 : node.type === 'moduleNode' ? 220 : 160;
    const height = node.type === 'serviceNode' ? 36 : node.type === 'moduleNode' ? 110 : 70;
    g.setNode(node.id, { width, height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) return node;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (nodeWithPosition.width || 160) / 2,
        y: nodeWithPosition.y - (nodeWithPosition.height || 70) / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CodebaseGraph() {
  const [view, setView] = useState<GraphView>('modules');
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdgeData>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<string>('');
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

  // Fetch graph data
  const loadGraph = useCallback(async (v: GraphView) => {
    setLoading(true);
    setSelectedNode(null);
    setHighlightedNode(null);
    try {
      const res = await fetch(`${BASE}/codebase/graph?view=${v}`);
      const json = await res.json();
      if (!json.ok || !json.data) return;

      const rawNodes: Node<GraphNodeData>[] = json.data.nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        data: { ...n.data, highlighted: false, dimmed: false },
        position: { x: 0, y: 0 },
      }));

      const rawEdges: Edge<GraphEdgeData>[] = json.data.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'custom',
        data: { ...e.data, highlighted: false, dimmed: false },
        animated: false,
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      console.error('Failed to load graph:', err);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadGraph(view);
  }, [view, loadGraph]);

  // Click-to-highlight logic
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<GraphNodeData>) => {
    setSelectedNode(node.id);
    setSelectedNodeType(node.type || '');

    if (highlightedNode === node.id) {
      // Deselect — clear highlights
      setHighlightedNode(null);
      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, highlighted: false, dimmed: false },
      })));
      setEdges(eds => eds.map(e => ({
        ...e,
        data: { ...e.data!, highlighted: false, dimmed: false },
        animated: false,
      })));
    } else {
      // Highlight this node and its connections
      setHighlightedNode(node.id);

      // Find connected node IDs
      const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id);
      const connectedNodeIds = new Set<string>([node.id]);
      for (const e of connectedEdges) {
        connectedNodeIds.add(e.source);
        connectedNodeIds.add(e.target);
      }

      setNodes(nds => nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          highlighted: connectedNodeIds.has(n.id),
          dimmed: !connectedNodeIds.has(n.id),
        },
      })));

      setEdges(eds => eds.map(e => {
        const isConnected = e.source === node.id || e.target === node.id;
        return {
          ...e,
          data: { ...e.data!, highlighted: isConnected, dimmed: !isConnected },
          animated: isConnected,
        };
      }));
    }
  }, [highlightedNode, edges, setNodes, setEdges]);

  // Click on pane to deselect
  const onPaneClick = useCallback(() => {
    setHighlightedNode(null);
    setSelectedNode(null);
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    })));
    setEdges(eds => eds.map(e => ({
      ...e,
      data: { ...e.data!, highlighted: false, dimmed: false },
      animated: false,
    })));
  }, [setNodes, setEdges]);

  const VIEW_LABELS: Record<GraphView, { label: string; description: string }> = {
    modules: { label: 'Module Architecture', description: 'High-level system overview' },
    files: { label: 'File Dependencies', description: 'Import relationships between files' },
    routes: { label: 'API Route Map', description: 'API endpoints and their handlers' },
  };

  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  return (
    <div className="flex h-[calc(100vh-180px)] rounded-lg border border-border overflow-hidden bg-surface-1">
      {/* Graph Canvas */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-1/80 z-10">
            <p className="text-sm text-text-tertiary">Loading graph...</p>
          </div>
        )}

        {nodeCount === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-text-secondary mb-1">No graph data available</p>
              <p className="text-xs text-text-tertiary">Scan your project first from the Overview tab</p>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'custom' }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(113,113,122,0.15)" />
          <Controls
            showInteractive={false}
            className="!bg-surface-2 !border-border !shadow-lg [&>button]:!bg-surface-2 [&>button]:!border-border [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-3"
          />
          <MiniMap
            nodeColor={(node) => {
              const kindColors: Record<string, string> = {
                backend: '#3b82f6',
                frontend: '#a855f7',
                integration: '#eab308',
                data: '#22c55e',
                shared: '#06b6d4',
                component: '#a855f7',
                api_route: '#3b82f6',
                hook: '#06b6d4',
                external_service: '#eab308',
              };
              return kindColors[(node.data as GraphNodeData)?.kind] || '#71717a';
            }}
            maskColor="rgba(10,10,11,0.7)"
            className="!bg-surface-2 !border-border"
          />

          {/* View switcher panel */}
          <Panel position="top-left" className="!m-3">
            <div className="bg-surface-2 border border-border rounded-lg shadow-lg p-1 flex gap-1">
              {(Object.keys(VIEW_LABELS) as GraphView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    view === v
                      ? 'bg-surface-3 text-text-primary'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {VIEW_LABELS[v].label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-tertiary mt-1.5 ml-1">
              {VIEW_LABELS[view].description} — {nodeCount} nodes, {edgeCount} edges
            </p>
          </Panel>

          {/* Legend */}
          <Panel position="bottom-left" className="!m-3">
            <div className="bg-surface-2/90 border border-border rounded-lg shadow-lg px-3 py-2">
              <p className="text-[10px] text-text-tertiary mb-1.5">Click a node to highlight connections. Click again to deselect.</p>
              <div className="flex gap-3 text-[9px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#3b82f6]" /> Backend</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#a855f7]" /> Frontend</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#22c55e]" /> Data</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#eab308]" /> External</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#06b6d4]" /> Shared</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Detail Panel */}
      {selectedNode && (
        <NodeDetailPanel
          nodeId={selectedNode}
          nodeType={selectedNodeType}
          nodeData={nodes.find(n => n.id === selectedNode)?.data || null}
          connectedEdges={edges.filter(e => e.source === selectedNode || e.target === selectedNode)}
          connectedNodes={(() => {
            const connEdges = edges.filter(e => e.source === selectedNode || e.target === selectedNode);
            const connIds = new Set(connEdges.flatMap(e => [e.source, e.target]));
            return nodes.filter(n => connIds.has(n.id) && n.id !== selectedNode);
          })()}
          onClose={() => {
            setSelectedNode(null);
            setSelectedNodeType('');
          }}
        />
      )}
    </div>
  );
}
