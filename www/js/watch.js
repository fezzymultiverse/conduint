/* watch.js (V0.27.0): cloud logos and account emails, Keep running, and the Folder watcher.

   CLOUD LOGOS AND EMAILS. Conduint holds no cloud logins: it reaches Drive, OneDrive and Dropbox through Android's document
   providers. So the logo is the cloud app's own icon (native Saf.providerInfo), and the email is a label: filled in when the
   provider puts one in the folder's address, otherwise typed by you (long-press the cloud > Account email).

   KEEP RUNNING. A foreground service (native KeepService) stops Android from freezing Conduint and sends a "tick" every few
   minutes. It starts from Settings > Power > Keep running, or by itself while a folder watch is on.

   FOLDER WATCHER. A watch is: a source folder, a destination folder, and a snapshot of the source (name, size, date of every
   file) kept in its own localStorage key. On every tick the source is compared to the snapshot. New or changed files ask a
   question in a notification: Upload or Deny. Upload copies those files to the destination (never deletes anything).
   Deny marks them as seen, so nothing piles up. Files that were already there when you created the watch never ask.
   Files modified in the last 20 seconds wait for the next check (still being written). */

const WATCH=BRIDGE?plug('Watch'):null;
const WT={busy:false,min:[1,5,15,30,60]};

/* ---------- cloud logos and emails ---------- */
function wtLogoEl(src){const i=h('img','plogo');i.src=src;i.alt='';i.draggable=false;return i}
function wtLogo(n,src){try{if(n&&n.firstChild)n.replaceChild(wtLogoEl(src),n.firstChild)}catch{}}
async function cloudLook(m,force){
 if(!SAF||!SAF.providerInfo||!m||m.ic!=='cloud'||!m.uri)return;
 if(m.logo&&!force)return;
 try{const r=await SAF.providerInfo({uri:m.uri});
  if(r.icon)m.logo=r.icon;if(r.label)m.prov=r.label;
  if(r.email&&!m.emailEdit)m.email=r.email;
  save();side()}catch{}}
async function cloudEmail(m){
 const r=await dlg({title:(m.prov||m.name)+' account',msg:'Which account is this folder from? It shows under the name in the side panel. Conduint holds no cloud logins, so this is only a label you type. Leave it empty to remove it.',value:m.email||'',ok:'Save'});
 if(!r)return;
 const v=(r.v||'').trim();
 if(v){m.email=v;m.emailEdit=1}else{delete m.email;delete m.emailEdit}
 save();side();toast(v?'Account saved.':'Account removed.')}
async function cloudAfter(m){await cloudLook(m,true);if(!m.email)cloudEmail(m)}

/* ---------- keep running ---------- */
const wtActive=()=>(S.watch||[]).filter(w=>w.on);
function wtNoteText(){const n=wtActive().length;return n?'Watching '+plural(n,'folder')+' · checks every '+(S.settings.watchMin||5)+' min':'Keeping Conduint running'}
async function wtKeepSync(){
 if(!WATCH)return;
 const want=!!S.settings.keep||wtActive().length>0;
 try{if(want)await WATCH.start({minutes:S.settings.watchMin||5,text:wtNoteText()});else await WATCH.stop()}catch{}}
async function wtKeepAsk(){
 /* what Android needs so the service is not stopped: the battery exemption and (Android 13+) the notification permission */
 await readPerm();
 if(!PERM.battery)askPerm('battery');
 else if(!PERM.notifications)askPerm('notifications')}

/* ---------- watching ---------- */
const wtKey=id=>'conduint.watch.'+id;
function wtLoad(id){try{return JSON.parse(localStorage[wtKey(id)]||'{}')}catch{return{}}}
function wtSave(id,st){try{localStorage[wtKey(id)]=JSON.stringify(st)}catch{}}
const wtNm=r=>r.slice(r.lastIndexOf('/')+1);
async function wtWalk(w){const A={m:new Map(),n:0};await ssWalk(w.src.uri,A,'',0);return A.m}
async function wtBaseline(w){
 const files=await wtWalk(w),st={};
 for(const [rel,f] of files)st[rel]=[f.mtime||0,f.size||0];
 wtSave(w.id,st);return files.size}
function wtChanged(files,st){
 const now=Date.now(),out=[];
 for(const [rel,f] of files){
  const o=st[rel];
  if(o&&o[0]===(f.mtime||0)&&o[1]===(f.size||0))continue;
  if(f.mtime&&now-f.mtime<20000)continue;
  out.push(rel)}
 return out}
async function wtCheck(w){
 const files=await wtWalk(w),st=wtLoad(w.id),ch=wtChanged(files,st);
 w.err='';w.seen=Date.now();
 if(!ch.length){w.ask=[];w.meta={};w.askedKey='';if(WATCH)WATCH.clear({id:w.id}).catch(()=>{});return 0}
 w.ask=ch;w.meta={};ch.forEach(r=>{const f=files.get(r);w.meta[r]=[f.mtime||0,f.size||0]});
 const key=ch.length+':'+ch.reduce((a,r)=>a+(w.meta[r][0]||0)+(w.meta[r][1]||0),0);
 if(key!==w.askedKey){w.askedKey=key;wtAsk(w)}
 return ch.length}
function wtAsk(w){
 const ch=w.ask||[],nm=ch.slice(0,3).map(wtNm).join(', ')+(ch.length>3?' and '+(ch.length-3)+' more':'');
 if(WATCH)WATCH.ask({id:w.id,title:'Upload '+plural(ch.length,'file')+'?',text:nm+' · '+w.src.name+' → '+w.dst.name}).catch(()=>{});
 if(document.visibilityState==='visible')toast(plural(ch.length,'file')+' changed in '+w.src.name+'. Open Folder watcher to upload or deny.')}
async function wtTick(){
 if(WT.busy||!S.watch||!S.watch.length)return;WT.busy=true;
 try{
  await wtAnswers();
  for(const w of wtActive()){if(w.up)continue;try{await wtCheck(w)}catch(e){w.err=e.message||'Could not read the folder.'}}
  save()
 }finally{WT.busy=false}}
async function wtAnswers(){
 if(!WATCH)return;let r;try{r=await WATCH.takeAnswers()}catch{return}
 for(const a of (r&&r.items)||[]){
  const w=(S.watch||[]).find(x=>x.id===a.id);if(!w)continue;
  if(a.ok)await wtUpload(w);else wtDeny(w)}}
function wtDeny(w){
 const st=wtLoad(w.id);let n=0;
 for(const r of w.ask||[]){if(w.meta&&w.meta[r]){st[r]=w.meta[r];n++}}
 wtSave(w.id,st);w.ask=[];w.meta={};w.askedKey='';save();
 if(WATCH)WATCH.clear({id:w.id}).catch(()=>{});
 return n}
async function wtUpload(w){
 if(w.up)return 0;w.up=1;let n=0,err=0;
 try{
  const A=await wtWalk(w),B={m:new Map(),n:0};
  await ssWalk(w.dst.uri,B,'',0);
  const st=wtLoad(w.id),cache={};
  for(const rel of w.ask||[]){
   const a=A.get(rel);if(!a)continue;
   try{
    const b=B.m.get(rel);
    if(b){if(ssBig(a)){err++;continue}await SAF.copyOver({from:a.uri,to:b.uri})}
    else await ssPut(a,w.dst.uri,cache,rel);
    st[rel]=[a.mtime||0,a.size||0];n++
   }catch(e){err++}}
  wtSave(w.id,st);
  w.ask=[];w.meta={};w.askedKey='';w.last=Date.now();w.upl=(w.upl||0)+n;save();
  if(WATCH)WATCH.clear({id:w.id}).catch(()=>{});
  const txt=(n?'Uploaded '+plural(n,'file'):'Nothing uploaded')+' to '+w.dst.name+(err?'. '+err+' not uploaded (too big to replace or not readable).':'.');
  if(TOOLS&&TOOLS.notice)TOOLS.notice({title:'Folder watcher',text:txt}).catch(()=>{});
  if(document.visibilityState==='visible')toast(txt);
  return n
 }finally{w.up=0}}

/* ---------- the Folder watcher screen ---------- */
async function wtAdd(){
 const a=await ssPick('Folder to watch');if(!a)return;
 const b=await ssPick('Upload changes to');if(!b)return;
 if(a.uri===b.uri)return toast('Pick two different folders.');
 const w={id:'w'+Date.now(),name:a.name+' → '+b.name,src:a,dst:b,on:true,ask:[],meta:{},askedKey:'',last:0,upl:0};
 const n=await job('Reading the folder…',()=>wtBaseline(w));
 if(!n&&n!==0)return;
 (S.watch||(S.watch=[])).push(w);save();
 await wtKeepSync();wtKeepAsk();
 toast('Watching '+a.name+'. The '+plural(typeof n==='number'?n:0,'file')+' already there will not ask.')}
async function wtOpen(){
 if(!NATIVE||!WATCH)return toast('The folder watcher runs in the Android app.');
 const L=S.watch||(S.watch=[]);
 await wtAnswers();
 const opts=[['add','Watch a folder…']];
 L.forEach((w,i)=>{const k=(w.ask||[]).length;
  if(k){opts.push(['up'+i,'Upload '+plural(k,'file')+': '+w.name]);opts.push(['dn'+i,'Deny '+plural(k,'file')+': '+w.name])}});
 if(L.length)opts.push(['now','Check now']);
 L.forEach((w,i)=>opts.push(['tg'+i,(w.on?'Pause: ':'Resume: ')+w.name]));
 L.forEach((w,i)=>opts.push(['rm'+i,'Remove: '+w.name]));
 const info=L.length?L.map(w=>w.name+' · '+(w.on?'on':'paused')+(w.err?' · '+w.err:'')+(w.upl?' · '+plural(w.upl,'file')+' uploaded':'')).join('\n'):'Pick a folder to watch and a folder to upload to. When something new or changed shows up, a notification asks: Upload or Deny. Files already there never ask. Nothing is ever deleted.';
 const r=await dlg({title:'Folder watcher',msg:info+(L.length?'\n\nChecks every '+(S.settings.watchMin||5)+' min while Conduint is kept running.':''),opts,val:opts[0][0],ok:'OK'});
 if(!r)return;
 if(r.o==='add')return wtAdd();
 if(r.o==='now'){await job('Checking…',()=>wtTick());const k=L.reduce((a,w)=>a+(w.ask||[]).length,0);return toast(k?plural(k,'file')+' waiting for your answer.':'Nothing new.')}
 const i=+(r.o.slice(2)),w=L[i];if(!w)return;
 if(/^up\d+$/.test(r.o)){await job('Uploading…',()=>wtUpload(w));return}
 if(/^dn\d+$/.test(r.o)){const n=wtDeny(w);return toast('Denied. '+plural(n,'file')+' will not ask again unless they change.')}
 if(/^tg\d+$/.test(r.o)){w.on=!w.on;if(w.on){await job('Reading the folder…',()=>wtBaseline(w));w.ask=[];w.askedKey=''}save();await wtKeepSync();return toast(w.on?'Resumed. Changes made while paused will not ask.':'Paused.')}
 if(/^rm\d+$/.test(r.o)){L.splice(i,1);try{delete localStorage[wtKey(w.id)]}catch{}save();if(WATCH)WATCH.clear({id:w.id}).catch(()=>{});await wtKeepSync();toast('Removed. Your files were not touched.')}}

/* ---------- start-up ---------- */
function wtInit(){
 if(!NATIVE||!WATCH)return;
 try{
  WATCH.addListener('tick',()=>{wtTick()});
  WATCH.addListener('answer',()=>{wtAnswers()});
 }catch{}
 wtAnswers();
 wtKeepSync();
 [...S.mounts,...((S.dash&&S.dash.fm)||[])].forEach(m=>{if(m.ic==='cloud')cloudLook(m)})}
window.addEventListener('load',()=>setTimeout(wtInit,2500));
