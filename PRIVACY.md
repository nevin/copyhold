# Copyhold privacy policy

_Last updated: [date of publication]_

Copyhold is a clipboard manager for Chrome, Edge, and Firefox. This policy explains what it stores and what it doesn't.

## What Copyhold stores

- **Clips:** the text you save, with any title, description, pin, display setting, expiry date, and the times you created and last copied each clip.
- **Settings:** your theme, default retention period, whether automatic saving is on, and whether the popup closes after copying.
- **A clipboard fingerprint:** a one-way SHA-256 hash of the last clipboard text Copyhold saw, so it doesn't save the same text twice. The text can't be recovered from the hash.

Everything is stored in your browser profile on your device, using the browser's own storage. Copyhold has no servers and no accounts.

## Automatic saving

In Chrome and Edge, Copyhold can save text you copy anywhere in the browser, even when its popup is closed. This is **off until you turn it on**. When it's on, Copyhold reads the clipboard about once a second and saves new plain text. That can include sensitive text such as passwords, so you can pause it for 15 minutes or turn it off at any time. Firefox only saves the clipboard when you select **Save clipboard**.

## What Copyhold never does

- It never sends your clips, settings, or any other data off your device. It makes no network requests at all.
- It doesn't use analytics, tracking, advertising, or third-party code.
- It doesn't sell, share, or transfer your data to anyone.
- It doesn't read web pages, your browsing history, or anything other than plain text on the clipboard.

## Exports

**Export backup** downloads a JSON file with all your clips **in plain text**, including masked and hidden clips. The file goes wherever you save it, and Copyhold has no further control over it. Store backups somewhere you trust.

## Deleting your data

- Delete individual clips, or select several and delete them, from the popup.
- Set a retention period or an expiry date so clips delete themselves.
- Uninstalling Copyhold removes all of its stored data from your browser profile.

## Permissions

| Permission | Why Copyhold needs it |
|---|---|
| Read clipboard (`clipboardRead`) | To save clipboard text when you select **Save clipboard**, or automatically if you turn that on. |
| Write clipboard (`clipboardWrite`) | To copy a saved clip back to your clipboard. |
| Alarms (`alarms`) | To delete expired clips about once a minute and to end a pause after 15 minutes. |
| Offscreen document (`offscreen`, Chrome and Edge only) | To read the clipboard in the background while automatic saving is on. |

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions about privacy: [your contact email or support URL].
