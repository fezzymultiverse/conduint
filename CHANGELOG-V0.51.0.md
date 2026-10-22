# Conduint V0.51.0 - Fuller refresh, Home first, add once, quotes, duplicate scanner, Authenticator sync

- Refresh wave: taller, a glowing sheet under it, a second slower wave behind it, and a beam that repeats so it never leaves a gap (`js/ui.js`, `css/style.css`).
- Home first: the body starts as Home, so the "add a folder" list text is never painted while the scripts load (`index.html`).
- Add storage once: one guard (`addOnce`) covers every add path; the extra "Choose folder" question is gone; Home > Add folder opens the picker straight away; folders already on Home count as already added (`js/storage.js`, `js/dash.js`).
- Wi-Fi name on Home is a pill with room above and below (`css/style.css`).
- Rotating quotes under the greeting (`js/quotes.js`): 110 lines, by time of day plus any-time lines, every 9 seconds, tap for the next. Includes "Still up?" and "What's today's plan?".
- Password Manager duplicate scanner (`js/pmdup.js`): Reports > Duplicate logins and Settings > Find duplicates. Groups by user name + site; you choose which to keep; the rest go to the Trash after missing details are copied across; exact copies in one go; "Not duplicates" hides a group.
- Authenticator -> Password Manager sync (`js/pmdup.js`): new Authenticator entries are copied into the vault after every Authenticator save, when the vault unlocks, and on return to the app. Add-only: nothing you edited or deleted in the vault is overwritten or brought back. Passkeys saved on the phone are pulled in too. Switch in Settings.
- Passkey provider: "Open passkey settings" now tries four Android pages in turn (`native/CredPlugin.java`), for phones that do not answer the Android 14 intent.
- `VER` in core.js had been left at V0.50.3; now V0.51.0.
- NOT done: Android's Credential Manager still never gives a sideloaded browser such as Festers the web address; V0.50.9's Festers bridge remains the route for that.
- NOT verified: Java not compiled (no javac here); nothing run on a phone; `tests/v0510.py` was run once and stopped, with the add-once check failing and the quote-tap step timing out, so it is unfinished.
