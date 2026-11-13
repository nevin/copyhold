import { emptyFilter } from "../../lib/organize.js";

// State shared by the popup's modules. Each module reads and writes these fields directly.
export const state = {
  /** Every saved clip, sorted for display. @type {any[]} */
  clips: [],
  /** True until the whole history has loaded; the first screenful loads first. */
  partial: false,
  /** Clips currently rendered, in list order. @type {any[]} */
  shownClips: [],
  /** @type {string | undefined} */
  activeId: undefined,
  selecting: false,
  /** @type {Set<string>} */
  selectedIds: new Set(),
  // Shown in place of every visible clip's text, for screen sharing; rows rebuild when it changes.
  hidePreviews: false,
  // The pinned group is folded away; its clips leave the list and keyboard navigation until it opens.
  pinnedCollapsed: false,
  sortOrder: "recent",
  /** Colour names keyed by lower-case category name. @type {Record<string, string>} */
  categoryColors: {},
  colorsVersion: 0,
  autoCaptureEnabled: false,
  closeAfterCopy: true,
  openShortcut: "",
  /** Category, subcategory, and tags chosen in the filter panel. @type {import("../../lib/organize.js").Filter} */
  filter: emptyFilter(),
  saveShortcut: "",
};

export const changes = new BroadcastChannel("copyhold-entries");
