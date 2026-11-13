# Changelog

## 1.3.0

**New**
- **Organize many clips at once.** Select clips, choose **Organize**, and set or remove a category, or add and remove tags, for all of them.
- **Auto-tag rules.** In Settings, add rules such as "links to github.com go to Work › Code" or "text containing invoice gets #billing". New clips are organized as they're saved, and **Apply to existing clips** tidies your history.
- **Category colours.** Give each category a colour in **Manage categories and tags**; rows and compact view show it.
- **Sort your clips** by most recent, most used, oldest, or A–Z. Pinned clips stay on top.
- **Templates.** Mark a clip as a template and copying it fills in `{date}`, `{isodate}`, `{time}`, `{datetime}`, `{weekday}`, and `{clipboard}`.
- **Copy as…** Copy a clip trimmed, as a single line, in upper, lower, or title case, as formatted or compact JSON, or URL-encoded or decoded. Press C in the actions menu, then the letter.
- **Source pages.** Text saved with **Save selection to Copyhold** remembers the page it came from, with a link back.
- **Command palette.** Press Cmd+K (Ctrl+K) to find any action, view, category, or tag by typing.
- **Storage overview.** Settings shows how many clips and images you have and how much space they use, warns when storage is nearly full, and can delete image clips.
- **Import and Export** are now in a bar under the clip list instead of inside Settings.
- **Fold away pinned clips.** Select the Pinned heading to collapse or expand it; Copyhold remembers your choice.

**Improved**
- Row buttons line up with the first line of each clip.
- Screen readers get a clearer list: categories, tags, and the source page are read with each clip, and the pinned toggle is reachable. Automated accessibility checks now run on every view.

## 1.2.0

To install, download **copyhold-chromium.zip**, unzip it, open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the `copyhold` folder. To update, replace the folder's files and select the reload button on Copyhold's card. Your clips are kept.

**New**
- **Categories, subcategories, and tags.** Give each clip a category and subcategory and any number of tags. Filter the list by category, subcategory, and tags (clips must have every chosen tag), select a tag on a clip to filter by it, or type `#tag` in search. Rename, merge, or delete categories and tags across all clips from Settings.
- **The editor saves as you type.** Changes are saved a moment after you stop typing, and Done or Escape closes the editor.
- **Passphrase lock.** Encrypt every clip's text and images with a passphrase. Copyhold keeps saving while locked, locks again after the time you choose, and locks when your computer locks.
- **Sensitive text detection.** Text that looks like a password, API key, access token, private key, or card number is masked automatically. You can choose to skip it instead, or save it like other text.
- **Image clips.** Save copied images with Save clipboard, or turn on automatic image saving. Images show as thumbnails and copy back as images.
- **Save without opening Copyhold.** Press Alt+Shift+S to save the clipboard, or right-click selected text and choose Save selection to Copyhold. The toolbar icon confirms the save.
- **No more duplicates.** Copying something you already saved moves that clip to the top instead of saving it again.
- **Automatic saving in Firefox.**

**Improved**
- Large histories open faster: the first screenful loads from an index before the rest.
- Copyhold's text can now be translated.

**Under the hood**
- The popup code is split into modules, with ESLint and type checking.
- End-to-end tests run the real extension in Chrome and Firefox on every change.
- Pushing a version tag builds, tests, and publishes the release.

## 1.1.0

- Compact list density, row actions for pin, edit, and delete, and instant delete with Undo.
- Select all with bulk Copy, Pin, and Delete; an auto-save switch in the header; an eye button that hides clip text for screen sharing.
- History size setting, idle pause for the background monitor, and much faster search and opening with large histories.

## 1.0.0

The first release of Copyhold, a private, keyboard-first clipboard manager for Chrome and Edge.

- Search, arrow keys, and Enter to copy; Alt+1 to Alt+9 copy by position.
- Optional automatic saving that asks first, pauses on request, and stops while the computer is idle or locked.
- Mask or hide sensitive clips, set clips to expire, and cap the history size.
- No network access, no analytics, no accounts.
