import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Radio,
  Stethoscope,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  ChevronRight,
  Wifi,
  WifiOff,
  Bell,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useDoctors, useClinics } from '@/hooks/use-doctors';
import { useDoctorQueue, useQueueBoard, useCallNext } from '@/hooks/use-queue';
import { useQueueWebSocket } from '@/hooks/use-queue-websocket';
import { useToast } from '@/hooks/use-toast';

export function QueuePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedClinicId, setSelectedClinicId] = React.useState('');
  const [selectedDoctorId, setSelectedDoctorId] = React.useState('');
  const [callNextModalOpen, setCallNextModalOpen] = React.useState(false);

  // Queries
  const clinicsQuery = useClinics();
  const doctorsQuery = useDoctors({ size: 100 });

  // Default clinic
  React.useEffect(() => {
    if (clinicsQuery.data && clinicsQuery.data.length > 0 && !selectedClinicId) {
      setSelectedClinicId(clinicsQuery.data[0].id);
    }
  }, [clinicsQuery.data, selectedClinicId]);

  const doctors = React.useMemo(
    () => doctorsQuery.data?.content || [],
    [doctorsQuery.data]
  );

  // Default doctor
  React.useEffect(() => {
    if (doctors.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(doctors[0].id);
    }
  }, [doctors, selectedDoctorId]);

  // Queue queries
  const queueBoardQuery = useQueueBoard(selectedClinicId, {
    enabled: Boolean(selectedClinicId),
    refetchInterval: 10000, // 10s fallback refetch
  });

  const doctorQueueQuery = useDoctorQueue(selectedDoctorId, {
    enabled: Boolean(selectedDoctorId),
    refetchInterval: 5000, // 5s fallback refetch
  });

  // Real-time STOMP WebSocket connection
  const { isConnected, status: wsStatus } = useQueueWebSocket(selectedDoctorId, {
    enabled: Boolean(selectedDoctorId),
    onMessage: (msg) => {
      toast({
        title: 'Live Queue Event',
        description: `Doctor queue updated: ${msg.event} (Now Serving: #${msg.nowServing || 'None'})`,
        variant: 'default',
      });
      doctorQueueQuery.refetch();
      if (selectedClinicId) queueBoardQuery.refetch();
    },
  });

  const callNextMutation = useCallNext();

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);
  const queueState = doctorQueueQuery.data;

  const handleConfirmCallNext = async () => {
    if (!selectedDoctorId) return;
    try {
      const updated = await callNextMutation.mutateAsync(selectedDoctorId);
      toast({
        title: 'Patient Called',
        description: `Now serving Token #${updated.nowServing?.tokenNumber} (${updated.nowServing?.patientName}).`,
        variant: 'default',
      });
      setCallNextModalOpen(false);
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not call next patient.';
      toast({
        title: 'Action Failed',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-purple-600" />
            Live Queue Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time waiting room coordination, ticket monitor, and STOMP WebSocket updates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time WebSocket Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
            }`}
          >
            {isConnected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Wifi className="h-3.5 w-3.5" />
                <span>Live WebSocket Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Polling Fallback ({wsStatus})</span>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              doctorQueueQuery.refetch();
              if (selectedClinicId) queueBoardQuery.refetch();
            }}
            disabled={doctorQueueQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${doctorQueueQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Physician Selector Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Select Physician:
              </label>
              <select
                className="flex h-10 w-full sm:w-80 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fullName} ({doc.specialization?.name || 'General'})
                  </option>
                ))}
              </select>
            </div>

            {selectedDoctor && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {selectedDoctor.clinic?.name || 'Main Clinic'}
                </span>
                <span>·</span>
                <span className="font-mono">{selectedDoctor.clinic?.timeZone || 'Asia/Kolkata'}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Now Serving & Waiting List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Now Serving Billboard (1 col) */}
        <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/10 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-purple-600 text-white font-semibold">
                Currently In Consultation
              </Badge>
              <Radio className="h-4 w-4 text-purple-600 animate-pulse" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Dr. {selectedDoctor?.fullName}
            </CardTitle>
            <CardDescription>
              {selectedDoctor?.specialization?.name || 'General Physician'}
            </CardDescription>
          </CardHeader>

          <CardContent className="py-6 text-center space-y-4">
            {doctorQueueQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-32 mx-auto" />
                <Skeleton className="h-6 w-48 mx-auto" />
              </div>
            ) : queueState?.nowServing ? (
              <div className="space-y-3">
                <div className="inline-flex flex-col items-center justify-center p-6 rounded-3xl bg-purple-600 text-white shadow-lg min-w-[160px]">
                  <span className="text-xs uppercase font-bold tracking-widest text-purple-200">
                    TOKEN NUMBER
                  </span>
                  <span className="text-5xl font-black mt-1">
                    #{queueState.nowServing.tokenNumber}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {queueState.nowServing.patientName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Slot: {new Date(queueState.nowServing.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-30 text-purple-600" />
                <h4 className="font-semibold text-base text-foreground">Consultation Cabin Open</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  No patient is currently inside the consultation room.
                </p>
              </div>
            )}
          </CardContent>

          <div className="p-4 border-t bg-card/60 mt-auto space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Waiting Patients:</span>
              <span className="font-bold text-foreground text-sm font-mono">
                {queueState?.waitingCount || 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last Token Minted:</span>
              <span className="font-bold text-foreground text-sm font-mono">
                {queueState?.lastTokenIssued ? `#${queueState.lastTokenIssued}` : 'None'}
              </span>
            </div>

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-9"
              onClick={() => setCallNextModalOpen(true)}
              disabled={!queueState?.next || queueState.next.length === 0 || callNextMutation.isPending}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Call Next Patient
            </Button>
          </div>
        </Card>

        {/* Right Col: Waiting Queue List (2 cols) */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Upcoming in Queue</CardTitle>
              <CardDescription>
                Patients checked in and waiting in the lobby in token order.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => navigate('/receptionist/check-in')}
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" />
              Check In Patient
            </Button>
          </CardHeader>
          <CardContent>
            {doctorQueueQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : doctorQueueQuery.isError ? (
              <ErrorState
                title="Failed to Load Queue"
                description={doctorQueueQuery.error?.message || 'Could not load queue status.'}
                retryAction={() => doctorQueueQuery.refetch()}
              />
            ) : !queueState?.next || queueState.next.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Queue is Empty"
                description="There are currently no waiting patients in queue for this physician."
                actionLabel="Check In Patient"
                onAction={() => navigate('/receptionist/check-in')}
              />
            ) : (
              <div className="space-y-3">
                {queueState.next.map((entry, idx) => {
                  const checkInTimeStr = entry.checkedInAt
                    ? new Date(entry.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const slotTimeStr = new Date(entry.slotStart).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={entry.appointmentId}
                      className="flex items-center justify-between p-3.5 rounded-lg border bg-card hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-extrabold text-base shadow-sm">
                          #{entry.tokenNumber}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-foreground">
                            {entry.patientName}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Slot: <span className="font-mono">{slotTimeStr}</span> · Checked In:{' '}
                            <span className="font-mono">{checkInTimeStr}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          Waiting #{idx + 1}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clinic Multi-Doctor Queue Board Snapshot */}
      {queueBoardQuery.data && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Clinic Waiting Board Overview</CardTitle>
            <CardDescription>
              All active consultation rooms in <strong className="text-foreground">{queueBoardQuery.data.clinicName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queueBoardQuery.data.doctors?.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">
                No active doctor queues found for today.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {queueBoardQuery.data.doctors.map((docView) => (
                  <div
                    key={docView.doctorId}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      docView.doctorId === selectedDoctorId
                        ? 'border-purple-500 bg-purple-50/20 shadow-sm'
                        : 'bg-card hover:border-primary/40'
                    }`}
                    onClick={() => setSelectedDoctorId(docView.doctorId)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm text-foreground truncate">
                        {docView.doctorName}
                      </h4>
                      {docView.doctorId === selectedDoctorId && (
                        <Badge className="text-[10px] bg-purple-600">Selected</Badge>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Now Serving:</span>
                        <span className="font-bold text-purple-700 font-mono">
                          {docView.nowServingToken ? `#${docView.nowServingToken}` : 'None'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Waiting:</span>
                        <span className="font-semibold text-foreground font-mono">
                          {docView.waitingCount} patients
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Call Next Patient Confirmation Dialog */}
      <ConfirmationDialog
        open={callNextModalOpen}
        onOpenChange={setCallNextModalOpen}
        title="Call Next Patient into Consultation"
        description={`Advance next waiting patient (#${queueState?.next?.[0]?.tokenNumber} - ${queueState?.next?.[0]?.patientName}) into Dr. ${selectedDoctor?.fullName}'s consultation cabin?`}
        confirmText="Call Patient"
        onConfirm={handleConfirmCallNext}
        isLoading={callNextMutation.isPending}
      />
    </div>
  );
}
