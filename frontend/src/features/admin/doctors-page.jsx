import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Building2,
  Calendar,
  Clock,
  DollarSign,
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
import { DoctorCreateRequestSchema, DoctorUpdateRequestSchema } from '@/types';
import {
  useDoctors,
  useDoctorSchedules,
  useCreateDoctor,
  useUpdateDoctor,
  useSpecializations,
  useClinics,
} from '@/hooks/use-doctors';
import { useDepartments } from '@/hooks/use-departments';

function DoctorScheduleSection({ doctorId }) {
  const scheduleQuery = useDoctorSchedules(doctorId, { enabled: Boolean(doctorId) });

  if (scheduleQuery.isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  if (scheduleQuery.isError) {
    return (
      <div className="flex items-center justify-between text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
        <span className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Failed to load doctor schedule.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => scheduleQuery.refetch()}
          className="h-6 px-2 text-[11px] hover:bg-destructive/20 text-destructive hover:text-destructive"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  const entries = scheduleQuery.data?.entries || [];
  if (entries.length === 0) {
    return <p className="text-[11px] text-muted-foreground italic">No weekly consultation schedule registered.</p>;
  }

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground font-semibold text-xs block">Weekly Schedule:</span>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((e, idx) => (
          <span key={idx} className="inline-flex items-center text-[10px] px-2 py-0.5 rounded bg-muted font-mono">
            {e.dayOfWeek.slice(0, 3)}: {e.startTime.slice(0, 5)}–{e.endTime.slice(0, 5)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DoctorsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Filters state
  const [page, setPage] = React.useState(0);
  const [nameSearch, setNameSearch] = React.useState('');
  const [specializationFilter, setSpecializationFilter] = React.useState('');
  const [clinicFilter, setClinicFilter] = React.useState('');

  // Dialogs state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingDoctor, setEditingDoctor] = React.useState(null);
  const [viewingDoctor, setViewingDoctor] = React.useState(null);

  // Reference queries
  const specializationsQuery = useSpecializations();
  const clinicsQuery = useClinics();
  const departmentsQuery = useDepartments();

  // Build lookup maps for display
  const specMap = React.useMemo(() => {
    const map = new Map();
    (specializationsQuery.data || []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [specializationsQuery.data]);

  const clinicMap = React.useMemo(() => {
    const map = new Map();
    (clinicsQuery.data || []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clinicsQuery.data]);

  const deptMap = React.useMemo(() => {
    const map = new Map();
    (departmentsQuery.data || []).forEach((d) => map.set(d.id, d.name));
    return map;
  }, [departmentsQuery.data]);

  // Main doctors query
  const queryParams = React.useMemo(() => {
    const p = { page, size: 10, sort: 'fullName,asc' };
    if (nameSearch.trim().length >= 2) p.name = nameSearch.trim();
    if (specializationFilter) p.specializationId = specializationFilter;
    if (clinicFilter) p.clinicId = clinicFilter;
    return p;
  }, [page, nameSearch, specializationFilter, clinicFilter]);

  const doctorsQuery = useDoctors(queryParams);
  const createMutation = useCreateDoctor();
  const updateMutation = useUpdateDoctor();

  // Form for creation
  const createForm = useForm({
    resolver: zodResolver(DoctorCreateRequestSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      phone: '',
      specializationId: '',
      clinicId: '',
      departmentId: '',
      consultationFee: '500.00',
      slotMinutes: 15,
    },
  });

  // Form for update
  const updateForm = useForm({
    resolver: zodResolver(DoctorUpdateRequestSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      specializationId: '',
      clinicId: '',
      departmentId: '',
      consultationFee: '500.00',
      slotMinutes: 15,
      active: true,
    },
  });

  const handleOpenCreate = () => {
    createForm.reset({
      fullName: '',
      email: '',
      password: '',
      phone: '',
      specializationId: specializationsQuery.data?.[0]?.id || '',
      clinicId: clinicsQuery.data?.[0]?.id || '',
      departmentId: departmentsQuery.data?.[0]?.id || '',
      consultationFee: '500.00',
      slotMinutes: 15,
    });
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (doctor) => {
    setEditingDoctor(doctor);
    updateForm.reset({
      fullName: doctor.fullName,
      phone: '',
      specializationId: doctor.specializationId,
      clinicId: doctor.clinicId,
      departmentId: doctor.departmentId,
      consultationFee: doctor.consultationFee,
      slotMinutes: doctor.slotMinutes,
      active: doctor.active,
    });
  };

  const onSubmitCreate = async (data) => {
    try {
      const payload = {
        ...data,
        phone: data.phone?.trim() ? data.phone.trim() : undefined,
      };
      await createMutation.mutateAsync(payload);
      toast({
        title: 'Doctor provisioned',
        description: `Physician account for Dr. ${data.fullName} has been created.`,
        variant: 'success',
      });
      setIsCreateOpen(false);
      createForm.reset();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'EMAIL_ALREADY_EXISTS') {
        createForm.setError('email', {
          type: 'manual',
          message: 'A user account with this email address already exists.',
        });
      } else {
        toast({
          title: 'Creation failed',
          description: err.response?.data?.message || 'Could not provision doctor.',
          variant: 'destructive',
        });
      }
    }
  };

  const onSubmitUpdate = async (data) => {
    try {
      const payload = {
        ...data,
        phone: data.phone?.trim() ? data.phone.trim() : undefined,
      };
      await updateMutation.mutateAsync({
        doctorId: editingDoctor.id,
        data: payload,
      });
      toast({
        title: 'Doctor updated',
        description: `Dr. ${data.fullName}'s profile has been updated.`,
        variant: 'success',
      });
      setEditingDoctor(null);
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err.response?.data?.message || 'Could not update doctor profile.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Physician Directory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage hospital medical staff, clinic affiliations, consultation fees, and active rosters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => doctorsQuery.refetch()}
            aria-label="Refresh doctors list"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate} aria-label="Add new doctor">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Doctor
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Search */}
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
            aria-label="Search doctors by name"
          />
        </div>

        {/* Specialization Filter */}
        <div>
          <select
            value={specializationFilter}
            onChange={(e) => {
              setSpecializationFilter(e.target.value);
              setPage(0);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Filter by specialization"
          >
            <option value="">All Specializations</option>
            {(specializationsQuery.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clinic Filter */}
        <div>
          <select
            value={clinicFilter}
            onChange={(e) => {
              setClinicFilter(e.target.value);
              setPage(0);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Filter by clinic"
          >
            <option value="">All Clinics</option>
            {(clinicsQuery.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters */}
        {(nameSearch || specializationFilter || clinicFilter) && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNameSearch('');
                setSpecializationFilter('');
                setClinicFilter('');
                setPage(0);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      {doctorsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : doctorsQuery.isError ? (
        <ErrorState
          title="Failed to load physicians"
          message="Could not retrieve doctor directory from the server."
          onRetry={() => doctorsQuery.refetch()}
        />
      ) : (doctorsQuery.data?.content || []).length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors found"
          description={
            nameSearch || specializationFilter || clinicFilter
              ? 'No doctors match your active filters. Try adjusting your search criteria.'
              : 'No doctors are currently registered. Click below to add a physician.'
          }
          actionText={nameSearch || specializationFilter ? 'Clear Filters' : 'Add Doctor'}
          onAction={
            nameSearch || specializationFilter
              ? () => {
                  setNameSearch('');
                  setSpecializationFilter('');
                  setClinicFilter('');
                }
              : handleOpenCreate
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3">
            {doctorsQuery.data.content.map((doc) => (
              <Card key={doc.id} className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Left: Avatar & Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {doc.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">{doc.fullName}</h3>
                        {doc.active ? (
                          <Badge variant="success" className="text-[10px]">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {specMap.get(doc.specializationId) || 'Specialist'} • {deptMap.get(doc.departmentId) || 'Department'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                        Clinic: {clinicMap.get(doc.clinicId) || 'Main Hospital'} • Fee: ₹{doc.consultationFee} • Slot: {doc.slotMinutes} mins
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewingDoctor(doc)}
                      className="h-8 text-xs"
                      aria-label={`View Dr. ${doc.fullName}`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(doc)}
                      className="h-8 text-xs"
                      aria-label={`Edit Dr. ${doc.fullName}`}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            pageNumber={doctorsQuery.data.page}
            totalPages={doctorsQuery.data.totalPages}
            totalElements={doctorsQuery.data.totalElements}
            pageSize={doctorsQuery.data.size}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Create Doctor Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Provision Physician Account</DialogTitle>
            <DialogDescription>
              Create a new user account with DOCTOR role and clinical profile parameters.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Dr. Jane Doe"
                {...createForm.register('fullName')}
                error={createForm.formState.errors.fullName?.message}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Email Address <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="doctor@caresync.com"
                  {...createForm.register('email')}
                  error={createForm.formState.errors.email?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Initial Password <span className="text-destructive">*</span>
                </label>
                <Input
                  type="password"
                  placeholder="Min 8 characters"
                  {...createForm.register('password')}
                  error={createForm.formState.errors.password?.message}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Phone Number</label>
              <Input
                placeholder="+919876543210"
                {...createForm.register('phone')}
                error={createForm.formState.errors.phone?.message}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Specialization <span className="text-destructive">*</span>
                </label>
                <select
                  {...createForm.register('specializationId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  <option value="">Select...</option>
                  {(specializationsQuery.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {createForm.formState.errors.specializationId && (
                  <p className="text-xs text-destructive mt-1">
                    {createForm.formState.errors.specializationId.message}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Department <span className="text-destructive">*</span>
                </label>
                <select
                  {...createForm.register('departmentId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  <option value="">Select...</option>
                  {(departmentsQuery.data || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {createForm.formState.errors.departmentId && (
                  <p className="text-xs text-destructive mt-1">
                    {createForm.formState.errors.departmentId.message}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Clinic Location <span className="text-destructive">*</span>
                </label>
                <select
                  {...createForm.register('clinicId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  <option value="">Select...</option>
                  {(clinicsQuery.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {createForm.formState.errors.clinicId && (
                  <p className="text-xs text-destructive mt-1">
                    {createForm.formState.errors.clinicId.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Consultation Fee (₹) <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="500.00"
                  {...createForm.register('consultationFee')}
                  error={createForm.formState.errors.consultationFee?.message}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Slot Duration (Minutes) <span className="text-destructive">*</span>
                </label>
                <select
                  {...createForm.register('slotMinutes')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
                {createForm.formState.errors.slotMinutes && (
                  <p className="text-xs text-destructive mt-1">
                    {createForm.formState.errors.slotMinutes.message}
                  </p>
                )}
              </div>
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
                {createForm.formState.isSubmitting ? 'Provisioning...' : 'Provision Doctor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Doctor Modal */}
      <Dialog open={Boolean(editingDoctor)} onOpenChange={(open) => !open && setEditingDoctor(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Doctor Profile</DialogTitle>
            <DialogDescription>
              Update clinical affiliations, fees, or toggle active duty status.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                {...updateForm.register('fullName')}
                error={updateForm.formState.errors.fullName?.message}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Phone Number</label>
              <Input
                placeholder="+919876543210"
                {...updateForm.register('phone')}
                error={updateForm.formState.errors.phone?.message}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Specialization</label>
                <select
                  {...updateForm.register('specializationId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  {(specializationsQuery.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Department</label>
                <select
                  {...updateForm.register('departmentId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  {(departmentsQuery.data || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Clinic</label>
                <select
                  {...updateForm.register('clinicId')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                >
                  {(clinicsQuery.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Consultation Fee (₹)</label>
                <Input
                  {...updateForm.register('consultationFee')}
                  error={updateForm.formState.errors.consultationFee?.message}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Slot Minutes</label>
                <select
                  {...updateForm.register('slotMinutes')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>
            </div>

            {/* Active Switch */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
              <div>
                <p className="text-xs font-semibold text-foreground">Active for Consultations</p>
                <p className="text-[11px] text-muted-foreground">
                  Inactive doctors cannot receive new patient appointment bookings.
                </p>
              </div>
              <input
                type="checkbox"
                id="doc-active"
                {...updateForm.register('active')}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingDoctor(null)}
                disabled={updateForm.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateForm.formState.isSubmitting}>
                {updateForm.formState.isSubmitting ? 'Updating...' : 'Update Doctor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Doctor Details Modal */}
      <Dialog open={Boolean(viewingDoctor)} onOpenChange={(open) => !open && setViewingDoctor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Physician Information</DialogTitle>
            <DialogDescription>Full clinical profile and assignment records.</DialogDescription>
          </DialogHeader>

          {viewingDoctor && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 border-b pb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                  {viewingDoctor.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-base">{viewingDoctor.fullName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {specMap.get(viewingDoctor.specializationId) || 'Specialist'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Department:</span>
                  <p className="font-medium mt-0.5">{deptMap.get(viewingDoctor.departmentId) || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Clinic Branch:</span>
                  <p className="font-medium mt-0.5">{clinicMap.get(viewingDoctor.clinicId) || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Consultation Fee:</span>
                  <p className="font-medium mt-0.5">₹{viewingDoctor.consultationFee}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Slot Duration:</span>
                  <p className="font-medium mt-0.5">{viewingDoctor.slotMinutes} minutes</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Account Status:</span>
                  <div className="mt-0.5">
                    {viewingDoctor.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Doctor UUID:</span>
                  <p className="font-mono text-[11px] mt-0.5 truncate">{viewingDoctor.id}</p>
                </div>
              </div>

              {/* Weekly Consultation Schedules */}
              <div className="border-t pt-3">
                <DoctorScheduleSection doctorId={viewingDoctor.id} />
              </div>

              <DialogFooter className="pt-2 flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigate(`/admin/appointments?doctorId=${viewingDoctor.id}`);
                    setViewingDoctor(null);
                  }}
                  className="text-xs"
                >
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  View Appointments
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewingDoctor(null)}>
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
