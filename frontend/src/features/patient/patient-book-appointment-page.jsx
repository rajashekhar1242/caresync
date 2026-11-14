import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus,
  Stethoscope,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  DollarSign,
  ArrowRight,
  ShieldAlert,
  CalendarCheck,
  User,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/app/providers/auth.context';
import { useDoctors, useDoctorSlots } from '@/hooks/use-doctors';
import { useDepartments } from '@/hooks/use-departments';
import { useBookAppointment } from '@/hooks/use-appointments';
import { useToast } from '@/hooks/use-toast';
import { getClinicTodayDateString, formatCurrency, CLINIC_TIMEZONE } from '@/lib/utils';
import { ROUTES } from '@/constants';

export function PatientBookAppointmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const patientId = user?.patientId;

  // Initial params
  const initialDoctorId = searchParams.get('doctorId') || '';
  const initialDeptId = searchParams.get('deptId') || '';
  const clinicToday = React.useMemo(() => getClinicTodayDateString(), []);
  
  // Calculate max booking date (today + 30 days)
  const clinicMaxDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return getClinicTodayDateString(d);
  }, []);

  // Form states
  const [selectedDeptId, setSelectedDeptId] = React.useState(initialDeptId);
  const [selectedDoctorId, setSelectedDoctorId] = React.useState(initialDoctorId);
  const [appointmentDate, setAppointmentDate] = React.useState(clinicToday);
  const [selectedSlotStart, setSelectedSlotStart] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitError, setSubmitError] = React.useState(null);
  const [confirmedAppt, setConfirmedAppt] = React.useState(null);

  // Queries
  const departmentsQuery = useDepartments();
  const doctorsQuery = useDoctors({ size: 100 });

  // Slots query for selected doctor and date
  const slotsQuery = useDoctorSlots(selectedDoctorId, appointmentDate, {
    enabled: Boolean(selectedDoctorId && appointmentDate),
  });

  // Booking mutation
  const bookAppointmentMutation = useBookAppointment();

  // Doctor list filtering
  const allDoctors = React.useMemo(
    () => doctorsQuery.data?.content || [],
    [doctorsQuery.data]
  );

  const filteredDoctors = React.useMemo(() => {
    let list = allDoctors.filter((doc) => doc.active);
    if (selectedDeptId) {
      list = list.filter((doc) => doc.department?.id === selectedDeptId);
    }
    return list;
  }, [allDoctors, selectedDeptId]);

  const selectedDoctor = React.useMemo(
    () => allDoctors.find((d) => d.id === selectedDoctorId),
    [allDoctors, selectedDoctorId]
  );

  // Set default doctor department when doctor is pre-selected
  React.useEffect(() => {
    if (selectedDoctor && selectedDoctor.department?.id && !selectedDeptId) {
      setSelectedDeptId(selectedDoctor.department.id);
    }
  }, [selectedDoctor, selectedDeptId]);

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!patientId) {
      setSubmitError('Patient profile not linked to your account. Please contact reception.');
      return;
    }
    if (!selectedDoctorId) {
      setSubmitError('Please select a doctor.');
      return;
    }
    if (!appointmentDate) {
      setSubmitError('Please choose an appointment date.');
      return;
    }
    if (!selectedSlotStart) {
      setSubmitError('Please select an available appointment slot.');
      return;
    }

    const payload = {
      patientId,
      doctorId: selectedDoctorId,
      slotStart: selectedSlotStart,
      reason: reason.trim() || undefined,
    };

    try {
      const response = await bookAppointmentMutation.mutateAsync(payload);
      setConfirmedAppt(response);
      toast({
        title: 'Appointment Booked Successfully',
        description: `Your appointment with Dr. ${response.doctorName || selectedDoctor?.fullName} has been scheduled.`,
        variant: 'default',
      });
      slotsQuery.refetch();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      let displayMsg = 'Failed to book appointment. Please select another slot.';

      if (status === 409 || msg?.toLowerCase().includes('already booked')) {
        displayMsg = 'This time slot was just booked by another patient. Please pick a different slot.';
      } else if (msg?.includes('booking window') || msg?.includes('30-day')) {
        displayMsg = 'The requested slot is outside the 30-day booking window or in the past.';
      } else if (msg) {
        displayMsg = msg;
      }

      setSubmitError(displayMsg);
      toast({
        title: 'Booking Conflict',
        description: displayMsg,
        variant: 'destructive',
      });
      slotsQuery.refetch();
    }
  };

  const handleBookAnother = () => {
    setConfirmedAppt(null);
    setSelectedSlotStart('');
    setReason('');
    setSubmitError(null);
  };

  if (!patientId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Book an Appointment</h1>
          <p className="text-sm text-muted-foreground mt-1">Schedule a clinical consultation with our specialists.</p>
        </div>
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Patient Profile Required</AlertTitle>
          <AlertDescription>
            Your user account is not linked to an active patient record. Please visit the reception desk to finalize your patient registration before booking online.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Success view
  if (confirmedAppt) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto py-4">
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Appointment Confirmed!</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Your appointment has been successfully scheduled in our clinical system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-card rounded-lg border p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b">
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">Status</span>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold">
                  {confirmedAppt.status || 'SCHEDULED'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Physician</span>
                  <span className="font-semibold text-foreground text-base">
                    Dr. {confirmedAppt.doctorName || selectedDoctor?.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    {selectedDoctor?.department?.name || selectedDoctor?.specialization?.name || 'General Practice'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Clinic / Hospital</span>
                  <span className="font-medium text-foreground">
                    {selectedDoctor?.clinic?.name || 'Main Medical Campus'}
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    {selectedDoctor?.clinic?.address || 'Building A'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Date & Time</span>
                  <span className="font-semibold text-primary font-mono text-base">
                    {new Date(confirmedAppt.slotStart).toLocaleDateString(undefined, {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground block">
                    {new Date(confirmedAppt.slotStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    ({selectedDoctor?.clinic?.timeZone || CLINIC_TIMEZONE})
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Consultation Fee</span>
                  <span className="font-mono font-bold text-foreground">
                    {selectedDoctor?.consultationFee ? formatCurrency(selectedDoctor.consultationFee) : 'Standard Rate'}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">Payable at reception cashier</span>
                </div>
              </div>

              {confirmedAppt.reason && (
                <div className="pt-3 border-t">
                  <span className="text-xs text-muted-foreground block mb-1">Reason for Visit:</span>
                  <p className="text-xs bg-muted/40 p-2.5 rounded text-foreground italic">
                    "{confirmedAppt.reason}"
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 p-4 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-3">
              <Info className="h-5 w-5 shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="font-semibold mb-1">Important Arrival Instructions:</p>
                <p>
                  Please arrive 15 minutes prior to your scheduled time. When you reach the hospital, check in at the reception counter to receive your live Queue Token.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center pt-2 pb-6">
            <Button
              variant="outline"
              onClick={handleBookAnother}
              className="w-full sm:w-auto"
            >
              Book Another Appointment
            </Button>
            <Button
              onClick={() => navigate(ROUTES.PATIENT_APPOINTMENTS)}
              className="w-full sm:w-auto gap-2"
            >
              <span>View My Appointments</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CalendarPlus className="h-6 w-6 text-primary" />
          <span>Book an Appointment</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a specialist, choose an available time slot, and confirm your clinic consultation.
        </p>
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Booking Conflict</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* Step 1: Doctor & Department Selection */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <span>Step 1: Choose Department & Physician</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Filter by specialty or choose your preferred doctor directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="dept-select" className="text-xs font-semibold text-muted-foreground">
                  Department / Specialty
                </label>
                <select
                  id="dept-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedDeptId}
                  onChange={(e) => {
                    setSelectedDeptId(e.target.value);
                    setSelectedDoctorId('');
                    setSelectedSlotStart('');
                  }}
                >
                  <option value="">All Specialties</option>
                  {departmentsQuery.data?.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="doctor-select" className="text-xs font-semibold text-muted-foreground">
                  Doctor <span className="text-rose-500">*</span>
                </label>
                <select
                  id="doctor-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedDoctorId}
                  onChange={(e) => {
                    setSelectedDoctorId(e.target.value);
                    setSelectedSlotStart('');
                  }}
                  required
                >
                  <option value="">Select a Doctor</option>
                  {filteredDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.fullName} ({doc.specialization?.name || doc.department?.name || 'General'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedDoctor && (
              <div className="p-3.5 rounded-lg bg-muted/40 border text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-muted-foreground block">Clinic Location:</span>
                  <span className="font-semibold text-foreground">
                    {selectedDoctor.clinic?.name || 'Main Medical Center'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Consultation Fee:</span>
                  <span className="font-mono font-bold text-primary">
                    {selectedDoctor.consultationFee ? formatCurrency(selectedDoctor.consultationFee) : '$50.00'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Slot Duration:</span>
                  <span className="font-semibold text-foreground">{selectedDoctor.slotMinutes || 15} minutes</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Date & Available Time Slot */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>Step 2: Choose Date & Time Slot</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Consultations can be booked up to 30 days in advance (Clinic Timezone: {CLINIC_TIMEZONE}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="space-y-1.5 w-full sm:w-auto">
                <label htmlFor="appointment-date" className="text-xs font-semibold text-muted-foreground">
                  Appointment Date <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="appointment-date"
                  type="date"
                  className="w-full sm:w-52 text-sm"
                  min={clinicToday}
                  max={clinicMaxDate}
                  value={appointmentDate}
                  onChange={(e) => {
                    setAppointmentDate(e.target.value);
                    setSelectedSlotStart('');
                  }}
                  required
                />
              </div>

              {selectedDoctor && (
                <div className="text-xs text-muted-foreground sm:mt-5">
                  Showing real-time slots for <span className="font-semibold text-foreground">Dr. {selectedDoctor.fullName}</span>
                </div>
              )}
            </div>

            {/* Slots Grid */}
            <div className="pt-3 border-t">
              <label className="text-xs font-semibold text-muted-foreground block mb-2">
                Available Slots for {appointmentDate}:
              </label>

              {!selectedDoctorId ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  Please select a doctor in Step 1 to load available consultation slots.
                </p>
              ) : slotsQuery.isLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : slotsQuery.data?.closedReason ? (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
                  <strong>Notice: </strong>
                  <span>{slotsQuery.data.closedReason}</span>
                </div>
              ) : !slotsQuery.data?.slots || slotsQuery.data.slots.length === 0 ? (
                <div className="p-4 rounded-lg bg-muted/30 border text-center text-xs text-muted-foreground">
                  No slots are configured for this doctor on the selected date. Please pick a different date.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1">
                  {slotsQuery.data.slots.map((slot, idx) => {
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
                        onClick={() => setSelectedSlotStart(slot.start)}
                        className={`h-9 text-xs font-mono transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground font-bold shadow'
                            : slot.available
                            ? 'border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                            : 'opacity-40 line-through cursor-not-allowed'
                        }`}
                        title={slot.available ? `Book slot at ${timeStr}` : 'Slot already booked'}
                      >
                        {timeStr}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Visit Reason & Patient Notes */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>Step 3: Reason for Consultation</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Briefly describe your symptoms or reason for this visit so the physician can prepare.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <label htmlFor="visit-reason" className="text-xs font-semibold text-muted-foreground">
                Symptoms / Chief Complaint (Optional)
              </label>
              <textarea
                id="visit-reason"
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g. Mild headache and low-grade fever for 3 days, routine follow-up..."
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground block text-right">
                {reason.length}/500 characters
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Review & Submit */}
        <Card className="shadow-sm border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>Review & Confirm</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">Doctor: </span>
                {selectedDoctor ? `Dr. ${selectedDoctor.fullName}` : 'Not selected'}
              </div>
              <div>
                <span className="font-semibold text-foreground">Date: </span>
                {appointmentDate || 'Not selected'}
              </div>
              <div>
                <span className="font-semibold text-foreground">Selected Time: </span>
                {selectedSlotStart ? (
                  <span className="font-mono text-primary font-bold">
                    {new Date(selectedSlotStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : (
                  'Not selected'
                )}
              </div>
              <div>
                <span className="font-semibold text-foreground">Estimated Fee: </span>
                <span className="font-mono text-foreground font-semibold">
                  {selectedDoctor?.consultationFee ? formatCurrency(selectedDoctor.consultationFee) : '$50.00'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t text-[11px] text-muted-foreground">
              <strong>Hospital Policy: </strong>
              Cancellations are accepted up to 2 hours before the scheduled time slot. Consultation fees are payable upon physical check-in at the hospital front desk.
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(ROUTES.PATIENT_DOCTORS)}
            >
              Back to Doctors
            </Button>
            <Button
              type="submit"
              disabled={bookAppointmentMutation.isPending || !selectedDoctorId || !selectedSlotStart}
              className="gap-2"
            >
              {bookAppointmentMutation.isPending ? (
                <span>Confirming Booking...</span>
              ) : (
                <>
                  <span>Confirm Appointment</span>
                  <CheckCircle2 className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
