export function handleOpenFocusedView<T>(
  setFocusedView: (view: T) => void,
  view: T
) {
  setFocusedView(view);
  window.setTimeout(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 0);
}

export function restoreFocusedViewScroll(scrollY: number) {
  window.setTimeout(() => {
    window.scrollTo({ top: Math.max(0, scrollY), behavior: "smooth" });
  }, 0);
}
