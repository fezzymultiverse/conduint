/* zipbrowser.js – Walk into a ZIP like a folder. No extraction to disk.
   Uses the browser's native DecompressionStream (same as reader.js uses for .docx/.pptx).
   Entry point: zipBrowse(item) — call instead of opOpenWith when item is a .zip and you
   want to walk the contents. Also handles "Open with Conduint" incoming ZIPs.            */

/* ── state ────────────────────────────────────────────────────────────────── */
const ZB = {
  on: false,          // browser visible?
  src: null,          // the outer file item (has .uri or .file or .path)
  entries: null,      // flat Map: fullPath → {name, fullPath, dir, size, compSize, offset, method, data?}
  stack: [],          // navigation stack of folder fullPaths ('' = root)
  sel: new Set(),     // selected fullPaths (for future copy-out)
  tok: 0,             // cancel token
};

/* ── ZIP parser (pure JS, no extraction to disk) ──────────────────────────── */

// Read bytes from the source item (uri, file object, or All-files path)
async function zbBytes(src) {
  if (src.file)  return new Uint8Array(await src.file.arrayBuffer());
  if (src.path)  return new Uint8Array(await (await fetch('file://'+src.path)).arrayBuffer());
  if (src.uri && SAF) {
    const c = await SAF.cacheCopy({ uri: src.uri, name: src.name });
    return new Uint8Array(await (await fetch(fileUrl(c.path))).arrayBuffer());
  }
  // Fallback: fetch the content:// URI through a blob
  const resp = await fetch(src.uri);
  return new Uint8Array(await resp.arrayBuffer());
}

function zbU16(d, o) { return d[o] | (d[o+1]<<8); }
function zbU32(d, o) { return (d[o] | (d[o+1]<<8) | (d[o+2]<<16) | (d[o+3]<<24)) >>> 0; }
function zbStr(d, o, len) { return new TextDecoder().decode(d.subarray(o, o+len)); }

async function zbParse(bytes) {
  const d = bytes;
  // Find end-of-central-directory record (last 0x06054b50 signature)
  let eocd = -1;
  for (let i = d.length - 22; i >= Math.max(0, d.length - 65558); i--) {
    if (d[i]===0x50 && d[i+1]===0x4b && d[i+2]===0x05 && d[i+3]===0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file.');

  // Check ZIP64 EOCD locator
  let cdOffset = zbU32(d, eocd+16);
  let cdSize   = zbU32(d, eocd+12);
  let cdCount  = zbU16(d, eocd+10);

  // ZIP64 override
  const loc64 = eocd - 20;
  if (loc64 >= 0 && d[loc64]===0x50 && d[loc64+1]===0x4b && d[loc64+2]===0x06 && d[loc64+3]===0x07) {
    const eocd64 = Number(new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(loc64+8, true));
    if (eocd64 >= 0 && eocd64 < d.length) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      cdCount  = Number(dv.getBigUint64(eocd64+32, true));
      cdSize   = Number(dv.getBigUint64(eocd64+40, true));
      cdOffset = Number(dv.getBigUint64(eocd64+48, true));
    }
  }

  const entries = new Map();
  let pos = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (zbU32(d,pos) !== 0x02014b50) break;
    const method      = zbU16(d, pos+10);
    let   compSize    = zbU32(d, pos+20);
    let   uncompSize  = zbU32(d, pos+24);
    const fnLen       = zbU16(d, pos+28);
    const extraLen    = zbU16(d, pos+30);
    const cmtLen      = zbU16(d, pos+32);
    let   localOff    = zbU32(d, pos+42);
    /* V0.43.6: some zip tools write backslashes or a leading ./ or / in names; fold them to plain folder/file paths so folders open */
    const fullPath    = zbStr(d, pos+46, fnLen).replace(/\\/g, '/').replace(/^(\.?\/)+/, '');
    pos += 46 + fnLen + extraLen + cmtLen;

    // ZIP64 extra field override for offset/sizes
    let off64 = pos - cmtLen - extraLen;  // start of extra block in CD
    // (we already advanced pos, re-read extra from the CD header)
    const extraStart = pos - cmtLen - extraLen;
    const extraEnd   = pos - cmtLen;
    let ep = extraStart;
    while (ep + 4 <= extraEnd) {
      const tag = zbU16(d, ep), esz = zbU16(d, ep+2); ep += 4;
      if (tag === 0x0001) { // ZIP64 extended info
        const dv64 = new DataView(d.buffer, d.byteOffset, d.byteLength);
        let fi = ep;
        if (uncompSize === 0xffffffff && fi+8 <= ep+esz) { uncompSize = Number(dv64.getBigUint64(fi, true)); fi += 8; }
        if (compSize   === 0xffffffff && fi+8 <= ep+esz) { compSize   = Number(dv64.getBigUint64(fi, true)); fi += 8; }
        if (localOff   === 0xffffffff && fi+8 <= ep+esz) { localOff = Number(dv64.getBigUint64(fi, true)); }
      }
      ep += esz;
    }

    if (!fullPath) continue;
    const dir = fullPath.endsWith('/');
    const name = fullPath.replace(/\/$/, '').split('/').pop();
    entries.set(fullPath, { name, fullPath, dir, size: uncompSize, compSize, method, localOff, data: null });
  }

  // Resolve local header offsets → actual data offsets
  for (const [, e] of entries) {
    if (e.dir) continue;
    const lh = e.localOff;
    if (lh + 30 > d.length) continue;
    const fnL  = zbU16(d, lh+26);
    const exL  = zbU16(d, lh+28);
    e.dataOff  = lh + 30 + fnL + exL;
  }

  return entries;
}

// Decompress one entry on demand
async function zbDecompress(bytes, entry) {
  if (entry.data) return entry.data;
  const raw = bytes.subarray(entry.dataOff, entry.dataOff + entry.compSize);
  if (entry.method === 0) { entry.data = raw; return raw; }
  if (entry.method === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(), r = ds.readable.getReader();
    w.write(raw).catch(() => {}); w.close().catch(() => {});
    const chunks = []; let total = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); total += value.length; }
    const out = new Uint8Array(total); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    entry.data = out; return out;
  }
  throw new Error('Unsupported compression method: ' + entry.method + '. Try Store or Deflate.');
}

/* ── virtual folder listing ───────────────────────────────────────────────── */

function zbChildren(folderPath) {
  // folderPath: '' = root, or 'folder/' style
  const prefix = folderPath ? (folderPath.endsWith('/') ? folderPath : folderPath+'/') : '';
  const seen = new Set();
  const kids = [];
  for (const [fp, e] of ZB.entries) {
    if (fp === prefix) continue;               // the folder itself
    if (!fp.startsWith(prefix)) continue;      // different branch
    const rest = fp.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash < 0) { kids.push(e); continue; } // direct file child
    const dirName = rest.slice(0, slash+1);
    const dirPath = prefix + dirName;
    if (!seen.has(dirPath)) {
      seen.add(dirPath);
      // Synthesise a folder entry if the ZIP only listed the directory implicitly
      kids.push(ZB.entries.get(dirPath) || { name: dirName.replace('/',''), fullPath: dirPath, dir: true, size: 0 });
    }
  }
  kids.sort((a,b) => a.dir!==b.dir ? (a.dir?-1:1) : a.name.localeCompare(b.name));
  return kids;
}

/* ── open a file entry inside the ZIP ────────────────────────────────────── */

async function zbOpenEntry(e) {
  if (e.dir) { ZB.stack.push(e.fullPath); drawZB(); return; }
  const t = rdType(e.name, '');
  /* V0.50.0: a file Conduint cannot show itself (installers, archives, Office files it cannot draw...) is unpacked to the cache and handed to Android, so every file in the zip does something when you tap it */
  if (!t) return zbOpenAny(e);
  try {
    const raw = await zbDecompress(ZB._bytes, e);
    // Build a pseudo-source that rdBytes() can handle via a Blob
    const mime = mimeOf ? mimeOf(e.name) : 'application/octet-stream';
    const blob = new Blob([raw], { type: mime });
    const src  = { name: e.name, size: e.size, mime, blob, fromZip: true };
    readerOpen(src);
  } catch(err) { toast(err.message || 'Cannot open this entry.'); }
}

/* V0.50.0: unpack one entry to the app cache and open it: installers go to the installer, everything else to Android's Open with list */
async function zbPut(e) {
  const raw = await zbDecompress(ZB._bytes, e);
  let bin = ''; for (let i = 0; i < raw.length; i += 8192) bin += String.fromCharCode.apply(null, raw.subarray(i, i + 8192));
  return (await SAF.cachePut({ name: e.name, b64: btoa(bin) })).path;
}
async function zbOpenAny(e, pick) {
  if (!(typeof SAF !== 'undefined' && SAF && SAF.cachePut)) { toast('Opening this kind of file needs the Android app.'); return; }
  try {
    const p = await zbPut(e);
    if (!pick && /\.apk$/i.test(e.name) && TOOLS && TOOLS.installApk) {
      const r = await TOOLS.installApk({ path: p });
      if (r && r.needAllow) toast('Allow Conduint Files to install apps, then tap the file again.');
      return;
    }
    await SAF.openWith({ uri: 'file://' + p, mime: mimeOf(e.name), edit: false });
  } catch (err) { toast(err.message || 'Cannot open this entry.'); }
}

/* ── draw the browser ────────────────────────────────────────────────────── */

function zbCrumb() {
  const bar = h('div', 'zbcrumb');
  const root = h('span', 'zbseg', ZB.src.name);
  root.onclick = () => { ZB.stack = []; drawZB(); };
  bar.append(root);
  ZB.stack.forEach((seg, idx) => {
    const name = seg.replace(/\/$/, '').split('/').pop();
    bar.append(h('span', 'zbsep', '›'));
    const s = h('span', 'zbseg', name);
    s.onclick = () => { ZB.stack = ZB.stack.slice(0, idx+1); drawZB(); };
    bar.append(s);
  });
  return bar;
}

function drawZB() {
  if (!ZB.on) return;
  TV.view = 'zb';
  const B = $('#tbody'); B.replaceChildren();
  head(ZB.src.name, true);

  const folder = ZB.stack.length ? ZB.stack[ZB.stack.length-1] : '';
  B.append(zbCrumb());

  // Back row (up one level)
  if (ZB.stack.length) {
    const up = h('div', 'lr zb-up', null, ico('back'), h('div', 'li', null, h('b', null, '..  Up one level')));
    up.onclick = () => { ZB.stack.pop(); drawZB(); };
    B.append(up);
  }

  const kids = zbChildren(folder);
  if (!kids.length) { B.append(h('div', 'empty', 'This folder is empty.')); return; }

  kids.forEach(e => {
    const k   = e.dir ? 'arc' : (kindOf ? kindOf(e.name) : 'file');
    const row = h('div', 'lr', null,
      ico(e.dir ? 'folder' : (KICON && KICON[k] ? KICON[k] : 'file'), e.dir ? 'fo' : ''),
      h('div', 'li', null,
        h('b', null, e.name),
        h('small', null, e.dir ? 'Folder' : (typeof fmt === 'function' ? fmt(e.size) : e.size+' B'))
      ),
      e.dir ? h('span', 'sz', '') : h('span', 'sz', typeof fmt === 'function' ? fmt(e.size) : '')
    );

    // Drill-in arrow for folders
    if (e.dir) {
      const arr = h('button', 'ib', null, ico('next'));
      arr.onclick = ev => { ev.stopPropagation(); ZB.stack.push(e.fullPath); drawZB(); };
      row.append(arr);
    }

    // Long-press / right-click → extract single entry
    row.oncontextmenu = ev => { ev.preventDefault(); zbEntryMenu(e, ev.clientX, ev.clientY); };
    /* V0.48.0: a real long-press (the web view sends no contextmenu on touch) and a tap that is ignored after a long-press */
    { let tm, x0 = 0, y0 = 0; row._lp = false;
      const stop = () => clearTimeout(tm);
      row.addEventListener('pointerdown', ev => { x0 = ev.clientX; y0 = ev.clientY; row._lp = false; if (e.dir) return;
        tm = setTimeout(() => { row._lp = true; navigator.vibrate && navigator.vibrate(12); zbEntryMenu(e, x0, y0); }, 450); });
      row.addEventListener('pointermove', ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) stop(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(v => row.addEventListener(v, stop)); }
    row.onclick = () => { if (row._lp) { row._lp = false; return; } zbOpenEntry(e); };
    B.append(row);
  });

  // Bottom bar: entry count
  const bar = h('div', 'zbbar');
  bar.textContent = kids.length + ' item' + (kids.length !== 1 ? 's' : '');
  if (ZB.entries.size > kids.length) bar.textContent += '  ·  ' + ZB.entries.size + ' total in archive';
  B.append(bar);
}

/* single-entry context menu */
function zbEntryMenu(e, x, y) {
  if (e.dir) return;
  menu(x || 80, y || 200, [
    ['Open', () => zbOpenEntry(e)],
    ['Open with…', async () => {
      if (typeof SAF !== 'undefined' && SAF && SAF.cachePut) return zbOpenAny(e, true);
      const raw = await zbDecompress(ZB._bytes, e);
      const blob = new Blob([raw]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = e.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }],
    ['Extract next to the zip', () => zbExtractOne(e)]
  ]);
}

async function zbExtractOne(e) {
  try {
    const raw = await zbDecompress(ZB._bytes, e);
    if (SAF && SAF.writeFile) {
      let bin = ''; for (let i = 0; i < raw.length; i += 8192) bin += String.fromCharCode.apply(null, raw.subarray(i, i + 8192));
      await SAF.writeFile({ dir: ZB.src.parent || curDir(), name: e.name, b64: btoa(bin), mime: mimeOf(e.name) });
      toast('Saved ' + e.name + ' next to the zip');
      refresh();
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([raw]));
      a.download = e.name; a.click();
      toast('Downloaded ' + e.name);
    }
  } catch(err) { toast(err.message || 'Extract failed.'); }
}

/* ── public entry point ───────────────────────────────────────────────────── */

async function zipBrowse(item) {
  const tok = ++ZB.tok;
  ZB.on    = true;
  ZB.src   = item;
  ZB.stack = [];
  ZB.sel   = new Set();
  ZB.entries = null;
  ZB._bytes  = null;

  document.body.classList.remove('nav');
  document.body.classList.add('zbon');   /* V0.50.0: viewers opened from inside the zip sit above the Tools panel */
  $('#tools').classList.add('on');   /* V0.43.4: the browser draws inside the Tools panel, which was never opened, so nothing showed */
  TV.view = 'zb';
  const B = $('#tbody'); B.replaceChildren();
  head(item.name, true);
  B.append(h('div', 'spin', null, ico('zip'), h('p', null, 'Reading archive…')));

  try {
    const bytes = await zbBytes(item);
    if (ZB.tok !== tok) return;
    ZB._bytes  = bytes;
    ZB.entries = await zbParse(bytes);
    if (ZB.tok !== tok) return;
    drawZB();
  } catch(err) {
    if (ZB.tok !== tok) return;
    ZB.on = false; document.body.classList.remove('zbon');
    toast(err.message || 'Could not read this ZIP.');
    if (TV.view === 'zb') { TV.view = ''; closeTools(); if (cur.m || cur.cat) refresh(); else dashShow(); }
  }
}

/* Back arrow in the Tools header: up one folder, and out of the ZIP at the top */
function zbBack() {
  if (ZB.stack.length) { ZB.stack.pop(); drawZB(); return; }
  zbClose();
}

/* Close the zip browser and go back */
function zbClose() {
  ZB.on = false; ZB.tok++; document.body.classList.remove('zbon');
  TV.view = ''; closeTools(); if (cur.m || cur.cat) refresh(); else dashShow();
}
