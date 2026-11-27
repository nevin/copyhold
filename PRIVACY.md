# Copyhold privacy policy

_Last updated: November 13, 2026 (version 1.2)_

Copyhold is a clipboard manager for Chrome, Edge, and Firefox. This policy explains what it stores and what it doesn't.

## What Copyhold stores

- **Clips:** the text and images you save (with the formatted version of copied text, when there is one), with any abbreviation, title, description, category, subcategory, tags, template setting, how many times you've copied it, the page it was selected on (for **Save selection to Copyhold**), pin, display setting, expiry date, and the times you created and last copied each clip. Images are stored with a small thumbnail.
- **Hashes of clips:** a one-way SHA-256 hash of each clip and of the last clipboard content Copyhold saw, so it can find a clip you copy again instead of saving a duplicate. The content can't be recovered from a hash. With the passphrase lock on, clips have no hash, and the clipboard hash is strengthened with PBKDF2 so it's slow to guess.
- **Settings:** your theme, list density, whether previews are hidden, default retention period, history size, how to handle sensitive text, whether automatic saving of text and images is on, how soon the lock closes again, whether the popup closes after copying, your sort order, category colours, and auto-tag rules.
- **The passphrase lock, if you set one up:** an encryption key pair. The private key is itself encrypted with your passphrase; Copyhold never stores the passphrase. While Copyhold is unlocked, the private key is kept in the browser's session storage, which is held in memory and cleared when the browser closes.

Everything is stored in your browser profile on your device, using the browser's own storage. Copyhold has no servers and no accounts.

## Automatic saving

Copyhold can save text you copy anywhere in the browser, even when its popup is closed. This is **off until you turn it on**. When it's on, Copyhold reads the clipboard about once a second while you're using the computer and saves new plain text, and images too if you turn that on separately. You can pause it for 15 minutes or turn it off at any time. It checks less often while nothing new is copied and stops reading while the screen is locked, and it doesn't automatically save text over 1,000,000 characters or images over 10 MB.

Copied text can include passwords and other secrets. Copyhold checks each copy, on your device, for text that looks like a password, API key, access token, private key, or card number. By default it saves such text masked; you can choose to skip it or save it like other text. The check can miss secrets, so mask other sensitive clips yourself.

## Passphrase lock

If you set up a passphrase, Copyhold encrypts the text, title, description, category, subcategory, tags, source page, and image of every clip with AES-GCM, using keys derived with ECDH (P-256) and PBKDF2-SHA-256. Your auto-tag rules and category colours, which name your categories and tags, are encrypted the same way. Pins, dates, expiry, use counts, and whether a clip was masked automatically stay unencrypted so clean-up and sorting keep working. Because rules are encrypted, clips saved while Copyhold is locked get their rules applied the next time you unlock. Copyhold keeps saving while locked, locks again after the time you choose without use and whenever the computer locks, and asks for the passphrase to show clips. If you forget the passphrase, nobody can decrypt your clips, including the developer.

## Saving without opening Copyhold

The **Save the clipboard** keyboard shortcut and the **Save selection to Copyhold** menu item save what you choose at that moment. The menu item receives only the text you selected and the address and title of that page, which Copyhold keeps with the clip; it can't read web pages otherwise.

## Pasting into pages and snippet expansion

When you choose a clip in the popup, Copyhold puts it into the text field you were typing in on the page you opened it over. It uses the browser's one-time permission for the current tab, given when you open Copyhold, and only inserts the clip; it doesn't read the page. You can turn this off in Settings.

**Snippet expansion** is off until you turn it on, and the browser then asks you to let Copyhold read and change web pages. With it on, a small script in each page watches what you type for your abbreviations, such as `;addr`. When you type one, it asks Copyhold for that clip and inserts it. It doesn't record, keep, or send what you type, and only typing on the keyboard triggers it, not the page itself. Turning it off removes the script and gives up the site access. Abbreviations are stored unencrypted, even with the lock on, so pages can be checked for them; the clips they expand to stay encrypted, and locked clips expand only while Copyhold is unlocked.

## Trash

Clips you delete wait in the Trash for 30 days, then are removed for good; you can restore them or empty the Trash sooner. Expired clips, clips trimmed by the history size, and images removed with **Delete image clips** are deleted at once. With the lock on, trashed clips are encrypted too.

## What Copyhold never does

- It never sends your clips, settings, or any other data off your device. It makes no network requests at all.
- It doesn't use analytics, tracking, advertising, or third-party code.
- It doesn't sell, share, or transfer your data to anyone.
- It doesn't read web pages or your browsing history. It reads the clipboard only as described above, page text only when you choose **Save selection to Copyhold**, and, with snippet expansion on, only what you type, to spot your abbreviations.

## Exports

**Export** downloads a JSON file with all your clips, including masked, hidden, and locked ones. By default it's **protected with a passphrase you choose**: the whole backup is encrypted with AES-GCM under a key derived from that passphrase with PBKDF2 (600,000 rounds), and importing it asks for the passphrase. If you turn protection off, the backup is unencrypted. Either way, the file goes wherever you save it, and Copyhold has no further control over it.

## Deleting your data

- Delete individual clips, or select several and delete them, from the popup.
- Set a retention period or an expiry date so clips delete themselves, or a history size so only your most recently used clips are kept.
- Uninstalling Copyhold removes all of its stored data from your browser profile.

## Permissions

| Permission | Why Copyhold needs it |
|---|---|
| Read clipboard (`clipboardRead`) | To save clipboard text when you select **Save clipboard**, or automatically if you turn that on. |
| Write clipboard (`clipboardWrite`) | To copy a saved clip back to your clipboard. |
| Alarms (`alarms`) | To delete expired clips and trim the history about once a minute, to end a pause after 15 minutes, and to lock again after the time you choose. |
| Active tab (`activeTab`) and scripting (`scripting`) | To paste a chosen clip into the text field on the page you opened Copyhold over. The access lasts only for that tab, only after you open Copyhold. |
| Side panel (`sidePanel`, Chrome and Edge) | To open Copyhold in the browser's side panel. |
| Access to all sites (optional) | Only if you turn on snippet expansion: to watch for your abbreviations as you type in web pages. |
| Context menus (`contextMenus`) | To add **Save selection to Copyhold** when you right-click selected text. |
| Idle detection (`idle`) | To stop reading the clipboard while the screen is locked, and to lock Copyhold when it locks. Copyhold only learns whether you're active, idle, or locked. |
| Offscreen document (`offscreen`, Chrome and Edge only) | To read the clipboard in the background while automatic saving is on, or when you use the Save the clipboard shortcut. |
| Storage (`storage`) | To keep the unlocked key in session storage, in memory only, while the passphrase lock is unlocked. |

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions about privacy: open an issue at https://github.com/nevin/copyhold/issues.
