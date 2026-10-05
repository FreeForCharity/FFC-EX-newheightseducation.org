/**
 * Marks the page as able to animate before first paint (#106), so the
 * themes' hidden pre-animation states apply only when ThemeMotion will
 * reveal them. Skipped under reduced motion; dropped after 3s if
 * ThemeMotion never reports ready, so content is never left hidden.
 */
export const MOTION_READY_JS =
  '(function(){var d=document.documentElement;if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.classList.add("ffc-motion");setTimeout(function(){if(!d.hasAttribute("data-ffc-motion-ready"))d.classList.remove("ffc-motion")},3000)})()'
