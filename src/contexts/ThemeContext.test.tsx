import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create<{ user: Record<string, unknown> | null }>(() => ({ user: null })),
  };
});

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

import { updateDoc } from 'firebase/firestore';
import { useAuthStore } from '@/stores/authStore';
import { ThemeProvider, useTheme } from './ThemeContext';

type TestUser = { id: string; uid: string; theme?: string };
const store = useAuthStore as unknown as {
  setState: (s: unknown) => void;
  getState: () => { user: TestUser | null };
};
const setUser = (user: TestUser | null) => act(() => store.setState({ user }));

let prefersLight = false;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  prefersLight = false;
  store.setState({ user: null });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('light') ? prefersLight : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeProvider', () => {
  it("persists 'system' to the profile so it sticks", async () => {
    store.setState({ user: { id: 'u1', uid: 'u1', theme: 'light' } });
    const { result } = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.preference).toBe('light'));

    act(() => result.current.setTheme('system'));

    expect(updateDoc).toHaveBeenCalledWith({ col: 'users', id: 'u1' }, { theme: 'system' });
    await waitFor(() => expect(store.getState().user?.theme).toBe('system'));
    expect(result.current.preference).toBe('system');
  });

  it("adopts a remote 'system' preference (resolving to the OS theme)", async () => {
    prefersLight = true;
    window.localStorage.setItem('vfit.theme', 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.preference).toBe('dark'));

    setUser({ id: 'u1', uid: 'u1', theme: 'system' });

    await waitFor(() => expect(result.current.preference).toBe('system'));
    expect(result.current.theme).toBe('light');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('logged out: marks the pick as explicit and does not write anywhere remote', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setTheme('light'));
    expect(updateDoc).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem('vfit.theme.explicit') ?? '{}')).toMatchObject({
      value: 'light',
    });
  });

  it('an explicit pre-login pick wins at login and is written to the profile', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setTheme('light'));

    setUser({ id: 'u1', uid: 'u1', theme: 'dark' });

    expect(updateDoc).toHaveBeenCalledWith({ col: 'users', id: 'u1' }, { theme: 'light' });
    await waitFor(() => expect(store.getState().user?.theme).toBe('light'));
    expect(result.current.preference).toBe('light');
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem('vfit.theme.explicit')).toBeNull();
  });

  it('without an explicit pick, the profile theme wins at login', async () => {
    window.localStorage.setItem('vfit.theme', 'light');
    const { result } = renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(result.current.preference).toBe('light'));

    setUser({ id: 'u1', uid: 'u1', theme: 'dark' });

    await waitFor(() => expect(result.current.preference).toBe('dark'));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('memoizes the context value across unrelated re-renders', () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useTheme());
      return null;
    }
    const { rerender } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    const before = seen.length;
    rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(seen.length).toBeGreaterThan(before);
    expect(seen[seen.length - 1]).toBe(seen[seen.length - 2]);
  });
});
