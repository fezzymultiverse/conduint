/* player.js: the media engine (one <audio>/<video> element, queue, tags, lyrics, notification buttons).
   V0.19.1: SONGS NEVER OPEN A SHEET OR A BOTTOM BAR. Any song, from any folder, plays through the Home music hub (dash.js), which is the
   only music screen and control. The full player (queue, lyrics, settings) opens from the hub's "open player" button and Back hides it
   again while the music keeps playing (.dock now means "hidden"). VIDEO has its own stand-alone sheet: rotate, maximise, no background play.
   Songs show their tags, artwork and synced lyrics (see meta.js). The native Player plugin keeps music alive with a notification and
   media buttons when the app is in the background; it is never started for video.
   Files from the native Saf plugin are copied once to the app cache and played from there (cleared on close). */
const pl=$('#pl'),pv=$('#pv'),pi=$('#pi'),ps=$('#ps'),art=$('#part'),lyr=$('#lyr'),SPEEDS=[1,1.25,1.5,2,.75];
let Q=[],qi=0,url=null,spd=0,drag=false,tok=0,artUrl=null,artB64='',INFO={},LY={lines:[],synced:false},lyI=-1,nt=0;
const clock=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
const setIcon=(sel,n)=>$(sel+' use').setAttribute('href','#i-'+n);
const hub=()=>{if(typeof hubSync==='function')hubSync()};/* tells the Home music hub to redraw */

/* [1] OPEN AND LOAD: a song starts hidden (the Home hub shows it), a video opens its own sheet; a quick second tap wins over the first (token lt). */
let MN=null,lt=0;
async function openMedia(item,queue){
 if(kindOf(item.name,item.mime)==='img'){if(typeof ivOpen==='function')return ivOpen(item,queue.filter(x=>!x.dir&&kindOf(x.name,x.mime)==='img'))}
 Q=queue;qi=Math.max(0,Q.indexOf(item));
 const k=kindOf(item.name,item.mime);
 MN=k==='aud';
 if(k==='aud'&&!(typeof isHome==='function'&&isHome()))toast('Playing on Home');
 await loadMedia()}
async function loadMedia(){
 const it=Q[qi],k=kindOf(it.name,it.mime),my=++lt;let f,path;
 pl.classList.remove('k-vid','k-aud','k-img');pl.classList.add('on','k-'+k);document.body.classList.add('pon');
 if(MN!=null){setMini(MN);MN=null}
 if(k==='img')setMini(false);
 if(k==='vid'&&PLAYER)PLAYER.stop().catch(()=>{});/* video never plays in the background */
 setTitle(it.name,it.uri?'Loading…':'');applyPlSet();drawQueue();
 try{
  if(it.uri){const heavy=k!=='aud';if(heavy)busy('Preparing '+it.name+'…');
   try{path=(await SAF.cacheCopy({uri:it.uri,name:it.name})).path}finally{if(heavy)unbusy()}}
  else f=it.file||await it.fh.getFile()}
 catch(e){if(e.code!=='CANCELLED')toast(e.message);return}
 if(my!==lt){return}
 release();let src;
 if(f){url=URL.createObjectURL(f);src=url}else src=(CAP.convertFileSrc?CAP.convertFileSrc(path):location.origin+'/_capacitor_file_'+path);
 setTitle(it.name,'');clearInfo();
 if(k==='img')pi.src=src;
 else{pv.defaultPlaybackRate=SPEEDS[spd];pv.src=src;pv.play().catch(()=>{});
  if(k==='aud')startInfo(it,src)}
 if(path&&SAF)SAF.clearCache({keep:path}).catch(()=>{})}
function release(){pv.pause();pv.removeAttribute('src');pv.load();pi.removeAttribute('src');if(url)URL.revokeObjectURL(url);url=null}
function closePl(){tok++;lt++;release();clearInfo();if(SAF)SAF.clearCache().catch(()=>{});
 if(PLAYER)PLAYER.stop().catch(()=>{});if('mediaSession' in navigator){try{navigator.mediaSession.metadata=null}catch{}}
 pl.classList.remove('on','max','rot','dock');document.body.classList.remove('playing');clearTimeout(SLP);document.body.classList.remove('pon');pl.style.removeProperty('--pp');setIcon('#pmx','max');hub()}
const step=d=>{if(Q.length>1){qi=(qi+d+Q.length)%Q.length;loadMedia()}};
function nextSong(){const s=S.settings;
 if(s.pRep==='one'){pv.currentTime=0;pv.play();return}
 if(s.pShuf&&Q.length>1){let n;do{n=Math.floor(Math.random()*Q.length)}while(n===qi);qi=n;loadMedia();return}
 if(qi>=Q.length-1&&s.pRep==='off'){return}
 step(1)}

/* [2] HIDE: a song's full player goes away and the music keeps playing on the Home hub. Video can not be hidden, only closed. */
function setMini(on){
 on=!!on&&pl.classList.contains('on')&&pl.classList.contains('k-aud');
 pl.classList.toggle('dock',on);document.body.classList.toggle('pon',pl.classList.contains('on')&&!on);
 if(on)pl.classList.remove('max','rot');
 setIcon('#pmx',pl.classList.contains('max')?'min':'max');hub()}
/* Android back / swipe down: full screen -> half screen -> hidden (song) or closed (video). Pictures just close. */
function plBack(){
 if(pl.classList.contains('k-img')){closePl();return}
 if(pl.classList.contains('k-vid')){if(pl.classList.contains('max')||pl.classList.contains('rot')){pl.classList.remove('max','rot');setIcon('#pmx','max')}else closePl();return}
 if(pl.classList.contains('max')||pl.classList.contains('rot')){pl.classList.remove('max','rot');setIcon('#pmx','max');return}
 setMini(true)}
/* swipe the header or the grab bar: down = smaller, up = bigger */
{let y0=null;
 const t0=e=>{y0=e.touches.length===1?e.touches[0].clientY:null};
 const t1=e=>{if(y0==null)return;const d=e.changedTouches[0].clientY-y0;y0=null;if(Math.abs(d)<60||!pl.classList.contains('on'))return;
  if(d>0)plBack();
  else if(pl.classList.contains('dock'))return;
  else if(!pl.classList.contains('k-img')&&!pl.classList.contains('max')){setMini(false);pl.classList.add('max');if(pl.classList.contains('k-vid'))pl.classList.add('rot');setIcon('#pmx','min')}};
 [$('#pgrab'),$('.ph')].forEach(n=>{n.addEventListener('touchstart',t0,{passive:true});n.addEventListener('touchend',t1,{passive:true});n.addEventListener('touchcancel',()=>{y0=null},{passive:true})})}

/* [3] SONG INFO: tags, artwork, lyrics */
function setTitle(t,sub){$('#pt').textContent=t;$('#pa2').textContent=sub||'';hub()}
function clearInfo(){
 INFO={};LY={lines:[],synced:false};lyI=-1;artB64=brandArt();
 if(artUrl)URL.revokeObjectURL(artUrl);artUrl=null;art.removeAttribute('src');
 pl.classList.remove('hasart');lyr.replaceChildren();lyr.classList.remove('on');hub()}
function startInfo(it,src){
 const my=++tok;lyr.classList.add('on');lyr.replaceChildren(h('div','ly none','Looking for lyrics…'));
 songInfo(it,src,()=>pv.duration||0,u=>my===tok&&applyInfo(u),()=>my===tok)
  .then(()=>{if(my===tok&&!LY.lines.length)lyr.replaceChildren(h('div','ly none','No lyrics found for this song.'))}).catch(()=>{})}
function applyInfo(u){
 const was=INFO;INFO=u;
 setTitle(u.title||$('#pt').textContent,[u.artist,u.album].filter(Boolean).join(' · '));
 if(u.art&&u.art!==was.art){if(artUrl)URL.revokeObjectURL(artUrl);artUrl=URL.createObjectURL(u.art);art.src=artUrl;pl.classList.add('hasart');hub();
  thumb(u.art).then(b=>{if(b)artB64=b;notify()})}
 if(u.lines.length&&u.lines!==LY.lines)drawLyrics(u.lines,u.synced);
 session();notify()}
function drawLyrics(lines,synced){
 LY={lines,synced};lyI=-1;lyr.replaceChildren();lyr.classList.add('on');lyr.classList.toggle('sync',synced);
 lines.forEach(x=>{const d=h('div','ly',x.l||'♪');if(synced)d.onclick=()=>{if(x.t>=0&&pv.duration)pv.currentTime=x.t};lyr.append(d)});lyr.scrollTop=0}
function lyricTick(){
 if(!LY.synced||!LY.lines.length)return;const t=pv.currentTime+.2;let i=-1;
 for(let k=0;k<LY.lines.length;k++){if(LY.lines[k].t<=t)i=k;else break}
 if(i===lyI)return;
 if(lyI>=0&&lyr.children[lyI])lyr.children[lyI].classList.remove('cur');
 lyI=i;const e=lyr.children[i];if(!e)return;e.classList.add('cur');
 if(!pl.classList.contains('dock'))lyr.scrollTo({top:Math.max(0,e.offsetTop-lyr.clientHeight/2+e.clientHeight/2),behavior:'smooth'})}
/* square 256px jpeg as base64 for the notification */
const thumb=blob=>new Promise(res=>{const u=URL.createObjectURL(blob),im=new Image();
 im.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=256;const s=Math.min(im.width,im.height);
  c.getContext('2d').drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,256,256);res(c.toDataURL('image/jpeg',.8).split(',')[1]||'')}catch{res('')}URL.revokeObjectURL(u)};
 im.onerror=()=>{URL.revokeObjectURL(u);res('')};im.src=u});

/* V0.10.1: S.O.I x Bojack cover used in the notification until (or unless) the song has its own artwork */
let BRAND='';
function brandArt(){
 if(BRAND)return BRAND;
 try{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,256,256);g.addColorStop(0,'#05080c');g.addColorStop(1,'#0b2a33');x.fillStyle=g;x.fillRect(0,0,256,256);
  x.strokeStyle='#22d3ee';x.lineWidth=6;x.strokeRect(14,14,228,228);
  x.fillStyle='#22d3ee';x.textAlign='center';x.font='bold 120px sans-serif';x.fillText('\u266B',128,150);
  x.font='bold 22px sans-serif';x.fillText('S.O.I \u00d7 BOJACK',128,196);x.fillStyle='#8fa3ad';x.font='16px sans-serif';x.fillText('SECURITY',128,222);
  BRAND=c.toDataURL('image/jpeg',.85).split(',')[1]||''}catch{BRAND=''}
 return BRAND}

/* [4] BACKGROUND: media session (headset and lock screen buttons) and the native notification */
function session(){
 if(!('mediaSession' in navigator))return;
 try{navigator.mediaSession.metadata=new MediaMetadata({title:INFO.title||$('#pt').textContent,artist:INFO.artist||'',album:INFO.album||'',
  artwork:artUrl?[{src:artUrl,sizes:'512x512',type:INFO.art&&INFO.art.type||'image/jpeg'}]:[]})}catch{}}
if('mediaSession' in navigator){
 const a=(n,f)=>{try{navigator.mediaSession.setActionHandler(n,f)}catch{}};
 a('play',()=>pv.play());a('pause',()=>pv.pause());a('previoustrack',()=>step(-1));a('nexttrack',()=>step(1));
 a('seekto',e=>{if(pv.duration&&e.seekTime!=null)pv.currentTime=e.seekTime})}
function notify(){
 if(!PLAYER||!pl.classList.contains('on')||!pl.classList.contains('k-aud'))return;
 clearTimeout(nt);nt=setTimeout(()=>PLAYER.update({title:INFO.title||$('#pt').textContent,artist:[INFO.artist,INFO.album].filter(Boolean).join(' · '),playing:!pv.paused,art:artB64,
  pos:Math.round((pv.currentTime||0)*1000),dur:isFinite(pv.duration)?Math.round(pv.duration*1000):0}).catch(()=>{}),120)}
if(PLAYER&&PLAYER.addListener)PLAYER.addListener('action',e=>{
 const a=e&&e.action;if(a==='toggle')pv.paused?pv.play():pv.pause();else if(a==='play')pv.play().catch(()=>{});else if(a==='pause')pv.pause();else if(a==='seek'){if(pv.duration&&e.pos!=null)pv.currentTime=e.pos/1000}else if(a==='next')step(1);else if(a==='prev')step(-1);else if(a==='close')closePl()});

/* [5] CONTROLS */
pv.ontimeupdate=()=>{if(!drag&&pv.duration)ps.value=pv.currentTime/pv.duration*1000;
 if(pv.duration&&isFinite(pv.duration)){pl.style.setProperty('--pp',(pv.currentTime/pv.duration*100).toFixed(1)+'%');if(typeof hubTime==='function')hubTime()}$('#ptm').textContent=clock(pv.currentTime)+' / '+clock(pv.duration);lyricTick();
 if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&pv.duration&&isFinite(pv.duration)){try{navigator.mediaSession.setPositionState({duration:pv.duration,position:Math.min(pv.currentTime,pv.duration),playbackRate:pv.playbackRate||1})}catch{}}};
pv.onplay=pv.onpause=()=>{const n=pv.paused?'play':'pause';setIcon('#pp',n);document.body.classList.toggle('playing',!pv.paused);notify();hub()};
pv.onseeked=pv.onloadedmetadata=notify;
pv.onended=()=>{if(!S.settings.pAuto)return;if(!pv.loop)nextSong()};
pv.onerror=()=>toast("This file's format or codec isn't supported here.");
ps.oninput=()=>{drag=true;if(pv.duration)pv.currentTime=ps.value/1000*pv.duration};
ps.onchange=()=>{drag=false};
$('#pp').onclick=()=>pv.paused?pv.play():pv.pause();
$('#ppv').onclick=()=>step(-1);$('#pnx').onclick=()=>step(1);
$('#psp').onclick=()=>{plSet('pSpd',(S.settings.pSpd+1)%SPEEDS.length)};
$('#plp').onclick=e=>{pv.loop=!pv.loop;e.currentTarget.classList.toggle('on',pv.loop)};
$('#pmx').onclick=()=>{setMini(false);const m=pl.classList.toggle('max');if(!m)pl.classList.remove('rot');else if(pl.classList.contains('k-vid'))pl.classList.add('rot');/* video: maximise = landscape */setIcon('#pmx',m?'min':'max')};
$('#prt').onclick=()=>{setMini(false);if(pl.classList.toggle('rot')){pl.classList.add('max');setIcon('#pmx','min')}};
$('#pmn').onclick=()=>setMini(true);
$('#pcl').onclick=closePl;

/* [6] V0.9.2: TABS, QUEUE, SHUFFLE, REPEAT, SLEEP TIMER, SETTINGS (saved in settings, shared with Settings > Music player) */
let SLP=0,SLPAT=0;
const plSet=(k,v)=>{S.settings[k]=v;save();applyPlSet();if(pl.dataset.tab==='set')drawPSet()};
function applyPlSet(){
 const s=S.settings;spd=s.pSpd||0;pv.defaultPlaybackRate=pv.playbackRate=SPEEDS[spd];$('#psp').textContent=SPEEDS[spd]+'x';
 pv.volume=Math.max(0,Math.min(1,s.pVol==null?1:s.pVol));
 $('#psh').classList.toggle('on',!!s.pShuf);
 $('#plp').classList.toggle('on',s.pRep==='one');
 }
function setTab(t){pl.dataset.tab=t;[...$('#ptabs').children].forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 if(t==='queue')drawQueue();if(t==='set')drawPSet()}
[...$('#ptabs').children].forEach(b=>b.onclick=()=>setTab(b.dataset.t));
function drawQueue(){
 const B=$('#pq');B.replaceChildren();
 if(!Q.length||pl.classList.contains('k-img')){B.append(h('div','prow','Nothing queued.'));return}
 Q.forEach((it,i)=>{const n=h('div','qi'+(i===qi?' cur':''),null,h('small',null,String(i+1)),h('b',null,it.name),h('small',null,it.size?fmt(it.size):''));
  n.onclick=()=>{qi=i;loadMedia()};B.append(n)});
 const c=B.children[qi];if(c&&pl.dataset.tab==='queue')c.scrollIntoView({block:'center'})}
$('#psh').onclick=()=>plSet('pShuf',!S.settings.pShuf);
$('#plp').onclick=()=>{const o=['off','all','one'],s=S.settings;plSet('pRep',o[(o.indexOf(s.pRep)+1)%3]);toast('Repeat: '+({off:'off',all:'whole queue',one:'this song'})[S.settings.pRep]);pv.loop=false};
function sleepSet(min){clearTimeout(SLP);SLPAT=0;
 if(min>0){SLPAT=Date.now()+min*60000;SLP=setTimeout(()=>{pv.pause();SLPAT=0;toast('Sleep timer: music paused.');if(pl.dataset.tab==='set')drawPSet()},min*60000);toast('Music stops in '+min+' min.')}
 else toast('Sleep timer off.');if(pl.dataset.tab==='set')drawPSet()}
function drawPSet(){
 const s=S.settings,B=$('#pset');B.replaceChildren();
 const chip=(t,on,f)=>{const b=h('button','chip pbtn'+(on?' on':''),t);b.onclick=f;return b};
 const row=(l,...k)=>B.append(h('div','prow',null,h('span',null,l),h('div','ctl',null,...k)));
 row('Repeat',...[['off','Off'],['all','Queue'],['one','Song']].map(([v,t])=>chip(t,s.pRep===v,()=>plSet('pRep',v))));
 row('Shuffle',chip(s.pShuf?'On':'Off',s.pShuf,()=>plSet('pShuf',!s.pShuf)));
 row('Speed',...SPEEDS.map((v,i)=>chip(v+'x',s.pSpd===i,()=>plSet('pSpd',i))));
 const r=document.createElement('input');r.type='range';r.min=0;r.max=100;r.value=Math.round((s.pVol==null?1:s.pVol)*100);r.oninput=()=>{S.settings.pVol=r.value/100;pv.volume=S.settings.pVol;save()};row('Volume',r);
 row('Sleep timer'+(SLPAT?' ('+Math.max(1,Math.round((SLPAT-Date.now())/60000))+' min left)':''),...[[0,'Off'],[15,'15 min'],[30,'30 min'],[60,'1 h'],[120,'2 h']].map(([m,t])=>chip(t,!m&&!SLPAT,()=>sleepSet(m))));
 row('Play next song automatically',chip(s.pAuto?'On':'Off',s.pAuto,()=>plSet('pAuto',!s.pAuto)));
   row('Online lyrics and artwork',chip(s.online?'On':'Off',s.online,()=>{plSet('online',!s.online)}))}
applyPlSet();

/* video does not play in the background: leaving the app pauses it (songs keep going on the Home hub) */
document.addEventListener('visibilitychange',()=>{if(document.hidden&&pl.classList.contains('k-vid')&&!pv.paused)pv.pause()});
