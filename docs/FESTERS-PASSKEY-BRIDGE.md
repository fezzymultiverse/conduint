# Festers side of the passkey bridge (give this to the Festers build)

Conduint V0.50.9 exposes `com.fezzy.conduint/.FestersBridgeActivity`. Festers must (1) intercept `navigator.credentials.create/get` in its WebView, (2) launch that activity with `startActivityForResult`, (3) turn the result back into a WebAuthn credential.

Rules Conduint enforces (Festers must meet them or every call is refused):
- Start with `startActivityForResult`. Do NOT add `FLAG_ACTIVITY_NEW_TASK` (Android then hides the caller and Conduint refuses).
- No fingerprint setup: Conduint pins Festers' signing certificate the first time Festers asks (one confirmation). Festers must keep the same signing key afterwards.
- `origin` must be the real page origin, `https://host[:port]`, read from the WebView's main-frame URL in Java, never taken from JS. Intercept only the top frame; reject calls from cross-origin iframes.
- Conduint passkeys are ES256 only.

## Java (Festers WebView host activity)

```java
private static final int RC_CONDUINT = 7100;
private String pendingCallbackId;

@JavascriptInterface
public void passkey(final String callbackId, final String op, final String requestJson) {
    runOnUiThread(new Runnable() { public void run() {
        try {
            String url = webView.getUrl();                       // main frame URL, set by Android, not by the page
            android.net.Uri u = android.net.Uri.parse(url);
            String origin = u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
            Intent i = new Intent();
            i.setComponent(new android.content.ComponentName("com.fezzy.conduint", "com.fezzy.conduint.FestersBridgeActivity"));
            i.putExtra("op", op);                                // "get" or "create"
            i.putExtra("origin", origin);
            i.putExtra("requestJson", requestJson);
            pendingCallbackId = callbackId;
            startActivityForResult(i, RC_CONDUINT);
        } catch (Throwable t) {
            deliver(callbackId, null, "Conduint is not installed or cannot be opened.");
        }
    }});
}

@Override
protected void onActivityResult(int rc, int result, Intent data) {
    super.onActivityResult(rc, result, data);
    if (rc != RC_CONDUINT) return;
    String id = pendingCallbackId; pendingCallbackId = null;
    if (id == null) return;
    if (result == RESULT_OK && data != null && data.getStringExtra("responseJson") != null) deliver(id, data.getStringExtra("responseJson"), null);
    else deliver(id, null, data != null && data.getStringExtra("error") != null ? data.getStringExtra("error") : "Cancelled.");
}

private void deliver(String id, String json, String err) {
    String js = "window.__cndPk(" + org.json.JSONObject.quote(id) + "," + (json == null ? "null" : org.json.JSONObject.quote(json)) + "," + (err == null ? "null" : org.json.JSONObject.quote(err)) + ")";
    webView.evaluateJavascript(js, null);
}
// register once: webView.addJavascriptInterface(this, "FestersPasskey");
```

Inject the JS below on every page start (`onPageStarted`, main frame only).

## JS shim (injected into pages)

```js
(function () {
  if (window.__cndPkInstalled || window.top !== window || !window.FestersPasskey) return;
  window.__cndPkInstalled = true;
  var pending = {}, n = 0;
  function b64u(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b.buffer; }
  function idList(l) { return (l || []).map(function (c) { return { type: c.type, id: b64u(c.id), transports: c.transports }; }); }
  window.__cndPk = function (id, json, err) { var p = pending[id]; delete pending[id]; if (!p) return; if (err) p.rej(new DOMException(err, 'NotAllowedError')); else p.res(JSON.parse(json)); };
  function call(op, req, build) {
    return new Promise(function (res, rej) {
      var id = 'c' + (++n);
      pending[id] = { res: function (c) { res(build(c)); }, rej: rej };
      window.FestersPasskey.passkey(id, op, JSON.stringify(req));
    });
  }
  function cred(c, extra) {
    var r = c.response, resp = { clientDataJSON: unb64u(r.clientDataJSON) };
    for (var k in extra) resp[k] = extra[k](r);
    return { id: c.id, rawId: unb64u(c.rawId), type: 'public-key', authenticatorAttachment: 'platform', response: resp,
             getClientExtensionResults: function () { return {}; } };
  }
  var orig = navigator.credentials;
  var shim = {
    create: function (o) {
      if (!o || !o.publicKey) return orig.create.call(orig, o);
      var p = o.publicKey;
      var req = { challenge: b64u(p.challenge), rp: p.rp, user: { id: b64u(p.user.id), name: p.user.name, displayName: p.user.displayName },
                  pubKeyCredParams: p.pubKeyCredParams, excludeCredentials: idList(p.excludeCredentials) };
      return call('create', req, function (c) {
        var x = cred(c, { attestationObject: function (r) { return unb64u(r.attestationObject); } });
        x.response.getTransports = function () { return ['internal']; };
        x.response.getAuthenticatorData = function () { return unb64u(c.response.authenticatorData); };
        x.response.getPublicKey = function () { return unb64u(c.response.publicKey); };
        x.response.getPublicKeyAlgorithm = function () { return -7; };
        return x;
      });
    },
    get: function (o) {
      if (!o || !o.publicKey) return orig.get.call(orig, o);
      var p = o.publicKey;
      var req = { challenge: b64u(p.challenge), rpId: p.rpId || location.hostname, allowCredentials: idList(p.allowCredentials) };
      return call('get', req, function (c) {
        return cred(c, { authenticatorData: function (r) { return unb64u(r.authenticatorData); }, signature: function (r) { return unb64u(r.signature); },
                         userHandle: function (r) { return r.userHandle ? unb64u(r.userHandle) : null; } });
      });
    },
    store: function (c) { return orig.store(c); },
    preventSilentAccess: function () { return orig.preventSilentAccess ? orig.preventSilentAccess() : Promise.resolve(); }
  };
  try { Object.defineProperty(navigator, 'credentials', { value: shim, configurable: true }); } catch (e) { navigator.credentials = shim; }
})();
```

Notes: the shim only takes over calls that contain `publicKey`; password credential calls pass through. Conduint resolves the "which passkey" choice itself (it shows a picker when several match).
