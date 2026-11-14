import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/protected-route';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastProvider } from '@/components/ui/toast';
import * as AuthContextModule from '@/app/providers/auth.context';

function TestPatientPage() {
  return <div data-testid="patient-content">Patient Portal Protected Area</div>;
}

function TestUnauthorizedPage() {
  return <div data-testid="unauthorized-content">Access Denied Page</div>;
}

function TestLoginPage() {
  return <div data-testid="login-content">Login Screen</div>;
}

function renderWithRole(role, isAuthenticated = true, initialEntry = '/patient/dashboard') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: isAuthenticated ? { id: 'usr-1', patientId: 'pat-1', fullName: 'John Doe', role } : null,
    role: isAuthenticated ? role : null,
    isAuthenticated,
    isLoading: false,
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<TestLoginPage />} />
        <Route path="/unauthorized" element={<TestUnauthorizedPage />} />
        <Route path="/patient" element={<ProtectedRoute allowedRoles={['PATIENT']} />}>
          <Route path="dashboard" element={<TestPatientPage />} />
          <Route path="profile" element={<TestPatientPage />} />
          <Route path="doctors" element={<TestPatientPage />} />
          <Route path="book-appointment" element={<TestPatientPage />} />
          <Route path="appointments" element={<TestPatientPage />} />
          <Route path="prescriptions" element={<TestPatientPage />} />
          <Route path="medical-history" element={<TestPatientPage />} />
          <Route path="billing" element={<TestPatientPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Patient Route Protection & Role Authorization', () => {
  it('permits access to PATIENT role for patient routes', () => {
    renderWithRole('PATIENT');
    expect(screen.getByTestId('patient-content')).toBeInTheDocument();
    expect(screen.queryByTestId('unauthorized-content')).not.toBeInTheDocument();
  });

  it('denies access to ADMIN for patient routes and redirects to /unauthorized', () => {
    renderWithRole('ADMIN');
    expect(screen.queryByTestId('patient-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to RECEPTIONIST for patient routes and redirects to /unauthorized', () => {
    renderWithRole('RECEPTIONIST');
    expect(screen.queryByTestId('patient-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to DOCTOR for patient routes and redirects to /unauthorized', () => {
    renderWithRole('DOCTOR');
    expect(screen.queryByTestId('patient-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    renderWithRole(null, false, '/patient/dashboard');
    expect(screen.queryByTestId('patient-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-content')).toBeInTheDocument();
  });

  it('renders all 8 patient portal sections in sidebar navigation for PATIENT role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'usr-1', patientId: 'pat-1', fullName: 'John Doe', role: 'PATIENT' },
      role: 'PATIENT',
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <Sidebar isCollapsed={false} />
        </ToastProvider>
      </MemoryRouter>
    );

    // Assert patient navigation items
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.getByText('Find Doctors')).toBeInTheDocument();
    expect(screen.getByText('Book Appointment')).toBeInTheDocument();
    expect(screen.getByText('My Appointments')).toBeInTheDocument();
    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
    expect(screen.getByText('Medical History')).toBeInTheDocument();
    expect(screen.getByText('Billing & Invoices')).toBeInTheDocument();

    // Verify clinical/admin items are not visible
    expect(screen.queryByText('Staff Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
  });
});
