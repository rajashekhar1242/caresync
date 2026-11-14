import React, { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/app/layouts/app-layout';
import { ProtectedRoute, PublicOnlyRoute } from './protected-route';
import { RootRedirect } from './root-redirect';
import { PageSkeleton } from '@/components/common/page-skeleton';

const withSuspense = (Component) => (
  <Suspense fallback={<PageSkeleton />}>
    <Component />
  </Suspense>
);

// Lazy Loaded Pages

// Auth & Shared
const LoginPage = React.lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('@/features/auth/register-page').then((m) => ({ default: m.RegisterPage })));
const UnauthorizedPage = React.lazy(() => import('@/features/auth/unauthorized-page').then((m) => ({ default: m.UnauthorizedPage })));
const NotFoundPage = React.lazy(() => import('@/components/common/not-found-page').then((m) => ({ default: m.NotFoundPage })));

// Admin Portal
const AdminHome = React.lazy(() => import('@/features/admin/admin-home').then((m) => ({ default: m.AdminHome })));
const DepartmentsPage = React.lazy(() => import('@/features/admin/departments-page').then((m) => ({ default: m.DepartmentsPage })));
const DoctorsPage = React.lazy(() => import('@/features/admin/doctors-page').then((m) => ({ default: m.DoctorsPage })));
const StaffPage = React.lazy(() => import('@/features/admin/staff-page').then((m) => ({ default: m.StaffPage })));
const AppointmentsPage = React.lazy(() => import('@/features/admin/appointments-page').then((m) => ({ default: m.AppointmentsPage })));
const PatientsPage = React.lazy(() => import('@/features/admin/patients-page').then((m) => ({ default: m.PatientsPage })));
const BillingPage = React.lazy(() => import('@/features/admin/billing-page').then((m) => ({ default: m.BillingPage })));
const ReportsPage = React.lazy(() => import('@/features/admin/reports-page').then((m) => ({ default: m.ReportsPage })));
const AuditLogsPage = React.lazy(() => import('@/features/admin/audit-logs-page').then((m) => ({ default: m.AuditLogsPage })));
const SettingsPage = React.lazy(() => import('@/features/admin/settings-page').then((m) => ({ default: m.SettingsPage })));

// Receptionist Portal
const ReceptionistHome = React.lazy(() => import('@/features/receptionist/receptionist-home').then((m) => ({ default: m.ReceptionistHome })));
const ReceptionistPatientsPage = React.lazy(() => import('@/features/receptionist/patients-page').then((m) => ({ default: m.PatientsPage })));
const ReceptionistRegisterPatientPage = React.lazy(() => import('@/features/receptionist/register-patient-page').then((m) => ({ default: m.RegisterPatientPage })));
const ReceptionistAppointmentsPage = React.lazy(() => import('@/features/receptionist/appointments-page').then((m) => ({ default: m.AppointmentsPage })));
const ReceptionistBookAppointmentPage = React.lazy(() => import('@/features/receptionist/book-appointment-page').then((m) => ({ default: m.BookAppointmentPage })));
const ReceptionistCheckInPage = React.lazy(() => import('@/features/receptionist/check-in-page').then((m) => ({ default: m.CheckInPage })));
const ReceptionistQueuePage = React.lazy(() => import('@/features/receptionist/queue-page').then((m) => ({ default: m.QueuePage })));
const ReceptionistDoctorAvailabilityPage = React.lazy(() => import('@/features/receptionist/doctor-availability-page').then((m) => ({ default: m.DoctorAvailabilityPage })));

// Doctor Portal
const DoctorHome = React.lazy(() => import('@/features/doctor/doctor-home').then((m) => ({ default: m.DoctorHome })));
const DoctorSchedulePage = React.lazy(() => import('@/features/doctor/doctor-schedule-page').then((m) => ({ default: m.DoctorSchedulePage })));
const DoctorQueuePage = React.lazy(() => import('@/features/doctor/doctor-queue-page').then((m) => ({ default: m.DoctorQueuePage })));
const DoctorPatientsPage = React.lazy(() => import('@/features/doctor/doctor-patients-page').then((m) => ({ default: m.DoctorPatientsPage })));
const DoctorConsultationsPage = React.lazy(() => import('@/features/doctor/doctor-consultations-page').then((m) => ({ default: m.DoctorConsultationsPage })));
const DoctorHistoryPage = React.lazy(() => import('@/features/doctor/doctor-history-page').then((m) => ({ default: m.DoctorHistoryPage })));

// Patient Portal
const PatientHome = React.lazy(() => import('@/features/patient/patient-home').then((m) => ({ default: m.PatientHome })));
const PatientProfilePage = React.lazy(() => import('@/features/patient/patient-profile-page').then((m) => ({ default: m.PatientProfilePage })));
const PatientDoctorsPage = React.lazy(() => import('@/features/patient/patient-doctors-page').then((m) => ({ default: m.PatientDoctorsPage })));
const PatientBookAppointmentPage = React.lazy(() => import('@/features/patient/patient-book-appointment-page').then((m) => ({ default: m.PatientBookAppointmentPage })));
const PatientAppointmentsPage = React.lazy(() => import('@/features/patient/patient-appointments-page').then((m) => ({ default: m.PatientAppointmentsPage })));
const PatientPrescriptionsPage = React.lazy(() => import('@/features/patient/patient-prescriptions-page').then((m) => ({ default: m.PatientPrescriptionsPage })));
const PatientMedicalHistoryPage = React.lazy(() => import('@/features/patient/patient-medical-history-page').then((m) => ({ default: m.PatientMedicalHistoryPage })));
const PatientBillingPage = React.lazy(() => import('@/features/patient/patient-billing-page').then((m) => ({ default: m.PatientBillingPage })));

export const router = createBrowserRouter([
  // Root Redirect
  {
    path: '/',
    element: <RootRedirect />,
  },

  // Public / Auth Routes
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: '/login',
        element: withSuspense(LoginPage),
      },
      {
        path: '/register',
        element: withSuspense(RegisterPage),
      },
    ],
  },
  {
    path: '/unauthorized',
    element: withSuspense(UnauthorizedPage),
  },

  // Protected Admin Routes
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['ADMIN']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(AdminHome) },
          { path: 'departments', element: withSuspense(DepartmentsPage) },
          { path: 'doctors', element: withSuspense(DoctorsPage) },
          { path: 'staff', element: withSuspense(StaffPage) },
          { path: 'users', element: <Navigate to="/admin/staff" replace /> },
          { path: 'appointments', element: withSuspense(AppointmentsPage) },
          { path: 'patients', element: withSuspense(PatientsPage) },
          { path: 'billing', element: withSuspense(BillingPage) },
          { path: 'reports', element: withSuspense(ReportsPage) },
          { path: 'audit-logs', element: withSuspense(AuditLogsPage) },
          { path: 'settings', element: withSuspense(SettingsPage) },
        ],
      },
    ],
  },

  // Protected Receptionist Routes
  {
    path: '/receptionist',
    element: <ProtectedRoute allowedRoles={['RECEPTIONIST']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/receptionist/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(ReceptionistHome) },
          { path: 'patients', element: withSuspense(ReceptionistPatientsPage) },
          { path: 'patients/register', element: withSuspense(ReceptionistRegisterPatientPage) },
          { path: 'appointments', element: withSuspense(ReceptionistAppointmentsPage) },
          { path: 'appointments/book', element: withSuspense(ReceptionistBookAppointmentPage) },
          { path: 'check-in', element: withSuspense(ReceptionistCheckInPage) },
          { path: 'queue', element: withSuspense(ReceptionistQueuePage) },
          { path: 'doctors', element: withSuspense(ReceptionistDoctorAvailabilityPage) },
          { path: 'billing', element: withSuspense(BillingPage) },
        ],
      },
    ],
  },

  // Protected Doctor Routes
  {
    path: '/doctor',
    element: <ProtectedRoute allowedRoles={['DOCTOR']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/doctor/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(DoctorHome) },
          { path: 'schedules', element: withSuspense(DoctorSchedulePage) },
          { path: 'queue', element: withSuspense(DoctorQueuePage) },
          { path: 'patients', element: withSuspense(DoctorPatientsPage) },
          { path: 'consultations', element: withSuspense(DoctorConsultationsPage) },
          { path: 'prescriptions', element: <Navigate to="/doctor/consultations" replace /> },
          { path: 'history', element: withSuspense(DoctorHistoryPage) },
        ],
      },
    ],
  },

  // Protected Patient Routes
  {
    path: '/patient',
    element: <ProtectedRoute allowedRoles={['PATIENT']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/patient/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(PatientHome) },
          { path: 'profile', element: withSuspense(PatientProfilePage) },
          { path: 'doctors', element: withSuspense(PatientDoctorsPage) },
          { path: 'book-appointment', element: withSuspense(PatientBookAppointmentPage) },
          { path: 'appointments', element: withSuspense(PatientAppointmentsPage) },
          { path: 'prescriptions', element: withSuspense(PatientPrescriptionsPage) },
          { path: 'medical-history', element: withSuspense(PatientMedicalHistoryPage) },
          { path: 'records', element: <Navigate to="/patient/medical-history" replace /> },
          { path: 'billing', element: withSuspense(PatientBillingPage) },
        ],
      },
    ],
  },

  // Catch-all 404
  {
    path: '*',
    element: withSuspense(NotFoundPage),
  },
]);
