import { captureAutomatically } from "./clipboard.js";

const pollInterval = 1000;

/**
 * Polls the clipboard about once a second, backing off while reads fail.
 * @param {() => any} read Returns clipboard content, or undefined if the read failed.
 */
export function createPoller(read) {
  const changes = new BroadcastChannel("copyhold-entries");
  let delay = pollInterval;
  let timer;
  let running = false;
  const health = { lastSuccess: 0, failed: false };

  async function capture() {
    try {
      const changed = await captureAutomatically(read);
      if (changed === null) throw new Error("Clipboard read did not complete.");
      health.lastSuccess = Date.now();
      health.failed = false;
      if (changed) changes.postMessage("updated");
      delay = pollInterval;
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
      delay = pollInterval;
      capture();
    },
    stop() {
      running = false;
      clearTimeout(timer);
    },
  };
}
