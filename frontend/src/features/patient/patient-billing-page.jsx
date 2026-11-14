import * as React from 'react';
import {
  Receipt,
  Download,
  DollarSign,
  AlertCircle,
  CreditCard,
  Building2,
  Calendar,
  Search,
  ShieldAlert,
  Loader2,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/app/providers/auth.context';
import { useInvoices } from '@/hooks/use-billing';
import { billingService } from '@/services/billing.service';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatCurrency } from '@/lib/utils';

export function PatientBillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const patientId = user?.patientId;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [downloadingId, setDownloadingId] = React.useState(null);

  // Invoices query (automatically scoped to caller's patient ID on backend)
  const { data, isLoading, isError } = useInvoices(
    { patientId, size: 50 },
    { enabled: Boolean(patientId) }
  );

  const invoices = React.useMemo(() => data?.content || [], [data]);

  // Search filter
  const filteredInvoices = React.useMemo(() => {
    if (!searchQuery.trim()) return invoices;
    const q = searchQuery.toLowerCase();
    return invoices.filter((inv) => {
      const num = (inv.invoiceNumber || '').toLowerCase();
      const status = (inv.status || '').toLowerCase();
      return num.includes(q) || status.includes(q);
    });
  }, [invoices, searchQuery]);

  // Financial Summary Totals
  const totals = React.useMemo(() => {
    let billed = 0;
    let paid = 0;
    let balance = 0;

    invoices.forEach((inv) => {
      if (inv.status !== 'VOID') {
        const total = Number(inv.totalAmount || 0);
        const p = Number(inv.paidAmount || 0);
        const b = Number(inv.balanceDue != null ? inv.balanceDue : total - p);
        billed += total;
        paid += p;
        balance += b;
      }
    });

    return { billed, paid, balance };
  }, [invoices]);

  const handleDownloadPdf = async (invoice) => {
    setDownloadingId(invoice.id);
    try {
      await billingService.downloadInvoicePdf(invoice.id, invoice.invoiceNumber);
      toast({
        title: 'Invoice Downloaded',
        description: `Invoice ${invoice.invoiceNumber} downloaded successfully.`,
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Download Failed',
        description: err.response?.data?.message || 'Could not stream invoice PDF.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAID':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Paid</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Partial</Badge>;
      case 'UNPAID':
      case 'ISSUED':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300">Unpaid</Badge>;
      case 'VOID':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Void</Badge>;
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
            You must be signed in with an active patient profile to view billing statements and invoices.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" />
          <span>My Billing & Invoices</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review your medical bills, payment receipts, and download itemized invoice PDFs.
        </p>
      </div>

      {/* Counter Payment Notice */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 p-4 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3 shadow-sm">
        <CreditCard className="h-5 w-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Payment Policy & Counter Settlement</p>
          <p>
            CareSync currently processes bill settlements in person at the hospital reception cashier. Online credit card transactions are not yet supported. Please quote your Invoice Number at the counter when completing payment.
          </p>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Invoiced</p>
              <p className="text-xl font-bold font-mono text-foreground">
                {formatCurrency(totals.billed)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Settled</p>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totals.paid)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Balance Due</p>
              <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {formatCurrency(totals.balance)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by invoice number or status..."
            className="pl-9 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Invoices List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Invoices</AlertTitle>
          <AlertDescription>
            Could not retrieve your billing statements. Please refresh the page.
          </AlertDescription>
        </Alert>
      ) : filteredInvoices.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Receipt className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              {searchQuery ? 'No matching invoices found' : 'No billing statements yet'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Invoices generated upon completion of consultations or medical services will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const isDownloading = downloadingId === inv.id;
            const balanceDue = inv.balanceDue != null ? inv.balanceDue : (inv.totalAmount - (inv.paidAmount || 0));

            return (
              <Card key={inv.id} className="shadow-sm border-border/80">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Invoice info */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm font-mono text-foreground">
                          {inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`}
                        </span>
                        {getStatusBadge(inv.status)}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(inv.createdAt || inv.invoiceDate)}
                        </span>
                        {inv.lineItems?.length > 0 && (
                          <span>• {inv.lineItems.length} item{inv.lineItems.length === 1 ? '' : 's'}</span>
                        )}
                      </div>

                      {/* Line items snippet if available */}
                      {inv.lineItems && inv.lineItems.length > 0 && (
                        <div className="text-xs text-muted-foreground pt-1">
                          {inv.lineItems.map((item, idx) => (
                            <span key={idx} className="mr-3">
                              {item.description}: <strong className="font-mono text-foreground">{formatCurrency(item.amount)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Middle: Financial amounts */}
                    <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-right shrink-0">
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Total
                        </span>
                        <span className="font-mono font-bold text-foreground text-sm">
                          {formatCurrency(inv.totalAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Paid
                        </span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(inv.paidAmount || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Balance Due
                        </span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                          {formatCurrency(balanceDue)}
                        </span>
                      </div>

                      {/* Download PDF button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5 h-8 shrink-0"
                        disabled={isDownloading}
                        onClick={() => handleDownloadPdf(inv)}
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span className="hidden sm:inline">Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5 text-primary" />
                            <span className="hidden sm:inline">Download PDF</span>
                          </>
                        )}
                      </Button>
                    </div>
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
