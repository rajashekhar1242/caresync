import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, HeartPulse, Lock, Mail, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/app/providers/auth.context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLE_DEFAULT_REDIRECT } from '@/constants';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data) => {
    setErrorMessage(null);
    try {
      const authData = await login(data);
      const userRole = authData?.user?.role;
      const targetFrom = location.state?.from?.pathname;

      // Only return to original target if user's actual role has access to it
      if (targetFrom && userRole && targetFrom.startsWith(`/${userRole.toLowerCase()}`)) {
        navigate(targetFrom, { replace: true });
      } else if (userRole && ROLE_DEFAULT_REDIRECT[userRole]) {
        navigate(ROLE_DEFAULT_REDIRECT[userRole], { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      const status = err?.response?.status;
      const errorCode = err?.response?.data?.code;
      const serverMessage = err?.response?.data?.message;

      if (status === 429) {
        setErrorMessage('Too many sign-in attempts. Please wait a minute and try again.');
      } else if (errorCode === 'INVALID_CREDENTIALS') {
        setErrorMessage('Invalid email or password. Please verify your credentials.');
      } else if (serverMessage) {
        setErrorMessage(serverMessage);
      } else {
        setErrorMessage('Unable to connect to the authentication server. Please try again.');
      }
    }
  };

  const handleDemoFill = (email, pass) => {
    setValue('email', email);
    setValue('password', pass);
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
            CareSync HCMS
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your clinical workspace
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to continue to your CareSync portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="email">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@caresync.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register('email')}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5" htmlFor="password">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    className="pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" isLoading={isSubmitting}>
                Sign In to CareSync
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              New patient without an account?{' '}
              <Link to="/register" className="font-semibold text-primary hover:underline">
                Register as Patient
              </Link>
            </p>

            {/* Demo Credential Shortcuts */}
            <div className="w-full pt-2 border-t text-left">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Quick Test Roles:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleDemoFill('admin@caresync.com', 'Admin@123')}
                  className="rounded border border-dashed px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground truncate"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoFill('receptionist@caresync.com', 'Recept@123')}
                  className="rounded border border-dashed px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground truncate"
                >
                  Receptionist
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoFill('dr.qa.live.1794563025465@caresync.local', 'DoctorPassword!123')}
                  className="rounded border border-dashed px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground truncate"
                >
                  Doctor
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoFill('patient@caresync.com', 'Patient@123')}
                  className="rounded border border-dashed px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground truncate"
                >
                  Patient
                </button>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
