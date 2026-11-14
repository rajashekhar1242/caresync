import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/protected-route';
import { AuthContext } from '@/app/providers/auth.context';

const createMockAuthContext = (overrides = {}) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

describe('ProtectedRoute guard', () => {
  it('redirects to /login when user is not authenticated', () => {
    const mockContext = createMockAuthContext({ isAuthenticated: false, isLoading: false });

    render(
      <AuthContext.Provider value={mockContext}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route path="/login" element={<div>Login Page Screen</div>} />
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/admin/dashboard" element={<div>Admin Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Login Page Screen')).toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  it('redirects to /unauthorized when user role does not match allowedRoles', () => {
    const mockContext = createMockAuthContext({
      isAuthenticated: true,
      isLoading: false,
      role: 'PATIENT',
      user: {
        id: 'p-1',
        fullName: 'Patient Jane',
        email: 'jane@patient.com',
        role: 'PATIENT',
        active: true,
      },
    });

    render(
      <AuthContext.Provider value={mockContext}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route path="/unauthorized" element={<div>Access Denied Screen</div>} />
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/admin/dashboard" element={<div>Admin Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Access Denied Screen')).toBeInTheDocument();
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  it('renders child route when user is authenticated with correct role', () => {
    const mockContext = createMockAuthContext({
      isAuthenticated: true,
      isLoading: false,
      role: 'ADMIN',
      user: {
        id: 'a-1',
        fullName: 'Admin User',
        email: 'admin@caresync.com',
        role: 'ADMIN',
        active: true,
      },
    });

    render(
      <AuthContext.Provider value={mockContext}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes>
            <Route path="/unauthorized" element={<div>Access Denied Screen</div>} />
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/admin/dashboard" element={<div>Admin Dashboard Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Admin Dashboard Content')).toBeInTheDocument();
  });
});
