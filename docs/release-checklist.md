# Release checklist

Run through this with the built packages before each store submission. Use a fresh browser profile so earlier test data doesn't hide first-run problems.

## Build

- [ ] Bump `version` in `src/manifest.json` and add a section for it to `CHANGELOG.md`.
- [ ] Run `npm run check` (lint, types, unit tests) and `npm run test:e2e` (Chrome and Firefox).
- [ ] Run `npm run package` and confirm `dist/copyhold-<version>-chromium.zip`, `dist/copyhold-<version>-firefox.zip`, and `dist/copyhold-chromium.zip` exist.
- [ ] Unzip each package and check it contains only the extension files: no SVG sources, docs, or `.DS_Store`.

## Chrome and Edge (`dist/chromium`)

Load it with **Load unpacked** on `chrome://extensions` and `edge://extensions`.

**Install and first run**
- [ ] The install prompt lists only clipboard access; no website access is requested. (`alarms`, `contextMenus`, `idle`, `offscreen`, and `storage` show no warning.)
- [ ] The toolbar icon is sharp on light and dark browser themes.
- [ ] The popup shows **Save copied text automatically?**, and the dot at the left of the header is hollow with the tooltip **Auto-save off**.
- [ ] **Not now** hides the prompt; reopening the popup doesn't show it again, and copying text saves nothing.
- [ ] **Turn on** starts saving. Text that was on the clipboard before you turned it on is **not** saved; the next text you copy is.

**Automatic saving**
- [ ] Copy text in a web page with the popup closed; it appears the next time you open the popup.
- [ ] **Pause** stops saving; the status shows when it resumes. **Resume** restarts it without saving what was copied during the pause.
- [ ] Turn auto-save off in Settings, copy something, turn it on: the text copied while it was off is not saved.
- [ ] Restart the browser: automatic saving comes back on its own if it was on.
- [ ] Leave the computer idle for two minutes or lock it: the offscreen document disappears from `chrome://extensions` → Copyhold → **Inspect views**. Move the mouse: it comes back, and the next copy is saved.
- [ ] Open the popup right after returning from idle: no lasting **Capture needs attention** warning.
- [ ] Copy text over 1,000,000 characters: it isn't saved automatically, and the next popup open says so once. **Save clipboard** still saves it.

**Saving without the popup**
- [ ] With the popup closed, copy text and press Alt+Shift+S: the toolbar icon shows a check mark, and the clip is there next time.
- [ ] Select text on a page, right-click, and choose **Save selection to Copyhold**: same result.
- [ ] Copy something already saved and save it again: it moves to the top instead of appearing twice.

**Sensitive text and images**
- [ ] Copy a test API key such as `sk_test_` followed by 24 letters: it's saved masked, with a shield in the details.
- [ ] Choose **Don't save them automatically**: the test key isn't saved by automatic capture.
- [ ] Copy a screenshot and select **Save clipboard**: an image clip with a thumbnail appears, and copying it pastes the image.
- [ ] Turn on **Automatically save copied images**: a copied image is saved without the popup.

**Passphrase lock**
- [ ] Set up a lock: clips stay visible, and the lock button appears in the header.
- [ ] Lock: the popup shows the lock screen. A wrong passphrase is refused; the right one shows the clips.
- [ ] While locked, automatic saving and Alt+Shift+S still save; the clips appear after unlocking.
- [ ] Lock the computer, or wait past **Lock again after**: Copyhold is locked when reopened.
- [ ] Turn off the lock: clips are still there and searchable.

**Categories, tags, and the editor**
- [ ] In the editor, type text, a category, a subcategory, and two tags: "Saved" appears without pressing anything, and Escape keeps everything.
- [ ] Suggestions list existing categories, subcategories for the chosen category, and tags.
- [ ] Filter by a category, a subcategory, and two tags; the chips under the toolbar remove each filter. `#tag` in search also filters.
- [ ] Select a tag on a row: the list filters by it.
- [ ] In Settings, rename a tag to an existing one (they merge) and delete a category (clips stay).

**Organizing, rules, templates, and the palette**
- [ ] Select several clips, choose **Organize**, set a category and add a tag: every selected clip changes.
- [ ] Add a rule for a site, save a selection from that site with the context menu: the clip gets the rule's category and tags and shows "from site".
- [ ] Give a category a colour; rows show the dot. Sort by **Most used** and **A–Z**.
- [ ] A template with `{date}` and `{clipboard}` pastes the date and what was on the clipboard. **Copy as** → **UPPERCASE** works.
- [ ] Cmd+K or Ctrl+K opens the palette; typing a tag name and pressing Enter filters by it.
- [ ] **Storage** in Settings shows clip and image counts and sizes.

**Popup**
- [ ] Open with Alt+Shift+Y (Option+Shift+Y on macOS). Search is focused.
- [ ] Type to filter, use Up and Down, press Enter: the clip is copied and the popup closes.
- [ ] Turn off **Close the popup after copying**: Enter copies and the popup stays open.
- [ ] Alt+1 to Alt+9 copy by position; holding Alt shows the numbers.
- [ ] Shift+Enter opens the actions menu; each letter shortcut works; Escape returns to search.
- [ ] Open Preview and press Escape: Preview closes and the popup stays. Press Escape again: the popup closes.
- [ ] A clip with an expiry shows a clock by its age (amber in the last hour), and Preview lists its expiry, category, tags, and dates.
- [ ] Pin, mask, show, edit, select, and delete work; Undo restores deleted clips and pausing over the undo bar stops its countdown.
- [ ] A link clip shows **Open link**, which opens the page in a new tab.

**Row actions, bulk actions, and views**
- [ ] Pointing at a row replaces its age with Preview, Pin, Edit, Delete, Copy, and More; Preview shows the whole clip without copying it; Delete removes the clip at once and Undo restores it.
- [ ] The header dot turns automatic saving on and off, changes colour, and matches the Settings checkbox.
- [ ] The checkbox beside the filters selects every shown clip; Copy, Pin, and Delete act on the selection.
- [ ] Compact density shows one line per clip with its age and length, in both themes.
- [ ] The eye button hides all clip text and remembers the choice the next time the popup opens.

**History size and long lists**
- [ ] With more than 100 clips, the list shows 100 and a **Show more** row; Down at the last row loads more.
- [ ] Set **History size** below the number of unpinned clips: a confirmation names how many will be deleted, and **Cancel** keeps the old setting.
- [ ] With a history size set, saving more clips deletes the least recently used unpinned ones; pinned clips stay.

**Expiry**
- [ ] Set a clip to expire in a few minutes; it disappears about a minute after that time, even with the popup closed.
- [ ] A default retention period applies to new clips but not to pinned clips.

**Backups**
- [ ] Export, then import the file in the full-tab view. Drop a backup file onto the full-tab view.
- [ ] A backup exported from Clipfile imports.

## Firefox (`dist/firefox`)

Load `dist/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.

- [ ] The automatic-saving prompt appears, and turning it on saves copied text with the popup closed.
- [ ] **Save clipboard**, Alt+Shift+S, and **Save selection to Copyhold** save.
- [ ] The passphrase lock works, including after restarting Firefox (it's locked again).
- [ ] Copy, search, keyboard navigation, Alt+1 to Alt+9, menus, editor, expiry, and backups work as in Chrome.
- [ ] Run the add-on through the AMO validator by uploading the zip as an unlisted version, and fix any warnings.

## Store submission

- [ ] Host `PRIVACY.md` at a public URL and fill in the date and contact details.
- [ ] Paste the listing text and privacy answers from `docs/store-listing.md`.
- [ ] Upload screenshots and the promo tile made with sample text only.
- [ ] Check that the name "Copyhold" is still free in the stores and in trademark searches.

## GitHub release

- [ ] Commit, tag `v<version>`, and push the tag. The Release workflow checks the tag matches the manifest, runs the checks, and publishes the release with all three zips and the changelog section as notes.
- [ ] Run `npm run screenshots` if the popup changed, and commit the new `site/screenshots`. The website's download button always serves the latest release's `copyhold-chromium.zip`.
