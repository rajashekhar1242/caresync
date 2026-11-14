import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Calendar,
  Filter,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  User,
  Activity,
  Heart,
  Thermometer,
  Scale,
  Wind,
  AlertTriangle,
  RefreshCw,
  X,
  Pill,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { appointmentsService } from '@/services/appointments.service';
import { consultationsService } from '@/services/consultations.service';
import { prescriptionsService } from '@/services/prescriptions.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatDate, formatDateTime, formatTime } from '@/lib/utils';

/**
 * Encounter Detail Modal component
 */
function EncounterDetailModal({ appointment, isOpen, onClose }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Fetch consultation details
  const {
    data: consultation,
    isLoading: isConsultationLoading,
    isError: isConsultationError,
  } = useQuery({
    queryKey: ['consultation', 'appointment', appointment?.id],
    queryFn: () => consultationsService.getConsultationByAppointment(appointment.id),
    enabled: Boolean(isOpen && appointment?.id),
    staleTime: 60000,
  });

  // Fetch prescriptions for this patient
  const {
    data: prescriptionsPage,
    isLoading: isPrescriptionsLoading,
  } = useQuery({
    queryKey: ['prescriptions', 'patient', appointment?.patientId],
    queryFn: () => prescriptionsService.getPatientPrescriptions(appointment.patientId, { page: 0, size: 50 }),
    enabled: Boolean(isOpen && appointment?.patientId),
    staleTime: 60000,
  });

  // Match the prescription associated with this appointment/consultation
  const linkedPrescription = useMemo(() => {
    if (!prescriptionsPage?.content) return null;
    return prescriptionsPage.content.find(
      (p) => p.appointmentId === appointment?.id || (consultation?.id && p.consultationId === consultation.id)
    ) || null;
  }, [prescriptionsPage, appointment?.id, consultation?.id]);

  const handleDownloadPdf = async () => {
    if (!linkedPrescription) return;
    try {
      setDownloadingPdf(true);
      setDownloadError(null);
      await prescriptionsService.downloadPdf(
        linkedPrescription.id,
        `prescription-${appointment?.patientName?.replace(/\s+/g, '_') || 'patient'}-${appointment?.id?.substring(0, 8)}.pdf`
      );
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setDownloadError(err.message || 'Unable to download prescription PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!appointment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Encounter Record
                </DialogTitle>
                <DialogDescription>
                  Appointment #{appointment.id.substring(0, 8)} &bull; {formatDateTime(appointment.slotStart)}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> COMPLETED
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Patient Overview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Patient Name</p>
                <p className="text-sm font-semibold text-slate-900">{appointment.patientName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Patient ID</p>
                <p className="font-mono text-xs text-slate-700">{appointment.patientId?.substring(0, 8)}...</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Doctor</p>
                <p className="text-sm text-slate-900">{appointment.doctorName || 'Attending Physician'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Encounter Date</p>
                <p className="text-sm text-slate-900">{formatDate(appointment.slotStart)}</p>
              </div>
            </div>
            {appointment.reason && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-500">Chief Reason for Visit:</p>
                <p className="text-sm text-slate-800 italic mt-0.5">&ldquo;{appointment.reason}&rdquo;</p>
              </div>
            )}
          </div>

          {/* Consultation Details */}
          {isConsultationLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-5 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : isConsultationError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">No recorded consultation notes found for this appointment.</p>
              <p className="text-xs text-amber-700 mt-1">This appointment may have been completed outside the electronic record workflow.</p>
            </div>
          ) : consultation ? (
            <div className="space-y-5">
              {/* Recorded Vitals */}
              {consultation.vitals && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-teal-600" /> Recorded Vital Signs
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <span className="text-[10px] font-medium uppercase text-slate-400">BP (mmHg)</span>
                      <p className="text-base font-bold text-slate-800 mt-0.5">{consultation.vitals.bloodPressure || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <span className="text-[10px] font-medium uppercase text-slate-400">Pulse (bpm)</span>
                      <p className="text-base font-bold text-slate-800 mt-0.5">{consultation.vitals.pulse || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <span className="text-[10px] font-medium uppercase text-slate-400">Temp (°C)</span>
                      <p className="text-base font-bold text-slate-800 mt-0.5">{consultation.vitals.temperature || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <span className="text-[10px] font-medium uppercase text-slate-400">Weight (kg)</span>
                      <p className="text-base font-bold text-slate-800 mt-0.5">{consultation.vitals.weightKg || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <span className="text-[10px] font-medium uppercase text-slate-400">SpO2 (%)</span>
                      <p className="text-base font-bold text-slate-800 mt-0.5">{consultation.vitals.spo2 || '—'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Diagnosis & Symptoms */}
              <div className="space-y-3">
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4">
                  <span className="text-xs font-semibold text-teal-900 uppercase tracking-wider block mb-1">
                    Primary Clinical Diagnosis
                  </span>
                  <p className="text-base font-medium text-slate-900">{consultation.diagnosis}</p>
                </div>

                {consultation.symptoms && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                      Presented Symptoms
                    </span>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{consultation.symptoms}</p>
                  </div>
                )}

                {consultation.notes && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1">
                      Clinical Notes & Management Plan
                    </span>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{consultation.notes}</p>
                  </div>
                )}

                {consultation.followUpDate && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <Calendar className="h-4 w-4 text-teal-600" />
                    <span>Recommended Follow-up Date:</span>
                    <strong className="text-slate-900">{formatDate(consultation.followUpDate)}</strong>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Linked Prescription Section */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-teal-600" /> Linked Prescription
              </h4>
              {linkedPrescription && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="gap-1.5 text-teal-700 border-teal-200 hover:bg-teal-50"
                >
                  <Download className={`h-4 w-4 ${downloadingPdf ? 'animate-bounce' : ''}`} />
                  {downloadingPdf ? 'Generating...' : 'Download Signed PDF'}
                </Button>
              )}
            </div>

            {downloadError && (
              <p className="text-xs text-rose-600 mb-2">{downloadError}</p>
            )}

            {isPrescriptionsLoading ? (
              <Skeleton className="h-20 w-full rounded-lg" />
            ) : linkedPrescription ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Medication</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Dosage</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Frequency</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Duration</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {linkedPrescription.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{item.medicineName}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.dosage}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.frequency}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.duration}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.instructions || 'As prescribed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {linkedPrescription.warnings && linkedPrescription.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                    <div className="flex items-center gap-1.5 font-medium text-amber-800 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Interaction Warnings Recorded ({linkedPrescription.warnings.length})
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                      {linkedPrescription.warnings.map((w, idx) => (
                        <li key={idx}>
                          <span className="font-semibold uppercase tracking-wider text-[10px] bg-amber-200/80 px-1 py-0.5 rounded mr-1">
                            {w.severity}
                          </span>
                          {w.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                No electronic prescription was issued for this encounter.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Doctor Consultation History Page
 */
export function DoctorHistoryPage() {
  const { user } = useAuth();
  const doctorId = user?.doctorId || user?.id;

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch completed appointments for this doctor
  const {
    data: appointmentsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['doctor-history', doctorId],
    queryFn: () =>
      appointmentsService.getAppointments({
        doctorId,
        status: 'COMPLETED',
        sort: 'slotStart,desc',
        size: 100,
      }),
    enabled: Boolean(doctorId),
    staleTime: 30000,
  });

  const appointments = useMemo(() => {
    return appointmentsData?.content || [];
  }, [appointmentsData]);

  // Client-side filtering for search & dates
  const filteredAppointments = useMemo(() => {
    return appointments.filter((app) => {
      // Search matching (patient name, id, reason)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const patientName = app.patientName?.toLowerCase() || '';
        const appId = app.id?.toLowerCase() || '';
        const reason = app.reason?.toLowerCase() || '';
        if (!patientName.includes(query) && !appId.includes(query) && !reason.includes(query)) {
          return false;
        }
      }

      // Date filtering
      if (startDate) {
        const appDate = new Date(app.slotStart);
        const filterStart = new Date(startDate);
        filterStart.setHours(0, 0, 0, 0);
        if (appDate < filterStart) return false;
      }

      if (endDate) {
        const appDate = new Date(app.slotStart);
        const filterEnd = new Date(endDate);
        filterEnd.setHours(23, 59, 59, 999);
        if (appDate > filterEnd) return false;
      }

      return true;
    });
  }, [appointments, searchQuery, startDate, endDate]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const total = appointments.length;
    const uniquePatients = new Set(appointments.map((a) => a.patientId)).size;
    
    // Encounters this month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const thisMonth = appointments.filter((a) => {
      const d = new Date(a.slotStart);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    return { total, uniquePatients, thisMonth };
  }, [appointments]);

  const handleOpenDetail = (app) => {
    setSelectedAppointment(app);
    setIsDetailOpen(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Consultation History
          </h1>
          <p className="text-sm text-slate-500">
            Review completed clinical encounters, diagnosis records, and signed electronic prescriptions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Encounters
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-500 mt-1">All completed consultations</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Unique Patients
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.uniquePatients}</p>
                <p className="text-xs text-slate-500 mt-1">Distinct clinical profiles</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <User className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  This Month
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.thisMonth}</p>
                <p className="text-xs text-slate-500 mt-1">Encounters in active month</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <Calendar className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by patient name, reason, or appointment ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>From:</span>
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>To:</span>
              </div>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 text-xs"
              />
            </div>

            {(searchQuery || startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Encounter Records</CardTitle>
              <CardDescription>
                Showing {filteredAppointments.length} of {appointments.length} recorded consultations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
              <p className="font-semibold">Failed to load consultation history</p>
              <p className="text-xs mt-1 text-rose-600">
                {error?.message || 'Unable to retrieve completed encounters. Please verify backend connectivity.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="mt-3 border-rose-300 text-rose-800"
              >
                Retry
              </Button>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">No consultation records found</h3>
              <p className="mt-1 text-xs text-slate-500">
                {appointments.length === 0
                  ? 'Completed patient encounters will appear here once consultations are finalized.'
                  : 'No encounters matched your search filters. Try clearing or expanding your search criteria.'}
              </p>
              {(searchQuery || startDate || endDate) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="mt-4"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Encounter Date & Time</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Reason / Complaint</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAppointments.map((app) => (
                    <tr
                      key={app.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">
                          {formatDate(app.slotStart)}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTime(app.slotStart)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">
                          {app.patientName || 'Unknown Patient'}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          ID: {app.patientId?.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-slate-700 max-w-xs truncate">
                          {app.reason || <span className="text-slate-400 italic">Routine Follow-up</span>}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> COMPLETED
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDetail(app)}
                          className="gap-1.5 text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View Encounter</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <EncounterDetailModal
        appointment={selectedAppointment}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedAppointment(null);
        }}
      />
    </div>
  );
}
