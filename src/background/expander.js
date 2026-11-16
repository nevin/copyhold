// Snippet expansion: registers the page script while it's turned on and site access is granted, and
// answers its requests for abbreviations and for a clip's text.
import { createOpener } from "../lib/lock.js";
import { getUnlockedKey } from "../lib/session.js";
import { getSettings, onSettingsChange, updateSettings } from "../lib/settings.js";
import * as store from "../lib/store.js";
import { fillTemplateNow } from "../lib/transforms.js";

const scriptId = "copyhold-expander";
export const siteAccess = { origins: ["<all_urls>"] };

async function syncScript() {
  try {
    const { expandAbbreviations } = await getSettings();
    const allowed = expandAbbreviations && await chrome.permissions.contains(siteAccess);
    const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] })).length > 0;
    if (allowed && !registered) {
      await chrome.scripting.registerContentScripts([{
        id: scriptId,
        matches: ["<all_urls>"],
        js: ["content/expander.js"],
        allFrames: true,
        runAt: "document_idle",
      }]);
    } else if (!allowed && registered) {
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
    }
  } catch (error) {
    console.error("Snippet expansion:", error);
  }
}

syncScript();
onSettingsChange((changes) => {
  if ("expandAbbreviations" in changes) syncScript();
});
// Taking site access away in the browser's settings turns expansion off.
chrome.permissions.onRemoved.addListener(async () => {
  if (!await chrome.permissions.contains(siteAccess)) {
    await updateSettings({ expandAbbreviations: false });
    syncScript();
  }
});

async function expand(abbreviation) {
  const match = (await store.listAbbreviations()).find((item) => item.abbreviation === abbreviation);
  if (!match) return null;
  let clip = await store.get(match.id);
  if (!clip || clip.kind === "image") return null;
  if (clip.sealed) {
    // Locked clips expand only while Copyhold is unlocked.
    const key = await getUnlockedKey();
    if (!key) return null;
    clip = await createOpener(key)(clip);
  }
  await store.update(clip.id, { lastUsedAt: new Date().toISOString(), useCount: (clip.useCount ?? 0) + 1 });
  return clip.template ? fillTemplateNow(clip.text) : clip.text;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only Copyhold's own page script, running in a tab, may ask.
  if (sender.id !== chrome.runtime.id || !sender.tab) return;
  if (message?.type === "copyhold-abbreviations") {
    getSettings()
      .then(async ({ expandAbbreviations }) => (expandAbbreviations ? (await store.listAbbreviations()).map(({ abbreviation }) => abbreviation) : []))
      .then(respond, () => respond([]));
    return true;
  }
  if (message?.type === "copyhold-expand" && typeof message.abbreviation === "string") {
    getSettings()
      .then(({ expandAbbreviations }) => (expandAbbreviations ? expand(message.abbreviation) : null))
      .then((text) => respond(text === null ? {} : { text }), () => respond({}));
    return true;
  }
});
