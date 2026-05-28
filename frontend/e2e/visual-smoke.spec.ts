import { expect, test, type Page } from "@playwright/test";

async function bootFast(page: Page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("xp-booted", "1");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start/i })).toBeVisible();
}

async function emulateCoarsePointer(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query.includes("pointer: coarse")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        };
      }
      return original(query);
    };
  });
}

async function expectCanvasHasPixels(locator: ReturnType<Page["locator"]>) {
  const hasPixels = await locator.evaluate((canvas) => {
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

function windowByTitle(page: Page, title: string) {
  return page.locator(".window", {
    has: page.locator(".title-bar-text", { hasText: title }),
  });
}

test("desktop renders core windows and game canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  await page.getByRole("button", { name: /Snake\.exe/i }).dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "🐍 Snake" })).toBeVisible();
  await expect(windowByTitle(page, "🐍 Snake").locator("canvas")).toBeVisible();
  await expectCanvasHasPixels(windowByTitle(page, "🐍 Snake").locator("canvas"));

  await page.getByRole("button", { name: /High Scores/i }).first().dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "🏆 High Scores" })).toBeVisible();

  await page.getByRole("button", { name: /My NFTs/i }).first().dblclick();
  await expect(page.locator(".title-bar-text", { hasText: "💾 My NFTs" })).toBeVisible();
});

test("desktop launcher opens every game window", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  const games = [
    { icon: /Snake\.exe/i, title: "🐍 Snake", canvas: true },
    { icon: /Tetris\.exe/i, title: "🧱 Tetris", canvas: false },
    { icon: /Pac-Man\.exe/i, title: "👾 Pac-Man", canvas: true },
    { icon: /XP Bricks\.exe/i, title: "🧱 XP Bricks", canvas: true },
  ];

  for (const game of games) {
    await page.getByRole("button", { name: game.icon }).dblclick();
    const win = windowByTitle(page, game.title);
    await expect(win).toBeVisible();
    if (game.canvas) {
      await expect(win.locator("canvas")).toBeVisible();
      await expectCanvasHasPixels(win.locator("canvas"));
    } else {
      await expect(win.getByText("Next")).toBeVisible();
    }
  }
});

test("XP Bricks opens, paints the playfield, and launches", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  await page.getByRole("button", { name: /XP Bricks\.exe/i }).dblclick();
  const bricksWindow = windowByTitle(page, "🧱 XP Bricks");
  const canvas = bricksWindow.getByLabel("XP Bricks playfield");

  await expect(canvas).toBeVisible();
  await expectCanvasHasPixels(canvas);
  await expect(bricksWindow.getByText("Bricks:")).toBeVisible();

  const before = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const ctx = canvasNode.getContext("2d")!;
    const data = ctx.getImageData(0, 0, canvasNode.width, canvasNode.height).data;
    let checksum = 0;
    for (let i = 0; i < data.length; i += 97) checksum = (checksum + data[i] * (i + 1)) % 1_000_000_007;
    return checksum;
  });
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  const after = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const ctx = canvasNode.getContext("2d")!;
    const data = ctx.getImageData(0, 0, canvasNode.width, canvasNode.height).data;
    let checksum = 0;
    for (let i = 0; i < data.length; i += 97) checksum = (checksum + data[i] * (i + 1)) % 1_000_000_007;
    return checksum;
  });

  expect(after).not.toBe(before);
});

test("start menu opens shared utility windows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.getByRole("menuitem", { name: /Leaderboard/i }).click();
  await expect(page.locator(".title-bar-text", { hasText: "🏆 High Scores" })).toBeVisible();

  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.getByRole("menuitem", { name: /Hall of Fame/i }).click();
  await expect(page.locator(".title-bar-text", { hasText: "🎖️ Hall of Fame" })).toBeVisible();

  await page.getByRole("button", { name: /^Start$/i }).click();
  await page.getByRole("menuitem", { name: /My NFTs/i }).click();
  await expect(page.locator(".title-bar-text", { hasText: "💾 My NFTs" })).toBeVisible();
});

test("snake game over shows mint dialog with downloadable score card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page);

  await page.getByRole("button", { name: /Snake\.exe/i }).dblclick();
  const snakeWindow = windowByTitle(page, "🐍 Snake");
  await expect(snakeWindow.locator("canvas")).toBeVisible();

  await expect(snakeWindow.getByText(/Game Over/i)).toBeVisible({ timeout: 8_000 });
  await expect(snakeWindow.getByLabel("Shareable score card preview")).toBeVisible();
  await expect(snakeWindow.getByRole("button", { name: /Download PNG/i })).toBeVisible();
  await expect(snakeWindow.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
});

test("mobile launcher opens a fullscreen game without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await emulateCoarsePointer(page);
  await bootFast(page);

  await page.getByRole("button", { name: /Snake\.exe/i }).click();
  await expect(page.locator(".title-bar-text", { hasText: "🐍 Snake" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "▲" })).toBeVisible();
  await expect(page.getByRole("button", { name: "◀" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▼" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▶" })).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});

test("mobile XP Bricks uses a compact layout without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await emulateCoarsePointer(page);
  await bootFast(page);

  await page.getByRole("button", { name: /XP Bricks\.exe/i }).click();
  const bricksWindow = windowByTitle(page, "🧱 XP Bricks");
  await expect(bricksWindow).toBeVisible();
  await expect(bricksWindow.getByLabel("XP Bricks playfield")).toBeVisible();
  await expect(bricksWindow.getByRole("button", { name: "Launch" }).first()).toBeVisible();

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
});
