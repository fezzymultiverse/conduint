/* ui.js: browser view, side panel, menus, settings, back button and boot. Loaded last. */
let cur={m:null,cat:null,path:[],dirs:[]},items=[],err=null,q='',lp=false;
const title=()=>cur.cat?catName(cur.cat):cur.m?(mount(cur.m)||{}).name||'Conduint Files':'Home';
const begin=()=>{document.body.classList.remove('nav');FK='';FLAT=false;q='';$('#q').value='';SEL.clear();selOn=false};
const EMPTY={m:null,cat:null,path:[],dirs:[]};
let FK='';/* quick filter: '' all, or a file kind */
let FLAT=false;/* true while a quick filter is showing files from this folder AND everything inside it (like a Library), not just this folder */
const inLib=()=>!!(cur.cat||FLAT);
const FILTERS=[['','All'],['img','Images'],['vid','Videos'],['aud','Songs'],['doc','Docs'],['arc','Archives'],['apk','Installers']];
/* sorting: name, size, date, type (extension) and category (images, songs, videos, documents...). Tap the active one again to flip the order. */
const extOf=n=>{const p=n.lastIndexOf('.');return p>0?n.slice(p+1).toLowerCase():''};
const VIEWS=['grid','list','details'],VNAME={grid:'Grid',list:'List',details:'Details'},KNAME={doc:'Document',img:'Image',aud:'Song',vid:'Video',arc:'Archive',apk:'Installer'};
const KO=['doc','img','aud','vid','arc','apk','file'],KORD=i=>i.dir?-1:Math.max(0,KO.indexOf(kindOf(i.name,i.mime)));
const SORTS=[['name','Name',['A to Z','Z to A']],['size','Size',['Smallest first','Largest first']],['date','Date modified',['Oldest first','Newest first']],['type','Type',['A to Z','Z to A']],['kind','Category',['Documents first','Files last']]];
function setSort(v){const s=S.settings;if(s.sort===v)s.sortDir=s.sortDir==='desc'?'asc':'desc';else{s.sort=v;s.sortDir=(v==='size'||v==='date')?'desc':'asc'}save();drawSettings();draw()}

/* [1] BROWSER */
async function go(m,path=[],dirs){
 const mt=mount(m);
 if(!mt){const s=SLOTS.find(p=>p.id===m);return s?connect(s.id,s.name,s.ic,s.hint,{start:s.start,direct:s.direct}):toast('That storage is not connected.')}
 cur={m,cat:null,path,dirs:dirs||[mt.root]};begin();
 if(mt.type==='saf'&&path.length&&!dirs){
  try{cur.dirs=await resolveDirs(mt,path)}catch(e){cur={m,cat:null,path:[],dirs:[mt.root]};items=[];err=e.message;draw();return side()}}
 await load()}
async function load(){const mt=mount(cur.m);
 if(FK&&flatOK(mt))return loadFlat(mt);
 FLAT=false;
 try{items=await prov(mt).list(mt,cur.path,cur.dirs);err=null}catch(e){items=[];err=mt.type==='saf'?'Android blocked access to this folder, or it has moved. Choose it again to give access.\n\n'+e.message:e.message}
 draw();side()}
/* Internal storage, SD cards and folders: picking Songs, Images, Videos, Docs, Archives or Installers in the top row lists every
   such file in this folder and all folders inside it, the same way the Library does. All shows the plain folder again. */
const flatOK=mt=>!!(mt&&mt.type==='saf'&&SAF&&SAF.scan&&FK&&EXT[FK]);
let flatTok=0;
async function loadFlat(mt){
 const tok=++flatTok,k=FK;FLAT=true;items=[];err=null;SCANNING=true;draw();
 let r=[],e2=null;
 try{const res=await SAF.scan({uri:cur.dirs[cur.dirs.length-1],exts:EXT[k].split(' '),cap:100000});
  r=(res.items||[]).filter(i=>!(i.name||'').startsWith('.')&&i.name!==TRASH).map(i=>({...i,m:cur.m,path:[i.pname||''],fs:false}))}
 catch(e){e2=e.message}
 if(tok!==flatTok||FK!==k||!FLAT)return;/* a newer tap replaced this one */
 SCANNING=false;items=r;err=e2;draw();side()}
let SCANNING=false;
async function goCat(c){
 cur={...EMPTY,cat:c};begin();
 if(c==='bin')return binView();
 return loadCat(c)}
let catTok=0;
async function loadCat(c){
 const tok=++catTok;
 if(!NATIVE&&!mounts().length){items=[];err='Add a storage first (the + next to Storage).';draw();return side()}
 toast('Scanning your storage…');
 let r=[],e2=null;try{r=await scan(CATS[c].kind)}catch(e){e2=e.message}
 if(tok!==catTok||cur.cat!==c)return;/* a newer tap replaced this one */
 items=r;err=e2;draw();side()}
async function binView(){
 await pruneBin();
 items=S.trash.map(e=>({name:e.name,dir:e.dir,size:e.size,mtime:e.at,uri:e.id,bin:e}));err=null;draw();side()}
async function refresh(){
 DC.clear();if(typeof libReset==='function')libReset();if(typeof p2Refresh==='function')p2Refresh();
 const L=$('#list'),y=L.scrollTop;SEL.clear();selOn=false;
 if(cur.cat==='bin')await binView();else if(cur.cat)await loadCat(cur.cat);else if(cur.m)await load();else draw();
 L.scrollTop=y}
const tap=(e,f)=>e.onclick=()=>{if(lp){lp=false;return}f()};
function crumbs(){const c=$('#crumbs');c.replaceChildren();
 [title(),...cur.path].forEach((n,i)=>{if(i)c.append(h('span','sep','›'));const b=h('button','crumb',n);b.onclick=()=>cur.m&&go(cur.m,cur.path.slice(0,i),cur.dirs.slice(0,i+1));c.append(b)});c.scrollLeft=c.scrollWidth}
function open(i,a){
 const k=kindOf(i.name,i.mime),av=x=>x==='vid'||x==='aud';
 if(i.lost)return toast('Android no longer allows this file. Remove it from the list and add it again.');
 /* V0.28.4: Scan on open. Shield checks the file first; only a dangerous one asks. Any failure lets it open. */
 if(!open.sk&&typeof shOpenNeeds==='function'&&shOpenNeeds(i)){shOpenGate(i).then(go=>{if(go){open.sk=true;try{open(i,a)}finally{open.sk=false}}}).catch(()=>{open.sk=true;try{open(i,a)}finally{open.sk=false}});return}
 /* V0.19.2: .zip → browse inside without extracting */
 if(/\.zip$/i.test(i.name)&&typeof zipBrowse==='function'){zipBrowse(i);return;}/* V0.52.0: a tap enters the zip once, no popup. Long-press has Browse, Extract here, Extract to folder. */
 const rt=rdType(i.name,i.mime);if(rt&&rt!=='img'&&rt!=='av')return readerOpen(i);
 if(k==='apk')return installApk(i);
 if(av(k)||k==='img')openMedia(i,a.filter(x=>!x.dir&&(k==='img'?kindOf(x.name,x.mime)==='img':av(kindOf(x.name,x.mime)))));
 else if(i.uri&&SAF)opOpenWith(i);
 else toast('No viewer for this file type yet.')}

/* what the long-press / right-click menu offers for one item */
function itemMenu(i,p,k,pinned,a){
 const L=[],sel=()=>{selOn=true;SEL.add(i.uri);draw()};
 if(i.bin)return[['Restore',()=>opRestore([i.bin])],['Delete forever',()=>opPurge([i.bin])]];
 if(i.doc){const r=['Remove from list',()=>removeDoc(i)];
  return i.lost?[r]:[['Open',()=>open(i,a)],['Open with…',()=>opOpenWith(i,true)],['Share to…',()=>opShare([i])],r,[isHid(i,cur.m,cur.path)?'Unhide':'Hide',()=>toggleHide([i])],['Details',()=>opInfo(i)]]}
 if(i.dir)L.push(['Open',()=>go(cur.m,p,[...cur.dirs,i.uri])]);else L.push(['Open',()=>open(i,a)]);
 if(i.uri&&SAF&&!i.dir&&kindOf(i.name,i.mime)==='apk')L.push(['Install app',()=>installApk(i)]);
 if(i.uri&&SAF&&!i.dir)L.push(['Open with…',()=>opOpenWith(i,true)]);
 if(!i.dir&&/\.zip$/i.test(i.name)){L.push(['Browse ZIP contents',()=>typeof zipBrowse==='function'&&zipBrowse(i)]);if(i.uri&&SAF){if(writable()&&!FLAT)L.push(['Extract here',()=>opUnzip(i)]);L.push(['Extract to folder…',()=>opUnzipTo(i)])}}
 if(!i.bin)L.push(['Select',sel]);
 if(NATIVE&&i.uri&&SAF&&!i.bin&&typeof shScanSel==='function')L.push(['Scan with Shield',()=>shScanSel([i])]);
 if(NATIVE&&i.uri&&!i.dir&&!i.bin&&kindOf(i.name,i.mime)==='vid'&&typeof cvtOpen==='function')L.push(['Convert to audio…',()=>cvtOpen(i)]);
 if(NATIVE&&i.uri&&!i.dir&&!i.bin)L.push(['Move to Vault',()=>vMove([i])]);
 if(writable()&&!FLAT){
  L.push(['Copy',()=>opClip('copy',[i])],['Cut',()=>opClip('cut',[i])],['Rename',()=>opRename(i)],['Compress to ZIP',()=>opZip([i])]);
  if(!i.dir)L.push(['Share',()=>opShare([i])],['Upload to cloud…',()=>saveToCloud(i)]);
  L.push(['Delete',()=>opDelete([i])]);
  if(S.settings.bin)L.push(['Delete forever',()=>opDelete([i],true)])}
 else if(inLib()&&i.uri&&SAF){L.push(['Share',()=>opShare([i])],['Upload to cloud…',()=>saveToCloud(i)]);if(!i.fs)L.push(['Delete',()=>opDelete([i])])}
 if(i.dir&&i.uri&&SAF&&SAF.dirSize)L.push(['Size',()=>opSize(i)]);
 if(i.dir&&!inLib()){L.push([pinned?'Unpin':'Pin to top',()=>togglePin(cur.m,p)]);L.push(['sw',c=>{c?S.colors[k]=c:delete S.colors[k];save();draw();side()}])}
 L.push([isHid(i,cur.m,cur.path)?'Unhide':'Hide',()=>toggleHide([i])]);
 L.push(['Details',()=>opInfo(i)]);
 return slim(L)}
/* the main list: Open, Copy, Cut, Rename, Delete, Pin (folders), Hide, then Features, which opens its own panel (zip, colour, encrypt, send to...). */
const FEAT=['Compress to ZIP','Folder colour…','Encrypt (Move to Vault)','Share to…','Open with…','Install app','Extract','Size','Details'];
function slim(L){
 const P=['Open','Browse ZIP contents','Extract here','Extract to folder…','Select','Scan with Shield','Details','Copy','Cut','Rename','Delete','Pin to top','Unpin','Hide','Unhide'],pri=[],more=[];
 L.forEach(e=>{const l=e[0];
  if(l==='Upload to cloud…')return;
  if(l==='sw'){more.push(['Folder colour…',()=>menu(menu.x,menu.y,[e])]);return}
  if(l==='Share'){more.push(['Share to…',e[1]]);return}
  if(l==='Move to Vault'){more.push(['Encrypt (Move to Vault)',e[1]]);return}
  (P.includes(l)?pri:more).push(e)});
 pri.sort((a,b)=>P.indexOf(a[0])-P.indexOf(b[0]));
 const o=l=>{const i=FEAT.indexOf(l);return i<0?99:i};more.sort((a,b)=>o(a[0])-o(b[0]));
 return more.length?[...pri,['Features',more]]:pri}
/* Hide / Unhide: if every picked item is already hidden they come back, otherwise they all get hidden */
function toggleHide(its){
 const all=its.every(i=>isHid(i,cur.m,cur.path));
 its.forEach(i=>{const k=hidKey(i,cur.m,cur.path);all?delete S.hid[k]:S.hid[k]=true});save();
 if(selOn)setSel(false);
 toast(all?plural(its.length,'item')+' unhidden.':plural(its.length,'item')+' hidden. Use the three dots, Show hidden items, to see '+(its.length>1?'them':'it')+' again.');
 draw();side();if(typeof p2Refresh==='function')p2Refresh()}
function removeDoc(i){const m=mount(cur.m);if(!m||m.type!=='docs')return;
 m.docs=m.docs.filter(d=>d.uri!==i.uri);if(SAF)SAF.release({uri:i.uri}).catch(()=>{});save();refresh()}

function draw(){
 const s=S.settings,L=$('#list');L.className=s.view+(s.compact?' cmp':'');if(typeof thumbReset==='function')thumbReset();L.replaceChildren();drawQF();
 const so=cur.cat==='bin'?'date':s.sort;
 /* pinned folders always sit first, in the order they were pinned */
 const rank=new Map(items.map(i=>[i,!cur.cat&&i.dir?S.pins.findIndex(x=>key(x.m,x.path)===key(cur.m,[...cur.path,i.name])):-1]));
 const a=items.filter(i=>(s.hidden||(!i.name.startsWith('.')&&!isHid(i,cur.m,cur.path)))&&i.name.toLowerCase().includes(q.toLowerCase())&&(!FK||i.dir||kindOf(i.name,i.mime)===FK))
  .sort((x,y)=>{const rx=rank.get(x),ry=rank.get(y);
   if((rx>=0)!==(ry>=0))return rx>=0?-1:1;if(rx>=0)return rx-ry;
   if(s.first&&x.dir!==y.dir)return x.dir?-1:1;
   const nm=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}),dir=cur.cat==='bin'?-1:s.sortDir==='desc'?-1:1;
   const c=so==='size'?x.size-y.size:so==='date'?x.mtime-y.mtime:so==='type'?(extOf(x.name).localeCompare(extOf(y.name))||nm(x,y)):so==='kind'?(KORD(x)-KORD(y)||nm(x,y)):nm(x,y);
   return c?c*dir:nm(x,y)});
 if(err){L.append(h('div','empty',err));{const em=mount(cur.m);if(em&&em.type==='saf'&&!cur.cat){const b=h('button','repick','Choose this folder again');b.onclick=()=>connect(em.id,em.name,em.ic,null,{pick:true,start:'',volume:em.ic==='sd'?'external':''});L.append(b)}}}
 else if(!cur.m&&!cur.cat)L.append(h('div','empty','Tap + next to Storage to add Internal storage, a folder, files or an SD card, or Upload Files / Folders.'));
 else if(FLAT&&SCANNING)L.append(h('div','empty','Looking through this folder and everything inside it…'));
 else if(!a.length)L.append(h('div','empty',q?'No matches in this view.':cur.cat==='bin'?'The recycle bin is empty.':FLAT?'No '+(FILTERS.find(f=>f[0]===FK)||['','files'])[1].toLowerCase()+' found in this folder or inside it.':'Nothing here yet.'));
 const mk=i=>{const p=[...cur.path,i.name],k=key(cur.m,p),pinned=i.dir&&!inLib()&&isPin(cur.m,p),on=SEL.has(i.uri);
  const n=h('div','it'+(on?' sel':'')+(isHid(i,cur.m,cur.path)?' hd':''),null,ico(i.dir?'folder':KICON[kindOf(i.name,i.mime)],i.dir?'fo':''),h('div','nm',i.name),
   (s.view==='details'?h('div','mt',null,h('span',null,i.dir?'Folder':fmt(i.size)),dspan(i),h('span',null,i.dir?'':(extOf(i.name)||'file').toUpperCase()+' · '+(KNAME[kindOf(i.name,i.mime)]||'File')),h('span',null,inLib()&&i.path&&i.path.length?i.path[i.path.length-1]:'')):h('div','mt',null,h('span',null,i.dir?'':fmt(i.size)),inLib()&&i.path&&i.path.length&&cur.cat!=='bin'?dspan(i,i.path[i.path.length-1]+' · '):dspan(i))));
  if(i.dir)n.firstChild.style.color=S.colors[k]||'var(--fcol)';
  if(pinned)n.append(ico('pin','pb'));
  if(selOn&&!inLib())n.append(h('span','ck'+(on?' on':''),null,ico('check')));
  n._ctx=(x,y)=>menu(x,y,itemMenu(i,p,k,pinned,a));
  tap(n,()=>{
   if(cur.cat==='bin'){const r=n.getBoundingClientRect();return n._ctx(r.left+24,r.bottom-8)}
   if(selOn&&!inLib())return toggle(i);
   i.dir?go(cur.m,p,[...cur.dirs,i.uri]):open(i,a)});
  L.append(n);try{thumbAttach(n,i)}catch{}if(s.compact&&i.dir&&i.uri&&SAF&&!inLib())dirCount(n,i)};
 /* big folders and libraries are drawn in batches of 120 so the web view never stalls on 700+ tiles */
 {let at=0;const more=h('div','more','Loading more…');
  const next=()=>{more.remove();a.slice(at,at+60).forEach(x=>{try{mk(x)}catch{}});at+=60;if(at<a.length){L.append(more);MIO.observe(more)}};
  if(window.MIO)MIO.disconnect();window.MIO=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){MIO.unobserve(more);next()}},{root:L,rootMargin:'600px'});next()}
 const d=a.filter(i=>i.dir).length;
 $('#stat').textContent=cur.cat==='bin'?plural(a.length,'item')+' in the recycle bin':cur.cat?`${a.length} in ${title()}`:FLAT?(SCANNING?'Looking…':`${a.length} ${(FILTERS.find(f=>f[0]===FK)||['','files'])[1].toLowerCase()} in ${title()}${cur.path.length?' › '+cur.path[cur.path.length-1]:''}`):`${d} folders, ${a.length-d} files`;
 $('#bv use').setAttribute('href','#i-'+({grid:'grid',list:'list',details:'doc'}[s.view]||'grid'));$('#bv').title='View and sort ('+VNAME[s.view]+')';crumbs();drawSel();drawPaste();drawBack()}

function drawSel(){
 const B=$('#sel'),on=selOn&&!cur.cat;B.classList.toggle('on',on);if(!on)return;B.replaceChildren();
 const n=SEL.size,need=f=>()=>n?f(selItems()):toast('Tap items to select them first.');
 const act=(ic,t,f,c)=>{const b=h('button','sb'+(c?' '+c:''),null,ico(ic),h('span',null,t));b.onclick=f;B.append(b)};
 act('x','Done',()=>setSel(false),'red');B.append(h('b','sn',n+' selected'));
 act('copy','Copy',need(x=>opClip('copy',x)),'grn');act('cut','Cut',need(x=>opClip('cut',x)),'grn');
 act('zip','ZIP',need(opZip));act('trash','Delete',need(opDelete),'red');act('shield','Hide',need(toggleHide));act('vault','Vault',need(vMove));
 if(NATIVE&&typeof shScanSel==='function')act('search','Scan',need(shScanSel));
 act('selall','All',selAll);act('share','Share',need(opShare));
 if(typeof p2Ready==='function'&&p2Ready()){act('down','To pane 2',need(x=>p2Send(x,false)),'grn');act('cut','Move to 2',need(x=>p2Send(x,true)),'grn')}
 if(n===1)act('edit','Rename',()=>opRename(selItems()[0]))}

function togglePin(m,p){const k=key(m,p),i=S.pins.findIndex(x=>key(x.m,x.path)===k);
 i<0?S.pins.push({m,path:p,name:p[p.length-1]}):S.pins.splice(i,1);save();draw();side()}

/* [2] SIDE PANEL */
function nv(icon,t,sub,on,color,edit){const n=h('div','nv'+(on?' on':''),null,ico(icon),h('div','tx',null,h('b',null,t),h('small',null,sub)));if(color)n.firstChild.style.color=color;
 if(edit){const b=h('button','ne',null,ico('edit'));b.title='Rename';b.setAttribute('aria-label','Rename '+t);b.onclick=e=>{e.stopPropagation();lp=false;edit()};n.append(b)}return n}
function side(){
 if(typeof fourRefresh==='function')fourRefresh();
 /* V0.19.0: one list, one place per item (arrange.js). Pinned folders live on Home (dash.js pinsHome). */
 if(typeof pinsHome==='function')pinsHome();
 drawPanel();drawBin()}
async function openSet(){document.body.classList.remove('nav');await readPerm();drawSettings();$('#set').classList.add('on')}
/* library names are labels only; the files stay where they are */
async function renameCat(id){
 const r=await dlg({title:'Rename '+CATS[id].name,msg:'This changes the name shown in Conduint only.',value:catName(id),ok:'Rename'});
 if(!r||!r.v)return;if(r.v===CATS[id].name)delete S.labels[id];else S.labels[id]=r.v;save();side();draw()}
/* rename from the side panel: a storage label, or a pinned folder on disk */
async function renameMount(m){
 const r=await dlg({title:'Rename storage',msg:'This changes the name shown in Conduint only.',value:m.name,ok:'Rename'});
 if(!r||!r.v||r.v===m.name)return;m.name=r.v;save();side();crumbs()}
async function renamePin(p){
 const mt=mount(p.m);if(!mt||mt.type!=='saf')return toast('Connect that storage first.');
 const r=await dlg({title:'Rename folder',value:p.name,ok:'Rename'});if(!r||r.v===p.name)return;
 const e=badName(r.v);if(e)return toast(e);
 const ok=await job('Renaming…',async()=>{const d=await resolveDirs(mt,p.path);return SAF.rename({uri:d[d.length-1],name:r.v})});
 if(ok){rewritePath(p.m,p.path,p.m,[...p.path.slice(0,-1),r.v]);toast('Renamed to '+r.v)}
 if(cur.m===p.m&&!cur.cat&&cur.path.length)return go(cur.m,[]);
 cur.m?refresh():side();side()}

/* [3] CONTEXT MENU: long-press on touch, right-click on desktop */
function menu(x,y,list){const M=$('#menu');M.replaceChildren();menu.x=x;menu.y=y;
 list.forEach(([l,f,kd,on])=>{if(l==='hr'){M.append(h('div','mhr'));return}
  /* V0.48.0: a group you can fold: ['Title',[[label,fn],...],'g']. Open/closed is remembered per title (S.settings.mg). */
  if(kd==='g'){const mg=S.settings.mg=S.settings.mg||{},g=h('div','mg'+(mg[l]===1?' shut':'')),hd=h('button','mi mgh',null,h('span',null,l),ico('up')),bd=h('div','mgb');
   hd.setAttribute('aria-expanded',mg[l]===1?'false':'true');
   f.forEach(([cl,cf])=>{const b=h('button','mi',cl);b.onclick=()=>{hideMenu();cf()};bd.append(b)});
   hd.onclick=ev=>{ev.stopPropagation();const s=g.classList.toggle('shut');mg[l]=s?1:0;hd.setAttribute('aria-expanded',s?'false':'true');save();
    M.style.top=Math.max(8,Math.min(parseFloat(M.style.top)||y,innerHeight-M.offsetHeight-8))+'px'};
   g.append(hd,bd);M.append(g);return}
  if(kd){const b=h('button','mi mk',null,h('span',null,l),h('i','mx'+(kd==='c'?' c':'')+(on?' on':'')));b.onclick=()=>{hideMenu();f()};M.append(b);return}
  if(l==='sw'){const r=h('div','sws');[...SW,''].forEach(c=>{const b=h('button','sw');b.style.background=c||'var(--fcol)';b.title=c||'Default colour';b.onclick=()=>{hideMenu();f(c)};r.append(b)});M.append(r)}
  else if(Array.isArray(f)){const b=h('button','mi',l+'  ›');b.onclick=()=>menu(x,y,[['‹  '+l,()=>menu(x,y,list)],...f]);M.append(b)}
  else{const b=h('button','mi'+(/^Delete/.test(l)?' danger':''),l);b.onclick=()=>{hideMenu();f()};M.append(b)}});
 M.classList.add('on');M.style.left=Math.max(8,Math.min(x,innerWidth-M.offsetWidth-8))+'px';M.style.top=Math.max(8,Math.min(y,innerHeight-M.offsetHeight-8))+'px'}
const hideMenu=()=>$('#menu').classList.remove('on');
let tm,sx,sy;
document.addEventListener('pointerdown',e=>{lp=false;if(!e.target.closest('#menu'))hideMenu();
 const t=e.target.closest('.it,.nv');if(!t||!t._ctx||e.pointerType==='mouse')return;sx=e.clientX;sy=e.clientY;
 tm=setTimeout(()=>{lp=true;navigator.vibrate&&navigator.vibrate(12);t._ctx(sx,sy)},450)});
document.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>10)clearTimeout(tm)});
['pointerup','pointercancel'].forEach(v=>document.addEventListener(v,()=>clearTimeout(tm)));
document.addEventListener('contextmenu',e=>{const t=e.target.closest('.it,.nv');if(t&&t._ctx){e.preventDefault();if(!lp)t._ctx(e.clientX,e.clientY)}});

/* [4] SETTINGS */
function apply(){const s=S.settings,r=document.documentElement.style;document.body.dataset.theme=s.theme;if(typeof fxApply==='function')fxApply();
 const gen=s.theme==='generic';r.setProperty('--acc',gen?'#1a73e8':s.acc);r.setProperty('--fcol',s.fcol||(gen?'#f9ab00':s.acc));r.setProperty('--tile',s.tile+'px');if(typeof p2Apply==='function')p2Apply();if(typeof widApply==='function')widApply()}
const set=(k,v)=>{S.settings[k]=v;save();apply();drawSettings();draw();side()};
function drawSettings(){
 const s=S.settings,B=$('#sbody');B.replaceChildren();
 const sec=t=>B.append(h('h3',null,t)),row=(l,...k)=>B.append(h('div','row',null,h('span',null,l),h('div','ctl',null,...k)));
 const chip=(t,on,f)=>{const b=h('button','chip'+(on?' on':''),t);b.onclick=f;return b};
 const opts=(k,o)=>Object.entries(o).map(([v,t])=>chip(t,s[k]===v,()=>set(k,v)));
 const swatches=(k,none)=>{const out=[];(none?['',...SW]:SW).forEach(c=>{const b=h('button','sw'+(s[k]===c?' on':''));b.style.background=c||'var(--acc)';b.title=c||'Follow accent';b.onclick=()=>set(k,c);out.push(b)});
  const i=document.createElement('input');i.type='color';i.value=s[k]||s.acc;i.onchange=()=>set(k,i.value);return [...out,i]};
 sec('Appearance');row('Theme',...opts('theme',THEMES));row('Accent colour',...swatches('acc'));
 row('Background effect',...opts('fx',{off:'Off',...FXN}));
 if(FXN[s.fx])row('Effect strength',...[[0,'Calm'],[1,'Normal'],[2,'Wild']].map(([v,t])=>chip(t,s.fxLevel===v,()=>set('fxLevel',v))));
 sec('Menu features');row('Compact in the View menu',chip((S.settings.feat||{}).compact?'On':'Off',(S.settings.feat||{}).compact,()=>set('feat',{...(S.settings.feat||{}),compact:!(S.settings.feat||{}).compact})));
 row('Dual pane in the View menu',chip((S.settings.feat||{}).dual?'On':'Off',(S.settings.feat||{}).dual,()=>set('feat',{...(S.settings.feat||{}),dual:!(S.settings.feat||{}).dual})));
 B.append(h('div','note','The menu keeps the few things you use. Turn a feature on here and it appears in the menu.'));
 sec('Layout');row('Left panel and Home (one place per item)',chip('Arrange',false,()=>{$('#set').classList.remove('on');arrOpen()}));
 if(typeof bkSettingsRows==='function')bkSettingsRows(sec,row,chip);/* V0.49.0 */
 sec('Folders');row('Default folder colour',...swatches('fcol',true));
 const v=h('small',null,s.tile+'px'),r=document.createElement('input');r.type='range';r.min=72;r.max=220;r.value=s.tile;
 sec('Browsing');row('View',...opts('view',{grid:'Grid (tiles + pictures)',list:'List (rows + thumbnail)',details:'Details (tiles + size, date, type)'}));row('Sort by',...SORTS.map(([v,t])=>chip(t,s.sort===v,()=>setSort(v))));
 row('Order',...opts('sortDir',{asc:'Ascending',desc:'Descending'}));
 row('Show hidden items',chip(s.hidden?'On':'Off',s.hidden,()=>set('hidden',!s.hidden)));
 row('Folders first',chip(s.first?'On':'Off',s.first,()=>set('first',!s.first)));
 row('Compact (smaller tiles and rows, hides the date)',chip(s.compact?'On':'Off',s.compact,()=>set('compact',!s.compact)));
 row('Dual pane (two folders, copy and move between them)',chip(s.dual?'On':'Off',s.dual,()=>set('dual',!s.dual)));
 row('Header widgets (storage ring, battery, RAM, weather)',chip(s.wid?'On':'Off',s.wid,()=>set('wid',!s.wid)));
 if(NATIVE)row('Wi-Fi name on Home',chip(s.ssidOn!==false?'On':'Off',s.ssidOn!==false,()=>{set('ssidOn',s.ssidOn===false);if(typeof wfHome==='function')wfHome(true)}));
 if(SAF&&SAF.thumb){row('Show previews (document first page, cover, photo, video)',chip(s.thumbs?'On':'Off',s.thumbs,()=>set('thumbs',!s.thumbs)));
  if(s.thumbs){row('Previews for cloud files (the cloud app downloads the file, 30 MB limit)',chip(s.thumbCloud?'On':'Off',s.thumbCloud,()=>set('thumbCloud',!s.thumbCloud)));
   row('Saved previews',chip('Clear',false,async()=>{await thumbClear();toast('Previews cleared.');draw()}))}}
 sec('App lock');
 {const lt=lockType();
  row('Lock Conduint with',chip('Off',lt==='off',lockOff),...(LOCK?[chip('Fingerprint',lt==='bio',lockBio)]:[]),chip('Pattern',lt==='pattern',lockPattern));
  if(lt==='bio')row('Pattern backup (if the fingerprint fails)',chip(hasPattern()?'Change':'Set',false,lockBackup),...(hasPattern()?[chip('Remove',false,lockRmBackup)]:[]));
  if(lt!=='off'){row('Lock after leaving the app',...[[30,'30 s'],[120,'2 min'],[600,'10 min'],[-1,'Only at start']].map(([v,t])=>chip(t,s.lockAfter===v,()=>set('lockAfter',v))));
  }
  if(NATIVE)row('Hide in recent apps and block screenshots (off = screenshots work)',chip(s.secure?'On':'Off',s.secure,()=>{set('secure',!s.secure);applySecure()}));
  B.append(h('div','note','The app lock uses fingerprint or pattern. The pattern is stored as a hash on this phone. Only the Vault has a 4-digit recovery PIN, as its backup key.'))}
 sec('Conduit Vault');row('Private files, AES-256 encrypted',chip('Open vault',false,()=>{$('#set').classList.remove('on');vcardOpen()}));
 row('Password manager, AES-256 encrypted',chip('Open Passwords',false,()=>{$('#set').classList.remove('on');pmOpen()}));
 B.append(h('div','note','Your pattern, fingerprint and 4-digit recovery PIN are the only keys. Reset all does not touch the vault, but if you uninstall the app the vault is gone.'));
sec('Shield');
 {const R=(typeof SHRULES!=='undefined'&&SHRULES)||null,inp=document.createElement('input');inp.type='url';inp.className='shurl';inp.placeholder='https://example.com/shield-rules.json';inp.value=s.shUrl||'';inp.autocapitalize='off';inp.spellcheck=false;inp.setAttribute('autocomplete','off');
  inp.onchange=()=>{S.settings.shUrl=inp.value.trim();save()};
  B.append(h('div','row shrowurl',null,h('span',null,'Rules link (https)'),inp));
  const ub=chip('Update rules',false,()=>{S.settings.shUrl=inp.value.trim();save();shDoUpdate(ub)});
  row('Download the newest rules',ub,chip('Use built-in',false,shReset));
  if(s.shLast)B.append(h('div','note',(s.shLast.ok?'Last result: ':'Last attempt failed: ')+s.shLast.msg+' ('+new Date(s.shLast.t).toLocaleString()+')'));
  B.append(h('div','note','Shield rules are a small JSON file. Tap Update rules to download the newest copy from your link; it is checked before it is saved, and an older version never replaces a newer one. Only use a link you trust. Your files are never uploaded.'))}
 if(NATIVE){row('Scan a file when you open it',chip(s.shOpen!==false?'On':'Off',s.shOpen!==false,()=>set('shOpen',s.shOpen===false)));
  B.append(h('div','note','Shield checks a file the moment you tap it. A dangerous one asks before it opens; anything else opens straight away. Files over 25 MB get a name check only.'));
  row('Notify when a Shield scan finishes',chip(s.shNoteScan!==false?'On':'Off',s.shNoteScan!==false,()=>set('shNoteScan',s.shNoteScan===false)));
  row('Notify when Shield stops or finds a dangerous file',chip(s.shNoteBlock!==false?'On':'Off',s.shNoteBlock!==false,()=>set('shNoteBlock',s.shNoteBlock===false)));
  B.append(h('div','note','Notifications also need Android to allow them for Conduint: Settings > Permissions below.'))}
  sec('Music player');B.append(h('div','note','Repeat, shuffle, speed, volume, sleep timer and the queue are in the player: open a song and use the Playing / Queue / Settings tabs.'));
 row('Look up missing lyrics and artwork online',chip(s.online?'On':'Off',s.online,()=>set('online',!s.online)));
 row('Save what is found next to the song (.lrc and .jpg)',chip(s.autoApply?'On':'Off',s.autoApply,()=>set('autoApply',!s.autoApply)));
 B.append(h('div','note','Songs show the tags, artwork and lyrics stored in the file first, then a .lrc file next to the song. Only when synced lyrics are missing does Conduint ask lrclib.net, and iTunes for artwork.'));
 if(NATIVE){sec('Permissions');row('Ask for permissions when the app opens',chip(s.autoPerm?'On':'Off',s.autoPerm,()=>set('autoPerm',!s.autoPerm)));
  {const NM={media:'Photos, videos and music',notifications:'Notifications',allFiles:'All files access',battery:'Battery optimiser'},ms=missing();
   B.append(h('div','note',ms.length?'Still off: '+ms.map(w=>NM[w]).join(', ')+'.':'Everything Conduint needs is allowed.'))}
  row('Storage, music, files, notifications',chip('Manage',false,()=>{$('#set').classList.remove('on');openPerm()}));
  row('Cleaning tools',chip('Open Tools',false,()=>{$('#set').classList.remove('on');openTools()}));sec('Files');row('Recycle bin (off = delete asks, then removes for good)',chip(s.bin?'On':'Off',s.bin,()=>set('bin',!s.bin)));
  row('Items in recycle bin: '+S.trash.length,chip('Empty bin',false,()=>{$('#set').classList.remove('on');opEmpty()}))}
 if(NATIVE){sec('Power');
  row('Wake lock (keeps the processor running)',chip(s.wake?'On':'Off',s.wake,()=>{set('wake',!s.wake);applyPower()}));
  row('Keep screen on while open',chip(s.screen?'On':'Off',s.screen,()=>{set('screen',!s.screen);applyPower()}));
  row('Battery optimiser',chip(PERM.battery?'Ignored':'Ignore',!!PERM.battery,()=>askPerm('battery')));
  row('Keep running in the background (needed for the folder watcher)',chip(s.keep?'On':'Off',s.keep,async()=>{set('keep',!s.keep);await wtKeepSync();if(S.settings.keep)wtKeepAsk()}));
  row('Check watched folders every',chip((s.watchMin||5)+' min',false,async()=>{const v=WT.min;set('watchMin',v[(v.indexOf(s.watchMin||5)+1)%v.length]);await wtKeepSync()}));
  row('Folder watcher: asks before uploading changes',chip('Open',false,()=>{$('#set').classList.remove('on');wtOpen()}));
  B.append(h('div','note','Wake lock drains the battery faster. Ignoring the battery optimiser stops Android from freezing Conduint in the background.'))}
 sec('Data');
 const cp=chip('Copy config',false,()=>navigator.clipboard.writeText(JSON.stringify(S,null,1)).then(()=>toast('Config copied.'),()=>toast('Clipboard is blocked here.')));
 const rb=chip('Reset all',false,()=>{if(rb.dataset.c){localStorage.removeItem(K);location.reload()}else{rb.dataset.c=1;rb.textContent='Tap again to confirm';setTimeout(()=>{delete rb.dataset.c;rb.textContent='Reset all'},3000)}});
 rb.classList.add('danger');row('Config and pins',cp,rb);
 B.append(h('div','note','Android: '+(BRIDGE?'yes':'no')+' · file plugin: '+(SAF?'ok':'missing')+' · tools plugin: '+(TOOLS?'ok':'missing')));
 B.append(h('div','note','STRATEGY OVER IMPULSE'));
 B.append(h('div','note','Conduint Files '+VER+'. Pins, colours and storages are saved in this app. Reset forgets your storages and settings but does not delete any of your files.'))}

/* hide the app in the recent-apps screen and block screenshots while the lock is on */
/* V0.50.0: screenshots work everywhere by default. Only the switch in Settings (Hide in recent apps and block screenshots) turns the block on, for the whole app including the Password Manager. */
function applySecure(){if(LOCK&&LOCK.secure)LOCK.secure({on:!!S.settings.secure}).catch(()=>{})}
function applyPower(){if(NATIVE&&TOOLS&&TOOLS.wakeLock)TOOLS.wakeLock({cpu:!!S.settings.wake,screen:!!S.settings.screen}).catch(()=>{})}

/* [5] BACK BUTTON: the bottom Back button, the Up arrow and Android back all use these.
   Each press closes the topmost thing first, then walks up one folder. */
function navBack(){
 if(cur.m&&cur.path.length){go(cur.m,cur.path.slice(0,-1),cur.dirs.slice(0,-1));return true}
 if(cur.cat||cur.m){goHome();return true}
 return false}
function drawBack(){
 const b=$('#bbk'),can=!!(cur.m&&cur.path.length)||!!cur.cat;
 const to=cur.m&&cur.path.length?(cur.path.length>1?cur.path[cur.path.length-2]:title()):cur.cat?((mount(S.mounts[0]&&S.mounts[0].id)||{}).name||'Home'):'';
 b.disabled=!can&&!cur.m&&!cur.cat;$('#bbl').textContent=can?'Back to '+to:cur.m?'Back to Home':'Back';if(typeof dashShow==='function')dashShow()}
function back(){
 if(LK.on)return 0;
 const on=s=>{const e=$(s);return !!e&&e.classList.contains('on')};/* #arr and #calsh are built on first use, so they may not exist yet */
 if(on('#dlg')){dlg.close&&dlg.close();return 1}
 if(on('#busy'))return 1;
 if(on('#menu')){hideMenu();return 1}
 if(typeof brBack==='function'&&brBack())return 1;
 if(typeof ED!=='undefined'&&ED.on){edClose();return 1}
 if(RD.on){rdClose();return 1}
 if(typeof glLayerBack==='function'&&glLayerBack())return 1;
 if(typeof GC!=='undefined'&&GC.on){gcBack();return 1}
 if(typeof XF!=='undefined'&&XF.on){xfBack();return 1}
 if(typeof IV!=='undefined'&&IV.on){ivClose();return 1}
 if(typeof CN!=='undefined'&&CN.open){cnClose();return 1}
 if(typeof GL!=='undefined'&&GL.open){glBack();return 1}
 if(typeof PM!=='undefined'&&PM.open&&pmBackKey())return 1;
 if(VOPEN){vClose();return 1}
 if(typeof AP!=='undefined'&&AP.open){apClose();return 1}
 if(on('#calsh')){closeCal();return 1}
 if(on('#about')){$('#about').classList.remove('on');return 1}
 if(on('#arr')){$('#arr').classList.remove('on');return 1}
 if(on('#perm')){$('#px').click();return 1}
 if(on('#tools')){toolsBack();return 1}
 if(on('#set')){$('#set').classList.remove('on');return 1}
 if(document.body.classList.contains('nav')){document.body.classList.remove('nav');return 1}
 if(on('#pl')&&!pl.classList.contains('dock')){plBack();return 1}
 if(selOn){setSel(false);return 1}
 if(document.body.classList.contains('srch')){$('#bs').click();return 1}
 if(navBack())return 1;
 return 0}
/* V0.34.1: the Android app asks this on every Back press (MainActivity). 1 = something was closed, 0 = nothing left, so the app goes to the background. */
window.__cndBack=()=>{try{return back()?1:0}catch(e){return 0}};
let leaving=false;
history.replaceState(0,'');history.pushState(1,'');
addEventListener('popstate',()=>{
 if(back()){history.pushState(1,'');return}
 /* V0.29.2: nothing left to go back to: send the app to the background (same as Home) so it is still there, as left, when you return */
 if(typeof TOOLS!=='undefined'&&TOOLS&&TOOLS.toBack){history.pushState(1,'');TOOLS.toBack().catch(()=>{});return}
 if(leaving)return;leaving=true;toast('Press back again to exit.');
 setTimeout(()=>{leaving=false;history.pushState(1,'')},2000)});

/* [6] BOOT */
$('#sx').onclick=()=>$('#set').classList.remove('on');
$('#set').onclick=e=>{if(e.target.id==='set')$('#set').classList.remove('on')};
$('#burger').onclick=()=>document.body.classList.add('nav');$('#scrim').onclick=()=>document.body.classList.remove('nav');
$('#up').onclick=()=>navBack()||toast('Already at the top.');
$('#bbk').onclick=()=>back()||toast('You are at the top.');
$('#parr').onclick=arrOpen;
/* tap Bojack's paw: Generic (white, blue, orange folders) and back to your own theme */
{const pw=document.querySelector('.brand .paw');if(pw){pw.setAttribute('role','button');pw.onclick=()=>{const t=S.settings.theme;if(t==='generic')set('theme',S.settings.prevTheme||'noir');else{S.settings.prevTheme=t;set('theme','generic')}toast(S.settings.theme==='generic'?'Generic theme. Tap the paw to go back.':'Your theme is back.')}}}
$('#pick').onchange=e=>{PICKED=[...e.target.files];e.target.value='';side();if(PICKED.length)go('picked')};
/* V0.19.1: ONE panel in the top bar for View and Sort (radio rows, then Ascending and Folders first as tick boxes). Nothing about view or sort is in the three-dot menu. */
function pickSort(v){const st=S.settings;if(st.sort!==v){st.sort=v;st.sortDir=(v==='size'||v==='date')?'desc':'asc'}save();drawSettings();draw()}
$('#bv').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),st=S.settings,ft=st.feat||{};
 const L=[...VIEWS.map(v=>[VNAME[v],()=>set('view',v),'r',st.view===v]),['hr'],
  ...['name','type','size','date','kind'].map(v=>SORTS.find(x=>x[0]===v)).map(([v,l])=>[l==='Date modified'?'Last modified':l,()=>pickSort(v),'r',st.sort===v]),['hr'],
  ['Ascending',()=>{st.sortDir=st.sortDir==='desc'?'asc':'desc';save();drawSettings();draw()},'c',st.sortDir!=='desc'],
  ['Folders first',()=>set('first',!st.first),'c',!!st.first]];
 if(ft.compact||st.compact||ft.dual||st.dual)L.push(['hr']);
 if(ft.compact||st.compact)L.push(['Compact',()=>set('compact',!st.compact),'c',!!st.compact]);
 if(ft.dual||st.dual)L.push(['Dual pane',()=>set('dual',!st.dual),'c',!!st.dual]);
 menu(r.right-230,r.bottom,L)};
$('#bm').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),L=[];
 if(isHome()){/* V0.50.0: Add folder to Home adds folders only; options sit in groups that fold */
  menu(r.right-230,r.bottom,[
   ['Home',[['Add folder to Home…',addFolder],['Arrange panel and Home…',arrOpen],['Wallpaper…',wallMenu],['Refresh dashboard',()=>dashRefresh(true)]],'g'],
   ['Sync',[['Sync music folder…',syncMenu],['Sync Storage…',syncStorage],['Folder watcher…',wtOpen]],'g'],
   ['Utilities',[['Storage analyser',openAnalyzer],['Optimise Conduit',optimiseConduit]],'g']]);return}
 if(cur.cat==='bin')L.push(['Restore all',()=>opRestore(S.trash.slice())],['Delete forever: empty bin',opEmpty]);
 const st=S.settings;
 if(cur.cat!=='bin'&&writable())L.push(['New',[['New folder',()=>opNew()],['New text file',()=>opNew(1)]]],[LBL_UPLOAD,uploadHere],['Select',[['Select items',()=>setSel(true)],['Select all',selAll]]]);
 {const cm=mount(cur.m);if(cm&&cm.type==='docs'&&!cur.cat)L.push(['Add files…',connectDocs])}
 L.push(['Refresh',()=>refresh()],['Show hidden items',()=>set('hidden',!st.hidden),'c',!!st.hidden]);
 menu(r.right-220,r.bottom,L)};
$('#bs').onclick=()=>{document.body.classList.toggle('srch');if(document.body.classList.contains('srch'))$('#q').focus();else{q='';$('#q').value='';draw()}};
$('#q').oninput=e=>{q=e.target.value;draw()};
$('#pclr').onclick=()=>{CLIP=null;drawPaste()};$('#ppaste').onclick=opPaste;
apply();applyPower();applySecure();side();draw();/* V0.47.0: the app always opens on Home with the left panel closed (it used to open the first storage with the panel forced open, which showed as a glitch panel) */
if(NATIVE_MSG)setTimeout(()=>toast(NATIVE_MSG),400);
/* the moment the app opens (after the lock, if one is on): ask for whatever is still missing, then find the library */
async function autoPerm(){
 if(!NATIVE)return;await readPerm();
 const first=!S.settings.permAsked;S.settings.permAsked=true;save();
 if(S.settings.autoPerm){
  /* the battery question is only asked on the very first run so it does not nag */
  const todo=missing().filter(w=>w!=='battery'||first);
  if(todo.length){openPerm();chain=true;tried=new Set(missing().filter(w=>!todo.includes(w)));stepChain()}}
 countLib()}
(LK.start||Promise.resolve()).then(()=>setTimeout(autoPerm,250));

/* ---------- PULL DOWN TO REFRESH (V0.50.0) ----------
   One smooth horizontal beam wave across the top. It fades in as you pull, flows sideways at one steady speed while it refreshes, then fades out.
   Same size and speed all the way: nothing spins, pulses, grows or changes thickness. The list does not move.
   ptrAttach() is used by the file list here and by Home (dash.js). */
const ptrAttach=(()=>{
 const NS='http://www.w3.org/2000/svg',P=document.createElementNS(NS,'svg'),H=44;/* V0.51.0: taller, so the wave looks full */P.id='ptr';P.setAttribute('aria-hidden','true');P.setAttribute('preserveAspectRatio','none');
 const df=document.createElementNS(NS,'defs'),gr=document.createElementNS(NS,'linearGradient');gr.setAttribute('id','ptrg');gr.setAttribute('gradientUnits','userSpaceOnUse');gr.setAttribute('y1','0');gr.setAttribute('y2','0');gr.setAttribute('spreadMethod','repeat');/* V0.51.0: the bright beam repeats, so there is never a gap in it */
 [[0,.35],[.5,1],[1,.35]].forEach(([o,a])=>{const st=document.createElementNS(NS,'stop');st.setAttribute('offset',o);st.setAttribute('stop-color','currentColor');st.setAttribute('stop-opacity',a);gr.append(st)});df.append(gr);
 /* V0.51.0: a soft glowing sheet under the wave and a second, slower wave behind it */
 {const fg=document.createElementNS(NS,'linearGradient');fg.setAttribute('id','ptrf');fg.setAttribute('x1','0');fg.setAttribute('y1','0');fg.setAttribute('x2','0');fg.setAttribute('y2','1');
  [[0,.42],[1,0]].forEach(([o,a])=>{const st=document.createElementNS(NS,'stop');st.setAttribute('offset',o);st.setAttribute('stop-color','currentColor');st.setAttribute('stop-opacity',a);fg.append(st)});df.append(fg)}
 const base=document.createElementNS(NS,'path'),beam=document.createElementNS(NS,'path'),fill=document.createElementNS(NS,'path'),back=document.createElementNS(NS,'path');base.setAttribute('class','w2');beam.setAttribute('class','w1');fill.setAttribute('class','w0');back.setAttribute('class','w3');P.append(df,fill,back,base,beam);document.body.append(P);
 let ph=0,raf=0,vis=false,t0=0;const A=10,SPD=.045;/* fixed: one height, one speed */
 const wv=(W,o,k)=>{k=k||1;let d='M0 '+H/2;for(let x=0;x<=W;x+=6)d+=' L'+x+' '+(H/2+Math.sin(x/W*Math.PI*3*k+o)*A*k*(.55+.45*Math.sin(Math.PI*x/W))).toFixed(1);return d};
 const draw=()=>{const W=innerWidth||360;P.setAttribute('viewBox','0 0 '+W+' '+H);
  const d=wv(W,ph);base.setAttribute('d',d);beam.setAttribute('d',d);fill.setAttribute('d',d+' L'+W+' '+H+' L0 '+H+' Z');back.setAttribute('d',wv(W,-ph*.7+1.6,.8));
  /* the bright beam glides left to right along the wave, wrapping smoothly */
  const bw=W*.9,x=(ph*60)%bw;gr.setAttribute('x1',x);gr.setAttribute('x2',x+bw)};
 const loop=()=>{ph+=SPD;draw();if(vis)raf=requestAnimationFrame(loop)};
 const show=()=>{if(vis)return;vis=true;P.style.transition='opacity .2s';P.style.opacity=1;raf=requestAnimationFrame(loop)};
 const hide=()=>{P.style.transition='opacity .35s';P.style.opacity=0;setTimeout(()=>{if(P.style.opacity==='0'){vis=false;cancelAnimationFrame(raf)}},380)};
 return(el,run,opt)=>{opt=opt||{};
  let y0=0,x0=0,dy=0,on=false,busy=false;const GO=70;
  const place=()=>{P.style.top=(el.getBoundingClientRect().top+2)+'px'};/* pinned to the top of the list, it never follows the finger */
  el.addEventListener('touchstart',e=>{on=false;dy=0;if(busy||e.touches.length!==1||el.scrollTop>0||(opt.blocked&&opt.blocked()))return;y0=e.touches[0].clientY;x0=e.touches[0].clientX;on=true},{passive:true});
  el.addEventListener('touchmove',e=>{if(!on)return;
   if(e.touches.length!==1||el.scrollTop>0){on=false;hide();return}
   const d=e.touches[0].clientY-y0;if(d<=0){dy=0;hide();return}
   if(Math.abs(e.touches[0].clientX-x0)>d){on=false;hide();return}
   dy=d;if(opt.moved)opt.moved();if(e.cancelable)e.preventDefault();place();show()},{passive:false});
  const end=async()=>{if(!on)return;on=false;
   if(dy>=GO&&!busy){busy=true;if(opt.start)opt.start();place();show();
    try{await run()}catch{}
    busy=false}
   dy=0;hide()};
  el.addEventListener('touchend',end);el.addEventListener('touchcancel',()=>{on=false;dy=0;hide()})}})();
{const L=$('#list');
 ptrAttach(L,async()=>{
  /* V0.19.0: pull down reveals hidden files, pull down again hides them (only when this view has some) */
  let hm='';{const has=items.some(i=>i.name.startsWith('.')||isHid(i,cur.m,cur.path));if(has||S.settings.hidden){S.settings.hidden=!S.settings.hidden;save();hm=S.settings.hidden?'Hidden files shown. Pull down again to hide.':'Hidden files hidden.'}}
  const job=(async()=>{try{await refresh()}catch{}})();
  try{await Promise.race([job,new Promise(r=>setTimeout(r,1500))])}catch{}
  toast(hm||'Refreshed');
  if(typeof countLib==='function')setTimeout(()=>countLib().catch(()=>{}),600)},
  {blocked:()=>selOn,moved:()=>clearTimeout(tm),start:()=>{lp=false}})}

/* dates such as '5 minutes ago' keep counting while a list stays open */
setInterval(()=>{if(document.hidden)return;document.querySelectorAll('#list .dt').forEach(e=>{const t=+e.dataset.t;if(!t)return;
 e.textContent=(e.dataset.p||'')+dtx(t);e.classList.toggle('new',Date.now()-(t<1e11?t*1000:t)<864e5)})},30000);


/* V0.47.0: drawer animation stays off until the first paint and during rotation, so the left panel never flashes across the screen. */
{const rdy=()=>document.body.classList.add('rdy');
 requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(rdy,400)));
 let rt;addEventListener('resize',()=>{document.body.classList.remove('rdy');clearTimeout(rt);rt=setTimeout(rdy,450)});
 /* back from the background after 5 minutes or more: land on Home */
 let hid=0;document.addEventListener('visibilitychange',()=>{if(document.hidden){hid=Date.now();return}
  /* V0.50.0: no more jump to Home after 5 minutes away: you come back to exactly where you left (resume.js) */hid=0})}
