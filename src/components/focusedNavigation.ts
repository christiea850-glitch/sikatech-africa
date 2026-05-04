// src/components/focusedNavigation.ts

let lastScrollY = 0;

export function handleOpenFocusedView<T>(
  setFocusedView: (view: T) => void,
  view: T
) {
  // Save current scroll position
  lastScrollY = window.scrollY;

  // Open view
  setFocusedView(view);

  // Force scroll to top (clean, no delay hack)
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export function handleCloseFocusedView<T>(
  setFocusedView: (view: T | null) => void
) {
  // Close view
  setFocusedView(null);

  // Restore previous scroll
  requestAnimationFrame(() => {
    window.scrollTo({
      top: lastScrollY,
      behavior: "smooth",
    });
  });
}

export function restoreFocusedViewScroll(scrollY: number) {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: Math.max(0, scrollY),
      behavior: "smooth",
    });
  });
}
