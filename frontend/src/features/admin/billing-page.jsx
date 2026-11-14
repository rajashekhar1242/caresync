import * as React from 'react';
import {
  Receipt,
  Search,
  Filter,
  Eye,
  Download,
  Ban,
  FileMinus,
  RefreshCw,
  AlertTriangle,
  CreditCard,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, InvoiceStatusBadge } from '@/components/ui/badge';
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
import {
  useInvoices,
  useInvoice,
  useVoidInvoice,
  useCreateCreditNote,
} from '@/hooks/use-billing';
import { billingService } from '@/services/billing.service';
import { AuthContext } from '@/app/providers/auth.context';

export function BillingPage() {
  const authContext = React.useContext(AuthContext);
  // Fail-closed security: Only grant administrative capabilities if explicitly confirmed as authenticated ADMIN
  const isAdmin = Boolean(
    authContext &&
    !authContext.isLoading &&
    authContext.isAuthenticated &&
    authContext.role === 'ADMIN'
  );
  const { toast } = useToast();

  // Filters
  const [page, setPage] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  // Dialogs
  const [viewingInvoiceId, setViewingInvoiceId] = React.useState(null);
  const [voidingInvoice, setVoidingInvoice] = React.useState(null);
  const [voidReason, setVoidReason] = React.useState('');
  const [creditNoteInvoice, setCreditNoteInvoice] = React.useState(null);
  const [creditAmount, setCreditAmount] = React.useState('');
  const [creditReason, setCreditReason] = React.useState('');

  const queryParams = React.useMemo(() => {
    const p = { page, size: 10 };
    if (statusFilter) p.status = statusFilter;
    if (fromDate) p.from = `${fromDate}T00:00:00Z`;
    if (toDate) p.to = `${toDate}T23:59:59Z`;
    return p;
  }, [page, statusFilter, fromDate, toDate]);

  const invoicesQuery = useInvoices(queryParams);
  const viewingQuery = useInvoice(viewingInvoiceId);
  const voidMutation = useVoidInvoice();
  const creditMutation = useCreateCreditNote();

  // Download PDF
  const handleDownloadPdf = async (invoiceId, invoiceNumber) => {
    try {
      toast({
        title: 'Generating PDF',
        description: 'Streaming invoice PDF document from backend...',
      });
      await billingService.downloadInvoicePdf(invoiceId, invoiceNumber);
      toast({
        title: 'Download complete',
        description: `Invoice ${invoiceNumber} downloaded.`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'PDF download failed',
        description: err.response?.data?.message || 'Could not stream invoice PDF.',
        variant: 'destructive',
      });
    }
  };

  // Void Invoice Handler
  const handleConfirmVoid = async () => {
    if (!isAdmin || !voidingInvoice || !voidReason.trim()) return;
    try {
      await voidMutation.mutateAsync({
        invoiceId: voidingInvoice.id,
        reason: voidReason.trim(),
      });
      toast({
        title: 'Invoice Voided',
        description: `Invoice ${voidingInvoice.invoiceNumber} has been marked as void.`,
        variant: 'default',
      });
      setVoidingInvoice(null);
      setVoidReason('');
      if (viewingInvoiceId === voidingInvoice.id) {
        viewingQuery.refetch();
      }
    } catch (err) {
      toast({
        title: 'Void failed',
        description: err.response?.data?.message || 'Invoices with recorded payments cannot be voided.',
        variant: 'destructive',
      });
    }
  };

  // Credit Note Handler
  const handleConfirmCreditNote = async () => {
    if (!isAdmin || !creditNoteInvoice || !creditAmount.trim() || !creditReason.trim()) return;
    try {
      await creditMutation.mutateAsync({
        invoiceId: creditNoteInvoice.id,
        data: {
          amount: creditAmount.trim(),
          reason: creditReason.trim(),
        },
      });
      toast({
        title: 'Credit note created',
        description: `Credit note of ₹${creditAmount} issued against ${creditNoteInvoice.invoiceNumber}.`,
        variant: 'success',
      });
      setCreditNoteInvoice(null);
      setCreditAmount('');
      setCreditReason('');
      if (viewingInvoiceId === creditNoteInvoice.id) {
        viewingQuery.refetch();
      }
    } catch (err) {
      toast({
        title: 'Credit note failed',
        description: err.response?.data?.message || 'Could not issue credit note. Credit cannot exceed invoice balance.',
        variant: 'destructive',
      });
    }
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing & Revenue Ledger</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit hospital invoices, receipts, payment transactions, and PDF statement generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => invoicesQuery.refetch()}
            aria-label="Refresh invoices"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-card p-4 rounded-lg border shadow-sm">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Filter by invoice status"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(0);
            }}
            className="h-9 text-xs"
            aria-label="Filter from date"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(0);
            }}
            className="h-9 text-xs"
            aria-label="Filter to date"
          />
        </div>

        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            disabled={!statusFilter && !fromDate && !toDate}
            className="h-9 w-full text-xs"
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Main Invoices Table */}
      {invoicesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-72" />
            </Card>
          ))}
        </div>
      ) : invoicesQuery.isError ? (
        <ErrorState
          title="Failed to load invoices"
          message="Could not retrieve hospital billing records."
          onRetry={() => invoicesQuery.refetch()}
        />
      ) : (invoicesQuery.data?.content || []).length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description={
            statusFilter || fromDate || toDate
              ? 'No billing records match your search criteria.'
              : 'No invoices have been generated yet.'
          }
          actionText={statusFilter || fromDate ? 'Clear Filters' : undefined}
          onAction={handleResetFilters}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Billed (₹)</th>
                  <th className="px-4 py-3">Collected (₹)</th>
                  <th className="px-4 py-3">Balance (₹)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoicesQuery.data.content.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground text-xs">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">
                      {inv.patientName}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      ₹{inv.total || inv.totalAmount}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">
                      ₹{inv.amountPaid}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-medium">
                      ₹{inv.balance || inv.balanceDue}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingInvoiceId(inv.id)}
                        className="h-7 text-xs"
                        aria-label={`View invoice ${inv.invoiceNumber}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                        className="h-7 text-xs"
                        aria-label={`Download PDF for ${inv.invoiceNumber}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                      {isAdmin && inv.status === 'ISSUED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVoidingInvoice(inv)}
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          aria-label={`Void invoice ${inv.invoiceNumber}`}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Void
                        </Button>
                      )}
                      {isAdmin && (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCreditNoteInvoice(inv)}
                          className="h-7 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                          aria-label={`Credit note for ${inv.invoiceNumber}`}
                        >
                          <FileMinus className="h-3.5 w-3.5 mr-1" />
                          Credit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            pageNumber={invoicesQuery.data.page}
            totalPages={invoicesQuery.data.totalPages}
            totalElements={invoicesQuery.data.totalElements}
            pageSize={invoicesQuery.data.size}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* View Invoice Modal */}
      <Dialog
        open={Boolean(viewingInvoiceId)}
        onOpenChange={(open) => !open && setViewingInvoiceId(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Breakdown</DialogTitle>
            <DialogDescription>Line items, counter payments, and credit notes.</DialogDescription>
          </DialogHeader>

          {viewingQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : viewingQuery.isError ? (
            <ErrorState
              title="Error"
              message="Failed to load full invoice details."
            />
          ) : viewingQuery.data ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-sm font-bold font-mono">
                    {viewingQuery.data.invoiceNumber}
                  </h3>
                  <p className="text-muted-foreground">{viewingQuery.data.patientName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <InvoiceStatusBadge status={viewingQuery.data.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleDownloadPdf(viewingQuery.data.id, viewingQuery.data.invoiceNumber)
                    }
                    className="h-7 text-xs"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    PDF
                  </Button>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="grid grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg text-center">
                <div>
                  <span className="text-muted-foreground">Invoiced</span>
                  <p className="font-bold text-sm text-foreground mt-0.5">
                    ₹{viewingQuery.data.total || viewingQuery.data.totalAmount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Collected</span>
                  <p className="font-bold text-sm text-emerald-600 mt-0.5">
                    ₹{viewingQuery.data.amountPaid}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Balance Due</span>
                  <p className="font-bold text-sm text-amber-600 mt-0.5">
                    ₹{viewingQuery.data.balance || viewingQuery.data.balanceDue}
                  </p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h4 className="font-semibold text-foreground mb-2">Billed Services & Items</h4>
                <div className="border rounded-md divide-y divide-border">
                  {(viewingQuery.data.items || []).map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Qty: {item.quantity} × ₹{item.unitPrice}
                        </p>
                      </div>
                      <p className="font-semibold">₹{item.totalPrice}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payments History */}
              {(viewingQuery.data.payments || []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Payments Received</h4>
                  <div className="border rounded-md divide-y divide-border">
                    {viewingQuery.data.payments.map((p, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium text-emerald-600">₹{p.amount}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {p.method} {p.txnRef ? `• Ref: ${p.txnRef}` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Credit Notes */}
              {(viewingQuery.data.creditNotes || []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-destructive mb-2">Credit Notes / Refunds</h4>
                  <div className="border border-destructive/20 bg-destructive/5 rounded-md divide-y divide-border">
                    {viewingQuery.data.creditNotes.map((cn, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-destructive font-mono">{cn.creditNoteNumber}</p>
                          <p className="text-[11px] text-muted-foreground">{cn.reason}</p>
                        </div>
                        <p className="font-bold text-destructive">-₹{cn.amount}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setViewingInvoiceId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Void Invoice Dialog */}
      <Dialog open={Boolean(isAdmin && voidingInvoice)} onOpenChange={(open) => !open && setVoidingInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Void Invoice
            </DialogTitle>
            <DialogDescription>
              Marking an invoice as void renders it non-collectible. This is permitted only on unpaid invoices.
            </DialogDescription>
          </DialogHeader>

          {voidingInvoice && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-muted/40 p-3 rounded">
                <p><strong>Invoice:</strong> {voidingInvoice.invoiceNumber}</p>
                <p><strong>Patient:</strong> {voidingInvoice.patientName}</p>
                <p><strong>Billed Total:</strong> ₹{voidingInvoice.total || voidingInvoice.totalAmount}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Reason for Voiding <span className="text-destructive">*</span>
                </label>
                <Input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Created in error, billing duplicate..."
                  className="mt-1"
                />
              </div>

              <DialogFooter className="pt-3">
                <Button variant="outline" onClick={() => setVoidingInvoice(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmVoid}
                  disabled={voidMutation.isPending || !voidReason.trim()}
                >
                  {voidMutation.isPending ? 'Voiding...' : 'Confirm Void'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credit Note Dialog */}
      <Dialog
        open={Boolean(isAdmin && creditNoteInvoice)}
        onOpenChange={(open) => !open && setCreditNoteInvoice(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileMinus className="h-5 w-5 text-amber-600" />
              Issue Credit Note
            </DialogTitle>
            <DialogDescription>
              Credit notes refund or discount a paid or partially paid invoice.
            </DialogDescription>
          </DialogHeader>

          {creditNoteInvoice && (
            <div className="space-y-3 py-2 text-xs">
              <div className="bg-muted/40 p-3 rounded">
                <p><strong>Invoice:</strong> {creditNoteInvoice.invoiceNumber}</p>
                <p><strong>Collected:</strong> ₹{creditNoteInvoice.amountPaid}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Credit Amount (₹) <span className="text-destructive">*</span>
                </label>
                <Input
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 250.00"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Input
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Service adjustment, clinical discount..."
                  className="mt-1"
                />
              </div>

              <DialogFooter className="pt-3">
                <Button variant="outline" onClick={() => setCreditNoteInvoice(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmCreditNote}
                  disabled={
                    creditMutation.isPending ||
                    !creditAmount.trim() ||
                    !creditReason.trim()
                  }
                >
                  {creditMutation.isPending ? 'Issuing...' : 'Issue Credit Note'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
