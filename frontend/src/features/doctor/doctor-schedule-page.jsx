import * as React from 'react';
import {
  Calendar,
  Clock,
  CalendarPlus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Building2,
  Stethoscope,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/app/providers/auth.context';
import {
  useDoctor,
  useDoctorSchedules,
  useDoctorLeaves,
  useDoctorSlots,
  useCreateDoctorLeave,
  useDeleteDoctorLeave,
} from '@/hooks/use-doctors';
import { useAppointments } from '@/hooks/use-appointments';
import { useToast } from '@/hooks/use-toast';
import {
  getClinicTodayDateString,
  getClinicDayBounds,
} from '@/lib/utils';

export function DoctorSchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const doctorId = user?.doctorId;

  // Selected date for slot inspector & occupancy (defaults to clinic today)
  const [selectedDate, setSelectedDate] = React.useState(() => getClinicTodayDateString());

  // Modal state for applying leave
  const [leaveModalOpen, setLeaveModalOpen] = React.useState(false);
  const [leaveStartDate, setLeaveStartDate] = React.useState('');
  const [leaveEndDate, setLeaveEndDate] = React.useState('');
  const [leaveReason, setLeaveReason] = React.useState('');
  const [leaveError, setLeaveError] = React.useState(null);

  // Queries
  const doctorQuery = useDoctor(doctorId, { enabled: Boolean(doctorId) });
  const scheduleQuery = useDoctorSchedules(doctorId, { enabled: Boolean(doctorId) });
  const leavesQuery = useDoctorLeaves(doctorId, undefined, undefined, { enabled: Boolean(doctorId) });

  const slotsQuery = useDoctorSlots(doctorId, selectedDate, {
    enabled: Boolean(doctorId && selectedDate),
  });

  const selectedDateBounds = React.useMemo(
    () => getClinicDayBounds(selectedDate),
    [selectedDate]
  );

  const appointmentsQuery = useAppointments(
    {
      doctorId,
      from: selectedDateBounds.start,
      to: selectedDateBounds.end,
      size: 50,
      sort: 'slotStart,asc',
    },
    { enabled: Boolean(doctorId && selectedDate) }
  );

  // Mutations
  const createLeaveMutation = useCreateDoctorLeave();
  const deleteLeaveMutation = useDeleteDoctorLeave();

  // Date Navigation handlers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(getClinicTodayDateString());
  };

  // Leave submission
  const handleOpenLeaveModal = () => {
    setLeaveStartDate(selectedDate);
    setLeaveEndDate(selectedDate);
    setLeaveReason('');
    setLeaveError(null);
    setLeaveModalOpen(true);
  };

  const handleConfirmLeave = async (e) => {
    e.preventDefault();
    if (!leaveStartDate || !leaveEndDate) {
      setLeaveError('Start and End dates are required.');
      return;
    }
    if (new Date(leaveStartDate) > new Date(leaveEndDate)) {
      setLeaveError('Start date cannot be after end date.');
      return;
    }

    setLeaveError(null);
    try {
      await createLeaveMutation.mutateAsync({
        doctorId,
        data: {
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: leaveReason.trim() || undefined,
        },
      });
      toast({
        title: 'Leave Scheduled',
        description: `Leave from ${leaveStartDate} to ${leaveEndDate} recorded.`,
        variant: 'default',
      });
      setLeaveModalOpen(false);
    } catch (err) {
      setLeaveError(err.response?.data?.message || err.message || 'Failed to record leave.');
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled leave?')) return;
    try {
      await deleteLeaveMutation.mutateAsync({ doctorId, leaveId });
      toast({
        title: 'Leave Cancelled',
        description: 'Scheduled leave removed from your roster.',
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Error Cancelling Leave',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      });
    }
  };

  // Compute appointment occupancy metrics
  const slots = Array.isArray(slotsQuery.data)
    ? slotsQuery.data
    : slotsQuery.data?.slots || [];
  const bookedAppointments = appointmentsQuery.data?.content || [];
  const totalSlots = slots.length;
  const availableSlots = slots.filter((s) => s.available).length;
  const bookedSlots = totalSlots - availableSlots;
  const occupancyPercent = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

  // Day of week of selected date
  const selectedDayOfWeek = React.useMemo(() => {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[new Date(selectedDate).getDay()];
  }, [selectedDate]);

  const scheduleForSelectedDay = scheduleQuery.data?.entries?.find(
    (e) => e.dayOfWeek === selectedDayOfWeek
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            My Practice Schedule & Duty Roster
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Weekly consultation hours, daily slot availability, appointment occupancy, and leave management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              scheduleQuery.refetch();
              leavesQuery.refetch();
              slotsQuery.refetch();
              appointmentsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenLeaveModal}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Request Leave
          </Button>
        </div>
      </div>

      {/* Weekly Working Hours Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Weekly Operating Schedule</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {doctorQuery.data?.clinic?.timeZone || 'Asia/Kolkata'}
            </Badge>
          </div>
          <CardDescription>
            Recurring working shifts configured at{' '}
            <strong>{doctorQuery.data?.clinic?.name || 'CareSync Hospital'}</strong> (
            {doctorQuery.data?.slotMinutes || 30}-minute consultation blocks).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheduleQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(
                (day) => {
                  const entry = scheduleQuery.data?.entries?.find((e) => e.dayOfWeek === day);
                  const isToday = day === selectedDayOfWeek;

                  return (
                    <div
                      key={day}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isToday
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : entry
                          ? 'border-border bg-card'
                          : 'border-dashed border-muted bg-muted/20 opacity-70'
                      }`}
                    >
                      <span className="text-xs font-bold text-foreground block uppercase">
                        {day.slice(0, 3)}
                      </span>
                      {entry ? (
                        <>
                          <Badge variant="success" className="text-[10px] mt-1.5 px-1.5 py-0">
                            Active
                          </Badge>
                          <p className="text-xs font-mono font-semibold text-foreground mt-2">
                            {entry.startTime} – {entry.endTime}
                          </p>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="text-[10px] mt-1.5 px-1.5 py-0 text-muted-foreground">
                            Off
                          </Badge>
                          <p className="text-xs text-muted-foreground italic mt-2">No shift</p>
                        </>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Date Navigation & Slot Inspector */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left 2 Cols: Slot Inspector & Appointment Occupancy */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Daily Slot Occupancy & Consultations
                </CardTitle>
                <CardDescription>
                  Live slot availability and patient booking occupancy for {selectedDate} ({selectedDayOfWeek})
                  {scheduleForSelectedDay ? ` · Roster: ${scheduleForSelectedDay.startTime?.slice(0, 5)} - ${scheduleForSelectedDay.endTime?.slice(0, 5)}` : ' · Off Duty'}
                </CardDescription>
              </div>

              {/* Date Controls */}
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon" onClick={handlePrevDay} aria-label="Previous day">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  className="w-auto h-9 text-xs font-mono"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                <Button variant="outline" size="icon" onClick={handleNextDay} aria-label="Next day">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={handleToday} className="text-xs">
                  Today
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Occupancy Indicator Banner */}
            {totalSlots > 0 && (
              <div className="p-3 rounded-lg border bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span>
                    Occupancy: <strong className="text-foreground">{occupancyPercent}%</strong> ({bookedSlots} of {totalSlots} slots)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Available ({availableSlots})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Booked ({bookedSlots})
                  </span>
                </div>
              </div>
            )}

            {/* Slots Result State */}
            {slotsQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 text-xs text-rose-700">
                {slotsQuery.error?.response?.data?.message || 'Failed to generate slots for this date.'}
              </div>
            ) : slotsQuery.data?.closedReason ? (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Clinic Closed / Unavailable on this Date: {slotsQuery.data.closedReason}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {slotsQuery.data.closedReason === 'NO_SCHEDULE' && 'No scheduled working shift on this day.'}
                  {slotsQuery.data.closedReason === 'ON_LEAVE' && 'You have an approved leave scheduled for this date.'}
                  {slotsQuery.data.closedReason === 'OUTSIDE_BOOKING_WINDOW' && 'Outside advance booking window.'}
                  {slotsQuery.data.closedReason === 'DOCTOR_INACTIVE' && 'Physician profile is marked inactive.'}
                </p>
              </div>
            ) : totalSlots === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">
                No slots generated for this date.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-96 overflow-y-auto p-1">
                {slots.map((slot, idx) => {
                  const startStr = new Date(slot.start).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const endStr = new Date(slot.end).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  // Check if there is a matching booked appointment
                  const matchedApp = bookedAppointments.find(
                    (a) => new Date(a.slotStart).getTime() === new Date(slot.start).getTime()
                  );

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs transition-all ${
                        slot.available
                          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10'
                          : 'border-primary/30 bg-primary/5'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-foreground">{startStr}</span>
                        <span className="text-[10px] text-muted-foreground">{endStr}</span>
                      </div>

                      {matchedApp ? (
                        <div className="mt-1.5 pt-1.5 border-t border-border/50">
                          <p className="font-semibold text-foreground truncate text-[11px]">
                            {matchedApp.patientName}
                          </p>
                          <Badge
                            variant={
                              matchedApp.status === 'IN_CONSULTATION'
                                ? 'success'
                                : matchedApp.status === 'CHECKED_IN'
                                ? 'warning'
                                : matchedApp.status === 'COMPLETED'
                                ? 'secondary'
                                : 'outline'
                            }
                            className="text-[9px] px-1 py-0 mt-0.5"
                          >
                            {matchedApp.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-2 font-medium">
                          {slot.available ? '✓ Slot Open' : 'Booked'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right 1 Col: Leaves & Time Off Management */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-base font-semibold">Approved Leaves</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={handleOpenLeaveModal} className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            <CardDescription>Scheduled leave exceptions and time off</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {leavesQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !leavesQuery.data || leavesQuery.data.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                No upcoming leaves scheduled.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {leavesQuery.data.map((leave) => (
                  <div
                    key={leave.id}
                    className="p-3 rounded-lg border border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-rose-800 dark:text-rose-300">
                          {leave.startDate} to {leave.endDate}
                        </span>
                        <Badge variant="outline" className="text-rose-700 border-rose-300 text-[9px] px-1">
                          On Leave
                        </Badge>
                      </div>
                      {leave.reason && (
                        <p className="text-[11px] text-muted-foreground mt-1">{leave.reason}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteLeave(leave.id)}
                      disabled={deleteLeaveMutation.isPending}
                      aria-label="Delete leave"
                      className="h-7 w-7 text-rose-600 hover:text-rose-800 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Apply Leave Modal */}
      <Dialog open={leaveModalOpen} onOpenChange={setLeaveModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              <span>Record Scheduled Leave</span>
            </DialogTitle>
            <DialogDescription>
              Mark dates as unavailable. Existing appointment booking windows will automatically close.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmLeave} className="space-y-4 py-2">
            {leaveError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {leaveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  End Date *
                </label>
                <Input
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Reason (Optional)
              </label>
              <Input
                placeholder="e.g. Annual Medical Conference, Personal Leave"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                maxLength={255}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLeaveModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createLeaveMutation.isPending}>
                {createLeaveMutation.isPending ? 'Saving...' : 'Record Leave'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
