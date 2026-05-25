import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNearMe } from './useNearMe';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useNearMe', () => {
  it('defaults to no location and radius 25', () => {
    const { result } = renderHook(() => useNearMe());
    expect(result.current.userLocation).toBeNull();
    expect(result.current.radiusKm).toBe(25);
  });
  it('sets userLocation on geolocation success', async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 45.46, longitude: 9.19 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.userLocation).toEqual({ lat: 45.46, lng: 9.19 }));
    expect(result.current.error).toBeNull();
  });
  it('sets error on geolocation failure', async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err({ message: 'denied' }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.userLocation).toBeNull();
  });
  it('clearLocation resets userLocation', async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 1, longitude: 2 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useNearMe());
    act(() => result.current.requestLocation());
    await waitFor(() => expect(result.current.userLocation).not.toBeNull());
    act(() => result.current.clearLocation());
    expect(result.current.userLocation).toBeNull();
  });
});
