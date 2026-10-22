/* meta.js: song tags, artwork and lyrics.
   Reads the tags inside the file (MP3 ID3v2, M4A/MP4, FLAC), then looks for a .lrc or cover file next to the song,
   and only when nothing synced is found asks lrclib.net (lyrics) and iTunes (artwork) over the internet.
   Everything found online can be saved next to the song (song.lrc, song.jpg) so it works offline and in other players. */

/* ---------- [1] LRC (synced lyrics) ---------- */
function parseLrc(txt){
 const out=[];let off=0;
 String(txt||'').split(/\r?\n/).forEach(raw=>{
  const o=raw.match(/^\s*\[offset:\s*(-?\d+)\s*\]/i);if(o){off=+o[1];return}
  const ts=[];let rest=raw.replace(/^\s*((?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+)/,(m,g)=>{g.replace(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g,(x,mm,ss,f)=>{ts.push(+mm*60+ +ss+(f?+('0.'+f):0))});return''});
  if(!ts.length)return;
  const l=rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g,'').trim();
  ts.forEach(t=>out.push({t:Math.max(0,t-off/1000),l}))});
 return out.sort((a,b)=>a.t-b.t)}
const isSynced=t=>/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(t||'');
const plainLines=t=>String(t||'').split(/\r?\n/).map(l=>({t:-1,l:l.replace(/^\s*\[[^\]]*\]\s*/,'').trim()}));

/* ---------- [2] TAG READERS ---------- */
const td={l:new TextDecoder('latin1'),u8:new TextDecoder('utf-8'),le:new TextDecoder('utf-16le'),be:new TextDecoder('utf-16be')};
/* decode text by ID3 encoding byte: 0 latin1, 1 utf-16 with BOM, 2 utf-16be, 3 utf-8 */
function dec(enc,b){
 if(enc===1){if(b.length>=2&&b[0]===0xFF&&b[1]===0xFE)return td.le.decode(b.subarray(2));if(b.length>=2&&b[0]===0xFE&&b[1]===0xFF)return td.be.decode(b.subarray(2));return td.le.decode(b)}
 return(enc===2?td.be:enc===3?td.u8:td.l).decode(b)}
/* find the terminator of a string in b from i: one zero byte, or an aligned zero pair for utf-16 */
function term(enc,b,i){
 if(enc===1||enc===2){for(;i+1<b.length;i+=2)if(b[i]===0&&b[i+1]===0)return i;return b.length}
 for(;i<b.length;i++)if(b[i]===0)return i;return b.length}
const tlen=enc=>enc===1||enc===2?2:1;
const clean=s=>String(s||'').replace(/\0+$/g,'').trim();
const sync4=(b,i)=>((b[i]&127)<<21)|((b[i+1]&127)<<14)|((b[i+2]&127)<<7)|(b[i+3]&127);
const be32=(b,i)=>((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0;
const ascii=(b,i,n)=>String.fromCharCode(...b.subarray(i,i+n));

function readId3(b){
 const T={};if(b.length<10||ascii(b,0,3)!=='ID3')return T;
 const ver=b[3],flags=b[5],size=sync4(b,6);let body=b.subarray(10,Math.min(b.length,10+size));
 if(flags&0x80&&ver<4){const o=[];for(let i=0;i<body.length;i++){o.push(body[i]);if(body[i]===0xFF&&body[i+1]===0)i++}body=Uint8Array.from(o)}
 let i=0;if(flags&0x40&&body.length>4){i=ver===4?sync4(body,0):be32(body,0)+(ver===3?4:0)}
 const idl=ver===2?3:4,hl=ver===2?6:10;
 while(i+hl<=body.length){
  const id=ascii(body,i,idl);if(!/^[A-Z0-9]+$/.test(id))break;
  const fs=ver===2?(body[i+3]<<16|body[i+4]<<8|body[i+5]):ver===4?sync4(body,i+4):be32(body,i+4);
  if(!fs||i+hl+fs>body.length)break;
  const f=body.subarray(i+hl,i+hl+fs);i+=hl+fs;const enc=f[0];
  if(/^(TIT2|TT2)$/.test(id))T.title=clean(dec(enc,f.subarray(1)));
  else if(/^(TPE1|TP1)$/.test(id))T.artist=clean(dec(enc,f.subarray(1))).replace(/\0/g,', ');
  else if(/^(TALB|TAL)$/.test(id))T.album=clean(dec(enc,f.subarray(1)));
  else if(/^(USLT|ULT)$/.test(id)){const s=term(enc,f,4);T.lyrics=clean(dec(enc,f.subarray(s+tlen(enc))))}
  else if(id==='SYLT'||id==='SLT'){
   const fmt=f[4],s0=term(enc,f,6);let p=s0+tlen(enc);const L=[];
   while(p<f.length){const e=term(enc,f,p);if(e>=f.length)break;const text=dec(enc,f.subarray(p,e)).replace(/^\n/,'');p=e+tlen(enc);if(p+4>f.length)break;const ms=be32(f,p);p+=4;
    if(fmt===2)L.push({t:ms/1000,l:text.trim()})}
   if(L.length)T.sylt=L}
  else if(id==='APIC'||id==='PIC'){
   let p=1,mime;if(id==='PIC'){mime='image/'+ascii(f,1,3).toLowerCase().replace('jpg','jpeg');p=4}else{const e=term(0,f,1);mime=ascii(f,1,e-1)||'image/jpeg';p=e+1}
   const type=f[p];p++;const e2=term(enc,f,p);p=e2+tlen(enc);
   if(!T.art||type===3)T.art={mime:mime.includes('/')?mime:'image/jpeg',data:f.subarray(p)}}}
 return T}

function readMp4(b){
 const T={};
 const walk=(s,e,path)=>{
  while(s+8<=e){let sz=be32(b,s);const id=ascii(b,s+4,4);let hs=8;if(sz===1){sz=be32(b,s+12);hs=16}if(sz===0)sz=e-s;if(sz<hs||s+sz>e)break;
   if(id==='moov'||id==='udta'||id==='ilst')walk(s+hs,s+sz,path+'/'+id);
   else if(id==='meta')walk(s+hs+4,s+sz,path+'/meta');
   else if(path.endsWith('/ilst')){
    let p=s+hs;const end=s+sz;
    while(p+16<=end){const dz=be32(b,p);if(ascii(b,p+4,4)==='data'&&dz>=16){const pay=b.subarray(p+16,p+dz);
      if(id==='\xA9nam')T.title=clean(td.u8.decode(pay));else if(id==='\xA9ART')T.artist=clean(td.u8.decode(pay));
      else if(id==='\xA9alb')T.album=clean(td.u8.decode(pay));else if(id==='\xA9lyr')T.lyrics=clean(td.u8.decode(pay));
      else if(id==='covr')T.art={mime:pay[0]===0x89?'image/png':'image/jpeg',data:pay};break}
     if(dz<8)break;p+=dz}}
   s+=sz}};
 walk(0,b.length,'');return T}

function readFlac(b){
 const T={};let p=4;
 while(p+4<=b.length){const hdr=b[p],type=hdr&127,len=(b[p+1]<<16)|(b[p+2]<<8)|b[p+3];p+=4;const d=b.subarray(p,p+len);p+=len;
  if(type===4){const lt=x=>x[0]|x[1]<<8|x[2]<<16|x[3]<<24;let q=0;const vl=lt(d.subarray(q));q+=4+vl;const n=lt(d.subarray(q));q+=4;
   for(let k=0;k<n&&q<d.length;k++){const l=lt(d.subarray(q));q+=4;const s=td.u8.decode(d.subarray(q,q+l));q+=l;const eq=s.indexOf('=');if(eq<0)continue;
    const key=s.slice(0,eq).toUpperCase(),v=s.slice(eq+1);
    if(key==='TITLE')T.title=v;else if(key==='ARTIST')T.artist=v;else if(key==='ALBUM')T.album=v;else if(key==='LYRICS'||key==='UNSYNCEDLYRICS')T.lyrics=v}}
  else if(type===6){let q=4;const ml=be32(d,q);q+=4;const mime=ascii(d,q,ml);q+=ml;const dl=be32(d,q);q+=4+dl+16;const pl=be32(d,q);q+=4;T.art={mime:mime||'image/jpeg',data:d.subarray(q,q+pl)}}
  if(hdr&128)break}
 return T}

function readTags(buf){
 const b=new Uint8Array(buf);
 try{
  if(b.length>10&&ascii(b,0,3)==='ID3')return readId3(b);
  if(b.length>12&&ascii(b,4,4)==='ftyp')return readMp4(b);
  if(b.length>4&&ascii(b,0,4)==='fLaC')return readFlac(b)}
 catch{}
 return{}}

/* ---------- [3] SIDE FILES (.lrc and cover art next to the song) ---------- */
const baseName=n=>n.replace(/\.[^.]+$/,'');
const dirUri=u=>u.slice(0,u.lastIndexOf('/'));
/* returns {find(names)->uri|null, dir} for the folder a song lives in; null when the folder is unknown (cloud files, desktop preview) */
async function sideFolder(it){
 if(it.uri&&it.uri.startsWith('file://')){
  const dir=dirUri(it.uri),path=decodeURIComponent(dir.slice(7));
  return{dir,write:true,async find(names){if(!TOOLS||!TOOLS.fsExists)return null;
   const r=await TOOLS.fsExists({paths:names.map(n=>path+'/'+n)});const i=r.exists.indexOf(true);return i<0?null:dir+'/'+encodeURIComponent(names[i])}}}
 if(it.uri&&SAF&&it.parent){
  let list=null;
  return{dir:it.parent,write:true,async find(names){if(!list)list=(await SAF.list({uri:it.parent})).items;
   for(const n of names){const x=list.find(e=>!e.dir&&e.name.toLowerCase()===n.toLowerCase());if(x)return x.uri}return null}}}
 return null}
async function readSideText(uri){
 const r=await SAF.cacheCopy({uri,name:'x.lrc'});
 const res=await fetch(CAP.convertFileSrc?CAP.convertFileSrc(r.path):r.path);return res.text()}
async function readSideImage(uri,name){
 const r=await SAF.cacheCopy({uri,name});
 const res=await fetch(CAP.convertFileSrc?CAP.convertFileSrc(r.path):r.path);return res.blob()}

/* ---------- [4] ONLINE LOOKUP ---------- */
async function jfetch(u){const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);
 try{const r=await fetch(u,{signal:c.signal});if(!r.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(t)}}
/* "Artist - Title" file names are common; use them when the tags are empty */
function guessNames(name,T){
 let b=baseName(name).replace(/^\d{1,3}[\s._-]+/,'').replace(/_/g,' ').trim(),a=T.artist||'',t=T.title||'';
 if(!t){const m=b.split(/\s+-\s+/);if(m.length>=2){if(!a)a=m[0].trim();t=m.slice(1).join(' - ').trim()}else t=b}
 return{artist:a,title:t}}
async function lookupLyrics(artist,title,album,dur){
 if(!title)return null;
 const q=new URLSearchParams({track_name:title,artist_name:artist||''});if(album)q.set('album_name',album);if(dur>0)q.set('duration',Math.round(dur));
 let r=artist?await jfetch('https://lrclib.net/api/get?'+q):null;
 if(!r||(!r.syncedLyrics&&!r.plainLyrics)){const s=await jfetch('https://lrclib.net/api/search?q='+encodeURIComponent((artist+' '+title).trim()));
  if(Array.isArray(s))r=s.find(x=>x.syncedLyrics)||s.find(x=>x.plainLyrics)||null}
 return r&&(r.syncedLyrics||r.plainLyrics)?{synced:r.syncedLyrics||'',plain:r.plainLyrics||'',artist:r.artistName,title:r.trackName,album:r.albumName}:null}
async function lookupArt(artist,title){
 if(!title)return null;
 const r=await jfetch('https://itunes.apple.com/search?media=music&entity=song&limit=3&term='+encodeURIComponent((artist+' '+title).trim()));
 const x=r&&r.results&&r.results.find(v=>v.artworkUrl100);if(!x)return null;
 try{const res=await fetch(x.artworkUrl100.replace(/\d+x\d+bb/,'600x600bb'));if(!res.ok)return null;return await res.blob()}catch{return null}}

/* ---------- [5] SAVE NEXT TO THE SONG ---------- */
const toB64=blob=>new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>res('');r.readAsDataURL(blob)});
async function saveSide(side,name,data,mime){
 if(!SAF||!SAF.writeFile||!side||!side.write)return false;
 try{await SAF.writeFile({dir:side.dir,name,mime:mime||'application/octet-stream',...(typeof data==='string'?{text:data}:{b64:await toB64(data)})});return true}catch{return false}}

/* the whole job for one song. Calls ui(partial) whenever something new is known. Never throws. */
async function songInfo(it,src,durOf,ui,still){
 const out={title:'',artist:'',album:'',art:null,lines:[],synced:false,saved:[]};
 const push=()=>still()&&ui({...out});
 let T={};
 try{const r=await fetch(src);const buf=await r.arrayBuffer();T=readTags(buf.byteLength>80e6?buf.slice(0,3e6):buf)}catch{}
 const g=guessNames(it.name,T);
 out.title=T.title||g.title;out.artist=T.artist||g.artist;out.album=T.album||'';
 if(T.art&&T.art.data&&T.art.data.length>200)out.art=new Blob([T.art.data],{type:T.art.mime});
 if(T.sylt){out.lines=T.sylt;out.synced=true}else if(T.lyrics){if(isSynced(T.lyrics)){out.lines=parseLrc(T.lyrics);out.synced=true}else out.lines=plainLines(T.lyrics)}
 push();
 let side=null;try{side=await sideFolder(it)}catch{}
 const base=baseName(it.name);
 /* a .lrc next to the song wins over tags */
 if(!out.synced&&side){try{const u=await side.find([base+'.lrc']);if(u){const t=await readSideText(u);const L=parseLrc(t);if(L.length){out.lines=L;out.synced=true}else if(t.trim()){out.lines=plainLines(t)}}}catch{}push()}
 if(!out.art&&side){try{const u=await side.find([base+'.jpg',base+'.jpeg',base+'.png','cover.jpg','cover.png','folder.jpg','folder.png','albumart.jpg']);if(u)out.art=await readSideImage(u,'a.jpg')}catch{}push()}
 if(!S.settings.online||!navigator.onLine||(out.synced&&out.art))return out;
 /* online: only for what is still missing */
 if(!out.synced){
  const L=await lookupLyrics(out.artist,out.title,out.album,durOf());
  if(L&&still()){
   if(L.synced){out.lines=parseLrc(L.synced);out.synced=out.lines.length>0}
   if(!out.synced&&!out.lines.length&&L.plain)out.lines=plainLines(L.plain);
   if(!out.artist&&L.artist)out.artist=L.artist;if(!out.title&&L.title)out.title=L.title;
   push();
   if(S.settings.autoApply&&side&&(L.synced||L.plain)){if(await saveSide(side,base+'.lrc',L.synced||L.plain,'application/octet-stream'))out.saved.push('lyrics')}}}
 if(!out.art&&still()){
  const A=await lookupArt(out.artist,out.title);
  if(A&&still()){out.art=A;push();if(S.settings.autoApply&&side&&await saveSide(side,base+'.jpg',A,'image/jpeg'))out.saved.push('artwork')}}
 if(out.saved.length&&still())toast('Saved '+out.saved.join(' and ')+' next to the song.');
 return out}
