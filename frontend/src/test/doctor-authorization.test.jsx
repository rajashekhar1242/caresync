import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/protected-route';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastProvider } from '@/components/ui/toast';
import * as AuthContextModule from '@/app/providers/auth.context';

function TestDoctorPage() {
  return <div data-testid="doctor-content">Doctor Clinical Console Area</div>;
}

function TestUnauthorizedPage() {
  return <div data-testid="unauthorized-content">Access Denied Page</div>;
}

function TestLoginPage() {
  return <div data-testid="login-content">Login Screen</div>;
}

function renderWithRole(role, isAuthenticated = true, initialEntry = '/doctor/dashboard') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: isAuthenticated ? { id: 'doc-user-1', doctorId: 'doc-1', fullName: 'Dr. House', role } : null,
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
        <Route path="/doctor" element={<ProtectedRoute allowedRoles={['DOCTOR']} />}>
          <Route path="dashboard" element={<TestDoctorPage />} />
          <Route path="schedules" element={<TestDoctorPage />} />
          <Route path="queue" element={<TestDoctorPage />} />
          <Route path="patients" element={<TestDoctorPage />} />
          <Route path="consultations" element={<TestDoctorPage />} />
          <Route path="history" element={<TestDoctorPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Doctor Route Protection & Role Authorization', () => {
  it('permits access to DOCTOR role for doctor routes', () => {
    renderWithRole('DOCTOR');
    expect(screen.getByTestId('doctor-content')).toBeInTheDocument();
    expect(screen.queryByTestId('unauthorized-content')).not.toBeInTheDocument();
  });

  it('denies access to RECEPTIONIST for doctor routes and redirects to /unauthorized', () => {
    renderWithRole('RECEPTIONIST');
    expect(screen.queryByTestId('doctor-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to ADMIN for doctor routes and redirects to /unauthorized', () => {
    renderWithRole('ADMIN');
    expect(screen.queryByTestId('doctor-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to PATIENT for doctor routes and redirects to /unauthorized', () => {
    renderWithRole('PATIENT');
    expect(screen.queryByTestId('doctor-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    renderWithRole(null, false, '/doctor/dashboard');
    expect(screen.queryByTestId('doctor-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-content')).toBeInTheDocument();
  });

  it('renders all doctor clinical sections in sidebar navigation for DOCTOR role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'doc-user-1', doctorId: 'doc-1', fullName: 'Dr. House', role: 'DOCTOR' },
      role: 'DOCTOR',
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

    // Assert doctor navigation items
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('My Schedule')).toBeInTheDocument();
    expect(screen.getByText('Patient Queue')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Consultations')).toBeInTheDocument();
    expect(screen.getByText('Consultation History')).toBeInTheDocument();

    // Assert receptionist/admin only items are NOT present
    expect(screen.queryByText('Register Patient')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Departments')).not.toBeInTheDocument();
  });
});
