import { useEffect, useState } from 'react';

/** Current time in ms, refreshed every `intervalMs` (default 30 s), so countdowns and "already started" checks stay live. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
