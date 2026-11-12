(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  try { paused = localStorage.getItem('dominion_motion') === 'off'; } catch {}
  const reduce = () => paused || media.matches;
  const applyMotion = () => {
    document.body.classList.toggle('motion-off', reduce());
    document.documentElement.style.scrollBehavior = reduce() ? 'auto' : '';
    $('motion-toggle').textContent = reduce() ? 'Motion off' : 'Motion on';
    $('motion-toggle').setAttribute('aria-pressed', String(reduce()));
    $('motion-toggle').disabled = media.matches;
    $('motion-toggle').title = media.matches ? 'Reduced motion is enabled on your device' : 'Toggle interface animation';
  };
  $('motion-toggle').addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('dominion_motion', paused ? 'off' : 'on'); } catch {}
    applyMotion();
  });
  media.addEventListener('change', applyMotion); applyMotion();
  const planNames = { A: 'Explosive power', B: 'Functional strength', C: 'Conditioning', D: 'Recovery & mobility' };
  function syncSession() {
    const day = $('day').value;
    document.querySelectorAll('[data-plan]').forEach(b => {
      b.classList.toggle('selected', b.dataset.plan === day);
      b.setAttribute('aria-pressed', String(b.dataset.plan === day));
    });
    const value = Math.min(100, Math.max(0, parseInt($('hero-percent').textContent, 10) || 0));
    $('session-arc').style.strokeDashoffset = String(100 - value);
    document.querySelector('.bar[role="progressbar"]').setAttribute('aria-valuenow', String(value));
    $('dial-plan').textContent = day + ' / ' + planNames[day].toUpperCase();
    $('dial-sets').textContent = $('progressCount').textContent + ' SETS';
    const status = $('sessionStatus').textContent;
    $('dial-state').textContent = status === 'Not started' ? 'READY TO BEGIN' : status.toUpperCase();
    $('hero-start').firstChild.textContent = status === 'Finished' ? 'Review your session ' : status === 'Not started' ? 'Enter your session ' : 'Return to your session ';
  }
  document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
    if ($('day').value !== b.dataset.plan) {
      $('day').value = b.dataset.plan;
      $('day').dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncSession();
  }));
  const sessionObserver = new MutationObserver(syncSession);
  ['hero-percent','sessionStatus','progressCount'].forEach(id => sessionObserver.observe($(id), { childList: true, characterData: true, subtree: true }));
  syncSession();
  function setFocus(focus) {
    document.body.classList.toggle('focus-mode', focus);
    $('focus-exit').hidden = !focus;
    $('focus-toggle').setAttribute('aria-pressed', String(focus));
    if (focus) { window.scrollTo({top:0,behavior:'instant'}); $('focus-exit').focus({preventScroll:true}); }
    else { $('focus-toggle').focus({preventScroll:true}); document.querySelector('.mode-strip')?.scrollIntoView({block:'center',behavior:reduce()?'instant':'smooth'}); }
  }
  $('focus-toggle').addEventListener('click', () => setFocus(!document.body.classList.contains('focus-mode')));
  $('focus-exit').addEventListener('click', () => setFocus(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]') && document.body.classList.contains('focus-mode')) setFocus(false);
  });
  $('next-exercise').addEventListener('click', () => {
    const list = [...document.querySelectorAll('.exercise')];
    const current = list.findIndex(b => b.classList.contains('on'));
    const next = Array.from({length:list.length},(_,i)=>list[(current+i+1)%list.length]).find(b => !b.classList.contains('complete'));
    if (next) { next.click(); $('sets')?.querySelector('button:not(.done)')?.focus({preventScroll:true}); }
    else { $('finish').focus({preventScroll:true}); }
  });
  let restBase = 90;
  function syncRest() {
    const parts = $('restClock').textContent.split(':').map(Number);
    const seconds = parts[0]*60+parts[1];
    if ($('restStatus').textContent !== 'RUNNING') restBase = Math.max(1, seconds);
    restBase = Math.max(restBase, seconds);
    $('rest-progress').style.transform = 'scaleX(' + Math.max(0, Math.min(1, seconds/restBase)) + ')';
    document.querySelectorAll('[data-rest-preset]').forEach(b => {
      const selected = Number(b.dataset.restPreset) === seconds && $('restStatus').textContent !== 'RUNNING';
      b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected));
    });
  }
  new MutationObserver(syncRest).observe($('restClock'), {childList:true,subtree:true,characterData:true}); syncRest();
  document.addEventListener('click', e => {
    if (e.target.closest('.set') && e.target.closest('.set').getAttribute('aria-pressed') !== 'true' && !$('begin').disabled) return;
    if (e.target.closest('.set') && !reduce()) {
      const card = document.querySelector('.exercise-card'); card.classList.remove('set-celebration');
      requestAnimationFrame(() => card.classList.add('set-celebration'));
    }
  });
  const visual = document.querySelector('.hero-visual');
  visual.addEventListener('pointermove', e => {
    if (reduce() || e.pointerType !== 'mouse') return;
    const r = visual.getBoundingClientRect();
    visual.style.setProperty('--tilt-x', ((e.clientX-r.left)/r.width-.5)*5+'deg');
    visual.style.setProperty('--tilt-y', -((e.clientY-r.top)/r.height-.5)*5+'deg');
  });
  visual.addEventListener('pointerleave', () => {visual.style.setProperty('--tilt-x','0deg');visual.style.setProperty('--tilt-y','0deg');});
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {entry.target.classList.add('visible');observer.unobserve(entry.target);}
    }), {threshold:.06});
    document.querySelectorAll('.execution-heading,.grappling-callout,.logbook-card,.history-card').forEach(el => {el.classList.add('reveal');observer.observe(el);});
    document.body.classList.add('experience-ready');
  }
})();
