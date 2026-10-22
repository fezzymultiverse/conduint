/* shieldkey.js: the PUBLIC key that signed Shield rule updates must match (V0.39.0).
   Run once in Termux: bash scripts/sign-rules.sh keygen   -> it prints the line to paste below.
   Until a key is set, rule updates from a link are refused and the rules built into the app stay in use.
   This is a public key: safe to commit. The private key never leaves your phone. */
const SHY_KEY=null;
/* example of what the line looks like once set: const SHY_KEY={x:'...43 characters...',y:'...43 characters...'}; */
