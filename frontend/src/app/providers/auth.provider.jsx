import * as React from 'react';
import { AuthContext } from './auth.context';
import { authService } from '@/services/auth.service';
import { tokenService } from '@/services/token.service';
import { authBroadcast } from '@/services/auth-broadcast';
import { queryClient } from './query-client';

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(() => tokenService.getUser());
  const [isLoading, setIsLoading] = React.useState(true);
  const [initError, setInitError] = React.useState(null);

  const role = user?.role ?? null;
  const isAuthenticated = Boolean(user && tokenService.getAccessToken());

  // Listen for unauthorized and cross-tab token rotation events
  React.useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setInitError(null);
      tokenService.clear();
      queryClient.clear();
    };

    const handleTokensRotated = () => {
      const currentUser = tokenService.getUser();
      if (currentUser) {
        setUser(currentUser);
        setInitError(null);
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    window.addEventListener('auth:tokens-rotated', handleTokensRotated);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
      window.removeEventListener('auth:tokens-rotated', handleTokensRotated);
    };
  }, []);

  const restoreSession = React.useCallback(async () => {
    let refreshToken = tokenService.getRefreshToken();

    // If no token in sessionStorage (e.g. freshly opened tab), query existing open tabs
    if (!refreshToken) {
      refreshToken = await authBroadcast.requestSessionFromTabs(150);
    }

    if (!refreshToken) {
      setUser(null);
      setInitError(null);
      setIsLoading(false);
      return;
    }

    try {
      const verifiedUser = await authService.restoreSession();
      if (verifiedUser) {
        setUser(verifiedUser);
        setInitError(null);
      }
    } catch (err) {
      const msg = (err?.message || '').toLowerCase();
      const isAuthFailure =
        err?.response?.status === 401 ||
        err?.status === 401 ||
        err?.code === 'INVALID_REFRESH_TOKEN' ||
        err?.response?.data?.code === 'INVALID_REFRESH_TOKEN' ||
        msg.includes('invalid') ||
        msg.includes('revoked') ||
        msg.includes('unauthorized');

      if (isAuthFailure) {
        setUser(null);
        setInitError(null);
        tokenService.clear();
        queryClient.clear();
      } else {
        // Transient network failure during session restoration
        setInitError(err);
        const cachedUser = tokenService.getUser();
        if (cachedUser) {
          setUser(cachedUser);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Session restoration on application startup
  React.useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = React.useCallback(async (payload) => {
    const authData = await authService.login(payload);
    setUser(authData.user);
    setInitError(null);
    return authData;
  }, []);

  const register = React.useCallback(async (payload) => {
    const authData = await authService.register(payload);
    setUser(authData.user);
    setInitError(null);
    return authData;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setInitError(null);
      tokenService.clear();
      queryClient.clear();
    }
  }, []);

  const contextValue = React.useMemo(
    () => ({
      user,
      role,
      isAuthenticated,
      isLoading,
      initError,
      retryInit: restoreSession,
      login,
      register,
      logout,
    }),
    [user, role, isAuthenticated, isLoading, initError, restoreSession, login, register, logout]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
