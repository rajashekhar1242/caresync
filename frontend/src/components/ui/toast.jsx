/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const ToastContext = React.createContext(undefined);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const dismiss = React.useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = 'default', duration = 4000 }) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast = { id, title, description, variant, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const variantStyles = {
    default: 'bg-background text-foreground border-border',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
    destructive: 'bg-destructive/10 text-destructive border-destructive/30',
    warning: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
    info: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  };

  const IconComponent = {
    default: Info,
    success: CheckCircle2,
    destructive: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[toast.variant || 'default'];

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-full items-start justify-between space-x-3 overflow-hidden rounded-md border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5',
        variantStyles[toast.variant || 'default']
      )}
    >
      <div className="flex items-start gap-3">
        <IconComponent className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="grid gap-1">
          {toast.title && <p className="text-sm font-semibold leading-none">{toast.title}</p>}
          {toast.description && <p className="text-xs opacity-90 leading-relaxed">{toast.description}</p>}
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-md p-1 text-foreground/50 opacity-70 transition-opacity hover:opacity-100 focus:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
