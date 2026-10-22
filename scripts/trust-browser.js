#!/usr/bin/env node
// V0.50.2: adds one browser (package name + signing-certificate SHA-256 fingerprints) to Conduint's trusted-browser list,
// the JSON that PasskeyActivity hands to Android's Credential Manager (assets/cnd_privileged_apps.json).
// Usage: node scripts/trust-browser.js <list.json> <package.name> <SHA256[,SHA256...]>
// A fingerprint may be written with or without colons, in any case. Several fingerprints (comma or space separated) are all added.
// Safe to run twice: existing entries and fingerprints are not duplicated. Exits 1 and writes nothing on bad input.
const fs = require('fs');
const [, , file, pkg, shaArg] = process.argv;
function die(m) { console.error('trust-browser: ' + m); process.exit(1); }
if (!file || !pkg || !shaArg) die('usage: trust-browser.js <list.json> <package.name> <SHA256[,SHA256...]>');
if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg)) die('"' + pkg + '" is not a valid package name');
const shas = shaArg.split(/[\s,]+/).filter(Boolean).map(function (s) {
  const h = s.replace(/[:\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(h)) die('a fingerprint must be 64 hex characters (SHA-256); got ' + h.length + ' characters');
  return h.match(/../g).join(':');
});
if (!shas.length) die('no fingerprint given');
let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die('cannot read ' + file + ': ' + e.message); }
if (!doc || !Array.isArray(doc.apps)) die(file + ' has no "apps" list');
let entry = doc.apps.find(function (a) { return a && a.type === 'android' && a.info && a.info.package_name === pkg; });
if (!entry) { entry = { type: 'android', info: { package_name: pkg, signatures: [] } }; doc.apps.push(entry); }
if (!Array.isArray(entry.info.signatures)) entry.info.signatures = [];
let added = 0;
shas.forEach(function (h) {
  if (!entry.info.signatures.some(function (s) { return s && String(s.cert_fingerprint_sha256).toUpperCase() === h; })) {
    entry.info.signatures.push({ build: 'release', cert_fingerprint_sha256: h });
    added++;
  }
});
fs.writeFileSync(file, '{"apps":[\n' + doc.apps.map(function (a) { return JSON.stringify(a); }).join(',\n') + '\n]}\n');
console.log('trusted browser ' + pkg + ': ' + entry.info.signatures.length + ' fingerprint(s), ' + added + ' added; list has ' + doc.apps.length + ' apps');
