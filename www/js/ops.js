/* ops.js: dialogs, progress overlay, selection, clipboard, recycle bin and every file operation.
   File operations need the native Saf plugin, so they only appear for storages of type 'saf'. */
let SEL=new Set(),selOn=false,CLIP=null;
const curDir=()=>cur.dirs&&cur.dirs[cur.dirs.length-1];
const writable=()=>{const m=mount(cur.m);return !!(NATIVE&&m&&m.type==='saf'&&!cur.cat)};
const badName=n=>!n||n==='.'||n==='..'||/[\/\\\0]/.test(n)||n.length>255?'A name cannot be empty or contain / or \\.':'';
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const sid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* [1] DIALOG: returns {v: text, o: chosen option} or null when cancelled */
function dlg(o){return new Promise(res=>{
 const D=$('#dlg'),I=$('#di'),X=$('#dx'),M=$('#dm'),k=$('#dk'),n=$('#dn');
 $('#dtt').textContent=o.title||'';M.textContent=o.msg||'';M.style.display=o.msg?'block':'none';
 I.style.display=o.value==null?'none':'block';I.value=o.value==null?'':o.value;
 let pick=o.val;X.replaceChildren();
 (o.opts||[]).forEach(([v,t])=>{const b=h('button','chip'+(v===pick?' on':''),t);b.onclick=()=>{pick=v;[...X.children].forEach(c=>c.classList.toggle('on',c===b))};X.append(b)});
 k.textContent=o.ok||'OK';k.classList.toggle('danger',!!o.danger);n.style.display=o.nocancel?'none':'';
 const done=v=>{D.classList.remove('on');dlg.close=null;res(v)};
 k.onclick=()=>done({v:I.value.trim(),o:pick});n.onclick=()=>done(null);
 I.onkeydown=e=>{if(e.key==='Enter')k.click()};dlg.close=()=>done(null);
 D.classList.add('on');
 if(o.value!=null){I.focus();const d=o.value.lastIndexOf('.');I.setSelectionRange(0,o.sel&&d>0?d:o.value.length)}})}
$('#dlg').onclick=e=>{if(e.target.id==='dlg'&&dlg.close)dlg.close()};

/* [2] BUSY OVERLAY with progress and a real cancel (the native side checks a flag while it copies) */
function busy(t){$('#bt').textContent=t;$('#bp').textContent='';$('#busy').classList.add('on')}
const unbusy=()=>$('#busy').classList.remove('on');
if(SAF&&SAF.addListener)SAF.addListener('progress',e=>{$('#bp').textContent=(e.name||'')+(e.done?' · '+plural(e.done,'file')+' done':'')});
if(TOOLS&&TOOLS.addListener)TOOLS.addListener('toolsProgress',e=>{$('#bp').textContent=e.name||''});
$('#bc').onclick=()=>{if(SAF)SAF.cancel();if(TOOLS)TOOLS.cancel();if(typeof ZL!=='undefined'&&ZL)ZL.cancel();$('#bp').textContent='Cancelling…'};
async function job(t,fn){busy(t);try{return (await fn())||true}catch(e){if(e.code!=='CANCELLED')toast(e.message||'That did not work.');return false}finally{unbusy()}}

/* [3] SELECTION AND CLIPBOARD */
const selItems=()=>items.filter(i=>SEL.has(i.uri));
function setSel(on){selOn=on;if(!on)SEL.clear();draw()}
function toggle(i){SEL.has(i.uri)?SEL.delete(i.uri):SEL.add(i.uri);draw()}
function selAll(){selOn=true;items.forEach(i=>SEL.add(i.uri));draw()}
const toIt=i=>({uri:i.uri,name:i.name,dir:i.dir,parent:i.parent||curDir()});
function drawPaste(){const on=!!CLIP&&writable();$('#pst').classList.toggle('on',on);
 if(on)$('#pst2').textContent=(CLIP.op==='cut'?'Move ':'Copy ')+plural(CLIP.items.length,'item')+' here'}
function opClip(op,its){CLIP={op,m:cur.m,path:cur.path,items:its.map(toIt)};setSel(false);drawPaste();
 toast((op==='cut'?'Cut ':'Copied ')+plural(its.length,'item')+'. Open a folder and tap Paste.')}
async function opPaste(){
 if(!CLIP||!writable())return;const c=CLIP,dst=curDir();
 if(c.op==='cut'&&c.items.every(x=>x.parent===dst))return toast('Those items are already in this folder.');
 const run=typeof shGuard==='function'?await shGuard(c.items):c.items;if(!run.length)return;
 const ok=await job(c.op==='cut'?'Moving…':'Copying…',()=>c.op==='cut'
  ?SAF.move({items:run.map(x=>({uri:x.uri,parent:x.parent})),parent:dst})
  :SAF.copy({items:run.map(x=>({uri:x.uri})),parent:dst}));
 if(ok&&c.op==='cut')run.forEach(x=>x.dir&&rewritePath(c.m,[...c.path,x.name],cur.m,[...cur.path,x.name]));
 if(ok){CLIP=null;drawPaste();toast((c.op==='cut'?'Moved ':'Pasted ')+plural(run.length,'item')+'.')}
 refresh()}

/* pins and folder colours are keyed by folder names, so they follow a folder that is renamed or moved here */
function rewritePath(m1,p1,m2,p2){
 const pre=(p,q)=>q.length>=p.length&&p.every((x,i)=>x===q[i]);
 S.pins.forEach(x=>{if(x.m===m1&&pre(p1,x.path)){x.m=m2;x.path=[...p2,...x.path.slice(p1.length)];x.name=x.path[x.path.length-1]}});
 const c={};for(const k in S.colors){const j=k.indexOf(':'),m=k.slice(0,j),r=k.slice(j+1),p=r?r.split('/'):[];
  if(m===m1&&pre(p1,p))c[key(m2,[...p2,...p.slice(p1.length)])]=S.colors[k];else c[k]=S.colors[k]}
 S.colors=c;save()}
function dropPath(m,p){const pre=q=>q.length>=p.length&&p.every((x,i)=>x===q[i]);
 S.pins=S.pins.filter(x=>!(x.m===m&&pre(x.path)));
 for(const k in S.colors){const j=k.indexOf(':'),r=k.slice(j+1);if(k.slice(0,j)===m&&pre(r?r.split('/'):[]))delete S.colors[k]}save()}

/* [4] CREATE, RENAME */
async function opNew(file){
 const r=await dlg({title:file?'New text file':'New folder',value:file?'untitled.txt':'',ok:'Create',sel:!!file});if(!r)return;
 const e=badName(r.v);if(e)return toast(e);
 await job('Creating…',()=>file?SAF.mkfile({parent:curDir(),name:r.v}):SAF.mkdir({parent:curDir(),name:r.v}));refresh()}
async function opRename(i){
 const r=await dlg({title:'Rename',value:i.name,ok:'Rename',sel:!i.dir});if(!r||r.v===i.name)return;
 const e=badName(r.v);if(e)return toast(e);
 const ok=await job('Renaming…',()=>SAF.rename({uri:i.uri,name:r.v}));
 if(ok&&i.dir)rewritePath(cur.m,[...cur.path,i.name],cur.m,[...cur.path,r.v]);refresh()}

/* [5] ZIP */
async function opZip(its){
 const r=await dlg({title:'Compress to ZIP',value:its.length===1?its[0].name+'.zip':'Archive.zip',ok:'Compress',opts:[[0,'Store'],[1,'Fast'],[6,'Normal'],[9,'Maximum']],val:6});if(!r)return;
 let n=r.v;const e=badName(n);if(e)return toast(e);if(!/\.zip$/i.test(n))n+='.zip';
 const ok=await job('Compressing…',()=>SAF.zip({items:its.map(i=>({uri:i.uri})),parent:curDir(),name:n,level:r.o}));
 if(ok)toast('Created '+n);refresh()}
async function opUnzip(i){
 const r=await dlg({title:'Extract archive',msg:'The files go into a new folder next to the archive.',value:i.name.replace(/\.zip$/i,'')||'Extracted',ok:'Extract'});if(!r)return;
 const e=badName(r.v);if(e)return toast(e);
 const ok=await job('Extracting…',()=>SAF.unzip({uri:i.uri,parent:i.parent||curDir(),name:r.v}));
 if(ok)toast('Extracted to '+r.v);refresh()}
/* Extract to folder…: pick any folder in the system picker, the archive goes into a new folder inside it */
async function opUnzipTo(i){
 let d;try{d=await SAF.pickTree({volume:'',start:''})}catch(e){if(e.code!=='CANCELLED')toast(e.message);return}
 const r=await dlg({title:'Extract to '+d.name,msg:'The files go into a new folder inside '+d.name+'.',value:i.name.replace(/\.zip$/i,'')||'Extracted',ok:'Extract'});if(!r)return;
 const e=badName(r.v);if(e)return toast(e);
 const ok=await job('Extracting…',()=>SAF.unzip({uri:i.uri,parent:d.root,name:r.v}));
 if(ok)toast('Extracted to '+d.name+' / '+r.v);refresh()}

/* [6] OTHER APPS: Open with (any viewer or editor, Acode included; write access is granted so editors can save), Share to (chat apps, cloud, Facebook... through the Android share sheet). */
async function opOpenWith(i,edit){
 try{await SAF.openWith({uri:i.uri,mime:mimeOf(i.name,i.mime),edit:!!edit})}catch(e){toast(e.message)}}
async function opShare(its){
 const f=its.filter(i=>!i.dir);if(!f.length)return toast("Folders can't be shared. Compress them first, then share the ZIP.");
 if(f.length<its.length)toast('Folders were skipped. Compress them to share.');
 try{await SAF.share({uris:f.map(i=>i.uri)})}catch(e){toast(e.message)}}
function opInfo(i){
 if(typeof infoOpen==='function')return infoOpen(i);
 const k=i.dir?'Folder':({img:'Image',aud:'Audio',vid:'Video',doc:'Document',arc:'Archive',apk:'Installer'}[kindOf(i.name)]||'File');
 dlg({title:i.name,msg:[k,i.dir?'':'Size: '+fmt(i.size)+(i.size>=1024?' ('+i.size.toLocaleString()+' bytes)':''),i.mtime?'Modified: '+new Date(i.mtime).toLocaleString():'',
  cur.cat?'':'Location: '+[title(),...cur.path].join(' / ')].filter(Boolean).join('\n'),ok:'Close',nocancel:true})}

/* [6b] FOLDER SIZE (V0.28.0). Counts every file under a folder on a background thread behind the busy overlay, so Cancel works.
   A folder that Android would not let it read is counted in "skipped" and the answer says so instead of looking complete. */
async function opSize(i){
 if(!SAF||!SAF.dirSize||!i||!i.uri)return toast('Folder size runs in the Android app.');
 const t0=Date.now(),r=await job('Measuring '+i.name+'…',()=>SAF.dirSize({uri:i.uri}));
 if(!r||r===true)return;
 const b=r.bytes||0,sec=((Date.now()-t0)/1000).toFixed(1);
 dlg({title:i.name,msg:[fmt(b)+(b>=1024?' ('+b.toLocaleString()+' bytes)':''),plural(r.files||0,'file')+' in '+plural(r.folders||0,'subfolder'),
  r.skipped?plural(r.skipped,'folder')+' could not be read, so the real size is larger.':'','Counted in '+sec+' s'].filter(Boolean).join('\n'),ok:'Close',nocancel:true})}

/* [7] DELETE AND THE RECYCLE BIN.
   The bin is a hidden folder (.conduint-trash) at the root of the same storage, so a delete is a fast move on
   the same drive. What was deleted, from where and when is kept in S.trash. */
const trashDir=async m=>(await SAF.ensureDir({parent:mount(m).root,name:TRASH})).uri;
async function opDelete(its,forever,noAsk){
 const useBin=S.settings.bin&&!forever;
 const r=noAsk||await dlg({title:useBin?'Move to recycle bin?':'Delete forever?',
  msg:(its.length===1?'"'+its[0].name+'"':plural(its.length,'item'))+(useBin?' can be restored from the recycle bin.':' will be removed for good.'),
  ok:useBin?'Move to bin':'Delete',danger:true});if(!r)return;
 const ok=await job(useBin?'Moving to bin…':'Deleting…',async()=>{
  const g={};its.forEach(i=>{const m=i.m||cur.m;(g[m]=g[m]||[]).push(i)});
  for(const m in g){
   if(!useBin){await SAF.remove({uris:g[m].map(i=>i.uri)})}
   else{const tr=await trashDir(m),have=new Set((await SAF.list({uri:tr})).items.map(x=>x.name)),mv=[];
    for(const i of g[m]){let uri=i.uri,tn=i.name;
     if(have.has(tn)){tn=Date.now().toString(36)+'~'+tn;uri=(await SAF.rename({uri,name:tn})).uri}
     have.add(tn);mv.push({i,uri,tn,from:i.parent||curDir()})}
    const out=await SAF.move({items:mv.map(x=>({uri:x.uri,parent:x.from})),parent:tr});
    mv.forEach((x,k)=>S.trash.push({id:sid(),m,name:x.i.name,tname:x.tn,dir:!!x.i.dir,size:x.i.size||0,at:Date.now(),uri:out.uris[k],trash:tr,from:x.from,path:cur.cat?null:cur.path}));
    save()}
   if(!cur.cat)g[m].forEach(i=>i.dir&&dropPath(m,[...cur.path,i.name]))}
  return true});
 if(ok)toast(useBin?'Moved to the recycle bin.':'Deleted.');refresh();return !!ok}

async function opRestore(es){
 if(!es.length)return toast('The recycle bin is empty.');
 await job('Restoring…',async()=>{let n=0,lost=0;
  const fsE=es.filter(e=>e.p);
  if(fsE.length){const r=await TOOLS.fsRestore({items:fsE.map(e=>({id:e.id,trash:e.fpath,from:e.from}))});
   r.items.forEach(x=>{S.trash=S.trash.filter(t=>t.id!==x.id);x.lost?lost++:n++})}
  for(const e of es.filter(e=>!e.p)){const m=mount(e.m);if(!m){continue}
   try{await SAF.stat({uri:e.uri})}catch{S.trash=S.trash.filter(x=>x.id!==e.id);lost++;continue}
   let dst=null;
   try{await SAF.stat({uri:e.from});dst=e.from}catch{}
   if(!dst&&e.path){try{const d=await resolveDirs(m,e.path);dst=d[d.length-1]}catch{}}
   if(!dst)dst=m.root;
   const r=await SAF.move({items:[{uri:e.uri,parent:e.trash}],parent:dst});
   if(e.tname!==e.name){try{await SAF.rename({uri:r.uris[0],name:e.name})}catch{}}
   S.trash=S.trash.filter(x=>x.id!==e.id);n++}
  save();toast(n?'Restored '+plural(n,'item')+'.':'Nothing could be restored.'+(lost?' It was already gone.':''));return true});
 refresh();side()}
async function opPurge(es){
 const r=await dlg({title:'Delete forever?',msg:plural(es.length,'item')+' will be removed for good.',ok:'Delete',danger:true});if(!r)return;
 await job('Deleting…',async()=>{
  for(const e of es){try{e.p?await TOOLS.fsRemove({paths:[e.fpath]}):await SAF.remove({uris:[e.uri]})}catch{}S.trash=S.trash.filter(x=>x.id!==e.id)}save();return true});
 refresh();side()}
const opEmpty=()=>S.trash.length?opPurge(S.trash.slice()):toast('The recycle bin is already empty.');
/* drop bin entries whose files vanished (deleted by another app) */
async function pruneBin(){
 if(!SAF||!S.trash.length)return;
 const alive=await Promise.all(S.trash.map(e=>e.p?TOOLS.fsExists({paths:[e.fpath]}).then(r=>r.exists[0],()=>false):SAF.stat({uri:e.uri}).then(()=>true,()=>false)));
 const n=S.trash.length;S.trash=S.trash.filter((e,i)=>alive[i]);if(S.trash.length!==n)save()}
