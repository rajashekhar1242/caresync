import { Link } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-sm">
          <FileQuestion className="h-9 w-9" />
        </div>

        <div className="space-y-2">
          <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            404 Error
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Page Not Found
          </h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or may have been relocated within the CareSync system.
          </p>
        </div>

        <div className="pt-2">
          <Button asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Return to CareSync Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
