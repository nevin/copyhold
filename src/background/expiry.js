import { getSettings } from "../lib/settings.js";
import { backfillHashes, removeExpired, trimHistory } from "../lib/store.js";
import { everyMinute } from "./tick.js";

async function cleanUp() {
  try {
    // Trimming here also covers clips added by import or New clip.
    const expired = await removeExpired();
    const trimmed = await trimHistory((await getSettings()).historyLimit);
    if (expired || trimmed) {
      const changes = new BroadcastChannel("copyhold-entries");
      changes.postMessage("updated");
      changes.close();
    }
  } catch (error) {
    console.error("Clip expiry:", error);
  }
}

async function startExpiry() {
  await cleanUp();
  try {
    await backfillHashes();
  } catch (error) {
    console.error("Clip hashes:", error);
  }
}

everyMinute(cleanUp);
chrome.runtime.onInstalled.addListener(startExpiry);
chrome.runtime.onStartup.addListener(startExpiry);
