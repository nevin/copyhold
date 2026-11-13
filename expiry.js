import { removeExpired } from "./store.js";

const alarmName = "clipfile-expiry";

async function cleanUp() {
  try {
    if (await removeExpired()) {
      const changes = new BroadcastChannel("clipfile-entries");
      changes.postMessage("updated");
      changes.close();
    }
  } catch (error) {
    console.error("Clip expiry:", error);
  }
}

async function startExpiry() {
  try {
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
