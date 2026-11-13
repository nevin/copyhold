import { getSettings } from "./settings.js";
import { removeExpired, trimHistory } from "./store.js";

const alarmName = "copyhold-expiry";

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
  try {
    await chrome.alarms.clear("clipfile-expiry");
    if (!await chrome.alarms.get(alarmName)) {
      await chrome.alarms.create(alarmName, { periodInMinutes: 1 });
    }
  } catch (error) {
    console.error("Clip expiry alarm:", error);
  }
  await cleanUp();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) return cleanUp();
});
chrome.runtime.onInstalled.addListener(startExpiry);
chrome.runtime.onStartup.addListener(startExpiry);
