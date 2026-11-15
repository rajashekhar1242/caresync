import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/app/providers/auth.provider';
import { useAuth } from '@/app/providers/auth.context';
import { authService, resetAuthServicePromises } from '@/services/auth.service';
import { tokenService } from '@/services/token.service';
import { queryClient } from '@/app/providers/query-client';

function TestConsumer() {
  const { user, role, isAuthenticated, isLoading, initError } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="auth">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="role">{role || 'none'}</div>
      <div data-testid="user">{user?.fullName || 'none'}</div>
      <div data-testid="error">{initError ? initError.message : 'none'}</div>
    </div>
  );
}

describe('Session Restoration Lifecycle & Concurrency', () => {
  beforeEach(() => {
    tokenService.clear();
    sessionStorage.clear();
    queryClient.clear();
    resetAuthServicePromises();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetAuthServicePromises();
  });

  it('deduplicates concurrent restoreSession invocations via single-flight mutex', async () => {
    tokenService.setRefreshToken('active-valid-refresh-token');
    const mockUser = { id: 'u1', email: 'admin@caresync.com', fullName: 'Admin User', role: 'ADMIN' };

    let restoreCallsCount = 0;
    vi.spyOn(authService, 'refreshToken').mockImplementation(async () => {
      restoreCallsCount++;
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 20));
      tokenService.setAccessToken('new-access-token');
      return { accessToken: 'new-access-token', refreshToken: 'rotated-refresh-token' };
    });

    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(mockUser);

    // Fire 3 simultaneous restoreSession calls (e.g. React 18 StrictMode + rapid mounts)
    const [p1, p2, p3] = await Promise.all([
      authService.restoreSession(),
      authService.restoreSession(),
      authService.restoreSession(),
    ]);

    expect(restoreCallsCount).toBe(1);
    expect(p1).toEqual(mockUser);
    expect(p2).toEqual(mockUser);
    expect(p3).toEqual(mockUser);
  });

  it('preserves refresh token and user state on transient network failure during session restoration', async () => {
    tokenService.setRefreshToken('saved-refresh-token');
    tokenService.setUser({ id: 'u1', fullName: 'Dr. Watson', role: 'DOCTOR' });

    // Simulate transient network failure (Axios network error without HTTP response)
    const netError = new Error('Network Error');
    netError.code = 'ERR_NETWORK';
    vi.spyOn(authService, 'restoreSession').mockRejectedValue(netError);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    // Refresh token MUST NOT be deleted
    expect(tokenService.getRefreshToken()).toBe('saved-refresh-token');
    // Cached user should be preserved
    expect(screen.getByTestId('user').textContent).toBe('Dr. Watson');
    // Error state is recorded so ProtectedRoute can render retry UI instead of redirecting
    expect(screen.getByTestId('error').textContent).toBe('Network Error');
  });

  it('purges storage and resets state on definitive 401 unauthorized rejection', async () => {
    tokenService.setRefreshToken('revoked-refresh-token');

    const authError = new Error('Refresh token is invalid or has already been used');
    authError.response = { status: 401, data: { code: 'INVALID_REFRESH_TOKEN' } };
    vi.spyOn(authService, 'restoreSession').mockRejectedValue(authError);

    const clearQuerySpy = vi.spyOn(queryClient, 'clear');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(tokenService.getRefreshToken()).toBeNull();
    expect(clearQuerySpy).toHaveBeenCalled();
  });
});
