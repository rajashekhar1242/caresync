import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/app/providers/auth.provider';
import { useAuth } from '@/app/providers/auth.context';
import { authService } from '@/services/auth.service';
import { tokenService } from '@/services/token.service';
import { queryClient } from '@/app/providers/query-client';

function TestConsumer() {
  const { user, role, isAuthenticated, isLoading, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="auth">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="role">{role || 'none'}</div>
      <div data-testid="user">{user?.fullName || 'none'}</div>
      <button
        onClick={() =>
          login({ email: 'doc@caresync.com', password: 'DocPassword' })
        }
      >
        Sign In
      </button>
      <button onClick={() => logout()}>Sign Out</button>
    </div>
  );
}

describe('AuthProvider Session Lifecycle & State', () => {
  beforeEach(() => {
    tokenService.clear();
    sessionStorage.clear();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('initializes in unauthenticated state when no stored refresh token exists', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('role').textContent).toBe('none');
  });

  it('restores verified user session on startup when refresh token is present in sessionStorage', async () => {
    tokenService.setRefreshToken('valid-session-refresh-token');

    const mockUser = {
      id: 'doc-uuid-1',
      email: 'doctor@caresync.com',
      fullName: 'Dr. John Watson',
      role: 'DOCTOR',
      patientId: null,
      doctorId: 'doc-1',
    };

    vi.spyOn(authService, 'restoreSession').mockImplementation(async () => {
      tokenService.setAccessToken('new-mem-access-token');
      tokenService.setUser(mockUser);
      return mockUser;
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    expect(screen.getByTestId('auth').textContent).toBe('authenticated');
    expect(screen.getByTestId('role').textContent).toBe('DOCTOR');
    expect(screen.getByTestId('user').textContent).toBe('Dr. John Watson');
  });

  it('clears session when restoreSession fails on invalid/revoked refresh token', async () => {
    tokenService.setRefreshToken('revoked-refresh-token');

    vi.spyOn(authService, 'restoreSession').mockRejectedValue(new Error('Invalid token'));
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

  it('logs in successfully and updates state', async () => {
    const mockUser = {
      id: 'u-1',
      email: 'doc@caresync.com',
      fullName: 'Dr. House',
      role: 'DOCTOR',
    };

    vi.spyOn(authService, 'login').mockImplementation(async () => {
      tokenService.setTokens('acc-1', 'ref-1');
      tokenService.setUser(mockUser);
      return { accessToken: 'acc-1', refreshToken: 'ref-1', user: mockUser };
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    const loginBtn = screen.getByRole('button', { name: /sign in/i });
    await act(async () => {
      loginBtn.click();
    });

    expect(screen.getByTestId('auth').textContent).toBe('authenticated');
    expect(screen.getByTestId('role').textContent).toBe('DOCTOR');
    expect(screen.getByTestId('user').textContent).toBe('Dr. House');
  });

  it('clears credentials and wipes TanStack Query cache on logout', async () => {
    const clearQuerySpy = vi.spyOn(queryClient, 'clear');
    vi.spyOn(authService, 'logout').mockResolvedValue(undefined);

    tokenService.setTokens('acc-1', 'ref-1');
    tokenService.setUser({ id: 'u-1', fullName: 'Dr. House', role: 'DOCTOR' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    const logoutBtn = screen.getByRole('button', { name: /sign out/i });
    await act(async () => {
      logoutBtn.click();
    });

    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(tokenService.getAccessToken()).toBeNull();
    expect(clearQuerySpy).toHaveBeenCalled();
  });

  it('cleans up session and wipes cache when auth:unauthorized event is fired', async () => {
    const clearQuerySpy = vi.spyOn(queryClient, 'clear');

    tokenService.setTokens('acc-1', 'ref-1');
    tokenService.setUser({ id: 'u-1', fullName: 'Dr. House', role: 'DOCTOR' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();
    expect(clearQuerySpy).toHaveBeenCalled();
  });
});
