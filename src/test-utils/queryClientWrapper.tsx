import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A fresh, retry-free `QueryClient` + wrapper for `renderHook`/`render` in tests (P2-7).
 *
 * Each call returns its own `QueryClient` so tests don't leak cache entries into each other.
 * `retry: false` keeps failing-query tests fast and deterministic instead of waiting out
 * TanStack Query's default backoff.
 */
export function makeQueryClientWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function QueryClientWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, wrapper: QueryClientWrapper };
}
