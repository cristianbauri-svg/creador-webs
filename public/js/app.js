/**
 * Straton Audio — App principal
 * Maneja la carga dinámica de datos desde la API, animaciones,
 * formulario de cotización y navegación.
 */

(function () {
  'use strict';

  // =========================================================
  // Carrito de Cotización — estado global
  // =========================================================
  var cartItems = [];

  function loadCartFromStorage() {
    try {
      var stored = localStorage.getItem('straton_cart');
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) cartItems = parsed;
      }
    } catch(e) {
      cartItems = [];
    }
  }

  function saveCartToStorage() {
    try {
      localStorage.setItem('straton_cart', JSON.stringify(cartItems));
    } catch(e) {}
  }

  function addToCart(item) {
    cartItems.push(item);
    saveCartToStorage();
    renderCartPanel();
    updateCartCounter();
  }

  function removeFromCart(index) {
    if (index >= 0 && index < cartItems.length) {
      cartItems.splice(index, 1);
      saveCartToStorage();
      renderCartPanel();
      updateCartCounter();
    }
  }

  function renderCartPanel() {
    var itemsContainer = $('#cartPanelItems');
    var emptyState = $('#cartPanelEmpty');
    var footer = $('#cartPanelFooter');

    if (cartItems.length === 0) {
      itemsContainer.innerHTML = '';
      emptyState.style.display = '';
      footer.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    footer.style.display = '';

    itemsContainer.innerHTML = cartItems.map(function(item, i) {
      var itemImage = item.image
        ? '<img src="' + escapeHtml(item.image) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;" />'
        : '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--color-surface);border-radius:4px;flex-shrink:0;font-size:1.2rem;">📦</div>';
      var typeBadge = item.type === 'product'
        ? '<span style="display:inline-block;padding:0.1rem 0.35rem;border-radius:100px;font-size:0.6rem;font-weight:600;text-transform:uppercase;background:rgba(0,0,0,0.75);border:1px solid var(--color-gold);color:var(--color-gold);">Producto</span>'
        : '<span style="display:inline-block;padding:0.1rem 0.35rem;border-radius:100px;font-size:0.6rem;font-weight:600;text-transform:uppercase;background:rgba(0,0,0,0.75);border:1px solid var(--color-gold);color:var(--color-accent);">Paquete</span>';
      return '<div class="cart-item">' +
        itemImage +
        '<div class="cart-item-info">' +
          '<p class="cart-item-name">' + escapeHtml(item.name) + '</p>' +
          '<p class="cart-item-type">' + typeBadge + '</p>' +
        '</div>' +
        '<button class="cart-item-remove" data-cart-remove="' + i + '" title="Eliminar">&times;</button>' +
      '</div>';
    }).join('');
  }

  function updateCartCounter() {
    var counter = $('#cartCounter');
    if (cartItems.length > 0) {
      counter.textContent = cartItems.length;
      counter.style.display = 'flex';
    } else {
      counter.style.display = 'none';
    }
  }

  function toggleCartPanel() {
    var panel = $('#cartPanel');
    var overlay = $('#cartOverlay');
    var isOpen = panel.classList.contains('open');
    if (isOpen) {
      panel.classList.remove('open');
      overlay.classList.remove('open');
    } else {
      panel.classList.add('open');
      overlay.classList.add('open');
    }
  }

  // =========================================================
  // Utilidades
  // =========================================================
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
  const API_BASE = '';

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
      if (settings.social_instagram) {
        const social = $('#footerSocial');
        social.innerHTML +=
          `<a href="${escapeHtml(settings.social_instagram)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">📷</a>`;
      }
      if (settings.social_facebook) {
        const social = $('#footerSocial');
        social.innerHTML +=
          `<a href="${escapeHtml(settings.social_facebook)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">👍</a>`;
      }
      if (settings.social_tiktok) {
        const social = $('#footerSocial');
        social.innerHTML +=
          `<a href="${escapeHtml(settings.social_tiktok)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok">♪</a>`;
      }

      return settings;
    } catch (err) {
      console.warn('Error cargando settings:', err);
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
      console.debug('Meta tags: usando defaults (no hay página home aún)');
    }
  }

  // =========================================================
  // Cargar Servicios
  // =========================================================
  async function loadServices() {
    const container = $('#servicesContainer');
    try {
      const services = await apiFetch('/api/services?status=published');

      if (!services || services.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎵</div>
            <h3>Próximamente</h3>
            <p>Estamos preparando nuestra oferta de servicios. Muy pronto estará disponible.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = services.map(s => {
        const imgHtml = s.image_url
          ? `<img class="service-card-image" src="${escapeHtml(s.image_url)}" alt="${escapeHtml(s.title)}" loading="eager" />`
          : '';
        return `
        <article class="service-card animate-in">
          ${imgHtml}
          <div class="service-card-body">
            <h3>${escapeHtml(s.title)}</h3>
            <p>${escapeHtml(s.description || '')}</p>
          </div>
        </article>`;
      }).join('');

      initAnimations();
    } catch (err) {
      console.error('Error cargando servicios:', err);
      container.innerHTML = `
        <div class="error-state">
          <p>No se pudieron cargar los servicios. Verifica la conexión.</p>
        </div>
      `;
    }
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

      container.innerHTML = products.map(p => {
        var imgHtml = p.image_url
          ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" loading="lazy" style="width:100%;height:200px;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />`
          : '';
        var placeholder = !p.image_url
          ? `<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:var(--color-surface);color:var(--color-text-muted);font-size:2.5rem;">📦</div>`
          : `<div style="width:100%;height:200px;display:none;align-items:center;justify-content:center;background:var(--color-surface);color:var(--color-text-muted);font-size:2.5rem;">📦</div>`;
        var typeBadge = p.service_type === 'Alquiler'
          ? `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:100px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;background:rgba(0,0,0,0.75);border:1px solid var(--color-gold);color:var(--color-gold);">Alquiler</span>`
          : `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:100px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;background:rgba(0,0,0,0.75);border:1px solid var(--color-gold);color:var(--color-accent);">Venta</span>`;
        var categoryBadge = p.category
          ? `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:100px;font-size:0.65rem;font-weight:500;background:rgba(0,0,0,0.75);border:1px solid var(--color-gold);color:var(--color-text-secondary);">${escapeHtml(p.category)}</span>`
          : '';

        var galleryUrls = [];
        if (p.gallery_json) {
          try { var g = JSON.parse(p.gallery_json); if (Array.isArray(g)) galleryUrls = g; } catch(e) {}
        }

        var galleryHtml = '';
        if (galleryUrls.length > 0) {
          var galleryId = 'gallery-' + (p.id || Math.random().toString(36).substr(2));
          var urlsJson = JSON.stringify(galleryUrls).replace(/"/g, '&quot;');
          galleryHtml = '<div class="product-gallery" style="position:relative;margin-top:0.75rem;" data-gallery-id="' + galleryId + '" data-gallery-urls="' + urlsJson + '" data-gallery-current="0">' +
            '<div style="position:relative;overflow:hidden;border-radius:var(--radius);background:var(--color-surface);">' +
              '<img src="' + escapeHtml(galleryUrls[0]) + '" alt="" style="width:100%;height:180px;object-fit:cover;display:block;" />' +
              '<span class="gallery-counter" style="position:absolute;top:0.5rem;right:0.5rem;background:rgba(0,0,0,0.6);color:#fff;font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:100px;">1/' + galleryUrls.length + '</span>' +
              (galleryUrls.length > 1 ? '<button class="gallery-prev" style="position:absolute;left:0.5rem;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;">◀</button>' : '') +
              (galleryUrls.length > 1 ? '<button class="gallery-next" style="position:absolute;right:0.5rem;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;">▶</button>' : '') +
            '</div>' +
            (galleryUrls.length > 1 ? '<div style="display:flex;justify-content:center;gap:6px;margin-top:0.5rem;">' + galleryUrls.map(function(_, i) { return '<span class="gallery-dot" style="width:8px;height:8px;border-radius:50%;background:' + (i === 0 ? 'var(--color-accent)' : 'var(--color-border)') + ';cursor:pointer;" data-index="' + i + '"></span>'; }).join('') + '</div>' : '') +
          '</div>';
        }

        return `
        <article class="service-card animate-in" style="display:flex;flex-direction:column;">
          <div style="position:relative;overflow:hidden;">
            ${imgHtml}
            ${placeholder}
            <div style="position:absolute;top:0.5rem;left:0.5rem;display:flex;gap:0.35rem;flex-wrap:wrap;">
              ${categoryBadge}
              ${typeBadge}
            </div>
          </div>
          <div class="service-card-body" style="flex:1;display:flex;flex-direction:column;">
            <h3>${escapeHtml(p.title)}</h3>
            <p style="flex:1;">${escapeHtml(p.description || '')}</p>
            ${p.features ? `<ul style="list-style:none;padding:0;margin:0.5rem 0 0 0;flex:1;">
              ${p.features.split('\n').filter(function(f){return f.trim()!=='';}).map(function(f){
                return `<li style="display:flex;align-items:flex-start;gap:0.4rem;margin-bottom:0.25rem;font-size:0.8rem;color:var(--color-text-muted);">
                  <span style="color:var(--color-accent);font-weight:700;flex-shrink:0;">•</span>
                  <span>${escapeHtml(f.trim())}</span>
                </li>`;
              }).join('')}
            </ul>` : ''}
            <button data-add-to-cart="${JSON.stringify({type:'product',id:p.id,name:p.title,image:p.image_url||''}).replace(/"/g,'&quot;')}" class="btn btn-primary" style="margin-top:var(--space-4);align-self:flex-start;">Añadir a cotización</button>
            ${galleryHtml}
          </div>
        </article>`;
      }).join('');

      initAnimations();
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
        // Primer paquete como featured si hay varios
        html += packages.map((pkg, i) => {
          let includes = [];
          try {
            includes = typeof pkg.includes_json === 'string'
              ? JSON.parse(pkg.includes_json)
              : (pkg.includes_json || []);
          } catch { includes = []; }

          return `
            <article class="package-card ${i === 0 ? 'featured' : ''} animate-in">
              <h3 class="package-name">${escapeHtml(pkg.name)}</h3>
              <p class="package-description">${escapeHtml(pkg.description || '')}</p>
              ${pkg.price_range ? `<div class="package-price">${escapeHtml(pkg.price_range)}</div>` : ''}
              <ul class="package-includes">
                ${includes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
              <button data-add-to-cart="${JSON.stringify({type:'package',id:pkg.id,name:pkg.name,image:''}).replace(/"/g,'&quot;')}" class="btn btn-primary">Añadir a cotización</button>
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
          <button data-add-to-cart='{"type":"package","id":"custom","name":"Paquete a la medida","image":""}' class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
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
          <button data-add-to-cart='{"type":"package","id":"custom","name":"Paquete a la medida","image":""}' class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
            Añadir a cotización
          </button>
        </article>
      `;
    }
  }

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

          return `
            <article class="event-card animate-in" data-type="${ev.event_type || ''}">
              <img class="event-card-image"
                   src="${escapeHtml(imgSrc)}"
                   alt="${escapeHtml(ev.title)}"
                   loading="lazy"
                   onerror="this.src='https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80'" />
              <div class="event-card-body">
                <span class="event-card-type">${typeLabels[ev.event_type] || ev.event_type || 'Evento'}</span>
                <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
                ${ev.solution ? `<p class="event-card-solution">${escapeHtml(ev.solution)}</p>` : ''}
                ${ev.result ? `<div class="event-card-result">${escapeHtml(ev.result)}</div>` : ''}
              </div>
            </article>
          `;
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
              <div class="testimonial-avatar">${initial}</div>
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
    const form = $('#quotationForm');
    const submitBtn = $('#formSubmit');
    const messages = $('#formMessages');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validación simple
      const fields = {
        customer_name: form.customer_name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
      };

      // Limpiar errores previos
      $$('.form-error', form).forEach(el => el.remove());

      let hasError = false;
      if (!fields.customer_name) {
        showFieldError(form.customer_name, 'El nombre es obligatorio');
        hasError = true;
      }
      if (!fields.email) {
        showFieldError(form.email, 'El correo es obligatorio');
        hasError = true;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
        showFieldError(form.email, 'Correo inválido');
        hasError = true;
      }
      if (!fields.phone) {
        showFieldError(form.phone, 'El teléfono es obligatorio');
        hasError = true;
      }

      if (hasError) return;

      // Enviar
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        await apiFetch('/api/quotations', {
          method: 'POST',
          body: JSON.stringify({
            customer_name: fields.customer_name,
            email: fields.email,
            phone: fields.phone,
            company: form.company.value.trim() || null,
            city: form.city.value.trim() || null,
            event_date: form.event_date.value ? form.event_date.value.split('-').reverse().join('-') : null,
            notes: form.notes.value.trim() || null,
            products_json: cartItems.length > 0 ? JSON.stringify(cartItems) : null,
          }),
        });

        // Éxito
        form.innerHTML = `
          <div class="form-success">
            <div class="form-success-icon">✓</div>
            <h3>¡Solicitud enviada!</h3>
            <p>Recibirás una respuesta personalizada en las próximas 24 horas hábiles.</p>
          </div>
        `;
      } catch (err) {
        console.error('Error al enviar cotización:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar solicitud de cotización';
        messages.innerHTML = `<p style="color: #ff4444; font-size: var(--text-sm);">Error al enviar. Intenta de nuevo o contáctanos por WhatsApp.</p>`;
      }
    });

    function showFieldError(input, message) {
      const error = document.createElement('div');
      error.className = 'form-error';
      error.textContent = message;
      input.parentNode.appendChild(error);
      input.style.borderColor = '#ff4444';
      input.addEventListener('input', () => {
        input.style.borderColor = '';
        const err = input.parentNode.querySelector('.form-error');
        if (err) err.remove();
      }, { once: true });
    }
  }

  // =========================================================
  // Inicialización
  // =========================================================
  async function init() {
    initNav();
    initCounters();

    // Inicializar carrito desde localStorage
    loadCartFromStorage();
    updateCartCounter();

    // Limitar fecha del evento a hoy en adelante
    var today = new Date().toISOString().split('T')[0];
    var eventDateInput = document.getElementById('event_date');
    if (eventDateInput) { eventDateInput.setAttribute('min', today); }

    // Event listeners del carrito
    var cartToggle = $('#cartToggle');
    var cartPanelClose = $('#cartPanelClose');
    var cartOverlay = $('#cartOverlay');

    if (cartToggle) cartToggle.addEventListener('click', toggleCartPanel);
    if (cartPanelClose) cartPanelClose.addEventListener('click', toggleCartPanel);
    if (cartOverlay) cartOverlay.addEventListener('click', toggleCartPanel);

    // Listener delegado para añadir al carrito
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-add-to-cart]');
      if (!btn) return;
      e.preventDefault();
      try {
        var item = JSON.parse(btn.getAttribute('data-add-to-cart').replace(/&quot;/g, '"'));
        addToCart(item);
        // Abrir el panel para feedback visual
        var panel = $('#cartPanel');
        if (panel && !panel.classList.contains('open')) {
          toggleCartPanel();
        }
      } catch(err) {
        console.error('Error al añadir al carrito:', err);
      }
    });

    // Listener delegado para eliminar del carrito
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cart-remove]');
      if (!btn) return;
      e.preventDefault();
      var index = parseInt(btn.getAttribute('data-cart-remove'));
      removeFromCart(index);
    });

    // Cargar datos en paralelo
    const promises = [
      loadMeta(),
      loadSettings(),
      loadServices(),
      loadProducts(),
      loadPackages(),
      loadEvents(),
      loadTestimonials(),
    ];

    await Promise.allSettled(promises);

    renderCartPanel();
    initContactForm();
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

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

})();
