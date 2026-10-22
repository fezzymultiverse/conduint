package com.fezzy.conduint;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.service.autofill.Dataset;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * AutofillAuthActivity (V0.29.0): the lock in front of every autofilled password. Android opens it when the person taps a Conduint
 * suggestion. It asks for the fingerprint or screen lock, and only then returns the real user name and password to the app.
 */
@TargetApi(26)
public class AutofillAuthActivity extends Activity {
    static final String X_ID = "cnd_id", X_USER_NAME = "cnd_un", X_USER = "cnd_uid", X_PASS = "cnd_pid";

    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        try {
            final Intent in = getIntent();
            final AutofillId pid = in.getParcelableExtra(X_PASS), uid = in.getParcelableExtra(X_USER);
            if (pid == null) throw new IllegalStateException("No password field");
            Gate.ask(this, "Fill password with Conduint", new Gate.Done() {
                @Override
                public void ok() {
                    try {
                        JSONArray all = CredStore.passwords(AutofillAuthActivity.this);
                        JSONObject e = all.optJSONObject(in.getIntExtra(X_ID, -1));
                        if (e == null || !e.optString("u").equals(in.getStringExtra(X_USER_NAME))) throw new IllegalStateException("That password changed. Try again.");
                        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.cnd_af_item);
                        rv.setTextViewText(R.id.cnd_af_t, e.optString("t"));
                        Dataset.Builder ds = new Dataset.Builder(rv);
                        if (uid != null) ds.setValue(uid, AutofillValue.forText(e.optString("u")));
                        ds.setValue(pid, AutofillValue.forText(e.optString("p")));
                        Intent r = new Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, ds.build());
                        setResult(RESULT_OK, r);
                    } catch (Throwable t) {
                        setResult(RESULT_CANCELED);
                    }
                    finish();
                }

                @Override
                public void no(String why) {
                    setResult(RESULT_CANCELED);
                    finish();
                }
            });
        } catch (Throwable t) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }
}
