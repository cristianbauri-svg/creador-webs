/* ==========================================================================
   Nails Mastery — Landing Page JS
   Counter simulator · Testimonial dates · Like toggle · CTA reveal
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. Random "hace X tiempo" dates for testimonials
     ------------------------------------------------------------------------ */
  const TIME_PHRASES = [
    { max: 1, text: 'Hace unas horas' },
    { max: 2, text: 'Hace 1 día' },
    { max: 4, text: 'Hace 2 días' },
    { max: 6, text: 'Hace 3 días' },
    { max: 10, text: 'Hace 5 días' },
    { max: 16, text: 'Hace 1 semana' },
    { max: 24, text: 'Hace 2 semanas' },
    { max: 35, text: 'Hace 3 semanas' },
    { max: 50, text: 'Hace 1 mes' },
    { max: 70, text: 'Hace 2 meses' },
  ];

  function getRandomDatePhrase() {
    const idx = Math.floor(Math.random() * TIME_PHRASES.length);
    return TIME_PHRASES[idx].text;
  }

  document.querySelectorAll('.js-testimonial-date').forEach(function (el) {
    if (!el.dataset.assigned) {
      el.textContent = getRandomDatePhrase();
      el.dataset.assigned = 'true';
    }
  });

  /* ------------------------------------------------------------------------
     2. Like / "Me gusta" toggle
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.js-like-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var liked = btn.classList.toggle('liked');
      var label = btn.querySelector('.js-like-label');
      if (label) {
        label.textContent = liked ? 'Me gusta' : 'Me gusta';
      }
      // Add 1 to a hidden count conceptually — just visual toggle for now
    });
  });

  /* ------------------------------------------------------------------------
     3. 30-second counter & CTA section reveal
     ------------------------------------------------------------------------ */
  var videoWrapper = document.getElementById('video-wrapper');
  var videoPlaceholder = document.getElementById('video-placeholder');
  var counterDisplay = document.getElementById('counter-display');
  var counterValue = document.getElementById('counter-value');
  var ctaSection = document.getElementById('cta-section');
  var timerInterval = null;
  var secondsElapsed = 0;
  var timerRunning = false;
  var ctaRevealed = false;

  function formatTime(totalSeconds) {
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function revealCTA() {
    if (ctaRevealed) return;
    ctaRevealed = true;
    ctaSection.classList.add('visible');
    // Meta Pixel — CTA revealed
    if (typeof fbq !== 'undefined') {
      fbq('trackCustom', 'CTAShown');
    }
    // Dispatch custom event for VTurb integration
    window.dispatchEvent(new CustomEvent('nailsmastery:cta-revealed', {
      detail: { seconds: secondsElapsed }
    }));
  }

  function startCounter() {
    if (timerRunning) return;
    timerRunning = true;

    // Show counter UI
    counterDisplay.classList.add('visible');
    counterValue.textContent = '00:00';

    timerInterval = setInterval(function () {
      secondsElapsed++;
      counterValue.textContent = formatTime(secondsElapsed);

      if (secondsElapsed >= 30) {
        clearInterval(timerInterval);
        timerInterval = null;
        revealCTA();
      }
    }, 1000);
  }

  // Start counter when user interacts with video placeholder
  if (videoPlaceholder) {
    videoPlaceholder.addEventListener('click', function () {
      startCounter();
    });
  }

  // Also start if an embedded VTurb video fires a play event
  if (videoWrapper) {
    videoWrapper.addEventListener('play', function () {
      startCounter();
    }, true); // capture phase to catch events from iframe content

    // Fallback: if the iframe loads and starts playing automatically
    videoWrapper.addEventListener('load', function (e) {
      var target = e.target;
      if (target && target.tagName === 'IFRAME') {
        // VTurb embeds typically auto-play — start counter after a short delay
        setTimeout(function () {
          if (!timerRunning) startCounter();
        }, 2000);
      }
    }, true);
  }

  /* ------------------------------------------------------------------------
     4. Nav scroll effect
     ------------------------------------------------------------------------ */
  var nav = document.querySelector('.js-nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      var scrolled = window.scrollY > 10;
      nav.classList.toggle('scrolled', scrolled);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------------
     5. Scroll-triggered neon glow on testimonial cards
     ------------------------------------------------------------------------ */
  var testimonialCards = document.querySelectorAll('.testimonial-card');
  if (testimonialCards.length && 'IntersectionObserver' in window) {
    var glowObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('glow-active');
        } else {
          entry.target.classList.remove('glow-active');
        }
      });
    }, {
      rootMargin: '0px 0px -80px 0px',
      threshold: 0.3
    });

    testimonialCards.forEach(function (card) {
      glowObserver.observe(card);
    });
  } else if (testimonialCards.length) {
    // Fallback: show glow immediately if no IntersectionObserver support
    testimonialCards.forEach(function (card) {
      card.classList.add('glow-active');
    });
  }

  /* ------------------------------------------------------------------------
     6. WhatsApp button — appears after scrolling past video
     ------------------------------------------------------------------------ */
  var whatsappBtn = document.getElementById('whatsapp-btn');
  var videoWrapperEl = document.getElementById('video-wrapper');
  if (whatsappBtn && videoWrapperEl) {
    var wpRevealed = false;
    window.addEventListener('scroll', function () {
      if (wpRevealed) return;
      var videoBottom = videoWrapperEl.getBoundingClientRect().bottom;
      if (videoBottom < window.innerHeight * 0.5) {
        wpRevealed = true;
        whatsappBtn.classList.add('visible');
      }
    }, { passive: true });

    // Track WhatsApp click
    whatsappBtn.addEventListener('click', function () {
      if (typeof fbq !== 'undefined') {
        fbq('trackCustom', 'WhatsAppClick');
      }
    });
  }

  /* ------------------------------------------------------------------------
     7. Logo reveal on scroll
     ------------------------------------------------------------------------ */
  var logoReveal = document.querySelector('.logo-reveal');
  if (logoReveal && 'IntersectionObserver' in window) {
    var logoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          logoObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -60px 0px',
      threshold: 0.2
    });
    logoObserver.observe(logoReveal);
  } else if (logoReveal) {
    logoReveal.classList.add('revealed');
  }

  /* ------------------------------------------------------------------------
     Smooth scroll for any anchor links
     ------------------------------------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

})();
