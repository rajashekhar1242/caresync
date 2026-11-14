import * as React from 'react';
import {
  Pill,
  Download,
  Calendar,
  User,
  Clock,
  AlertCircle,
  FileText,
  Search,
  CheckCircle2,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/app/providers/auth.context';
import { usePatientPrescriptions } from '@/hooks/use-prescriptions';
import { prescriptionsService } from '@/services/prescriptions.service';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export function PatientPrescriptionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const patientId = user?.patientId;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [downloadingId, setDownloadingId] = React.useState(null);

  // Prescriptions query
  const { data, isLoading, isError } = usePatientPrescriptions(
    patientId,
    { size: 50 },
    { enabled: Boolean(patientId) }
  );

  const prescriptions = React.useMemo(() => data?.content || [], [data]);

  // Search filtering
  const filteredPrescriptions = React.useMemo(() => {
    if (!searchQuery.trim()) return prescriptions;
    const q = searchQuery.toLowerCase();
    return prescriptions.filter((rx) => {
      const doc = (rx.doctorName || '').toLowerCase();
      const medMatch = rx.items?.some((item) =>
        (item.medicineName || '').toLowerCase().includes(q) ||
        (item.dosage || '').toLowerCase().includes(q) ||
        (item.instructions || '').toLowerCase().includes(q)
      );
      return doc.includes(q) || medMatch;
    });
  }, [prescriptions, searchQuery]);

  // Metrics
  const totalMedsCount = React.useMemo(() => {
    return prescriptions.reduce((sum, rx) => sum + (rx.items?.length || 0), 0);
  }, [prescriptions]);

  const latestDate = React.useMemo(() => {
    if (!prescriptions.length) return null;
    return prescriptions[0].createdAt || prescriptions[0].issuedAt || null;
  }, [prescriptions]);

  const handleDownloadPdf = async (prescriptionId) => {
    setDownloadingId(prescriptionId);
    try {
      await prescriptionsService.downloadPdf(
        prescriptionId,
        `CareSync-Prescription-${prescriptionId.slice(0, 8)}.pdf`
      );
      toast({
        title: 'Prescription Downloaded',
        description: 'Official digital prescription PDF downloaded successfully.',
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Download Failed',
        description: err.response?.data?.message || 'Could not stream prescription PDF.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!patientId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Patient Profile Required</AlertTitle>
          <AlertDescription>
            You must be logged in as an authenticated patient to access digital prescriptions.
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
            <Pill className="h-6 w-6 text-primary" />
            <span>My Prescriptions</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Access, review medications, and download official PDF prescriptions issued by your doctors.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Prescriptions</p>
              <p className="text-xl font-bold text-foreground">{prescriptions.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Pill className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Prescribed Medications</p>
              <p className="text-xl font-bold text-foreground">{totalMedsCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Latest Prescription</p>
              <p className="text-sm font-bold text-foreground">
                {latestDate ? formatDate(latestDate) : 'None'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by medicine, dosage or doctor..."
            className="pl-9 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Prescription List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Prescriptions</AlertTitle>
          <AlertDescription>
            Could not retrieve your digital prescriptions. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      ) : filteredPrescriptions.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Pill className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              {searchQuery ? 'No matching prescriptions found' : 'No electronic prescriptions yet'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? 'Try searching with a different medicine name or doctor.'
                : 'Digital prescriptions issued by your physician during clinical consultations will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPrescriptions.map((rx) => {
            const rxDate = rx.createdAt || rx.issuedAt;
            const isDownloading = downloadingId === rx.id;

            return (
              <Card key={rx.id} className="shadow-sm border-border/80">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">
                          Prescription #{rx.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary">
                          {rx.items?.length || 0} item{(rx.items?.length || 0) === 1 ? '' : 's'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Issued on <span className="font-medium text-foreground">{formatDate(rxDate)}</span> by{' '}
                        <span className="font-semibold text-foreground">
                          Dr. {rx.doctorName || 'Attending Physician'}
                        </span>
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5 self-start sm:self-auto h-8"
                      disabled={isDownloading}
                      onClick={() => handleDownloadPdf(rx.id)}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5 text-primary" />
                          <span>Download PDF</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Prescribed Medications
                    </h4>

                    <div className="divide-y border rounded-lg overflow-hidden bg-card">
                      {rx.items?.map((item, idx) => (
                        <div key={idx} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground text-sm">
                                {item.medicineName}
                              </span>
                              <Badge variant="secondary" className="text-[10px] font-mono">
                                {item.dosage}
                              </Badge>
                            </div>
                            {item.instructions && (
                              <p className="text-muted-foreground italic text-[11px]">
                                Instructions: {item.instructions}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-muted-foreground shrink-0 sm:text-right">
                            <div>
                              <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                Frequency
                              </span>
                              <span className="font-medium text-foreground font-mono">
                                {item.frequency}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                Duration
                              </span>
                              <span className="font-medium text-foreground font-mono">
                                {item.durationDays} days
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {rx.notes && (
                      <div className="p-3 rounded-md bg-muted/30 border text-xs text-muted-foreground">
                        <strong className="text-foreground">Clinical Note: </strong>
                        {rx.notes}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
