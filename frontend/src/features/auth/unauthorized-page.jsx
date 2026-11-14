import { useNavigate } from 'react-router-dom';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/ui/badge';
import { ROLE_DEFAULT_REDIRECT } from '@/constants';

export function UnauthorizedPage() {
  const { role, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleReturnHome = () => {
    if (role && ROLE_DEFAULT_REDIRECT[role]) {
      navigate(ROLE_DEFAULT_REDIRECT[role]);
    } else {
      navigate('/login');
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-sm">
          <ShieldX className="h-9 w-9" />
        </div>

        <div className="space-y-2">
          <span className="inline-block rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive uppercase tracking-wider">
            403 — Access Denied
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Restricted Healthcare Area
          </h1>
          <p className="text-sm text-muted-foreground">
            You do not have the required clinical authority or administrative credentials to view this page.
          </p>
        </div>

        {user && role && (
          <div className="rounded-lg border bg-card p-4 shadow-sm text-xs space-y-1">
            <p className="text-muted-foreground">Signed in as:</p>
            <p className="font-semibold text-foreground text-sm">{user.fullName}</p>
            <div className="pt-1 flex justify-center">
              <RoleBadge role={role} />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button onClick={handleReturnHome} className="w-full sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Authorized Portal
          </Button>
          <Button variant="outline" onClick={handleSignOut} className="w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" />
            Switch Account
          </Button>
        </div>
      </div>
    </div>
  );
}
