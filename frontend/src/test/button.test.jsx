import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button component', () => {
  it('renders standard button text correctly', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('handles click events when active', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading spinner and disables button when isLoading is true', () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Saving
      </Button>
    );
    const btn = screen.getByRole('button', { name: /saving/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies destructive styling variant', () => {
    render(<Button variant="destructive">Delete Record</Button>);
    const btn = screen.getByRole('button', { name: /delete record/i });
    expect(btn.className).toContain('bg-destructive');
  });
});
