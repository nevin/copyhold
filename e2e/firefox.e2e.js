// Loads the built Firefox add-on in Firefox through WebDriver BiDi. Skipped when Firefox isn't installed;
// set FIREFOX_PATH to use a particular copy.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const uuid = "6b1c2f0e-1111-4222-8333-944455556666";
const build = fileURLToPath(new URL("../dist/firefox", import.meta.url));
const copy = fileURLToPath(new URL("../dist/firefox-e2e", import.meta.url));
const macFirefox = "/Applications/Firefox.app/Contents/MacOS/firefox";
const executablePath = process.env.FIREFOX_PATH ?? (existsSync(macFirefox) ? macFirefox : undefined);
let browser;
let page;
let skip = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const storedTexts = () => page.evaluate(async () => (await (await import("/lib/store.js")).list()).map((clip) => clip.text));

before(async () => {
  // WebDriver BiDi can't open extension pages directly, so a test copy lets an ordinary page open the popup.
  await rm(copy, { recursive: true, force: true });
  await cp(build, copy, { recursive: true });
  const manifest = JSON.parse(await readFile(`${copy}/manifest.json`, "utf8"));
  manifest.web_accessible_resources = [{ resources: ["popup/popup.html"], matches: ["<all_urls>"] }];
  await writeFile(`${copy}/manifest.json`, JSON.stringify(manifest));
  try {
    browser = await puppeteer.launch({
      browser: "firefox",
      executablePath,
      headless: !process.env.HEADFUL,
      // Scripting extension pages needs system access: older Firefox takes the flag, newer the variable.
      args: ["--remote-allow-system-access"],
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
      extraPrefsFirefox: { "extensions.webextensions.uuids": JSON.stringify({ "copyhold@local-extension": uuid }) },
    });
  } catch (error) {
    skip = `Firefox is not available: ${error.message.split("\n")[0]}`;
    return;
  }
  await browser.installExtension(copy);
  page = (await browser.pages())[0];
  page.on("pageerror", (error) => { throw error; });
  // A freshly installed add-on can take a moment to serve its pages, so opening the popup is retried.
  const url = `moz-extension://${uuid}/popup/popup.html?view=tab`;
  for (let attempt = 1; ; attempt++) {
    try {
      await page.evaluate((url) => { location.href = url; }, url).catch(() => {});
      await page.waitForSelector("#capture-prompt:not([hidden])", { timeout: 5000 });
      break;
    } catch (error) {
      if (attempt === 6) throw error;
      await wait(1000);
    }
  }
});

after(async () => {
  await browser?.close();
  await rm(copy, { recursive: true, force: true });
});

test("Firefox offers automatic saving and captures from its background page", async (t) => {
  if (skip) return t.skip(skip);
  await page.click("#capture-prompt-on");
  await page.waitForFunction(() => document.querySelector("#capture-indicator").dataset.state === "active");
  await wait(1500);
  await page.evaluate(() => navigator.clipboard.writeText("copied in Firefox"));
  await page.waitForFunction(async () =>
    (await (await import("/lib/store.js")).list()).some((clip) => clip.text === "copied in Firefox"), { timeout: 10_000 });
  await page.click("#capture-switch");
  await page.waitForFunction(() => document.querySelector("#capture-switch").getAttribute("aria-checked") === "false");
});

test("Save clipboard works in Firefox", async (t) => {
  if (skip) return t.skip(skip);
  await page.evaluate(() => navigator.clipboard.writeText("saved with the button"));
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.click("#capture");
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Saved.");
  assert.ok((await storedTexts()).includes("saved with the button"));
});

test("the passphrase lock works with Firefox session storage", async (t) => {
  if (skip) return t.skip(skip);
  await page.click("#settings summary");
  await page.click("#lock-setup");
  await page.type("#new-passphrase", "firefox passphrase");
  await page.type("#confirm-passphrase", "firefox passphrase");
  await page.click("#save-lock");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Lock is on"), { timeout: 30_000 });
  await page.click("#close-settings");
  await page.click("#lock-now");
  await page.waitForSelector("#lock-screen:not([hidden])");
  await page.type("#unlock-passphrase", "firefox passphrase");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#lock-screen").hidden, { timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".clip .preview")].some((preview) => preview.textContent === "copied in Firefox"));
});
