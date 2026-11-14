import * as React from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Stethoscope,
  HeartPulse,
  Activity,
  FileText,
  Pill,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Plus,
  Trash2,
  Download,
  Search,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Save,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/app/providers/auth.context';
import { useAppointments, useUpdateAppointmentStatus } from '@/hooks/use-appointments';
import {
  useAppointmentConsultation,
  useCreateConsultation,
  useUpdateConsultation,
} from '@/hooks/use-consultations';
import {
  useCheckPrescription,
  useCreatePrescription,
  usePatientPrescriptions,
} from '@/hooks/use-prescriptions';
import { useMedicines } from '@/hooks/use-medicines';
import { prescriptionsService } from '@/services/prescriptions.service';
import { useToast } from '@/hooks/use-toast';
import { getClinicTodayDateString, getClinicDayBounds, formatDateTime } from '@/lib/utils';

export function DoctorConsultationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const doctorId = user?.doctorId;

  const [searchParams, setSearchParams] = useSearchParams();
  const targetAppointmentId = searchParams.get('appointmentId');

  // Today's clinic bounds
  const todayStr = React.useMemo(() => getClinicTodayDateString(), []);
  const todayBounds = React.useMemo(() => getClinicDayBounds(todayStr), [todayStr]);

  // Appointments query for doctor today
  const appointmentsQuery = useAppointments(
    {
      doctorId,
      from: todayBounds.start,
      to: todayBounds.end,
      size: 50,
      sort: 'slotStart,asc',
    },
    { enabled: Boolean(doctorId) }
  );

  const appointments = appointmentsQuery.data?.content || [];

  // Active / eligible appointments for consultation
  const activeAppointments = appointments.filter(
    (a) => a.status === 'IN_CONSULTATION' || a.status === 'CHECKED_IN' || a.id === targetAppointmentId
  );

  // Determine current active appointment
  const currentAppointmentId =
    targetAppointmentId ||
    activeAppointments.find((a) => a.status === 'IN_CONSULTATION')?.id ||
    activeAppointments[0]?.id ||
    null;

  const currentAppointment = appointments.find((a) => a.id === currentAppointmentId);

  const handleSelectAppointment = (id) => {
    setSearchParams({ appointmentId: id });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Clinical Consultation Workspace
            </h1>
            <Badge variant="outline" className="text-xs">
              Encounter Documentation
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Conduct active patient encounters, record ICD-10 diagnostics, evaluate drug interactions, and issue digital prescriptions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appointmentsQuery.refetch()}
            disabled={appointmentsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${appointmentsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/doctor/queue')}
          >
            <Clock className="h-4 w-4 mr-2" />
            Queue View
          </Button>
        </div>
      </div>

      {/* Appointment Selection Bar */}
      <Card className="shadow-sm border-primary/20 bg-muted/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Encounter:
              </span>
            </div>

            {appointmentsQuery.isLoading ? (
              <Skeleton className="h-9 w-64" />
            ) : appointments.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                No appointments found for today.
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {appointments.map((app) => {
                  const isSelected = app.id === currentAppointmentId;
                  const startStr = new Date(app.slotStart).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => handleSelectAppointment(app.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      <span>{startStr}</span>
                      <span className="font-semibold">{app.patientName}</span>
                      {app.tokenNumber && (
                        <span className="font-mono text-[10px] opacity-80">#{app.tokenNumber}</span>
                      )}
                      <Badge
                        variant={
                          app.status === 'IN_CONSULTATION'
                            ? 'success'
                            : app.status === 'CHECKED_IN'
                            ? 'warning'
                            : app.status === 'COMPLETED'
                            ? 'secondary'
                            : 'outline'
                        }
                        className={`text-[9px] px-1 py-0 ${
                          isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : ''
                        }`}
                      >
                        {app.status.replace('_', ' ')}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Encounter Workspace */}
      {currentAppointment ? (
        <ActiveEncounterWorkspace
          key={currentAppointment.id}
          appointment={currentAppointment}
          doctorId={doctorId}
          onCompleted={() => {
            appointmentsQuery.refetch();
          }}
        />
      ) : (
        <Card className="shadow-sm py-12 text-center">
          <CardContent className="space-y-3">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Stethoscope className="h-6 w-6" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No Appointment Selected
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Please choose a patient encounter from the selector above or advance the queue to start a consultation.
            </p>
            <Button
              size="sm"
              onClick={() => navigate('/doctor/queue')}
              className="mt-2"
            >
              Go to Patient Queue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActiveEncounterWorkspace({ appointment, _doctorId, onCompleted }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const appointmentId = appointment.id;
  const patientId = appointment.patientId;

  // Status transition mutation
  const updateStatusMutation = useUpdateAppointmentStatus();

  // Consultation query & mutations
  const consultationQuery = useAppointmentConsultation(appointmentId);
  const createConsultationMutation = useCreateConsultation();
  const updateConsultationMutation = useUpdateConsultation();

  // Prescriptions query
  const patientRxQuery = usePatientPrescriptions(patientId, { size: 5 });
  const checkRxMutation = useCheckPrescription();
  const createRxMutation = useCreatePrescription();

  // Local state for clinical form
  const [bloodPressure, setBloodPressure] = React.useState('');
  const [pulse, setPulse] = React.useState('');
  const [temperature, setTemperature] = React.useState('');
  const [weightKg, setWeightKg] = React.useState('');
  const [spo2, setSpo2] = React.useState('');

  const [symptoms, setSymptoms] = React.useState('');
  const [diagnosis, setDiagnosis] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [followUpDate, setFollowUpDate] = React.useState('');
  const [formError, setFormError] = React.useState(null);
  const todayStr = React.useMemo(() => getClinicTodayDateString(), []);

  // Sync state when consultation data loads
  React.useEffect(() => {
    if (consultationQuery.data) {
      const c = consultationQuery.data;
      if (c.vitals) {
        setBloodPressure(c.vitals.bloodPressure || '');
        setPulse(c.vitals.pulse ? String(c.vitals.pulse) : '');
        setTemperature(c.vitals.temperature ? String(c.vitals.temperature) : '');
        setWeightKg(c.vitals.weightKg ? String(c.vitals.weightKg) : '');
        setSpo2(c.vitals.spo2 ? String(c.vitals.spo2) : '');
      }
      setSymptoms(c.symptoms || '');
      setDiagnosis(c.diagnosis || '');
      setNotes(c.notes || '');
      setFollowUpDate(c.followUpDate || '');
    }
  }, [consultationQuery.data]);

  // Prescription Writer state
  const [prescriptionItems, setPrescriptionItems] = React.useState([]);
  const [medicineSearch, setMedicineSearch] = React.useState('');
  const [safetyWarnings, setSafetyWarnings] = React.useState([]);
  const [acknowledgeSevere, setAcknowledgeSevere] = React.useState(false);
  const [issuedPrescription, setIssuedPrescription] = React.useState(null);
  const [isCheckingSafety, setIsCheckingSafety] = React.useState(false);

  // Medicines query
  const medicinesQuery = useMedicines(
    { name: medicineSearch.trim().length >= 2 ? medicineSearch.trim() : undefined, size: 10 },
    { enabled: medicineSearch.trim().length >= 2 }
  );

  const isInConsultation = appointment.status === 'IN_CONSULTATION';
  const isCheckedIn = appointment.status === 'CHECKED_IN';
  const isCompleted = appointment.status === 'COMPLETED';

  // Handle transition from CHECKED_IN to IN_CONSULTATION
  const handleStartConsultation = async () => {
    try {
      await updateStatusMutation.mutateAsync({
        appointmentId,
        status: 'IN_CONSULTATION',
      });
      toast({
        title: 'Consultation Commenced',
        description: `Patient ${appointment.patientName} is now in consultation.`,
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Error Starting Consultation',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      });
    }
  };

  // Save consultation record (create or update)
  const handleSaveConsultation = async (e) => {
    if (e) e.preventDefault();
    setFormError(null);

    // Validate blood pressure pattern if filled
    if (bloodPressure.trim() && !/^[0-9]{2,3}\/[0-9]{2,3}$/.test(bloodPressure.trim())) {
      setFormError('Blood pressure must be in systolic/diastolic format (e.g. 120/80).');
      return null;
    }

    const vitals =
      bloodPressure.trim() || pulse || temperature || weightKg || spo2
        ? {
            bloodPressure: bloodPressure.trim() || undefined,
            pulse: pulse ? parseInt(pulse, 10) : undefined,
            temperature: temperature ? parseFloat(temperature) : undefined,
            weightKg: weightKg ? parseFloat(weightKg) : undefined,
            spo2: spo2 ? parseInt(spo2, 10) : undefined,
          }
        : undefined;

    const payload = {
      vitals,
      symptoms: symptoms.trim() || undefined,
      diagnosis: diagnosis.trim() || undefined,
      notes: notes.trim() || undefined,
      followUpDate: followUpDate || undefined,
    };

    try {
      let savedResult;
      if (consultationQuery.data?.id) {
        savedResult = await updateConsultationMutation.mutateAsync({
          consultationId: consultationQuery.data.id,
          data: payload,
        });
        toast({
          title: 'Consultation Updated',
          description: 'Clinical documentation saved successfully.',
          variant: 'default',
        });
      } else {
        savedResult = await createConsultationMutation.mutateAsync({
          appointmentId,
          data: payload,
        });
        toast({
          title: 'Consultation Saved',
          description: 'Clinical encounter notes recorded.',
          variant: 'default',
        });
      }
      return savedResult;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Error saving consultation.';
      setFormError(msg);
      toast({
        title: 'Save Failed',
        description: msg,
        variant: 'destructive',
      });
      return null;
    }
  };

  // Add medicine to prescription
  const handleAddMedicine = (med) => {
    // Check if already in items
    if (prescriptionItems.some((it) => it.medicineId === med.id)) {
      toast({
        title: 'Already Added',
        description: `${med.name} is already in the prescription list.`,
        variant: 'warning',
      });
      return;
    }

    const newItem = {
      medicineId: med.id,
      medicineName: med.name,
      genericName: med.genericName,
      strength: med.strength,
      dosage: '1 Tablet',
      frequency: 'Twice daily',
      durationDays: 5,
      instructions: 'After meals',
    };

    const nextItems = [...prescriptionItems, newItem];
    setPrescriptionItems(nextItems);
    setMedicineSearch('');

    // Trigger safety check
    triggerSafetyCheck(nextItems);
  };

  const handleRemoveMedicine = (index) => {
    const nextItems = prescriptionItems.filter((_, i) => i !== index);
    setPrescriptionItems(nextItems);
    if (nextItems.length > 0) {
      triggerSafetyCheck(nextItems);
    } else {
      setSafetyWarnings([]);
    }
  };

  const handleUpdateItemField = (index, field, value) => {
    setPrescriptionItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  // Run drug safety check
  const triggerSafetyCheck = async (items) => {
    if (!patientId || items.length === 0) return;
    setIsCheckingSafety(true);
    try {
      const res = await checkRxMutation.mutateAsync({
        patientId,
        medicineIds: items.map((it) => it.medicineId),
      });
      setSafetyWarnings(res.warnings || []);
    } catch (err) {
      console.warn('Safety check evaluation failed:', err);
    } finally {
      setIsCheckingSafety(false);
    }
  };

  const hasSevereWarnings = safetyWarnings.some((w) => w.severity === 'HIGH' || w.severity === 'SEVERE');

  // Issue digital prescription
  const handleIssuePrescription = async () => {
    const consultationId = consultationQuery.data?.id;
    if (!consultationId) {
      toast({
        title: 'Consultation Required',
        description: 'Please save the consultation record before issuing a prescription.',
        variant: 'warning',
      });
      return;
    }

    if (prescriptionItems.length === 0) {
      toast({
        title: 'No Medicines',
        description: 'Please add at least one medication to the prescription.',
        variant: 'warning',
      });
      return;
    }

    if (hasSevereWarnings && !acknowledgeSevere) {
      toast({
        title: 'Acknowledgment Required',
        description: 'Please review and acknowledge severe drug warnings before issuing.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      consultationId,
      items: prescriptionItems.map((it) => ({
        medicineId: it.medicineId,
        dosage: it.dosage,
        frequency: it.frequency,
        durationDays: parseInt(it.durationDays, 10) || 1,
        instructions: it.instructions || undefined,
      })),
      acknowledgeSevereWarnings: hasSevereWarnings ? acknowledgeSevere : undefined,
    };

    try {
      const rx = await createRxMutation.mutateAsync(payload);
      setIssuedPrescription(rx);
      toast({
        title: 'Prescription Issued',
        description: `Prescription #${rx.id.slice(0, 8)} successfully finalized.`,
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Prescription Creation Failed',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      });
    }
  };

  // Download PDF
  const handleDownloadPdf = async (rxId) => {
    try {
      const blob = await prescriptionsService.getPrescriptionPdf(rxId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prescription-${rxId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Download Failed',
        description: 'Unable to stream prescription PDF from server.',
        variant: 'destructive',
      });
    }
  };

  // Finalize consultation and complete appointment
  const handleCompleteEncounter = async () => {
    if (!diagnosis.trim()) {
      setFormError('Clinical diagnosis is mandatory before completing an appointment.');
      toast({
        title: 'Diagnosis Required',
        description: 'Backend requires a recorded diagnosis before completing consultation.',
        variant: 'destructive',
      });
      return;
    }

    // Auto-save consultation first to ensure latest changes are persisted
    const saved = await handleSaveConsultation();
    if (!saved && !consultationQuery.data?.id) return;

    try {
      await updateStatusMutation.mutateAsync({
        appointmentId,
        status: 'COMPLETED',
      });
      toast({
        title: 'Encounter Finalized',
        description: `Appointment for ${appointment.patientName} marked COMPLETED. Consultation finalized and invoiced.`,
        variant: 'default',
      });
      if (onCompleted) onCompleted();
      navigate('/doctor/history?appointmentId=' + appointmentId);
    } catch (err) {
      toast({
        title: 'Finalization Failed',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Patient Banner */}
      <Card className="shadow-sm border-l-4 border-l-primary">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {appointment.patientName}
                </span>
                {appointment.tokenNumber && (
                  <Badge variant="outline" className="font-mono text-xs">
                    Token #{appointment.tokenNumber}
                  </Badge>
                )}
                <Badge
                  variant={
                    isInConsultation
                      ? 'success'
                      : isCheckedIn
                      ? 'warning'
                      : isCompleted
                      ? 'secondary'
                      : 'outline'
                  }
                  className="text-xs capitalize"
                >
                  {appointment.status.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Scheduled Slot: {formatDateTime(appointment.slotStart)} · Clinic: {appointment.timeZone || 'Asia/Kolkata'}
                {appointment.reason ? ` · Chief Complaint: "${appointment.reason}"` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isCheckedIn && (
                <Button size="sm" onClick={handleStartConsultation} className="bg-primary hover:bg-primary/90">
                  <Stethoscope className="h-4 w-4 mr-2" />
                  Commence Consultation
                </Button>
              )}
              {isInConsultation && (
                <Button
                  size="sm"
                  onClick={handleCompleteEncounter}
                  disabled={updateStatusMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {updateStatusMutation.isPending ? 'Finalizing...' : 'Finalize & Complete'}
                </Button>
              )}
              {isCompleted && (
                <Badge variant="secondary" className="px-3 py-1.5 text-xs font-semibold">
                  ✓ Encounter Completed
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Form: Vitals & Clinical Examination */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Clinical Documentation */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    Clinical Examination & Vitals
                  </CardTitle>
                </div>
                {consultationQuery.data?.finalized && (
                  <Badge variant="secondary" className="text-xs">
                    Finalized (Read-only)
                  </Badge>
                )}
              </div>
              <CardDescription>
                Document baseline physiological parameters, presenting symptoms, and diagnostic formulation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveConsultation} className="space-y-5">
                {formError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {formError}
                  </div>
                )}

                {/* Vitals Grid */}
                <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Patient Vitals
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        BP (mmHg)
                      </label>
                      <Input
                        placeholder="120/80"
                        className="h-8 text-xs font-mono"
                        value={bloodPressure}
                        onChange={(e) => setBloodPressure(e.target.value)}
                        disabled={consultationQuery.data?.finalized}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Pulse (bpm)
                      </label>
                      <Input
                        type="number"
                        placeholder="72"
                        className="h-8 text-xs font-mono"
                        value={pulse}
                        onChange={(e) => setPulse(e.target.value)}
                        min={20}
                        max={300}
                        disabled={consultationQuery.data?.finalized}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Temp (°C)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="37.0"
                        className="h-8 text-xs font-mono"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                        min={30.0}
                        max={45.0}
                        disabled={consultationQuery.data?.finalized}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Weight (kg)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="70.0"
                        className="h-8 text-xs font-mono"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        min={0.5}
                        max={500.0}
                        disabled={consultationQuery.data?.finalized}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        SpO2 (%)
                      </label>
                      <Input
                        type="number"
                        placeholder="98"
                        className="h-8 text-xs font-mono"
                        value={spo2}
                        onChange={(e) => setSpo2(e.target.value)}
                        min={0}
                        max={100}
                        disabled={consultationQuery.data?.finalized}
                      />
                    </div>
                  </div>
                </div>

                {/* Symptoms & Diagnosis */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Presenting Symptoms & Clinical History
                    </label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Describe onset, duration, character of symptoms..."
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                      maxLength={2000}
                      disabled={consultationQuery.data?.finalized}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-foreground">
                        Primary Diagnosis * (Required to complete appointment)
                      </label>
                      <span className="text-[10px] text-muted-foreground">Mandatory for finalization</span>
                    </div>
                    <textarea
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Enter verified medical diagnosis..."
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      maxLength={2000}
                      required
                      disabled={consultationQuery.data?.finalized}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Clinical Notes & Treatment Plan
                    </label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Special instructions, dietary restrictions, investigations ordered..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={5000}
                      disabled={consultationQuery.data?.finalized}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Recommended Follow-up Date
                    </label>
                    <Input
                      type="date"
                      className="w-auto h-9 text-xs"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      min={todayStr}
                      disabled={consultationQuery.data?.finalized}
                    />
                  </div>
                </div>

                {!consultationQuery.data?.finalized && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t">
                    <Button
                      type="submit"
                      disabled={
                        createConsultationMutation.isPending || updateConsultationMutation.isPending
                      }
                      className="text-xs"
                    >
                      <Save className="h-4 w-4 mr-1.5" />
                      {createConsultationMutation.isPending || updateConsultationMutation.isPending
                        ? 'Saving...'
                        : 'Save Consultation'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Electronic Prescription Section */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base font-semibold">
                    Electronic Prescription (e-Rx)
                  </CardTitle>
                </div>
                {issuedPrescription && (
                  <Badge variant="success" className="text-xs">
                    Issued #{issuedPrescription.id.slice(0, 8)}
                  </Badge>
                )}
              </div>
              <CardDescription>
                Search hospital formulary, prescribe medications, evaluate contraindications, and export signed PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!consultationQuery.data?.id ? (
                <div className="p-4 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                  Save the consultation above to enable digital prescription generation.
                </div>
              ) : issuedPrescription ? (
                /* Issued Prescription Banner */
                <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                        <Check className="h-4 w-4 text-emerald-600" />
                        Prescription #{issuedPrescription.id.slice(0, 8)} Finalized
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Issued on {formatDateTime(issuedPrescription.createdAt)} ({issuedPrescription.items?.length || 0} items)
                      </p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleDownloadPdf(issuedPrescription.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download Prescription PDF
                    </Button>
                  </div>

                  {/* Items List */}
                  <div className="divide-y divide-emerald-200 dark:divide-emerald-900/40 text-xs">
                    {issuedPrescription.items?.map((it, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-foreground">
                            {it.medicine?.name}
                          </span>{' '}
                          <span className="text-muted-foreground font-mono">
                            ({it.medicine?.genericName} · {it.medicine?.strength})
                          </span>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {it.dosage} · {it.frequency} · {it.durationDays} days · {it.instructions}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Interactive Prescription Builder */
                <div className="space-y-4">
                  {/* Medicine Search Autocomplete */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      Search Formulary Medicine (min 2 chars)
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by brand name or generic (e.g. Paracetamol, Amoxicillin)..."
                        className="pl-9 h-9 text-xs"
                        value={medicineSearch}
                        onChange={(e) => setMedicineSearch(e.target.value)}
                      />
                    </div>

                    {/* Medicine Dropdown Results */}
                    {medicineSearch.trim().length >= 2 && (
                      <div className="p-2 rounded-lg border bg-card shadow-lg max-h-48 overflow-y-auto space-y-1">
                        {medicinesQuery.isLoading ? (
                          <div className="p-2 text-xs text-muted-foreground">Searching formulary...</div>
                        ) : !medicinesQuery.data?.content || medicinesQuery.data.content.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground">No matching medications found.</div>
                        ) : (
                          medicinesQuery.data.content.map((med) => (
                            <div
                              key={med.id}
                              className="p-2 rounded hover:bg-muted/50 flex items-center justify-between text-xs cursor-pointer"
                              onClick={() => handleAddMedicine(med)}
                            >
                              <div>
                                <span className="font-semibold text-foreground">{med.name}</span>{' '}
                                <span className="text-muted-foreground font-mono">
                                  ({med.genericName} · {med.strength})
                                </span>
                                <Badge variant="outline" className="ml-2 text-[9px] uppercase">
                                  {med.form}
                                </Badge>
                              </div>
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-primary">
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prescription Items Table */}
                  {prescriptionItems.length > 0 && (
                    <div className="space-y-3">
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/50 uppercase text-muted-foreground border-b">
                            <tr>
                              <th className="px-3 py-2">Medication</th>
                              <th className="px-3 py-2">Dosage</th>
                              <th className="px-3 py-2">Frequency</th>
                              <th className="px-3 py-2">Duration</th>
                              <th className="px-3 py-2">Instructions</th>
                              <th className="px-3 py-2 text-right">Remove</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {prescriptionItems.map((item, idx) => (
                              <tr key={item.medicineId} className="hover:bg-muted/20">
                                <td className="px-3 py-2 font-semibold text-foreground">
                                  {item.medicineName}
                                  <span className="block font-normal text-[10px] text-muted-foreground">
                                    {item.genericName}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={item.dosage}
                                    onChange={(e) => handleUpdateItemField(idx, 'dosage', e.target.value)}
                                    className="h-7 text-xs w-24"
                                    placeholder="500mg"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={item.frequency}
                                    onChange={(e) => handleUpdateItemField(idx, 'frequency', e.target.value)}
                                    className="h-7 text-xs w-28"
                                    placeholder="Twice daily"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    value={item.durationDays}
                                    onChange={(e) => handleUpdateItemField(idx, 'durationDays', e.target.value)}
                                    className="h-7 text-xs w-16"
                                    min={1}
                                    max={365}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={item.instructions}
                                    onChange={(e) => handleUpdateItemField(idx, 'instructions', e.target.value)}
                                    className="h-7 text-xs w-36"
                                    placeholder="After meals"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveMedicine(idx)}
                                    className="h-6 w-6 text-rose-500 hover:text-rose-700"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Safety Warnings Banner */}
                      {isCheckingSafety ? (
                        <div className="p-2 text-xs text-muted-foreground">
                          Evaluating drug interactions & allergy safety...
                        </div>
                      ) : safetyWarnings.length > 0 ? (
                        <div className="p-3.5 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            Drug Safety Warnings Detected ({safetyWarnings.length})
                          </div>
                          <div className="space-y-1 text-xs">
                            {safetyWarnings.map((w, idx) => (
                              <div key={idx} className="flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
                                <Badge
                                  variant={w.severity === 'HIGH' || w.severity === 'SEVERE' ? 'destructive' : 'warning'}
                                  className="text-[9px] px-1 py-0 uppercase"
                                >
                                  {w.severity}
                                </Badge>
                                <span>{w.message}</span>
                              </div>
                            ))}
                          </div>

                          {hasSevereWarnings && (
                            <div className="pt-2 border-t border-amber-200 flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="severeAck"
                                checked={acknowledgeSevere}
                                onChange={(e) => setAcknowledgeSevere(e.target.checked)}
                                className="rounded border-amber-400 text-primary focus:ring-primary h-4 w-4"
                              />
                              <label htmlFor="severeAck" className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                                I acknowledge severe drug contraindication warnings and accept clinical responsibility.
                              </label>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded bg-emerald-50/50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          No contraindications or allergy conflicts flagged for this regimen.
                        </div>
                      )}

                      {/* Issue Prescription Button */}
                      <div className="flex justify-end pt-2">
                        <Button
                          size="sm"
                          onClick={handleIssuePrescription}
                          disabled={
                            createRxMutation.isPending || (hasSevereWarnings && !acknowledgeSevere)
                          }
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          <Pill className="h-4 w-4 mr-1.5" />
                          {createRxMutation.isPending ? 'Issuing e-Rx...' : 'Finalize & Issue Prescription'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Patient Historical Context */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" />
                Previous Patient Prescriptions
              </CardTitle>
              <CardDescription>Historical medications prescribed to this patient</CardDescription>
            </CardHeader>
            <CardContent>
              {patientRxQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !patientRxQuery.data?.content || patientRxQuery.data.content.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No historical prescriptions found for this patient.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {patientRxQuery.data.content.map((rx) => (
                    <div key={rx.id} className="p-3 rounded-lg border text-xs bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Rx #{rx.id.slice(0, 8)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadPdf(rx.id)}
                          className="h-6 w-6 text-primary"
                          title="Download PDF"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateTime(rx.createdAt)} · By {rx.doctorName}
                      </p>
                      {rx.items && rx.items.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1">
                          {rx.items.map((it, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {it.medicine?.name} ({it.dosage})
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
