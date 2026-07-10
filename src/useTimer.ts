import { useCallback, useEffect, useRef, useState } from "react";

export function useTimer() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      setElapsedMs(performance.now() - startedAtRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const start = useCallback(() => {
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning((wasRunning) => {
      if (wasRunning) {
        setElapsedMs(performance.now() - startedAtRef.current);
      }
      return false;
    });
  }, []);

  // Same freeze as stop(), but paired with resume() (which continues from
  // the frozen elapsed time) rather than a later start() resetting to 0 —
  // for briefly holding the clock during something like a solver preview
  // mid-attempt.
  const pause = stop;

  const resume = useCallback(() => {
    setElapsedMs((currentElapsed) => {
      startedAtRef.current = performance.now() - currentElapsed;
      return currentElapsed;
    });
    setRunning(true);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setElapsedMs(0);
  }, []);

  return { elapsedMs, running, start, stop, pause, resume, reset };
}

export function formatTime(ms: number): string {
  const totalCentiseconds = Math.floor(ms / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  const mm = minutes > 0 ? `${minutes}:` : "";
  const ss = minutes > 0 ? String(seconds).padStart(2, "0") : String(seconds);
  return `${mm}${ss}.${String(centiseconds).padStart(2, "0")}`;
}
