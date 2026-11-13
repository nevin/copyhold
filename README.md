# Copyhold

**[Website](https://nevin.github.io/copyhold/) · [Download for Chrome](https://github.com/nevin/copyhold/releases/latest/download/copyhold-chromium.zip) · [Privacy](PRIVACY.md)**

Copyhold is a standalone Manifest V3 clipboard manager for desktop Chrome, Edge, and Firefox. It saves text and image clips in the current browser profile, can encrypt them with a passphrase, and never sends anything off the device.

## Install the latest release

Until Copyhold is in the Chrome Web Store, [download `copyhold-chromium.zip`](https://github.com/nevin/copyhold/releases/latest/download/copyhold-chromium.zip) and unzip it. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, select **Load unpacked**, and choose the `copyhold` folder. To update, replace the folder's files with a newer release and select the reload button on Copyhold's card. Your clips are kept.

## Build from source

- **Chrome 123 or later** · Run `npm run build -- chromium`. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Edge** · Build the same Chromium target, then open `edge://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chromium`.
- **Firefox 142 or later** · Run `npm run build -- firefox`. Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`. Temporary installations last until Firefox restarts.

Open **Copyhold** from the browser’s extensions menu. Use **Open in tab** for more room.

## Build and package

The build needs Node.js 24 or later and npm. Packaging also requires the `zip` command on your PATH.

```sh
npm install
npm run check        # ESLint, type checking, and unit tests
npm run build
npm run package
```

### Tests

- `npm test` runs the unit tests for the shared modules under Node.
- `npm run test:e2e` builds the extension and drives it in Chrome for Testing and Firefox with Puppeteer: saving, searching, copying, images, automatic capture, and the passphrase lock. Run `npx puppeteer browsers install chrome` once first. The Firefox tests use an installed Firefox, or `FIREFOX_PATH`, and are skipped without one.
- `npm run lint` and `npm run typecheck` check the code with ESLint and the TypeScript checker, using JSDoc types.
- `npm run screenshots` captures the website screenshots from the real extension with sample clips.
- `npm run perf` measures disk use per clip, popup load time, memory, and page size with 1,000 to 20,000 clips, and the background monitor's CPU use.

The build creates `dist/chromium` for Chrome and Edge and `dist/firefox` for Firefox. Packaging also writes:

- `dist/copyhold-<version>-chromium.zip` and `dist/copyhold-<version>-firefox.zip` for store submission, with `manifest.json` at the root.
- `dist/copyhold-chromium.zip`, which unzips to a `copyhold` folder, for GitHub releases.

The version comes from `src/manifest.json`. To build or package one target, append `-- chromium` or `-- firefox` to either command.

## Project structure

```
src/                  The extension, copied into each build
  manifest.json       Chromium manifest; the build derives the Firefox one
  _locales/en/        Every piece of text people see, ready for translation
  background/         Background code: clipboard monitor, shortcuts, expiry, and lock timer
                      (service-worker.js for Chrome and Edge, firefox.js for Firefox)
  offscreen/          Clipboard reader page (Chrome and Edge only)
  popup/              Popup and full-tab view: popup.html, main.js, popup.css, and modules/
  lib/                Shared modules: storage, capture, encryption, sensitive-text detection, settings
  icons/              Extension icons
assets/icon/          SVG sources for the icons
test/                 Unit tests for the shared modules (npm test)
e2e/                  Browser tests that load the built extension (npm run test:e2e)
scripts/              Build and packaging, and the screenshot script
site/                 Website published to GitHub Pages
docs/                 Release checklist and store listing drafts
```

Pushes to `main` run the checks and browser tests in GitHub Actions, and changes under `site/` redeploy the website. Pushing a tag such as `v1.2.0` that matches the manifest version builds, tests, and publishes a GitHub release with the packages, using the notes from [CHANGELOG.md](CHANGELOG.md).

## Use Copyhold

- Open the popup with **Alt+Shift+Y** (**Option+Shift+Y** on macOS) if the shortcut is available. Search is focused when the popup opens.
- Type to filter, use **Up** and **Down** to highlight a clip, and press **Enter** to copy it. **Alt+1** through **Alt+9** (**Option** on macOS) copy the clip at that position; hold **Alt** to see the numbers. By default the popup closes after a copy. Turn this off under **Close the popup after copying** in **Settings and backups**. The full-tab view stays open.
- Click a clip row or its **Copy** button to copy the original text and record when it was used. Pinned clips appear first under **Pinned**, and the rest are sorted by recent use, or by creation time if they have never been copied from Copyhold.
- Pointing at a clip, or highlighting it with the arrow keys, shows **Preview**, **Pin**, **Edit**, **Delete**, **Copy**, and **More actions** on the row. **Preview** shows the whole clip without copying it, with its category, subcategory, tags, expiry, when it was saved and last copied, how many times it was copied, its length, and the page it came from; masked and hidden clips stay concealed until you select **Reveal**.
- A clock beside a clip's age means it deletes itself; it turns amber in the last hour. Point at the age for the exact time.
- **Escape** closes the innermost thing first (Preview, a menu, Settings, selection, or search text); with nothing open, it closes the popup. Deleting is immediate and can be undone.
- The header holds the automatic-saving dot, search, **Save**, and the **⋯** menu, which has **New clip**, **Open in new tab**, **Hide clip previews**, pause and lock controls, **Commands**, and **Settings and backups**.
- Each clip shows up to three rows: its title, its content, and its description followed by its category and tags; how long ago it was used appears on the right. Point at the age for when it was saved or copied and how long it is.
- Choose **Compact** under **List density** in **Settings and backups** to fit about twice as many clips: one line each, with how long ago it was used and its length.
- **Hide clip previews** in the **⋯** menu hides every clip's text, for screen sharing. Choose it again to show the text.
- Each clip's **More actions** button (**⋯**) opens **Preview**, **Open link** for web addresses, **Mask** or **Show**, **Pin**, **Edit**, **Select**, and **Delete**. From search, press **Shift+Enter** to open the menu for the highlighted clip, then press the letter shown next to an action. Right-clicking a row opens the same menu.
- To work with several clips, check the box next to the filters to select every shown clip, choose **Select** from a clip's menu, or Shift-click a row. **Copy** copies the selected clips one per line, **Pin** pins or unpins them, and **Delete** removes them. While selecting, **Enter** selects or clears the highlighted clip, and **Escape** or **Done** ends selection.
- After deleting one or more clips, **Undo** restores the most recent deletion for 12 seconds while the view stays open. Pointing at or focusing the undo bar pauses the countdown. Clips that have expired remain deleted.
- Edits in the clip editor save as you type; **Done**, **Escape**, or **Cmd+Enter** (**Ctrl+Enter** elsewhere) closes it.
- Select **Save** to save the current clipboard text, or the image on it when there's no text. If the same content is already saved, Copyhold moves that clip to the top instead of saving it again.
- Press **Alt+Shift+S** to save the clipboard without opening Copyhold, or right-click selected text on a page and choose **Save selection to Copyhold**; the clip remembers the page, with a link back and **Open source page** in its menu. A check mark on the toolbar icon confirms the save. Change the shortcuts at `chrome://extensions/shortcuts`. Use **New clip** to type or paste text with an optional title, description, category, subcategory, and tags.
- Select the **Pinned** heading to fold the pinned clips away, and again to show them. Folded clips leave the list and keyboard navigation; the **Pinned** filter still shows them. Copyhold remembers the choice.
- The list shows 100 clips at a time; select **Show more** or keep pressing **Down** to see more.
- Clips show what kind of text they contain: links show their address without `https://`, code and commands use a monospace font, and colors show a swatch. Times are relative, such as "2 hours ago"; point at a time to see the exact date.

### Expiry and privacy

In the editor, open **Expiry and privacy** to set **Delete automatically**. Pick **1 hour**, **1 day**, **1 week**, or a date and time, or choose **Never** to keep the clip. Copyhold checks for expired clips about once a minute while the browser is running and cleans up overdue clips when it starts.

To limit how many clips Copyhold keeps, choose a **History size** in **Settings and backups**. When the history is full, the least recently used unpinned clips are deleted; pinned clips are always kept. Lowering the size asks before deleting anything.

In **Settings and backups**, choose a default retention period for new clips you create or capture. The default starts at creation, leaves existing clips and imported backups as they are, and is cleared when you pin the clip. An expiry you set manually still applies to a pinned clip.

**Mask** shows up to three characters followed by `**`. **Hide** shows only "Hidden" and the length of the text. The title and description remain visible. Search matches masked and hidden clips by title and description only.

### Categories and tags

In the editor, give a clip a **Category**, a **Subcategory** within it, and any number of **Tags** (press **Enter** or a comma after each). Suggestions come from the ones you already use. Rows show the category and tags; compact rows show how many tags a clip has.

Select **Filter** next to **All clips** and **Pinned** to filter by a category or subcategory and by tags; a clip must have every tag you choose. The chosen filters appear under the toolbar, where **×** removes one. Selecting a tag on a clip also filters by it, and typing `#tag` in search finds clips with a tag that starts with that word. Search also matches categories and tags.

**Manage categories and tags** in **Settings and backups** renames or deletes them across every clip. Renaming to a name that already exists merges the two; deleting removes the label but keeps the clips.

### Organizing many clips, rules, and colours

Select clips (the box next to the filters selects every shown clip) and choose **Organize** to set or remove a category, or add and remove tags, for all of them at once.

**Auto-tag rules** in **Settings and backups** organize clips as they're saved. A rule matches text that **contains** some words, **links to a site** (including the page a selection came from), or **matches a pattern** (a regular expression). The first matching rule with a category sets it, unless the clip already has one, and every matching rule adds its tags. **Apply to existing clips** runs the rules over your history.

In **Manage categories and tags**, the dot beside each category picks its colour, shown on rows and in compact view.

### Sorting

The menu next to **Filter** sorts clips by **Recent** (last copied or saved), **Most used**, **Oldest**, or **A–Z**. Pinned clips always come first.

### Templates and Copy as

Check **Template** in the editor and copying the clip fills in `{date}`, `{isodate}` (2026-11-13), `{time}`, `{datetime}`, `{weekday}`, and `{clipboard}` (what's on the clipboard when you copy). Other text in braces is left alone.

**Copy as…** in a clip's actions menu (press **C**) copies it **Trimmed**, as a **Single line**, in **UPPERCASE**, **lowercase**, or **Title Case**, as **Formatted** or **Compact JSON**, or **URL-encoded** or **URL-decoded**. Only the choices that would change the text are shown, each with a letter.

### Command palette

Press **Cmd+K** (**Ctrl+K** elsewhere), or choose **Commands** in the **⋯** menu, or select the ⌘K hint in search, and type to find any action (new clip, save clipboard, import, export, lock, settings), view (theme, density, sort, pinned), or filter by a category or tag. **Up** and **Down** choose, **Enter** runs.

### Storage

**Storage** in **Settings and backups** shows how many clips and images you have, how much space they take, and how much the browser allows. Copyhold warns when storage is almost full, and **Delete image clips** frees space (you can undo it right after).

### Sensitive text

Copyhold recognizes text that looks like a password, API key, access token, private key, or card number. By default, such clips are saved masked and marked with a shield. Under **Passwords, keys, and card numbers** in **Settings and backups**, you can instead skip them during automatic saving or save them like other text. **Save clipboard** always keeps what you ask it to save. Detection runs on your device and can miss secrets.

### Passphrase lock

Under **Passphrase lock** in **Settings and backups**, select **Set up lock** and choose a passphrase. Copyhold encrypts every clip's text, title, description, and image, and asks for the passphrase when you open it. Saving keeps working while locked. It locks again after the time you choose without use, when the browser closes, when the computer locks, or when you choose **Lock Copyhold** in the **⋯** menu. **Turn off lock** decrypts everything again. If you forget the passphrase, the clips can't be recovered; **Forgot your passphrase?** deletes them so you can start again.

### Images

**Save clipboard** saves an image when the clipboard has no text. Turn on **Automatically save copied images** to capture them in the background too; it uses more memory and battery. Image clips show a thumbnail, copy back as PNG images, and are searched by title and description.

### Automatic capture

Copyhold can save plain text from the clipboard while the browser is running, even when the Copyhold window is closed. Automatic saving is off until you turn it on: the popup asks once, and you can change your answer under **Automatically save copied text** in **Settings and backups**. When you turn it on, Copyhold skips whatever is already on the clipboard and saves what you copy next.

The dot at the left of the header turns automatic saving on or off and shows its state: hollow when off, green when saving, amber when paused, and red when it needs attention (point at it for details). **Pause auto-save for 15 minutes** in the **⋯** menu pauses it; choose **Resume auto-save** to restart sooner. The monitor skips the clipboard contents it first sees on resume. **Save clipboard** is available during a pause. **Retry capture**, also in the **⋯** menu, restarts the monitor if the popup cannot confirm a recent successful read. Copyhold checks for changes about once per second while you're using the computer, and stops checking while it's idle or locked. It can miss text that is replaced between checks. Text over 1,000,000 characters isn't saved automatically; the popup tells you, and **Save clipboard** still keeps it. Automatic capture works in Firefox too, from its background page.

### Backups

**Import backup** and **Export backup** are in the bar under the clip list. **Export** downloads a JSON backup, with images as data URLs. **Import** appends the backup entries with fresh IDs, preserving duplicate content, display preferences, pins, and timestamps. Backups exported under the extension's earlier name, Clipfile, import too. Import opens the full-tab view to keep the file picker open. In the full-tab view you can also drop a backup file onto the page.

Copyhold stores entries locally and makes no network requests. See [PRIVACY.md](PRIVACY.md) for the full privacy policy. Masking and hiding affect only the preview. The original text remains available to edit and copy, and exports contain it unencrypted.

### Translations

All text lives in `src/_locales/en/messages.json`. To add a language, copy that file to `src/_locales/<code>/messages.json` and translate each `message`. Keep `$1`, `$2` placeholders, and add `_one`, `_few`, and other plural forms as the language needs.

## License

Copyhold is released under the [MIT License](LICENSE).
