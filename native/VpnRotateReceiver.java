package com.fezzy.conduint;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * VpnRotateReceiver: answers the rotation alarm and the notification buttons (V0.26.0).
 * The work runs on a background thread (goAsync) because switching servers takes a few seconds.
 * A failed rotation never throws: the reason is stored and shown in the VPN screen.
 */
public class VpnRotateReceiver extends BroadcastReceiver {
    @Override public void onReceive(final Context ctx, Intent intent) {
        final String a = intent == null ? "" : String.valueOf(intent.getAction());
        final Context c = ctx.getApplicationContext();
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                if (VpnCore.ACTION_STOP.equals(a)) {
                    VpnCore.disconnect(c);
                } else if (VpnCore.ACTION_ROTATE.equals(a) || VpnCore.ACTION_NEXT.equals(a)) {
                    if (VpnCore.isUp()) VpnCore.rotateNow(c);
                }
            } catch (Throwable t) {
                VpnCore.setError(VpnCore.explain(t)[1]);
                VpnKeeper.refresh(c);
            } finally {
                try { if (VpnCore.isUp()) VpnCore.scheduleNext(c); } catch (Throwable ignore) { }
                pr.finish();
            }
        }).start();
    }
}
