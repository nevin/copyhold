// Captures the website screenshots from the built Chrome extension, filled with sample clips, then
// composes the Chrome Web Store screenshots from them.
// Usage: npm run build && node scripts/screenshots.mjs [site folder] [store folder]
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.argv[2] ?? `${root}site/screenshots`;
const storeOutput = process.argv[3] ?? `${root}docs/store-assets`;

// Store screenshots: a headline beside a popup screenshot, 1280×800.
const storeShots = [
  ["screenshot-1", "popup-list", "Everything you copy, kept close.", "Search your clipboard history and copy any clip again in a keystroke."],
  ["screenshot-2", "popup-locked", "Lock it with a passphrase.", "Every clip is encrypted on your device. Copyhold keeps saving while it's locked."],
  ["screenshot-3", "popup-settings", "Secrets stay masked.", "Passwords, API keys, and card numbers are recognized and masked automatically."],
  ["screenshot-4", "popup-compact-dark", "See more at once.", "Compact view fits twice the clips, with images, ages, and quick actions."],
  ["screenshot-5", "popup-filter", "Organized your way.", "Give clips a category, a subcategory, and tags, then filter by any of them."],
];
const minute = 60_000;

// A made-up key, assembled at runtime so secret scanners don't mistake it for a real one.
const fakeApiKey = ["sk", "live", "51HxQexampleexampleexample00"].join("_");
// Sample clips only: nothing here comes from a real clipboard.
const samples = [
  { text: "https://developer.chrome.com/docs/extensions/reference/api/offscreen", minutesAgo: 2, category: "Work", subcategory: "Research", tags: ["docs", "chrome"] },
  { text: "Thanks for the quick turnaround! I'll review the draft this afternoon and send notes by Friday.", minutesAgo: 9, expiresInMinutes: 40, category: "Work", subcategory: "Email", tags: ["reply"] },
  { text: "#4334A3", minutesAgo: 25, category: "Design", tags: ["brand"] },
  { text: "const total = items.reduce((sum, item) => sum + item.price, 0);", minutesAgo: 48, category: "Work", subcategory: "Code", tags: ["snippet", "js"] },
  { text: fakeApiKey, minutesAgo: 70, visibility: "masked", sensitive: "apiKey" },
  { text: "ops-team@example.com", minutesAgo: 190, category: "Work", tags: ["contacts"] },
  { text: "221B Baker Street, London NW1 6XE", minutesAgo: 60 * 26, title: "Office address", description: "For deliveries and invoices", pinned: true, category: "Personal", tags: ["address"] },
  { text: "Meeting notes: ship 1.2 on Thursday, update store listing, refresh screenshots.", minutesAgo: 60 * 50 },
  { text: "Hi {clipboard}, thanks for reaching out. I'll get back to you by {weekday}.", minutesAgo: 60 * 30, title: "Quick reply", description: "Fills in the name from the clipboard", template: true, category: "Work", subcategory: "Email", tags: ["reply"] },
  { text: "npm run package", minutesAgo: 60 * 75, title: "Build command", expiresInMinutes: 60 * 24 * 3, description: "Builds the store packages in dist", pinned: true, category: "Work", subcategory: "Code", tags: ["snippet", "cli"] },
];

async function seed(page, { image = true } = {}) {
  await page.evaluate(async (samples, minute, image) => {
    const store = await import("/lib/store.js");
    const { createEntry } = await import("/lib/entries.js");
    const { describeImage } = await import("/lib/images.js");
    const { updateSettings } = await import("/lib/settings.js");
    await store.removeMany((await store.list()).map(({ id }) => id));
    const now = Date.now();
    const clips = samples.map(({ minutesAgo, expiresInMinutes, ...fields }) => createEntry({
      ...fields,
      createdAt: new Date(now - minutesAgo * minute).toISOString(),
      expiresAt: expiresInMinutes ? new Date(now + expiresInMinutes * minute).toISOString() : null,
    }));
    if (image) {
      const canvas = new OffscreenCanvas(640, 360);
      const context = canvas.getContext("2d");
      const gradient = context.createLinearGradient(0, 0, 640, 360);
      gradient.addColorStop(0, "#4334a3");
      gradient.addColorStop(1, "#7fe0bf");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#ffffffd9";
      context.fillRect(60, 70, 320, 28);
      context.fillRect(60, 120, 220, 18);
      context.fillRect(60, 150, 260, 18);
      const png = await canvas.convertToBlob({ type: "image/png" });
      clips.push(createEntry({ kind: "image", ...await describeImage(png), createdAt: new Date(now - 14 * minute).toISOString() }));
    }
    await store.add(clips);
    await updateSettings({
      autoCapture: false, autoCaptureAsked: true, density: "comfortable", hidePreviews: false, rules: [],
      categoryColors: { work: "blue", personal: "green", design: "pink" },
    });
  }, samples, minute, image);
}

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [`${root}dist/chromium`] });
try {
  const target = await browser.waitForTarget((candidate) => candidate.type() === "service_worker");
  const origin = `chrome-extension://${new URL(target.url()).host}`;
  const page = await browser.newPage();
  await mkdir(output, { recursive: true });

  async function open({ width = 448, height = 600, theme = "light", tab = false } = {}) {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.evaluate((theme) => localStorage.setItem("copyhold-theme", theme), theme).catch(() => {});
    await page.goto(`${origin}/popup/popup.html${tab ? "?view=tab" : ""}`);
    await page.evaluate((theme) => localStorage.setItem("copyhold-theme", theme), theme);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll(".clip").length > 0 || !document.querySelector("#lock-screen").hidden);
    await page.evaluate(() => document.fonts.ready);
  }


  // Settings and less frequent actions live in the ⋯ menu in the header.
  async function chooseFromMenu(id) {
    await page.click("#app-menu-button");
    await page.waitForSelector("#app-menu:popover-open");
    await page.click(`#${id}`);
  }

  async function shot(name) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await page.screenshot({ path: `${output}/${name}.png` });
    console.log(`Saved ${name}.png`);
  }

  await page.goto(`${origin}/popup/popup.html`);
  await seed(page);

  await open();
  await page.focus("#search");
  await page.keyboard.press("ArrowDown");
  await shot("popup-list");

  await page.evaluate(async () => (await import("/lib/settings.js")).updateSettings({ density: "compact" }));
  await open({ theme: "dark" });
  await page.hover(".clip:nth-of-type(3)");
  await shot("popup-compact-dark");
  await page.evaluate(async () => (await import("/lib/settings.js")).updateSettings({ density: "comfortable" }));

  await open();
  await page.focus("#search");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await shot("popup-menu");

  await open();
  await page.click("#select-all");
  await page.click(".clip:nth-of-type(2)");
  await shot("popup-select");

  await open();
  await chooseFromMenu("open-settings");
  await page.$eval('label[for="sensitive-clips"]', (label) => label.scrollIntoView({ block: "start" }));
  await page.$eval(".settings-body", (body) => body.scrollBy(0, -12));
  await shot("popup-settings");
  await page.keyboard.press("Escape");

  await open({ height: 680 });
  await page.click("#filter-button");
  await page.evaluate(() => [...document.querySelectorAll("#filter-panel .tag")].find((tag) => tag.textContent.startsWith("#snippet")).click());
  await page.evaluate(() => [...document.querySelectorAll("#filter-panel .filter-option")].find((item) => item.textContent.startsWith("Work")).click());
  await page.hover("#filter-panel");
  await shot("popup-filter");
  await page.keyboard.press("Escape");

  await open({ height: 640 });
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".clip")].find((item) => item.textContent.includes("Build command"));
    row.querySelector(".show-preview").click();
  });
  await page.waitForSelector("#clip-preview[open]");
  await shot("popup-preview");
  await page.keyboard.press("Escape");

  await open({ height: 640 });
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
  await page.type("#palette-input", "filter");
  await shot("popup-palette");
  await page.keyboard.press("Escape");

  await open({ height: 640 });
  await page.evaluate(async () => {
    const { updateSettings } = await import("/lib/settings.js");
    await updateSettings({ rules: [
      { id: "a", kind: "domain", value: "github.com", category: "Work", subcategory: "Code", tags: ["code"] },
      { id: "b", kind: "contains", value: "invoice", category: "Finance", subcategory: "", tags: ["billing"] },
    ] });
  });
  await chooseFromMenu("open-settings");
  await page.$eval("#manage-rules", (button) => button.click());
  await shot("popup-rules");
  await page.click("#close-rules");
  await page.keyboard.press("Escape");

  await open({ height: 640 });
  await page.hover(".clip:nth-of-type(2)");
  await page.click(".clip:nth-of-type(2) .edit");
  await page.click("#title");
  await page.type("#title", " for CI");
  await new Promise((resolve) => setTimeout(resolve, 900));
  await shot("popup-editor");
  await page.keyboard.press("Escape");

  await open({ height: 400 });
  await page.evaluate(async () => {
    const { createLock } = await import("/lib/lock.js");
    const store = await import("/lib/store.js");
    const { lock } = await createLock("sample passphrase");
    await store.setMeta({ lock });
  });
  await open({ height: 400 });
  await shot("popup-locked");
  await page.evaluate(async () => (await import("/lib/store.js")).setMeta({ lock: undefined }));

  await open({ width: 1200, height: 760, tab: true });
  await shot("full-tab");

  await mkdir(storeOutput, { recursive: true });
  const icon = (await readFile(`${root}src/icons/128.png`)).toString("base64");
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (const [name, source, title, text] of storeShots) {
    const image = (await readFile(`${output}/${source}.png`)).toString("base64");
    await page.setContent(`<!doctype html><style>
      body { margin: 0; width: 1280px; height: 800px; overflow: hidden; display: flex; align-items: center;
        font-family: system-ui, -apple-system, sans-serif; color: #1d2330;
        background: radial-gradient(circle at 78% 92%, #e4e0fb 0 38%, transparent 38.2%), #f4f3fc; }
      .copy { flex: 1; padding-inline: 80px 40px; }
      .brand { display: flex; align-items: center; gap: 14px; color: #4334a3; font-size: 24px; font-weight: 600; }
      .brand img { width: 36px; height: 36px; border-radius: 8px; }
      h1 { margin: 44px 0 0; font-size: 56px; line-height: 1.05; letter-spacing: -0.035em; }
      p { margin: 22px 0 0; max-width: 470px; color: #5b6474; font-size: 22px; line-height: 1.5; }
      .shot { margin-inline-end: 80px; width: 452px; border-radius: 14px; overflow: hidden;
        box-shadow: 0 1px 2px #1d23300f, 0 24px 60px #1d233026; }
      .shot img { display: block; width: 100%; }
    </style>
    <div class="copy"><div class="brand"><img src="data:image/png;base64,${icon}">Copyhold</div><h1>${title}</h1><p>${text}</p></div>
    <div class="shot"><img src="data:image/png;base64,${image}"></div>`);
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
    await page.screenshot({ path: `${storeOutput}/${name}.png` });
    console.log(`Saved store ${name}.png`);
  }
} finally {
  await browser.close();
}
