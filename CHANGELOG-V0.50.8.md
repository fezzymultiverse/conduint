# Conduint V0.50.8 - Passkey safety

- A passkey is no longer lost when the sealed passkey store cannot be read: saving, acknowledging, syncing and deleting now stop with an error instead of overwriting the store with an empty list (`CredStore.softLoad`).
- When a browser (Festers or one on the trusted list) asks for a passkey but Android did not give it the browser-origin permission, Conduint now says so and refuses, instead of signing with an app identity that sites reject (`PasskeyActivity.originOf`).
- Known limit: a sideloaded browser such as Festers is never granted that permission by Android, so web passkeys need Chrome or another browser Android trusts.
- Java only. Not compiled, not run on a device. The crash cause is not confirmed from a log.
