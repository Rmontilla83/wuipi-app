import { useEffect, useRef, useCallback } from "react";

/**
 * Polling hook that pauses when the tab is hidden and resumes when visible.
 * Fires the callback immediately when the tab becomes visible again.
 */
export function useVisibilityPolling(
  callback: () => void,
  intervalMs: number,
) {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => savedCallback.current(), intervalMs);
  }, [intervalMs]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    start();

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        savedCallback.current(); // fetch fresh data immediately
        start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, stop]);
}
