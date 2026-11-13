import { relativeTime } from "../../lib/format.js";
import { t } from "../../lib/i18n.js";

/**
 * Elements are typed loosely: the popup markup guarantees each id exists.
 * @param {string} id
 * @returns {any}
 */
export const byId = (id) => document.getElementById(id);

export const fullTab = new URLSearchParams(location.search).get("view") === "tab";
export const isMac = /mac|iphone|ipad/i.test(
  /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform,
);
export const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const iconPaths = {
  copied: "m5 12 4 4L19 6",
  copy: "M8 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM15 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pin: "m16 3 5 5-3 1-3 4v3h-2l-5-5V9h3l4-3 1-3ZM11 14l-7 7",
  edit: "m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z",
  preview: "M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h6",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5",
  select: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
  open: "M14 4h6v6m0-6-9 9m7 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "M3 3l18 18M10 6.2c.6-.1 1.3-.2 2-.2 6.4 0 10 6 10 6a16 16 0 0 1-3 3.4M6.2 7.8A17 17 0 0 0 2 12s3.6 6 10 6c1.5 0 2.9-.3 4.1-.9M10 10a3 3 0 0 0 4 4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  code: "m8 8-4 4 4 4m8-8 4 4-4 4",
  email: "M4 6h16v12H4ZM4 7l8 6 8-6",
  shield: "M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z",
  image: "M4 5h16v14H4ZM4 16l5-5 4 4 2-2 5 5M15 9h.01",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5Z",
};

/**
 * @param {keyof typeof iconPaths} name
 * @param {string} [className]
 */
export function icon(name, className = "action-icon") {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", `${className} icon-${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", iconPaths[name]);
  svg.append(path);
  return svg;
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} text
 */
export function textLine(tag, className, text) {
  const line = document.createElement(tag);
  line.className = className;
  line.textContent = text;
  return line;
}

/** @param {string} timestamp */
export function timeElement(timestamp) {
  const time = document.createElement("time");
  time.dateTime = timestamp;
  time.title = dateFormat.format(new Date(timestamp));
  time.textContent = relativeTime(timestamp);
  return time;
}

/**
 * @param {string} message
 * @param {boolean} [error]
 */
export function status(message, error = false) {
  const output = byId("status");
  output.textContent = message;
  output.classList.toggle("error", error);
}

/** @param {() => unknown} action */
export async function run(action) {
  try {
    await action();
  } catch (error) {
    status(error.message || t("somethingWentWrong"), true);
  }
}
