// Loads the built Chrome extension in Chrome for Testing and drives the popup like a person would.
// Run with `npm run test:e2e` after `npm run build`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const extensionPath = fileURLToPath(new URL("../dist/chromium", import.meta.url));
let browser;
let page;
let worker;
let origin;

// A made-up key, assembled at runtime so secret scanners don't mistake it for a real one.
const fakeApiKey = ["sk", "live", "51HxQabcdefghijklmnopqrstu"].join("_");
const axeSource = await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (selector) => page.$eval(selector, (element) => element.textContent.trim());
const clipTexts = () => page.$$eval(".clip .preview", (previews) => previews.map((preview) => preview.textContent));
const status = () => text("#status");

async function setClipboard(value) {
  await page.bringToFront();
  await page.evaluate((value) => navigator.clipboard.writeText(value), value);
}

async function readClipboard() {
  await page.bringToFront();
  return page.evaluate(() => navigator.clipboard.readText());
}

// Clips as stored in IndexedDB, read through the extension's own store module.
function storedClips() {
  return page.evaluate(async () => (await import("/lib/store.js")).list());
}

async function openPopup() {
  await page.goto(`${origin}/popup/popup.html?view=tab`);
  await page.waitForFunction(() => !document.querySelector("#count:empty") || !document.querySelector("#empty").hidden);
}

async function saveClipboard(value) {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await setClipboard(value);
  await page.click("#capture");
  await page.waitForFunction(() => document.querySelector("#status").textContent);
  const message = await status();
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  return message;
}

// Settings and less frequent actions live in the ⋯ menu in the header.
async function chooseFromMenu(id) {
  await page.click("#app-menu-button");
  await page.waitForSelector("#app-menu:popover-open");
  await page.click(`#${id}`);
}

before(async () => {
  browser = await puppeteer.launch({
    headless: process.env.HEADFUL ? false : true,
    pipe: true,
    enableExtensions: [extensionPath],
  });
  const target = await browser.waitForTarget((candidate) => candidate.type() === "service_worker");
  origin = `chrome-extension://${new URL(target.url()).host}`;
  worker = await target.worker();
  page = await browser.newPage();
  page.on("pageerror", (error) => { throw error; });
  await openPopup();
});

after(() => browser?.close());

test("first run asks before saving copied text automatically", async () => {
  assert.equal(await text("#empty-title"), "Welcome to Copyhold");
  await page.waitForFunction(() => !document.querySelector("#capture-prompt").hidden);
  await page.click("#capture-prompt-off");
  assert.equal(await page.$eval("#capture-prompt", (prompt) => prompt.hidden), true);
  await page.waitForFunction(async () =>
    (await (await import("/lib/store.js")).getMeta(["autoCaptureAsked"])).autoCaptureAsked === true);
  await openPopup();
  await wait(300);
  assert.equal(await page.$eval("#capture-prompt", (prompt) => prompt.hidden), true);
});

test("Save clipboard saves text once and moves repeats to the top", async () => {
  assert.equal(await saveClipboard("first clip"), "Saved.");
  assert.equal(await saveClipboard("second clip"), "Saved.");
  assert.deepEqual(await clipTexts(), ["second clip", "first clip"]);
  assert.equal(await saveClipboard("first clip"), "Already saved. Moved it to the top.");
  assert.deepEqual(await clipTexts(), ["first clip", "second clip"]);
});

test("text that looks like a secret is saved masked", async () => {
  assert.match(await saveClipboard(fakeApiKey), /masked, because it looks like an API key/);
  const preview = await page.$eval(".clip .preview", (element) => ({ text: element.textContent, masked: element.classList.contains("protected") }));
  assert.equal(preview.masked, true);
  assert.equal(preview.text.includes("abcdefgh"), false);
});

test("a new clip can be written, searched, and copied with Enter", async () => {
  await chooseFromMenu("new");
  await page.type("#text", "written by hand");
  await page.type("#title", "Greeting");
  await page.click("#save-edit");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Clip added.");
  await page.click("#search");
  await page.type("#search", "by hand");
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 1);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".clip.is-copied"));
  assert.equal(await readClipboard(), "written by hand");
  await page.click("#clear-search");
});

test("the editor saves as you type, with a category, subcategory, and tags", async () => {
  await chooseFromMenu("new");
  await page.type("#text", "Quarterly invoice 2026-Q3");
  await page.type("#category", "Work");
  await page.type("#subcategory", "Invoices");
  await page.type("#tag-input", "urgent");
  await page.keyboard.press("Enter");
  await page.type("#tag-input", "#finance,");
  assert.deepEqual(await page.$$eval("#tag-list .tag", (tags) => tags.map((tag) => tag.firstChild.textContent)), ["urgent", "finance"]);
  // Saved without pressing anything, while the editor is still open.
  await page.waitForFunction(() => document.querySelector("#save-state").dataset.state === "saved");
  const saved = (await storedClips()).find((clip) => clip.text === "Quarterly invoice 2026-Q3");
  assert.deepEqual([saved.category, saved.subcategory, saved.tags], ["Work", "Invoices", ["urgent", "finance"]]);
  await page.type("#title", "Invoice");
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Clip added.");
  assert.equal((await storedClips()).find((clip) => clip.text === "Quarterly invoice 2026-Q3").title, "Invoice");
  assert.equal((await storedClips()).filter((clip) => clip.text === "Quarterly invoice 2026-Q3").length, 1);

  const row = await page.$$eval(".clip", (rows) => {
    const invoice = rows.find((item) => item.textContent.includes("Quarterly invoice"));
    return { category: invoice.querySelector(".clip-labels .category").textContent, tags: [...invoice.querySelectorAll(".clip-labels .tag")].map((tag) => tag.textContent) };
  });
  assert.deepEqual(row, { category: "Work › Invoices", tags: ["#urgent", "#finance"] });

  // Editing an existing clip also saves on its own.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".clip")].find((item) => item.textContent.includes("second clip"));
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".edit").click();
  });
  await page.type("#category", "Home");
  await page.type("#tag-input", "urgent");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#save-state").dataset.state === "saved");
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.click("#save-edit");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Clip updated.");
});

test("clips can be filtered by tags, category, and #tag searches", async () => {
  const shown = () => page.$$eval(".clip", (rows) => rows.map((item) => item.querySelector(".preview, .image-size").textContent));
  await page.click("#filter-button");
  await page.waitForSelector("#filter-panel:popover-open");
  await page.evaluate(() => [...document.querySelectorAll("#filter-panel .tag")].find((tag) => tag.textContent.startsWith("#finance")).click());
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 1);
  assert.deepEqual(await shown(), ["Quarterly invoice 2026-Q3"]);
  assert.equal(await text("#filter-count"), "1");
  await page.evaluate(() => [...document.querySelectorAll("#filter-panel .tag")].find((tag) => tag.textContent.startsWith("#finance")).click());
  await page.evaluate(() => [...document.querySelectorAll("#filter-panel .filter-option")].find((item) => item.textContent.startsWith("Home")).click());
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 1);
  assert.deepEqual(await shown(), ["second clip"]);
  await page.keyboard.press("Escape");
  assert.equal(await page.$eval("#active-filters", (bar) => bar.hidden), false);
  await page.click("#active-filters .clear-filters");
  await page.waitForFunction(() => document.querySelector("#active-filters").hidden);

  await page.click("#search");
  await page.type("#search", "#urg");
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 2);
  await page.type("#search", " invoice");
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 1);
  await page.click("#clear-search");

  // Selecting a tag on a clip filters by it.
  await page.evaluate(() => [...document.querySelectorAll(".clip-labels .tag")].find((tag) => tag.textContent === "#finance").click());
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 1);
  await page.click("#active-filters .clear-filters");
});

test("categories and tags can be renamed and deleted across clips", async () => {
  await chooseFromMenu("open-settings");
  await page.$eval("#manage-organization", (button) => button.click());
  await page.waitForSelector("#manage-dialog[open]");
  const clickInRow = (label, action) => page.evaluate((label, action) => {
    const row = [...document.querySelectorAll("#manage-dialog .manage-item")].find((item) => item.querySelector(".name")?.textContent === label);
    [...row.querySelectorAll("button")].find((button) => button.textContent === action).click();
  }, label, action);
  await clickInRow("#urgent", "Rename");
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.type("important");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#manage-status").textContent === "Renamed in 2 clips.");
  await clickInRow("Home", "Delete");
  await page.click("#confirm-action");
  await page.waitForFunction(() => document.querySelector("#manage-status").textContent === "Removed from 1 clip.");
  await page.click("#manage-dialog .primary");
  assert.equal(await page.$eval("#settings", (settings) => settings.open), true);
  await page.click("#close-settings");
  const clips = await storedClips();
  assert.deepEqual(clips.find((clip) => clip.text === "Quarterly invoice 2026-Q3").tags, ["important", "finance"]);
  const second = clips.find((clip) => clip.text === "second clip");
  assert.deepEqual([second.category, second.tags], ["", ["important"]]);
});

test("an image on the clipboard is saved with a thumbnail and copied back", async () => {
  await page.bringToFront();
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 180);
    const context = canvas.getContext("2d");
    context.fillStyle = "#4334a3";
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = "#7fe0bf";
    context.fillRect(40, 40, 120, 100);
    const png = await canvas.convertToBlob({ type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  });
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.click("#capture");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Saved.");
  await page.waitForFunction(() => document.querySelector(".clip .image-preview img")?.complete);
  assert.equal(await text(".clip .image-size"), "320 × 180");
  const stored = await page.evaluate(async () => {
    const image = (await (await import("/lib/store.js")).list()).find((clip) => clip.kind === "image");
    return { type: image.image.type, thumbnail: image.thumbnail.type, width: image.width };
  });
  assert.deepEqual(stored, { type: "image/png", thumbnail: "image/webp", width: 320 });

  await setClipboard("something else");
  await page.click("#search");
  // Alt+1 copies the first clip, which is the image just saved.
  await page.keyboard.down("Alt");
  await page.keyboard.press("Digit1");
  await page.keyboard.up("Alt");
  await page.waitForFunction(async () => (await navigator.clipboard.read())[0].types.includes("image/png"));
});

test("the Preview button on a row shows the whole clip", async () => {
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".clip")].find((item) => item.textContent.includes("second clip"));
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".row-action.show-preview").click();
  });
  await page.waitForSelector("#clip-preview[open]");
  assert.equal(await text("#clip-preview-text"), "second clip");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#clip-preview").open);
});

test("Escape closes the preview first, then the popup", async () => {
  const popup = await browser.newPage();
  await popup.goto(`${origin}/popup/popup.html`);
  await popup.waitForFunction(() => document.querySelectorAll(".clip").length > 0);
  await popup.evaluate(() => {
    const row = document.querySelector(".clip");
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".show-preview").click();
  });
  await popup.waitForSelector("#clip-preview[open]");
  assert.match(await popup.$eval("#clip-preview-details", (details) => details.textContent), /Saved/);
  await popup.keyboard.press("Escape");
  await popup.waitForFunction(() => !document.querySelector("#clip-preview").open);
  assert.equal(popup.isClosed(), false);
  const closed = new Promise((resolve) => popup.once("close", resolve));
  // The popup can close between key down and key up, which ends the key press early.
  await popup.keyboard.press("Escape").catch(() => {});
  await Promise.race([closed, wait(3000).then(() => { throw new Error("The popup didn't close"); })]);
  await page.bringToFront();
});

test("deleting a clip can be undone", async () => {
  const before = (await storedClips()).length;
  await page.hover(".clip");
  await page.click(".clip .delete");
  await page.waitForFunction(() => !document.querySelector("#undo-bar").hidden);
  assert.equal((await storedClips()).length, before - 1);
  await page.click("#undo-delete");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Deletion undone.");
  assert.equal((await storedClips()).length, before);
});

test("the pinned group collapses, stays collapsed, and leaves keyboard navigation", async () => {
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#recent-group .clip")].find((item) => item.textContent.includes("first clip"));
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".pin").click();
  });
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 1);
  assert.equal(await text("#pinned-count"), "1");
  await page.click("#pinned-toggle");
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 0);
  assert.equal(await page.$eval("#pinned-toggle-sr", (toggle) => toggle.getAttribute("aria-expanded")), "false");
  assert.equal(await page.$eval("#pinned-group", (group) => group.hidden), false);
  // The first shown clip is now the first recent one, for arrows, Enter, and Alt+1.
  const firstShown = await page.$eval(".clip", (item) => item.closest("#recent-group") !== null);
  assert.equal(firstShown, true);

  await page.waitForFunction(async () =>
    (await (await import("/lib/settings.js")).getSettings()).pinnedCollapsed === true);
  await openPopup();
  await page.waitForFunction(() => document.querySelector("#pinned-toggle-sr").getAttribute("aria-expanded") === "false");
  assert.equal(await page.$$eval("#pinned-group .clip", (rows) => rows.length), 0);
  // The Pinned filter still lists pinned clips.
  await page.click("#pinned-clips");
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 1);
  await page.click("#all-clips");
  await page.click("#pinned-toggle");
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 1);
});

test("import and export are in the footer, outside Settings", async () => {
  assert.equal(await page.$eval("#settings", (settings) => settings.open), false);
  for (const id of ["#import", "#export"]) {
    assert.equal(await page.$eval(id, (button) => button.closest(".list-footer") !== null && button.checkVisibility()), true);
  }
});

test("several selected clips can be organized at once", async () => {
  await page.click("#select-all");
  await page.waitForFunction(() => !document.querySelector("#bulk-actions").hidden);
  const selected = await page.$$eval(".clip.is-selected", (rows) => rows.length);
  await page.click("#organize-selected");
  await page.waitForSelector("#organize-dialog[open]");
  await page.type("#organize-category", "Inbox");
  await page.type("#organize-add-tags", "triage, later");
  await page.click("#apply-organize");
  await page.waitForFunction(() => /^Organized \d+ clips?\.$/.test(document.querySelector("#status").textContent));
  const clips = (await storedClips()).filter((clip) => clip.kind !== "image");
  assert.ok(clips.filter((clip) => clip.category === "Inbox" && clip.tags.includes("triage")).length >= Math.min(selected, clips.length) - 1);
  // Removing a tag from the same clips.
  await page.click("#organize-selected");
  await page.type("#organize-remove-tags", "later");
  await page.click("#apply-organize");
  await page.waitForFunction(async () =>
    !(await (await import("/lib/store.js")).list()).some((clip) => clip.tags?.includes("later")));
  await page.click("#finish-selection");
});

test("auto-tag rules organize new clips and can be applied to existing ones", async () => {
  await chooseFromMenu("open-settings");
  await page.$eval("#manage-rules", (button) => button.click());
  await page.waitForSelector("#rules-dialog[open]");
  await page.select("#rule-kind", "contains");
  await page.type("#rule-value", "invoice");
  await page.type("#rule-category", "Finance");
  await page.type("#rule-tags", "billing");
  await page.click("#rule-save");
  await page.waitForFunction(() => document.querySelector("#rules-list").textContent.includes("invoice"));
  await page.click("#apply-rules");
  await page.waitForFunction(() => /^Rules updated/.test(document.querySelector("#rules-apply-status").textContent));
  await page.click("#close-rules");
  await page.click("#close-settings");
  const invoice = (await storedClips()).find((clip) => clip.text === "Quarterly invoice 2026-Q3");
  assert.ok(invoice.tags.includes("billing"));
  assert.equal(await saveClipboard("Invoice INV-77 is due"), "Saved.");
  const saved = (await storedClips()).find((clip) => clip.text === "Invoice INV-77 is due");
  assert.deepEqual([saved.category, saved.tags], ["Finance", ["billing"]]);
});

test("Copy as changes the text, and templates fill in placeholders", async () => {
  await page.evaluate(async () => {
    const { add } = await import("/lib/store.js");
    const { createEntry } = await import("/lib/entries.js");
    await add([
      createEntry({ text: "  mixed Case text  ", createdAt: new Date().toISOString() }),
      createEntry({ text: "Today is {isodate}. Pasted: {clipboard}", template: true, createdAt: new Date(Date.now() + 1000).toISOString() }),
    ]);
  });
  await openPopup();
  const openMenuFor = (snippet) => page.evaluate((snippet) => {
    const row = [...document.querySelectorAll(".clip")].find((item) => item.textContent.includes(snippet));
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".more").click();
  }, snippet);
  await openMenuFor("mixed Case text");
  await page.waitForSelector("#clip-menu:popover-open");
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.querySelector("#clip-menu .menu-heading")?.textContent === "Copy as…");
  await page.keyboard.press("u");
  await page.waitForFunction(async () => (await navigator.clipboard.readText()) === "  MIXED CASE TEXT  ");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Copied as UPPERCASE.");

  await setClipboard("from the clipboard");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".clip")].find((item) => item.textContent.includes("{isodate}"));
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.querySelector(".copy").click();
  });
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await page.waitForFunction(async (iso) =>
    (await navigator.clipboard.readText()) === `Today is ${iso}. Pasted: from the clipboard`, {}, iso);
  const template = (await storedClips()).find((clip) => clip.template);
  assert.equal(template.useCount, 1);
});

test("clips can be sorted, and categories get colours", async () => {
  await page.select("#sort-order", "name");
  await page.waitForFunction(async () =>
    (await (await import("/lib/settings.js")).getSettings()).sortOrder === "name");
  const recentTexts = await page.$$eval("#recent-group .clip", (rows) => rows.slice(0, 3).map((row) => row.querySelector(".clip-title, .preview")?.textContent.trim().toLocaleLowerCase()));
  assert.deepEqual(recentTexts, [...recentTexts].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  await page.select("#sort-order", "used");
  await page.waitForFunction(() => document.querySelector("#recent-group .clip")?.textContent.includes("{isodate}") ||
    document.querySelector("#recent-group .clip")?.textContent.includes("MIXED") || document.querySelector("#recent-group .clip")?.textContent.includes("mixed"));
  await page.select("#sort-order", "recent");

  await chooseFromMenu("open-settings");
  await page.$eval("#manage-organization", (button) => button.click());
  await page.waitForSelector("#manage-dialog[open]");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#manage-dialog .manage-item")].find((item) => item.querySelector(".name")?.textContent === "Finance");
    row.querySelector(".color-button").click();
  });
  await page.click('#manage-dialog .color-swatch[aria-label="Teal"]');
  await page.waitForFunction(async () =>
    (await (await import("/lib/settings.js")).getSettings()).categoryColors.finance === "teal");
  await page.click("#manage-dialog .primary");
  await page.click("#close-settings");
  await page.waitForFunction(() => document.querySelector('.clip-labels .category-dot[data-color="teal"]'));
});

test("the command palette runs actions and filters", async () => {
  const shortcut = process.platform === "darwin" ? "Meta" : "Control";
  await page.focus("#search");
  await page.keyboard.down(shortcut);
  await page.keyboard.press("KeyK");
  await page.keyboard.up(shortcut);
  await page.waitForSelector("#palette[open]");
  await page.type("#palette-input", "tag billing");
  await page.waitForFunction(() => document.querySelector("#palette-list .palette-item")?.textContent.includes("#billing"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("#palette").open && document.querySelector("#filter-count").textContent === "1");
  await chooseFromMenu("open-palette");
  await page.type("#palette-input", "clear filters");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#active-filters").hidden);
  await chooseFromMenu("open-palette");
  await page.type("#palette-input", "theme dark");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await chooseFromMenu("open-palette");
  await page.type("#palette-input", "theme system");
  await page.keyboard.press("Enter");
});

test("Settings shows storage use and can delete image clips", async () => {
  await chooseFromMenu("open-settings");
  await page.waitForFunction(() => /clips/.test(document.querySelector("#storage-summary").textContent));
  assert.match(await text("#storage-summary"), /1 image/);
  await page.$eval("#delete-images", (button) => button.click());
  await page.click("#confirm-action");
  await page.waitForFunction(async () =>
    !(await (await import("/lib/store.js")).list()).some((clip) => clip.kind === "image"));
  await page.waitForFunction(() => document.querySelector("#delete-images").hidden);
  await page.click("#close-settings");
});

test("automatic saving captures copied text with the popup closed", async () => {
  await page.click("#capture-switch");
  await page.waitForFunction(() => document.querySelector("#capture-switch").getAttribute("aria-checked") === "true");
  // The monitor waits for keyboard or mouse activity, which headless Chrome never reports,
  // so the test opens the monitoring document the way the service worker does.
  await worker.evaluate(async () => {
    if ((await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length) await chrome.offscreen.closeDocument();
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html?monitor", reasons: ["CLIPBOARD"], justification: "End-to-end test",
    });
  });
  await wait(1500);
  await setClipboard("captured in the background");
  await page.waitForFunction(async () => {
    const { list } = await import("/lib/store.js");
    return (await list()).some((clip) => clip.text === "captured in the background");
  }, { timeout: 10_000 });
  // Copying a clip from Copyhold doesn't save it again.
  await setClipboard("first clip");
  await wait(2500);
  assert.equal((await storedClips()).filter((clip) => clip.text === "first clip").length, 1);
  await page.click("#capture-switch");
  await page.waitForFunction(() => document.querySelector("#capture-switch").getAttribute("aria-checked") === "false");
  await worker.evaluate(() => chrome.offscreen.closeDocument().catch(() => {}));
});

test("a large history shows its first screenful, then the rest", async () => {
  await page.evaluate(async () => {
    const { add } = await import("/lib/store.js");
    const { createEntry } = await import("/lib/entries.js");
    const start = Date.parse("2025-01-01T00:00:00Z");
    await add(Array.from({ length: 450 }, (_, index) =>
      createEntry({ text: `bulk clip ${index}`, createdAt: new Date(start + index * 1000).toISOString() })));
  });
  await openPopup();
  await page.waitForFunction(() => /^\d+ clips$/.test(document.querySelector("#count").textContent));
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 100);
  assert.match(await text("#show-more"), /Show 100 more of 3\d\d/);
});

test("the passphrase lock encrypts clips and asks for the passphrase", async () => {
  await chooseFromMenu("open-settings");
  await page.$eval("#lock-setup", (button) => button.click());
  await page.type("#new-passphrase", "correct horse battery");
  await page.type("#confirm-passphrase", "correct horse battery");
  await page.click("#save-lock");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Lock is on"), { timeout: 30_000 });
  const records = await storedClips();
  assert.ok(records.length > 400, `${records.length} clips`);
  const unsealed = records.filter((record) => !record.sealed || record.text !== undefined);
  assert.deepEqual(unsealed.map((record) => Object.keys(record).join(",")), []);

  await page.click("#close-settings");
  await chooseFromMenu("lock-now");
  await page.waitForFunction(() => !document.querySelector("#lock-screen").hidden);
  assert.equal(await page.$eval("#clips-panel", (panel) => panel.hidden), true);

  await page.type("#unlock-passphrase", "wrong passphrase");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#unlock-status").textContent === "That passphrase isn't right.", { timeout: 30_000 });

  await page.click("#unlock-passphrase", { count: 3 });
  await page.type("#unlock-passphrase", "correct horse battery");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#lock-screen").hidden, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 100);

  // Saving still works while unlocked, and the new clip is encrypted too.
  assert.equal(await saveClipboard("saved under the lock"), "Saved.");
  const saved = (await storedClips()).filter((record) => record.sealed);
  assert.equal(saved.length, records.length + 1);
  assert.ok((await clipTexts()).includes("saved under the lock"));

  await chooseFromMenu("open-settings");
  await page.click("#lock-remove");
  await page.click("#confirm-action");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Lock is off.", { timeout: 30_000 });
  const plain = await storedClips();
  assert.ok(plain.every((record) => !record.sealed && typeof record.text === "string" && record.hash));
});

test("the Firefox-only background script is left out of the Chrome build", async () => {
  const response = await page.evaluate(() => fetch("/background/firefox.js").then((result) => result.status, () => 404));
  assert.equal(response, 404);
});

// Runs axe on the page as it is now and fails on serious or critical problems.
async function checkAccessibility(view) {
  // Evaluating the source directly works under the extension's script policy, which blocks injected script tags.
  await page.evaluate(`${axeSource};0`);
  const violations = await page.evaluate(async () => {
    const results = await globalThis.axe.run(document, { resultTypes: ["violations"] });
    return results.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact))
      .map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(", ")}`);
  });
  assert.deepEqual(violations, [], `Accessibility problems in ${view}`);
}

test("the main views have no serious accessibility problems", async () => {
  await openPopup();
  await checkAccessibility("the clip list");
  await page.click("#app-menu-button");
  await page.waitForSelector("#app-menu:popover-open");
  await checkAccessibility("the ⋯ menu");
  await page.keyboard.press("Escape");
  await chooseFromMenu("open-settings");
  await checkAccessibility("Settings");
  await page.click("#close-settings");
  await page.click("#filter-button");
  await page.waitForSelector("#filter-panel:popover-open");
  await checkAccessibility("the filter panel");
  await page.keyboard.press("Escape");
  await chooseFromMenu("new");
  await checkAccessibility("the editor");
  await page.keyboard.press("Escape");
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.waitForSelector("#palette[open]");
  await checkAccessibility("the command palette");
  await page.keyboard.press("Escape");
  await page.focus("#search");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.waitForSelector("#clip-menu:popover-open");
  await checkAccessibility("the actions menu");
  await page.keyboard.press("Escape");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.evaluate(() => localStorage.setItem("copyhold-theme", "dark"));
  await openPopup();
  await checkAccessibility("the dark theme");
  await page.evaluate(() => localStorage.setItem("copyhold-theme", "system"));
  await page.emulateMediaFeatures([]);
  await openPopup();
});

// Wait briefly so a stray error from the last action surfaces inside the test run.
test("no page errors", () => wait(200));
