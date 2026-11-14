import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from '@/app/providers/query.provider';
import { AuthProvider } from '@/app/providers/auth.provider';
import { ToastProvider } from '@/components/ui/toast';
import { router } from '@/app/router/routes';

export function App() {
  return (
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>
  );
}

export default App;
