import { expect, test, type Page, type Route } from "@playwright/test";
import {
  boolCV,
  cvToHex,
  listCV,
  noneCV,
  someCV,
  standardPrincipalCV,
  tupleCV,
  uintCV,
  type ClarityValue,
} from "@stacks/transactions";

const OWNER = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const PLAYER_A = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const PLAYER_B = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";

async function bootFast(page: Page, address: string) {
  await page.addInitScript((seedAddress) => {
    window.sessionStorage.setItem("xp-booted", "1");
    const payload = JSON.stringify({
      addresses: { stx: [{ address: seedAddress }], btc: [] },
      version: "0.0.1",
      updatedAt: Date.now(),
    });
    const bytes = new TextEncoder().encode(payload);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem("@stacks/connect", hex);
  }, address);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Start$/i })).toBeVisible();
}

function readonlyResponse(value: ClarityValue) {
  return { okay: true, result: cvToHex(value) };
}

function topEntry(player: string, score: number) {
  return tupleCV({ player: standardPrincipalCV(player), score: uintCV(score) });
}

// Current season is 2, so season 1 is closed. PLAYER_A ranks #1 in season 1's
// snapshot (pool 3 STX) and has not claimed -> the High Score window should
// surface a per-season Claim button. The get-season-prize mock answers for any
// season, which is enough to exercise the season-1 scan in findClaimablePrizes.
async function mockClaimReads(page: Page) {
  await page.route("**/v2/contracts/call-read/**", async (route: Route) => {
    const fn = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    const byFn: Record<string, ClarityValue> = {
      "get-contract-owner": standardPrincipalCV(OWNER),
      "get-current-season": uintCV(2),
      "get-top-ten": listCV([topEntry(PLAYER_A, 1500), topEntry(PLAYER_B, 420)]),
      "get-best-score": noneCV(),
      "get-season-prize": someCV(
        tupleCV({
          total: uintCV(3_000_000),
          "top-ten": listCV([topEntry(PLAYER_A, 1500), topEntry(PLAYER_B, 420)]),
        }),
      ),
      "has-claimed-prize": boolCV(false),
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(readonlyResponse(byFn[fn] ?? noneCV())),
    });
  });
}

function highScoreWindow(page: Page) {
  return page.locator(".window", {
    has: page.locator(".title-bar-text", { hasText: "High Scores" }),
  });
}

test("a top-ten player sees a claim button for an unclaimed closed season", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockClaimReads(page);
  await bootFast(page, PLAYER_A);

  await page.getByRole("button", { name: /High Scores/i }).first().dblclick();
  const win = highScoreWindow(page);
  await expect(win).toBeVisible();

  // rank #1 of a 3 STX pool -> 20% -> 0.60 STX, labelled with the closed season.
  await expect(win.getByRole("button", { name: /Claim 0\.60 STX · Season 1/ })).toBeVisible();
});

test("no claim button is shown once the player has claimed the season", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/v2/contracts/call-read/**", async (route: Route) => {
    const fn = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    const byFn: Record<string, ClarityValue> = {
      "get-contract-owner": standardPrincipalCV(OWNER),
      "get-current-season": uintCV(2),
      "get-top-ten": listCV([topEntry(PLAYER_A, 1500), topEntry(PLAYER_B, 420)]),
      "get-best-score": noneCV(),
      "get-season-prize": someCV(
        tupleCV({
          total: uintCV(3_000_000),
          "top-ten": listCV([topEntry(PLAYER_A, 1500), topEntry(PLAYER_B, 420)]),
        }),
      ),
      "has-claimed-prize": boolCV(true),
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(readonlyResponse(byFn[fn] ?? noneCV())),
    });
  });
  await bootFast(page, PLAYER_A);

  await page.getByRole("button", { name: /High Scores/i }).first().dblclick();
  const win = highScoreWindow(page);
  await expect(win).toBeVisible();
  await expect(win.getByText(/Your rank: #1/)).toBeVisible();
  await expect(win.getByRole("button", { name: /Claim .* STX/ })).toHaveCount(0);
});
