/* console.js: the Fezzy Music Console (V0.16.0). A bottom-right sheet (like the browser sheet) that opens from the Console button on Home.
   Top: Sync folder, a cyan pulse line that follows the music, Shuffle. Then search, a thumbnail track list (tap to pick / un-pick),
   Add to a playlist and Play. Below: the CFX console (red buttons: bass, beat, vocals, treble, volume). Pressing Play sends it away
   and the Home music player takes over. The Home player itself is not changed. */
const CN={open:false,view:'songs',sel:new Map(),target:null,exp:null,arr:false,q:'',lim:60,raf:0,lt:0,ctx:null,f:[],gn:null,an:null,td:null,fx:false,
 io:null,tq:[],tb:0,poll:0,wl:null,qt:0,hz:[60,230,910,3600,14000]};
const EQP={flat:[0,0,0,0,0],bass:[7,5,1,0,0],treble:[0,0,0,5,7],vocal:[-2,0,5,3,-1],rock:[5,3,-2,3,5],pop:[-1,3,5,2,-1],jazz:[3,2,-2,2,4],electronic:[6,4,0,2,5]};
const EQN={flat:'Flat',bass:'Bass',treble:'Treble',vocal:'Vocal',rock:'Rock',pop:'Pop',jazz:'Jazz',electronic:'Electronic'};
const cnE=()=>{const e=(S.dash.eq=S.dash.eq||{on:false,p:'flat',g:[0,0,0,0,0],vol:1});if(e.vol==null)e.vol=1;return e};
const cnPls=()=>(S.dash.pls=S.dash.pls||[]);
const cnKey=i=>i.uri||i.name;

/* ---------- audio engine: 5 filters + a volume boost + an analyser (Web Audio). Never allowed to throw into the app. ---------- */
function eqInit(){if(CN.ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
 try{const c=new AC(),src=c.createMediaElementSource(pv);let prev=src;
  CN.f=CN.hz.map((hz,i)=>{const f=c.createBiquadFilter();f.type=i===0?'lowshelf':i===4?'highshelf':'peaking';f.frequency.value=hz;if(i&&i<4)f.Q.value=1;prev.connect(f);prev=f;return f});
  const gn=c.createGain();prev.connect(gn);const an=c.createAnalyser();an.fftSize=128;an.smoothingTimeConstant=.8;gn.connect(an);an.connect(c.destination);
  /* Android can suspend the context; sound stays silent until it is resumed, so it is resumed whenever it drops while a song plays */
  c.onstatechange=()=>{if(c.state!=='running'&&!pv.paused)c.resume().catch(()=>{})};
  CN.ctx=c;CN.gn=gn;CN.an=an;CN.td=new Uint8Array(an.fftSize);eqApply();return true}catch(e){return false}}
function eqApply(){const e=cnE();CN.f.forEach((f,i)=>{f.gain.value=e.on?e.g[i]:0});if(CN.gn)CN.gn.gain.value=e.on?e.vol:1}
const eqResume=()=>{if(CN.ctx&&CN.ctx.state!=='running')CN.ctx.resume().catch(()=>{})};
pv.addEventListener('play',()=>{if(cnE().on||CN.open){if(eqInit())eqResume()}wlOn()});
/* ---------- wake lock: while a song plays the processor is held awake (native); the console also keeps the screen on while it is open ---------- */
function wlOn(){try{if(typeof NATIVE!=='undefined'&&NATIVE&&TOOLS&&TOOLS.wakeLock)TOOLS.wakeLock({cpu:true,screen:!!S.settings.screen}).catch(()=>{})}catch{}}
function wlOff(){try{if(pv.paused&&typeof applyPower==='function')applyPower()}catch{}}
pv.addEventListener('pause',()=>setTimeout(wlOff,4000));pv.addEventListener('ended',()=>setTimeout(wlOff,4000));
async function scrOn(){try{if(navigator.wakeLock&&!CN.wl&&CN.open){CN.wl=await navigator.wakeLock.request('screen');CN.wl.onrelease=()=>{CN.wl=null}}}catch{}}
function scrOff(){try{if(CN.wl)CN.wl.release()}catch{}CN.wl=null}
/* ---------- keep the app from freezing: pause the heavy stuff when hidden, give memory back, resume sound when it returns ---------- */
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){cancelAnimationFrame(CN.raf);CN.raf=0;CN.tq.splice(0).forEach(j=>j(true));try{THUMB.mem.clear()}catch{}}
 else{eqResume();if(CN.open){cnLoop();scrOn()}}});
addEventListener('unhandledrejection',e=>{e.preventDefault()});

/* ---------- open / close: a bottom-right sheet ---------- */
function cnOpen(){const c=$('#cn');if(!c)return;CN.open=true;c.classList.remove('out');c.classList.add('on');document.body.classList.add('cnon');
 eqInit();eqResume();cnBuild();cnLoop();scrOn();clearInterval(CN.poll);
 CN.poll=setInterval(()=>{if(CN.open&&CN.view==='songs'&&DASH.state==='sync')cnDrawList()},1500)}
function cnClose(anim){const c=$('#cn');if(!CN.open)return;CN.open=false;document.body.classList.remove('cnon');cancelAnimationFrame(CN.raf);CN.raf=0;clearInterval(CN.poll);scrOff();
 CN.tq.splice(0).forEach(j=>j(true));if(CN.io){CN.io.disconnect();CN.io=null}
 if(anim){c.classList.add('out');setTimeout(()=>{if(!CN.open)c.classList.remove('on','out')},300)}else c.classList.remove('on','out')}
function cnBuild(){const c=$('#cn');c.replaceChildren();
 const gr=h('button','cmgrab',null,h('i'));gr.setAttribute('aria-label','Close console');gr.onclick=()=>cnClose(true);
 const x=h('button','ib cmx',null,ico('x'));x.setAttribute('aria-label','Close console');x.onclick=()=>cnClose(true);
 const hd=h('div','cmhd',null,h('div','cmti',null,h('b',null,'Conduint'),h('small',null,'Fezzy Music Console')),x);
 /* top tabs: Sync folder · cyan pulse line · Shuffle */
 const sy=h('button','chip cmtab',null,ico('tune'),h('span',null,'Sync folder'));sy.onclick=()=>{if(typeof syncMenu==='function')syncMenu()};
 const pc=document.createElement('canvas');pc.id='cnpulse';pc.className='cmpulse';pc.width=200;pc.height=52;
 const sh=h('button','chip cmtab cmred',null,h('span',null,'⤮ Shuffle'));sh.onclick=()=>{const q=cnPickQ();cnPlayQ(q,true)};
 const st=h('div','cmstrip',null,sy,pc,sh);
 const sg=h('div','cmseg'),a=h('button',CN.view==='songs'?'on':'','Songs'),b=h('button',CN.view==='pls'?'on':'','Playlists');
 a.onclick=()=>{CN.view='songs';cnBuild()};b.onclick=()=>{CN.view='pls';cnBuild()};sg.append(a,b);
 const body=h('div','cmbody');body.id='cmbody';c.append(gr,hd,st,sg,body);cnBody()}
function cnBody(){const B=$('#cmbody');if(!B)return;B.replaceChildren();
 if(CN.view==='pls'){B.append(cnPlPanel());return}
 const q=document.createElement('input');q.type='search';q.placeholder='Search songs…';q.autocomplete='off';q.spellcheck=false;q.value=CN.q;q.className='cmq';
 q.oninput=()=>{clearTimeout(CN.qt);CN.qt=setTimeout(()=>{CN.q=q.value;CN.lim=60;cnDrawList()},180)};
 const info=h('div','cminfo');info.id='cninfo';const pk=h('div','cmpick');pk.id='cnpick';
 const list=h('div','cmlist');list.id='cnlist';
 const bar=h('div','cmbar'),sa=h('button','chip','All shown'),cl=h('button','chip','Clear'),ad=h('button','chip cmadd','Add'),pp=h('button','chip cmplay','▶ Play');
 ad.id='cnadd';sa.onclick=()=>{cnHits().slice(0,400).forEach(i=>CN.sel.set(cnKey(i),i));cnDrawList()};cl.onclick=()=>{CN.sel.clear();cnDrawList()};ad.onclick=cnAdd;pp.onclick=()=>cnPlayQ(cnPickQ(),false);
 bar.append(sa,cl,ad,pp);B.append(q,info,pk,list,bar,cnFxPanel());cnDrawPick();cnDrawList()}
/* ---------- playlists view ---------- */
const cnDrawPl=()=>{if(CN.view!=='pls')return;const B=$('#cmbody');if(B){B.replaceChildren(cnPlPanel())}};
/* ---------- [2] PLAYLISTS ---------- */
async function cnCreate(){
 const r=await dlg({title:'Create playlist',msg:'Name it, then pick its songs in the console below.',value:'',ok:'Create'});if(!r)return;
 const n=(r.v||'').trim();if(!n)return toast('Give the playlist a name.');
 const pl={id:Date.now().toString(36),name:n,songs:[]};cnPls().push(pl);CN.target=pl.id;CN.exp=pl.id;CN.arr=false;CN.view='songs';dsave();cnBody()}
function cnPlay(pl,i){const by=new Map(DASH.songs.map(s=>[cnKey(s),s])),q=pl.songs.map(s=>by.get(cnKey(s))||{...s,fs:true});
 if(!q.length)return toast('Add songs to this playlist first.');
 if(i<0){plSet('pShuf',true);i=Math.floor(Math.random()*q.length)}else if(i===0)plSet('pShuf',false);
 cnClose(true);openMedia(q[i],q)}
function cnPlRow(pl){const ex=CN.exp===pl.id,r=h('div','cnpr'+(ex?' ex':'')),
 hd=h('button','cnprh',null,h('span','led'+(ex?' on':'')),h('b',null,pl.name),h('small',null,plural(pl.songs.length,'song')),ico(ex?'chup':'chdown'));
 hd.onclick=()=>{CN.exp=ex?null:pl.id;CN.arr=false;cnDrawPl()};r.append(hd);if(!ex)return r;
 const bar=h('div','cnpa'),b=(t,f,c)=>{const x=h('button','chip'+(c?' '+c:''),t);x.onclick=f;bar.append(x)};
 b('▶ Play',()=>cnPlay(pl,0),'on');b('Shuffle',()=>cnPlay(pl,-1));b('+ Songs',()=>{CN.target=pl.id;CN.arr=false;CN.view='songs';cnBody()});
 b('Rename',async()=>{const x=await dlg({title:'Rename playlist',value:pl.name,ok:'Save'});if(x&&x.v&&x.v.trim()){pl.name=x.v.trim();dsave();cnDrawPl()}});
 b('Delete',async()=>{const x=await dlg({title:'Delete "'+pl.name+'"?',msg:'Your songs are not touched.',ok:'Delete',danger:true});if(!x)return;
  S.dash.pls=cnPls().filter(p=>p.id!==pl.id);if(CN.target===pl.id)CN.target=null;CN.exp=null;dsave();cnDrawPl()});
 const tabs=h('div','cntabs'),t1=h('button',CN.arr?'':'on','Songs'),t2=h('button',CN.arr?'on':'','Arrange');
 t1.onclick=()=>{CN.arr=false;cnDrawPl()};t2.onclick=()=>{CN.arr=true;cnDrawPl()};tabs.append(t1,t2);
 const list=h('div','cnsl');
 if(!pl.songs.length)list.append(h('div','dnone','Empty. Tap + Songs to pick tracks.'));
 pl.songs.forEach((s,i)=>{const n=h('div','cnsr'),nm=h('b',null,nameOf(s.name));
  if(!CN.arr){n.classList.add('tap');n.append(h('small',null,String(i+1)),nm);n.onclick=()=>cnPlay(pl,i)}
  else{const mv=(d)=>{const j=i+d;if(j<0||j>=pl.songs.length)return;[pl.songs[i],pl.songs[j]]=[pl.songs[j],pl.songs[i]];dsave();cnDrawPl()};
   const ub=h('button','ib',null,ico('chup')),db=h('button','ib',null,ico('chdown')),xb=h('button','ib',null,ico('x'));
   ub.onclick=()=>mv(-1);db.onclick=()=>mv(1);xb.onclick=()=>{pl.songs.splice(i,1);dsave();cnDrawPl()};
   n.append(h('small',null,String(i+1)),nm,ub,db,xb)}
  list.append(n)});
 r.append(bar,tabs,list);return r}


function cnPlPanel(){const p=h('div','cmpl'),top=h('div','cmph',null,h('b',null,'Playlists'),h('small',null,plural(cnPls().length,'playlist'))),
 mk=h('button','chip cmadd cnmk',null,ico('plus'),h('span',null,'Create Playlist'));mk.onclick=cnCreate;top.append(mk);p.append(top);
 if(!cnPls().length)p.append(h('div','dnone','No playlists yet. Tap Create Playlist, then pick songs.'));
 cnPls().forEach(pl=>p.append(cnPlRow(pl)));return p}
/* ---------- songs: search, thumbnails, pick, add, play ---------- */
function cnHits(){const terms=norm(CN.q).split(' ').filter(Boolean);let hit=DASH.songs;
 if(terms.length){const sc=new Map();let mx=0;hit.forEach(i=>{const t=norm(nameOf(i.name)+' '+(i.pname||'')),n=terms.filter(w=>t.includes(w)).length;sc.set(i,n);if(n>mx)mx=n});hit=mx?hit.filter(i=>sc.get(i)===mx):[]}
 return hit}
function cnPickQ(){return CN.sel.size?[...CN.sel.values()]:cnHits()}
function cnInfo(n){const f=$('#cninfo'),a=$('#cnadd');if(f)f.textContent=CN.sel.size+' picked · '+(n==null?'':plural(n,'song')+' shown');
 if(a){a.textContent='Add'+(CN.sel.size?' ('+CN.sel.size+')':'');a.classList.toggle('ready',CN.sel.size>0)}}
function cnDrawPick(){const P=$('#cnpick');if(!P)return;P.replaceChildren(h('small',null,'Add to'));
 const nw=h('button','chip'+(CN.target?'':' on'),'New');nw.onclick=()=>{CN.target=null;cnDrawPick()};P.append(nw);
 cnPls().forEach(pl=>{const c=h('button','chip'+(CN.target===pl.id?' on':''),pl.name);c.onclick=()=>{CN.target=pl.id;cnDrawPick()};P.append(c)})}
function cnTApply(r,b){const w=r.firstChild;if(!w||w.querySelector('img'))return;const im=new Image();im.alt='';im.decoding='async';im.draggable=false;
 im.onload=()=>w.classList.add('ok');im.onerror=()=>{im.remove();w.classList.remove('ok')};im.src='data:image/jpeg;base64,'+b;w.append(im)}
function cnTRelease(r){const w=r.firstChild,im=w&&w.querySelector('img');if(im){im.onload=im.onerror=null;im.removeAttribute('src');im.remove()}if(w)w.classList.remove('ok');r._b=0}
function cnPump(){while(CN.tb<2&&CN.tq.length){const j=CN.tq.pop();CN.tb++;Promise.resolve().then(()=>j()).catch(()=>{}).finally(()=>{CN.tb--;cnPump()})}}
async function cnTLoad(r){const i=r._i;if(!i||!i.uri||typeof thumbOn!=='function'||!thumbOn())return;
 const key=i.uri+'|'+i.size+'|'+i.mtime+'|96';let b=THUMB.mem.get(key)||await tget(key);
 if(!b){const bt=THUMB.bad.get(key);if(bt&&Date.now()-bt<20000){r._b=0;return}
  b=await new Promise(res=>{CN.tq.push(async skip=>{if(skip||!r.isConnected||!r._vis){res('');return}let x='';try{const q=await SAF.thumb({uri:i.uri,kind:'aud',name:i.name,size:96});x=(q&&q.b64)||''}catch{}res(x)});cnPump()});
  if(b){thumbMem(key,b);tput(key,b)}else THUMB.bad.set(key,Date.now())}
 r._b=0;if(b&&r.isConnected&&r._vis)cnTApply(r,b)}
function cnIO(){if(!CN.io)CN.io=new IntersectionObserver(es=>es.forEach(e=>{const r=e.target;r._vis=e.isIntersecting;if(e.isIntersecting){if(!r._b&&!(r.firstChild&&r.firstChild.querySelector('img'))){r._b=1;cnTLoad(r)}}else cnTRelease(r)}),{root:$('#cnlist'),rootMargin:'160px'});return CN.io}
function cnDrawList(){const L=$('#cnlist');if(!L)return;if(CN.io)CN.io.disconnect();CN.tq.splice(0).forEach(j=>j(true));L.replaceChildren();const hit=cnHits();
 if(DASH.state==='sync'&&!DASH.songs.length){L.append(h('div','dnone','Loading your songs…'));return cnInfo(0)}
 if(!DASH.songs.length){L.append(h('div','dnone','Nothing synced yet. Tap Sync folder above.'));return cnInfo(0)}
 if(!hit.length)L.append(h('div','dnone','No song with that name.'));
 const io=cnIO(),fr=document.createDocumentFragment();
 hit.slice(0,CN.lim).forEach(i=>{const k=cnKey(i),on=CN.sel.has(k),
  r=h('button','cmrow'+(on?' sel':''),null,h('span','cmth',null,h('i',null,'♪')),h('div','cmrt',null,h('b',null,nameOf(i.name)),h('small',null,i.pname||'')),h('span','ck'+(on?' on':''),null,ico('check')));
  r._i=i;r.onclick=()=>{if(CN.sel.has(k))CN.sel.delete(k);else CN.sel.set(k,i);const s=CN.sel.has(k);r.classList.toggle('sel',s);r.lastChild.classList.toggle('on',s);cnInfo(hit.length)};fr.append(r)});
 if(hit.length>CN.lim){const m=h('button','chip cmmore','Show more ('+(hit.length-CN.lim)+' left)');m.onclick=()=>{CN.lim+=100;cnDrawList()};fr.append(m)}
 L.append(fr);L.querySelectorAll('.cmrow').forEach(r=>io.observe(r));cnInfo(hit.length)}
async function cnAdd(){
 if(!CN.sel.size)return toast('Tap songs to pick them first.');
 let pl=cnPls().find(x=>x.id===CN.target);
 if(!pl){const r=await dlg({title:'Name your playlist',msg:plural(CN.sel.size,'song')+' picked.',value:'',ok:'Add'});if(!r)return;
  pl={id:Date.now().toString(36),name:(r.v||'').trim()||'Playlist '+(cnPls().length+1),songs:[]};cnPls().push(pl);CN.target=pl.id}
 const have=new Set(pl.songs.map(cnKey));let n=0;
 CN.sel.forEach((s,k)=>{if(!have.has(k)){pl.songs.push({uri:s.uri,name:s.name,size:s.size,mime:s.mime,pname:s.pname,fs:s.fs});n++}});
 CN.sel.clear();CN.exp=pl.id;dsave();cnDrawPick();cnDrawList();toast('Added '+plural(n,'song')+' to '+pl.name+'.')}
function cnPlayQ(q,shuf){if(!q.length)return toast('Pick songs first.');plSet('pShuf',!!shuf);const i=shuf?Math.floor(Math.random()*q.length):0;cnClose(true);openMedia(q[i],q)}
/* ---------- CFX console: red buttons in a black box. Each step = 2 dB (volume = x0.2) ---------- */
const CFX=[['BASS',[0]],['BEAT',[1]],['VOCALS',[2,3]],['TREBLE',[4]],['VOLUME',null]];
function fxStep(k,d){if(!eqInit())return toast('The equaliser is not available on this device.');const e=cnE();e.on=true;e.p='custom';
 if(k==='VOLUME')e.vol=Math.max(.4,Math.min(2.5,Math.round((e.vol+d*.2)*10)/10));
 else CFX.find(x=>x[0]===k)[1].forEach(i=>{e.g[i]=Math.max(-12,Math.min(12,e.g[i]+d*2))});
 eqApply();eqResume();dsave();cnDrawFx()}
function fxVal(k){const e=cnE();if(k==='VOLUME')return{t:'×'+e.vol.toFixed(1),n:Math.round((e.vol-.4)/2.1*6)};
 const g=e.g[CFX.find(x=>x[0]===k)[1][0]];return{t:(g>0?'+':'')+g+' dB',n:Math.round((g+12)/24*6)}}
const cnDrawFx=()=>{const o=$('#cn .cmfx');if(o)o.replaceWith(cnFxPanel())};
function cnFxPanel(){const e=cnE(),p=h('div','cmfx'+(CN.fx?'':' shut')),hd=h('div','cmfxh');
 const t=h('button','cmfxt',null,h('span','led on'),h('b',null,'FX CONSOLE'),h('small',null,e.on?'Shaping your sound':'Off'),h('span','cmchev',CN.fx?'▾':'▴'));t.onclick=()=>{CN.fx=!CN.fx;cnDrawFx()};
 const sw=h('button','cmrb'+(e.on?' on':''),e.on?'ON':'OFF');sw.onclick=()=>{if(!e.on&&!eqInit())return toast('The equaliser is not available on this device.');e.on=!e.on;eqResume();eqApply();dsave();cnDrawFx()};
 hd.append(t,sw);p.append(hd);if(!CN.fx)return p;
 const pr=h('div','cmpre');Object.keys(EQP).forEach(k=>{const c=h('button','cmrb'+(e.on&&e.p===k?' on':''),EQN[k]);
  c.onclick=()=>{if(!eqInit())return toast('The equaliser is not available on this device.');e.g=[...EQP[k]];e.p=k;e.on=k!=='flat'||e.on;eqResume();eqApply();dsave();cnDrawFx()};pr.append(c)});
 const gr=h('div','cmfxg');CFX.forEach(([k])=>{const v=fxVal(k),c=h('div','cmfc'),lv=h('div','cmlv');
  for(let i=0;i<6;i++)lv.append(h('i',i<v.n?'on':''));
  const m=h('button','cmrb',null,h('span',null,'−')),pl=h('button','cmrb',null,h('span',null,'+'));m.setAttribute('aria-label',k+' down');pl.setAttribute('aria-label',k+' up');
  m.onclick=()=>fxStep(k,-1);pl.onclick=()=>fxStep(k,1);c.append(h('b',null,k),lv,h('small',null,v.t),h('div','cmfb',null,m,pl));gr.append(c)});
 const rs=h('button','cmrb cmrs','Reset');rs.onclick=()=>{e.g=[0,0,0,0,0];e.vol=1;e.p='flat';eqApply();dsave();cnDrawFx()};
 p.append(pr,gr,rs);return p}
/* ---------- the cyan pulse line: follows the music, a slow heartbeat while nothing plays. ~25 fps, stops when the sheet closes or the app is hidden ---------- */
function cnLoop(){cancelAnimationFrame(CN.raf);if(CN.open&&!document.hidden)CN.raf=requestAnimationFrame(cnFrame)}
function cnFrame(t){CN.raf=0;if(!CN.open||document.hidden)return;CN.raf=requestAnimationFrame(cnFrame);if(t-CN.lt<40)return;CN.lt=t;
 const cv=$('#cnpulse');if(!cv)return;const g=cv.getContext('2d'),w=cv.width,hh=cv.height,mid=hh/2;g.clearRect(0,0,w,hh);
 let live=false;if(CN.an&&!pv.paused){try{CN.an.getByteTimeDomainData(CN.td);live=true}catch{}}
 g.lineWidth=2.5;g.lineJoin='round';g.strokeStyle='#00e5ff';g.shadowColor='#00e5ff';g.shadowBlur=8;g.beginPath();
 const s=t/1000;for(let x=0;x<=w;x+=3){let y;
  if(live){const v=(CN.td[Math.floor(x/w*(CN.td.length-1))]-128)/128;y=mid+v*mid*1.6}
  else{const p=((x/w)-((s*.35)%1)+1)%1,b=Math.exp(-Math.pow((p-.5)*14,2));y=mid-b*mid*.8*Math.sin(p*60)}
  x?g.lineTo(x,y):g.moveTo(x,y)}g.stroke()}
