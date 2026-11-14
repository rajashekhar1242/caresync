import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { apiClient, resetUnauthorizedDispatch } from '@/services/api';
import { tokenService } from '@/services/token.service';

describe('ApiClient Single-Flight Refresh Mutex & Interceptors', () => {
  let unauthorizedEventsCount = 0;
  let originalAdapter;
  const onUnauthorized = () => {
    unauthorizedEventsCount++;
  };

  beforeEach(() => {
    unauthorizedEventsCount = 0;
    resetUnauthorizedDispatch();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    tokenService.clear();
    sessionStorage.clear();
    originalAdapter = apiClient.defaults.adapter;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.removeEventListener('auth:unauthorized', onUnauthorized);
    apiClient.defaults.adapter = originalAdapter;
    resetUnauthorizedDispatch();
  });

  it('injects Authorization Bearer token header when access token is in memory', async () => {
    tokenService.setAccessToken('mem-access-token-123');

    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const config = await requestHandler({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer mem-access-token-123');
  });

  it('does not inject Authorization header when access token is absent', async () => {
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const config = await requestHandler({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('excludes login, register, refresh, and logout endpoints from refresh interceptor', async () => {
    tokenService.setRefreshToken('valid-refresh-token');
    const responseErrorHandler = apiClient.interceptors.response.handlers[0].rejected;

    const excludedUrls = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/logout',
    ];

    for (const url of excludedUrls) {
      const error = {
        config: { url, headers: {} },
        response: { status: 401 },
      };

      await expect(responseErrorHandler(error)).rejects.toEqual(error);
    }
  });

  it('does not retry a request if _retry flag is already set (prevents infinite loops)', async () => {
    tokenService.setRefreshToken('valid-refresh-token');
    const responseErrorHandler = apiClient.interceptors.response.handlers[0].rejected;

    const error = {
      config: { url: '/api/patients/123', _retry: true, headers: {} },
      response: { status: 401 },
    };

    await expect(responseErrorHandler(error)).rejects.toEqual(error);
  });

  it('clears session and dispatches single unauthorized event if refresh token is missing on 401', async () => {
    const responseErrorHandler = apiClient.interceptors.response.handlers[0].rejected;

    const error = {
      config: { url: '/api/appointments', headers: {} },
      response: { status: 401 },
    };

    await expect(responseErrorHandler(error)).rejects.toEqual(error);
    expect(unauthorizedEventsCount).toBe(1);
    expect(tokenService.getAccessToken()).toBeNull();
  });

  it('coordinates 10 simultaneous 401 responses with EXACTLY ONE refresh HTTP request', async () => {
    // 1. Prepare initial token state
    tokenService.setTokens('initial-expired-access-token', 'initial-valid-refresh-token');

    let refreshCallsCount = 0;
    const newAccessToken = 'freshly-rotated-access-token-999';
    const newRefreshToken = 'freshly-rotated-refresh-token-888';

    // 2. Mock axios.post specifically for the refresh call
    vi.spyOn(axios, 'post').mockImplementation((url, body) => {
      if (url.includes('/auth/refresh')) {
        refreshCallsCount++;
        expect(body.refreshToken).toBe('initial-valid-refresh-token');
        return Promise.resolve({
          data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            tokenType: 'Bearer',
            expiresIn: 900,
          },
        });
      }
      return Promise.reject(new Error(`Unexpected post to ${url}`));
    });

    // 3. Set a mock adapter on apiClient so replayed requests resolve successfully
    apiClient.defaults.adapter = async (config) => {
      return {
        data: { success: true, url: config.url },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    // 4. Simulate 10 simultaneous API requests hitting 401
    const responseErrorHandler = apiClient.interceptors.response.handlers[0].rejected;
    const concurrentRequestsCount = 10;

    const concurrentPromises = Array.from({ length: concurrentRequestsCount }).map((_, index) => {
      const error = {
        config: {
          url: `/api/data/widget-${index}`,
          method: 'get',
          headers: { Authorization: 'Bearer initial-expired-access-token' },
        },
        response: { status: 401 },
      };
      return responseErrorHandler(error);
    });

    // 5. Await all 10 concurrent requests to resolve
    const results = await Promise.all(concurrentPromises);

    // 6. Assertions for acceptance criterion:
    // Original requests: 10
    expect(results).toHaveLength(10);

    // Refresh requests: EXACTLY 1 (critical: never trigger token family revocation!)
    expect(refreshCallsCount).toBe(1);

    // Successful refreshes: 1 (tokens updated in tokenService)
    expect(tokenService.getAccessToken()).toBe(newAccessToken);
    expect(tokenService.getRefreshToken()).toBe(newRefreshToken);

    // Requests retried: 10 (all resolved with new token)
    results.forEach((res, index) => {
      expect(res.status).toBe(200);
      expect(res.data.url).toBe(`/api/data/widget-${index}`);
      expect(res.config.headers.Authorization).toBe(`Bearer ${newAccessToken}`);
      expect(res.config._retry).toBe(true);
    });

    // Token family replay: 0
    // Unexpected logout events: 0
    expect(unauthorizedEventsCount).toBe(0);
  });

  it('rejects all waiting requests and dispatches single unauthorized event when refresh fails', async () => {
    tokenService.setTokens('expired-access-token', 'revoked-refresh-token');

    let refreshCallsCount = 0;
    vi.spyOn(axios, 'post').mockImplementation((url) => {
      if (url.includes('/auth/refresh')) {
        refreshCallsCount++;
        return Promise.reject({
          response: {
            status: 401,
            data: { code: 'INVALID_REFRESH_TOKEN', message: 'Token revoked' },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected post to ${url}`));
    });

    const responseErrorHandler = apiClient.interceptors.response.handlers[0].rejected;

    // Simulate 5 simultaneous requests when refresh fails
    const promises = Array.from({ length: 5 }).map((_, index) => {
      const error = {
        config: { url: `/api/reports/${index}`, headers: {} },
        response: { status: 401 },
      };
      return responseErrorHandler(error);
    });

    // All 5 must reject
    const results = await Promise.allSettled(promises);

    results.forEach((r) => {
      expect(r.status).toBe('rejected');
    });

    // Exactly 1 refresh attempted
    expect(refreshCallsCount).toBe(1);

    // Session cleared
    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();

    // Unauthorized event dispatched exactly once
    expect(unauthorizedEventsCount).toBe(1);
  });
});
