import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSEvent } from '@shared/types';

type WSHandler = (event: WSEvent) => void;

export function useWebSocket(onMessage?: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<WSHandler>>(new Set());

  if (onMessage) handlersRef.current.add(onMessage);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // In dev mode, connect to the API server port
    const port = window.location.port === '24681' ? '24680' : window.location.port;
    const ws = new WebSocket(`${protocol}//${host}:${port}/ws`);

    ws.onopen = () => {
      setConnected(true);
      console.log('[ws] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        for (const handler of handlersRef.current) {
          handler(data);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[ws] Disconnected, reconnecting in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((handler: WSHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  return { connected, subscribe };
}
