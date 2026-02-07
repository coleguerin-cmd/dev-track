import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface GraphNodeData {
  label: string;
  kind: string;
  lines: number;
  exports: number;
  files?: number;
  services: string[];
  methods?: string[];
  fileType?: string;
  description?: string;
  shortDescription?: string;
  keyExports?: string[];
  fileTypeSummary?: Record<string, number>;
  highlighted?: boolean;
  dimmed?: boolean;
}

const KIND_STYLES: Record<string, { bg: string; border: string; badge: string }> = {
  backend: { bg: 'bg-accent-blue/5', border: 'border-accent-blue/30', badge: 'bg-accent-blue/15 text-accent-blue' },
  frontend: { bg: 'bg-accent-purple/5', border: 'border-accent-purple/30', badge: 'bg-accent-purple/15 text-accent-purple' },
  integration: { bg: 'bg-accent-yellow/5', border: 'border-accent-yellow/30', badge: 'bg-accent-yellow/15 text-accent-yellow' },
  data: { bg: 'bg-accent-green/5', border: 'border-accent-green/30', badge: 'bg-accent-green/15 text-accent-green' },
  shared: { bg: 'bg-accent-cyan/5', border: 'border-accent-cyan/30', badge: 'bg-accent-cyan/15 text-accent-cyan' },
  component: { bg: 'bg-accent-purple/5', border: 'border-accent-purple/30', badge: 'bg-accent-purple/15 text-accent-purple' },
  hook: { bg: 'bg-accent-cyan/5', border: 'border-accent-cyan/30', badge: 'bg-accent-cyan/15 text-accent-cyan' },
  api_route: { bg: 'bg-accent-blue/5', border: 'border-accent-blue/30', badge: 'bg-accent-blue/15 text-accent-blue' },
  utility: { bg: 'bg-accent-orange/5', border: 'border-accent-orange/30', badge: 'bg-accent-orange/15 text-accent-orange' },
  config: { bg: 'bg-surface-3', border: 'border-border', badge: 'bg-surface-4 text-text-tertiary' },
  external_service: { bg: 'bg-accent-yellow/5', border: 'border-accent-yellow/30', badge: 'bg-accent-yellow/15 text-accent-yellow' },
  other: { bg: 'bg-surface-2', border: 'border-border', badge: 'bg-surface-4 text-text-tertiary' },
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-status-pass/15 text-status-pass',
  POST: 'bg-accent-blue/15 text-accent-blue',
  PATCH: 'bg-accent-yellow/15 text-accent-yellow',
  DELETE: 'bg-accent-red/15 text-accent-red',
  PUT: 'bg-accent-orange/15 text-accent-orange',
};

function ModuleNode({ data, selected }: NodeProps<GraphNodeData>) {
  const style = KIND_STYLES[data.kind] || KIND_STYLES.other;
  const dimClass = data.dimmed ? 'opacity-20' : '';
  const highlightClass = data.highlighted ? 'ring-2 ring-accent-blue shadow-lg shadow-accent-blue/10' : '';

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} ${dimClass} ${highlightClass} ${selected ? 'ring-2 ring-accent-blue' : ''} transition-all duration-200 min-w-[180px] max-w-[240px]`}>
      <Handle type="target" position={Position.Top} className="!bg-border !border-surface-1 !w-2 !h-2" />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.badge}`}>
            {data.kind}
          </span>
        </div>
        <div className="text-xs font-semibold text-text-primary">{data.label}</div>
        {/* Plain-English short description */}
        {data.shortDescription && (
          <p className="text-[10px] text-text-secondary mt-1 leading-snug line-clamp-2">
            {data.shortDescription}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-tertiary">
          {data.files !== undefined && <span>{data.files} files</span>}
          <span>{data.lines.toLocaleString()} lines</span>
        </div>
        {data.services.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {data.services.slice(0, 3).map(s => (
              <span key={s} className="text-[9px] bg-accent-yellow/10 text-accent-yellow px-1 py-0.5 rounded">{s}</span>
            ))}
            {data.services.length > 3 && (
              <span className="text-[9px] text-text-tertiary">+{data.services.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-border !border-surface-1 !w-2 !h-2" />
    </div>
  );
}

function FileNode({ data, selected }: NodeProps<GraphNodeData>) {
  const style = KIND_STYLES[data.fileType || data.kind] || KIND_STYLES.other;
  const dimClass = data.dimmed ? 'opacity-20' : '';
  const highlightClass = data.highlighted ? 'ring-2 ring-accent-blue shadow-lg shadow-accent-blue/10' : '';

  return (
    <div className={`rounded-md border ${style.border} ${style.bg} ${dimClass} ${highlightClass} ${selected ? 'ring-2 ring-accent-blue' : ''} transition-all duration-200 min-w-[140px]`}>
      <Handle type="target" position={Position.Top} className="!bg-border !border-surface-1 !w-1.5 !h-1.5" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${style.badge}`}>
            {data.kind}
          </span>
          {data.services.length > 0 && (
            <span className="text-[9px] bg-accent-yellow/10 text-accent-yellow px-1 py-0.5 rounded">
              {data.services.length} ext
            </span>
          )}
        </div>
        <div className="text-[11px] font-medium text-text-primary truncate max-w-[180px]">{data.label}</div>
        <div className="flex items-center gap-2 mt-1 text-[9px] text-text-tertiary">
          <span>{data.lines}L</span>
          <span>{data.exports} exp</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-border !border-surface-1 !w-1.5 !h-1.5" />
    </div>
  );
}

function RouteNode({ data, selected }: NodeProps<GraphNodeData>) {
  const dimClass = data.dimmed ? 'opacity-20' : '';
  const highlightClass = data.highlighted ? 'ring-2 ring-accent-blue shadow-lg shadow-accent-blue/10' : '';

  return (
    <div className={`rounded-md border border-accent-blue/30 bg-accent-blue/5 ${dimClass} ${highlightClass} ${selected ? 'ring-2 ring-accent-blue' : ''} transition-all duration-200 min-w-[160px]`}>
      <Handle type="target" position={Position.Top} className="!bg-border !border-surface-1 !w-2 !h-2" />

      <div className="px-2.5 py-2">
        {data.methods && data.methods.length > 0 && (
          <div className="flex gap-1 mb-1">
            {data.methods.map(m => (
              <span key={m} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[m] || 'bg-surface-4 text-text-tertiary'}`}>
                {m}
              </span>
            ))}
          </div>
        )}
        <div className="text-[11px] font-mono font-medium text-text-primary truncate max-w-[200px]">{data.label}</div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-border !border-surface-1 !w-2 !h-2" />
    </div>
  );
}

function ServiceNode({ data }: NodeProps<GraphNodeData>) {
  const dimClass = data.dimmed ? 'opacity-20' : '';
  const highlightClass = data.highlighted ? 'ring-2 ring-accent-yellow shadow-lg shadow-accent-yellow/10' : '';

  return (
    <div className={`rounded-full border border-accent-yellow/30 bg-accent-yellow/5 ${dimClass} ${highlightClass} transition-all duration-200 px-3 py-1.5`}>
      <Handle type="target" position={Position.Top} className="!bg-border !border-surface-1 !w-1.5 !h-1.5" />
      <div className="text-[10px] font-medium text-accent-yellow text-center capitalize">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !border-surface-1 !w-1.5 !h-1.5" />
    </div>
  );
}

export const nodeTypes = {
  moduleNode: memo(ModuleNode),
  fileNode: memo(FileNode),
  routeNode: memo(RouteNode),
  serviceNode: memo(ServiceNode),
};
