/* Example bridge usage for classic-script projects. This file is documentation/example code and is not loaded by index.html. */
(function (global) {
  function getFBCredentialPlugin() {
    const cap = global.Capacitor;
    const plugin = cap && cap.Plugins && cap.Plugins.FBCredentialPlugin;
    if (!plugin) throw new Error('FBCredentialPlugin is unavailable. Rebuild/sync the Android app.');
    return plugin;
  }

  global.createConduintPasskey = async function (requestJson) {
    const result = await getFBCredentialPlugin().createPasskey({
      requestJson: typeof requestJson === 'string' ? requestJson : JSON.stringify(requestJson)
    });
    return result; // Send registrationResponseJson to your WebAuthn server for verification.
  };

  global.signInWithConduintPasskey = async function (requestJson) {
    const result = await getFBCredentialPlugin().getPasskey({
      requestJson: typeof requestJson === 'string' ? requestJson : JSON.stringify(requestJson)
    });
    return result; // Send authenticationResponseJson to your WebAuthn server for verification.
  };
})(globalThis);
