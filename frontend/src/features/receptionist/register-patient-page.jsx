import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UserPlus,
  CheckCircle2,
  CalendarPlus,
  AlertCircle,
  ArrowLeft,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCreatePatient } from '@/hooks/use-patients';
import { patientRegistrationSchema } from './schemas';
import { useToast } from '@/hooks/use-toast';

export function RegisterPatientPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createPatientMutation = useCreatePatient();

  const [registeredPatient, setRegisteredPatient] = React.useState(null);
  const [serverError, setServerError] = React.useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(patientRegistrationSchema),
    defaultValues: {
      fullName: '',
      dateOfBirth: '',
      gender: '',
      phone: '',
      email: '',
      address: '',
      allergiesText: '',
    },
  });

  const onSubmit = async (data) => {
    setServerError(null);

    // Parse comma-separated allergies
    const allergies = data.allergiesText
      ? data.allergiesText
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

    const payload = {
      fullName: data.fullName.trim(),
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      allergies,
    };

    try {
      const response = await createPatientMutation.mutateAsync(payload);
      setRegisteredPatient(response);
      toast({
        title: 'Patient Registered Successfully',
        description: `Generated record for ${response.fullName}.`,
        variant: 'default',
      });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.fieldErrors?.[0]?.message ||
        'Failed to register patient. Please verify details and try again.';
      setServerError(message);
      toast({
        title: 'Registration Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleRegisterAnother = () => {
    setRegisteredPatient(null);
    setServerError(null);
    reset();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb & Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/receptionist/patients')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Directory
          </Button>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
          Walk-in Intake
        </Badge>
      </div>

      {registeredPatient ? (
        /* Success Screen */
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10 shadow-sm">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-xl font-bold text-foreground">
              Patient Successfully Registered
            </CardTitle>
            <CardDescription>
              New medical record has been stored and indexed in the hospital directory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-card border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                  <span className="text-xs text-muted-foreground uppercase font-semibold">
                    Patient Name
                  </span>
                  <p className="text-lg font-bold text-foreground">
                    {registeredPatient.fullName}
                  </p>
                </div>
                <div className="sm:text-right">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">
                    Gender / DOB
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {registeredPatient.gender || 'UNSPECIFIED'} ·{' '}
                    {registeredPatient.dateOfBirth || 'DOB not provided'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Patient Identifier (UUID):</span>
                  <p className="font-mono text-foreground font-semibold break-all">
                    {registeredPatient.id}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone Number:</span>
                  <p className="font-mono text-foreground font-semibold">
                    {registeredPatient.phone || 'None provided'}
                  </p>
                </div>
              </div>

              {registeredPatient.allergies?.length > 0 && (
                <div className="pt-2 border-t text-xs">
                  <span className="text-muted-foreground">Recorded Allergies:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {registeredPatient.allergies.map((allergy, i) => (
                      <Badge key={i} variant="outline" className="text-[11px] bg-amber-50 text-amber-700">
                        {allergy}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              className="w-full sm:w-auto flex-1 bg-primary text-primary-foreground"
              onClick={() => navigate(`/receptionist/appointments/book?patientId=${registeredPatient.id}`)}
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Book Appointment Now
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleRegisterAnother}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Register Another Patient
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => navigate('/receptionist/patients')}
            >
              <Users className="h-4 w-4 mr-2" />
              View Directory
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* Registration Form */
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              New Patient Intake Form
            </CardTitle>
            <CardDescription>
              Enter patient demographic details. Fields marked with an asterisk (*) are mandatory.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-5">
              {serverError && (
                <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Anand Sharma"
                  {...register('fullName')}
                  disabled={isSubmitting}
                />
                {errors.fullName && (
                  <p className="text-xs text-rose-500">{errors.fullName.message}</p>
                )}
              </div>

              {/* DOB & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    {...register('dateOfBirth')}
                    disabled={isSubmitting}
                  />
                  {errors.dateOfBirth && (
                    <p className="text-xs text-rose-500">{errors.dateOfBirth.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Gender
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('gender')}
                    disabled={isSubmitting}
                  >
                    <option value="">Select Gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                  {errors.gender && (
                    <p className="text-xs text-rose-500">{errors.gender.message}</p>
                  )}
                </div>
              </div>

              {/* Contact Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Phone Number
                  </label>
                  <Input
                    placeholder="e.g. +919876543210"
                    className="font-mono text-sm"
                    {...register('phone')}
                    disabled={isSubmitting}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    10 to 15 digits with optional leading +
                  </p>
                  {errors.phone && (
                    <p className="text-xs text-rose-500">{errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="e.g. patient@example.com"
                    {...register('email')}
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <p className="text-xs text-rose-500">{errors.email.message}</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Residential Address
                </label>
                <Input
                  placeholder="Street, City, Pin Code"
                  {...register('address')}
                  disabled={isSubmitting}
                />
                {errors.address && (
                  <p className="text-xs text-rose-500">{errors.address.message}</p>
                )}
              </div>

              {/* Known Allergies */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  Known Drug or Food Allergies
                </label>
                <Input
                  placeholder="e.g. Penicillin, Peanuts, Sulfa (comma-separated)"
                  {...register('allergiesText')}
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-muted-foreground">
                  Separate multiple entries with commas. Crucial for physician drug-interaction safety.
                </p>
              </div>

              {/* Compliance & Audit Disclaimer */}
              <div className="p-3 rounded bg-muted/40 border text-xs text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Patient data will be stored securely according to HCMS patient record policies.
                </span>
              </div>
            </CardContent>

            <CardFooter className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/receptionist/patients')}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <UserPlus className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Registering...' : 'Register Patient'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
