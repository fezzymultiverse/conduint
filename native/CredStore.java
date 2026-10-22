package com.fezzy.conduint;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * CredStore (V0.29.0): everything the passkey provider and the autofill service keep on this phone.
 *
 *  - Passkeys: one ES256 (P-256) key pair per passkey, generated INSIDE the Android Keystore and never exportable. Only the public
 *    facts (credential id, site, user name, key alias) are kept in SharedPreferences. Signing happens in the Keystore.
 *  - Vault passkeys (V0.43.7): new passkeys are P-256 key pairs made in software so they can live in the password manager vault (backup,
 *    export, restore). The private key sits in an AES-256-GCM blob sealed by a Keystore key. The web side copies each new one into the
 *    vault ("pending" until it does) and sends back the vault's list, which then replaces the phone's copy. Older Keystore passkeys keep
 *    working but cannot leave the Keystore, so they never reach the vault.
 *  - Passwords for autofill: the web side pushes the Password entries of the Authenticator here (only when the person switched
 *    "Share with Android autofill" on). The list is encrypted with AES-256-GCM using a Keystore key and stored as one blob.
 *    Android autofill only receives a password after the person passes the screen lock / fingerprint (AutofillAuthActivity).
 */
final class CredStore {
    private CredStore() { }

    private static final String KS = "AndroidKeyStore";
    private static final String PK_PREFS = "cnd_passkeys", PK_LIST = "list";
    private static final String PW_PREFS = "cnd_autofill", PW_BLOB = "blob", PW_ALIAS = "cnd_autofill_key";
    private static final String SK_PREFS = "cnd_passkeys_soft", SK_BLOB = "blob", SK_ALIAS = "cnd_passkeys_soft_key";

    /* ---------- small helpers ---------- */
    static String b64u(byte[] b) { return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
    static byte[] unb64u(String s) { return Base64.decode(s, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
    static byte[] utf8(String s) { return s.getBytes(StandardCharsets.UTF_8); }

    static byte[] sha256(byte[] d) throws Exception { return MessageDigest.getInstance("SHA-256").digest(d); }

    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] p : parts) o.write(p, 0, p.length);
        return o.toByteArray();
    }

    private static byte[] fixed32(BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length == 32) return b;
        byte[] o = new byte[32];
        if (b.length > 32) System.arraycopy(b, b.length - 32, o, 0, 32);
        else System.arraycopy(b, 0, o, 32 - b.length, b.length);
        return o;
    }

    /* ---------- WebAuthn bytes ---------- */

    /** COSE_Key for ES256: {1:2, 3:-7, -1:1, -2:x, -3:y} in CBOR. */
    static byte[] coseKey(ECPublicKey pk) {
        byte[] x = fixed32(pk.getW().getAffineX()), y = fixed32(pk.getW().getAffineY());
        return concat(new byte[]{(byte) 0xA5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20}, x, new byte[]{0x22, 0x58, 0x20}, y);
    }

    /** rpIdHash (32) + flags (1) + signCount (4, always 0) + optional attested credential data. */
    static byte[] authData(String rpId, int flags, byte[] attested) throws Exception {
        byte[] head = concat(sha256(utf8(rpId)), new byte[]{(byte) flags, 0, 0, 0, 0});
        return attested == null ? head : concat(head, attested);
    }

    /** aaguid (16 zero bytes) + credential id length (2) + credential id + COSE key. */
    static byte[] attested(byte[] credId, byte[] cose) {
        return concat(new byte[16], new byte[]{(byte) (credId.length >> 8), (byte) credId.length}, credId, cose);
    }

    private static byte[] cborBytesHead(int len) {
        if (len < 24) return new byte[]{(byte) (0x40 | len)};
        if (len < 256) return new byte[]{0x58, (byte) len};
        return new byte[]{0x59, (byte) (len >> 8), (byte) len};
    }

    /** CBOR {"fmt":"none","attStmt":{},"authData":h'...'}  (no attestation, the usual choice for passkeys). */
    static byte[] attestationObject(byte[] authData) {
        return concat(new byte[]{(byte) 0xA3, 0x63, 'f', 'm', 't', 0x64, 'n', 'o', 'n', 'e', 0x67, 'a', 't', 't', 'S', 't', 'm', 't', (byte) 0xA0,
                0x68, 'a', 'u', 't', 'h', 'D', 'a', 't', 'a'}, cborBytesHead(authData.length), authData);
    }

    /* ---------- passkeys ---------- */
    private static SharedPreferences pk(Context c) { return c.getApplicationContext().getSharedPreferences(PK_PREFS, Context.MODE_PRIVATE); }

    static synchronized JSONArray passkeys(Context c) {
        try { return new JSONArray(pk(c).getString(PK_LIST, "[]")); } catch (Throwable t) { return new JSONArray(); }
    }

    private static synchronized void savePasskeys(Context c, JSONArray a) { pk(c).edit().putString(PK_LIST, a.toString()).apply(); }

    static List<JSONObject> forRp(Context c, String rpId) {
        List<JSONObject> out = new ArrayList<>();
        if (rpId == null || rpId.isEmpty()) return out;
        JSONArray a = allPasskeys(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && rpId.equalsIgnoreCase(o.optString("rp"))) out.add(o);
        }
        return out;
    }

    static JSONObject findPasskey(Context c, String id) {
        JSONArray a = allPasskeys(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optString("id").equals(id)) return o;
        }
        return null;
    }

    static final class Created {
        byte[] credId;
        ECPublicKey pub;
        JSONObject rec;
    }

    /** Makes a new passkey: a P-256 key pair plus the record that names it. The private key is kept sealed so the vault can take a copy. */
    static synchronized Created createPasskey(Context c, String rpId, String rpName, String userIdB64, String userName, String display) throws Exception {
        byte[] credId = new byte[32];
        new SecureRandom().nextBytes(credId);
        String id = b64u(credId);
        KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC);
        g.initialize(new ECGenParameterSpec("secp256r1"), new SecureRandom());
        KeyPair kp = g.generateKeyPair();
        JSONObject rec = new JSONObject();
        rec.put("id", id);
        rec.put("rp", rpId);
        rec.put("rpName", rpName == null ? "" : rpName);
        rec.put("uid", userIdB64 == null ? "" : userIdB64);
        rec.put("user", userName == null ? "" : userName);
        rec.put("display", display == null ? "" : display);
        rec.put("priv", b64u(kp.getPrivate().getEncoded()));
        rec.put("pulled", false);
        rec.put("created", System.currentTimeMillis());
        JSONArray a = softLoad(c);
        a.put(rec);
        saveSoft(c, a);
        Created r = new Created();
        r.credId = credId;
        r.pub = (ECPublicKey) kp.getPublic();
        r.rec = rec;
        return r;
    }

    /** True for a vault passkey (software key). Those report as backed up in WebAuthn; Keystore ones do not. */
    static boolean isSoft(JSONObject rec) { return rec != null && !rec.optString("priv").isEmpty(); }

    /* ---------- vault passkeys (sealed software keys) ---------- */
    /** V0.50.8: like softPasskeys but THROWS when a saved blob cannot be read, so a writer stops instead of overwriting every passkey with an empty list. */
    private static synchronized JSONArray softLoad(Context c) throws Exception {
        String s = c.getApplicationContext().getSharedPreferences(SK_PREFS, Context.MODE_PRIVATE).getString(SK_BLOB, null);
        if (s == null) return new JSONArray();
        return new JSONArray(unseal(SK_ALIAS, s));
    }

    static synchronized JSONArray softPasskeys(Context c) {
        try {
            return softLoad(c);
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    private static synchronized void saveSoft(Context c, JSONArray a) throws Exception {
        c.getApplicationContext().getSharedPreferences(SK_PREFS, Context.MODE_PRIVATE).edit().putString(SK_BLOB, seal(SK_ALIAS, a.toString())).apply();
    }

    /** Every passkey on this phone: the Keystore ones first, then the vault ones. */
    static JSONArray allPasskeys(Context c) {
        JSONArray out = new JSONArray();
        JSONArray a = passkeys(c), b = softPasskeys(c);
        for (int i = 0; i < a.length(); i++) out.put(a.opt(i));
        for (int i = 0; i < b.length(); i++) out.put(b.opt(i));
        return out;
    }

    /** Vault passkeys the vault has not taken a copy of yet (made while the vault was locked, or just now). */
    static JSONArray pendingPasskeys(Context c) {
        JSONArray a = softPasskeys(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !o.optBoolean("pulled", false)) out.put(o);
        }
        return out;
    }

    static synchronized int ackPasskeys(Context c, Set<String> ids) throws Exception {
        JSONArray a = softLoad(c);
        int n = 0;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && ids.contains(o.optString("id")) && !o.optBoolean("pulled", false)) {
                o.put("pulled", true);
                n++;
            }
        }
        if (n > 0) saveSoft(c, a);
        return n;
    }

    /**
     * The vault is the truth for every passkey it holds: the phone's copy becomes exactly the list the vault sends, plus any passkey the
     * vault has not seen yet. Each entry: {id, rp, rpName, uid, user, display, priv, created}.
     */
    static synchronized int setVaultPasskeys(Context c, String json) throws Exception {
        JSONArray in = new JSONArray(json), out = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < in.length(); i++) {
            JSONObject o = in.optJSONObject(i);
            if (o == null || o.optString("id").isEmpty() || o.optString("rp").isEmpty() || o.optString("priv").isEmpty()) continue;
            if (!seen.add(o.optString("id"))) continue;
            JSONObject r = new JSONObject();
            r.put("id", o.optString("id"));
            r.put("rp", o.optString("rp"));
            r.put("rpName", o.optString("rpName"));
            r.put("uid", o.optString("uid"));
            r.put("user", o.optString("user"));
            r.put("display", o.optString("display"));
            r.put("priv", o.optString("priv"));
            r.put("created", o.optLong("created", System.currentTimeMillis()));
            r.put("pulled", true);
            out.put(r);
        }
        JSONArray cur = softLoad(c);
        for (int i = 0; i < cur.length(); i++) {
            JSONObject o = cur.optJSONObject(i);
            if (o != null && !o.optBoolean("pulled", false) && !seen.contains(o.optString("id"))) out.put(o);
        }
        saveSoft(c, out);
        return out.length();
    }

    /** Signature (ASN.1 DER, which is what WebAuthn wants for ES256) made by the passkey's key: sealed software key or Keystore key. */
    static byte[] sign(JSONObject rec, byte[] data) throws Exception {
        PrivateKey k;
        if (isSoft(rec)) {
            k = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(unb64u(rec.getString("priv"))));
        } else {
            KeyStore ks = KeyStore.getInstance(KS);
            ks.load(null);
            k = (PrivateKey) ks.getKey(rec.optString("alias"), null);
            if (k == null) throw new IllegalStateException("This passkey's key is gone from the Keystore.");
        }
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initSign(k);
        s.update(data);
        return s.sign();
    }

    static synchronized boolean deletePasskey(Context c, String id) {
        JSONArray a = passkeys(c), keep = new JSONArray();
        boolean hit = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optString("id").equals(id)) {
                hit = true;
                try {
                    KeyStore ks = KeyStore.getInstance(KS);
                    ks.load(null);
                    ks.deleteEntry(o.optString("alias"));
                } catch (Throwable ignored) { }
            } else if (o != null) keep.put(o);
        }
        if (hit) savePasskeys(c, keep);
        try {
            JSONArray sa = softLoad(c), sk = new JSONArray();
            boolean sh = false;
            for (int i = 0; i < sa.length(); i++) {
                JSONObject o = sa.optJSONObject(i);
                if (o != null && o.optString("id").equals(id)) sh = true;
                else if (o != null) sk.put(o);
            }
            if (sh) {
                saveSoft(c, sk);
                hit = true;
            }
        } catch (Throwable ignored) { }
        return hit;
    }

    /* ---------- passwords for autofill ---------- */
    private static SharedPreferences pw(Context c) { return c.getApplicationContext().getSharedPreferences(PW_PREFS, Context.MODE_PRIVATE); }

    private static SecretKey aesKey(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance(KS);
        ks.load(null);
        if (ks.containsAlias(alias)) return (SecretKey) ks.getKey(alias, null);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KS);
        g.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    private static SecretKey pwKey() throws Exception { return aesKey(PW_ALIAS); }

    /** AES-256-GCM with a Keystore key: base64(iv + ciphertext). */
    private static String seal(String alias, String plain) throws Exception {
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, aesKey(alias));
        byte[] iv = ci.getIV(), ct = ci.doFinal(utf8(plain));
        return Base64.encodeToString(concat(iv, ct), Base64.NO_WRAP);
    }

    private static String unseal(String alias, String blob) throws Exception {
        byte[] all = Base64.decode(blob, Base64.NO_WRAP), iv = Arrays.copyOfRange(all, 0, 12), ct = Arrays.copyOfRange(all, 12, all.length);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.DECRYPT_MODE, aesKey(alias), new GCMParameterSpec(128, iv));
        return new String(ci.doFinal(ct), StandardCharsets.UTF_8);
    }

    /** list = JSON array of {d: site, t: title, u: user name, p: password}. */
    static synchronized void savePasswords(Context c, String json) throws Exception {
        new JSONArray(json);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, pwKey());
        byte[] iv = ci.getIV(), ct = ci.doFinal(utf8(json));
        pw(c).edit().putString(PW_BLOB, Base64.encodeToString(concat(iv, ct), Base64.NO_WRAP)).apply();
    }

    static synchronized JSONArray passwords(Context c) {
        try {
            String s = pw(c).getString(PW_BLOB, null);
            if (s == null) return new JSONArray();
            byte[] all = Base64.decode(s, Base64.NO_WRAP), iv = Arrays.copyOfRange(all, 0, 12), ct = Arrays.copyOfRange(all, 12, all.length);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, pwKey(), new GCMParameterSpec(128, iv));
            return new JSONArray(new String(ci.doFinal(ct), StandardCharsets.UTF_8));
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    static synchronized void clearPasswords(Context c) {
        pw(c).edit().remove(PW_BLOB).apply();
        try {
            KeyStore ks = KeyStore.getInstance(KS);
            ks.load(null);
            ks.deleteEntry(PW_ALIAS);
        } catch (Throwable ignored) { }
    }

    static int passwordCount(Context c) { return passwords(c).length(); }

    /* ---------- matching a login screen to saved passwords ---------- */
    static String cleanHost(String h) {
        if (h == null) return "";
        h = h.trim().toLowerCase(Locale.ROOT);
        int i = h.indexOf("://");
        if (i >= 0) h = h.substring(i + 3);
        i = h.indexOf('/');
        if (i >= 0) h = h.substring(0, i);
        i = h.indexOf(':');
        if (i >= 0) h = h.substring(0, i);
        return h.startsWith("www.") ? h.substring(4) : h;
    }

    private static String label(String host) {
        String[] p = host.split("\\.");
        return p.length >= 2 ? p[p.length - 2] : host;
    }

    private static String alnum(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", ""); }

    private static final Set<String> GENERIC = new HashSet<>(Arrays.asList("android", "mobile", "app", "apps", "main", "free", "lite", "beta",
            "release", "client", "droid", "official", "login", "auth", "account", "accounts", "user", "users", "www", "com", "org", "net", "the"));

    /**
     * Web page: the saved site must be the page's site or a parent of it (evil-github.com never matches github.com).
     * Native app: a package name part (4+ letters, not generic) must equal the saved site's name, for example com.github.android and github.com.
     * Each hit carries "id" (its position in the stored list).
     */
    static List<JSONObject> match(Context c, String webDomain, String pkg) {
        List<JSONObject> out = new ArrayList<>();
        JSONArray a = passwords(c);
        String host = cleanHost(webDomain);
        Set<String> parts = new HashSet<>();
        if (pkg != null) for (String s : pkg.toLowerCase(Locale.ROOT).split("\\.")) if (s.length() >= 4 && !GENERIC.contains(s)) parts.add(s);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || o.optString("p").isEmpty()) continue;
            String d = cleanHost(o.optString("d"));
            boolean hit;
            if (!host.isEmpty()) hit = !d.isEmpty() && (host.equals(d) || host.endsWith("." + d));
            else {
                String l = d.isEmpty() ? alnum(o.optString("t")) : label(d);
                hit = l.length() >= 4 && parts.contains(l);
            }
            if (hit) {
                try { o.put("id", i); } catch (Throwable ignored) { }
                out.add(o);
            }
        }
        return out;
    }
}
