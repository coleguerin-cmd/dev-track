import chokidar from 'chokidar';
import path from 'path';
import { getStore } from './store.js';
import { broadcast } from './ws.js';
import type { WSEvent } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export function startWatcher(): void {
  const watcher = chokidar.watch(DATA_DIR, {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('change', (filePath: string) => {
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
    }
  });

  watcher.on('add', (filePath: string) => {
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
  if (relativePath === 'state.json') return 'state_updated';
  if (relativePath.startsWith('backlog/')) return 'backlog_updated';
  if (relativePath.startsWith('session/')) return 'session_updated';
  if (relativePath.startsWith('issues/')) return 'issue_updated';
  if (relativePath.startsWith('changelog/')) return 'changelog_updated';
  if (relativePath.startsWith('actions/')) return 'action_health_changed';
  if (relativePath.startsWith('runs/')) return 'run_completed';
  if (relativePath === 'config.json') return 'settings_changed';
  return 'file_changed';
}
