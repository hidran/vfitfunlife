import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkDeleteJobBanner } from './BulkDeleteJobBanner';

describe('BulkDeleteJobBanner', () => {
  it('shows progress while running', () => {
    render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 36, deleted: 12, skipped: 0, failed: 1 }} onDismiss={vi.fn()} />);
    // Tests render in Italian, the source locale.
    expect(screen.getByText(/13\s*\/\s*36 · 12 eliminati, 0 saltati, 1 errori/)).toBeInTheDocument();
  });

  it('can always be dismissed — the job keeps running server-side regardless', () => {
    const onDismiss = vi.fn();
    render(<BulkDeleteJobBanner job={{ id: 'j', status: 'running', total: 2, deleted: 1, skipped: 0, failed: 0 }} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the finished heading when completed with errors, and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <BulkDeleteJobBanner
        job={{ id: 'j', status: 'completed_with_errors', total: 3, deleted: 2, skipped: 0, failed: 1 }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Eliminazione completata')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the failed heading and the job error when the job stops entirely, and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <BulkDeleteJobBanner
        job={{ id: 'j', status: 'failed', total: 5, deleted: 1, skipped: 0, failed: 1, error: 'internal: boom' }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Eliminazione interrotta')).toBeInTheDocument();
    expect(screen.getByText('internal: boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
