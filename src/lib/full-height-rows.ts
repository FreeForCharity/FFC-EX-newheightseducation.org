/**
 * WPBakery's fullHeightRow: the first "full height" section that starts on
 * the first screen fills only what is left of it, 100vh less its offset
 * (#62). Desktop only: the live site also does this on phones, where it
 * pushes all text below the first screen, which tests/smoke/above-the-fold
 * guards against. Runs inline after the content so the height is set before
 * first paint.
 */
export const FULL_HEIGHT_ROWS_JS =
  '(function(){function fit(){var e=document.querySelector(".ffc-clone .vc_row-o-full-height");if(!e)return;e.style.minHeight="";if(window.innerWidth<=768)return;var h=window.innerHeight,t=e.getBoundingClientRect().top+window.scrollY;if(t<h)e.style.minHeight=(100-t/(h/100))+"vh"}fit();window.addEventListener("resize",fit)})()'
