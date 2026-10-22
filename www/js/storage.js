/* storage.js: connected storages, providers and library scanning.
   Two providers:
   saf   (Android APK) real read/write through the native Saf plugin: any folder the user grants,
         including Termux, Acode and cloud apps that ship an Android DocumentsProvider.
   local (desktop Chrome preview) read-only through showDirectoryPicker.
   A provider implements list(mount, path, dirs) -> [{name, dir, size, mtime, uri?|fh?|file?}]. */
/* Android detection must not depend on one Capacitor helper: several signals, then plugin lookup with a fallback.
   (V0.4.1: the old check needed Capacitor.isNativePlatform + registerPlugin, which only exist when Capacitor's core runtime is loaded.) */
const CAP=window.Capacitor||{};
const BRIDGE=!!(window.androidBridge||CAP.isNative===true||(CAP.isNativePlatform&&CAP.isNativePlatform())||(CAP.getPlatform&&CAP.getPlatform()!=='web'));
const plug=n=>{try{if(CAP.registerPlugin)return CAP.registerPlugin(n)}catch{}return(CAP.Plugins&&CAP.Plugins[n])||null};
const SAF=BRIDGE?plug('Saf'):null;
const TOOLS=BRIDGE?plug('Tools'):null;
const VPN=BRIDGE?plug('Vpn'):null;
const WIFI=BRIDGE?plug('Wifi'):null;
/* V0.15.0 install an APK: from a picked file (copied to the app cache first) or a real path. Android asks you to confirm. */
async function installApk(i){if(!TOOLS||!TOOLS.installApk)return toast('Installing apps runs in the Android app.');
 if(!/\.apk$/i.test(i.name))return toast('Only .apk files can be installed here. Split bundles (.apks, .xapk) need their own installer.');
 try{const path=i.path||(await SAF.cacheCopy({uri:i.uri,name:i.name})).path;
  if(typeof shApkGate==='function'&&!(await shApkGate(i.name,path)))return;
  const r=await TOOLS.installApk({path});
  if(r&&r.needAllow)toast('Allow Conduint Files to install apps, then tap the file again.')}catch(e){toast(e.message||'Could not start the install.')}}
const LOCK=BRIDGE?plug('Lock'):null;
const PLAYER=BRIDGE?plug('Player'):null;
const ZL=BRIDGE?plug('Zipliner'):null;
const NATIVE=BRIDGE&&!!SAF&&!!TOOLS;
const NATIVE_MSG=BRIDGE&&!NATIVE?'Android found, but the file plugins did not load. Rebuild the APK from the latest zip.':'';
const HANDLES={};let PICKED=[];
/* V0.26.1: one universal name for every outside place (SD card, cloud, Termux, any folder) and one for putting things in. Change the words here only. */
const LBL_IMPORT='Add storage location',LBL_UPLOAD='Upload Files / Folders';
/* direct:'internal' / 'downloads' / 'documents' = open by file path (needs All files access), the way Material Files does.
   Android 11+ refuses the root of internal storage and the Download folder in its folder picker, but a file path has no such rule. */
const SLOTS=[{id:'internal',name:'Internal storage',ic:'phone',start:'primary:',direct:'internal',hint:'Pick a folder on your phone.'},{id:'mydocs',name:'My documents',ic:'folder',start:'primary:Documents',direct:'documents',hint:'Pick the folder you keep your documents in.'},{id:'downloads',name:'Downloads',ic:'down',start:'primary:Download',direct:'downloads',hint:'Pick your Downloads folder.'}];
/* the + menu: Internal storage and My documents leave the menu once they are added (change them with a long-press in the side panel) */
function addEntries(){
 const L=[],free=s=>!S.mounts.some(m=>m.id===s.id),add=s=>L.push([s.name,()=>connect(s.id,s.name,s.ic,s.hint,{start:s.start,direct:s.direct})]);
 if(NATIVE){
  L.push([LBL_IMPORT,connectImport]);
  SLOTS.filter(free).forEach(add)}
 else{
  if(window.showDirectoryPicker){L.push(['Folder',()=>connect('','','folder')]);SLOTS.filter(free).forEach(add)}
  L.push(['Pick files (this session)',()=>$('#pick').click()])}
 return L}
const picked=()=>PICKED.length?[{id:'picked',name:'Picked files',sub:'This session only',ic:'file',type:'files'}]:[];
const mounts=()=>S.mounts.concat(picked()),homeM=()=>(S.dash&&S.dash.fm)||[],mount=id=>mounts().concat(homeM()).find(m=>m.id===id);

/* desktop preview only: folder handles survive restarts by living in IndexedDB */
const idb=(mode,fn)=>new Promise((res,rej)=>{const r=indexedDB.open('conduint',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');r.onerror=()=>rej(r.error);
 r.onsuccess=()=>{const q=fn(r.result.transaction('h',mode).objectStore('h'));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}});
async function handle(m){
 const hd=HANDLES[m.id]||(HANDLES[m.id]=await idb('readonly',s=>s.get(m.id)));
 if(!hd)throw Error('Folder access was lost. Remove this storage and add it again.');
 let ok=await hd.queryPermission({mode:'read'})==='granted';
 if(!ok){try{ok=await hd.requestPermission({mode:'read'})==='granted'}catch{}}
 if(!ok)throw Error('Tap this storage in the side panel to allow access again.');
 return hd}

const TRASH='.conduint-trash';
const P={
 saf:{write:true,async list(m,path,dirs){const dir=dirs[dirs.length-1];const r=await SAF.list({uri:dir});
  return r.items.filter(i=>i.name!==TRASH).map(i=>({...i,parent:dir,m:m.id}))}},
 local:{async list(m,path){let d=await handle(m);for(const p of path)d=await d.getDirectoryHandle(p);const out=[];
  for await(const [name,e] of d.entries()){if(e.kind==='directory')out.push({name,dir:true,size:0,mtime:0});
   else{const f=await e.getFile();out.push({name,dir:false,size:f.size,mtime:f.lastModified,fh:e})}}return out}},
 docs:{async list(m){return Promise.all(m.docs.map(async d=>{try{const x=await SAF.stat({uri:d.uri});return{...x,m:m.id,doc:true}}
   catch{return{name:d.name,uri:d.uri,dir:false,size:0,mtime:0,mime:'',m:m.id,doc:true,lost:true}}}))}},
 files:{async list(){return PICKED.map(f=>({name:f.name,dir:false,size:f.size,mtime:f.lastModified,file:f}))}}
};
const prov=m=>P[m.type||'local'];

/* walk folder names from a storage root to get the folder URIs (pins and the bin store names, not URIs) */
async function resolveDirs(m,path){const dirs=[m.root];
 for(const n of path){const r=await SAF.list({uri:dirs[dirs.length-1]});const d=r.items.find(i=>i.dir&&i.name===n);
  if(!d)throw Error('That folder no longer exists.');dirs.push(d.uri)}
 return dirs}

/* library views. On Android the native scan finds files by itself on internal storage and SD cards (needs All files access);
   cloud folders and saved cloud files are added on top. */
let askedAll=false,LIBMEM=null;
const libReset=()=>{LIBMEM=null};
function libAll(){
 if(LIBMEM&&Date.now()-LIBMEM.t<45000)return LIBMEM.p;
 const exts=[...new Set(Object.values(EXT).flatMap(e=>e.split(' ')))];
 const p=TOOLS.library({exts,cap:20000}).then(r=>r.items||[]);
 LIBMEM={t:Date.now(),p};p.catch(()=>{if(LIBMEM&&LIBMEM.p===p)LIBMEM=null});return p}
async function scan(kind,cap=5000){
 const out=[],bad=[],exts=EXT[kind].split(' ');let auto=false;
 if(NATIVE){try{const all=await libAll();for(const i of all){if(out.length>=cap)break;if(kindOf(i.name)===kind)out.push({...i,path:[i.pname],fs:true})}auto=true}
  catch(e){if(e.code==='NOPERM'&&!askedAll){askedAll=true;toast('Allow All files access and Documents, Images, Songs and Videos find your files by themselves.');setTimeout(openPerm,900)}}}
 const walk=async(m,d,path)=>{for await(const [name,e] of d.entries()){if(out.length>=cap)return;
  if(e.kind==='directory'){if(!name.startsWith('.')&&name!=='node_modules')await walk(m,e,[...path,name])}
  else if(kindOf(name)===kind){const f=await e.getFile();out.push({name,dir:false,size:f.size,mtime:f.lastModified,fh:e,path})}}};
 for(const m of S.mounts){try{
  if(m.type==='docs'){(await P.docs.list(m)).forEach(i=>{if(!i.lost&&kindOf(i.name,i.mime)===kind)out.push({...i,path:[m.name]})})}
  else if(m.type==='saf'){if(auto&&m.ic!=='cloud')continue;const r=await SAF.scan({uri:m.root,exts,cap:cap-out.length});r.items.forEach(i=>out.push({...i,m:m.id,path:[i.pname]}))}
  else await walk(m,await handle(m),[])}catch(e){bad.push(m.name)}}
 PICKED.forEach(f=>{if(kindOf(f.name)===kind)out.push({name:f.name,dir:false,size:f.size,mtime:f.lastModified,file:f,path:[]})});
 if(bad.length)toast('Skipped '+bad.join(', ')+' (no permission). Open it once to allow access.');
 else if(out.length>=cap)toast('Showing the first '+cap+' files.');
 return out}

/* how many files each library entry holds. One native walk with every extension, sorted by kind here. Needs All files access. */
const LIBC={};
async function countLib(){
 if(!NATIVE)return;await readPerm();if(!PERM.allFiles)return;
 try{const all=await libAll();Object.keys(EXT).forEach(k=>LIBC[k]=0);
  all.forEach(i=>{const k=kindOf(i.name);if(k in LIBC)LIBC[k]++});LIBC.capped=all.length>=20000;side()}
 catch{}}

/* add storage: must run straight from a tap so the browser allows the picker */
async function connect(id,name,ic,hint,o={}){
 if(NATIVE){
  /* internal storage, Downloads and My documents connect straight to the real folder when All files access is on */
  if(o.direct&&!o.pick&&await connectDirect(id,name,ic,o.direct))return;
  return connectSaf(id,name,ic,hint,o)}
 if(!window.showDirectoryPicker)return toast("This browser can't pick folders. Use Pick files, or open it in Chrome 132+ on localhost.");
 try{const hd=await showDirectoryPicker({mode:'read'});id=id||'l'+Date.now();
  await idb('readwrite',s=>s.put(hd,id));HANDLES[id]=hd;
  S.mounts=S.mounts.filter(m=>m.id!==id).concat({id,name:name||hd.name,sub:hd.name,ic:ic||'folder'});save();go(id,[])}
 catch(e){if(e.name!=='AbortError')toast(e.message)}}
/* V0.51.0: adding storage happens ONCE. One guard covers every way in (the + menu, Home, Internal storage, SD card, cloud), so a second tap, or the app coming back from a settings page, can never start a second add. The extra "Choose folder" question is gone: the picker opens straight away. */
const ADD={on:false,t:0};
async function addOnce(fn){if(ADD.on&&Date.now()-ADD.t<180000)return;ADD.on=true;ADD.t=Date.now();try{return await fn()}finally{ADD.on=false}}
const connectSaf=(id,name,ic,hint,o)=>addOnce(()=>connectSaf1(id,name,ic,hint,o||{}));
const connectDirect=(id,name,ic,which,uriGiven)=>addOnce(()=>connectDirect1(id,name,ic,which,uriGiven));
async function connectSaf1(id,name,ic,hint,o={}){
 if(hint)toast(hint);
 try{const r=await SAF.pickTree({volume:o.volume||'',start:o.start||'',authority:o.authority||''});
  const dup=S.mounts.concat(homeM()).find(x=>x.type==='saf'&&x.uri===r.uri&&x.id!==id);
  if(dup){toast('That folder is already added as '+dup.name+'.');return go(dup.id)}
  const old=S.mounts.find(x=>x.id===id);if(old&&old.uri&&old.uri!==r.uri)SAF.release({uri:old.uri}).catch(()=>{});
  id=id||'s'+Date.now();
  const nm=name||(o.prefix||'')+r.name,at=S.mounts.findIndex(m=>m.id===id),m={id,type:'saf',name:nm,sub:r.name,ic:ic||'folder',uri:r.uri,root:r.root};
  at<0?S.mounts.push(m):S.mounts[at]=m;save();go(id);toast('Saved: '+nm);if(m.ic==='cloud'&&typeof cloudAfter==='function')cloudAfter(m)}
 catch(e){if(e.code!=='CANCELLED')toast(e.message)}}
/* direct file-path storage. Returns true when it handled the tap (connected, or sent the person to allow All files access). */
let pendingDirect=null;
async function connectDirect1(id,name,ic,which,uriGiven){
 await readPerm();
 if(!PERM.allFiles){
  const r=await dlg({title:'Allow All files access',ok:'Open settings',msg:'This lets Conduint open '+name+' itself, the way Material Files does, instead of going through the Android folder picker (which blocks the storage root and the Download folder). Switch Conduint Files on in the page that opens, then come back.'});
  if(!r)return false;pendingDirect=[id,name,ic,which,uriGiven];askPerm('allFiles');return true}
 pendingDirect=null;
 let R;try{R=await SAF.roots()}catch(e){toast(e.message);return false}
 const uri=uriGiven||R[which];if(!uri)return false;
 const dup=S.mounts.concat(homeM()).find(x=>x.type==='saf'&&x.uri===uri&&x.id!==id);/* V0.51.0: Home folders count too */
 if(dup){toast('That folder is already added as '+dup.name+'.');go(dup.id);return true}
 try{await SAF.list({uri})}catch(e){toast(e.message);return false}
 id=id||'s'+Date.now();
 const sub=decodeURIComponent(uri.replace(/^file:\/\//,'')),m={id,type:'saf',name,sub,ic:ic||'folder',uri,root:uri,direct:true},at=S.mounts.findIndex(x=>x.id===id);
 at<0?S.mounts.push(m):S.mounts[at]=m;save();go(id);toast('Connected: '+name);return true}
/* when the person comes back from the All files access page, finish what they started */
function resumeDirect(){if(pendingDirect&&PERM.allFiles){const a=pendingDirect;pendingDirect=null;connectDirect(...a)}}

/* V0.38.1: ONE entry for everything that lives on this device: a folder (Phone, Termux or any other the Android picker shows), loose files, or an SD card / USB drive. No cloud wording. */
async function connectImport(){
 let v={removable:[]};try{if(SAF.volumes)v=await SAF.volumes()}catch{}
 const r=await dlg({title:LBL_IMPORT,ok:'Continue',val:'folder',
  msg:'Phone, SD card or another folder on this device.',
  opts:[['folder','Add folder'],['files','Add files'],['sd','SD card or USB drive'+(v.removable.length?'':' (none found)')]]});
 if(!r)return;
 if(r.o==='sd')return connectExternal();
 if(r.o==='files')return connectDocs();
 return connectSaf('','','folder',null,{})}
/* external storage: opens the SD card or USB drive directly when Android reports one */
async function connectExternal(){
 let v={removable:[]};try{v=await SAF.volumes()}catch{}
 const has=v.removable.length>0;
 if(!await dlg({title:'Add external storage',ok:has?'Choose folder':'Open picker anyway',
  msg:has?'Found: '+v.removable.join(', ')+'.\nThe picker opens on it. Tap Use this folder to add the whole card, or open a folder first.':'No SD card or USB drive was detected. Plug it in and try again, or continue and choose it from the menu at the top left of the picker.'}))return;
 { /* with All files access the card opens by path, root included */
  await readPerm();
  if(PERM.allFiles){try{const R=await SAF.roots();if(R.removable&&R.removable.length&&await connectDirect('',R.removable[0].label||'External storage','sd','',R.removable[0].uri))return}catch{}}}
 connectSaf('',has?v.removable[0]:'External storage','sd',null,{volume:'external'})}
/* cloud storage: folders for apps that share them, saved files for apps that only share files (Google Drive) */
async function connectCloud(){
 let ps=[];try{ps=(await SAF.providers()).items}catch{}
 const r=await dlg({title:'Add cloud storage',ok:'Continue',opts:[['folder','Cloud folder'],['files','Cloud files']],val:'folder',
  msg:(ps.length?'Cloud apps found: '+ps.map(p=>p.label).join(', ')+'.':'No cloud app found. Install and sign in to Google Drive, OneDrive or Dropbox first.')+
  '\n\nCloud folder: for apps that share whole folders, such as OneDrive and Dropbox.\nCloud files: for Google Drive and any app that only lets you pick files. They are saved here and stay after a restart.'});
 if(!r)return;
 r.o==='files'?connectDocs():connectSaf('','','cloud',null,{prefix:'Cloud: '})}
async function connectDocs(){
 try{const r=await SAF.pickDocs();if(!r.items.length)return toast('Nothing was picked.');
  let m=S.mounts.find(x=>x.type==='docs');
  if(!m){m={id:'cloudfiles',type:'docs',name:'Added files',sub:'Files you added',ic:'file',docs:[]};S.mounts.push(m)}
  else if(m.name==='Cloud files'){m.name='Added files';m.sub='Files you added';if(m.ic==='cloud')m.ic='file'}
  const have=new Set(m.docs.map(d=>d.uri));let n=0;
  r.items.forEach(i=>{if(!have.has(i.uri)){m.docs.push({uri:i.uri,name:i.name});n++}});
  save();go(m.id);toast('Added '+n+' file'+(n===1?'':'s')+'.')}
 catch(e){if(e.code!=='CANCELLED')toast(e.message)}}
/* upload: copy files or a whole folder into the open folder. Files can come from the Android picker or from an app's own picker (OneDrive shows every folder there). */
async function uploadHere(){
 if(!writable())return;
 const r=await dlg({title:LBL_UPLOAD,msg:'They are copied into this folder.',ok:'Continue',val:'app',
  opts:[['app','Files from an app (OneDrive, Dropbox, Drive)'],['files','Files (Android picker)'],['dir','A whole folder']]});
 if(!r)return;
 let tree=null;
 try{let items;
  if(r.o==='dir'){tree=await SAF.pickTree({volume:'',start:''});items=[{uri:tree.root}]}
  else{const x=await SAF.pickDocs({persist:false,app:r.o==='app'});items=(x&&x.items)||[]}
  if(!items.length)return toast('Nothing was picked.');
  const ok=await job('Adding…',()=>SAF.copy({items:items.map(i=>({uri:i.uri})),parent:curDir()}));
  if(ok)toast('Added '+(r.o==='dir'?'the folder.':items.length+' file'+(items.length===1?'':'s')+'.'));
  refresh()}
 catch(e){if(e.code!=='CANCELLED')toast(e.message)}
 finally{if(tree&&tree.uri&&SAF.release)SAF.release({uri:tree.uri}).catch(()=>{})}}
/* send a copy of one file to Drive, OneDrive, Dropbox or any app that can save files */
async function saveToCloud(i){
 try{await SAF.saveCopy({uri:i.uri,name:i.name,mime:mimeOf(i.name,i.mime)});toast('Saved a copy.')}
 catch(e){if(e.code!=='CANCELLED')toast(e.message)}}
async function rmMount(id){
 const m=S.mounts.find(x=>x.id===id);if(m&&m.uri&&SAF)SAF.release({uri:m.uri}).catch(()=>{});
 if(m&&m.docs&&SAF)m.docs.forEach(d=>SAF.release({uri:d.uri}).catch(()=>{}));
 S.mounts=S.mounts.filter(m=>m.id!==id);S.pins=S.pins.filter(p=>p.m!==id);S.trash=S.trash.filter(t=>t.m!==id);delete HANDLES[id];
 try{await idb('readwrite',s=>s.delete(id))}catch{}
 save();cur.m===id?(cur={m:null,cat:null,path:[],dirs:[]},items=[],err=null,draw(),side()):side()}

/* returning from the All files access page: the settings page gives no callback, so look again on focus */
addEventListener('focus',()=>{if(pendingDirect)readPerm().then(resumeDirect)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pendingDirect)readPerm().then(resumeDirect)});
