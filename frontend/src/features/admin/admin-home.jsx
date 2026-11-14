import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Stethoscope,
  Building2,
  Calendar,
  Receipt,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  FileBarChart,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, AppointmentStatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/app/providers/auth.context';
import { useDashboardSummary, useRevenueReport, useAppointmentsByDepartment } from '@/hooks/use-reports';
import { useAppointments } from '@/hooks/use-appointments';
import { useDoctors } from '@/hooks/use-doctors';
import { usePatients } from '@/hooks/use-patients';
import { useDepartments } from '@/hooks/use-departments';
import { useAuditLogs } from '@/hooks/use-audit';

const STATUS_COLORS = {
  BOOKED: '#0284c7', // Sky 600
  CHECKED_IN: '#f59e0b', // Amber 500
  IN_CONSULTATION: '#8b5cf6', // Violet 500
  COMPLETED: '#10b981', // Emerald 500
  CANCELLED: '#ef4444', // Red 500
  NO_SHOW: '#64748b', // Slate 500
};

export function AdminHome() {
  const { user } = useAuth();

  // Queries for KPI metrics and charts
  const dashboardQuery = useDashboardSummary();
  const doctorsQuery = useDoctors({ size: 1 });
  const patientsQuery = usePatients({ size: 1 });
  const appointmentsQuery = useAppointments({ size: 1 });
  const departmentsQuery = useDepartments();

  // Date range for reports (last 7 days)
  const todayStr = React.useMemo(() => {
    return dashboardQuery.data?.today || new Date().toISOString().split('T')[0];
  }, [dashboardQuery.data?.today]);

  const sevenDaysAgoStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, []);

  const revenueQuery = useRevenueReport({
    from: sevenDaysAgoStr,
    to: todayStr,
    groupBy: 'DAY',
  });

  const deptAppointmentsQuery = useAppointmentsByDepartment({
    from: sevenDaysAgoStr,
    to: todayStr,
  });

  // Recent activity queries
  const recentAppointmentsQuery = useAppointments({
    size: 5,
    sort: 'slotStart,desc',
  });

  const recentAuditQuery = useAuditLogs({
    size: 5,
  });

  // Refetch all queries
  const handleRefresh = () => {
    dashboardQuery.refetch();
    doctorsQuery.refetch();
    patientsQuery.refetch();
    appointmentsQuery.refetch();
    departmentsQuery.refetch();
    revenueQuery.refetch();
    deptAppointmentsQuery.refetch();
    recentAppointmentsQuery.refetch();
    recentAuditQuery.refetch();
  };

  // Prepare appointment status pie data
  const statusPieData = React.useMemo(() => {
    const counts = dashboardQuery.data?.appointmentsToday;
    if (!counts) return [];
    return [
      { name: 'Booked', value: counts.booked, color: STATUS_COLORS.BOOKED },
      { name: 'Checked In', value: counts.checkedIn, color: STATUS_COLORS.CHECKED_IN },
      { name: 'In Consultation', value: counts.inConsultation, color: STATUS_COLORS.IN_CONSULTATION },
      { name: 'Completed', value: counts.completed, color: STATUS_COLORS.COMPLETED },
      { name: 'Cancelled', value: counts.cancelled, color: STATUS_COLORS.CANCELLED },
      { name: 'No Show', value: counts.noShow, color: STATUS_COLORS.NO_SHOW },
    ].filter((item) => item.value > 0);
  }, [dashboardQuery.data?.appointmentsToday]);

  // Prepare revenue chart data
  const revenueChartData = React.useMemo(() => {
    if (!revenueQuery.data?.buckets) return [];
    return revenueQuery.data.buckets.map((b) => ({
      period: b.period,
      Invoiced: parseFloat(b.invoiced || '0'),
      Collected: parseFloat(b.collected || '0'),
      Net: parseFloat(b.net || '0'),
    }));
  }, [revenueQuery.data?.buckets]);

  // Prepare department appointment chart data
  const deptChartData = React.useMemo(() => {
    if (!deptAppointmentsQuery.data?.departments) return [];
    return deptAppointmentsQuery.data.departments.map((d) => ({
      name: d.departmentName,
      Total: d.total,
      Completed: d.completed,
      Cancelled: d.cancelled,
    }));
  }, [deptAppointmentsQuery.data?.departments]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Hospital Administration Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back, <span className="font-semibold text-foreground">{user?.fullName || 'Administrator'}</span>.
            Real-time clinical metrics, revenue performance, and facility oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs flex items-center gap-1.5"
            aria-label="Refresh dashboard metrics"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Badge variant="destructive">ADMIN</Badge>
          <Badge variant="outline">HCMS Live</Badge>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* 1. Total Doctors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Doctors</CardTitle>
            <Stethoscope className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {doctorsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : doctorsQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {doctorsQuery.data?.totalElements ?? dashboardQuery.data?.activeDoctors ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {dashboardQuery.data?.activeDoctors != null ? `${dashboardQuery.data.activeDoctors} Active on duty` : 'Physicians'}
            </p>
          </CardContent>
        </Card>

        {/* 2. Total Patients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            {patientsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : patientsQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {patientsQuery.data?.totalElements ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Registered in directory</p>
          </CardContent>
        </Card>

        {/* 3. Total Appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            {appointmentsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : appointmentsQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {appointmentsQuery.data?.totalElements ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">All-time appointments</p>
          </CardContent>
        </Card>

        {/* 4. Today's Appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Today's Schedule</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : dashboardQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {dashboardQuery.data?.appointmentsToday?.total ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {dashboardQuery.data?.waitingNow != null ? `${dashboardQuery.data.waitingNow} in waiting room` : 'Today'}
            </p>
          </CardContent>
        </Card>

        {/* 5. Total Departments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Departments</CardTitle>
            <Building2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {departmentsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : departmentsQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-2xl font-bold text-foreground">
                {departmentsQuery.data?.length ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Clinical specialties</p>
          </CardContent>
        </Card>

        {/* 6. Revenue / Collections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monthly Revenue</CardTitle>
            <Receipt className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : dashboardQuery.isError ? (
              <div className="text-sm font-semibold text-destructive">N/A</div>
            ) : (
              <div className="text-xl font-bold text-foreground truncate" title={`${dashboardQuery.data?.currency || ''} ${dashboardQuery.data?.collectedThisMonth || '0.00'}`}>
                {dashboardQuery.data?.currency || 'INR'} {dashboardQuery.data?.collectedThisMonth || '0.00'}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              Today: {dashboardQuery.data?.currency || 'INR'} {dashboardQuery.data?.collectedToday || '0.00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visualizations Section */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* 7-Day Revenue Trends Chart */}
        <Card className="lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Revenue & Collections Trend</CardTitle>
              <CardDescription>7-day comparison of invoiced billing vs actual collections</CardDescription>
            </div>
            <Link to="/admin/reports" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
              View Detailed Reports <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {revenueQuery.isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : revenueQuery.isError ? (
              <ErrorState
                title="Failed to load revenue trend"
                message="Could not retrieve revenue figures from backend."
                onRetry={() => revenueQuery.refetch()}
                className="min-h-[220px]"
              />
            ) : revenueChartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm border border-dashed rounded-md">
                <FileBarChart className="h-8 w-8 mb-2 opacity-50" />
                <span>No revenue recorded in this 7-day period.</span>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="period" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} />
                    <Tooltip
                      formatter={(val) => [`${revenueQuery.data?.currency || 'INR'} ${val}`, '']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="Collected" stroke="#10b981" fillOpacity={1} fill="url(#colorCollected)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Invoiced" stroke="#0284c7" fillOpacity={1} fill="url(#colorInvoiced)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Status Distribution Chart */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Today's Appointment Status</CardTitle>
            <CardDescription>Breakdown of today's patient queue state</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardQuery.isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-48 w-48 rounded-full" />
              </div>
            ) : dashboardQuery.isError ? (
              <ErrorState
                title="Failed to load status"
                message="Could not retrieve appointment counts."
                className="min-h-[220px]"
              />
            ) : statusPieData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm border border-dashed rounded-md">
                <Calendar className="h-8 w-8 mb-2 opacity-50" />
                <span>No appointments scheduled today.</span>
              </div>
            ) : (
              <div className="h-64 w-full flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {statusPieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span>{item.name}: <strong>{item.value}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department Workload & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Department Workload Bar Chart */}
        <Card className="lg:col-span-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Department Consultation Load</CardTitle>
              <CardDescription>Appointments distributed across clinical departments (Last 7 Days)</CardDescription>
            </div>
            <Link to="/admin/departments" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
              Departments <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {deptAppointmentsQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : deptAppointmentsQuery.isError ? (
              <ErrorState
                title="Load error"
                message="Unable to load department workload figures."
                className="min-h-[220px]"
              />
            ) : deptChartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm border border-dashed rounded-md">
                <Building2 className="h-8 w-8 mb-2 opacity-50" />
                <span>No department appointment activity recorded.</span>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={10} interval={0} angle={-25} textAnchor="end" />
                    <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Total" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Appointments Monitoring */}
        <Card className="lg:col-span-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Recent Clinical Bookings</CardTitle>
              <CardDescription>Latest appointments scheduled across the hospital</CardDescription>
            </div>
            <Link to="/admin/appointments" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
              All Appointments <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentAppointmentsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : recentAppointmentsQuery.isError ? (
              <ErrorState
                title="Error"
                message="Unable to load recent appointments."
                className="min-h-[200px]"
              />
            ) : (recentAppointmentsQuery.data?.content || []).length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm border border-dashed rounded-md">
                <Calendar className="h-8 w-8 mb-2 opacity-50" />
                <span>No appointments found.</span>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentAppointmentsQuery.data.content.map((apt) => (
                  <div key={apt.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{apt.patientName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Dr. {apt.doctorName} • {new Date(apt.slotStart).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <AppointmentStatusBadge status={apt.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Link to="/admin/departments" className="group">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Building2 className="h-5 w-5 text-primary" />
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
              </div>
              <CardTitle className="text-sm font-semibold mt-2">Departments</CardTitle>
              <CardDescription className="text-xs">Manage medical wings and clinic units</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/doctors" className="group">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Stethoscope className="h-5 w-5 text-primary" />
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
              </div>
              <CardTitle className="text-sm font-semibold mt-2">Doctors</CardTitle>
              <CardDescription className="text-xs">Physician profiles, fees, and active status</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/billing" className="group">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Receipt className="h-5 w-5 text-primary" />
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
              </div>
              <CardTitle className="text-sm font-semibold mt-2">Billing & Invoices</CardTitle>
              <CardDescription className="text-xs">Invoices, payments, and PDF receipts</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/audit-logs" className="group">
          <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
              </div>
              <CardTitle className="text-sm font-semibold mt-2">Audit Trail</CardTitle>
              <CardDescription className="text-xs">Immutable security & clinical log entries</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
