const { chromium } = require("C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright");
const URL = "https://stratonaudio.com.co/sonido";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", e => pageErrors.push(String(e)));
  // Bloquear cualquier navegación real a WhatsApp para no perder el contexto
  await page.route(/wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i, r => r.abort());

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => Array.isArray(window.dataLayer), { timeout: 15000 }).catch(() => {});

  // Todo dentro de UNA sola evaluate: dispara el click sintético y lee
  // dataLayer en el mismo turno, antes de que cualquier navegación ocurra.
  const result = await page.evaluate(() => {
    const dl = () => (window.dataLayer || []);
    const links = Array.from(document.querySelectorAll('a[href]'));
    const wa = links.find(a => /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i.test(a.getAttribute('href') || ''));
    if (!wa) return { found: false, dataLayerEvents: dl().map(e => e.event).filter(Boolean) };
    const before = dl().filter(e => e.event === 'whatsapp_click').length;
    wa.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const after = dl().filter(e => e.event === 'whatsapp_click').length;
    const sample = dl().find(e => e.event === 'whatsapp_click') || null;
    return { found: true, href: wa.getAttribute('href'), before, after, sample };
  });

  console.log(JSON.stringify({ consoleErrors, pageErrors, ...result }, null, 2));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
