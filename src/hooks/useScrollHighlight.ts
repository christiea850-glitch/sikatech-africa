import { useCallback, useEffect, useRef, useState } from "react";

type ScrollHighlightOptions = {
  durationMs?: number;
  block?: ScrollLogicalPosition;
};

export function useScrollHighlight<T extends HTMLElement = HTMLElement>({
  durationMs = 1000,
  block = "start",
}: ScrollHighlightOptions = {}) {
  const ref = useRef<T | null>(null);
  const [flash, setFlash] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const trigger = useCallback(() => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block,
    });

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    setFlash(true);
    timeoutRef.current = window.setTimeout(() => {
      setFlash(false);
      timeoutRef.current = null;
    }, durationMs);
  }, [block, durationMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { ref, flash, trigger };
}
