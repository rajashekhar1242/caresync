import { z } from 'zod';

/**
 * @typedef {'ADMIN' | 'RECEPTIONIST' | 'DOCTOR' | 'PATIENT'} Role
 */

/**
 * @typedef {Object} UserResponse
 * @property {string} id
 * @property {string} email
 * @property {string} fullName
 * @property {Role} role
 * @property {string|null} [patientId]
 * @property {string|null} [doctorId]
 */

/**
 * @typedef {Object} AuthResponse
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {string} tokenType
 * @property {number} expiresIn
 * @property {UserResponse} user
 */

/**
 * @typedef {Object} TokenResponse
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {string} tokenType
 * @property {number} expiresIn
 */

/**
 * @typedef {Object} FieldError
 * @property {string} field
 * @property {string} message
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {string} timestamp
 * @property {number} status
 * @property {string} code
 * @property {string} message
 * @property {string} path
 * @property {FieldError[]} [fieldErrors]
 */

/**
 * @template T
 * @typedef {Object} PageResponse
 * @property {T[]} content
 * @property {number} page
 * @property {number} size
 * @property {number} totalElements
 * @property {number} totalPages
 */

/**
 * @typedef {Object} AppointmentCounts
 * @property {number} total
 * @property {number} booked
 * @property {number} checkedIn
 * @property {number} inConsultation
 * @property {number} completed
 * @property {number} cancelled
 * @property {number} noShow
 */

/**
 * @typedef {Object} DashboardSummaryResponse
 * @property {string} [clinicId]
 * @property {string} timeZone
 * @property {string} today
 * @property {string} generatedAt
 * @property {AppointmentCounts} appointmentsToday
 * @property {number} waitingNow
 * @property {string} currency
 * @property {string} collectedToday
 * @property {string} collectedThisMonth
 * @property {string} outstandingBalance
 * @property {number} unpaidInvoiceCount
 * @property {number} activeDoctors
 */

/**
 * @typedef {Object} DoctorResponse
 * @property {string} id
 * @property {string} userId
 * @property {string} fullName
 * @property {string} specializationId
 * @property {string} clinicId
 * @property {string} departmentId
 * @property {string} consultationFee
 * @property {number} slotMinutes
 * @property {boolean} active
 */

/**
 * @typedef {Object} AppointmentResponse
 * @property {string} id
 * @property {string} doctorId
 * @property {string} doctorName
 * @property {string} patientId
 * @property {string} patientName
 * @property {string} clinicId
 * @property {string} timeZone
 * @property {string} slotStart
 * @property {string} slotEnd
 * @property {'BOOKED'|'CHECKED_IN'|'IN_CONSULTATION'|'COMPLETED'|'CANCELLED'|'NO_SHOW'} status
 * @property {string} [reason]
 * @property {string} [cancellationReason]
 * @property {number} [tokenNumber]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} PatientSummary
 * @property {string} id
 * @property {string} fullName
 * @property {string} phone
 * @property {string} dateOfBirth
 * @property {'MALE'|'FEMALE'|'OTHER'} gender
 */

/**
 * @typedef {Object} PatientResponse
 * @property {string} id
 * @property {string} userId
 * @property {string} fullName
 * @property {string} dateOfBirth
 * @property {'MALE'|'FEMALE'|'OTHER'} gender
 * @property {string} phone
 * @property {string} [email]
 * @property {string} [address]
 * @property {string[]} allergies
 * @property {string} createdAt
 * @property {string} updatedAt
 */

// Zod Runtime Validation Schemas matching backend contracts
export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT']),
  patientId: z.string().nullable().optional(),
  doctorId: z.string().nullable().optional(),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
  user: UserResponseSchema,
});

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const RegisterRequestSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  phone: z.string().optional(),
});

export const DepartmentRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional().or(z.literal('')),
});

export const DoctorCreateRequestSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Phone must contain 10 to 15 digits').optional().or(z.literal('')),
  specializationId: z.string().uuid('Please select a specialization'),
  clinicId: z.string().uuid('Please select a clinic'),
  departmentId: z.string().uuid('Please select a department'),
  consultationFee: z.string().regex(/^\d+\.\d{2}$/, 'Fee must be formatted as 00.00 (e.g. 500.00)'),
  slotMinutes: z.coerce.number().min(5).max(120),
});

export const DoctorUpdateRequestSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Phone must contain 10 to 15 digits').optional().or(z.literal('')),
  specializationId: z.string().uuid('Please select a specialization'),
  clinicId: z.string().uuid('Please select a clinic'),
  departmentId: z.string().uuid('Please select a department'),
  consultationFee: z.string().regex(/^\d+\.\d{2}$/, 'Fee must be formatted as 00.00 (e.g. 500.00)'),
  slotMinutes: z.coerce.number().min(5).max(120),
  active: z.boolean(),
});

export const PatientRequestSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().regex(/^\+?[0-9]{3,15}$/, 'Phone must contain 3 to 15 digits'),
  email: z.string().email('Please enter a valid email').optional().or(z.literal('')),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  address: z.string().max(255).optional().or(z.literal('')),
  allergies: z.string().optional(),
});

export const VoidInvoiceRequestSchema = z.object({
  reason: z.string().min(3, 'Please provide a void reason (at least 3 characters)'),
});

export const CreditNoteRequestSchema = z.object({
  amount: z.string().regex(/^\d+\.\d{2}$/, 'Amount must be formatted as 00.00 (e.g. 150.00)'),
  reason: z.string().min(3, 'Please provide a reason (at least 3 characters)'),
});

export const CancelAppointmentRequestSchema = z.object({
  reason: z.string().min(3, 'Please provide a cancellation reason (at least 3 characters)'),
});
