import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '@/services/auth.service';
import { apiClient } from '@/services/api';
import { tokenService } from '@/services/token.service';

describe('AuthService Integration', () => {
  beforeEach(() => {
    tokenService.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('login stores access token in memory, refresh token in sessionStorage, and returns AuthResponse', async () => {
    const mockAuthResponse = {
      accessToken: 'acc-token-abc',
      refreshToken: 'ref-token-xyz',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-uuid-1',
        email: 'doctor@caresync.com',
        fullName: 'Dr. Gregory House',
        role: 'DOCTOR',
        patientId: null,
        doctorId: 'doc-uuid-1',
      },
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockAuthResponse });

    const result = await authService.login({
      email: 'doctor@caresync.com',
      password: 'Doctor@123',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
      email: 'doctor@caresync.com',
      password: 'Doctor@123',
    });

    expect(result).toEqual(mockAuthResponse);
    expect(tokenService.getAccessToken()).toBe('acc-token-abc');
    expect(tokenService.getRefreshToken()).toBe('ref-token-xyz');
    expect(tokenService.getUser()).toEqual(mockAuthResponse.user);
  });

  it('register sanitizes empty phone string to avoid backend @Pattern rejection', async () => {
    const mockAuthResponse = {
      accessToken: 'pat-acc-token',
      refreshToken: 'pat-ref-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'pat-user-uuid',
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        role: 'PATIENT',
        patientId: 'pat-uuid-1',
        doctorId: null,
      },
    };

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockAuthResponse });

    const result = await authService.register({
      fullName: '  Jane Doe  ',
      email: '  Jane@Example.COM  ',
      password: 'Password123',
      phone: '   ', // whitespace only
    });

    // Verify phone was completely omitted from payload
    expect(postSpy).toHaveBeenCalledWith('/auth/register', {
      fullName: 'Jane Doe',
      email: 'Jane@Example.COM',
      password: 'Password123',
    });

    expect(result).toEqual(mockAuthResponse);
    expect(tokenService.getAccessToken()).toBe('pat-acc-token');
    expect(tokenService.getRefreshToken()).toBe('pat-ref-token');
  });

  it('restoreSession rotates token and retrieves verified user from /api/auth/me', async () => {
    tokenService.setRefreshToken('existing-session-refresh-token');

    const mockTokenResponse = {
      accessToken: 'new-acc-token',
      refreshToken: 'new-ref-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    };

    const mockUserResponse = {
      id: 'admin-uuid',
      email: 'admin@caresync.com',
      fullName: 'System Administrator',
      role: 'ADMIN',
      patientId: null,
      doctorId: null,
    };

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: mockTokenResponse });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: mockUserResponse });

    const restoredUser = await authService.restoreSession();

    expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh', {
      refreshToken: 'existing-session-refresh-token',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');

    expect(restoredUser).toEqual(mockUserResponse);
    expect(tokenService.getAccessToken()).toBe('new-acc-token');
    expect(tokenService.getRefreshToken()).toBe('new-ref-token');
    expect(tokenService.getUser()).toEqual(mockUserResponse);
  });

  it('restoreSession returns null immediately if no refresh token is stored', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const result = await authService.restoreSession();

    expect(result).toBeNull();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('logout sends refresh token to backend and clears all local credentials', async () => {
    tokenService.setTokens('acc-token', 'ref-token');
    tokenService.setUser({ id: 'u1', role: 'ADMIN' });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ status: 204 });

    await authService.logout();

    expect(postSpy).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'ref-token' });
    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();
    expect(tokenService.getUser()).toBeNull();
  });

  it('logout tolerates backend network failures while still cleaning local state', async () => {
    tokenService.setTokens('acc-token', 'ref-token');

    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Network error'));

    await authService.logout();

    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();
  });
});
