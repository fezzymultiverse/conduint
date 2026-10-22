#!/usr/bin/env bash
# V0.39.0: sign Shield rule updates. Needs node (Termux: pkg install nodejs).
#   bash scripts/sign-rules.sh keygen            makes your signing key ONCE; prints the line for www/js/shieldkey.js
#   bash scripts/sign-rules.sh sign rules.json   writes rules.json.sig; upload both files so the .sig sits at the rules link plus ".sig"
# The private key is saved in ~/.conduint-rules-key.json (mode 600). Back it up privately. Never commit it.
set -euo pipefail
KEY="${CONDUINT_RULES_KEY:-$HOME/.conduint-rules-key.json}"
case "${1:-}" in
 keygen)
  if [ -f "$KEY" ]; then echo "A key already exists at $KEY. Delete it first only if you really want a new one."; exit 1; fi
  KEY="$KEY" node -e '
const c=require("crypto"),fs=require("fs");
const k=c.generateKeyPairSync("ec",{namedCurve:"P-256"});
const priv=k.privateKey.export({format:"jwk"});
fs.writeFileSync(process.env.KEY,JSON.stringify(priv),{mode:0o600});
console.log("Key saved at "+process.env.KEY+" (back it up, never commit it).");
console.log("");
console.log("Put this line in www/js/shieldkey.js, replacing the line that says const SHY_KEY=null;");
console.log("const SHY_KEY={x:\x27"+priv.x+"\x27,y:\x27"+priv.y+"\x27};");
'
  ;;
 sign)
  F="${2:-}"
  [ -n "$F" ] && [ -f "$F" ] || { echo "Usage: bash scripts/sign-rules.sh sign rules.json"; exit 1; }
  [ -f "$KEY" ] || { echo "No key found. Run: bash scripts/sign-rules.sh keygen"; exit 1; }
  KEY="$KEY" F="$F" node -e '
const c=require("crypto"),fs=require("fs");
const jwk=JSON.parse(fs.readFileSync(process.env.KEY,"utf8"));
const key=c.createPrivateKey({key:jwk,format:"jwk"});
const data=fs.readFileSync(process.env.F);
JSON.parse(data.toString("utf8"));
const sig=c.sign("sha256",data,{key,dsaEncoding:"ieee-p1363"});
fs.writeFileSync(process.env.F+".sig",sig.toString("base64"));
console.log("Signed: "+process.env.F+".sig");
'
  echo "Upload the rules file EXACTLY as signed. Changing even one character breaks the signature."
  ;;
 *)
  echo "Usage: bash scripts/sign-rules.sh keygen | sign rules.json"; exit 1
  ;;
esac
