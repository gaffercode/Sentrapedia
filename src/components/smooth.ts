import { flushSync } from "react-dom";

// A short cross-fade for changes that remove or reflow content (dialogs closing, sidebar, panels),
// which CSS alone cannot fade out. Opacity only; reduced motion and older browsers apply the change at once.
// kind names a transition with its own timing in globals.css (:root[data-transition]); it is cleared when the fade ends.
export function smooth(update: () => void, kind?: "arrive") {
  if (typeof document.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  const root = document.documentElement;
  if (kind && root) root.dataset.transition = kind;
  const transition = document.startViewTransition(() => flushSync(update));
  if (kind && root) void transition?.finished?.finally(() => { if (root.dataset.transition === kind) delete root.dataset.transition; });
}
