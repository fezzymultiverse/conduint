package com.fezzy.conduint;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;

/**
 * Gate (V0.29.0): asks for the fingerprint or the screen lock before a passkey signs or a password is released.
 * Android 10+ shows the system sheet (fingerprint, face, PIN, pattern or password). A phone with no screen lock at all cannot ask
 * for anything, so it goes through (the same as every other passkey provider on such a phone). Android 9 and older also go through.
 */
final class Gate {
    private Gate() { }

    interface Done {
        void ok();

        void no(String why);
    }

    static void ask(final Activity a, String title, final Done d) {
        try {
            KeyguardManager km = (KeyguardManager) a.getSystemService(Context.KEYGUARD_SERVICE);
            if (Build.VERSION.SDK_INT < 29 || km == null || !km.isDeviceSecure()) {
                d.ok();
                return;
            }
            BiometricPrompt.Builder b = new BiometricPrompt.Builder(a).setTitle(title).setSubtitle("Conduint");
            if (Build.VERSION.SDK_INT >= 30) {
                b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else {
                b.setDeviceCredentialAllowed(true);
            }
            b.build().authenticate(new CancellationSignal(), a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    d.ok();
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    d.no(msg == null ? "Cancelled" : msg.toString());
                }
            });
        } catch (Throwable t) {
            d.no(t.getMessage() == null ? "Could not ask for the screen lock" : t.getMessage());
        }
    }
}
