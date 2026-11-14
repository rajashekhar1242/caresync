import { apiClient } from './api';
import { tokenService } from './token.service';

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
   * @param {string} refreshToken
   * @returns {Promise<Object>} TokenResponse
   */
  async refreshToken(refreshToken) {
    const response = await apiClient.post('/auth/refresh', { refreshToken });
    tokenService.setTokens(response.data.accessToken, response.data.refreshToken);
    return response.data;
  },

  /**
   * Restores user session on page load using stored refresh token.
   * Rotates token pair, fetches verified user from /api/auth/me, and restores auth state.
   * @returns {Promise<Object|null>} UserResponse or null if unauthenticated
   */
  async restoreSession() {
    const refreshToken = tokenService.getRefreshToken();
    if (!refreshToken) {
      tokenService.clear();
      return null;
    }

    try {
      // 1. Rotate refresh token and obtain new access token
      await this.refreshToken(refreshToken);
      // 2. Fetch verified user profile using the new access token
      return await this.getCurrentUser();
    } catch (err) {
      tokenService.clear();
      throw err;
    }
  },

  /**
   * Signs out user and revokes active token family on the backend.
   * @returns {Promise<void>}
   */
  async logout() {
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
