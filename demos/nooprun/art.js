(() => {
  'use strict';
  const poses = ['bed-phone','bed-side','bed-prone','bed-stretch','bed-blanket','sofa-phone','rest-editorial'];
  const key = 'nooprun.art.v1', motion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true, index = 0, epoch = 0, timer, changes = 0;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch {}
  const src = i => `assets/illustrations/${poses[i]}.png`;
  const markup = (classes = '') => `<span class="pose-stage ${classes}" data-pose-stage aria-hidden="true"><img class="pose-current" src="${src(index)}" alt="" width="1536" height="1024" decoding="async"></span>`;
  function schedule() {
    clearTimeout(timer);
    if (enabled && !motion.matches && !document.hidden && document.querySelector('[data-pose-stage]')) timer = setTimeout(next, 6000);
  }
  async function next() {
    const token = epoch, nextIndex = (index + 1) % poses.length, img = new Image();
    img.src = src(nextIndex); img.alt = ''; img.width = 1536; img.height = 1024;
    try { await img.decode(); } catch { schedule(); return; }
    if (token !== epoch || !enabled || motion.matches || document.hidden) return;
    index = nextIndex; changes++;
    for (const stage of document.querySelectorAll('[data-pose-stage]')) {
      stage.querySelectorAll('.pose-outgoing').forEach(el => el.remove());
      const old = stage.querySelector('img');
      if (old) old.className = 'pose-outgoing';
      const fresh = img.cloneNode(); fresh.className = 'pose-current pose-enter'; stage.append(fresh);
      requestAnimationFrame(() => { fresh.classList.remove('pose-enter'); old?.classList.add('pose-leave'); });
      setTimeout(() => old?.remove(), 400);
    }
    schedule();
  }
  function mount() { epoch++; schedule(); }
  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
    mount(); return enabled;
  }
  document.addEventListener('visibilitychange', mount);
  motion.addEventListener('change', mount);
  window.addEventListener('pagehide', () => { epoch++; clearTimeout(timer); });
  window.NooprunArt = Object.freeze({markup,mount,toggle,state:()=>({enabled,index,current:poses[index],count:poses.length,changes,reducedMotion:motion.matches})});
})();
