import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Stethoscope,
  Users,
  User,
  Calendar,
  CalendarPlus,
  Clock,
  UserPlus,
  Receipt,
  FileBarChart,
  ShieldCheck,
  Settings,
  FileText,
  Pill,
  Activity,
  HeartPulse,
  LogOut,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  History,
} from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { RoleBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const NAV_ITEMS = [
  // Admin Links (Exact 10 sections per Phase 20 requirements)
  { title: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { title: 'Departments', href: '/admin/departments', icon: Building2, roles: ['ADMIN'] },
  { title: 'Doctors', href: '/admin/doctors', icon: Stethoscope, roles: ['ADMIN'] },
  { title: 'Staff', href: '/admin/staff', icon: Users, roles: ['ADMIN'] },
  { title: 'Appointments', href: '/admin/appointments', icon: Calendar, roles: ['ADMIN'] },
  { title: 'Patients', href: '/admin/patients', icon: UserPlus, roles: ['ADMIN'] },
  { title: 'Billing & Revenue', href: '/admin/billing', icon: Receipt, roles: ['ADMIN'] },
  { title: 'Reports', href: '/admin/reports', icon: FileBarChart, roles: ['ADMIN'] },
  { title: 'Audit Activity', href: '/admin/audit-logs', icon: ShieldCheck, roles: ['ADMIN'] },
  { title: 'Settings', href: '/admin/settings', icon: Settings, roles: ['ADMIN'] },

  // Receptionist Links (Exact 8 sections per Phase 21 requirements)
  { title: 'Overview', href: '/receptionist/dashboard', icon: LayoutDashboard, roles: ['RECEPTIONIST'] },
  { title: 'Patients', href: '/receptionist/patients', icon: Users, roles: ['RECEPTIONIST'] },
  { title: 'Register Patient', href: '/receptionist/patients/register', icon: UserPlus, roles: ['RECEPTIONIST'] },
  { title: 'Appointments', href: '/receptionist/appointments', icon: Calendar, roles: ['RECEPTIONIST'] },
  { title: 'Book Appointment', href: '/receptionist/appointments/book', icon: CalendarPlus, roles: ['RECEPTIONIST'] },
  { title: 'Check-in', href: '/receptionist/check-in', icon: CheckCircle2, roles: ['RECEPTIONIST'] },
  { title: 'Queue Management', href: '/receptionist/queue', icon: Clock, roles: ['RECEPTIONIST'] },
  { title: 'Doctor Availability', href: '/receptionist/doctors', icon: Stethoscope, roles: ['RECEPTIONIST'] },

  // Doctor Links (Phase 22 Doctor Portal)
  { title: 'Overview', href: '/doctor/dashboard', icon: LayoutDashboard, roles: ['DOCTOR'] },
  { title: 'My Schedule', href: '/doctor/schedules', icon: Calendar, roles: ['DOCTOR'] },
  { title: 'Patient Queue', href: '/doctor/queue', icon: Clock, roles: ['DOCTOR'] },
  { title: 'Patients', href: '/doctor/patients', icon: Users, roles: ['DOCTOR'] },
  { title: 'Consultations', href: '/doctor/consultations', icon: FileText, roles: ['DOCTOR'] },
  { title: 'Consultation History', href: '/doctor/history', icon: History, roles: ['DOCTOR'] },

  // Patient Links (Phase 23 Patient Portal)
  { title: 'Dashboard', href: '/patient/dashboard', icon: LayoutDashboard, roles: ['PATIENT'] },
  { title: 'My Profile', href: '/patient/profile', icon: User, roles: ['PATIENT'] },
  { title: 'Find Doctors', href: '/patient/doctors', icon: Stethoscope, roles: ['PATIENT'] },
  { title: 'Book Appointment', href: '/patient/book-appointment', icon: CalendarPlus, roles: ['PATIENT'] },
  { title: 'My Appointments', href: '/patient/appointments', icon: Calendar, roles: ['PATIENT'] },
  { title: 'Prescriptions', href: '/patient/prescriptions', icon: Pill, roles: ['PATIENT'] },
  { title: 'Medical History', href: '/patient/medical-history', icon: Activity, roles: ['PATIENT'] },
  { title: 'Billing & Invoices', href: '/patient/billing', icon: Receipt, roles: ['PATIENT'] },
];

export function Sidebar({ className, onClose, isCollapsed = false, onToggleCollapse }) {
  const { role, user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const filteredNav = React.useMemo(() => {
    if (!role) return [];
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
        variant: 'default',
      });
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-card/70 backdrop-blur-md text-card-foreground transition-all duration-200',
        isCollapsed ? 'w-20' : 'w-64',
        className
      )}
      aria-label="Sidebar navigation"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center px-4 border-b justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <HeartPulse className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-foreground truncate">HCMS CareSync</h1>
              <p className="text-[11px] text-muted-foreground font-medium truncate">Hospital & Clinic OS</p>
            </div>
          )}
        </div>

        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden md:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Role Banner */}
      {role && !isCollapsed && (
        <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
            Portal
          </span>
          <RoleBadge role={role} />
        </div>
      )}

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              title={isCollapsed ? item.title : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  isCollapsed && 'justify-center px-2'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.title}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Authenticated User & Actions */}
      <div className="p-3 border-t bg-muted/20 space-y-2">
        <div className={cn('flex items-center gap-3', isCollapsed && 'justify-center')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
            {user?.fullName?.charAt(0).toUpperCase() || 'A'}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{user?.fullName || 'Administrator'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email || 'admin@caresync.com'}</p>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size={isCollapsed ? 'icon' : 'sm'}
          onClick={handleLogout}
          className={cn('w-full border-input text-muted-foreground hover:text-destructive hover:bg-destructive/10', isCollapsed && 'h-8 w-8 mx-auto')}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="ml-2">Sign out</span>}
        </Button>
      </div>
    </aside>
  );
}
