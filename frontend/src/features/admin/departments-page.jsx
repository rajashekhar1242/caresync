import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Info,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { DepartmentRequestSchema } from '@/types';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
} from '@/hooks/use-departments';

export function DepartmentsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingDepartment, setEditingDepartment] = React.useState(null);

  // Queries & Mutations
  const departmentsQuery = useDepartments();
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(DepartmentRequestSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Open dialog for creation
  const handleOpenCreate = () => {
    setEditingDepartment(null);
    reset({ name: '', description: '' });
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleOpenEdit = (dept) => {
    setEditingDepartment(dept);
    reset({
      name: dept.name,
      description: dept.description || '',
    });
    setIsDialogOpen(true);
  };

  // Form submission handler
  const onSubmit = async (data) => {
    try {
      if (editingDepartment) {
        await updateMutation.mutateAsync({
          departmentId: editingDepartment.id,
          data,
        });
        toast({
          title: 'Department updated',
          description: `Department "${data.name}" was successfully updated.`,
          variant: 'success',
        });
      } else {
        await createMutation.mutateAsync(data);
        toast({
          title: 'Department created',
          description: `Department "${data.name}" has been established.`,
          variant: 'success',
        });
      }
      setIsDialogOpen(false);
      reset();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'DEPARTMENT_NAME_EXISTS') {
        setError('name', {
          type: 'manual',
          message: 'A department with this name already exists (case-insensitive).',
        });
      } else {
        toast({
          title: 'Operation failed',
          description: err.response?.data?.message || 'Could not save department. Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  // Filtered department list
  const filteredDepartments = React.useMemo(() => {
    const list = departmentsQuery.data || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (dept) =>
        dept.name.toLowerCase().includes(term) ||
        (dept.description && dept.description.toLowerCase().includes(term))
    );
  }, [departmentsQuery.data, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Department Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure clinical wings, hospital departments, and medical specialties.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => departmentsQuery.refetch()}
            aria-label="Refresh departments list"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenCreate} aria-label="Add new department">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Department
          </Button>
        </div>
      </div>

      {/* Backend Policy Notice */}
      <div className="rounded-md border border-blue-200 bg-blue-50/50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Department Integrity Guarantee</p>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300">
            Departments can be added and updated at any time. Department deletion is intentionally disabled by the backend schema to prevent orphaned physician schedules and clinical history.
          </p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search departments by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-sm"
            aria-label="Search departments"
          />
        </div>
      </div>

      {/* Main Content */}
      {departmentsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : departmentsQuery.isError ? (
        <ErrorState
          title="Failed to load departments"
          message="Could not retrieve clinical department reference data."
          onRetry={() => departmentsQuery.refetch()}
        />
      ) : filteredDepartments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={searchTerm ? 'No matching departments' : 'No departments registered'}
          description={
            searchTerm
              ? `No departments found matching "${searchTerm}". Try a different search query.`
              : 'Add your first clinical department to organize physician specialties.'
          }
          actionText={searchTerm ? 'Clear Search' : 'Add Department'}
          onAction={searchTerm ? () => setSearchTerm('') : handleOpenCreate}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDepartments.map((dept) => (
            <Card key={dept.id} className="flex flex-col justify-between hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold leading-tight">{dept.name}</CardTitle>
                  </div>
                </div>
                <CardDescription className="text-xs mt-2 line-clamp-3">
                  {dept.description || 'No formal description specified.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-between border-t border-muted/50 mt-3 py-3">
                <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[150px]">
                  ID: {dept.id.slice(0, 8)}...
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEdit(dept)}
                  className="h-7 text-xs"
                  aria-label={`Edit ${dept.name}`}
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Department Modal Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDepartment ? 'Edit Department' : 'Create New Department'}</DialogTitle>
            <DialogDescription>
              {editingDepartment
                ? 'Update the department name or clinical description.'
                : 'Enter department details. Names must be unique across the hospital system.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div>
              <label htmlFor="dept-name" className="text-xs font-semibold text-foreground">
                Department Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="dept-name"
                placeholder="e.g. Cardiology, Orthopedics, Pediatrics"
                {...register('name')}
                error={errors.name?.message}
                className="mt-1"
              />
            </div>

            <div>
              <label htmlFor="dept-description" className="text-xs font-semibold text-foreground">
                Description
              </label>
              <Textarea
                id="dept-description"
                placeholder="Clinical functions, diagnostic coverage, or operational notes..."
                {...register('description')}
                error={errors.description?.message}
                className="mt-1"
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingDepartment ? 'Update Department' : 'Create Department'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
