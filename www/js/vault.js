/* vault.js: Conduit Vault. Private files, AES-256-GCM, all done in the web view with the Web Crypto API.
   Keys: one random 256-bit master key encrypts every file (4 MB chunks) and every file name. The master key is never
   stored in the clear: it is wrapped by your pattern (PBKDF2-SHA256, 250k rounds, mixed with a secret from this phone's Keystore),
   optionally by the fingerprint, and once by your 4-digit RECOVERY PIN (V0.10.0, replaces the old letters recovery code).
   The PIN is mixed with the same Keystore secret, so the 10,000 possible PINs cannot be tried outside this phone, and wrong
   PINs inside the app wait longer and longer. Only the wrapped copies are saved (IndexedDB 'conduint-vault').
   Strategy Over Impulse. */
const VDB='conduint-vault',VCH=4194304,VMAX=67108864,VAL='BCDFGHJKLMNPQRSTVWXYZ';
let VK=null,VOPEN=false,VLIST=[],VN=null,VSET=null,VHID=0;
const vtd=u=>new TextDecoder().decode(u);
const b64e=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const vrnd=n=>crypto.getRandomValues(new Uint8Array(n));
const blobB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(b)});

/* [1] DATABASE */
const vdb=()=>vdb.p||(vdb.p=new Promise((res,rej)=>{const r=indexedDB.open(VDB,1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('meta');d.createObjectStore('files');d.createObjectStore('chunks')};
 r.onsuccess=()=>res(r.result);r.onerror=()=>{vdb.p=null;rej(r.error)}}));
const vreq=(st,mode,fn)=>vdb().then(d=>new Promise((res,rej)=>{const tx=d.transaction(st,mode),q=fn(tx.objectStore(st));
 tx.oncomplete=()=>res(q&&q.result);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}));
const vhdr=()=>vreq('meta','readonly',s=>s.get('hdr'));

/* [2] KEYS */
async function vkek(pass,salt,iter){
 const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},b,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey'])}
async function vwrap(master,pass,iter){
 const salt=vrnd(16),iv=vrnd(12),k=await vkek(pass,salt,iter),w=await crypto.subtle.wrapKey('raw',master,k,{name:'AES-GCM',iv});
 return{s:b64e(salt),i:b64e(iv),w:b64e(new Uint8Array(w)),n:iter}}
async function vunwrap(o,pass){
 const k=await vkek(pass,b64d(o.s),o.n);
 return crypto.subtle.unwrapKey('raw',b64d(o.w),k,{name:'AES-GCM',iv:b64d(o.i)},{name:'AES-GCM'},true,['encrypt','decrypt'])}
const vnorm=c=>c.toUpperCase().replace(/[^A-Z]/g,'');
async function venc(u8){const iv=vrnd(12),c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},VK,u8)),o=new Uint8Array(12+c.length);o.set(iv);o.set(c,12);return o}
async function vdec(u8){u8=new Uint8Array(u8);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:u8.slice(0,12)},VK,u8.subarray(12)))}

/* [3] FILES */
async function vput(name,ab,mime){
 const id=sid()+b64e(vrnd(3)).replace(/[^A-Za-z0-9]/g,'x'),u=new Uint8Array(ab),n=Math.max(1,Math.ceil(u.length/VCH));
 for(let i=0;i<n;i++){const c=await venc(u.subarray(i*VCH,(i+1)*VCH));await vreq('chunks','readwrite',s=>s.put(c.buffer,id+':'+i))}
 const nm=b64e(await venc(new TextEncoder().encode(name)));
 await vreq('files','readwrite',s=>s.put({id,nm,size:u.length,n,mime:mime||'',at:Date.now()},id));return id}
async function vget(f){
 const parts=[];for(let i=0;i<f.n;i++)parts.push(await vdec(await vreq('chunks','readonly',s=>s.get(f.id+':'+i))));
 return new Blob(parts,{type:f.mime||'application/octet-stream'})}
async function vlist(){
 const all=await vreq('files','readonly',s=>s.getAll()),out=[];
 for(const f of all){try{f.name=vtd(await vdec(b64d(f.nm)))}catch{f.name='(unreadable)'}out.push(f)}
 return out.sort((a,b)=>b.at-a.at)}
async function vdel(f){
 await vreq('files','readwrite',s=>s.delete(f.id));
 await vreq('chunks','readwrite',s=>{for(let i=0;i<f.n;i++)s.delete(f.id+':'+i)})}
const vcount=()=>vreq('files','readonly',s=>s.count());

/* [4] SETUP AND UNLOCK: pattern or fingerprint, with a 4-digit recovery PIN as the backup key.
   The pattern key = PBKDF2(pattern + a secret that lives in this phone's Keystore). The fingerprint key lives in the Keystore and needs a finger for each use.
   The recovery PIN is 4 digits (V0.10.0). */
const vbio=async()=>{if(!LOCK||!LOCK.bioWrap)return false;try{return !!(await LOCK.available()).ok}catch{return false}};
const vdev=async()=>{try{if(LOCK&&LOCK.deviceSecret)return (await LOCK.deviceSecret()).b64}catch{}return''};
const vpk=async path=>'P:'+path.join('-')+':'+await vdev();
const vpinKey=async pin=>'R:'+pin+':'+await vdev();
const PINRX=/^\d{4}$/;
const vsaveHdr=hd=>vreq('meta','readwrite',s=>s.put(hd,'hdr'));
async function vseal(m,path,withBio,pin){
 const hdr={v:3,at:Date.now(),p:await vwrap(m,await vpk(path),250000),r:await vwrap(m,await vpinKey(pin),250000),pin:true,fails:0,until:0,dev:!!await vdev()};
 if(withBio){try{const raw=b64e(new Uint8Array(await crypto.subtle.exportKey('raw',m)));hdr.bio=(await LOCK.bioWrap({data:raw,title:'Turn on fingerprint for the Vault',subtitle:'Touch the sensor to confirm',cancel:'Skip'})).b64}catch{hdr.bio=null}}
 await vreq('meta','readwrite',s=>s.put(hdr,'hdr'));return hdr}
/* ask for exactly 4 digits in the shared dialog (numeric keypad, dots instead of digits). Resolves the PIN or null. */
async function pinAsk(title,msg,ok){
 const I=$('#di');I.type='password';I.inputMode='numeric';I.maxLength=4;
 try{for(;;){const r=await dlg({title,msg,value:'',ok:ok||'OK'});if(!r)return null;if(PINRX.test(r.v))return r.v;toast('Enter exactly 4 digits.')}}
 finally{I.type='text';I.inputMode='';I.removeAttribute('maxlength')}}
/* choose a PIN: type it twice */
async function pinSet(intro){
 for(;;){const a=await pinAsk('Recovery PIN',intro,'Next');if(!a)return null;
  const b=await pinAsk('Confirm recovery PIN','Enter the same 4 digits again.','Save');if(!b)return null;
  if(a===b)return a;toast('Those PINs did not match. Try again.')}}
async function vEnroll(m,intro,pinGiven){
 const pat=await patPrompt('Vault pattern',intro||'Draw a pattern, at least 4 dots. It opens your vault.',{twice:true});if(!pat)return false;
 let bio=false;if(await vbio()){const r=await dlg({title:'Fingerprint too?',msg:'Open the vault with your fingerprint as well as the pattern.',ok:'Yes, use fingerprint'});bio=!!r}
 const pin=pinGiven||await pinSet('Choose a 4-digit recovery PIN. If the pattern and fingerprint ever stop working, this PIN gets you back in. Keep it somewhere safe.');if(!pin)return false;
 busy('Securing vault…');
 try{await vseal(m,pat.path,bio,pin);VK=m;VSET=true}catch(e){unbusy();toast('Could not secure the vault: '+(e.message||e));return false}
 unbusy();toast('Vault secured. Remember your recovery PIN.');return true}
async function vSetup(){
 const m=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 if(!await vEnroll(m,'Create your Vault. Draw a pattern, at least 4 dots.'))return false;return true}
const vimport=b=>crypto.subtle.importKey('raw',b64d(b),{name:'AES-GCM'},true,['encrypt','decrypt']);

async function vUnlock(){
 if(VK)return true;
 const hd=await vhdr();VSET=!!hd;if(!hd)return vSetup();
 if(hd.v===1)return vUpgrade(hd);
 const useBio=!!hd.bio&&await vbio();let note='';
 for(;;){
  const r=await patPrompt('Conduit Vault',note||(useBio?'Draw your pattern or use your fingerprint':'Draw your pattern'),
   {bio:useBio,rec:true,check:async p=>{try{VK=await vunwrap(hd.p,await vpk(p));return true}catch{return'Wrong pattern.'}}});
  if(!r)return false;
  if(VK){await vMigrate(hd);side();return true}
  if(r.bio){try{VK=await vimport((await LOCK.bioUnwrap({data:hd.bio,title:'Open Conduit Vault',subtitle:'Touch the fingerprint sensor',cancel:'Use pattern'})).b64);await vMigrate(hd);side();return true}
   catch(e){note=e&&e.code==='INVALID'?e.message:'';}continue}
  if(r.rec){
   if(hd.pin){ /* V0.10.0: 4-digit recovery PIN, with a growing wait after wrong tries */
    const w=Math.ceil(((hd.until||0)-Date.now())/1000);if(w>0){toast('Too many wrong PINs. Wait '+w+' s.');continue}
    const pin=await pinAsk('Recovery PIN','Enter your 4-digit recovery PIN. You will then choose a new pattern.','Unlock');if(!pin)continue;
    busy('Unlocking…');let m=null;
    try{m=await vunwrap(hd.r,await vpinKey(pin));unbusy()}
    catch{unbusy();hd.fails=(hd.fails||0)+1;if(hd.fails>=3)hd.until=Date.now()+30000*Math.pow(2,Math.min(8,hd.fails-3));
     try{await vsaveHdr(hd)}catch{}
     toast(hd.until>Date.now()?'Wrong PIN. Wait '+Math.ceil((hd.until-Date.now())/1000)+' s.':'Wrong PIN. '+(3-hd.fails)+' tries before a wait.');continue}
    if(await vEnroll(m,'Choose a new pattern, at least 4 dots.',pin)){side();return true}}
   else{ /* a vault made before V0.10.0: the old letters code works once, then you set a PIN */
    const c=await dlg({title:'Old recovery code',msg:'Type the letters-only recovery code from the old version. You will then choose a new pattern and a 4-digit recovery PIN.',value:'',ok:'Unlock'});
    if(!c||!c.v){continue}
    busy('Unlocking…');try{const m=await vunwrap(hd.r,vnorm(c.v));unbusy();if(await vEnroll(m,'Choose a new pattern, at least 4 dots.')){side();return true}}catch{unbusy();toast('That recovery code is wrong.')}}}}}
/* a vault made before V0.10.0 has a letters recovery code: after a normal unlock, swap it for a 4-digit PIN */
async function vMigrate(hd){
 if(hd.pin||!VK)return;
 const pin=await pinSet('The vault now uses a 4-digit recovery PIN instead of the letters code. Choose your PIN.');if(!pin)return;
 try{hd.r=await vwrap(VK,await vpinKey(pin),250000);hd.pin=true;hd.v=3;hd.fails=0;hd.until=0;await vsaveHdr(hd);toast('Recovery PIN saved.')}
 catch(e){toast('Could not save the PIN: '+(e.message||e))}}
/* a vault made by 0.9.1 used a passphrase: ask for it once, then move it to pattern + fingerprint */
async function vUpgrade(hd){
 const I=$('#di');I.type='password';let m=null;
 try{for(;;){const r=await dlg({title:'Upgrade your Vault',msg:'Conduint no longer uses passphrases. Enter your old passphrase one last time (or Cancel), then set a pattern.',value:'',ok:'Continue'});
  if(!r)return false;busy('Checking…');try{m=await vunwrap(hd.p,r.v);unbusy();break}catch{unbusy();toast('Wrong passphrase.')}}}
 finally{I.type='text'}
 return vEnroll(m,'Choose a pattern for your Vault, at least 4 dots.')}
function vLock(quiet){VK=null;VLIST=[];VN=null;if(VOPEN)vClose();side();if(!quiet)toast('Vault locked.')}
document.addEventListener('visibilitychange',()=>{if(document.hidden)VHID=Date.now();else if(VK&&VHID&&Date.now()-VHID>120000)vLock()});

/* [5] THE VAULT SCREEN */
const vstate=()=>VSET===false?'Tap to set up':VK?(VN==null?'Unlocked':plural(VN,'file')+' · unlocked'):'Locked · AES-256';
function vcard(){}/* V0.19.0: the Vault no longer advertises itself; it is a normal item you place yourself (arrange.js) */
async function vcardOpen(){try{if(!await vUnlock())return;await vShow()}catch(e){unbusy();toast('Vault error: '+(e.message||e))}}
async function vShow(){VOPEN=true;document.body.classList.remove('nav');$('#vt').classList.add('on');await vRender()}
function vClose(){VOPEN=false;$('#vt').classList.remove('on')}
async function vRender(){
 const L=$('#vl');
 try{VLIST=await vlist()}catch(e){L.replaceChildren(h('div','empty','Could not read the vault: '+(e.message||e)));return}
 VN=VLIST.length;$('#vsub').textContent=plural(VN,'file')+' · AES-256 · unlocked';L.replaceChildren();side();
 if(!VN){L.append(h('div','empty','The vault is empty.\nTap + to add files, or choose Move to Vault on a file in the browser.'));return}
 VLIST.forEach(f=>{
  const k=kindOf(f.name,f.mime),mb=h('button','ib',null,ico('more'));mb.setAttribute('aria-label','Options for '+f.name);
  const n=h('div','vi',null,ico(KICON[k]),h('div','tx',null,h('b',null,f.name),h('small',null,fmt(f.size)+' · '+dt(f.at))),mb);
  const list=[['Open',()=>vOpen(f)],['Rename',()=>vRename(f)],['Move out of vault…',()=>vOut(f)],['Delete forever',()=>vRemove(f)]];
  n.onclick=()=>vOpen(f);mb.onclick=e=>{e.stopPropagation();const r=mb.getBoundingClientRect();menu(r.right-210,r.bottom,list)};
  n._ctx=(x,y)=>menu(x,y,list);L.append(n)})}
async function vOpen(f){
 if(!rdType(f.name,f.mime))return toast('No viewer for this type. Use Move out of vault to open it in another app.');
 busy('Decrypting…');let bl;
 try{bl=await vget(f)}catch(e){unbusy();return toast('Could not decrypt this file.')}
 unbusy();readerOpen({name:f.name,mime:f.mime,size:f.size,blob:bl,vault:true})}
async function vRename(f){
 const r=await dlg({title:'Rename',value:f.name,ok:'Rename',sel:true});if(!r||!r.v||r.v===f.name)return;
 const e=badName(r.v);if(e)return toast(e);
 try{const rec=await vreq('files','readonly',s=>s.get(f.id));rec.nm=b64e(await venc(new TextEncoder().encode(r.v)));
  await vreq('files','readwrite',s=>s.put(rec,f.id));vRender()}catch(x){toast('Rename failed.')}}
async function vRemove(f){
 const r=await dlg({title:'Delete forever?',msg:'"'+f.name+'" is erased from the vault and cannot be restored.',ok:'Delete',danger:true});if(!r)return;
 try{await vdel(f);toast('Deleted.');vRender()}catch(e){toast('Delete failed.')}}
const vuniq=(n,have)=>{if(!have.has(n))return n;const d=n.lastIndexOf('.'),b=d>0?n.slice(0,d):n,x=d>0?n.slice(d):'';
 for(let i=2;;i++){const c=b+' ('+i+')'+x;if(!have.has(c))return c}};
async function vOut(f){
 const dest=S.mounts.filter(m=>m.type==='saf'),native=!!(NATIVE&&SAF&&SAF.writeFile);let m=null;
 if(native){
  if(!dest.length)return toast('Add a storage first (the + next to Storage).');
  const r=await dlg({title:'Move out of the vault',msg:'"'+f.name+'" is decrypted into the top folder of the storage you choose, then erased from the vault.',opts:dest.map(x=>[x.id,x.name]),val:dest[0].id,ok:'Move out'});
  if(!r)return;m=dest.find(x=>x.id===r.o)||dest[0]}
 busy('Decrypting…');
 try{
  const bl=await vget(f);
  if(m){const have=new Set((await SAF.list({uri:m.root})).items.map(x=>x.name)),name=vuniq(f.name,have);
   await SAF.writeFile({dir:m.root,name,b64:await blobB64(bl),mime:f.mime||'application/octet-stream'});toast('Saved as '+name+' in '+m.name+'.')}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
  await vdel(f);unbusy();vRender();if(m&&typeof refresh==='function')refresh()}
 catch(e){unbusy();toast('Move out failed: '+(e.message||e))}}

/* add from the system picker (copies; the originals stay where they are) */
async function vAddFiles(files){
 if(!files.length)return;let ok=0;const bad=[];busy('Encrypting…');
 try{for(const f of files){$('#bp').textContent=f.name;
  try{if(f.size>VMAX)throw Error('over '+fmt(VMAX));await vput(f.name,await f.arrayBuffer(),f.type);ok++}catch(e){bad.push(f.name+' ('+(e.message||'error')+')')}}}
 finally{unbusy()}
 toast(ok?plural(ok,'file')+' added. The originals were not touched.'+(bad.length?' Skipped: '+bad.join(', '):''):'Nothing added. '+bad.join(', '));vRender()}

/* move from the file browser: encrypt, then delete the original so it only lives in the vault */
const vRead=async i=>{const p=(await SAF.cacheCopy({uri:i.uri,name:i.name})).path,ab=await (await fetch(fileUrl(p))).arrayBuffer();return ab};
async function vMove(its){
 its=(its||[]).filter(i=>!i.dir&&i.uri);if(!its.length)return toast('Choose files, not folders.');
 if(!SAF)return toast('Moving needs the Android app.');
 try{if(!await vUnlock())return}catch(e){return toast('Vault error: '+(e.message||e))}
 const r=await dlg({title:'Move to Vault?',msg:(its.length===1?'"'+its[0].name+'"':plural(its.length,'file'))+' will be encrypted and the original deleted from storage. Files over '+fmt(VMAX)+' are skipped.',ok:'Move'});if(!r)return;
 const done=[],bad=[];busy('Encrypting…');
 try{for(const i of its){$('#bp').textContent=i.name;
  try{if(i.size>VMAX)throw Error('over '+fmt(VMAX));await vput(i.name,await vRead(i),i.mime);done.push(i)}catch(e){bad.push(i.name+' ('+(e.message||'error')+')')}}
  SAF.clearCache().catch(()=>{});
  if(done.length){try{await SAF.remove({uris:done.map(i=>i.uri)})}catch(e){bad.push('original not deleted: '+(e.message||'error'))}}}
 finally{unbusy()}
 toast(done.length?plural(done.length,'file')+' moved to the vault.'+(bad.length?' Problems: '+bad.join(', '):''):'Nothing moved. '+bad.join(', '));
 if(VK)VN=null;side();if(typeof refresh==='function')refresh()}

/* [6] VAULT SETTINGS */
async function vPatChange(){
 const hd=await vhdr(),pat=await patPrompt('New vault pattern','Draw a new pattern, at least 4 dots.',{twice:true});if(!pat)return;
 busy('Saving…');try{hd.p=await vwrap(VK,await vpk(pat.path),250000);hd.dev=!!await vdev();await vreq('meta','readwrite',s=>s.put(hd,'hdr'));unbusy();toast('Vault pattern changed.')}
 catch(e){unbusy();toast('Could not change it: '+(e.message||e))}}
async function vBioToggle(){
 const hd=await vhdr();
 if(hd.bio){try{await LOCK.bioForget()}catch{}hd.bio=null;await vreq('meta','readwrite',s=>s.put(hd,'hdr'));return toast('Fingerprint unlock is off.')}
 if(!await vbio())return toast('Fingerprint is not available on this phone.');
 try{const raw=b64e(new Uint8Array(await crypto.subtle.exportKey('raw',VK)));hd.bio=(await LOCK.bioWrap({data:raw,title:'Turn on fingerprint for the Vault',subtitle:'Touch the sensor to confirm',cancel:'Cancel'})).b64;
  await vreq('meta','readwrite',s=>s.put(hd,'hdr'));toast('Fingerprint unlock is on.')}catch{toast('Fingerprint was not confirmed.')}}
async function vPinChange(){
 const pin=await pinSet('Choose a new 4-digit recovery PIN. The old one stops working.');if(!pin)return;
 busy('Saving…');
 try{const hd=await vhdr();hd.r=await vwrap(VK,await vpinKey(pin),250000);hd.pin=true;hd.v=3;hd.fails=0;hd.until=0;await vsaveHdr(hd);unbusy();toast('Recovery PIN changed.')}
 catch(e){unbusy();toast('Could not change the PIN: '+(e.message||e))}}
function vMenu(e){
 const r=e.currentTarget.getBoundingClientRect();
 menu(Math.max(8,r.right-250),r.bottom,[['Change pattern…',vPatChange],['Fingerprint unlock on/off…',vBioToggle],['Change recovery PIN…',vPinChange],['Lock now',()=>vLock()]])}
$('#vback').onclick=vClose;$('#vlock').onclick=()=>vLock();$('#vset').onclick=vMenu;
$('#vadd').onclick=()=>$('#vpick').click();
$('#vpick').onchange=e=>{const f=[...e.target.files];e.target.value='';vAddFiles(f)};
vhdr().then(x=>{VSET=!!x;side()}).catch(()=>{});
