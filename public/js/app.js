/**
 * Straton Audio — App principal
 * Maneja la carga dinámica de datos desde la API, animaciones,
 * formulario de cotización y navegación.
 */

(function () {
  'use strict';

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
              <a href="#contacto" class="btn btn-primary">Solicitar cotización</a>
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
          <a href="#contacto" class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
            Solicitar cotización
          </a>
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
          <a href="#contacto" class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);">
            Solicitar cotización
          </a>
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
            event_date: form.event_date.value || null,
            notes: form.notes.value.trim() || null,
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

    // Cargar datos en paralelo
    const promises = [
      loadMeta(),
      loadSettings(),
      loadServices(),
      loadPackages(),
      loadEvents(),
      loadTestimonials(),
    ];

    await Promise.allSettled(promises);

    initContactForm();
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
