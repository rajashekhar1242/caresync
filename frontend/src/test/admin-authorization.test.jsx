import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/protected-route';
import * as AuthContextModule from '@/app/providers/auth.context';

function TestAdminPage() {
  return <div data-testid="admin-content">Admin Restricted Area</div>;
}

function TestUnauthorizedPage() {
  return <div data-testid="unauthorized-content">Access Denied Page</div>;
}

function TestLoginPage() {
  return <div data-testid="login-content">Login Screen</div>;
}

function renderWithRole(role, isAuthenticated = true, initialEntry = '/admin/dashboard') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: isAuthenticated ? { id: 'test-user', fullName: 'Test User', role } : null,
    role: isAuthenticated ? role : null,
    isAuthenticated,
    isLoading: false,
  });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<TestLoginPage />} />
        <Route path="/unauthorized" element={<TestUnauthorizedPage />} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="dashboard" element={<TestAdminPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Admin Route Protection & Authorization', () => {
  it('permits access to ADMIN role', () => {
    renderWithRole('ADMIN');
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    expect(screen.queryByTestId('unauthorized-content')).not.toBeInTheDocument();
  });

  it('denies access to DOCTOR and redirects to /unauthorized', () => {
    renderWithRole('DOCTOR');
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to RECEPTIONIST and redirects to /unauthorized', () => {
    renderWithRole('RECEPTIONIST');
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('denies access to PATIENT and redirects to /unauthorized', () => {
    renderWithRole('PATIENT');
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    renderWithRole(null, false);
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-content')).toBeInTheDocument();
  });
});
