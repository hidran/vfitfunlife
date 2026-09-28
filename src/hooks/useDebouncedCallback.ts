"use client";

import { useCallback, useEffect, useRef } from "react";

/** The admin lists' search delay: long enough to skip mid-word keystrokes, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * A debounced `fn`: calls it with the latest arguments once calls have stopped for `delayMs`.
 * `cancel` drops a pending call (e.g. when the input is cleared and applied at once). A
 * pending call is dropped on unmount. Used by the admin lists so a search box refetches
 * once per pause in typing rather than once per keystroke.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number = SEARCH_DEBOUNCE_MS
): { run: (...args: A) => void; cancel: () => void } {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const run = useCallback(
    (...args: A) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs]
  );

  useEffect(() => cancel, [cancel]);

  return { run, cancel };
}
