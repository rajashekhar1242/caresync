import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  Activity,
  Receipt,
  Stethoscope,
  Pill,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  AlertCircle,
  FileText,
  User,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/app/providers/auth.context';
import { usePatient } from '@/hooks/use-patients';
import { useAppointments } from '@/hooks/use-appointments';
import { usePatientPrescriptions } from '@/hooks/use-prescriptions';
import { useInvoices } from '@/hooks/use-billing';
import { formatDate, formatTime } from '@/lib/utils';

export function PatientHome() {
  const { user } = useAuth();
  const patientId = user?.patientId;

  // Real API queries
  const patientQuery = usePatient(patientId, { enabled: Boolean(patientId) });
  const appointmentsQuery = useAppointments(
    { patientId, size: 50, sort: 'slotStart,desc' },
    { enabled: Boolean(patientId) }
  );
  const prescriptionsQuery = usePatientPrescriptions(patientId, { size: 10 }, { enabled: Boolean(patientId) });
  const invoicesQuery = useInvoices({ patientId, size: 10 }, { enabled: Boolean(patientId) });

  const appointments = React.useMemo(() => appointmentsQuery.data?.content || [], [appointmentsQuery.data]);
  const prescriptions = React.useMemo(() => prescriptionsQuery.data?.content || [], [prescriptionsQuery.data]);
  const invoices = React.useMemo(() => invoicesQuery.data?.content || [], [invoicesQuery.data]);

  // Derive upcoming appointment (SCHEDULED, BOOKED, CHECKED_IN, or IN_CONSULTATION)
  const upcomingAppointment = React.useMemo(() => {
    return appointments.find(
      (a) => a.status === 'SCHEDULED' || a.status === 'BOOKED' || a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION'
    );
  }, [appointments]);

  // Derive stats
  const completedCount = React.useMemo(() => {
    return appointments.filter((a) => a.status === 'COMPLETED').length;
  }, [appointments]);

  const pendingInvoices = React.useMemo(() => {
    return invoices.filter((i) => i.status === 'ISSUED' || i.status === 'UNPAID' || i.status === 'PENDING' || i.status === 'PARTIALLY_PAID');
  }, [invoices]);

  const totalOutstanding = React.useMemo(() => {
    return pendingInvoices.reduce((acc, inv) => acc + (parseFloat(inv.balance) || 0), 0);
  }, [pendingInvoices]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Patient Health Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome to your CareSync portal,{' '}
            <strong className="text-foreground">{patientQuery.data?.fullName || user?.fullName || 'Patient'}</strong>. Manage appointments, prescriptions, and healthcare records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Patient Portal</Badge>
          <Badge variant="outline" className="text-xs">
            ID: {patientId ? patientId.slice(0, 8) : 'Unlinked'}
          </Badge>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Next Visit */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Next Scheduled Visit
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {appointmentsQuery.isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : upcomingAppointment ? (
              <div>
                <div className="text-lg font-bold text-foreground truncate">
                  {formatDate(upcomingAppointment.slotStart)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(upcomingAppointment.slotStart)} · {upcomingAppointment.doctorName}
                </p>
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold text-muted-foreground">None</div>
                <p className="text-xs text-muted-foreground mt-0.5">No upcoming visits</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Consultations */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Completed Visits
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {appointmentsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-foreground">{completedCount}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Past medical consultations</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Prescriptions */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Prescriptions Issued
            </CardTitle>
            <Pill className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            {prescriptionsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {prescriptionsQuery.data?.totalElements ?? prescriptions.length}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Digital prescriptions on file</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Invoices */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
            <Receipt className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {invoicesQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold text-foreground">
                  INR {totalOutstanding.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pendingInvoices.length > 0
                    ? `${pendingInvoices.length} unpaid bill${pendingInvoices.length > 1 ? 's' : ''}`
                    : 'All invoices settled'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/patient/book-appointment">
          <Button variant="outline" className="w-full h-12 justify-start gap-3 border-primary/30 hover:border-primary hover:bg-primary/5">
            <CalendarPlus className="h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">Book Appointment</div>
              <div className="text-[11px] text-muted-foreground">Schedule a physician visit</div>
            </div>
          </Button>
        </Link>
        <Link to="/patient/doctors">
          <Button variant="outline" className="w-full h-12 justify-start gap-3 hover:bg-muted">
            <Stethoscope className="h-5 w-5 text-teal-600" />
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">Find Doctors</div>
              <div className="text-[11px] text-muted-foreground">Browse medical specialists</div>
            </div>
          </Button>
        </Link>
        <Link to="/patient/prescriptions">
          <Button variant="outline" className="w-full h-12 justify-start gap-3 hover:bg-muted">
            <Pill className="h-5 w-5 text-indigo-600" />
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">My Prescriptions</div>
              <div className="text-[11px] text-muted-foreground">Download official PDFs</div>
            </div>
          </Button>
        </Link>
        <Link to="/patient/medical-history">
          <Button variant="outline" className="w-full h-12 justify-start gap-3 hover:bg-muted">
            <Activity className="h-5 w-5 text-emerald-600" />
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">Medical History</div>
              <div className="text-[11px] text-muted-foreground">Allergies & past visits</div>
            </div>
          </Button>
        </Link>
      </div>

      {/* Main Spotlight & Recent Feeds */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left 2 Cols: Upcoming Appointment or Spotlight */}
        <Card className="md:col-span-2 shadow-sm border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">Active Appointment Spotlight</CardTitle>
              </div>
              <Link to="/patient/appointments">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  All Appointments <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
            <CardDescription>
              Real-time schedule and arrival check-in status for your upcoming visit
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appointmentsQuery.isLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : upcomingAppointment ? (
              <div className="p-4 rounded-lg border bg-card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {upcomingAppointment.doctorName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Clinic: CareSync Hospital · Timezone: {upcomingAppointment.timeZone || 'Asia/Kolkata'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        upcomingAppointment.status === 'IN_CONSULTATION'
                          ? 'success'
                          : upcomingAppointment.status === 'CHECKED_IN'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {upcomingAppointment.status.replace('_', ' ')}
                    </Badge>
                    {upcomingAppointment.tokenNumber && (
                      <Badge variant="outline" className="font-mono font-bold text-xs">
                        Token #{upcomingAppointment.tokenNumber}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Appointment Date</span>
                    <span className="font-semibold text-foreground">
                      {formatDate(upcomingAppointment.slotStart)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Slot Time</span>
                    <span className="font-semibold text-foreground">
                      {formatTime(upcomingAppointment.slotStart)} – {formatTime(upcomingAppointment.slotEnd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Reason for Visit</span>
                    <span className="text-foreground truncate block">
                      {upcomingAppointment.reason || 'General Health Consultation'}
                    </span>
                  </div>
                </div>

                {upcomingAppointment.status === 'CHECKED_IN' && (
                  <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                    <strong>Arrived at Front Desk:</strong> You are queued for consultation with Token #{upcomingAppointment.tokenNumber}. Please wait in the lounge until your token is called.
                  </div>
                )}
                {upcomingAppointment.status === 'IN_CONSULTATION' && (
                  <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                    <strong>Now In Consultation:</strong> Your clinical encounter is currently in progress with Dr. {upcomingAppointment.doctorName}.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 rounded-lg border border-dashed text-center space-y-3">
                <Calendar className="h-10 w-10 text-muted-foreground/60 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">No Upcoming Visits</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    You have no active doctor appointments scheduled. You can book an appointment with our specialists anytime.
                  </p>
                </div>
                <Link to="/patient/book-appointment">
                  <Button size="sm" className="mt-2 text-xs">
                    <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Book an Appointment
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right 1 Col: Profile Summary & Patient Alerts */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">My Health Profile</CardTitle>
              </div>
              <Link to="/patient/profile">
                <Button variant="ghost" size="sm" className="h-7 text-xs">Edit</Button>
              </Link>
            </div>
            <CardDescription>Verified patient demographic records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patientQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : patientQuery.data ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Full Name:</span>
                  <span className="font-semibold text-foreground">{patientQuery.data.fullName}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-mono text-foreground">{patientQuery.data.phone || 'Not recorded'}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-mono text-foreground truncate max-w-[150px]">{patientQuery.data.email || 'Not recorded'}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Gender:</span>
                  <span className="text-foreground">{patientQuery.data.gender || 'Not specified'}</span>
                </div>
                <div className="pt-1">
                  <span className="text-muted-foreground block mb-1">Documented Allergies:</span>
                  {patientQuery.data.allergies?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {patientQuery.data.allergies.map((allergy, i) => (
                        <Badge key={i} variant="destructive" className="text-[10px] px-1.5 py-0">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-[11px]">No known drug allergies</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Unable to load profile data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Recent Prescriptions & Invoices */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Prescriptions */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-base font-semibold">Recent Prescriptions</CardTitle>
              </div>
              <Link to="/patient/prescriptions">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
            <CardDescription>Digitally signed prescriptions by your attending doctors</CardDescription>
          </CardHeader>
          <CardContent>
            {prescriptionsQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : prescriptions.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                No prescriptions on file yet.
              </div>
            ) : (
              <div className="space-y-2">
                {prescriptions.slice(0, 3).map((rx) => (
                  <div
                    key={rx.id}
                    className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">
                        Dr. {rx.doctorName || 'Attending Physician'}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {formatDate(rx.createdAt)} · {rx.items?.length || 0} medicine{(rx.items?.length || 0) !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Link to="/patient/prescriptions">
                      <Button variant="outline" size="sm" className="h-7 text-[11px]">
                        Inspect
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-base font-semibold">Billing & Receipts</CardTitle>
              </div>
              <Link to="/patient/billing">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
            <CardDescription>Itemized consultation invoices and counter receipt ledger</CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesQuery.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                No billing statements issued yet.
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 3).map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground font-mono">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {formatDate(inv.createdAt)} · Total: {inv.currency || 'INR'} {inv.total}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          inv.status === 'PAID'
                            ? 'success'
                            : inv.status === 'PENDING'
                            ? 'warning'
                            : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {inv.status}
                      </Badge>
                      <Link to="/patient/billing">
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
