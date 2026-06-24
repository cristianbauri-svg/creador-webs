/**
 * Cuadernillo Profesional — main.js
 * Vanilla JS, zero dependencies, < 5 KB
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Countdown Timer
     ------------------------------------------------------------------ */
  function initCountdown() {
    var daysEl    = document.getElementById('countdown-days');
    var hoursEl   = document.getElementById('countdown-hours');
    var minsEl    = document.getElementById('countdown-mins');
    var secsEl    = document.getElementById('countdown-secs');
    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    // Target: 7 days from page load, stored in sessionStorage so it survives refresh
    var stored = sessionStorage.getItem('countdownTarget');
    var target;
    if (stored) {
      target = parseInt(stored, 10);
    } else {
      target = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      sessionStorage.setItem('countdownTarget', target);
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function tick() {
      var diff = target - Date.now();
      if (diff <= 0) {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minsEl.textContent = '00';
        secsEl.textContent = '00';
        return;
      }
      var totalSecs = Math.floor(diff / 1000);
      var d = Math.floor(totalSecs / 86400);
      var h = Math.floor((totalSecs % 86400) / 3600);
      var m = Math.floor((totalSecs % 3600) / 60);
      var s = totalSecs % 60;
      daysEl.textContent  = pad(d);
      hoursEl.textContent = pad(h);
      minsEl.textContent  = pad(m);
      secsEl.textContent  = pad(s);
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------
     Sticky Header — show on scroll
     ------------------------------------------------------------------ */
  function initStickyHeader() {
    var header = document.getElementById('siteHeader');
    if (!header) return;
    var lastScroll = 0;
    var ticking = false;

    function update() {
      var scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 200) {
        header.classList.add('visible');
      } else {
        header.classList.remove('visible');
      }
      lastScroll = scrollY;
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Video Play Overlay — click overlay → play video, hide overlay
     ------------------------------------------------------------------ */
  function initVideoOverlays() {
    var overlays = document.querySelectorAll('[data-play-overlay]');
    overlays.forEach(function (overlay) {
      overlay.addEventListener('click', function () {
        var wrapper = overlay.closest('.video-wrapper');
        if (!wrapper) return;
        var video = wrapper.querySelector('video');
        if (!video) return;
        overlay.classList.add('hidden');
        video.play().catch(function () {
          // Autoplay blocked — overlay stays visible but can be clicked again
          overlay.classList.remove('hidden');
        });
      });
    });
  }

  /* ------------------------------------------------------------------
     Smooth Scroll — internal anchor links
     ------------------------------------------------------------------ */
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      var target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ------------------------------------------------------------------
     Init all
     ------------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initCountdown();
      initStickyHeader();
      initVideoOverlays();
      initSmoothScroll();
    });
  } else {
    initCountdown();
    initStickyHeader();
    initVideoOverlays();
    initSmoothScroll();
  }
})();
