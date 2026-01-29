import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HomePage from './page';
import { SectionProvider } from '@/contexts/SectionContext';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('HomePage', () => {
  it('renders the SectionSwitcher', () => {
    render(
      <SectionProvider>
        <HomePage />
      </SectionProvider>
    );
    expect(screen.getByText('FIT')).toBeInTheDocument();
    expect(screen.getByText('FUN')).toBeInTheDocument();
    expect(screen.getByText('LIFE')).toBeInTheDocument();
  });

  it('changes section when a button is clicked', () => {
    render(
      <SectionProvider>
        <HomePage />
      </SectionProvider>
    );

    const funButton = screen.getByText('FUN');
    fireEvent.click(funButton);

    // Check if the content for the 'fun' section is rendered
    expect(screen.getByText('Entertainment & Events')).toBeInTheDocument();
  });
});
