// Measures Copyhold's memory, disk, and CPU use in Chrome for Testing with generated clips.
// Usage: npm run build && node scripts/perf.mjs
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = fileURLToPath(new URL("../", import.meta.url));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [`${root}dist/chromium`] });
const target = await browser.waitForTarget((candidate) => candidate.type() === "service_worker");
const origin = `chrome-extension://${new URL(target.url()).host}`;
const worker = await target.worker();
const page = await browser.newPage();
await page.goto(`${origin}/popup/popup.html?view=tab`);

function inPage(work, ...args) {
  return page.evaluate(work, ...args);
}

async function clearClips() {
  await inPage(async () => {
    const store = await import("/lib/store.js");
    await store.removeMany((await store.list()).map(({ id }) => id));
  });
}

async function usage() {
  return inPage(async () => (await navigator.storage.estimate()).usage);
}

// Text clips of mixed length, a little like a real history.
async function addTextClips(count) {
  await inPage(async (count) => {
    const { add } = await import("/lib/store.js");
    const { createEntry } = await import("/lib/entries.js");
    const words = "copy paste meeting invoice https example com function const return project review draft notes".split(" ");
    const start = Date.now() - count * 60_000;
    for (let offset = 0; offset < count; offset += 1000) {
      const batch = [];
      for (let index = offset; index < Math.min(count, offset + 1000); index++) {
        const length = 5 + (index * 7919) % 40;
        const text = Array.from({ length }, (_, word) => words[(index + word * 31) % words.length]).join(" ");
        batch.push(createEntry({
          text,
          title: index % 5 ? "" : `Clip ${index}`,
          tags: index % 3 ? [] : ["work", `tag${index % 20}`],
          category: index % 4 ? "" : "Work",
          createdAt: new Date(start + index * 60_000).toISOString(),
        }));
      }
      await add(batch);
    }
  }, count);
}

async function addImageClips(count) {
  await inPage(async (count) => {
    const { add } = await import("/lib/store.js");
    const { createEntry } = await import("/lib/entries.js");
    const { describeImage } = await import("/lib/images.js");
    const clips = [];
    for (let index = 0; index < count; index++) {
      // A screenshot-like image: flat areas with some text-like detail.
      const canvas = new OffscreenCanvas(1440, 900);
      const context = canvas.getContext("2d");
      context.fillStyle = "#f5f6f9";
      context.fillRect(0, 0, 1440, 900);
      context.fillStyle = "#1d2330";
      context.font = "16px sans-serif";
      for (let line = 0; line < 40; line++) context.fillText(`Line ${line} of screenshot ${index}: lorem ipsum dolor sit amet`, 40, 40 + line * 20);
      clips.push(createEntry({ kind: "image", ...await describeImage(await canvas.convertToBlob({ type: "image/png" })) }));
    }
    await add(clips);
  }, count);
}

async function cdpMetrics(session) {
  const { metrics } = await session.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

// CPU share of one context over a period, from the time its main thread spent running tasks.
async function cpuOver(session, seconds) {
  const before = await cdpMetrics(session);
  await wait(seconds * 1000);
  const after = await cdpMetrics(session);
  return {
    cpu: (after.TaskDuration - before.TaskDuration) / seconds,
    heap: after.JSHeapUsedSize,
  };
}

console.log("Disk");
await clearClips();
const empty = await usage();
await addTextClips(10_000);
await wait(1500);
const withText = await usage();
console.log(`  10,000 text clips: ${mb(withText - empty)} (${Math.round((withText - empty) / 10_000)} bytes each)`);
await addImageClips(10);
await wait(1500);
const withImages = await usage();
const imageSizes = await inPage(async () => (await (await import("/lib/store.js")).list())
  .filter((clip) => clip.kind === "image").map((clip) => [clip.image.size, clip.thumbnail.size]));
console.log(`  10 screenshot clips: ${mb(withImages - withText)}; image ${mb(imageSizes[0][0])}, thumbnail ${(imageSizes[0][1] / 1000).toFixed(1)} KB each`);

console.log("Popup");
for (const count of [1_000, 10_000, 20_000]) {
  await clearClips();
  await addTextClips(count);
  const popup = await browser.newPage();
  const started = Date.now();
  await popup.goto(`${origin}/popup/popup.html`);
  await popup.waitForFunction(() => document.querySelector(".clip"));
  const firstRows = Date.now() - started;
  await popup.waitForFunction(() => /clips$/.test(document.querySelector("#count").textContent));
  const allLoaded = Date.now() - started;
  const metrics = await popup.metrics();
  const keystroke = await popup.evaluate(async () => {
    const search = document.querySelector("#search");
    const start = performance.now();
    search.value = "invoice review";
    search.dispatchEvent(new Event("input"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
  console.log(`  ${count.toLocaleString()} clips: first rows ${firstRows} ms, all loaded ${allLoaded} ms, search ${keystroke.toFixed(0)} ms, ` +
    `heap ${mb(metrics.JSHeapUsedSize)}, ${metrics.Nodes} DOM nodes`);
  await popup.close();
}

console.log("Background monitor");
await worker.evaluate(async () => {
  if ((await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length) await chrome.offscreen.closeDocument();
  await chrome.offscreen.createDocument({ url: "offscreen/offscreen.html?monitor", reasons: ["CLIPBOARD"], justification: "Measurement" });
});
await wait(1000);
const offscreen = browser.targets().find((candidate) => candidate.url().includes("offscreen.html"));
const offscreenSession = await offscreen.createCDPSession();
await offscreenSession.send("Performance.enable");
await page.bringToFront();
await inPage(() => navigator.clipboard.writeText("unchanged text on the clipboard"));
await wait(2000);
const idleText = await cpuOver(offscreenSession, 20);
console.log(`  Text on the clipboard: ${(idleText.cpu * 100).toFixed(2)}% of one core, heap ${mb(idleText.heap)}`);

await inPage(async () => {
  const { updateSettings } = await import("/lib/settings.js");
  await updateSettings({ captureImages: true });
  const canvas = new OffscreenCanvas(1920, 1080);
  const context = canvas.getContext("2d");
  context.fillStyle = "#e6e8ee";
  context.fillRect(0, 0, 1920, 1080);
  context.fillStyle = "#4334a3";
  for (let index = 0; index < 200; index++) context.fillRect((index * 97) % 1900, (index * 53) % 1060, 20, 12);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": await canvas.convertToBlob({ type: "image/png" }) })]);
});
await wait(3000);
const idleImage = await cpuOver(offscreenSession, 20);
console.log(`  Image on the clipboard, image saving on: ${(idleImage.cpu * 100).toFixed(2)}% of one core, heap ${mb(idleImage.heap)}`);

const workerSession = await target.createCDPSession();
await workerSession.send("Performance.enable").catch(() => {});
const alarms = await worker.evaluate(async () => (await chrome.alarms.getAll()).map(({ name, periodInMinutes }) => `${name} every ${periodInMinutes} min`));
console.log("Service worker");
console.log(`  Alarms: ${alarms.join(", ")}`);

await browser.close();
