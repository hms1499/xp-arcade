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

async function bootFast(page: Page, address?: string) {
  await page.addInitScript((seedAddress) => {
    window.sessionStorage.setItem("xp-booted", "1");
    if (!seedAddress) return;
    const payload = JSON.stringify({
      addresses: {
        stx: [{ address: seedAddress }],
        btc: [],
      },
      version: "0.0.1",
      updatedAt: Date.now(),
    });
    const bytes = new TextEncoder().encode(payload);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem("@stacks/connect", hex);
  }, address);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Start$/i })).toBeVisible();
}

function readonlyResponse(value: ClarityValue) {
  return { okay: true, result: cvToHex(value) };
}

function topEntry(player: string, score: number) {
  return tupleCV({
    player: standardPrincipalCV(player),
    score: uintCV(score),
  });
}

// v3 is a single registry contract. Owner detection is now authoritative via
// the `get-contract-owner` read-only (lib/owner.ts), so the mock must answer it.
async function mockSeasonAdminReads(page: Page) {
  await page.route("**/extended/v2/blocks?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ results: [{ height: 8_300_000 }] }),
    });
  });

  await page.route("**/v2/contracts/call-read/**", async (route: Route) => {
    const functionName = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    const responseByFunction: Record<string, ClarityValue> = {
      "get-contract-owner": standardPrincipalCV(OWNER),
      "get-current-season": uintCV(2),
      "get-prize-pool-balance": uintCV(3_000_000),
      "get-top-ten": listCV([topEntry(PLAYER_A, 1500), topEntry(PLAYER_B, 420)]),
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
      body: JSON.stringify(readonlyResponse(responseByFunction[functionName] ?? noneCV())),
    });
  });

  await page.route("**/extended/v1/address/**/balances", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ stx: { balance: "10000000" } }),
    });
  });
}

async function openStartMenu(page: Page) {
  await page.getByRole("button", { name: /^Start$/i }).click();
}

test("season admin is hidden from a non-owner start menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSeasonAdminReads(page);
  await bootFast(page, PLAYER_A);

  await openStartMenu(page);

  await expect(page.getByRole("menuitem", { name: /Season Admin/i })).toHaveCount(0);
});

test("owner opens season admin and sees the current-season preflight and End Season", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSeasonAdminReads(page);
  await bootFast(page, OWNER);

  await openStartMenu(page);
  await page.getByRole("menuitem", { name: /Season Admin/i }).click();

  const admin = page.locator(".window", {
    has: page.locator(".title-bar-text", { hasText: "Season Admin" }),
  });
  await expect(admin).toBeVisible();
  await expect(admin.getByRole("tab", { name: "Snake" })).toHaveAttribute("aria-selected", "true");

  // Current-season read-only summary + the owner action.
  await expect(admin.getByText("Current Season")).toBeVisible();
  await expect(admin.getByText(/Pool:/)).toBeVisible();
  await expect(admin.getByText(/Preflight: top-10/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "End Season" })).toBeVisible();

  // v3 dropped the owner-payout UI — players self-claim on-chain. Past seasons
  // are read-only snapshots, never a "Send STX"/CSV/payout console.
  await expect(admin.getByText(/Players claim their prizes directly on-chain/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Send STX" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Pay all unsent" })).toHaveCount(0);
});
