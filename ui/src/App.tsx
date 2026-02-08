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
import type { WSEvent } from '@shared/types';

type View = 'dashboard' | 'backlog' | 'systems' | 'issues' | 'ideas' | 'codebase' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(450);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const lastEventRef = useRef<string>('');

  const handleWSMessage = useCallback((event: WSEvent) => {
    // Trigger re-render of active view on relevant updates
    setRefreshKey(k => k + 1);

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
      case 'dashboard': return <Dashboard key={refreshKey} />;
      case 'backlog': return <Backlog key={refreshKey} />;
      case 'systems': return <Systems key={refreshKey} />;
      case 'issues': return <Issues key={refreshKey} />;
      case 'ideas': return <Ideas key={refreshKey} />;
      case 'codebase': return <Codebase key={refreshKey} />;
      case 'sessions': return <Sessions key={refreshKey} />;
      case 'changelog': return <Changelog key={refreshKey} />;
      case 'docs': return <Docs key={refreshKey} />;
      case 'metrics': return <Metrics key={refreshKey} />;
      case 'settings': return <Settings key={refreshKey} />;
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
