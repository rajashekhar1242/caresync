import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CalendarPlus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  UserCheck,
  Clock,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, AppointmentStatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Pagination } from '@/components/ui/pagination';
import {
  useAppointments,
  useCheckInAppointment,
  useCancelAppointment,
  useUpdateAppointmentStatus,
} from '@/hooks/use-appointments';
import { useDoctors } from '@/hooks/use-doctors';
import { useToast } from '@/hooks/use-toast';

export function AppointmentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Filters state
  const [selectedStatus, setSelectedStatus] = React.useState(searchParams.get('status') || '');
  const [selectedDoctorId, setSelectedDoctorId] = React.useState(searchParams.get('doctorId') || '');
  const [selectedDate, setSelectedDate] = React.useState(searchParams.get('date') || '');
  const [page, setPage] = React.useState(0);
  const pageSize = 15;

  // Selected appointment for details modal & action dialogs
  const [detailAppt, setDetailAppt] = React.useState(null);
  const [checkInAppt, setCheckInAppt] = React.useState(null);
  const [cancelAppt, setCancelAppt] = React.useState(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [noShowAppt, setNoShowAppt] = React.useState(null);

  // Derive date bounds if selectedDate is set
  const dateBounds = React.useMemo(() => {
    if (!selectedDate) return { from: undefined, to: undefined };
    const from = `${selectedDate}T00:00:00Z`;
    const to = `${selectedDate}T23:59:59Z`;
    return { from, to };
  }, [selectedDate]);

  // Query appointments
  const appointmentsQuery = useAppointments({
    status: selectedStatus || undefined,
    doctorId: selectedDoctorId || undefined,
    from: dateBounds.from,
    to: dateBounds.to,
    page,
    size: pageSize,
    sort: 'slotStart,desc',
  });

  const doctorsQuery = useDoctors({ size: 100 });

  // Mutations
  const checkInMutation = useCheckInAppointment();
  const cancelMutation = useCancelAppointment();
  const updateStatusMutation = useUpdateAppointmentStatus();

  const appointments = appointmentsQuery.data?.content || [];
  const totalPages = appointmentsQuery.data?.totalPages || 0;
  const totalElements = appointmentsQuery.data?.totalElements || 0;
  const doctors = doctorsQuery.data?.content || [];

  const handleCheckInConfirm = async () => {
    if (!checkInAppt) return;
    try {
      const res = await checkInMutation.mutateAsync(checkInAppt.id);
      toast({
        title: 'Check-In Successful',
        description: `Token #${res.tokenNumber || '—'} generated for ${res.patientName}.`,
        variant: 'default',
      });
      setCheckInAppt(null);
    } catch (err) {
      toast({
        title: 'Check-In Failed',
        description: err.response?.data?.message || 'Could not complete check-in.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelAppt) return;
    try {
      await cancelMutation.mutateAsync({
        appointmentId: cancelAppt.id,
        reason: cancelReason || 'Cancelled at front desk',
      });
      toast({
        title: 'Appointment Cancelled',
        description: `Appointment for ${cancelAppt.patientName} has been cancelled.`,
        variant: 'default',
      });
      setCancelAppt(null);
      setCancelReason('');
    } catch (err) {
      toast({
        title: 'Cancellation Failed',
        description: err.response?.data?.message || 'Could not cancel appointment.',
        variant: 'destructive',
      });
    }
  };

  const handleNoShowConfirm = async () => {
    if (!noShowAppt) return;
    try {
      await updateStatusMutation.mutateAsync({
        appointmentId: noShowAppt.id,
        status: 'NO_SHOW',
      });
      toast({
        title: 'Marked as No-Show',
        description: `Encounter marked as NO_SHOW for ${noShowAppt.patientName}.`,
        variant: 'default',
      });
      setNoShowAppt(null);
    } catch (err) {
      toast({
        title: 'Failed to update status',
        description: err.response?.data?.message || 'Cannot mark NO_SHOW at this time.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Appointments Desk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor hospital encounters, execute arrivals, and manage patient appointments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appointmentsQuery.refetch()}
            disabled={appointmentsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${appointmentsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/receptionist/appointments/book')}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Book Appointment
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Filter by Status:
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All Statuses</option>
                <option value="BOOKED">BOOKED</option>
                <option value="CHECKED_IN">CHECKED_IN</option>
                <option value="IN_CONSULTATION">IN_CONSULTATION</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="NO_SHOW">NO_SHOW</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Filter by Physician:
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedDoctorId}
                onChange={(e) => {
                  setSelectedDoctorId(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All Physicians</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fullName} ({doc.specialization?.name || 'General'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Encounter Date:
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground h-10"
                onClick={() => {
                  setSelectedStatus('');
                  setSelectedDoctorId('');
                  setSelectedDate('');
                  setPage(0);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appointments Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Appointment Schedule</CardTitle>
            <CardDescription>{totalElements} total appointments found.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {appointmentsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : appointmentsQuery.isError ? (
            <ErrorState
              title="Failed to Load Appointments"
              description={appointmentsQuery.error?.message || 'Could not retrieve appointments.'}
              retryAction={() => appointmentsQuery.refetch()}
            />
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Appointments Found"
              description="No encounters match the selected filter criteria."
              actionLabel="Book New Appointment"
              onAction={() => navigate('/receptionist/appointments/book')}
            />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground text-left">
                      <th className="pb-3 font-semibold">Date & Time</th>
                      <th className="pb-3 font-semibold">Patient</th>
                      <th className="pb-3 font-semibold">Physician</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Token</th>
                      <th className="pb-3 font-semibold text-right">Desk Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {appointments.map((appt) => {
                      const slotDate = new Date(appt.slotStart);
                      const dateStr = slotDate.toLocaleDateString();
                      const timeStr = slotDate.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const isBooked = appt.status === 'BOOKED';
                      const isPastSlot = new Date() >= slotDate;

                      return (
                        <tr key={appt.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 font-medium whitespace-nowrap">
                            <span className="font-semibold text-foreground">{dateStr}</span>
                            <span className="font-mono text-xs text-muted-foreground ml-2 bg-muted/60 px-1.5 py-0.5 rounded">
                              {timeStr}
                            </span>
                          </td>
                          <td className="py-3 font-medium">
                            <div className="truncate max-w-[150px]">{appt.patientName}</div>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            <div className="truncate max-w-[140px]">{appt.doctorName}</div>
                          </td>
                          <td className="py-3">
                            <AppointmentStatusBadge status={appt.status} />
                          </td>
                          <td className="py-3 font-mono font-semibold">
                            {appt.tokenNumber ? (
                              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-xs">
                                #{appt.tokenNumber}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={() => setDetailAppt(appt)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Details
                              </Button>

                              {isBooked && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs px-2.5 bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={() => setCheckInAppt(appt)}
                                  >
                                    Check In
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() => setCancelAppt(appt)}
                                  >
                                    Cancel
                                  </Button>
                                  {isPastSlot && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs px-2 text-slate-600 hover:bg-slate-100"
                                      onClick={() => setNoShowAppt(appt)}
                                    >
                                      No-Show
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pt-2 border-t">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={(p) => setPage(p)}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment Detail Modal */}
      <Dialog open={Boolean(detailAppt)} onOpenChange={(open) => !open && setDetailAppt(null)}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Appointment Record Details</span>
              <AppointmentStatusBadge status={detailAppt?.status} />
            </DialogTitle>
            <DialogDescription>Hospital encounter record and status history.</DialogDescription>
          </DialogHeader>

          {detailAppt && (
            <div className="space-y-4 py-2 text-sm">
              <div className="p-3.5 rounded-lg bg-muted/40 border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Appointment ID:</span>
                  <span className="font-mono text-foreground font-semibold">{detailAppt.id}</span>
                </div>
                {detailAppt.tokenNumber && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t">
                    <span className="text-muted-foreground">Issued Queue Token:</span>
                    <span className="font-bold text-amber-600 text-sm">#{detailAppt.tokenNumber}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Patient:</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5">{detailAppt.patientName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Physician:</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5">Dr. {detailAppt.doctorName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Slot Start:</span>
                  <p className="font-medium text-foreground mt-0.5 font-mono">
                    {new Date(detailAppt.slotStart).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Slot End:</span>
                  <p className="font-medium text-foreground mt-0.5 font-mono">
                    {new Date(detailAppt.slotEnd).toLocaleString()}
                  </p>
                </div>
              </div>

              {detailAppt.reason && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Chief Complaint / Visit Reason:</span>
                  <p className="text-sm text-foreground mt-0.5 bg-muted/30 p-2.5 rounded border">
                    {detailAppt.reason}
                  </p>
                </div>
              )}

              {detailAppt.cancellationReason && (
                <div className="pt-2 border-t">
                  <span className="text-xs font-semibold text-rose-600">Cancellation Reason:</span>
                  <p className="text-xs text-rose-700 mt-0.5 bg-rose-50 p-2 rounded border border-rose-200">
                    {detailAppt.cancellationReason}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetailAppt(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-In Dialog */}
      <ConfirmationDialog
        open={Boolean(checkInAppt)}
        onOpenChange={(open) => !open && setCheckInAppt(null)}
        title="Check-In Patient"
        description={`Confirm arrival of ${checkInAppt?.patientName} for Dr. ${checkInAppt?.doctorName}? This will issue a queue token.`}
        confirmText="Confirm Check-In"
        onConfirm={handleCheckInConfirm}
        isLoading={checkInMutation.isPending}
      />

      {/* Cancel Dialog */}
      <Dialog open={Boolean(cancelAppt)} onOpenChange={(open) => !open && setCancelAppt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Provide an administrative or patient reason. Note: Appointments can only be cancelled at least 2 hours before the scheduled slot start.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-muted-foreground">Reason for cancellation:</label>
            <Input
              placeholder="e.g. Patient rescheduled / personal emergency"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelAppt(null)}>
              Abort
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelConfirm}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-Show Dialog */}
      <ConfirmationDialog
        open={Boolean(noShowAppt)}
        onOpenChange={(open) => !open && setNoShowAppt(null)}
        title="Mark Encounter as No-Show"
        description={`Mark appointment for ${noShowAppt?.patientName} as NO_SHOW? This records that the patient did not attend the scheduled slot.`}
        confirmText="Confirm No-Show"
        variant="destructive"
        onConfirm={handleNoShowConfirm}
        isLoading={updateStatusMutation.isPending}
      />
    </div>
  );
}
