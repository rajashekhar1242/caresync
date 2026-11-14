import * as React from 'react';

/**
 * @typedef {Object} AuthContextValue
 * @property {Object|null} user
 * @property {string|null} role
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoading
 * @property {Function} login
 * @property {Function} register
 * @property {Function} logout
 */

export const AuthContext = React.createContext(undefined);

/**
 * Hook to access CareSync auth state.
 * @returns {AuthContextValue}
 */
export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
