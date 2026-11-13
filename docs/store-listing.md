# Store listing drafts

Text to paste into the Chrome Web Store developer dashboard, Microsoft Edge Add-ons (Partner Center), and Firefox Add-ons (AMO). Review every answer against the dashboard's current wording before submitting; the forms change from time to time.

## Basics

- **Name:** Copyhold
- **Summary (132 characters max):** Save, organize, and reuse text and images from your clipboard.
- **Category:** Productivity → Tools (Chrome); Productivity (Firefox)
- **Language:** English

## Detailed description

> Copyhold keeps the text you copy so you can find it and use it again.
>
> **Save what you copy.** Select Save clipboard, press Alt+Shift+S, or right-click selected text and choose Save selection to Copyhold. Turn on automatic saving and Copyhold saves text, and images if you like, as you copy. Automatic saving is off until you choose to turn it on, and you can pause it at any time. Copying something you already saved moves it to the top instead of saving a duplicate.
>
> **Find it fast.** Open Copyhold with Alt+Shift+Y, type to search, use the arrow keys, and press Enter to copy. Alt+1 to Alt+9 copy the first nine clips. Pin the clips you use most. Search stays instant with thousands of clips.
>
> **See more at once.** Switch to compact view for one line per clip, with when you last used it and how long it is. Pin, edit, or delete right from the row, and undo a delete if you change your mind.
>
> **Work with many clips.** Select all, then copy, pin, or delete them together.
>
> **Organize it.** Give clips a category, a subcategory, and tags, then filter by any of them or type #tag in search. Edits save as you type.
>
> **Lock it with a passphrase.** Encrypt every clip's text and images. Copyhold keeps saving while locked, and locks again when you step away.
>
> **Keep sensitive text out of sight.** Text that looks like a password, API key, or card number is masked automatically, or skipped if you prefer. Mask or hide any clip's preview, or hide every preview with one click while you share your screen. Set clips to delete themselves after an hour, a day, a week, or on a date you choose, give all new clips a default retention period, or cap your history size.
>
> **Private by design.** Your clips stay in your browser profile. Copyhold has no servers, no accounts, no analytics, and makes no network requests.
>
> **Back up and move.** Export your clips as a JSON file and import them into another browser.
>
> Works in Chrome, Edge, and Firefox.

## Chrome privacy practices tab

**Single purpose:**

> Copyhold saves text from the clipboard so the user can search for it and copy it again.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `clipboardRead` | Reads plain text from the clipboard when the user selects Save clipboard, and, only if the user turns on automatic saving, about once a second in the background to save newly copied text. |
| `clipboardWrite` | Copies a saved clip back to the clipboard when the user selects it. |
| `alarms` | Deletes clips whose expiry date has passed and trims the history to the user's chosen size about once a minute, ends a 15-minute pause of automatic saving, and locks the optional passphrase lock again after the user's chosen time. |
| `contextMenus` | Adds a "Save selection to Copyhold" item when the user right-clicks selected text. Only the selected text is received, and only when the user chooses the item. |
| `idle` | Stops the background clipboard monitor while the computer is idle, since nothing can be copied then, and restarts it when the user returns. Also locks the optional passphrase lock when the computer locks. Only the active, idle, or locked state is read. |
| `offscreen` | Reads the clipboard from an offscreen document, because a service worker cannot access the clipboard. The document is created only while automatic saving is on and not paused, or for a moment when the user presses the Save clipboard keyboard shortcut. |
| `storage` | Holds the unlocked encryption key in session storage, which stays in memory and is cleared when the browser closes, while the user's optional passphrase lock is unlocked. No other data is stored there. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage:** Copyhold stores clipboard text the user saves, but only locally in the browser profile; nothing is transmitted off the device. Check the dashboard's current definition of "collect". If it covers data stored only on the device, declare **Website content** or **Personally identifiable information** as appropriate, since copied text can include either. If it covers only data sent off the device, declare nothing.

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the public address where `PRIVACY.md` is hosted, for example a GitHub Pages page.

## Microsoft Edge Add-ons

Edge uses the same package as Chrome: upload `copyhold-<version>-chromium.zip` in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview).

- **Category:** Productivity
- **Description, summary, and privacy answers:** reuse the Chrome text above. Partner Center asks for a short description (up to 250 characters) and a description; the summary and detailed description fit.
- **Privacy policy URL** and **Website:** as in the Package section below.
- **Store listing images:** the same screenshots (1280×800) and the small promo tile (440×280). Edge also accepts an optional 1400×560 tile.
- **Notes for certification:** "Copyhold is a local clipboard manager. It makes no network requests. Automatic capture is off until the user turns it on from the popup; Save clipboard and the Alt+Shift+S shortcut work without it."
- Edge reviews usually take a few business days. Updates are uploaded the same way, with a higher `version`.

## Firefox Add-ons notes

- Upload `copyhold-<version>-firefox.zip`.
- The manifest declares `data_collection_permissions: { required: ["none"] }`, which matches: no data leaves the device.
- The code is not minified or bundled, so no separate source upload is needed.
- Automatic saving works in Firefox from the background page. Firefox may pause it briefly while the background page is suspended; an alarm wakes it every 30 seconds.

## Images

Ready to upload from `docs/store-assets/`, made from the real popup with sample clips by `npm run screenshots`:

| Asset | File | Size |
|---|---|---|
| Store icon | `icon-128.png` (same as `src/icons/128.png`) | 128×128 |
| Screenshot 1 | `screenshot-1.png`: the popup and search | 1280×800 |
| Screenshot 2 | `screenshot-2.png`: the passphrase lock | 1280×800 |
| Screenshot 3 | `screenshot-3.png`: sensitive-text settings | 1280×800 |
| Screenshot 4 | `screenshot-4.png`: compact view with an image clip, dark theme | 1280×800 |
| Screenshot 5 | `screenshot-5.png`: filtering by category and tag | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee-1400x560.png` | 1400×560 |

## Package

Upload `copyhold-<version>-chromium.zip` from `npm run package`, or download it from the matching GitHub release. It has `manifest.json` at the root, as the store requires. Don't upload `copyhold-chromium.zip`, which wraps the files in a folder for manual installs.

Privacy policy URL: https://nevin.github.io/copyhold/privacy.html
Website: https://nevin.github.io/copyhold/
Support: https://github.com/nevin/copyhold/issues
