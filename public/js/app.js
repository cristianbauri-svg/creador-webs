/**
 * Straton Audio — App principal
 * Maneja la carga dinámica de datos desde la API, animaciones,
 * formulario de cotización y navegación.
 */

(function () {
  'use strict';

  // Settings globales cargados desde KV
  var siteSettings = {};

  // =========================================================
  // Barra Sticky de Cotización
  // =========================================================
  window.cartItems = [];
  var cartItems = window.cartItems;

  /** Devuelve referencias frescas a los elementos de la barra (lazy, porque el
   *  script carga antes que el HTML del cart-bar). */
  function getCartBarElements() {
    return {
      cartBar: document.getElementById('cart-bar'),
      cartBarSummary: document.getElementById('cart-bar-summary'),
      cartBarTotalLarge: document.getElementById('cart-bar-total-large'),
      cartBarClear: document.getElementById('cart-bar-clear'),
      cartBarWhatsapp: document.getElementById('cart-bar-whatsapp'),
    };
  }

  function renderCartBar() {
    var els = getCartBarElements();
    if (!els.cartBar) return;
    if (cartItems.length === 0) {
      els.cartBar.classList.add('hidden');
      document.body.classList.remove('has-cart-bar');
      return;
    }
    els.cartBar.classList.remove('hidden');
    document.body.classList.add('has-cart-bar');

    // Construir tags con el texto adecuado y botón de eliminar
    var tagsHtml = cartItems.map(function(item, index) {
      var displayName = item.type === 'package' ? item.name : 'Añadido';
      var qty = item.quantity || 1;
      var text = qty > 1 ? displayName + ' (' + qty + ')' : displayName;
      return '<span class="cart-bar-tag">' +
        escapeHtml(text) +
        ' <button data-cart-remove="' + index + '" title="Quitar">&times;</button>' +
        '</span>';
    }).join('');

    els.cartBarSummary.innerHTML = tagsHtml || 'Sin productos';

    // Calcular total
    var total = cartItems.reduce(function(sum, item) {
      var price = item.price || item.total || 0;
      var qty = item.quantity || 1;
      return sum + (price * qty);
    }, 0);

    // Mostrar total en el nuevo elemento
    els.cartBarTotalLarge.textContent = total > 0 ? '$' + total.toLocaleString('es-CO') : '$0';
  }

  function addToCart(item) {
    cartItems.push(item);
    renderCartBar();
  }

  function removeFromCart(index) {
    if (index >= 0 && index < cartItems.length) {
      cartItems.splice(index, 1);
      renderCartBar();
    }
  }

  function clearCart() {
    window.cartItems = cartItems = [];
    renderCartBar();
  }

  function buildWhatsAppLink() {
    var phone = getWhatsAppNumber();
    var msg = '\u{1F389} *Hola Straton Audio, quiero esta cotización:*\n\n';
    msg += '\u{1F4CB} *Detalle del pedido*\n──────────────────\n';
    cartItems.forEach(function(item) {
      var qty = item.quantity || 1;
      msg += '\u{25B8} ' + qty + 'x ' + item.name;
      if (item.price) msg += ' \u{2192} $' + (item.price * qty).toLocaleString('es-CO');
      msg += '\n';
    });
    msg += '──────────────────\n';
    var total = cartItems.reduce(function(s, i) {
      var price = i.price || i.total || 0;
      var qty = i.quantity || 1;
      return s + (price * qty);
    }, 0);
    if (total > 0) msg += '\u{1F4B0} *Total estimado:* $' + total.toLocaleString('es-CO') + '\n\n';
    msg += '\u{1F464} *Nombre:* \n\u{1F4E7} *Email:* \n\u{1F4F1} *Teléfono:* \n\u{1F4C5} *Fecha del evento:* \n\u{1F4AC} *Comentarios:* \n\n';
    msg += '¿Me confirman disponibilidad y los detalles? \u{1F64C}';
    var url = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg);
    return url;
  }

  /** Registra los listeners de la barra sticky. Se invoca desde init()
   *  cuando el DOM ya está completo y los elementos existen. */
  function initCartBarEvents() {
    var els = getCartBarElements();
    if (els.cartBarClear) els.cartBarClear.addEventListener('click', clearCart);
    if (els.cartBarWhatsapp) els.cartBarWhatsapp.addEventListener('click', function() {
      // Mostrar modal para pedir datos del cliente
      var modal = document.getElementById('clientModal');
      if (modal) {
        modal.style.display = 'flex';
      }
    });

    // Manejar el envío del formulario del modal
    var modalForm = document.getElementById('clientModalForm');
    if (modalForm) {
      modalForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var name = document.getElementById('modalName').value.trim();
        var email = document.getElementById('modalEmail').value.trim();
        var phone = document.getElementById('modalPhone').value.trim();

        if (!name || !phone) {
          alert('Por favor, completa Nombre y Teléfono.');
          return;
        }

        // Cerrar modal
        document.getElementById('clientModal').style.display = 'none';

        // Construir y abrir enlace de WhatsApp con los datos del cliente
        var msg = '🎉 *Hola Straton Audio, quiero esta cotización:*\n\n';
        msg += '📋 *Detalle del pedido*\n──────────────────\n';
        cartItems.forEach(function(item) {
          var qty = item.quantity || 1;
          msg += '▸ ' + qty + 'x ' + item.name + '\n';
        });
        msg += '──────────────────\n';
        var total = cartItems.reduce(function(s, i) {
          var price = i.price || i.total || 0;
          var qty = i.quantity || 1;
          return s + (price * qty);
        }, 0);
        if (total > 0) msg += '💰 *Total estimado:* $' + total.toLocaleString('es-CO') + '\n\n';
        msg += '👤 *Nombre:* ' + name + '\n';
        msg += '📧 *Email:* ' + email + '\n';
        msg += '📱 *Teléfono:* ' + phone + '\n';
        msg += '\n¿Me confirman disponibilidad y los detalles? 🙌';

        window.open('https://api.whatsapp.com/send?phone=' + getWhatsAppNumber() + '&text=' + encodeURIComponent(msg), '_blank');

        // Enviar cotización al backend con los datos reales
        var payload = {
          customer_name: name,
          email: email,
          phone: phone,
          notes: 'Cotización enviada desde WhatsApp',
          products_json: cartItems.length > 0 ? JSON.stringify(cartItems) : null
        };

        fetch('/api/quotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .catch(function(err) { console.error('Error al registrar cotización:', err); });

        // Limpiar formulario modal
        modalForm.reset();
      });
    }

    // Cancelar modal
    var modalCancel = document.getElementById('modalCancel');
    if (modalCancel) {
      modalCancel.addEventListener('click', function() {
        document.getElementById('clientModal').style.display = 'none';
      });
    }

    // Cerrar modal al hacer clic fuera
    var clientModalEl = document.getElementById('clientModal');
    if (clientModalEl) {
      clientModalEl.addEventListener('click', function(e) {
        if (e.target === this) {
          this.style.display = 'none';
        }
      });
    }
    if (els.cartBarSummary) els.cartBarSummary.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cart-remove]');
      if (btn) {
        var index = parseInt(btn.getAttribute('data-cart-remove'));
        removeFromCart(index);
      }
    });
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    try {
      var item = JSON.parse(btn.getAttribute('data-add-to-cart').replace(/&quot;/g, '"'));
      var qty = parseInt(btn.getAttribute('data-product-qty')) || 1;
      item.quantity = qty;
      addToCart(item);
    } catch(err) {
      console.error('Error añadiendo al carrito:', err);
    }
  });

  renderCartBar();

  // =========================================================
  // Utilidades
  // =========================================================
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
  const API_BASE = '';

  // Cache en memoria para deduplicar fetches repetidos (p.ej. varios bloques
  // de carrusel/paquetes en la misma página dinámica pidiendo la misma URL).
  // Se cachea la Promise (no la data ya resuelta) para que las llamadas
  // concurrentes que llegan antes de que la primera responda compartan la
  // misma petición en curso, en vez de disparar un fetch cada una.
  var _fetchCache = {};
  function cachedFetch(url) {
    if (_fetchCache[url]) return _fetchCache[url];
    var promise = fetch(url).then(function(r) {
      if (!r.ok) throw new Error('Fetch failed');
      return r.json();
    }).catch(function(err) {
      delete _fetchCache[url];
      throw err;
    });
    _fetchCache[url] = promise;
    return promise;
  }

  async function apiFetch(path, options = {}) {
    const url = API_BASE + path;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    return res.json();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getWhatsAppNumber() {
    return (siteSettings && siteSettings.whatsapp_number) ? siteSettings.whatsapp_number.replace(/[^0-9]/g, '') : '573102646751';
  }

  // =========================================================
  // Navegación
  // =========================================================
  function initNav() {
    const navbar = $('#navbar');
    const toggle = $('#navToggle');
    const links = $('#navLinks');
    const navLinkEls = $$('a', links);

    // Toggle móvil
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });

    // Cerrar menú al hacer click en link
    navLinkEls.forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Navbar background al scrollear
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          navbar.classList.toggle('scrolled', window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // =========================================================
  // Animaciones con Intersection Observer
  // =========================================================
  function initAnimations() {
    const animateElements = $$('.animate-in');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    animateElements.forEach(el => observer.observe(el));
  }

  // =========================================================
  // Contador animado (Hero Stats)
  // =========================================================
  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.textContent.includes('%') ? '%' : '';
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target + suffix;
        el.classList.add('visible');
      }
    }

    requestAnimationFrame(update);
  }

  function initCounters() {
    const counters = $$('.hero-stat-value');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(el => observer.observe(el));
  }

  // =========================================================
  // Cargar Settings (configuración dinámica)
  // =========================================================
  async function loadSettings() {
    try {
      const settings = await apiFetch('/api/settings');

      // Guardar en global para acceso desde otras funciones
      siteSettings = settings;

      // Hero
      if (settings.hero_title) {
        const heroTitle = $('#heroTitle');
        const text = settings.hero_title;
        const parts = text.split(/(audio e iluminación|audio|iluminación)/i);
        heroTitle.innerHTML = parts.map(p =>
          /audio e iluminación|audio|iluminación/i.test(p)
            ? `<span class="highlight">${escapeHtml(p)}</span>`
            : escapeHtml(p)
        ).join('');
      }
      if (settings.hero_subtitle) {
        $('#heroSubtitle').textContent = settings.hero_subtitle;
      }

      // Contacto
      if (settings.contact_email) $('#contactEmail').textContent = settings.contact_email;
      if (settings.contact_phone) $('#contactPhone').textContent = settings.contact_phone;
      if (settings.contact_address) $('#contactAddress').textContent = settings.contact_address;
      if (settings.business_hours) $('#contactHours').textContent = settings.business_hours;

      // WhatsApp
      if (settings.whatsapp_number) {
        const wa = $('#whatsappFloat');
        const clean = settings.whatsapp_number.replace(/[^0-9]/g, '');
        if (clean) {
          wa.href = `https://wa.me/${clean}?text=Hola%2C%20quiero%20solicitar%20una%20cotizaci%C3%B3n`;
        }
      }

      // Social
      const social = $('#footerSocial');
      let socialLinks = '';
      if (settings.social_instagram) {
        socialLinks +=
          `<a href="${escapeAttr(settings.social_instagram)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">📷</a>`;
      }
      if (settings.social_facebook) {
        socialLinks +=
          `<a href="${escapeAttr(settings.social_facebook)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">👍</a>`;
      }
      if (settings.social_tiktok) {
        socialLinks +=
          `<a href="${escapeAttr(settings.social_tiktok)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok">♪</a>`;
      }
      social.innerHTML = socialLinks;

      return settings;
    } catch (err) {
      return {};
    }
  }

  // =========================================================
  // Cargar meta tags desde API pages
  // =========================================================
  async function loadMeta() {
    try {
      const page = await apiFetch('/api/pages/slug/home');
      const titleEl = $('#meta-title');
      const descEl = $('#meta-description');
      const ogTitleEl = $('#meta-og-title');
      const ogDescEl = $('#meta-og-desc');

      if (page.meta_title) titleEl.textContent = page.meta_title;
      if (page.meta_description) {
        descEl.setAttribute('content', page.meta_description);
        ogDescEl.setAttribute('content', page.meta_description);
      }
      if (page.title) ogTitleEl.setAttribute('content', page.title);
    } catch (err) {
      // Si no hay página home, usamos defaults del HTML — no es crítico
    }
  }

  // =========================================================
  // Servicios — Bioluminescent Grid (reemplaza loadServices)
  // =========================================================

  // Mapeo de títulos de servicio → archivo SVG
  const SERVICE_ICON_MAP = {
    'audio profesional': 'sonido.svg',
    'iluminación': 'Iluminación.svg',
    'iluminación escénica': 'Iluminación.svg',
    'pantallas led': 'Pantalla Led.svg',
    'pantallas led y video': 'Pantalla Led.svg',
    'producción técnica': 'Producción técnica.svg',
    'soporte para eventos corporativos': 'Soporte para eventos.svg',
    'streaming y circuito cerrado de tv': 'streaming-cctv.svg',
  };

  function getServiceIconPath(title) {
    const key = (title || '').toLowerCase().trim();
    return SERVICE_ICON_MAP[key] || null;
  }

  function getServiceSpan(index) {
    // Regla de asignación automática de spans asimétricos
    const pattern = [
      'col-span-2 row-span-2', // 0: tarjeta grande destacada
      '',                       // 1: normal
      '',                       // 2: normal
      'col-span-2',            // 3: ancha
      '',                       // 4: normal
      'row-span-2',            // 5: alta
    ];
    return pattern[index % pattern.length];
  }

  function renderServiceCard(service, index) {
    const spanClass = getServiceSpan(index);
    const iconPath = getServiceIconPath(service.title);
    const iconHtml = iconPath
      ? `<img src="/svg-icons/${iconPath}" alt="" class="service-card-svg" width="24" height="24" />`
      : (service.icon ? `<span class="service-card-emoji">${service.icon}</span>` : '');

    return `
      <article class="bio-card ${spanClass}" data-service-id="${service.id}" data-index="${index}">
        <div class="bio-card-glow"></div>
        <div class="bio-card-content">
          <div class="service-card-icon">${iconHtml}</div>
          <h3 class="service-card-title">${escapeHtml(service.title)}</h3>
          <p class="service-card-desc">${escapeHtml(service.description || '')}</p>
          <span class="service-card-expand-hint">Ver más →</span>
        </div>
      </article>`;
  }

  async function loadServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    try {
      const services = await apiFetch('/api/services?status=published');

      if (!services || services.length === 0) {
        grid.innerHTML = `<div class="empty-state"><p>No hay servicios disponibles.</p></div>`;
        return;
      }

      grid.innerHTML = services.map((s, i) => renderServiceCard(s, i)).join('');

      // Guardar datos para re-vincular clics tras colapsar
      window.__servicesData = services;

      // Vincular clics a cada card
      document.querySelectorAll('.bio-card').forEach(card => {
        card._svcClickHandler = function handler() {
          const id = parseInt(card.dataset.serviceId, 10);
          const service = services.find(s => s.id === id);
          if (service) showServiceDetail(service, card);
        };
        card.addEventListener('click', card._svcClickHandler);
      });

      initBioMouseTracking(grid);
      animateCardsIn();

      // Expandir automáticamente la primera card
      const firstCard = grid.querySelector('.bio-card');
      if (firstCard && services.length > 0) {
        showServiceDetail(services[0], firstCard, true);
      }
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><p>Error al cargar servicios.</p></div>`;
      console.error('loadServices:', err);
    }
  }

  // --- Efecto bioluminiscente: tracking del mouse ---
  function initBioMouseTracking(grid) {
    grid.addEventListener('mousemove', (e) => {
      const rect = grid.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      grid.style.setProperty('--mouse-x', `${x}%`);
      grid.style.setProperty('--mouse-y', `${y}%`);
    });
    grid.addEventListener('mouseleave', () => {
      grid.style.setProperty('--mouse-x', '50%');
      grid.style.setProperty('--mouse-y', '50%');
    });
  }

  // --- Animación stagger vanilla (reemplaza GSAP) ---
  function animateCardsIn() {
    const cards = document.querySelectorAll('.bio-card');
    if (!cards.length) return;

    // Respetar preferencia de movimiento reducido
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const DURATION = 0.5;   // segundos por tarjeta
    const STAGGER = 0.08;   // retraso entre tarjetas

    // Estado inicial
    cards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      card.style.transition = `opacity ${DURATION}s ease-out, transform ${DURATION}s ease-out`;
    });

    // Animar con stagger
    requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        card.style.transitionDelay = `${i * STAGGER}s`;
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      });

      // Limpiar estilos inline al terminar la animación para restaurar
      // las transiciones hover definidas en CSS (.bio-card)
      const lastDelay = (cards.length - 1) * STAGGER;
      const cleanupMs = (lastDelay + DURATION) * 1000 + 50;
      setTimeout(() => {
        cards.forEach(card => {
          card.style.opacity = '';
          card.style.transform = '';
          card.style.transition = '';
          card.style.transitionDelay = '';
        });
      }, cleanupMs);
    });
  }

  // --- Expansión inline de la card ---

  function showServiceDetail(service, cardElement, skipScroll = false) {
    const grid = document.getElementById('servicesGrid');
    if (!grid || !cardElement) return;

    // Si ya hay una expandida y es distinta, colapsarla primero
    const currentExpanded = grid.querySelector('.bio-card.expanded');
    if (currentExpanded && currentExpanded !== cardElement) {
      collapseCard(currentExpanded, grid);
    }

    // Si la misma card ya está expandida, colapsarla y salir
    if (cardElement.classList.contains('expanded')) {
      collapseCard(cardElement, grid);
      return;
    }

    // Guardar el HTML original de la card para restaurarlo después
    const originalHTML = cardElement.innerHTML;

    // Construir el HTML expandido
    const mediaHTML = service.video_url
      ? `<video src="${escapeHtml(service.video_url)}" controls preload="metadata"></video>`
      : (service.image_url
          ? `<img src="${escapeHtml(service.image_url)}" alt="${escapeHtml(service.title)}" loading="lazy" decoding="async" />`
          : '');

    const featuresHTML = service.features
      ? service.features.split('\n').filter(f => f.trim()).map(f => `
          <div class="feature-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>${escapeHtml(f.trim())}</span>
          </div>`).join('')
      : '';

    cardElement.innerHTML = `
      <div class="bio-card-expanded-close" id="btnCollapseCard" aria-label="Cerrar detalle">&times;</div>
      <div class="bio-card-expanded-media">${mediaHTML}</div>
      <div class="bio-card-expanded-info">
        <h2 class="detail-title">${escapeHtml(service.title)}</h2>
        <p class="detail-description">${escapeHtml(service.description || '')}</p>
        <div class="detail-features">${featuresHTML}</div>
        <a href="#contacto" class="cta-button">
          Solicitar cotización
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>`;

    cardElement.classList.add('expanded');
    cardElement.dataset.originalHTML = originalHTML;
    grid.classList.add('has-expanded');

    // Scroll suave a la card expandida (solo si no es apertura por defecto)
    if (!skipScroll) {
      cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Listener del botón cerrar
    const closeBtn = cardElement.querySelector('#btnCollapseCard');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseCard(cardElement, grid);
      });
    }
  }

  function collapseCard(cardElement, grid) {
    if (cardElement.dataset.originalHTML) {
      cardElement.innerHTML = cardElement.dataset.originalHTML;
      delete cardElement.dataset.originalHTML;
    }
    cardElement.classList.remove('expanded');
    grid.classList.remove('has-expanded');

    // Re-vincular el evento de clic a la card restaurada
    const services = window.__servicesData || [];
    if (cardElement._svcClickHandler) {
      cardElement.removeEventListener('click', cardElement._svcClickHandler);
    }
    cardElement._svcClickHandler = function handler() {
      const id = parseInt(cardElement.dataset.serviceId, 10);
      const service = services.find(s => s.id === id);
      if (service) showServiceDetail(service, cardElement);
    };
    cardElement.addEventListener('click', cardElement._svcClickHandler);
  }

  // =========================================================
  // Cargar Productos
  // =========================================================
  async function loadProducts() {
    const container = $('#productsContainer');
    try {
      const products = await apiFetch('/api/products?status=published');

      if (!products || products.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <h3>Próximamente</h3>
            <p>Estamos actualizando nuestro catálogo de equipos. Muy pronto estará disponible.</p>
          </div>
        `;
        return;
      }

      // Renderizar como carrusel de productos (1 card visible, autoplay, centrado)
      var track = document.createElement('div');
      track.className = 'pc-track';
      products.forEach(function(p) {
        var card = document.createElement('div');
        card.className = 'pc-card';
        card.innerHTML = '<img src="' + escapeAttr(p.image_url || '') + '" alt="' + esc(p.title) + '">' +
          '<div class="pc-info"><h3>' + esc(p.title) + '</h3><p>' + esc(p.description || '') + '</p></div>';
        track.appendChild(card);
      });
      container.innerHTML = '';
      container.appendChild(track);

      // Autoplay
      var cards = track.querySelectorAll('.pc-card');
      var idx = 0;
      var total = cards.length;
      if (total > 0) {
        function show(i) {
          track.style.transform = 'translateX(-' + (i * 100) + '%)';
        }
        show(0);
        var existingInterval = container._carouselInterval;
        if (existingInterval) clearInterval(existingInterval);
        container._carouselInterval = setInterval(function() {
          idx = (idx + 1) % total;
          show(idx);
        }, 3500);

        // Pausar en hover (desktop) y touch (mobile)
        container.addEventListener('mouseenter', function() {
          if (container._carouselInterval) { clearInterval(container._carouselInterval); container._carouselInterval = null; }
        });
        container.addEventListener('mouseleave', function() {
          if (!container._carouselInterval) {
            container._carouselInterval = setInterval(function() { idx = (idx + 1) % total; show(idx); }, 3500);
          }
        });
        container.addEventListener('touchstart', function() {
          if (container._carouselInterval) { clearInterval(container._carouselInterval); container._carouselInterval = null; }
        });
        container.addEventListener('touchend', function() {
          if (!container._carouselInterval) {
            container._carouselInterval = setInterval(function() { idx = (idx + 1) % total; show(idx); }, 3500);
          }
        });
      }
    } catch (err) {
      console.error('Error cargando productos:', err);
      container.innerHTML = `
        <div class="error-state">
          <p>No se pudieron cargar los productos. Verifica la conexión.</p>
        </div>
      `;
    }
  }

  // =========================================================
  // Cargar Paquetes
  // =========================================================
  async function loadPackages() {
    const container = $('#packagesContainer');
    try {
      const packages = await apiFetch('/api/packages?status=published');

      let html = '';

      if (packages && packages.length > 0) {
        html += packages.map((pkg, i) => {
          let includes = [];
          try {
            includes = typeof pkg.includes_json === 'string'
              ? JSON.parse(pkg.includes_json)
              : (pkg.includes_json || []);
          } catch { includes = []; }

          var priceMatch = pkg.price_range ? pkg.price_range.match(/[\d,]+/) : null;
          var price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, '')) : 0;

          return `
            <article class="package-card ${pkg.featured === 1 ? 'featured' : ''} animate-in">
              <h3 class="package-name">${escapeHtml(pkg.name)}</h3>
              <p class="package-description">${escapeHtml(pkg.description || '')}</p>
              ${pkg.price_range ? `<div class="package-price">${escapeHtml(pkg.price_range)}</div>` : ''}
              <ul class="package-includes">
                ${includes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
              <button data-add-to-cart="${JSON.stringify({type:'package',id:pkg.id,name:pkg.name,image:'',price:price}).replace(/"/g,'&quot;')}" class="btn btn-primary">Añadir a cotización</button>
            </article>
          `;
        }).join('');
      }

      // Paquete a la medida
      html += `
        <article class="package-card package-custom animate-in">
          <div class="package-custom-icon">✦</div>
          <h3 class="package-name">Paquete a la medida</h3>
          <p class="package-description">
            ¿No encuentras lo que buscas? Creamos un paquete personalizado
            para las necesidades específicas de tu evento.
          </p>
          <button data-add-to-cart='{"type":"package","id":"custom","name":"Paquete a la medida","image":"","price":0}' class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
            Añadir a cotización
          </button>
        </article>
      `;

      container.innerHTML = html;
      initAnimations();
    } catch (err) {
      console.error('Error cargando paquetes:', err);
      container.innerHTML = `
        <article class="package-card package-custom animate-in">
          <div class="package-custom-icon">✦</div>
          <h3 class="package-name">Paquete a la medida</h3>
          <p class="package-description">
            Cuéntanos sobre tu evento y crearemos un paquete personalizado
            para tus necesidades específicas.
          </p>
          <button data-add-to-cart='{"type":"package","id":"custom","name":"Paquete a la medida","image":"","price":0}' class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
            Añadir a cotización
          </button>
        </article>
      `;
      initAnimations();
    }
  }

  // Variable en clausura para evitar múltiples registros (IIFE scope)
  var eventsAccordionReady = false;

  function initEventsAccordion() {
    if (eventsAccordionReady) return;
    eventsAccordionReady = true;

    document.addEventListener('toggle', function(e) {
      var opened = e.target;
      if (opened.tagName !== 'DETAILS') return;
      if (!opened.classList.contains('event-comparator')) return;
      if (!opened.open) return;

      document.querySelectorAll('details.event-comparator[open]').forEach(function(d) {
        if (d !== opened) d.open = false;
      });
    }, true);
  }

  initEventsAccordion();

  // =========================================================
  // Cargar Eventos (Portafolio)
  // =========================================================


  async function loadEvents() {
    const container = $('#eventsContainer');
    const filters = $$('.filter-btn');

    try {
      const events = await apiFetch('/api/events?status=published');

      if (!events || events.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1;">
            <div class="empty-state-icon">📸</div>
            <h3>Próximamente</h3>
            <p>Estamos documentando nuestros eventos. El portafolio estará disponible pronto.</p>
          </div>
        `;
        return;
      }

      function renderEvents(filter = 'all') {
        const filtered = filter === 'all'
          ? events
          : events.filter(e => e.event_type === filter);

        if (filtered.length === 0) {
          container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
              <p style="color: var(--color-text-muted);">No hay eventos de esta categoría aún.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = filtered.map(ev => {
          const typeLabels = { corporativo: 'Corporativo', social: 'Social', concierto: 'Concierto' };
          let gallery = [];
          try {
            gallery = typeof ev.gallery_json === 'string'
              ? JSON.parse(ev.gallery_json)
              : (ev.gallery_json || []);
          } catch { gallery = []; }

          const imgSrc = gallery.length > 0
            ? gallery[0]
            : 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80';

          var linkOpen = ev.link ? '<a href="' + escapeAttr(ev.link) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;display:block;">' : '';
          var linkClose = ev.link ? '</a>' : '';
          return linkOpen + `
            <article class="event-card animate-in" data-type="${ev.event_type || ''}">
              <img class="event-card-image"
                   src="${escapeHtml(gallery.length > 0 ? gallery[0] : 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80')}"
                   alt="${escapeHtml(ev.title)}"
                   loading="lazy"
                   onerror="this.src='https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80'" />
              <div class="event-card-body">
                <span class="event-card-type">${typeLabels[ev.event_type] || ev.event_type || 'Evento'}</span>
                <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
              </div>
${ev.before_media_url && ev.after_media_url ? `
  <details class="event-comparator">
    <summary style="display:inline-flex;align-items:center;gap:0.35rem;margin-top:0.5rem;background:rgba(29,185,84,0.5);color:rgba(255,255,255,0.8);border:none;padding:0.4rem 1rem;border-radius:100px;font-size:0.8rem;cursor:pointer;list-style:none;">
      Ver más <span class="summary-arrow" style="font-size:0.7rem;">▼</span>
    </summary>
    <style>
      .event-comparator > summary::-webkit-details-marker { display: none; }
    </style>
    <div class="event-card-detail" style="padding:0 1rem 1rem 1rem;">
      <div class="event-comparison" style="display:flex;gap:0.5rem;margin-top:0.75rem;">
        <div class="event-before" style="flex:1;">
          <div style="position:relative;overflow:hidden;border-radius:var(--radius);">
            <img src="${escapeHtml(ev.before_media_url)}" alt="Antes" loading="lazy" style="width:100%;height:140px;object-fit:cover;display:block;" />
            <span style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:4px;">Antes</span>
          </div>
          ${ev.solution ? `<p style="font-size:0.8rem;color:var(--color-text-muted);margin-top:0.35rem;">${escapeHtml(ev.solution)}</p>` : ''}
        </div>
        <div class="event-after" style="flex:1;">
          <div style="position:relative;overflow:hidden;border-radius:var(--radius);">
            <img src="${escapeHtml(ev.after_media_url)}" alt="Después" loading="lazy" style="width:100%;height:140px;object-fit:cover;display:block;" />
            <span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:4px;">Después</span>
          </div>
          ${ev.result ? `<p style="font-size:0.8rem;color:var(--color-text-muted);margin-top:0.35rem;">${escapeHtml(ev.result)}</p>` : ''}
        </div>
      </div>
    </div>
  </details>
` : ''}
            </article>
          ` + linkClose;
        }).join('');

        initAnimations();
      }

      // Filtros
      filters.forEach(btn => {
        btn.addEventListener('click', () => {
          filters.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderEvents(btn.dataset.filter);
        });
      });

      // Render inicial
      renderEvents('all');
    } catch (err) {
      console.error('Error cargando eventos:', err);
      container.innerHTML = `
        <div class="error-state" style="grid-column: 1/-1;">
          <p>No se pudo cargar el portafolio. Verifica la conexión.</p>
        </div>
      `;
    }
  }

  // =========================================================
  // Cargar Testimonios
  // =========================================================
  async function loadTestimonials() {
    const section = $('#testimonios');
    const container = $('#testimonialsContainer');

    try {
      const testimonials = await apiFetch('/api/testimonials?visible=1');

      // Si no hay testimonios visibles, ocultar la sección completa
      if (!testimonials || testimonials.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = '';

      container.innerHTML = testimonials.map(t => {
        const initial = (t.client_name || '?')[0].toUpperCase();
        return `
          <article class="testimonial-card animate-in">
            <blockquote class="testimonial-quote">${escapeHtml(t.quote)}</blockquote>
            <div class="testimonial-author">
              ${t.avatar_url
                ? `<img src="${escapeHtml(t.avatar_url)}" alt="${escapeHtml(t.client_name)}" class="testimonial-avatar" style="width:48px;height:48px;object-fit:cover;border-radius:50%;" loading="lazy" />`
                : `<div class="testimonial-avatar">${initial}</div>`
              }
              <div>
                <div class="testimonial-name">${escapeHtml(t.client_name)}</div>
                ${t.company ? `<div class="testimonial-company">${escapeHtml(t.company)}</div>` : ''}
              </div>
            </div>
          </article>
        `;
      }).join('');

      initAnimations();
    } catch (err) {
      console.error('Error cargando testimonios:', err);
      // En error, ocultar la sección silenciosamente
      section.style.display = 'none';
    }
  }

  // =========================================================
  // Formulario de Cotización
  // =========================================================
  function initContactForm() {
    // El envío se maneja por el onsubmit inline en el HTML.
    // Esta función queda como placeholder por si se necesita en el futuro.
  }

  // =========================================================
  // Página dinámica (slugs desde el dashboard)
  // =========================================================
  function renderDynamicPage(data) {
    document.title = data.meta_title || data.title || 'Straton Audio';

    // Actualizar meta description y og tags
    var metaDesc = document.getElementById('meta-description');
    var ogDesc = document.getElementById('meta-og-desc');
    var ogTitle = document.getElementById('meta-og-title');
    if (data.meta_description) {
      if (metaDesc) metaDesc.setAttribute('content', data.meta_description);
      if (ogDesc) ogDesc.setAttribute('content', data.meta_description);
    }
    if (data.title && ogTitle) ogTitle.setAttribute('content', data.title);

    // Ocultar secciones de la landing
    var landingIds = ['hero','statsBanner','servicios','productos','paquetes','portafolio','testimonios','contacto'];
    landingIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var extras = document.querySelectorAll('.logo-marquee, .eq-console, .cart-toggle, .whatsapp-float, #cart-bar');
    extras.forEach(function(el) { el.style.display = 'none'; });

    // Mostrar contenedor dinámico
    var container = document.getElementById('dynamic-page');
    if (!container) return;
    container.style.display = '';
    container.innerHTML = '';

    // Detectar formato de content_json
    var blocks;
    if (Array.isArray(data.content_json)) {
      // Nuevo formato: array de bloques [{type, props}, ...]
      blocks = data.content_json;
    } else if (typeof data.content_json === 'object' && data.content_json !== null) {
      // Formato antiguo: objeto clave-valor → convertir a bloques text
      blocks = [];
      Object.keys(data.content_json).forEach(function(key) {
        blocks.push({ type: 'text', props: { title: key, content: String(data.content_json[key] || '') } });
      });
    } else {
      blocks = [];
    }

    if (blocks.length === 0) {
      container.innerHTML = '<div class="dynamic-empty">Página sin contenido configurado.</div>';
      return;
    }

    blocks.forEach(function(block) {
      var el = renderBlock(block);
      if (el) container.appendChild(el);
    });

    fillTOCBlocks(container);
  }

  // =========================================================
  // Tabla de contenido (dropdown) — bloque dinámico
  // =========================================================

  function slugify(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Recoge los h1/h2 estructurales de la página y les asigna id de ancla
  function collectTOCItems(container) {
    if (!container) return [];
    var headings = container.querySelectorAll('h1, h2');

    // Contenedores de contenido cuyo encabezado NO debe aparecer en el TOC
    var skipClosest = '.cards-grid, .product-carousel-new, .pc-info, .package-card, .package-col, ' +
      '.testimonial-card, .testimonial-item, .event-card, .service-card, .faq-container, .dynamic-form';

    var items = [];
    var seen = {};
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (h.closest && h.closest(skipClosest)) continue;
      var txt = (h.textContent || '').trim();
      if (!txt) continue;
      var base = slugify(txt) || 'seccion';
      var id = base;
      var n = 2;
      while (seen[id]) { id = base + '-' + n++; }
      seen[id] = true;
      h.id = id;
      items.push({ level: h.tagName === 'H1' ? 1 : 2, text: txt, id: id });
    }
    return items;
  }

  // Construye la lista anidada del TOC (H1 → nivel 1, H2 → subnivel)
  function buildTOCList(items) {
    if (!items || items.length < 2) return '';
    var html = '<ul>';
    var inSub = false;
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (it.level === 1) {
        if (inSub) { html += '</ul></li>'; inSub = false; }
        html += '<li><a href="#' + it.id + '">' + esc(it.text) + '</a>';
        var next = items[j + 1];
        if (next && next.level === 2) { html += '<ul>'; inSub = true; }
        else { html += '</li>'; }
      } else {
        html += '<li><a href="#' + it.id + '">' + esc(it.text) + '</a></li>';
      }
    }
    if (inSub) { html += '</ul></li>'; }
    html += '</ul>';
    return html;
  }

  // Render del bloque "Tabla de contenido": placeholder que se completa al final
  function renderTOC(props) {
    return sectionWrapper('toc', '<div class="dynamic-toc toc-collapsed" data-toc-slot></div>', props.bg_color);
  }

  // Rellena los placeholders .block-toc con la tabla de contenido de toda la página
  function fillTOCBlocks(container) {
    if (!container) return;
    var slots = container.querySelectorAll('.block-toc [data-toc-slot]');
    if (!slots.length) return;

    var items = collectTOCItems(container);
    var listHTML = buildTOCList(items);
    if (!listHTML) {
      slots.forEach(function(s) { s.closest('.block-toc').style.display = 'none'; });
      return;
    }

    var svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line>' +
      '<line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';

    slots.forEach(function(slot) {
      slot.innerHTML =
        '<div class="toc-title-row">' +
          '<p class="toc-title">Tabla de contenido</p>' +
          '<button type="button" class="toc-toggle" aria-label="Alternar tabla de contenido" title="Tabla de contenido">' + svgIcon + '</button>' +
        '</div>' +
        '<nav>' + listHTML + '</nav>';
      slot.querySelector('.toc-toggle').addEventListener('click', function() {
        slot.classList.toggle('toc-collapsed');
      });
    });
  }

  // =========================================================
  // Renderizador de bloques dinámicos
  // =========================================================

  function renderBlock(block) {
    if (!block || !block.type) return null;
    switch (block.type) {
      case 'hero': return renderHero(block.props);
      case 'text': return renderText(block.props);
      case 'cards': return renderCards(block.props);
      case 'image': return renderImage(block.props);
      case 'gallery': return renderGallery(block.props);
      case 'video': return renderVideo(block.props);
      case 'product-carousel': return renderProductCarouselBlock(block.props);
      case 'packages': return renderPackages(block.props);
      case 'testimonials': return renderTestimonials(block.props);
      case 'contact-form': return renderContactForm(block.props);
      case 'cta': return renderCTA(block.props);
      case 'spacer': return renderSpacer(block.props);
      case 'section-header': return renderSectionHeader(block.props);
      case 'faq': return renderFAQ(block.props);
      case 'toc': return renderTOC(block.props);
      case 'whatsapp': return renderWhatsApp(block.props);
      default: return null;
    }
  }

  function sectionWrapper(className, inner, bgColor) {
    var sec = document.createElement('section');
    sec.className = 'dynamic-block block-' + className;
    if (bgColor) { sec.style.background = bgColor; }
    sec.innerHTML = inner;
    return sec;
  }

  function renderHero(props) {
    var isVideo = props.bg_type === 'video' && props.bg_url;
    var bgStyle = (!isVideo && props.bg_url) ? 'background-image:url(' + escapeAttr(props.bg_url) + ');' : '';

    var bgEl;
    if (isVideo) {
      bgEl = '<video class="hero-bg-video" autoplay muted loop playsinline><source src="' + escapeAttr(props.bg_url) + '" type="video/mp4"></video>';
    } else {
      bgEl = '<div class="hero-bg-sticky" style="' + bgStyle + '"></div>';
    }

    var heading = props.title ? '<h1>' + esc(props.title) + '</h1>' : '';
    var sub = props.subtitle ? '<p>' + esc(props.subtitle) + '</p>' : '';

    return sectionWrapper('hero',
      bgEl +
      '<div class="hero-overlay"></div>' +
      '<div class="hero-content">' + heading + sub +
      (props.button_text ? '<a href="' + escapeAttr(props.button_link || '#') + '" class="btn-hero ' + btnStyleClass(props.button_style) + '">' + esc(props.button_text) + '</a>' : '') +
      '</div>',
      props.bg_color
    );
  }

  function renderText(props) {
    // El bloque "Texto" se anuncia como contenido enriquecido, así que
    // permitimos HTML básico. El contenido es inyectado por admins
    // autenticados vía Cloudflare Access; sanitizamos tags peligrosos
    // como defensa en profundidad.
    var safeHtml = sanitizeRichText(props.content || '');
    var sec = sectionWrapper('text',
      '<h2 class="block-text-title">' + esc(props.title) + '</h2>' +
      '<div class="block-text-content">' + safeHtml + '</div>',
      props.bg_color
    );
    // Posicionamiento libre: márgenes negativos permiten superposición
    if (props.margin_top) { sec.style.marginTop = parseInt(props.margin_top) + 'px'; }
    if (props.margin_bottom) { sec.style.marginBottom = parseInt(props.margin_bottom) + 'px'; }
    sec.style.position = 'relative';
    sec.style.zIndex = '1';
    return sec;
  }

  /** Sanitiza HTML para contenido enriquecido: elimina <script>, <iframe>,
   *  event handlers inline, y el esquema javascript: en links. */
  function sanitizeRichText(html) {
    if (!html) return '';
    var div = document.createElement('div');
    div.innerHTML = html;
    // Eliminar tags peligrosos
    var dangerous = div.querySelectorAll('script, iframe, object, embed, form, input, link[rel="stylesheet"]');
    for (var i = 0; i < dangerous.length; i++) {
      dangerous[i].parentNode.removeChild(dangerous[i]);
    }
    // Eliminar event handlers inline y javascript: en todos los elementos
    var all = div.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      // Limpiar atributos que empiezan con "on"
      var attrs = el.attributes;
      for (var k = attrs.length - 1; k >= 0; k--) {
        var name = attrs[k].name.toLowerCase();
        if (/^on/i.test(name)) {
          el.removeAttribute(name);
        }
      }
      // Bloquear javascript: en href
      var href = el.getAttribute('href');
      if (href && /^\s*javascript:/i.test(href)) {
        el.setAttribute('href', '#');
      }
    }
    return div.innerHTML;
  }

  function renderCards(props) {
    var title = props.section_title ? '<h2 class="block-section-title">' + esc(props.section_title) + '</h2>' : '';
    var cardsHtml = '';
    var cards = Array.isArray(props.cards) ? props.cards : [];
    cards.forEach(function(card) {
      cardsHtml += '<div class="card-item">' +
        (card.image ? '<img src="' + escapeAttr(card.image) + '" alt="' + esc(card.title) + '" class="card-img" loading="lazy" decoding="async">' : '') +
        '<h3>' + esc(card.title) + '</h3>' +
        '<p>' + esc(card.description) + '</p>' +
        (card.link ? '<a href="' + escapeAttr(card.link) + '" class="card-link ' + btnStyleClass(props.button_style) + '">Ver más</a>' : '') +
        '</div>';
    });
    return sectionWrapper('cards', title + '<div class="cards-grid cards-' + cards.length + '">' + cardsHtml + '</div>', props.bg_color);
  }

  function renderImage(props) {
    var img = '<img src="' + escapeAttr(props.url) + '" alt="' + esc(props.alt || '') + '" class="block-full-image" loading="lazy" decoding="async">';
    var caption = props.caption ? '<p class="block-image-caption">' + esc(props.caption) + '</p>' : '';
    return sectionWrapper('image', img + caption, props.bg_color);
  }

  function renderGallery(props) {
    var title = props.section_title ? '<h2 class="block-section-title">' + esc(props.section_title) + '</h2>' : '';
    var imagesHtml = '';
    var images = Array.isArray(props.images) ? props.images : [];
    images.forEach(function(img) {
      imagesHtml += '<div class="gallery-item"><img src="' + escapeAttr(img.url) + '" alt="' + esc(img.alt || '') + '" loading="lazy" decoding="async"></div>';
    });
    return sectionWrapper('gallery', title + '<div class="gallery-grid">' + imagesHtml + '</div>', props.bg_color);
  }

  function renderVideo(props) {
    var embed = '';
    if (props.url) {
      embed = '<div class="video-container"><iframe src="' + escapeAttr(props.url) + '" frameborder="0" allowfullscreen></iframe></div>';
    }
    var title = props.title ? '<h2 class="block-section-title">' + esc(props.title) + '</h2>' : '';
    return sectionWrapper('video', title + embed, props.bg_color);
  }

  function renderProductCarouselBlock(props) {
    var sec = sectionWrapper('product-carousel', '<h2 class="block-section-title">' + esc(props.section_title || 'Productos') + '</h2><div class="product-carousel-new"></div>', props.bg_color);
    var container = sec.querySelector('.product-carousel-new');
    // Compat: bloques creados antes de esta feature no tienen "mode" — se
    // comportan igual que siempre (fetch por categoría).
    var mode = props.mode || 'category';
    setTimeout(function() {
      if (mode === 'manual') {
        renderManualCarousel(container, Array.isArray(props.slides) ? props.slides : []);
      } else {
        initDynamicProductCarousel(container, props.max_items, props.category);
      }
    }, 0);
    return sec;
  }

  function renderPackages(props) {
    var title = props.section_title ? '<h2 class="block-section-title">' + esc(props.section_title) + '</h2>' : '';
    var sec = sectionWrapper('packages', title + '<div class="packages-grid-dynamic"></div>', props.bg_color);
    fetchPackagesForDynamic(sec.querySelector('.packages-grid-dynamic'), props.button_style);
    return sec;
  }

  function renderTestimonials(props) {
    var title = props.section_title ? '<h2 class="block-section-title">' + esc(props.section_title) + '</h2>' : '';
    var testimonials = Array.isArray(props.testimonials) ? props.testimonials : [];
    var html = '';
    testimonials.forEach(function(t) {
      html += '<div class="testimonial-item"><p>' + esc(t.text) + '</p><span>' + esc(t.author) + '</span></div>';
    });
    return sectionWrapper('testimonials', title + '<div class="testimonials-slider">' + html + '</div>', props.bg_color);
  }

  function renderContactForm(props) {
    var title = props.title ? '<h2 class="block-section-title">' + esc(props.title) + '</h2>' : '';
    var desc = props.description ? '<p>' + esc(props.description) + '</p>' : '';
    var formHtml = '<form class="contact-form-dynamic">' +
      '<input type="text" name="customer_name" placeholder="Nombre" required>' +
      '<input type="email" name="email" placeholder="Correo" required>' +
      '<input type="tel" name="phone" placeholder="Teléfono">' +
      '<textarea name="notes" placeholder="Mensaje" required></textarea>' +
      '<button type="submit" class="' + btnStyleClass(props.button_style) + '">Enviar</button>' +
      '<div class="contact-form-status"></div>' +
      '</form>';
    var sec = sectionWrapper('contact-form', title + desc + formHtml, props.bg_color);
    initDynamicContactForm(sec.querySelector('.contact-form-dynamic'));
    return sec;
  }

  function initDynamicContactForm(form) {
    if (!form) return;
    var statusEl = form.querySelector('.contact-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var customerName = form.querySelector('[name="customer_name"]').value.trim();
      var email = form.querySelector('[name="email"]').value.trim();
      var phone = form.querySelector('[name="phone"]').value.trim();
      var notes = form.querySelector('[name="notes"]').value.trim();

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      statusEl.className = 'contact-form-status';
      statusEl.textContent = '';

      fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          email: email,
          phone: phone,
          notes: notes
        })
      })
        .then(function(r) {
          if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Error del servidor'); });
          return r.json();
        })
        .then(function() {
          statusEl.className = 'contact-form-status success';
          statusEl.textContent = 'Mensaje enviado. ¡Gracias!';
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar';
        })
        .catch(function(err) {
          statusEl.className = 'contact-form-status error';
          statusEl.textContent = err.message || 'Error al enviar. Intenta de nuevo.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar';
        });
    });
  }

  function renderCTA(props) {
    var bg = props.bg_color ? 'background:' + escapeAttr(props.bg_color) + ';' : '';
    return sectionWrapper('cta',
      '<div class="cta-inner" style="' + bg + '">' +
      '<h2>' + esc(props.title) + '</h2>' +
      '<p>' + esc(props.subtitle) + '</p>' +
      (props.button_text ? '<a href="' + escapeAttr(props.button_link || '#') + '" class="btn-cta ' + btnStyleClass(props.button_style) + '">' + esc(props.button_text) + '</a>' : '') +
      '</div>',
      props.bg_color
    );
  }

  function renderSpacer(props) {
    var style = props.style || '0';
    var h = parseInt(props.height) || 40;

    // Estilo 0: simple (solo espacio vertical)
    if (style === '0') {
      var div = document.createElement('div');
      div.className = 'dynamic-spacer';
      div.style.height = h + 'px';
      if (props.bg_color) { div.style.background = props.bg_color; }
      return div;
    }

    // Contenedor común para estilos visuales
    var wrap = document.createElement('div');
    wrap.className = 'dynamic-spacer spacer-visual';
    wrap.style.height = h + 'px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.overflow = 'hidden';
    if (props.bg_color) { wrap.style.background = props.bg_color; }

    // Estilo 1: bits de sonido pixelados (cuadritos tipo ecualizador)
    if (style === '1') {
      var bitsContainer = document.createElement('div');
      bitsContainer.style.cssText = 'display:flex;align-items:flex-end;gap:3px;height:24px;';
      var bitHeights = [4, 10, 3, 12, 2, 14, 5, 10, 3, 8, 4, 12, 2, 7, 4, 9, 2, 6];
      for (var b = 0; b < bitHeights.length; b++) {
        var bit = document.createElement('div');
        bit.style.cssText = 'width:3px;height:' + bitHeights[b] + 'px;border-radius:1px;background:#1db954;opacity:' + (0.2 + (bitHeights[b] / 60)) + ';transition:height 0.3s;';
        bitsContainer.appendChild(bit);
      }
      wrap.appendChild(bitsContainer);
      return wrap;
    }

    // Estilo 2: línea lumínica delgada (verde neón con glow)
    if (style === '2') {
      var line = document.createElement('div');
      line.style.cssText = 'width:70%;max-width:400px;height:1px;background:linear-gradient(to right, transparent 0%, rgba(29,185,84,0.7) 20%, rgba(29,185,84,0.7) 80%, transparent 100%);box-shadow:0 0 6px rgba(29,185,84,0.35);border-radius:1px;';
      wrap.appendChild(line);
      return wrap;
    }

    // Estilo 3: línea semigruesa translúcida (~4px)
    if (style === '3') {
      var thick = document.createElement('div');
      thick.style.cssText = 'width:50%;max-width:400px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;';
      wrap.appendChild(thick);
      return wrap;
    }

    // Estilo 4: línea semidelgada translúcida (~1px)
    if (style === '4') {
      var thin = document.createElement('div');
      thin.style.cssText = 'width:50%;max-width:400px;height:1px;background:rgba(255,255,255,0.08);border-radius:1px;';
      wrap.appendChild(thin);
      return wrap;
    }

    // Estilo 5: Espectro — barras verticales que cruzan ambos bloques
    // Inspirado en la imagen de referencia: barras tipo ecualizador que
    // ascienden y descienden desde una línea central cálida
    if (style === '5') {
      var specH = h; // usar altura completa
      var midY = specH / 2;

      // [altura_%, r, g, b, x_%, width_px, hacia_arriba]
      var bars = [
        // ámbar/naranja (izquierda 0-24%)
        [0.45, 179,129,45, 0, 2, true],   [0.32, 159,113,24, 2, 2, false],
        [0.55, 155,80,23, 4, 2, true],    [0.38, 177,144,44, 6, 2, false],
        [0.50, 171,130,60, 8, 2, true],   [0.28, 201,173,133, 10, 2, false],
        [0.60, 236,166,65, 12, 2, true],  [0.42, 255,227,167, 14, 2, false],
        [0.35, 179,129,45, 16, 2, true],  [0.52, 159,113,24, 18, 2, false],
        [0.48, 177,144,44, 20, 2, true],  [0.30, 171,130,60, 22, 2, false],
        [0.58, 201,173,133, 24, 2, true],
        // transición ámbar→oliva (25-34%)
        [0.44, 145,115,35, 26, 2, false],[0.54, 133,127,30, 28, 2, true],
        [0.36, 120,108,28, 30, 2, false],[0.50, 105,98,21, 32, 2, true],
        [0.32, 133,142,47, 34, 2, false],
        // oliva (35-49%)
        [0.56, 123,143,52, 36, 2, true],  [0.40, 103,153,22, 38, 2, false],
        [0.48, 118,142,53, 40, 2, true],  [0.30, 92,142,7, 42, 2, false],
        [0.52, 105,130,30, 44, 2, true],  [0.38, 133,142,47, 46, 2, false],
        [0.44, 110,139,17, 48, 2, true],  [0.34, 123,143,52, 50, 2, false],
        // verde neón (51-69%)
        [0.50, 61,137,6, 52, 2, true],    [0.42, 63,186,97, 54, 2, false],
        [0.36, 27,164,44, 56, 2, true],   [0.54, 47,163,60, 58, 2, false],
        [0.46, 23,144,58, 60, 2, true],   [0.32, 30,179,87, 62, 2, false],
        [0.58, 39,158,78, 64, 2, true],   [0.40, 25,172,68, 66, 2, false],
        [0.52, 99,166,18, 68, 2, true],   [0.44, 32,91,51, 70, 2, false],
        // verde intenso (71-89%)
        [0.48, 51,175,88, 72, 2, true],   [0.36, 60,68,35, 74, 2, false],
        [0.56, 89,40,29, 76, 2, true],   [0.42, 47,163,60, 78, 2, false],
        [0.34, 63,186,97, 80, 2, true],  [0.52, 30,179,87, 82, 2, false],
        [0.46, 39,158,78, 84, 2, true],  [0.38, 25,172,68, 86, 2, false],
        [0.50, 99,166,18, 88, 2, true],  [0.44, 51,175,88, 90, 2, false],
        // borde derecho (91-99%)
        [0.40, 23,144,58, 92, 2, true],  [0.48, 32,91,51, 94, 2, false],
        [0.36, 60,68,35, 96, 2, true],   [0.52, 89,40,29, 98, 2, false],
      ];

      wrap.style.position = 'relative';

      // Línea central cálida con gradiente desvanecido en puntas (35% opacidad)
      var centerGlow = document.createElement('div');
      centerGlow.style.cssText =
        'position:absolute;left:0;width:100%;height:1px;' +
        'top:' + (midY - 0.5) + 'px;' +
        'background:linear-gradient(to right,' +
          'transparent 0%,' +
          'rgba(255,246,220,0.35) 10%,' +
          'rgba(255,255,183,0.35) 50%,' +
          'rgba(202,255,207,0.35) 90%,' +
          'transparent 100%);' +
        'box-shadow:0 0 6px rgba(255,246,220,0.12);' +
        'z-index:2;';
      wrap.appendChild(centerGlow);

      // Renderizar barras con puntas agudas (gradiente → transparente en la punta)
      bars.forEach(function(bar) {
        var ratio = bar[0];
        var r = bar[1], g = bar[2], b = bar[3];
        var xPct = bar[4];
        var widthPx = bar[5];
        var goesUp = bar[6];
        var barHeight = Math.round(specH * ratio);

        var barEl = document.createElement('div');
        // Gradiente que se desvanece en la punta para efecto agudo
        var gradient = goesUp
          ? 'linear-gradient(to top, rgba(' + r + ',' + g + ',' + b + ',0.35) 0%, rgba(' + r + ',' + g + ',' + b + ',0.35) 65%, transparent 100%)'
          : 'linear-gradient(to bottom, rgba(' + r + ',' + g + ',' + b + ',0.35) 0%, rgba(' + r + ',' + g + ',' + b + ',0.35) 65%, transparent 100%)';

        var styles =
          'position:absolute;' +
          'left:' + xPct + '%;' +
          'width:' + widthPx + 'px;' +
          'height:' + barHeight + 'px;' +
          'background:' + gradient + ';' +
          'z-index:1;';
        styles += goesUp
          ? 'bottom:' + midY + 'px;'
          : 'top:' + midY + 'px;';
        barEl.style.cssText = styles;
        wrap.appendChild(barEl);
      });

      return wrap;
    }

    // Fallback: simple
    var fb = document.createElement('div');
    fb.className = 'dynamic-spacer';
    fb.style.height = h + 'px';
    if (props.bg_color) { fb.style.background = props.bg_color; }
    return fb;
  }

  function renderWhatsApp(props) {
    // Usar el número del bloque, o fallback al de la landing page (settings)
    var phone = (props.phone || '').replace(/[^0-9]/g, '');
    if (!phone) phone = (siteSettings && siteSettings.whatsapp_number) ? siteSettings.whatsapp_number.replace(/[^0-9]/g, '') : '';
    if (!phone) {
      var empty = document.createElement('div');
      empty.style.display = 'none';
      return empty;
    }

    var message = props.message || 'Hola, quiero solicitar una cotización';
    var encodedMsg = encodeURIComponent(message);
    var waUrl = 'https://wa.me/' + phone + '?text=' + encodedMsg;

    var a = document.createElement('a');
    a.href = waUrl;
    a.className = 'whatsapp-float dynamic-whatsapp';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'WhatsApp');
    a.title = 'Contáctanos por WhatsApp';
    a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28">' +
      '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>' +
      '</svg>';

    return a;
  }

  function renderSectionHeader(props) {
    var icon = props.icon ? '<span class="section-header-icon">' + esc(props.icon) + '</span>' : '';
    var sec = sectionWrapper('section-header', icon + '<h2>' + esc(props.title) + '</h2>', props.bg_color);
    if (props.margin_top) { sec.style.marginTop = parseInt(props.margin_top) + 'px'; }
    if (props.margin_bottom) { sec.style.marginBottom = parseInt(props.margin_bottom) + 'px'; }
    sec.style.position = 'relative';
    sec.style.zIndex = '1';
    return sec;
  }

  // ========== FAQ: Preguntas Frecuentes con despliegue al scroll ==========
  function renderFAQ(props) {
    var faqs = Array.isArray(props.faqs) ? props.faqs : [];
    if (faqs.length === 0) {
      var empty = document.createElement('section');
      empty.className = 'dynamic-block block-faq';
      empty.innerHTML = '<div class="empty-state"><p>No hay preguntas configuradas.</p></div>';
      return empty;
    }

    var titleHTML = props.section_title
      ? '<h2 class="faq-section-title">' + esc(props.section_title) + '</h2>'
      : '';

    var bubblesHTML = faqs.map(function(faq, i) {
      // La primera burbuja siempre abre expandida por defecto (regla fija).
      // Se inyecta directo en el HTML para evitar condiciones de carrera
      // con el IntersectionObserver en escritorio.
      var preExpanded = (i === 0) ? ' expanded was-auto-expanded' : '';
      return '<article class="faq-bubble faq-animate-in' + preExpanded + '" data-faq-index="' + i + '">' +
        '<div class="faq-bubble-glow"></div>' +
        '<div class="faq-question-row">' +
          '<span class="faq-number">' + (i + 1) + '</span>' +
          '<span class="faq-question-text">' + esc(faq.question || '') + '</span>' +
          '<button class="faq-toggle-btn" aria-label="' + (faq.question ? 'Ver respuesta: ' + faq.question : 'Ver respuesta') + '" title="Ver respuesta">+</button>' +
        '</div>' +
        '<div class="faq-answer">' +
          '<p class="faq-answer-text">' + esc(faq.answer || '') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');

    var sec = sectionWrapper('faq', titleHTML + '<div class="faq-container">' + bubblesHTML + '</div>', props.bg_color);

    // Inicializar interacciones una vez que el section esté en el DOM
    setTimeout(function() {
      initFAQInteractions(sec);
    }, 0);

    return sec;
  }

  /**
   * Inicializa las interacciones de la sección FAQ:
   * - Mouse tracking para glow interior
   * - Botón "+" para toggle con cierre de cualquier otra burbuja abierta
   * - Animación de entrada stagger
   */
  function initFAQInteractions(section) {
    var container = section.querySelector('.faq-container');
    var bubbles = section.querySelectorAll('.faq-bubble');
    if (!container || bubbles.length === 0) return;

    // --- 1. Mouse tracking para glow interior (efecto Servicios) ---
    container.addEventListener('mousemove', function(e) {
      var rect = container.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      container.style.setProperty('--mouse-x', x + '%');
      container.style.setProperty('--mouse-y', y + '%');
    });

    container.addEventListener('mouseleave', function() {
      container.style.setProperty('--mouse-x', '50%');
      container.style.setProperty('--mouse-y', '50%');
    });

    // --- 2. Botón "+" — toggle con cierre inmediato de cualquier otra ---
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('.faq-toggle-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      var clickedBubble = btn.closest('.faq-bubble');
      if (!clickedBubble) return;

      if (clickedBubble.classList.contains('expanded')) {
        // Colapsar la cliqueada
        clickedBubble.classList.remove('expanded');
      } else {
        // Cerrar cualquier otra burbuja que esté expandida
        bubbles.forEach(function(b) {
          if (b !== clickedBubble) {
            b.classList.remove('expanded');
          }
        });
        // Expandir la cliqueada
        clickedBubble.classList.add('expanded');
      }
    });

    // --- 3. Animación de entrada stagger ---
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(function() {
        bubbles.forEach(function(bubble, i) {
          bubble.style.transitionDelay = (i * 0.08) + 's';
          bubble.classList.add('faq-visible');
        });

        var lastDelay = (bubbles.length - 1) * 0.08;
        var cleanupMs = (lastDelay + 0.5) * 1000 + 50;
        setTimeout(function() {
          bubbles.forEach(function(bubble) {
            bubble.style.transitionDelay = '';
          });
        }, cleanupMs);
      });
    } else {
      bubbles.forEach(function(bubble) {
        bubble.classList.add('faq-visible');
      });
    }
  }

  // ========== Carrusel dinámico de productos ==========
  function initDynamicProductCarousel(container, maxItems, category) {
    var existingInterval = container._carouselInterval;
    if (existingInterval) clearInterval(existingInterval);

    var fetchUrl = '/api/products?per_page=20&status=published';
    if (category) fetchUrl += '&category=' + encodeURIComponent(category);
    cachedFetch(fetchUrl)
      .then(function(products) {
        var items = Array.isArray(products) ? products : (products.products || []);
        if (maxItems && items.length > maxItems) items = items.slice(0, maxItems);
        if (items.length === 0) { container.innerHTML = '<p class="empty-text">No hay productos disponibles.</p>'; return; }

        var track = document.createElement('div');
        track.className = 'pc-track';
        items.forEach(function(prod) {
          var card = document.createElement('div');
          card.className = 'pc-card';
          card.innerHTML = '<img src="' + escapeAttr(prod.image_url || '') + '" alt="' + esc(prod.title) + '" loading="lazy" decoding="async">' +
            '<div class="pc-info"><h3>' + esc(prod.title) + '</h3><p>' + esc(prod.description || '') + '</p></div>';
          track.appendChild(card);
        });
        container.innerHTML = '';
        container.appendChild(track);

        var cards = track.querySelectorAll('.pc-card');
        var idx = 0;
        var total = cards.length;
        if (total === 0) return;
        function show(i) {
          track.style.transform = 'translateX(-' + (i * 100) + '%)';
        }
        show(0);
        container._carouselInterval = setInterval(function() {
          idx = (idx + 1) % total;
          show(idx);
        }, 3500);
      })
      .catch(function() {
        container.innerHTML = '<p class="empty-text">Error al cargar productos.</p>';
      });
  }

  // ========== Carrusel manual de productos (slides fijas del bloque) ==========
  function renderManualCarousel(container, slides) {
    var existingInterval = container._carouselInterval;
    if (existingInterval) clearInterval(existingInterval);

    if (!slides || slides.length === 0) {
      container.innerHTML = '<p class="empty-text">No hay slides configurados.</p>';
      return;
    }

    var track = document.createElement('div');
    track.className = 'pc-track';
    var html = '';
    slides.forEach(function(slide) {
      // Card completa clickeable cuando hay link: se envuelve en <a> en vez de <div>.
      var tag = slide.link ? 'a' : 'div';
      var hrefAttr = slide.link ? ' href="' + escapeAttr(slide.link) + '"' : '';
      html += '<' + tag + ' class="pc-card"' + hrefAttr + '>' +
        '<img src="' + escapeAttr(slide.image || '') + '" alt="' + esc(slide.title || '') + '" loading="lazy" decoding="async">' +
        '<div class="pc-info"><h3>' + esc(slide.title || '') + '</h3><p>' + esc(slide.description || '') + '</p></div>' +
        '</' + tag + '>';
    });
    track.innerHTML = html;
    container.innerHTML = '';
    container.appendChild(track);

    var cards = track.querySelectorAll('.pc-card');
    var idx = 0;
    var total = cards.length;
    if (total === 0) return;
    function show(i) {
      track.style.transform = 'translateX(-' + (i * 100) + '%)';
    }
    show(0);
    container._carouselInterval = setInterval(function() {
      idx = (idx + 1) % total;
      show(idx);
    }, 3500);
  }

  // ========== Fetch paquetes para bloque dinámico ==========
  function fetchPackagesForDynamic(container, buttonStyle) {
    cachedFetch('/api/packages?status=published')
      .then(function(packages) {
        var pkgs = Array.isArray(packages) ? packages : (packages.packages || []);
        if (pkgs.length === 0) { container.innerHTML = '<p class="empty-text">No hay paquetes disponibles.</p>'; return; }
        var html = '';
        pkgs.forEach(function(pkg) {
          var includes = [];
          try { includes = JSON.parse(pkg.includes_json || '[]'); } catch(e) {}
          html += '<div class="package-card-dynamic">' +
            '<h3>' + esc(pkg.name) + '</h3>' +
            '<div class="package-price">' + esc(pkg.price_range || '') + '</div>' +
            '<ul>' + includes.map(function(f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
            '<button class="btn-package-quote ' + btnStyleClass(buttonStyle) + '">Cotizar</button>' +
            '</div>';
        });
        container.innerHTML = html;
      })
      .catch(function() { container.innerHTML = '<p class="empty-text">Error al cargar paquetes.</p>'; });
  }

  // Utilidades para el renderizador de bloques
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(str) {
    if (!str) return '';
    var s = String(str).trim();
    if (/^(javascript|data):/i.test(s)) return '#';
    return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  /** Devuelve la clase CSS correspondiente al estilo de botón (1, 2, 3).
   *  Estilo 1 (default): sin clase extra → verde actual.
   *  Estilo 2: WhatsApp translúcido con glow.
   *  Estilo 3: Neón 70% opacidad + hover luminoso. */
  function btnStyleClass(style) {
    if (style === '2') return 'btn-style-whatsapp';
    if (style === '3') return 'btn-style-neon';
    return '';
  }

  // =========================================================
  // Inicialización
  // =========================================================

  /**
   * Corrige los enlaces internos hardcodeados a producción para que
   * funcionen con el origen actual (local o producción). Usa
   * window.__SITE_URL__ inyectado por el Worker como fuente de verdad.
   */
  function fixInternalLinks() {
    var siteUrl = window.__SITE_URL__ || window.location.origin;
    var PROD = 'https://stratonaudio.com.co';

    // Si ya estamos en el dominio de producción, no hay nada que corregir
    if (siteUrl === PROD) return;

    var links = document.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var rawHref = links[i].getAttribute('href');
      if (rawHref && rawHref.indexOf(PROD) === 0) {
        links[i].setAttribute('href', rawHref.replace(PROD, siteUrl));
      }
    }
  }

  async function init() {
    // Corregir enlaces internos antes de cualquier otra operación
    fixInternalLinks();

    // Si hay página dinámica inyectada por el Worker, renderizarla y salir
    if (window.__PAGE__) {
      renderDynamicPage(window.__PAGE__);
      initNav();
      return;
    }

    initNav();
    initCounters();
    initStatsBanner();
    initCartBarEvents();

    // Limitar fecha del evento a hoy en adelante
    var today = new Date().toISOString().split('T')[0];
    var eventDateInput = document.getElementById('event_date');
    if (eventDateInput) { eventDateInput.setAttribute('min', today); }

    // Cargar datos en paralelo
    const promises = [
      // loadMeta() deshabilitado: no existe página "home" en D1,
      // lo que genera 404 innecesario en consola.
      // Re-activar cuando se cree la página desde el panel admin.
      // loadMeta(),
      loadSettings(),
      loadServices(),
      loadProducts(),
      loadPackages(),
      loadEvents(),
      loadTestimonials(),
    ];

    await Promise.allSettled(promises);

    initContactForm();

  }

  /**
   * Desplaza suavemente a un elemento por su id, compensando la altura del
   * navbar fijo. Espera a que todas las imágenes dentro de la sección estén
   * cargadas antes de calcular la posición final, para evitar que el cambio
   * de altura post-carga desplace el destino.
   */
  async function scrollToHash(id) {
    if (!id) return;

    var target = document.getElementById(id);
    if (!target) return;

    // Esperar a que las imágenes de la sección estén completamente cargadas
    await waitForImages(target, 1500);

    // Doble requestAnimationFrame para asegurar que el navegador aplicó
    // layout/paint tras la carga de imágenes
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        // Re-obtener el target por si el DOM cambió
        var el = document.getElementById(id);
        if (!el) return;

        var navHeight = 72;
        try {
          var raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-height').trim();
          if (raw) {
            var parsed = parseInt(raw, 10);
            if (!isNaN(parsed)) navHeight = parsed;
          }
        } catch (e) { /* fallback a 72px */ }

        var top = el.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  }

  /**
   * Devuelve una Promise que se resuelve cuando todas las imágenes dentro de
   * `container` han terminado de cargar (éxito o error), o tras `timeoutMs`
   * milisegundos, lo que ocurra primero.
   */
  function waitForImages(container, timeoutMs) {
    var images = container.querySelectorAll('img');
    if (images.length === 0) return Promise.resolve();

    var pending = images.length;
    var timer;

    return new Promise(function (resolve) {
      function onDone() {
        pending--;
        if (pending === 0) {
          clearTimeout(timer);
          resolve();
        }
      }

      timer = setTimeout(resolve, timeoutMs);

      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        // Si ya está completa (caché del navegador), resolver inmediatamente
        if (img.complete) {
          onDone();
        } else {
          img.addEventListener('load', onDone, { once: true });
          img.addEventListener('error', onDone, { once: true });
        }
      }
    });
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Scroll al hash después de que la página haya terminado de cargar
  // todos sus recursos (imágenes, CSS, etc.), cuando las alturas de las
  // secciones ya son definitivas. El setTimeout de 200ms es una red de
  // seguridad para ajustes de layout posteriores al evento load.
  window.addEventListener('load', function() {
    if (window.location.hash) {
      setTimeout(function() {
        scrollToHash(window.location.hash.substring(1));
      }, 200);
    }
  });

  // =========================================================
  // Eventos del carrusel de galería (delegación)
  // =========================================================
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (target.classList.contains('gallery-prev') || target.classList.contains('gallery-next') || target.classList.contains('gallery-dot')) {
      var container = target.closest('.product-gallery');
      if (!container) return;
      var urls = JSON.parse(container.getAttribute('data-gallery-urls').replace(/&quot;/g, '"'));
      var current = parseInt(container.getAttribute('data-gallery-current'));
      var total = urls.length;
      var newIndex;

      if (target.classList.contains('gallery-prev')) {
        newIndex = (current - 1 + total) % total;
      } else if (target.classList.contains('gallery-next')) {
        newIndex = (current + 1) % total;
      } else {
        newIndex = parseInt(target.getAttribute('data-index'));
      }

      container.setAttribute('data-gallery-current', newIndex);
      container.querySelector('img').src = urls[newIndex];
      container.querySelector('.gallery-counter').textContent = (newIndex + 1) + '/' + total;

      var dots = container.querySelectorAll('.gallery-dot');
      dots.forEach(function(dot, i) {
        dot.style.background = i === newIndex ? 'var(--color-accent)' : 'var(--color-border)';
      });
    }
  });

// ⚠️ PROTEGIDO: No eliminar esta función. Controla la barra de estadísticas debajo del Hero.
function initStatsBanner() {
  var banner = document.getElementById('statsBanner');
  if (!banner) return;

  function animateCounter(counter) {
    var target = parseInt(counter.getAttribute('data-target'));
    var duration = 2000;
    var step = target / (duration / 16);
    var current = 0;
    var timer = setInterval(function() {
      current += step;
      if (current >= target) {
        counter.textContent = target;
        clearInterval(timer);
      } else {
        counter.textContent = Math.floor(current);
      }
    }, 16);
  }

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        banner.classList.add('animate');
        var counters = banner.querySelectorAll('.counter');
        counters.forEach(function(counter, index) {
          setTimeout(function() { animateCounter(counter); }, index * 200);
        });
        observer.unobserve(banner);
      }
    });
  }, { threshold: 0.5 });

  observer.observe(banner);
}

})();

window.handleContactSubmit = async function(event) {
  event.preventDefault();

  var form = document.getElementById('quotationForm');
  if (!form) return;

  var customer_name = form.querySelector('[name="customer_name"]').value.trim();
  var email = form.querySelector('[name="email"]').value.trim();
  var phone = form.querySelector('[name="phone"]').value.trim();

  if (!customer_name || !email || !phone) {
    alert('Por favor, completa los campos obligatorios (Nombre, Email, Teléfono).');
    return;
  }

  var submitBtn = document.getElementById('formSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
  }

  try {
    var response = await fetch('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customer_name,
        email: email,
        phone: phone,
        company: form.querySelector('[name="company"]').value.trim() || null,
        city: form.querySelector('[name="city"]').value.trim() || null,
        event_date: form.querySelector('[name="event_date"]').value || null,
        notes: form.querySelector('[name="notes"]').value.trim() || null,
        products_json: (window.cartItems && window.cartItems.length > 0) ? JSON.stringify(window.cartItems) : null
      })
    });

    if (!response.ok) throw new Error('Error del servidor');

    form.innerHTML = '<div class="form-success"><div class="form-success-icon">✓</div><h3>¡Solicitud enviada!</h3><p>Recibirás una respuesta personalizada en las próximas 24 horas hábiles.</p></div>';
  } catch (err) {
    console.error('Error al enviar cotización:', err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar solicitud de cotización';
    }
    alert('Error al enviar. Intenta de nuevo o contáctanos por WhatsApp.');
  }
};
