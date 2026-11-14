import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  CalendarPlus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePatients, usePatient } from '@/hooks/use-patients';

export function PatientsPage() {
  const navigate = useNavigate();

  // Search and pagination state
  const [phoneSearch, setPhoneSearch] = React.useState('');
  const [nameSearch, setNameSearch] = React.useState('');
  const [debouncedPhone, setDebouncedPhone] = React.useState('');
  const [debouncedName, setDebouncedName] = React.useState('');
  const [page, setPage] = React.useState(0);
  const pageSize = 15;

  // Selected patient for details modal
  const [selectedPatientId, setSelectedPatientId] = React.useState(null);

  // Debounce phone and name inputs
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPhone(phoneSearch.trim());
      setDebouncedName(nameSearch.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [phoneSearch, nameSearch]);

  // Query params: backend accepts phone (regex ^\+?[0-9]{3,15}$) and name (2..100)
  const queryParams = React.useMemo(() => {
    const params = { page, size: pageSize };
    if (debouncedPhone && debouncedPhone.length >= 3) {
      params.phone = debouncedPhone;
    }
    if (debouncedName && debouncedName.length >= 2) {
      params.name = debouncedName;
    }
    return params;
  }, [debouncedPhone, debouncedName, page]);

  const patientsQuery = usePatients(queryParams);
  const patientDetailQuery = usePatient(selectedPatientId);

  const patients = patientsQuery.data?.content || [];
  const totalPages = patientsQuery.data?.totalPages || 0;
  const totalElements = patientsQuery.data?.totalElements || 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Patient Directory & Intake</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search existing patients, inspect demographic records, or register new walk-in arrivals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => patientsQuery.refetch()}
            disabled={patientsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${patientsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/receptionist/patients/register')}>
            <UserPlus className="h-4 w-4 mr-2" />
            Register Patient
          </Button>
        </div>
      </div>

      {/* Search Filters Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by full name (min 2 chars)..."
                className="pl-9"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
              />
            </div>

            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone number (e.g. +91987...)"
                className="pl-9 font-mono text-sm"
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
              />
            </div>
          </div>
          {(debouncedName || debouncedPhone) && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Filtering by: {debouncedName ? `Name: "${debouncedName}"` : ''}{' '}
                {debouncedPhone ? `Phone: "${debouncedPhone}"` : ''}
              </span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setNameSearch('');
                  setPhoneSearch('');
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patients Table Card */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Registered Patients</CardTitle>
            <CardDescription>
              {totalElements} total patient records found in hospital registry.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {patientsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : patientsQuery.isError ? (
            <ErrorState
              title="Failed to Load Patients"
              description={patientsQuery.error?.message || 'Could not retrieve patients.'}
              retryAction={() => patientsQuery.refetch()}
            />
          ) : patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No Patients Found"
              description={
                debouncedName || debouncedPhone
                  ? 'No patient records match the search criteria. Verify spelling or register a new patient.'
                  : 'No patients have been registered yet.'
              }
              actionLabel="Register Walk-In Patient"
              onAction={() => navigate('/receptionist/patients/register')}
            />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground text-left">
                      <th className="pb-3 font-semibold">Full Name</th>
                      <th className="pb-3 font-semibold">Phone</th>
                      <th className="pb-3 font-semibold">Date of Birth</th>
                      <th className="pb-3 font-semibold">Gender</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {patients.map((patient) => (
                      <tr key={patient.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 font-medium text-foreground">
                          {patient.fullName}
                        </td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">
                          {patient.phone || '—'}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {patient.dateOfBirth || '—'}
                        </td>
                        <td className="py-3">
                          {patient.gender ? (
                            <Badge variant="outline" className="text-xs">
                              {patient.gender}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setSelectedPatientId(patient.id)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs"
                              onClick={() =>
                                navigate(`/receptionist/appointments/book?patientId=${patient.id}`)
                              }
                            >
                              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                              Book
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pt-2 border-t">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={(p) => setPage(p)}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Detail Modal (Demographics & Allergies; No Clinical Notes) */}
      <Dialog
        open={Boolean(selectedPatientId)}
        onOpenChange={(open) => !open && setSelectedPatientId(null)}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Patient Profile Details</span>
              <Badge variant="outline" className="text-xs font-normal">
                Audited Access
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Verified demographic profile. (Access is logged for HIPAA / compliance audit).
            </DialogDescription>
          </DialogHeader>

          {patientDetailQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : patientDetailQuery.isError ? (
            <ErrorState
              title="Failed to Load Profile"
              description={patientDetailQuery.error?.message || 'Could not load patient details.'}
              retryAction={() => patientDetailQuery.refetch()}
            />
          ) : patientDetailQuery.data ? (
            <div className="space-y-4 py-2 text-sm">
              <div className="p-4 rounded-lg bg-muted/40 border space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-foreground">
                    {patientDetailQuery.data.fullName}
                  </h3>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {patientDetailQuery.data.gender || 'UNSPECIFIED'}
                  </Badge>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  Patient ID: {patientDetailQuery.data.id}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </span>
                  <p className="font-medium text-foreground mt-0.5">
                    {patientDetailQuery.data.phone || 'Not provided'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </span>
                  <p className="font-medium text-foreground mt-0.5 truncate">
                    {patientDetailQuery.data.email || 'Not provided'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Date of Birth
                  </span>
                  <p className="font-medium text-foreground mt-0.5">
                    {patientDetailQuery.data.dateOfBirth || 'Not provided'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Address
                  </span>
                  <p className="font-medium text-foreground mt-0.5 truncate">
                    {patientDetailQuery.data.address || 'Not provided'}
                  </p>
                </div>
              </div>

              {/* Allergies Chips */}
              <div className="pt-2 border-t">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recorded Allergies
                </span>
                {patientDetailQuery.data.allergies && patientDetailQuery.data.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {patientDetailQuery.data.allergies.map((allergy, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                      >
                        {allergy}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No known drug/food allergies recorded.</p>
                )}
              </div>

              {/* Privacy Notice Banner */}
              <div className="p-2.5 rounded bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  Clinical diagnoses, doctor consultation notes, and prescriptions are restricted to physicians per hospital privacy policy.
                </span>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex sm:justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => setSelectedPatientId(null)}>
              Close
            </Button>
            {patientDetailQuery.data && (
              <Button
                size="sm"
                onClick={() => {
                  const id = patientDetailQuery.data.id;
                  setSelectedPatientId(null);
                  navigate(`/receptionist/appointments/book?patientId=${id}`);
                }}
              >
                <CalendarPlus className="h-4 w-4 mr-1.5" /> Book Appointment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
