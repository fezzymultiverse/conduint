# Conduint V0.50.7 - Home screen spacing

- Weather card, section headers and the "Add folder" chip had no gap above or below them. Every block on Home now has 14 to 18 px between it and the next.
- Library tiles are equal height (the Internal Storage tile has a bar, so its row was taller than the others).
- Browser card: site tiles and buttons have more padding and gap.
- Quick tools: tiles, gaps and the Recycle bin / Shield pills have more room; "Recycle bin - empty" and "0.2 GB free of 0.2 GB" wrap instead of being cut off.
- Under 360 px wide, Browser site tiles and Quick tools tiles switch to two columns.
- CSS only (appended block at the end of `www/css/style.css`). No JavaScript or Java change.
- Checked in headless Chromium at 390 px. Not run on a device.
