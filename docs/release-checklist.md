# Release checklist

Run through this with the built packages before each store submission. Use a fresh browser profile so earlier test data doesn't hide first-run problems.

## Build

- [ ] Bump `version` in `manifest.json`.
- [ ] Run `npm run package` and confirm `dist/copyhold-<version>-chromium.zip` and `dist/copyhold-<version>-firefox.zip` exist.
- [ ] Unzip each package and check it contains only the extension files: no SVG sources, docs, or `.DS_Store`.

## Chrome and Edge (`dist/chromium`)

Load it with **Load unpacked** on `chrome://extensions` and `edge://extensions`.

**Install and first run**
- [ ] The install prompt lists only clipboard access; no website access is requested. (`idle`, `alarms`, and `offscreen` show no warning.)
- [ ] The toolbar icon is sharp on light and dark browser themes.
- [ ] The popup shows **Save copied text automatically?** and the status bar reads **Auto-save off**.
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

**Popup**
- [ ] Open with Alt+Shift+Y (Option+Shift+Y on macOS). Search is focused.
- [ ] Type to filter, use Up and Down, press Enter: the clip is copied and the popup closes.
- [ ] Turn off **Close the popup after copying**: Enter copies and the popup stays open.
- [ ] Alt+1 to Alt+9 copy by position; holding Alt shows the numbers.
- [ ] Shift+Enter opens the actions menu; each letter shortcut works; Escape returns to search.
- [ ] Pin, mask, show, edit, select, and delete work; Undo restores deleted clips and pausing over the undo bar stops its countdown.
- [ ] A link clip shows **Open link**, which opens the page in a new tab.

**Row actions, bulk actions, and views**
- [ ] Pointing at a row shows Pin, Edit, and Delete; Delete removes the clip at once and Undo restores it.
- [ ] The header switch turns automatic saving on and off and matches the Settings checkbox.
- [ ] The checkbox beside the filters selects every shown clip; Copy, Pin, and Delete act on the selection.
- [ ] Compact density shows one line per clip with its age and length, in both themes.
- [ ] The eye button hides all clip text and remembers the choice the next time the popup opens.

**History size and long lists**
- [ ] With more than 200 clips, the list shows 200 and a **Show more** row; Down at the last row loads more.
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

- [ ] No automatic-saving prompt or setting appears.
- [ ] **Save clipboard** saves the current clipboard text.
- [ ] Copy, search, keyboard navigation, Alt+1 to Alt+9, menus, editor, expiry, and backups work as in Chrome.
- [ ] Run the add-on through the AMO validator by uploading the zip as an unlisted version, and fix any warnings.

## Store submission

- [ ] Host `PRIVACY.md` at a public URL and fill in the date and contact details.
- [ ] Paste the listing text and privacy answers from `docs/store-listing.md`.
- [ ] Upload screenshots and the promo tile made with sample text only.
- [ ] Check that the name "Copyhold" is still free in the stores and in trademark searches.
