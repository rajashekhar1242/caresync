import { describe, it, expect } from 'vitest';
import { normalizeApiBaseUrl } from '@/services/api';
import { resolveWebSocketUrl } from '@/hooks/use-queue-websocket';

describe('Environment Configuration Normalization', () => {
  describe('normalizeApiBaseUrl', () => {
    it('defaults to /api when input is missing or empty', () => {
      expect(normalizeApiBaseUrl()).toBe('/api');
      expect(normalizeApiBaseUrl(null)).toBe('/api');
      expect(normalizeApiBaseUrl('')).toBe('/api');
      expect(normalizeApiBaseUrl('   ')).toBe('/api');
    });

    it('strips trailing slashes and ensures /api suffix', () => {
      expect(normalizeApiBaseUrl('https://caresync-api.onrender.com')).toBe(
        'https://caresync-api.onrender.com/api'
      );
      expect(normalizeApiBaseUrl('https://caresync-api.onrender.com/')).toBe(
        'https://caresync-api.onrender.com/api'
      );
      expect(normalizeApiBaseUrl('https://caresync-api.onrender.com///')).toBe(
        'https://caresync-api.onrender.com/api'
      );
    });

    it('avoids duplicating /api if already present', () => {
      expect(normalizeApiBaseUrl('https://caresync-api.onrender.com/api')).toBe(
        'https://caresync-api.onrender.com/api'
      );
      expect(normalizeApiBaseUrl('https://caresync-api.onrender.com/api/')).toBe(
        'https://caresync-api.onrender.com/api'
      );
      expect(normalizeApiBaseUrl('/api')).toBe('/api');
      expect(normalizeApiBaseUrl('/api/')).toBe('/api');
    });

    // Workstream B Edge Case 1: Custom base path preservation
    it('preserves configured custom base paths while appending /api suffix', () => {
      expect(normalizeApiBaseUrl('https://example.com/backend')).toBe(
        'https://example.com/backend/api'
      );
      expect(normalizeApiBaseUrl('https://example.com/backend/')).toBe(
        'https://example.com/backend/api'
      );
      expect(normalizeApiBaseUrl('https://example.com/custom/path')).toBe(
        'https://example.com/custom/path/api'
      );
      expect(normalizeApiBaseUrl('/backend')).toBe('/backend/api');
    });

    // Workstream B Edge Case 2: Duplicate API prefix collapsing
    it('collapses accidental duplicate trailing /api/api prefixes to single /api', () => {
      expect(normalizeApiBaseUrl('https://example.com/api/api')).toBe(
        'https://example.com/api'
      );
      expect(normalizeApiBaseUrl('https://example.com/api/api/')).toBe(
        'https://example.com/api'
      );
      expect(normalizeApiBaseUrl('/api/api')).toBe('/api');
      expect(normalizeApiBaseUrl('https://example.com/backend/api/api')).toBe(
        'https://example.com/backend/api'
      );
    });

    // Workstream B Edge Case 6: Query strings and fragments
    it('discards query strings and hash fragments from API URL', () => {
      expect(normalizeApiBaseUrl('https://example.com/api?debug=true#section')).toBe(
        'https://example.com/api'
      );
      expect(normalizeApiBaseUrl('https://example.com/backend?token=123')).toBe(
        'https://example.com/backend/api'
      );
    });
  });

  describe('resolveWebSocketUrl', () => {
    it('uses explicit VITE_WS_URL and normalizes to /ws without /websocket', () => {
      const env = { VITE_WS_URL: 'wss://caresync-api.onrender.com/ws' };
      expect(resolveWebSocketUrl(env)).toBe('wss://caresync-api.onrender.com/ws');
    });

    it('strips trailing /websocket from explicit VITE_WS_URL', () => {
      const env = { VITE_WS_URL: 'wss://caresync-api.onrender.com/ws/websocket' };
      expect(resolveWebSocketUrl(env)).toBe('wss://caresync-api.onrender.com/ws');
    });

    it('converts http/https to ws/wss for configured VITE_WS_URL', () => {
      const env = { VITE_WS_URL: 'https://caresync-api.onrender.com' };
      expect(resolveWebSocketUrl(env)).toBe('wss://caresync-api.onrender.com/ws');

      const envHttp = { VITE_WS_URL: 'http://localhost:8080' };
      expect(resolveWebSocketUrl(envHttp)).toBe('ws://localhost:8080/ws');
    });

    it('derives ws URL from VITE_API_BASE_URL when VITE_WS_URL is absent', () => {
      const envHttps = { VITE_API_BASE_URL: 'https://caresync-api.onrender.com/api' };
      expect(resolveWebSocketUrl(envHttps)).toBe('wss://caresync-api.onrender.com/ws');

      const envHttp = { VITE_API_BASE_URL: 'http://localhost:8080/api' };
      expect(resolveWebSocketUrl(envHttp)).toBe('ws://localhost:8080/ws');
    });

    it('falls back to window.location host or 8080 dev port when env variables are unset', () => {
      // Dev server on port 5173
      const devLoc = {
        protocol: 'http:',
        hostname: 'localhost',
        port: '5173',
        host: 'localhost:5173',
      };
      expect(resolveWebSocketUrl({}, devLoc)).toBe('ws://localhost:8080/ws');

      // Production same-origin preview
      const prodLoc = {
        protocol: 'https:',
        hostname: 'caresync.example.com',
        port: '443',
        host: 'caresync.example.com',
      };
      expect(resolveWebSocketUrl({}, prodLoc)).toBe('wss://caresync.example.com/ws');
    });

    // Workstream B Edge Case 3: Explicit WebSocket schemes preserved
    it('preserves explicit ws:// and wss:// schemes without alteration', () => {
      expect(resolveWebSocketUrl({ VITE_WS_URL: 'ws://localhost:8080/ws' })).toBe(
        'ws://localhost:8080/ws'
      );
      expect(resolveWebSocketUrl({ VITE_WS_URL: 'wss://example.com/ws' })).toBe(
        'wss://example.com/ws'
      );
    });

    // Workstream B Edge Case 4: Whitespace and empty WebSocket configuration
    it('falls back to VITE_API_BASE_URL or location when VITE_WS_URL is empty or whitespace', () => {
      const envWhitespace = {
        VITE_WS_URL: '   ',
        VITE_API_BASE_URL: 'https://caresync-api.onrender.com/api',
      };
      expect(resolveWebSocketUrl(envWhitespace)).toBe(
        'wss://caresync-api.onrender.com/ws'
      );

      const envEmpty = {
        VITE_WS_URL: '',
        VITE_API_BASE_URL: 'https://caresync-api.onrender.com/api',
      };
      expect(resolveWebSocketUrl(envEmpty)).toBe(
        'wss://caresync-api.onrender.com/ws'
      );

      const devLoc = { protocol: 'http:', hostname: 'localhost', port: '5173' };
      expect(resolveWebSocketUrl({ VITE_WS_URL: '   ' }, devLoc)).toBe(
        'ws://localhost:8080/ws'
      );
    });

    // Workstream B Edge Case 5: Trailing paths and multiple slashes
    it('normalizes multiple trailing slashes into clean /ws endpoint', () => {
      expect(resolveWebSocketUrl({ VITE_WS_URL: 'ws://localhost:8080///' })).toBe(
        'ws://localhost:8080/ws'
      );
      expect(resolveWebSocketUrl({ VITE_WS_URL: 'ws://localhost:8080/ws///' })).toBe(
        'ws://localhost:8080/ws'
      );
      expect(resolveWebSocketUrl({ VITE_WS_URL: 'wss://example.com/ws/websocket///' })).toBe(
        'wss://example.com/ws'
      );
    });

    // Workstream B Edge Case 6: Query strings and fragments
    it('strips query strings and hash fragments preventing malformed WebSocket URLs', () => {
      expect(
        resolveWebSocketUrl({ VITE_WS_URL: 'wss://example.com/ws?token=xyz#live' })
      ).toBe('wss://example.com/ws');

      expect(
        resolveWebSocketUrl({ VITE_WS_URL: 'wss://example.com/?token=xyz' })
      ).toBe('wss://example.com/ws');

      expect(
        resolveWebSocketUrl({
          VITE_API_BASE_URL: 'https://example.com/api?debug=true#top',
        })
      ).toBe('wss://example.com/ws');
    });

    // Workstream B Edge Case 7: Invalid URL handling
    it('safely catches malformed URLs and falls back predictably', () => {
      const fallbackLoc = { protocol: 'https:', host: 'fallback.example.com' };

      // Malformed VITE_WS_URL falls through to VITE_API_BASE_URL
      expect(
        resolveWebSocketUrl({
          VITE_WS_URL: '://malformed-url',
          VITE_API_BASE_URL: 'https://fallback-api.onrender.com/api',
        })
      ).toBe('wss://fallback-api.onrender.com/ws');

      // Malformed VITE_API_BASE_URL falls through to location fallback
      expect(
        resolveWebSocketUrl(
          { VITE_API_BASE_URL: 'http://:invalid' },
          fallbackLoc
        )
      ).toBe('wss://fallback.example.com/ws');

      // Malformed VITE_WS_URL with no valid env falls back to default localhost:8080
      expect(resolveWebSocketUrl({ VITE_WS_URL: '://malformed' }, null)).toBe(
        'ws://localhost:8080/ws'
      );
    });
  });
});
