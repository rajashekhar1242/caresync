import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, HeartPulse, Info, Lock, Mail, Phone, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters'),
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(254, 'Email must not exceed 254 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must not exceed 72 characters'),
  phone: z
    .string()
    .regex(/^(\+?[0-9]{10,15})?$/, 'Phone must be 10 to 15 digits with optional leading +')
    .optional(),
});

export function RegisterPage() {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [errorMessage, setErrorMessage] = React.useState(null);
  const [success, setSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      phone: '',
    },
  });

  const onSubmit = async (data) => {
    setErrorMessage(null);
    try {
      await registerAuth(data);
      setSuccess(true);
      toast({
        title: 'Registration Successful',
        description: 'Your patient account has been created. Please sign in.',
        variant: 'success',
      });
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      const status = err?.response?.status;
      const errorCode = err?.response?.data?.code;
      const serverMessage = err?.response?.data?.message;
      const fieldErrors = err?.response?.data?.fieldErrors;

      if (fieldErrors && Array.isArray(fieldErrors)) {
        fieldErrors.forEach((fe) => {
          if (fe.field && fe.message) {
            setError(fe.field, { type: 'server', message: fe.message });
          }
        });
      }

      if (status === 409 || errorCode === 'EMAIL_ALREADY_EXISTS') {
        setErrorMessage('An account with this email already exists. Please sign in or use a different email.');
      } else if (status === 429) {
        setErrorMessage('Too many registration attempts. Please wait a moment and try again.');
      } else if (serverMessage) {
        setErrorMessage(serverMessage);
      } else {
        setErrorMessage('Registration could not be completed. Please check your information and try again.');
      }
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <HeartPulse className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            CareSync Patient Portal
          </h1>
          <p className="text-sm text-muted-foreground">
            Create your personal medical records account
          </p>
        </div>

        {/* Registration Card */}
        <Card className="shadow-lg border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">Patient Registration</CardTitle>
            <CardDescription>
              Complete the form below to register for appointments and prescriptions
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Note on Role Scope */}
            <div className="mb-4 flex items-start gap-2 rounded-md bg-sky-50 dark:bg-sky-950/50 p-3 text-xs text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Self-registration is available for <strong>Patients</strong>. Clinical staff and doctors are onboarded directly by clinic administration.
              </span>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {success && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Account created successfully! Redirecting to sign in...</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="fullName">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Full Name
                </label>
                <Input
                  id="fullName"
                  placeholder="Jane Doe"
                  autoComplete="name"
                  error={errors.fullName?.message}
                  {...register('fullName')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="email">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane.doe@example.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register('email')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="phone">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Phone Number (Optional)
                </label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+15552345678"
                  autoComplete="tel"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="password">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  error={errors.password?.message}
                  helperText="Must be at least 8 characters"
                  {...register('password')}
                />
              </div>

              <Button type="submit" className="w-full mt-2" isLoading={isSubmitting} disabled={success}>
                Create Patient Account
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex justify-center border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Sign in here
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
