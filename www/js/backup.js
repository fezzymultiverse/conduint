/* backup.js (V0.49.0): Settings > Backup & restore. ONE encrypted file (.cndbackup) holding the parts you tick:
   app settings and layout, Browser, Shield, VPN settings and app firewall, Authenticator, Password Manager, Notepad.
   File = JSON header (readable: which parts are inside, version, date) + AES-256-GCM payload, key from your passphrase (PBKDF2-SHA256, 310k rounds).
   The passphrase is never stored. Nothing is written in the clear. Before a restore the current data of the parts being replaced is sealed with the
   same passphrase and kept in IndexedDB ('conduint-bk'), so Settings > Undo the last restore can put it back.
   NOT carried (tied to this phone): WireGuard private keys (they never leave the native side), passkeys, the Android Keystore / fingerprint keys, the app
   lock pattern, folder and storage permissions, Vault files, and the Authenticator / Password Manager fingerprint unlock (set it up again on the new phone). */
const BKAPP='conduint-backup',BKITER=310000,BKMAX=67108864,BKCHUNKMAX=20971520;
const bk64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
const bk64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
/* JSON that also carries binary values (IndexedDB records hold Uint8Array / ArrayBuffer) */
const bkJ=v=>JSON.stringify(v,(k,x)=>x instanceof ArrayBuffer?{$ab:bk64(new Uint8Array(x))}:ArrayBuffer.isView(x)?{$u8:bk64(new Uint8Array(x.buffer,x.byteOffset,x.byteLength))}:x);
const bkP=s=>JSON.parse(s,(k,x)=>x&&typeof x==='object'&&typeof x.$u8==='string'?bk64d(x.$u8):x&&typeof x==='object'&&typeof x.$ab==='string'?bk64d(x.$ab).buffer:x);
const bkLsGet=ks=>{const o={};ks.forEach(k=>{try{const v=localStorage.getItem(k);if(v!=null)o[k]=v}catch{}});return o};
const bkLsPut=(o,ks)=>{Object.keys(o||{}).forEach(k=>{if(ks.includes(k)&&typeof o[k]==='string'){try{localStorage.setItem(k,o[k])}catch{}}})};
const bkLsDel=ks=>ks.forEach(k=>{try{localStorage.removeItem(k)}catch{}});
const BK_KEEP=/^(lock|pat|pin)/i;/* settings keys that belong to this phone's app lock */
const BK_LS={browser:['conduint.browser.v1'],shield:['cnd.shield.on','cnd.shield.rules','cnd.shield.fold'],vpn:['cnd.vpn.dnsFold','cnd.vpn.dnsLast'],
 auth:['cnd.auth.view','cnd.auth.sort','cnd.auth.hide','cnd.auth.prof'],pm:['cnd.pm.prefs','cnd.pm.gen','cnd.pm.share'],notes:['conduint.notes.v1']};
const BK_VPNOPT=['rotate','minutes','random','keepAlive','freeMem'];
const BKS=[
 {id:'settings',name:'App settings and layout',sub:'Theme, views, Home and left panel, names, colours, pins',merge:true},
 {id:'browser',name:'Browser',sub:'Bookmarks, tabs, history, blocking'},
 {id:'shield',name:'Shield',sub:'Rules and switches (quarantine and logs stay on this phone)'},
 {id:'vpn',name:'VPN settings and app firewall',sub:'Rotation, keep running, blocked apps. WireGuard keys stay on the phone: re-import your .conf files.'},
 {id:'auth',name:'Authenticator',sub:'Accounts, groups, view and sort',merge:true,secret:true},
 {id:'pm',name:'Password Manager',sub:'Your encrypted vault. It still needs its master password.',secret:true},
 {id:'notes',name:'Notepad',sub:'Notes and checklists',merge:true}];

/* ---------- crypto ---------- */
async function bkKey(pass,salt,iter){
 const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function bkSeal(payload,pass,secs){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),k=await bkKey(pass,salt,BKITER);
 const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(bkJ(payload))));
 return JSON.stringify({app:BKAPP,v:1,kdf:'PBKDF2-SHA256',iter:BKITER,salt:bk64(salt),iv:bk64(iv),ct:bk64(ct),secs,ver:typeof VER==='string'?VER:'',at:new Date().toISOString()})}
function bkHead(text){
 let o;try{o=JSON.parse(text)}catch{throw Error('That file is damaged or is not a Conduint backup.')}
 if(!o||o.app!==BKAPP)throw Error('That is not a Conduint backup file.');
 if(o.v!==1||o.kdf!=='PBKDF2-SHA256'||!(o.iter>=100000&&o.iter<=2000000)||typeof o.ct!=='string')throw Error('That backup version is not supported.');
 return o}
async function bkOpen(text,pass){
 const o=bkHead(text);let p;
 try{p=await crypto.subtle.decrypt({name:'AES-GCM',iv:bk64d(o.iv)},await bkKey(pass,bk64d(o.salt),o.iter),bk64d(o.ct))}catch{throw Error('Wrong passphrase, or the file is damaged.')}
 let d;try{d=bkP(new TextDecoder().decode(p))}catch{throw Error('The backup is damaged.')}
 if(!d||typeof d!=='object'||!d.sections||typeof d.sections!=='object')throw Error('The backup is damaged.');
 return d}

/* ---------- IndexedDB (Password Manager) ---------- */
function bkDump(dbp,stores){return dbp.then(db=>new Promise((res,rej)=>{
 const have=[...db.objectStoreNames].filter(s=>stores.includes(s)),out={};if(!have.length)return res(out);
 const tx=db.transaction(have,'readonly');
 have.forEach(s=>{out[s]=[];const c=tx.objectStore(s).openCursor();c.onsuccess=()=>{const cu=c.result;if(cu){out[s].push([cu.key,cu.value]);cu.continue()}}});
 tx.oncomplete=()=>res(out);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}))}
function bkLoad(dbp,dump){return dbp.then(db=>new Promise((res,rej)=>{
 const have=Object.keys(dump).filter(s=>db.objectStoreNames.contains(s));if(!have.length)return res();
 const tx=db.transaction(have,'readwrite');
 have.forEach(s=>{const st=tx.objectStore(s);st.clear();(dump[s]||[]).forEach(([k,v])=>st.put(v,k))});
 tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}))}
const bkSize=v=>v instanceof ArrayBuffer?v.byteLength:ArrayBuffer.isView(v)?v.byteLength:(v&&typeof v==='object'?Object.values(v).reduce((a,x)=>a+bkSize(x),0):(typeof v==='string'?v.length:8));

/* ---------- pack: read each part from the live app ---------- */
const bkPack={
 async settings(){
  const s={...S.settings};Object.keys(s).forEach(k=>{if(BK_KEEP.test(k))delete s[k]});
  const d={...(S.dash||{})};delete d.fm;delete d.wx;if(d.music)d.music={...d.music,folders:[]};
  return{settings:s,labels:S.labels||{},colors:S.colors||{},pins:S.pins||[],lay:S.lay||null,dash:d}},
 async browser(){const ls=bkLsGet(BK_LS.browser);if(!ls['conduint.browser.v1'])return{skip:'Nothing saved in the Browser yet.'};return{ls}},
 async shield(){return{ls:bkLsGet(BK_LS.shield)}},
 async vpn(){
  if(typeof VPN==='undefined'||!VPN||typeof VP==='undefined')return{skip:'VPN runs in the Android app.'};
  try{await vpLoad()}catch{}
  const s=(VP.d&&VP.d.settings)||{},opt={};BK_VPNOPT.forEach(k=>{if(s[k]!==undefined)opt[k]=s[k]});
  let rules={},fwOn=false;try{await fwLoad();rules=(FW.d&&FW.d.rules)||{};fwOn=!!(FW.d&&FW.d.enabled)}catch{}
  return{opt,rules,fwOn,names:((VP.d&&VP.d.profiles)||[]).map(p=>p.name).filter(Boolean),ls:bkLsGet(BK_LS.vpn)}},
 async auth(){
  try{if(typeof AU==='undefined')throw Error('Authenticator is not available.');if(!AU.ready||AU.locked){await auLoad();AU.ready=true}auGuard()}
  catch(e){return{skip:(e&&e.message)||'Authenticator is locked. Unlock it first.'}}
  if(!AU.list.length&&!AU.eg.length)return{skip:'Nothing in the Authenticator yet.'};
  return{list:AU.list,eg:AU.eg,ls:bkLsGet(BK_LS.auth)}},
 async pm(){
  if(typeof pmdb!=='function')return{skip:'Password Manager is not available.'};
  let dump;try{dump=await bkDump(pmdb(),['meta','recs','chunks'])}catch(e){return{skip:'Could not read the Password Manager: '+((e&&e.message)||e)}}
  if(!(dump.meta||[]).some(([k])=>k==='hdr'))return{skip:'No Password Manager vault has been created yet.'};
  let big=false;if(bkSize(dump.chunks||[])>BKCHUNKMAX){dump.chunks=[];big=true}
  return{dump:bkJ(dump),attachmentsSkipped:big,ls:bkLsGet(BK_LS.pm)}},
 async notes(){const ls=bkLsGet(BK_LS.notes);if(!ls['conduint.notes.v1'])return{skip:'No notes yet.'};return{ls}}};

/* ---------- apply: put a part back. mode 'merge' or 'replace'. Returns a short sentence. ---------- */
const bkApply={
 async settings(d,mode){
  const keep={};Object.keys(S.settings).forEach(k=>{if(BK_KEEP.test(k))keep[k]=S.settings[k]});
  const inS={...(d.settings||{})};Object.keys(inS).forEach(k=>{if(BK_KEEP.test(k))delete inS[k]});
  if(mode==='merge'){
   Object.assign(S.settings,inS);S.labels=Object.assign(S.labels||{},d.labels||{});S.colors=Object.assign(S.colors||{},d.colors||{});
   const pk=p=>p.m+':'+(p.path||[]).join('/'),have=new Set((S.pins||[]).map(pk));S.pins=(S.pins||[]).concat((d.pins||[]).filter(p=>p&&!have.has(pk(p))));
   const id=d.dash||{};S.dash=S.dash||{};['notes','col','wp','place'].forEach(k=>{if(id[k]!==undefined)S.dash[k]=id[k]});
   save();return'merged into your current settings'}
  S.settings={...inS,...keep};S.labels=d.labels||{};S.colors=d.colors||{};S.pins=d.pins||[];if(d.lay)S.lay=d.lay;
  const cd=S.dash||{},id=d.dash||{};S.dash={...id,fm:cd.fm,wx:cd.wx,music:{...(id.music||{}),folders:(cd.music&&cd.music.folders)||[]}};
  if(!S.dash.fm)delete S.dash.fm;if(!S.dash.wx)delete S.dash.wx;
  save();return'replaced'},
 async browser(d){bkLsPut(d.ls,BK_LS.browser);return'replaced'},
 async shield(d){bkLsDel(BK_LS.shield);bkLsPut(d.ls,BK_LS.shield);return'replaced'},
 async vpn(d){
  bkLsPut(d.ls,BK_LS.vpn);
  if(typeof VPN==='undefined'||!VPN)return'saved (VPN options apply in the Android app)';
  let n=0,fw='';
  try{const o={};BK_VPNOPT.forEach(k=>{if(d.opt&&d.opt[k]!==undefined)o[k]=d.opt[k]});if(Object.keys(o).length){await VPN.setOptions(o);n=Object.keys(o).length}}catch{}
  try{const r=d.rules||{},c=Object.keys(r).length;if(c&&typeof VPN.fwSetRules==='function'){await VPN.fwSetRules({rules:r});fw=', '+c+' blocked-app rules'}}catch{fw=', blocked-app rules could not be set'}
  return'replaced ('+n+' options'+fw+(d.fwOn?'; turn the app firewall on again in VPN':'')+')'},
 async auth(d,mode){
  if(typeof AU==='undefined')throw Error('Authenticator is not available.');
  if(!AU.ready||AU.locked){await auLoad();AU.ready=true}auGuard();
  const list=Array.isArray(d.list)?d.list:[],eg=Array.isArray(d.eg)?d.eg.filter(s=>typeof s==='string'):[];
  const before=AU.list.slice(),eg0=AU.eg.slice();
  try{
   if(mode==='merge'){
    const r=await auDedupe({items:list,skipped:0});AU.list.push(...r.items);
    eg.forEach(g=>{const c=auCanonAll(g);if(c&&!auxGroups(AU.list,AU.eg).some(x=>x[0]===c))AU.eg.push(c)});
    await auSave();auEgSave();bkLsPut(d.ls,BK_LS.auth);return'merged: '+r.items.length+' new entries'+(r.dup?' ('+r.dup+' already here)':'')}
   AU.list=list.slice();AU.eg=eg.slice();await auSave();auEgSave();bkLsPut(d.ls,BK_LS.auth);return'replaced: '+list.length+' entries'}
  catch(e){AU.list=before;AU.eg=eg0;throw e}},
 async pm(d){
  if(typeof pmdb!=='function')throw Error('Password Manager is not available.');
  const dump=bkP(d.dump);if(!(dump.meta||[]).some(([k])=>k==='hdr'))throw Error('The Password Manager part of this backup is empty.');
  await bkLoad(pmdb(),dump);
  try{PM.VK=null;PM.items=[];PM.folders=[];PM.hist=[];PM.hdr=null}catch{}
  try{if(typeof LOCK!=='undefined'&&LOCK&&LOCK.bioForget)await LOCK.bioForget({which:'pm'})}catch{}
  bkLsPut(d.ls,BK_LS.pm);
  return'replaced'+(d.attachmentsSkipped?' (attachments were too large to include and are not restored)':'')+'. Open it with your master password'},
 async notes(d,mode){
  const K=BK_LS.notes[0],inc=(()=>{try{return JSON.parse((d.ls||{})[K]||'null')}catch{return null}})();
  if(!inc||!Array.isArray(inc.notes))throw Error('The notes part of this backup is damaged.');
  if(mode!=='merge'){localStorage.setItem(K,JSON.stringify(inc));return'replaced: '+inc.notes.length+' notes'}
  let cur={v:1,notes:[]};try{const c=JSON.parse(localStorage.getItem(K)||'null');if(c&&Array.isArray(c.notes))cur=c}catch{}
  const have=new Set(cur.notes.map(n=>n&&n.id)),add=inc.notes.filter(n=>n&&typeof n.id==='string'&&!have.has(n.id));
  cur.notes=cur.notes.concat(add);localStorage.setItem(K,JSON.stringify(cur));return'merged: '+add.length+' new notes'}};

/* ---------- build / restore (no dialogs, so they can be tested) ---------- */
async function bkBuild(ids,pass){
 const sections={},secs=[],skipped=[];
 for(const id of ids){
  let r;try{r=await bkPack[id]()}catch(e){r={skip:(e&&e.message)||'Could not read this part.'}}
  if(r&&r.skip){skipped.push([id,r.skip]);continue}
  sections[id]=r;secs.push(id)}
 if(!secs.length)throw Error('Nothing to back up from the parts you ticked.');
 return{text:await bkSeal({v:1,sections},pass,secs),secs,skipped}}
async function bkRestoreData(payload,ids,modes){
 const out=[];
 for(const id of ids){
  const d=payload.sections[id];if(!d||!bkApply[id])continue;
  try{out.push([id,true,await bkApply[id](d,(modes&&modes[id])||'replace')])}
  catch(e){out.push([id,false,(e&&e.message)||'failed'])}}
 return out}

/* snapshot kept in IndexedDB so a restore can be undone (sealed with the same passphrase) */
const bkSnapDb=()=>new Promise((res,rej)=>{const r=indexedDB.open('conduint-bk',1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function bkSnapPut(text){const db=await bkSnapDb();await new Promise((res,rej)=>{const tx=db.transaction('s','readwrite');tx.objectStore('s').put({text,at:Date.now()},'last');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();try{localStorage.setItem('cnd.bk.undo',String(Date.now()))}catch{}}
async function bkSnapGet(){const db=await bkSnapDb();const v=await new Promise((res,rej)=>{const q=db.transaction('s','readonly').objectStore('s').get('last');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});db.close();return v&&v.text}

/* ---------- UI ---------- */
const bkStamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())};
function bkSheet(title,note,rows,goLabel){
 return new Promise(res=>{
  let A=$('#bkp');if(!A){A=h('div');A.id='bkp';document.body.append(A)}
  const st=rows.map(r=>({on:!r.off,mode:r.merge?'merge':'replace'}));
  const close=v=>{A.classList.remove('on');res(v)};
  const draw=()=>{
   const hd=h('div','sh',null,h('span',null,title),(()=>{const b=h('button','ib',null,ico('x'));b.setAttribute('aria-label','Close');b.onclick=()=>close(null);return b})());
   const body=h('div',null,null,h('div','note',note));
   rows.forEach((r,i)=>{
    const ctl=h('div','ctl');
    if(r.off){ctl.append(h('small',null,r.why||'Not available'))}
    else{
     const c=h('button','chip'+(st[i].on?' on':''),st[i].on?'Included':'Skip');c.onclick=()=>{st[i].on=!st[i].on;draw()};ctl.append(c);
     if(r.merge&&st[i].on){[['merge','Merge'],['replace','Replace']].forEach(([m,t])=>{const b=h('button','chip'+(st[i].mode===m?' on':''),t);b.onclick=()=>{st[i].mode=m;draw()};ctl.append(b)})}}
    body.append(h('div','row',null,h('span',null,r.name),ctl),h('div','note',r.sub||''))});
   const go=h('button','chip on',goLabel);go.style.margin='14px 0 6px';go.onclick=()=>{const ids=rows.filter((r,i)=>!r.off&&st[i].on).map(r=>r.id);if(!ids.length){toast('Tick at least one part.');return}
    const modes={};rows.forEach((r,i)=>{modes[r.id]=st[i].mode});close({ids,modes})};
   body.append(go);
   A.replaceChildren(h('div','sheet',null,hd,body));A.classList.add('on')};
  A.onclick=e=>{if(e.target===A)close(null)};
  draw()})}
async function bkAskPass(title,msg,ok){return typeof auAskPass==='function'?auAskPass(title,msg,ok):null}

async function bkExport(){
 try{
  const rows=BKS.map(s=>({...s,off:false}));
  const pick=await bkSheet('Export a backup','One encrypted file. Tick what goes in. Secrets (Authenticator, Password Manager) stay encrypted, and the passphrase you choose next is the only key.',rows,'Next: choose passphrase');
  if(!pick)return;
  const a=await bkAskPass('Backup passphrase','Choose a passphrase of 8 characters or more. You need it to restore. It cannot be recovered if you forget it.','Next');if(a==null)return;
  if(a.length<8)throw Error('Use at least 8 characters.');
  const b=await bkAskPass('Confirm passphrase','Type the same passphrase again.','Create backup');if(b==null)return;
  if(a!==b)throw Error('Those did not match. No backup was made.');
  busy('Encrypting backup…');let r;try{r=await bkBuild(pick.ids,a)}finally{unbusy()}
  if(await auSaveOut('conduint-backup-'+bkStamp()+'.cndbackup',r.text,'Backup','application/octet-stream')){
   const nm=id=>(BKS.find(s=>s.id===id)||{}).name||id;
   if(r.skipped.length)await dlg({title:'Backup saved',msg:'Included: '+r.secs.map(nm).join(', ')+'.\n\nLeft out: '+r.skipped.map(([i,w])=>nm(i)+' ('+w+')').join('; ')+'.',ok:'OK',nocancel:true});
   else toast('Backup saved: '+r.secs.length+' parts.')}}
 catch(e){toast((e&&e.message)||'Could not make the backup.')}}

function bkRestore(){
 const inp=document.createElement('input');inp.type='file';inp.style.display='none';document.body.append(inp);
 inp.addEventListener('cancel',()=>inp.remove());
 inp.onchange=async()=>{const f=inp.files&&inp.files[0];inp.remove();if(!f)return;
  try{
   if(f.size>BKMAX)throw Error('That file is too big (64 MB max).');
   const text=await f.text(),head=bkHead(text);
   let pay=null;
   for(;;){const pw=await bkAskPass('Backup passphrase','Enter the passphrase for this backup.','Open');if(pw==null)return;
    busy('Opening backup…');
    try{pay=await bkOpen(text,pw);bkRestore.pw=pw;break}
    catch(e){if(/Wrong passphrase/.test(e.message)){toast(e.message);continue}throw e}
    finally{unbusy()}}
   const pw=bkRestore.pw;bkRestore.pw=null;
   const inside=BKS.filter(s=>pay.sections[s.id]);
   if(!inside.length)throw Error('This backup has nothing this version can restore.');
   const when=head.at?new Date(head.at).toLocaleString():'';
   const rows=inside.map(s=>({...s,off:false}));
   const pick=await bkSheet('Restore from backup','Made '+when+(head.ver?' by '+head.ver:'')+'. Merge adds to what you have; Replace overwrites it. Your current data is saved first, so Settings > Undo the last restore can bring it back.',rows,'Restore');
   if(!pick)return;
   const warn=pick.ids.filter(i=>pick.modes[i]==='replace').map(i=>BKS.find(s=>s.id===i).name);
   if(warn.length){const ok=await dlg({title:'Replace current data?',msg:'These will be overwritten with the backup: '+warn.join(', ')+'.\n\nYour current data is kept for Undo.',ok:'Restore',danger:true});if(!ok)return}
   busy('Saving your current data for Undo…');
   try{const snap=await bkBuild(pick.ids,pw);await bkSnapPut(snap.text)}catch(e){unbusy();const ok=await dlg({title:'Could not save an Undo copy',msg:(e&&e.message)||'',ok:'Restore anyway',danger:true});if(!ok)return;busy('Restoring…')}
   busy('Restoring…');let res;try{res=await bkRestoreData(pay,pick.ids,pick.modes)}finally{unbusy()}
   const nm=id=>BKS.find(s=>s.id===id).name;
   await dlg({title:res.every(r=>r[1])?'Restored':'Restored with problems',msg:res.map(([i,ok,m])=>(ok?'✓ ':'✗ ')+nm(i)+': '+m).join('\n')+'\n\nThe app restarts now to load everything.',ok:'Restart',nocancel:true});
   location.reload()}
  catch(e){toast((e&&e.message)||'Could not restore.')}};
 inp.click()}

async function bkUndo(){
 try{
  const text=await bkSnapGet();if(!text){try{localStorage.removeItem('cnd.bk.undo')}catch{}throw Error('There is nothing to undo.')}
  const pw=await bkAskPass('Passphrase for the Undo copy','It is the passphrase you used for the restore.','Undo');if(pw==null)return;
  busy('Opening…');let pay;try{pay=await bkOpen(text,pw)}finally{unbusy()}
  const ids=BKS.filter(s=>pay.sections[s.id]).map(s=>s.id),modes={};ids.forEach(i=>{modes[i]='replace'});
  const ok=await dlg({title:'Undo the last restore?',msg:'This puts back: '+ids.map(i=>BKS.find(s=>s.id===i).name).join(', ')+'.',ok:'Undo',danger:true});if(!ok)return;
  busy('Putting your data back…');let res;try{res=await bkRestoreData(pay,ids,modes)}finally{unbusy()}
  await dlg({title:'Undone',msg:res.map(([i,o,m])=>(o?'✓ ':'✗ ')+BKS.find(s=>s.id===i).name+': '+m).join('\n')+'\n\nThe app restarts now.',ok:'Restart',nocancel:true});
  location.reload()}
 catch(e){toast((e&&e.message)||'Could not undo.')}}

/* the Settings section (called from drawSettings) */
function bkSettingsRows(sec,row,chip){
 sec('Backup & restore');
 row('Export settings, VPN, Authenticator, Password Manager…',chip('Export',false,bkExport));
 row('Restore from a backup file',chip('Restore',false,bkRestore));
 let u=false;try{u=!!localStorage.getItem('cnd.bk.undo')}catch{}
 if(u)row('Undo the last restore',chip('Undo',false,bkUndo));
 $('#sbody').append(h('div','note','One encrypted file (.cndbackup), locked with a passphrase only you know. Tied to this phone and not carried: WireGuard keys, passkeys, the app lock pattern, fingerprint unlock, folder permissions and Vault files.'))}
