/* ==========================================================
   TIKY — interactions (loader, scroll, cursor, sound…)
   ========================================================== */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hover = matchMedia('(hover: hover)').matches;

  gsap.registerPlugin(ScrollTrigger);

  // ---------- Smooth scroll ----------
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const target = id.length > 1 ? $(id) : null;
    if (!target && id !== '#top') return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { duration: 1.6 });
    else (target || document.body).scrollIntoView({ behavior: 'smooth' });
  }));

  // ---------- Sound (generated ambient drone, no audio files) ----------
  const Sound = {
    ctx: null, master: null, on: false,
    start() {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const ctx = this.ctx = new C();
      const master = this.master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 5;
      filter.connect(master);
      [[55, 'sawtooth', .16], [55.35, 'sawtooth', .16], [82.4, 'sine', .22], [110.2, 'triangle', .1], [164.8, 'sine', .05]]
        .forEach(([f, type, g]) => {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
          const gn = ctx.createGain(); gn.gain.value = g;
          o.connect(gn); gn.connect(filter); o.start();
        });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
      const lg = ctx.createGain(); lg.gain.value = 240;
      lfo.connect(lg); lg.connect(filter.frequency); lfo.start();
      this.set(true);
    },
    set(on) {
      if (!this.ctx) { if (on) this.start(); return; }
      this.on = on;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(on ? 0.085 : 0, t + (on ? 2.5 : 0.6));
      $('#sound-toggle').classList.toggle('is-on', on);
    },
    blip(freq = 660) {
      if (!this.on) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.25);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 1);
    },
  };
  $('#sound-toggle').addEventListener('click', () => Sound.set(!Sound.on));

  // ---------- Text splitting ----------
  function splitWords(el) {
    const html = el.innerHTML.split(/(<[^>]+>)/g).map(part => {
      if (part.startsWith('<')) return part;
      return part.replace(/([^\s]+)/g, '<span class="w"><span class="wi">$1</span></span>');
    }).join('');
    el.innerHTML = html;
    return $$('.wi', el);
  }

  // ---------- Loader ----------
  const pctEl = $('#loader-pct');
  const statusEl = $('#loader-status');
  const statuses = ['Initialisation du coffre…', 'Chiffrement AES-256…', 'Indexation de vos biens…', 'Calcul du patrimoine…', 'Prêt.'];
  const load = { v: 0 };
  const setPct = () => {
    pctEl.textContent = Math.round(load.v);
    statusEl.textContent = statuses[Math.min(statuses.length - 1, Math.floor(load.v / 25))];
  };
  gsap.to(load, { v: 82, duration: 2.2, ease: 'power2.out', onUpdate: setPct });

  const pageLoaded = new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r));
  const minTime = new Promise(r => setTimeout(r, 2000));
  Promise.all([document.fonts.ready, pageLoaded, minTime]).then(() => {
    try { TikyParticles.init($('#gl')); } catch (e) { console.warn('WebGL indisponible', e); }
    gsap.to(load, {
      v: 100, duration: 0.7, ease: 'power3.inOut', onUpdate: setPct,
      onComplete: () => {
        gsap.to('.loader__center', { y: -40, duration: 1, ease: 'power3.out' });
        gsap.to('#loader-enter', { autoAlpha: 1, y: -10, duration: 1, ease: 'power3.out' });
      },
    });
  });

  let entered = false;
  function enter(withSound) {
    if (entered) return;
    entered = true;
    if (withSound) Sound.start();
    const tl = gsap.timeline();
    tl.to('#loader-enter, .loader__corner', { autoAlpha: 0, duration: 0.4 })
      .to('.loader__center', { scale: 0.6, autoAlpha: 0, duration: 0.8, ease: 'power3.in' }, '<')
      .to('#loader', { clipPath: 'circle(0% at 50% 50%)', duration: 1.3, ease: 'expo.inOut' }, '-=0.3')
      .add(() => {
        $('#loader').remove();
        document.body.classList.remove('is-loading');
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
      })
      .add(heroIntro, '-=1.1');
    gsap.set('#loader', { clipPath: 'circle(75% at 50% 50%)' });
    TikyParticles.morph('logo', { duration: 3.2 });
    Sound.blip(440);
  }
  $('#enter-sound').addEventListener('click', () => enter(true));
  $('#enter-silent').addEventListener('click', () => enter(false));

  // ---------- Hero intro ----------
  gsap.set('.hero__title .line > span', { yPercent: 110 });
  gsap.set('.hero__meta, .hero__lead, .hero__ctas > *, .hero__scroll, .nav', { autoAlpha: 0 });
  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to('.hero__title .line > span', { yPercent: 0, duration: 1.6, stagger: 0.12 })
      .to('.nav', { autoAlpha: 1, duration: 1 }, 0.4)
      .fromTo('.hero__meta', { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 1 }, 0.5)
      .fromTo('.hero__lead', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 0.7)
      .fromTo('.hero__ctas > *', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.1 }, 0.85)
      .to('.hero__scroll', { autoAlpha: 1, duration: 1 }, 1.2);
  }

  // ---------- Section → particle morph ----------
  // The active section is the last one whose top has crossed mid-screen.
  // Computed from live rects so pins and anchor jumps never desync it.
  const morphSecs = $$('[data-morph]');
  let activeSec = morphSecs[0];
  function syncMorph() {
    if (!entered) return;
    const mid = innerHeight * 0.5;
    let sec = morphSecs[0];
    for (const s of morphSecs) if (s.getBoundingClientRect().top <= mid) sec = s;
    if (sec === activeSec) return;
    activeSec = sec;
    if (TikyParticles.current !== sec.dataset.morph) Sound.blip(520 + Math.random() * 240);
    TikyParticles.morph(sec.dataset.morph);
    TikyParticles.setOpacity(parseFloat(sec.dataset.dim || 1));
  }

  // Hero title drifts away on scroll
  gsap.to('.hero__title', {
    yPercent: -30, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  // ---------- Nav state ----------
  let lastY = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: self => {
      const y = self.scroll();
      $('#nav').classList.toggle('is-scrolled', y > 40);
      $('#nav').classList.toggle('is-hidden', y > lastY && y > 400);
      lastY = y;
      syncMorph();
    },
  });

  // ---------- Manifesto: words light up on scroll ----------
  const mWords = splitWords($('[data-scrub-words]')).map(w => w.parentElement);
  gsap.to(mWords, {
    opacity: 1, stagger: 0.5, ease: 'none',
    scrollTrigger: { trigger: '.manifesto', start: 'top 60%', end: 'bottom 85%', scrub: true },
  });

  // ---------- Generic heading reveals ----------
  $$('.reveal').forEach(el => {
    const words = splitWords(el);
    gsap.from(words, {
      yPercent: 115, rotate: 4, duration: 1.2, ease: 'expo.out', stagger: 0.04,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
  gsap.utils.toArray('.join__title .line > span').forEach((s, i) => {
    gsap.from(s, { yPercent: 110, duration: 1.4, delay: i * 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.join__title', start: 'top 80%' } });
  });

  // ---------- Counters ----------
  const fmt = n => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
  $$('[data-count]').forEach(el => {
    const o = { v: 0 };
    gsap.to(o, {
      v: +el.dataset.count, duration: 2.6, ease: 'power3.out',
      onUpdate: () => (el.textContent = fmt(o.v)),
      scrollTrigger: { trigger: el, start: 'top 80%' },
    });
  });
  gsap.from('.chip', {
    y: 60, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.value__chips', start: 'top 90%' },
  });

  // ---------- How it works : pinned phone ----------
  const steps = $$('.how__step');
  const screens = $$('.scr');
  let stepIdx = 0;
  const dashTotal = $('#dash-total');
  function setStep(i) {
    if (i === stepIdx) return;
    stepIdx = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    screens.forEach((s, k) => s.classList.toggle('is-active', k === i));
    Sound.blip(600 + i * 120);
    if (i === 2) {
      const o = { v: 8900 };
      gsap.to(o, { v: 18700, duration: 1.8, ease: 'power3.out', onUpdate: () => (dashTotal.textContent = fmt(o.v)) });
    }
  }
  dashTotal.textContent = fmt(8900);

  const mm = gsap.matchMedia();
  ScrollTrigger.create({
    // pins refresh first (top-down) so every other trigger accounts for their spacers
    trigger: '.how', start: 'top top', end: '+=220%', pin: '.how__pin', scrub: true, refreshPriority: 10,
    onUpdate: self => {
      $('#how-bar').style.transform = `scaleX(${self.progress})`;
      setStep(Math.min(2, Math.floor(self.progress * 3)));
    },
  });
  mm.add('(min-width: 861px)', () => {
    gsap.fromTo('#phone',
      { rotateY: -28, rotateX: 12, rotateZ: -4 },
      { rotateY: 18, rotateX: -6, rotateZ: 3, ease: 'none',
        scrollTrigger: { trigger: '.how', start: 'top bottom', end: '+=320%', scrub: 1 } });
  });

  // ---------- Bento / pricing : tilt + glow ----------
  if (hover) {
    $$('.tilt').forEach(card => {
      const rx = gsap.quickTo(card, 'rotateX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotateY', { duration: 0.6, ease: 'power3.out' });
      gsap.set(card, { transformPerspective: 1000 });
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
        rx((0.5 - y) * 8); ry((x - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }
  gsap.utils.toArray('.bento .card, .plan').forEach((c, i) => {
    gsap.from(c, {
      y: 80, autoAlpha: 0, duration: 1.2, ease: 'expo.out', delay: (i % 4) * 0.08,
      scrollTrigger: { trigger: c, start: 'top 92%' },
    });
  });

  // ---------- Horizontal sinistre scroll ----------
  const track = $('#htrack');
  const hDist = () => Math.max(0, track.scrollWidth - innerWidth);
  gsap.to(track, {
    x: () => -hDist(), ease: 'none',
    scrollTrigger: {
      trigger: '.hscroll', start: 'top top', end: () => '+=' + hDist(),
      pin: '.hscroll__pin', scrub: 1, invalidateOnRefresh: true, refreshPriority: 9,
    },
  });

  // ---------- Security cards ----------
  gsap.from('.sec', {
    y: 40, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.sec-grid', start: 'top 85%' },
  });

  // ---------- Pricing toggle ----------
  const pill = $('.billing__pill');
  const billBtns = $$('[data-billing]');
  function placePill(btn) {
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
  }
  billBtns.forEach(btn => btn.addEventListener('click', () => {
    billBtns.forEach(b => b.classList.toggle('is-on', b === btn));
    placePill(btn);
    const mode = btn.dataset.billing;
    $$('[data-m]').forEach(el => {
      gsap.to(el, {
        yPercent: -40, autoAlpha: 0, duration: 0.2, ease: 'power2.in',
        onComplete: () => {
          el.textContent = el.dataset[mode];
          gsap.fromTo(el, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: 'expo.out' });
        },
      });
    });
  }));
  document.fonts.ready.then(() => placePill($('[data-billing].is-on')));
  addEventListener('resize', () => placePill($('[data-billing].is-on')));

  // ---------- FAQ ----------
  $$('.qa__q').forEach(q => q.addEventListener('click', () => {
    const item = q.parentElement;
    const open = !item.classList.contains('is-open');
    $$('.qa').forEach(x => x.classList.remove('is-open'));
    item.classList.toggle('is-open', open);
    setTimeout(() => ScrollTrigger.refresh(), 650);
  }));

  // ---------- Waitlist (front-end only for now) ----------
  $('#join-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = e.target.email;
    const msg = $('#join-msg');
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
    msg.classList.toggle('is-error', !ok);
    if (!ok) { msg.textContent = 'Hmm, cette adresse ne semble pas valide.'; return; }
    msg.textContent = '✓ Vous êtes sur la liste. On vous écrit très vite.';
    input.value = '';
    Sound.blip(880);
    gsap.fromTo('.join__form', { scale: 0.97 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, .4)' });
  });

  // ---------- Magnetic buttons ----------
  if (hover) {
    $$('.magnetic').forEach(btn => {
      const xTo = gsap.quickTo(btn, 'x', { duration: 0.6, ease: 'elastic.out(1, .4)' });
      const yTo = gsap.quickTo(btn, 'y', { duration: 0.6, ease: 'elastic.out(1, .4)' });
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.3);
        yTo((e.clientY - r.top - r.height / 2) * 0.4);
      });
      btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  // ---------- Custom cursor ----------
  if (hover) {
    const cur = $('.cursor');
    const dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.1 }), dy = gsap.quickTo(dot, 'y', { duration: 0.1 });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3.out' }), ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3.out' });
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2 });
    addEventListener('pointermove', e => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor], a, button, .tilt');
      cur.classList.remove('is-hover', 'is-link');
      if (!t) return;
      if (t.dataset.cursor) { label.textContent = t.dataset.cursor; cur.classList.add('is-hover'); }
      else cur.classList.add('is-link');
    });
  }
})();
