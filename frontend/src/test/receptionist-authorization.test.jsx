import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/protected-route';
import { Sidebar } from '@/components/layout/sidebar';
import { ToastProvider } from '@/components/ui/toast';
import * as AuthContextModule from '@/app/providers/auth.context';

function TestReceptionistPage() {
  return <div data-testid="receptionist-content">Receptionist Front Desk Area</div>;
}

function TestAdminPage() {
  return <div data-testid="admin-content">Admin Area</div>;
}

function TestUnauthorizedPage() {
  return <div data-testid="unauthorized-content">Access Denied Page</div>;
}

function TestLoginPage() {
  return <div data-testid="login-content">Login Screen</div>;
}

function renderWithRole(role, isAuthenticated = true, initialEntry = '/receptionist/dashboard') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: isAuthenticated ? { id: 'test-user', fullName: 'Test User', role } : null,
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
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="dashboard" element={<TestAdminPage />} />
        </Route>
        <Route path="/receptionist" element={<ProtectedRoute allowedRoles={['RECEPTIONIST']} />}>
          <Route path="dashboard" element={<TestReceptionistPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Receptionist Route Protection & Role Authorization', () => {
  it('permits access to RECEPTIONIST role for receptionist routes', () => {
    renderWithRole('RECEPTIONIST');
    expect(screen.getByTestId('receptionist-content')).toBeInTheDocument();
    expect(screen.queryByTestId('unauthorized-content')).not.toBeInTheDocument();
  });

  it('denies access to PATIENT for receptionist routes and redirects to /unauthorized', () => {
    renderWithRole('PATIENT');
    expect(screen.queryByTestId('receptionist-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to DOCTOR for receptionist routes and redirects to /unauthorized', () => {
    renderWithRole('DOCTOR');
    expect(screen.queryByTestId('receptionist-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to ADMIN for receptionist routes and redirects to /unauthorized', () => {
    renderWithRole('ADMIN');
    expect(screen.queryByTestId('receptionist-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('permits ADMIN to access admin dashboard routes', () => {
    renderWithRole('ADMIN', true, '/admin/dashboard');
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    renderWithRole(null, false, '/receptionist/dashboard');
    expect(screen.queryByTestId('receptionist-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-content')).toBeInTheDocument();
  });

  it('renders all exact 8 receptionist sections in sidebar navigation for RECEPTIONIST role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'rec-1', fullName: 'Reception Staff', role: 'RECEPTIONIST' },
      role: 'RECEPTIONIST',
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

    // Assert exact 8 sections
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Register Patient')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByText('Book Appointment')).toBeInTheDocument();
    expect(screen.getByText('Check-in')).toBeInTheDocument();
    expect(screen.getByText('Queue Management')).toBeInTheDocument();
    expect(screen.getByText('Doctor Availability')).toBeInTheDocument();

    // Assert Admin-only sections are NOT rendered
    expect(screen.queryByText('Audit Activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Staff')).not.toBeInTheDocument();
  });
});
