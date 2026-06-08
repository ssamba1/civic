/**
 * Reference-counted body scroll lock shared by every overlay (sheets, drawers,
 * modals). A single module-level counter means any combination of open overlays
 * composes correctly: only the first lock captures the original
 * `document.body.style.overflow` and the last unlock restores it, so a closing
 * overlay never clobbers another's lock by restoring a stale "hidden".
 *
 * Call once per overlay (typically inside an open-gated effect) and invoke the
 * returned cleanup on unmount/close.
 *
 * SSR-safe: returns a no-op cleanup when there is no document.
 */
let lockCount = 0;
let prevOverflow = "";

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  return () => {
    lockCount -= 1;
    if (lockCount === 0) {
      document.body.style.overflow = prevOverflow;
    }
  };
}
