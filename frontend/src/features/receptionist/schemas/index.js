import { z } from 'zod';

export const patientRegistrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters'),
  dateOfBirth: z
    .string()
    .optional()
    .refine((val) => !val || new Date(val) <= new Date(), {
      message: 'Date of birth cannot be in the future',
    }),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', '']).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || /^\+?[0-9]{10,15}$/.test(val), {
      message: 'Phone must be 10 to 15 digits with optional leading +',
    }),
  email: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Please enter a valid email address',
    }),
  address: z.string().trim().max(500, 'Address must be at most 500 characters').optional(),
  allergiesText: z.string().optional(),
});

export const appointmentBookingSchema = z.object({
  patientId: z.string().uuid('Please select a valid patient'),
  doctorId: z.string().uuid('Please select a physician'),
  date: z.string().min(10, 'Please select an appointment date'),
  slotStart: z.string().min(1, 'Please select an available appointment slot'),
  reason: z.string().trim().max(500, 'Reason must be at most 500 characters').optional(),
});
