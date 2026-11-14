import * as React from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Clock,
  User,
  Shield,
  FileText,
  Activity,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, RoleBadge } from '@/components/ui/badge';
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
import { useAuditLogs } from '@/hooks/use-audit';

const ACTION_COLORS = {
  AUTH_LOGIN: 'info',
  AUTH_LOGOUT: 'secondary',
  PATIENT_CREATE: 'success',
  PATIENT_READ: 'secondary',
  PATIENT_UPDATE: 'warning',
  APPOINTMENT_BOOK: 'info',
  APPOINTMENT_CANCEL: 'destructive',
  APPOINTMENT_STATUS_CHANGE: 'warning',
  INVOICE_CREATE: 'info',
  INVOICE_PAYMENT: 'success',
  INVOICE_VOID: 'destructive',
  INVOICE_CREDIT_NOTE: 'warning',
};

export function AuditLogsPage() {
  const [page, setPage] = React.useState(0);
  const [actionFilter, setActionFilter] = React.useState('');
  const [entityFilter, setEntityFilter] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  const [viewingEntry, setViewingEntry] = React.useState(null);

  const queryParams = React.useMemo(() => {
    const p = { page, size: 15 };
    if (actionFilter) p.action = actionFilter;
    if (entityFilter) p.entityType = entityFilter;
    if (fromDate) p.from = `${fromDate}T00:00:00Z`;
    if (toDate) p.to = `${toDate}T23:59:59Z`;
    return p;
  }, [page, actionFilter, entityFilter, fromDate, toDate]);

  const auditQuery = useAuditLogs(queryParams);

  const handleResetFilters = () => {
    setActionFilter('');
    setEntityFilter('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Security Audit Trail</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable, append-only ledger tracking all administrative, clinical, and security actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => auditQuery.refetch()}
            aria-label="Refresh audit logs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 bg-card p-4 rounded-lg border shadow-sm">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Entity Type</label>
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(0);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Filter by entity type"
          >
            <option value="">All Entities</option>
            <option value="USER">User / Auth</option>
            <option value="PATIENT">Patient Record</option>
            <option value="DOCTOR">Doctor</option>
            <option value="APPOINTMENT">Appointment</option>
            <option value="INVOICE">Invoice / Billing</option>
            <option value="CONSULTATION">Consultation</option>
            <option value="PRESCRIPTION">Prescription</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Filter by action"
          >
            <option value="">All Actions</option>
            <option value="AUTH_LOGIN">Login</option>
            <option value="AUTH_LOGOUT">Logout</option>
            <option value="PATIENT_READ">Patient Read</option>
            <option value="PATIENT_CREATE">Patient Create</option>
            <option value="PATIENT_UPDATE">Patient Update</option>
            <option value="APPOINTMENT_BOOK">Appointment Book</option>
            <option value="APPOINTMENT_CANCEL">Appointment Cancel</option>
            <option value="APPOINTMENT_STATUS_CHANGE">Status Change</option>
            <option value="INVOICE_CREATE">Invoice Create</option>
            <option value="INVOICE_PAYMENT">Payment</option>
            <option value="INVOICE_VOID">Invoice Void</option>
            <option value="INVOICE_CREDIT_NOTE">Credit Note</option>
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
            aria-label="Audit from date"
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
            aria-label="Audit to date"
          />
        </div>

        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            disabled={!entityFilter && !actionFilter && !fromDate && !toDate}
            className="h-9 w-full text-xs"
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Main Table */}
      {auditQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-72" />
            </Card>
          ))}
        </div>
      ) : auditQuery.isError ? (
        <ErrorState
          title="Failed to load audit logs"
          message="Could not retrieve security audit events."
          onRetry={() => auditQuery.refetch()}
        />
      ) : (auditQuery.data?.content || []).length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No audit events found"
          description={
            entityFilter || actionFilter || fromDate || toDate
              ? 'No audit log entries match your filter criteria.'
              : 'No audit events recorded.'
          }
          actionText={entityFilter || actionFilter ? 'Clear Filters' : undefined}
          onAction={handleResetFilters}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 font-medium text-muted-foreground border-b">
                <tr>
                  <th className="px-3.5 py-3">Timestamp</th>
                  <th className="px-3.5 py-3">Actor</th>
                  <th className="px-3.5 py-3">Action</th>
                  <th className="px-3.5 py-3">Entity Type</th>
                  <th className="px-3.5 py-3">IP Address</th>
                  <th className="px-3.5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditQuery.data.content.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3.5 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[120px]">{entry.userName || 'System'}</span>
                        {entry.userRole && <RoleBadge role={entry.userRole} className="scale-90" />}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge
                        variant={ACTION_COLORS[entry.action] || 'outline'}
                        className="font-mono text-[10px]"
                      >
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted-foreground font-mono">
                      {entry.entityType}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-muted-foreground">
                      {entry.ipAddress || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingEntry(entry)}
                        className="h-6 px-2 text-xs"
                        aria-label={`View audit entry ${entry.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            pageNumber={auditQuery.data.page}
            totalPages={auditQuery.data.totalPages}
            totalElements={auditQuery.data.totalElements}
            pageSize={auditQuery.data.size}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* View Audit Entry Modal */}
      <Dialog open={Boolean(viewingEntry)} onOpenChange={(open) => !open && setViewingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Audit Entry Details</DialogTitle>
            <DialogDescription>Immutable event snapshot from the system audit log.</DialogDescription>
          </DialogHeader>

          {viewingEntry && (
            <div className="space-y-3 py-2 text-xs">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-mono text-muted-foreground">
                  {new Date(viewingEntry.occurredAt).toLocaleString()}
                </span>
                <Badge variant={ACTION_COLORS[viewingEntry.action] || 'outline'} className="font-mono">
                  {viewingEntry.action}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-muted-foreground">Actor Name:</span>
                  <p className="font-medium mt-0.5">{viewingEntry.userName || 'System Engine'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Actor Role:</span>
                  <p className="mt-0.5">{viewingEntry.userRole || 'SYSTEM'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity Type:</span>
                  <p className="font-mono mt-0.5">{viewingEntry.entityType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">IP Address:</span>
                  <p className="font-mono mt-0.5">{viewingEntry.ipAddress || 'N/A'}</p>
                </div>
                {viewingEntry.entityId && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Target Entity UUID:</span>
                    <p className="font-mono text-[11px] mt-0.5">{viewingEntry.entityId}</p>
                  </div>
                )}
                {viewingEntry.patientId && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Associated Patient UUID:</span>
                    <p className="font-mono text-[11px] mt-0.5">{viewingEntry.patientId}</p>
                  </div>
                )}
              </div>

              {viewingEntry.details && (
                <div>
                  <span className="text-muted-foreground font-semibold">Event Details:</span>
                  <div className="bg-muted/40 p-2.5 rounded font-mono text-[11px] mt-1 break-words">
                    {viewingEntry.details}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground border-t pt-2 font-mono">
                Entry ID: {viewingEntry.id}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setViewingEntry(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
