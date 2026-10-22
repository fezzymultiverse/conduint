/* shield.js: Conduint Shield (V0.25.0). A small offline file check, NOT a full antivirus.
   Engine = this file. Data = www/shield-rules.json (known-bad hashes, name rules, script patterns, content patterns),
   so the rules can be replaced later without rebuilding the app (a rules copy saved in localStorage 'cnd.shield.rules' wins over the bundled file).
   Safety rule: nothing in here may ever stop the app. If a scan fails, the copy carries on and a toast says so.
   Severity: high = blocked, med = flagged in Recent, low = info only. */
const SHK='cnd.shield.on',SHL='cnd.shield.log',SHN='cnd.shield.n',SHR='cnd.shield.rules',SH_MAX=64*1048576,SH_HASHMAX=40*1048576;
/* the harmless EICAR antivirus test string, kept in two pieces so no scanner flags this source file */
const SH_T=['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR','-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'];
const SH_FALLBACK={v:1,updated:'built in',hashes:{},names:[],scripts:[],content:[{all:SH_T,label:'EICAR antivirus test file (harmless)',sev:'high'}]};
const SH_EXPECT={jpg:'jpg',jpeg:'jpg',png:'png',gif:'gif',pdf:'pdf',webp:'webp',mp3:'mp3',mp4:'mp4',m4a:'mp4',m4v:'mp4',mov:'mp4',zip:'zip',docx:'zip',xlsx:'zip',pptx:'zip',apk:'zip',jar:'zip','7z':'7z',rar:'rar'};
const SH_STRICT=new Set(['jpg','png','gif','pdf','zip','7z','rar']);
const SH_PROG={exe:'Windows program',elf:'Linux program',dex:'Android code'};
const SH_TEXT=new Set(['sh','bash','zsh','py','js','mjs','bat','cmd','ps1','vbs','pl','php','rb','txt','md','html','htm','json','cfg','conf','']);
const SH_ZEXE=new Set(['exe','bat','cmd','scr','msi','ps1','vbs','dll']);
const shOn=()=>{try{return localStorage.getItem(SHK)!=='0'}catch{return true}};
/* V0.43.9: a real two-sided ON | OFF switch (the lit side is the state), used by Shield and the VPN. fn(true) = ON tapped, fn(false) = OFF tapped. */
function onOff(on,fn,disOn){
 const w=h('div','onoff'),a=h('button','oo'+(on?' lit on':''),'ON'),b=h('button','oo'+(on?'':' lit off'),'OFF');
 a.setAttribute('aria-pressed',on?'true':'false');b.setAttribute('aria-pressed',on?'false':'true');
 if(disOn&&!on)a.disabled=true;
 a.onclick=()=>{if(!on)fn(true)};b.onclick=()=>{if(on)fn(false)};w.append(a,b);return w}
const shMB=n=>(n/1048576).toFixed(n>=10485760?0:1)+' MB';
const shJ=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v==null?d:v}catch{return d}};
const shSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const shRe=o=>o._re||(o._re=new RegExp(o.re,o.flags||'i'));
const u16=(b,i)=>b[i]|(b[i+1]<<8),u32=(b,i)=>(b[i]|(b[i+1]<<8)|(b[i+2]<<16)|(b[i+3]<<24))>>>0;
const shStr=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return s};
const shHas=(b,p)=>{for(let i=0;i+p.length<=b.length;i++){let k=0;while(k<p.length&&b[i+k]===p[k])k++;if(k===p.length)return true}return false};
let SHRULES=null;
async function shRules(){
 if(SHRULES)return SHRULES;
 let r=shJ(SHR,null);
 if(!r||typeof r!=='object'||!r.v){r=null;try{const res=await fetch('shield-rules.json',{cache:'no-cache'});if(res.ok)r=await res.json()}catch{}}
 if(!r||typeof r!=='object')r=SH_FALLBACK;
 ['names','scripts','content'].forEach(k=>{if(!Array.isArray(r[k]))r[k]=[]});if(!r.hashes||typeof r.hashes!=='object')r.hashes={};
 SHRULES=r;return r}
/* what the first bytes say the file really is */
function shKind(h){
 if(h.length<4)return'';
 const a=(i,...v)=>v.every((x,j)=>h[i+j]===x);
 if(a(0,0x4D,0x5A))return'exe';if(a(0,0x7F,0x45,0x4C,0x46))return'elf';if(a(0,0x64,0x65,0x78,0x0A))return'dex';
 if(a(0,0xFF,0xD8,0xFF))return'jpg';if(a(0,0x89,0x50,0x4E,0x47))return'png';if(a(0,0x47,0x49,0x46,0x38))return'gif';if(a(0,0x25,0x50,0x44,0x46))return'pdf';
 if(a(0,0x50,0x4B,3,4)||a(0,0x50,0x4B,5,6))return'zip';if(a(0,0x37,0x7A,0xBC,0xAF))return'7z';if(a(0,0x52,0x61,0x72,0x21))return'rar';
 if(a(0,0x52,0x49,0x46,0x46)&&a(8,0x57,0x45,0x42,0x50))return'webp';if(a(4,0x66,0x74,0x79,0x70))return'mp4';
 if(a(0,0x49,0x44,0x33)||(h[0]===0xFF&&(h[1]&0xE0)===0xE0))return'mp3';
 return''}
/* scan one file {uri,name,size?}. Returns [{sev,label}]. Never throws for a bad file; a missing plugin is the caller's check. */
async function shScanItem(it,rules){
 const out=[],seen=new Set(),f=(sev,label)=>{if(!seen.has(label)){seen.add(label);out.push({sev,label})}};
 const name=it.name||'',ext=(name.indexOf('.')>=0?name.split('.').pop():'').toLowerCase();
 for(const r of rules.names){try{if(shRe(r).test(name))f(r.sev||'med',r.label)}catch{}}
 let size=it.size;if(size==null&&it.uri){try{size=(await SAF.stat({uri:it.uri})).size}catch{}}
 if(size!=null&&size>SH_MAX){f('low','Too big to scan fully ('+shMB(size)+'). Only the name was checked.');return out}
 let b,cp='';
 try{const r=await SAF.cacheCopy({uri:it.uri,name});cp=r.path;const res=await fetch(CAP.convertFileSrc?CAP.convertFileSrc(r.path):r.path);b=await res.blob()}
 catch{f('low','Could not read this file to scan it');return out}
 const sz=b.size;if(!sz)return out;
 const hd=new Uint8Array(await b.slice(0,Math.min(sz,65536)).arrayBuffer()),tl=new Uint8Array(await b.slice(Math.max(0,sz-65557),sz).arrayBuffer());
 const act=shKind(hd),exp=SH_EXPECT[ext];
 /* 1. known-bad hash */
 if(sz<=SH_HASHMAX){try{const d=new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()));
  const hex=[...d].map(x=>x.toString(16).padStart(2,'0')).join(''),hit=rules.hashes[hex];if(hit)f('high','Known malware: '+hit)}catch{}}
 /* 2. content patterns (head of the file) */
 const hs=shStr(hd);
 for(const r of rules.content){try{const n=(r.all||[r.text||'']).join('');if(n&&hs.indexOf(n)>=0)f(r.sev||'high',r.label)}catch{}}
 /* 3. disguised or damaged */
 if(exp){
  if(SH_PROG[act])f('high','Disguised program: named .'+ext+' but it is really a '+SH_PROG[act]);
  else if(act&&act!==exp)f('med','Content does not match the .'+ext+' name (it looks like '+act+')');
  else if(!act&&SH_STRICT.has(exp))f('med','Not a real .'+ext+' file, or badly damaged');
  else if(act===exp){
   const nz=()=>{let i=tl.length;while(i>0&&tl[i-1]===0)i--;return i};
   if(exp==='jpg'){const i=nz();if(!(i>=2&&tl[i-2]===0xFF&&tl[i-1]===0xD9))f('med','JPEG looks cut off (damaged or incomplete)')}
   else if(exp==='png'){if(!shHas(tl.subarray(Math.max(0,tl.length-16)),[0x49,0x45,0x4E,0x44]))f('med','PNG looks cut off (damaged or incomplete)')}
   else if(exp==='pdf'){if(shStr(tl.subarray(Math.max(0,tl.length-1100))).indexOf('%%EOF')<0)f('med','PDF looks cut off (damaged or incomplete)')}
   else if(exp==='zip')await shZip(b,tl,sz,ext,f)}}
 else if(SH_PROG[act]&&ext&&!['so','bin','o','a','elf','out','dex','exe','dll','apk','jar'].includes(ext)&&SH_TEXT.has(ext))f('med','A '+SH_PROG[act]+' is hiding behind a .'+ext+' name');
 /* 3b. APK: permissions and signing key (V0.25.0). Copying is only blocked for a known-bad signing key; the rest is flagged. */
 if(ext==='apk'&&act==='zip'&&cp&&typeof shApkFindings==='function'){try{(await shApkFindings(cp,rules)).forEach(x=>f(x.hard?'high':(x.sev==='high'?'med':x.sev),'App file: '+x.label))}catch{}}
 /* 4. scripts */
 if(sz<=2097152&&!act&&(SH_TEXT.has(ext)||(hd[0]===0x23&&hd[1]===0x21))){
  try{const t=new TextDecoder('utf-8').decode(await b.slice(0,Math.min(sz,409600)).arrayBuffer());
   for(const r of rules.scripts){try{if(shRe(r).test(t))f(r.sev||'med',r.label)}catch{}}}catch{}}
 return out}
/* zip structure: central directory from the end of the file */
async function shZip(b,tl,sz,ext,f){
 let p=-1;for(let i=tl.length-22;i>=0;i--){if(tl[i]===0x50&&tl[i+1]===0x4B&&tl[i+2]===5&&tl[i+3]===6){p=i;break}}
 if(p<0){f('med','Archive looks damaged (end of file missing)');return}
 const cdSize=u32(tl,p+12),cdOff=u32(tl,p+16);
 if(cdOff===0xFFFFFFFF||cdSize===0xFFFFFFFF)return;
 if(cdOff+cdSize>sz){f('med','Archive looks damaged (directory is past the end)');return}
 if(cdSize>4194304)return;
 const cd=new Uint8Array(await b.slice(cdOff,cdOff+cdSize).arrayBuffer());
 let pos=0,n=0,unc=0,comp=0,trav=0,man=false;const exe=[];
 while(pos+46<=cd.length&&cd[pos]===0x50&&cd[pos+1]===0x4B&&cd[pos+2]===1&&cd[pos+3]===2){
  const cs=u32(cd,pos+20),us=u32(cd,pos+24),nl=u16(cd,pos+28),el=u16(cd,pos+30),cl=u16(cd,pos+32);
  const nm=new TextDecoder('utf-8').decode(cd.subarray(pos+46,pos+46+nl));
  n++;unc+=us;comp+=cs;
  if(/(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[A-Za-z]:[\\/]/.test(nm))trav++;
  const e=(nm.indexOf('.')>=0?nm.split('.').pop():'').toLowerCase();
  if(SH_ZEXE.has(e))exe.push(nm);if(nm==='AndroidManifest.xml')man=true;
  pos+=46+nl+el+cl}
 if(trav)f('high','Archive tries to write outside its own folder (path traversal)');
 if(unc>2147483648&&comp>0&&unc/comp>200)f('high','Zip bomb: a small file that expands to a huge size');
 if(n>50000)f('med','Archive holds an unusual number of files');
 if(exe.length&&ext!=='apk'&&ext!=='jar')f('med','Archive contains Windows programs ('+exe[0]+')');
 if(man)f('low',ext==='apk'?'Android app (APK)':'Contains an Android app')}
/* ---- counters and the Recent list ---- */
function shTally(name,f,kind){
 const hi=f.filter(x=>x.sev==='high'),me=f.filter(x=>x.sev==='med'),ap=kind==='apk';
 const n=shJ(SHN,{s:0,b:0});n.s=(n.s||0)+1;if(hi.length&&!ap)n.b=(n.b||0)+1;shSet(SHN,n);
 if(hi.length||me.length){const lg=shJ(SHL,[]);lg.unshift({t:Date.now(),n:name,v:hi.length?(ap?'warned':'blocked'):'noted',w:(hi[0]||me[0]).label});shSet(SHL,lg.slice(0,40))}
 return{hi,me}}
/* ---- the scan effect: a sweeping beam across the top and a pill with the file being scanned ---- */
function shFxEl(){let e=$('#shfx');if(!e){e=h('div','shfx',null,h('div','shbeam'),h('div','shpill',null,ico('shield'),h('span','shtx','Shield')));e.id='shfx';document.body.append(e)}return e}
function shFxOn(t){const e=shFxEl();clearTimeout(shFxDone.t);e.className='shfx on';e.querySelector('.shtx').textContent=t||'Scanning…'}
function shFxText(t){const e=$('#shfx');if(e)e.querySelector('.shtx').textContent=t}
function shFxDone(kind,t){const e=shFxEl();e.className='shfx on '+(kind==='bad'?'bad':'ok');e.querySelector('.shtx').textContent=t;clearTimeout(shFxDone.t);shFxDone.t=setTimeout(()=>e.classList.remove('on'),1500)}
function shFxOff(){const e=$('#shfx');if(e)e.classList.remove('on')}
/* ---- Android notifications (V0.28.0). Two switches in Settings > Shield (shNoteScan, shNoteBlock, both on by default).
   "scan" = a scan finished and found nothing dangerous (quiet channel); "block" = Shield stopped or found something (loud channel).
   Never throws. Returns true only when Android really showed it; false when it is off, unavailable or Android has notifications denied. ---- */
async function shNote(kind,title,text){
 try{
  if(typeof NATIVE==='undefined'||!NATIVE||typeof WATCH==='undefined'||!WATCH||typeof WATCH.note!=='function')return false;
  if(S.settings[kind==='block'?'shNoteBlock':'shNoteScan']===false)return false;
  const r=await WATCH.note({id:kind+Date.now(),kind,title:String(title).slice(0,80),text:String(text).slice(0,400)});
  return !!(r&&r.shown)}
 catch{return false}}
/* ---- the gate used by copy and move: returns the items that may go ahead ---- */
async function shGuard(items){
 try{
  if(!shOn()||typeof NATIVE==='undefined'||!NATIVE||!SAF)return items;
  const files=items.filter(x=>x&&!x.dir&&x.uri);if(!files.length)return items;
  const rules=await shRules();shFxOn('Shield scanning…');
  const bad=new Map();let i=0;
  for(const it of files){i++;shFxText(i+'/'+files.length+'  '+it.name);let f=[];
   try{f=await shScanItem(it,rules)}catch{f=[{sev:'low',label:'Scan error'}]}
   const t=shTally(it.name,f);if(t.hi.length)bad.set(it,t.hi[0].label)}
  if(!bad.size){shFxDone('ok','Clean');return items}
  shFxDone('bad',bad.size+' blocked');
  shNote('block','Shield stopped '+bad.size+(bad.size===1?' file':' files'),[...bad].slice(0,5).map(([it,w])=>it.name+': '+w).join('\n')+(bad.size>5?'\nand '+(bad.size-5)+' more':''));
  const lines=[...bad].slice(0,4).map(([it,w])=>it.name+': '+w).join('; ')+(bad.size>4?'; and '+(bad.size-4)+' more':'');
  const rest=items.filter(x=>!bad.has(x));
  if(!rest.length){await dlg({title:'Shield stopped this',msg:lines,ok:'OK',nocancel:true});return[]}
  const ok=await dlg({title:'Shield stopped '+bad.size+(bad.size===1?' file':' files'),msg:lines,ok:'Skip it and continue'});
  return ok?rest:[]}
 catch(e){shFxOff();try{toast('Shield could not scan: '+(e.message||e)+'. Continuing.')}catch{}return items}}
/* ---- scan on open (V0.28.4): tapping a file checks it first. Switch: Settings > Shield (S.settings.shOpen, on by default).
   Only a dangerous (high) finding stops to ask. Medium findings are noted in Recent and the file opens. A clean verdict is remembered
   for the same file (uri + size + modified time) so reopening is instant. Big files (over 25 MB) get the name check only.
   Never throws and never blocks the app: any error, or a scan slower than 8 s, lets the file open. Returns true to open. ---- */
const SH_OPENMAX=25*1048576,SHOPEN_OK=new Map(),SHOPEN_BUSY=new Set();
const shOpenKey=i=>i.uri+'|'+(i.size==null?'':i.size)+'|'+(i.mtime||'');
function shOpenNeeds(i){
 try{
  if(!i||i.dir||!i.uri||i.lost||i.bin)return false;
  if(!shOn()||(S.settings&&S.settings.shOpen===false))return false;
  if(typeof NATIVE==='undefined'||!NATIVE||typeof SAF==='undefined'||!SAF)return false;
  if(/\.apk$/i.test(i.name||''))return false; /* installApk has its own Shield check */
  return !SHOPEN_OK.has(shOpenKey(i))}
 catch{return false}}
async function shOpenGate(i){
 const key=shOpenKey(i);
 if(SHOPEN_BUSY.has(key))return false; /* a second tap while the first scan runs does nothing */
 SHOPEN_BUSY.add(key);let shown=false;
 const tm=setTimeout(()=>{shown=true;shFxOn('Shield checking '+i.name)},250);
 try{
  const rules=await shRules();let f=[];
  const run=async()=>{
   if(i.size!=null&&i.size>SH_OPENMAX){const out=[];for(const r of rules.names){try{if(shRe(r).test(i.name||''))out.push({sev:r.sev||'med',label:r.label})}catch{}}return out}
   return shScanItem(i,rules)};
  const res=await Promise.race([run().catch(()=>null),new Promise(r=>setTimeout(()=>r(null),8000))]);
  if(!res){clearTimeout(tm);if(shown)shFxOff();return true}
  f=res;clearTimeout(tm);
  const t=shTally(i.name,f);
  if(!t.hi.length){
   if(!f.some(x=>x.sev==='low'&&/^Could not read/.test(x.label)))SHOPEN_OK.set(key,1);
   if(t.me.length){shFxDone('ok','Checked: '+t.me.length+' to look at');toast('Shield: '+t.me[0].label)}
   else if(shown)shFxDone('ok','Clean');
   return true}
  shFxDone('bad','Dangerous file');
  shNote('block','Shield found a dangerous file',i.name+': '+t.hi[0].label);
  const lines=t.hi.slice(0,3).map(x=>x.label).join('; ')+(t.hi.length>3?'; and '+(t.hi.length-3)+' more':'');
  const ok=await dlg({title:'Shield: "'+i.name+'" looks dangerous',msg:lines+'. Opening it could harm this phone.',ok:'Open anyway',danger:true});
  if(ok)SHOPEN_OK.set(key,1);
  return !!ok}
 catch{clearTimeout(tm);if(shown)shFxOff();return true}
 finally{SHOPEN_BUSY.delete(key)}}
/* ---- rules update (V0.24.0): the link lives in Settings > Shield (S.settings.shUrl). The download is checked, then saved as the rules copy that wins over the bundled file ---- */
const SH_NETMAX=2097152;
function shCheck(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw new Error('That address did not return a rules file.');
 if(typeof r.v!=='number'||!(r.v>=1))throw new Error('The rules file has no version number.');
 const sv=x=>x==null||x==='high'||x==='med'||x==='low';
 for(const k of['names','scripts','content']){if(r[k]!=null&&!Array.isArray(r[k]))throw new Error('"'+k+'" in the rules file is not a list.');if((r[k]||[]).length>2000)throw new Error('Too many rules in "'+k+'".')}
 for(const k of['names','scripts'])for(const o of r[k]||[]){
  if(!o||typeof o.re!=='string'||o.re.length>400||typeof o.label!=='string'||!sv(o.sev)||(o.flags!=null&&!/^[gimsuy]*$/.test(o.flags)))throw new Error('A rule in "'+k+'" is not valid.');
  try{new RegExp(o.re,o.flags||'i')}catch{throw new Error('A pattern in "'+k+'" is not valid: '+o.label)}}
 for(const o of r.content||[]){if(!o||typeof o.label!=='string'||!sv(o.sev)||!((Array.isArray(o.all)&&o.all.length&&o.all.every(x=>typeof x==='string'))||typeof o.text==='string'))throw new Error('A rule in "content" is not valid.')}
 if(r.hashes!=null){if(typeof r.hashes!=='object'||Array.isArray(r.hashes))throw new Error('"hashes" in the rules file is not valid.');
  const ks=Object.keys(r.hashes);if(ks.length>100000)throw new Error('Too many hashes in the rules file.');
  for(const k of ks)if(!/^[0-9a-f]{64}$/.test(k)||typeof r.hashes[k]!=='string')throw new Error('A hash in the rules file is not a SHA-256 value.')}
 if(r.apk!=null){const a=r.apk;if(typeof a!=='object'||Array.isArray(a))throw new Error('"apk" in the rules file is not valid.');
  for(const k of['perms','combos','brands']){if(a[k]!=null&&!Array.isArray(a[k]))throw new Error('"apk.'+k+'" is not a list.');if((a[k]||[]).length>2000)throw new Error('Too many rules in "apk.'+k+'".')}
  for(const o of a.perms||[])if(!o||typeof o.name!=='string'||typeof o.label!=='string'||!sv(o.sev))throw new Error('A permission rule is not valid.');
  for(const o of a.combos||[])if(!o||!Array.isArray(o.all)||!o.all.length||!o.all.every(x=>typeof x==='string')||typeof o.label!=='string'||!sv(o.sev))throw new Error('A permission combination rule is not valid.');
  for(const o of a.brands||[]){if(!o||typeof o.re!=='string'||typeof o.ok!=='string'||o.re.length>200||o.ok.length>200||typeof o.label!=='string'||!sv(o.sev))throw new Error('A name rule is not valid.');try{new RegExp(o.re,'i');new RegExp(o.ok,'i')}catch{throw new Error('A name rule has a pattern that is not valid: '+o.label)}}
  if(a.certs!=null){if(typeof a.certs!=='object'||Array.isArray(a.certs))throw new Error('"apk.certs" is not valid.');for(const k of Object.keys(a.certs))if(!/^[0-9a-f]{64}$/.test(k)||typeof a.certs[k]!=='string')throw new Error('A signing key in the rules file is not a SHA-256 value.')}}
 return r}
async function shGet(u){
 let P=null;try{P=(CAP.Plugins&&CAP.Plugins.CapacitorHttp)||(typeof plug==='function'?plug('CapacitorHttp'):null)}catch{}
 if(typeof NATIVE!=='undefined'&&NATIVE&&P&&P.get){
  try{const r=await P.get({url:u,headers:{Accept:'application/json'},connectTimeout:15000,readTimeout:15000,responseType:'text'});
   if(r.status<200||r.status>=300)throw new Error('The server answered '+r.status+'.');
   return typeof r.data==='string'?r.data:JSON.stringify(r.data)}
  catch(e){if(/^The server answered/.test(e.message||''))throw e}}
 const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
 try{const res=await fetch(u,{signal:c.signal,cache:'no-store'});if(!res.ok)throw new Error('The server answered '+res.status+'.');return await res.text()}
 catch(e){if(e&&e.name==='AbortError')throw new Error('The link took too long to answer.');if(/^The server answered/.test(e.message||''))throw e;throw new Error('Could not reach the link. Check the address and your connection.')}
 finally{clearTimeout(t)}}
const shCount=r=>Object.keys(r.hashes||{}).length+(r.names||[]).length+(r.scripts||[]).length+(r.content||[]).length+(r.apk?(r.apk.perms||[]).length+(r.apk.combos||[]).length+(r.apk.brands||[]).length+Object.keys(r.apk.certs||{}).length:0);
async function shUpdate(u){
 u=(u||(S.settings.shUrl||'')).trim();
 if(!/^https:\/\/[^\s]+$/i.test(u))throw new Error('Type an address that starts with https:// first.');
 const txt=await shGet(u);
 if(txt.length>SH_NETMAX)throw new Error('The rules file is too big (limit 2 MB).');
 let r;try{r=JSON.parse(txt)}catch{throw new Error('That address did not return a rules file (it is not valid JSON).')}
 shCheck(r);
 const old=await shRules();
 if(typeof old.v==='number'&&r.v<old.v)throw new Error('That rules file is older (version '+r.v+') than the one you have (version '+old.v+'). Nothing changed.');
 const was=shCount(old),sameVer=r.v===old.v&&(r.updated||'')===(old.updated||'')&&was===shCount(r);
 r.src=u;r.fetched=Date.now();
 try{localStorage.setItem(SHR,JSON.stringify(r));if(!localStorage.getItem(SHR))throw 0}catch{throw new Error('The phone has no room to save the new rules.')}
 SHRULES=null;await shRules();
 return sameVer?'Already up to date (version '+r.v+').':'Rules updated: version '+r.v+' · '+Object.keys(r.hashes||{}).length+' known-bad hashes · '+(shCount(r)-Object.keys(r.hashes||{}).length)+' patterns.'}
let SHBUSY=false;
function shRefreshUI(){try{if($('#set').classList.contains('on'))drawSettings();if(typeof TV!=='undefined'&&TV.view==='sh'&&$('#tbody'))drawShield()}catch{}}
async function shDoUpdate(btn){
 if(SHBUSY)return;
 if(!(S.settings.shUrl||'').trim()){toast('Set the rules link first: Settings > Shield.');return}
 SHBUSY=true;const lab=btn&&btn.textContent;if(btn){btn.textContent='Updating…';btn.disabled=true}
 let msg,ok=true;
 try{msg=await shUpdate();shFxDone('ok','Rules updated')}catch(e){ok=false;msg=(e&&e.message)||'The update failed.'}
 SHBUSY=false;S.settings.shLast={t:Date.now(),ok,msg};save();
 if(btn&&btn.isConnected){btn.textContent=lab;btn.disabled=false}
 toast(ok?msg:'Update failed: '+msg);shRefreshUI()}
function shReset(){try{localStorage.removeItem(SHR)}catch{}SHRULES=null;S.settings.shLast={t:Date.now(),ok:true,msg:'Back to the rules built into the app.'};save();toast('Using the rules built into the app.');shRefreshUI()}
/* ---- the Shield screen (Tools > Shield) ---- */
async function tShield(){TV.view='sh';await shRules();try{if(typeof NATIVE!=='undefined'&&NATIVE&&typeof readPerm==='function')await readPerm()}catch{}drawShield()}
function drawShield(){
 TV.view='sh';const B=$('#tbody');B.replaceChildren();B.classList.remove('auscreen');head('Shield',true);
 const R=SHRULES||SH_FALLBACK,n=shJ(SHN,{s:0,b:0}),on=shOn();
 const top=h('div','dc shcard',null,h('b',null,'Shield is '+(on?'on':'off')),h('small',null,'A file check, not a full antivirus. It checks files you copy or move and the ones you scan here. Everything stays on this phone.'));
 const tg=onOff(on,v=>{try{localStorage.setItem(SHK,v?'1':'0')}catch{}drawShield();if(typeof layRefresh==='function')layRefresh()});top.append(tg);
 /* V0.28.0: notifications card (Android app only). Two switches and, when Android has notifications off, a way to allow them. */
 let nc=null;
 if(typeof NATIVE!=='undefined'&&NATIVE&&typeof WATCH!=='undefined'&&WATCH){
  const sv=S.settings,sc=sv.shNoteScan!==false,bl=sv.shNoteBlock!==false,denied=typeof PERM!=='undefined'&&PERM&&PERM.notifications===false;
  nc=h('div','dc shcard',null,h('b',null,'Notifications'),h('small',null,'Android tells you when a scan finishes and when Shield stops or finds a dangerous file, also while Conduint is in the background.'));
  const nr=h('div','shrow'),c1=h('button','chip'+(sc?' on':''),'Scan finished: '+(sc?'On':'Off')),c2=h('button','chip'+(bl?' on':''),'Dangerous file: '+(bl?'On':'Off'));
  c1.onclick=()=>{sv.shNoteScan=!sc;save();drawShield()};c2.onclick=()=>{sv.shNoteBlock=!bl;save();drawShield()};nr.append(c1,c2);nc.append(nr);
  if(denied&&(sc||bl)){const al=h('button','chip on','Allow notifications');al.onclick=()=>askPerm('notifications');nc.append(h('small','shwarn','Android has notifications turned off for Conduint, so none of these will show.'),al)}}
 const info=h('div','dc shcard',null,h('b',null,'Rules'),h('small',null,'Version '+R.v+' · '+R.updated+' · '+Object.keys(R.hashes).length+' known-bad hashes · '+(shCount(R)-Object.keys(R.hashes).length)+' patterns'),h('small',null,'Scanned '+(n.s||0)+' files · blocked '+(n.b||0)),h('small',null,R.fetched?'Updated '+new Date(R.fetched).toLocaleString()+' from your link':'Using the rules built into the app'));
 const row=h('div','shrow'),b1=h('button','chip on','Scan files…'),b2=h('button','chip on','Scan a folder…'),b3=h('button','chip','Make a test file'),b4=h('button','chip','Update rules'),b5=h('button','chip on','Inspect an APK…');
 b1.onclick=shPick;b2.onclick=shPickDir;b3.onclick=shTestFile;b4.onclick=()=>shDoUpdate(b4);b5.onclick=shApkPick;row.append(b1,b2,b5,b3,b4);
 const res=h('div','shres');res.id='shres';
 const lg=shJ(SHL,[]),hist=h('div','dc shcard',null,h('b',null,'Recent'));
 if(!lg.length)hist.append(h('small',null,'Nothing blocked or flagged yet.'));
 lg.slice(0,15).forEach(e=>hist.append(h('div','shlg '+e.v,null,h('b',null,e.n),h('small',null,(e.v==='blocked'?'Blocked: ':e.v==='warned'?'Warned: ':'Noted: ')+e.w+' · '+new Date(e.t).toLocaleString()))));
 if(lg.length){const c=h('button','chip','Clear');c.onclick=()=>{try{localStorage.removeItem(SHL)}catch{}drawShield()};hist.append(c)}
 B.append(top,...(nc?[nc]:[]),info,row,res,hist)}
async function shRun(items){
 const out=$('#shres');if(out)out.replaceChildren();
 try{const rules=await shRules();shFxOn('Scanning…');let bad=0,note=0,i=0;const rows=[],badRows=[];
  for(const it of items){i++;shFxText(i+'/'+items.length+'  '+it.name);let f=[];
   try{f=await shScanItem(it,rules)}catch(e){f=[{sev:'low',label:'Scan error: '+(e.message||e)}]}
   const t=shTally(it.name,f),v=t.hi.length?'blocked':t.me.length?'noted':'clean';
   if(t.hi.length)bad++;else if(t.me.length)note++;
   if(t.hi.length)badRows.push(it.name+': '+t.hi[0].label);
   rows.push([it.name,v,t.hi.concat(t.me,f.filter(x=>x.sev==='low')).map(x=>x.label).join(' · ')])}
  shFxDone(bad?'bad':'ok',bad?bad+' dangerous':'Clean');
  /* one notification per scan: the loud one when something dangerous was found, the quiet one otherwise */
  const sum=items.length+(items.length===1?' file':' files')+' scanned · '+bad+' dangerous · '+note+' to check';
  if(bad)shNote('block',bad===1?'Shield found a dangerous file':'Shield found '+bad+' dangerous files',badRows.slice(0,5).join('\n')+(bad>5?'\nand '+(bad-5)+' more':'')+'\n'+sum);
  else shNote('scan','Shield scan finished',sum);
  const o=$('#shres');
  if(o){o.append(h('div','dc shcard',null,h('b',null,items.length+' scanned · '+bad+' dangerous · '+note+' to check')));
   rows.forEach(r=>o.append(h('div','shlg '+r[1],null,h('b',null,r[0]),h('small',null,r[1]==='clean'&&!r[2]?'Clean':r[2]||'Clean'))))}
  return{n:items.length,bad,note,flag:rows.filter(r=>r[1]!=='clean').map(r=>r[0]+': '+(r[2]||r[1]))}}
 catch(e){shFxOff();toast(e.message||'The scan failed.');return null}}
async function shPick(){try{const r=await SAF.pickDocs({persist:false}),it=((r&&r.items)||[]).filter(x=>!x.dir);if(!it.length)return;await shRun(it)}catch(e){if(e&&e.code!=='CANCELLED')toast(e.message||'Could not scan.')}}
/* V0.31.3: folders are walked from the folder's document address (t.root). The old code passed the bare tree address, which Android
   cannot list, so "Scan a folder" found nothing and did nothing. Up to 1500 files, 8 levels deep. */
const SH_WALKMAX=1500;
async function shWalk(uri,out,depth,st){
 let r;try{r=await SAF.list({uri})}catch{st.skip++;return}
 for(const x of r.items||[]){if(out.length>=SH_WALKMAX){st.cap=true;return}
  if(x.dir){if(depth<8)await shWalk(x.uri,out,depth+1,st)}else out.push({uri:x.uri,name:x.name,size:x.size})}}
/* scan what is selected in the file manager (files and folders); also used by Scan a folder */
async function shScanSel(items){
 try{
  if(typeof NATIVE==='undefined'||!NATIVE||typeof SAF==='undefined'||!SAF)return toast('Scanning runs in the Android app.');
  const out=[],st={skip:0,cap:false};shFxOn('Listing files…');
  for(const it of items||[]){
   if(!it||!it.uri)continue;
   if(it.dir)await shWalk(it.uri,out,0,st);else out.push({uri:it.uri,name:it.name,size:it.size});
   if(out.length>=SH_WALKMAX){st.cap=true;break}}
  if(!out.length){shFxOff();return toast(st.skip?'That folder could not be read.':'No files to scan in the selection.')}
  const r=await shRun(out);if(!r)return;
  const extra=(st.cap?'\nOnly the first '+SH_WALKMAX+' files were scanned.':'')+(st.skip?'\n'+st.skip+(st.skip===1?' folder':' folders')+' could not be read.':'');
  if($('#shres')){if(extra)toast(extra.trim());return}
  await dlg({title:r.n+(r.n===1?' file':' files')+' scanned · '+r.bad+' dangerous · '+r.note+' to check',
   msg:(r.flag.length?r.flag.slice(0,10).join('\n')+(r.flag.length>10?'\nand '+(r.flag.length-10)+' more':''):'Nothing dangerous found.')+extra,ok:'OK',nocancel:true})}
 catch(e){shFxOff();if(e&&e.code!=='CANCELLED')toast(e.message||'Could not scan.')}}
async function shPickDir(){try{const t=await SAF.pickTree({volume:'',start:''});await shScanSel([{uri:t.root||t.uri,name:t.name,dir:true}])}
 catch(e){shFxOff();if(e&&e.code!=='CANCELLED')toast(e.message||'Could not scan.')}}
async function shTestFile(){try{const t=await SAF.pickTree({volume:'',start:''});
 await SAF.writeFile({dir:t.root||t.uri,name:'shield-test.txt',b64:btoa(SH_T.join('')),mime:'text/plain'});
 toast('Saved shield-test.txt. It is harmless. Copy it to see Shield stop it.')}catch(e){if(e&&e.code!=='CANCELLED')toast(e.message||'Could not save the test file.')}}
