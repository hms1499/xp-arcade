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

async function mockSeasonAdminReads(page: Page) {
  await page.route("**/v2/contracts/call-read/**", async (route: Route) => {
    const functionName = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    const responseByFunction: Record<string, ClarityValue> = {
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

test("season admin is hidden from non-owner start menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootFast(page, PLAYER_A);

  await openStartMenu(page);

  await expect(page.getByRole("menuitem", { name: /Season Admin/i })).toHaveCount(0);
});

test("owner can open season admin and review payout safety signals", async ({ page }) => {
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
  await expect(admin.getByText("Owner balance:")).toBeVisible();
  await expect(admin.getByText(/Score review: 2 rows/)).toBeVisible();
  await expect(admin.getByRole("columnheader", { name: "Risk" })).toBeVisible();
  await expect(admin.getByText("High risk")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Pay all unsent" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "Export CSV" })).toBeVisible();
});

test("single payout requires typed SEND confirmation with recipient and memo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSeasonAdminReads(page);
  await bootFast(page, OWNER);

  await openStartMenu(page);
  await page.getByRole("menuitem", { name: /Season Admin/i }).click();

  let dialogType = "";
  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogType = dialog.type();
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  await page.getByRole("button", { name: "Send STX" }).first().click({ force: true });

  expect(dialogType).toBe("prompt");
  expect(dialogMessage).toContain("Confirm owner payout");
  expect(dialogMessage).toContain(`Recipient: ${PLAYER_A}`);
  expect(dialogMessage).toContain("Amount: 0.600000 STX");
  expect(dialogMessage).toContain("Memo: xpa-snake-s1-r1");
});
