import { tokenService } from './token.service';

const CHANNEL_NAME = 'caresync_auth_sync';

/**
 * Cross-tab communication channel for coordinating token rotation,
 * session replication, and multi-tab logout events.
 */
class AuthBroadcast {
  constructor() {
    this.channel = null;
    this.init();
  }

  init() {
    if (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => this.handleMessage(event.data);
      } catch {
        this.channel = null;
      }
    }
  }

  handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'TOKENS_ROTATED':
        if (data.refreshToken) {
          tokenService.setRefreshToken(data.refreshToken);
        }
        if (data.accessToken) {
          tokenService.setAccessToken(data.accessToken);
        }
        if (data.user) {
          tokenService.setUser(data.user);
        }
        window.dispatchEvent(new CustomEvent('auth:tokens-rotated'));
        break;

      case 'SESSION_REQUEST':
        // Another tab opened without tokens in its sessionStorage; reply if this tab has an active session
        try {
          const currentRefresh = tokenService.getRefreshToken();
          const currentUser = tokenService.getUser();
          if (currentRefresh) {
            this.postMessage({
              type: 'SESSION_RESPONSE',
              refreshToken: currentRefresh,
              user: currentUser,
            });
          }
        } catch {
          // ignore storage access errors
        }
        break;

      case 'LOGOUT':
        tokenService.clear();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        break;
    }
  }

  postMessage(msg) {
    try {
      this.channel?.postMessage(msg);
    } catch {
      // BroadcastChannel closed or not supported
    }
  }

  broadcastTokens(accessToken, refreshToken, user) {
    this.postMessage({
      type: 'TOKENS_ROTATED',
      accessToken,
      refreshToken,
      user,
    });
  }

  broadcastLogout() {
    this.postMessage({ type: 'LOGOUT' });
  }

  /**
   * Proactively requests session tokens from any existing open tab.
   * Useful when a user opens CareSync in a new tab where sessionStorage is initially empty.
   *
   * @param {number} timeoutMs Max wait time in ms (default 150ms)
   * @returns {Promise<string|null>} The shared refresh token or null
   */
  async requestSessionFromTabs(timeoutMs = 150) {
    if (!this.channel) return null;

    return new Promise((resolve) => {
      let resolved = false;

      const handler = (event) => {
        if (event.data?.type === 'SESSION_RESPONSE' && event.data.refreshToken) {
          if (!resolved) {
            resolved = true;
            try {
              tokenService.setRefreshToken(event.data.refreshToken);
              if (event.data.user) {
                tokenService.setUser(event.data.user);
              }
            } catch {}
            this.channel?.removeEventListener('message', handler);
            resolve(event.data.refreshToken);
          }
        }
      };

      this.channel.addEventListener('message', handler);
      this.postMessage({ type: 'SESSION_REQUEST' });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.channel?.removeEventListener('message', handler);
          resolve(null);
        }
      }, timeoutMs);
    });
  }
}

export const authBroadcast = new AuthBroadcast();
