# Clipfile

Clipfile is a standalone Manifest V3 clipboard manager for desktop Chrome, Edge, and Firefox. It saves plain-text clips in the current browser profile.

## Install locally

- **Chrome 116 or later** · Run `npm run build -- chromium`. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Edge** · Build the same Chromium target, then open `edge://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Firefox 142 or later** · Run `npm run build -- firefox`. Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`. Temporary installations last until Firefox restarts.

Open **Clipfile** from the browser’s extensions menu. Use **Open in tab** for more room.

## Build and package

The build uses Node.js and npm and has no npm dependencies. Packaging also requires the `zip` command on your PATH.

```sh
npm run build
npm run package
```

The build creates `dist/chromium` for Chrome and Edge and `dist/firefox` for Firefox. Load the Chromium folder as an unpacked extension or select `dist/firefox/manifest.json` as a temporary add-on.

Packaging rebuilds the extension and writes `dist/clipfile-<version>-chromium.zip` and `dist/clipfile-<version>-firefox.zip` for store submission. The version comes from `manifest.json`. To build or package one target, append `-- chromium` or `-- firefox` to either command.

## Use Clipfile

- In Chrome and Edge, **Pause** stops automatic capture for 15 minutes. Choose **Resume** to restart sooner. The monitor skips the clipboard contents it first sees on resume. **Save clipboard** is available during a pause. **Retry capture** restarts the monitor if the popup cannot confirm a recent successful read.
- Open the popup with **Alt+Shift+Y** (**Option+Shift+Y** on macOS) if the shortcut is available. Search is focused when the popup opens. Press **Enter** in search to copy the first result.
- After deleting one or more clips, **Undo** restores the most recent deletion for 12 seconds while the view stays open. Clips that have expired remain deleted.
- In **Settings and backups**, choose a default retention period for new clips you create or capture. The default starts at creation, leaves existing clips and imported backups as they are, and is cleared when you pin the clip. An expiry you set manually still applies to a pinned clip.

Set **Delete automatically at** when creating or editing a clip to give it an expiry. Leave the field blank to keep it. Clipfile checks for expired clips about once a minute while the browser is running and cleans up overdue clips when it starts.

- Select **Save clipboard** to save the current clipboard text. If the same text is already saved, Clipfile shows a message. Use **New clip** to type or paste text with an optional title and description.
- Click a clip row or use its **Copy** button to copy the original text and record when it was used. Pinned clips appear first. Clips are sorted by recent use, or by creation time if they have never been copied from Clipfile.
- Use **Edit** to change the text, title, description, or display. **Mask text** shows bullets and **Hide text** replaces the preview with a label. The title and description remain visible. Use **Delete** to remove the entry.
- **Export** downloads a JSON backup. **Import** appends the backup entries with fresh IDs, preserving duplicate content, display preferences, stars, and timestamps. Import uses the full-tab view to keep the file picker open.

Use **Search clips** to find clips by title, description, or visible text. Select **Pinned** to narrow the list to pinned clips. Backup controls are under **Settings and backups**.

Use the eye button on a clip to show up to three characters of its text followed by `**`. The title stays visible. A crossed-out eye restores the full preview for a masked or hidden clip.

In Chrome and Edge, Clipfile automatically saves plain text from the clipboard while the browser is running, even when the Clipfile window is closed. To turn this off, open **Settings and backups** and uncheck **Automatically save copied text**. Clipfile checks for changes about once per second and can miss text that is replaced between checks. Firefox supports **Save clipboard** for manual capture.

Clipfile stores entries locally and makes no network requests. Masking and hiding affect the table preview. The original text remains available to edit and copy, and exports contain it in plain text.
