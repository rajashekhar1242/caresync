import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import * as AuthContextModule from '@/app/providers/auth.context';
import * as ToastHookModule from '@/hooks/use-toast';

describe('Admin Layout & Navigation', () => {
  const mockAdminUser = {
    id: 'admin-uuid-1',
    fullName: 'Chief Administrator',
    email: 'admin@caresync.com',
    role: 'ADMIN',
  };

  const mockLogout = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.spyOn(ToastHookModule, 'useToast').mockReturnValue({ toast: mockToast });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      role: 'ADMIN',
      isAuthenticated: true,
      logout: mockLogout,
    });
  });

  it('renders all 10 administrative sections in the sidebar for ADMIN role', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Sidebar isCollapsed={false} />
      </MemoryRouter>
    );

    // Exact 10 sections per Phase 20 requirements
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /departments/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /doctors/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /staff/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /appointments/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /patients/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /billing & revenue/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /audit activity/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('displays authenticated administrator profile in sidebar footer', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Sidebar isCollapsed={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Chief Administrator')).toBeInTheDocument();
    expect(screen.getByText('admin@caresync.com')).toBeInTheDocument();
  });

  it('triggers logout when Sign out button is clicked in sidebar', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Sidebar isCollapsed={false} />
      </MemoryRouter>
    );

    const logoutButton = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(logoutButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('renders header with administrator details and live indicator', () => {
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Header onMenuClick={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText(/caresync live/i)).toBeInTheDocument();
    expect(screen.getByText('Chief Administrator')).toBeInTheDocument();
  });

  it('calls onToggleCollapse when collapse button is clicked', () => {
    const handleToggle = vi.fn();
    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Sidebar isCollapsed={false} onToggleCollapse={handleToggle} />
      </MemoryRouter>
    );

    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
