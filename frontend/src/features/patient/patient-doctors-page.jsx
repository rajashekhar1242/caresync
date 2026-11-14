import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Stethoscope,
  Search,
  Filter,
  CalendarPlus,
  Clock,
  Building2,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import { useDoctors, useDoctorSchedules } from '@/hooks/use-doctors';
import { useDepartments } from '@/hooks/use-departments';
import { useSpecializations } from '@/hooks/use-doctors';

export function PatientDoctorsPage() {
  const [searchName, setSearchName] = React.useState('');
  const [debouncedName, setDebouncedName] = React.useState('');
  const [selectedDept, setSelectedDept] = React.useState('');
  const [selectedSpec, setSelectedSpec] = React.useState('');

  // Doctor schedule modal state
  const [viewingDoctor, setViewingDoctor] = React.useState(null);

  // Debounce doctor name search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedName(searchName.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchName]);

  // Queries
  const doctorsQuery = useDoctors({
    name: debouncedName || undefined,
    specializationId: selectedSpec || undefined,
    size: 50,
  });

  const departmentsQuery = useDepartments();
  const specializationsQuery = useSpecializations();

  const doctors = React.useMemo(() => doctorsQuery.data?.content || [], [doctorsQuery.data]);
  const departments = React.useMemo(() => departmentsQuery.data || [], [departmentsQuery.data]);
  const specializations = React.useMemo(() => specializationsQuery.data || [], [specializationsQuery.data]);

  // Filter in memory if department is selected (since backend accepts specializationId & clinicId)
  const filteredDoctors = React.useMemo(() => {
    if (!selectedDept) return doctors;
    return doctors.filter((doc) => doc.departmentId === selectedDept);
  }, [doctors, selectedDept]);

  const handleResetFilters = () => {
    setSearchName('');
    setDebouncedName('');
    setSelectedDept('');
    setSelectedSpec('');
  };

  const hasFilters = Boolean(searchName || selectedDept || selectedSpec);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Find Specialists & Physicians
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse our licensed hospital physicians, view consultation fees, and schedule an appointment.
          </p>
        </div>
        <Link to="/patient/book-appointment">
          <Button size="sm" className="text-xs">
            <CalendarPlus className="h-4 w-4 mr-1.5" /> Direct Slot Booking
          </Button>
        </Link>
      </div>

      {/* Filter Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by physician name..."
                className="pl-8 h-9 text-xs"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            {/* Specialization Filter */}
            <div>
              <select
                aria-label="Filter by Specialization"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedSpec}
                onChange={(e) => setSelectedSpec(e.target.value)}
              >
                <option value="">All Specializations</option>
                {specializations.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by Department"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetFilters}
                  aria-label="Clear filters"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Doctors Grid */}
      {doctorsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-8 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredDoctors.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Stethoscope className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground">No Physicians Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {hasFilters
              ? 'No doctors match the selected search or filter criteria. Try clearing filters.'
              : 'No doctors are currently registered in the clinic roster.'}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-4 text-xs">
              Clear All Filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDoctors.map((doc) => {
            const specName =
              doc.specialization?.name ||
              specializations.find((s) => s.id === doc.specializationId)?.name ||
              'General Practice';

            const deptName =
              doc.department?.name ||
              departments.find((d) => d.id === doc.departmentId)?.name ||
              'Clinical Outpatient';

            return (
              <Card key={doc.id} className="shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">
                        {doc.fullName}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] mt-1 text-primary border-primary/30">
                        {specName}
                      </Badge>
                    </div>
                    <Badge variant={doc.active ? 'success' : 'secondary'} className="text-[10px]">
                      {doc.active ? 'Available' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    {deptName} · CareSync Hospital
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pb-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/30 border text-[11px]">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Consultation Fee</span>
                      <span className="font-semibold text-foreground">
                        INR {doc.consultationFee || '500.00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Slot Duration</span>
                      <span className="font-semibold text-foreground">
                        {doc.slotMinutes || 30} minutes
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setViewingDoctor(doc)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Schedule
                  </Button>
                  <Link to={`/patient/book-appointment?doctorId=${doc.id}`} className="flex-1">
                    <Button size="sm" className="w-full text-xs" disabled={!doc.active}>
                      <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Book
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Doctor Schedule Modal */}
      {viewingDoctor && (
        <DoctorWeeklyScheduleModal
          doctor={viewingDoctor}
          onClose={() => setViewingDoctor(null)}
        />
      )}
    </div>
  );
}

function DoctorWeeklyScheduleModal({ doctor, onClose }) {
  const scheduleQuery = useDoctorSchedules(doctor.id);
  const entries = scheduleQuery.data?.entries || [];

  const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Working Shifts: {doctor.fullName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Standard weekly consultation hours at CareSync Clinic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {scheduleQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              No regular shifts configured for this physician.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {daysOfWeek.map((day) => {
                const shift = entries.find((e) => e.dayOfWeek === day);
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between p-2 rounded-md border text-xs ${
                      shift ? 'bg-card border-border' : 'bg-muted/20 border-dashed text-muted-foreground'
                    }`}
                  >
                    <span className="font-semibold uppercase text-[11px]">{day.slice(0, 3)}</span>
                    {shift ? (
                      <span className="font-mono text-foreground font-medium">
                        {shift.startTime} – {shift.endTime}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic text-[11px]">Off Duty</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            Close
          </Button>
          <Link to={`/patient/book-appointment?doctorId=${doctor.id}`}>
            <Button size="sm" className="text-xs" disabled={!doctor.active}>
              <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Book with this Doctor
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
