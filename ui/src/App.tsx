import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from './api/useWebSocket';
import { Sidebar } from './components/Sidebar';
import { ChatSidebar } from './components/ChatSidebar';
import { ToastContainer, NotificationBell, wsEventToNotification, type Notification } from './components/NotificationTray';
import { Dashboard } from './views/Dashboard';
import { Backlog } from './views/Backlog';
import { Systems } from './views/Systems';
import { Issues } from './views/Issues';
import { Sessions } from './views/Sessions';
import { Changelog } from './views/Changelog';
import { Docs } from './views/Docs';
import { Metrics } from './views/Metrics';
import { Settings } from './views/Settings';
import { Ideas } from './views/Ideas';
import { Codebase } from './views/Codebase';
import { Audits } from './views/Audits';
import type { WSEvent } from '@shared/types';

type View = 'dashboard' | 'backlog' | 'systems' | 'issues' | 'ideas' | 'codebase' | 'audits' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

const VALID_VIEWS = new Set<View>(['dashboard', 'backlog', 'systems', 'issues', 'ideas', 'codebase', 'audits', 'sessions', 'changelog', 'docs', 'metrics', 'settings']);

export default function App() {
  const [view, setViewState] = useState<View>(() => {
    try { const v = localStorage.getItem('dt-active-view') as View; if (v && VALID_VIEWS.has(v)) return v; } catch {}
    return 'dashboard';
  });
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem('dt-active-view', v); } catch {}
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(450);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const lastEventRef = useRef<string>('');

  const handleWSMessage = useCallback((event: WSEvent) => {
    // NOTE: We intentionally do NOT increment refreshKey on every WS event.
    // The old approach (setRefreshKey(k => k + 1)) caused React to unmount/remount
    // the entire active view on every file change, destroying internal state like
    // Settings tab position, scroll position, expanded items, etc. (ISS-039)
    //
    // Views that need live data should use their own polling or WS subscriptions.
    // The refreshKey is only used for explicit user-triggered refreshes if needed.

    // Convert WS event to notification (dedupe rapid-fire events)
    const notif = wsEventToNotification(event);
    if (notif) {
      // Simple dedupe: skip if same title within 2 seconds
      const key = `${notif.type}:${notif.title}`;
      if (key === lastEventRef.current) return;
      lastEventRef.current = key;
      setTimeout(() => { if (lastEventRef.current === key) lastEventRef.current = ''; }, 2000);

      setNotifications(prev => [notif, ...prev].slice(0, 50));
      setToasts(prev => [...prev, notif].slice(-3)); // Max 3 toasts
    }
  }, []);

  const { connected } = useWebSocket(handleWSMessage);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard />;
      case 'backlog': return <Backlog />;
      case 'systems': return <Systems />;
      case 'issues': return <Issues />;
      case 'ideas': return <Ideas />;
      case 'codebase': return <Codebase />;
      case 'audits': return <Audits />;
      case 'sessions': return <Sessions />;
      case 'changelog': return <Changelog />;
      case 'docs': return <Docs />;
      case 'metrics': return <Metrics />;
      case 'settings': return <Settings />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={view} onViewChange={setView} connected={connected} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-10 flex-shrink-0 border-b border-border flex items-center justify-end px-4 gap-2 bg-surface-0">
          <NotificationBell
            notifications={notifications}
            onMarkRead={markRead}
            onClearAll={clearAll}
          />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {renderView()}
        </main>
      </div>
      <ChatSidebar
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        width={chatWidth}
        onWidthChange={setChatWidth}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
