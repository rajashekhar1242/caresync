import { STORAGE_KEYS } from '@/constants';

/**
 * Service for managing authentication tokens and user session.
 *
 * Security Design:
 * - Access Token: Kept strictly in JavaScript memory to protect against persistent XSS extraction.
 * - Refresh Token: Stored in sessionStorage to survive page reloads within an active browser tab.
 * - LocalStorage is deliberately NOT used for JWT tokens to mitigate long-term credential leakage.
 */
class TokenService {
  constructor() {
    this.inMemoryAccessToken = null;
    this.inMemoryUser = null;
  }

  /**
   * Retrieves the access token from JavaScript memory.
   * @returns {string|null}
   */
  getAccessToken() {
    return this.inMemoryAccessToken;
  }

  /**
   * Sets the in-memory access token.
   * @param {string|null} token
   */
  setAccessToken(token) {
    this.inMemoryAccessToken = token || null;
  }

  /**
   * Retrieves the refresh token from sessionStorage.
   * @returns {string|null}
   */
  getRefreshToken() {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    } catch {
      return null;
    }
  }

  /**
   * Stores the refresh token in sessionStorage.
   * @param {string} token
   */
  setRefreshToken(token) {
    if (!token) {
      this.removeRefreshToken();
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
    } catch (e) {
      console.warn('Unable to persist refresh token to sessionStorage:', e);
    }
  }

  /**
   * Removes the refresh token from sessionStorage.
   */
  removeRefreshToken() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    } catch (e) {
      console.warn('Unable to remove refresh token from sessionStorage:', e);
    }
  }

  /**
   * Sets both access token (in memory) and refresh token (in sessionStorage).
   * @param {string} accessToken
   * @param {string} refreshToken
   */
  setTokens(accessToken, refreshToken) {
    this.setAccessToken(accessToken);
    this.setRefreshToken(refreshToken);
  }

  /**
   * Retrieves the current user profile from memory or sessionStorage fallback.
   * @returns {Object|null}
   */
  getUser() {
    if (this.inMemoryUser) return this.inMemoryUser;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.USER);
      if (raw) {
        this.inMemoryUser = JSON.parse(raw);
        return this.inMemoryUser;
      }
    } catch {
      // Storage access error
    }
    return null;
  }

  /**
   * Stores the current user profile in memory and sessionStorage.
   * @param {Object|null} user
   */
  setUser(user) {
    this.inMemoryUser = user || null;
    try {
      if (user) {
        sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.USER);
      }
    } catch (e) {
      console.warn('Unable to update user in sessionStorage:', e);
    }
  }

  /**
   * Clears all session credentials from memory and sessionStorage.
   */
  clear() {
    this.inMemoryAccessToken = null;
    this.inMemoryUser = null;
    try {
      sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.USER);
      // Clean up any legacy localStorage keys from prior versions
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    } catch (e) {
      console.warn('Unable to clear tokens from storage:', e);
    }
  }
}

export const tokenService = new TokenService();
