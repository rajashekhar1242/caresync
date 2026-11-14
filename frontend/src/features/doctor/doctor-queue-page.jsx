import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  PhoneCall,
  Activity,
  CheckCircle2,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  Stethoscope,
  ArrowRight,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/app/providers/auth.context';
import { useDoctorQueue, useCallNext } from '@/hooks/use-queue';
import { useQueueWebSocket } from '@/hooks/use-queue-websocket';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';

export function DoctorQueuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const doctorId = user?.doctorId;

  // Real-time Queue REST query
  const queueQuery = useDoctorQueue(doctorId, { enabled: Boolean(doctorId) });

  // Real-time WebSocket connection to Spring Boot STOMP topic `/topic/queue/{doctorId}`
  const wsState = useQueueWebSocket(doctorId, {
    enabled: Boolean(doctorId),
    onMessage: () => {
      // Invalidate and refresh queue on incoming domain event
      queueQuery.refetch();
    },
  });

  const callNextMutation = useCallNext();

  const handleCallNext = async () => {
    if (!doctorId) return;
    try {
      const res = await callNextMutation.mutateAsync(doctorId);
      toast({
        title: 'Patient Called',
        description: res.nowServing
          ? `Token #${res.nowServing.tokenNumber} (${res.nowServing.patientName}) is now in consultation.`
          : 'Next patient called successfully.',
        variant: 'default',
      });
      if (res.nowServing?.appointmentId) {
        navigate(`/doctor/consultations?appointmentId=${res.nowServing.appointmentId}`);
      }
    } catch (err) {
      toast({
        title: 'Unable to Call Next Patient',
        description: err.response?.data?.message || err.message || 'Queue error occurred',
        variant: 'destructive',
      });
    }
  };

  const queue = queueQuery.data;
  const nowServing = queue?.nowServing;
  const waitingList = queue?.next || [];
  const waitingCount = queue?.waitingCount ?? 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Live Waiting Room Queue
            </h1>
            {/* WebSocket Status Indicator */}
            <div className="flex items-center gap-1.5">
              {wsState.isConnected ? (
                <Badge variant="success" className="flex items-center gap-1 text-[11px] font-mono">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <Wifi className="h-3 w-3" />
                  Live Sync
                </Badge>
              ) : wsState.status === 'CONNECTING' ? (
                <Badge variant="warning" className="flex items-center gap-1 text-[11px] font-mono">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Connecting
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                  <WifiOff className="h-3 w-3 text-rose-500" />
                  REST Fallback
                </Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time patient intake, sequential token calling, and consultation dispatching for{' '}
            <strong className="text-foreground">{user?.fullName}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queueQuery.refetch()}
            disabled={queueQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${queueQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleCallNext}
            disabled={callNextMutation.isPending || waitingCount === 0 || Boolean(nowServing)}
            className="bg-primary hover:bg-primary/90"
          >
            <PhoneCall className="h-4 w-4 mr-2" />
            {callNextMutation.isPending ? 'Calling...' : 'Call Next Patient'}
          </Button>
        </div>
      </div>

      {/* Hero: Active Patient Consultation */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Now Serving Card */}
        <Card className="md:col-span-2 shadow-md border-emerald-300/60 dark:border-emerald-800/60 bg-gradient-to-br from-card to-emerald-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                Active Consultation Room
              </span>
              {nowServing && (
                <Badge variant="success" className="font-mono text-xs">
                  IN CONSULTATION
                </Badge>
              )}
            </div>
            <CardTitle className="text-xl font-bold mt-1">Currently With Physician</CardTitle>
          </CardHeader>
          <CardContent>
            {queueQuery.isLoading ? (
              <div className="space-y-3 py-6">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ) : nowServing ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-4xl font-extrabold font-mono text-foreground tracking-tight">
                        #{nowServing.tokenNumber}
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                        Token Number
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground">
                      {nowServing.patientName}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Scheduled Slot: {formatDateTime(nowServing.slotStart)} · Checked-in at: {formatDateTime(nowServing.checkedInAt)}
                    </p>
                  </div>

                  <Button
                    size="lg"
                    onClick={() =>
                      navigate(`/doctor/consultations?appointmentId=${nowServing.appointmentId}`)
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    <Stethoscope className="h-5 w-5 mr-2" />
                    Enter Consultation Workspace
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <Activity className="h-6 w-6" />
                  </div>
                </div>
                <h3 className="font-semibold text-foreground text-base">
                  No Patient Currently in Consultation
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {waitingCount > 0
                    ? `There are ${waitingCount} patient(s) checked in and waiting in the waiting room.`
                    : 'The waiting queue is currently empty. Receptionist has not checked in any arrivals yet.'}
                </p>
                {waitingCount > 0 && (
                  <Button
                    size="sm"
                    onClick={handleCallNext}
                    disabled={callNextMutation.isPending}
                    className="bg-primary hover:bg-primary/90 mt-2"
                  >
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Call Next Token (#{waitingList[0]?.tokenNumber || '—'})
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queue Quick Stats Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Queue Indicators
            </CardTitle>
            <CardDescription>Live session status from CareSync broker</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg border bg-card space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Waiting Patients
              </span>
              <p className="text-3xl font-extrabold text-foreground">{waitingCount}</p>
              <p className="text-[11px] text-muted-foreground">Arrived & waiting for consultation</p>
            </div>

            <div className="p-3 rounded-lg border bg-card space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Last Issued Token
              </span>
              <p className="text-3xl font-extrabold font-mono text-foreground">
                {queue?.lastTokenIssued ? `#${queue.lastTokenIssued}` : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">Sequential daily counter</p>
            </div>

            <div className="pt-2 border-t">
              <p className="text-[11px] text-muted-foreground">
                Queue Date: <strong className="text-foreground">{queue?.date || 'Today'}</strong> ·{' '}
                Timezone: <strong className="text-foreground">{queue?.timeZone || 'Asia/Kolkata'}</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Waiting Room Patient Queue List */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Waiting Room Roster ({waitingCount})
            </CardTitle>
            <CardDescription>
              Chronological order of arrived patients with assigned queue tokens
            </CardDescription>
          </div>
          {waitingCount > 0 && !nowServing && (
            <Button
              size="sm"
              onClick={handleCallNext}
              disabled={callNextMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              <PhoneCall className="h-4 w-4 mr-2" />
              Call Next
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {queueQuery.isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : waitingList.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No patients currently waiting in the room.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">Token</th>
                    <th className="px-4 py-3">Patient Name</th>
                    <th className="px-4 py-3">Slot Time</th>
                    <th className="px-4 py-3">Arrival Time</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {waitingList.map((item, idx) => {
                    const slotStr = formatDateTime(item.slotStart);
                    const checkInStr = formatDateTime(item.checkedInAt);

                    return (
                      <tr key={item.appointmentId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-bold text-foreground">
                          <Badge variant="outline" className="font-mono text-xs">
                            #{item.tokenNumber}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {item.patientName}
                          {idx === 0 && (
                            <Badge variant="info" className="ml-2 text-[10px] px-1 py-0">
                              Next in Line
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{slotStr}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{checkInStr}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={idx === 0 && !nowServing ? 'default' : 'outline'}
                            onClick={() =>
                              navigate(`/doctor/consultations?appointmentId=${item.appointmentId}`)
                            }
                            className="text-xs"
                          >
                            Open Details
                          </Button>
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
