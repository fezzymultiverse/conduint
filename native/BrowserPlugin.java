package com.fezzy.conduint;

import android.content.ContentValues;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.provider.MediaStore;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Environment;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conduint Browser. The web page (browser.js) draws the Chrome-style sheet: address bar, tabs, menu, history, bookmarks,
 * settings. This plugin owns the real page views. Every tab is an Android WebView inside one host layout that is laid
 * over the content rectangle the web page reports with bounds(). No JavaScript bridge is ever added to these views, so
 * a website can never reach the app's file plugins.
 *
 * Events sent to the page: state (url, title, progress, back, fwd), newtab, closetab, download, crash.
 */
@CapacitorPlugin(name = "Browser")
public class BrowserPlugin extends Plugin {

    private static final int REQ_FILE = 7301;
    private static BrowserPlugin inst;

    private final Map<String, WebView> tabs = new LinkedHashMap<>();
    private final Map<WebView, String> ids = new HashMap<>();
    private FrameLayout host;
    private String cur = "";
    private int popupSeq = 0;

    private boolean js = true, tpc = true, ads = true, popups = true;
    private int zoom = 100;
    private String baseUa;

    private ValueCallback<Uri[]> fileCb;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;

    private final List<Script> scripts = new ArrayList<>();

    private static final String[] AD = {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com", "adnxs.com",
        "taboola.com", "outbrain.com", "criteo.com", "criteo.net", "scorecardresearch.com", "quantserve.com",
        "moatads.com", "adsrvr.org", "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com",
        "amazon-adsystem.com", "hotjar.com", "advertising.com", "popads.net", "zedo.com", "adform.net",
        "smartadserver.com", "2mdn.net", "serving-sys.com", "yieldmo.com", "media.net", "revcontent.com"
    };

    private static class Script {
        String id = "", js = "", css = "";
        List<Pattern> pats = new ArrayList<>();
        boolean match(String url) {
            for (Pattern p : pats) if (p.matcher(url).matches()) return true;
            return false;
        }
    }

    @Override public void load() { inst = this; }

    /** Called from MainActivity.onActivityResult for the website file picker. */
    static void fileResult(int req, int res, Intent data) {
        if (req != REQ_FILE || inst == null) return;
        ValueCallback<Uri[]> cb = inst.fileCb;
        inst.fileCb = null;
        if (cb != null) cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
    }

    private void ui(Runnable r) { getActivity().runOnUiThread(r); }

    private void emit(String name, JSObject o) { notifyListeners(name, o); }

    // ---------- host layout ----------

    private FrameLayout ensureHost() {
        if (host == null) {
            host = new FrameLayout(getActivity());
            host.setBackgroundColor(Color.BLACK);
            host.setClipChildren(true);
            host.setClipToPadding(true);
            host.setVisibility(View.GONE);
            ViewGroup content = getActivity().findViewById(android.R.id.content);
            content.addView(host, new FrameLayout.LayoutParams(1, 1));
        }
        return host;
    }

    private void place(float x, float y, float w, float h) {
        FrameLayout hl = ensureHost();
        float d = getActivity().getResources().getDisplayMetrics().density;
        View web = getBridge().getWebView();
        View content = getActivity().findViewById(android.R.id.content);
        int[] a = new int[2], b = new int[2];
        web.getLocationOnScreen(a);
        content.getLocationOnScreen(b);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Math.max(1, Math.round(w * d)), Math.max(1, Math.round(h * d)));
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = a[0] - b[0] + Math.round(x * d);
        lp.topMargin = a[1] - b[1] + Math.round(y * d);
        hl.setLayoutParams(lp);
    }

    @PluginMethod
    public void show(final PluginCall call) {
        ui(() -> {
            place(call.getFloat("x", 0f), call.getFloat("y", 0f), call.getFloat("w", 1f), call.getFloat("h", 1f));
            host.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    @PluginMethod
    public void bounds(final PluginCall call) {
        ui(() -> {
            place(call.getFloat("x", 0f), call.getFloat("y", 0f), call.getFloat("w", 1f), call.getFloat("h", 1f));
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        ui(() -> {
            if (host != null) host.setVisibility(View.GONE);
            call.resolve();
        });
    }

    // ---------- tabs ----------

    private String ua(boolean desk) {
        if (baseUa == null) baseUa = WebSettings.getDefaultUserAgent(getActivity());
        if (desk) {
            Matcher m = Pattern.compile("Chrome/([0-9.]+)").matcher(baseUa);
            String v = m.find() ? m.group(1) : "124.0.0.0";
            return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + v + " Safari/537.36";
        }
        // Looks like Chrome for Android: no "wv" marker, no old Version/4.0 token.
        return baseUa.replace("; wv)", ")").replace(" Version/4.0", "");
    }

    private void applySettings(WebView w, boolean desk) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(js);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(!popups);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(desk);
        s.setTextZoom(zoom);
        s.setGeolocationEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(ua(desk));
        w.setTag(Boolean.valueOf(desk));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, tpc);
    }

    private WebView make(String id, boolean desk) {
        FrameLayout hl = ensureHost();
        WebView w = new WebView(getActivity());
        w.setBackgroundColor(Color.BLACK);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        applySettings(w, desk);
        if (Build.VERSION.SDK_INT >= 26) w.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        w.setWebViewClient(new Client());
        w.setWebChromeClient(new Chrome());
        w.setDownloadListener((url, agent, disp, mime, len) -> download(url, agent, disp, mime, len, w.getUrl()));
        w.setVisibility(View.GONE);
        hl.addView(w, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        tabs.put(id, w);
        ids.put(w, id);
        return w;
    }

    private void showCur() {
        for (Map.Entry<String, WebView> e : tabs.entrySet()) {
            e.getValue().setVisibility(e.getKey().equals(cur) ? View.VISIBLE : View.GONE);
        }
        WebView w = tabs.get(cur);
        if (w != null) state(w);
    }

    @PluginMethod
    public void open(final PluginCall call) {
        ui(() -> {
            String id = call.getString("id", "");
            String url = call.getString("url", "");
            boolean desk = Boolean.TRUE.equals(call.getBoolean("desktop", false));
            WebView w = tabs.get(id);
            if (w == null) w = make(id, desk);
            if (url != null && !url.isEmpty()) w.loadUrl(url);
            if (Boolean.TRUE.equals(call.getBoolean("select", true))) { cur = id; showCur(); }
            call.resolve();
        });
    }

    @PluginMethod
    public void select(final PluginCall call) {
        ui(() -> { cur = call.getString("id", ""); showCur(); call.resolve(); });
    }

    @PluginMethod
    public void close(final PluginCall call) {
        ui(() -> {
            String id = call.getString("id", "");
            WebView w = tabs.remove(id);
            if (w != null) {
                ids.remove(w);
                if (host != null) host.removeView(w);
                w.stopLoading();
                w.destroy();
            }
            if (id.equals(cur)) cur = "";
            call.resolve();
        });
    }

    @PluginMethod
    public void go(final PluginCall call) {
        ui(() -> {
            WebView w = tabs.get(call.getString("id", ""));
            String url = call.getString("url", "");
            if (w != null && url != null && !url.isEmpty()) w.loadUrl(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void back(final PluginCall call) {
        ui(() -> { WebView w = tabs.get(call.getString("id", "")); if (w != null && w.canGoBack()) w.goBack(); call.resolve(); });
    }

    @PluginMethod
    public void forward(final PluginCall call) {
        ui(() -> { WebView w = tabs.get(call.getString("id", "")); if (w != null && w.canGoForward()) w.goForward(); call.resolve(); });
    }

    @PluginMethod
    public void reload(final PluginCall call) {
        ui(() -> { WebView w = tabs.get(call.getString("id", "")); if (w != null) w.reload(); call.resolve(); });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        ui(() -> { WebView w = tabs.get(call.getString("id", "")); if (w != null) w.stopLoading(); call.resolve(); });
    }

    /** Request desktop site / mobile site for one tab, then reload it. */
    @PluginMethod
    public void desktop(final PluginCall call) {
        ui(() -> {
            WebView w = tabs.get(call.getString("id", ""));
            if (w != null) {
                boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
                applySettings(w, on);
                w.reload();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void find(final PluginCall call) {
        ui(() -> {
            WebView w = tabs.get(call.getString("id", ""));
            String q = call.getString("q", "");
            if (w != null) { if (q == null || q.isEmpty()) w.clearMatches(); else w.findAllAsync(q); }
            call.resolve();
        });
    }

    @PluginMethod
    public void findNext(final PluginCall call) {
        ui(() -> {
            WebView w = tabs.get(call.getString("id", ""));
            if (w != null) w.findNext(!Boolean.FALSE.equals(call.getBoolean("fwd", true)));
            call.resolve();
        });
    }

    @PluginMethod
    public void exec(final PluginCall call) {
        ui(() -> {
            WebView w = tabs.get(call.getString("id", ""));
            if (w != null) w.evaluateJavascript(call.getString("code", ""), null);
            call.resolve();
        });
    }

    // ---------- settings, cookies, extensions ----------

    @PluginMethod
    public void set(final PluginCall call) {
        ui(() -> {
            js = !Boolean.FALSE.equals(call.getBoolean("js", js));
            tpc = !Boolean.FALSE.equals(call.getBoolean("tpc", tpc));
            ads = !Boolean.FALSE.equals(call.getBoolean("ads", ads));
            popups = !Boolean.FALSE.equals(call.getBoolean("popups", popups));
            try {
                JSONObject d = call.getData();
                if (d.has("sub")) subSet = toSet(d.optJSONArray("sub"));
                if (d.has("site")) siteSet = toSet(d.optJSONArray("site"));
            } catch (Throwable ignored) { }
            zoom = Math.max(50, Math.min(200, call.getInt("zoom", zoom)));
            for (WebView w : tabs.values()) {
                boolean desk = Boolean.TRUE.equals(w.getTag());
                applySettings(w, desk);
            }
            call.resolve();
        });
    }

    /** Extensions: [{id, matches:[...], js, css}]. Run on matching pages, CSS early and JS when the page has loaded. */
    @PluginMethod
    public void scripts(final PluginCall call) {
        ui(() -> {
            scripts.clear();
            try {
                JSArray list = call.getArray("list");
                for (int i = 0; list != null && i < list.length(); i++) {
                    JSONObject o = list.getJSONObject(i);
                    Script s = new Script();
                    s.id = o.optString("id", "x").replaceAll("[^A-Za-z0-9_-]", "");
                    s.js = o.optString("js", "");
                    s.css = o.optString("css", "");
                    JSONArray m = o.optJSONArray("matches");
                    if (m == null || m.length() == 0) s.pats.add(Pattern.compile(".*"));
                    for (int k = 0; m != null && k < m.length(); k++) addPattern(s, m.optString(k, ""));
                    scripts.add(s);
                }
            } catch (Throwable ignored) { }
            call.resolve();
        });
    }

    private static void addPattern(Script s, String g) {
        g = g.trim();
        if (g.isEmpty()) return;
        if (g.equals("*") || g.equals("<all_urls>")) { s.pats.add(Pattern.compile(".*")); return; }
        if (!g.contains("://")) { glob(s, "*://" + g + "/*"); glob(s, "*://*." + g + "/*"); glob(s, "*://" + g); return; }
        glob(s, g);
    }

    private static void glob(Script s, String g) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < g.length(); i++) {
            char c = g.charAt(i);
            if (c == '*') sb.append(".*"); else sb.append(Pattern.quote(String.valueOf(c)));
        }
        s.pats.add(Pattern.compile(sb.toString()));
    }

    private void inject(WebView v, String url, boolean cssOnly) {
        if (url == null || !url.startsWith("http")) return;
        for (Script s : scripts) {
            if (!s.match(url)) continue;
            if (!s.css.isEmpty()) {
                v.evaluateJavascript("(function(){try{var id='cdnx-" + s.id + "';if(document.getElementById(id))return;var e=document.createElement('style');e.id=id;e.textContent="
                    + JSONObject.quote(s.css) + ";(document.head||document.documentElement).appendChild(e)}catch(_){}})()", null);
            }
            if (!cssOnly && !s.js.isEmpty()) {
                v.evaluateJavascript("(function(){var k='__cdnx_" + s.id + "';if(window[k])return;window[k]=1;try{\n" + s.js
                    + "\n}catch(e){console.error('Conduint extension " + s.id + ":',e)}})()", null);
            }
        }
    }

    @PluginMethod
    public void cookies(final PluginCall call) {
        ui(() -> {
            String c = CookieManager.getInstance().getCookie(call.getString("url", ""));
            JSObject o = new JSObject();
            o.put("cookie", c == null ? "" : c);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void delcookie(final PluginCall call) {
        ui(() -> {
            String url = call.getString("url", "");
            String name = call.getString("name", "");
            CookieManager cm = CookieManager.getInstance();
            try {
                String hostName = Uri.parse(url).getHost();
                String exp = name + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/";
                cm.setCookie(url, exp);
                while (hostName != null && hostName.contains(".")) {
                    cm.setCookie(url, exp + "; Domain=" + hostName);
                    cm.setCookie(url, exp + "; Domain=." + hostName);
                    int dot = hostName.indexOf('.');
                    hostName = hostName.substring(dot + 1);
                }
                cm.flush();
            } catch (Throwable ignored) { }
            call.resolve();
        });
    }

    @PluginMethod
    public void clear(final PluginCall call) {
        ui(() -> {
            if (Boolean.TRUE.equals(call.getBoolean("cookies", false))) {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
            }
            if (Boolean.TRUE.equals(call.getBoolean("storage", false))) WebStorage.getInstance().deleteAllData();
            if (Boolean.TRUE.equals(call.getBoolean("cache", false))) for (WebView w : tabs.values()) w.clearCache(true);
            if (Boolean.TRUE.equals(call.getBoolean("history", false))) for (WebView w : tabs.values()) w.clearHistory();
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        try { CookieManager.getInstance().flush(); } catch (Throwable ignored) { }
    }

    @Override
    protected void handleOnDestroy() {
        for (WebView w : tabs.values()) { try { w.destroy(); } catch (Throwable ignored) { } }
        tabs.clear();
        ids.clear();
    }

    // ---------- events ----------

    private void state(WebView w) {
        String id = ids.get(w);
        if (id == null) return;
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("url", w.getUrl() == null ? "" : w.getUrl());
        o.put("title", w.getTitle() == null ? "" : w.getTitle());
        o.put("progress", w.getProgress());
        o.put("back", w.canGoBack());
        o.put("fwd", w.canGoForward());
        emit("state", o);
    }

    private int dlSeq = 0;

    private static final class DlErr extends java.io.IOException {
        final int code;
        DlErr(int code) { super("download error " + code); this.code = code; }
    }

    private static String cleanName(String n) {
        String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.isEmpty()) s = "download";
        return s.length() > 150 ? s.substring(s.length() - 150) : s;
    }

    /**
     * V0.32.2: downloads run inside Conduint, not in Android's system DownloadManager. The system downloader lives in another
     * process, and with a VPN on it fails with the bare "Download unsuccessful" (no reason, no retry). Here the file is fetched by
     * the app itself, so it goes through the same tunnel as the pages, follows redirects, sends cookies, Referer and the browser's
     * User-Agent, retries and resumes a broken connection, saves into Downloads, and reports the real reason when it fails.
     * Events: "download" {name,url,mime,size,ok,id,error} once, then "dlstate" {id,name,url,status,reason,done,total}.
     * status: 2 running, 8 done, 16 failed. reason: an HTTP code or 1001-1012.
     */
    private void download(final String url, final String agent, final String disp, final String mime, long len, final String page) {
        JSObject o = new JSObject();
        final String name = cleanName(URLUtil.guessFileName(url, disp, mime));
        o.put("name", name);
        o.put("url", url == null ? "" : url);
        o.put("mime", mime == null ? "" : mime);
        o.put("size", len);
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            o.put("ok", false);
            o.put("error", "Only web addresses can be downloaded here.");
            emit("download", o);
            return;
        }
        final String id = "d" + System.currentTimeMillis() + "_" + (dlSeq++);
        o.put("ok", true);
        o.put("id", id);
        emit("download", o);
        final boolean named = disp != null && !disp.isEmpty();
        new Thread(() -> runDownload(id, name, named, url, agent, mime, page)).start();
    }

    private void dlEmit(String id, String name, String url, int status, int reason, long done, long total) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("name", name);
        o.put("url", url);
        o.put("status", status);
        o.put("reason", reason);
        o.put("done", done);
        o.put("total", total);
        emit("dlstate", o);
    }

    private HttpURLConnection dlOpen(String start, String agent, String page, long from) throws java.io.IOException {
        String u = start;
        for (int hop = 0; hop < 10; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(25000);
            c.setReadTimeout(40000);
            c.setRequestProperty("User-Agent", agent != null && !agent.isEmpty() ? agent : (baseUa == null ? "Mozilla/5.0" : baseUa));
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Encoding", "identity");
            String ck = null;
            try { ck = CookieManager.getInstance().getCookie(u); } catch (Throwable ignore) { }
            if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck);
            if (page != null && page.startsWith("http")) c.setRequestProperty("Referer", page);
            if (from > 0) c.setRequestProperty("Range", "bytes=" + from + "-");
            int code = c.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null || loc.isEmpty()) throw new DlErr(1002);
                u = new URL(new URL(u), loc).toString();
                continue;
            }
            return c;
        }
        throw new DlErr(1005);
    }

    private static int dlReason(Throwable t) {
        if (t instanceof DlErr) return ((DlErr) t).code;
        if (t instanceof java.net.UnknownHostException) return 1010;
        if (t instanceof java.net.SocketTimeoutException || t instanceof java.net.ConnectException || t instanceof java.net.NoRouteToHostException) return 1011;
        if (t instanceof javax.net.ssl.SSLException) return 1012;
        String m = String.valueOf(t.getMessage()).toLowerCase();
        if (m.contains("enospc") || m.contains("no space")) return 1006;
        return 1004;
    }

    private static File dlUnique(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            f = new File(dir, stem + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, stem + "_" + System.currentTimeMillis() + ext);
    }

    private void runDownload(String id, String name, boolean named, String url, String agent, String mime, String page) {
        Context ctx = getContext().getApplicationContext();
        android.content.ContentResolver cr = ctx.getContentResolver();
        Uri outUri = null;
        File outFile = null;
        java.io.OutputStream os = null;
        long done = 0, total = -1;
        int reason = 1004;
        boolean ok = false;
        try {
            dlEmit(id, name, url, 2, 0, 0, -1);
            int fails = 0;
            boolean complete = false;
            while (!complete) {
                HttpURLConnection c = null;
                try {
                    c = dlOpen(url, agent, page, done);
                    int code = c.getResponseCode();
                    if (code == 416 && done > 0) { complete = true; break; }
                    if (code >= 400) throw new DlErr(code);
                    if (done > 0 && code != 206) throw new DlErr(1008);
                    if (os == null) {
                        String ct = c.getContentType();
                        if (ct != null && ct.indexOf(';') > 0) ct = ct.substring(0, ct.indexOf(';')).trim();
                        String mt = (mime == null || mime.isEmpty() || mime.equals("application/octet-stream")) && ct != null && !ct.isEmpty() ? ct : mime;
                        if (!named) {
                            String cd = c.getHeaderField("Content-Disposition");
                            if (cd != null && !cd.isEmpty()) name = cleanName(URLUtil.guessFileName(url, cd, mt));
                        }
                        String ext = android.webkit.MimeTypeMap.getFileExtensionFromUrl(name);
                        if ((mt == null || mt.isEmpty() || mt.equals("application/octet-stream")) && ext != null && !ext.isEmpty()) {
                            String g = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
                            if (g != null) mt = g;
                        }
                        if (mt == null || mt.isEmpty()) mt = "application/octet-stream";
                        if (Build.VERSION.SDK_INT >= 29) {
                            ContentValues v = new ContentValues();
                            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                            v.put(MediaStore.MediaColumns.MIME_TYPE, mt);
                            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                            outUri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                            if (outUri == null) throw new DlErr(1007);
                            os = cr.openOutputStream(outUri);
                        } else {
                            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                            dir.mkdirs();
                            outFile = dlUnique(dir, name);
                            os = new FileOutputStream(outFile);
                        }
                        if (os == null) throw new DlErr(1007);
                        long cl = c.getContentLengthLong();
                        total = cl > 0 ? cl : -1;
                    }
                    java.io.InputStream in = c.getInputStream();
                    byte[] buf = new byte[65536];
                    int n;
                    long lastTick = 0;
                    while ((n = in.read(buf)) > 0) {
                        try { os.write(buf, 0, n); } catch (java.io.IOException we) { throw new DlErr(dlReason(we) == 1006 ? 1006 : 1001); }
                        done += n;
                        long now = System.currentTimeMillis();
                        if (now - lastTick > 600) { lastTick = now; dlEmit(id, name, url, 2, 0, done, total); }
                    }
                    if (total > 0 && done < total) throw new java.io.IOException("short");
                    complete = true;
                } catch (DlErr e) {
                    if (e.code == 1006 || e.code == 1001 || e.code == 1007 || e.code == 1008 || e.code == 1005 || e.code == 1002 || (e.code >= 400 && e.code < 500 && e.code != 408 && e.code != 429)) throw e;
                    if (++fails > 4) throw e;
                    Thread.sleep(2000L * fails);
                } catch (java.io.IOException e) {
                    if (++fails > 4) throw e;
                    Thread.sleep(2000L * fails);
                } finally {
                    if (c != null) c.disconnect();
                }
            }
            os.flush();
            os.close();
            os = null;
            if (outUri != null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(outUri, v, null, null);
            } else if (outFile != null) {
                android.media.MediaScannerConnection.scanFile(ctx, new String[]{outFile.getAbsolutePath()}, null, null);
            }
            ok = true;
            dlEmit(id, name, url, 8, 0, done, done);
        } catch (Throwable t) {
            reason = dlReason(t);
        } finally {
            try { if (os != null) os.close(); } catch (Throwable ignore) { }
            if (!ok) {
                try { if (outUri != null) cr.delete(outUri, null, null); } catch (Throwable ignore) { }
                try { if (outFile != null) outFile.delete(); } catch (Throwable ignore) { }
                dlEmit(id, name, url, 16, reason, done, total);
            }
        }
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private void errorPage(WebView v, String url, String head, String why) {
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style=\"margin:0;background:#0b0f12;color:#e8eef1;"
            + "font:16px system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center\"><div style='padding:28px;max-width:420px'>"
            + "<div style='font-size:42px'>&#9888;</div><h2 style='margin:.3em 0'>" + esc(head) + "</h2>"
            + "<p style='color:#8a9aa3;word-break:break-all'>" + esc(url) + "</p><p style='color:#8a9aa3'>" + esc(why) + "</p>"
            + "<a href=\"" + esc(url) + "\" style='display:inline-block;margin-top:10px;padding:10px 18px;border-radius:999px;background:#00e5ff;color:#000;text-decoration:none;font-weight:700'>Reload</a></div>";
        v.loadDataWithBaseURL(url, html, "text/html", "UTF-8", url);
    }

    // V0.32.1: lists pushed from the app. sub = ads and trackers (blocked as page parts), site = adult, gambling, shopping and your own list (blocked as whole pages too).
    private volatile HashSet<String> subSet = new HashSet<>(), siteSet = new HashSet<>();

    private static HashSet<String> toSet(JSONArray a) {
        HashSet<String> out = new HashSet<>();
        if (a == null) return out;
        for (int i = 0; i < a.length() && i < 20000; i++) {
            String d = a.optString(i, "").trim().toLowerCase();
            if (!d.isEmpty() && d.length() < 254) out.add(d);
        }
        return out;
    }

    private static boolean inSet(HashSet<String> set, String host) {
        if (host == null || set.isEmpty()) return false;
        String h = host.toLowerCase();
        while (true) {
            if (set.contains(h)) return true;
            int i = h.indexOf('.');
            if (i < 0) return false;
            h = h.substring(i + 1);
        }
    }

    private static boolean blocked(String host) {
        if (host == null) return false;
        for (String d : AD) if (host.equals(d) || host.endsWith("." + d)) return true;
        return false;
    }

    // ---------- clients ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            String u = r.getUrl().toString();
            String sc = r.getUrl().getScheme() == null ? "" : r.getUrl().getScheme().toLowerCase();
            if (sc.equals("http") || sc.equals("https") || sc.equals("about") || sc.equals("data") || sc.equals("blob") || sc.equals("javascript")) return false;
            try {
                Intent i = sc.equals("intent") ? Intent.parseUri(u, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, r.getUrl());
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                getActivity().startActivity(i);
            } catch (ActivityNotFoundException ignored) {
            } catch (Throwable ignored) { }
            return true;
        }

        @Override public void onPageStarted(WebView v, String url, Bitmap icon) { inject(v, url, true); state(v); }
        @Override public void onPageCommitVisible(WebView v, String url) { inject(v, url, true); }

        @Override
        public void onPageFinished(WebView v, String url) {
            try { CookieManager.getInstance().flush(); } catch (Throwable ignored) { }
            inject(v, url, false);
            state(v);
        }

        @Override public void doUpdateVisitedHistory(WebView v, String url, boolean isReload) { state(v); }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (!r.isForMainFrame()) return;
            errorPage(v, r.getUrl().toString(), "This site can\u2019t be reached", String.valueOf(e.getDescription()));
        }

        @Override
        public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) {
            h.cancel();
            errorPage(v, e.getUrl(), "Your connection is not private", "The site\u2019s security certificate could not be trusted, so Conduint stopped.");
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            String bh = r.getUrl().getHost();
            if (inSet(siteSet, bh)) {
                if (r.isForMainFrame()) {
                    String page = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body style='margin:0;background:#05090b;color:#e6f4f1;font:16px sans-serif;display:grid;place-items:center;height:100vh;text-align:center'><div style='padding:24px'><div style='font-size:42px'>&#128737;</div><h2>Blocked by Conduint</h2><p style='color:#8a9aa3;word-break:break-all'>" + esc(bh) + "</p><p style='color:#8a9aa3'>This site is in a category you chose to block. Change it in Browser &gt; Settings &gt; Blocking.</p></div></body></html>";
                    return new WebResourceResponse("text/html", "utf-8", new ByteArrayInputStream(page.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                }
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            if (!r.isForMainFrame() && inSet(subSet, bh)) {
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            if (ads && !r.isForMainFrame() && blocked(r.getUrl().getHost())) {
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            return null;
        }

        @Override
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
            String id = ids.get(v);
            if (id != null) {
                tabs.remove(id);
                ids.remove(v);
                if (host != null) host.removeView(v);
                if (id.equals(cur)) cur = "";
                JSObject o = new JSObject();
                o.put("id", id);
                emit("crash", o);
            }
            try { v.destroy(); } catch (Throwable ignored) { }
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override public void onProgressChanged(WebView v, int p) { state(v); }
        @Override public void onReceivedTitle(WebView v, String t) { state(v); }

        @Override
        public boolean onCreateWindow(WebView v, boolean isDialog, boolean isUserGesture, Message msg) {
            if (popups && !isUserGesture) return false;
            String nid = "p" + (++popupSeq) + "x" + (System.currentTimeMillis() % 100000);
            WebView nw = make(nid, Boolean.TRUE.equals(v.getTag()));
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(nw);
            msg.sendToTarget();
            JSObject o = new JSObject();
            o.put("id", nid);
            o.put("opener", ids.get(v));
            emit("newtab", o);
            return true;
        }

        @Override
        public void onCloseWindow(WebView v) {
            String id = ids.get(v);
            if (id == null) return;
            JSObject o = new JSObject();
            o.put("id", id);
            emit("closetab", o);
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                getActivity().startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (Throwable e) {
                fileCb = null;
                return false;
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) {
            if (customView != null) { cb.onCustomViewHidden(); return; }
            customView = view;
            customCb = cb;
            view.setBackgroundColor(Color.BLACK);
            ViewGroup content = getActivity().findViewById(android.R.id.content);
            content.addView(view, new FrameLayout.LayoutParams(-1, -1));
            getActivity().getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            ViewGroup content = getActivity().findViewById(android.R.id.content);
            content.removeView(customView);
            customView = null;
            getActivity().getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            if (customCb != null) customCb.onCustomViewHidden();
            customCb = null;
        }
    }
}
