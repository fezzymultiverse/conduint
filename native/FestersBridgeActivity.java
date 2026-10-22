package com.fezzy.conduint;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * FestersBridgeActivity (V0.50.9): passkeys for the Festers browser WITHOUT Android's Credential Manager.
 *
 * Why: Credential Manager only hands a provider the web origin when the calling browser holds CREDENTIAL_MANAGER_SET_ORIGIN, a privileged
 * permission Android never grants to a sideloaded browser. So PasskeyActivity can never serve Festers. This activity takes the origin
 * straight from Festers instead, and trusts it only after proving who the caller is.
 *
 * Caller proof: Festers must start this activity with startActivityForResult (no FLAG_ACTIVITY_NEW_TASK), so getCallingPackage() is set
 * by Android and cannot be spoofed. That package must be com.fezzy.festersbrowser AND its signing certificate SHA-256 must be trusted:
 * either listed in assets/cnd_privileged_apps.json (optional CI variable CONDUINT_TRUST_FESTERS_SHA256), or, when none is listed, pinned
 * automatically the first time Festers asks (the person confirms once with fingerprint or screen lock). A later certificate change is refused.
 *
 * Request extras:  op = "get" | "create";  origin = "https://example.com" (scheme + host [+ port], no path);
 *                  requestJson = the WebAuthn publicKey options as JSON (challenge, rp / rpId, user, allowCredentials ...).
 * Result:          RESULT_OK with extra responseJson (WebAuthn credential JSON, same shape as Credential Manager returns);
 *                  RESULT_CANCELED with extra error (text) and cancelled (boolean, true when the person backed out).
 * Signing, flags and key storage are identical to PasskeyActivity: ES256, attestation none, UP+UV, signCount 0.
 */
public class FestersBridgeActivity extends Activity {
    static final String FESTERS_PKG = "com.fezzy.festersbrowser";
    static final String EXTRA_OP = "op";
    static final String EXTRA_ORIGIN = "origin";
    static final String EXTRA_REQUEST = "requestJson";
    static final String EXTRA_RESPONSE = "responseJson";
    static final String EXTRA_ERROR = "error";
    static final String EXTRA_CANCELLED = "cancelled";

    static final String PIN_FILE = "cnd_festers_pin";
    static final String PIN_KEY = "sha256";

    private boolean done;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        try {
            if (getIntent() == null) throw new SecurityException("Empty request.");
            final String pkg = getCallingPackage();
            if (pkg == null) throw new SecurityException("Could not identify the app that is asking. Festers must start this screen for a result.");
            if (!FESTERS_PKG.equals(pkg)) throw new SecurityException("Only the Festers browser may use this passkey bridge.");
            Signature[] signers = signersOf(pkg);
            if (signers == null || signers.length == 0) throw new SecurityException("Could not read Festers' signing certificate.");
            final List<String> have = new ArrayList<>();
            for (Signature s : signers) have.add(hex(CredStore.sha256(s.toByteArray())));
            Set<String> fromList = listedFingerprints();
            if (!fromList.isEmpty()) {
                // a fingerprint was built into Conduint (CONDUINT_TRUST_FESTERS_SHA256): it must match, no questions asked
                for (String h : have) if (fromList.contains(h)) { handle(); return; }
                throw new SecurityException("Festers' signing certificate does not match the fingerprint built into Conduint.");
            }
            String pinned = getSharedPreferences(PIN_FILE, MODE_PRIVATE).getString(PIN_KEY, "");
            if (!pinned.isEmpty()) {
                // pinned on first use: Festers must keep the same signing key
                for (String h : have) if (h.equals(pinned)) { handle(); return; }
                throw new SecurityException("Festers' signing certificate changed since it was trusted. Clear Conduint's data for Festers or reinstall Conduint to trust it again.");
            }
            // first use: ask once, with the fingerprint or screen lock, then remember Festers' certificate
            final String first = have.get(0);
            Gate.ask(this, "Trust the Festers browser for passkeys? Certificate " + first.substring(0, 11) + "...", new Gate.Done() {
                @Override
                public void ok() {
                    getSharedPreferences(PIN_FILE, MODE_PRIVATE).edit().putString(PIN_KEY, first).apply();
                    handle();
                }

                @Override
                public void no(String why) {
                    fail(why == null ? "Cancelled." : why, true);
                }
            });
        } catch (Throwable t) {
            fail(t.getMessage() == null ? "Passkey request failed." : t.getMessage(), false);
        }
    }

    /** Runs the request once the caller is trusted. */
    private void handle() {
        try {
            Intent in = getIntent();
            String op = in.getStringExtra(EXTRA_OP);
            String origin = cleanOrigin(in.getStringExtra(EXTRA_ORIGIN));
            String req = in.getStringExtra(EXTRA_REQUEST);
            if (req == null || req.isEmpty()) throw new IllegalStateException("The request has no passkey options.");
            JSONObject j = new JSONObject(req);
            if ("create".equals(op)) create(origin, j);
            else if ("get".equals(op)) get(origin, j);
            else throw new IllegalStateException("Unknown request.");
        } catch (Throwable t) {
            fail(t.getMessage() == null ? "Passkey request failed." : t.getMessage(), false);
        }
    }

    /* ---------- results ---------- */
    private void fail(String msg, boolean cancelled) {
        if (done) return;
        done = true;
        Intent r = new Intent();
        r.putExtra(EXTRA_ERROR, msg);
        r.putExtra(EXTRA_CANCELLED, cancelled);
        setResult(RESULT_CANCELED, r);
        finish();
    }

    private void succeed(JSONObject credential) {
        if (done) return;
        done = true;
        Intent r = new Intent();
        r.putExtra(EXTRA_RESPONSE, credential.toString());
        setResult(RESULT_OK, r);
        finish();
    }

    /* ---------- who is asking ---------- */
    private String allowlist() throws Exception {
        try (InputStream in = getAssets().open("cnd_privileged_apps.json")) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return new String(o.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String hex(byte[] d) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < d.length; i++) {
            if (i > 0) s.append(':');
            s.append(String.format("%02X", d[i] & 0xFF));
        }
        return s.toString();
    }

    @SuppressWarnings("deprecation")
    private Signature[] signersOf(String pkg) throws Exception {
        PackageManager pm = getPackageManager();
        if (Build.VERSION.SDK_INT >= 28) {
            PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES);
            if (pi.signingInfo == null) return null;
            return pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
        }
        PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
        return pi.signatures;
    }

    /** Festers fingerprints built into assets/cnd_privileged_apps.json (empty when CONDUINT_TRUST_FESTERS_SHA256 was not set at build time). */
    private Set<String> listedFingerprints() throws Exception {
        Set<String> trusted = new HashSet<>();
        JSONArray apps = new JSONObject(allowlist()).optJSONArray("apps");
        if (apps != null) for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a == null || a.optJSONObject("info") == null || !FESTERS_PKG.equals(a.optJSONObject("info").optString("package_name"))) continue;
            JSONArray sigs = a.optJSONObject("info").optJSONArray("signatures");
            if (sigs != null) for (int k = 0; k < sigs.length(); k++) {
                JSONObject sg = sigs.optJSONObject(k);
                if (sg != null) trusted.add(sg.optString("cert_fingerprint_sha256").toUpperCase());
            }
        }
        return trusted;
    }

    /** scheme://host[:port] only. https everywhere, http only for localhost. */
    private static String cleanOrigin(String o) {
        if (o == null) throw new IllegalStateException("The request has no website address.");
        String s = o.trim();
        if (!s.matches("^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$")) throw new SecurityException("The website address is not valid.");
        String host = PasskeyActivity.hostOf(s).toLowerCase();
        if (s.startsWith("http://") && !host.equals("localhost")) throw new SecurityException("Passkeys need a secure (https) website.");
        return s;
    }

    private static String clientData(String type, String challenge, String origin) throws Exception {
        JSONObject c = new JSONObject();
        c.put("type", type);
        c.put("challenge", challenge);
        c.put("origin", origin);
        c.put("crossOrigin", false);
        return c.toString();
    }

    private static JSONObject wrap(byte[] credId, JSONObject response) throws Exception {
        String id = CredStore.b64u(credId);
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("rawId", id);
        o.put("type", "public-key");
        o.put("authenticatorAttachment", "platform");
        o.put("response", response);
        o.put("clientExtensionResults", new JSONObject());
        return o;
    }

    /* ---------- create ---------- */
    private void create(final String origin, final JSONObject j) throws Exception {
        final JSONObject rp = j.getJSONObject("rp"), user = j.getJSONObject("user");
        String rid = rp.optString("id");
        if (rid.isEmpty()) rid = PasskeyActivity.hostOf(origin);
        final String rpId = rid;
        if (rpId.isEmpty()) throw new IllegalStateException("The request has no site name.");
        if (!PasskeyActivity.rpOk(origin, rpId)) throw new SecurityException("That site cannot use this passkey domain.");
        JSONArray algs = j.optJSONArray("pubKeyCredParams");
        if (algs != null && algs.length() > 0) {
            boolean es256 = false;
            for (int i = 0; i < algs.length(); i++) if (algs.optJSONObject(i) != null && algs.optJSONObject(i).optInt("alg") == -7) es256 = true;
            if (!es256) throw new IllegalStateException("Conduint passkeys use ES256 and this site does not accept it.");
        }
        JSONArray ex = j.optJSONArray("excludeCredentials");
        if (ex != null) for (int i = 0; i < ex.length(); i++) {
            JSONObject e = ex.optJSONObject(i);
            if (e != null && CredStore.findPasskey(this, e.optString("id")) != null) throw new IllegalStateException("A passkey for this account is already saved in Conduint.");
        }
        final String challenge = j.getString("challenge");
        Gate.ask(this, "Save passkey for " + rpId + " in Conduint", new Gate.Done() {
            @Override
            public void ok() {
                try {
                    CredStore.Created c = CredStore.createPasskey(FestersBridgeActivity.this, rpId, rp.optString("name"), user.optString("id"), user.optString("name"), user.optString("displayName"));
                    byte[] ad = CredStore.authData(rpId, 0x5D, CredStore.attested(c.credId, CredStore.coseKey(c.pub)));
                    JSONObject resp = new JSONObject();
                    resp.put("clientDataJSON", CredStore.b64u(CredStore.utf8(clientData("webauthn.create", challenge, origin))));
                    resp.put("attestationObject", CredStore.b64u(CredStore.attestationObject(ad)));
                    resp.put("transports", new JSONArray().put("internal"));
                    resp.put("publicKeyAlgorithm", -7);
                    resp.put("publicKey", CredStore.b64u(c.pub.getEncoded()));
                    resp.put("authenticatorData", CredStore.b64u(ad));
                    succeed(wrap(c.credId, resp));
                } catch (Throwable t) {
                    fail(t.getMessage() == null ? "Could not save the passkey." : t.getMessage(), false);
                }
            }

            @Override
            public void no(String why) {
                fail(why == null ? "Cancelled." : why, true);
            }
        });
    }

    /* ---------- get (sign in) ---------- */
    private void get(final String origin, final JSONObject j) throws Exception {
        String rid = j.optString("rpId");
        if (rid.isEmpty()) rid = PasskeyActivity.hostOf(origin);
        final String rpId = rid;
        if (!PasskeyActivity.rpOk(origin, rpId)) throw new SecurityException("That site cannot use this passkey domain.");
        Set<String> allow = new HashSet<>();
        JSONArray ac = j.optJSONArray("allowCredentials");
        if (ac != null) for (int k = 0; k < ac.length(); k++) {
            JSONObject c = ac.optJSONObject(k);
            if (c != null && !c.optString("id").isEmpty()) allow.add(c.optString("id"));
        }
        final List<JSONObject> matches = new ArrayList<>();
        for (JSONObject r : CredStore.forRp(this, rpId)) if (allow.isEmpty() || allow.contains(r.optString("id"))) matches.add(r);
        if (matches.isEmpty()) throw new IllegalStateException("Conduint has no passkey for " + rpId + ".");
        final String challenge = j.getString("challenge");
        if (matches.size() == 1) {
            signIn(origin, rpId, challenge, matches.get(0));
            return;
        }
        final CharSequence[] names = new CharSequence[matches.size()];
        for (int i = 0; i < names.length; i++) {
            JSONObject r = matches.get(i);
            String u = r.optString("user"), d = r.optString("display");
            names[i] = u.isEmpty() ? (d.isEmpty() ? rpId : d) : u;
        }
        new AlertDialog.Builder(this)
            .setTitle("Passkey for " + rpId)
            .setItems(names, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    try {
                        signIn(origin, rpId, challenge, matches.get(which));
                    } catch (Throwable t) {
                        fail(t.getMessage() == null ? "Sign-in failed." : t.getMessage(), false);
                    }
                }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(DialogInterface dialog) {
                    fail("Cancelled.", true);
                }
            })
            .show();
    }

    private void signIn(final String origin, final String rpId, final String challenge, final JSONObject rec) throws Exception {
        Gate.ask(this, "Sign in to " + rpId, new Gate.Done() {
            @Override
            public void ok() {
                try {
                    byte[] cdj = CredStore.utf8(clientData("webauthn.get", challenge, origin));
                    byte[] hash = CredStore.sha256(cdj);
                    byte[] ad = CredStore.authData(rpId, CredStore.isSoft(rec) ? 0x1D : 0x05, null);
                    byte[] sig = CredStore.sign(rec, CredStore.concat(ad, hash));
                    JSONObject resp = new JSONObject();
                    resp.put("clientDataJSON", CredStore.b64u(cdj));
                    resp.put("authenticatorData", CredStore.b64u(ad));
                    resp.put("signature", CredStore.b64u(sig));
                    resp.put("userHandle", rec.optString("uid"));
                    succeed(wrap(CredStore.unb64u(rec.getString("id")), resp));
                } catch (Throwable t) {
                    fail(t.getMessage() == null ? "Sign-in failed." : t.getMessage(), false);
                }
            }

            @Override
            public void no(String why) {
                fail(why == null ? "Cancelled." : why, true);
            }
        });
    }
}
