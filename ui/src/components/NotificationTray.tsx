/**
 * Notification Tray — Toast notifications for real-time DevTrack events.
 * Shows brief toasts at bottom-left, with a notification panel accessible from header.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  X,
  CircleDot,
  ListTodo,
  GitCommitHorizontal,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'issue' | 'backlog' | 'changelog' | 'idea' | 'brain_note' | 'session' | 'ai';
  title: string;
  detail?: string;
  timestamp: string;
  read: boolean;
}

// ─── Toast Manager ──────────────────────────────────────────────────────────

interface ToastProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

function Toast({ notification, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3 shadow-lg animate-slide-in flex items-start gap-2.5 max-w-sm">
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary leading-tight">{notification.title}</p>
        {notification.detail && (
          <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{notification.detail}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="text-text-tertiary hover:text-text-secondary p-0.5 flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Toast Container ────────────────────────────────────────────────────────

export function ToastContainer({ toasts, onDismiss }: { toasts: Notification[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 left-56 z-50 space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast notification={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// ─── Notification Bell + Panel ──────────────────────────────────────────────

interface NotificationBellProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationBell({ notifications, onMarkRead, onClearAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-text-tertiary hover:text-text-secondary transition-colors rounded hover:bg-surface-2"
      >
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-blue text-white text-[8px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-1 w-80 bg-surface-2 border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">Notifications</span>
              {notifications.length > 0 && (
                <button onClick={onClearAll} className="text-[10px] text-text-tertiary hover:text-text-secondary">
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell className="w-5 h-5 text-text-tertiary mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-text-tertiary">No notifications</p>
                </div>
              ) : (
                notifications.slice(0, 20).map(n => (
                  <div
                    key={n.id}
                    onClick={() => onMarkRead(n.id)}
                    className={`px-3 py-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-surface-3 transition-colors ${
                      !n.read ? 'bg-surface-3/50' : ''
                    }`}
                  >
                    <NotificationIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-tight ${!n.read ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                        {n.title}
                      </p>
                      {n.detail && <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{n.detail}</p>}
                      <p className="text-[9px] text-text-tertiary mt-0.5">{formatNotificationTime(n.timestamp)}</p>
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1 flex-shrink-0" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function NotificationIcon({ type }: { type: string }) {
  const cls = 'w-3.5 h-3.5 mt-0.5 flex-shrink-0';
  switch (type) {
    case 'issue': return <CircleDot className={`${cls} text-accent-red`} strokeWidth={2} />;
    case 'backlog': return <ListTodo className={`${cls} text-accent-blue`} strokeWidth={2} />;
    case 'changelog': return <GitCommitHorizontal className={`${cls} text-status-pass`} strokeWidth={2} />;
    case 'idea': return <Lightbulb className={`${cls} text-accent-yellow`} strokeWidth={2} />;
    case 'brain_note': return <Sparkles className={`${cls} text-accent-purple`} strokeWidth={2} />;
    case 'session': return <CheckCircle2 className={`${cls} text-accent-cyan`} strokeWidth={2} />;
    case 'ai': return <MessageSquare className={`${cls} text-accent-blue`} strokeWidth={2} />;
    default: return <AlertTriangle className={`${cls} text-text-tertiary`} strokeWidth={2} />;
  }
}

// Map WS events to notification types (v2 event types)
export function wsEventToNotification(event: any): Notification | null {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = event.timestamp || new Date().toISOString();

  // Handle direct event types (v2)
  switch (event.type) {
    case 'issue_created':
    case 'issue_updated':
    case 'issue_resolved':
      return { id, type: 'issue', title: `Issue ${event.type.split('_')[1]}`, detail: event.data?.title, timestamp, read: false };
    case 'roadmap_updated':
      return { id, type: 'backlog', title: `Roadmap updated`, detail: event.data?.title, timestamp, read: false };
    case 'epic_updated':
      return { id, type: 'backlog', title: `Epic updated`, detail: event.data?.title, timestamp, read: false };
    case 'milestone_updated':
      return { id, type: 'backlog', title: `Milestone updated`, detail: event.data?.title, timestamp, read: false };
    case 'changelog_updated':
      return { id, type: 'changelog', title: `New changelog entry`, detail: event.data?.title, timestamp, read: false };
    case 'idea_updated':
      return { id, type: 'idea', title: `Idea updated`, detail: event.data?.title, timestamp, read: false };
    case 'session_updated':
      return { id, type: 'session', title: `Session updated`, timestamp, read: false };
    case 'system_updated':
      return { id, type: 'brain_note', title: `System health changed`, detail: event.data?.name, timestamp, read: false };
    case 'release_updated':
      return { id, type: 'changelog', title: `Release updated`, detail: event.data?.title, timestamp, read: false };
    case 'activity_event':
      return { id, type: 'brain_note', title: `Activity`, detail: event.data?.title, timestamp, read: false };
    case 'file_changed': {
      // Legacy file_changed events with nested data types
      const dataType = event.data?.type;
      if (dataType === 'brain_note') {
        return { id, type: 'brain_note', title: `AI brain note`, detail: event.data.note?.title, timestamp, read: false };
      }
      return null;
    }
    default:
      return null;
  }
}

function formatNotificationTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
