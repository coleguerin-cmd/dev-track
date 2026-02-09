import { useEffect, useState } from 'react';
import type { Node, Edge } from 'reactflow';
import type { GraphNodeData } from './GraphNode';
import type { GraphEdgeData } from './GraphEdge';

function getBase() { return `${localStorage.getItem('devtrack-api-origin') || ''}/api/v1`; }
const BASE = getBase();

interface FileDetail {
  path: string;
  name: string;
  type: string;
  lines: number;
  exports: { name: string; kind: string; line: number; isDefault: boolean; params?: string }[];
  imports: { source: string; names: string[]; isExternal: boolean }[];
  externalCalls: { service: string; detail: string; line: number }[];
  dbOperations: string[];
}

interface DependencyInfo {
  file: string;
  imports: string[];
}

interface NodeDetailProps {
  nodeId: string | null;
  nodeType: string;
  nodeData?: GraphNodeData | null;
  connectedEdges?: Edge<GraphEdgeData>[];
  connectedNodes?: Node<GraphNodeData>[];
  onClose: () => void;
}

export function NodeDetailPanel({ nodeId, nodeType, nodeData, connectedEdges, connectedNodes, onClose }: NodeDetailProps) {
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
  const [importedBy, setImportedBy] = useState<DependencyInfo[]>([]);
  const [dependsOn, setDependsOn] = useState<DependencyInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nodeId || nodeType === 'moduleNode' || nodeType === 'serviceNode') {
      setFileDetail(null);
      return;
    }

    // Strip route: or svc: prefixes
    const filePath = nodeId.replace(/^(route:|svc:)/, '');
    if (filePath.includes(':')) return; // Not a file path

    setLoading(true);
    fetch(`${BASE}/codebase/files/${filePath}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data) {
          setFileDetail(d.data.file);
          setImportedBy(d.data.imported_by || []);
          setDependsOn(d.data.depends_on || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nodeId, nodeType]);

  if (!nodeId) return null;

  // ── Module detail — the rich version ──
  if (nodeType === 'moduleNode') {
    const desc = nodeData?.description;
    const keyExports = nodeData?.keyExports || [];
    const fileTypeSummary = nodeData?.fileTypeSummary || {};
    const services = nodeData?.services || [];

    // Categorize connected edges
    const outgoing = (connectedEdges || []).filter(e => e.source === nodeId);
    const incoming = (connectedEdges || []).filter(e => e.target === nodeId);

    return (
      <div className="w-80 border-l border-border bg-surface-1 overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${kindBadge(nodeData?.kind || 'other')}`}>
              {nodeData?.kind || 'module'}
            </span>
            <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">Close</button>
          </div>
          <h3 className="text-sm font-semibold mt-1">{nodeId}</h3>
        </div>

        <div className="divide-y divide-border">
          {/* Plain-English description */}
          {desc && (
            <div className="p-4">
              <p className="text-xs text-text-secondary leading-relaxed">{desc}</p>
            </div>
          )}

          {/* Stats */}
          <div className="p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-text-primary">{nodeData?.files || 0}</p>
                <p className="text-[10px] text-text-tertiary">Files</p>
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{(nodeData?.lines || 0).toLocaleString()}</p>
                <p className="text-[10px] text-text-tertiary">Lines</p>
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{nodeData?.exports || 0}</p>
                <p className="text-[10px] text-text-tertiary">Exports</p>
              </div>
            </div>
          </div>

          {/* File type breakdown */}
          {Object.keys(fileTypeSummary).length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">What's Inside</h4>
              <div className="space-y-1.5">
                {Object.entries(fileTypeSummary)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1 py-0.5 rounded ${kindBadge(type)}`}>{type}</span>
                        <span className="text-xs text-text-secondary">{fileTypeLabel(type)}</span>
                      </div>
                      <span className="text-xs text-text-tertiary">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Key exports */}
          {keyExports.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Key Exports</h4>
              <div className="flex gap-1 flex-wrap">
                {keyExports.map(exp => (
                  <span key={exp} className="text-[10px] font-mono bg-surface-3 text-text-secondary px-1.5 py-0.5 rounded">{exp}</span>
                ))}
              </div>
            </div>
          )}

          {/* Connections — plain English */}
          {(outgoing.length > 0 || incoming.length > 0) && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Connections</h4>
              <div className="space-y-2">
                {outgoing.map(edge => (
                  <div key={edge.id} className="flex items-start gap-2">
                    <span className="text-[10px] text-accent-blue mt-0.5">→</span>
                    <div>
                      <p className="text-xs text-text-secondary">
                        <span className="text-text-primary font-medium">{edge.data?.relationship || edge.data?.label}</span>
                      </p>
                      <p className="text-[10px] text-text-tertiary">{edge.target}</p>
                    </div>
                  </div>
                ))}
                {incoming.map(edge => (
                  <div key={edge.id} className="flex items-start gap-2">
                    <span className="text-[10px] text-accent-purple mt-0.5">←</span>
                    <div>
                      <p className="text-xs text-text-secondary">
                        <span className="text-text-primary font-medium">{edge.source}</span>
                      </p>
                      <p className="text-[10px] text-text-tertiary">{edge.data?.relationship || edge.data?.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External services */}
          {services.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">External Services</h4>
              <div className="flex gap-1 flex-wrap">
                {services.map(svc => (
                  <span key={svc} className="text-[9px] bg-accent-yellow/10 text-accent-yellow px-1.5 py-0.5 rounded capitalize">{svc}</span>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="p-4">
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              Switch to "File Dependencies" view to see the individual files in this module and how they connect.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── External service detail ──
  if (nodeType === 'serviceNode') {
    const serviceName = nodeId.replace('svc:', '');
    const connectedFiles = (connectedEdges || [])
      .filter(e => e.target === nodeId)
      .map(e => e.source);

    return (
      <div className="w-80 border-l border-border bg-surface-1 overflow-y-auto animate-fade-in">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-yellow/15 text-accent-yellow">external service</span>
            <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">Close</button>
          </div>
          <h3 className="text-sm font-semibold capitalize mt-1">{serviceName}</h3>
        </div>
        <div className="divide-y divide-border">
          <div className="p-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              {getServiceDescription(serviceName)}
            </p>
          </div>
          {connectedFiles.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Used By</h4>
              <div className="space-y-1">
                {connectedFiles.map(f => (
                  <p key={f} className="text-xs font-mono text-accent-blue truncate">{f}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-surface-1 overflow-y-auto animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${kindBadge(fileDetail?.type || 'other')}`}>
            {fileDetail?.type || 'file'}
          </span>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">Close</button>
        </div>
        <h3 className="text-sm font-semibold mt-1">{fileDetail?.name || nodeId.split('/').pop()}</h3>
        <p className="text-[10px] font-mono text-text-tertiary mt-0.5 break-all">{nodeId}</p>
      </div>

      {loading ? (
        <div className="p-4 text-xs text-text-tertiary">Loading...</div>
      ) : fileDetail ? (
        <div className="divide-y divide-border">
          {/* Layman description */}
          <div className="p-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              {generateDescription(fileDetail, importedBy, dependsOn)}
            </p>
          </div>

          {/* Stats */}
          <div className="p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-text-primary">{fileDetail.lines}</p>
                <p className="text-[10px] text-text-tertiary">Lines</p>
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{fileDetail.exports.length}</p>
                <p className="text-[10px] text-text-tertiary">Exports</p>
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{importedBy.length}</p>
                <p className="text-[10px] text-text-tertiary">Used By</p>
              </div>
            </div>
          </div>

          {/* Exports */}
          {fileDetail.exports.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Exports</h4>
              <div className="space-y-1">
                {fileDetail.exports.filter(e => e.kind !== 'type').map((exp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[9px] px-1 py-0.5 rounded ${kindBadge(exp.kind)}`}>{exp.kind}</span>
                    <span className="text-xs font-mono text-text-primary">{exp.name}</span>
                    {exp.params && (
                      <span className="text-[9px] text-text-tertiary font-mono truncate max-w-[120px]">{exp.params}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Depends On */}
          {dependsOn.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Depends On ({dependsOn.length})
              </h4>
              <div className="space-y-1.5">
                {dependsOn.map((dep, i) => (
                  <div key={i}>
                    <p className="text-xs font-mono text-accent-blue truncate">{dep.file}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {dep.imports.slice(0, 4).map((imp, j) => (
                        <span key={j} className="text-[9px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{imp}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Imported By */}
          {importedBy.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Imported By ({importedBy.length})
              </h4>
              <div className="space-y-1.5">
                {importedBy.map((dep, i) => (
                  <div key={i}>
                    <p className="text-xs font-mono text-accent-purple truncate">{dep.file}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {dep.imports.slice(0, 4).map((imp, j) => (
                        <span key={j} className="text-[9px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{imp}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External Calls */}
          {fileDetail.externalCalls.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">External Services</h4>
              <div className="space-y-1">
                {fileDetail.externalCalls.map((call, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[9px] bg-accent-yellow/10 text-accent-yellow px-1 py-0.5 rounded capitalize">{call.service}</span>
                    <span className="text-[9px] text-text-tertiary font-mono truncate">{call.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DB Operations */}
          {fileDetail.dbOperations.length > 0 && (
            <div className="p-4">
              <h4 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Database Operations</h4>
              <div className="flex gap-1 flex-wrap">
                {fileDetail.dbOperations.map(op => (
                  <span key={op} className="text-[9px] bg-accent-green/10 text-accent-green px-1.5 py-0.5 rounded font-mono">{op}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-xs text-text-tertiary">No file details available for this node.</div>
      )}
    </div>
  );
}

function generateDescription(
  file: FileDetail,
  importedBy: DependencyInfo[],
  dependsOn: DependencyInfo[],
): string {
  const parts: string[] = [];

  // What is this file?
  const typeNames: Record<string, string> = {
    component: 'React component',
    page: 'page component',
    api_route: 'API route handler',
    hook: 'React hook',
    utility: 'utility module',
    config: 'configuration file',
    schema: 'data schema',
    test: 'test file',
    other: 'module',
  };
  const typeName = typeNames[file.type] || 'module';

  const functions = file.exports.filter(e => e.kind === 'function' || e.kind === 'hook');
  const components = file.exports.filter(e => e.kind === 'component');
  const classes = file.exports.filter(e => e.kind === 'class');

  parts.push(`This ${typeName} is ${file.lines} lines long.`);

  if (components.length > 0) {
    parts.push(`It exports ${components.length} component${components.length > 1 ? 's' : ''}: ${components.map(c => c.name).join(', ')}.`);
  }
  if (functions.length > 0) {
    parts.push(`It has ${functions.length} function${functions.length > 1 ? 's' : ''}: ${functions.slice(0, 4).map(f => f.name).join(', ')}${functions.length > 4 ? '...' : ''}.`);
  }
  if (classes.length > 0) {
    parts.push(`It defines ${classes.length} class${classes.length > 1 ? 'es' : ''}: ${classes.map(c => c.name).join(', ')}.`);
  }

  if (dependsOn.length > 0) {
    parts.push(`It depends on ${dependsOn.length} other file${dependsOn.length > 1 ? 's' : ''}.`);
  }
  if (importedBy.length > 0) {
    parts.push(`It is used by ${importedBy.length} other file${importedBy.length > 1 ? 's' : ''}.`);
  }

  if (file.externalCalls.length > 0) {
    const services = [...new Set(file.externalCalls.map(c => c.service))];
    parts.push(`It calls ${services.length} external service${services.length > 1 ? 's' : ''}: ${services.join(', ')}.`);
  }

  if (file.dbOperations.length > 0) {
    parts.push(`It performs database operations: ${file.dbOperations.join(', ')}.`);
  }

  return parts.join(' ');
}

function kindBadge(kind: string): string {
  const map: Record<string, string> = {
    component: 'bg-accent-purple/15 text-accent-purple',
    hook: 'bg-accent-cyan/15 text-accent-cyan',
    function: 'bg-accent-orange/15 text-accent-orange',
    class: 'bg-accent-red/15 text-accent-red',
    constant: 'bg-surface-4 text-text-secondary',
    api_route: 'bg-accent-blue/15 text-accent-blue',
    page: 'bg-accent-green/15 text-accent-green',
    utility: 'bg-accent-orange/15 text-accent-orange',
    config: 'bg-surface-4 text-text-tertiary',
    schema: 'bg-accent-yellow/15 text-accent-yellow',
    backend: 'bg-accent-blue/15 text-accent-blue',
    frontend: 'bg-accent-purple/15 text-accent-purple',
    integration: 'bg-accent-yellow/15 text-accent-yellow',
    data: 'bg-accent-green/15 text-accent-green',
    shared: 'bg-accent-cyan/15 text-accent-cyan',
    other: 'bg-surface-4 text-text-tertiary',
    default: 'bg-surface-4 text-text-secondary',
  };
  return map[kind] || 'bg-surface-4 text-text-tertiary';
}

function fileTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    component: 'UI Components',
    page: 'Pages / Views',
    api_route: 'API Routes',
    hook: 'React Hooks',
    utility: 'Utilities',
    config: 'Config Files',
    schema: 'Schemas / Types',
    test: 'Tests',
    style: 'Stylesheets',
    other: 'Other',
  };
  return labels[type] || type;
}

function getServiceDescription(service: string): string {
  const descriptions: Record<string, string> = {
    supabase: 'A cloud database and authentication service. This project uses Supabase for data storage, user authentication, or real-time features.',
    openai: 'OpenAI\'s AI models (GPT, DALL-E, etc.). This project uses OpenAI for text generation, analysis, or other AI capabilities.',
    anthropic: 'Anthropic\'s Claude AI models. This project uses Claude for text generation, analysis, or reasoning tasks.',
    github: 'GitHub\'s API for repository management, issue tracking, and code hosting integration.',
    vercel: 'Vercel\'s deployment and hosting platform. This project connects to Vercel for deployments, analytics, or edge functions.',
    sentry: 'An error monitoring and performance tracking service. This project uses Sentry to catch and report bugs in production.',
    helicone: 'An AI observability platform that tracks AI model usage, costs, and performance.',
    deepgram: 'A speech-to-text and audio intelligence service.',
    upstash: 'A serverless Redis and messaging platform for caching and real-time data.',
    cloudflare: 'Cloudflare\'s CDN and edge computing services.',
    aws: 'Amazon Web Services cloud infrastructure.',
  };
  return descriptions[service.toLowerCase()] || `An external service that this project integrates with. Check the Integration settings for configuration.`;
}
