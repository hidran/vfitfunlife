import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkDeleteJobBanner } from './BulkDeleteJobBanner';

describe('BulkDeleteJobBanner', () => {
  it('shows progress while running', () => {
    render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 36, deleted: 12, skipped: 0, failed: 1 }} onDismiss={vi.fn()} />);
    // Tests render in Italian, the source locale.
    expect(screen.getByText(/13\s*\/\s*36 · 12 eliminati, 0 saltati, 1 errori/)).toBeInTheDocument();
  });

  it('can be dismissed once finished, not before', () => {
    const { rerender } = render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 2, deleted: 1, skipped: 0, failed: 0 }} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<BulkDeleteJobBanner job={{ id: 'j', status: 'completed', total: 2, deleted: 2, skipped: 0, failed: 0 }} onDismiss={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
