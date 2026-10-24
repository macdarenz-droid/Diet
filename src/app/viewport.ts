// Keyboard handling for home-screen apps.
// - --kb: the height the on-screen keyboard covers. iOS Safari does not shrink the layout viewport for
//   the keyboard, so sheets lift by this much to keep their buttons visible.
// - data-typing: set while a text field outside a sheet has focus, so the tab bar does not sit on top
//   of the field above an Android keyboard.
export function initViewport(): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (vv) {
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }
  const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.matches('input:not([type=range]):not([type=file]), textarea, select');
  document.addEventListener('focusin', e => { if (isField(e.target) && !(e.target as HTMLElement).closest('.sheet')) root.dataset.typing = ''; });
  document.addEventListener('focusout', e => { if (isField(e.target)) delete root.dataset.typing; });
}
