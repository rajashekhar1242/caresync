import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  LogOut,
  User as UserIcon,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { Breadcrumbs } from './breadcrumbs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RoleBadge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function Header({ onMenuClick }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out of CareSync.',
        variant: 'default',
      });
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b bg-card/80 px-4 md:px-6 backdrop-blur-md">
      {/* Left: Mobile Toggle + Breadcrumbs */}
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Breadcrumbs />
      </div>

      {/* Right: Status Pill, Notifications & User Profile */}
      <div className="flex items-center gap-3">
        {/* Clinic Status Pill */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>CareSync Live</span>
        </div>

        {/* Notifications Icon Button */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
          onClick={() =>
            toast({
              title: 'Notifications',
              description: 'All clinical queues and appointment slots are current.',
              variant: 'info',
            })
          }
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
        </Button>

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border border-input/60 hover:bg-muted"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-xs font-medium text-foreground max-w-[120px] truncate hidden sm:inline-block">
                {user?.fullName}
              </span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold text-foreground truncate">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                {role && (
                  <div className="pt-1">
                    <RoleBadge role={role} />
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() =>
                toast({
                  title: 'Profile Settings',
                  description: 'Account settings will be available in Phase 19.',
                  variant: 'info',
                })
              }
              className="cursor-pointer"
            >
              <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>User Profile</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() =>
                toast({
                  title: 'Security Center',
                  description: 'Session active with JWT refresh rotation protection.',
                  variant: 'info',
                })
              }
              className="cursor-pointer"
            >
              <Shield className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Security & Tokens</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
