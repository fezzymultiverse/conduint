# Conduint V0.51.2 - Authenticator note + field sync, bare one-time password box, working Sync button

- Root bug: `pmNorm` (`js/pm.js`) squashed every custom field of type Authenticator (TOTP) to plain Text on each save, so the field lost its live code and could never sync. Type 3 is now kept (an empty type 3, i.e. a Bitwarden linked field, still becomes Text).
- New vault -> Authenticator sync (`js/pmdup.js`, `pmToAuSync`): a key typed in a login's One-time password box (bare Base32, spaces and lower case fine, or an otpauth:// link), in a Secure note's Authenticator key, or in an Authenticator (TOTP) custom field is copied to the Authenticator as a 2FA account. Title, user name, site, digits, period and algorithm come across. Runs after saving an item, when the vault unlocks and when the app returns. Add-only: a code you delete from the Authenticator is not brought back, and nothing already there is changed. Invalid keys and Steam links are skipped. Switch in Password Manager > Settings.
- Loop guard: codes copied this way are marked, so the Authenticator -> vault sync does not copy them straight back.
- Passwords dashboard Sync button (cloud icon): it only ever offered Android autofill sync (which does nothing outside the Android app), so it looked dead. First row is now "Sync now", which copies new items both ways and shows what happened. The autofill row says when it needs the Android app.
- Settings > "Sync now" now runs both directions too.
- `VER` is V0.51.2. New test `tests/v0512.py` (all passing).
- NOT verified: nothing run on a phone. `tests/v0510.py` still fails "three rapid add taps open the picker once"; it fails the same way on the untouched V0.51.0 and this release does not touch it.
