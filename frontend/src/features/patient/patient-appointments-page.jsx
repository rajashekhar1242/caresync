import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Building2,
  CalendarPlus,
  AlertCircle,
  XCircle,
  CheckCircle2,
  FileText,
  Receipt,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/app/providers/auth.context';
import { useAppointments, useCancelAppointment } from '@/hooks/use-appointments';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/constants';
import { formatDate, formatTime, CLINIC_TIMEZONE } from '@/lib/utils';

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const patientId = user?.patientId;

  // Filter state
  const [activeTab, setActiveTab] = React.useState('UPCOMING'); // 'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED'
  const [searchQuery, setSearchQuery] = React.useState('');

  // Cancellation modal state
  const [cancellingAppt, setCancellingAppt] = React.useState(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelError, setCancelError] = React.useState(null);

  // Queries
  const { data, isLoading, isError, refetch } = useAppointments(
    { patientId, size: 50, sort: 'slotStart,desc' },
    { enabled: Boolean(patientId) }
  );

  const cancelMutation = useCancelAppointment();

  const appointments = React.useMemo(() => data?.content || [], [data]);

  // Tab filtering
  const filteredAppointments = React.useMemo(() => {
    return appointments.filter((appt) => {
      // Status tab filter
      if (activeTab === 'UPCOMING') {
        const isUpcoming = ['SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION'].includes(appt.status);
        if (!isUpcoming) return false;
      } else if (activeTab === 'COMPLETED') {
        if (appt.status !== 'COMPLETED') return false;
      } else if (activeTab === 'CANCELLED') {
        if (appt.status !== 'CANCELLED') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const doc = (appt.doctorName || '').toLowerCase();
        const reason = (appt.reason || '').toLowerCase();
        const token = String(appt.tokenNumber || '');
        if (!doc.includes(q) && !reason.includes(q) && !token.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [appointments, activeTab, searchQuery]);

  // Cancellation eligibility helper
  const canCancelOnline = (appt) => {
    if (appt.status !== 'SCHEDULED') return false;
    const slotTime = new Date(appt.slotStart).getTime();
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    return slotTime > twoHoursFromNow;
  };

  const isWithinTwoHours = (appt) => {
    if (appt.status !== 'SCHEDULED') return false;
    const slotTime = new Date(appt.slotStart).getTime();
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    return slotTime <= twoHoursFromNow && slotTime > Date.now();
  };

  const handleOpenCancelDialog = (appt) => {
    setCancellingAppt(appt);
    setCancelReason('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppt) return;
    setCancelError(null);

    try {
      await cancelMutation.mutateAsync({
        appointmentId: cancellingAppt.id,
        reason: cancelReason.trim() || 'Patient requested cancellation',
      });

      toast({
        title: 'Appointment Cancelled',
        description: 'Your appointment has been cancelled successfully.',
        variant: 'default',
      });
      setCancellingAppt(null);
      refetch();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Unable to cancel this appointment. The cancellation window may be closed.';
      setCancelError(msg);
      toast({
        title: 'Cancellation Failed',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SCHEDULED':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Scheduled</Badge>;
      case 'CHECKED_IN':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Checked In</Badge>;
      case 'IN_CONSULTATION':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">In Consultation</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Completed</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Cancelled</Badge>;
      case 'NO_SHOW':
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200">No Show</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!patientId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Patient Profile Required</AlertTitle>
          <AlertDescription>
            You are logged in without an associated patient profile. Please contact the front desk to associate your account with your patient record.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <span>My Appointments</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your upcoming consultations, view visit details, and manage bookings.
          </p>
        </div>
        <Button
          onClick={() => navigate(ROUTES.PATIENT_BOOK_APPOINTMENT)}
          className="gap-2 self-start sm:self-auto"
        >
          <CalendarPlus className="h-4 w-4" />
          <span>Book Appointment</span>
        </Button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <Button
            size="sm"
            variant={activeTab === 'UPCOMING' ? 'default' : 'ghost'}
            className="text-xs h-8"
            onClick={() => setActiveTab('UPCOMING')}
          >
            Upcoming
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'ALL' ? 'default' : 'ghost'}
            className="text-xs h-8"
            onClick={() => setActiveTab('ALL')}
          >
            All Visits
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'COMPLETED' ? 'default' : 'ghost'}
            className="text-xs h-8"
            onClick={() => setActiveTab('COMPLETED')}
          >
            Completed
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'CANCELLED' ? 'default' : 'ghost'}
            className="text-xs h-8"
            onClick={() => setActiveTab('CANCELLED')}
          >
            Cancelled
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by doctor or notes..."
            className="pl-9 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Appointments</AlertTitle>
          <AlertDescription>
            Could not retrieve your appointment history. Please refresh the page or try again later.
          </AlertDescription>
        </Alert>
      ) : filteredAppointments.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              {searchQuery ? 'No matching appointments found' : 'No appointments in this category'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? 'Try adjusting your search criteria.'
                : activeTab === 'UPCOMING'
                ? 'You do not have any upcoming visits scheduled at this time.'
                : 'No historical appointments found.'}
            </p>
            {activeTab === 'UPCOMING' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-2 text-xs"
                onClick={() => navigate(ROUTES.PATIENT_BOOK_APPOINTMENT)}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                <span>Schedule a Consultation</span>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAppointments.map((appt) => {
            const cancellable = canCancelOnline(appt);
            const nearDeadline = isWithinTwoHours(appt);
            const isCompleted = appt.status === 'COMPLETED';

            return (
              <Card
                key={appt.id}
                className="shadow-sm hover:shadow transition-shadow border-border/80"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Doctor & Details */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-base text-foreground">
                          Dr. {appt.doctorName || 'Assigned Physician'}
                        </span>
                        {getStatusBadge(appt.status)}
                        {appt.tokenNumber && (
                          <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary border-primary/20">
                            Token #{appt.tokenNumber}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          {formatDate(appt.slotStart)}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatTime(appt.slotStart)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          ({CLINIC_TIMEZONE})
                        </span>
                      </div>

                      {appt.reason && (
                        <div className="text-xs bg-muted/30 p-2.5 rounded-md border border-border/50 text-foreground/90 mt-2">
                          <span className="font-semibold text-muted-foreground">Reason: </span>
                          {appt.reason}
                        </div>
                      )}

                      {appt.status === 'CANCELLED' && appt.cancellationReason && (
                        <div className="text-xs bg-rose-50 dark:bg-rose-950/20 p-2 rounded border border-rose-200 text-rose-800 dark:text-rose-300">
                          <span className="font-semibold">Cancellation Reason: </span>
                          {appt.cancellationReason}
                        </div>
                      )}

                      {nearDeadline && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          Note: This visit is within 2 hours. Online cancellation is closed; please contact reception by phone if you cannot make it.
                        </p>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0">
                      {cancellable && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 h-8"
                          onClick={() => handleOpenCancelDialog(appt)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          <span>Cancel Visit</span>
                        </Button>
                      )}

                      {isCompleted && (
                        <div className="flex flex-wrap sm:flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 h-8"
                            onClick={() => navigate(ROUTES.PATIENT_PRESCRIPTIONS)}
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span>Prescription</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 h-8"
                            onClick={() => navigate(ROUTES.PATIENT_BILLING)}
                          >
                            <Receipt className="h-3.5 w-3.5 text-primary" />
                            <span>Invoice</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancellation Dialog */}
      <Dialog open={Boolean(cancellingAppt)} onOpenChange={(open) => !open && setCancellingAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />
              <span>Cancel Appointment</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to cancel your consultation with Dr. {cancellingAppt?.doctorName}?
            </DialogDescription>
          </DialogHeader>

          {cancelError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{cancelError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/40 rounded-md text-xs space-y-1">
              <div>
                <span className="font-semibold text-muted-foreground">Date: </span>
                <span className="font-medium text-foreground">{cancellingAppt ? formatDate(cancellingAppt.slotStart) : ''}</span>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">Time: </span>
                <span className="font-mono text-foreground">{cancellingAppt ? formatTime(cancellingAppt.slotStart) : ''}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cancel-reason" className="text-xs font-semibold text-muted-foreground">
                Reason for Cancellation (Optional)
              </label>
              <textarea
                id="cancel-reason"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g. Symptoms resolved, scheduling conflict..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancellingAppt(null)}
              disabled={cancelMutation.isPending}
            >
              Keep Appointment
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
