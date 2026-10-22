/* pane2.js: dual pane. A second, simple folder view under the main one. Pick any storage, walk folders, tick items and
   copy or move them up into the main pane's folder, or send the main pane's selection down into this one.
   Toggle in the three-dot menu or Settings. Loaded before ui.js. */
const P2={m:null,path:[],dirs:[],items:[],sel:new Set(),err:null};
const p2On=()=>!!S.settings.dual&&!!NATIVE;
const p2Dir=()=>P2.dirs[P2.dirs.length-1];
const p2Ready=()=>p2On()&&!!P2.m&&!!p2Dir();
function p2Apply(){
 const on=p2On();document.body.classList.toggle('dual',on);
 if(on&&!P2.m){const m=S.mounts.find(x=>x.type==='saf');if(m)p2Go(m.id,[],[m.root]);else{toast('Add a storage first, then turn on dual pane.');S.settings.dual=false;save();document.body.classList.remove('dual')}}
 if(on&&P2.m)p2Draw()}
async function p2Go(m,path=[],dirs){
 const mt=mount(m);if(!mt||mt.type!=='saf')return toast('Dual pane works on Android folders.');
 P2.m=m;P2.sel.clear();
 try{P2.dirs=dirs||await resolveDirs(mt,path);P2.path=path;P2.items=(await SAF.list({uri:p2Dir()})).items.filter(i=>i.name!==TRASH);P2.err=null}
 catch(e){P2.err=e.message;P2.items=[];P2.path=[];P2.dirs=[mt.root]}
 p2Draw()}
const p2Refresh=()=>{if(p2On()&&P2.m)p2Go(P2.m,P2.path,P2.dirs)};
function p2Draw(){
 const L=$('#p2l'),mt=mount(P2.m);if(!L)return;L.replaceChildren();
 const c=$('#p2c');c.replaceChildren();[(mt||{}).name||'Pane 2',...P2.path].forEach((n,i)=>{if(i)c.append(h('span','sep','›'));const b=h('button','crumb',n);b.onclick=()=>p2Go(P2.m,P2.path.slice(0,i),P2.dirs.slice(0,i+1));c.append(b)});c.scrollLeft=c.scrollWidth;
 $('#p2loc').textContent=(mt||{}).name||'Pick storage';
 const n=P2.sel.size;$('#p2cp').textContent=n?'Copy up ('+n+')':'Copy up';$('#p2mv').textContent=n?'Move up ('+n+')':'Move up';
 if(P2.err)L.append(h('div','empty',P2.err));
 else if(!P2.items.length)L.append(h('div','empty','Nothing here.'));
 const s=S.settings,dir=s.sortDir==='desc'?-1:1,nm=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true});
 [...P2.items].filter(i=>s.hidden||(!i.name.startsWith('.')&&!isHid(i,P2.m,P2.path))).sort((x,y)=>{if(x.dir!==y.dir)return x.dir?-1:1;
  const c=s.sort==='size'?x.size-y.size:s.sort==='date'?x.mtime-y.mtime:s.sort==='type'?(extOf(x.name).localeCompare(extOf(y.name))||nm(x,y)):s.sort==='kind'?(KORD(x)-KORD(y)||nm(x,y)):nm(x,y);return c?c*dir:nm(x,y)})
  .forEach(i=>{const on=P2.sel.has(i.uri);
   const el=h('div','it'+(on?' sel':''),null,ico(i.dir?'folder':KICON[kindOf(i.name,i.mime)],i.dir?'fo':''),h('div','nm',i.name),h('div','mt',null,h('span',null,i.dir?'':fmt(i.size)),h('span',null,dt(i.mtime))));
   if(i.dir)el.firstChild.style.color='var(--fcol)';
   el._ctx=()=>{P2.sel.has(i.uri)?P2.sel.delete(i.uri):P2.sel.add(i.uri);p2Draw()};
   el.onclick=()=>{if(lp){lp=false;return}
    if(P2.sel.size)return el._ctx();
    if(i.dir)return p2Go(P2.m,[...P2.path,i.name],[...P2.dirs,i.uri]);
    open(i,P2.items.filter(x=>!x.dir))};
   L.append(el);thumbAttach(el,i);if(s.compact&&i.dir&&i.uri)dirCount(el,i)})}
$('#p2up').onclick=()=>{if(P2.path.length)p2Go(P2.m,P2.path.slice(0,-1),P2.dirs.slice(0,-1));else toast('Top of this storage.')};
$('#p2loc').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();
 menu(r.left,r.top-8-S.mounts.length*44,S.mounts.filter(m=>m.type==='saf').map(m=>[m.name,()=>p2Go(m.id,[],[m.root])]))};
const p2Items=()=>P2.items.filter(i=>P2.sel.has(i.uri));
/* up: from this pane into the main pane's open folder */
async function p2Up(move){
 const its=p2Items();if(!its.length)return toast('Long-press items in this pane to select them first.');
 if(!writable())return toast('Open a folder in the top pane first.');
 const dst=curDir(),src=p2Dir();if(dst===src)return toast('Both panes show the same folder.');
 const ok=await job(move?'Moving…':'Copying…',()=>move?SAF.move({items:its.map(i=>({uri:i.uri,parent:src})),parent:dst}):SAF.copy({items:its.map(i=>({uri:i.uri})),parent:dst}));
 if(ok){P2.sel.clear();toast((move?'Moved ':'Copied ')+plural(its.length,'item')+' up.')}refresh()}
/* down: the main pane's selection goes into this pane's folder */
async function p2Send(its,move){
 if(!p2Ready())return;const dst=p2Dir();
 if(move&&its.every(x=>(x.parent||curDir())===dst))return toast('Those items are already in pane 2.');
 const ok=await job(move?'Moving…':'Copying…',()=>move?SAF.move({items:its.map(i=>({uri:i.uri,parent:i.parent||curDir()})),parent:dst}):SAF.copy({items:its.map(i=>({uri:i.uri})),parent:dst}));
 if(ok){setSel(false);toast((move?'Moved ':'Copied ')+plural(its.length,'item')+' to pane 2.')}refresh()}
$('#p2cp').onclick=()=>p2Up(false);$('#p2mv').onclick=()=>p2Up(true);
