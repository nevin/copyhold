// Browser APIs the extension's shared modules expect, for running them under Node.
import "fake-indexeddb/auto";

globalThis.chrome = {
  runtime: { getManifest: () => ({ background: { service_worker: "background/service-worker.js" } }) },
};

const clipboard = { text: "" };
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    readText: async () => clipboard.text,
    writeText: async (text) => { clipboard.text = text; },
  },
});

export function setClipboard(text) {
  clipboard.text = text;
}
