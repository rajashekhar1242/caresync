import { apiClient } from './api';
import { tokenService } from './token.service';
import { authBroadcast } from './auth-broadcast';

// Single-flight in-flight mutex promises
let restoreSessionPromise = null;
let refreshTokenPromise = null;

export const resetAuthServicePromises = () => {
  restoreSessionPromise = null;
  refreshTokenPromise = null;
};

/**
 * Authentication and authorization API service integrating with CareSync backend.
 */
export const authService = {
  /**
   * Authenticates user with email and password.
   * @param {{ email: string, password: string }} payload
   * @returns {Promise<Object>} AuthResponse
   */
  async login(payload) {
    const response = await apiClient.post('/auth/login', payload);
    const authData = response.data;
    tokenService.setTokens(authData.accessToken, authData.refreshToken);
    tokenService.setUser(authData.user);
    return authData;
  },

  /**
   * Registers a new patient account.
   * Sanitizes optional phone to prevent Bean Validation pattern rejection on empty string.
   * @param {{ fullName: string, email: string, password: string, phone?: string }} payload
   * @returns {Promise<Object>} AuthResponse
   */
  async register(payload) {
    const cleanPayload = {
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      password: payload.password,
      ...(payload.phone && payload.phone.trim() ? { phone: payload.phone.trim() } : {}),
    };

    const response = await apiClient.post('/auth/register', cleanPayload);
    const authData = response.data;
    tokenService.setTokens(authData.accessToken, authData.refreshToken);
    tokenService.setUser(authData.user);
    return authData;
  },

  /**
   * Rotates access and refresh tokens.
   * Utilizes a single-flight mutex to prevent concurrent refresh calls from invalidating each other.
   * @param {string} [refreshToken]
   * @returns {Promise<Object>} TokenResponse
   */
  async refreshToken(refreshToken) {
    if (refreshTokenPromise) {
      return refreshTokenPromise;
    }

    const token = refreshToken || tokenService.getRefreshToken();
    if (!token) {
      throw new Error('No refresh token available');
    }

    refreshTokenPromise = (async () => {
      try {
        const response = await apiClient.post('/auth/refresh', { refreshToken: token });
        tokenService.setTokens(response.data.accessToken, response.data.refreshToken);
        authBroadcast.broadcastTokens(
          response.data.accessToken,
          response.data.refreshToken,
          tokenService.getUser()
        );
        return response.data;
      } finally {
        refreshTokenPromise = null;
      }
    })();

    return refreshTokenPromise;
  },

  /**
   * Restores user session on page load using stored refresh token.
   * Rotates token pair, fetches verified user from /api/auth/me, and restores auth state.
   * Protects against double-mounts (React 18 StrictMode) and rapid reloads via single-flight mutex.
   * @returns {Promise<Object|null>} UserResponse or null if unauthenticated
   */
  async restoreSession() {
    if (restoreSessionPromise) {
      return restoreSessionPromise;
    }

    restoreSessionPromise = (async () => {
      const refreshToken = tokenService.getRefreshToken();
      if (!refreshToken) {
        tokenService.clear();
        return null;
      }

      try {
        // 1. Rotate refresh token and obtain new access token via single-flight mutex
        await this.refreshToken(refreshToken);

        // 2. Fetch verified user profile using the new access token
        try {
          return await this.getCurrentUser();
        } catch (userErr) {
          // If /auth/me fails with a transient network error (not 401),
          // fall back to cached user in sessionStorage if available
          if (userErr.response?.status !== 401) {
            const cachedUser = tokenService.getUser();
            if (cachedUser) {
              return cachedUser;
            }
          }
          throw userErr;
        }
      } catch (err) {
        // Only wipe tokens on definitive 401 auth rejection
        if (err.response?.status === 401) {
          tokenService.clear();
          authBroadcast.broadcastLogout();
        }
        throw err;
      } finally {
        restoreSessionPromise = null;
      }
    })();

    return restoreSessionPromise;
  },

  /**
   * Signs out user and revokes active token family on the backend.
   * @returns {Promise<void>}
   */
  async logout() {
    authBroadcast.broadcastLogout();
    const refreshToken = tokenService.getRefreshToken();
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch (e) {
      console.warn('Backend logout call failed or was unreachable:', e);
    } finally {
      tokenService.clear();
    }
  },

  /**
   * Retrieves the currently authenticated user's profile from /api/auth/me.
   * @returns {Promise<Object>} UserResponse
   */
  async getCurrentUser() {
    const response = await apiClient.get('/auth/me');
    tokenService.setUser(response.data);
    return response.data;
  },
};
