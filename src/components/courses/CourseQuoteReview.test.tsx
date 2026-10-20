import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseQuoteReview, type QuoteReviewProps } from './CourseQuoteReview';
import type { Course, CourseSession } from '@/types/course';

vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string, values?: Record<string, unknown>) => values ? `${k}:${JSON.stringify(values)}` : k, locale: 'en' }),
}));

const stamp = (date: string) => ({ toDate: () => new Date(date), toMillis: () => new Date(date).getTime() }) as unknown as CourseSession['startsAt'];
const props = (over: Partial<QuoteReviewProps> = {}): QuoteReviewProps => ({
  course: { cancellationHours: 24, timezone: 'Europe/Rome' } as Course, scope: 'lesson',
  lessons: [{ id: 's1', startsAt: stamp('2099-10-12T18:00Z') } as CourseSession],
  quote: { regularCents: 1000, discountPercent: 30, gymPercent: 20, instructorPercent: 10, discountCents: 300, finalCents: 700, stripeEligible: true },
  payment: 'direct', busy: false, onConfirm: vi.fn(), onCancel: vi.fn(), ...over });

describe('CourseQuoteReview', () => {
  it('lists regular price, both benefit lines, the discount and the final price', () => {
    render(<CourseQuoteReview {...props()} />);
    expect(screen.getByTestId('review-regular')).toHaveTextContent('€10.00');
    expect(screen.getByText('courses.partnerBenefit:{"percent":20}')).toBeInTheDocument();
    expect(screen.getByText('courses.instructorBenefit:{"percent":10}')).toBeInTheDocument();
    expect(screen.getByTestId('review-discount')).toHaveTextContent('−€3.00');
    expect(screen.getByTestId('review-final')).toHaveTextContent('€7.00');
    expect(screen.getByText('courses.terms:{"hours":24}')).toBeInTheDocument();
  });

  it('has no discount rows without a discount, and no payment line for a free booking', () => {
    render(<CourseQuoteReview {...props({ quote: { regularCents: 0, discountPercent: 10, gymPercent: 10, instructorPercent: 0, discountCents: 0, finalCents: 0, stripeEligible: false } })} />);
    expect(screen.queryByTestId('review-discount')).not.toBeInTheDocument();
    expect(screen.queryByText(/courses.partnerBenefit/)).not.toBeInTheDocument();
    expect(screen.getByTestId('review-final')).toHaveTextContent('courses.free');
    expect(screen.queryByText('courses.direct')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('announces the notice and the error, and wires confirm and cancel', () => {
    const p = props({ notice: 'price', error: 'boom' });
    render(<CourseQuoteReview {...p} />);
    expect(screen.getByText('courses.priceChanged')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('boom')).toHaveAttribute('role', 'alert');
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(p.onConfirm).toHaveBeenCalled();
    expect(p.onCancel).toHaveBeenCalled();
  });
});
