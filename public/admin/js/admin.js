/**
 * Straton Audio — Dashboard Admin
 * Maneja navegación entre módulos, sidebar, login placeholder.
 */

(function () {
  'use strict';

  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);

  // =========================================================
  // Estado
  // =========================================================
  const modules = {
    dashboard: { title: 'Inicio', icon: '📊' },
    products: { title: 'Productos', icon: '📦' },
    services: { title: 'Servicios', icon: '🔧' },
    packages: { title: 'Paquetes', icon: '📋' },
    events: { title: 'Eventos', icon: '📸' },
    testimonials: { title: 'Testimonios', icon: '💬' },
    pages: { title: 'Páginas', icon: '📄' },
    quotations: { title: 'Cotizaciones', icon: '📨' },
    settings: { title: 'Configuración', icon: '⚙️' },
  };

  let currentModule = 'dashboard';

  // =========================================================
  // Login (Cloudflare Access real en producción; placeholder en local)
  // =========================================================
  function initLogin() {
    // window.__ADMIN_EMAIL__ lo inyecta el Worker leyendo el header
    // Cf-Access-Authenticated-User-Email — no falsificable por un cliente
    // externo, Cloudflare lo sobrescribe en el edge. Si viene con un email
    // real, Access ya autenticó esta request antes de que llegara aquí.
    const accessEmail = window.__ADMIN_EMAIL__;
    if (accessEmail) {
      showDashboard(accessEmail);
      return;
    }

    // Sin email de Access (desarrollo local con wrangler dev, donde
    // Miniflare no simula Access; o producción con la política mal
    // configurada). Mantenemos el placeholder de sessionStorage solo para
    // no romper las pruebas locales — la protección real de escritura ya
    // no depende de esto: la API valida el JWT de Access por su cuenta.
    const loginBtn = $('#loginBtn');
    const token = sessionStorage.getItem('sa_admin_token');
    if (token === 'authenticated') {
      showDashboard(null);
      return;
    }

    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem('sa_admin_token', 'authenticated');
      showDashboard(null);
    });
  }

  function showDashboard(accessEmail) {
    $('#loginScreen').style.display = 'none';
    const dashboard = $('#dashboard');
    dashboard.style.display = 'flex';

    const userEl = $('#sidebarUser');
    if (userEl) {
      userEl.textContent = accessEmail
        ? accessEmail
        : 'Modo desarrollo local (sin Cloudflare Access)';
    }

    // Cargar módulo inicial
    loadModule('dashboard');
  }

  // =========================================================
  // Navegación Sidebar
  // =========================================================
  function initSidebar() {
    const links = $$('.sidebar-link[data-module]');
    const toggle = $('#sidebarToggle');
    const sidebar = $('#sidebar');

    // Toggle móvil
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Navegación
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const module = link.dataset.module;
        if (!module) return;

        // Cerrar sidebar en móvil
        sidebar.classList.remove('open');

        // Actualizar active
        $$('.sidebar-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Cargar módulo
        loadModule(module);
      });
    });
  }

  // =========================================================
  // Cargar módulos desde archivos HTML externos
  // =========================================================
  async function loadModule(name) {
    const content = $('#moduleContent');
    const title = $('#moduleTitle');
    const mod = modules[name];

    if (!mod) return;

    currentModule = name;
    title.textContent = mod.title;

    // Dashboard se renderiza inline
    if (name === 'dashboard') {
      renderDashboard(content);
      return;
    }

    // Mostrar loading mientras se carga el módulo
    content.innerHTML = '<div class="loading-admin">Cargando módulo...</div>';

    try {
      const resp = await fetch(`/admin/modules/${name}.html`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      injectModuleHTML(content, html);
    } catch (err) {
      console.error(`Error cargando módulo "${name}":`, err);
      content.innerHTML = `
        <div class="module-stub">
          <div class="module-stub-icon">⚠️</div>
          <h2>Error al cargar el módulo</h2>
          <p>No se pudo cargar "${name}". Verifica la conexión e inténtalo de nuevo.</p>
        </div>`;
    }
  }

  /**
   * Inyecta HTML con scripts en un contenedor.
   * Extrae <script> tags (inline y externos), inserta el DOM, y ejecuta los scripts.
   */
  function injectModuleHTML(container, htmlString) {
    // Extraer scripts del HTML — soporta inline (<script>code</script>),
    // externos (<script src="..."></script>), y módulos.
    const scripts = [];
    const htmlWithoutScripts = htmlString.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, code) => {
      // Extraer src si existe
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      const isModule = /\btype=["']module["']/i.test(attrs);
      scripts.push({ code: code.trim(), src: srcMatch ? srcMatch[1] : null, module: isModule });
      return '';
    });

    // Inyectar el HTML
    container.innerHTML = htmlWithoutScripts;

    // Ejecutar los scripts en orden
    scripts.forEach(s => {
      const script = document.createElement('script');
      if (s.src) {
        script.src = s.src;
      } else {
        script.textContent = s.code;
      }
      if (s.module) script.type = 'module';
      container.appendChild(script);
    });
  }

  // =========================================================
  // Dashboard Inicio
  // =========================================================
  async function renderDashboard(content) {
    content.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="dashboard-card-icon">📨</div>
          <div class="dashboard-card-value" id="statQuotations">0</div>
          <div class="dashboard-card-label">Cotizaciones pendientes</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-card-icon">📸</div>
          <div class="dashboard-card-value" id="statEvents">0</div>
          <div class="dashboard-card-label">Eventos publicados</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-card-icon">💬</div>
          <div class="dashboard-card-value" id="statTestimonials">0</div>
          <div class="dashboard-card-label">Testimonios</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-card-icon">🔧</div>
          <div class="dashboard-card-value" id="statServices">0</div>
          <div class="dashboard-card-label">Servicios activos</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Cotizaciones recientes</h3>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody id="recentQuotations">
              <tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:2rem;">Cargando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Acceso rápido</h3>
        </div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <a href="#" class="btn-admin btn-primary-admin" data-quick="quotations">Ver cotizaciones</a>
          <a href="#" class="btn-admin btn-ghost-admin" data-quick="events">Gestionar eventos</a>
          <a href="#" class="btn-admin btn-ghost-admin" data-quick="settings">Configuración del sitio</a>
        </div>
      </div>
    `;

    // Cargar stats
    loadDashboardStats();

    // Quick links
    content.querySelectorAll('[data-quick]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const mod = link.dataset.quick;
        const sidebarLink = $(`.sidebar-link[data-module="${mod}"]`);
        if (sidebarLink) sidebarLink.click();
      });
    });
  }

  async function loadDashboardStats() {
    try {
      // Quotations pendientes
      fetch('/api/quotations')
        .then(r => r.json())
        .then(data => {
          const pending = Array.isArray(data) ? data.filter(q => q.status === 'pending').length : 0;
          const statEl = $('#statQuotations');
          if (statEl) statEl.textContent = pending;

          // Mostrar recientes
          const tbody = $('#recentQuotations');
          if (tbody && Array.isArray(data)) {
            const recent = data.slice(0, 5);
            if (recent.length === 0) {
              tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:2rem;">No hay cotizaciones aún</td></tr>`;
            } else {
              tbody.innerHTML = recent.map(q => `
                <tr>
                  <td><strong>${escapeHtml(q.customer_name || '—')}</strong></td>
                  <td>${escapeHtml(q.email || '—')}</td>
                  <td>${escapeHtml(q.phone || '—')}</td>
                  <td><span class="status-badge ${q.status || 'pending'}">${q.status || 'pending'}</span></td>
                  <td style="color:var(--color-text-muted);">${q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              `).join('');
            }
          }
        })
        .catch(() => {});

      // Events published
      fetch('/api/events?status=published')
        .then(r => r.json())
        .then(data => {
          const el = $('#statEvents');
          if (el) el.textContent = Array.isArray(data) ? data.length : '0';
        })
        .catch(() => {});

      // Testimonials
      fetch('/api/testimonials?status=all')
        .then(r => r.json())
        .then(data => {
          const el = $('#statTestimonials');
          if (el) el.textContent = Array.isArray(data) ? data.length : '0';
        })
        .catch(() => {});

      // Services
      fetch('/api/services?status=published')
        .then(r => r.json())
        .then(data => {
          const el = $('#statServices');
          if (el) el.textContent = Array.isArray(data) ? data.length : '0';
        })
        .catch(() => {});
    } catch (err) {
      console.warn('Error cargando stats:', err);
    }
  }

  // =========================================================
  // Stub de módulo (placeholder para futura implementación)
  // =========================================================
  function renderStub(content, moduleName, title, description) {
    content.innerHTML = `
      <div class="module-stub">
        <div class="module-stub-icon">${modules[moduleName]?.icon || '📄'}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
        <div class="card" style="max-width: 600px; width: 100%; text-align: left; margin-top: 1rem;">
          <div style="padding: 1rem; color: var(--color-text-secondary); font-size: 0.875rem;">
            <p>Este módulo está en preparación. Las siguientes funcionalidades estarán disponibles:</p>
            <ul style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
              <li style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="color: var(--color-accent);">✓</span> Listar todos los registros
              </li>
              <li style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="color: var(--color-accent);">✓</span> Crear, editar y eliminar
              </li>
              <li style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="color: var(--color-accent);">✓</span> Cambiar estado (published/draft)
              </li>
              <li style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="color: var(--color-accent);">✓</span> Subir imágenes y archivos
              </li>
            </ul>
          </div>
          <div style="padding: 1rem; border-top: 1px solid var(--color-border); display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn-admin btn-primary-admin" disabled>+ Nuevo</button>
            <button class="btn-admin btn-ghost-admin" disabled>Importar</button>
            <button class="btn-admin btn-ghost-admin" disabled>Exportar</button>
          </div>
        </div>
        <p style="margin-top: 1.5rem; color: var(--color-text-muted); font-size: 0.75rem;">
          Próximamente: implementación completa CRUD con Cloudflare D1.
        </p>
      </div>
    `;
  }

  // =========================================================
  // Logout
  // =========================================================
  function initLogout() {
    const logoutBtn = $('#logoutBtn');
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.removeItem('sa_admin_token');
      $('#dashboard').style.display = 'none';
      $('#loginScreen').style.display = 'flex';
    });
  }

  // =========================================================
  // Utilidades
  // =========================================================
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // =========================================================
  // Init
  // =========================================================
  function init() {
    initLogin();
    initSidebar();
    initLogout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
