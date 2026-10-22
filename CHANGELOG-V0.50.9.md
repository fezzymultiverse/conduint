# Conduint V0.50.9 - Festers passkey bridge

- Why Festers could never use Conduint passkeys: Android's Credential Manager only gives a passkey provider the website address when the calling browser holds `CREDENTIAL_MANAGER_SET_ORIGIN`, which Android never grants to a sideloaded browser. The fingerprint on the trusted list cannot change that.
- New `native/FestersBridgeActivity.java`: Festers starts it directly (`startActivityForResult`, no Credential Manager) and passes the website address and the WebAuthn options. Conduint signs with the same code path as `PasskeyActivity` (ES256, UP+UV, signCount 0) and returns the credential JSON.
- Caller proof: `getCallingPackage()` must be `com.fezzy.festersbrowser` and its signing certificate must be trusted. No setup needed: the first time Festers asks, Conduint shows the certificate, asks for fingerprint or screen lock once, and pins it. If `CONDUINT_TRUST_FESTERS_SHA256` is set at build time that fingerprint is used instead and no question is asked. A changed certificate is refused. Anyone else is refused. Origin must be `https://host[:port]` (http only for localhost).
- `scripts/patch-android.sh` copies the class and registers the activity in the manifest.
- `PasskeyActivity.hostOf` and `rpOk` are now package-private so both screens share them. No other behaviour change.
- Festers must add its half: see `docs/FESTERS-PASSKEY-BRIDGE.md` (Java launcher + JS shim for `navigator.credentials`).
- Not compiled with the Android SDK, not run on a device. Syntax-parsed with javac only; the first pipeline run is the first real compile.
