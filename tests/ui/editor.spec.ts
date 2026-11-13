import { expect, test } from "@playwright/test";
import {
  APP_URL,
  expectEnterReturnsToLineStart,
  expectTypingAfterTabsKeepsScroll,
  expectTypingDeepInLineShows,
  expectTypingOnEmptyRowShows,
  expectShortcutsKeepCaret,
  expectGutterClearOfText,
  expectHorizontalOverflow,
  expectLayersAligned,
  expectSameBottomEdge,
  GUTTER,
  RESULTS,
  resultLines,
  thumbPainted,
  seedTheme,
  tallSheet,
  wheelTo,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedTheme(page);
  await page.goto(APP_URL);
});

test("the starter sheet adds up and fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => resultLines(page))
    .toEqual([
      "",
      "$1,500.00",
      "$200.00",
      "$400.00",
      "$2,100.00",
      "$25,200.00",
      "",
      "$85,000.00",
      "$59,800.00",
      "",
      "",
      "$240.00",
      "$90.00",
      "$330.00",
    ]);
  await expectHorizontalOverflow(page, { editor: false, results: false });
  // Editor gets about two thirds of the width on a phone.
  const widths = await page.evaluate(() => ({
    editor: document.querySelector("textarea")!.getBoundingClientRect().width,
    results: document.querySelector('[data-testid="results"]')!.getBoundingClientRect().width,
  }));
  expect(widths.editor).toBeGreaterThan(widths.results * 1.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("typing a sheet shows the results", async ({ page }) => {
  const editor = page.locator("textarea");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("rent = 1500\ntax = 200\nrent + tax\nneed = €rent + tax");

  await expect.poll(() => resultLines(page)).toEqual(["1,500", "200", "1,700", "€1,700.00"]);
});

test("a short sheet does not scroll sideways and its layers line up", async ({ page, browserName }) => {
  await page.locator("textarea").fill("rent = 1500\ntax = 200\nrent + tax");
  await expectHorizontalOverflow(page, { editor: false, results: false });
  await expectSameBottomEdge(page, { scrollbarsTakeSpace: browserName === "chromium" });
  await expectLayersAligned(page, { at: "top", scrolledRight: false });
  await expectGutterClearOfText(page);
});

test("scrollbar thumbs appear only when a column is too wide", async ({ page, browserName }) => {
  // Firefox on Linux uses overlay scrollbars that stay hidden until hovered, so only Chromium paints them.
  test.skip(browserName !== "chromium", "overlay scrollbars");
  const editor = page.locator("textarea");
  const thumbs = async () => ({ editor: await thumbPainted(page, "textarea"), results: await thumbPainted(page, "results") });

  await editor.fill(tallSheet());
  await expectHorizontalOverflow(page, { editor: false, results: false });
  expect(await thumbs()).toEqual({ editor: false, results: false });

  await editor.fill(tallSheet({ longLine: true }));
  await expectHorizontalOverflow(page, { editor: true, results: false });
  expect(await thumbs()).toEqual({ editor: true, results: false });

  await editor.fill(tallSheet({ longResults: true }));
  await expectHorizontalOverflow(page, { editor: false, results: true });
  expect(await thumbs()).toEqual({ editor: false, results: true });
});

test("wheel over the line numbers scrolls the editor", async ({ page }) => {
  await page.locator("textarea").fill(tallSheet());
  await wheelTo(page, GUTTER, { to: "bottom" });
  await expectLayersAligned(page, { at: "bottom", scrolledRight: false });
  await wheelTo(page, GUTTER, { to: "top" });
  await expectLayersAligned(page, { at: "top", scrolledRight: false });
});

test.describe("scrolling keeps the editor layers and results aligned", () => {
  test("long editor line, scrolled from the editor", async ({ page, browserName }) => {
    await page.locator("textarea").fill(tallSheet({ longLine: true }));
    await expectHorizontalOverflow(page, { editor: true, results: false });
    await expectSameBottomEdge(page, { scrollbarsTakeSpace: browserName === "chromium" });
    await wheelTo(page, "textarea", { to: "bottom", right: true });
    await expectLayersAligned(page, { at: "bottom", scrolledRight: true });
    await wheelTo(page, "textarea", { to: "top" });
    await expectLayersAligned(page, { at: "top", scrolledRight: true });
  });

  test("long results, scrolled from the results column", async ({ page, browserName }) => {
    await page.locator("textarea").fill(tallSheet({ longResults: true }));
    await expectHorizontalOverflow(page, { editor: false, results: true });
    await expectSameBottomEdge(page, { scrollbarsTakeSpace: browserName === "chromium" });
    await wheelTo(page, RESULTS, { to: "bottom" });
    await expectLayersAligned(page, { at: "bottom", scrolledRight: false });
    await wheelTo(page, RESULTS, { to: "top" });
    await expectLayersAligned(page, { at: "top", scrolledRight: false });
  });

  test("both overflowing, scrolled from either side", async ({ page, browserName }) => {
    await page.locator("textarea").fill(tallSheet({ longLine: true, longResults: true }));
    await expectHorizontalOverflow(page, { editor: true, results: true });
    await expectSameBottomEdge(page, { scrollbarsTakeSpace: browserName === "chromium" });
    await wheelTo(page, "textarea", { to: "bottom", right: true });
    await expectLayersAligned(page, { at: "bottom", scrolledRight: true });
    await wheelTo(page, RESULTS, { to: "top" });
    await expectLayersAligned(page, { at: "top", scrolledRight: true });
    await wheelTo(page, RESULTS, { to: "bottom" });
    await expectLayersAligned(page, { at: "bottom", scrolledRight: true });
  });
});

test("Enter on a long line scrolled to the right brings the caret back beside the line numbers", async ({ page }) => {
  await page.locator("textarea").fill(tallSheet({ longLine: true }));
  await expectEnterReturnsToLineStart(page);
});

test("scrolled right, typing on an empty row shows the text with the editor back at column 0", async ({ page }) => {
  await expectTypingOnEmptyRowShows(page);
});

test("typing deep in a long line scrolled out of view shows the text without jumping to column 0", async ({ page }) => {
  await expectTypingDeepInLineShows(page);
});

test("typing after tab indentation with the caret on screen leaves the scroll alone", async ({ page }) => {
  await expectTypingAfterTabsKeepsScroll(page);
});

test("moving to another line does not fade the results in again; a changed result does", async ({ page }) => {
  // Results that carry the fade-in animation.
  const fading = () => page.locator(`${RESULTS} .nm-result-value`).allTextContents();
  await expect.poll(() => resultLines(page)).toContain("$1,500.00");
  await page.locator("textarea").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect.poll(fading).toEqual([]);
  await page.keyboard.press("End");
  await page.keyboard.type("0");
  await expect.poll(fading).toContain("$15,000.00");
  expect(await fading()).not.toContain("$200.00");
});

test("sheets persist across reload", async ({ page }) => {
  const editor = page.locator("textarea");
  await editor.fill("saved = 42\nsaved * 2");
  await expect.poll(() => resultLines(page)).toEqual(["42", "84"]);

  await page.reload();
  await expect(editor).toHaveValue("saved = 42\nsaved * 2");
  await expect.poll(() => resultLines(page)).toEqual(["42", "84"]);
});

test("Ctrl+/ and Ctrl+D keep the caret on the edited text; Ctrl+L does nothing", async ({ page }) => {
  await expectShortcutsKeepCaret(page);
});

test.describe("shortcut hints", () => {
  test("show Ctrl+ off Mac and a typing tip on phones", async ({ page }) => {
    await expect(page.getByText("Ctrl+D duplicate line")).toBeVisible();
    await expect(page.getByText("Saves automatically")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Start a line with # for a note")).toBeVisible();
    await expect(page.getByText("Ctrl+D duplicate line")).toBeHidden();
  });

  test("show ⌘ on a Mac", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" }));
    await page.reload();
    await expect(page.getByText("⌘D duplicate line")).toBeVisible();
  });
});

test("Ctrl+S never reaches the browser, wherever focus is", async ({ page }) => {
  const prevented = () =>
    page.evaluate(() => {
      const e = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await prevented()).toBe(true);
});
