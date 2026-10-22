/* gallery.js: the Gallery (V0.21.0). Opens from Home.
   Tabs: All · Favourites · Albums · Screenshots · Hidden · Cache · Categories · Originals.
   Pictures: date groups (none / day / month / year), four layouts, three sizes, fill or fit, favourites (heart), long-press to select.
   Selection bar: Favourite · Category · Move · Copy · Rename · Crop · Share · Delete. Albums are real folders: make one, rename one, move or copy pictures in.
   Favourites and categories follow a picture when it is renamed or moved, and drop it when it is deleted.
   Originals: the copies Conduint keeps before it rewrites a picture's EXIF. Restore swaps them back (the version you replace is kept too).
   Settings (gear): grouping, layout, size, fit, names, hearts, location kept when cropping. */
const GL={open:false,view:'all',album:null,aname:'',cat:null,items:null,hid:null,orig:null,loading:false,q:'',lim:150,sel:new Map(),selOn:false,io:null,tq:[],tb:0,set:false};
const GLAY=[['tiny','Tiny'],['grid','Grid'],['cards','Cards'],['list','List']];
const GTAB=[['all','All','--acc'],['fav','Favourites','#ff2b3d'],['albums','Albums','--acc'],['shots','Screenshots','--acc'],['hid','Hidden','--red'],['cache','Cache','#ffb020'],['cats','Categories','#fff'],['orig','Originals','#c77dff']];
const GSET_DEF={group:'month',fit:'cover',size:'m',names:false,hearts:true,cropGps:true};
const GCOL={tiny:{s:8,m:6,l:5},grid:{s:5,m:4,l:3},cards:{s:4,m:3,l:2}};
const gd=()=>(S.dash=S.dash||{});
const gset=()=>({...GSET_DEF,...(gd().gset||{})});
const gsetPut=(k,v)=>{gd().gset={...gd().gset,[k]:v};save()};
const glSave=()=>{gd();save()};
const gcats=()=>(gd().gcats=gd().gcats||[]);
const gfav=()=>(gd().gfav=gd().gfav||[]);
const gk=i=>i.uri||i.name;
const glLay=()=>gd().glay||'grid';
/* same sizes as the folder view (256, 384), so a picture already previewed there is not made twice. Small Home chips stay at 160. Large size uses 384. */
const glPx=()=>glLay()==='cards'||gset().size==='l'?384:256;
const glIsShot=i=>/screen[ _-]?shot|screen ?capture|screenrecord/i.test((i.pname||'')+' '+(i.name||''));
const glIsCache=i=>/cache|thumbnail|\.thumb/i.test(i.pname||'');
const glIsHid=i=>(i.pname||'').startsWith('.')||(i.name||'').startsWith('.');
const gm=t=>t&&t<1e11?t*1000:(t||0);
const gdate=t=>t?new Date(gm(t)).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
const gext=n=>((n||'').split('.').pop()||'').toUpperCase().slice(0,4);
/* places: a picture's folder ("album") is its parent URI. Direct file paths have no parent field, so it is the URI minus the file name. */
const gfile=u=>/^file:/.test(u||'');
const gdir=u=>u.slice(0,u.lastIndexOf('/'));
const gdec=s=>{try{return decodeURIComponent(s)}catch{return s}};
const gbase=u=>gdec(u.slice(u.lastIndexOf('/')+1));
const gpar=i=>i.parent||(gfile(i.uri)?gdir(i.uri):'');
const gak=i=>gpar(i)||(i.pname||'(root)');
const gfpath=u=>gdec(u.replace(/^file:\/\//,''));
const gpath=u=>gfile(u)?gfpath(u).replace(/^\/storage\/(emulated\/\d+|[^/]+)\/?/,''):'';
const gnew=(a,b)=>gm(b.mtime)-gm(a.mtime);
/* the storage root a picture lives on: its mount, or the /storage/... volume for direct file paths */
function glRootOf(i){
 if(i.m&&typeof mount==='function'){const m=mount(i.m);if(m&&m.root)return m.root}
 const u=i.uri||'',v=/^(file:\/\/\/storage\/(?:emulated\/\d+|[0-9A-Za-z-]{4,9}))(?:\/|$)/.exec(u);if(v)return v[1];
 const m=(S.mounts||[]).find(x=>x.type==='saf'&&x.root&&u.startsWith(x.root));return m?m.root:''}
function glRoots(){const out=[],seen=new Set(),add=(uri,name,pics)=>{if(!uri||seen.has(uri))return;seen.add(uri);out.push({uri,name,pics})};
 (GL.items||[]).forEach(i=>{if(gfile(i.uri)&&!i.m){const r=glRootOf(i);if(r)add(r,/emulated/.test(r)?'Internal storage':'SD card '+r.split('/').pop(),true)}});
 (S.mounts||[]).forEach(m=>{if(m.type==='saf'&&m.ic!=='cloud'&&m.root)add(m.root,m.name||'Storage',gfile(m.root)&&/^file:\/\/\/storage\/(emulated\/\d+|[^/]+)$/.test(m.root))});
 return out}

/* ---------- data: one scan for pictures; hidden / cache folders only scan when you open those tabs ---------- */
async function glLoad(force,quiet){
 if(GL.items&&!force)return;if(GL.loading)return;GL.loading=true;if(!quiet)glDraw();
 try{const r=await scan('img',8000);const seen=new Set();GL.items=r.filter(i=>!i.dir&&!(i.name||'').startsWith('.')&&!/conduint-(originals|trash)/.test(i.uri||'')&&!seen.has(gk(i))&&seen.add(gk(i)))}
 catch(e){GL.items=[];if(!quiet)toast(e.message||'Could not scan pictures.')}
 GL.loading=false;if(GL.open)glDraw();glHomeRefresh()}
async function glHidLoad(force){
 if(GL.hid&&!force)return;if(GL.loading)return;GL.loading=true;glDraw();const out=[],seen=new Set();
 try{if(typeof NATIVE!=='undefined'&&NATIVE&&SAF&&SAF.scan)for(const m of S.mounts){if(m.type!=='saf'||m.ic==='cloud')continue;
  try{const r=await SAF.scan({uri:m.root,exts:EXT.img.split(' '),cap:4000,hidden:true});(r.items||[]).forEach(i=>{const k=gk(i);if(!seen.has(k)){seen.add(k);out.push({...i,m:m.id,path:[i.pname||''],fs:false})}})}catch{}}}catch{}
 GL.hid=out;GL.loading=false;if(GL.open)glDraw()}
/* saved originals: .conduint-originals at the root of every storage. Files are named <time>~<original name>. */
async function glOrigGo(){while(GL.loading)await new Promise(r=>setTimeout(r,120));if(!GL.items)await glLoad(false,true);return glOrigLoad(true)}
async function glOrigLoad(force){
 if(GL.orig&&!force)return;if(!(typeof SAF!=='undefined'&&SAF)){GL.orig=[];if(GL.open)glDraw();return}
 GL.loading=true;glDraw();const out=[],recs=gd().gorig||{};
 for(const r of glRoots()){try{const L=await SAF.list({uri:r.uri}),d=(L.items||[]).find(x=>x.dir&&x.name==='.conduint-originals');if(!d)continue;
  const F=await SAF.list({uri:d.uri});
  (F.items||[]).forEach(x=>{if(x.dir)return;const mm=/^([0-9a-z]+)~(.+)$/.exec(x.name);
   out.push({uri:x.uri,name:x.name,oname:mm?mm[2]:x.name,at:mm?parseInt(mm[1],36):gm(x.mtime),size:x.size||0,mtime:x.mtime,rec:recs[x.name]||null,root:r.uri,parent:d.uri,orig:true})})}catch{}}
 out.sort((a,b)=>b.at-a.at);GL.orig=out;GL.loading=false;if(GL.open)glDraw()}
function glSource(){let a;
 if(GL.view==='cats'&&GL.cat){const c=gcats().find(x=>x.id===GL.cat);return c?c.items.slice():[]}
 const base=GL.items||[];
 if(GL.album!=null)a=base.filter(i=>gak(i)===GL.album);
 else if(GL.view==='fav'){const f=new Set(gfav());a=base.filter(i=>f.has(gk(i)))}
 else if(GL.view==='shots')a=base.filter(glIsShot);
 else if(GL.view==='hid')a=(GL.hid||[]).filter(i=>glIsHid(i)&&!glIsCache(i));
 else if(GL.view==='cache'){const s=new Set(),o=[];[...(GL.hid||[]),...base].forEach(i=>{if(glIsCache(i)&&!s.has(gk(i))){s.add(gk(i));o.push(i)}});a=o}
 else a=base.slice();
 const t=norm(GL.q||'').split(' ').filter(Boolean);if(t.length)a=a.filter(i=>{const x=norm((i.name||'')+' '+(i.pname||''));return t.every(w=>x.includes(w))});
 if(GL.view==='cats')return a;
 const so=gd().gsort||'new';a.sort(so==='old'?(x,y)=>gm(x.mtime)-gm(y.mtime):so==='name'?(x,y)=>(x.name||'').localeCompare(y.name||'',undefined,{sensitivity:'base'}):so==='size'?(x,y)=>(y.size||0)-(x.size||0):gnew);
 return a}

/* ---------- thumbnails: tiny files (160 px, 240 for Large), only for rows on screen, two or three at a time, handed back when scrolled away ---------- */
function glApply(w,b){if(!w||w.querySelector('img'))return;const im=new Image();im.alt='';im.decoding='async';im.draggable=false;im.onload=()=>w.classList.add('ok');im.onerror=()=>{im.remove();w.classList.remove('ok')};im.src='data:image/jpeg;base64,'+b;w.append(im)}
function glRelease(w){const im=w.querySelector('img');if(im){im.onload=im.onerror=null;im.removeAttribute('src');im.remove()}w.classList.remove('ok');w._b=0}
function glPump(){while(GL.tb<3&&GL.tq.length){const j=GL.tq.pop();GL.tb++;Promise.resolve().then(()=>j()).catch(()=>{}).finally(()=>{GL.tb--;glPump()})}}
async function glLoadThumb(w){const i=w._i;if(!i||!i.uri||!(SAF&&SAF.thumb)){w._b=0;return}
 const px=w.classList.contains('mini')||w.classList.contains('mini2')?160:glPx(),key=i.uri+'|'+i.size+'|'+i.mtime+'|'+px;let b=THUMB.mem.get(key);if(!b){b=await tget(key);if(b)thumbMem(key,b)}
 if(!b){const bt=THUMB.bad.get(key);if(bt&&Date.now()-bt<20000){w._b=0;return}
  b=await new Promise(res=>{GL.tq.push(async()=>{if(!w.isConnected||!w._vis){res('');return}let x='';try{const q=await SAF.thumb({uri:i.uri,kind:'img',name:i.name,size:px});x=(q&&q.b64)||''}catch{}res(x)});glPump()});
  if(b){thumbMem(key,b);tput(key,b)}else THUMB.bad.set(key,Date.now())}
 w._b=0;if(b&&w.isConnected&&w._vis)glApply(w,b)}
function glIO(){if(!GL.io)GL.io=new IntersectionObserver(es=>es.forEach(e=>{const w=e.target;w._vis=e.isIntersecting;if(e.isIntersecting){if(!w._b&&!w.querySelector('img')){w._b=1;glLoadThumb(w)}}else glRelease(w)}),{root:$('#glbody'),rootMargin:'200px'});return GL.io}
const glKill=()=>{if(GL.io){GL.io.disconnect();GL.io=null}GL.tq.splice(0);};
function glTh(i,cls){const w=h('span','glth'+(cls?' '+cls:''),null,h('i',null,'▣'));w._i=i;return w}

/* ---------- open / close / back ---------- */
function glOpen(){const g=$('#gl');if(!g)return;GL.open=true;g.classList.add('on');document.body.classList.add('glon');glBuild();
 if(!GL.items)glLoad();else glDraw()}
function glClose(){const g=$('#gl');if(!GL.open)return;GL.open=false;GL.set=false;glKill();GL.sel.clear();GL.selOn=false;g.classList.remove('on');document.body.classList.remove('glon');glHomeRefresh()}
/* sheets that sit above the viewer (album picker) close first on Android back */
function glLayerBack(){const p=$('#glpk');if(p&&p.classList.contains('on')){PKRES&&PKRES(null);return true}return false}
function glBack(){if(glLayerBack())return;
 if(GL.set){glSetShow(false);return}
 if(GL.selOn){GL.sel.clear();GL.selOn=false;return glDraw()}
 if(GL.album!=null||GL.cat){GL.album=null;GL.aname='';GL.cat=null;GL.lim=150;return glDraw()}glClose()}
function glRedraw(){const B=$('#glbody'),y=B?B.scrollTop:0;glDraw();if(B)B.scrollTop=y}
function glGoTab(id){GL.view=id;GL.album=null;GL.aname='';GL.cat=null;GL.lim=150;GL.sel.clear();GL.selOn=false;GL.q='';const q=$('#glq');if(q)q.value='';
 const tb=$('#gltabs');if(tb)[...tb.children].forEach((c,n)=>{if(!GTAB[n])return;const on=GTAB[n][0]===id;c.classList.toggle('on',on);if(on&&c.scrollIntoView)c.scrollIntoView({inline:'center',block:'nearest'})});
 if(id==='hid'||id==='cache')glHidLoad();if(id==='orig')glOrigGo();glDraw()}
function glBuild(){const g=$('#gl');g.replaceChildren();
 const bk=h('button','ib',null,ico('back'));bk.setAttribute('aria-label','Back');bk.onclick=glBack;
 const ti=h('div','glti',null,h('b',null,'Gallery'),h('small',null,''));ti.id='glti';
 const mk=(ic,lb,f)=>{const b=h('button','ib',null,ico(ic));b.setAttribute('aria-label',lb);b.onclick=()=>f(b);return b};
 const hd=h('div','glhd',null,bk,ti,mk('check','Select',()=>{GL.selOn=!GL.selOn;if(!GL.selOn)GL.sel.clear();glDraw()}),
  mk('grid','Layout',()=>{const o=GLAY.map(x=>x[0]),n=o[(o.indexOf(glLay())+1)%o.length];gd().glay=n;glSave();GL.lim=150;toast('Layout: '+GLAY.find(x=>x[0]===n)[1]);glDraw()}),
  mk('sort','Sort',b=>{const r=b.getBoundingClientRect(),cur=gd().gsort||'new',set=v=>()=>{gd().gsort=v;glSave();glDraw()};
   menu(r.left,r.bottom,[[(cur==='new'?'● ':'')+'Newest first',set('new')],[(cur==='old'?'● ':'')+'Oldest first',set('old')],[(cur==='name'?'● ':'')+'Name',set('name')],[(cur==='size'?'● ':'')+'Largest',set('size')],['Rescan pictures',()=>{libReset&&libReset();GL.hid=null;GL.orig=null;glLoad(true)}]])}),
  mk('gear','Gallery settings',()=>glSetShow(!GL.set)));
 const tb=h('div','gltabs');tb.id='gltabs';
 GTAB.forEach(([id,nm,col])=>{const t=h('button','gltab'+(GL.view===id?' on':''),null,h('i'),h('span',null,nm));t.firstChild.style.background=col.startsWith('--')?'var('+col+')':col;
  t.onclick=()=>glGoTab(id);tb.append(t)});
 {const v=h('button','gltab',null,h('i'),h('span',null,'Videos'));v.firstChild.style.background='var(--red)';v.onclick=()=>{glClose();goCat('vids')};tb.append(v)}
 const q=document.createElement('input');q.type='search';q.id='glq';q.className='glq';q.placeholder='Search pictures…';q.autocomplete='off';q.spellcheck=false;q.value=GL.q;
 let qt=0;q.oninput=()=>{clearTimeout(qt);qt=setTimeout(()=>{GL.q=q.value;GL.lim=150;glDraw()},200)};
 const body=h('div','glbody');body.id='glbody';const sb=h('div','glsel');sb.id='glsel';g.append(hd,tb,q,body,sb);glSetBuild()}

/* ---------- drawing ---------- */
function glLP(el,fn){let tm,x0=0,y0=0;el.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;el._lp=false;tm=setTimeout(()=>{el._lp=true;navigator.vibrate&&navigator.vibrate(12);fn()},420)});
 el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x0,e.clientY-y0)>10)clearTimeout(tm)});['pointerup','pointercancel','pointerleave'].forEach(v=>el.addEventListener(v,()=>clearTimeout(tm)));el.addEventListener('contextmenu',e=>e.preventDefault())}
/* date groups: none / day / month / year. Only when sorted by date. */
function glGroup(i,mode){const t=gm(i.mtime);if(!t)return['?','Unknown date'];const d=new Date(t),y=d.getFullYear();
 if(mode==='year')return[''+y,''+y];
 if(mode==='day')return[y+'-'+d.getMonth()+'-'+d.getDate(),d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'long',year:'numeric'})];
 return[y+'-'+d.getMonth(),d.toLocaleDateString(undefined,{month:'long',year:'numeric'})]}
function glDraw(){const B=$('#glbody');if(!B)return;glKill();B.replaceChildren();B.classList.remove('l-tiny','l-grid','l-cards','l-list','l-albums','l-orig');B.style.gridTemplateColumns='';
 const gs=gset();B.classList.toggle('fit-contain',gs.fit==='contain');B.classList.toggle('names',!!gs.names);B.classList.toggle('nohearts',!gs.hearts);
 const inCat=GL.view==='cats'&&GL.cat,cat=inCat&&gcats().find(x=>x.id===GL.cat);
 $('#glq').style.display=(GL.view==='cats'&&!GL.cat)||(GL.view==='albums'&&GL.album==null)||GL.view==='orig'?'none':'';
 $('#gltabs').style.display=(GL.album!=null||GL.cat)?'none':'';
 const ti=$('#glti');ti.firstChild.textContent=GL.album!=null?(GL.aname||GL.album):cat?cat.name:'Gallery';
 if(GL.view==='orig'){glSel();return glOrigDraw(B,ti)}
 if(GL.loading&&!(GL.items&&GL.items.length)){ti.lastChild.textContent='Scanning…';B.append(h('div','dnone','Scanning your pictures…'));return glSel()}
 if(!GL.items&&!inCat){ti.lastChild.textContent='';B.append(h('div','dnone','Nothing scanned yet.'));return glSel()}
 if(GL.view==='albums'&&GL.album==null)return glAlbums(B,ti);
 if(GL.view==='cats'&&!GL.cat)return glCats(B,ti);
 const list=glSource();ti.lastChild.textContent=plural(list.length,'picture')+(GL.loading?' · scanning…':'');
 if(!list.length){B.append(h('div','dnone',GL.view==='hid'||GL.view==='cache'?(GL.hid?'Nothing found here.':'Scanning…'):GL.view==='fav'?'No favourites yet. Tap the heart in the viewer, or select pictures and tap Favourite.':inCat?'Empty. Long-press pictures in All, then Add to category.':'No pictures here.'));return glSel()}
 const lay=glLay();B.classList.add('l-'+lay);const cols=GCOL[lay]&&GCOL[lay][gs.size];if(cols)B.style.gridTemplateColumns='repeat('+cols+',1fr)';
 const io=glIO(),so=gd().gsort||'new',dated=!inCat&&(so==='new'||so==='old')&&gs.group!=='none',fav=new Set(gfav());let last='';
 const cnt=new Map();if(dated)list.forEach(i=>{const k=glGroup(i,gs.group)[0];cnt.set(k,(cnt.get(k)||0)+1)});
 /* tiles go in 150 at a time; Show more only appends the next 150 and never redraws the ones already there */
 const put=(a,z)=>{const fr=document.createDocumentFragment();
  list.slice(a,z).forEach(i=>{
   if(dated){const[k,lb]=glGroup(i,gs.group);if(k!==last){last=k;const hd=h('div','glh',null,h('span',null,lb),h('em',null,''+cnt.get(k)));hd.onclick=()=>{if(!GL.selOn)return;const g=list.filter(x=>glGroup(x,gs.group)[0]===k),all=g.every(x=>GL.sel.has(gk(x)));g.forEach(x=>all?GL.sel.delete(gk(x)):GL.sel.set(gk(x),x));glRedraw()};fr.append(hd)}}
   fr.append(glTile(i,lay,list,fav))});
  if(list.length>z){const m=h('button','chip glmore','Show more ('+(list.length-z)+' left)');m.onclick=()=>{m.remove();GL.lim=z+150;put(z,GL.lim)};fr.append(m)}
  const ws=[...fr.querySelectorAll('.glth')];B.append(fr);ws.forEach(w=>io.observe(w))};
 put(0,GL.lim);glSel()}
function glTile(i,lay,list,fav){const k=gk(i),on=GL.sel.has(k),t=h('button','glt'+(on?' sel':'')),w=glTh(i,GL.view==='hid'?'hid':GL.view==='cache'?'cch':'');t._k=k;
 t.append(w);
 const hv=h('span','glfv'+(fav&&fav.has(k)?' on':''),null,ico('heartfill'));
 if(lay==='cards')t.append(h('b',null,i.name),h('span','glm',null,h('em',null,gext(i.name)),h('em',null,i.size?fmt(i.size):''),h('em',null,gdate(i.mtime))),h('small',null,i.pname||''));
 else if(lay==='list')t.append(h('div','glr',null,h('b',null,i.name),h('small',null,[i.pname||'',i.size?fmt(i.size):'',gdate(i.mtime)].filter(Boolean).join(' · '))),h('em','gle',gext(i.name)));
 else t.append(h('span','gln',i.name));
 t.append(hv,h('span','gck'+(on?' on':''),null,ico('check')));
 glLP(t,()=>{GL.selOn=true;GL.sel.set(k,i);t._lp=true;t.classList.add('sel');t.querySelector('.gck').classList.add('on');glSel()});
 t.onclick=()=>{if(t._lp){t._lp=false;return}
  if(GL.selOn){if(GL.sel.has(k))GL.sel.delete(k);else GL.sel.set(k,i);t.classList.toggle('sel',GL.sel.has(k));t.querySelector('.gck').classList.toggle('on',GL.sel.has(k));glSel();return}
  try{open(i,list)}catch(e){toast(e.message)}};
 return t}
/* selection bar: counts and Done on top, actions below (scrolls sideways on narrow phones) */
function glSel(){const g=$('#gl');if(g)g.classList.toggle('gl-selmode',GL.selOn);const s=$('#glsel');if(!s)return;s.replaceChildren();
 const show=GL.selOn&&GL.view!=='orig',gb=$('#glbody');s.classList.toggle('on',show);if(!show){if(gb)gb.style.paddingBottom='';return}
 const mn=!!S.settings.glSelMin;s.classList.toggle('min',mn);/* V0.50.0: the black card folds down to one slim row so you can see what you are selecting */
 const n=GL.sel.size,inCat=GL.view==='cats'&&GL.cat,its=[...GL.sel.values()];
 const tg=h('button','ib glsm',null,ico(mn?'chup':'chdown'));tg.setAttribute('aria-label',mn?'Show the actions':'Hide the actions');tg.setAttribute('aria-expanded',mn?'false':'true');tg.onclick=()=>{S.settings.glSelMin=!S.settings.glSelMin;save();glSel()};
 const top=h('div','glst',null,tg,h('b',null,n?plural(n,'picture')+' selected':'Select pictures'));
 const sa=h('button','chip','All shown');sa.onclick=()=>{glSource().slice(0,600).forEach(i=>GL.sel.set(gk(i),i));glRedraw()};
 const cl=h('button','chip','Done');cl.onclick=()=>{GL.sel.clear();GL.selOn=false;glRedraw()};top.append(sa,cl);
 const act=h('div','glact'),ab=(ic,lb,f,cls)=>{const b=h('button','glab'+(cls?' '+cls:''),null,ico(ic),h('span',null,lb));b.onclick=()=>{if(!GL.sel.size)return toast('Pick pictures first.');f(b)};act.append(b)};
 const allFav=n>0&&its.every(glIsFav);
 ab(allFav?'heartfill':'heart',allFav?'Unfavourite':'Favourite',()=>glFavSet(its,!allFav));
 if(inCat)ab('x','Remove',()=>{const c=gcats().find(x=>x.id===GL.cat);if(c){c.items=c.items.filter(i=>!GL.sel.has(gk(i)));glSave()}GL.sel.clear();GL.selOn=false;glRedraw();glHomeRefresh()});
 else ab('folder','Category',b=>{const r=b.getBoundingClientRect();menu(r.left,r.top-10,[...gcats().map(c=>[c.name+' ('+c.items.length+')',()=>glAddTo(c)]),['＋ New category…',()=>glNewCat(true)]])});
 ab('move','Move',()=>glPickDest('move',its));ab('copy','Copy',()=>glPickDest('copy',its));
 if(n===1){ab('edit','Rename',()=>glRename(its[0]));ab('crop','Crop',()=>gcOpen(its[0]))}
 ab('share','Share',()=>opShare(its));
 ab('more','More',b=>{const r=b.getBoundingClientRect();menu(r.left,r.top-10,[['Information',()=>{if(its.length!==1)return toast('Pick one picture to see its information.');if(typeof xfOpen==='function')xfOpen(its[0])}],['Remove location…',()=>{if(typeof xfStripMany==='function')xfStripMany(its)}]])});
 ab('trash','Delete',()=>glDeleteItems(its),'glred');
 s.append(top,act);
 /* the list always has room under the card, whatever size it is now, so the last pictures can be scrolled into view */
 if(gb)requestAnimationFrame(()=>{gb.style.paddingBottom=(s.offsetHeight+24)+'px'})}
/* albums are folders. Same-named folders on different storages stay apart (keyed by the folder URI) and show their path. */
function glAlbumMap(){const m=new Map();(GL.items||[]).slice().sort(gnew).forEach(i=>{const k=gak(i);let a=m.get(k);if(!a)m.set(k,a={key:k,name:i.pname||'Root',uri:gpar(i),items:[]});a.items.push(i)});
 (gd().galb||[]).forEach(x=>{if(!m.has(x.uri))m.set(x.uri,{key:x.uri,name:x.name,uri:x.uri,items:[],extra:true})});return m}
function glAlbums(B,ti){const L=[...glAlbumMap().values()].sort((a,b)=>b.items.length-a.items.length),dup={};L.forEach(a=>dup[a.name]=(dup[a.name]||0)+1);
 ti.lastChild.textContent=plural(L.length,'album');B.classList.add('l-albums');const io=glIO(),fr=document.createDocumentFragment();
 const nw=h('button','glcv glnew',null,h('span','glth',null,h('i',null,'＋')),h('b',null,'New album'),h('small',null,'Makes a folder'));nw.onclick=()=>glNewAlbum();fr.append(nw);
 L.slice(0,GL.lim).forEach(a=>{const t=h('div','glcv glcat'),sub=plural(a.items.length,'picture')+(dup[a.name]>1&&a.uri?' · '+(gpath(a.uri)||'storage'):''),
   b=h('button','glcvb',null,glTh(a.items[0]||null,''),h('b',null,a.name),h('small',null,sub));
  const open=()=>{GL.album=a.key;GL.aname=a.name;GL.lim=150;glDraw()};b.onclick=open;t.append(b);
  const mo=h('button','ib glmo',null,ico('more'));mo.setAttribute('aria-label','Album options');
  mo.onclick=()=>{const r=mo.getBoundingClientRect(),M=[['Open',open]];
   if(a.items.length)M.push(['Select all pictures',()=>{open();GL.selOn=true;glSource().slice(0,600).forEach(i=>GL.sel.set(gk(i),i));glDraw()}],['Move all pictures to…',()=>glPickDest('move',a.items.slice())]);
   if(a.uri)M.push(['Rename album',()=>glRenameAlbum(a)]);
   if(a.extra&&!a.items.length)M.push(['Delete empty album',()=>glDeleteAlbum(a)]);
   menu(r.left,r.bottom,M)};t.append(mo);fr.append(t)});
 B.append(fr);B.querySelectorAll('.glth').forEach(w=>io.observe(w));glSel()}
function glCats(B,ti){const L=gcats().slice().sort((a,b)=>(b.pin?1:0)-(a.pin?1:0));ti.lastChild.textContent=plural(L.length,'category');B.classList.add('l-albums');const io=glIO(),fr=document.createDocumentFragment();
 const nw=h('button','glcv glnew',null,h('span','glth',null,h('i',null,'＋')),h('b',null,'New category'),h('small',null,'Pick pictures later'));nw.onclick=()=>glNewCat(false);fr.append(nw);
 L.forEach(c=>{const t=h('div','glcv glcat'),b=h('button','glcvb',null,glTh(c.items[0]||null,''),h('b',null,c.name),h('small',null,plural(c.items.length,'picture')));
  b.onclick=()=>{GL.cat=c.id;GL.lim=150;glDraw()};t.append(b);
  if(c.pin)t.append(ico('pin','glpin'));const mo=h('button','ib glmo',null,ico('more'));mo.setAttribute('aria-label','Category options');mo.onclick=ev=>{const r=mo.getBoundingClientRect();menu(r.left,r.bottom,[[c.pin?'Unpin':'Pin to top',()=>{c.pin=!c.pin;glSave();glDraw();glHomeRefresh()}],['Rename',async()=>{const x=await dlg({title:'Rename category',value:c.name,ok:'Save'});if(x&&x.v&&x.v.trim()){c.name=x.v.trim();glSave();glDraw();glHomeRefresh()}}],['Delete',async()=>{const x=await dlg({title:'Delete "'+c.name+'"?',msg:'Your pictures are not touched.',ok:'Delete',danger:true});if(!x)return;gd().gcats=gcats().filter(z=>z.id!==c.id);glSave();glDraw();glHomeRefresh()}]])};t.append(mo);fr.append(t)});
 B.append(fr);B.querySelectorAll('.glth').forEach(w=>io.observe(w));glSel()}
async function glNewCat(withSel){const r=await dlg({title:'New category',msg:withSel&&GL.sel.size?plural(GL.sel.size,'picture')+' will go in. The first one becomes the cover.':'Name it, then add pictures from All.',value:'',ok:'Create'});if(!r)return;
 const n=(r.v||'').trim();if(!n)return toast('Give the category a name.');const c={id:Date.now().toString(36),name:n,items:[],pin:false};gcats().push(c);
 if(withSel&&GL.sel.size)glAddTo(c);else{glSave();if(GL.open)glDraw();glHomeRefresh()}}
/* categories keep a slim copy of each picture; parent is kept so a picture opened from a category can still be moved or renamed */
const glSlim=i=>({uri:i.uri,name:i.name,size:i.size,mime:i.mime,pname:i.pname,mtime:i.mtime,m:i.m,path:i.path,fs:i.fs,parent:gpar(i)||undefined});
function glAddTo(c){const have=new Set(c.items.map(gk));let n=0;GL.sel.forEach((i,k)=>{if(!have.has(k)){c.items.push(glSlim(i));n++}});
 GL.sel.clear();GL.selOn=false;glSave();toast('Added '+plural(n,'picture')+' to '+c.name+'.');glDraw();glHomeRefresh()}

/* ---------- favourites (heart) ---------- */
const glIsFav=i=>!!i&&gfav().includes(gk(i));
function glFavSet(its,on){const s=new Set(gfav()),its2=its.filter(i=>!i.orig);if(!its2.length)return toast('Saved originals cannot be favourites.');
 its2.forEach(i=>on?s.add(gk(i)):s.delete(gk(i)));gd().gfav=[...s];
 if(on&&GL.items){const have=new Set(GL.items.map(gk));its2.forEach(i=>{if(i.uri&&!have.has(gk(i)))GL.items.push(i)})}
 glSave();toast(on?'Added '+plural(its2.length,'picture')+' to favourites.':'Removed '+plural(its2.length,'picture')+' from favourites.');
 if(GL.selOn){GL.sel.clear();GL.selOn=false}
 if(typeof ivFavSync==='function')ivFavSync();if(GL.open)glRedraw();glHomeRefresh()}

/* ---------- cross-references ----------
   map: old key -> new item, or null when the picture is gone. Everything that remembers a picture follows it:
   the scan lists, favourites, categories and the open viewer. skipItems: the lists were already rebuilt by a rescan. */
function glRemap(map,skipItems){
 if(!map.size)return;const rep=a=>(a||[]).map(i=>{const k=gk(i);return map.has(k)?map.get(k):i}).filter(Boolean);
 if(!skipItems){if(GL.items)GL.items=rep(GL.items);if(GL.hid)GL.hid=rep(GL.hid)}
 gd().gfav=[...new Set(gfav().map(k=>map.has(k)?(map.get(k)?gk(map.get(k)):null):k).filter(Boolean))];
 gcats().forEach(c=>{c.items=rep(c.items).map(glSlim)});
 GL.sel.clear();GL.selOn=false;
 if(typeof ivSwap==='function')ivSwap(map);
 glSave();libReset&&libReset();if(GL.open)glRedraw();glHomeRefresh()}

/* ---------- delete ---------- */
async function glDeleteItems(its){
 if(!its.length)return false;const bin=S.settings.bin,isFs=i=>gfile(i.uri)&&!i.m,fsI=its.filter(isFs),rest=its.filter(i=>!isFs(i));
 const r=await dlg({title:bin?'Move to recycle bin?':'Delete forever?',msg:(its.length===1?'"'+its[0].name+'"':plural(its.length,'picture'))+(bin?' can be restored from the recycle bin.':' will be removed for good.'),ok:bin?'Move to bin':'Delete',danger:true});if(!r)return false;
 const gone=new Map();let failed=0;
 if(fsI.length){const ok=await job(bin?'Moving to bin…':'Deleting…',async()=>{const paths=fsI.map(i=>gfpath(i.uri));
   if(bin){const t=await TOOLS.trash({paths});failed=t.failed||0;const done=new Set(t.items.map(x=>x.from));
    t.items.forEach(x=>S.trash.push({id:sid(),p:1,m:'fs',name:x.name,tname:x.tname,dir:!!x.dir,size:x.size||0,at:Date.now(),fpath:x.trash,from:x.from}));save();
    fsI.forEach(i=>{if(done.has(gfpath(i.uri)))gone.set(gk(i),null)})}
   else{await TOOLS.fsRemove({paths});fsI.forEach(i=>gone.set(gk(i),null))}return true});
  if(!ok&&!gone.size)return false}
 if(rest.length){const ok=await opDelete(rest,false,true);if(ok)rest.forEach(i=>gone.set(gk(i),null))}
 if(gone.size){glRemap(gone);toast((bin?'Moved ':'Deleted ')+plural(gone.size,'picture')+(bin?' to the recycle bin.':'.')+(failed?' '+failed+' could not be removed.':''))}
 return gone.size>0}

/* ---------- rename ---------- */
async function glRename(i){
 const r=await dlg({title:'Rename picture',value:i.name,ok:'Rename',sel:true});if(!r||!r.v||r.v===i.name)return false;let n=r.v;
 const e=badName(n);if(e){toast(e);return false}
 const oe=/\.[A-Za-z0-9]{2,5}$/.exec(i.name);if(oe&&!/\.[A-Za-z0-9]{2,5}$/.test(n))n+=oe[0];
 let res=null;const ok=await job('Renaming…',async()=>{res=await SAF.rename({uri:i.uri,name:n});if(!res||!res.uri)throw Error('Could not rename.');return true});if(!ok)return false;
 let st={};try{st=await SAF.stat({uri:res.uri})}catch{}
 const ni={...i,uri:res.uri,name:st.name||n,size:st.size||i.size,mtime:st.mtime||i.mtime};
 glRemap(new Map([[gk(i),ni]]));toast('Renamed to '+ni.name+'.');return ni}

/* ---------- move and copy to an album ---------- */
async function glPickDest(op,its){const d=await glPkAsk((op==='move'?'Move ':'Copy ')+plural(its.length,'picture')+' to…');if(!d)return false;return glTransfer(op,its,d)}
async function glTransfer(op,its,d){
 const mv=op==='move',todo=mv?its.filter(i=>gpar(i)!==d.uri):its;
 if(!todo.length){toast('Those pictures are already in '+d.name+'.');return false}
 const out=[];
 const ok=await job(mv?'Moving…':'Copying…',async()=>{const g=new Map();todo.forEach(i=>{const p=gpar(i);if(!g.has(p))g.set(p,[]);g.get(p).push(i)});
  for(const[p,L]of g){const r=mv?await SAF.move({items:L.map(i=>({uri:i.uri,parent:p})),parent:d.uri}):await SAF.copy({items:L.map(i=>({uri:i.uri})),parent:d.uri});
   for(let k=0;k<L.length;k++){const nu=(r.uris||[])[k];if(!nu)continue;let st={};try{st=await SAF.stat({uri:nu})}catch{}
    out.push([L[k],{...L[k],uri:nu,name:st.name||gbase(nu),size:st.size||L[k].size,mtime:st.mtime||L[k].mtime,parent:d.uri,pname:d.name,path:[d.name]}])}}
  return true});
 if(!out.length)return false;
 if(mv)glRemap(new Map(out.map(([o,n])=>[gk(o),n])));
 else{/* a copy is a new picture: it is listed, but favourites and categories stay with the original */
  if(GL.items)GL.items.push(...out.map(x=>x[1]));GL.sel.clear();GL.selOn=false;libReset&&libReset();if(GL.open)glRedraw();glHomeRefresh()}
 toast((mv?'Moved ':'Copied ')+plural(out.length,'picture')+' to '+d.name+'.'+(ok?'':' Some could not be done.'));return true}

/* ---------- albums: new, rename, delete empty ---------- */
async function glNewAlbum(inPicker){
 const rs=glRoots();if(!rs.length){toast('Scan your pictures first, or connect a storage.');return null}
 const r=await dlg({title:'New album',msg:'A new folder'+(rs[0].pics?' inside Pictures':'')+'.',value:'',ok:'Create',...(rs.length>1?{opts:rs.map((x,k)=>[k,x.name]),val:0}:{})});if(!r)return null;
 const n=(r.v||'').trim(),e=badName(n);if(e){toast(e);return null}
 const root=rs[r.o!=null?r.o:0]||rs[0];let a=null;
 const ok=await job('Creating album…',async()=>{let par=root.uri;if(root.pics)par=(await SAF.ensureDir({parent:root.uri,name:'Pictures'})).uri;
  const d=await SAF.mkdir({parent:par,name:n});let nm=n;try{nm=(await SAF.stat({uri:d.uri})).name||n}catch{}a={uri:d.uri,name:nm,at:Date.now()};return true});
 if(!ok||!a)return null;(gd().galb=gd().galb||[]).push(a);glSave();toast('Album "'+a.name+'" created.');if(!inPicker&&GL.open)glDraw();return a}
async function glRenameAlbum(a){
 const r=await dlg({title:'Rename album',msg:'This renames the folder on your storage.',value:a.name,ok:'Rename'});if(!r||!r.v||r.v===a.name)return;
 const e=badName(r.v);if(e)return toast(e);let res=null;
 const ok=await job('Renaming…',async()=>{res=await SAF.rename({uri:a.uri,name:r.v});if(!res||!res.uri)throw Error('Could not rename the folder.');return true});if(!ok)return;
 const nu=res.uri,map=new Map();
 (gd().galb||[]).forEach(x=>{if(x.uri===a.uri){x.uri=nu;x.name=r.v}});
 if(gfile(a.uri)&&gfile(nu)){a.items.forEach(i=>map.set(gk(i),{...i,uri:nu+i.uri.slice(a.uri.length),parent:nu,pname:r.v,path:[r.v]}));glRemap(map)}
 else{/* provider URIs change in ways we can't predict: rescan, then match pictures by folder and file name */
  libReset&&libReset();GL.hid=null;await glLoad(true,true);
  a.items.forEach(i=>{const n=(GL.items||[]).find(x=>x.pname===r.v&&x.name===i.name);if(n)map.set(gk(i),n)});glRemap(map,true)}
 toast('Album renamed to '+r.v+'.')}
async function glDeleteAlbum(a){
 const r=await dlg({title:'Delete "'+a.name+'"?',msg:'The empty folder is removed.',ok:'Delete',danger:true});if(!r)return;
 const ok=await job('Deleting…',async()=>{await SAF.remove({uris:[a.uri]});return true});if(!ok)return;
 gd().galb=(gd().galb||[]).filter(x=>x.uri!==a.uri);glSave();if(GL.open)glDraw()}

/* ---------- album picker: a sheet above the viewer, resolves with {uri,name} or null ---------- */
let PKRES=null;
function glPkBuild(){let s=$('#glpk');if(s)return s;s=h('section','glpk');s.id='glpk';s.setAttribute('aria-label','Choose an album');
 const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Close');
 s.append(h('div','glpkb',null,h('div','xfgrab'),h('div','glpkh',null,h('b',null,''),x),h('div','glpkl')));document.body.append(s);return s}
function glPkAsk(title){return new Promise(res=>{const s=glPkBuild(),L=s.querySelector('.glpkl');s.querySelector('.glpkh b').textContent=title;L.replaceChildren();
 const done=v=>{s.classList.remove('on');PKRES=null;res(v)};PKRES=done;
 const nw=h('button','glpkr glnewr',null,ico('folderplus'),h('div',null,null,h('b',null,'New album…'),h('small',null,'Create a folder and use it')));
 nw.onclick=async()=>{const a=await glNewAlbum(true);if(a)done({uri:a.uri,name:a.name})};L.append(nw);
 const arr=[...glAlbumMap().values()].filter(a=>a.uri).sort((x,y)=>y.items.length-x.items.length),dup={};arr.forEach(a=>dup[a.name]=(dup[a.name]||0)+1);
 arr.forEach((a,n)=>{const w=glTh(a.items[0]||null,'mini2'),b=h('button','glpkr',null,w,h('div',null,null,h('b',null,a.name),h('small',null,plural(a.items.length,'picture')+(dup[a.name]>1||gfile(a.uri)?' · '+(gpath(a.uri)||'storage'):''))));
  b.onclick=()=>done({uri:a.uri,name:a.name});L.append(b);if(n<30){w._vis=true;w._b=1;glLoadThumb(w)}});
 s.querySelector('.ib').onclick=()=>done(null);s.onclick=e=>{if(e.target===s)done(null)};s.classList.add('on');L.scrollTop=0})}

/* ---------- Originals tab ---------- */
function glOrigDraw(B,ti){const L=GL.orig||[];ti.lastChild.textContent=plural(L.length,'saved original')+(GL.loading?' · scanning…':'');B.classList.add('l-orig');
 if(!L.length){B.append(h('div','dnone',GL.loading?'Looking for saved originals…':"Nothing here yet. Before Conduint rewrites a picture's EXIF it keeps the original here."));return}
 const tot=L.reduce((a,x)=>a+(x.size||0),0),io=glIO(),fr=document.createDocumentFragment();
 const hd=h('div','glorh',null,h('span',null,fmt(tot)+' in '+plural(L.length,'file')));const da=h('button','chip glred','Delete all');da.onclick=()=>glOrigDelete(L.slice());hd.append(da);fr.append(hd);
 L.forEach(x=>{const row=h('div','glor'),th=glTh(x,''),from=x.rec?(gfile(x.rec.parent)?gpath(x.rec.parent):x.rec.pname||''):'',
   info=h('div','glr',null,h('b',null,x.oname),h('small',null,[gdate(x.at),x.size?fmt(x.size):'',from?'from '+from:''].filter(Boolean).join(' · ')));
  const rs=h('button','chip','Restore');rs.onclick=()=>glOrigRestore(x);
  const dl=h('button','ib',null,ico('trash'));dl.setAttribute('aria-label','Delete saved original');dl.onclick=()=>glOrigDelete([x]);
  row.append(th,info,rs,dl);th.onclick=info.onclick=()=>{try{open(x,L)}catch(e){toast(e.message)}};fr.append(row)});
 B.append(fr);B.querySelectorAll('.glth').forEach(w=>io.observe(w))}
async function glOrigDelete(L){if(!L.length)return;
 const tot=L.reduce((a,x)=>a+(x.size||0),0),r=await dlg({title:L.length===1?'Delete this saved original?':'Delete '+L.length+' saved originals?',msg:fmt(tot)+' will be freed. This cannot be undone.',ok:'Delete',danger:true});if(!r)return;
 const ok=await job('Deleting…',async()=>{await SAF.remove({uris:L.map(x=>x.uri)});return true});if(!ok)return;
 const gone=new Set(L.map(x=>x.name)),rc=gd().gorig||{};gone.forEach(n=>delete rc[n]);GL.orig=(GL.orig||[]).filter(x=>!gone.has(x.name));glSave();glDraw();toast('Deleted '+plural(L.length,'saved original')+'.')}
/* Restore: if the picture is still there, the original goes back over it and the version being replaced is kept as a new original (so Restore can be undone).
   If the picture is gone, the original is written back into its folder (or a folder you choose). */
async function glOrigRestore(x){
 let rec=x.rec,mode='over',dst=null;
 if(rec&&rec.from){try{await SAF.stat({uri:rec.from})}catch{mode='recreate'}}else mode='ask';
 if(mode!=='over'){let dir=rec&&rec.parent;if(dir){try{await SAF.stat({uri:dir})}catch{dir=null}}
  if(!dir){const d=await glPkAsk('Restore '+x.oname+' to…');if(!d)return;dir=d.uri}dst={dir,name:(rec&&rec.name)||x.oname}}
 else{const r=await dlg({title:'Restore this original?',msg:'It replaces the current picture. The current version is kept as a new original first, so you can switch back.',ok:'Restore'});if(!r)return}
 let ni=null;
 const ok=await job('Restoring…',async()=>{const bytes=await xfBytes({uri:x.uri,name:x.name});
  if(mode==='over'){const cur={uri:rec.from,name:rec.name||x.oname,m:rec.m,parent:rec.parent,pname:rec.pname},old=await xfBytes(cur);
   if(!await xfBackup(cur,old))throw Error('The current version could not be kept, so nothing was changed.');
   await SAF.writeUri({uri:rec.from,b64:xfB64(bytes)});const st=await SAF.stat({uri:rec.from});
   const it=(GL.items||[]).find(i=>gk(i)===rec.from);if(it){it.size=st.size||bytes.length;it.mtime=st.mtime||Date.now()}}
  else{const w=await SAF.writeFile({dir:dst.dir,name:dst.name,b64:xfB64(bytes),mime:mimeOf(dst.name)});let st={};try{st=await SAF.stat({uri:w.uri})}catch{}
   ni={uri:w.uri,name:st.name||dst.name,size:st.size||bytes.length,mtime:st.mtime||Date.now(),parent:dst.dir,pname:gfile(dst.dir)?gbase(dst.dir):'',path:[gfile(dst.dir)?gbase(dst.dir):''],fs:gfile(w.uri)};
   if(GL.items)GL.items.push(ni)}
  await SAF.remove({uris:[x.uri]});const rc=gd().gorig||{};delete rc[x.name];return true});
 if(!ok)return;libReset&&libReset();glSave();toast(mode==='over'?'Original restored. The version it replaced is in Originals.':'Original restored as '+(ni?ni.name:x.oname)+'.');
 await glOrigLoad(true);glHomeRefresh()}

/* ---------- settings sheet ---------- */
function glSetBuild(){const g=$('#gl');if(!g)return;let s=$('#glset');if(s)s.remove();s=h('div','glset');s.id='glset';
 s.onclick=e=>{if(e.target===s)glSetShow(false)};s.append(h('div','glsetb'));g.append(s)}
function glSetShow(on){GL.set=!!on;const s=$('#glset');if(!s)return;s.classList.toggle('on',GL.set);if(GL.set)glSetPaint()}
function glSetPaint(){const b=$('#glset .glsetb');if(!b)return;b.replaceChildren();const gs=gset();
 const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Close settings');x.onclick=()=>glSetShow(false);
 b.append(h('div','xfgrab'),h('div','glseth',null,h('b',null,'Gallery settings'),x));
 const body=h('div','glsetl');b.append(body);
 const seg=(lb,opts,cur,f)=>{const r=h('div','glsr col',null,h('span',null,lb)),c=h('div','glsg');opts.forEach(([v,t])=>{const k=h('button','chip'+(v===cur?' on':''),t);k.onclick=()=>{f(v);glSetPaint()};c.append(k)});r.append(c);body.append(r)};
 const sw=(lb,sub,key)=>{const on=!!gs[key],r=h('button','glsr',null,h('div',null,null,h('b',null,lb),h('small',null,sub)),h('span','glsw'+(on?' on':''),null,h('i')));r.setAttribute('role','switch');r.setAttribute('aria-checked',on?'true':'false');
  r.onclick=()=>{gsetPut(key,!on);glSetPaint();if(GL.open)glRedraw()};body.append(r)};
 seg('Group by date',[['none','None'],['day','Day'],['month','Month'],['year','Year']],gs.group,v=>{gsetPut('group',v);glRedraw()});
 seg('Layout',GLAY,glLay(),v=>{gd().glay=v;glSave();GL.lim=150;glRedraw()});
 seg('Picture size',[['s','Small'],['m','Medium'],['l','Large']],gs.size,v=>{gsetPut('size',v);GL.lim=150;glRedraw()});
 seg('Picture fit',[['cover','Fill the tile'],['contain','Whole picture']],gs.fit,v=>{gsetPut('fit',v);glRedraw()});
 sw('Show file names','On Tiny and Grid tiles','names');sw('Show favourite hearts','A small heart on favourite pictures','hearts');
 sw('Keep location when cropping','Crop and rotate copies the EXIF, GPS included','cropGps');
 const n=GL.orig?GL.orig.length:null,tot=GL.orig?GL.orig.reduce((a,y)=>a+(y.size||0),0):0;
 const or=h('button','glsr',null,h('div',null,null,h('b',null,'Saved originals'),h('small',null,n==null?'Open to scan':plural(n,'file')+' · '+fmt(tot))),ico('chup','glchev'));or.onclick=()=>{glSetShow(false);glGoTab('orig')};body.append(or);
 const rs=h('button','glsr',null,h('div',null,null,h('b',null,'Rescan pictures'),h('small',null,'Look for new and removed files')));rs.onclick=()=>{glSetShow(false);libReset&&libReset();GL.hid=null;GL.orig=null;glLoad(true)};body.append(rs);
 const rd=h('button','glsr danger',null,h('div',null,null,h('b',null,'Reset gallery settings'),h('small',null,'Favourites, categories and albums are kept')));rd.onclick=()=>{gd().gset={};gd().glay='grid';gd().gsort='new';glSave();glSetPaint();if(GL.open)glRedraw()};body.append(rd)}

/* ---------- Home: a small Gallery card (latest pictures) and your pinned categories ---------- */
function glHome(){const d=h('div','glhome');d.id='glhome';glFill(d);if(!GL.items&&typeof NATIVE!=='undefined'&&NATIVE)setTimeout(()=>glLoad(false,true),1800);return d}
function glFill(d){d.replaceChildren();
 const rec=(GL.items||[]).slice().sort(gnew).slice(0,5);
 const c=h('button','glcard',null,h('span','glcl',null,ico('image'),h('div',null,null,h('b',null,'Gallery'),h('small',null,GL.items?plural(GL.items.length,'picture')+' · Albums · Favourites':'Photos, albums, favourites'))),
  h('span','glrec'));
 rec.forEach(i=>c.lastChild.append(glTh(i,'mini')));c.onclick=glOpen;d.append(c);
 const pc=gcats().filter(x=>x.pin);if(pc.length){const r=h('div','glpins');pc.forEach(x=>{const t=h('button','glpt',null,glTh(x.items[0]||null,'mini2'),h('b',null,x.name),ico('pin','glpin'));t.onclick=()=>{glOpen();glGoTab('cats');GL.cat=x.id;glDraw()};r.append(t)});d.append(r)}
 const ws=d.querySelectorAll('.glth');if(ws.length){if(!GL.hio)GL.hio=new IntersectionObserver(es=>es.forEach(e=>{const w=e.target;w._vis=e.isIntersecting;if(e.isIntersecting&&!w._b&&!w.querySelector('img')){w._b=1;glLoadThumb(w)}else if(!e.isIntersecting)glRelease(w)}));ws.forEach(w=>GL.hio.observe(w))}}
function glHomeRefresh(){const d=$('#glhome');if(d)glFill(d)}
