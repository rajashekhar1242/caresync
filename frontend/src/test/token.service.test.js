import { describe, it, expect, beforeEach } from 'vitest';
import { tokenService } from '@/services/token.service';
import { STORAGE_KEYS } from '@/constants';

describe('TokenService Security & Storage', () => {
  beforeEach(() => {
    tokenService.clear();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('stores access token in memory only, never persisting to localStorage or sessionStorage', () => {
    tokenService.setTokens('access-token-mem-1', 'refresh-token-session-1');

    // Access token is available in memory
    expect(tokenService.getAccessToken()).toBe('access-token-mem-1');

    // Access token MUST NOT exist in localStorage or sessionStorage (protect against persistent XSS)
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
  });

  it('stores refresh token in sessionStorage to survive tab reloads', () => {
    tokenService.setTokens('access-token-123', 'refresh-token-session-999');

    expect(tokenService.getRefreshToken()).toBe('refresh-token-session-999');
    expect(sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('refresh-token-session-999');
    // Never in localStorage
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
  });

  it('stores and retrieves user profile from memory and sessionStorage', () => {
    const mockUser = {
      id: 'uuid-101',
      fullName: 'Dr. Gregory House',
      email: 'ghouse@caresync.com',
      role: 'DOCTOR',
      patientId: null,
      doctorId: 'uuid-doc-1',
    };

    tokenService.setUser(mockUser);
    const retrieved = tokenService.getUser();
    expect(retrieved).toEqual(mockUser);
    expect(retrieved.role).toBe('DOCTOR');
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.USER))).toEqual(mockUser);
  });

  it('clears all tokens and user from memory and storage', () => {
    tokenService.setTokens('access-token-123', 'refresh-token-456');
    tokenService.setUser({
      id: 'uuid-1',
      fullName: 'Admin',
      email: 'admin@caresync.com',
      role: 'ADMIN',
    });

    tokenService.clear();
    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();
    expect(tokenService.getUser()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
  });

  it('handles missing tokens gracefully returning null', () => {
    expect(tokenService.getAccessToken()).toBeNull();
    expect(tokenService.getRefreshToken()).toBeNull();
    expect(tokenService.getUser()).toBeNull();
  });
});
