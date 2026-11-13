import { lockIfExpired, lockNow } from "../lib/session.js";

const alarmName = "copyhold-lock-timer";

// Locking the computer locks Copyhold too, and the timer locks it after the chosen time without use.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "locked") lockNow();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) return lockIfExpired();
});
chrome.alarms.get(alarmName).then((alarm) => {
  if (!alarm) chrome.alarms.create(alarmName, { periodInMinutes: 1 });
});
