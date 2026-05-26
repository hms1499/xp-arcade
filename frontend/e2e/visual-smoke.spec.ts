import { expect, test, type Page } from "@playwright/test";

async function bootFast(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xp-booted", "1");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start/i })).toBeVisible();
}

async function expectCanvasHasPixels(page: Page) {
  const hasPixels = await page.locator("canvas").first().evaluate((canvas) => {
    const ctx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) return false;
    const { width, height } = canvas as HTMLCanvasElement;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
  expect(hasPixels).toBe(true);
}

test("desktop renders core windows and game canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  await page.getByRole("button", { name: /Snake\.exe/i }).dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "🐍 Snake" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expectCanvasHasPixels(page);

  await page.getByRole("button", { name: /High Scores/i }).first().dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "🏆 High Scores" })).toBeVisible();

  await page.getByRole("button", { name: /My NFTs/i }).first().dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "💾 My NFTs" })).toBeVisible();
});

test("mobile launcher opens a fullscreen game without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootFast(page);

  await page.getByRole("button", { name: /Snake\.exe/i }).click();
  await expect(page.locator(".title-bar-text", { hasText: "🐍 Snake" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});
