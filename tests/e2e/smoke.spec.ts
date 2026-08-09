import { expect, test } from "@playwright/test";

test("el inicio carga y permite abrir el acceso", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Acceso del equipo Mideli" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Entrar al sistema/i })).toBeVisible();
});

test("el formulario de acceso no muestra el sufijo interno", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByLabel("Usuario")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("@mideli");
});

test("una ruta administrativa sin sesión regresa al acceso", async ({ page }) => {
  await page.goto("/settings/diagnostico");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});

test("el endpoint de salud responde con el contrato público mínimo", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");

  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["status", "timestamp", "version"]);
  expect(body.status).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(Number.isNaN(Date.parse(String(body.timestamp)))).toBeFalsy();
  expect(JSON.stringify(body).toLowerCase()).not.toContain("supabase");
});

test("las rutas públicas no producen errores fatales de JavaScript", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.goto("/login");

  expect(errors).toEqual([]);
});

test("inicio y acceso no generan desbordamiento horizontal", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport + 1);
  }
});

test("el manifiesto PWA y sus iconos principales están disponibles", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = (await manifestResponse.json()) as {
    name?: string;
    start_url?: string;
    icons?: Array<{ src: string }>;
  };

  expect(manifest.name).toContain("Mideli");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);

  const iconResponse = await request.get("/icons/icon-192x192.png");
  expect(iconResponse.ok()).toBeTruthy();
  expect(iconResponse.headers()["content-type"]).toContain("image/png");
});
