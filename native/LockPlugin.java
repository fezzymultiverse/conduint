package com.fezzy.conduint;

import android.content.Context;
import android.content.DialogInterface;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * App lock helpers: the fingerprint prompt and the screenshot / recent-apps guard.
 * Uses the platform BiometricPrompt (Android 9+), biometrics only. There is deliberately no PIN or device-credential fallback.
 */
@CapacitorPlugin(name = "Lock")
public class LockPlugin extends Plugin {

    private CancellationSignal signal;

    /** Is a fingerprint (or face) enrolled and usable? Resolves {ok, why}. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject o = new JSObject();
        boolean ok = false;
        String why = "";
        if (Build.VERSION.SDK_INT < 29) {
            why = "Fingerprint lock needs Android 10 or newer.";
        } else {
            try {
                BiometricManager bm = (BiometricManager) getContext().getSystemService(Context.BIOMETRIC_SERVICE);
                int r = Build.VERSION.SDK_INT >= 30
                    ? bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    : bm.canAuthenticate();
                if (r == BiometricManager.BIOMETRIC_SUCCESS) {
                    ok = true;
                } else if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
                    why = "No fingerprint is set up on this phone. Add one in Android Settings, Security.";
                } else if (r == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
                    why = "This phone has no fingerprint sensor.";
                } else {
                    why = "The fingerprint sensor is not available right now.";
                }
            } catch (Throwable t) {
                why = "The fingerprint sensor is not available.";
            }
        }
        o.put("ok", ok);
        o.put("why", why);
        call.resolve(o);
    }

    /** Shows the system fingerprint prompt. Resolves {ok:true}; rejects with code CANCELLED, ERROR or UNAVAILABLE. */
    @PluginMethod
    public void authenticate(final PluginCall call) {
        if (Build.VERSION.SDK_INT < 28 || getActivity() == null) {
            call.reject("Fingerprint is not available here.", "UNAVAILABLE");
            return;
        }
        final String title = call.getString("title", "Unlock Conduint Files");
        final String sub = call.getString("subtitle", "");
        final String neg = call.getString("cancel", "Cancel");
        final AtomicBoolean done = new AtomicBoolean(false);
        getActivity().runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    final Executor ex = getContext().getMainExecutor();
                    BiometricPrompt.Builder b = new BiometricPrompt.Builder(getContext());
                    b.setTitle(title);
                    if (!sub.isEmpty()) b.setSubtitle(sub);
                    b.setNegativeButton(neg, ex, new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface d, int which) {
                            if (done.compareAndSet(false, true)) call.reject("Cancelled", "CANCELLED");
                        }
                    });
                    if (Build.VERSION.SDK_INT >= 29) b.setConfirmationRequired(false);
                    if (Build.VERSION.SDK_INT >= 30)
                        b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.BIOMETRIC_STRONG);
                    BiometricPrompt prompt = b.build();
                    if (signal != null) signal.cancel();
                    signal = new CancellationSignal();
                    prompt.authenticate(signal, ex, new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            if (done.compareAndSet(false, true)) {
                                JSObject o = new JSObject();
                                o.put("ok", true);
                                call.resolve(o);
                            }
                        }
                        @Override public void onAuthenticationError(int code, CharSequence msg) {
                            if (!done.compareAndSet(false, true)) return;
                            boolean cancelled = code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                                || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED;
                            call.reject(msg == null ? "Fingerprint failed" : msg.toString(), cancelled ? "CANCELLED" : "ERROR");
                        }
                    });
                } catch (Throwable t) {
                    if (done.compareAndSet(false, true)) call.reject(String.valueOf(t.getMessage()), "UNAVAILABLE");
                }
            }
        });
    }

    /** Hides the app in the recent-apps screen and blocks screenshots while the lock is on. */
    @PluginMethod
    public void secure(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (getActivity() == null) { call.resolve(); return; }
        getActivity().runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                } catch (Throwable ignored) { }
                call.resolve();
            }
        });
    }

    private static final String KS = "AndroidKeyStore", BIO = "conduint_vault_bio", PMBIO = "conduint_pm_bio", DEV = "conduint_vault_dev";

    /** V0.33.0: the Password Manager has its own fingerprint key (which:"pm"), so turning it on or off never touches the Vault's fingerprint key. */
    private static String bioAlias(PluginCall call) { return "pm".equals(call.getString("which")) ? PMBIO : BIO; }

    /** A secret that only exists inside this phone's Keystore (HMAC of a fixed label). Mixed into the pattern key so a copied vault file cannot be brute-forced elsewhere. */
    @PluginMethod
    public void deviceSecret(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance(KS); ks.load(null);
            if (!ks.containsAlias(DEV)) {
                KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KS);
                g.init(new KeyGenParameterSpec.Builder(DEV, KeyProperties.PURPOSE_SIGN).build());
                g.generateKey();
            }
            Mac m = Mac.getInstance("HmacSHA256");
            m.init((SecretKey) ks.getKey(DEV, null));
            JSObject o = new JSObject();
            o.put("b64", Base64.encodeToString(m.doFinal("conduint-vault-v2".getBytes("UTF-8")), Base64.NO_WRAP));
            call.resolve(o);
        } catch (Throwable t) { call.reject(String.valueOf(t.getMessage()), "UNAVAILABLE"); }
    }

    /** Encrypts data (base64) with a Keystore key that needs a fingerprint for every use. Resolves {b64: iv + ciphertext}. */
    @PluginMethod public void bioWrap(PluginCall call) { bioCrypto(call, true); }
    /** Reverse of bioWrap: shows the fingerprint prompt, resolves {b64: plain data}. */
    @PluginMethod public void bioUnwrap(PluginCall call) { bioCrypto(call, false); }
    @PluginMethod public void bioForget(PluginCall call) {
        try { KeyStore ks = KeyStore.getInstance(KS); ks.load(null); ks.deleteEntry(bioAlias(call)); } catch (Throwable ignored) { }
        call.resolve();
    }

    private void bioCrypto(final PluginCall call, final boolean enc) {
        if (Build.VERSION.SDK_INT < 28 || getActivity() == null) { call.reject("Fingerprint is not available here.", "UNAVAILABLE"); return; }
        final String alias = bioAlias(call);
        final byte[] in;
        final Cipher c;
        try {
            in = Base64.decode(call.getString("data", ""), Base64.NO_WRAP);
            KeyStore ks = KeyStore.getInstance(KS); ks.load(null);
            c = Cipher.getInstance("AES/GCM/NoPadding");
            if (enc) {
                ks.deleteEntry(alias);
                KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KS);
                KeyGenParameterSpec.Builder kb = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256).setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
                if (Build.VERSION.SDK_INT >= 30) kb.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                g.init(kb.build()); g.generateKey();
                c.init(Cipher.ENCRYPT_MODE, (SecretKey) ks.getKey(alias, null));
            } else {
                c.init(Cipher.DECRYPT_MODE, (SecretKey) ks.getKey(alias, null), new GCMParameterSpec(128, Arrays.copyOf(in, 12)));
            }
        } catch (Throwable t) {
            call.reject("The fingerprint key changed (a fingerprint was added or removed). Unlock with your pattern or recovery code and turn fingerprint on again.", "INVALID");
            return;
        }
        final String title = call.getString("title", "Conduit Vault");
        final String neg = call.getString("cancel", "Cancel");
        final AtomicBoolean done = new AtomicBoolean(false);
        getActivity().runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    final Executor ex = getContext().getMainExecutor();
                    BiometricPrompt.Builder b = new BiometricPrompt.Builder(getContext());
                    b.setTitle(title).setSubtitle(call.getString("subtitle", ""));
                    b.setNegativeButton(neg, ex, new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface d, int w) { if (done.compareAndSet(false, true)) call.reject("Cancelled", "CANCELLED"); }
                    });
                    if (Build.VERSION.SDK_INT >= 29) b.setConfirmationRequired(false);
                    if (Build.VERSION.SDK_INT >= 30) b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG);
                    if (signal != null) signal.cancel();
                    signal = new CancellationSignal();
                    b.build().authenticate(new BiometricPrompt.CryptoObject(c), signal, ex, new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                            if (!done.compareAndSet(false, true)) return;
                            try {
                                Cipher cc = r.getCryptoObject().getCipher();
                                byte[] out;
                                if (enc) { byte[] ct = cc.doFinal(in); out = new byte[cc.getIV().length + ct.length]; System.arraycopy(cc.getIV(), 0, out, 0, cc.getIV().length); System.arraycopy(ct, 0, out, cc.getIV().length, ct.length); }
                                else out = cc.doFinal(in, 12, in.length - 12);
                                JSObject o = new JSObject(); o.put("b64", Base64.encodeToString(out, Base64.NO_WRAP)); call.resolve(o);
                            } catch (Throwable t) { call.reject(String.valueOf(t.getMessage()), "ERROR"); }
                        }
                        @Override public void onAuthenticationError(int code, CharSequence msg) {
                            if (!done.compareAndSet(false, true)) return;
                            boolean cancelled = code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED;
                            call.reject(msg == null ? "Fingerprint failed" : msg.toString(), cancelled ? "CANCELLED" : "ERROR");
                        }
                    });
                } catch (Throwable t) { if (done.compareAndSet(false, true)) call.reject(String.valueOf(t.getMessage()), "UNAVAILABLE"); }
            }
        });
    }
}
