import { getSettings } from "../lib/settings.js";
import { backfillHashes, purgeTrash, removeExpired, trimHistory } from "../lib/store.js";
import { everyMinute } from "./tick.js";

async function cleanUp() {
  try {
    // Trimming here also covers clips added by import or New clip.
    const expired = await removeExpired();
    // Trashed clips are removed for good after 30 days.
    await purgeTrash(30);
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
