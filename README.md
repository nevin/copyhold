# Copyhold

**[Website](https://nevin.github.io/copyhold/) · [Download for Chrome](https://github.com/nevin/copyhold/releases/latest/download/copyhold-chromium.zip) · [Privacy](PRIVACY.md)**

Copyhold is a standalone Manifest V3 clipboard manager for desktop Chrome, Edge, and Firefox. It saves plain-text clips in the current browser profile.

## Install the latest release

Until Copyhold is in the Chrome Web Store, [download `copyhold-chromium.zip`](https://github.com/nevin/copyhold/releases/latest/download/copyhold-chromium.zip) and unzip it. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, select **Load unpacked**, and choose the `copyhold` folder. To update, replace the folder's files with a newer release and select the reload button on Copyhold's card. Your clips are kept.

## Build from source

- **Chrome 116 or later** · Run `npm run build -- chromium`. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Edge** · Build the same Chromium target, then open `edge://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Firefox 142 or later** · Run `npm run build -- firefox`. Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`. Temporary installations last until Firefox restarts.

Open **Copyhold** from the browser’s extensions menu. Use **Open in tab** for more room.

## Build and package

The build uses Node.js and npm and has no npm dependencies. Packaging also requires the `zip` command on your PATH.

```sh
npm run build
npm run package
```

The build creates `dist/chromium` for Chrome and Edge and `dist/firefox` for Firefox. Load the Chromium folder as an unpacked extension or select `dist/firefox/manifest.json` as a temporary add-on.

Packaging rebuilds the extension and writes `dist/copyhold-<version>-chromium.zip` and `dist/copyhold-<version>-firefox.zip` for store submission. The version comes from `manifest.json`. To build or package one target, append `-- chromium` or `-- firefox` to either command.

## Use Copyhold

- Open the popup with **Alt+Shift+Y** (**Option+Shift+Y** on macOS) if the shortcut is available. Search is focused when the popup opens.
- Type to filter, use **Up** and **Down** to highlight a clip, and press **Enter** to copy it. **Alt+1** through **Alt+9** (**Option** on macOS) copy the clip at that position; hold **Alt** to see the numbers. By default the popup closes after a copy. Turn this off under **Close the popup after copying** in **Settings and backups**. The full-tab view stays open.
- Click a clip row or its **Copy** button to copy the original text and record when it was used. Pinned clips appear first under **Pinned**, and the rest are sorted by recent use, or by creation time if they have never been copied from Copyhold.
- Each clip's **More actions** button (**⋯**) opens **Preview**, **Open link** for web addresses, **Mask text** or **Show text**, **Pin**, **Edit**, **Select**, and **Delete**. From search, press **Shift+Enter** to open the menu for the highlighted clip, then press the letter shown next to an action. Right-clicking a row opens the same menu.
- To delete several clips, choose **Select** from the menu or Shift-click a row. While selecting, **Enter** selects or clears the highlighted clip, and **Escape** or **Done** ends selection.
- After deleting one or more clips, **Undo** restores the most recent deletion for 12 seconds while the view stays open. Pointing at or focusing the undo bar pauses the countdown. Clips that have expired remain deleted.
- Select **Save clipboard** to save the current clipboard text. If the same text is already saved, Copyhold shows a message. Use **New clip** to type or paste text with an optional title and description. In the editor, press **Cmd+Enter** (**Ctrl+Enter** elsewhere) to save.
- The list shows 200 clips at a time; select **Show more** or keep pressing **Down** to see more.
- Clips show what kind of text they contain: links show their address without `https://`, code and commands use a monospace font, and colors show a swatch. Times are relative, such as "2 hours ago"; point at a time to see the exact date.

### Expiry and privacy

In the editor, open **Expiry and privacy** to set **Delete automatically**. Pick **1 hour**, **1 day**, **1 week**, or a date and time, or choose **Never** to keep the clip. Copyhold checks for expired clips about once a minute while the browser is running and cleans up overdue clips when it starts.

To limit how many clips Copyhold keeps, choose a **History size** in **Settings and backups**. When the history is full, the least recently used unpinned clips are deleted; pinned clips are always kept. Lowering the size asks before deleting anything.

In **Settings and backups**, choose a default retention period for new clips you create or capture. The default starts at creation, leaves existing clips and imported backups as they are, and is cleared when you pin the clip. An expiry you set manually still applies to a pinned clip.

**Mask** shows up to three characters followed by `**`. **Hide** shows only "Hidden" and the length of the text. The title and description remain visible. Search matches masked and hidden clips by title and description only.

### Automatic capture

In Chrome and Edge, Copyhold can save plain text from the clipboard while the browser is running, even when the Copyhold window is closed. Automatic saving is off until you turn it on: the popup asks once, and you can change your answer under **Automatically save copied text** in **Settings and backups**. When you turn it on, Copyhold skips whatever is already on the clipboard and saves what you copy next.

The bar under the header shows whether automatic saving is on. **Pause** stops it for 15 minutes; choose **Resume** to restart sooner. The monitor skips the clipboard contents it first sees on resume. **Save clipboard** is available during a pause. **Retry capture** restarts the monitor if the popup cannot confirm a recent successful read. Copyhold checks for changes about once per second while you're using the computer, and stops checking while it's idle or locked. It can miss text that is replaced between checks. Text over 1,000,000 characters isn't saved automatically; the popup tells you, and **Save clipboard** still keeps it. Firefox supports **Save clipboard** for manual capture.

### Backups

**Export** downloads a JSON backup. **Import** appends the backup entries with fresh IDs, preserving duplicate content, display preferences, stars, and timestamps. Backups exported under the extension's earlier name, Clipfile, import too. Import opens the full-tab view to keep the file picker open. In the full-tab view you can also drop a backup file onto the page.

Copyhold stores entries locally and makes no network requests. See [PRIVACY.md](PRIVACY.md) for the full privacy policy. Masking and hiding affect only the preview. The original text remains available to edit and copy, and exports contain it in plain text.
