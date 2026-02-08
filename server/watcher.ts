import chokidar from 'chokidar';
import path from 'path';
import { getStore } from './store.js';
import { broadcast } from './ws.js';
import { getDataDir } from './project-config.js';
import { getAutomationEngine } from './automation/engine.js';
import type { WSEvent } from '../shared/types.js';

let _watcher: chokidar.FSWatcher | null = null;

export function startWatcher(): void {
  // Close existing watcher if restarting (e.g., project switch)
  if (_watcher) {
    _watcher.close().catch(() => {});
    _watcher = null;
  }

  const DATA_DIR = getDataDir();
  _watcher = chokidar.watch(DATA_DIR, {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  _watcher.on('change', (filePath: string) => {
    const relative = path.relative(DATA_DIR, filePath).replace(/\\/g, '/');
    const store = getStore();

    // Skip if this was our own write (debounce echo)
    if (store.isRecentWrite(relative)) return;

    console.log(`[watcher] File changed: ${relative}`);
    store.reloadFile(relative);

    // Determine event type from file path
    const eventType = getEventType(relative);
    if (eventType) {
      const event: WSEvent = {
        type: eventType,
        data: { file: relative },
        timestamp: new Date().toISOString(),
      };
      broadcast(event);

      // Fire automation trigger (non-blocking)
      getAutomationEngine().fire({ trigger: 'file_changed', data: { file: relative, event_type: eventType } }).catch(() => {});
    }
  });

  _watcher.on('add', (filePath: string) => {
    const relative = path.relative(DATA_DIR, filePath).replace(/\\/g, '/');
    const store = getStore();
    if (store.isRecentWrite(relative)) return;

    console.log(`[watcher] File added: ${relative}`);
    store.reloadFile(relative);

    const event: WSEvent = {
      type: 'file_changed',
      data: { file: relative, action: 'added' },
      timestamp: new Date().toISOString(),
    };
    broadcast(event);
  });

  console.log(`[watcher] Watching ${DATA_DIR}`);
}

function getEventType(relativePath: string): WSEvent['type'] | null {
  if (relativePath === 'state.json') return 'system_updated';
  if (relativePath.startsWith('roadmap/items')) return 'roadmap_updated';
  if (relativePath.startsWith('backlog/')) return 'roadmap_updated';
  if (relativePath.startsWith('roadmap/epics')) return 'epic_updated';
  if (relativePath.startsWith('roadmap/milestones')) return 'milestone_updated';
  if (relativePath.startsWith('releases/')) return 'release_updated';
  if (relativePath.startsWith('systems/')) return 'system_updated';
  if (relativePath.startsWith('session/')) return 'session_updated';
  if (relativePath.startsWith('issues/')) return 'issue_updated';
  if (relativePath.startsWith('changelog/')) return 'changelog_updated';
  if (relativePath.startsWith('ideas/')) return 'idea_updated';
  if (relativePath.startsWith('labels/')) return 'label_updated';
  if (relativePath.startsWith('automations/')) return 'automation_updated';
  if (relativePath.startsWith('activity/')) return 'activity_event';
  if (relativePath === 'config.json') return 'settings_changed';
  return 'file_changed';
}
