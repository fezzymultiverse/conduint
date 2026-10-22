# Conduint V0.50.6 — Passkey callback fix

- Removed the secondary `BiometricPrompt` after Credential Manager operations.
- `createPasskey()` and `getPasskey()` now resolve/reject directly from Credential Manager callbacks.
- Preserved Capacitor plugin registration and JavaScript request/response field names.
- Removed AndroidX Biometric dependency insertion for this plugin.
- Android build and device test remain required; they were not run in this environment.
