import { lockIfExpired, lockNow } from "../lib/session.js";
import { everyMinute } from "./tick.js";

// Locking the computer locks Copyhold too, and the timer locks it after the chosen time without use.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "locked") lockNow();
});
everyMinute(lockIfExpired);
