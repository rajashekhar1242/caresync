import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '@/features/auth/login-page';
import { AuthContext } from '@/app/providers/auth.context';

const createMockAuthContext = (overrides = {}) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn().mockResolvedValue(undefined),
  register: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

describe('LoginPage', () => {
  it('renders login form with email, password fields and sign-in button', () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByPlaceholderText('doctor@caresync.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to caresync/i })).toBeInTheDocument();
  });

  it('displays validation errors when submitting empty form', async () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    const submitBtn = screen.getByRole('button', { name: /sign in to caresync/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('toggles password visibility when toggle button is clicked', () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByLabelText(/show password/i);
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe('text');

    const hideBtn = screen.getByLabelText(/hide password/i);
    fireEvent.click(hideBtn);

    expect(passwordInput.type).toBe('password');
  });

  it('submits valid credentials to auth service', async () => {
    const mockAuth = createMockAuthContext();

    render(
      <AuthContext.Provider value={mockAuth}>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );

    const emailInput = screen.getByPlaceholderText('doctor@caresync.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitBtn = screen.getByRole('button', { name: /sign in to caresync/i });

    fireEvent.change(emailInput, { target: { value: 'doctor@caresync.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Doctor@123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAuth.login).toHaveBeenCalledWith({
        email: 'doctor@caresync.com',
        password: 'Doctor@123',
      });
    });
  });
});
