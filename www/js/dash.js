/* dash.js: the Dashboard, the front page. Files desk (six tiles, V0.45.0), music sync + search, weather + one-week calendar, your folders, wallpapers, Quick tools widget (quick.js).
   Shown whenever nothing is open (no storage, no library). Back from anywhere ends up here; back again exits.
   Reads the player through its globals (Q, qi, pv, ps, pl) and the shared library walk (scan / libAll). */
const DASH={built:false,songs:[],recent:[],docs:[],tick:null,month:null,sel:null,loaded:0,lk:''};
S.dash=S.dash||{};
const dsave=()=>{S.dash=S.dash||{};save()};
const D$=s=>$('#dash '+s);
const isHome=()=>!cur.m&&!cur.cat;
function goHome(){cur={...EMPTY};begin();items=[];err=null;draw();side()}

/* ---------- background: five built-in wallpapers (Ocean, Desert, Companies, The Streets, The Sky), faded into the page ---------- */
const rng=seed=>{let r=seed;return()=>(r=(r*16807)%2147483647)/2147483647};
const lg=(id,stops,x2,y2)=>'<linearGradient id="'+id+'" x1="0" y1="0" x2="'+(x2||0)+'" y2="'+(y2||1)+'">'+stops.map(([o,c])=>'<stop offset="'+o+'" stop-color="'+c+'"/>').join('')+'</linearGradient>';
const rg=(id,c)=>'<radialGradient id="'+id+'"><stop offset="0" stop-color="'+c+'" stop-opacity=".95"/><stop offset="1" stop-color="'+c+'" stop-opacity="0"/></radialGradient>';
const svgUrl=(defs,body)=>'url("data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" preserveAspectRatio="xMidYMax slice"><defs>'+defs+'</defs>'+body+'</svg>')+'")';
const ridge=(r,y,amp,col,step)=>{let d='M0 '+(y+r()*amp);for(let x=step;x<=720+step;x+=step)d+=' L'+x+' '+(y+r()*amp);return '<path d="'+d+' L720 1280 L0 1280Z" fill="'+col+'"/>'};
const dune=(r,y,amp,col)=>{let d='M-20 '+(y+amp)+' ';for(let x=-20;x<760;x+=150){const px=x+75,py=y-r()*amp,nx=x+150,ny=y+(r()-.3)*amp;d+='Q'+px+' '+py+' '+nx+' '+ny+' '}return '<path d="'+d+'L760 1280 L-20 1280Z" fill="'+col+'"/>'};

function wallOcean(){const r=rng(11);let w='',refl='';
 for(let i=0;i<16;i++){const y=670+i*38,a=6+i*1.6;w+='<path d="M-40 '+y+' Q50 '+(y-a)+' 140 '+y+' T320 '+y+' T500 '+y+' T680 '+y+' T860 '+y+'" fill="none" stroke="#ffffff" stroke-opacity="'+(.05+i*.012).toFixed(2)+'" stroke-width="'+(1.5+i*.25).toFixed(1)+'"/>'}
 for(let i=0;i<22;i++){const y=655+i*17,wd=(150-i*5)*(.4+r()*.9);refl+='<rect x="'+(360-wd/2)+'" y="'+y+'" width="'+wd+'" height="4" rx="2" fill="#ffd9a0" opacity="'+(.7-i*.028).toFixed(2)+'"/>'}
 return svgUrl(lg('s',[[0,'#020f1f'],[.35,'#0a4a6a'],[.62,'#f0a15f'],[.75,'#ffd7a0']])+lg('o',[[0,'#0a7d97'],[1,'#021622']])+rg('g','#ffe2b0'),
  '<rect width="720" height="1280" fill="url(#s)"/><circle cx="360" cy="620" r="170" fill="url(#g)"/><circle cx="360" cy="630" r="62" fill="#fff0cf"/><rect y="640" width="720" height="640" fill="url(#o)"/>'+w+refl+'<rect y="636" width="720" height="5" fill="#ffd7a0" opacity=".5"/>')}

function wallDesert(){const r=rng(23);let st='';for(let i=0;i<40;i++)st+='<circle cx="'+(r()*720)+'" cy="'+(r()*360)+'" r="'+(.6+r()*1.4)+'" fill="#fff" opacity="'+(.3+r()*.5).toFixed(2)+'"/>';
 return svgUrl(lg('s',[[0,'#150b2b'],[.4,'#8a2f2a'],[.62,'#e8742a'],[.74,'#ffc15a']])+rg('g','#ffd27a'),
  '<rect width="720" height="1280" fill="url(#s)"/>'+st+'<circle cx="470" cy="690" r="230" fill="url(#g)"/><circle cx="470" cy="700" r="84" fill="#fff1c0"/>'+
  dune(r,760,60,'#a8481f')+dune(r,860,80,'#8a3a19')+dune(r,980,90,'#6a2c14')+dune(r,1100,100,'#471c0e')+dune(r,1210,70,'#2a1008'))}

function wallCompanies(){const r=rng(7);let b='';
 for(let layer=0;layer<2;layer++){for(let x=-10;x<740;){const w=layer?44+r()*50:56+r()*70,hh=(layer?150:240)+r()*(layer?300:520),y=1280-hh;
  b+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+hh+'" fill="'+(layer?'#0a2230':'url(#gl)')+'" opacity="'+(layer?.7:1)+'"/>';
  if(!layer){b+='<rect x="'+(x+w/2-1)+'" y="'+(y-26)+'" width="2" height="26" fill="#0d3a4a"/><circle cx="'+(x+w/2)+'" cy="'+(y-28)+'" r="2.4" fill="#ff3b3b"/>';
   for(let wy=y+14;wy<1268;wy+=20)for(let wx=x+7;wx<x+w-9;wx+=14)if(r()<.34)b+='<rect x="'+wx+'" y="'+wy+'" width="7" height="10" fill="'+(r()<.8?'#00e5ff':'#ffd400')+'" opacity="'+(.25+r()*.65).toFixed(2)+'"/>'}
  x+=w+(layer?3:5)}}
 return svgUrl(lg('s',[[0,'#02060d'],[.62,'#06303c'],[1,'#0a6a7c']])+lg('gl',[[0,'#0b2733'],[1,'#04121a']],1,0),'<rect width="720" height="1280" fill="url(#s)"/>'+b)}

function wallStreets(){const r=rng(41);let b='';const vx=360,vy=650;
 const side=(sg)=>{const xo=sg<0?0:720,xi=sg<0?290:430;
  b+='<polygon points="'+xo+',40 '+xi+','+(vy-190)+' '+xi+','+(vy+70)+' '+xo+',1150" fill="#0a0b16"/>';
  for(let t=.06;t<.97;t+=.085){const x=xo+(xi-xo)*t,top=40+(vy-190-40)*t,bot=1150+(vy+70-1150)*t,hh=bot-top,ws=Math.max(6,30*(1-t));
   for(let f=.07;f<.93;f+=.095)if(r()<.38)b+='<rect x="'+(x-ws/2)+'" y="'+(top+hh*f)+'" width="'+ws+'" height="'+(ws*.9)+'" fill="'+(r()<.7?'#ffcf5a':'#00e5ff')+'" opacity="'+(.3+r()*.6).toFixed(2)+'"/>'}
  [[.3,'#ff2fa4',.5],[.55,'#00e5ff',.42],[.72,'#ffd400',.33]].forEach(([t,c,f])=>{const x=xo+(xi-xo)*t,top=40+(vy-190-40)*t,bot=1150+(vy+70-1150)*t,hh=bot-top,w=70*(1-t)+10;
   b+='<rect x="'+(x-w/2)+'" y="'+(top+hh*f)+'" width="'+w+'" height="'+(w*.34)+'" rx="3" fill="'+c+'" filter="url(#bl)" opacity=".95"/>'});
  [.1,.32,.55,.76].forEach(t=>{const x=sg<0?xo+(xi-xo)*t*.55+20:xo+(xi-xo)*t*.55-20,gy=1150+(vy+70-1150)*t,sc=1-t*.85;
   b+='<rect x="'+(x-2*sc)+'" y="'+(gy-300*sc)+'" width="'+(4*sc)+'" height="'+(300*sc)+'" fill="#12141f"/><circle cx="'+x+'" cy="'+(gy-300*sc)+'" r="'+(80*sc)+'" fill="url(#lamp)"/><circle cx="'+x+'" cy="'+(gy-300*sc)+'" r="'+(7*sc)+'" fill="#fff3c4"/>'})};
 side(-1);side(1);
 b+='<polygon points="-80,1280 800,1280 400,'+(vy+70)+' 320,'+(vy+70)+'" fill="url(#road)"/>';
 for(let i=0;i<9;i++){const t=i/9,y=1280-(1280-vy-70)*t*t*1.15,w=16*(1-t)+2,h2=60*(1-t)+4;b+='<rect x="'+(360-w/2)+'" y="'+y+'" width="'+w+'" height="'+h2+'" fill="#e8e8f0" opacity="'+(.7-t*.4).toFixed(2)+'"/>'}
 b+='<ellipse cx="360" cy="'+(vy+70)+'" rx="120" ry="30" fill="url(#lamp)" opacity=".7"/>';
 return svgUrl(lg('s',[[0,'#05060f'],[.5,'#1a0b2e'],[1,'#40135c']])+lg('road',[[0,'#05050a'],[1,'#1a1830']])+rg('lamp','#ffd88a')+'<filter id="bl"><feGaussianBlur stdDeviation="3"/></filter>','<rect width="720" height="1280" fill="url(#s)"/>'+b)}

function wallSky(){const r=rng(5);let c='',st='';
 for(let i=0;i<9;i++){const x=r()*720,y=140+i*105+r()*40,s=.7+r()*1.1;
  c+='<g opacity="'+(.35+r()*.4).toFixed(2)+'" filter="url(#bl)"><ellipse cx="'+x+'" cy="'+y+'" rx="'+(120*s)+'" ry="'+(26*s)+'" fill="#fff"/><ellipse cx="'+(x-50*s)+'" cy="'+(y-16*s)+'" rx="'+(60*s)+'" ry="'+(26*s)+'" fill="#fff"/><ellipse cx="'+(x+40*s)+'" cy="'+(y-22*s)+'" rx="'+(70*s)+'" ry="'+(30*s)+'" fill="#fff"/></g>'}
 for(let i=0;i<30;i++)st+='<circle cx="'+(r()*720)+'" cy="'+(r()*320)+'" r="'+(.6+r()*1.3)+'" fill="#fff" opacity="'+(.3+r()*.5).toFixed(2)+'"/>';
 return svgUrl(lg('s',[[0,'#071a44'],[.4,'#2563c9'],[.75,'#f08a8a'],[1,'#ffc58a']])+rg('g','#ffd9a8')+'<filter id="bl"><feGaussianBlur stdDeviation="14"/></filter>',
  '<rect width="720" height="1280" fill="url(#s)"/>'+st+'<circle cx="360" cy="1230" r="460" fill="url(#g)"/>'+c)}

const WALLS=[{id:'ocean',n:'Ocean',f:wallOcean},{id:'desert',n:'Desert',f:wallDesert},{id:'companies',n:'Companies',f:wallCompanies},{id:'streets',n:'The Streets',f:wallStreets},{id:'sky',n:'The Sky',f:wallSky}];
const WALLC={};
function dashBg(){const el=$('#dbg');if(!el)return;
 if(S.dash.bg){delete S.dash.bg;dsave()}/* V0.12.0: own pictures removed, the old saved one is dropped */
 const w=WALLS.find(x=>x.id===S.dash.wp)||WALLS[2];el.style.backgroundImage=WALLC[w.id]||(WALLC[w.id]=w.f())}
function wallNext(){const i=WALLS.findIndex(x=>x.id===S.dash.wp),n=WALLS[(i<0?2:i)+1]||WALLS[0];S.dash.wp=n.id;dsave();dashBg()}
async function wallMenu(){const cur=(WALLS.find(x=>x.id===S.dash.wp)||WALLS[2]).id;
 const r=await dlg({title:'Wallpaper',msg:'Pick the vibe for your home screen.',opts:WALLS.map(w=>[w.id,w.n]),val:cur,ok:'Use it'});
 if(!r||!r.o)return;S.dash.wp=r.o;dsave();dashBg()}

/* ---------- small builders ---------- */
const dsec=(t,sub,...x)=>h('div','dsec',null,h('b',null,t),h('small',null,sub||''),...x);
const card=(c,...k)=>h('div','dc '+(c||''),null,...k);
const dtile=(ic,t,sub,on,c)=>{const n=h('button','dc dtl '+(c||''),null,ico(ic),h('b',null,t),h('small',null,sub||''));n.onclick=on;return n};
const greet=()=>{const H=new Date().getHours();return H<5?'Working late':H<12?'Good morning':H<18?'Good afternoon':'Good evening'};

/* ---------- [1] FILES DESK: six permanent tiles (V0.45.0). Internal Storage, Documents, Gallery, Music, then Videos (under Gallery) and Downloads. ---------- */
function filesDesk(){
 const g=h('div','dgrid3 dfour');g.id='dfiles';
 const n=(x,w)=>x==null?'Tap to open':plural(x,w);
 const dl=mount('downloads'),dlIt={id:'slot:downloads',k:'slot',s:SLOTS.find(x=>x.id==='downloads')},intIt={id:'slot:internal',k:'slot',s:SLOTS.find(x=>x.id==='internal')};
 const six=[
  ['phone','Internal Storage',W.st?W.st.free+' free · '+Math.round(W.st.u*100)+'% used':'Open',()=>go('internal'),'internal'],
  ['doc','Documents',n(LIBC.doc,'item'),()=>goCat('docs'),'docs'],
  ['image','Gallery',LIBC.img==null?'Tap to open':plural((LIBC.img||0)+(LIBC.vid||0),'item'),()=>glOpen(),'gallery'],
  ['music','Music',n(LIBC.aud,'song'),()=>goCat('songs'),'music'],
  ['video','Videos',n(LIBC.vid,'video'),()=>goCat('vids'),'videos'],
  ['down',dl&&dl.name||'Downloads',dl?'Downloaded files':'Tap to connect',()=>go('downloads'),'downloads']];
 six.forEach(([ic,t,sub,on,k])=>{const b=dtile(ic,t,sub,on);b.dataset.slot=k;
  if(k==='internal'&&W.st){const f=h('span','dbar',null,h('i'));f.firstChild.style.width=Math.round(W.st.u*100)+'%';f.firstChild.style.background=useCol(W.st.u);b.append(f)}
  /* Downloads left the left panel in V0.45.0 (one place per item), so its Change directory / Open directly menu lives on a long-press here */
  if(k==='downloads'){lpTile(b,dlIt,(x,y)=>{const L=extras(dlIt);L.push(panelToggle(dlIt));menu(x,y,L)});b.onclick=()=>{if(b._lp){b._lp=false;return}on()}}
  /* V0.50.3: long-press Internal Storage: Add to left panel (plus Change directory once it is connected) */
  if(k==='internal'){lpTile(b,intIt,(x,y)=>{const L=extras(intIt);L.push(panelToggle(intIt));menu(x,y,L)});b.onclick=()=>{if(b._lp){b._lp=false;return}on()}}
  g.append(b)});
 return g}

/* ---------- [2] MUSIC: no player on the home screen. Sync a folder (loads in the background), search, tap a cover to play. ---------- */
const MT={q:Promise.resolve(),busy:false};
function songArt(i,im){/* artwork: saved preview first, then the native tag/cover extractor */
 const px=256,key=i.uri+'|'+i.size+'|'+i.mtime+'|'+px;
 const put=b=>{if(b&&im.isConnected){im.src='data:image/jpeg;base64,'+b;im.parentNode.classList.add('ok')}};
 if(THUMB.mem.has(key))return put(THUMB.mem.get(key));
 MT.q=MT.q.then(async()=>{if(!im.isConnected)return;let b=await tget(key);
  if(!b&&SAF&&SAF.thumb){try{const r=await SAF.thumb({uri:i.uri,kind:'aud',name:i.name,size:px});b=(r&&r.b64)||''}catch{}if(b){thumbMem(key,b);tput(key,b)}}
  else if(b)thumbMem(key,b);put(b)}).catch(()=>{})}
const nameOf=n=>n.replace(/\.[^.]+$/,'').replace(/^\d+\s*[-.]\s*/,'').replace(/^\[[^\]]*\]\s*/,'');
const norm=t=>t.toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]+/g,' ').trim();
const musicFolders=()=>((S.dash.music=S.dash.music||{folders:[]}).folders=S.dash.music.folders||[]);
function musicCard(){
 const c=card('dmusic'),top=h('div','dmh',null,h('b',null,'Your music'),h('small',null,'')),
  sync=h('button','chip on dsync',null,ico('cloud'),h('span',null,'Sync folder')),
  cons=h('button','chip dsync dcons',null,ico('tune'),h('span',null,'Console'));
 top.lastChild.id='dma';sync.onclick=syncMenu;cons.onclick=()=>cnOpen();cons.setAttribute('aria-label','Open the music console');const mt=h('button','ib mmt',null,ico(S.dash.musMin?'chdown':'chup'));mt.title='Hide or show the player';mt.setAttribute('aria-label','Hide or show the player');mt.onclick=()=>{S.dash.musMin=!S.dash.musMin;dsave();c.classList.toggle('dmin',!!S.dash.musMin);mt.replaceChildren(ico(S.dash.musMin?'chdown':'chup'))};c.classList.toggle('dmin',!!S.dash.musMin);top.append(mt);const chips=h('div','dmc',null,sync,cons);
 /* 1. the screen: what is playing. Tap it for the full player (queue, lyrics, settings). */
 const wv=h('span','wave hw',null,...[0,1,2,3,4,5,6].map(()=>h('i')));wv.setAttribute('aria-hidden','true');
 const scr=h('button','hscr idle',null,h('div','hart',null,ico('music'),h('img')),h('div','htx',null,h('b',null,'Nothing playing'),h('small',null,'Pick a song below')),wv);
 scr.id='hscr';scr.setAttribute('aria-label','Open the full player');scr.querySelector('.hart').id='hart';scr.querySelector('.htx b').id='htt';scr.querySelector('.htx small').id='hts';
 scr.onclick=()=>{if(pl.classList.contains('on')&&pl.classList.contains('k-aud'))setMini(false)};
 const sk=h('input','hseek');sk.type='range';sk.min=0;sk.max=1000;sk.value=0;sk.id='hseek';sk.setAttribute('aria-label','Seek');
 sk.oninput=()=>{DASH.hdrag=true;if(pv.duration)pv.currentTime=sk.value/1000*pv.duration};sk.onchange=()=>{DASH.hdrag=false};
 const tm=h('small','htm','0:00 / 0:00');tm.id='htm';
 /* 2. search */
 const q=h('input');q.id='dqs';q.type='search';q.placeholder='Search your songs…';q.autocomplete='off';q.spellcheck=false;q.oninput=()=>drawSongs();
 const row=h('div','dsongs');row.id='dsongs';
 /* 3. controls */
 const hb=(id,ic,lab,f)=>{const b=h('button','ib',null,ico(ic));b.id=id;b.setAttribute('aria-label',lab);b.title=lab;b.onclick=f;return b};
 const hp=hb('hpp','play','Play or pause',()=>{if(pl.classList.contains('on')&&pl.classList.contains('k-aud'))pv.paused?pv.play():pv.pause();else if(DASH.songs.length)openMedia(DASH.songs[0],DASH.songs);else toast('Sync a music folder first.')});hp.classList.add('big');
 const sx=h('button','ib emo',null,'🟥');sx.id='hstop';sx.setAttribute('aria-label','Stop');sx.title='Stop';sx.onclick=()=>closePl();
 const ctl=h('div','hctl',null,hb('hprev','prev','Previous song',()=>step(-1)),hp,hb('hnext','next','Next song',()=>step(1)),hb('hmax','max','Open the full player',()=>{if(pl.classList.contains('on'))setMini(false)}),sx);
 const info=h('div','dinfo',null,h('span','dls','Loading your songs…'),h('span','dcp',null,ico('clock'),h('b')));info.querySelector('.dls').id='dls';info.querySelector('.dcp').id='dcp';
 c.append(top,chips,scr,h('div','hsk',null,sk,tm),h('div','dsb',null,ico('search'),q),info,row,ctl);return c}
/* the hub follows the real player: title, artist, cover, play/pause, seek */
function hubSync(){
 const s=$('#hscr');if(!s)return;
 const on=pl.classList.contains('on')&&pl.classList.contains('k-aud')&&Q.length>0;
 s.classList.toggle('idle',!on);$('#dmusic-x')&&0;
 $('#htt').textContent=on?$('#pt').textContent:'Nothing playing';
 $('#hts').textContent=on?($('#pa2').textContent||'Tap for lyrics, queue and more'):'Pick a song below';
 const a=$('#hart'),im=a.querySelector('img');
 if(on&&artUrl){if(im.getAttribute('src')!==artUrl)im.src=artUrl;a.classList.add('ok')}else{im.removeAttribute('src');a.classList.remove('ok')}
 const pp=$('#hpp use');if(pp)pp.setAttribute('href','#i-'+(on&&!pv.paused?'pause':'play'));
 const c=$('#hscr').parentNode;c.classList.toggle('hon',on);
 if(!on){$('#hseek').value=0;$('#htm').textContent='0:00 / 0:00'}
 dTick()}
function hubTime(){const k=$('#hseek');if(!k||DASH.hdrag)return;if(pv.duration)k.value=pv.currentTime/pv.duration*1000;$('#htm').textContent=clock(pv.currentTime)+' / '+clock(pv.duration)}
async function syncMenu(){
 const L=musicFolders();
 const opts=[['add','Add a music folder…'],...(L.length?[['re','Sync again now']]:[]),...L.map((f,i)=>['rm'+i,'Remove: '+f.name])];
 const r=await dlg({title:'Music sync',msg:L.length?'Synced: '+L.map(f=>f.name).join(', ')+'.':'Choose the folder that holds your songs. It loads in the background, you can keep using the app.',opts,val:opts[0][0],ok:'OK'});
 if(!r)return;
 if(r.o==='add')return syncPick();
 if(r.o==='re')return syncMusic(true);
 if(/^rm\d+$/.test(r.o)){L.splice(+r.o.slice(2),1);dsave();syncMusic(true)}}
async function syncPick(){
 if(!NATIVE)return toast('Folder sync runs in the Android app.');
 const saf=S.mounts.filter(m=>m.type==='saf'),opts=[...saf.map(m=>['m:'+m.id,m.name]),['new','A different folder…']];
 let o='new';
 if(saf.length){const r=await dlg({title:'Which folder to sync?',msg:'Pick one you already added, or choose another.',opts,val:opts[0][0],ok:'Sync'});if(!r)return;o=r.o}
 let f;
 if(o==='new'){try{const x=await SAF.pickTree({volume:'',start:'primary:Music'});f={uri:x.uri,name:x.name}}catch(e){if(e.code!=='CANCELLED')toast(e.message);return}}
 else{const m=S.mounts.find(x=>'m:'+x.id===o);if(!m)return;f={uri:m.root,name:m.name}}
 const L=musicFolders();if(!L.some(x=>x.uri===f.uri))L.push(f);dsave();syncMusic(true)}
async function syncMusic(force){/* runs quietly: the card shows 'Syncing…' and fills in when done */
 if(MT.busy)return;const L=musicFolders();
 if(!L.length&&NATIVE){DASH.songs=[];DASH.state='none';return drawSongs()}
 MT.busy=true;DASH.state='sync';drawSongs();
 try{let out=[];
  if(NATIVE){const exts=EXT.aud.split(' ');
   for(const f of L){try{const r=await SAF.scan({uri:f.uri,exts,cap:500000,hidden:true});r.items.forEach(i=>out.push({...i,path:[i.pname||f.name],fs:true}));if(r.capped)DASH.lk='A folder reached the 500,000-track scan safety limit. Split very large libraries across folders or scan a smaller folder.'}catch(e){DASH.lk='Could not read '+f.name+'. Remove it and add it again.'}}}
  else out=await scan('aud',400);
  const seen=new Set();DASH.songs=out.filter(i=>!i.dir&&!seen.has(i.uri||i.name)&&seen.add(i.uri||i.name)).sort((a,b)=>nameOf(a.name).localeCompare(nameOf(b.name),undefined,{sensitivity:'base'}));DASH.state='ok'}
 catch(e){DASH.songs=[];DASH.lk=e.message;DASH.state='ok'}
 MT.busy=false;drawSongs()}
function dpill(mode,txt){/* the little pill on the right of the song status line: song count, or the time when no songs are loaded */
 const p=$('#dcp');if(!p)return;p.dataset.m=mode;p.firstChild.firstChild.setAttribute('href','#i-'+(mode==='time'?'clock':'music'));p.lastChild.textContent=txt}
const dnow=()=>new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
function drawSongs(){
 const row=$('#dsongs'),inp=$('#dqs'),m=$('#dma'),ls=$('#dls');if(!row)return;row.replaceChildren();
 const say=t=>{if(ls)ls.textContent=t};
 if(DASH.state==='sync'&&!DASH.songs.length){m.textContent='Syncing…';say('Loading your songs…');dpill('time',dnow());return}
 if(DASH.state==='none'){m.textContent='';say('Tap Sync folder and choose your music.');dpill('time',dnow());return}
 const terms=norm(inp?inp.value:'').split(' ').filter(Boolean);
 let hit=DASH.songs;if(terms.length){/* typos are fine: show the songs that match the most words you typed */
  const sc=new Map();let mx=0;DASH.songs.forEach(i=>{const t=norm(nameOf(i.name)+' '+(i.pname||'')),n=terms.filter(w=>t.includes(w)).length;sc.set(i,n);if(n>mx)mx=n});
  hit=mx?DASH.songs.filter(i=>sc.get(i)===mx):[]}
 m.textContent=DASH.state==='sync'?'Syncing…':'';
 if(!DASH.songs.length){say(DASH.lk||'No songs found in that folder.');dpill('time',dnow());return}
 dpill('count',hit.length+(terms.length?(hit.length===1?' match':' matches'):(hit.length===1?' song':' songs')));
 if(!hit.length){say('No song with that name.');return}
 say(terms.length?'Closest matches':'Tap a cover to play');
 hit.slice(0,120).forEach(i=>{const im=h('img'),a=h('div','dcov',null,ico('music'),im),t=h('button','dsong',null,a,h('b',null,nameOf(i.name)));
  t.dataset.u=i.uri||i.name;t.onclick=()=>openMedia(hit.find(x=>x===i)||hit[0],hit);row.append(t);
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();songArt(i,im)}},{root:row,rootMargin:'300px'});io.observe(t)});
 dTick()}
function dTick(){/* only highlights the song the real player has open */
 const on=pl.classList.contains('on')&&Q.length&&pl.classList.contains('k-aud'),cu=on?Q[qi]:null;
 document.querySelectorAll('#dsongs .dsong').forEach(b=>b.classList.toggle('on',!!cu&&b.dataset.u===(cu.uri||cu.name)))}

/* ---------- [3] WEATHER ---------- */
const WX={0:['☀️','Clear'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],45:['🌫️','Fog'],48:['🌫️','Fog'],51:['🌦️','Drizzle'],53:['🌦️','Drizzle'],55:['🌦️','Drizzle'],61:['🌧️','Rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],71:['🌨️','Snow'],73:['🌨️','Snow'],75:['❄️','Heavy snow'],80:['🌦️','Showers'],81:['🌧️','Showers'],82:['⛈️','Heavy showers'],95:['⛈️','Thunderstorm'],96:['⛈️','Thunderstorm'],99:['⛈️','Thunderstorm']};
const wx=c=>WX[c]||WX[[0,1,2,3,45,51,61,71,80,95].reverse().find(k=>k<=c)]||['🌡️','Weather'];
function weatherCard(){const c=card('dwx');c.id='dwx';c.onclick=pickCity;return c}
/* V0.47.0: the weather card lives at the top of Home (#pwx, under the greeting): today plus the next days */
function wxMount(){const m=$('#pwx');if(!m)return;if(!$('#dwx'))m.append(weatherCard());drawWx()}
function drawWx(){const c=$('#dwx');if(!c)return;const w=S.dash.wx,p=S.dash.place;c.replaceChildren();
 if(!p){c.append(h('div','dwe',null,h('b',null,'Weather'),h('small',null,'Tap to set your city')),h('div','dbig','🌍'));return}
 if(!w){c.append(h('div','dwe',null,h('b',null,p.name),h('small',null,navigator.onLine?'Loading…':'Offline')),h('div','dbig','…'));return}
 const [e,t]=wx(w.code);
 c.classList.remove('wxhot','wxrain','wxcold');/* V0.47.0: tint by conditions */
 {const k=w.code>=95?'wxrain':(w.code>=51&&w.code<=67)||(w.code>=80&&w.code<=82)?'wxrain':w.t>=30?'wxhot':w.t<=8?'wxcold':'';if(k)c.classList.add(k)}
 c.append(h('div','dwt',null,h('div','dbig',e),h('div','dwe',null,h('b',null,Math.round(w.t)+'°'),h('small',null,t+' · '+p.name),h('small',null,'H '+Math.round(w.hi)+'°  L '+Math.round(w.lo)+'° · wind '+Math.round(w.wind)+' km/h · '+w.hum+'%'))));
 const row=h('div','dfc');w.days.forEach(d=>row.append(h('div',null,null,h('small',null,d.d),h('span',null,wx(d.c)[0]),h('b',null,Math.round(d.hi)+'°'))));c.append(row)}
async function jget(u){const a=new AbortController(),t=setTimeout(()=>a.abort(),9000);try{const r=await fetch(u,{signal:a.signal});return await r.json()}finally{clearTimeout(t)}}
async function loadWx(force){const p=S.dash.place;if(!p||!navigator.onLine)return;
 if(!force&&S.dash.wx&&Date.now()-S.dash.wxAt<20*60e3)return drawWx();
 try{const r=await jget('https://api.open-meteo.com/v1/forecast?latitude='+p.lat+'&longitude='+p.lon+'&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5'),
  cu=r.current,d=r.daily,N=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  S.dash.wx={t:cu.temperature_2m,code:cu.weather_code,hum:cu.relative_humidity_2m,wind:cu.wind_speed_10m,hi:d.temperature_2m_max[0],lo:d.temperature_2m_min[0],
   days:d.time.slice(1).map((x,i)=>({d:N[new Date(x+'T12:00').getDay()],c:d.weather_code[i+1],hi:d.temperature_2m_max[i+1]}))};S.dash.wxAt=Date.now();dsave();drawWx()}catch{drawWx()}}
async function pickCity(){
 const r=await dlg({title:'Weather city',msg:'Type your city. Weather comes from open-meteo.com and needs internet.',value:(S.dash.place||{}).name||'',ok:'Set city'});
 if(!r||!r.v)return;
 try{const g=await jget('https://geocoding-api.open-meteo.com/v1/search?count=1&name='+encodeURIComponent(r.v)),x=g.results&&g.results[0];
  if(!x)return toast('City not found.');S.dash.place={name:x.name,lat:x.latitude,lon:x.longitude};S.dash.wx=null;dsave();drawWx();loadWx(true)}
 catch{toast('Could not look that up. Check your internet.')}}
function wxStart(){if(S.dash.place||!navigator.geolocation)return loadWx();
 navigator.geolocation.getCurrentPosition(async p=>{let n='Here';try{const g=await jget('https://geocoding-api.open-meteo.com/v1/search?count=1&name=x');}catch{}
  S.dash.place={name:'My location',lat:+p.coords.latitude.toFixed(3),lon:+p.coords.longitude.toFixed(3)};dsave();drawWx();loadWx(true)},()=>drawWx(),{timeout:6000,maximumAge:3600e3})}

/* ---------- [4] CALENDAR (tap a day to jot a note) ---------- */
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function calCard(){const c=card('dcal');c.id='dcal';drawCal();return c}
const wkStart=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay());
function drawCal(){const c=$('#dcal');if(!c)return;c.replaceChildren();
 const full=!!S.dash.calFull,nt=S.dash.notes=S.dash.notes||{},td=ymd(new Date()),now=new Date();
 const nav=(t,f)=>{const b=h('button','ib',null,ico(t));b.onclick=f;return b};
 let title,cells=[];
 if(full){const m=DASH.month||(DASH.month=new Date(now.getFullYear(),now.getMonth(),1));
  title=m.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  for(let i=0;i<m.getDay();i++)cells.push(null);
  for(let d=1,n=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();d<=n;d++)cells.push(new Date(m.getFullYear(),m.getMonth(),d));
  var back=()=>{DASH.month=new Date(m.getFullYear(),m.getMonth()-1,1);drawCal()},fwd=()=>{DASH.month=new Date(m.getFullYear(),m.getMonth()+1,1);drawCal()}}
 else{const w=DASH.wk||(DASH.wk=wkStart(now)),e=new Date(w.getFullYear(),w.getMonth(),w.getDate()+6);
  title=w.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' – '+e.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  for(let i=0;i<7;i++)cells.push(new Date(w.getFullYear(),w.getMonth(),w.getDate()+i));
  var back=()=>{DASH.wk=new Date(w.getFullYear(),w.getMonth(),w.getDate()-7);drawCal()},fwd=()=>{DASH.wk=new Date(w.getFullYear(),w.getMonth(),w.getDate()+7);drawCal()}}
 const tg=nav(full?'chup':'chdown',()=>{S.dash.calFull=!full;dsave();drawCal()});tg.title=full?'Show one week':'Show the whole month';tg.setAttribute('aria-label',tg.title);
 c.append(h('div','dch',null,nav('back',back),h('b',null,title),nav('chdown',fwd),tg));
 c.firstChild.children[0].firstChild.style.transform='none';c.firstChild.children[2].firstChild.style.transform='rotate(-90deg)';
 const g=h('div','dgrid7');['S','M','T','W','T','F','S'].forEach(x=>g.append(h('small',null,x)));
 cells.forEach(d=>{if(!d)return g.append(h('span'));const k=ymd(d),b=h('button','dday'+(k===td?' today':'')+(nt[k]?' has':''),d.getDate());b.onclick=()=>dayNote(k);g.append(b)});
 c.append(g);
 const up=Object.keys(nt).filter(k=>k>=td&&nt[k]).sort().slice(0,3);
 c.append(h('div','dnotes',null,...(up.length?up.map(k=>h('div',null,null,h('b',null,k===td?'Today':new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})),h('span',null,nt[k]))):[h('small',null,'Tap a day to add a note or reminder.')])))}
async function dayNote(k){const nt=S.dash.notes=S.dash.notes||{};
 const r=await dlg({title:new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}),msg:'Leave it empty to clear the note.',value:nt[k]||'',ok:'Save'});
 if(!r)return;r.v&&r.v.trim()?nt[k]=r.v.trim():delete nt[k];dsave();drawCal()}

function openItem(i,list){try{open(i,list)}catch(e){toast(e.message)}}

/* ---------- [6] YOUR SPACE: folders on your desk. Add from the phone, cloud, SD card or Termux. ---------- */
let HSNAP=null;
/* Home folders are their own list (S.dash.fm). A folder added here never shows in the left panel, and the left panel never fills Home. */
function adoptHome(){if(!HSNAP)return;const snap=HSNAP;HSNAP=null;/* always forget the snapshot, so a cancelled Add never steals a later left-panel folder */
 const nw=S.mounts.filter(m=>!snap.has(m.id)&&!SLOTS.some(x=>x.id===m.id));if(!nw.length)return;
 S.dash.fm=(S.dash.fm||[]).filter(f=>!nw.some(m=>m.id===f.id)).concat(nw);S.mounts=S.mounts.filter(m=>!nw.some(x=>x.id===m.id));dsave();nw.forEach(m=>place('m:'+m.id,'home'))}/* V0.50.0: a folder added from Home stays on Home (it used to be parked in the left panel) */
async function addFolder(){
 HSNAP=new Set(S.mounts.map(m=>m.id));
 try{if(NATIVE)await connectSaf('','','folder',null,{});/* V0.51.0: straight to the folder picker, no extra question first (SD card and loose files stay in the + menu) */else await connect('','','folder')}finally{adoptHome()}}
function folderMenu(f,x,y){const redraw=()=>{const sp=$('#dspace');if(sp)sp.replaceWith(spaceGrid())};
 menu(x,y,[['Rename…',async()=>{const r=await dlg({title:'Rename folder',msg:'This changes the name shown on Home only.',value:f.name,ok:'Save'});if(r&&r.v&&r.v.trim()){f.name=r.v.trim();dsave();redraw()}}],
  ['Remove folder',async()=>{const r=await dlg({title:'Remove "'+f.name+'" from Home?',msg:'Your files are not touched. You can add the folder again any time.',ok:'Remove',danger:true});if(!r)return;
   S.dash.fm=(S.dash.fm||[]).filter(m=>m.id!==f.id);delete HANDLES[f.id];dsave();redraw()}]])}
function spaceGrid(){/* V0.50.0: FOLDERS only. The folders you added to Home, then an Add folder button. No shortcuts, no Utilities, no tools. */
 const g=h('div','dsrow');g.id='dspace';
 const y=layNorm(),by=new Map(catalog().map(x=>[x.id,x]));
 y.home.map(id=>by.get(id)).filter(Boolean).forEach(it=>{const m=meta(it),b=h('button','dsc',null,ico(m.ic||'folder'),h('span',null,m.name));
  b.onclick=()=>{if(b._lp){b._lp=false;return}m.open()};lpTile(b,it);g.append(b)});
 const add=h('button','dsc dadd',null,ico('plus'),h('span',null,'Add folder'));add.setAttribute('aria-label','Add a folder to Home');add.onclick=()=>addFolder();g.append(add);
 return g}

/* ---------- PINNED: folders you pin to the top. They show here on Home and first inside their own folder, never in the left panel. ---------- */
function pinGrid(){const g=h('div','dgrid3');g.id='dpin';
 if(!S.pins.length){g.append(h('div','dnone','Long-press a folder, then choose Pin to top.'));return g}
 S.pins.forEach(p=>{const k=key(p.m,p.path),t=dtile('folder',p.name,(mount(p.m)||{}).name||'Not connected',()=>{if(t._lp){t._lp=false;return}go(p.m,p.path)});
  t.firstChild.style.color=S.colors[k]||'var(--fcol)';let tm,x0=0,y0=0;const cancel=()=>clearTimeout(tm);
  const ctx=(x,y)=>menu(x,y,[['Rename folder',()=>renamePin(p)],['Unpin',()=>togglePin(p.m,p.path)]]);
  t.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;t._lp=false;tm=setTimeout(()=>{t._lp=true;navigator.vibrate&&navigator.vibrate(12);ctx(x0,y0)},450)});
  t.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x0,e.clientY-y0)>10)cancel()});
  ['pointerup','pointercancel','pointerleave'].forEach(v=>t.addEventListener(v,cancel));
  t.addEventListener('contextmenu',e=>{e.preventDefault();cancel();t._lp=true;ctx(e.clientX,e.clientY)});g.append(t)});
 return g}
function pinsHome(){const g=$('#dpin');if(g)g.replaceWith(pinGrid())}

/* ---------- CHARGING BOLT: a yellow lightning bolt beside the clock while the phone charges ---------- */
function boltSet(on){const b=$('#dbolt');if(b)b.classList.toggle('on',!!on)}
async function boltInit(){if(!navigator.getBattery)return;try{const b=await navigator.getBattery();const f=()=>boltSet(b.charging);b.addEventListener('chargingchange',f);f()}catch{}}

/* ---------- build + show ---------- */
/* V0.48.0: a Home section with a header you tap to fold; open/closed is remembered (S.dash.col) and every section has a little space below it */
function dcol(id,title,node){
 const col=(S.dash.col=S.dash.col||{}),w=h('div','dsx'+(col[id]===1?' shut':'')),hd=h('button','dsxh',null,h('b',null,title),ico('up')),bd=h('div','dsxb',null,node);
 hd.setAttribute('aria-expanded',col[id]===1?'false':'true');
 hd.onclick=()=>{const s=w.classList.toggle('shut');col[id]=s?1:0;hd.setAttribute('aria-expanded',s?'false':'true');dsave()};
 w.append(hd,bd);return w}
function dashBuild(){
 const D=$('#dash');if(!D)return;const box=$('#dscroll');box.replaceChildren();DASH.built=true;DASH.at=Date.now();
 const head=h('div','dhead',null,h('div',null,null,h('b',null,greet()),h('span',null,'')),h('div','dclk',null,h('b',null,''),h('small',null,'')));
 head.querySelector('span').id='dsub';head.querySelector('.dclk b').id='dclk';head.querySelector('.dclk small').id='ddt';
 const bg=h('button','ib',null,ico('image'));bg.setAttribute('aria-label','Change scene');bg.onclick=wallNext;
 const bolt=h('span','dbolt',null,ico('bolt'));bolt.id='dbolt';bolt.setAttribute('aria-label','Charging');head.querySelector('.dclk b').before(bolt);
 head.querySelector('.dclk').onclick=openCal;head.querySelector('.dclk').title='Open the calendar';
 head.append(bg);boltInit();
 const wxh=h('div');wxh.id='pwx';
 box.append(head,wxh,dcol('lib','Library',filesDesk()),auhCard(),dcol('mus','Music',musicCard()),spaceGrid(),dcol('brw','Browser',brwCard()),dcol('qt','Quick tools',qtCard()),
  h('div','dfoot',null,h('small',null,'Strategy over impulse')));
 /* V0.47.0: weather sits at the top of Home. */
 wxMount();dashBg();drawCal();syncMusic();wxStart();hubSync();auhStart()}
function dashRefresh(force){DASH.at=Date.now();if(force)libReset();syncMusic(true);loadWx(true);const f=$('#dscroll #dfiles');if(f)f.replaceWith(filesDesk());
 pinsHome();const sp=$('#dspace');if(sp)sp.replaceWith(spaceGrid());brwDraw();qtUpdate()}
function dashClock(){const n=new Date(),a=$('#dclk');if(!a)return;a.textContent=n.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});$('#ddt').textContent=n.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
 const cp=$('#dcp');if(cp&&cp.dataset.m==='time')cp.lastChild.textContent=dnow()}
let wasHome=false;
function dashShow(){const home=isHome();document.body.classList.toggle('home',home);
 if(home&&!wasHome){adoptHome();if(typeof auhStart==='function')auhStart();if(!DASH.built)dashBuild();else{const sp=$('#dspace');if(sp)sp.replaceWith(spaceGrid());pinsHome();/* V0.52.0: the heavy parts of Home are rebuilt at most every 30 seconds when you come back to it, so it no longer redraws every time. Pull down or Refresh dashboard to force it. */const stale=Date.now()-(DASH.at||0)>30000;if(stale){DASH.at=Date.now();const f=$('#dscroll #dfiles');if(f)f.replaceWith(filesDesk());brwDraw();qtUpdate()}syncMusic();hubSync();if(pl.classList.contains('on')&&pl.classList.contains('k-aud'))setMini(true)}dashClock();if(typeof wfHome==='function')wfHome(false);clearInterval(DASH.tick);DASH.tick=setInterval(()=>{if(document.hidden)return;dashClock();dTick()},1000)}
 if(!home&&wasHome)clearInterval(DASH.tick);wasHome=home}

/* V0.11.2: dash.js loads after ui.js, so the first back-button draw skipped dashShow. Show the home screen on cold start. */
dashShow();
/* V0.47.0: always start on Home (cold start). */
try{if(!isHome())goHome()}catch{}

/* V0.15.0: charging bolt fallback when the web view has no Battery API, and files other apps open with Conduint (Open with) */
async function chargeTick(){if(!TOOLS||!TOOLS.charging||navigator.getBattery)return;try{boltSet((await TOOLS.charging()).charging)}catch{}}
async function takeIncoming(){if(!TOOLS||!TOOLS.incoming)return;try{const r=await TOOLS.incoming();if(!r||!r.uri)return;
 const it={name:r.name,uri:r.uri,mime:r.mime||'',size:0,incoming:true};
 /* V0.19.2: ZIP intents → zip browser; HTML/PDF/DOCX → reader */
 if(/\.zip$/i.test(it.name)&&typeof zipBrowse==='function'){zipBrowse(it);return;}
 if(kindOf(it.name,it.mime)==='file'&&!rdType(it.name,it.mime))return toast('Conduint cannot show '+it.name+' yet.');
 open(it,[it])}catch(e){e&&e.code!=='CANCELLED'&&toast(e.message||'Could not open that file.')}}
setInterval(()=>{if(!document.hidden)chargeTick()},5000);chargeTick();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){takeIncoming();chargeTick()}});
setTimeout(takeIncoming,700);


/* V0.19.0: tap the date on Home and the calendar rises from the bottom. Notes work the same; the week/month switch is inside. */
function openCal(){
 let A=$('#calsh');
 if(!A){A=h('div');A.id='calsh';const box=h('div','calbox',null,h('div','xfgrab'));box.append(calCard());A.append(box);A.onclick=e=>{if(e.target===A)closeCal()};document.body.append(A)}
 drawCal();A.classList.add('on')}
const closeCal=()=>{const A=$('#calsh');if(A)A.classList.remove('on')};


/* ---------- V0.30.0 BROWSER WIDGET: the tall card above "Strategy over impulse". Address bar, jump back in, top sites, quick actions. ---------- */
function brwSites(){/* bookmarks first, then the sites you visit most; four at most */
 const BRW_SUG=[['https://www.google.com','Google'],['https://www.youtube.com','YouTube'],['https://en.wikipedia.org','Wikipedia'],['https://github.com','GitHub']];
 const out=[],seen=new Set(),add=(u,t)=>{const k=brHost(u);if(!k||seen.has(k)||out.length>=4)return;seen.add(k);out.push({u,t:t||k})};
 BD.bm.forEach(b=>add(b.u,b.t));
 const cnt={};BD.hist.slice(0,600).forEach(x=>{const k=brHost(x.u);if(!k)return;(cnt[k]=cnt[k]||{u:x.u,t:x.t,n:0}).n++});
 Object.values(cnt).sort((a,b)=>b.n-a.n).forEach(x=>add(x.u,x.t));
 const real=out.length;if(!real)BRW_SUG.forEach(([u,t])=>add(u,t));
 return{list:out,sug:!real}}
function brwGo(f){brOpen();try{f()}catch(e){toast(e.message)}}
function brwCard(){const c=h('div','dc dbrw');c.id='dbrw';brwFill(c);return c}
function brwDraw(){const c=$('#dbrw');if(c)brwFill(c)}
function brwFill(c){
 /* V0.31.2: a normal, compact browser widget: search bar with a tabs button, four site tiles, three quick actions. No lists, so Home never needs to scroll. */
 const tabs=BR.tabs.filter(t=>!t.priv),last=tabs.find(t=>t.id===BR.cur&&t.u)||tabs.slice().reverse().find(t=>t.u);
 const q=h('input');q.type='text';q.placeholder='Search or type web address';q.autocomplete='off';q.spellcheck=false;q.autocapitalize='off';q.enterKeyHint='go';
 const go=()=>{const v=q.value.trim();if(!v)return brOpen();q.value='';q.blur();brwGo(()=>brOpenIn(v))};
 q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}};
 const tb=h('button','dbtabs',null,h('b',null,String(tabs.length)));tb.title=last?'Resume '+(last.t||brHost(last.u)):'Open browser';tb.setAttribute('aria-label','Open browser, '+tabs.length+(tabs.length===1?' tab':' tabs'));tb.onclick=()=>brOpen();
 const bar=h('div','dbq',null,ico('globe'),q,tb);
 const st=brwSites(),tiles=h('div','dbtiles');
 st.list.forEach(x=>{const t=h('button','dbtile',null,brFav(x.u),h('small',null,(x.t||brHost(x.u)).slice(0,14)));t.title=brHost(x.u);t.onclick=()=>brwGo(()=>brOpenIn(x.u));tiles.append(t)});
 const act=(ic,t,f)=>{const b=h('button','dba',null,ico(ic),h('span',null,t));b.onclick=f;return b};
 c.replaceChildren(bar,tiles,h('div','dbact',null,act('star','Bookmarks',()=>brwGo(()=>brPanel('bm'))),act('history','History',()=>brwGo(()=>brPanel('history'))),act('eyeoff','Private',()=>brwGo(()=>brNew('',true)))))}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)brwDraw()});

/* V0.45.0: Home no longer shrinks to fit. The old homeFit (V0.31.2) zoomed every card down to 55% so nothing scrolled; that is gone. Home keeps full-size cards and scrolls (#dscroll, overflow-y:auto), with or without the music card open. */

/* V0.48.0: pull down on Home refreshes it with the same horizontal wave as the file list */
try{const sc=$('#dscroll');if(sc&&typeof ptrAttach==='function')ptrAttach(sc,async()=>{dashRefresh(true);await new Promise(r=>setTimeout(r,900));toast('Refreshed')},{blocked:()=>!document.body.classList.contains('home')})}catch{}

/* V0.52.0: scrolling Home stays smooth. While a finger is moving the page, the glowing wallpaper animation and the card blur pause (style.css, body.scrl), and they come back 160 ms after you stop. */
try{const sc=$('#dscroll');if(sc){let t=0;sc.addEventListener('scroll',()=>{if(!t)document.body.classList.add('scrl');clearTimeout(t);t=setTimeout(()=>{t=0;document.body.classList.remove('scrl')},160)},{passive:true})}}catch{}
