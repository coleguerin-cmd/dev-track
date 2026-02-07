import { useEffect, useState } from 'react';
import * as api from '../api/client';

type View = 'dashboard' | 'backlog' | 'actions' | 'issues' | 'ideas' | 'codebase' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  connected: boolean;
}

const NAV_ITEMS: { id: View; label: string; icon: string; shortcut: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◉', shortcut: 'D' },
  { id: 'backlog', label: 'Backlog', icon: '☰', shortcut: 'B' },
  { id: 'actions', label: 'Actions', icon: '⚡', shortcut: 'A' },
  { id: 'issues', label: 'Issues', icon: '●', shortcut: 'I' },
  { id: 'ideas', label: 'Ideas', icon: '💡', shortcut: 'E' },
  { id: 'codebase', label: 'Codebase', icon: '◈', shortcut: 'X' },
  { id: 'sessions', label: 'Sessions', icon: '◷', shortcut: 'S' },
  { id: 'changelog', label: 'Changelog', icon: '↳', shortcut: 'C' },
  { id: 'docs', label: 'Docs', icon: '◻', shortcut: 'O' },
  { id: 'metrics', label: 'Metrics', icon: '▊', shortcut: 'M' },
  { id: 'settings', label: 'Settings', icon: '⚙', shortcut: ',' },
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

  return (
    <aside className="w-52 flex-shrink-0 bg-surface-0 border-r border-border flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="font-semibold text-sm tracking-tight">dev-track</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-status-pass' : 'bg-status-fail'}`} />
          <span className="text-2xs text-text-tertiary">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
              activeView === item.id
                ? 'bg-surface-3 text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            }`}
          >
            <span className="w-4 text-center text-xs">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'issues' && issueCounts.open > 0 && (
              <span className={`badge ${issueCounts.critical > 0 ? 'bg-accent-red/20 text-accent-red' : 'bg-surface-4 text-text-tertiary'}`}>
                {issueCounts.open}
              </span>
            )}
            <span className="text-2xs text-text-tertiary opacity-0 group-hover:opacity-100">{item.shortcut}</span>
          </button>
        ))}
      </nav>

      {/* Status bar */}
      <div className="px-3 py-3 border-t border-border">
        <p className="text-2xs text-text-tertiary leading-relaxed line-clamp-3">
          {statusLine || 'Loading...'}
        </p>
      </div>
    </aside>
  );
}
