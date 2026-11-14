import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus,
  Search,
  User,
  Stethoscope,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  UserCheck,
  Building2,
  Phone,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatients, usePatient } from '@/hooks/use-patients';
import { useDoctors, useDoctorSlots } from '@/hooks/use-doctors';
import { useDepartments } from '@/hooks/use-departments';
import { useBookAppointment, useCheckInAppointment } from '@/hooks/use-appointments';
import { useToast } from '@/hooks/use-toast';
import { getClinicTodayDateString } from '@/lib/utils';

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Initial params from URL
  const initialPatientId = searchParams.get('patientId') || '';
  const initialDoctorId = searchParams.get('doctorId') || '';
  const initialDate = searchParams.get('date') || getClinicTodayDateString();
  const initialSlotStart = searchParams.get('slotStart') || '';

  // Form state
  const [selectedPatientId, setSelectedPatientId] = React.useState(initialPatientId);
  const [patientSearch, setPatientSearch] = React.useState('');
  const [selectedDeptId, setSelectedDeptId] = React.useState('');
  const [selectedDoctorId, setSelectedDoctorId] = React.useState(initialDoctorId);
  const [appointmentDate, setAppointmentDate] = React.useState(initialDate);
  const [selectedSlotStart, setSelectedSlotStart] = React.useState(initialSlotStart);
  const [reason, setReason] = React.useState('');

  // Confirmation / error state
  const [confirmedAppt, setConfirmedAppt] = React.useState(null);
  const [submitError, setSubmitError] = React.useState(null);

  // Queries
  const patientQuery = usePatient(selectedPatientId);
  const patientsSearchQuery = usePatients(
    patientSearch.length >= 2
      ? { name: patientSearch, size: 5 }
      : { size: 5 }
  );

  const departmentsQuery = useDepartments();
  const doctorsQuery = useDoctors({ size: 100 });

  // Doctor slots query (authoritative backend slot generation)
  const slotsQuery = useDoctorSlots(selectedDoctorId, appointmentDate, {
    enabled: Boolean(selectedDoctorId && appointmentDate),
  });

  // Mutations
  const bookAppointmentMutation = useBookAppointment();
  const checkInMutation = useCheckInAppointment();

  const allDoctors = React.useMemo(
    () => doctorsQuery.data?.content || [],
    [doctorsQuery.data]
  );
  const filteredDoctors = React.useMemo(() => {
    if (!selectedDeptId) return allDoctors;
    return allDoctors.filter((doc) => doc.department?.id === selectedDeptId);
  }, [allDoctors, selectedDeptId]);

  const selectedDoctor = allDoctors.find((d) => d.id === selectedDoctorId);

  // Auto-fill selected slot from initialSlotStart if available in slots query
  React.useEffect(() => {
    if (initialSlotStart && !selectedSlotStart) {
      setSelectedSlotStart(initialSlotStart);
    }
  }, [initialSlotStart, selectedSlotStart]);

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedPatientId) {
      setSubmitError('Please select a patient before booking.');
      return;
    }
    if (!selectedDoctorId) {
      setSubmitError('Please select a physician.');
      return;
    }
    if (!selectedSlotStart) {
      setSubmitError('Please select an available appointment slot.');
      return;
    }

    const payload = {
      patientId: selectedPatientId,
      doctorId: selectedDoctorId,
      slotStart: selectedSlotStart,
      reason: reason.trim() || undefined,
    };

    try {
      const response = await bookAppointmentMutation.mutateAsync(payload);
      setConfirmedAppt(response);
      toast({
        title: 'Appointment Booked Successfully',
        description: `Encounter booked for ${response.patientName} with Dr. ${response.doctorName}.`,
        variant: 'default',
      });
      // Invalidate slots so the booked slot is marked unavailable
      slotsQuery.refetch();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Could not complete booking. The slot may have already been reserved.';
      setSubmitError(msg);
      toast({
        title: 'Booking Conflict',
        description: msg,
        variant: 'destructive',
      });
      slotsQuery.refetch();
    }
  };

  const handleInstantCheckIn = async () => {
    if (!confirmedAppt) return;
    try {
      const updated = await checkInMutation.mutateAsync(confirmedAppt.id);
      setConfirmedAppt(updated);
      toast({
        title: 'Patient Checked In',
        description: `Queue Token #${updated.tokenNumber} issued.`,
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Check-In Error',
        description: err.response?.data?.message || 'Could not check in patient.',
        variant: 'destructive',
      });
    }
  };

  const handleResetWorkflow = () => {
    setConfirmedAppt(null);
    setSubmitError(null);
    setSelectedSlotStart('');
    setReason('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/receptionist/appointments')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Appointments Desk
          </Button>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
          Booking Engine
        </Badge>
      </div>

      {confirmedAppt ? (
        /* Confirmed Booking Screen */
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              Appointment Successfully Confirmed
            </CardTitle>
            <CardDescription>
              Encounter has been entered into the hospital scheduling system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xl mx-auto">
            <div className="p-4 rounded-lg bg-card border space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-semibold">
                  Status
                </span>
                <Badge className={confirmedAppt.status === 'CHECKED_IN' ? 'bg-amber-600' : 'bg-primary'}>
                  {confirmedAppt.status}
                </Badge>
              </div>

              {confirmedAppt.tokenNumber && (
                <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded border border-amber-200">
                  <span className="text-xs font-semibold text-amber-800">Queue Token:</span>
                  <span className="text-lg font-bold text-amber-700">
                    #{confirmedAppt.tokenNumber}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Patient:</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5">
                    {confirmedAppt.patientName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Physician:</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5">
                    Dr. {confirmedAppt.doctorName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Scheduled Time:</span>
                  <p className="font-mono text-foreground font-semibold mt-0.5">
                    {new Date(confirmedAppt.slotStart).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Appointment ID:</span>
                  <p className="font-mono text-muted-foreground text-[11px] truncate mt-0.5">
                    {confirmedAppt.id}
                  </p>
                </div>
              </div>

              {confirmedAppt.reason && (
                <div className="pt-2 border-t text-xs">
                  <span className="text-muted-foreground">Visit Reason:</span>
                  <p className="text-foreground mt-0.5 italic">{confirmedAppt.reason}</p>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2 max-w-xl mx-auto">
            {confirmedAppt.status === 'BOOKED' && (
              <Button
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleInstantCheckIn}
                disabled={checkInMutation.isPending}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {checkInMutation.isPending ? 'Checking In...' : 'Check-In Patient Now'}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleResetWorkflow}
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Book Another Appointment
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => navigate('/receptionist/appointments')}
            >
              Go to Appointments List
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* Booking Stepper Form */
        <form onSubmit={handleSubmitBooking} className="space-y-6">
          {submitError && (
            <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{submitError}</span>
            </div>
          )}

          {/* STEP 1: Patient Selection */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Step 1: Patient Selection
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => navigate('/receptionist/patients/register')}
                >
                  New Walk-in Patient
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {patientQuery.data ? (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">
                      {patientQuery.data.fullName}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Phone: {patientQuery.data.phone || 'None'} · DOB: {patientQuery.data.dateOfBirth || '—'} · Gender: {patientQuery.data.gender || '—'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedPatientId('')}
                  >
                    Change Patient
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search patient by name or phone..."
                      className="pl-9 text-sm"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                    />
                  </div>

                  {patientsSearchQuery.data?.content && patientsSearchQuery.data.content.length > 0 && (
                    <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                      {patientsSearchQuery.data.content.map((p) => (
                        <div
                          key={p.id}
                          className="p-2.5 hover:bg-muted/50 cursor-pointer flex items-center justify-between text-xs"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setPatientSearch('');
                          }}
                        >
                          <div>
                            <span className="font-semibold text-foreground">{p.fullName}</span>
                            <span className="text-muted-foreground ml-2 font-mono">{p.phone}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">Select</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 2: Department & Doctor Selection */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-primary" />
                Step 2: Department & Physician
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Filter Department (Optional):
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedDeptId}
                    onChange={(e) => {
                      setSelectedDeptId(e.target.value);
                      setSelectedDoctorId('');
                      setSelectedSlotStart('');
                    }}
                  >
                    <option value="">All Departments</option>
                    {departmentsQuery.data?.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Select Physician <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedDoctorId}
                    onChange={(e) => {
                      setSelectedDoctorId(e.target.value);
                      setSelectedSlotStart('');
                    }}
                    required
                  >
                    <option value="">Choose a Doctor</option>
                    {filteredDoctors.map((doc) => (
                      <option key={doc.id} value={doc.id} disabled={!doc.active}>
                        {doc.fullName} ({doc.specialization?.name || 'General'}) — {doc.consultationFee}
                        {!doc.active ? ' [Inactive]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedDoctor && (
                <div className="p-3 rounded-lg bg-muted/30 border text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">Clinic: </span>
                    <span className="text-muted-foreground">{selectedDoctor.clinic?.name || 'Main Clinic'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Consultation Fee: </span>
                    <span className="font-mono text-primary font-bold">{selectedDoctor.consultationFee}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Slot Duration: </span>
                    <span className="text-muted-foreground">{selectedDoctor.slotMinutes} minutes</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 3: Date & Slot Selection */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Step 3: Appointment Date & Slot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="space-y-1.5 w-full sm:w-auto">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Encounter Date <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="date"
                    className="w-full sm:w-48 text-sm"
                    value={appointmentDate}
                    onChange={(e) => {
                      setAppointmentDate(e.target.value);
                      setSelectedSlotStart('');
                    }}
                    required
                  />
                </div>
                {selectedDoctor && (
                  <div className="text-xs text-muted-foreground mt-auto sm:mb-2">
                    Time Zone: <span className="font-mono font-medium">{selectedDoctor.clinic?.timeZone || 'Asia/Kolkata'}</span>
                  </div>
                )}
              </div>

              {/* Slot Grid from Backend */}
              {selectedDoctorId ? (
                <div className="pt-2 border-t">
                  <label className="text-xs font-semibold text-muted-foreground block mb-2">
                    Available Time Slots:
                  </label>

                  {slotsQuery.isLoading ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : slotsQuery.data?.closedReason ? (
                    <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-xs text-amber-800">
                      <strong>Clinic Unavailable for Booking: </strong>
                      <span>{slotsQuery.data.closedReason}</span>
                    </div>
                  ) : slotsQuery.data?.slots?.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No slots configured or doctor has no schedule on this day.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-52 overflow-y-auto p-1">
                      {slotsQuery.data?.slots?.map((slot, idx) => {
                        const timeStr = new Date(slot.start).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const isSelected = selectedSlotStart === slot.start;

                        return (
                          <Button
                            key={idx}
                            type="button"
                            size="sm"
                            variant={isSelected ? 'default' : slot.available ? 'outline' : 'secondary'}
                            disabled={!slot.available}
                            className={`h-9 text-xs font-mono ${
                              isSelected
                                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                                : slot.available
                                ? 'border-emerald-300 hover:bg-emerald-50 text-emerald-800 dark:border-emerald-800'
                                : 'opacity-40 line-through cursor-not-allowed'
                            }`}
                            onClick={() => setSelectedSlotStart(slot.start)}
                          >
                            {timeStr}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic pt-2 border-t">
                  Select a physician above to display available appointment slots.
                </p>
              )}
            </CardContent>
          </Card>

          {/* STEP 4: Reason & Submit */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Step 4: Visit Details & Confirmation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Chief Complaint / Reason for Consultation (Optional):
                </label>
                <Input
                  placeholder="e.g. Fever, persistent cough, routine follow-up"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {selectedSlotStart && selectedDoctor && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                  <span>Selected Slot:</span>
                  <span className="font-mono font-bold">
                    {new Date(selectedSlotStart).toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/receptionist/appointments')}
                disabled={bookAppointmentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !selectedPatientId ||
                  !selectedDoctorId ||
                  !selectedSlotStart ||
                  bookAppointmentMutation.isPending
                }
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                {bookAppointmentMutation.isPending ? 'Booking Slot...' : 'Confirm Appointment'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
