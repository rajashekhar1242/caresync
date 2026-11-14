import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tokenService } from '@/services/token.service';
import { QUEUE_KEYS } from './use-queue';
import { APPOINTMENT_KEYS } from './use-appointments';

/**
 * Resolves the target WebSocket URL based on environment configuration or window location.
 * Targets the native /ws endpoint directly without appending /websocket.
 *
 * @param {Object} [env=import.meta.env]
 * @param {Location|Object} [loc=window.location]
 * @returns {string} The resolved ws:// or wss:// URL
 */
export function resolveWebSocketUrl(env = import.meta.env, loc = typeof window !== 'undefined' ? window.location : null) {
  const rawWs = env?.VITE_WS_URL || env?.VITE_WS_BASE_URL;
  const configuredWs = typeof rawWs === 'string' && rawWs.trim().length > 0 ? rawWs.trim() : null;

  if (configuredWs) {
    try {
      // Discard query strings and hash fragments
      let cleaned = configuredWs.split(/[?#]/)[0].trim();
      // Normalize protocol
      let normalized = cleaned.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
      normalized = normalized.replace(/\/+$/, '');
      if (normalized.endsWith('/websocket')) {
        normalized = normalized.replace(/\/websocket$/, '');
      }
      if (!normalized.endsWith('/ws')) {
        normalized = `${normalized}/ws`;
      }
      if (/^wss?:\/\//i.test(normalized)) {
        new URL(normalized); // validate URL shape
        return normalized;
      }
    } catch {
      // Malformed URL, fall through to fallback
    }
  }

  // Derive from VITE_API_BASE_URL (e.g. https://domain.com/api -> wss://domain.com/ws)
  const rawApi = env?.VITE_API_BASE_URL;
  if (typeof rawApi === 'string' && rawApi.trim().length > 0) {
    try {
      const cleanedApi = rawApi.split(/[?#]/)[0].trim();
      if (/^https?:\/\//i.test(cleanedApi)) {
        const apiOrigin = new URL(cleanedApi);
        const wsProto = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProto}//${apiOrigin.host}/ws`;
      }
    } catch {
      // Malformed URL, fall through to fallback
    }
  }

  // Local development / same-origin fallback
  if (loc && typeof loc === 'object') {
    try {
      const isSecure = loc.protocol === 'https:';
      const protocol = isSecure ? 'wss:' : 'ws:';
      const isDev = String(loc.port) === '5173';
      const hostPart = isDev ? `${loc.hostname || 'localhost'}:8080` : (loc.host || 'localhost:8080');
      return `${protocol}//${hostPart}/ws`;
    } catch {
      // Fall through to default
    }
  }

  return 'ws://localhost:8080/ws';
}

/**
 * Robust zero-dependency STOMP-over-WebSocket hook for live doctor queue updates.
 * Spring Boot STOMP destination: `/topic/queue/{doctorId}`
 * Fallback: Invalidates TanStack Query caches whenever a message arrives or sets fallback state.
 *
 * @param {string|null} doctorId - Doctor UUID to monitor
 * @param {Object} [options]
 * @param {Function} [options.onMessage] - Optional custom handler for QueueUpdateMessage
 * @param {boolean} [options.enabled=true] - Whether WebSocket connection is active
 * @returns {{ status: 'IDLE'|'CONNECTING'|'CONNECTED'|'DISCONNECTED'|'ERROR', isConnected: boolean, lastMessage: any, error: any }}
 */
export function useQueueWebSocket(doctorId, options = {}) {
  const { onMessage, enabled = true } = options;
  const queryClient = useQueryClient();

  const [status, setStatus] = React.useState('IDLE');
  const [lastMessage, setLastMessage] = React.useState(null);
  const [error, setError] = React.useState(null);

  const socketRef = React.useRef(null);
  const reconnectTimeoutRef = React.useRef(null);
  const reconnectAttemptsRef = React.useRef(0);
  const activeSubscriptionRef = React.useRef(null);
  const isUnmountedRef = React.useRef(false);

  // Keep latest onMessage in ref
  const onMessageRef = React.useRef(onMessage);
  React.useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  React.useEffect(() => {
    isUnmountedRef.current = false;

    if (!enabled || !doctorId) {
      setStatus('IDLE');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    const connect = () => {
      if (isUnmountedRef.current) return;

      try {
        setStatus('CONNECTING');
        setError(null);

        // Derive ws/wss target: support explicit VITE_WS_URL, derive from VITE_API_BASE_URL, or use same-origin host
        let wsUrl;
        const configuredWs = import.meta.env.VITE_WS_URL || import.meta.env.VITE_WS_BASE_URL;
        if (configuredWs) {
          let normalized = configuredWs.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
          if (normalized.endsWith('/ws')) {
            normalized = `${normalized}/websocket`;
          }
          wsUrl = normalized;
        } else if (import.meta.env.VITE_API_BASE_URL && /^https?:\/\//i.test(import.meta.env.VITE_API_BASE_URL)) {
          const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL);
          const wsProto = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${wsProto}//${apiOrigin.host}/ws/websocket`;
        } else {
          const isSecure = window.location.protocol === 'https:';
          const protocol = isSecure ? 'wss:' : 'ws:';
          // In Vite dev (port 5173), target local backend on 8080; otherwise reuse same-origin host
          const isDev = window.location.port === '5173';
          const hostPart = isDev ? `${window.location.hostname}:8080` : window.location.host;
          wsUrl = `${protocol}//${hostPart}/ws/websocket`;
        }

        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (isUnmountedRef.current) {
            ws.close();
            return;
          }
          // Send authenticated STOMP CONNECT frame
          const token = tokenService.getAccessToken();
          const authHeader = token ? `Authorization:Bearer ${token}\n` : '';
          const connectFrame = `CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n${authHeader}\n\0`;
          ws.send(connectFrame);
        };

        ws.onmessage = (event) => {
          if (isUnmountedRef.current) return;

          const rawData = String(event.data);

          // Handle STOMP CONNECTED
          if (rawData.startsWith('CONNECTED')) {
            setStatus('CONNECTED');
            reconnectAttemptsRef.current = 0;

            // Subscribe to doctor's queue topic
            const subId = `sub-queue-${doctorId}`;
            activeSubscriptionRef.current = subId;
            const subFrame = `SUBSCRIBE\nid:${subId}\ndestination:/topic/queue/${doctorId}\n\n\0`;
            ws.send(subFrame);
            return;
          }

          // Handle STOMP MESSAGE
          if (rawData.startsWith('MESSAGE')) {
            try {
              // Extract body after double newline
              const bodyStartIndex = rawData.indexOf('\n\n');
              if (bodyStartIndex !== -1) {
                const bodyWithNull = rawData.slice(bodyStartIndex + 2);
                const nullIndex = bodyWithNull.indexOf('\0');
                const jsonText = nullIndex !== -1 ? bodyWithNull.slice(0, nullIndex) : bodyWithNull;
                if (jsonText.trim()) {
                  const parsed = JSON.parse(jsonText.trim());
                  setLastMessage(parsed);

                  // Invalidate related TanStack queries automatically
                  queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.doctor(doctorId) });
                  queryClient.invalidateQueries({ queryKey: QUEUE_KEYS.board(parsed.clinicId) });
                  queryClient.invalidateQueries({ queryKey: APPOINTMENT_KEYS.all });

                  if (onMessageRef.current) {
                    onMessageRef.current(parsed);
                  }
                }
              }
            } catch (err) {
              console.warn('[QueueWebSocket] Failed to parse message body:', err);
            }
          }
        };

        ws.onerror = (evt) => {
          if (isUnmountedRef.current) return;
          console.warn('[QueueWebSocket] Connection error');
          setStatus('ERROR');
          setError(evt);
        };

        ws.onclose = () => {
          if (isUnmountedRef.current) return;
          setStatus('DISCONNECTED');
          socketRef.current = null;

          // Exponential backoff reconnect: 2s, 4s, 8s, up to 30s
          const attempts = reconnectAttemptsRef.current;
          const delay = Math.min(1000 * Math.pow(2, attempts) + Math.random() * 1000, 30000);
          reconnectAttemptsRef.current = attempts + 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        };
      } catch (err) {
        setStatus('ERROR');
        setError(err);
      }
    };

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        try {
          if (activeSubscriptionRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(`UNSUBSCRIBE\nid:${activeSubscriptionRef.current}\n\n\0`);
            socketRef.current.send('DISCONNECT\n\n\0');
          }
          socketRef.current.close();
        } catch {
          // ignore cleanup errors
        }
        socketRef.current = null;
      }
    };
  }, [doctorId, enabled, queryClient]);

  return {
    status,
    isConnected: status === 'CONNECTED',
    lastMessage,
    error,
  };
}
