import { useState, useCallback } from 'react';
import { useWebSocket } from './api/useWebSocket';
import { Sidebar } from './components/Sidebar';
import { ChatSidebar } from './components/ChatSidebar';
import { Dashboard } from './views/Dashboard';
import { Backlog } from './views/Backlog';
import { Actions } from './views/Actions';
import { Issues } from './views/Issues';
import { Sessions } from './views/Sessions';
import { Changelog } from './views/Changelog';
import { Docs } from './views/Docs';
import { Metrics } from './views/Metrics';
import { Settings } from './views/Settings';
import { Ideas } from './views/Ideas';
import { Codebase } from './views/Codebase';
import type { WSEvent } from '@shared/types';

type View = 'dashboard' | 'backlog' | 'actions' | 'issues' | 'ideas' | 'codebase' | 'sessions' | 'changelog' | 'docs' | 'metrics' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(450);

  const handleWSMessage = useCallback((event: WSEvent) => {
    // Trigger re-render of active view on relevant updates
    setRefreshKey(k => k + 1);
  }, []);

  const { connected } = useWebSocket(handleWSMessage);

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard key={refreshKey} />;
      case 'backlog': return <Backlog key={refreshKey} />;
      case 'actions': return <Actions key={refreshKey} />;
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
      <main className="flex-1 overflow-y-auto p-6">
        {renderView()}
      </main>
      <ChatSidebar
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        width={chatWidth}
        onWidthChange={setChatWidth}
      />
    </div>
  );
}
