'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type MessageCallback = (data: unknown) => void;
type ReconnectCallback = () => void;

interface WebSocketContextValue {
  subscribe: (channel: string, callback: MessageCallback) => void;
  unsubscribe: (channel: string, callback: MessageCallback) => void;
  send: (msg: Record<string, unknown>) => void;
  onReconnect: (cb: ReconnectCallback) => void;
  offReconnect: (cb: ReconnectCallback) => void;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const callbacksRef = useRef(new Map<string, Set<MessageCallback>>());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const lastMessageRef = useRef<number>(Date.now());
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasConnectedRef = useRef(false);
  const reconnectCallbacksRef = useRef(new Set<ReconnectCallback>());

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      lastMessageRef.current = Date.now();

      // Resubscribe to all active channels
      for (const channel of callbacksRef.current.keys()) {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      }

      // Fire reconnect callbacks (skip first connect)
      if (hasConnectedRef.current) {
        reconnectCallbacksRef.current.forEach((cb) => cb());
      }
      hasConnectedRef.current = true;

      // Start stale message check (server broadcasts overview every 5s, so 45s silence = stale)
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
      staleCheckRef.current = setInterval(() => {
        if (Date.now() - lastMessageRef.current > 45_000) {
          ws.close();
        }
      }, 10_000);
    };

    ws.onmessage = (event) => {
      lastMessageRef.current = Date.now();
      try {
        const msg = JSON.parse(event.data);
        // Route to channel callbacks
        // For overview messages
        if (msg.type === 'overview') {
          const cbs = callbacksRef.current.get('overview');
          cbs?.forEach((cb) => cb(msg));
        }
        // For stats messages (server:{id}:stats)
        if (msg.type === 'stats' && msg.serverId) {
          const channel = `server:${msg.serverId}:stats`;
          const cbs = callbacksRef.current.get(channel);
          cbs?.forEach((cb) => cb(msg));
        }
        // For traffic messages (server:{id}:traffic)
        if (msg.type === 'traffic' && msg.serverId) {
          const channel = `server:${msg.serverId}:traffic`;
          const cbs = callbacksRef.current.get(channel);
          cbs?.forEach((cb) => cb(msg));
        }
        // For hotspot messages (server:{id}:hotspot)
        if (msg.type === 'hotspot' && msg.serverId) {
          const channel = `server:${msg.serverId}:hotspot`;
          const cbs = callbacksRef.current.get(channel);
          cbs?.forEach((cb) => cb(msg));
        }
        // For network messages (server:{id}:network)
        if (msg.type === 'network' && msg.serverId) {
          const channel = `server:${msg.serverId}:network`;
          const cbs = callbacksRef.current.get(channel);
          cbs?.forEach((cb) => cb(msg));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;
      if (staleCheckRef.current) {
        clearInterval(staleCheckRef.current);
        staleCheckRef.current = null;
      }

      // Reconnect with backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
      reconnectAttemptRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const subscribe = useCallback((channel: string, callback: MessageCallback) => {
    let cbs = callbacksRef.current.get(channel);
    if (!cbs) {
      cbs = new Set();
      callbacksRef.current.set(channel, cbs);
      // Send subscribe message
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    }
    cbs.add(callback);
  }, []);

  const unsubscribe = useCallback((channel: string, callback: MessageCallback) => {
    const cbs = callbacksRef.current.get(channel);
    if (!cbs) return;
    cbs.delete(callback);
    if (cbs.size === 0) {
      callbacksRef.current.delete(channel);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }));
      }
    }
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const onReconnect = useCallback((cb: ReconnectCallback) => {
    reconnectCallbacksRef.current.add(cb);
  }, []);

  const offReconnect = useCallback((cb: ReconnectCallback) => {
    reconnectCallbacksRef.current.delete(cb);
  }, []);

  return (
    <WebSocketContext.Provider value={{ subscribe, unsubscribe, send, onReconnect, offReconnect, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
