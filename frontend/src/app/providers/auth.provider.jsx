import * as React from 'react';
import { AuthContext } from './auth.context';
import { authService } from '@/services/auth.service';
import { tokenService } from '@/services/token.service';
import { queryClient } from './query-client';

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(() => tokenService.getUser());
  const [isLoading, setIsLoading] = React.useState(true);

  const role = user?.role ?? null;
  const isAuthenticated = Boolean(user && tokenService.getAccessToken());

  // Listen for unauthorized events emitted by apiClient single-flight interceptor
  React.useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      tokenService.clear();
      queryClient.clear();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // Session restoration on application startup via stored refresh token
  React.useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const refreshToken = tokenService.getRefreshToken();
      if (!refreshToken) {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const verifiedUser = await authService.restoreSession();
        if (mounted) {
          setUser(verifiedUser);
        }
      } catch {
        if (mounted) {
          setUser(null);
          tokenService.clear();
          queryClient.clear();
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = React.useCallback(async (payload) => {
    const authData = await authService.login(payload);
    setUser(authData.user);
    return authData;
  }, []);

  const register = React.useCallback(async (payload) => {
    const authData = await authService.register(payload);
    setUser(authData.user);
    return authData;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
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
      login,
      register,
      logout,
    }),
    [user, role, isAuthenticated, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
