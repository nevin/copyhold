// Loads the built Chrome extension in Chrome for Testing and drives the popup like a person would.
// Run with `npm run test:e2e` after `npm run build`.
import assert from "node:assert/strict";
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
  await page.click("#new");
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
  await page.click("#new");
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
  await page.click("#settings summary");
  await page.$eval("#manage-organization", (button) => button.click());
  await page.waitForSelector("#manage-dialog[open]");
  const rowFor = (label) => page.evaluateHandle((label) =>
    [...document.querySelectorAll("#manage-dialog .manage-item")].find((item) => item.querySelector(".name")?.textContent === label), label);
  await (await rowFor("#urgent")).evaluate((item) => item.querySelector("button").click());
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.type("important");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#manage-status").textContent === "Renamed in 2 clips.");
  await (await rowFor("Home")).evaluate((item) => item.querySelectorAll("button")[1].click());
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
    row.querySelector(".pin").click();
  });
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 1);
  assert.equal(await text("#pinned-count"), "1");
  await page.click("#pinned-toggle");
  await page.waitForFunction(() => document.querySelectorAll("#pinned-group .clip").length === 0);
  assert.equal(await page.$eval("#pinned-toggle", (toggle) => toggle.getAttribute("aria-expanded")), "false");
  assert.equal(await page.$eval("#pinned-group", (group) => group.hidden), false);
  // The first shown clip is now the first recent one, for arrows, Enter, and Alt+1.
  const firstShown = await page.$eval(".clip", (item) => item.closest("#recent-group") !== null);
  assert.equal(firstShown, true);

  await page.waitForFunction(async () =>
    (await (await import("/lib/settings.js")).getSettings()).pinnedCollapsed === true);
  await openPopup();
  await page.waitForFunction(() => document.querySelector("#pinned-toggle").getAttribute("aria-expanded") === "false");
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
  assert.equal(await page.$$eval(".clip", (clips) => clips.length), 200);
  assert.match(await text("#show-more"), /Show 200 more of 2\d\d/);
});

test("the passphrase lock encrypts clips and asks for the passphrase", async () => {
  await page.click("#settings summary");
  await page.click("#lock-setup");
  await page.type("#new-passphrase", "correct horse battery");
  await page.type("#confirm-passphrase", "correct horse battery");
  await page.click("#save-lock");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Lock is on"), { timeout: 30_000 });
  const records = await storedClips();
  assert.ok(records.length > 400);
  assert.ok(records.every((record) => record.sealed && record.text === undefined));

  await page.click("#close-settings");
  await page.click("#lock-now");
  await page.waitForFunction(() => !document.querySelector("#lock-screen").hidden);
  assert.equal(await page.$eval("#clips-panel", (panel) => panel.hidden), true);

  await page.type("#unlock-passphrase", "wrong passphrase");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#unlock-status").textContent === "That passphrase isn't right.", { timeout: 30_000 });

  await page.click("#unlock-passphrase", { count: 3 });
  await page.type("#unlock-passphrase", "correct horse battery");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#lock-screen").hidden, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".clip").length === 200);

  // Saving still works while unlocked, and the new clip is encrypted too.
  assert.equal(await saveClipboard("saved under the lock"), "Saved.");
  const saved = (await storedClips()).filter((record) => record.sealed);
  assert.equal(saved.length, records.length + 1);
  assert.ok((await clipTexts()).includes("saved under the lock"));

  await page.click("#settings summary");
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

// Wait briefly so a stray error from the last action surfaces inside the test run.
test("no page errors", () => wait(200));
