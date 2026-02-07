import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSEvent } from '../shared/types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`[ws] Client connected (${clients.size} total)`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[ws] Client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err.message);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'file_changed',
      data: { message: 'Connected to dev-track' },
      timestamp: new Date().toISOString(),
    }));
  });

  console.log('[ws] WebSocket server ready at /ws');
}

export function broadcast(event: WSEvent): void {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
