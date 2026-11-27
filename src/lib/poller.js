import { captureAutomatically, captureStatus } from "./clipboard.js";

const pollInterval = 1000;
// After a minute with nothing new copied, checks slow to every few seconds to save battery, and speed up
// again as soon as something new appears.
const quietAfter = 60_000;
const quietInterval = 3000;

/**
 * Polls the clipboard about once a second, more slowly while nothing changes, backing off while reads fail.
 * @param {() => any} read Returns clipboard content, or undefined if the read failed.
 */
export function createPoller(read) {
  const changes = new BroadcastChannel("copyhold-entries");
  let delay = pollInterval;
  let timer;
  let running = false;
  const health = { lastSuccess: 0, failed: false, lastSavedAt: 0, startedAt: 0 };

  async function capture() {
    try {
      const changed = await captureAutomatically(read);
      if (changed === null) throw new Error("Clipboard read did not complete.");
      health.lastSuccess = Date.now();
      health.failed = false;
      health.lastSavedAt = captureStatus.savedAt;
      if (changed) changes.postMessage("updated");
      const quietSince = Math.max(captureStatus.changedAt, health.startedAt);
      delay = Date.now() - quietSince > quietAfter ? quietInterval : pollInterval;
    } catch (error) {
      console.error("Could not capture the clipboard:", error);
      health.failed = true;
      delay = Math.min(delay * 2, 30_000);
    } finally {
      if (running) timer = setTimeout(capture, delay);
    }
  }

  return {
    health,
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      health.startedAt = Date.now();
      delay = pollInterval;
      capture();
    },
    stop() {
      running = false;
      clearTimeout(timer);
    },
  };
}
