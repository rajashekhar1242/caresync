/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        info: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function RoleBadge({ role, className }) {
  switch (role) {
    case 'ADMIN':
      return <Badge variant="destructive" className={className}>Admin</Badge>;
    case 'DOCTOR':
      return <Badge variant="info" className={className}>Doctor</Badge>;
    case 'RECEPTIONIST':
      return <Badge variant="secondary" className={className}>Receptionist</Badge>;
    case 'PATIENT':
      return <Badge variant="success" className={className}>Patient</Badge>;
    default:
      return <Badge variant="outline" className={className}>{role}</Badge>;
  }
}

export function AppointmentStatusBadge({ status, className }) {
  switch (status) {
    case 'BOOKED':
      return <Badge variant="info" className={className}>Booked</Badge>;
    case 'CHECKED_IN':
      return <Badge variant="warning" className={className}>Checked In</Badge>;
    case 'IN_CONSULTATION':
      return <Badge variant="default" className={className}>In Consultation</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" className={className}>Completed</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive" className={className}>Cancelled</Badge>;
    case 'NO_SHOW':
      return <Badge variant="secondary" className={className}>No Show</Badge>;
    default:
      return <Badge variant="outline" className={className}>{status}</Badge>;
  }
}

export function InvoiceStatusBadge({ status, className }) {
  switch (status) {
    case 'PAID':
      return <Badge variant="success" className={className}>Paid</Badge>;
    case 'PARTIALLY_PAID':
      return <Badge variant="warning" className={className}>Partially Paid</Badge>;
    case 'ISSUED':
      return <Badge variant="info" className={className}>Issued</Badge>;
    case 'DRAFT':
      return <Badge variant="secondary" className={className}>Draft</Badge>;
    case 'VOID':
      return <Badge variant="destructive" className={className}>Void</Badge>;
    default:
      return <Badge variant="outline" className={className}>{status}</Badge>;
  }
}

export { Badge, badgeVariants };
