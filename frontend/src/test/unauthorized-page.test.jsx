import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { UnauthorizedPage } from '@/features/auth/unauthorized-page';
import { AuthContext } from '@/app/providers/auth.context';

const createMockAuthContext = (overrides = {}) => ({
  user: {
    id: 'user-pat',
    fullName: 'Patient John',
    email: 'john@patient.com',
    role: 'PATIENT',
    active: true,
  },
  role: 'PATIENT',
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('UnauthorizedPage', () => {
  it('renders 403 access denied message and role indicator', () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <UnauthorizedPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('403 — Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Restricted Healthcare Area')).toBeInTheDocument();
    expect(screen.getByText('Patient John')).toBeInTheDocument();
    expect(screen.getByText('Patient')).toBeInTheDocument();
  });

  it('triggers logout when switch account is clicked', async () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <UnauthorizedPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    const switchBtn = screen.getByRole('button', { name: /switch account/i });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(mockAuth.logout).toHaveBeenCalledTimes(1);
    });
  });
});
