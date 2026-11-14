import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  HeartPulse,
  Thermometer,
  Calendar,
  User,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/app/providers/auth.context';
import { usePatient } from '@/hooks/use-patients';
import { useAppointments } from '@/hooks/use-appointments';
import { useAppointmentConsultation } from '@/hooks/use-consultations';
import { formatDate, formatTime, CLINIC_TIMEZONE } from '@/lib/utils';

/**
 * Encounter Consultation Card: Expands to load clinical documentation for an appointment.
 */
function ClinicalEncounterCard({ appointment }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { data: consultation, isLoading, isError } = useAppointmentConsultation(
    appointment.id,
    { enabled: isExpanded }
  );

  return (
    <Card className="shadow-sm border-border/80">
      <CardHeader className="p-4 sm:p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-foreground">
                Dr. {appointment.doctorName || 'Attending Physician'}
              </span>
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                Completed Encounter
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 font-mono">
              <span>{formatDate(appointment.slotStart)}</span>
              <span>•</span>
              <span>{formatTime(appointment.slotStart)} ({CLINIC_TIMEZONE})</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="text-xs self-start sm:self-auto gap-1.5 h-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span>{isExpanded ? 'Hide Record' : 'View Clinical Details'}</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {appointment.reason && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Chief complaint: "{appointment.reason}"
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-4 sm:p-5 pt-0 border-t bg-muted/10 space-y-4">
          {isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError || !consultation ? (
            <div className="p-3 text-xs text-muted-foreground italic text-center">
              No detailed consultation notes recorded for this visit.
            </div>
          ) : (
            <div className="space-y-4 pt-3">
              {/* Diagnosis */}
              {consultation.diagnosis && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider block mb-1">
                    Primary Diagnosis
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {consultation.diagnosis}
                  </p>
                </div>
              )}

              {/* Vitals Grid */}
              {consultation.vitals && Object.keys(consultation.vitals).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Recorded Vital Signs
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {consultation.vitals.systolicBp && consultation.vitals.diastolicBp && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">Blood Pressure</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.systolicBp}/{consultation.vitals.diastolicBp} mmHg
                        </span>
                      </div>
                    )}
                    {consultation.vitals.heartRate && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">Heart Rate</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.heartRate} bpm
                        </span>
                      </div>
                    )}
                    {consultation.vitals.temperature && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">Temperature</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.temperature} °F
                        </span>
                      </div>
                    )}
                    {consultation.vitals.oxygenSaturation && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">SpO2</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.oxygenSaturation}%
                        </span>
                      </div>
                    )}
                    {consultation.vitals.weight && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">Weight</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.weight} kg
                        </span>
                      </div>
                    )}
                    {consultation.vitals.height && (
                      <div className="p-2.5 rounded border bg-card">
                        <span className="text-muted-foreground block text-[10px] uppercase">Height</span>
                        <span className="font-mono font-bold text-foreground">
                          {consultation.vitals.height} cm
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Symptoms */}
              {consultation.symptoms && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Reported Symptoms
                  </span>
                  <p className="text-xs bg-card p-2.5 rounded border text-foreground">
                    {consultation.symptoms}
                  </p>
                </div>
              )}

              {/* Doctor's Notes */}
              {consultation.notes && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Doctor's Clinical Notes & Recommendations
                  </span>
                  <p className="text-xs bg-card p-2.5 rounded border text-foreground whitespace-pre-wrap">
                    {consultation.notes}
                  </p>
                </div>
              )}

              {/* Follow-up date */}
              {consultation.followUpDate && (
                <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
                  <span className="font-medium">Recommended Follow-up Visit:</span>
                  <span className="font-bold font-mono">{formatDate(consultation.followUpDate)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function PatientMedicalHistoryPage() {
  const { user } = useAuth();
  const patientId = user?.patientId;

  // Patient profile (for allergies)
  const patientQuery = usePatient(patientId);

  // Completed appointments (for clinical consultation history)
  const appointmentsQuery = useAppointments(
    { patientId, status: 'COMPLETED', size: 50, sort: 'slotStart,desc' },
    { enabled: Boolean(patientId) }
  );

  const allergies = patientQuery.data?.allergies || [];
  const completedAppointments = appointmentsQuery.data?.content || [];

  if (!patientId) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Patient Profile Required</AlertTitle>
          <AlertDescription>
            You must be logged in with a valid patient account to view medical history and clinical records.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span>My Medical History</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review your documented clinical records, allergies, diagnosis history, and vital signs.
        </p>
      </div>

      {/* Allergies Card */}
      <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>Documented Allergies & Drug Alerts</span>
          </CardTitle>
          <CardDescription className="text-xs text-amber-800/80 dark:text-amber-300/80">
            These allergens are evaluated automatically whenever a doctor writes you a prescription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patientQuery.isLoading ? (
            <Skeleton className="h-8 w-1/2" />
          ) : allergies.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allergies.map((allergy, idx) => (
                <Badge
                  key={idx}
                  className="bg-rose-100 text-rose-800 border-rose-300 font-semibold px-2.5 py-1 text-xs"
                >
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  {allergy}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded bg-card/60 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <span>
                No known drug or environmental allergies documented in your chart. If you experience adverse reactions, please inform your doctor or receptionist immediately.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Clinical Encounters Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            <span>Past Clinical Consultations ({completedAppointments.length})</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            Authoritative Hospital Records
          </span>
        </div>

        {appointmentsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : completedAppointments.length === 0 ? (
          <Card className="border-dashed py-12 text-center">
            <CardContent className="space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HeartPulse className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-base text-foreground">
                No past clinical consultations recorded
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Once you complete a consultation with a physician, your diagnoses, clinical notes, and recorded vitals will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {completedAppointments.map((appt) => (
              <ClinicalEncounterCard key={appt.id} appointment={appt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
