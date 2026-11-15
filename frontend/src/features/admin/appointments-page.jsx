import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Search,
  Filter,
  Eye,
  XCircle,
  Clock,
  User,
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, AppointmentStatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAppointments, useCancelAppointment } from '@/hooks/use-appointments';
import { useDoctors } from '@/hooks/use-doctors';
import { getStartOfDayUtc, getExclusiveEndOfDayUtc } from '@/lib/utils';

export function AppointmentsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters state initialized from URL searchParams
  const [statusFilter, setStatusFilter] = React.useState(() => searchParams.get('status') || '');
  const [doctorFilter, setDoctorFilter] = React.useState(() => searchParams.get('doctorId') || '');
  const [patientFilter, setPatientFilter] = React.useState(() => searchParams.get('patientId') || '');
  const [fromDate, setFromDate] = React.useState(() => searchParams.get('fromDate') || '');
  const [toDate, setToDate] = React.useState(() => searchParams.get('toDate') || '');
  const [page, setPage] = React.useState(0);

  // Sync state if searchParams change externally (navigation, Back/Forward, parameter removal)
  React.useEffect(() => {
    const s = searchParams.get('status') || '';
    const d = searchParams.get('doctorId') || '';
    const p = searchParams.get('patientId') || '';
    const f = searchParams.get('fromDate') || '';
    const t = searchParams.get('toDate') || '';

    setStatusFilter((prev) => (prev !== s ? s : prev));
    setDoctorFilter((prev) => (prev !== d ? d : prev));
    setPatientFilter((prev) => (prev !== p ? p : prev));
    setFromDate((prev) => (prev !== f ? f : prev));
    setToDate((prev) => (prev !== t ? t : prev));
    setPage(0);
  }, [searchParams]);

  // Dialogs state
  const [viewingAppointment, setViewingAppointment] = React.useState(null);
  const [cancellingAppointment, setCancellingAppointment] = React.useState(null);
  const [cancelReason, setCancelReason] = React.useState('Administrative cancellation');

  // Reference query for doctor filter dropdown
  const doctorsQuery = useDoctors({ size: 100 });

  // Query parameters
  const queryParams = React.useMemo(() => {
    const p = { page, size: 10, sort: 'slotStart,desc' };
    if (statusFilter) p.status = statusFilter;
    if (doctorFilter) p.doctorId = doctorFilter;
    if (patientFilter) p.patientId = patientFilter;
    if (fromDate) p.from = getStartOfDayUtc(fromDate);
    if (toDate) p.to = getExclusiveEndOfDayUtc(toDate);
    return p;
  }, [page, statusFilter, doctorFilter, patientFilter, fromDate, toDate]);

  const appointmentsQuery = useAppointments(queryParams);
  const cancelMutation = useCancelAppointment();

  // Handle appointment cancellation
  const handleConfirmCancel = async () => {
    if (!cancellingAppointment) return;
    try {
      await cancelMutation.mutateAsync({
        appointmentId: cancellingAppointment.id,
        reason: cancelReason.trim() || 'Administrative cancellation',
      });
      toast({
        title: 'Appointment Cancelled',
        description: `Appointment for ${cancellingAppointment.patientName} has been cancelled.`,
        variant: 'default',
      });
      setCancellingAppointment(null);
      setCancelReason('Administrative cancellation');
      if (viewingAppointment?.id === cancellingAppointment.id) {
        setViewingAppointment(null);
      }
    } catch (err) {
      toast({
        title: 'Cancellation failed',
        description: err.response?.data?.message || 'Could not cancel appointment.',
        variant: 'destructive',
      });
    }
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setDoctorFilter('');
    setPatientFilter('');
    setFromDate('');
    setToDate('');
    setPage(0);
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Appointment Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time clinical consultation schedule, queue transitions, and administrative cancellation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appointmentsQuery.refetch()}
            aria-label="Refresh appointments"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 bg-card p-4 rounded-lg border shadow-sm">
        {/* Status Filter */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter(val);
              setPage(0);
              const next = new URLSearchParams(searchParams);
              if (val) next.set('status', val);
              else next.delete('status');
              setSearchParams(next);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Filter by appointment status"
          >
            <option value="">All Statuses</option>
            <option value="BOOKED,CHECKED_IN,IN_CONSULTATION">Pending Queue (Active)</option>
            <option value="BOOKED">Booked</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="IN_CONSULTATION">In Consultation</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No Show</option>
          </select>
        </div>

        {/* Doctor Filter */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Physician</label>
          <select
            value={doctorFilter}
            onChange={(e) => {
              const val = e.target.value;
              setDoctorFilter(val);
              setPage(0);
              const next = new URLSearchParams(searchParams);
              if (val) next.set('doctorId', val);
              else next.delete('doctorId');
              setSearchParams(next);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Filter by physician"
          >
            <option value="">All Doctors</option>
            {(doctorsQuery.data?.content || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => {
              const val = e.target.value;
              setFromDate(val);
              setPage(0);
              const next = new URLSearchParams(searchParams);
              if (val) next.set('fromDate', val);
              else next.delete('fromDate');
              setSearchParams(next);
            }}
            className="h-9 text-xs"
            aria-label="Filter from date"
          />
        </div>

        {/* To Date */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => {
              const val = e.target.value;
              setToDate(val);
              setPage(0);
              const next = new URLSearchParams(searchParams);
              if (val) next.set('toDate', val);
              else next.delete('toDate');
              setSearchParams(next);
            }}
            className="h-9 text-xs"
            aria-label="Filter to date"
          />
        </div>

        {/* Reset */}
        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            disabled={!statusFilter && !doctorFilter && !patientFilter && !fromDate && !toDate}
            className="h-9 w-full text-xs"
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Active patient filter pill */}
      {patientFilter && (
        <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-md w-fit">
          <span>Filtering by Patient ID: <strong className="font-mono">{patientFilter}</strong></span>
          <button
            type="button"
            onClick={() => {
              setPatientFilter('');
              setPage(0);
              const p = new URLSearchParams(searchParams);
              p.delete('patientId');
              setSearchParams(p);
            }}
            className="hover:text-destructive ml-1 font-bold text-sm"
            aria-label="Clear patient filter"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Table / Cards */}
      {appointmentsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            </Card>
          ))}
        </div>
      ) : appointmentsQuery.isError ? (
        <ErrorState
          title="Failed to load appointments"
          message="Could not retrieve clinical appointment schedule."
          onRetry={() => appointmentsQuery.refetch()}
        />
      ) : (appointmentsQuery.data?.content || []).length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No appointments found"
          description={
            statusFilter || doctorFilter || fromDate || toDate
              ? 'No appointments match the selected filter criteria. Try resetting filters.'
              : 'No appointments are currently recorded in the system.'
          }
          actionText={statusFilter || doctorFilter ? 'Clear Filters' : undefined}
          onAction={handleResetFilters}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Scheduled Slot</th>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointmentsQuery.data.content.map((apt) => {
                  const slotDate = new Date(apt.slotStart);
                  const canCancel = apt.status === 'BOOKED' || apt.status === 'CHECKED_IN';

                  return (
                    <tr key={apt.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {apt.patientName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        Dr. {apt.doctorName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {slotDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
                        {slotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        {apt.tokenNumber != null ? (
                          <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded">
                            #{apt.tokenNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={apt.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingAppointment(apt)}
                          className="h-7 text-xs"
                          aria-label={`View appointment ${apt.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        {canCancel && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCancellingAppointment(apt)}
                            className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                            aria-label={`Cancel appointment ${apt.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            pageNumber={appointmentsQuery.data.page}
            totalPages={appointmentsQuery.data.totalPages}
            totalElements={appointmentsQuery.data.totalElements}
            pageSize={appointmentsQuery.data.size}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* View Appointment Details Modal */}
      <Dialog
        open={Boolean(viewingAppointment)}
        onOpenChange={(open) => !open && setViewingAppointment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>Full record details and clinical lifecycle state.</DialogDescription>
          </DialogHeader>

          {viewingAppointment && (
            <div className="space-y-4 py-2 text-xs">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">
                    {viewingAppointment.patientName}
                  </h3>
                  <p className="text-muted-foreground">Dr. {viewingAppointment.doctorName}</p>
                </div>
                <AppointmentStatusBadge status={viewingAppointment.status} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Start Slot:</span>
                  <p className="font-medium mt-0.5">
                    {new Date(viewingAppointment.slotStart).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">End Slot:</span>
                  <p className="font-medium mt-0.5">
                    {new Date(viewingAppointment.slotEnd).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Queue Token:</span>
                  <p className="font-medium mt-0.5 font-mono">
                    {viewingAppointment.tokenNumber != null ? `#${viewingAppointment.tokenNumber}` : 'Not checked in'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Time Zone:</span>
                  <p className="font-medium mt-0.5">{viewingAppointment.timeZone || 'Asia/Kolkata'}</p>
                </div>
              </div>

              {viewingAppointment.reason && (
                <div>
                  <span className="text-muted-foreground">Reason for Visit:</span>
                  <p className="font-medium mt-0.5 bg-muted/40 p-2 rounded">
                    {viewingAppointment.reason}
                  </p>
                </div>
              )}

              {viewingAppointment.cancellationReason && (
                <div className="border border-destructive/20 bg-destructive/5 p-2.5 rounded">
                  <span className="font-semibold text-destructive">Cancellation Reason:</span>
                  <p className="text-destructive mt-0.5">{viewingAppointment.cancellationReason}</p>
                </div>
              )}

              <div className="border-t pt-2 text-muted-foreground font-mono text-[11px]">
                ID: {viewingAppointment.id}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setViewingAppointment(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Appointment Modal */}
      <Dialog
        open={Boolean(cancellingAppointment)}
        onOpenChange={(open) => !open && setCancellingAppointment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cancel Appointment
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to administratively cancel this appointment? This action cannot be reversed.
            </DialogDescription>
          </DialogHeader>

          {cancellingAppointment && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-muted/40 p-3 rounded space-y-1">
                <p><strong>Patient:</strong> {cancellingAppointment.patientName}</p>
                <p><strong>Doctor:</strong> Dr. {cancellingAppointment.doctorName}</p>
                <p><strong>Slot:</strong> {new Date(cancellingAppointment.slotStart).toLocaleString()}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Cancellation Reason <span className="text-destructive">*</span>
                </label>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Patient requested, doctor emergency..."
                  className="mt-1"
                />
              </div>

              <DialogFooter className="pt-3">
                <Button
                  variant="outline"
                  onClick={() => setCancellingAppointment(null)}
                  disabled={cancelMutation.isPending}
                >
                  Keep Appointment
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmCancel}
                  disabled={cancelMutation.isPending || !cancelReason.trim()}
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
