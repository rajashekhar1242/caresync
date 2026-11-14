import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  PhoneCall,
  Activity,
  History,
  Building2,
  Stethoscope,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/app/providers/auth.context';
import { useDoctor, useDoctorSchedules } from '@/hooks/use-doctors';
import { useAppointments } from '@/hooks/use-appointments';
import { useDoctorQueue, useCallNext } from '@/hooks/use-queue';
import { useToast } from '@/hooks/use-toast';
import { getClinicTodayDateString, getClinicDayBounds, formatDateTime } from '@/lib/utils';

export function DoctorHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const doctorId = user?.doctorId;

  // Clinic date bounds
  const todayStr = React.useMemo(() => getClinicTodayDateString(), []);
  const todayBounds = React.useMemo(() => getClinicDayBounds(todayStr), [todayStr]);

  // Queries
  const doctorQuery = useDoctor(doctorId, { enabled: Boolean(doctorId) });
  const queueQuery = useDoctorQueue(doctorId, { enabled: Boolean(doctorId) });
  const scheduleQuery = useDoctorSchedules(doctorId, { enabled: Boolean(doctorId) });

  const todayAppointmentsQuery = useAppointments(
    {
      doctorId,
      from: todayBounds.start,
      to: todayBounds.end,
      size: 50,
      sort: 'slotStart,asc',
    },
    { enabled: Boolean(doctorId) }
  );

  const callNextMutation = useCallNext();

  const handleCallNext = async () => {
    if (!doctorId) return;
    try {
      const res = await callNextMutation.mutateAsync(doctorId);
      toast({
        title: 'Patient Called',
        description: res.nowServing
          ? `Token #${res.nowServing.tokenNumber} (${res.nowServing.patientName}) called into consultation.`
          : 'Next patient called.',
        variant: 'default',
      });
      if (res.nowServing?.appointmentId) {
        navigate(`/doctor/consultations?appointmentId=${res.nowServing.appointmentId}`);
      }
    } catch (err) {
      toast({
        title: 'Unable to Call Patient',
        description: err.response?.data?.message || err.message || 'Error advancing queue',
        variant: 'destructive',
      });
    }
  };

  // Derive metrics
  const appointments = todayAppointmentsQuery.data?.content || [];
  const waitingAppointments = appointments.filter((a) => a.status === 'CHECKED_IN');
  const inConsultationAppointments = appointments.filter((a) => a.status === 'IN_CONSULTATION');
  const completedAppointments = appointments.filter((a) => a.status === 'COMPLETED');

  // Derive today's working schedule
  const todayDayOfWeek = React.useMemo(() => {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[new Date().getDay()];
  }, []);

  const todayScheduleEntry = scheduleQuery.data?.entries?.find(
    (e) => e.dayOfWeek === todayDayOfWeek
  );

  const handleRefreshAll = () => {
    doctorQuery.refetch();
    queueQuery.refetch();
    todayAppointmentsQuery.refetch();
    scheduleQuery.refetch();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Physician Clinical Console
            </h1>
            <Badge variant="outline" className="text-xs">
              Live Operations
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Logged in as <strong className="text-foreground">{user?.fullName}</strong>
            {doctorQuery.data?.specialization?.name ? ` · ${doctorQuery.data.specialization.name}` : ''}
            {doctorQuery.data?.clinic?.name ? ` · ${doctorQuery.data.clinic.name}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={todayAppointmentsQuery.isFetching || queueQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                todayAppointmentsQuery.isFetching || queueQuery.isFetching ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/doctor/consultations')}
            className="bg-primary hover:bg-primary/90"
          >
            <Stethoscope className="h-4 w-4 mr-2" />
            Clinical Workspace
          </Button>
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Today's Total Appointments */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Today's Schedule
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {todayAppointmentsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {appointments.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {appointments.length} booked for today ({todayStr})
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Waiting in Queue */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Waiting in Queue
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {queueQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  {queueQuery.data?.waitingCount ?? waitingAppointments.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Checked-in tokens waiting in room
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* In Consultation */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Now In Consultation
            </CardTitle>
            <Activity className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {queueQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {queueQuery.data?.nowServing
                    ? `Token #${queueQuery.data.nowServing.tokenNumber}`
                    : inConsultationAppointments.length > 0
                    ? `${inConsultationAppointments.length} Active`
                    : 'None'}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {queueQuery.data?.nowServing
                    ? queueQuery.data.nowServing.patientName
                    : inConsultationAppointments[0]?.patientName
                    ? `${inConsultationAppointments[0].patientName} in progress`
                    : 'Consultation room available'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completed Consultations */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Today
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {todayAppointmentsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {completedAppointments.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Finalized clinical encounters
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hero Live Queue / Calling Panel */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Patient Calling Hero */}
        <Card className="md:col-span-2 shadow-sm border-primary/20 bg-gradient-to-br from-card to-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Active Consultation Room & Queue
                </CardTitle>
              </div>
              <Link
                to="/doctor/queue"
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                Full Queue View <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <CardDescription>
              Call checked-in patients into consultation or resume active encounter documentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {queueQuery.isLoading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : queueQuery.data?.nowServing ? (
              <div className="p-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" className="font-mono text-xs">
                      NOW SERVING
                    </Badge>
                    <span className="text-lg font-bold text-foreground">
                      Token #{queueQuery.data.nowServing.tokenNumber}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground text-base mt-1">
                    {queueQuery.data.nowServing.patientName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Checked in: {formatDateTime(queueQuery.data.nowServing.checkedInAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/doctor/consultations?appointmentId=${queueQuery.data.nowServing.appointmentId}`
                      )
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Open Consultation Workspace
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground text-sm">
                    No Patient Currently in Consultation
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {queueQuery.data?.waitingCount && queueQuery.data.waitingCount > 0
                      ? `${queueQuery.data.waitingCount} patient(s) waiting in room.`
                      : 'Waiting room queue is currently empty.'}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleCallNext}
                  disabled={
                    callNextMutation.isPending ||
                    !queueQuery.data?.waitingCount ||
                    queueQuery.data.waitingCount === 0
                  }
                  className="bg-primary hover:bg-primary/90"
                >
                  <PhoneCall className="h-4 w-4 mr-2" />
                  {callNextMutation.isPending ? 'Calling...' : 'Call Next Patient'}
                </Button>
              </div>
            )}

            {/* Next in Queue Preview */}
            {queueQuery.data?.next && queueQuery.data.next.length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Up Next in Waiting Room:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {queueQuery.data.next.slice(0, 3).map((item) => (
                    <div
                      key={item.appointmentId}
                      className="p-2.5 rounded border border-border bg-card text-xs flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-mono font-bold text-foreground">
                          #{item.tokenNumber}
                        </span>{' '}
                        <span className="truncate text-foreground font-medium">
                          {item.patientName}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Waiting
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule & Shift Info */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base font-semibold">Today's Duty Hours</CardTitle>
            </div>
            <CardDescription>Roster hours from weekly clinic schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scheduleQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : todayScheduleEntry ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      {todayDayOfWeek}
                    </span>
                    <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px]">
                      On Duty
                    </Badge>
                  </div>
                  <p className="text-lg font-mono font-bold text-foreground mt-1">
                    {todayScheduleEntry.startTime} – {todayScheduleEntry.endTime}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {doctorQuery.data?.slotMinutes || 30}-min slots · {doctorQuery.data?.clinic?.timeZone || 'Asia/Kolkata'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                No working shift configured for {todayDayOfWeek}.
              </div>
            )}

            <div className="pt-2 border-t flex flex-col gap-2">
              <Link
                to="/doctor/schedules"
                className="text-xs font-semibold text-primary hover:underline flex items-center justify-between"
              >
                <span>View Complete Schedule & Leaves</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Appointments Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Today's Appointments Roster</CardTitle>
            <CardDescription>
              Real-time patient schedule for {todayStr}
            </CardDescription>
          </div>
          <Link
            to="/doctor/consultations"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            Workspace <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {todayAppointmentsQuery.isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No appointments scheduled for today.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appointments.map((app) => {
                    const startStr = new Date(app.slotStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr key={app.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-medium text-foreground whitespace-nowrap">
                          {startStr}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {app.tokenNumber ? `#${app.tokenNumber}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-foreground">
                            {app.patientName}
                          </span>
                          {app.reason && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">
                              {app.reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge
                            variant={
                              app.status === 'IN_CONSULTATION'
                                ? 'success'
                                : app.status === 'CHECKED_IN'
                                ? 'warning'
                                : app.status === 'COMPLETED'
                                ? 'secondary'
                                : app.status === 'CANCELLED'
                                ? 'destructive'
                                : 'outline'
                            }
                            className="text-xs capitalize"
                          >
                            {app.status.toLowerCase().replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {app.status === 'IN_CONSULTATION' ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => navigate(`/doctor/consultations?appointmentId=${app.id}`)}
                            >
                              Resume
                            </Button>
                          ) : app.status === 'CHECKED_IN' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/doctor/consultations?appointmentId=${app.id}`)}
                            >
                              Start Consult
                            </Button>
                          ) : app.status === 'COMPLETED' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/doctor/history?appointmentId=${app.id}`)}
                            >
                              View Notes
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
