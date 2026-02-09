import { useEffect, useState, useRef } from 'react';
import * as api from '../api/client';
import { setApiOrigin } from '../api/client';
import {
  LayoutDashboard,
  ListTodo,
  Zap,
  CircleDot,
  Lightbulb,
  Code2,
  Clock,
  GitCommitHorizontal,
  FileText,
  BarChart3,
  Settings,
  ChevronDown,
  FolderOpen,
  Shield,
} from 'lucide-react';

type View = 'dashboard' | 'backlog' | 'systems' | 'issues' | 'ideas' | 'codebase' | 'audits' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  connected: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  dataDir: string;
  port?: number;
  lastAccessed: string;
}

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard; shortcut: string; group: 'main' | 'data' | 'config' }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'D', group: 'main' },
  { id: 'backlog', label: 'Roadmap', icon: ListTodo, shortcut: 'B', group: 'main' },
  { id: 'systems', label: 'Systems', icon: Zap, shortcut: 'Y', group: 'main' },
  { id: 'issues', label: 'Issues', icon: CircleDot, shortcut: 'I', group: 'main' },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb, shortcut: 'E', group: 'main' },
  { id: 'codebase', label: 'Codebase', icon: Code2, shortcut: 'X', group: 'main' },
  { id: 'audits', label: 'Audits', icon: Shield, shortcut: 'A', group: 'main' },
  { id: 'sessions', label: 'Sessions', icon: Clock, shortcut: 'S', group: 'data' },
  { id: 'changelog', label: 'Changelog', icon: GitCommitHorizontal, shortcut: 'C', group: 'data' },
  { id: 'docs', label: 'Docs', icon: FileText, shortcut: 'O', group: 'data' },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, shortcut: 'M', group: 'data' },
  { id: 'settings', label: 'Settings', icon: Settings, shortcut: ',', group: 'config' },
];

export function Sidebar({ activeView, onViewChange, connected }: SidebarProps) {
  const [statusLine, setStatusLine] = useState('');
  const [issueCounts, setIssueCounts] = useState({ open: 0, critical: 0 });
  const [projectName, setProjectName] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [switching, setSwitching] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const loadProjectData = () => {
    api.config.quickStatus()
      .then((data: any) => setStatusLine(data?.status_line || ''))
      .catch(() => {});
    api.issues.list({ status: 'open' })
      .then((data: any) => setIssueCounts(data?.counts || { open: 0, critical: 0 }))
      .catch(() => {});
    const origin = localStorage.getItem('devtrack-api-origin') || '';
    fetch(`${origin}/api/v1/project`).then(r => r.json()).then(d => {
      if (d.ok && d.data) {
        setProjectName(d.data.name);
        setCurrentProjectId(d.data.id);
      }
    }).catch(() => {});
    fetch(`${origin}/api/v1/projects`).then(r => r.json()).then(d => {
      if (d.ok && d.data?.projects) setProjects(d.data.projects);
    }).catch(() => {});
  };

  useEffect(() => { loadProjectData(); }, []);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
      }
    };
    if (showProjectPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProjectPicker]);

  const switchProject = async (projectId: string) => {
    if (projectId === currentProjectId || switching) return;
    setSwitching(true);
    try {
      const target = projects.find(p => p.id === projectId);
      if (!target) {
        console.error(`Project "${projectId}" not found in registry`);
        return;
      }

      // Determine the target origin
      // If the target port matches the Vite proxy backend (24680), clear origin to use proxy
      // Otherwise, set the explicit origin for multi-server mode
      const isHomeServer = target.port === 24680;
      const targetOrigin = isHomeServer ? '' : `http://localhost:${target.port}`;
      const healthUrl = isHomeServer
        ? '/api/health'  // Goes through Vite proxy
        : `http://localhost:${target.port}/api/health`;

      try {
        const check = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
        if (check.ok) {
          setApiOrigin(isHomeServer ? null : targetOrigin);
          setShowProjectPicker(false);
          window.location.reload();
          return;
        }
      } catch {
        // Server not running
      }

      // Server is not running — show error
      const portLabel = target.port || 'unknown';
      alert(`Server for "${target.name}" is not running on port ${portLabel}.\n\nStart it from the project directory.`);
    } catch (err) {
      console.error('Switch failed:', err);
    } finally {
      setSwitching(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const item = NAV_ITEMS.find(n => n.shortcut.toLowerCase() === e.key.toLowerCase());
      if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onViewChange(item.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onViewChange]);

  const mainItems = NAV_ITEMS.filter(n => n.group === 'main');
  const dataItems = NAV_ITEMS.filter(n => n.group === 'data');
  const configItems = NAV_ITEMS.filter(n => n.group === 'config');

  const renderNavItem = (item: typeof NAV_ITEMS[0]) => {
    const Icon = item.icon;
    const isActive = activeView === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onViewChange(item.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-[13px] rounded-md transition-colors group ${
          isActive
            ? 'bg-surface-3 text-text-primary font-medium'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
        }`}
      >
        <Icon className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-secondary'}`} strokeWidth={1.75} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.id === 'issues' && issueCounts.open > 0 && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${issueCounts.critical > 0 ? 'bg-accent-red/15 text-accent-red' : 'bg-surface-4 text-text-tertiary'}`}>
            {issueCounts.open}
          </span>
        )}
      </button>
    );
  };

  const hasMultipleProjects = projects.length > 0;

  return (
    <aside className="w-[200px] flex-shrink-0 bg-surface-0 border-r border-border flex flex-col h-screen select-none">
      {/* Brand + Project Switcher */}
      <div className="px-4 pt-4 pb-3 relative" ref={pickerRef}>
        <button
          onClick={() => hasMultipleProjects && setShowProjectPicker(!showProjectPicker)}
          className={`flex items-center gap-2 w-full text-left ${hasMultipleProjects ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
        >
          <div className="w-[18px] h-[18px] rounded bg-accent-blue/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-[11px] h-[11px] text-accent-blue" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            {projectName ? (
              <>
                <span className="font-semibold text-[13px] tracking-tight text-text-primary block truncate">{projectName}</span>
                <span className="text-[9px] text-text-tertiary/50 uppercase tracking-widest">dev-track</span>
              </>
            ) : (
              <span className="font-semibold text-[13px] tracking-tight text-text-primary">dev-track</span>
            )}
          </div>
          {hasMultipleProjects && (
            <ChevronDown className={`w-3 h-3 text-text-tertiary flex-shrink-0 transition-transform ${showProjectPicker ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Project picker dropdown */}
        {showProjectPicker && (
          <div className="absolute left-2 right-2 top-full mt-1 bg-surface-2 border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => switchProject(p.id)}
                disabled={switching}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  p.id === currentProjectId
                    ? 'bg-accent-blue/10 text-accent-blue'
                    : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium block truncate">{p.name}</span>
                  <span className="text-[9px] text-text-tertiary truncate block">{p.path}</span>
                </div>
                {p.id === currentProjectId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue flex-shrink-0" />
                )}
              </button>
            ))}
            {switching && (
              <div className="px-3 py-2 text-[10px] text-text-tertiary text-center">Switching...</div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-status-pass' : 'bg-status-fail'}`} />
          <span className="text-[10px] text-text-tertiary">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-4">
        <div className="space-y-0.5">
          {mainItems.map(renderNavItem)}
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-medium text-text-tertiary/60 uppercase tracking-widest px-3 pb-1">History</p>
          {dataItems.map(renderNavItem)}
        </div>
        <div className="space-y-0.5">
          {configItems.map(renderNavItem)}
        </div>
      </nav>

      {/* Status bar */}
      <div className="px-3 py-3 border-t border-border">
        <p className="text-[10px] text-text-tertiary leading-relaxed line-clamp-3">
          {statusLine || 'Loading...'}
        </p>
      </div>
    </aside>
  );
}
