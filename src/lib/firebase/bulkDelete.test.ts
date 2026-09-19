import { describe, it, expect, vi } from 'vitest';

vi.mock('./config', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { onSnapshot } from 'firebase/firestore';
import { toJobView, watchBulkDeleteJob } from './bulkDelete';

describe('toJobView', () => {
  it('zeros every count when results is missing', () => {
    expect(toJobView('j1', { status: 'queued', total: 12 })).toEqual({
      id: 'j1',
      status: 'queued',
      total: 12,
      deleted: 0,
      skipped: 0,
      failed: 0,
      error: undefined,
    });
  });

  it('defaults total to 0 when missing', () => {
    expect(toJobView('j1', { status: 'running', results: {} }).total).toBe(0);
  });

  it('counts deleted/skipped/failed from results', () => {
    const data = {
      status: 'running',
      total: 5,
      results: {
        u1: { status: 'deleted' },
        u2: { status: 'deleted' },
        u3: { status: 'skipped', reason: 'self' },
        u4: { status: 'failed', error: 'boom' },
        u5: { status: 'failed', error: 'boom2' },
      },
    };

    expect(toJobView('j2', data)).toEqual({
      id: 'j2',
      status: 'running',
      total: 5,
      deleted: 2,
      skipped: 1,
      failed: 2,
      error: undefined,
    });
  });

  it('carries the terminal job-level error through for a failed job', () => {
    const view = toJobView('j3', { status: 'failed', total: 3, error: 'internal: boom' });
    expect(view.status).toBe('failed');
    expect(view.error).toBe('internal: boom');
  });

  it('ignores a non-string error field rather than surfacing something unreadable', () => {
    const view = toJobView('j4', { status: 'running', error: { message: 'nope' } });
    expect(view.error).toBeUndefined();
  });
});

describe('watchBulkDeleteJob', () => {
  it('passes onError through to onSnapshot, so a listener failure never looks like the job stopped', () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    vi.mocked(onSnapshot).mockReturnValue(vi.fn());

    watchBulkDeleteJob('job1', onChange, onError);

    expect(onSnapshot).toHaveBeenCalledWith(undefined, expect.any(Function), onError);
  });
});
