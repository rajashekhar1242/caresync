/**
 * CareSync Application Constants
 */

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'caresync_access_token',
  REFRESH_TOKEN: 'caresync_refresh_token',
  USER: 'caresync_user',
  THEME: 'caresync_theme',
};

export const ROLES = {
  ADMIN: 'ADMIN',
  RECEPTIONIST: 'RECEPTIONIST',
  DOCTOR: 'DOCTOR',
  PATIENT: 'PATIENT',
};

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  RECEPTIONIST: 'Receptionist',
  DOCTOR: 'Doctor / Physician',
  PATIENT: 'Patient',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  UNAUTHORIZED: '/unauthorized',
  ADMIN_ROOT: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  RECEPTIONIST_ROOT: '/receptionist',
  RECEPTIONIST_DASHBOARD: '/receptionist/dashboard',
  RECEPTIONIST_PATIENTS: '/receptionist/patients',
  RECEPTIONIST_PATIENT_REGISTER: '/receptionist/patients/register',
  RECEPTIONIST_APPOINTMENTS: '/receptionist/appointments',
  RECEPTIONIST_APPOINTMENT_BOOK: '/receptionist/appointments/book',
  RECEPTIONIST_CHECK_IN: '/receptionist/check-in',
  RECEPTIONIST_QUEUE: '/receptionist/queue',
  RECEPTIONIST_DOCTORS: '/receptionist/doctors',
  DOCTOR_ROOT: '/doctor',
  DOCTOR_DASHBOARD: '/doctor/dashboard',
  DOCTOR_SCHEDULES: '/doctor/schedules',
  DOCTOR_QUEUE: '/doctor/queue',
  DOCTOR_PATIENTS: '/doctor/patients',
  DOCTOR_CONSULTATIONS: '/doctor/consultations',
  DOCTOR_HISTORY: '/doctor/history',
  PATIENT_ROOT: '/patient',
  PATIENT_DASHBOARD: '/patient/dashboard',
  PATIENT_PROFILE: '/patient/profile',
  PATIENT_DOCTORS: '/patient/doctors',
  PATIENT_BOOK_APPOINTMENT: '/patient/book-appointment',
  PATIENT_APPOINTMENTS: '/patient/appointments',
  PATIENT_PRESCRIPTIONS: '/patient/prescriptions',
  PATIENT_MEDICAL_HISTORY: '/patient/medical-history',
  PATIENT_BILLING: '/patient/billing',
};

export const ROLE_DEFAULT_REDIRECT = {
  ADMIN: ROUTES.ADMIN_DASHBOARD,
  RECEPTIONIST: ROUTES.RECEPTIONIST_DASHBOARD,
  DOCTOR: ROUTES.DOCTOR_DASHBOARD,
  PATIENT: ROUTES.PATIENT_DASHBOARD,
};

export const PAGINATION_DEFAULTS = {
  PAGE_SIZE: 10,
  INITIAL_PAGE: 0,
};
