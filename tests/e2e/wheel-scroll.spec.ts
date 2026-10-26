import { expect, test } from "@playwright/test";
import { installWheelScrollFallback } from "../../src/lib/wheel-scroll-fallback";

async function enableWheelFallback(page: import("@playwright/test").Page) {
  await page.evaluate((installerSource) => {
    const installer = new Function(`return (${installerSource})`)() as () => void;
    installer();
  }, installWheelScrollFallback.toString());
}

test("la rueda desplaza el contenido aunque el cursor esté sobre una zona estática", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .shell { display: flex; flex-direction: column; height: 600px; }
      .header { flex: 0 0 48px; }
      .main { position: relative; flex: 1; min-height: 0; overflow: hidden; }
      .toolbar { height: 64px; }
      .screen-scroll { position: absolute; inset: 64px 0 0; overflow-y: auto; }
      .content { height: 1400px; }
    </style>
    <div class="shell mideli-dashboard-shell">
      <header class="header">Navegación</header>
      <main class="main mideli-dashboard-main">
        <div class="toolbar">Controles de la pantalla</div>
      <section class="screen-scroll overflow-y-auto" id="screen-scroll"><div class="content"></div></section>
      </main>
    </div>
  `);

  await enableWheelFallback(page);
  await page.mouse.move(120, 80);
  await page.mouse.wheel(0, 220);

  await expect.poll(() => page.locator("#screen-scroll").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test("la rueda funciona en páginas de administración fuera del panel Mesero", async ({ page }) => {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .settings-screen { height: 600px; display: flex; flex-direction: column; }
      .settings-header { height: 80px; flex: 0 0 80px; }
      .settings-content { flex: 1; min-height: 0; overflow-y: auto; }
      .settings-inner { height: 1300px; }
    </style>
    <div class="settings-screen">
      <header class="settings-header">Administrar personal</header>
      <main class="settings-content overflow-y-auto" id="settings-content"><div class="settings-inner"></div></main>
    </div>
  `);

  await enableWheelFallback(page);
  await page.mouse.move(120, 35);
  await page.mouse.wheel(0, 220);

  await expect.poll(() => page.locator("#settings-content").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test("la rueda continúa del panel anidado al panel exterior cuando llega al límite", async ({ page }) => {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .shell { height: 500px; }
      .main { height: 500px; overflow: hidden; }
      .outer { height: 180px; overflow-y: auto; }
      .inner { height: 80px; overflow-y: auto; overscroll-behavior-y: contain; }
      .inner-content { height: 240px; }
      .outer-content { height: 360px; }
    </style>
    <div class="shell mideli-dashboard-shell">
      <main class="main mideli-dashboard-main">
        <section class="outer" id="outer-scroll">
          <div class="inner" id="inner-scroll"><div class="inner-content"></div></div>
          <div class="outer-content"></div>
        </section>
      </main>
    </div>
  `);

  await enableWheelFallback(page);
  await page.locator("#inner-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.mouse.move(120, 32);
  await page.mouse.wheel(0, 180);

  await expect.poll(() => page.locator("#outer-scroll").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test("la rueda dentro de un diálogo no desplaza paneles del fondo", async ({ page }) => {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .shell { height: 500px; }
      .main { height: 500px; overflow: hidden; }
      .background-scroll { height: 220px; overflow-y: auto; }
      .backdrop { position: fixed; inset: 0; }
      .dialog { position: absolute; top: 80px; left: 100px; width: 320px; height: 180px; overflow: hidden; }
      .dialog-content { height: 500px; }
    </style>
    <div class="shell mideli-dashboard-shell">
      <main class="main mideli-dashboard-main">
        <section class="background-scroll" id="background-scroll"><div style="height: 800px"></div></section>
      </main>
      <div class="backdrop" id="backdrop">
        <section class="dialog" role="dialog" aria-modal="true" id="dialog">
          <div class="dialog-content">Diálogo sin scroll propio</div>
        </section>
      </div>
    </div>
  `);

  await enableWheelFallback(page);
  await page.mouse.move(20, 20);
  await page.mouse.wheel(0, 200);

  await expect(page.locator("#background-scroll")).toHaveJSProperty("scrollTop", 0);
});
