import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  Calendar,
  Stethoscope,
  Phone,
  User,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, AppointmentStatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useAppointments, useCheckInAppointment } from '@/hooks/use-appointments';
import { useToast } from '@/hooks/use-toast';
import { getClinicDayBounds } from '@/lib/utils';

export function CheckInPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterMode, setFilterMode] = React.useState('READY'); // 'READY' (BOOKED), 'CHECKED_IN', 'ALL'
  const [confirmAppt, setConfirmAppt] = React.useState(null);
  const [lastCheckedInAppt, setLastCheckedInAppt] = React.useState(null);

  // Compute today's ISO bounds in clinic timezone (Asia/Kolkata)
  const todayBounds = React.useMemo(() => getClinicDayBounds(), []);

  // Fetch today's hospital appointments
  const appointmentsQuery = useAppointments({
    from: todayBounds.start,
    to: todayBounds.end,
    size: 100,
    sort: 'slotStart,asc',
  });

  const checkInMutation = useCheckInAppointment();

  const allAppointments = React.useMemo(
    () => appointmentsQuery.data?.content || [],
    [appointmentsQuery.data]
  );

  // Filter appointments
  const filteredAppointments = React.useMemo(() => {
    let list = allAppointments;

    if (filterMode === 'READY') {
      list = list.filter((a) => a.status === 'BOOKED');
    } else if (filterMode === 'CHECKED_IN') {
      list = list.filter((a) => a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION');
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (a) =>
          a.patientName?.toLowerCase().includes(q) ||
          a.doctorName?.toLowerCase().includes(q) ||
          String(a.tokenNumber).includes(q)
      );
    }

    return list;
  }, [allAppointments, filterMode, searchTerm]);

  const handleExecuteCheckIn = async () => {
    if (!confirmAppt) return;
    try {
      const updated = await checkInMutation.mutateAsync(confirmAppt.id);
      setLastCheckedInAppt(updated);
      toast({
        title: 'Check-In Confirmed',
        description: `Token #${updated.tokenNumber} issued for ${updated.patientName}.`,
        variant: 'default',
      });
      setConfirmAppt(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Check-in failed. Please verify status.';
      toast({
        title: 'Check-in Error',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const readyCount = allAppointments.filter((a) => a.status === 'BOOKED').length;
  const checkedInCount = allAppointments.filter((a) => a.status === 'CHECKED_IN').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-amber-500" />
            Patient Arrival & Check-In Desk
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Execute fast arrivals, generate sequential waiting tokens, and coordinate front-desk flow.
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
          <Button size="sm" onClick={() => navigate('/receptionist/queue')}>
            <Clock className="h-4 w-4 mr-2" />
            Live Queue View
          </Button>
        </div>
      </div>

      {/* Prominent Recently Checked-In Token Banner */}
      {lastCheckedInAppt && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm animate-in fade-in">
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white font-extrabold text-2xl shadow-md">
                #{lastCheckedInAppt.tokenNumber || '—'}
              </div>
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-amber-800 dark:text-amber-300">
                  Token Issued Just Now
                </span>
                <h3 className="text-lg font-bold text-foreground">
                  {lastCheckedInAppt.patientName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Assigned to <strong className="text-foreground">Dr. {lastCheckedInAppt.doctorName}</strong> · Scheduled for{' '}
                  {new Date(lastCheckedInAppt.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card text-xs"
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print Token Slip
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setLastCheckedInAppt(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
            {/* Filter Tabs */}
            <div className="flex rounded-md bg-muted p-1 gap-1">
              <Button
                type="button"
                variant={filterMode === 'READY' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setFilterMode('READY')}
              >
                Ready for Check-In ({readyCount})
              </Button>
              <Button
                type="button"
                variant={filterMode === 'CHECKED_IN' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setFilterMode('CHECKED_IN')}
              >
                In Waiting Area ({checkedInCount})
              </Button>
              <Button
                type="button"
                variant={filterMode === 'ALL' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-8"
                onClick={() => setFilterMode('ALL')}
              >
                All Today ({allAppointments.length})
              </Button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient, doctor, token..."
                className="pl-9 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Appointments Table for Check-in */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Today's Arrival Queue</CardTitle>
          <CardDescription>
            Click "Check In" when the patient arrives at the reception desk to mint their queue token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appointmentsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : appointmentsQuery.isError ? (
            <ErrorState
              title="Failed to Load Encounters"
              description={appointmentsQuery.error?.message || 'Could not load today appointments.'}
              retryAction={() => appointmentsQuery.refetch()}
            />
          ) : filteredAppointments.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title={
                filterMode === 'READY'
                  ? 'All Scheduled Patients Checked In!'
                  : 'No Matching Appointments'
              }
              description={
                filterMode === 'READY'
                  ? 'There are currently no arriving patients waiting to be checked in for today.'
                  : 'No appointments match the search and filter criteria.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground text-left">
                    <th className="pb-3 font-semibold">Slot Time</th>
                    <th className="pb-3 font-semibold">Patient Name</th>
                    <th className="pb-3 font-semibold">Physician</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Token</th>
                    <th className="pb-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAppointments.map((appt) => {
                    const slotDate = new Date(appt.slotStart);
                    const timeStr = slotDate.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isBooked = appt.status === 'BOOKED';
                    const isCheckedIn = appt.status === 'CHECKED_IN';

                    return (
                      <tr key={appt.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3.5 font-medium whitespace-nowrap">
                          <span className="font-mono bg-muted/70 px-2 py-0.5 rounded text-xs font-semibold">
                            {timeStr}
                          </span>
                        </td>
                        <td className="py-3.5 font-semibold text-foreground">
                          {appt.patientName}
                        </td>
                        <td className="py-3.5 text-muted-foreground">
                          Dr. {appt.doctorName}
                        </td>
                        <td className="py-3.5">
                          <AppointmentStatusBadge status={appt.status} />
                        </td>
                        <td className="py-3.5 font-mono">
                          {appt.tokenNumber ? (
                            <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-xs">
                              #{appt.tokenNumber}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          {isBooked ? (
                            <Button
                              size="sm"
                              className="h-8 text-xs font-semibold px-3 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                              onClick={() => setConfirmAppt(appt)}
                              disabled={checkInMutation.isPending}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                              Check In
                            </Button>
                          ) : isCheckedIn ? (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              Checked In ({appt.tokenNumber ? `#${appt.tokenNumber}` : 'Waiting'})
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {appt.status}
                            </span>
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

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(confirmAppt)}
        onOpenChange={(open) => !open && setConfirmAppt(null)}
        title="Execute Check-In"
        description={`Confirm physical arrival of ${confirmAppt?.patientName} for consultation with Dr. ${confirmAppt?.doctorName}? This records check-in timestamp and generates the next token number.`}
        confirmText="Confirm Arrival"
        onConfirm={handleExecuteCheckIn}
        isLoading={checkInMutation.isPending}
      />
    </div>
  );
}
