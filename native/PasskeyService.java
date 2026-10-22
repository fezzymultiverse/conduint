package com.fezzy.conduint;

import android.annotation.TargetApi;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.OutcomeReceiver;

import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.CreateCredentialUnknownException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialUnknownException;
import androidx.credentials.provider.BeginCreateCredentialRequest;
import androidx.credentials.provider.BeginCreateCredentialResponse;
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest;
import androidx.credentials.provider.BeginGetCredentialOption;
import androidx.credentials.provider.BeginGetCredentialRequest;
import androidx.credentials.provider.BeginGetCredentialResponse;
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption;
import androidx.credentials.provider.CreateEntry;
import androidx.credentials.provider.CredentialEntry;
import androidx.credentials.provider.CredentialProviderService;
import androidx.credentials.provider.ProviderClearCredentialStateRequest;
import androidx.credentials.provider.PublicKeyCredentialEntry;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * PasskeyService (V0.29.0): Conduint as a passkey provider for Android's Credential Manager (Android 14+).
 * Android calls this service to ask "can you create a passkey?" and "do you hold a passkey for this site?". The answers are entries the
 * person taps in the system sheet; a tap opens PasskeyActivity, which asks for the fingerprint or screen lock and does the real work.
 * Passkeys only (no passwords here: passwords go through the autofill service).
 */
@TargetApi(34)
public class PasskeyService extends CredentialProviderService {

    private static int flags() { return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0); }

    @Override
    public void onBeginCreateCredentialRequest(BeginCreateCredentialRequest request, CancellationSignal signal,
                                               OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException> callback) {
        try {
            if (request instanceof BeginCreatePublicKeyCredentialRequest) {
                Intent i = new Intent(this, PasskeyActivity.class).setAction(PasskeyActivity.ACT_CREATE);
                PendingIntent pi = PendingIntent.getActivity(this, 7001, i, flags());
                CreateEntry e = new CreateEntry.Builder("Conduint passkeys", pi).setDescription("Save this passkey on this phone with Conduint").build();
                callback.onResult(new BeginCreateCredentialResponse.Builder().addCreateEntry(e).build());
                return;
            }
            callback.onError(new CreateCredentialUnknownException());
        } catch (Throwable t) {
            callback.onError(new CreateCredentialUnknownException());
        }
    }

    @Override
    public void onBeginGetCredentialRequest(BeginGetCredentialRequest request, CancellationSignal signal,
                                            OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException> callback) {
        try {
            List<CredentialEntry> out = new ArrayList<>();
            for (BeginGetCredentialOption o : request.getBeginGetCredentialOptions()) {
                if (!(o instanceof BeginGetPublicKeyCredentialOption)) continue;
                BeginGetPublicKeyCredentialOption opt = (BeginGetPublicKeyCredentialOption) o;
                JSONObject j = new JSONObject(opt.getRequestJson());
                String rp = j.optString("rpId");
                Set<String> allow = new HashSet<>();
                JSONArray ac = j.optJSONArray("allowCredentials");
                if (ac != null) for (int k = 0; k < ac.length(); k++) {
                    JSONObject c = ac.optJSONObject(k);
                    if (c != null && !c.optString("id").isEmpty()) allow.add(c.optString("id"));
                }
                for (JSONObject r : CredStore.forRp(this, rp)) {
                    String id = r.getString("id");
                    if (!allow.isEmpty() && !allow.contains(id)) continue;
                    Intent i = new Intent(this, PasskeyActivity.class).setAction(PasskeyActivity.ACT_GET).putExtra(PasskeyActivity.EXTRA_ID, id);
                    PendingIntent pi = PendingIntent.getActivity(this, id.hashCode(), i, flags());
                    String user = r.optString("user"), disp = r.optString("display");
                    PublicKeyCredentialEntry.Builder b = new PublicKeyCredentialEntry.Builder(this, user.isEmpty() ? (disp.isEmpty() ? rp : disp) : user, pi, opt);
                    if (!disp.isEmpty()) b.setDisplayName(disp);
                    out.add(b.build());
                }
            }
            callback.onResult(new BeginGetCredentialResponse.Builder().setCredentialEntries(out).build());
        } catch (Throwable t) {
            callback.onError(new GetCredentialUnknownException());
        }
    }

    @Override
    public void onClearCredentialStateRequest(ProviderClearCredentialStateRequest request, CancellationSignal signal,
                                              OutcomeReceiver<Void, ClearCredentialException> callback) {
        callback.onResult(null);
    }
}
