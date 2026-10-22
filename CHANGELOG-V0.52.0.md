# Conduint V0.52.0 - Utilities on the panel, working exports, tap-to-enter ZIP, smoother Home, About card

- Utilities can now be placed in the left panel (Arrange > Panel, or the + picker, "Utilities (left panel)"). It follows the one-place rule, never goes on Home, and the bottom shortcut stays. (`js/arrange.js`)
- Exports: ROOT CAUSE found. The folder picker returns a tree URI and a root document URI; Authenticator, Password Manager, Contacts and Shield test exports passed the tree URI to `SAF.writeFile`, which needs the root. They now pass `t.root`, and `SafPlugin.writeFile` also converts a tree URI itself (`normDir`). (`js/auth.js`, `js/pmui.js`, `js/shield.js`, `native/SafPlugin.java`)
- Password Manager dashboard: new "Passkeys & Autofill" row under Protections showing whether Conduint is the active provider and autofill service; tap opens the setup screen. The system list now shows "Conduint Password Manager" for both services (`scripts/patch-android.sh`, `js/pmdash.js`).
- Less refreshing: Home's heavy parts rebuild at most every 30 s on return (pull down or Refresh dashboard forces it); the permission poll runs every 2.5 s and only while visible. (`js/dash.js`, `js/tools.js`)
- ZIP: a tap enters the zip at once; long-press has Browse, Extract here, Extract to folder, Details. (`js/ui.js`)
- Home scroll: removed the 26 px blur and screen blend on the animated wallpaper glow, removed card blur in Noir/Abyss, and the glow pauses while scrolling. (`css/style.css`, `js/dash.js`)
- About card: double-tap the Conduint logo or name. (`js/about.js`)
- `VER` is V0.52.0.
- NOT verified: Java (`normDir`) not compiled; nothing run on a phone; export write and passkey status need an on-device check. Scroll speed gain is expected, not measured. The existing tests/ scripts were not re-run.
- Add-ons: status light on the Password Manager Settings > "Passkeys & autofill" row (green both on, amber one on, red both off); "What's new" section on the About card (`ABOUT_NEW` in `js/about.js`, newest first).
