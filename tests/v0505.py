from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
js = (ROOT / 'www/js/pmui.js').read_text()
java = (ROOT / 'native/FBCredentialPlugin.java').read_text()
activity = (ROOT / 'native/MainActivity.java').read_text()
patch = (ROOT / 'scripts/patch-android.sh').read_text()
pkg = json.loads((ROOT / 'package.json').read_text())
checks = {
    'version bumped to 0.50.5': pkg['version'] == '0.50.5',
    'Password Manager renders direct passkey panel': 'pmFbPasskeyPanel(B);' in js,
    'Create Passkey action calls native plugin': "'createPasskey'" in js and "mk('Create Passkey'" in js,
    'Sign In with Passkey action calls native plugin': "'getPasskey'" in js and "mk('Sign In with Passkey'" in js,
    'registration response is checked and displayed': 'registrationResponseJson' in js and 'output.value=JSON.stringify(result,null,2)' in js,
    'authentication response is checked and displayed': 'authenticationResponseJson' in js,
    'errors are shown to user': 'status.textContent=(isCreate?' in js,
    'native create method exists': 'void createPasskey(PluginCall call)' in java,
    'native sign-in method exists': 'void getPasskey(PluginCall call)' in java,
    'native plugin registered exactly once': activity.count('registerPlugin(FBCredentialPlugin.class);') == 1,
    'patch script copies plugin source': 'FBCredentialPlugin; do' in patch,
    'Credential Manager dependency is patched': 'androidx.credentials:credentials:' in patch,
    'Biometric dependency is guarded against duplicates': 'if [ -f "$G" ] && ! grep -q "androidx.biometric:biometric:" "$G";' in patch,
    'server verification warning is present': 'server must verify it' in js,
}
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ' ' + name)
if not all(checks.values()):
    raise SystemExit(1)
print(f'{len(checks)} checks passed')
