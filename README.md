## V0.51.0 - Fuller refresh, Home first, add once, quotes, duplicate scanner, Authenticator sync

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

## V0.50.6 — Passkey callback logic fix

- Rewrote `native/FBCredentialPlugin.java` so `createPasskey()` and `getPasskey()` resolve only from a successful AndroidX Credential Manager callback and reject on Credential Manager errors, cancellation, unexpected credential types, or empty response JSON.
- Removed the extra AndroidX `BiometricPrompt` that ran after Credential Manager had already completed. Credential Manager now owns the system credential UI and its authenticator/user-verification flow; there is no second prompt that can incorrectly turn a completed operation into a reported failure.
- Kept the `FBCredentialPlugin` Capacitor name, `@PluginMethod` annotations, request key (`requestJson`), response keys (`registrationResponseJson` and `authenticationResponseJson`), Password Manager interface, and existing `PasskeyService` provider intact.
- Removed the patch script's AndroidX Biometric dependency insertion because this bridge no longer uses that library. Other platform biometric features remain unchanged.
- Version bumped to 0.50.6. Static checks cover ZIP integrity, JavaScript syntax, shell syntax, plugin registration, and absence of the secondary prompt. A full Gradle build and on-device passkey test still need an Android SDK/JDK 17 environment.


## V0.50.5 — Passkey actions connected to Password Manager

- Added **Create Passkey** and **Sign In with Passkey** to Password Manager > Settings > Passkeys & autofill. Both actions call the registered `FBCredentialPlugin`, show progress/status/errors, and display a copyable response JSON after success.
- The form accepts registration or authentication options JSON from a WebAuthn relying-party server. Conduint deliberately does not invent a local challenge or claim that a passkey is registered with a website: send the returned `registrationResponseJson` or `authenticationResponseJson` to the same server for challenge, origin, RP ID and cryptographic verification.
- Kept the existing `PasskeyService` provider and passkey list intact; the new bridge is a separate relying-party flow. The result is not automatically stored in the password vault.
- Version bumped to 0.50.5. Capacitor dependencies remain on the project's existing `^6.2.0` line; AndroidX Credential Manager remains pinned by the patch script to 1.3.0 by default, and AndroidX Biometric 1.1.0 is added only if missing. `MainActivity` registers the plugin once, and the patch script copies its source on each build.
- Verification: JavaScript syntax checks, shell syntax checks, and static integration checks pass. **A Gradle build/device test could not be run here** because this source ZIP does not contain a generated `android/` project and the environment has no `ANDROID_HOME` / Android SDK. Run `npm run build:apk` in an Android SDK/JDK 17 environment to complete native compilation.

## V0.50.4 — AndroidX Credential Manager Capacitor passkey bridge

- Added `native/FBCredentialPlugin.java`, registered as `FBCredentialPlugin` in `MainActivity`.
- `createPasskey({ requestJson })` uses AndroidX `CreatePublicKeyCredentialRequest` and Credential Manager's async Java API.
- `getPasskey({ requestJson })` uses `GetPublicKeyCredentialOption` and Credential Manager's async Java API.
- The original V0.50.4 implementation used an additional BiometricPrompt after Credential Manager completed. This was corrected in V0.50.6: callbacks now reflect Credential Manager success or failure directly.
- `scripts/patch-android.sh` copies the plugin; V0.50.6 no longer adds AndroidX Biometric for this bridge. Existing `PasskeyService` remains the separate Android credential-provider service; do not register `FBCredentialPlugin` as a service.

The plugin does not replace server-side WebAuthn challenge/origin/signature verification. The additional biometric prompt is an app-level confirmation and is not a substitute for the credential provider's own authentication.

# Recent changes (V0.50.x)

## V0.50.3 — Internal storage and Downloads can be added to the left panel

- **New option:** Internal storage and Downloads can now also sit in the left panel. They are **off by default**, so nothing changes until you add them. They stay as tiles on Home too (they are fixed there); the panel gets a second entry.
- **How to add:** long-press the Internal Storage or Downloads tile on Home > **Add to left panel** (the same line then says **Remove from left panel**), or Arrange > the item under Hidden > **Panel**. **Hide** in Arrange takes it out of the panel again and leaves the Home tile alone.
- **Rules kept:** the panel still holds 14 at most and these two count toward the 14 (adding one to a full panel says so and does nothing). They are never added to the Home list (there is no Home chip on them; Add to Home is refused with a message). Up, Down, Rename and Change directory work as for any panel entry. An existing layout is not changed by the update.
- Internal Storage's long-press menu is new (before, only Downloads had one).
- Files: `js/arrange.js`, `js/dash.js`, `js/core.js`, `package.json`, `README.md`, `tests/v0503.py` (new).
- Verification: all `www/js/*.js` pass `node --check`; `tests/v0503.py` passes 23 checks in headless Chromium with the mock storage (off by default, existing layout unchanged, add and Hide, Home tiles stay, never in the Home list, counts toward 14, long-press menus on both tiles, Arrange rows and note, no page errors); `tests/v0500.py` still passes. `tests/smoke.py` and `tests/v0490.py` fail the same way on the untouched V0.50.1 (old selectors), so they say nothing about this change. NOT tested on a phone.

## V0.50.2 — Festers browser can be trusted for Conduint passkeys

- **Why:** Conduint answers web passkey requests only for browsers on its trusted list (`native/assets/cnd_privileged_apps.json`, 13 browsers). The Festers browser (`com.fezzy.festersbrowser`) was not on it, so Festers could not use Conduint passkeys at all.
- **How:** set the GitLab CI variable `CONDUINT_TRUST_FESTERS_SHA256` to Festers' signing-certificate SHA-256 (Festers V1.19.4: Settings > Autofill & Passkeys > status > Copy fingerprint; the Festers pipeline log also prints it). Several fingerprints can be given, separated by commas, for example a debug and a release key. `scripts/patch-android.sh` then runs the new `scripts/trust-browser.js`, which adds Festers to the list inside the APK. Optional `CONDUINT_TRUST_FESTERS_PKG` overrides the package name. The fingerprint is public, not a secret. Without the variable the build says so and the list stays as it was.
- **Bad input stops the build:** a fingerprint that is not 64 hex characters, or a bad package name, fails the patch step and writes nothing.
- **Limits:** the fingerprint only matches while Festers keeps the same signing key. Android must also grant Festers its browser-origin permission (`CREDENTIAL_MANAGER_SET_ORIGIN`); Festers V1.19.4 shows whether it did. If Android refuses, Conduint cannot fix that.
- Files: `scripts/trust-browser.js` (new), `scripts/patch-android.sh`, `tests/v0502.sh` (new), `js/core.js`, `package.json`, `README.md`.
- Verification: `bash tests/v0502.sh` passes 13 checks (adds once, colon and lower-case forms, several fingerprints, bad fingerprint, bad package, missing file, valid JSON, the 13 existing browsers unchanged, `bash -n`); the patch-script block was run in isolation with the variable unset, set and bad. NOT tested: a full `patch-android.sh` run on a generated Android project, the GitLab build, or any passkey on a device.

## V0.50.1 — Selection bar at the bottom, red and green buttons

- **No bar on top when you select.** The selection bar (Done, Copy, Cut, ZIP, Delete, Hide, Vault, Share, Rename...) now sits at the bottom, above the Back bar. Same buttons, same order.
- **Red:** Delete, Done (X), the Recycle bin shortcut, and the X that clears the paste bar. Delete items in menus stay red.
- **Green:** Copy and Cut (move), and Move to 2 in dual pane.
- Files: `index.html`, `js/ui.js`, `css/style.css`, `js/core.js`, `package.json`, `README.md`.

## V0.50.0 — Folders-only panel and Home, steady beam, gallery card fold, zip files open, resume, Wi-Fi name

- **Left panel = folders only, 14 max.** No Browser, no tools. Utilities and the other tools stay in the bottom bar and Tools. Old tool entries drop out of the panel by themselves; extra folders wait under Hidden in Arrange.
- **Home = folders only.** No shortcuts, no Utilities. Home menu > Add folder to Home (or the Add folder button on Home) adds folders. Long-press a panel folder > Add to Home; long-press a Home folder > Move to left panel. Folders you added to Home that had been parked in the panel go back to Home once.
- **Bottom bar renamed Conduit Manager** (was Shortcuts).
- **Refresh bar:** one smooth horizontal beam wave, same height and speed all the way. No spinning, pulsing or growing. Pinned to the top, the list does not move.
- **Gallery selection card:** capped at 40% of the screen with a chevron that folds it to one slim row, so you can see what you are selecting. The list always keeps room under it.
- **Zip walk-through:** viewers opened from inside a zip sit above the Tools panel. Files Conduint cannot show itself are unpacked to the cache and opened through Android (installers go to the installer). Long-press menu: Open, Open with, Extract next to the zip.
- **Screenshots work by default everywhere**, including the Password Manager. The block is one switch in Settings (Hide in recent apps and block screenshots), now always visible.
- **Document viewer permission** row in Permissions (same Android switch as All files access).
- **Resume, no reload:** the jump back to Home after 5 minutes away is gone. If Android closed the app, the last folder and the open document (at its page) come back. `js/resume.js`.
- **Wi-Fi name on Home** under the greeting. Android needs Location permission to reveal it, asked once. Settings > Wi-Fi name on Home turns it off. Native: `WifiPlugin.ssid()`, manifest block `conduint-v50` in `scripts/patch-android.sh`. Rebuild the APK for this one.
- Files: `js/arrange.js`, `js/dash.js`, `js/ui.js`, `js/gallery.js`, `js/zipbrowser.js`, `js/wifi.js`, `js/tools.js`, `js/pmui.js`, `js/resume.js` (new), `css/style.css`, `index.html`, `native/WifiPlugin.java`, `scripts/patch-android.sh`, `js/core.js`, `package.json`.
- Verification: all `www/js/*.js` pass `node --check`; `tests/v0500.py` passed in headless Chromium. The Java change and everything native were not compiled or run on a device.

# Recent changes (V0.49.x)

## V0.49.0 — Backup & restore in Settings

- **Settings > Backup & restore.** Export ONE encrypted file (`.cndbackup`) with the parts you tick: app settings and layout (theme, views, Home and left panel, names, colours, pins), Browser, Shield, VPN settings and app firewall rules, Authenticator, Password Manager (the vault stays sealed with its master password), Notepad.
- **Locked with a passphrase** you choose (8+ characters; PBKDF2-SHA256 310k rounds, AES-256-GCM). It is never stored and cannot be recovered. The file header only says which parts are inside, when and by which version.
- **Restore** opens the file, shows what is inside, and lets you tick parts. Settings, Authenticator and Notepad can Merge or Replace; the rest Replace. Your current data is sealed and kept first, so **Settings > Undo the last restore** puts it back (same passphrase). The app restarts after a restore.
- **Not carried (tied to the phone):** WireGuard private keys (re-import your .conf), passkeys, fingerprint and Keystore keys, the app lock pattern, folder permissions, Vault files. Password Manager attachments over 20 MB are left out and flagged.
- Tests: `tests/v0490.py` (round trip, wrong passphrase, damaged file, merge, Password Manager records).

## V0.48.0 — Wave refresh, Home menu groups, zip viewer fix, keystore variables

- **Pull-to-refresh is a horizontal wave.** A full-width wave swells as you pull, flows sideways while refreshing and fades out. The list no longer slides. Home refreshes the same way (it had no pull-to-refresh before).
- **Home menu (the three dots on Home) has no "Add a folder".** Options sit in three groups (Home, Sync, Utilities) that fold with a tap; open or closed is remembered. More space between rows.
- **Home sections fold too:** Library, Music, Browser and Quick tools each have a header you tap; remembered, with a gap below each.
- **Zip walk-through works.** Opening a file inside a zip started the viewer behind the Tools panel, so nothing could be tapped. Viewers opened from a zip now sit on top. Long-press on a zip entry now opens its menu (Extract to Downloads / Open with).
- **Keystore variables:** `scripts/set-ci-vars.sh [user/project]` sets CONDUINT_KEYSTORE_B64 and CONDUINT_KEYSTORE_PASS on a GitLab project through the API (masked). `--check` only lists what is present. `make-keystore.sh` offers to do it right after creating the key. GitLab variables are per project, so a new project needs them again.

## V0.47.0 — Fixed shortcuts, Notepad, weather on Home, opens on Home

- **App opens on Home, panel closed.** Boot used to force the left panel open and open your first storage. That was the "glitch panel" on entry. Both removed. After 5+ minutes in the background the app also returns to Home.
- **Drawer flash fixed.** The closed drawer is hidden (`visibility`) and its slide animation stays off until first paint and during rotation.
- **The five bottom shortcuts are permanent** (Vault, Contacts, Utilities, Settings, Recycle bin): fixed order, no hide, move or arrange, removed from Arrange. The top panel no longer has Settings or Tools rows (they repeated the bottom ones); it holds folders and tool options only.
- **Shortcuts bar folds** the five into one row of icons and back; the choice is remembered (`S.lay.footc`).
- **Top panel holds 16** (was 11) and scrolls if it overflows. Tool placements: Notepad (optional, with Authenticator, Shield, VPN, Zipliner, Optimiser, Analyser, Browser, Apps, Password Manager, Vault).
- **Weather moved to the top of Home**, under the greeting. It no longer depends on the Header widgets setting.
- **Weather card** tints by conditions (hot 30°+, rain, cold 8°-).
- **Notepad is optional:** it starts hidden (not in the left panel, not on Home). Open it from Tools, or place it from Arrange.
- **Notepad** (Tools > Notepad, `js/notepad.js`): notes stay on the phone; search, colour filter, pin, bin (30 days), autosave, undo/redo, checklists (Enter continues a list), word count, copy, share, Backup (.json), Export (.txt), Restore. Not encrypted and no lock yet.
- **Pull-to-refresh** indicator is a short centred pill instead of a full-width beam.
- Files: `js/notepad.js` (new), `js/arrange.js`, `js/ui.js`, `js/dash.js`, `js/tools.js`, `js/widgets.js`, `css/style.css`, `index.html`, `js/core.js`, `package.json`, `README.md`.
- Verification: all `www/js/*.js` pass `node --check`; headless Chromium run passed 26 checks (Home landing, drawer hidden/visible, fixed foot, fold, notepad create/checklist/undo/search/pin/bin/restore). Not run on a device.

# Recent changes (V0.46.x)

## V0.46.2 — Build stops instead of making an APK that cannot update

- If the CI project has no `CONDUINT_KEYSTORE_B64` / `CONDUINT_KEYSTORE_PASS` variables, the APK job now fails with a clear message. Before, it built an APK with a random key that Android rejects with "package conflicts with an existing package". Set `CONDUINT_ALLOW_RANDOM_KEY=1` to build anyway.
- The job log now prints the signing certificate fingerprint, so you can see whether two builds share a key.
- GitLab variables belong to one project: a new project (like safe-vault) needs them added again.
- Changed: `scripts/sign-android.sh`, `scripts/build-apk.sh`, `www/js/core.js`, `package.json`, `README.md`.

## V0.46.1 — Pull-to-refresh bar

- The pull-down refresh indicator is now a full-width bar that drops down from the top edge as you pull. It no longer scales in from the centre or sweeps in from the sides.
- While refreshing, the bar stays pinned to the top and pulses; reduced-motion users get a static bar.
- Changed: `www/css/style.css` (the `#ptr` block). `www/js/ui.js` is unchanged.

## V0.46.0 — Contacts export and import

- **Export** (Contacts > Export): all contacts as **vCard (.vcf)** or **CSV (.csv)**. vCard 3.0 keeps every field the editor has (name parts, nickname, company, department, job title, phones, emails, addresses, websites, birthday, anniversary and other dates, related people, notes, Favourite) and opens in Android, Google Contacts, iPhone and Outlook. Custom labels are written the Apple way (`itemN.X-ABLabel`). CSV keeps names, phones, emails, websites, addresses, birthday, notes and Favourite in one row per contact, with as many numbered columns as the biggest contact needs; it opens in Excel (UTF-8 with BOM). The file goes where you pick (folder picker in the app, a download in a browser), named `conduint-contacts-YYYYMMDD-HHMM`.
- **Import** (Contacts > Import): pick a `.vcf` or `.csv`. vCard 2.1 / 3.0 / 4.0 are read, including old Android exports (QUOTED-PRINTABLE, folded lines) and Apple item groups. CSV headers from Conduint, Google and Outlook are recognised (First Name, Given Name, E-mail Address, Mobile Phone, Home Phone, Company, Job Title, Birthday, Phone 1 - Value and so on), comma, semicolon or tab separated. The app shows how many contacts it found and how many already exist (same phone number, same email, or same name when there is neither); choose **Skip duplicates** or **Import everything**. Contacts are saved one by one through the same save the editor uses, with "Importing 12 of 340…" in the footer, then the list reloads. Failed ones are counted and the first reason is shown; three failures in a row with none saved stops the import (usually the Contacts permission).
- **Limits:** photos are not exported or imported. CSV does not carry related people or extra dates (use vCard for those). Imports always create new contacts; they never overwrite an existing one. A birthday written as 05/06/1990 is read day first unless the second number cannot be a month. Needs the installed Android app and the Contacts permission; no native code changed, so the existing APK build works.
- Files: `js/contactsio.js` (new), `js/contacts.js` (Export / Import buttons, dialogs raised above the Contacts screen), `index.html`, `js/core.js`, `package.json`, `README.md`, `tests/v0460.js` (new).
- Verification: all `www/js/*.js` pass `node --check`; `node tests/v0460.js` runs 26 checks on the parsers (vCard and CSV round trip, escapes, multi-line notes, QUOTED-PRINTABLE, Google/Outlook style CSV, empty and garbage files). The Contacts screen buttons, the file picker and the real save were not run in a browser or on a device.

# Recent changes (V0.45.x)

## V0.45.0 — Home scrolls, Videos and Downloads tiles, Quick tools widget

- **Home scrolls, it no longer shrinks.** V0.31.2 added `homeFit`, which zoomed every Home card down (never below 55%) so nothing needed scrolling; with the music card hidden that is what made things look squeezed and cut off. It is removed. The short-screen CSS squeeze (`max-height:820px`, smaller tiles and icons) is removed too. Every card keeps its full size on every phone and `#dscroll` scrolls, with or without the music player open. Bottom padding is 28px plus the safe area, so the "Strategy over impulse" line is never stuck against the edge.
- **Six folder tiles, two columns.** Internal Storage, Documents / Gallery, Music / **Videos**, **Downloads**. Videos sits directly under Gallery and opens the Videos library (`goCat('vids')`), with the live video count; playing one uses the normal video player (Enhance, HD label, Convert to audio, all unchanged). Downloads opens your Downloads folder (`go('downloads')`); until it is connected it reads "Tap to connect" and the first tap runs the usual connect flow (All files access, or the folder picker).
- **Downloads moved from the left panel to Home.** The Arrange rule is one place per item, and Internal Storage is already a fixed Home tile, so `slot:downloads` is no longer in the Arrange list; Downloads is only a Home tile now and the panel gets one free slot. Its old menu is on a long-press of the tile: Rename, Change directory, Open directly (All files access). Nothing is disconnected: an already-connected Downloads keeps its folder.
- **Quick tools widget** (`js/quick.js`, new), the last card on Home above "Strategy over impulse":
  - a live storage ring (colour goes green, amber, orange, red as it fills) with free / total, and a RAM bar. Both read the same numbers as the header chips (`widgets.js`) and update in place, so a tap is never lost to a redraw;
  - six tools in a 3 x 2 grid: Large files (over 50 MB), Duplicates, Junk, Installers (old APKs), Fresh files (last 3 days), Analyzer. Each opens the Tools sheet straight on that result list, the same lists as Tools, and nothing is deleted until you confirm there (to the recycle bin first when the bin is on);
  - **Optimise** (one tap, no questions): the existing Optimise Conduit routine (stop background apps, clear cache unless media is open, turn off Conduint's own battery drains);
  - two pills: Recycle bin (with the item count, opens the bin) and Shield (ON / OFF, opens Shield).
- **Limits:** the scanners need the Android app and All files access (the widget asks the same way Tools does, and falls back to the Tools list if you refuse). In a plain browser the tools show "Quick tools run in the Android app." Back from a result list goes to the Tools list, as it does from the Home Analyzer shortcut.
- Files: `js/dash.js`, `js/quick.js` (new), `js/arrange.js`, `js/widgets.js`, `css/style.css`, `index.html`, `js/core.js`, `package.json`, `README.md`, `tests/v0190.py` and `tests/v0312.py` (edited for six tiles and no shrinking, not run).
- Verification: all `www/js/*.js` pass `node --check`; no browser test was run for this release, and there is no v0450 test yet. Not run on a device: native scans and the real Downloads connect flow.

# Recent changes (V0.44.x)

## V0.44.0 — Video Enhance, HD badge, video to audio

- **Enhance** (video player, sliders icon): presets Off, Enhance, Vivid, Cinema, Night, Sharp plus Brightness, Contrast, Colour and Sharpness sliders. A live display filter: it cannot add detail the file lacks, and Sharpness above 0 costs battery and may stutter 1080p on a weak phone.
- **HD:** local videos play at the file's own resolution, so there is no quality switch. The player now shows the resolution with a label (SD, HD, Full HD, 2K, 4K) under the title, and a clear message when the phone cannot decode a format (often H.265/HEVC or MKV).
- **Convert to audio** (video player music icon, and file menu > Convert to audio…): MP3 at 320, 256, 192, 128, 96 kbps, 64 kbps mono (voice), variable highest quality; M4A (AAC) at 256 or 128 kbps; or Original audio (no re-encode, AAC audio only, no library needed). The result is saved where you pick.
- **MP3 needs ffmpeg-kit.** `native/ConvertPlugin.java` reaches it by reflection, so the app builds without it and then only Original audio works. To add it: `CONDUINT_FFMPEG_DEP="group:artifact:version" bash scripts/patch-android.sh`. The original arthenica ffmpeg-kit was retired and its files were pulled from Maven Central, so use a maintained fork that keeps the `com.arthenica.ffmpegkit` package and carries libmp3lame, and check the coordinate resolves. minSdk 24 or newer.
- Files: `native/ConvertPlugin.java` (new), `native/MainActivity.java`, `scripts/patch-android.sh`, `www/js/mediax.js` (new), `www/js/ui.js`, `www/index.html`, `www/css/style.css`, `www/js/core.js`, `package.json`, `README.md`.
- Verification: JS passes `node --check`; `patch-android.sh` passes `bash -n` (shellcheck is not installed here); `ConvertPlugin.java` compiled against stub Android classes only. No device run, and no ffmpeg-kit build was tried.

# Recent changes (V0.43.x)

## V0.43.9 — Clear ON | OFF for Shield and VPN

- **Shield and VPN screens** now have a two-sided ON | OFF switch; the lit side is the state (accent for ON, red for OFF). Before, Shield had one chip that read "On" and the VPN had a Connect / Disconnect button. VPN ON connects, OFF disconnects; ON is disabled until a WireGuard profile is imported. The VPN card heading reads "VPN is ON / OFF".
- **Tools list:** Shield and VPN rows carry an ON / OFF tag.
- **Left panel and Home:** the Shield and VPN subtitles start with ON or OFF (VPN once its state is known, checked every 5 s).
- Files: `js/shield.js` (onOff helper), `js/vpn.js`, `js/tools.js`, `js/arrange.js`, `css/style.css`, `js/core.js`, `package.json`, `README.md`. Syntax-checked only; not run on a device.

## V0.43.8 — Bottom shortcuts are configurable

- **The five shortcuts under the left panel (Vault, Contacts, Utilities, Settings, Recycle bin) are no longer fixed.** Long-press one to move it up or down or hide it, or use Arrange > Bottom shortcuts (Show / Hide / ▲ ▼). Saved with the layout (`S.lay.foot`); every phone starts with all five shown, as before.
- **Settings can leave the left panel and Home** (Hide in its menu or Arrange). It always keeps one way in: it cannot be hidden from the bottom unless the left panel or Home still has it, and it cannot leave the left panel or Home while the bottom no longer has it.
- **Descriptions are back** on the bottom shortcuts (V0.42.4 had hidden them with CSS).
- Files: `js/arrange.js`, `css/style.css`, `js/core.js`, `package.json`, `README.md`. Syntax-checked only; not run on a device.

## V0.43.7 — Passkeys are saved in the password manager

- **Passkeys are vault items.** A passkey saved through Android's Credential Manager is now a P-256 key made in software, copied into the Password Manager vault as a Login (`login.fido2Credentials`, Bitwarden shape) and listed as "Passkey" in the item view and search. It joins the existing login for that site and username, or makes a new one. Before this, passkeys lived only in the Keystore: never in the vault, exports or backups.
- **Export, backup, import.** `.json`, `.zip` and the encrypted `.cndpm` backup now carry passkeys, and a Bitwarden-style JSON import brings them back (GUID credential ids are converted to the real raw id). `.csv` has no passkey column. Passkeys using anything but ES256 / P-256 are skipped on import.
- **Signing while the vault is locked.** The phone keeps a sealed copy (AES-256-GCM, Keystore key) so a site can still sign you in with the vault locked. Fingerprint or screen lock is still asked. That copy is not covered by the master password. The vault is the truth: delete or trash the item and the phone's copy goes on the next sync; a passkey made while the vault was locked is added to the vault at the next unlock.
- **Passkeys & autofill screen** (Password Manager > Settings) shows each passkey as "In vault" or "Phone only", and Delete removes it from the vault too. Erase vault also erases the phone's vault passkeys. Clone never copies a passkey.
- **Old passkeys.** Passkeys made before this version are Keystore keys and cannot be exported. They keep working and show "Phone only".
- **More browsers can save passkeys.** The trusted-browser list (`native/assets/cnd_privileged_apps.json`) had only Chrome. It now has Chrome Beta, Dev and Canary, Brave, Firefox, Firefox Beta, Fenix, Edge, Samsung Internet, Opera, Vivaldi and DuckDuckGo. The fingerprints were copied from Google's published privileged-apps list through a web reader and not checked byte for byte against the APKs: a wrong one only means that browser is refused, never trusted by mistake. A browser not on the list cannot use Conduint passkeys.
- WebAuthn flags: vault passkeys report backup eligible + backup state; old Keystore passkeys keep reporting neither.
- Files: `native/CredStore.java`, `native/CredPlugin.java`, `native/PasskeyActivity.java`, `native/assets/cnd_privileged_apps.json`, `www/js/pmpk.js` (new), `www/js/pmui.js`, `www/index.html`, `www/js/core.js`, `package.json`, `README.md`.
- Verification: all `www/js/*.js` pass `node --check`; the vault sync logic ran against a mock phone (pull, merge, ack, trash, restore, unreadable-vault guard, pending-while-locked, GUID ids). `CredStore.java` compiled against stub Android classes only. `CredPlugin` and `PasskeyActivity` were not compiled and nothing was run on a device: rebuild the APK, switch Conduint on under Passwords, passkeys & accounts (Android 14+), and try one site.

## V0.43.0 — Full contacts editor

- **New fields:** first / last name, prefix, middle, suffix, nickname; company, department, job title; any number of phone numbers (Mobile, Home, Work, Main, Work mobile, Fax, Pager, Assistant, Other, Custom label), emails, websites and related people; addresses (street / unit / block, suburb, PO box, city, province, postal code, country, typed); birthday, anniversary and other dates (with a "Year unknown" option); notes; Favourite star.
- **List:** search now covers every phone (also digits-only), email, address, website, note and relation. New All / Favourites / Birthdays filter; Birthdays sorts by next birthday with a days-to-go and "turns N" hint.
- **Editor:** the list/search bar hides while editing, Save/Cancel/Delete stay pinned at the bottom.
- **Native:** `native/ContactsPlugin.java` reads everything in one query (faster for large books) and saves only the data kinds the editor manages on the contact's primary raw contact. Photos, IM, groups and WhatsApp/Telegram data are left alone. The APK must be rebuilt; an older APK shows a warning in the editor and keeps the old 5-field behaviour.
- Files: `js/contacts.js`, `native/ContactsPlugin.java`, `js/core.js`, `package.json`, `README.md`, `tests/v0430.py`. JS syntax-checked and browser-tested with a mock Contacts plugin (`python3 tests/v0430.py`). Java not compiled and not run on a device.

# Recent changes (V0.42.x)

## V0.42.5 — Shield web filters look like VPN DNS filtering

- **Shield > Web filters** is redrawn in the same style as VPN > DNS and filtering: a master switch (DNS filtering for every app), fold groups for DNS servers (Recommended, Security only, No filtering), Backup server and Custom server, then the browser filters as fold groups with a group switch, per-item switches and tags (domain counts, "ALL APPS VIA DNS" when the chosen DNS server also covers it), plus Your list.
- DNS choices use the same saved setting and server list as VPN > DNS and filtering, so the two screens always agree. Reconnect now appears when a change needs the VPN to reconnect.
- Honest limits: DNS filtering only works while a VPN profile is connected and applies on the next connect. Browser filters only act inside the Conduint Browser. Malware and phishing are DNS-only.
- Files: `js/shieldz.js` (new), `index.html`, `css/style.css` (appended), `js/core.js`, `package.json`, `README.md`, `tests/v0425.py`. Syntax-checked and browser-tested with a mock phone and a mock VPN plugin; not compiled or run on a device. No native Java changed.

## V0.42.4 — Utilities and Settings under the left panel

- **Fixed block:** the block under the left panel now reads Contacts, Utilities, Settings, Recycle bin. Utilities opens the Tools screen; Settings opens the Settings sheet.
- Home and left-panel copies of Tools and Settings are unchanged (Settings can still never be lost). The new rows are permanent shortcuts only.
- Files: `js/arrange.js` (drawBin), `css/style.css` (appended), `js/core.js`, `package.json`, `README.md`, `tests/v0424.py`. Syntax-checked and browser-tested with a mock phone; not compiled or run on a device.

## V0.42.3 — Pull-to-refresh edge-glitch fix (ChatGPT patch)

- **Refresh animation:** confined the loading effect to a 3 px top-edge beam. Removed the vertical sweep overlay and glow that could appear down the sides.
- **Pull tracking:** corrected the refresh beam position calculation so the list's temporary translate is not counted twice, preventing the indicator from drifting while pulling.
- **Version:** bumped `package.json` and the in-app version constant to `0.42.3`.
- **Verification:** source-level patch applied; JavaScript syntax and ZIP integrity checks are run on this archive. No Android device test is claimed.


## V0.42.1 follow-up fixes (ChatGPT patch)

- Fixed weather mounting: the weather card is created inside the side-panel `#pwx` container during dashboard initialization; it is not added to Home. Weather data still requires network access and a configured city/location.
- Music sync now scans recursively including hidden folders and raises the per-selected-folder safety cap to 500,000 tracks. Folders still need to be selected/authorized in Android; unreadable folders are reported rather than silently treated as complete.
- Password CSV import now normalizes common header aliases (website/login URL, title/description, user/login, pass, folder/group, OTP/TOTP) before format detection. It does not decrypt encrypted Bitwarden exports; export unencrypted JSON/CSV from the source vault first.
- Contacts uses an in-app editor for name, one phone, one email, company and notes. It does not yet support multiple phone/email rows or deletion.
- Verification in this patch: JavaScript syntax checks only; Android runtime/device testing and a full APK build were not performed in this environment.

## V0.42.2 — Contacts editor, music scanning and import reliability (ChatGPT patch)

- **Contacts editor:** replaced the system-editor launch from the Conduint Contacts screen with an in-app form for name, phone, email, company and notes. Added native Android Contacts provider read/save support; existing contacts are updated in place where the provider exposes a writable raw contact. Contacts remain in Android Contacts. Multiple phone numbers/emails and contact deletion are not yet supported in this editor.
- **Music sync:** raised the per-folder scan ceiling from 5,000 to 100,000 tracks and added a visible warning if a folder reaches the ceiling. The scan remains recursive and can include multiple folders added through Sync Music. This is a larger safety limit, not literally unlimited; Android storage permissions and provider errors can still restrict results.
- **Password imports:** CSV parsing now detects comma, semicolon or tab delimiters, and unsupported-column errors show the detected header names to help identify the export format. Supported formats remain the ones listed in the importer; this does not guarantee compatibility with every password manager export.
- **Contacts panel:** search now matches email and company as well as name and phone; contact rows show the available contact details.
- **Verification:** all `www/js/*.js` files passed `node --check`. Android Java compilation and on-device contact permissions, music scanning and real-world password exports have not been verified in this environment.
- **What ChatGPT did:** added the in-app contact editor and native save API, increased the music scan ceiling with an explicit cap warning, made CSV import delimiter handling more tolerant, and documented remaining limits. No APK build or device test is claimed.

## V0.42.1 — Home, music scan, authenticator profiles (ChatGPT patch)

- **Home screen:** removed the “YOUR OFFICE” eyebrow text above the greeting.
- **Weather placement:** stopped mounting the Weather card from the Home dashboard; Weather remains owned by the dedicated side-panel slot (`#pwx`).
- **Music sync:** raised the per-folder SAF scan ceiling from 5,000 to 30,000 tracks and added an explicit warning when a folder reaches that ceiling, instead of silently implying the library is complete. Nested folders are scanned by the existing native SAF walker.
- **Authenticator profiles:** enabled the existing account-profile view by default so a saved account can show its associated TOTP entry in the profile. Set `cnd.auth.prof` to `0` to return to the classic code list.
- **Password-manager custom fields:** added an `Authenticator (TOTP)` field type. Enter a Base32 secret or `otpauth://` URI; the item profile renders the live code and countdown, and save validates the key.
- **Contacts and password imports:** existing native contact add/edit actions and multi-format password import paths were reviewed; this patch does not change their underlying platform APIs or claim to resolve every device-specific import failure.
- **Verification:** JavaScript syntax checks and project tests run after this patch; no Android device build or on-device permission/import test is claimed.

# Conduint Files

## Installing: no uninstall needed

Install each new APK straight over the old one. Your files, vault and settings stay. This works because every build is signed with your fixed key and its versionCode only goes up (see V0.37.0 below). Two things must be true:

- The build was made with `CONDUINT_KEYSTORE_B64` and `CONDUINT_KEYSTORE_PASS` set in GitLab CI/CD (made once with `bash scripts/make-keystore.sh`). Without them the build gets a random key and Android refuses the update.
- Never lower the version number in `package.json`. V0.39.0 gives versionCode 3,900,000 plus the pipeline number, higher than every V0.38.x build.

The one exception: if the app on the phone was built before your fixed key was set up, uninstall it once. After that, never again. Never lose the keystore backup.

## V0.40.0

- **Passwords Home dashboard.** The password manager now opens on a Dashboard after unlock: welcome with your name and vault email, a 0-100 security score (70 from password health, 30 from protections switched on), counts of passwords, secure notes, cards, identities, SSH keys, favorites, attachments and trash (tap one to open the vault filtered to it), password health (reused, weak, unsecure sites, no 2FA key) with the breach check, sync and backup status, a protections checklist, quick actions and recently changed items.
- **Top panel icons:** Videos, Sync and backup, Add item, Settings. Videos also has an icon in the main top bar. The bottom bar is now Home, Vault, Reports, Settings.
- **Sync option.** The cloud icon: Back up now (encrypted .cndpm, saved wherever you pick, the last backup time is remembered), autofill sync on / off / sync now, Import.
- Gallery screens and layouts were not touched.
- Files: `js/pmdash.js` (new), `js/pmui.js` (navigation only), `index.html`, `css/style.css` (appended), `js/core.js`, `package.json`, `tests/v0400.py`. Tested in a browser with a mock phone (14 checks pass). Not compiled or run on a device.

## V0.39.0

- **Four result labels.** Every scanned file is **Clean**, **Suspicious**, **Malicious match** or **Not fully scanned**. Not fully scanned means Shield could not check all of it: too big, unreadable, scan error, password protected files inside an archive, an archive inside an archive, more than 300 files inside, more than 20 MB for one file, 7z/rar/tar archives. Before, those could read as clean.
- **Scan history.** Tools > Shield > Scan history: the last 20 scans with start time, length, what was scanned, the four counts, and per-file findings (tap a scan). Works for Scan files, Scan a folder and Scan whole device. Clear history is there too.
- **Quarantine.** After a folder or device scan, malicious and suspicious files get a **Quarantine** button. The file moves into a hidden `.conduint-quarantine` folder next to where it was, renamed `.quarantined` so it cannot run, and its SHA-256 is saved. Tools > Shield > Quarantine lists them with **Restore** (back to the original folder and name, asks first) and **Delete forever** (asks first, cannot be undone). Scans skip the quarantine folder. Honest limit: loose files picked one by one have no folder known to Conduint, so they cannot be quarantined.
- **Deeper archives.** Inside .zip, .jar, .docx, .xlsx, .pptx and .odt: every file name, known-bad hashes, content patterns, scripts, programs hiding behind text names, Office macros, and zip bombs (a file that expands past what the archive says). APK files keep their own APK inspection.
- **Signed rule updates.** A rules update from a link is only accepted if the file at the same link plus `.sig` carries a valid ECDSA P-256 signature that matches the public key in `js/shieldkey.js`, and its version is not older than the rules in use (this check already existed). Until a key is set, link updates are refused and the built-in rules stay in use. The bundled `shield-rules.json` is part of the app and needs no signature.
- **Signed rule updates: one-time setup in Termux** (needs `pkg install nodejs`): `bash scripts/sign-rules.sh keygen` makes the key in `~/.conduint-rules-key.json` (back it up, never commit it) and prints a line to paste into `www/js/shieldkey.js`. For each update: `bash scripts/sign-rules.sh sign rules.json`, then upload `rules.json` and `rules.json.sig` so the `.sig` sits at your rules link plus `.sig`. Upload the rules file exactly as signed.
- Still not done: real-time protection of new downloads, scanning inside 7z/rar, deep APK analysis beyond V0.25.0's permissions and signing-key checks. Shield is a small offline file checker, not a full antivirus.
- Files: `js/shieldy.js` and `js/shieldkey.js` (new), `scripts/sign-rules.sh` (new), `index.html`, `js/core.js`, `package.json`, `README.md`. Syntax-checked with node; the label logic, archive scan and signature check were run in node with sample files. Not compiled or run on a device, not tested.

## V0.38.1

- **Storage menu is about this device only.** "Connect Storage" is now **Add storage location** with the line "Phone, SD card or another folder on this device." Choices: **Add folder** (any folder the Android picker shows, Termux's included), **Add files**, and **SD card or USB drive** (shows "none found" when nothing is detected). The separate "Termux home folder" entry and all cloud wording are gone from this menu.
- **Add files.** Pick one or more files with the Android picker. They stay linked to where they live (nothing is copied) and appear in one list called **Added files**, which survives restarts. An older "Cloud files" list is renamed to "Added files" on first use. Three-dot menu inside it: **Add files**.
- **Folders are remembered** and the side panel shows the folder's real name.
- **Blocked folders.** If Android refuses a folder (permission taken away, folder moved), the screen says so in plain words and shows **Choose this folder again**.
- Not changed: the Upload Files / Folders dialog, browser and VPN screens still mention cloud apps. Say so if you want those cleaned too.
- Files: `js/storage.js`, `js/ui.js`, `js/arrange.js`, `css/style.css`, `js/core.js`, `package.json`, `README.md`. Syntax-checked with node. Not compiled or run on a device, not tested.

## V0.38.0

- **VPN review, checked against the code first.** Traffic counters are REAL: the native layer reads WireGuard's own byte counts (`getStatistics`, totalRx / totalTx). The "0 B" you saw was only the placeholder until the first 2-second poll; the first real value now shows at once. The kill switch is NOT something the app can switch on or verify: Android keeps Always-on VPN and Block connections without VPN to itself, so Conduint opens that page and the dialog now gives a way to prove it works.
- **Server clarity.** The connected card shows server name, endpoint, tunnel type, whether IPv4 and IPv6 are routed through the tunnel, and the DNS in use. Profile rows say connected or idle. Country and provider are not shown: a WireGuard config holds only an address, so name your profiles after the provider and place (for example "Proton NL").
- **Diagnostics.** The live line on the VPN card says "waiting for the first handshake", "no handshake after N s" (server down, wrong endpoint or keys, or UDP blocked) or "last handshake N min ago, the tunnel may have dropped" (native: newest handshake across the peers). Connect and import errors are explained in plain words (server not answering, keys refused, address lookup failed, damaged profile, engine did not start) with the original message kept at the end.
- **Leak test** (Test connection). Reaches 1.1.1.1 through the tunnel, a name lookup, and IPv6, then reads the config: warns of an IPv6 leak risk when IPv6 works but the profile does not route ::/0, and of a DNS leak risk when the profile names no DNS. Honest limit: it cannot see which resolver answered, and it does not test during disconnect or server switching; run it again after a switch.
- **Provider transparency.** The VPN screen now says Conduint sells no VPN and runs no servers: imported profiles decide the servers, and the provider sees the traffic.
- Not done: verifying traffic is blocked when the tunnel drops (Android's setting, cannot be read from the app) and automatic leak tests during disconnect or rotation.
- Files: `js/vpnx.js` (new), `native/VpnPlugin.java` (handshakeAgo, v4route, v6route), `native/VpnCore.java` (route flags in the profile list), `js/vpn.js` (vpMsg const to let), `index.html`, `js/core.js`, `package.json`. Not compiled or run on a device, not tested.

## V0.37.0

- **Shield web filters** (Tools > Shield > Web filters). The same ads / trackers / adult / gambling / shopping switches as the browser, plus a DNS filter pick (Off, Malware, Malware + adult, Ads + trackers, Ads + adult) that covers every app through the VPN (reconnect the VPN to apply). Honest limit: the switches filter pages in the Conduint Browser; other apps are filtered by DNS only, and Android allows one VPN at a time.
- **Run in the background** (Shield > Run in the background). Shows a shield icon and "Conduint Shield" in the notification bar ("Shield is on, N web filters") and holds the wake lock through the existing keep-running service. It asks for the battery and notification permissions. Swiping Conduint away from recent apps stops it, as before.
- **Scan the whole device** (Shield > Scan whole device). Walks phone storage and the SD card (needs All files access), skips Android/data and Android/obb, up to 30,000 files, with a Stop button and a notification when done. Same rules as Scan a folder: a file check, not a full antivirus.
- **Installing over the old app (no more uninstall).** Android only updates an app when the new APK has the same signing key and a higher versionCode. CI used a new random debug key every build. Now `scripts/sign-android.sh` signs with your fixed key and sets versionCode from the version and pipeline number. ONE-TIME setup: run `bash scripts/make-keystore.sh` (needs keytool), add the two printed values as masked GitLab CI/CD variables `CONDUINT_KEYSTORE_B64` and `CONDUINT_KEYSTORE_PASS`, back the keystore up. The next build installs over the current one only if it is signed with that key, so the first install after this change needs one last uninstall (the old app has a different key). If the variables are missing the build warns and falls back to the random key.
- **Version code (how it is worked out).** `scripts/sign-android.sh` sets `versionCode = (major x 10000 + minor x 100 + patch) x 1000 + (pipeline number mod 1000)` and `versionName` = the version in `package.json`. Example: V0.37.0 is (0 x 10000 + 37 x 100 + 0) x 1000 = 3,700,000, plus the pipeline number, so pipeline 12 gives 3,700,012. A new version number always beats an older one, and a rebuild of the same version still goes up with each pipeline. Rule: a build can only install over the old app when its versionCode is higher AND it is signed with the same key. Never lower the version number in `package.json`.
- Files: `js/shieldx.js` (new), `native/KeepService.java` (shield badge and title), `scripts/sign-android.sh` and `scripts/make-keystore.sh` (new), `scripts/build-apk.sh`, `.gitlab-ci.yml`, `index.html`, `js/core.js`, `package.json`. Not compiled or run on a device, not tested.

## V0.36.0

- **Secure notes can hold an authenticator code.** Editor: a hidden "Authenticator key" box under the name (eye button to show). Item view: live 6-digit code with countdown plus the hidden key, right under the title. Bad keys are refused on save. Exports carry it as a hidden field "Authenticator key" and imports turn that field back into the note's key.
- **Renamed.** Every screen now says Conduint Password Manager (no "Bitwarden-style" wording).
- **Search.** Sticky box at the top of the vault, clear button, result count. It reads names, notes, sites, usernames, folder names, type names and plain custom fields (never hidden values).
- **All notes load.** The 200-item cap is gone (every item is drawn). Header shows "N items, M notes". If saved records cannot be decrypted a banner says how many. Import bug fixed: the duplicate check only compared the first 200 letters of a note, so different long notes with the same start were skipped.
- **Email recovery key.** Settings > Unlock and recovery > Email recovery key makes a 20-character key and opens your mail app addressed to the vault email with the key ready to send (also Share and Copy). Lock screen: "Recover with email key": type the vault email and the key, then choose a new master password. The key works once, then offers a new one. It also gets you past the authenticator step. Honest limit: there is no server, so Conduint cannot send the email itself; anyone who can read that mailbox and has a copy of the vault file can open the vault.
- Files changed: `js/pmx.js` (new), `js/pm.js` (import duplicate check, wording), `js/pmui.js`, `js/pmsec.js`, `js/tools.js`, `js/arrange.js` (wording, small hooks), `js/core.js`, `index.html`, `css/style.css`, `package.json`. Not run on a device. Syntax-checked with node; one browser run of the new parts passed before you asked me to stop testing.

## V0.35.0

- **Conduint Passwords: more ways in, and a way back.** Settings > Unlock and recovery (new file `js/pmsec.js`).
- **Master password** and **fingerprint** work as before.
- **PIN** (4 to 8 digits). Opens the vault on this phone only: the key is made from the PIN plus a secret that lives in the phone's Keystore, so a copied vault file cannot be brute-forced elsewhere. Five wrong tries delete the PIN and the master password is needed again.
- **Backup codes**: 10 single-use codes (12 letters and numbers). Shown once, with Copy all and Save as .txt (not encrypted). Any one opens the vault if you forget the master password, is then spent, and asks you to set a new master password. New codes replace the old ones. The lock screen shows "Use a backup code" once codes exist, and first-time setup offers to make them.
- **Authenticator step (TOTP)**: optional. After any unlock the vault asks for a 6-digit code (30 s, one step either side). Setup gives a key and an otpauth link for your authenticator app and only turns on after you type a correct code. It needs backup codes first, so a lost authenticator cannot lock you out. Backup codes skip this step. Honest limit: it is a second lock on the app, not encryption. It stops someone who learns your master password or PIN, but a copy of the vault file is protected by the master password alone. The secret is stored inside the encrypted vault. Logins you chose to share with autofill are not behind this step.
- Changing the master password keeps the PIN and backup codes working (the vault key does not change).
- Files changed: `js/pmsec.js` (new), `js/pmui.js` (three hooks), `js/pm.js` (loads the authenticator record), `index.html`, `css/style.css`. Not run on a device and not tested, by request.

## V0.34.1

- **Back button fixed.** Android Back (button and gesture) now goes through the app itself instead of web history, which Android can skip and which was closing the app from inside screens. Each press closes the top-most thing first (menu, dialog, Passwords, Tools and its sub-screens, Block apps, folders), and only when nothing is left does Conduint go to the background (like Home). If the page ever stops answering, Back sends the app to the background after 1.5 seconds.
- Files changed: `native/MainActivity.java`, `www/js/ui.js`. Not compiled or run on a device, by request.

## V0.34.0

- **VPN > Block apps.** Per-app network blocking, no root. Each app gets one rule: **Allow**, **Wi-Fi** (blocked only on Wi-Fi), **Mobile** (blocked only on mobile data), **Both** (Wi-Fi and mobile data) or **Focus** (blocked completely: every network, always). The rules follow the phone: when it moves from Wi-Fi to mobile data the block list changes with it. Pick apps in VPN > Block apps > Choose apps (search, Blocked only filter, Clear all), tap Save, then switch Block apps On.
- **How it works.** A second VPN service (`native/FirewallService.java`) sends only the blocked apps into a dead end and throws their packets away. Other apps are not touched. Nothing leaves the phone, nothing is logged. Conduint itself can never be blocked.
- **One VPN at a time.** Android allows a single VPN, so turning Block apps on disconnects the WireGuard VPN (it asks first), and connecting the WireGuard VPN turns Block apps off. Both cannot run together.
- Native files changed: `FirewallService.java` (new), `VpnPlugin.java` (fwState, fwSetRules, fwEnable), `VpnCore.java` (stops the firewall before the VPN connects), `scripts/patch-android.sh` (copies the service and adds it to the manifest). Web: `js/vpn.js`, `js/tools.js` (back button), `css/style.css`.
- Not compiled or run on a device, by request.

## V0.33.0

- **Conduint Passwords, a Bitwarden-style password manager.** Own app inside Conduint: open it from Tools > Passwords, Settings > Passwords, or place it in the panel with Arrange. Own vault (`js/pm.js`, IndexedDB `conduint-pm`), own master password, own fingerprint key. It reads nothing from the Authenticator.
- **Vault.** Logins, secure notes, cards, identities and SSH keys. Search, filters (favorites, type, attachments, folders, trash), favorites, folders, clone, move, 30-day trash. Item view with show/copy per field, live one-time password with countdown, website open, custom fields, attachments (encrypted in 4 MB pieces, up to 256 MB) and password history.
- **Editor.** All types, many websites per login, one-time password key (base32 or otpauth://), custom fields (text, hidden, checkbox), attachments, per-item master password re-prompt, strength bar, discard warning.
- **Reports.** Reused, weak, unsecure (http), no one-time password, empty, plus an optional breach check (only the first 5 characters of the SHA-1 hash leave the phone).
- **Settings.** Auto-lock, clipboard wipe, fingerprint, change master password, folders, website icons switch (off by default), Erase vault.
- **Import / export.** Bitwarden .json and .zip, Chrome / Edge / LastPass .csv, Conduint encrypted backup (.cndpm), one-time Import from Authenticator. Export encrypted backup, Bitwarden .json, .zip with attachments, .csv (the last three are NOT encrypted and ask first).
- **Passkeys & autofill** screen and a Share-with-autofill switch (logins with a website address only). Turning it on switches the old Authenticator share flag off so the two never overwrite each other.
- **Password Generator: skipped in this build, by request.** `pm.js` still holds the generator functions and `js/pmwords.js` the word list, but neither the screen nor the Generator tab is shown and `pmwords.js` is not loaded.
- Not run on a device and not tested in this build, by request.

## V0.32.1

- **VPN > DNS and filtering.** Pick the DNS the VPN uses: Server default, Cloudflare, Cloudflare malware (1.1.1.2), Cloudflare malware + adult (1.1.1.3), AdGuard ads + trackers, AdGuard + adult, Quad9 malware, or your own addresses. It replaces the DNS line of the config when the VPN connects (reconnect to apply). This blocks malware, adult sites, ads and trackers for every app while the VPN is on.
- **Browser > Settings > Blocking.** Separate switches for **ads**, **trackers**, **adult**, **gambling** and **shopping**, plus **Your own blocked sites**. Ads and trackers are cut out of pages; adult, gambling, shopping and your own list block the whole page and show a Blocked by Conduint screen. Lists are in `js/blocklists.js` (includes South African betting and shops). Ads and trackers are on by default, the categories are off.
- **Malware and phishing** are done by DNS (above), not by a list in the browser, because an offline list goes stale.
- Public DNS has no gambling or shopping filter, so those two work in the Conduint Browser only.
- Native files changed: `VpnCore.java`, `BrowserPlugin.java`. Not compiled or run on a device.

## V0.32.0

- **The Authenticator is only an Authenticator.** It now shows 2FA codes and nothing else. Passwords, notes, SSH/API keys, backup codes, recovery keys and cards are no longer shown, the Entry type picker is gone, and the profile view, Extract from pasted text and Passkeys & autofill are off the Authenticator menu. Nothing was deleted: anything you saved earlier stays in storage and in backups, ready for the separate password manager. Files from other apps only bring in their 2FA codes.
- **Setup key saved and visible.** Three-dot menu on a code: **Show setup key**, **Copy setup key**, **Copy setup link (otpauth)**.
- **Check link.** In Add/Edit, tap **Check** next to Platform link: it cleans the address to the site, tests it, sets the platform logo and fills the Platform name if it is empty. Works offline too (the logo loads when you are online).
- **Names.** Fields are now Platform name, Your name, Account name (email has its own field). The card shows them neatly: platform, your name, account, email.
- **Export and import the keys.** Menu: **Export setup keys, readable (.json)** (platform, names, email, link, key, digits, period, algorithm, otpauth link) and **Export setup keys as links (.txt)**. Both are NOT encrypted and ask you to confirm first. **Restore or import from file** reads both back, keeping the logo link, names, email and group. The encrypted backup and CSV exports still work as before.
- Not run on a device and not tested in this build, by request.

## V0.31.4

- **Gallery no longer squashed / truncated.** Same cause as the V0.14.1 folder fix: Gallery tiles have `overflow:hidden` and the Gallery grid had no row rule, so the grid split the visible height between all rows and every tile got clipped (in the test, 120 pictures were crushed into one screen with no scrolling). Rows now size to their tallest tile (`grid-auto-rows:max-content`), so thumbnails keep their square frame and the Gallery scrolls normally. Tiny, Grid, Cards and List all checked.
- CSS only (`css/style.css`, one rule block at the end). Tests: `tests/v0314.py` (fails without the rule, passes with it). Not run on a device.

## V0.31.3

- **Scan from the file manager.** The selection bar has a new **Scan** button: select files and folders (or tap All), tap Scan, and Shield checks every file, going through folders (up to 1500 files, 8 levels deep). A summary shows how many were scanned and lists anything dangerous or worth a look. Long-press any file or folder: **Scan with Shield** is on the first panel.
- **Scan a folder (Tools > Shield) works again.** It handed Android the bare folder address, which cannot be listed, so it found nothing and did nothing. It now lists from the folder's document address.
- **Next server no longer drops the VPN.** WireGuard stops its Android service while switching, and Android destroys that service a moment later, which could tear down the new tunnel as well. A switch now brings the old tunnel down, waits, brings the new one up, checks it is still up and retries up to 3 times. If every try fails the previous server is put back. The VPN screen no longer redraws in the middle of a switch.
- **Downloads show the real reason.** Android only says "Download unsuccessful". Browser > Downloads now shows why (for example HTTP 403, the site refused, which many sites do to VPN addresses; no network; connection broke). Downloads also send the page address as Referer and are allowed over metered and roaming networks.
- **VPN > Test connection**: three quick checks (tunnel carries traffic, name lookup works, IPv6) with a plain-language result.
- Native files changed: `VpnCore.java`, `BrowserPlugin.java`. Tests: `tests/v0313.py`.

## V0.31.2

- **Home browser widget is now a normal compact browser widget**: search bar with a tabs button (tap to resume), four site tiles (bookmarks, then most visited) and Bookmarks / History / Private. No lists, so it stays small above "Strategy over impulse".
- **Home fits the screen**: when the Home cards are taller than the phone they are scaled down evenly so nothing scrolls (never below 55%; on a very short screen Home scrolls as before).
- **Gallery selection bar no longer cuts off** Done and Delete: it is never wider than the screen, nothing scrolls sideways, and the action buttons wrap to a second row when there are many.
- Tests: `tests/v0312.py`.

## V0.31.1

- **Every entry keeps and shows its own link.** In a profile each login and 2FA code shows the link it came from, or "No link (app login?)". A new **Links and sources** section lists every distinct link the account holds with how many entries use it (tap to copy). **All details as text** now includes a `Link:` line per entry. Grouping on screen only; nothing is merged or deleted.
- Tests: `tests/v0310.py` extended.

## V0.31.0

- **Account profiles** (Authenticator): the list now shows one row per account, not one row per password, code and note. Tap an account to see everything in one place: logins, 2FA code (live), backup codes, recovery keys, cards and PINs, passphrases, API keys, SSH keys and notes. Nothing in storage was changed, so backups, CSV export and older builds still work. Switch back with Menu > **All entries (classic list)**, and forward again with **Profiles view**.
- **Tap to copy the secret, not the email**: tapping a login copies its password, a 2FA row copies the code, a backup code, PIN, key or note copies that item. The username has its own small **User** button. The account list also has a copy-password button on each row.
- **All details as text**: every profile ends with a text field holding the whole account (site, username, password, setup key, codes, keys, notes). **Copy all details** or **Select all** to paste it elsewhere.
- **Original imported text**: when an import split a note into pieces, the untouched original is kept and shown at the bottom of the profile, so nothing the notes carried can be lost.
- **Cards and PINs** (new entry type, 💳): the importer now finds card numbers (checked with the Luhn test), CVC/CVV, expiry, cardholder, and PIN/PUK lines, in Bitwarden cards and in free text, and saves each as its own copyable item. Anything it cannot place stays in the note.
- **Clean up** (Menu > Clean up and find duplicates): shows "N entries = M accounts", removes exact duplicates (same platform, type, username and secret; first copy kept, asks first), and lists platforms with several logins or 2FA codes, passwords reused on different platforms, accounts with no site link and 2FA-only accounts.
- **Rename / site** on a profile sets the platform name and link on all its entries; entries sharing a name or site join one profile.
- New file `www/js/aprofile.js`. Tests: `tests/v0310.py`.

## V0.30.0

- **Browser widget** on Home, above "Strategy over impulse": address bar, Jump back in, Top sites (bookmarks, then most visited), Bookmarks / History / Private.
- **Browser is now a placeable item**: long-press the Browser pill, then "Move to left panel", or use Arrange. It still starts on Home.
- **Silver lining** on every Home widget, the player and the pills, plus a fine frame round the screen.
- **Your music header**: "Syncing…" is no longer cut off; Sync folder and Console share their own line.
- **Status pill** on the right of the "Loading your songs…" line: song count (or matches while searching), or the current time when no songs are loaded.

## V0.29.2
- **Back no longer closes Conduint.** Back goes back inside the app as before (closes sheets, goes up a folder). At the very first screen it now sends Conduint to the background, the same as Home, instead of closing it with "Press back again to exit". The app comes back exactly as you left it. New native method `Tools.toBack`.
- Tests: `tests/v0292.py`.

## V0.29.1
- **Tap a zip** now asks: Browse inside (walk through it), Extract here, or Extract to folder, plus Details.
- **Long-press a zip**: Browse ZIP contents, Extract here and Extract to folder are on the first panel. **Select** and **Details** are on the first panel for every file and folder.
- **Details** is much fuller: name, type, size, modified date and time with age, location, Android path, hidden/pinned status and what Android allows. Folders add item count (files, folders, hidden), file-type mix, newest/oldest/biggest inside, and the full size of everything inside. A .zip adds entries, packed/unpacked size, dates, compression, **encryption (AES-128/192/256, old ZipCrypto, or none)**, ZIP64, comment, risky `../` paths, duplicate names, the system that made it and the SHA-256. Zips over 256 MB are not scanned.
- New file `www/js/details.js`. Tests: `tests/v0291.py`.

## V0.29.1
- **Tap a zip**: it now asks: Browse inside (walk through it), Extract here, or Extract to folder, plus Details.
- **Long-press a zip**: Browse ZIP contents, Extract here and Extract to folder are on the first panel, not hidden under Features.
- **Select** and **Details** are on the first panel for every file and folder.
- **Details sheet** (new): name, type, full date and time with age, size in bytes, location, Android path, hidden or pinned status and what Android allows. Folders add the item count (files, subfolders, hidden, kinds), newest and oldest inside, biggest file, and the size of everything inside. A .zip adds its own scan: entries, unpacked and packed size, saving, compression methods, whether it is encrypted and how (AES-128, AES-192, AES-256, old ZipCrypto or PKWARE strong), made-on system, ZIP64, comment, duplicate names, risky `../` paths, and the SHA-256 of the file. Zips over 256 MB are not scanned. Nothing is changed or uploaded.
- Tests: `tests/v0291.py`.

## V0.29.0
- **Passkeys & autofill** (Authenticator menu > Passkeys & autofill): Conduint can be a passkey provider (Android 14+) and an autofill service (Android 8+). The screen shows whether each is switched on, has the buttons that open Android's own settings pages (Passwords, passkeys & accounts, and the Autofill service picker), and lists the passkeys kept on the phone with Delete.
- **Share saved passwords with autofill**: a switch, off by default. When on, every save in the Authenticator sends the Password entries (not 2FA codes, notes or keys) to an encrypted copy in the Android Keystore. Autofill only fills one in after the fingerprint or screen lock. The copy is not covered by the Authenticator master lock, and turning the switch off erases it.
- `scripts/patch-android.sh` now copies the new native files, adds the passkey service, autofill service and two screens to the manifest, adds `androidx.credentials` (override with `CONDUINT_CRED_VERSION`), and installs the trusted-browser list and the autofill resources.
- Not tested on a real phone: the native side needs a build and a try on the device (Android 14 for passkeys).
- Tests: `tests/v0290.py`.

## V0.28.6

- Authenticator CSV export, always encrypted. Menu (three dots) > **Export CSV, password (AES)** or **Export CSV, no password (this phone)**. The CSV (Bitwarden column layout: folder, type, name, notes, login_uri, login_username, login_password, login_totp) is sealed with AES-256-GCM before it is written; no plain CSV is ever saved.
  - Password: PBKDF2-SHA256 (310,000 rounds) from a passphrase you choose (8+ characters, typed twice). Opens in Conduint on any phone with that passphrase.
  - No password: sealed with the non-extractable key that already protects your accounts on this phone. Nothing to type, but only Conduint on this phone can open it; clearing app data or uninstalling makes the file unrecoverable. The app says so before exporting.
  - Restore: Menu > **Restore or import from file** reads both kinds (asks for the passphrase when needed) and imports through the normal CSV importer. 2FA codes keep digits, period and algorithm; passwords keep folder and notes; backup codes, recovery keys, SSH keys and notes go in as notes that the importer sorts back out.
  - Honest limit: the encrypted file is not a CSV that other apps can open. To move accounts to another app, that app needs a plain export, which Conduint does not write.
- Authenticator **list view**: compact one-line rows (logo, name, live code and seconds, a thin timer bar), many per screen. New button in the top bar and a menu entry switch between List and Card view; list is the default. Tap copies, long-press selects, the three dots open the same menu as before.
- Passkeys and default password manager: not in this version. See the note in the V0.28.6 chat: it needs an Android 14+ Credential Provider service and an autofill service, a native build that has to be compiled and tested on the phone.
- Tests: `tests/v0286.py`.

## V0.28.5

- Wi-Fi check (Tools > Wi-Fi check): one tap looks at the network you are on. Security type (open and WEP are flagged high; WPA, WPA2, WPA3 pass), captive portal (Android's flag plus an HTTPS test page that must answer 204 untouched, a bad certificate on it is flagged high), and DNS tampering (a made-up .invalid name must not resolve, one.one.one.one and dns.google must give their fixed addresses, public sites must not come back with private or blank addresses). Also shows whether Private DNS is on and which DNS servers are in use.
- Privacy: the network name, BSSID and your own address are never read, so no location permission is needed. Only ACCESS_WIFI_STATE (a normal permission) is added by scripts/patch-android.sh. Nothing is stored or uploaded.
- Status: wifi.js analysis tested in the browser against a mock phone. WifiPlugin.java (new) is not compiled or run on a device yet. Security type needs Android 12 or newer; older phones report unknown. With a VPN on, the sign-in and DNS tests run through the tunnel.

## V0.28.4

- Scan on open: tapping a file lets Shield check it first. A dangerous file asks (Open anyway); medium findings go to Recent and the file opens; a clean result is remembered per file. Files over 25 MB get a name check only. Switch: Settings > Shield > Scan a file when you open it (on by default). Any error or a scan over 8 s lets the file open.

## V0.28.3

- Pull down to refresh: the scanner light now drops from the top edge vertically instead of sweeping in from the left.

## V0.28.2
- **Largest folders.** Tools > **Largest folders**: one level at a time, every sub-folder with its full size and a bar, biggest first, plus the files that sit directly in that folder. Tap a folder to look inside it; Back goes up from the kept answer (no new measuring); **Measure again** refreshes the level. Cancel works while it measures.
  - Native `Tools.folderSizes({path})` (real paths, needs All files access, only paths under `/storage`). Sizes include hidden files; Android hides other apps' folders under `Android/data`, so those can show as empty (the screen says so). With an SD card there is a first step to pick the storage. New file `www/js/bigdirs.js`.
- **Shield badge on the notification.** A white shield icon (`native/res/drawable/ic_stat_shield.xml`, copied by `patch-android.sh` with the rest of `native/res`) tinted **hot pink** (#FF005F) for a dangerous file and **cyan** (#00E5FF) for a finished scan. If the icon is missing, the notification falls back to Android's own icon.
  - Written without a phone: check the colours on the real status bar and notification shade.
- Tests: `tests/v0280.py` now has 44 checks (Largest folders: order, drill down, Back without re-measuring, Measure again, refused folder).

## V0.28.1
- **VPN key icon in the top bar.** A green key appears next to Search while the VPN is connected; tap it to open the VPN screen. It checks every 5 seconds while Conduint is on screen and right after you come back to the app, and hides itself if the VPN status cannot be read. Android also shows its own key in the status bar.
  - Tests: 7 more checks in `tests/v0280.py` (hidden when off, shown on UP, names the server, tap opens VPN, a failing status call hides it).

## V0.28.0
- **Shield notifications.** Android now tells you what Shield did, also while Conduint is in the background. Two switches in Settings > Shield and on the Shield screen: **Scan finished** and **Dangerous file**.
  - A scan from Tools > Shield sends one notification: the quiet one (`Shield scan finished`, count of files scanned) when nothing dangerous was found, or the loud one (`Shield found a dangerous file`, the file and the rule, then the count) when something was. Copying or moving files through Shield sends `Shield stopped N files` with the names and the rules. Tapping any of them opens Conduint.
  - Two Android channels (`Shield scan finished`, `Shield blocked a file`), so each can be silenced on its own in Android's notification settings. Native method `Watch.note`; it answers `shown:false` when Android has notifications off, and the Shield screen then shows **Allow notifications**.
  - The routine check when you paste files (clean result) does not notify, so a normal copy stays quiet.
- **Permissions: buttons that did nothing.** After Android's dialog was refused twice it never shows again, so **Allow** on Notifications or Photos, videos and music did nothing. Conduint now remembers that it asked and, in that case, opens the Android settings page for the app instead (`Tools.request`). The Permissions list also names what is still off, in Settings > Permissions and on the sheet. The sheet and the "ask when the app opens" switch were already there; nothing new is asked at start.
  - Honest limit: this was written without a phone. If Conduint is still missing from Android's own Permissions list, it is not a missing setting in the app. Check Android Settings > Apps > Conduint Files > Permissions and Special app access > All files access, and tell me what you see.
- **Folder size.** Long-press a folder > Features > **Size**. A background count (`Saf.dirSize`) with the progress overlay and Cancel: total size, files, subfolders and how long it took. Folders Android refuses to open are counted as skipped and the answer says the real size is larger. Sort by Size for files already existed; it does not measure folders (that would count every folder on every screen).
- **Text editor:** it was already built in V0.19.x (Edit in the reader menu or long-press > Edit); the roadmap box was out of date and is now ticked.
- Tests: `tests/v0280.py` added. `tests/v0270.py` no longer pins version V0.27.0. The native methods (`Saf.dirSize`, `Watch.note`, `Tools.request` change) were written without a device or the Android SDK here; build it and test on the phone.

## V0.27.0
- **Cloud logos and account emails.** A connected cloud (Drive, OneDrive, Dropbox) shows the cloud app's own logo in the side panel and the Arrange list, with the account email under the name. Long-press the cloud > **Account email…** to type or change it, **Refresh logo** to read the logo again. Right after you connect a cloud that gives no email, it asks once (you can leave it empty).
  - Honest limit: Conduint holds no cloud logins (it uses Android's document providers), so it cannot read your account from Google, Microsoft or Dropbox. The logo is always right (it is the installed app's icon). The email is filled in only when the provider puts it in the folder's own address; otherwise it is the label you type. A typed email is never overwritten.
  - Native `Saf.providerInfo` returns the provider app's name, icon (PNG data URL) and any email found. Stored on the storage as `logo`, `prov`, `email`.
- **Keep running in the background.** Settings > Power > **Keep running** starts a foreground service (`KeepService.java`) with one quiet notification, and asks for the battery exemption and notification permission if they are off. **Check watched folders every** 1, 5, 15, 30 or 60 min. The service also starts by itself while a folder watch is on. Swiping Conduint away from recent apps stops it (the part that does the checking is gone then).
  - `MainActivity` keeps the web view running while the service is on, also with the screen off.
- **Folder watcher.** Home three-dot menu or Settings > **Folder watcher…** > Watch a folder: pick the folder to watch and the folder to upload to. Files already there never ask. When something new or changed shows up, a notification asks **Upload** or **Deny**:
  - **Upload** copies those files to the destination (a changed file replaces the older copy there; nothing is ever deleted). **Deny** marks them as seen, so nothing piles up, and they ask again only if they change again.
  - Files changed in the last 20 seconds wait for the next check (still being written). The same change does not ask twice. If you tap a button while Conduint is closed, the answer is kept and carried out the next time Conduint runs.
  - The screen also lists Upload / Deny, Check now, Pause / Resume and Remove for each watch. The snapshot of each watch lives in its own localStorage key `conduint.watch.<id>`.
  - Phone folders and cloud folders are both checked by listing them every interval (cloud folders use a little data). Large folders: the walk stops at 8000 files, like Sync Storage.
  - New files: `www/js/watch.js`, `native/WatchPlugin.java`, `native/KeepService.java`, `native/WatchReceiver.java`; `scripts/patch-android.sh` registers the service and receiver. Written without a device or the Android SDK: build it and test on the phone (add a watch on a small folder, drop a file in, answer from the notification).
- Tests: `tests/v0270.py` added (logo, email, keep running, baseline, upload, deny, answers from the notification, settings). `tests/v0250.py` no longer pins version V0.25.0.
## V0.26.2
- **Sync Storage (two-way).** Home three-dot menu > Sync Storage. Pick two folders (any connected storage, or another folder) and Conduint keeps them the same both ways, for example an Obsidian vault on the phone and in OneDrive, or Termux scripts on the phone and in the cloud.
  - Never deletes. A file on one side only is copied to the other. A file changed on one side overwrites the other. Changed on both sides: the newer wins and the older is kept next to it as `name (older copy).ext`.
  - It remembers each file as it was at the last sync, so a copy is not mistaken for a change. Files over 32 MB are skipped; `.git` and `.trash` folders are skipped.
  - Manual for now (Sync now / Sync all now). New native method `copyOver` in `SafPlugin.java`; engine in `www/js/syncstore.js`. Written without a device or the Android SDK: build it and test on a small folder first.
  - Renamed the entry to Connect Storage, and Termux home folder added to it.
## V0.26.1
- **Select is on the first long-press panel.** Long-press a file or folder: Open, Select, Copy, Cut... (it no longer hides under Features).
- **One name for outside storage: Connect Storage.** The + menu and Home's Add a folder now open the same entry. It asks: A folder (phone, OneDrive, Dropbox), SD card or USB drive, Termux home folder, or Files only (Google Drive). The four old entries (External storage, Cloud storage, Termux, Folder) did the same job and are gone.
- **Upload Files / Folders** replaces Add files here. Choose Files from an app (default), Files (Android picker) (OneDrive, Dropbox, Drive: the app shows all its own folders), or A whole folder.
- **Fixed: upload needed 3 tries.** Cloud apps often answer empty the first time Conduint asked about a picked file, and it was dropped silently. Native `stat` now asks twice, then falls back to name and size only, and a pick that cannot be read says so instead of doing nothing. Written without a device or the Android SDK: build it and test on the phone.
- The words live in `LBL_IMPORT` and `LBL_UPLOAD` at the top of `storage.js`.

## V0.26.0
- **Shield (phase 4): built-in WireGuard VPN.** Tools > VPN. Native `VpnPlugin`, `VpnCore`, `VpnKeeper`, `VpnRotateReceiver`; profiles encrypted on the phone, background service, server rotation.

## V0.25.0
- **Shield (phase 3): APK inspector.** Reads an APK without installing it and shows what it asks for and who signed it. Native `ToolsPlugin.inspectApk` returns the package, name, version, SDK levels, requested permissions, the permissions that guard its services and receivers (accessibility, notification listener, device admin, VPN), every signing certificate (SHA-256 fingerprint, subject, validity, algorithm) and whether an app with the same package id is installed and signed by the same key. The judging is in `www/js/apkinspect.js`, with the rules in `shield-rules.json > "apk"` (permissions, risky combinations, fake app names, known-bad signing keys), so they update with the Update button.
  - **Tools > Shield > Inspect an APK…** Pick a .apk and get a report: verdict, what Shield found, who signed it (tap the fingerprint to copy), and every permission with the risky ones first.
  - **Before Install app.** Every install is checked first. Only a dangerous finding stops to ask (Install anyway / Cancel); everything is noted in Recent. If the inspection fails the install carries on. Shield off skips it.
  - **On copy and move.** An .apk is inspected too. It is flagged in Recent, not blocked, except for a signing key listed in `apk.certs`.
  - **What it flags:** reading or intercepting texts, accessibility service, notification listener, device admin, call log, drawing over other apps, installing other apps, all-files access; combinations such as texts + internet, accessibility + overlay; an app that calls itself WhatsApp, Chrome, PayPal and so on but has another package id; a debug key or debuggable build; no readable signature; same package id as an installed app but a different signing key (not a genuine update); old target SDK with risky permissions.
  - **Not a malware scan.** It shows what an app asks for and flags patterns real malware uses. Many honest apps ask for some of these.
  - **Fixed: Shield styles.** V0.23.0 and V0.24.0 had no CSS for the scan beam, the pill, the Shield cards or the Recent list. They are in `style.css` now.
  - **Rules:** the built-in file is now version 2 and carries the `apk` section. A rules copy you saved earlier without an `apk` section still works: Shield uses a small built-in list for the APK checks until you Update to a version 2 file. Recent shows Warned for an inspected or install-checked app, Blocked only for a copy that was stopped.
  - Tests: `tests/v0250.py` (53 checks). The native method was written without a device or the Android SDK here; build it and test on the phone.
  - Still to come: Android system notifications when Shield blocks a file.

## V0.24.0
- **Shield (phase 2): the Update button.** Settings > Shield has a Rules link field (https only) and an Update rules button; the same button is on the Shield screen.
  - Downloads the newest `shield-rules.json` from your link, checks it (JSON shape, version number, every pattern compiles, hashes are SHA-256, 2 MB limit, 15 s timeout), then saves it as the rules copy that wins over the bundled file. An older version never replaces a newer one. A bad download changes nothing.
  - Use built-in drops the saved copy and goes back to the rules inside the app. The Shield screen shows when and from where the rules were last updated.
  - Native app reads the link through Capacitor's HTTP plugin (no CORS limits); the browser build falls back to fetch.
  - Still to come: Android system notifications when Shield blocks a file.

## V0.23.0
- **Shield (phase 1).** A small offline file check, not a full antivirus. Tools > Shield, and it can be placed in the left panel or on Home like any other item.
  - **Checks:** a file whose content is not what its name says (a program named .pdf), double extensions like `invoice.pdf.apk`, hidden reversing characters in names, damaged JPEG / PNG / PDF / ZIP files, zip path traversal and zip bombs, dangerous script patterns (hidden base64 commands, `rm -rf` on your storage, reverse shells, miners, `curl | sh`, Termux commands that read SMS or contacts), and known-bad SHA-256 hashes.
  - **On copy and move:** every file is scanned first, with a sweeping beam and a pill showing the file being scanned. A dangerous file is skipped and a message says why; a damaged or suspicious one is flagged in Recent. If the scan itself fails, the copy carries on.
  - **Data lives in `www/shield-rules.json`**, separate from the engine in `www/js/shield.js`, so the rules can be improved without touching code.
  - **Test it safely:** Shield > Make a test file saves the harmless EICAR antivirus test file. Copy it and Shield stops it.
  - Limits: files over 64 MB are checked by name only; folders are scanned when you use Scan a folder, not when you paste one. Android system notifications and the update button come in later phases.

## V0.22.3
- **Pinned 2FA codes on Home.** Authenticator three-dot card menu on a 2FA account: Pin to Home (up to 3). A card under the four folders shows each live code with a countdown bar; tap a code to copy it. Tap the card title to open the Authenticator. Honours Hide codes (tap reveals for 10 s and copies) and the master lock (shows Locked, tap to unlock). The card is hidden when nothing is pinned. A pin is a `pin:1` flag on the account, so backups carry it.

## V0.22.2
- **Authenticator in the left panel.** Authenticator is now an item you can place like Tools or Zipliner: Settings > arrange, move it to the left panel (the panel holds 11, so move one out first if it is full) or leave it on Home. One tap opens the Authenticator directly.

## V0.22.1
- **Authenticator: Extract from pasted text.** Three-dot menu. Title field, a text box and Extract. Uses the same extractor as file import and shows the same summary before anything is added.
- **Authenticator: empty groups.** New group now stays even if you pick no accounts. Empty group names live in their own small key on the phone and travel in encrypted backups as `groups` (backup version stays 1; older builds ignore it and restore the accounts only). Rename and delete work on empty groups too.
- Tests: `tests/v0220.py` added (groups, items, sorting, import, paste, backup round trip). `tests/v0210.py` no longer pins version V0.21.0.

## V0.22.0
- **Authenticator: groups.** Put many accounts in one group. Chips under the search box filter by group; tap the active chip to rename, add accounts or delete the group (accounts stay). Menu (three dots): Select accounts, New group, Group same platform (auto-groups ungrouped accounts that share a name), Sort A to Z. Long-press a card to start selecting. The group is a name stored on each account, so backups carry it.
- **Authenticator: secrets with individual items.** Backup codes, Recovery keys (new type), SSH keys, API keys, Notes and Passphrases are now containers. Tap one to open its items: add, edit, delete, copy each one on its own; backup codes can be crossed off; Add many pastes a whole list at once. Older entries convert on first open.
- **A to Z.** The list and every item list sort A to Z by default (Sort A to Z in the menu or the A-Z chip switches to added order).
- **Import / extractor.** CSV import keeps every column: known columns map to fields, unknown ones become note lines, folders and groupings become groups. Backup codes, recovery keys (BitLocker, Apple style, labelled keys and seed phrases) and SSH keys (OpenSSH, PEM, PGP, public keys) inside notes or any field are pulled out into their own Backup Codes, Recovery Key and SSH Key entries; the rest of the text stays as the note. Files with no recognised columns are scanned as plain text. Bitwarden JSON keeps folders, custom fields, cards and identities. Not run on a device.

## V0.21.0
- **Gallery upgrade.** Everything below is in the Home Gallery. Tested in a headless browser against the mock phone (`python3 tests/v0210.py`, 85 checks); not run on a device.
  - **Date groups:** none, day, month or year, with a count on each header. In select mode, tap a header to pick the whole group.
  - **Favourites:** heart on tiles, a Favourites tab, a heart button in the photo viewer that stays in step with the Gallery.
  - **Albums are folders:** New album tile, album menu (open, select all, move all, rename album, delete empty album). Same-named folders on different storages stay apart.
  - **Selection bar:** Favourite, Category, Move, Copy, Rename (one picture), Crop (one picture), Share, More (Information, Remove location), Delete. Move and Copy open an album picker that also works from the viewer (More: Rename, Move to album, Copy to album, Crop and rotate).
  - **Nothing gets lost:** rename, move, album rename and delete all update favourites, categories, the scan list and the open viewer. A copy is a new picture (favourites and categories stay with the original). Delete now works for direct file paths too (through the Tools bin).
  - **Gallery settings (gear):** group by, layout, picture size (columns), fill or whole picture, file names, hearts, keep location when cropping, saved originals, rescan, reset.
  - **Originals tab:** lists `.conduint-originals` on every storage. Restore puts the original back and keeps the version it replaced, so Restore can be undone; if the picture is gone it is written back to its folder. Delete one or all. Backups now also work for direct file paths (before, only mounted storages kept one) and remember where each came from.
  - **Crop and rotate (new gcrop.js):** aspect presets, 90 degree turns, flip, Straighten (+/-45, zoomed so no corner is empty), drag corners, edges or the box. Always saves a new copy (`name_edit.jpg`); the original is untouched. JPEG copies keep the EXIF (camera, date, GPS unless turned off), drop the old Orientation tag (pixels are upright) and rewrite the size tags.
  - Layers: crop editor 58, album picker 59, above the viewer (51) and Information sheet (56). Android back closes picker, then crop editor (asks first when there are unsaved edits).
- Merged with V0.20.5: layout-based preview sizes (Large size uses 384), Show more appends, in-place long-press, the Videos tab and More > Information / Remove location are all kept.

## V0.20.5
- **Gallery layouts: lighter and sharper.** Found by comparing the Gallery with how folders show pictures. I could not run it on a device, so these are the differences I found and fixed, not a reproduced crash:
  - **One database connection for previews.** Every tile that scrolled into view opened the preview database again (hundreds of times in Tiny, which shows about 80 tiles at once). It is now opened once and reused. This also speeds up folders.
  - **Previews read from the saved database are kept in memory** (the Gallery did not, so each scroll back re-read the database).
  - **Preview size follows the layout** like folders do: 256 px for Tiny, Grid and List, 384 px for Cards (was a fixed 160 px, which looked soft in Grid and Cards). These sizes match the folder view, so a picture already previewed there is not made twice.
  - **Show more adds the next 150 tiles** instead of redrawing every tile again.
  - **Long-press to select** marks the tile in place instead of rebuilding the whole grid.
- Checked: `node --check` on all JS. Not run on a device. If a layout still crashes, note which one and whether it happens on opening, scrolling, switching layouts or tapping Show more.

## V0.20.4
- **Weather moved to the left panel.** It sits under the storage, battery and RAM widgets, always expanded: today (temperature, condition, city, high/low, wind, humidity) and the next days. Tap it to change the city. It follows the Header widgets switch in Settings. On screens under 760px high the forecast row hides so the panel list never gets cut. The Home weather card and its arrow are gone.
- **Home fits the screen with no scrolling.** The bottom bar (Back, item count) is hidden on Home, spacing under the shortcuts and slogan is tighter, tiles and song covers are a little smaller, and the page no longer scrolls. Order stays: greeting, four folders, music player, Browser, then Strategy over impulse. Under 740px of screen height the page is allowed to scroll so no control is cut off.
- **Vault row** in the left panel now reads "AES-256 encrypted" (it was blank). The cipher is unchanged: AES-256-GCM, key wrapped with PBKDF2-SHA256 (250k rounds) and a Keystore secret.
- **Music seek slider** thumb is cyan on the Home player (was red).
- **Gallery > EXIF tool.** In select mode the bar has a new **More** button: **Information** (one picture) opens the EXIF sheet (read and edit, as in the photo viewer), and **Remove location…** strips the GPS position from every selected JPEG in one go. Each file gets the same safe write as the single-picture tool (rebuilt, re-read, decoded, original copied to `.conduint-originals` first); non-JPEG pictures are skipped and counted. XMP blocks are left as they are, as in the single tool.
- Checked: `node --check` on all JS, CSS braces balanced, every patch matched exactly once. **Nothing was run in a browser or on a device**; the Home height figures come from the CSS and a phone screenshot, so check Home on the phone first.

## V0.20.3
- **Fixed: APK build failing at `processDebugMainManifest` (manifest merger).** The V0.19.2 block in `scripts/patch-android.sh` declared `WRITE_EXTERNAL_STORAGE` (maxSdkVersion 28) and `READ_EXTERNAL_STORAGE` (maxSdkVersion 32) again, while the `conduint-permissions` block already declares them with different attributes. The merger rejects the same permission declared twice with different attributes. The V0.19.2 block now only adds its ZIP and HTML/PDF/DOCX intent filters.
- **Safety net:** the script ends with a pass that keeps only the first `<uses-permission>` per name, so a duplicate can never break the merge again. It is idempotent.
- Checked: `bash -n` on all scripts, `node --check` on all JS, the dedupe pass on sample manifest text. The patch script was not run end to end and no APK was built, so the next pipeline run is the real test.

## V0.20.2
- **Authenticator (Tools).** Two-step codes (TOTP, RFC 6238) as colour cards with a countdown ring, next-code preview, hide-codes mode, search, quick-pick platforms and a platform link that shows the logo when online. Secrets are AES-GCM encrypted on the phone. Not run on a device.
- **Fixed: ZIP browser.** It now reads zips through `SAF.cacheCopy`, no longer overrides `rdBytes` (which broke the reader), and extracts a single entry next to the zip with `SAF.writeFile`.

## V0.19.1
- **View and Sort are one panel in the top bar** (the view button): View (Grid, List, Details), Sort (Name, Type, Size, Last modified, Category), then tick boxes Ascending and Folders first. Compact and Dual pane show there only if switched on in Settings > Menu features. They are gone from the three-dot menu.
- **Three-dot menu cut to:** New ›, Add files here…, Select ›, Refresh, Show hidden items (tick box).
- **Long-press = Open, Copy, Cut, Rename, Delete, Pin to top (folders only), Hide, Features.** Features opens its own panel: Compress to ZIP, Folder colour (palette opens by itself), Encrypt (Move to Vault), Share to…, Open with…, Install app, Extract ›, Select, Details (then Delete forever). Details stays Details.
- **One Open with.** "Edit in another app" is gone (it was the same thing). Open with… lists every viewer and editor and grants write access so editors like Acode can save. `SafPlugin.openWith` is always a view intent now.
- **Share to…** is the Android share sheet (chat apps, cloud, Facebook...). There is no Send to: Copy and Paste already move things between locations.
- **Extract ›** on a .zip opens a choice: **Extract here** (new folder next to the archive) or **Extract to folder…** (pick any folder in the system picker, the files go into a new folder inside it).
- **Hidden items:** Hide is in the main list. Bring them back with the three dots > **Show hidden items** (tick box, per the view you are in) or pull down.
- **Songs play on the Home hub only.** No sheet and no bottom bar for music. Tap a song in any folder and it plays through the Home music hub (toast: Playing on Home). The hub's open-player button shows the full player (queue, lyrics, settings); Back hides it and the music keeps playing. Removed: the minimise bar, its buttons, its CSS and the "Open songs" setting.
- **Video keeps its own player** (rotate, maximise). It never starts the background notification and pauses when the app leaves the screen.
- Not done yet (next): video crop, snippets, video settings, audio extract and metadata hand-off to the Home hub, Gallery photo viewer.
- **Fixed (from V0.19.0):** Android Back threw an error when Arrange or the calendar had never been opened, which could stop Back from walking up folders.
- Tests: `tests/v0191.py` (menus, 411x860 and 360x740) and `tests/v0191music.py` (songs on the Home hub, video sheet) pass in headless Chromium, `tests/v0190.py` still passes. `tests/smoke.py` and `tests/features.py` were written before the panel opened at start and fail on their first click; they were not updated. Nothing was run on a device.

## V0.19.0
- **One place per item.** Every storage, library, tool, folder and the Vault now lives in exactly one place: the left panel, Home, or hidden. Moving an item removes it from the other place, so nothing repeats (Home no longer copies Internal storage, My documents, Downloads and Tools from the panel).
- **Left panel rebuilt.** One flat list, no section headings, no scrolling. It holds at most 11 items (see the math in the notes below); extra folders spill onto Home. The **Recycle bin** is the only fixed item, isolated at the very bottom. Tools and Settings are normal, removable rows now.
- **Everything is removable and re-orderable.** Long-press (or right-click) any row, on the panel or on Home: Move up, Move down, Move to Home / left panel, Hide. The **pencil** in the panel header opens **Arrange** (also in Settings > Layout and the Home three dots): the whole list, three groups (Left panel n/11, Home, Hidden), with up/down/Panel/Home/Hide. Hidden items stay connected. Settings cannot be hidden (it moves to Home instead) so you can never lock yourself out.
- **Vault is a normal row.** The glowing card is gone. It starts hidden (not advertised anywhere); place it where you want in Arrange. It is the same size as every other row and can be renamed (long-press > Rename). Still reachable from Settings > Conduit Vault > Open vault.
- **Home redesigned (S.O.I).** Order: greeting + date (the clock is gone) > Weather > the four permanent folders > Music player > bottom shortcuts > "Strategy over impulse".
- **Tap the date** and the calendar rises from the bottom (week/month switch and notes inside). The calendar card is no longer on Home.
- **Weather** has an arrow: today only, or today plus the forecast. **Music player** has an arrow: hides everything except the first box (what is playing).
- **Four permanent folders, same size:** Internal Storage (free space + bar), Documents (pdf, docx, md, pptx, html...; item count), Gallery (pictures + videos count), Music (song count; the old "Songs" is renamed Music). They are not in the left panel any more, so nothing repeats.
- **Gallery:** Videos is the first folder in it (opens the Videos view for now; albums, photo editor and the video player hook come next).
- **My documents is no longer primary:** it is a normal item you can place in the panel. Nothing is pinned on Home; pins stay inside Internal Storage.
- **Bottom of Home = shortcuts, never folders.** Browser, plus anything you set to Home in Arrange (Settings, Vault, Tools...). Folders can only live in the left panel.
- **Generic theme (tap Bojack's paw).** White, blue accent, yellow/orange folders; storage/RAM widgets keep their colours. Tap the paw again to return to your own theme. Home wallpapers stay on in Generic (like a desktop) with white glass cards. Also listed in Settings > Theme.
- **Apps (new left-panel item).** A scrollable grid of the apps you installed or updated (Google, Facebook...), not bare system apps. Small or bigger icons (button top right), search, tap to open. Native: `ToolsPlugin.userApps / appIcon / launchApp` (QUERY_ALL_PACKAGES is already in the manifest). In the browser preview it shows a note. Not run on a device: the three Java methods are the part to test on the phone.
- **Panel toolbox items.** Zipliner, Optimiser and Storage analyser are now placeable panel items (Android build), next to Tools, Recycle bin and your work folders. Place them in Arrange; the Recycle bin stays last. Not run on a device.
- **Menus cut to six.** Header ⋮: View ›, Sort ›, New ›, Add files here…, Select ›, Show hidden (cascades; the Recycle bin entry and its count are gone from it). Long-press: Open, Copy, Cut, Rename, Delete, More › (Select, Open with, Edit in another app, Compress, Share / send to (one entry, cloud is in the share sheet), Move to Vault, Pin, Folder colour (opens the palette by itself), Hide, Details, Delete forever). Compact and Dual pane only show in View if you turn them on in Settings > Menu features.
- **Pull down reveals hidden files, pull down again hides them** (only in a view that has hidden items; otherwise it just refreshes).
- Math: row = about 44 px with subtitle (about 34 px on screens under 760 px tall, subtitles then hide). Header 62 + widgets about 90 + Recycle bin 60 = about 210 px. 11 rows = 484 px, total about 700 px, which fits phones of about 760 px and taller; shorter screens use the compact rows.
- Checked in headless Chromium at 411x860 and 360x740 (`tests/v0190.py`). Not run on a device. In the browser preview there is no Tools or Recycle bin (native only), so the Android build is where those two rows show.

## V0.18.0
- **EXIF tool.** Photo viewer: More > Information. Reads EXIF from JPEG, PNG and WebP and shows it in grouped cards (Camera, Exposure, Date, Image, Location, Description, File) with a summary strip, an All fields list and Copy coordinates. JPEG pictures can be edited: Caption, Artist, Copyright, Date taken, Remove location, Remove all metadata (orientation is kept). `www/js/exif.js`
- **Safe write.** The new file is rebuilt in memory, re-read and decoded as a picture before anything is written, and the original is copied to `.conduint-originals` first. On a JPEG rewrite the MakerNote, the embedded EXIF thumbnail and the interoperability block are dropped on purpose. XMP and IPTC stay unless you choose Remove all metadata. 25 MB limit per picture.
- Information replaces the old Details dialog inside the viewer (one place, no duplicate). Android back closes the sheet first.
- Checked in headless Chromium (`tests/v0180.py`). Not run on a device: the native read/write path (`SAF.cacheCopy`, `SAF.writeUri`, `SAF.writeFile`) is the part to test on the phone.

## V0.15.1
- **Music Console.** A Console button sits next to Sync folder on Home; the Home music player is unchanged. It opens a maximised touch-screen TV: **Equaliser** on top (5 bands, presets Flat / Bass / Treble / Vocal / Rock / Pop / Jazz / Electronic, drag the sliders), **Playlists** below it (Create Playlist, expand a playlist, Play, Shuffle, + Songs, Rename, Delete, a Songs / Arrange tab), then the **Console**: power it on (green light), search your synced songs, tap to select, press **Compile**. Arrange closes the console and lets you move songs up, down or out. The TV has a visualiser edge light that follows the music. The overlay stays maximised until you press play, then it shrinks away and the Home player takes over. `www/js/console.js`
- The equaliser runs the player's audio through Web Audio filters, so it also shapes video sound. Playlists and EQ settings are saved with the Home data. Checked in headless Chromium (create, select, compile, arrange, presets); sound itself is not tested on a device.

## V0.15.0
- **Install apps.** Tapping an `.apk` (or Long-press > Install app) copies it to the app cache and hands it to Android's installer. First time, Android sends you to *Install unknown apps* to allow Conduint. `.apks` / `.xapk` bundles are not installed. `native/ToolsPlugin.java installApk`, `www/js/storage.js installApk`
- **Open with Conduint.** Documents, zips, 7z, installers, pictures, songs and videos from other apps now offer Conduint in Android's Open with list and route to the right viewer (reader, zip reader, photo viewer, player, installer). `scripts/patch-android.sh` adds the intent filters; `MainActivity` keeps the file, `ToolsPlugin.incoming()` hands it to `www/js/dash.js takeIncoming`
- **Pinned folders left the left panel.** The panel is the primary station again: Pinned is gone from it. Pins sit in a Pinned section at the top of Home and still sort first inside their own folder. Long-press a pin on Home to rename or unpin.
- **Browser frame.** A black frame (7 px) holds the page, so a white site never touches the sides. The native web view is laid inside the frame. `www/css/style.css`, `www/js/browser.js`
- **New tool: Hidden files finder.** Lists dot-files and dot-folders across storage, biggest first, nothing pre-selected. `ToolsPlugin.hiddenFiles`
- **Charging bolt.** A yellow pulsing bolt beside the Home clock while the phone charges (Battery API, with a native fallback).
- **Music on Home.** Opening Home while a song plays minimises the player so the Home music hub is the player.
- **Photo viewer.** Pictures open in their own viewer, not the media player: pinch, double-tap zoom, drag, swipe between pictures, rotate, slideshow, share, delete, details, open with, edit in another app. `www/js/photo.js`
- **Video player.** The media sheet is now only for video and songs. Video has a CONDUINT VIDEO PLAYER signature, no minimise button, plays in the pop-up, and Maximise turns it landscape. Back from full screen returns to the pop-up, back again closes.
- Zipliner still works on real file paths (Tools > Zipliner). Hooking it to every picked file would need a path resolver, so it was not added.
- Thumbnail code and layouts untouched. Not compiled or run on a device. JavaScript passes `node --check`; the Java was read against API 34.

## V0.14.2
- **Paste bar cancels itself.** After Paste finishes (copy or move, Termux included) the bar closes and a toast says what was pasted. The X still clears it any time. `www/js/ops.js`
- **New tools: Forgotten files and Fresh files.** Forgotten = over 1 MB and untouched for a year, biggest first, nothing pre-selected. Fresh = changed in the last 3 days, newest first. One native scan (`TOOLS.filesByAge`), same list, bin and delete flow as the other tools.
- **Browser home fits its frame.** New-tab page rebuilt: greeting and date, search pill, 4-column shortcut tiles (Google, YouTube, GitHub, Wikipedia, Reddit, X, Hacker News fill in until you have your own), no sideways overflow, dark gradient behind it. The page view's white default is gone (dark until the page paints), white edge-glow on overscroll is off, and the native view is clipped to the sheet frame.
- Not compiled or run on a device. JavaScript passes `node --check`; the Java was read against API 34.

## V0.14.1
- **Tile layout fixed.** Tiles drew over each other and thumbnails squashed into thin stripes in any folder longer than one screen (Images, Videos, Termux, Downloads). Cause: every tile had `overflow:hidden`, so the grid shared the visible height equally between all rows. Rows now size to their tallest tile, tiles in the same row stay the same height, and thumbnails keep their square frame (Details 4:3). Grid, Compact, Details and List all checked.
- Checked in headless Chromium at 411 px wide with 7 layouts (overlapping tiles: up to 102 before, 0 now). Not run on a device.

## V0.14.0
- **Music hub on Home is the player.** Screen (cover, title, seek), search, then controls (previous, play, next, open player, stop). No rainbow circle anywhere.
- **Player pops up half screen**, goes full screen with the maximise button, and has an extra minimise so you can browse. Swipe the header down/up or use Android back: full, half, minimised. Artwork is never cropped.
- **Minimised = built into the bottom panel**: same background as the Back bar, thin progress line, skip, maximise, stop and a small visualiser (animated, not audio-reactive). Hidden on Home because the hub already has the controls.
- **Home three dots**: Tools removed. Added **Storage analyser** and **Optimise Conduit** (asks Android to stop background apps, clears Conduint cache unless media is open, turns off Conduint wake lock, keep-screen-on and background effect).
- **Home folders**: long-press to Rename or Remove folder (with confirm). Fixed: cancelling Add a folder could later pull a left-panel folder onto Home.
- Settings: "Open songs: Half screen / Minimised". Ring and panel-side options removed.
- Test: `tests/v0140.py` (headless Chromium, passes). Not run on a device.

## V0.13.2
- **Scene toggle.** The picture button next to the clock now flips to the next wallpaper with one tap. No menu, no words.
- **Glowing wallpapers.** Every wallpaper has a slow drifting light and shadow gradient over it, like a glowing shadow in motion (off if Android reduce-motion is on).
- **Home folders are separate from the left panel.** Folders added with Add a folder on Home live only on Home; folders in the left panel never appear on Home, and pins no longer mirror onto Home.
- **Long-press a Home folder** to Rename or Delete from Home (deleting never touches your files).
- Folders you had on Home before this version stay in the left panel only; add them again on Home if you want them there.

## V0.13.1
- **Library layouts rebuilt.** Grid is 3 even columns on a phone (4 in Compact), Details is 2 larger columns, List has 52 px thumbnails. Square pictures fill the tile edge to edge, names always two lines, no cramping.
- **Sharper thumbnails.** Always rendered at 512 px (384 compact, 256 list) instead of guessing from a tile size.
- **Pinch-to-resize removed**, and the tile size slider with it. Sizes are fixed so every layout looks right.

## V0.13.0
- **Conduint Browser.** A globe button sits in the Home header, next to the wallpaper button. Tap it and a Chrome-style web sheet slides up from the bottom. Maximise it with the button top right of the sheet or by dragging the grab bar up; drag down to shrink, then hide. Tabs stay alive when hidden, and the globe shows how many are open.
- **Real pages.** Each tab is an Android WebView (`native/BrowserPlugin.java`) laid under the sheet's address bar. Chrome-style user agent, desktop-site switch, find in page, downloads to the Downloads folder, website file upload, full-screen video, pop-up blocker, ad and tracker blocker, error pages.
- **Menu.** Forward, bookmark, reload, share, New tab, Incognito, History, Downloads, Bookmarks, Extensions, Cookies, Find, Desktop site, Sign in, Settings.
- **Stays put.** History, bookmarks, downloads list, open tabs, settings and extensions are saved (`conduint.browser.v1`). Cookies are kept by Android and survive restarts.
- **Cookies.** Per-site viewer with delete, third-party switch, and Clear browsing data.
- **Extensions.** Four built in (dark pages, hide cookie banners, allow zoom, allow selection) plus your own: choose sites, add JavaScript and/or CSS. Chrome Web Store extensions cannot run in Android WebView.
- **Sign in.** A local profile, quick links to Google, Microsoft, GitHub, Apple, Facebook, X, Reddit and Amazon logins, and sites stay signed in through cookies. Google may refuse sign-in inside any app. No cloud sync.
- Incognito tabs save no history; Android shares cookies between all WebViews, so they are not cookie-isolated.
- Rebuild with `scripts/patch-android.sh` (copies BrowserPlugin, adds the permissions). Not compiled or run on a device; JavaScript passes `node --check`.

## V0.12.1
- Home: thin silver outline with a soft glow round every card, the search bar, song covers and calendar days.

## V0.12.0
- **Home calendar shows one week** (arrows move week by week, the chevron opens the whole month). Folders sit right under it.
- **Add a folder** on Home and in the side panel: Phone, Cloud folder, Cloud files, SD card / USB, **Termux**.
- **Home music player removed.** Music is now: **Sync folder** (asks which folder, loads in the background), a **search bar**, and cover thumbnails you scroll left to right. Typos still find songs (Juice WRLD). Tapping a cover plays it in the minimised bar.
- **Minimised player is a slim bottom bar**: cyan pulsing wave, a maximise button and a red stop button. It no longer pushes the files to the left.
- **Tools** tile next to Downloads on the Files desk.
- **Tiles are even**: equal row heights, names always two lines.
- **Work and Updates removed.** Grid/list/sort buttons hidden on Home.
- **Own background picture removed**; five wallpapers instead: Ocean, Desert, Companies, The Streets, The Sky (image button, top right of Home).
- Checked in headless Chromium at 360 px. Not run on a device.


## V0.11.2
- **Home screen fixed.** The dashboard styles were missing from `style.css`, so Home showed as bare text and a raw picture. Added the full dashboard CSS (header, Files desk, Music card, weather, calendar, work, updates, your space). `www/css/style.css`
- Home now shows on a cold start (`dash.js` loads after `ui.js`, so the first draw skipped it). The calendar also draws on first build. `www/js/dash.js`
- Rendered and checked in headless Chromium at 360 px wide. Not run on a device.

## V0.9.1
- **Bojack paw mark** beside the CONDUINT name, glowing in your accent colour.
- **Header widgets** under the name (Settings, Browsing: Header widgets): a **live storage ring** (free space, tap to open Tools), a **battery chip** and a **RAM chip**. Colours follow usage: green, amber, orange, red as storage and RAM fill, and the other way round for battery. `www/js/widgets.js`
- **Compact view** (three-dot menu or Settings), works in grid and list: thumbnail with the size, and for folders the number of items inside, counted only for tiles you scroll to. Normal view is untouched.
- **Dual pane** (three-dot menu or Settings): a second folder view under the first, with its own storage picker. Long-press items in pane 2, then Copy up or Move up into the top folder. In the top pane, select items and use To pane 2 or Move to 2. `www/js/pane2.js`
- **Quick filters** row above the file list: All, Images, Videos, Songs, Docs, Archives, Installers. Folders stay put so you can still walk around.
- **Pinch with two fingers** on the list to resize tiles live.
- Not run on a device. New test: `tests/v091.py`.

## V0.9.0
- **Thumbnails fill the whole tile**: pictures, video frames and document first pages run edge to edge, no white border, no inner frame. Tiles are bigger by default (128 px, slider 72 to 220 px). Videos get a small play badge, documents show their first page from the top.
- **Music artwork in the grid**: Songs now show album art (the picture inside the tags, then a picture beside the song such as cover.jpg or the song name .jpg). Songs without art get an accent-coloured music tile. Native: `Saf.thumb` kind `aud`.
- **More sorting**: Name, Size, Date modified, Type and Category, with Ascending / Descending (tap the active sort again to flip it). In the three-dot menu and in Settings.
- **Internal storage and Downloads connect for real**: with All files access the app opens `/storage/emulated/0`, the Download folder and SD cards by file path (the Material Files way), so the root and Download no longer get refused by Android's folder picker. Downloads is a new location. Long-press an old Internal storage entry, Open directly (All files access), to switch it over. New native method `Saf.roots`; every SafPlugin helper now works on file:// as well as document URIs.
- **Fixed two load-order bugs from V0.8.0**: `vault.js` clashed with `meta.js` (`td`) and with `effects.js` (`rnd`), which stopped scripts loading and broke the side panel and Settings.
- Not compiled or run on a device. JavaScript passes `node --check`; the Java was read against API 34 only. New test: `tests/v090.py`.

## V0.8.0
- **Opens with the left panel showing**, so every location is visible straight away.
- **Conduit Vault** sits at the top of the left panel in a glowing card. Private files, AES-256-GCM (Web Crypto). One random master key encrypts every file and file name; it is stored only wrapped by your passphrase (PBKDF2-SHA256, 250k rounds) and by a one-time recovery code. Forgetting both means the files are gone, by design. Optional extra lock before the vault opens: fingerprint or the app pattern (never a PIN). Auto-locks 2 minutes after you leave the app. `www/js/vault.js`
- **Move to Vault**: long-press a file (or select several, then Vault). The file is encrypted, then the original is deleted. **Add** (+ in the vault) copies from the system picker and leaves the originals. **Move out of vault** decrypts into the top folder of a storage you choose and erases it from the vault. Limit this version: `64 MB` per file.
- **Reader** for PDF, Markdown, PowerPoint (.pptx), Word (.docx), HTML (sandboxed, no scripts, with a source toggle), text, code, CSV, pictures, audio and video. Night, Sepia and Day themes, text size, serif or sans, tap to hide the bars, reading progress and a remembered position per file. PDFs render page by page through Android PdfRenderer with zoom and go-to-page; slides show as a swipe deck with an Outline view. Vault files open in the same reader without leaving the vault. `www/js/reader.js`
- New native methods in `SafPlugin`: `pdfInfo`, `pdfPage`, `cachePut`.
- **Strategy Over Impulse** appears in the side panel, lock screen, vault, reader footer and Settings.
- Not run on a device yet. All JavaScript passes `node --check`; the Java was only read against Android API 34, never compiled.

## V0.7.1
- **Background effects** (Settings, Appearance): Smoke, Bubbles, Rain drops, Waterfall (fast rain with mist) and Dog paws float behind the whole app in your accent colour. Strength Calm / Normal / Wild. Pauses while the app is hidden. `www/js/effects.js`. Not run on a device yet.

## V0.7.0
- **Previews instead of the plain icon**: first page of a PDF, cover of an EPUB, the embedded thumbnail of Word, Excel, PowerPoint and OpenDocument files, photos and video frames. Made natively (`Saf.thumb`, Android `PdfRenderer`), only for tiles you scroll to, saved on the phone so each file is rendered once. Cloud files get their own switch and a 30 MB limit (the cloud app downloads the file to make the preview). Settings, Browsing: Show previews, Previews for cloud files, Clear saved previews.
- Written without a device run: if a preview is blank or the build fails, send the log. Files without a usable preview keep the icon.

## V0.6.1
- Tests brought up to V0.6.0: mocks for Lock, Player and `writeFile`, plus the new `tests/features.py` (102 checks: Back bar, pins first, left-panel rename, pattern and fingerprint lock, LRC parser, ID3 / MP4 / FLAC readers, online lyrics and artwork lookup with the network stubbed, notification buttons). `smoke.py` (70 checks), `features.py` and `bare-bridge.py` all pass
- Java reviewed by reading against Android API 34 (nothing compiled yet, see Known risks). Fixes: notification is removed when the app is swiped away, stray notification buttons no longer leave an idle service, the web view is kept running while a song plays so the buttons work with the screen off
- `.gitlab-ci.yml` runs the three browser test files in a `browser-tests` job (allowed to fail, never blocks the APK)

## V0.6.0
- Back button along the bottom of the file view; rename pencil on every left panel entry (pinned folders rename on disk, storages and library names are labels)
- Pinned folders sit first in their folder
- Library: Documents, Images, Songs, Videos, Archives, Installers, with file counts (needs All files access)
- App lock: fingerprint or pattern, never a PIN (Settings, App lock)
- Permissions are asked the moment the app opens
- Player: minimise to a bar, keeps playing in the background with a notification, shows tags, artwork and synced lyrics (tags, then .lrc beside the song, then lrclib.net and iTunes online; found items saved next to the song)
- New cyan file on black icon and black splash: `python3 scripts/make-icons.py` regenerates, `patch-android.sh` installs
- New native files: LockPlugin, PlayerPlugin, MediaService; SafPlugin.writeFile


A file manager in black, white and cyan. The interface is one plain web app (HTML, CSS, JavaScript, no build step). A small native Android plugin does the real file work, and the whole thing is wrapped as an APK with Capacitor.

Status: **V0.8.0** (new + menu, SD card and folder picker fixes, cloud storage that saves, auto-detected Library, wake lock and battery optimiser, rename from the side panel). Browse, copy, cut, paste, rename, delete with a recycle bin, ZIP and unzip, pin folders, multi-select, share and open-with are written against the real Android file API and tested in a browser against a mock of it. **The APK has not been built or run on a phone yet.** Build it with the GitLab pipeline below and test on the device (checklist at the bottom).

## What works

| Feature | How it really works |
|---|---|
| Add storage | Android's folder picker (Storage Access Framework). Access is saved, so it survives restarts. |
| Copy, cut, paste | Streams bytes between folders, folders are copied recursively. Cut uses the provider's native move when it has one, otherwise copy then delete. Works across storages. |
| Rename, new folder, new text file | Direct provider calls. Pins and folder colours follow a folder you rename or move. |
| Delete + recycle bin | Delete moves the item into a hidden `.conduint-trash` folder at the root of the same storage. Restore puts it back where it came from (falls back to the storage root if that folder is gone). Delete forever and Empty bin remove for good. Turn the bin off in Settings. |
| ZIP | Select items, ZIP, pick a name and level (Store, Fast, Normal, Maximum). Folders and empty folders are kept. Cancel works mid-way and removes the half-written file. |
| Extract | Long-press a `.zip`, Extract here. Goes into a new folder next to it. Entries with `..` paths are skipped. |
| Pin folders | Long-press a folder, Pin to sidebar. Pins store folder names, so they survive renames and re-grants. |
| Open with | Sends the file to another app through Android's chooser. Text files go out as `text/plain` so Acode and other editors list themselves. Edit in another app asks for write access. |
| Share | Sends files to Drive, WhatsApp, mail and so on through the Android share sheet. Folders must be zipped first. |
| Library views | Documents, Images, Songs and Videos scan every connected storage natively (first 3000 files). |
| Player | Video, audio and images in a bottom sheet with maximize and rotate. The file is copied once into the app cache and played from there, then cleared when the player closes. |
| Back button | Closes the dialog, menu, player or selection first, then goes up one folder, then asks you to press back again to exit. |

## What is new in V0.5.0

- **+ menu**: External storage (SD card, USB), Cloud storage, Folder, then Internal storage and My documents. The last two leave the menu once added. Long-press a storage in the side panel to **Rename**, **Change directory** or remove it.
- **External storage** opens the SD card or USB drive directly in the picker when Android reports one.
- **Folder picker** checks that the folder can really be read before saving it, skips duplicates, and says why when Android refuses a folder.
- **Cloud storage** has two modes. *Cloud folder* is for apps that share whole folders (OneDrive, Dropbox). *Cloud files* is for Google Drive and any app that only shares single files: the files you pick are saved as a storage called Cloud files and stay after a restart. Long-press a cloud file for Open with, Share or Remove from list. **Add files here** (the three-dot menu in any folder) copies files in from any cloud app, and **Upload to cloud** on a file saves a copy to Drive, OneDrive or Dropbox.
- **Library** (Documents, Images, Songs, Videos) now finds files by itself on internal storage and SD cards. It needs All files access, and asks for it the first time.
- **Settings, Power**: wake lock (processor stays awake), keep screen on, and ignore the battery optimiser. The permission sheet has the battery item too.
- **Side panel rename**: pinned folders are renamed on disk, storages are renamed in Conduint.
- Files in cloud folders get icons from their mime type when they have no extension.
- `scripts/patch-android.sh` adds WAKE_LOCK and REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, also to projects patched by an older version.

Not verified on a phone yet: the SD card shortcut, the Google Drive pick-and-save flow, the battery prompt and the wake lock. Android decides what each cloud app allows.

## Tools (V0.4.0)

Open **Tools** at the bottom of the side panel. The scanners work on real file paths, so they need **All files access** (Android 11+). The first run asks for every permission; you can change them any time in **Settings, Permissions** or the Tools card.

| Tool | What it does |
|---|---|
| Storage optimizer | One scan for junk, empty folders and the app cache. Everything is ticked, untick what you keep. |
| RAM optimizer | Shows before and after free memory. Android only lets an app ask the system to stop other apps' background processes (uses KILL_BACKGROUND_PROCESSES) and free its own memory. Apps restart later when needed, so the gain can be small. |
| Cache cleanup | Clears this app's cache. Android does not allow clearing other apps' caches, so the card "Other apps' cache" opens Android's own app storage page. |
| Junk files | .tmp, .log, .bak, partial downloads, 0-byte files, thumbnail and cache folders. |
| Duplicate finder | Groups by size, then compares full MD5 so only identical files match. Keeps the oldest (or newest) copy of each group. |
| Empty folders | Top folder of each empty tree. DCIM, Download, Pictures, Music and other standard folders are never offered. |
| Orphan folders | Package-named folders (com.example.app) of apps that are no longer installed, at top level and in Android/media and Android/obb (and Android/data on Android 10 and older). Not ticked by default. Refuses to run if Android hides the app list. |
| Large files, Old installers, Storage analyzer | Biggest files, leftover APKs, and usage by type and top folder. |

Deleting from a tool moves items into `.conduint-trash` on the same volume, listed in the Recycle bin with Restore and Delete forever. With the bin turned off in Settings, tools delete for good after asking.

**Permissions requested:** READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO (Android 13+), READ/WRITE_EXTERNAL_STORAGE (Android 12 and older), MANAGE_EXTERNAL_STORAGE (all files), POST_NOTIFICATIONS, KILL_BACKGROUND_PROCESSES, QUERY_ALL_PACKAGES (to know which apps are installed for the orphan finder). `scripts/patch-android.sh` adds them to the manifest. These make the APK a sideload build: Google Play restricts MANAGE_EXTERNAL_STORAGE and QUERY_ALL_PACKAGES, so a Play release needs a declaration or those tools removed.

## Cloud services and apps with their own storage

Conduint does not talk to any cloud API and holds no accounts or tokens. Instead it uses the same door Android's own Files app uses: every app that wants to expose its storage ships a documents provider, and it shows up in the folder picker.

1. Tap **+** next to Storage and choose Folder (for Termux or Acode), Cloud storage or External storage.
2. In the system picker open the menu at the top left and choose the provider (Google Drive, OneDrive, Dropbox, Termux, an SD card...).
3. Pick a folder and tap Use this folder.

That folder then behaves like any other storage, including copy, ZIP and the recycle bin. What to expect:

- **Cloud apps** must be installed and signed in. How much they allow (write, rename, move) is up to each provider. When a provider refuses a native move, Conduint copies then deletes. Files are fetched on demand, so large copies are slow and use data. The recycle bin of a cloud folder lives in that cloud folder.
- **Termux**: its provider appears in the picker as Termux. If you also want shared storage, run `termux-setup-storage` inside Termux.
- **Acode**: if your Acode version lists itself in the picker menu, choose it. If it does not, pick the folder where your projects live. Either way, **Open with** and **Edit in another app** hand a file straight to Acode.
- **Android 11 and newer** refuses the internal storage root and the Download folder itself. Pick a folder inside them.

## Project layout

```
conduint-files/
  www/                  the whole app (Capacitor webDir)
    index.html          markup and icon sprite
    css/style.css       themes, layout, player, dialogs
    js/core.js          helpers, constants, persisted state
    js/storage.js       storages, providers (native saf, desktop local), library scan
    js/ops.js           dialogs, selection, clipboard, recycle bin, every file operation
    js/player.js        bottom-sheet player
    js/tools.js         permissions sheet and the Tools sheet
    js/vault.js         Conduit Vault: keys, AES, vault screen, move in and out
    js/reader.js        document reader: PDF, Markdown, PPTX, DOCX, HTML, text, media
    js/ui.js            browser view, side panel, menus, settings, back button, boot
  native/
    ToolsPlugin.java    permissions, RAM, scans, cleanup, path-based recycle bin
    SafPlugin.java      the native plugin: list, copy, move, rename, delete, zip, unzip, scan, open with, share
    MainActivity.java   registers the plugin
  scripts/
    build-apk.sh        npm install, add android, patch, sync, gradle assembleDebug
    patch-android.sh    copies native/ into the generated android/ project
    push-gitlab.sh      force push to GitLab over SSH (overwrites main)
  tests/
    mock-saf.js         in-memory stand-in for the native plugin
    smoke.py            end to end browser test (70 checks)
    features.py         V0.6 features: back bar, pins, lock, lyrics and tags, rename, player (102 checks)
    bare-bridge.py      real-Android bridge detection (no isNativePlatform)
  .gitlab-ci.yml        checks the code and builds the debug APK
  capacitor.config.json
  package.json
  LICENSE               MIT
```

`android/` is generated and not committed. The scripts rebuild it and patch in `native/` every time, so a fresh clone builds the same APK.

## Get it on GitLab and build the APK

1. From the project folder: `bash scripts/push-gitlab.sh`. It asks for your GitLab username and project name, you type YES, and it force-pushes over SSH (no tokens), replacing what is on `main`. Your SSH key must be added under GitLab, Preferences, SSH Keys.
2. Open the project on GitLab, then **Build, Pipelines**. Two jobs run: `check-js` (seconds) and `apk-debug` (about 10 to 15 minutes the first time, faster after, because Gradle is cached).
3. Open the `apk-debug` job, then **Download** under Job artifacts. The file is `app-debug.apk`. Install it on the phone (allow installs from your browser or file manager when Android asks).

The job uses the free shared runners. If your account asks for identity verification before shared runners work, GitLab shows that on the pipeline page.

Manual overwrite without the script:

```
git init -b main
git add -A
git commit -m "feat: Conduint Files V0.4.1"
git remote add origin git@gitlab.com:USERNAME/conduint-files.git
git push --force -u origin main
```

Tag a release with `git tag V0.4.1 && git push origin V0.4.1`.

## Build the APK yourself

Needs Node 18+, JDK 17 and the Android SDK with platform 34 and build-tools 34.0.0.

```
export ANDROID_HOME=/path/to/android-sdk
bash scripts/build-apk.sh
```

Termux cannot build Android apps, so use the GitLab pipeline from a phone.

## Run the web part on a computer

```
python3 -m http.server 8080 --directory www
```

Open `http://localhost:8080` in Chrome. Without the native plugin the app falls back to a read-only preview using the browser's folder picker, so copy, zip and the recycle bin only exist in the APK.

Tests (need `pip install playwright` and a Chromium): `python3 tests/smoke.py`, `python3 tests/features.py` and `python3 tests/bare-bridge.py`. The first It loads the real UI with the mock plugin and drives create, rename, pin, select, copy, paste, cut, zip, extract, delete, restore, empty bin, open with and the back button.

## Known risks (V0.6.1)
- **Never compiled.** `LockPlugin`, `PlayerPlugin`, `MediaService` and `SafPlugin.writeFile` were only read, not built. If the GitLab build fails, paste the error log.
- **Background buttons.** The notification buttons reach the page only while the web view runs. `MainActivity.onPause` keeps it running during playback, but only a phone test confirms it. Swiping the app away stops the music (the web view makes the sound).
- **CORS.** lrclib.net and iTunes are called with `fetch` from the web view. lrclib allows it; iTunes search normally does too. If a lookup is blocked the player falls back to the file name and tags, nothing breaks (tested).
- **Fingerprint needs Android 10 or newer** (platform BiometricPrompt). On older phones the option explains why it is unavailable and the pattern lock still works. If the sensor is gone and no pattern backup exists, the lock turns itself off.
- **Android 14 foreground service.** The manifest block declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `foregroundServiceType="mediaPlayback"`; without both, Android 14 refuses to show the music notification. Notifications also need the notification permission (Tools, Permissions).

## Production notes

- **Permissions:** browsing uses only folders you pick. The Tools need the permissions listed above, and you can leave them off.
- **Network:** no analytics, no external scripts or fonts, and your files are never uploaded. The app goes online only for what you use: the browser, lyrics and artwork lookup, weather, and Shield's Update rules. All icons are inline SVG.
- **No `innerHTML`.** File names are rendered with `textContent` only.
- **Storage keys:** settings, pins, colours, storages and the recycle bin index live in `localStorage` under `conduint.v1`. Reset forgets those; it never deletes your files. Files that were already in the recycle bin stay in the hidden `.conduint-trash` folder on the storage.
- **Package id** `com.fezzy.conduint` is a placeholder. Change `appId` in `capacitor.config.json` before the first Play Store upload because it cannot change afterwards. `patch-android.sh` rewrites the plugin's package to match.
- **ZIP limits:** standard ZIP only. No password protection, no 7z or RAR.
- **Signing:** the pipeline makes a debug APK. For a release build add a keystore as GitLab CI variables and a signing job. Never commit a keystore (`.gitignore` blocks `*.jks` and `*.keystore`).
- **Video and audio** play through the WebView decoder. Codecs it lacks (some MKV or AVI files) show a "format isn't supported" message. Use Open with for those.

## First run checklist on the phone

1. Add a storage (internal folder first, then Termux, then Drive) and confirm the listing opens.
2. New folder, rename it, pin it, rename again: the pin should follow.
3. Select two files, Copy, open another folder, Paste.
4. Select a folder and a file, ZIP, then Extract the result.
5. Delete a file, open Recycle bin, Restore it.
6. Open a `.txt` with Open with and pick Acode.
7. Play a song and a video, close the player, press back through the folders.

Report anything that fails with the toast text. Most provider quirks (a cloud app that rejects rename or move) surface as a clear message.

## Build log

| Version | What changed |
|---|---|
| V0.1.0 | Single-file skeleton: side panel, pins, folder colours, 4 themes, settings, demo file system. |
| V0.2.0 | Split into `www/` files. Real storages, library views, bottom-sheet player with maximize and rotate. README, MIT license, Capacitor config. |
| V0.4.0 | **Tools sheet** (storage optimizer, RAM optimizer, cache cleanup, junk files, duplicate finder, empty folders, orphan folders, large files, old installers, storage analyzer). **Permissions** for photos, videos, music, all files and notifications, asked on first run and in Settings. **Recycle bin moved to the bottom of the side panel.** Tool deletes go to the bin and can be restored. Force-push script for GitLab. 70 browser checks. |
| V0.4.1 | Native Saf plugin with real write access. Copy, cut, paste, rename, new folder and file, delete, recycle bin with restore and empty, ZIP with levels, extract, multi-select, share, open with (Acode and others), cloud and Termux storages through the system picker, back-button handling, cancelable progress. GitLab CI that builds the debug APK. Browser mock and 26-check smoke test. |
| V0.8.0 | Left panel open at start, Conduit Vault (AES-256), document Reader, Strategy Over Impulse branding. |
| V0.7.1 | Background effects: smoke, bubbles, rain drops, waterfall, dog paws. |
| V0.7.0 | Previews: PDF first page, EPUB / Office covers, photos, video frames, cached, lazy, with cloud switch. |
| V0.6.1 | Mocks and tests for the V0.6 features (172 browser checks in total), Java read-through against API 34, background playback hardening, CI test job. |

## Roadmap

- [ ] Run the first APK on a device and fix whatever it finds
- [x] Previews for documents, images and videos (V0.7.0)
- [x] Reader for PDF, Markdown, PPTX, DOCX, HTML and text (V0.8.0)
- [x] Conduit Vault (V0.8.0)
- [ ] Vault: files over 64 MB (needs streaming in the native plugin)
- [x] Text editor (V0.19.x)
- [x] Folder size calculation (V0.28.0)
- [ ] Release signing job in GitLab CI
- [ ] Password-protected ZIP
- [ ] Termux bridge provider (small local HTTP server) as an alternative to the picker

## License

MIT, see `LICENSE`. Copyright (c) 2026 Grant Fezzy Festers.


## V0.41.0 update notes

- Added a Contacts shortcut in the app UI for the Android Contacts provider. It requests the Android Contacts permission, lists saved contacts, filters the list, and opens the system editor for existing contacts or the system add-contact form for new ones. Actual permissions and contact access require an installed native APK.
- Contacts data remains in Android Contacts; Conduint does not copy it into its own storage.
- Existing VPN profiles still determine the actual WireGuard server and tunnel DNS. A working VPN server endpoint and valid WireGuard configuration are required; this build does not invent or silently supply a VPN server.
- The password manager's existing TOTP support is retained. Login entries expose an optional TOTP field; secure notes can store an authenticator setup key and display a live code. A TOTP setup secret is required to generate the same code as another authenticator.

- Expanded browser Shield categories with optional list-view toggles for social media, known browser-based crypto-mining domains, URL shorteners, and video platforms. These rules apply inside Conduint Browser; some categories intentionally block whole sites and can break links or embedded media.
- DNS catalogue added to the VPN screen with security, malware, tracker/ad, and family-filtering options. It is labelled as a reference preference because an imported WireGuard profile controls the live DNS route.


## V0.42.1 follow-up patch (2026-10-14)

- Contacts: added an in-app Delete action for existing contacts. Deletion is explicit, requires confirmation, and uses the native Android Contacts provider; the app must be rebuilt and installed for the native API change to be available.
- Password imports: fixed CSV header normalization so generic `username` and `password` columns remain mapped for Chrome/Edge/Brave-style exports instead of being incorrectly rewritten as Bitwarden-specific `login_username` / `login_password` columns.
- Verification performed for this patch: JavaScript syntax checks and ZIP integrity checks. Native Android compilation and device-level contact/import tests were not run in this environment.
- Known limitations: Contacts editor still exposes one phone and one email field; encrypted Bitwarden exports still need to be decrypted/exported by Bitwarden before import. Music scanning remains subject to Android storage access and provider limits.
