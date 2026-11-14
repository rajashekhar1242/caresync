import * as React from 'react';
import {
  Users,
  Search,
  Eye,
  Calendar,
  Pill,
  AlertTriangle,
  RefreshCw,
  FileText,
  User,
  MapPin,
  Phone,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/app/providers/auth.context';
import { usePatients, usePatient } from '@/hooks/use-patients';
import { usePatientPrescriptions } from '@/hooks/use-prescriptions';
import { useAppointments } from '@/hooks/use-appointments';
import { formatDate, formatDateTime } from '@/lib/utils';

export function DoctorPatientsPage() {
  const { user } = useAuth();
  const doctorId = user?.doctorId;

  // Search filter
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeSearch, setActiveSearch] = React.useState('');

  // Selected patient for modal details
  const [selectedPatientId, setSelectedPatientId] = React.useState(null);

  // Queries
  const patientsQuery = usePatients({
    name: activeSearch.trim().length >= 2 ? activeSearch.trim() : undefined,
    size: 50,
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearch(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
  };

  const patients = patientsQuery.data?.content || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Patient Medical Records & Intake
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse hospital patients, inspect clinical profiles, verified allergies, and prescription histories.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => patientsQuery.refetch()}
          disabled={patientsQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${patientsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient by full name (minimum 2 characters)..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                Search
              </Button>
              {activeSearch && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearSearch}>
                  Clear
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Patients Table Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Registered Patient Records</CardTitle>
          <CardDescription>
            {patientsQuery.data?.totalElements ?? patients.length} patient record(s) matching current criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patientsQuery.isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : patientsQuery.isError ? (
            <div className="p-4 rounded-lg bg-rose-50 text-xs text-rose-700 border border-rose-200">
              {patientsQuery.error?.message || 'Error querying patient records.'}
            </div>
          ) : patients.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {activeSearch ? 'No patients found matching your search term.' : 'No patient records found in registry.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">Patient Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Date of Birth</th>
                    <th className="px-4 py-3">Gender</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {patient.fullName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {patient.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(patient.dateOfBirth)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {patient.gender ? (
                          <Badge variant="outline" className="text-xs uppercase">
                            {patient.gender}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPatientId(patient.id)}
                          className="text-xs"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Clinical Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Detail Modal */}
      {selectedPatientId && (
        <PatientDetailModal
          patientId={selectedPatientId}
          doctorId={doctorId}
          onClose={() => setSelectedPatientId(null)}
        />
      )}
    </div>
  );
}

function PatientDetailModal({ patientId, doctorId, onClose }) {
  const patientQuery = usePatient(patientId);
  const prescriptionsQuery = usePatientPrescriptions(patientId, { size: 10 });
  const appointmentsQuery = useAppointments(
    { doctorId, patientId, size: 10, sort: 'slotStart,desc' },
    { enabled: Boolean(doctorId && patientId) }
  );

  const isForbidden = patientQuery.error?.response?.status === 403;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <span>Patient Clinical Profile</span>
          </DialogTitle>
          <DialogDescription>
            Audited access to patient record, verified allergies, and prescription history.
          </DialogDescription>
        </DialogHeader>

        {patientQuery.isLoading ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isForbidden ? (
          <div className="p-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-base text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
              Restricted Patient Record (HIPAA / Privacy Boundary)
            </div>
            <p className="text-xs text-muted-foreground">
              Under hospital security rules, physicians may only view medical records of patients with whom they have an active or historical appointment encounter.
            </p>
          </div>
        ) : patientQuery.isError ? (
          <div className="p-4 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {patientQuery.error?.response?.data?.message || 'Error loading patient details.'}
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Demographics Summary */}
            <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-lg font-bold text-foreground">
                  {patientQuery.data.fullName}
                </h3>
                <Badge variant="outline" className="text-xs uppercase w-fit">
                  {patientQuery.data.gender || 'Not Specified'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono">{patientQuery.data.phone || 'No phone recorded'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{patientQuery.data.email || 'No email recorded'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>DOB: {formatDate(patientQuery.data.dateOfBirth)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{patientQuery.data.address || 'No address recorded'}</span>
                </div>
              </div>
            </div>

            {/* Allergies & Safety Profile */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Verified Drug & Environmental Allergies
              </h4>
              {patientQuery.data.allergies && patientQuery.data.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patientQuery.data.allergies.map((allergy, i) => (
                    <Badge
                      key={i}
                      variant="destructive"
                      className="text-xs px-2 py-0.5"
                    >
                      {allergy}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No known allergies documented for this patient.
                </p>
              )}
            </div>

            {/* Patient's Prescription History */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-emerald-600" />
                Recent Electronic Prescriptions
              </h4>
              {prescriptionsQuery.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : !prescriptionsQuery.data?.content || prescriptionsQuery.data.content.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No previous prescriptions recorded.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {prescriptionsQuery.data.content.map((rx) => (
                    <div
                      key={rx.id}
                      className="p-3 rounded border text-xs space-y-1 bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Prescription #{rx.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {formatDateTime(rx.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Prescribed by: {rx.doctorName}
                      </p>
                      {rx.items && rx.items.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1">
                          {rx.items.map((it, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px]">
                              {it.medicine?.name} ({it.dosage}) · {it.durationDays}d
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Appointment History with Doctor */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                Past Encounters with You
              </h4>
              {appointmentsQuery.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : !appointmentsQuery.data?.content || appointmentsQuery.data.content.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No appointments on record with your clinic profile.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {appointmentsQuery.data.content.map((app) => (
                    <div
                      key={app.id}
                      className="p-2 rounded border text-xs flex items-center justify-between bg-card"
                    >
                      <div>
                        <span className="font-semibold text-foreground">
                          {formatDateTime(app.slotStart)}
                        </span>
                        {app.reason && (
                          <span className="text-muted-foreground ml-2">({app.reason})</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {app.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
