package com.fezzy.conduint;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** V0.15.0: a file another app opened with Conduint (VIEW intent). ToolsPlugin.incoming() hands it to the web side once. */
    static Uri incomingUri;
    static String incomingMime;
    static synchronized Uri takeIncoming() { Uri u = incomingUri; incomingUri = null; return u; }
    private static synchronized void keep(Intent i) {
        if (i != null && Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) { incomingUri = i.getData(); incomingMime = i.getType(); }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keep(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafPlugin.class);
        registerPlugin(ToolsPlugin.class);
        registerPlugin(LockPlugin.class);
        registerPlugin(PlayerPlugin.class);
        registerPlugin(ZiplinerPlugin.class);
        registerPlugin(BrowserPlugin.class);
        registerPlugin(VpnPlugin.class);
        registerPlugin(WatchPlugin.class);
        registerPlugin(WifiPlugin.class);
        registerPlugin(CredPlugin.class);
        registerPlugin(FBCredentialPlugin.class);
        registerPlugin(ContactsPlugin.class);
        registerPlugin(ConvertPlugin.class);
        super.onCreate(savedInstanceState);
        keep(getIntent());
        // V0.34.1: Android's Back (button and gesture) is handled here, not left to web history. It asks the page to close the
        // top-most thing (menu, dialog, Passwords, Tools, folder...) and only when the page has nothing left to close does
        // Conduint go to the background (like Home), so Back never closes the app from inside a screen.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() { cndBack(); }
        });
    }

    private void cndBack() {
        final java.util.concurrent.atomic.AtomicBoolean answered = new java.util.concurrent.atomic.AtomicBoolean(false);
        final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        final Runnable away = new Runnable() {
            @Override public void run() {
                if (answered.compareAndSet(false, true)) { try { moveTaskToBack(true); } catch (Throwable ignored) { } }
            }
        };
        try {
            android.webkit.WebView w = getBridge().getWebView();
            // if the page does not answer in 1.5 seconds (frozen or failed to load) Back sends the app to the background
            h.postDelayed(away, 1500);
            w.evaluateJavascript("(function(){try{return window.__cndBack?window.__cndBack():0}catch(e){return 0}})()", new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    h.removeCallbacks(away);
                    if (!answered.compareAndSet(false, true)) return;
                    if (!"1".equals(v)) { try { moveTaskToBack(true); } catch (Throwable ignored) { } }
                }
            });
        } catch (Throwable t) {
            away.run();
        }
    }

    /**
     * While a song is playing the web view must keep running in the background, otherwise the notification buttons
     * (play / pause / next / previous) and the next-song step would wait until the app is opened again.
     */
    @Override
    public void onPause() {
        super.onPause();
        keepWebAlive();
    }

    /** V0.27.0: the folder watcher's checks run in the web view, so it stays running while KeepService is on (screen off too). */
    @Override
    public void onStop() {
        super.onStop();
        keepWebAlive();
    }

    private void keepWebAlive() {
        try {
            if ((MediaService.running || KeepService.running) && getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().onResume();
                getBridge().getWebView().resumeTimers();
            }
        } catch (Throwable ignored) { }
    }

    /** The browser's website file picker (upload buttons on web pages) answers here. */
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        BrowserPlugin.fileResult(requestCode, resultCode, data);
    }
}
