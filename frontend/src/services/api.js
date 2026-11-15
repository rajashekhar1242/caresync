import axios from 'axios';
import { tokenService } from './token.service';
import { authBroadcast } from './auth-broadcast';

/**
 * Normalizes the API base URL to ensure clean formatting:
 * - Trims whitespace
 * - Strips query strings and hash fragments
 * - Strips trailing slashes
 * - Preserves configured custom base paths (e.g. https://domain.com/backend -> https://domain.com/backend/api)
 * - Collapses accidental duplicate trailing /api/api paths to /api
 * - Appends /api if only origin was supplied (e.g. https://domain.com -> https://domain.com/api)
 *
 * @param {string} [rawUrl]
 * @returns {string} Normalized API base URL
 */
export function normalizeApiBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '/api';
  }
  let url = rawUrl.trim().split(/[?#]/)[0];
  url = url.replace(/\/+$/, '');
  if (url.endsWith('/api')) {
    return url.replace(/(?:\/api)+$/, '/api');
  }
  return `${url}/api`;
}

const BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 60000;

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Single-flight refresh mutex promise
let refreshPromise = null;
let hasDispatchedUnauthorized = false;

/**
 * Resets the unauthorized dispatch flag (used on logout/login/test cleanup).
 */
export const resetUnauthorizedDispatch = () => {
  hasDispatchedUnauthorized = false;
};

/**
 * Dispatches the unauthorized event once, debouncing multiple simultaneous 401 failures.
 */
export const dispatchUnauthorizedOnce = () => {
  if (!hasDispatchedUnauthorized) {
    hasDispatchedUnauthorized = true;
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    setTimeout(() => {
      hasDispatchedUnauthorized = false;
    }, 1000);
  }
};

/**
 * Executes a single-flight token refresh, ensuring all concurrent 401 requests
 * await the exact same promise without triggering backend token replay revocation.
 *
 * @param {string} refreshToken
 * @returns {Promise<string>} New access token
 */
export async function executeTokenRefresh(refreshToken) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const token = refreshToken || tokenService.getRefreshToken();
        if (!token) {
          throw new Error('No refresh token available');
        }

        // Use standalone axios instance to bypass interceptors
        const response = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refreshToken: token },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;
        tokenService.setTokens(newAccessToken, newRefreshToken);
        authBroadcast.broadcastTokens(newAccessToken, newRefreshToken, tokenService.getUser());
        return newAccessToken;
      } catch (err) {
        // Distinguish definitive auth failure (HTTP 401) from transient network or server errors
        const isAuthFailure = err.response && err.response.status === 401;
        if (isAuthFailure) {
          tokenService.clear();
          authBroadcast.broadcastLogout();
          dispatchUnauthorizedOnce();
        }
        throw err;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// Request Interceptor: Attach Bearer token from in-memory tokenService
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenService.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Single-flight refresh mutex
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Ignore non-401 or requests without config
    if (!error.response || error.response.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest.url || '';

    // Exclude login, registration, refresh, and logout endpoints from automatic refresh
    if (
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/logout')
    ) {
      return Promise.reject(error);
    }

    // Never retry a request more than once
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    const refreshToken = tokenService.getRefreshToken();
    if (!refreshToken) {
      tokenService.clear();
      dispatchUnauthorizedOnce();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const newAccessToken = await executeTokenRefresh(refreshToken);
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);
