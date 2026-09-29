import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderReviewsPage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const ts = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
let mockReviews: unknown[] = [];
let mockLoading = false;
const useInstructorReviews = vi.fn((id: string | undefined) => {
  void id;
  return { data: mockReviews, isLoading: mockLoading };
});
vi.mock('@/hooks/useCommunity', () => ({
  useInstructorReviews: (id: string | undefined) => useInstructorReviews(id),
}));

describe('/providers/reviews?id=', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/providers/reviews/');
    mockReviews = [];
    mockLoading = false;
    useInstructorReviews.mockClear();
  });

  it('renders the stored reviews of the provider in the id query param', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    mockReviews = [
      {
        id: 'b-1', userName: 'Sofia M.', avatarUrl: null, rating: 5, text: 'Allenamento perfetto',
        tags: ['punctual', 'not-a-tag'], isVerified: true, createdAt: ts('2026-09-20T10:00:00Z'),
      },
      { id: 'b-2', userName: 'Luca R.', avatarUrl: null, rating: 3, text: 'Ok' },
    ];
    render(<ProviderReviewsPage />);
    expect(useInstructorReviews).toHaveBeenCalledWith('prov-42');
    expect(screen.getByText('prov-42')).toBeInTheDocument();
    expect(screen.getByText('Allenamento perfetto')).toBeInTheDocument();
    expect(screen.getByText('Luca R.')).toBeInTheDocument();
    // Average of 5 and 3.
    expect(screen.getByText('4.0')).toBeInTheDocument();
    // Known tag keys are translated; unknown ones are dropped.
    expect(screen.queryByText('not-a-tag')).not.toBeInTheDocument();
  });

  it('filters by star rating', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    mockReviews = [
      { id: 'b-1', userName: 'Sofia M.', avatarUrl: null, rating: 5, text: 'Top' },
      { id: 'b-2', userName: 'Luca R.', avatarUrl: null, rating: 3, text: 'Ok' },
    ];
    render(<ProviderReviewsPage />);
    const buttons = screen.getAllByRole('button');
    // [back, all, 5, 4, 3] — pick "5 stars".
    fireEvent.click(buttons[2]);
    expect(screen.getByText('Sofia M.')).toBeInTheDocument();
    expect(screen.queryByText('Luca R.')).not.toBeInTheDocument();
  });

  it('shows the empty state when the provider has no reviews', () => {
    mockSearchParams = new URLSearchParams('id=prov-42');
    render(<ProviderReviewsPage />);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows the not-found state when id is missing', () => {
    mockSearchParams = new URLSearchParams();
    render(<ProviderReviewsPage />);
    expect(screen.queryByText('prov-42')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
