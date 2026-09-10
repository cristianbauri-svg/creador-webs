// Baseline de rendimiento de /sonido (móvil + desktop) — v2 robusto
const { chromium } = require("C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright");

const URL = "https://stratonaudio.com.co/sonido";

async function measure(browser, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  if (isMobile) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  // Warm-up request (elimina cold start del worker / conexión)
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  // Recolectar métricas en página nueva
  const page2 = await ctx.newPage();
  if (isMobile) {
    const cdp2 = await ctx.newCDPSession(page2);
    await cdp2.send("Network.enable");
    await cdp2.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp2.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  await page2.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await page2.waitForTimeout(2000);

  const m = await page2.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    let lcp = 0, fcp = 0, cls = 0;
    const lcpE = performance.getEntriesByType("largest-contentful-paint");
    lcpE.forEach((e) => { if (e.startTime > lcp) lcp = e.startTime; });
    performance.getEntriesByType("paint").forEach((e) => {
      if (e.name === "first-contentful-paint") fcp = e.startTime;
    });
    performance.getEntriesByType("layout-shift").forEach((e) => { if (!e.hadRecentInput) cls += e.value; });

    const resources = performance.getEntriesByType("resource");
    let totalBytes = 0, thirdParty = 0, thirdPartyBytes = 0;
    const byType = {}, imgs = [], jsList = [], cssList = [], other = [];
    const origin = location.origin;
    for (const r of resources) {
      const bytes = r.transferSize || 0;
      totalBytes += bytes;
      const t = r.initiatorType || "other";
      byType[t] = (byType[t] || 0) + bytes;
      const isThird = !r.name.startsWith(origin) && !r.name.startsWith("data:");
      if (isThird) { thirdParty++; thirdPartyBytes += bytes; }
      const nm = r.name;
      if (t === "img") imgs.push([nm.split("/").pop(), bytes]);
      else if (t === "script") jsList.push([nm.split("/").pop(), bytes]);
      else if (t === "css") cssList.push([nm.split("/").pop(), bytes]);
      else if (t !== "img") other.push([t, nm.slice(-60), bytes]);
    }
    imgs.sort((a, b) => b[1] - a[1]);
    jsList.sort((a, b) => b[1] - a[1]);
    return {
      fcp: Math.round(fcp), lcp: Math.round(lcp), cls: +cls.toFixed(4),
      ttfb: nav ? Math.round(nav.responseStart) : 0,
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      load: nav ? Math.round(nav.loadEventEnd) : 0,
      totalBytes, totalReq: resources.length, byType,
      thirdParty, thirdPartyBytes,
      imagesCount: imgs.length, imagesBytes: imgs.reduce((a, b) => a + b[1], 0),
      topImages: imgs.slice(0, 8), topJs: jsList.slice(0, 6),
    };
  });

  await ctx.close();
  return { viewport: viewport.width + "x" + viewport.height, isMobile, ...m };
}

(async () => {
  const browser = await chromium.launch();
  const desktop = await measure(browser, { width: 1440, height: 900 }, false);
  const mobile = await measure(browser, { width: 375, height: 812 }, true);
  await browser.close();
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
