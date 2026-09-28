import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders no trend line when no trend is provided', () => {
    const { container } = render(<StatCard title="Oggi" value={3} icon={Calendar} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%/);
  });

  it('renders a real trend value with its label when provided', () => {
    render(<StatCard title="Oggi" value={3} icon={Calendar} trend={4} trendLabel="vs ieri" />);
    expect(screen.getByText('+4%')).toBeInTheDocument();
    expect(screen.getByText('vs ieri')).toBeInTheDocument();
  });
});
