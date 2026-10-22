package com.fezzy.conduint;

import android.os.CancellationSignal;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePublicKeyCredentialRequest;
import androidx.credentials.CreatePublicKeyCredentialResponse;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.GetPublicKeyCredentialOption;
import androidx.credentials.PublicKeyCredential;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.Executor;

/**
 * App-side WebAuthn/passkey calls exposed to Capacitor JavaScript.
 * Credential Manager owns the system credential UI and authenticator
 * verification. Passkey-provider behavior remains in PasskeyService.
 * The relying-party server must verify every returned WebAuthn response.
 */
@CapacitorPlugin(name = "FBCredentialPlugin")
public final class FBCredentialPlugin extends Plugin {
    private CredentialManager credentialManager;
    private Executor mainExecutor;

    @Override
    public void load() {
        super.load();
        credentialManager = CredentialManager.create(getContext());
        mainExecutor = ContextCompat.getMainExecutor(getContext());
    }

    /** Create a passkey from server-generated WebAuthn creation options. */
    @PluginMethod
    public void createPasskey(PluginCall call) {
        final String requestJson = call.getString("requestJson");
        if (!validateRequest(call, requestJson, true)) return;

        final CreatePublicKeyCredentialRequest request;
        try {
            request = new CreatePublicKeyCredentialRequest(requestJson);
        } catch (Exception e) {
            call.reject("Invalid passkey creation options: " + messageOf(e), e);
            return;
        }

        try {
            credentialManager.createCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                mainExecutor,
                new androidx.credentials.CredentialManagerCallback<
                    CreateCredentialResponse, CreateCredentialException
                >() {
                    @Override
                    public void onResult(@NonNull CreateCredentialResponse result) {
                        if (!(result instanceof CreatePublicKeyCredentialResponse)) {
                            call.reject("Credential Manager returned an unexpected passkey creation response.");
                            return;
                        }

                        String responseJson = ((CreatePublicKeyCredentialResponse) result)
                            .getRegistrationResponseJson();
                        if (responseJson == null || responseJson.trim().isEmpty()) {
                            call.reject("Credential Manager returned an empty passkey registration response.");
                            return;
                        }

                        JSObject payload = new JSObject();
                        payload.put("type", "public-key");
                        payload.put("registrationResponseJson", responseJson);
                        // Success is determined only by Credential Manager's response.
                        call.resolve(payload);
                    }

                    @Override
                    public void onError(@NonNull CreateCredentialException error) {
                        call.reject(
                            "Passkey creation failed: " + messageOf(error),
                            error.getType(),
                            error
                        );
                    }
                }
            );
        } catch (Exception e) {
            call.reject("Could not start passkey creation: " + messageOf(e), e);
        }
    }

    /** Authenticate with a passkey using server-generated WebAuthn request options. */
    @PluginMethod
    public void getPasskey(PluginCall call) {
        final String requestJson = call.getString("requestJson");
        if (!validateRequest(call, requestJson, false)) return;

        final GetCredentialRequest request;
        try {
            GetPublicKeyCredentialOption option =
                new GetPublicKeyCredentialOption(requestJson);
            request = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();
        } catch (Exception e) {
            call.reject("Invalid passkey sign-in options: " + messageOf(e), e);
            return;
        }

        try {
            credentialManager.getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                mainExecutor,
                new androidx.credentials.CredentialManagerCallback<
                    GetCredentialResponse, GetCredentialException
                >() {
                    @Override
                    public void onResult(@NonNull GetCredentialResponse result) {
                        Credential credential = result.getCredential();
                        if (!(credential instanceof PublicKeyCredential)) {
                            call.reject("Credential Manager returned a credential that is not a public-key passkey.");
                            return;
                        }

                        String responseJson =
                            ((PublicKeyCredential) credential).getAuthenticationResponseJson();
                        if (responseJson == null || responseJson.trim().isEmpty()) {
                            call.reject("Credential Manager returned an empty passkey authentication response.");
                            return;
                        }

                        JSObject payload = new JSObject();
                        payload.put("type", "public-key");
                        payload.put("authenticationResponseJson", responseJson);
                        // Success is determined only by Credential Manager's response.
                        call.resolve(payload);
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException error) {
                        call.reject(
                            "Passkey sign-in failed: " + messageOf(error),
                            error.getType(),
                            error
                        );
                    }
                }
            );
        } catch (Exception e) {
            call.reject("Could not start passkey sign-in: " + messageOf(e), e);
        }
    }

    /** Validate the basic structure before passing options to Credential Manager. */
    private boolean validateRequest(PluginCall call, String json, boolean creation) {
        if (json == null || json.trim().isEmpty()) {
            call.reject("requestJson is required.");
            return false;
        }

        try {
            JSONObject options = new JSONObject(json);
            if (!options.has("challenge") || options.isNull("challenge")) {
                call.reject("WebAuthn options must contain a challenge.");
                return false;
            }

            if (creation) {
                if (!options.has("rp") || options.isNull("rp")
                    || !options.has("user") || options.isNull("user")
                    || !options.has("pubKeyCredParams") || options.isNull("pubKeyCredParams")) {
                    call.reject("Passkey creation options require rp, user and pubKeyCredParams.");
                    return false;
                }
            } else if (!options.has("rpId") || options.isNull("rpId")
                || options.optString("rpId").trim().isEmpty()) {
                call.reject("Passkey sign-in options require rpId.");
                return false;
            }
            return true;
        } catch (Exception e) {
            call.reject("requestJson must contain valid WebAuthn JSON.", e);
            return false;
        }
    }

    private static String messageOf(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
            ? error.getClass().getSimpleName() : message;
    }
}
