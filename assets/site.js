/**
 * Wyrdtafl product site — page behaviour.
 *
 * Plain script, no dependencies, loaded with `defer`. Every feature is
 * progressive: the page reads and works without JavaScript, and each block
 * below checks for its elements before doing anything, so the same file is
 * safe on pages that lack them.
 *
 * Blocks:
 *  1. Motion / data preferences shared by the effects below.
 *  2. Header: frosted glass once the page scrolls.
 *  3. Hero film: attach the looping video only when it is welcome.
 *  4. Hero embers: a light canvas particle layer (sparks left, snow right).
 *  5. Scroll reveal.
 *  6. "Try a hand": the interactive Dissonance demo.
 *  7. Horizontal scrollers: arrow buttons.
 *  8. Mode cards: cursor-following light.
 *  9. Screenshot lightbox.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Preferences
   * Reduced motion turns off the film, the particles and the reveal;
   * Save-Data (or a 2G connection) skips the film download.
   * ------------------------------------------------------------------ */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var saveData = conn.saveData === true || /2g/.test(conn.effectiveType || '');

  /* ------------------------------------------------------------------
   * 2. Header
   * A single passive scroll listener toggles a class; the CSS does the rest.
   * ------------------------------------------------------------------ */
  var bar = document.getElementById('top-bar');
  if (bar) {
    var onScroll = function () { bar.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------
   * 3. Hero film
   * The <video> ships without a src (preload="none"), so nothing is
   * downloaded until we decide it should play. Portrait screens get the
   * portrait cut of the opening film; the poster <img> stays underneath and
   * the video fades in only once it can actually play.
   * ------------------------------------------------------------------ */
  var video = document.getElementById('hero-video');
  if (video && !reduceMotion && !saveData) {
    var tall = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
    video.src = tall ? video.dataset.tall : video.dataset.wide;
    video.addEventListener('playing', function () { video.classList.add('is-ready'); }, { once: true });
    // play() can reject (autoplay policy, low-power mode); the poster then simply stays.
    var p = video.play();
    if (p && p.catch) p.catch(function () {});

    // Pause the film when the hero is off screen or the tab is hidden: no wasted battery.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !document.hidden) { var q = video.play(); if (q && q.catch) q.catch(function () {}); }
          else video.pause();
        });
      }, { threshold: 0.05 }).observe(video);
    }
  }

  /* ------------------------------------------------------------------
   * 4. Hero embers
   * A small particle system on a 2D canvas: warm sparks rise from the
   * lower left (Muspelheim), cold flakes drift down on the right
   * (Niflheim), matching the table's two sides.
   * Performance matters here because the canvas is composited over the
   * playing hero film every frame:
   *  - each glow is a sprite pre-rendered once and stamped with drawImage
   *    (canvas shadowBlur per particle is a blur pass per draw call);
   *  - the canvas renders at 1 CSS pixel per pixel: the motes are soft
   *    glows, so a Retina backing store would only quadruple the fill cost;
   *  - the particle count is capped and the loop stops off screen.
   * ------------------------------------------------------------------ */
  var canvas = document.querySelector('.hero canvas.embers');
  if (canvas && canvas.getContext && !reduceMotion) {
    var ctx = canvas.getContext('2d');
    var dpr = 1;

    /**
     * Pre-renders one soft glow: a bright core fading to transparent.
     * @param {string} core Colour at the centre (rgba).
     * @param {string} halo Colour of the glow ring (rgba).
     * @returns {HTMLCanvasElement} a 32×32 sprite.
     */
    var sprite = function (core, halo) {
      var c = document.createElement('canvas');
      c.width = c.height = 32;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, core);
      grd.addColorStop(0.18, core);
      grd.addColorStop(0.4, halo);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      return c;
    };
    var EMBER = sprite('rgba(255,200,120,1)', 'rgba(255,110,30,0.45)');
    var FROST = sprite('rgba(230,248,255,1)', 'rgba(150,220,255,0.3)');
    var W = 0, H = 0, parts = [], running = false, last = 0;

    var resize = function () {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /**
     * Creates one particle.
     * @param {boolean} anywhere true to place it anywhere on screen (first fill),
     *   false to spawn it at its emitter edge.
     * @returns {object} particle state.
     */
    var spawn = function (anywhere) {
      var ember = Math.random() < 0.62;
      // Embers favour the left half, frost the right half.
      var x = ember ? Math.random() * W * 0.65 : W * 0.35 + Math.random() * W * 0.65;
      var y = anywhere ? Math.random() * H : (ember ? H + 10 : -10);
      return {
        ember: ember, x: x, y: y,
        vx: (Math.random() - 0.5) * (ember ? 14 : 10),
        vy: ember ? -(18 + Math.random() * 36) : 10 + Math.random() * 18,
        r: ember ? 0.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.8,
        life: 0, max: 5 + Math.random() * 7, phase: Math.random() * 6.28
      };
    };

    var count = function () { return Math.min(60, Math.round(W * H / 20000)); };

    var tick = function (now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        q.life += dt;
        // A slow sideways sway so nothing moves in a straight line.
        q.x += (q.vx + Math.sin(now / 900 + q.phase) * 8) * dt;
        q.y += q.vy * dt;
        var t = q.life / q.max;
        if (t >= 1 || q.y < -20 || q.y > H + 20) { parts[i] = spawn(false); continue; }
        // Fade in and out over the particle's life; embers flicker.
        var a = Math.sin(Math.PI * t) * (q.ember ? 0.55 + 0.45 * Math.sin(now / 90 + q.phase) : 0.7);
        // Stamp the pre-rendered glow; its size is about 5× the mote's core radius.
        var size = q.r * (q.ember ? 6 : 4.5);
        ctx.globalAlpha = Math.max(0, q.ember ? a * 0.9 : a * 0.55);
        ctx.drawImage(q.ember ? EMBER : FROST, q.x - size / 2, q.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    };

    var start = function () { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } };
    var stop = function () { running = false; };

    resize();
    for (var n = count(); n > 0; n--) parts.push(spawn(true));
    window.addEventListener('resize', function () {
      resize();
      var target = count();
      while (parts.length < target) parts.push(spawn(true));
      parts.length = target;
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(canvas);
    } else start();
  }

  /* ------------------------------------------------------------------
   * 5. Scroll reveal
   * Elements with .reveal fade up once, the first time they enter view.
   * Without IntersectionObserver (or with reduced motion) they just show.
   * ------------------------------------------------------------------ */
  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
   * 6. "Try a hand" — Dissonance demo
   * Two tiles, I to VI each. Dissonance is the absolute difference; equal
   * values are Harmony. The verdict text is announced via aria-live.
   * ------------------------------------------------------------------ */
  var oracle = document.getElementById('oracle');
  if (oracle) {
    var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
    var NAMES = { ember: 'Embers', frost: 'Frost' };
    // One line of advice per Dissonance value (index = Dissonance).
    var NOTES = [
      'A pair. The Norns smile — few hands can beat it.',
      'A strong hand. Meditate, and keep it.',
      'A fair hand. Hold it, or gamble for better.',
      'A risky hand. Forge Destiny and hope the deck is kind.',
      'A cursed hand. Bet a Wyrd Stone and draw.',
      'The worst hand at the table. The Well of Urd is hungry.'
    ];
    var state = { ember: 2, frost: 5 };
    var word = oracle.querySelector('.verdict-word');
    var note = oracle.querySelector('.verdict-note');
    var verdict = oracle.querySelector('.verdict');

    /**
     * Sets one tile's value (wrapping I↔VI) and refreshes the verdict.
     * @param {'ember'|'frost'} side Which tile.
     * @param {number} value New value; wrapped into 1..6.
     */
    var setTile = function (side, value) {
      state[side] = ((value - 1 + 6) % 6) + 1;
      var tile = oracle.querySelector('[data-tile="' + side + '"]');
      tile.querySelector('.num').textContent = ROMAN[state[side]];
      tile.setAttribute('aria-label', NAMES[side] + ' tile, value ' + state[side] + '. Press to raise.');
      // Restart the flip animation by removing the class and forcing a reflow.
      tile.classList.remove('flip'); void tile.offsetWidth; tile.classList.add('flip');
      var d = Math.abs(state.ember - state.frost);
      verdict.classList.toggle('harmony', d === 0);
      word.textContent = d === 0 ? 'Harmony ' + ROMAN[state.ember] + '–' + ROMAN[state.frost] : 'Dissonance ' + ROMAN[d];
      note.textContent = NOTES[d];
      // A short haptic tick on Harmony, where the browser supports it (Android Chrome).
      if (d === 0 && navigator.vibrate) navigator.vibrate(18);
    };

    oracle.addEventListener('click', function (e) {
      var step = e.target.closest('[data-step]');
      var tile = e.target.closest('[data-tile]');
      if (step) {
        var parts2 = step.dataset.step.split(':');
        setTile(parts2[0], state[parts2[0]] + Number(parts2[1]));
      } else if (tile) {
        setTile(tile.dataset.tile, state[tile.dataset.tile] + 1);
      }
    });
  }

  /* ------------------------------------------------------------------
   * 7. Horizontal scrollers
   * Arrow buttons scroll their track by about one viewport of cards.
   * data-scroll="<track id>:<direction>".
   * ------------------------------------------------------------------ */
  document.querySelectorAll('[data-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var spec = btn.dataset.scroll.split(':');
      var track = document.getElementById(spec[0]);
      if (!track) return;
      track.scrollBy({ left: Number(spec[1]) * track.clientWidth * 0.8, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ------------------------------------------------------------------
   * 8. Mode cards
   * Feed the pointer position to CSS so a soft light follows the cursor.
   * Only for fine pointers; touch screens keep the static card.
   * ------------------------------------------------------------------ */
  if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.mode').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ------------------------------------------------------------------
   * 9. Screenshot lightbox
   * A native <dialog>: showModal() traps focus and Esc closes it. Arrow
   * keys and the side buttons step through the gallery; a click on the
   * backdrop closes.
   * ------------------------------------------------------------------ */
  var box = document.getElementById('lightbox');
  var gallery = document.getElementById('gallery');
  if (box && gallery && typeof box.showModal === 'function') {
    var shots = Array.prototype.slice.call(gallery.querySelectorAll('button'));
    var big = box.querySelector('img');
    var cap = box.querySelector('p');
    var index = 0;

    /**
     * Shows screenshot i in the lightbox (wrapping at both ends).
     * @param {number} i Index into the gallery.
     */
    var show = function (i) {
      index = (i + shots.length) % shots.length;
      var img = shots[index].querySelector('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      cap.textContent = shots[index].querySelector('.cap').textContent;
    };

    shots.forEach(function (b, i) {
      b.addEventListener('click', function () { show(i); box.showModal(); });
    });
    box.querySelector('.close').addEventListener('click', function () { box.close(); });
    box.querySelector('.prev').addEventListener('click', function () { show(index - 1); });
    box.querySelector('.next').addEventListener('click', function () { show(index + 1); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    // Clicks that land on the dialog itself (not the image or a button) are backdrop clicks.
    box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
    // Return focus to the thumbnail that opened the dialog.
    box.addEventListener('close', function () { shots[index].focus(); });
  }
})();
