/* V0.50.3: Internal storage and Downloads can also be added to the left panel (HOMEFIX, panelToggle). */
/* arrange.js (V0.19.0): ONE place per item. Every storage, library, tool and folder lives in the left panel, on Home, or nowhere (hidden).
   Never two places at once, so nothing is repeated. The panel holds PANEL_MAX items and never scrolls; the Recycle bin is fixed under it.
   Saved in S.lay = {v, panel:[ids], home:[ids], seen:[ids]}. Loaded before ui.js; dash.js draws Home from the same list. */
/* V0.50.0: the left panel holds FOLDERS only (storages and folders you connected), 14 at most. Tools live in Utilities and Tools; the Browser has its own screen.
   Home holds folders too (Add to Home), never shortcuts or Utilities. */
const PANEL_MAX=14;
/* V0.50.3: Internal Storage and Downloads are always tiles on Home. They can ALSO be added to the left panel (Arrange > Panel, or long-press the tile > Add to left panel). Never placed on Home through the layout list. */
const HOMEFIX=['slot:internal','slot:downloads'];
/* V0.52.0: Utilities can ALSO sit in the left panel (Arrange > Panel, or the + picker). It never goes on Home, and the bottom shortcut stays. Off by default. */
const PANELONLY=['util:tools'];
/* V0.43.8: the five shortcuts under the left panel are no longer fixed. Each can be shown, hidden and reordered (long-press one, or Arrange > Bottom shortcuts).
   Saved in S.lay.foot (ordered ids). Settings keeps one way in: it cannot leave the bottom unless the left panel or Home still has it. */
const FOOT=[
 {id:'f:vault',ic:'vault',eid:'navvault',name:()=>S.labels.vault||'Conduit Vault',sub:()=>'AES-256 encrypted',open:()=>{if(typeof vcardOpen==='function')vcardOpen()}},
 {id:'f:contacts',ic:'phone',eid:'navcontacts',name:()=>'Contacts',sub:()=>'Phone contacts',open:()=>{if(typeof cndContactsOpen==='function')cndContactsOpen()}},
 {id:'f:util',ic:'broom',eid:'navutil',name:()=>'Utilities',sub:()=>'Clean, optimize, find duplicates',open:()=>{if(typeof openTools==='function')openTools()}},
 {id:'f:set',ic:'tune',eid:'navset',name:()=>'Settings',sub:()=>'Theme, folders, permissions',open:()=>{if(typeof openSet==='function')openSet()}},
 {id:'f:bin',ic:'trash',eid:'navbin',name:()=>'Recycle bin',sub:()=>plural(S.trash.length,'item'),open:()=>goCat('bin'),on:()=>cur.cat==='bin'}];
/* V0.47.0: the five bottom shortcuts are permanent: fixed order, no hide, move or arrange. Only the whole block folds (S.lay.footc). */
const footHas=()=>true;
const isFM=m=>homeM().includes(m)&&!S.mounts.some(x=>x.id===m.id);

/* every item that can be placed */
function catalog(){
 const L=[];
 L.push({id:'util:tools',k:'util'});
 SLOTS.forEach(s=>L.push({id:'slot:'+s.id,k:'slot',s}));/* V0.50.3: Internal Storage and Downloads are in the list again, off by default (they stay fixed Home tiles) so they can be added to the left panel */
 const seen=new Set();
 mounts().concat(homeM()).forEach(m=>{if(SLOTS.some(s=>s.id===m.id)||seen.has(m.id))return;seen.add(m.id);L.push({id:'m:'+m.id,k:'mount',m,fm:isFM(m)})});
 return L}

/* name, subtitle, icon and what a tap does, for any item */
function meta(it){
 if(it.k==='slot'){const mt=mount(it.s.id);return{name:mt?mt.name:it.s.name,sub:mt?(mt.sub||'Open'):'Tap to connect',ic:mt?mt.ic:it.s.ic,open:()=>go(it.s.id),on:()=>!cur.cat&&cur.m===it.s.id&&!cur.path.length,mt}}
 if(it.k==='util')return{name:'Utilities',sub:'Clean, optimize, find duplicates',ic:'broom',open:()=>{if(typeof openTools==='function')openTools()},on:()=>false};
 if(it.k==='cat'){const c=CATS[it.c],cn=LIBC[c.kind];return{name:catName(it.c),sub:cn==null?'Auto-detected':plural(cn,'file')+(LIBC.capped?'+':''),ic:c.ic,open:()=>goCat(it.c),on:()=>cur.cat===it.c}}
 if(it.k==='notes')return{name:'Notepad',sub:(typeof npCount==='function'?npCount():'Notes, checklists')+'',ic:'edit',open:async()=>{await openTools();tNotes()},on:()=>false};
 if(it.k==='zip')return{name:'Zipliner',sub:'Label, zip and lock old data',ic:'lock',open:async()=>{await openTools();tZipliner()},on:()=>false};
 if(it.k==='auth')return{name:'Authenticator',sub:'2-step codes, encrypted here',ic:'shield',open:async()=>{await openTools();tAuth()},on:()=>false};
 if(it.k==='shield')return{name:'Shield',sub:(typeof shOn==='function'?(shOn()?'ON':'OFF')+' · ':'')+'Scan files, see what was blocked',ic:'shield',open:async()=>{await openTools();tShield()},on:()=>false};
 if(it.k==='vpn')return{name:'VPN',sub:(typeof VP!=='undefined'&&VP.upKnown!=null?(VP.upKnown?'ON':'OFF')+' · ':'')+'WireGuard, auto-rotating servers',ic:'globe',open:async()=>{await openTools();tVpn()},on:()=>false};
 if(it.k==='opt')return{name:'Optimiser',sub:'Free memory, clear cache',ic:'bolt',open:()=>optimiseConduit(),on:()=>false};
 if(it.k==='ana')return{name:'Storage analyser',sub:'What is eating your space',ic:'sd',open:()=>openAnalyzer(),on:()=>false};
 if(it.k==='browser')return{name:'Browser',sub:'Web, tabs, bookmarks',ic:'globe',open:()=>brOpen(),on:()=>typeof BR!=='undefined'&&!!BR.open};
 if(it.k==='apps')return{name:'Apps',sub:'Your installed apps',ic:'grid',open:()=>apOpen(),on:()=>AP.open};
 if(it.k==='pm')return{name:'Password Manager',sub:'Conduint Password Manager, AES-256',ic:'key',open:()=>pmOpen(),on:()=>typeof PM!=='undefined'&&!!PM.open};
 if(it.k==='vault')return{name:S.labels.vault||'Conduit Vault',sub:'AES-256 encrypted',ic:'vault',open:()=>vcardOpen(),on:()=>false};
 const m=it.m;return{name:m.name,sub:m.email||m.sub||'',logo:m.logo||'',ic:m.ic||'folder',open:()=>go(m.id),on:()=>!cur.cat&&cur.m===m.id&&!cur.path.length,mt:m}}

/* keep S.lay valid: drop what no longer exists, remove repeats, place new folders (panel up to 14, Home for folders added to Home), never more than 14 in the panel */
function layNorm(){
 const cat=catalog(),ids=new Set(cat.map(x=>x.id));let y=S.lay;
 if(!y||!y.v){
  const mn=cat.filter(x=>!x.fm&&!HOMEFIX.includes(x.id)&&!PANELONLY.includes(x.id)).map(x=>x.id),fm=cat.filter(x=>x.fm).map(x=>x.id);
  y=S.lay={v:2,panel:mn.slice(0,PANEL_MAX),home:fm,seen:[...ids]}}
 const u=new Set(),keep=a=>a.filter(i=>ids.has(i)&&!u.has(i)&&u.add(i));
 y.panel=keep(y.panel||[]);y.home=keep(y.home||[]).filter(i=>!HOMEFIX.includes(i)&&!PANELONLY.includes(i));/* V0.50.3: the two fixed tiles are never in the Home list */
 y.foot=FOOT.map(f=>f.id);/* permanent, fixed order */
 /* V0.50.0: folders that were added to Home but got parked in the left panel go back to Home, once */
 if(y.v<2){const fmIds=new Set(cat.filter(x=>x.fm).map(x=>x.id));y.home.push(...y.panel.filter(i=>fmIds.has(i)));y.panel=y.panel.filter(i=>!fmIds.has(i));y.v=2}
 const seen=new Set(y.seen||[]);
 cat.filter(x=>!seen.has(x.id)).forEach(x=>{if(x.id!=='m:picked')seen.add(x.id);
  if(HOMEFIX.includes(x.id)||PANELONLY.includes(x.id))return;/* V0.50.3: off until you add them to the panel */
  if(u.has(x.id))return;
  u.add(x.id);
  if(x.fm)y.home.push(x.id);else if(y.panel.length<PANEL_MAX)y.panel.push(x.id)});
 y.seen=[...seen];
 if(y.panel.length>PANEL_MAX)y.panel.length=PANEL_MAX;/* the extra ones stay connected and wait under Hidden in Arrange */
 return y}

function place(id,where){
 const y=layNorm();
 if(where==='home'&&HOMEFIX.includes(id)){toast('Internal storage and Downloads are always on Home. Use Panel to also show them in the left panel.');return false}
 if(where==='home'&&PANELONLY.includes(id)){toast('Utilities lives in the left panel. Use Panel to place it there.');return false}
 if(where==='panel'&&!y.panel.includes(id)&&y.panel.length>=PANEL_MAX){toast('The left panel holds '+PANEL_MAX+'. Move one out first.');return false}
 y.panel=y.panel.filter(x=>x!==id);y.home=y.home.filter(x=>x!==id);
 if(where==='panel')y.panel.push(id);else if(where==='home')y.home.push(id);
 save();layRefresh();return true}
function shift(id,d){
 const y=layNorm(),a=y.panel.includes(id)?y.panel:y.home,i=a.indexOf(id),j=i+d;
 if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];save();layRefresh()}

/* redraw everything that shows the layout */
function layRefresh(){
 side();
 const f=$('#dfiles');if(f)f.replaceWith(filesDesk());
 const sp=$('#dspace');if(sp)sp.replaceWith(spaceGrid());
 if($('#arr')&&$('#arr').classList.contains('on'))arrDraw()}

/* ---------- extras per item (rename, change directory, disconnect) ---------- */
async function renameVault(){
 const r=await dlg({title:'Rename',msg:'This changes the name shown in Conduint only.',value:S.labels.vault||'Conduit Vault',ok:'Rename'});
 if(!r||!r.v)return;if(r.v==='Conduit Vault')delete S.labels.vault;else S.labels.vault=r.v;save();layRefresh()}
function renameFn(it){
 if(it.k==='cat')return()=>renameCat(it.c);
 if(it.k==='vault')return renameVault;
 const mt=(meta(it)||{}).mt;if(mt&&mt.type!=='files')return()=>renameMount(mt);
 return null}
async function disconnect(m){
 const r=await dlg({title:'Disconnect "'+m.name+'"?',msg:'Your files are not touched. You can add it again any time.',ok:'Disconnect',danger:true});if(!r)return;
 if(isFM(m)){S.dash.fm=S.dash.fm.filter(x=>x.id!==m.id);delete HANDLES[m.id];dsave();layRefresh()}
 else{await rmMount(m.id);layRefresh()}}
function extras(it){
 const m=meta(it),L=[],rn=renameFn(it);
 if(rn)L.push(['Rename',rn]);
 if(it.k==='cat'&&S.labels[it.c])L.push(['Reset name',()=>{delete S.labels[it.c];save();layRefresh()}]);
 if(it.k==='vault'&&S.labels.vault)L.push(['Reset name',()=>{delete S.labels.vault;save();layRefresh()}]);
 const mt=m.mt;
 if(mt&&mt.type!=='files'){
  const sl=SLOTS.find(s=>s.id===mt.id);
  if(mt.type==='docs')L.push(['Add files',connectDocs]);
  else L.push(['Change directory',()=>connect(mt.id,mt.name,mt.ic,null,{start:sl&&sl.start,volume:mt.ic==='sd'?'external':'',pick:true})]);
  if(sl&&sl.direct&&!mt.direct)L.push(['Open directly (All files access)',()=>connect(mt.id,mt.name,mt.ic,null,{direct:sl.direct})]);
  if(mt.ic==='cloud'&&typeof cloudEmail==='function')L.push(['Account email…',()=>cloudEmail(mt)],['Refresh logo',()=>cloudLook(mt,true)]);
  if(!sl)L.push(['Disconnect…',()=>disconnect(mt)])}
 return L}
/* V0.50.3: one menu line for the two fixed Home tiles: add the item to the left panel, or take it out again */
function panelToggle(it){return layNorm().panel.includes(it.id)?['Remove from left panel',()=>place(it.id,'off')]:['Add to left panel',()=>place(it.id,'panel')]}
function laySlot(id){const y=layNorm();return y.panel.includes(id)?'panel':y.home.includes(id)?'home':'off'}
function menuFor(it,where){
 const L=extras(it),w=laySlot(it.id);
 if(w!=='off'){L.push(['Move up',()=>shift(it.id,-1)],['Move down',()=>shift(it.id,1)])}
 if(w==='panel'&&!HOMEFIX.includes(it.id)&&!PANELONLY.includes(it.id))L.push(['Add to Home',()=>place(it.id,'home')]);
 if(w==='home')L.push(['Move to left panel',()=>place(it.id,'panel')]);
 L.push(['Hide (keep, not shown)',()=>place(it.id,'off')]);
 L.push(['Arrange everything…',arrOpen]);
 return L}

/* long-press / right-click on a Home tile */
function lpTile(t,it,ctxf){/* ctxf: optional custom menu opener (x,y), used by the fixed Downloads tile */
 let tm,x0=0,y0=0;const cancel=()=>clearTimeout(tm),ctx=ctxf||((x,y)=>menu(x,y,menuFor(it)));
 t.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;t._lp=false;tm=setTimeout(()=>{t._lp=true;navigator.vibrate&&navigator.vibrate(12);ctx(x0,y0)},450)});
 t.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x0,e.clientY-y0)>10)cancel()});
 ['pointerup','pointercancel','pointerleave'].forEach(v=>t.addEventListener(v,cancel));
 t.addEventListener('contextmenu',e=>{e.preventDefault();cancel();t._lp=true;ctx(e.clientX,e.clientY)})}

/* ---------- LEFT PANEL ---------- */
function drawPanel(){
 const P=$('#pnl');if(!P)return;P.replaceChildren();
 const y=layNorm(),by=new Map(catalog().map(x=>[x.id,x]));
 y.panel.forEach(id=>{const it=by.get(id);if(!it)return;const m=meta(it);
  const n=nv(m.ic,m.name,m.sub,m.on(),null,renameFn(it));if(m.logo&&typeof wtLogo==='function')wtLogo(n,m.logo);
  tap(n,m.open);n._ctx=(x,yy)=>menu(x,yy,menuFor(it));P.append(n)});
 if(!y.panel.length)P.append(h('div','hint','No folders yet. Tap the pencil, then Add.'));
 $('#parr').title='Arrange ('+y.panel.length+'/'+PANEL_MAX+')'}
function drawBin(){
 const F=$('#foot');F.replaceChildren();
 if(!NATIVE){F.style.display='none';return}
 const y=layNorm(),c=!!y.footc;F.style.display='';F.classList.toggle('cmp',c);
 const bar=h('button','fbar',null,h('span',null,'Conduit Manager'),ico('up','fch'));
 bar.setAttribute('aria-expanded',c?'false':'true');bar.setAttribute('aria-label',c?'Expand Conduit Manager':'Collapse Conduit Manager');
 bar.onclick=()=>{y.footc=!y.footc;save();drawBin()};F.append(bar);
 if(c){const r=h('div','fcr');
  FOOT.forEach(f=>{const b=h('button','fc'+(f.on&&f.on()?' on':''),null,ico(f.ic));b.id=f.eid;b.title=f.name();b.setAttribute('aria-label',f.name());b.onclick=f.open;r.append(b)});F.append(r)}
 else FOOT.forEach(f=>{const n=nv(f.ic,f.name(),f.sub(),f.on?f.on():false);n.id=f.eid;n.classList.add('fx');tap(n,f.open);F.append(n)})}

/* ---------- ARRANGE SHEET ---------- */
function arrOpen(){
 let A=$('#arr');
 if(!A){A=h('div');A.id='arr';
  A.append(h('div','sheet',null,h('div','sh',null,h('span',null,'Arrange'),(()=>{const b=h('button','ib',null,ico('x'));b.setAttribute('aria-label','Close');b.onclick=()=>A.classList.remove('on');return b})()),h('div',null,null)));
  A.firstChild.lastChild.id='abody';A.onclick=e=>{if(e.target===A)A.classList.remove('on')};document.body.append(A)}
 document.body.classList.remove('nav');arrDraw();A.classList.add('on')}
function arrDraw(){
 const B=$('#abody'),y=layNorm(),by=new Map(catalog().map(x=>[x.id,x]));B.replaceChildren();
 const chip=(t,f)=>{const b=h('button','chip',t);b.onclick=f;return b},arrow=(t,f,dis)=>{const b=h('button','chip',t);b.onclick=f;if(dis)b.disabled=true;return b};
 const sec=(t,n)=>B.append(h('h3',null,t+(n!=null?'  ·  '+n:'')));
 const row=(id,list)=>{const it=by.get(id);if(!it)return;const m=meta(it),i=list.indexOf(id),ctl=h('div','ctl');
  if(i>=0)ctl.append(arrow('▲',()=>shift(id,-1),i===0),arrow('▼',()=>shift(id,1),i===list.length-1));
  const w=laySlot(id);
  if(w!=='panel')ctl.append(chip('Panel',()=>place(id,'panel')));
  if(w!=='home'&&!HOMEFIX.includes(id)&&!PANELONLY.includes(id))ctl.append(chip('Home',()=>place(id,'home')));
  if(w!=='off')ctl.append(chip('Hide',()=>place(id,'off')));
  const nm=h('div','anm',null,(m.logo&&typeof wtLogoEl==='function')?wtLogoEl(m.logo):ico(m.ic),h('b',null,m.name));
  B.append(h('div','arow',null,nm,ctl))};
 B.append(h('div','note','Only folders go here. The left panel holds up to '+PANEL_MAX+' and Home shows the folders you add to it. A folder lives in one place: move it and it leaves the other. Hidden folders stay connected and wait at the bottom. The five shortcuts under the panel (Vault, Contacts, Utilities, Settings, Recycle bin) are permanent; tap the Conduit Manager bar to fold them away.'));
 B.append(h('div','note','Internal storage and Downloads always stay as tiles on Home. Tap Panel on either one (listed under Hidden until you do) to also show it in the left panel; Hide takes it out of the panel again.'));
 const add=h('div','row',null,h('span',null,'Add a storage or folder'),h('div','ctl',null,chip('Add…',e=>{const r=e.currentTarget.getBoundingClientRect();menu(Math.max(8,r.right-250),r.bottom,addEntries().concat(y.panel.includes('util:tools')?[]:[['Utilities (left panel)',()=>place('util:tools','panel')]]))})));B.append(add);
 sec('Left panel (folders)',y.panel.length+' of '+PANEL_MAX);y.panel.forEach(id=>row(id,y.panel));
 if(!y.panel.length)B.append(h('div','note','Empty.'));
 sec('Home (folders)',y.home.length);y.home.forEach(id=>row(id,y.home));
 if(!y.home.length)B.append(h('div','note','Empty.'));
 const off=[...by.keys()].filter(id=>!y.panel.includes(id)&&!y.home.includes(id));
 sec('Hidden',off.length);off.forEach(id=>row(id,[]));
 if(!off.length)B.append(h('div','note','Nothing hidden.'))}
