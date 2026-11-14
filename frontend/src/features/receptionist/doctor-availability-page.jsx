import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  Search,
  Calendar,
  Clock,
  Building2,
  CalendarPlus,
  AlertCircle,
  CheckCircle2,
  CalendarX,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDoctors, useSpecializations, useDoctorSchedules, useDoctorLeaves, useDoctorSlots } from '@/hooks/use-doctors';
import { useDepartments } from '@/hooks/use-departments';
import { getClinicTodayDateString } from '@/lib/utils';

export function DoctorAvailabilityPage() {
  const navigate = useNavigate();

  // Search and filter state
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedDeptId, setSelectedDeptId] = React.useState('');
  const [selectedSpecId, setSelectedSpecId] = React.useState('');

  // Selected doctor for Schedule/Leaves modal
  const [scheduleDoctor, setScheduleDoctor] = React.useState(null);

  // Selected doctor & date for Slot Inspector modal (defaults to clinic today)
  const [slotDoctor, setSlotDoctor] = React.useState(null);
  const [slotDate, setSlotDate] = React.useState(() => getClinicTodayDateString());

  // Queries
  const doctorsQuery = useDoctors({
    specializationId: selectedSpecId || undefined,
    name: searchTerm.trim().length >= 2 ? searchTerm.trim() : undefined,
    size: 50,
  });

  const departmentsQuery = useDepartments();
  const specializationsQuery = useSpecializations();

  // Schedule & Leave queries for modal
  const scheduleQuery = useDoctorSchedules(scheduleDoctor?.id, {
    enabled: Boolean(scheduleDoctor),
  });
  const leavesQuery = useDoctorLeaves(scheduleDoctor?.id, undefined, undefined, {
    enabled: Boolean(scheduleDoctor),
  });

  // Slot query for Slot Inspector modal
  const slotsQuery = useDoctorSlots(slotDoctor?.id, slotDate, {
    enabled: Boolean(slotDoctor && slotDate),
  });

  const allDoctors = React.useMemo(
    () => doctorsQuery.data?.content || [],
    [doctorsQuery.data]
  );

  // Filter client-side by department if selected
  const doctors = React.useMemo(() => {
    if (!selectedDeptId) return allDoctors;
    return allDoctors.filter((doc) => doc.department?.id === selectedDeptId);
  }, [allDoctors, selectedDeptId]);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Doctor Availability & Schedules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse physicians, inspect weekly consultation hours, leaves, and live slot availability.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => doctorsQuery.refetch()}
          disabled={doctorsQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${doctorsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search physician by name..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
              >
                <option value="">All Departments</option>
                {departmentsQuery.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSpecId}
                onChange={(e) => setSelectedSpecId(e.target.value)}
              >
                <option value="">All Specializations</option>
                {specializationsQuery.data?.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Doctor Cards Grid */}
      {doctorsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : doctorsQuery.isError ? (
        <ErrorState
          title="Failed to Load Physicians"
          description={doctorsQuery.error?.message || 'Could not retrieve doctor directory.'}
          retryAction={() => doctorsQuery.refetch()}
        />
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No Physicians Found"
          description="No doctors match the selected search or department filter."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearchTerm('');
            setSelectedDeptId('');
            setSelectedSpecId('');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((doc) => (
            <Card
              key={doc.id}
              className="flex flex-col justify-between hover:shadow-md transition-shadow border bg-card"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-bold text-foreground truncate">
                      {doc.fullName}
                    </CardTitle>
                    <p className="text-xs font-medium text-primary mt-0.5">
                      {doc.specialization?.name || 'General Practice'}
                    </p>
                  </div>
                  {doc.active ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                      Inactive
                    </Badge>
                  )}
                </div>
                <CardDescription className="flex items-center gap-1.5 text-xs mt-1">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{doc.department?.name || 'Main OPD'}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2 text-xs text-muted-foreground pb-4">
                <div className="flex items-center justify-between border-t pt-2">
                  <span>Consultation Fee:</span>
                  <span className="font-semibold text-foreground font-mono">
                    {doc.consultationFee}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Slot Duration:</span>
                  <span className="font-medium text-foreground">{doc.slotMinutes} minutes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Clinic Branch:</span>
                  <span className="font-medium text-foreground truncate max-w-[140px]">
                    {doc.clinic?.name || 'Central Clinic'}
                  </span>
                </div>
              </CardContent>

              <div className="p-4 pt-0 border-t mt-auto flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => setScheduleDoctor(doc)}
                >
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  Schedule
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setSlotDoctor(doc);
                    setSlotDate(getClinicTodayDateString());
                  }}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  Slots
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-primary text-primary-foreground"
                  onClick={() => navigate(`/receptionist/appointments/book?doctorId=${doc.id}`)}
                >
                  Book
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Doctor Weekly Schedule & Leaves Modal */}
      <Dialog
        open={Boolean(scheduleDoctor)}
        onOpenChange={(open) => !open && setScheduleDoctor(null)}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <span>Weekly Schedule & Leaves</span>
            </DialogTitle>
            <DialogDescription>
              Authoritative working hours for <strong className="text-foreground">{scheduleDoctor?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Schedule Section */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Consultation Working Days
              </h4>
              {scheduleQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : scheduleQuery.data?.entries && scheduleQuery.data.entries.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {scheduleQuery.data.entries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded border bg-muted/30 flex items-center justify-between"
                    >
                      <span className="font-semibold text-foreground">{entry.dayOfWeek}</span>
                      <span className="font-mono text-muted-foreground">
                        {entry.startTime} – {entry.endTime}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic p-3 border rounded bg-muted/20">
                  No weekly schedule entries found for this physician.
                </p>
              )}
            </div>

            {/* Approved Leaves Section */}
            <div className="pt-3 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CalendarX className="h-3.5 w-3.5 text-rose-500" />
                Approved Leave Periods
              </h4>
              {leavesQuery.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : leavesQuery.data && leavesQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {leavesQuery.data.map((leave) => (
                    <div
                      key={leave.id}
                      className="p-2.5 rounded border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-rose-700 dark:text-rose-300">
                          {leave.startDate} to {leave.endDate}
                        </span>
                        {leave.reason && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{leave.reason}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-rose-700 border-rose-300 text-[10px]">
                        On Leave
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No upcoming leaves scheduled.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleDoctor(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const doc = scheduleDoctor;
                setScheduleDoctor(null);
                setSlotDoctor(doc);
                setSlotDate(getClinicTodayDateString());
              }}
            >
              Check Slots
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot Inspector Modal */}
      <Dialog
        open={Boolean(slotDoctor)}
        onOpenChange={(open) => !open && setSlotDoctor(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              <span>Available Appointment Slots</span>
            </DialogTitle>
            <DialogDescription>
              Backend-generated slots for <strong className="text-foreground">{slotDoctor?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date Picker Bar */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Select Date:
              </label>
              <Input
                type="date"
                className="w-auto h-9 text-xs"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
              />
              <span className="text-xs text-muted-foreground font-mono">
                {slotDoctor?.slotMinutes}m slots · {slotDoctor?.clinic?.timeZone || 'Asia/Kolkata'}
              </span>
            </div>

            {/* Slots Result */}
            {!slotDoctor ? null : slotsQuery.isLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 py-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 text-xs text-rose-700">
                {slotsQuery.error?.response?.data?.message || 'Failed to generate slots for this date.'}
              </div>
            ) : slotsQuery.data?.closedReason ? (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Clinic Closed for Booking: {slotsQuery.data.closedReason}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {slotsQuery.data.closedReason === 'NO_SCHEDULE' && 'Doctor has no scheduled working hours on this day.'}
                  {slotsQuery.data.closedReason === 'ON_LEAVE' && 'Doctor is on approved leave for this date.'}
                  {slotsQuery.data.closedReason === 'OUTSIDE_BOOKING_WINDOW' && 'Requested date is outside the hospital advance booking window.'}
                  {slotsQuery.data.closedReason === 'DOCTOR_INACTIVE' && 'Doctor profile is currently inactive.'}
                </p>
              </div>
            ) : !slotsQuery.data?.slots || slotsQuery.data.slots.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                No appointment slots generated for this date.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Total: {slotsQuery.data?.slots?.length || 0} slots (
                    {slotsQuery.data?.slots?.filter((s) => s.available).length || 0} available)
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 inline-block" /> Booked
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                  {(slotsQuery.data?.slots || []).map((slot, idx) => {
                    const startStr = new Date(slot.start).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <Button
                        key={idx}
                        size="sm"
                        variant={slot.available ? 'outline' : 'secondary'}
                        disabled={!slot.available}
                        className={`h-9 text-xs font-mono justify-center ${
                          slot.available
                            ? 'border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:hover:bg-emerald-950/30'
                            : 'opacity-50 line-through cursor-not-allowed'
                        }`}
                        onClick={() => {
                          const docId = slotDoctor.id;
                          const slotStart = slot.start;
                          setSlotDoctor(null);
                          navigate(
                            `/receptionist/appointments/book?doctorId=${docId}&slotStart=${encodeURIComponent(
                              slotStart
                            )}&date=${slotDate}`
                          );
                        }}
                      >
                        {startStr}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSlotDoctor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
