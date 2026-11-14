import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogsPage } from '@/features/admin/audit-logs-page';
import * as AuditHookModule from '@/hooks/use-audit';

describe('AuditLogsPage Activity Ledger', () => {
  let queryClient;

  const sampleAuditLogs = [
    {
      id: 'audit-1',
      occurredAt: '2026-11-13T10:15:00Z',
      userId: 'usr-1',
      userName: 'Chief Administrator',
      userRole: 'ADMIN',
      action: 'PATIENT_READ',
      entityType: 'PATIENT',
      entityId: 'p-1',
      patientId: 'p-1',
      details: 'Accessed patient medical profile record',
      ipAddress: '127.0.0.1',
    },
    {
      id: 'audit-2',
      occurredAt: '2026-11-13T10:30:00Z',
      userId: 'usr-2',
      userName: 'Dr. Gregory House',
      userRole: 'DOCTOR',
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: 'usr-2',
      patientId: null,
      details: 'Successful user authentication',
      ipAddress: '192.168.1.100',
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    vi.spyOn(AuditHookModule, 'useAuditLogs').mockReturnValue({
      data: {
        content: sampleAuditLogs,
        page: 0,
        size: 15,
        totalElements: 2,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders audit ledger with timestamp, actor, action badges, and IP', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Security Audit Trail')).toBeInTheDocument();
    expect(screen.getByText('Chief Administrator')).toBeInTheDocument();
    expect(screen.getByText('PATIENT_READ')).toBeInTheDocument();
    expect(screen.getByText('Dr. Gregory House')).toBeInTheDocument();
    expect(screen.getByText('AUTH_LOGIN')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
  });

  it('opens audit detail inspection dialog upon clicking Inspect', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const inspectButtons = screen.getAllByRole('button', { name: /view audit entry/i });
    fireEvent.click(inspectButtons[0]);

    expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    expect(screen.getByText('Accessed patient medical profile record')).toBeInTheDocument();
  });
});
