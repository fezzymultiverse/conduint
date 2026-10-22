package com.fezzy.conduint;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Bundle;

import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.CredentialOption;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialCancellationException;
import androidx.credentials.exceptions.CreateCredentialUnknownException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialUnknownException;
import androidx.credentials.provider.CallingAppInfo;
import androidx.credentials.provider.PendingIntentHandler;
import androidx.credentials.provider.ProviderCreateCredentialRequest;
import androidx.credentials.provider.ProviderGetCredentialRequest;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * PasskeyActivity (V0.29.0): the screen behind the Credential Manager sheet. It has no layout of its own: it asks for the fingerprint or
 * screen lock (Gate), then creates a passkey or signs a login and hands the answer back to Android.
 *
 * WebAuthn facts used here: ES256 only (algorithm -7), attestation "none", flags UP + UV (+ AT on create), signCount always 0. Vault passkeys
 * (software keys that live in the password manager) also set backup eligible + backup state (0x18); old Keystore passkeys cannot leave this
 * phone and never set them. A browser that is on the trusted list (assets/cnd_privileged_apps.json) supplies the web
 * origin and the client data hash; any other app is identified by its signing certificate (android:apk-key-hash:...).
 */
@TargetApi(34)
public class PasskeyActivity extends Activity {
    static final String ACT_CREATE = "com.fezzy.conduint.PASSKEY_CREATE";
    static final String ACT_GET = "com.fezzy.conduint.PASSKEY_GET";
    static final String EXTRA_ID = "cnd_id";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String a = getIntent() == null ? null : getIntent().getAction();
        boolean create = ACT_CREATE.equals(a);
        try {
            if (create) create();
            else if (ACT_GET.equals(a)) get();
            else throw new IllegalStateException("Unknown request");
        } catch (Throwable t) {
            fail(create, t.getMessage(), false);
        }
    }

    /* ---------- results ---------- */
    private void fail(boolean create, String msg, boolean cancelled) {
        Intent r = new Intent();
        if (create) PendingIntentHandler.setCreateCredentialException(r, cancelled ? new CreateCredentialCancellationException() : new CreateCredentialUnknownException(msg));
        else PendingIntentHandler.setGetCredentialException(r, cancelled ? new GetCredentialCancellationException() : new GetCredentialUnknownException(msg));
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

    /** Web origin for a trusted browser, or android:apk-key-hash:... for an ordinary app. A caller that names an origin but is not trusted is refused. */
    /** V0.50.8: true for a browser on the trusted list or Festers. Such a caller that passes no web origin was not given Android's browser-origin permission. */
    private boolean isBrowserPkg(String pkg) {
        if (pkg == null) return false;
        if ("com.fezzy.festersbrowser".equals(pkg)) return true;
        try {
            JSONArray apps = new JSONObject(allowlist()).optJSONArray("apps");
            if (apps != null) for (int i = 0; i < apps.length(); i++) {
                JSONObject a = apps.optJSONObject(i);
                if (a != null && a.optJSONObject("info") != null && pkg.equals(a.optJSONObject("info").optString("package_name"))) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private String originOf(CallingAppInfo ci) throws Exception {
        if (!ci.isOriginPopulated() && isBrowserPkg(ci.getPackageName())) {
            throw new SecurityException("This browser was not given Android's permission to pass the website address, so the site would reject the passkey. Use Chrome.");
        }
        if (ci.isOriginPopulated()) {
            String o = ci.getOrigin(allowlist());
            if (o == null) throw new SecurityException("This browser is not on Conduint's trusted list, so it cannot use Conduint passkeys.");
            return o;
        }
        SigningInfo si = ci.getSigningInfo();
        Signature[] sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        if (sigs == null || sigs.length == 0) throw new SecurityException("Could not identify the app that is asking.");
        return "android:apk-key-hash:" + CredStore.b64u(CredStore.sha256(sigs[0].toByteArray()));
    }

    static String hostOf(String origin) {
        String s = origin.replaceFirst("^[a-z]+://", "");
        int i = s.indexOf('/');
        if (i >= 0) s = s.substring(0, i);
        i = s.indexOf(':');
        return i >= 0 ? s.substring(0, i) : s;
    }

    /** A web origin may only use its own domain or a parent of it as the relying party id. */
    static boolean rpOk(String origin, String rpId) {
        if (!origin.startsWith("http")) return true;
        String h = hostOf(origin).toLowerCase(), r = rpId.toLowerCase();
        return h.equals(r) || h.endsWith("." + r);
    }

    private byte[] clientData(String type, String challenge, String origin, CallingAppInfo ci) throws Exception {
        JSONObject c = new JSONObject();
        c.put("type", type);
        c.put("challenge", challenge);
        c.put("origin", origin);
        c.put("crossOrigin", false);
        if (origin.startsWith("android:")) c.put("androidPackageName", ci.getPackageName());
        return CredStore.utf8(c.toString());
    }

    private JSONObject wrap(byte[] credId, JSONObject response) throws Exception {
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
    private void create() throws Exception {
        ProviderCreateCredentialRequest pr = PendingIntentHandler.retrieveProviderCreateCredentialRequest(getIntent());
        if (pr == null || !(pr.getCallingRequest() instanceof CreatePublicKeyCredentialRequest)) throw new IllegalStateException("That is not a passkey request.");
        final CreatePublicKeyCredentialRequest req = (CreatePublicKeyCredentialRequest) pr.getCallingRequest();
        final JSONObject j = new JSONObject(req.getRequestJson());
        final CallingAppInfo ci = pr.getCallingAppInfo();
        final String origin = originOf(ci);
        final JSONObject rp = j.getJSONObject("rp"), user = j.getJSONObject("user");
        String rid = rp.optString("id");
        if (rid.isEmpty() && origin.startsWith("http")) rid = hostOf(origin);
        if (rid.isEmpty()) throw new IllegalStateException("The request has no site name.");
        final String rpId = rid;
        if (!rpOk(origin, rpId)) throw new SecurityException("That site cannot use this passkey domain.");
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
        Gate.ask(this, "Save passkey for " + rpId + " in Conduint", new Gate.Done() {
            @Override
            public void ok() {
                try {
                    CredStore.Created c = CredStore.createPasskey(PasskeyActivity.this, rpId, rp.optString("name"), user.optString("id"), user.optString("name"), user.optString("displayName"));
                    byte[] ad = CredStore.authData(rpId, 0x5D, CredStore.attested(c.credId, CredStore.coseKey(c.pub)));
                    JSONObject resp = new JSONObject();
                    resp.put("clientDataJSON", CredStore.b64u(clientData("webauthn.create", j.optString("challenge"), origin, ci)));
                    resp.put("attestationObject", CredStore.b64u(CredStore.attestationObject(ad)));
                    resp.put("transports", new JSONArray().put("internal"));
                    resp.put("publicKeyAlgorithm", -7);
                    resp.put("publicKey", CredStore.b64u(c.pub.getEncoded()));
                    resp.put("authenticatorData", CredStore.b64u(ad));
                    Intent r = new Intent();
                    PendingIntentHandler.setCreateCredentialResponse(r, new CreatePublicKeyCredentialResponse(wrap(c.credId, resp).toString()));
                    setResult(RESULT_OK, r);
                    finish();
                } catch (Throwable t) {
                    fail(true, t.getMessage(), false);
                }
            }

            @Override
            public void no(String why) {
                fail(true, why, true);
            }
        });
    }

    /* ---------- get (sign in) ---------- */
    private void get() throws Exception {
        ProviderGetCredentialRequest pr = PendingIntentHandler.retrieveProviderGetCredentialRequest(getIntent());
        if (pr == null) throw new IllegalStateException("That is not a passkey request.");
        final JSONObject rec = CredStore.findPasskey(this, getIntent().getStringExtra(EXTRA_ID));
        if (rec == null) throw new IllegalStateException("That passkey is no longer saved in Conduint.");
        JSONObject found = null;
        GetPublicKeyCredentialOption opt = null;
        for (CredentialOption o : pr.getCredentialOptions()) {
            if (!(o instanceof GetPublicKeyCredentialOption)) continue;
            JSONObject jj = new JSONObject(((GetPublicKeyCredentialOption) o).getRequestJson());
            if (rec.optString("rp").equalsIgnoreCase(jj.optString("rpId"))) {
                opt = (GetPublicKeyCredentialOption) o;
                found = jj;
                break;
            }
        }
        if (opt == null) throw new IllegalStateException("This passkey is for a different site.");
        final JSONObject j = found;
        final GetPublicKeyCredentialOption option = opt;
        final CallingAppInfo ci = pr.getCallingAppInfo();
        final String origin = originOf(ci), rpId = rec.optString("rp");
        if (!rpOk(origin, rpId)) throw new SecurityException("That site cannot use this passkey domain.");
        Gate.ask(this, "Sign in to " + rpId, new Gate.Done() {
            @Override
            public void ok() {
                try {
                    byte[] cdj = clientData("webauthn.get", j.optString("challenge"), origin, ci);
                    byte[] hash = option.getClientDataHash();
                    if (hash == null) hash = CredStore.sha256(cdj);
                    byte[] ad = CredStore.authData(rpId, CredStore.isSoft(rec) ? 0x1D : 0x05, null);
                    byte[] sig = CredStore.sign(rec, CredStore.concat(ad, hash));
                    JSONObject resp = new JSONObject();
                    resp.put("clientDataJSON", CredStore.b64u(cdj));
                    resp.put("authenticatorData", CredStore.b64u(ad));
                    resp.put("signature", CredStore.b64u(sig));
                    resp.put("userHandle", rec.optString("uid"));
                    Intent r = new Intent();
                    PendingIntentHandler.setGetCredentialResponse(r, new GetCredentialResponse(new PublicKeyCredential(wrap(CredStore.unb64u(rec.getString("id")), resp).toString())));
                    setResult(RESULT_OK, r);
                    finish();
                } catch (Throwable t) {
                    fail(false, t.getMessage(), false);
                }
            }

            @Override
            public void no(String why) {
                fail(false, why, true);
            }
        });
    }
}
