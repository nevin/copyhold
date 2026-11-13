# Store listing drafts

Text to paste into the Chrome Web Store developer dashboard and Firefox Add-ons (AMO). Review every answer against the dashboard's current wording before submitting; the forms change from time to time.

## Basics

- **Name:** Copyhold
- **Summary (132 characters max):** Save, organize, and reuse text from your clipboard.
- **Category:** Productivity → Tools (Chrome); Productivity (Firefox)
- **Language:** English

## Detailed description

> Copyhold keeps the text you copy so you can find it and use it again.
>
> **Save what you copy.** Select Save clipboard, or turn on automatic saving in Chrome and Edge and Copyhold saves text as you copy it. Automatic saving is off until you choose to turn it on, and you can pause it at any time.
>
> **Find it fast.** Open Copyhold with Alt+Shift+Y, type to search, use the arrow keys, and press Enter to copy. Alt+1 to Alt+9 copy the first nine clips. Pin the clips you use most.
>
> **Keep sensitive text out of sight.** Mask or hide a clip's preview, set clips to delete themselves after an hour, a day, a week, or on a date you choose, or give all new clips a default retention period.
>
> **Private by design.** Your clips stay in your browser profile. Copyhold has no servers, no accounts, no analytics, and makes no network requests.
>
> **Back up and move.** Export your clips as a JSON file and import them into another browser.
>
> Works in Chrome, Edge, and Firefox. Automatic saving is available in Chrome and Edge.

## Chrome privacy practices tab

**Single purpose:**

> Copyhold saves text from the clipboard so the user can search for it and copy it again.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `clipboardRead` | Reads plain text from the clipboard when the user selects Save clipboard, and, only if the user turns on automatic saving, about once a second in the background to save newly copied text. |
| `clipboardWrite` | Copies a saved clip back to the clipboard when the user selects it. |
| `alarms` | Deletes clips whose expiry date has passed and trims the history to the user's chosen size about once a minute, and ends a 15-minute pause of automatic saving. |
| `idle` | Stops the background clipboard monitor while the computer is idle or locked, since nothing can be copied then, and restarts it when the user returns. This saves battery and CPU. Only the active, idle, or locked state is read. |
| `offscreen` | Automatic saving reads the clipboard from an offscreen document, because a service worker cannot access the clipboard. The document is created only while automatic saving is on and not paused. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

**Data usage:** Copyhold stores clipboard text the user saves, but only locally in the browser profile; nothing is transmitted off the device. Check the dashboard's current definition of "collect". If it covers data stored only on the device, declare **Website content** or **Personally identifiable information** as appropriate, since copied text can include either. If it covers only data sent off the device, declare nothing.

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the public address where `PRIVACY.md` is hosted, for example a GitHub Pages page.

## Firefox Add-ons notes

- The manifest declares `data_collection_permissions: { required: ["none"] }`, which matches: no data leaves the device.
- The code is not minified or bundled, so no separate source upload is needed.
- Firefox has no automatic saving; say so in the description, as the draft above does.

## Images to prepare

| Asset | Size | Notes |
|---|---|---|
| Store icon | 128×128 | `src/icons/128.png`, already in the package |
| Screenshots | 1280×800 or 640×400, 1 to 5 | The popup with a few clips, the actions menu, the editor's Expiry and privacy section, the first-run prompt, and the full-tab view. Use sample text, never real clipboard contents. |
| Small promo tile | 440×280 | The icon with the name and summary on the purple background |
| Marquee promo tile (optional) | 1400×560 | Only needed if the store features the extension |
