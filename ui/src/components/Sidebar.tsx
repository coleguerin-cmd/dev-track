import { useEffect, useState } from 'react';
import * as api from '../api/client';
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
} from 'lucide-react';

type View = 'dashboard' | 'backlog' | 'actions' | 'issues' | 'ideas' | 'codebase' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  connected: boolean;
}

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard; shortcut: string; group: 'main' | 'data' | 'config' }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'D', group: 'main' },
  { id: 'backlog', label: 'Backlog', icon: ListTodo, shortcut: 'B', group: 'main' },
  { id: 'actions', label: 'Actions', icon: Zap, shortcut: 'A', group: 'main' },
  { id: 'issues', label: 'Issues', icon: CircleDot, shortcut: 'I', group: 'main' },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb, shortcut: 'E', group: 'main' },
  { id: 'codebase', label: 'Codebase', icon: Code2, shortcut: 'X', group: 'main' },
  { id: 'sessions', label: 'Sessions', icon: Clock, shortcut: 'S', group: 'data' },
  { id: 'changelog', label: 'Changelog', icon: GitCommitHorizontal, shortcut: 'C', group: 'data' },
  { id: 'docs', label: 'Docs', icon: FileText, shortcut: 'O', group: 'data' },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, shortcut: 'M', group: 'data' },
  { id: 'settings', label: 'Settings', icon: Settings, shortcut: ',', group: 'config' },
];

export function Sidebar({ activeView, onViewChange, connected }: SidebarProps) {
  const [statusLine, setStatusLine] = useState('');
  const [issueCounts, setIssueCounts] = useState({ open: 0, critical: 0 });

  useEffect(() => {
    api.config.quickStatus()
      .then((data: any) => setStatusLine(data?.status_line || ''))
      .catch(() => {});
    api.issues.list({ status: 'open' })
      .then((data: any) => setIssueCounts(data?.counts || { open: 0, critical: 0 }))
      .catch(() => {});
  }, []);

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

  return (
    <aside className="w-[200px] flex-shrink-0 bg-surface-0 border-r border-border flex flex-col h-screen select-none">
      {/* Brand */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-[18px] h-[18px] rounded bg-accent-blue/15 flex items-center justify-center">
            <Zap className="w-[11px] h-[11px] text-accent-blue" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-[13px] tracking-tight text-text-primary">dev-track</span>
        </div>
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
