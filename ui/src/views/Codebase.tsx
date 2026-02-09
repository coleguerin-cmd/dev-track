import { useEffect, useState, useCallback } from 'react';
import { CodebaseGraph } from './CodebaseGraph';

function getBase() { return `${localStorage.getItem('devtrack-api-origin') || ''}/api/v1`; }
const BASE = getBase();
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts });
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.data as T;
}

interface Stats {
  total_files: number; total_lines: number; total_functions: number;
  total_components: number; total_api_routes: number; total_pages: number;
  total_external_services: number; file_types: Record<string, number>;
}

interface FileListItem {
  path: string; name: string; type: string; lines: number;
  exports_count: number; external_calls: number; db_operations: string[];
}

interface ApiRouteItem { path: string; methods: string[]; file: string; }
interface PageItem { path: string; file: string; components: string[]; }
interface ModuleItem { name: string; description: string; files: string[]; exports: { name: string; kind: string; file: string }[]; externalServices: string[]; }
interface ServiceItem { name: string; usage_count: number; files: string[]; }
interface SearchResult { type: string; name: string; detail: string; file: string; line?: number; }

type Tab = 'architecture' | 'overview' | 'files' | 'pages' | 'api' | 'modules' | 'services';

export function Codebase() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('architecture');
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Tab data
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('');
  const [apiRoutes, setApiRoutes] = useState<ApiRouteItem[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ stats: Stats; scanned_at: string } | null>('/codebase/stats').then(d => {
      if (d) { setStats(d.stats); setScannedAt(d.scanned_at); }
    }).catch(() => {});
  }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const d = await apiFetch<{ stats: Stats; scanned_at: string }>('/codebase/scan', { method: 'POST', body: '{}' });
      setStats(d.stats);
      setScannedAt(d.scanned_at);
      loadTabData(tab);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setScanning(false);
    }
  };

  const loadTabData = useCallback((t: Tab) => {
    if (t === 'files') {
      const params = fileTypeFilter ? `?type=${fileTypeFilter}` : '';
      apiFetch<{ files: FileListItem[] }>(`/codebase/files${params}`).then(d => setFiles(d.files)).catch(() => {});
    } else if (t === 'api') {
      apiFetch<{ routes: ApiRouteItem[] }>('/codebase/routes').then(d => setApiRoutes(d.routes)).catch(() => {});
    } else if (t === 'pages') {
      apiFetch<{ pages: PageItem[] }>('/codebase/pages').then(d => setPages(d.pages)).catch(() => {});
    } else if (t === 'modules') {
      apiFetch<{ modules: ModuleItem[] }>('/codebase/modules').then(d => setModules(d.modules)).catch(() => {});
    } else if (t === 'services') {
      apiFetch<{ services: ServiceItem[] }>('/codebase/services').then(d => setServices(d.services)).catch(() => {});
    }
  }, [fileTypeFilter]);

  useEffect(() => { if (stats) loadTabData(tab); }, [tab, stats, loadTabData]);
  useEffect(() => { if (tab === 'files' && stats) loadTabData('files'); }, [fileTypeFilter]);

  // Search
  useEffect(() => {
    if (search.length >= 2) {
      apiFetch<{ results: SearchResult[] }>(`/codebase/search?q=${encodeURIComponent(search)}`).then(d => setSearchResults(d.results)).catch(() => {});
    } else {
      setSearchResults([]);
    }
  }, [search]);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'architecture', label: 'Architecture' },
    { id: 'overview', label: 'Overview' },
    { id: 'files', label: 'Files', count: stats?.total_files },
    { id: 'pages', label: 'Pages', count: stats?.total_pages },
    { id: 'api', label: 'API Routes', count: stats?.total_api_routes },
    { id: 'modules', label: 'Modules' },
    { id: 'services', label: 'External Services', count: stats?.total_external_services },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Codebase Explorer</h1>
          {scannedAt && (
            <p className="text-xs text-text-tertiary mt-0.5">Last scan: {new Date(scannedAt).toLocaleString()}</p>
          )}
        </div>
        <button onClick={scan} disabled={scanning} className="btn-primary">
          {scanning ? 'Scanning...' : 'Scan Project'}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input className="input pl-8" placeholder="Search files, functions, routes, components..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="absolute left-2.5 top-2 text-text-tertiary text-sm">⌕</span>
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 card max-h-72 overflow-y-auto z-50 divide-y divide-border animate-fade-in">
            {searchResults.slice(0, 20).map((r, i) => (
              <div key={i} className="px-3 py-2 hover:bg-surface-3 cursor-pointer flex items-center gap-2">
                <span className={`badge ${kindColor(r.type)}`}>{r.type}</span>
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-2xs text-text-tertiary truncate flex-1">{r.detail}</span>
                {r.line && <span className="text-2xs text-text-tertiary">L{r.line}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs — always visible */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.id ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'
            }`}>
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Architecture tab works without scan data (loads from cache) */}
      {tab === 'architecture' && <CodebaseGraph />}

      {/* Other tabs need scan data */}
      {tab !== 'architecture' && !stats ? (
        <div className="card p-16 text-center">
          <p className="text-lg text-text-secondary mb-2">No scan data</p>
          <p className="text-sm text-text-tertiary mb-4">Scan your project to explore its structure, functions, routes, and dependencies.</p>
          <button onClick={scan} disabled={scanning} className="btn-primary">
            {scanning ? '⟳ Scanning...' : 'Scan Project'}
          </button>
        </div>
      ) : tab !== 'architecture' && stats ? (
        <>
          {tab === 'overview' && <OverviewTab stats={stats} />}
          {tab === 'files' && <FilesTab files={files} filter={fileTypeFilter} onFilterChange={setFileTypeFilter} stats={stats} />}
          {tab === 'pages' && <PagesTab pages={pages} />}
          {tab === 'api' && <ApiTab routes={apiRoutes} />}
          {tab === 'modules' && <ModulesTab modules={modules} expanded={expandedModule} onExpand={setExpandedModule} />}
          {tab === 'services' && <ServicesTab services={services} />}
        </>
      ) : null}
    </div>
  );
}

// ─── Tab Components ─────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      {/* Big numbers */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent-blue">{stats.total_files}</p>
          <p className="text-xs text-text-tertiary">Files</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent-purple">{stats.total_lines.toLocaleString()}</p>
          <p className="text-xs text-text-tertiary">Lines of Code</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent-green">{stats.total_functions}</p>
          <p className="text-xs text-text-tertiary">Functions</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-accent-cyan">{stats.total_components}</p>
          <p className="text-xs text-text-tertiary">Components</p>
        </div>
      </div>

      {/* File type breakdown */}
      <div className="card p-4">
        <h3 className="label mb-3">File Types</h3>
        <div className="space-y-2">
          {Object.entries(stats.file_types).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
            const pct = Math.round((count / stats.total_files) * 100);
            return (
              <div key={type} className="flex items-center gap-3">
                <span className={`badge w-24 justify-center ${kindColor(type)}`}>{type}</span>
                <div className="flex-1 h-4 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue/40 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-text-tertiary w-16 text-right">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Architecture summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="label mb-2">Frontend</h3>
          <p className="text-lg font-bold">{stats.total_pages} pages</p>
          <p className="text-xs text-text-tertiary">{stats.total_components} components</p>
        </div>
        <div className="card p-4">
          <h3 className="label mb-2">Backend</h3>
          <p className="text-lg font-bold">{stats.total_api_routes} API routes</p>
          <p className="text-xs text-text-tertiary">{stats.total_functions} functions</p>
        </div>
        <div className="card p-4">
          <h3 className="label mb-2">Integrations</h3>
          <p className="text-lg font-bold">{stats.total_external_services} services</p>
          <p className="text-xs text-text-tertiary">External APIs & SDKs</p>
        </div>
      </div>
    </div>
  );
}

function FilesTab({ files, filter, onFilterChange, stats }: {
  files: FileListItem[]; filter: string; onFilterChange: (f: string) => void; stats: Stats;
}) {
  return (
    <div>
      <div className="flex gap-1 mb-3">
        <button onClick={() => onFilterChange('')} className={`btn-ghost text-2xs ${!filter ? 'bg-surface-3' : ''}`}>All</button>
        {Object.keys(stats.file_types).sort().map(t => (
          <button key={t} onClick={() => onFilterChange(t)} className={`btn-ghost text-2xs ${filter === t ? 'bg-surface-3' : ''}`}>{t}</button>
        ))}
      </div>
      <div className="card divide-y divide-border max-h-[600px] overflow-y-auto">
        {files.map(f => (
          <div key={f.path} className="px-3 py-2 hover:bg-surface-3 flex items-center gap-3 text-xs">
            <span className={`badge ${kindColor(f.type)}`}>{f.type}</span>
            <span className="font-mono text-text-secondary flex-1 truncate">{f.path}</span>
            <span className="text-text-tertiary">{f.lines}L</span>
            <span className="text-text-tertiary">{f.exports_count} exports</span>
            {f.external_calls > 0 && <span className="text-accent-yellow">{f.external_calls} ext</span>}
            {f.db_operations.length > 0 && <span className="text-accent-blue">{f.db_operations.join(',')}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PagesTab({ pages }: { pages: PageItem[] }) {
  return (
    <div className="card divide-y divide-border">
      {pages.map(p => (
        <div key={p.path} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono font-medium text-accent-blue">{p.path || '/'}</span>
            <span className="text-2xs text-text-tertiary font-mono">{p.file}</span>
          </div>
          {p.components.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {p.components.map(c => (
                <span key={c} className="badge bg-accent-purple/15 text-accent-purple">{c}</span>
              ))}
            </div>
          )}
        </div>
      ))}
      {pages.length === 0 && <p className="text-sm text-text-tertiary py-8 text-center">No pages found</p>}
    </div>
  );
}

function ApiTab({ routes }: { routes: ApiRouteItem[] }) {
  return (
    <div className="card divide-y divide-border">
      {routes.map(r => (
        <div key={r.path} className="px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1">
            {r.methods.map(m => (
              <span key={m} className={`badge ${
                m === 'GET' ? 'bg-status-pass/15 text-status-pass' :
                m === 'POST' ? 'bg-accent-blue/15 text-accent-blue' :
                m === 'PATCH' ? 'bg-accent-yellow/15 text-accent-yellow' :
                m === 'DELETE' ? 'bg-accent-red/15 text-accent-red' :
                'bg-surface-4 text-text-tertiary'
              }`}>{m}</span>
            ))}
          </div>
          <span className="text-sm font-mono font-medium flex-1">{r.path}</span>
          <span className="text-2xs text-text-tertiary font-mono">{r.file}</span>
        </div>
      ))}
      {routes.length === 0 && <p className="text-sm text-text-tertiary py-8 text-center">No API routes found</p>}
    </div>
  );
}

function ModulesTab({ modules, expanded, onExpand }: {
  modules: ModuleItem[]; expanded: string | null; onExpand: (m: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {modules.map(m => (
        <div key={m.name} className="card-hover p-4" onClick={() => onExpand(expanded === m.name ? null : m.name)}>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-semibold">{m.name}</span>
            <span className="text-xs text-text-tertiary">{m.description}</span>
            {m.externalServices.length > 0 && (
              <div className="flex gap-1 ml-auto">
                {m.externalServices.map(s => (
                  <span key={s} className="badge bg-accent-yellow/15 text-accent-yellow">{s}</span>
                ))}
              </div>
            )}
          </div>

          {expanded === m.name && (
            <div className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-in" onClick={e => e.stopPropagation()}>
              <div>
                <p className="label mb-1">Files ({m.files.length})</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {m.files.map(f => (
                    <p key={f} className="text-xs font-mono text-text-tertiary">{f}</p>
                  ))}
                </div>
              </div>
              {m.exports.length > 0 && (
                <div>
                  <p className="label mb-1">Exports ({m.exports.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {m.exports.slice(0, 30).map((e, i) => (
                      <span key={i} className={`badge ${kindColor(e.kind)}`} title={e.file}>
                        {e.name}
                      </span>
                    ))}
                    {m.exports.length > 30 && (
                      <span className="text-2xs text-text-tertiary">+{m.exports.length - 30} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ServicesTab({ services }: { services: ServiceItem[] }) {
  return (
    <div className="space-y-2">
      {services.map(s => (
        <div key={s.name} className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold capitalize">{s.name}</span>
            <span className="badge bg-accent-yellow/15 text-accent-yellow">{s.usage_count} files</span>
          </div>
          <div className="space-y-0.5">
            {s.files.map(f => (
              <p key={f} className="text-xs font-mono text-text-tertiary">{f}</p>
            ))}
          </div>
        </div>
      ))}
      {services.length === 0 && (
        <div className="card p-8 text-center text-text-tertiary">
          <p>No external services detected</p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function kindColor(kind: string): string {
  const map: Record<string, string> = {
    page: 'bg-accent-green/15 text-accent-green',
    api_route: 'bg-accent-blue/15 text-accent-blue',
    component: 'bg-accent-purple/15 text-accent-purple',
    hook: 'bg-accent-cyan/15 text-accent-cyan',
    function: 'bg-accent-orange/15 text-accent-orange',
    utility: 'bg-accent-orange/15 text-accent-orange',
    schema: 'bg-accent-yellow/15 text-accent-yellow',
    config: 'bg-surface-4 text-text-tertiary',
    test: 'bg-surface-4 text-text-tertiary',
    class: 'bg-accent-red/15 text-accent-red',
    constant: 'bg-surface-4 text-text-secondary',
    file: 'bg-surface-4 text-text-secondary',
  };
  return map[kind] || 'bg-surface-4 text-text-tertiary';
}
