package com.fezzy.conduint;

import android.annotation.TargetApi;
import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.text.InputType;
import android.util.Pair;
import android.view.View;
import android.view.ViewStructure;
import android.view.autofill.AutofillId;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

/**
 * AutofillSvc (V0.29.0): fills user names and passwords in other apps and in the browser.
 * It finds the login fields on screen, looks for saved passwords whose site matches (CredStore.match), and offers them as locked datasets.
 * Nothing is released until AutofillAuthActivity has asked for the fingerprint or screen lock.
 * Only passwords the person chose to share (Authenticator > Passkeys and autofill) are ever here. Saving new logins is not offered.
 */
@TargetApi(26)
public class AutofillSvc extends AutofillService {

    private static final class Found {
        AutofillId user, pass;
        String domain;
    }

    @Override
    public void onFillRequest(FillRequest request, CancellationSignal signal, FillCallback callback) {
        try {
            List<FillContext> ctx = request.getFillContexts();
            if (ctx == null || ctx.isEmpty()) {
                callback.onSuccess(null);
                return;
            }
            AssistStructure st = ctx.get(ctx.size() - 1).getStructure();
            Found f = new Found();
            for (int i = 0; i < st.getWindowNodeCount(); i++) walk(st.getWindowNodeAt(i).getRootViewNode(), f);
            if (f.pass == null) {
                callback.onSuccess(null);
                return;
            }
            String pkg = st.getActivityComponent() == null ? "" : st.getActivityComponent().getPackageName();
            if (getPackageName().equals(pkg)) {
                callback.onSuccess(null);
                return;
            }
            List<JSONObject> hits = CredStore.match(this, f.domain, pkg);
            if (hits.isEmpty()) {
                callback.onSuccess(null);
                return;
            }
            FillResponse.Builder fr = new FillResponse.Builder();
            for (JSONObject h : hits) {
                Intent i = new Intent(this, AutofillAuthActivity.class)
                        .putExtra(AutofillAuthActivity.X_ID, h.optInt("id", -1))
                        .putExtra(AutofillAuthActivity.X_USER_NAME, h.optString("u"))
                        .putExtra(AutofillAuthActivity.X_PASS, f.pass);
                if (f.user != null) i.putExtra(AutofillAuthActivity.X_USER, f.user);
                int fl = PendingIntent.FLAG_CANCEL_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pi = PendingIntent.getActivity(this, 9000 + h.optInt("id", 0), i, fl);
                Dataset.Builder ds = new Dataset.Builder(row(h.optString("t"), h.optString("u")));
                if (f.user != null) ds.setValue(f.user, null);
                ds.setValue(f.pass, null);
                ds.setAuthentication(pi.getIntentSender());
                fr.addDataset(ds.build());
            }
            callback.onSuccess(fr.build());
        } catch (Throwable t) {
            callback.onFailure(null);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        callback.onSuccess();
    }

    RemoteViews row(String title, String user) {
        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.cnd_af_item);
        rv.setTextViewText(R.id.cnd_af_t, title == null || title.isEmpty() ? "Conduint" : title);
        rv.setTextViewText(R.id.cnd_af_u, user == null || user.isEmpty() ? "Fill password" : user);
        return rv;
    }

    /** Looks at one screen element (and everything inside it): picks out the password field, the user name field before it, and the web domain. */
    private void walk(AssistStructure.ViewNode n, Found f) {
        String web = n.getWebDomain();
        if (web != null && !web.isEmpty() && f.domain == null) f.domain = web;
        AutofillId id = n.getAutofillId();
        if (id != null && n.getAutofillType() == View.AUTOFILL_TYPE_TEXT && f.pass == null) {
            boolean pass = false, user = false;
            String[] hints = n.getAutofillHints();
            if (hints != null) for (String h : hints) {
                if (View.AUTOFILL_HINT_PASSWORD.equals(h)) pass = true;
                else if (View.AUTOFILL_HINT_USERNAME.equals(h) || View.AUTOFILL_HINT_EMAIL_ADDRESS.equals(h)) user = true;
            }
            if (!pass && !user) {
                int it = n.getInputType();
                if ((it & InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_TEXT) {
                    int v = it & InputType.TYPE_MASK_VARIATION;
                    if (v == InputType.TYPE_TEXT_VARIATION_PASSWORD || v == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD || v == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD) pass = true;
                    else if (v == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS || v == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS) user = true;
                }
                ViewStructure.HtmlInfo hi = n.getHtmlInfo();
                if (hi != null && "input".equalsIgnoreCase(hi.getTag()) && hi.getAttributes() != null) {
                    String type = "", label = "";
                    for (Pair<String, String> a : hi.getAttributes()) {
                        if ("type".equalsIgnoreCase(a.first)) type = a.second == null ? "" : a.second.toLowerCase();
                        else if (("name".equalsIgnoreCase(a.first) || "id".equalsIgnoreCase(a.first) || "autocomplete".equalsIgnoreCase(a.first)) && a.second != null) label += " " + a.second.toLowerCase();
                    }
                    if (type.equals("password")) pass = true;
                    else if (type.equals("email") || (type.equals("text") || type.isEmpty()) && (label.contains("user") || label.contains("email") || label.contains("login"))) user = true;
                }
            }
            if (pass) f.pass = id;
            else if (user) f.user = id;
        }
        for (int i = 0; i < n.getChildCount(); i++) walk(n.getChildAt(i), f);
    }
}
