#!/usr/bin/env bash
# V0.50.2: also trusts the Festers browser for passkeys when CONDUINT_TRUST_FESTERS_SHA256 is set (see the block after "passkeys and autofill patched in").
# Copies the native plugins and MainActivity into the generated android/ project, adds every permission the app needs
# to AndroidManifest.xml, registers the music service, and installs the app icon and splash screen (idempotent).
# The package name follows appId in capacitor.config.json, so changing the id later keeps working.
set -euo pipefail
cd "$(dirname "$0")/.."
APP=$(node -p "require('./capacitor.config.json').appId")
D="android/app/src/main/java/${APP//.//}"
[ -d "$D" ] || { echo "No $D folder. Run: npx cap add android"; exit 1; }
for f in SafPlugin ToolsPlugin LockPlugin PlayerPlugin ZiplinerPlugin BrowserPlugin VpnPlugin VpnCore VpnKeeper VpnRotateReceiver FirewallService WatchPlugin WatchReceiver WifiPlugin KeepService MediaService MainActivity CredStore Gate CredPlugin PasskeyService PasskeyActivity FestersBridgeActivity AutofillSvc AutofillAuthActivity ContactsPlugin ConvertPlugin FBCredentialPlugin; do
  sed "s/^package com\.fezzy\.conduint;/package ${APP};/" "native/$f.java" > "$D/$f.java"
done
echo "Patched $D with SafPlugin, ToolsPlugin, LockPlugin, PlayerPlugin, ZiplinerPlugin, BrowserPlugin, VpnPlugin, VpnCore, VpnKeeper, VpnRotateReceiver, FirewallService, WatchPlugin, WatchReceiver, WifiPlugin, KeepService, MediaService, MainActivity, CredStore, Gate, CredPlugin, PasskeyService, PasskeyActivity, AutofillSvc, AutofillAuthActivity and FBCredentialPlugin"

M=android/app/src/main/AndroidManifest.xml
[ -f "$M" ] || { echo "No $M"; exit 1; }
if ! grep -q "conduint-permissions" "$M"; then
  PERMS='    <!-- conduint-permissions -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.KILL_BACKGROUND_PROCESSES" />
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
    <uses-permission android:name="android.permission.READ_CONTACTS" />
    <uses-permission android:name="android.permission.WRITE_CONTACTS" />'
  # insert right after the opening <manifest ...> tag
  PERMS="$PERMS" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.PERMS+"\n"+s.slice(m.index+m[0].length);
if(!s.includes("requestLegacyExternalStorage"))s=s.replace("<application","<application android:requestLegacyExternalStorage=\"true\"");
if(!s.includes("largeHeap"))s=s.replace("<application","<application android:largeHeap=\"true\"");
fs.writeFileSync(p,s)' "$M"
  echo "Added permissions to $M"
fi

# V0.5.0: wake lock and battery optimiser permissions. Separate block so projects patched by an older version get them too.
if ! grep -q "conduint-power" "$M"; then
  PW='    <!-- conduint-power -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />'
  PW="$PW" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.PW+"\n"+s.slice(m.index+m[0].length);
fs.writeFileSync(p,s)' "$M"
  echo "Added wake lock and battery permissions to $M"
fi

# V0.6.0: fingerprint lock and background music. Separate block so projects patched by an older version get them too.
if ! grep -q "conduint-v6" "$M"; then
  V6='    <!-- conduint-v6 -->
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />'
  V6="$V6" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.V6+"\n"+s.slice(m.index+m[0].length);
fs.writeFileSync(p,s)' "$M"
  echo "Added biometric and foreground service permissions to $M"
fi
if ! grep -q "MediaService" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const svc="    <service android:name=\""+process.env.APP+".MediaService\" android:exported=\"false\" android:foregroundServiceType=\"mediaPlayback\" />\n    ";
s=s.replace("</application>",svc+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Registered MediaService in $M"
fi

# V0.13.0: the browser needs the internet and network state. Capacitor adds INTERNET already; this makes sure of it.
if ! grep -q "conduint-browser" "$M"; then
  BRP='    <!-- conduint-browser -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />'
  BRP="$BRP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.BRP+"\n"+s.slice(m.index+m[0].length);
fs.writeFileSync(p,s)' "$M"
  echo "Added browser permissions to $M"
fi

# V0.28.5: the Wi-Fi check reads the connection's security type. ACCESS_WIFI_STATE is a normal permission (no prompt).
# The network name and location are never read, so no location permission is added.
if ! grep -q "conduint-wifi" "$M"; then
  WFP='    <!-- conduint-wifi -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />'
  WFP="$WFP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.WFP+"\n"+s.slice(m.index+m[0].length);
fs.writeFileSync(p,s)' "$M"
  echo "Added the Wi-Fi state permission to $M"
fi

# V0.50.0: Home shows the name of the Wi-Fi you are on. Android only reveals a Wi-Fi name to apps that hold Location permission.
if ! grep -q "conduint-v50" "$M"; then
  V50='    <!-- conduint-v50 -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />'
  V50="$V50" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n"+process.env.V50+"\n"+s.slice(m.index+m[0].length);
fs.writeFileSync(p,s)' "$M"
  echo "Added the Location permission (Wi-Fi name on Home) to $M"
fi

# App icon: a cyan file on black (adaptive icon plus the old square and round icons), made by scripts/make-icons.py
R=android/app/src/main/res
if [ -d native/res ]; then
  mkdir -p "$R"
  cp -r native/res/. "$R/"
  echo "Installed the Conduint icon into $R"
fi
# Splash screen: black with the icon. Only when the template uses the usual @drawable/splash.
if grep -rqs "@drawable/splash" "$R/values" 2>/dev/null && [ -f native/splash/drawable/splash.xml ]; then
  find "$R" -name 'splash*.png' -delete
  mkdir -p "$R/drawable"
  cp native/splash/drawable/splash.xml "$R/drawable/splash.xml"
  echo "Installed the black splash screen"
fi

# V0.11.0: Zipliner needs zip4j (AES zip) and commons-compress + xz (reading 7z). Idempotent.
G=android/app/build.gradle
if [ -f "$G" ] && ! grep -q "zip4j" "$G"; then
  sed -i '0,/^dependencies {/s//dependencies {\n    implementation "net.lingala.zip4j:zip4j:2.11.5"\n    implementation "org.apache.commons:commons-compress:1.21"\n    implementation "org.tukaani:xz:1.9"/' "$G"
  echo "Added Zipliner libraries to $G"
fi

# V0.15.0: install apps (REQUEST_INSTALL_PACKAGES) and "Open with Conduint" for documents, archives, installers, pictures, songs and videos. Idempotent.
if ! grep -q "conduint-v15" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n    <!-- conduint-v15 -->\n    <uses-permission android:name=\"android.permission.REQUEST_INSTALL_PACKAGES\" />"+s.slice(m.index+m[0].length);
const types=["application/pdf","application/zip","application/x-zip-compressed","application/x-7z-compressed","application/vnd.android.package-archive","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/epub+zip","text/*","image/*","audio/*","video/*"];
let f="";for(const sc of ["content","file"]){f+="            <intent-filter>\n                <action android:name=\"android.intent.action.VIEW\" />\n                <category android:name=\"android.intent.category.DEFAULT\" />\n                <data android:scheme=\""+sc+"\" />\n"+types.map(t=>"                <data android:mimeType=\""+t+"\" />").join("\n")+"\n            </intent-filter>\n"}
const i=s.indexOf("</activity>");s=s.slice(0,i)+f+"        "+s.slice(i);
fs.writeFileSync(p,s)' "$M"
  echo "Added install permission and Open-with filters to $M"
fi

# V0.19.2: Dedicated ZIP browser intent filter (VIEW + SEND) and HTML/PDF/DOCX filters. Idempotent.
if ! grep -q "conduint-v192" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
// V0.20.3: no permissions here. WRITE/READ_EXTERNAL_STORAGE are already declared in the conduint-permissions block;
// declaring them again with a different maxSdkVersion made the manifest merger fail (processDebugMainManifest).
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n    <!-- conduint-v192 -->"+s.slice(m.index+m[0].length);
// Dedicated VIEW filter for .zip so Conduint appears in the "Open with" list specifically for ZIPs
const zipFilter="            <intent-filter>\n                <action android:name=\"android.intent.action.VIEW\" />\n                <action android:name=\"android.intent.action.SEND\" />\n                <category android:name=\"android.intent.category.DEFAULT\" />\n                <data android:scheme=\"content\" android:mimeType=\"application/zip\" />\n                <data android:scheme=\"content\" android:mimeType=\"application/x-zip\" />\n                <data android:scheme=\"content\" android:mimeType=\"application/x-zip-compressed\" />\n                <data android:scheme=\"file\"    android:mimeType=\"application/zip\" />\n                <data android:scheme=\"file\"    android:mimeType=\"application/x-zip-compressed\" />\n            </intent-filter>\n            <!-- Save/open HTML, PDF, DOCX by piping to Conduint -->\n            <intent-filter>\n                <action android:name=\"android.intent.action.VIEW\" />\n                <action android:name=\"android.intent.action.SEND\" />\n                <category android:name=\"android.intent.category.DEFAULT\" />\n                <data android:scheme=\"content\" android:mimeType=\"text/html\" />\n                <data android:scheme=\"content\" android:mimeType=\"application/pdf\" />\n                <data android:scheme=\"content\" android:mimeType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\" />\n                <data android:scheme=\"file\"    android:mimeType=\"text/html\" />\n                <data android:scheme=\"file\"    android:mimeType=\"application/pdf\" />\n                <data android:scheme=\"file\"    android:mimeType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\" />\n            </intent-filter>\n";
const i=s.indexOf("</activity>");s=s.slice(0,i)+zipFilter+"        "+s.slice(i);
fs.writeFileSync(p,s)' "$M"
  echo "V0.19.2: Added ZIP browser + HTML/PDF/DOCX save intents and storage permissions to $M"
fi

# V0.20.3: final pass. Keep only the first <uses-permission> per name so the manifest merger never sees a duplicate
# (also covers INTERNET, which the Capacitor template already declares). Idempotent.
node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");const seen=new Set();let n=0;
s=s.replace(/^[ \t]*<uses-permission\b[^>]*?android:name="([^"]+)"[^>]*?\/>[ \t]*\r?\n/gm,(all,name)=>{if(seen.has(name)){n++;return ""}seen.add(name);return all});
fs.writeFileSync(p,s);console.log("Removed "+n+" duplicate uses-permission line(s)")' "$M"

# V0.26.0: built-in WireGuard VPN (Vpn plugin). Needs the official tunnel library, Java 8+ desugaring and minSdk 24. Idempotent.
# Override the library version without editing this file:  CONDUINT_WG_VERSION=1.0.20230706 bash scripts/patch-android.sh
WG_VER="${CONDUINT_WG_VERSION:-1.0.20260102}"
DESUGAR_VER="2.0.3"
V=android/variables.gradle
if [ -f "$V" ]; then
  node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const re=/(minSdkVersion\s*=\s*)(\d+)/;const m=s.match(re);
if(m&&+m[2]<24){s=s.replace(re,(a,b)=>b+"24");fs.writeFileSync(p,s);console.log("minSdkVersion raised from "+m[2]+" to 24 in "+p)}
else if(m)console.log("minSdkVersion already "+m[2]+" in "+p);
else console.log("WARNING: minSdkVersion not found in "+p+". Set it to 24 by hand (the WireGuard library needs it).")' "$V"
else
  echo "WARNING: $V not found. Set minSdkVersion to 24 by hand (the WireGuard library needs it)."
fi
if [ -f "$G" ]; then
  # 1) library + desugaring dependencies (a changed version is updated in place)
  if grep -q "com.wireguard.android:tunnel" "$G"; then
    sed -i -E "s#(com\.wireguard\.android:tunnel:)[^\"']+#\1${WG_VER}#" "$G"
    echo "WireGuard library set to ${WG_VER} in $G"
  else
    sed -i "0,/^dependencies {/s//dependencies {\n    implementation \"com.wireguard.android:tunnel:${WG_VER}\"/" "$G"
    echo "Added the WireGuard library ${WG_VER} to $G"
  fi
  if ! grep -q "desugar_jdk_libs" "$G"; then
    sed -i "0,/^dependencies {/s//dependencies {\n    coreLibraryDesugaring \"com.android.tools:desugar_jdk_libs:${DESUGAR_VER}\"/" "$G"
    echo "Added desugaring library to $G"
  fi
  # 2) compileOptions with coreLibraryDesugaringEnabled (kept inside an existing block when there is one)
  if ! grep -q "coreLibraryDesugaringEnabled" "$G"; then
    node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
if(/compileOptions\s*\{/.test(s)){s=s.replace(/compileOptions\s*\{/,"compileOptions {\n        coreLibraryDesugaringEnabled true")}
else{s=s.replace(/^android\s*\{/m,"android {\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n        coreLibraryDesugaringEnabled true\n    }")}
fs.writeFileSync(p,s)' "$G"
    echo "Turned on core library desugaring in $G"
  fi
else
  echo "WARNING: $G not found. The VPN needs the WireGuard library, desugaring and minSdk 24 added by hand."
fi

# V0.26.0: the VPN keeps running in the background (foreground service, specialUse) and rotates servers from an alarm receiver. Idempotent.
if ! grep -q "conduint-v26" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n    <!-- conduint-v26 -->\n    <uses-permission android:name=\"android.permission.FOREGROUND_SERVICE_SPECIAL_USE\" />"+s.slice(m.index+m[0].length);
const app=process.env.APP;
const x="    <service android:name=\""+app+".VpnKeeper\" android:exported=\"false\" android:foregroundServiceType=\"specialUse\">\n"
 +"        <property android:name=\"android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE\" android:value=\"vpn_keepalive_and_server_rotation\" />\n    </service>\n"
 +"    <receiver android:name=\""+app+".VpnRotateReceiver\" android:exported=\"false\" />\n    ";
s=s.replace("</application>",x+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Added the VPN background service and rotation receiver to $M"
fi
echo "V0.26.0: VPN support patched in"

# V0.34.0: app firewall (per-app block on Wi-Fi, mobile data, both, or Focus). A second VpnService that routes only the blocked apps into a dead end. Idempotent.
if ! grep -q "conduint-v34" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");const app=process.env.APP;
const x="    <!-- conduint-v34 -->\n    <service android:name=\""+app+".FirewallService" +"\" android:exported=\"false\" android:permission=\"android.permission.BIND_VPN_SERVICE\">\n"
 +"        <intent-filter><action android:name=\"android.net.VpnService\" /></intent-filter>\n    </service>\n    ";
s=s.replace("</application>",x+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Added the app firewall service to $M"
fi
echo "V0.34.0: app firewall patched in"

# V0.27.0: keep-alive service (specialUse) and the receiver for the folder watcher's Upload / Deny buttons. Idempotent.
# The specialUse permission was added by the V0.26.0 block above; this block adds it again only if that block is missing.
if ! grep -q "conduint-v27" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");
if(!/FOREGROUND_SERVICE_SPECIAL_USE/.test(s)){const m=s.match(/<manifest[^>]*>/);
 s=s.slice(0,m.index+m[0].length)+"\n    <uses-permission android:name=\"android.permission.FOREGROUND_SERVICE_SPECIAL_USE\" />"+s.slice(m.index+m[0].length)}
const app=process.env.APP;
const x="    <!-- conduint-v27 -->\n    <service android:name=\""+app+".KeepService\" android:exported=\"false\" android:foregroundServiceType=\"specialUse\">\n"
 +"        <property android:name=\"android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE\" android:value=\"folder_watcher_keep_running\" />\n    </service>\n"
 +"    <receiver android:name=\""+app+".WatchReceiver\" android:exported=\"false\" />\n    ";
s=s.replace("</application>",x+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Added the keep-running service and folder watcher receiver to $M"
fi
echo "V0.27.0: keep running and folder watcher patched in"

# V0.29.0: passkeys and autofill. Needs the androidx.credentials library, the trusted-browser list in assets, and three manifest entries.
# (res/xml and res/layout are copied by the icon block above: cp -r native/res/. copies every folder in native/res.) Idempotent.
A=android/app/src/main/assets
if [ -d native/assets ]; then
  mkdir -p "$A"
  cp -r native/assets/. "$A/"
  echo "Installed the trusted browser list into $A"
fi
CRED_VER="${CONDUINT_CRED_VERSION:-1.3.0}"
if [ -f "$G" ]; then
  if grep -q "androidx.credentials:credentials:" "$G"; then
    sed -i -E "s#(androidx\.credentials:credentials:)[^\"']+#\1${CRED_VER}#" "$G"
    echo "androidx.credentials set to ${CRED_VER} in $G"
  else
    sed -i "0,/^dependencies {/s//dependencies {\n    implementation \"androidx.credentials:credentials:${CRED_VER}\"/" "$G"
    echo "Added androidx.credentials ${CRED_VER} to $G"
  fi
  # V0.51.1: the Play Services backend, so GET/CREATE credential calls still resolve on devices where Credential Manager
  # is provided by Play services rather than the framework. Festers Browser already carries this; Conduint was missing it.
  if grep -q "androidx.credentials:credentials-play-services-auth" "$G"; then
    sed -i -E "s#(androidx\.credentials:credentials-play-services-auth:)[^\"']+#\1${CRED_VER}#" "$G"
  else
    sed -i "0,/^dependencies {/s//dependencies {\n    implementation \"androidx.credentials:credentials-play-services-auth:${CRED_VER}\"/" "$G"
    echo "Added androidx.credentials-play-services-auth ${CRED_VER} to $G"
  fi
else
  echo "WARNING: $G not found. Passkeys need implementation \"androidx.credentials:credentials:${CRED_VER}\" and \"androidx.credentials:credentials-play-services-auth:${CRED_VER}\" added by hand."
fi
# The Android credential-provider integration and Credential Manager API need compileSdk 34 or newer. Capacitor 6 templates use 34; warn when lower.
if [ -f "$V" ]; then
  node -e '
const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");const m=s.match(/compileSdkVersion\s*=\s*(\d+)/);
if(m&&+m[1]<34)console.log("WARNING: compileSdkVersion is "+m[1]+" in "+process.argv[1]+". Passkeys need 34 or newer.");' "$V"
fi

if ! grep -q "conduint-v29" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");const app=process.env.APP;
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n    <!-- conduint-v29 -->"+s.slice(m.index+m[0].length);
const x=
 "    <service android:name=\""+app+".PasskeyService\" android:exported=\"true\" android:enabled=\"true\" android:label=\"Conduint Password Manager\" android:icon=\"@mipmap/ic_launcher\" android:permission=\"android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE\">\n"
+"        <intent-filter>\n            <action android:name=\"android.service.credentials.CredentialProviderService\" />\n        </intent-filter>\n"
+"        <meta-data android:name=\"android.credentials.provider\" android:resource=\"@xml/cnd_provider\" />\n    </service>\n"
+"    <service android:name=\""+app+".AutofillSvc\" android:exported=\"true\" android:label=\"Conduint Password Manager\" android:permission=\"android.permission.BIND_AUTOFILL_SERVICE\">\n"
+"        <intent-filter>\n            <action android:name=\"android.service.autofill.AutofillService\" />\n        </intent-filter>\n"
+"        <meta-data android:name=\"android.autofill\" android:resource=\"@xml/cnd_autofill\" />\n    </service>\n"
+"    <activity android:name=\""+app+".PasskeyActivity\" android:exported=\"true\" android:excludeFromRecents=\"true\" android:theme=\"@android:style/Theme.Translucent.NoTitleBar\">\n"
+"        <intent-filter>\n            <action android:name=\"com.fezzy.conduint.PASSKEY_CREATE\" />\n            <action android:name=\"com.fezzy.conduint.PASSKEY_GET\" />\n            <category android:name=\"android.intent.category.DEFAULT\" />\n        </intent-filter>\n    </activity>\n"
+"    <activity android:name=\""+app+".AutofillAuthActivity\" android:exported=\"false\" android:excludeFromRecents=\"true\" android:theme=\"@android:style/Theme.Translucent.NoTitleBar\" />\n    ";
s=s.replace("</application>",x+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Added the passkey provider, autofill service and their screens to $M"
fi
echo "V0.29.0: passkeys and autofill patched in"

# V0.50.9: Festers passkey bridge. Credential Manager never gives a sideloaded browser the web-origin permission, so Festers calls this screen
# directly instead. The screen checks Festers' package AND signing certificate (CONDUINT_TRUST_FESTERS_SHA256) before it signs anything.
if ! grep -q "conduint-v50-9" "$M"; then
  APP="$APP" node -e '
const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");const app=process.env.APP;
const m=s.match(/<manifest[^>]*>/);
s=s.slice(0,m.index+m[0].length)+"\n    <!-- conduint-v50-9 -->"+s.slice(m.index+m[0].length);
const x="    <activity android:name=\""+app+".FestersBridgeActivity\" android:exported=\"true\" android:excludeFromRecents=\"true\" android:theme=\"@android:style/Theme.Translucent.NoTitleBar\" />\n    ";
s=s.replace("</application>",x+"</application>");
fs.writeFileSync(p,s)' "$M"
  echo "Added the Festers passkey bridge screen to $M"
fi

# V0.50.2: trust the Festers browser for Conduint passkeys. A browser that is not in the trusted list cannot use Conduint passkeys.
# Festers' signing-certificate SHA-256 is shown in Festers under Settings > Autofill & Passkeys > status (Copy fingerprint) and is printed in
# its GitLab log. Put it in the CI variable CONDUINT_TRUST_FESTERS_SHA256 (several, separated by commas, are allowed). Nothing secret: it is a public fingerprint.
if [ -n "${CONDUINT_TRUST_FESTERS_SHA256:-}" ]; then
  node scripts/trust-browser.js "$A/cnd_privileged_apps.json" "${CONDUINT_TRUST_FESTERS_PKG:-com.fezzy.festersbrowser}" "$CONDUINT_TRUST_FESTERS_SHA256" \
    || { echo "ERROR: could not add Festers to the trusted browser list"; exit 1; }
else
  echo "NOTE: CONDUINT_TRUST_FESTERS_SHA256 is not set, so Festers is not on Conduint's trusted browser list and cannot use Conduint passkeys."
fi

# V0.44.0: MP4 to MP3 converter. The ConvertPlugin finds ffmpeg-kit by reflection, so the app builds and runs without it (then only
# "Original audio" extraction works). To get real MP3, give the Gradle coordinate of an ffmpeg-kit build that carries libmp3lame:
#   CONDUINT_FFMPEG_DEP="group:artifact:version" bash scripts/patch-android.sh
# The original arthenica/ffmpeg-kit was retired and its files were pulled from Maven Central, so use a maintained fork and check the
# coordinate resolves before building. The package must stay com.arthenica.ffmpegkit (forks normally keep it). Needs minSdk 24 or newer.
FFDEP="${CONDUINT_FFMPEG_DEP:-}"
if [ -n "$FFDEP" ] && [ -f "$G" ]; then
  if grep -q "ffmpeg" "$G"; then
    echo "An ffmpeg dependency is already in $G; left as it is. Edit it by hand to change it."
  else
    sed -i "0,/^dependencies {/s//dependencies {\n    implementation \"${FFDEP}\"/" "$G"
    echo "Added ${FFDEP} to $G (MP3 converter)"
  fi
else
  echo "NOTE: no CONDUINT_FFMPEG_DEP set. The converter builds, but only Original audio (M4A copy) will work. Set it for real MP3."
fi
echo "V0.44.0: converter patched in"

# V0.50.6: FBCredentialPlugin relies on Credential Manager for system verification;
# it no longer needs the AndroidX Biometric library for a second prompt.

