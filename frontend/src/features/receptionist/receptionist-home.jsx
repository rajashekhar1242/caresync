import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  UserPlus,
  CheckCircle2,
  CalendarPlus,
  Stethoscope,
  Users,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  UserCheck,
  Building2,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, AppointmentStatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/app/providers/auth.context';
import { useAppointments, useCheckInAppointment, useCancelAppointment } from '@/hooks/use-appointments';
import { useDoctors, useClinics } from '@/hooks/use-doctors';
import { useQueueBoard } from '@/hooks/use-queue';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { getClinicDayBounds } from '@/lib/utils';

export function ReceptionistHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Selected clinic state for queue board
  const [selectedClinicId, setSelectedClinicId] = React.useState(null);
  const [checkInModalAppt, setCheckInModalAppt] = React.useState(null);
  const [cancelModalAppt, setCancelModalAppt] = React.useState(null);
  const [cancelReason, setCancelReason] = React.useState('');

  // Calculate today's ISO bounds in clinic timezone (Asia/Kolkata)
  const todayBounds = React.useMemo(() => getClinicDayBounds(), []);

  // Live queries using real backend endpoints
  const appointmentsQuery = useAppointments({
    from: todayBounds.start,
    to: todayBounds.end,
    size: 100,
    sort: 'slotStart,asc',
  });

  const doctorsQuery = useDoctors({ size: 100 });
  const clinicsQuery = useClinics();

  // Set default clinic when loaded
  React.useEffect(() => {
    if (clinicsQuery.data && clinicsQuery.data.length > 0 && !selectedClinicId) {
      setSelectedClinicId(clinicsQuery.data[0].id);
    }
  }, [clinicsQuery.data, selectedClinicId]);

  const queueBoardQuery = useQueueBoard(selectedClinicId, {
    enabled: Boolean(selectedClinicId),
  });

  // Mutations
  const checkInMutation = useCheckInAppointment();
  const cancelMutation = useCancelAppointment();

  const appointments = appointmentsQuery.data?.content || [];
  const doctors = doctorsQuery.data?.content || [];

  // Derived real KPI metrics - honoring pagination totalElements and active vs cancelled separation
  const totalAppointments = appointmentsQuery.data?.totalElements ?? appointments.length;
  const activeAppointments = appointments.filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');
  const checkedInCount = appointments.filter((a) => a.status === 'CHECKED_IN').length;
  const inConsultationCount = appointments.filter((a) => a.status === 'IN_CONSULTATION').length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;
  const cancelledCount = appointments.filter((a) => a.status === 'CANCELLED').length;
  const activeDoctorsCount = doctors.filter((d) => d.active).length;
  const isLargeVolume = (appointmentsQuery.data?.totalElements || 0) > appointments.length;

  const handleConfirmCheckIn = async () => {
    if (!checkInModalAppt) return;
    try {
      const updated = await checkInMutation.mutateAsync(checkInModalAppt.id);
      toast({
        title: 'Patient Checked In',
        description: `Token #${updated.tokenNumber || '—'} assigned for ${updated.patientName}.`,
        variant: 'default',
      });
      setCheckInModalAppt(null);
    } catch (err) {
      toast({
        title: 'Check-in Failed',
        description: err.response?.data?.message || 'Could not check in patient.',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalAppt) return;
    try {
      await cancelMutation.mutateAsync({
        appointmentId: cancelModalAppt.id,
        reason: cancelReason || 'Patient requested cancellation at reception desk',
      });
      toast({
        title: 'Appointment Cancelled',
        description: `Appointment for ${cancelModalAppt.patientName} has been cancelled.`,
        variant: 'default',
      });
      setCancelModalAppt(null);
      setCancelReason('');
    } catch (err) {
      toast({
        title: 'Cancellation Failed',
        description: err.response?.data?.message || 'Could not cancel appointment.',
        variant: 'destructive',
      });
    }
  };

  const isLoading = appointmentsQuery.isLoading || doctorsQuery.isLoading;
  const isError = appointmentsQuery.isError || doctorsQuery.isError;

  if (isError) {
    const errorMsg =
      appointmentsQuery.error?.message ||
      doctorsQuery.error?.message ||
      'An error occurred while loading front desk data.';
    return (
      <div className="p-6">
        <ErrorState
          title="Failed to Load Front Desk Data"
          description={errorMsg}
          retryAction={() => {
            appointmentsQuery.refetch();
            doctorsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Receptionist Front Desk</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Live Operations
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Logged in as <span className="font-semibold text-foreground">{user?.fullName}</span>. Patient intake, daily appointments, check-in, and waiting queue monitor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              appointmentsQuery.refetch();
              doctorsQuery.refetch();
              if (selectedClinicId) queueBoardQuery.refetch();
            }}
            disabled={appointmentsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${appointmentsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/receptionist/check-in')}>
            <UserCheck className="h-4 w-4 mr-2" />
            Fast Check-In
          </Button>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* Today's Appointments */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Today's Schedule
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalAppointments}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {activeAppointments.length} active · {cancelledCount} cancelled
            </p>
          </CardContent>
        </Card>

        {/* Checked-In Patients */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Checked-In
            </CardTitle>
            <UserCheck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {checkedInCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Tokens issued & waiting</p>
          </CardContent>
        </Card>

        {/* In Consultation */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In Consultation
            </CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {inConsultationCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Currently with physician</p>
          </CardContent>
        </Card>

        {/* Completed Encounters */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {completedCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Encounters finalized</p>
          </CardContent>
        </Card>

        {/* Cancelled Encounters */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Cancelled
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {cancelledCount}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Cancelled by patient/desk</p>
          </CardContent>
        </Card>

        {/* Active Doctors */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Physicians
            </CardTitle>
            <Stethoscope className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-foreground">{activeDoctorsCount}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Registered active staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Honest Pagination Notice for Large Volumes */}
      {isLargeVolume && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Displaying the first 100 of <strong>{totalAppointments}</strong> total encounters for today. Status breakdowns reflect this page; visit the Appointments roster for full pagination.
          </span>
        </div>
      )}

      {/* Section D: Quick Actions Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-1 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => navigate('/receptionist/patients/register')}
        >
          <UserPlus className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Register Patient</span>
        </Button>

        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-1 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => navigate('/receptionist/appointments/book')}
        >
          <CalendarPlus className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Book Appointment</span>
        </Button>

        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-1 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => navigate('/receptionist/check-in')}
        >
          <UserCheck className="h-5 w-5 text-amber-500" />
          <span className="font-semibold text-sm">Patient Check-In</span>
        </Button>

        <Button
          variant="outline"
          className="h-20 flex flex-col items-center justify-center gap-1 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => navigate('/receptionist/queue')}
        >
          <Clock className="h-5 w-5 text-purple-500" />
          <span className="font-semibold text-sm">Waiting Queue</span>
        </Button>
      </div>

      {/* Main Grid: Schedule Table + Live Waiting Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section A: Today's Appointment Schedule (2 cols on lg) */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Today's Appointments Roster</CardTitle>
              <CardDescription>
                Chronological list of patient encounters scheduled for today.
              </CardDescription>
            </div>
            <Link
              to="/receptionist/appointments"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              All Appointments <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/20">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No appointments booked for today yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the booking desk to schedule a patient slot.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate('/receptionist/appointments/book')}
                >
                  <CalendarPlus className="h-4 w-4 mr-1.5" /> Book First Appointment
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground text-left">
                      <th className="pb-3 font-semibold">Time</th>
                      <th className="pb-3 font-semibold">Patient</th>
                      <th className="pb-3 font-semibold">Physician</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold text-right">Desk Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {appointments.slice(0, 8).map((appt) => {
                      const slotDate = new Date(appt.slotStart);
                      const timeStr = slotDate.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isBooked = appt.status === 'BOOKED';

                      return (
                        <tr key={appt.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 font-medium whitespace-nowrap">
                            <span className="font-mono bg-muted/50 px-2 py-0.5 rounded text-xs">
                              {timeStr}
                            </span>
                          </td>
                          <td className="py-3 font-medium">
                            <div className="truncate max-w-[140px] md:max-w-[180px]">
                              {appt.patientName}
                            </div>
                            {appt.tokenNumber && (
                              <div className="text-[11px] font-semibold text-amber-600">
                                Token #{appt.tokenNumber}
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            <div className="truncate max-w-[120px] md:max-w-[150px]">
                              {appt.doctorName}
                            </div>
                          </td>
                          <td className="py-3">
                            <AppointmentStatusBadge status={appt.status} />
                          </td>
                          <td className="py-3 text-right">
                            {isBooked ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs px-2.5 bg-amber-600 hover:bg-amber-700 text-white"
                                  onClick={() => setCheckInModalAppt(appt)}
                                >
                                  Check In
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => setCancelModalAppt(appt)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : appt.status === 'CHECKED_IN' ? (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                In Waiting Area
                              </Badge>
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

        {/* Section B: Live Waiting Room Queue (1 col on lg) */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Waiting Room Queue</CardTitle>
              <CardDescription>Patients currently checked in</CardDescription>
            </div>
            <Link
              to="/receptionist/queue"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Queue Room <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {appointments.filter((a) => a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION')
              .length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                <Clock className="h-7 w-7 mx-auto mb-2 opacity-40 text-muted-foreground" />
                <p className="text-sm font-medium">Waiting Room is Empty</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Arriving patients checked in at the desk will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments
                  .filter((a) => a.status === 'IN_CONSULTATION' || a.status === 'CHECKED_IN')
                  .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0))
                  .slice(0, 6)
                  .map((appt) => {
                    const isInConsultation = appt.status === 'IN_CONSULTATION';

                    return (
                      <div
                        key={appt.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isInConsultation
                            ? 'bg-purple-50/50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800'
                            : 'bg-card border-border hover:border-primary/40'
                        } transition-colors`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
                              isInConsultation
                                ? 'bg-purple-600 text-white'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                            }`}
                          >
                            #{appt.tokenNumber || '—'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate text-foreground">
                              {appt.patientName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Dr. {appt.doctorName}
                            </p>
                          </div>
                        </div>

                        <div>
                          {isInConsultation ? (
                            <Badge className="bg-purple-600 text-white text-[11px]">
                              In Cabin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[11px]">
                              Waiting
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section C: Doctor Availability Snapshot */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Physician Availability Roster</CardTitle>
            <CardDescription>
              Physicians directory, active clinic branches, and booking shortcuts.
            </CardDescription>
          </div>
          <Link
            to="/receptionist/doctors"
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
          >
            Schedules & Slots <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {doctors.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              No physicians configured in the system.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctors.slice(0, 6).map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col justify-between p-4 rounded-lg border bg-card hover:border-primary/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm text-foreground truncate">{doc.fullName}</h4>
                      {doc.active ? (
                        <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] bg-muted text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-primary font-medium">{doc.specialization?.name || 'General Medicine'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.department?.name || 'Internal Clinic'}</p>
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      Fee: {doc.consultationFee} · {doc.slotMinutes}m slots
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {doc.clinic?.name || 'Main Clinic'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => navigate(`/receptionist/appointments/book?doctorId=${doc.id}`)}
                    >
                      Book Slot
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-In Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(checkInModalAppt)}
        onOpenChange={(open) => !open && setCheckInModalAppt(null)}
        title="Confirm Patient Arrival"
        description={`Check in ${checkInModalAppt?.patientName} for Dr. ${checkInModalAppt?.doctorName}? This will issue the next sequential queue token number.`}
        confirmText="Confirm Check-In"
        onConfirm={handleConfirmCheckIn}
        isLoading={checkInMutation.isPending}
      />

      {/* Cancellation Dialog */}
      {cancelModalAppt && (
        <ConfirmationDialog
          open={Boolean(cancelModalAppt)}
          onOpenChange={(open) => !open && setCancelModalAppt(null)}
          title="Cancel Appointment"
          description={`Are you sure you want to cancel the appointment for ${cancelModalAppt.patientName}? (Note: Appointments can only be cancelled at least 2 hours before the slot).`}
          confirmText="Cancel Appointment"
          variant="destructive"
          onConfirm={handleConfirmCancel}
          isLoading={cancelMutation.isPending}
        />
      )}
    </div>
  );
}
