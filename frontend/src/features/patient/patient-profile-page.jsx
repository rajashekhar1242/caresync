import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertCircle,
  Save,
  CheckCircle2,
  ShieldCheck,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/app/providers/auth.context';
import { usePatient, useUpdatePatient } from '@/hooks/use-patients';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

const profileSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters'),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10 to 15 digits with optional leading +')
    .or(z.literal('')),
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(254, 'Email must be at most 254 characters')
    .or(z.literal('')),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', '']).optional(),
  address: z.string().max(500, 'Address must be at most 500 characters').optional(),
  allergies: z.string().optional(),
});

export function PatientProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const patientId = user?.patientId;

  const patientQuery = usePatient(patientId, { enabled: Boolean(patientId) });
  const updateMutation = useUpdatePatient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      allergies: '',
    },
  });

  // Sync server data into form fields
  React.useEffect(() => {
    if (patientQuery.data) {
      reset({
        fullName: patientQuery.data.fullName || '',
        phone: patientQuery.data.phone || '',
        email: patientQuery.data.email || '',
        dateOfBirth: patientQuery.data.dateOfBirth || '',
        gender: patientQuery.data.gender || '',
        address: patientQuery.data.address || '',
        allergies: Array.isArray(patientQuery.data.allergies)
          ? patientQuery.data.allergies.join(', ')
          : '',
      });
    }
  }, [patientQuery.data, reset]);

  const onSubmit = async (data) => {
    if (!patientId) {
      toast({
        title: 'Error',
        description: 'Patient record is not linked to your authenticated account.',
        variant: 'destructive',
      });
      return;
    }

    // Parse comma-separated allergies into clean string array
    const parsedAllergies = (data.allergies || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      fullName: data.fullName.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      address: data.address?.trim() || null,
      allergies: parsedAllergies,
    };

    try {
      await updateMutation.mutateAsync({
        patientId,
        data: payload,
      });

      toast({
        title: 'Profile Updated',
        description: 'Your medical demographic information was successfully saved.',
        variant: 'default',
      });
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err.response?.data?.message || err.message || 'Unable to update patient record.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          My Health Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and update your personal demographic and contact information on file at CareSync.
        </p>
      </div>

      {patientQuery.isLoading ? (
        <Card className="shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : patientQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">
              Unable to load patient profile
            </p>
            <p className="text-xs text-muted-foreground">
              {patientQuery.error?.message || 'Please check your connection and try again.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Identity & Record Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Account Identifiers & Status
                </CardTitle>
                <Badge variant="success">Active Patient Record</Badge>
              </div>
              <CardDescription>
                System-assigned identifiers linked to your authenticated CareSync session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px]">Patient UUID</span>
                  <span className="font-mono font-medium text-foreground truncate block">
                    {patientId}
                  </span>
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px]">User Account ID</span>
                  <span className="font-mono font-medium text-foreground truncate block">
                    {user?.id}
                  </span>
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px]">Enrolled Since</span>
                  <span className="font-medium text-foreground block">
                    {patientQuery.data?.createdAt ? formatDate(patientQuery.data.createdAt) : 'Registered'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Demographic & Contact Details */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal & Contact Information
              </CardTitle>
              <CardDescription>
                Attending physicians and front-desk staff use these details to contact you and verify appointments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label htmlFor="fullName" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    Full Legal Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="fullName"
                    {...register('fullName')}
                    placeholder="e.g. Jane Doe"
                    className="h-9 text-xs"
                    disabled={updateMutation.isPending}
                  />
                  {errors.fullName && (
                    <p className="text-[11px] text-destructive">{errors.fullName.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label htmlFor="phone" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    Phone Number
                  </label>
                  <Input
                    id="phone"
                    {...register('phone')}
                    placeholder="+919876543210"
                    className="h-9 text-xs font-mono"
                    disabled={updateMutation.isPending}
                  />
                  {errors.phone && (
                    <p className="text-[11px] text-destructive">{errors.phone.message}</p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="patient@example.com"
                    className="h-9 text-xs font-mono"
                    disabled={updateMutation.isPending}
                  />
                  {errors.email && (
                    <p className="text-[11px] text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="space-y-1.5">
                  <label htmlFor="dateOfBirth" className="text-xs font-semibold text-foreground">
                    Date of Birth
                  </label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    {...register('dateOfBirth')}
                    className="h-9 text-xs font-mono"
                    disabled={updateMutation.isPending}
                  />
                  {errors.dateOfBirth && (
                    <p className="text-[11px] text-destructive">{errors.dateOfBirth.message}</p>
                  )}
                </div>

                {/* Gender */}
                <div className="space-y-1.5">
                  <label htmlFor="gender" className="text-xs font-semibold text-foreground">
                    Gender
                  </label>
                  <select
                    id="gender"
                    {...register('gender')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={updateMutation.isPending}
                  >
                    <option value="">Select Gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                  {errors.gender && (
                    <p className="text-[11px] text-destructive">{errors.gender.message}</p>
                  )}
                </div>

                {/* Residential Address */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="address" className="text-xs font-semibold text-foreground">
                    Residential Address
                  </label>
                  <Input
                    id="address"
                    {...register('address')}
                    placeholder="Street, City, Postal Code"
                    className="h-9 text-xs"
                    disabled={updateMutation.isPending}
                  />
                  {errors.address && (
                    <p className="text-[11px] text-destructive">{errors.address.message}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Allergies Section */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Documented Drug & Environmental Allergies
              </CardTitle>
              <CardDescription>
                Known drug allergies are checked automatically by the physician during prescription generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="allergies" className="text-xs font-semibold text-foreground">
                  Known Allergies (Comma-separated)
                </label>
                <Input
                  id="allergies"
                  {...register('allergies')}
                  placeholder="e.g. Penicillin, Sulfa drugs, Latex"
                  className="h-9 text-xs"
                  disabled={updateMutation.isPending}
                />
                <p className="text-[11px] text-muted-foreground">
                  Separate multiple allergies with commas. Leave blank if you have no known drug allergies.
                </p>
                {errors.allergies && (
                  <p className="text-[11px] text-destructive">{errors.allergies.message}</p>
                )}
              </div>

              {/* Informational Note on Unsupported Backend Fields */}
              <div className="p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="h-4 w-4 text-primary" /> Hospital Records Note
                </div>
                <p className="text-[11px]">
                  Emergency contact contacts, blood group determination, and primary insurance cards are verified directly at the hospital records counter during registration and cannot be modified online.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => reset()}
                disabled={!isDirty || updateMutation.isPending}
              >
                Reset Changes
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs"
                disabled={!isDirty || updateMutation.isPending || isSubmitting}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {updateMutation.isPending ? 'Saving...' : 'Save Profile Changes'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
