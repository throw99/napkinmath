import { expect, test } from "@playwright/test";
import { APP_URL, seedTheme } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedTheme(page);
  await page.goto(APP_URL);
});

test("collapsed sheets keep the expand control clear", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse sheets" }).click();
  await expect(page.getByRole("button", { name: "Expand sheets" })).toBeVisible();
  await expect(page.getByText("My Sheets")).toHaveCount(0);
  const expand = await page.getByRole("button", { name: "Expand sheets" }).boundingBox();
  const add = await page.getByRole("button", { name: "＋" }).boundingBox();
  expect(expand?.x).toBe(add?.x);
  expect(expand?.width).toBe(add?.width);
  await page.getByRole("button", { name: "Expand sheets" }).click();
  await expect(page.getByText("My Sheets")).toBeVisible();
});

test("emoji picker searches and saves a selection", async ({ page }) => {
  const sheet = page.locator(".group").filter({ has: page.locator('button[aria-label="Sheet actions"]') }).first();
  await sheet.hover();
  await page.getByRole("button", { name: "Sheet actions" }).first().click();
  const openEmoji = async () => {
    await page.getByRole("button", { name: "Emoji", exact: true }).click();
    await expect(page.getByText("Rename", { exact: true })).toHaveCount(0);
  };
  const expectClosed = async () => {
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Rename", { exact: true })).toHaveCount(0);
    await expect(sheet).toBeFocused();
  };
  const dialog = page.getByRole("dialog");
  await openEmoji();
  await dialog.getByRole("textbox", { name: "Type to search for an emoji" }).focus();
  await page.keyboard.press("Escape");
  await expectClosed();
  await sheet.hover();
  await sheet.getByRole("button", { name: "Sheet actions" }).click();
  await openEmoji();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectClosed();
  await sheet.hover();
  await sheet.getByRole("button", { name: "Sheet actions" }).click();
  await openEmoji();
  await dialog.getByRole("textbox", { name: "Type to search for an emoji" }).fill("rocket");
  await dialog.getByRole("gridcell", { name: "rocket", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toContainText("🚀");
  await expectClosed();
});

test("delete dialog cancels or confirms deletion", async ({ page }) => {
  const sheet = page.locator(".group").filter({ has: page.locator('button[aria-label="Sheet actions"]') }).first();
  await sheet.hover();
  await page.getByRole("button", { name: "Sheet actions" }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("This sheet has content.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await sheet.hover();
  await page.getByRole("button", { name: "Sheet actions" }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
