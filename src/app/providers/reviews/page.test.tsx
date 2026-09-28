import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderReviewsPage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

describe('/providers/reviews?id=', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/providers/reviews/');
  });

  it('renders reviews for the id query param', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    render(<ProviderReviewsPage />);
    expect(screen.getByText('prov-42')).toBeInTheDocument();
  });

  it('shows the not-found state when id is missing', () => {
    mockSearchParams = new URLSearchParams();
    render(<ProviderReviewsPage />);
    expect(screen.queryByText('prov-42')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
