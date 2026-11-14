import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input component', () => {
  it('renders input with placeholder and accepts user value', () => {
    render(<Input placeholder="Enter your email" />);
    const input = screen.getByPlaceholderText('Enter your email');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'patient@caresync.com' } });
    expect(input.value).toBe('patient@caresync.com');
  });

  it('renders error message and marks aria-invalid as true', () => {
    render(<Input error="Invalid medical license number" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Invalid medical license number')).toBeInTheDocument();
  });

  it('renders helper text when no error is present', () => {
    render(<Input helperText="Standard 10-digit mobile number" />);
    expect(screen.getByText('Standard 10-digit mobile number')).toBeInTheDocument();
  });
});
