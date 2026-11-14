import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/auth.context';
import { ROLE_DEFAULT_REDIRECT } from '@/constants';

export function RootRedirect() {
  const { isAuthenticated, role, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated && role) {
    const target = ROLE_DEFAULT_REDIRECT[role] || '/login';
    return <Navigate to={target} replace />;
  }

  return <Navigate to="/login" replace />;
}
