import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/auth.context';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isLoading, role, initError, retryInit } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Verifying CareSync session...</p>
        </div>
      </div>
    );
  }

  // If session restoration encountered a temporary network failure (not a 401 auth rejection),
  // DO NOT redirect to /login! Display a network recovery screen with retry option.
  if (initError && !isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 bg-card rounded-xl border shadow-sm">
          <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Temporary Connection Issue</h2>
            <p className="text-sm text-muted-foreground">
              Unable to connect to CareSync servers to verify your session. Your credentials are safe.
            </p>
          </div>
          <Button onClick={retryInit || (() => window.location.reload())} className="w-full sm:w-auto">
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated && role) {
    switch (role) {
      case 'ADMIN':
        return <Navigate to="/admin/dashboard" replace />;
      case 'RECEPTIONIST':
        return <Navigate to="/receptionist/dashboard" replace />;
      case 'DOCTOR':
        return <Navigate to="/doctor/dashboard" replace />;
      case 'PATIENT':
        return <Navigate to="/patient/dashboard" replace />;
    }
  }

  return <Outlet />;
}
