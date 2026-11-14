import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { RegisterPage } from '@/features/auth/register-page';
import { AuthContext } from '@/app/providers/auth.context';
import { ToastProvider } from '@/components/ui/toast';

const createMockAuthContext = (overrides = {}) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn().mockResolvedValue({
    id: 'pat-1',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    role: 'PATIENT',
    active: true,
  }),
  logout: vi.fn(),
  ...overrides,
});

describe('RegisterPage', () => {
  it('renders patient registration form with required fields', () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <ToastProvider>
          <BrowserRouter>
            <RegisterPage />
          </BrowserRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('jane.doe@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+15552345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create patient account/i })).toBeInTheDocument();
  });

  it('validates password minimum length requirement (8 chars)', async () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <ToastProvider>
          <BrowserRouter>
            <RegisterPage />
          </BrowserRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane.doe@example.com'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /create patient account/i }));

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });

    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it('submits valid patient registration data', async () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <ToastProvider>
          <BrowserRouter>
            <RegisterPage />
          </BrowserRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('jane.doe@example.com'), {
      target: { value: 'jane.doe@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+15552345678'), {
      target: { value: '+15551234567' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'SecurePass123' } });

    fireEvent.click(screen.getByRole('button', { name: /create patient account/i }));

    await waitFor(() => {
      expect(mockAuth.register).toHaveBeenCalledWith({
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+15551234567',
        password: 'SecurePass123',
      });
    });
  });
});
