// One alarm wakes the background once a minute for every periodic job, instead of one alarm per job,
// so the service worker starts at most once a minute.
const tickAlarm = "copyhold-tick";
// Separate alarms from before version 1.3.1, and from before the rename to Copyhold.
const replacedAlarms = ["copyhold-expiry", "copyhold-lock-timer", "copyhold-capture-watchdog", "clipfile-expiry", "clipfile-capture-watchdog"];
/** @type {(() => unknown)[]} */
const jobs = [];

/** Runs the job once a minute while the browser is open. Jobs run one after another. */
export function everyMinute(job) {
  jobs.push(job);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== tickAlarm) return;
  for (const job of jobs) {
    try {
      await job();
    } catch (error) {
      console.error("Copyhold minute job:", error);
    }
  }
});

(async () => {
  try {
    await Promise.all(replacedAlarms.map((name) => chrome.alarms.clear(name)));
    if (!await chrome.alarms.get(tickAlarm)) await chrome.alarms.create(tickAlarm, { periodInMinutes: 1 });
  } catch (error) {
    console.error("Copyhold alarm:", error);
  }
})();
