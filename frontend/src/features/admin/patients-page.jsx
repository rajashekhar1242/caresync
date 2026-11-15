import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UserPlus,
  Search,
  Plus,
  Eye,
  Edit2,
  RefreshCw,
  User,
  Shield,
  AlertCircle,
  FileText,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { PatientRequestSchema } from '@/types';
import {
  usePatients,
  usePatient,
  useCreatePatient,
  useUpdatePatient,
} from '@/hooks/use-patients';

export function PatientsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Filters state
  const [page, setPage] = React.useState(0);
  const [nameSearch, setNameSearch] = React.useState('');
  const [phoneSearch, setPhoneSearch] = React.useState('');

  // Dialogs state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingPatient, setEditingPatient] = React.useState(null);
  const [viewingPatientId, setViewingPatientId] = React.useState(null);

  // Main patients query
  const queryParams = React.useMemo(() => {
    const p = { page, size: 10 };
    if (nameSearch.trim().length >= 2) p.name = nameSearch.trim();
    if (phoneSearch.trim().length >= 3) p.phone = phoneSearch.trim();
    return p;
  }, [page, nameSearch, phoneSearch]);

  const patientsQuery = usePatients(queryParams);
  const viewingQuery = usePatient(viewingPatientId);
  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient();

  // Form for creation
  const createForm = useForm({
    resolver: zodResolver(PatientRequestSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      gender: 'MALE',
      address: '',
      allergies: '',
    },
  });

  // Form for update
  const updateForm = useForm({
    resolver: zodResolver(PatientRequestSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      gender: 'MALE',
      address: '',
      allergies: '',
    },
  });

  const handleOpenCreate = () => {
    createForm.reset({
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      gender: 'MALE',
      address: '',
      allergies: '',
    });
    setIsCreateOpen(true);
  };

  const handleOpenEdit = async (patientSummary) => {
    setEditingPatient(patientSummary);
    // Fetch full patient to populate fields
    try {
      const full = await viewingQuery.refetch({ patientId: patientSummary.id });
      const p = full.data || patientSummary;
      updateForm.reset({
        fullName: p.fullName,
        phone: p.phone,
        email: p.email || '',
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        address: p.address || '',
        allergies: Array.isArray(p.allergies) ? p.allergies.join(', ') : '',
      });
    } catch {
      updateForm.reset({
        fullName: patientSummary.fullName,
        phone: patientSummary.phone,
        email: '',
        dateOfBirth: patientSummary.dateOfBirth,
        gender: patientSummary.gender,
        address: '',
        allergies: '',
      });
    }
  };

  const onSubmitCreate = async (data) => {
    try {
      const allergiesArray = data.allergies
        ? data.allergies.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const payload = {
        fullName: data.fullName.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        address: data.address?.trim() || undefined,
        allergies: allergiesArray,
      };

      await createMutation.mutateAsync(payload);
      toast({
        title: 'Patient registered',
        description: `Record for ${data.fullName} has been created.`,
        variant: 'success',
      });
      setIsCreateOpen(false);
      createForm.reset();
    } catch (err) {
      toast({
        title: 'Registration failed',
        description: err.response?.data?.message || 'Could not register patient record.',
        variant: 'destructive',
      });
    }
  };

  const onSubmitUpdate = async (data) => {
    try {
      const allergiesArray = data.allergies
        ? data.allergies.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const payload = {
        fullName: data.fullName.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        address: data.address?.trim() || undefined,
        allergies: allergiesArray,
      };

      await updateMutation.mutateAsync({
        patientId: editingPatient.id,
        data: payload,
      });

      toast({
        title: 'Patient updated',
        description: `Record for ${data.fullName} was updated.`,
        variant: 'success',
      });
      setEditingPatient(null);
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err.response?.data?.message || 'Could not update patient record.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Patient Directory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Privacy-compliant patient registration and medical identification records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => patientsQuery.refetch()}
            aria-label="Refresh patients"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate} aria-label="Register patient">
            <Plus className="h-4 w-4 mr-1.5" />
            Register Patient
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name (min 2 chars)..."
            value={nameSearch}
            onChange={(e) => {
              setNameSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 text-sm"
            aria-label="Search patients by name"
          />
        </div>

        <div>
          <Input
            placeholder="Search by phone (min 3 digits)..."
            value={phoneSearch}
            onChange={(e) => {
              setPhoneSearch(e.target.value);
              setPage(0);
            }}
            className="text-sm"
            aria-label="Search patients by phone"
          />
        </div>

        {(nameSearch || phoneSearch) && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNameSearch('');
                setPhoneSearch('');
                setPage(0);
              }}
              className="text-xs text-muted-foreground"
            >
              Reset Search
            </Button>
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary shrink-0" />
        <span>
          <strong>HIPAA/GDPR Compliance:</strong> Diagnostic histories and prescription notes are withheld from tabular directories. Viewing full patient records is logged under the system audit trail.
        </span>
      </div>

      {/* Table Content */}
      {patientsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-60" />
            </Card>
          ))}
        </div>
      ) : patientsQuery.isError ? (
        <ErrorState
          title="Failed to load patients"
          message="Could not retrieve the patient directory."
          onRetry={() => patientsQuery.refetch()}
        />
      ) : (patientsQuery.data?.content || []).length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No patients found"
          description={
            nameSearch || phoneSearch
              ? 'No patients match your search criteria.'
              : 'No patient records found in the system.'
          }
          actionText={nameSearch || phoneSearch ? 'Clear Search' : 'Register Patient'}
          onAction={
            nameSearch || phoneSearch
              ? () => {
                  setNameSearch('');
                  setPhoneSearch('');
                }
              : handleOpenCreate
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Date of Birth</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {patientsQuery.data.content.map((patient) => (
                  <tr key={patient.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {patient.fullName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                      {patient.phone}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {patient.dateOfBirth}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs uppercase">
                        {patient.gender}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingPatientId(patient.id)}
                        className="h-7 text-xs"
                        aria-label={`View ${patient.fullName}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Profile
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(patient)}
                        className="h-7 text-xs"
                        aria-label={`Edit ${patient.fullName}`}
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            pageNumber={patientsQuery.data.page}
            totalPages={patientsQuery.data.totalPages}
            totalElements={patientsQuery.data.totalElements}
            pageSize={patientsQuery.data.size}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Register Patient Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register Patient</DialogTitle>
            <DialogDescription>
              Create a patient record for clinical consultations and appointment booking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="John Doe"
                {...createForm.register('fullName')}
                error={createForm.formState.errors.fullName?.message}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Phone Number <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="+919876543210"
                  {...createForm.register('phone')}
                  error={createForm.formState.errors.phone?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Email Address</label>
                <Input
                  type="email"
                  placeholder="patient@email.com"
                  {...createForm.register('email')}
                  error={createForm.formState.errors.email?.message}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Date of Birth <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  {...createForm.register('dateOfBirth')}
                  error={createForm.formState.errors.dateOfBirth?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Gender <span className="text-destructive">*</span>
                </label>
                <select
                  {...createForm.register('gender')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Home Address</label>
              <Input
                placeholder="Street address, City, Postal Code"
                {...createForm.register('address')}
                error={createForm.formState.errors.address?.message}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Known Allergies</label>
              <Input
                placeholder="e.g. Penicillin, Peanuts (comma separated)"
                {...createForm.register('allergies')}
                error={createForm.formState.errors.allergies?.message}
                className="mt-1"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createForm.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting ? 'Registering...' : 'Register Patient'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Modal */}
      <Dialog open={Boolean(editingPatient)} onOpenChange={(open) => !open && setEditingPatient(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient Record</DialogTitle>
            <DialogDescription>Update contact information and demographic details.</DialogDescription>
          </DialogHeader>

          <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Full Name</label>
              <Input
                {...updateForm.register('fullName')}
                error={updateForm.formState.errors.fullName?.message}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Phone Number</label>
                <Input
                  {...updateForm.register('phone')}
                  error={updateForm.formState.errors.phone?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Email</label>
                <Input
                  type="email"
                  {...updateForm.register('email')}
                  error={updateForm.formState.errors.email?.message}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Date of Birth</label>
                <Input
                  type="date"
                  {...updateForm.register('dateOfBirth')}
                  error={updateForm.formState.errors.dateOfBirth?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Gender</label>
                <select
                  {...updateForm.register('gender')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Address</label>
              <Input
                {...updateForm.register('address')}
                error={updateForm.formState.errors.address?.message}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Allergies (comma-separated)</label>
              <Input
                {...updateForm.register('allergies')}
                error={updateForm.formState.errors.allergies?.message}
                className="mt-1"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPatient(null)}
                disabled={updateForm.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateForm.formState.isSubmitting}>
                {updateForm.formState.isSubmitting ? 'Saving...' : 'Update Record'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Full Profile Modal (PATIENT_READ Audit Triggered) */}
      <Dialog
        open={Boolean(viewingPatientId)}
        onOpenChange={(open) => !open && setViewingPatientId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Patient Clinical Profile</DialogTitle>
            <DialogDescription>Full demographic and recorded medical allergies.</DialogDescription>
          </DialogHeader>

          {viewingQuery.isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : viewingQuery.isError ? (
            <ErrorState
              title="Failed to load profile"
              message="Could not retrieve full patient records from the backend."
            />
          ) : viewingQuery.data ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="border-b pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {viewingQuery.data.fullName}
                  </h3>
                  <p className="text-muted-foreground">{viewingQuery.data.email || 'No email registered'}</p>
                </div>
                <Badge variant="outline" className="uppercase">{viewingQuery.data.gender}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Phone Number:</span>
                  <p className="font-mono mt-0.5">{viewingQuery.data.phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date of Birth:</span>
                  <p className="mt-0.5">{viewingQuery.data.dateOfBirth}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Address:</span>
                  <p className="mt-0.5">{viewingQuery.data.address || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Registered:</span>
                  <p className="mt-0.5">{new Date(viewingQuery.data.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground font-semibold">Recorded Allergies:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(viewingQuery.data.allergies || []).length > 0 ? (
                    viewingQuery.data.allergies.map((allergy, i) => (
                      <Badge key={i} variant="destructive" className="text-[10px]">
                        {allergy}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground italic">No known drug/food allergies recorded.</span>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground border-t pt-2 font-mono">
                Patient UUID: {viewingQuery.data.id}
              </div>

              <DialogFooter className="pt-2 flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigate(`/admin/appointments?patientId=${viewingQuery.data.id}`);
                    setViewingPatientId(null);
                  }}
                  className="text-xs"
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  View Appointments
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewingPatientId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
