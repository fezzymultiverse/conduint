/* lock.js: app lock. Fingerprint (native Android prompt) or a 3x3 pattern. The app lock has no PIN (the Vault has a 4-digit recovery PIN, see vault.js).
   The pattern is kept as a salted SHA-256 hash. Five wrong patterns in a row add a waiting time.
   Fingerprint can have a pattern as backup; if the phone later has no fingerprint left and no backup exists, the lock turns itself off
   so you are never locked out of your own files. Loaded before ui.js; ui.js waits for LK.start before it asks for permissions. */
const LK={on:false,gate:null,start:null,onPat:null,fails:0,until:0,hiddenAt:0};
let LKP=null;
const lockType=()=>(S.lock&&S.lock.type)||'off';
const hasPattern=()=>!!(S.lock&&S.lock.h);
async function sha(t){
 try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
 catch{let a=5381,b=52711;for(const c of t){a=(a*33)^c.charCodeAt(0);b=(b*31+c.charCodeAt(0))>>>0}return'x'+(a>>>0).toString(16)+b.toString(16)}}
const hashPat=(p,salt)=>sha(salt+':'+p.join('-'));
const patOk=async p=>!!(S.lock&&S.lock.h)&&await hashPat(p,S.lock.salt)===S.lock.h;

/* the pattern pad: pointer events on a 3x3 grid; the middle dot of a straight line is picked up too */
const between=(a,b)=>{const ar=a/3|0,ac=a%3,br=b/3|0,bc=b%3;if((ar+br)%2||(ac+bc)%2)return -1;const m=((ar+br)/2)*3+(ac+bc)/2;return m===a||m===b?-1:m};
function padUI(el,done){
 el.replaceChildren();el.classList.remove('bad');
 const svg=document.createElementNS(NS,'svg'),line=document.createElementNS(NS,'polyline');svg.append(line);el.append(svg);
 const dots=[...Array(9)].map(()=>{const d=h('div','pd',null,h('i'));el.append(d);return d});
 let path=[],down=false,pt=null;
 const ctr=i=>{const r=el.getBoundingClientRect(),b=dots[i].getBoundingClientRect();return[b.left+b.width/2-r.left,b.top+b.height/2-r.top]};
 const render=()=>{const pts=path.map(ctr);if(down&&pt)pts.push(pt);line.setAttribute('points',pts.map(p=>p.join(',')).join(' '))};
 const add=i=>{path.push(i);dots[i].classList.add('on')};
 const hit=e=>{const r=el.getBoundingClientRect();pt=[e.clientX-r.left,e.clientY-r.top];
  for(let i=0;i<9;i++){if(path.includes(i))continue;const c=ctr(i);
   if(Math.hypot(pt[0]-c[0],pt[1]-c[1])<34){if(path.length){const m=between(path[path.length-1],i);if(m>=0&&!path.includes(m))add(m)}add(i);navigator.vibrate&&navigator.vibrate(8);break}}
  render()};
 const reset=()=>{path=[];down=false;pt=null;dots.forEach(d=>d.classList.remove('on'));render()};
 el.onpointerdown=e=>{reset();down=true;try{el.setPointerCapture(e.pointerId)}catch{}hit(e)};
 el.onpointermove=e=>{if(down)hit(e)};
 const up=()=>{if(!down)return;down=false;pt=null;render();if(path.length)done(path.slice())};
 el.onpointerup=up;el.onpointercancel=up;
 return{reset}}

/* the overlay */
const lkMsg=t=>{$('#lks').textContent=t||''};
function lkOpen(title,sub,o={}){
 $('#lkt').textContent=title;lkMsg(sub);
 $('#lkpad').style.display=o.pad===false?'none':'';$('#lkf').style.display=o.bio?'':'none';$('#lkc').style.display=o.cancel?'':'none';
 $('#lock').classList.add('on');document.body.classList.add('locked');
 LKP=padUI($('#lkpad'),p=>LK.onPat&&LK.onPat(p))}
function lkClose(){$('#lock').classList.remove('on');document.body.classList.remove('locked');LK.onPat=null;LKP=null}
function lkBad(msg){lkMsg(msg);const e=$('#lkpad');e.classList.add('bad');navigator.vibrate&&navigator.vibrate([30,40,30]);
 setTimeout(()=>{e.classList.remove('bad');LKP&&LKP.reset()},650)}

/* ask for the fingerprint; ok() runs when it is accepted */
async function bioAsk(ok){
 try{
  let a={ok:false};try{a=await LOCK.available()}catch{}
  if(!a.ok){
   if(!hasPattern()){S.lock={type:'off'};save();ok();toast('Fingerprint is not available any more, so the lock was turned off.');return}
   lkMsg((a.why||'Fingerprint is not available.')+' Use your pattern.');return}
  await LOCK.authenticate({title:'Unlock Conduint Files',subtitle:'Touch the fingerprint sensor',cancel:hasPattern()?'Use pattern':'Cancel'});
  ok()}
 catch(e){lkMsg(hasPattern()?'Use your pattern, or tap Use fingerprint.':(e&&e.code==='CANCELLED'?'':(e&&e.message)||'')+' Tap Use fingerprint to try again.')}}

/* [1] UNLOCK: at start, and again after you have been away from the app */
function lockGate(){
 if(LK.on)return LK.gate;LK.on=true;
 LK.gate=new Promise(res=>{
  const t=lockType(),usePad=t==='pattern'||hasPattern(),useBio=t==='bio'&&!!LOCK;
  lkOpen('Conduint Files',usePad?(useBio?'Use your fingerprint or draw your pattern':'Draw your pattern'):'Touch the fingerprint sensor',{pad:usePad,bio:useBio});
  const done=()=>{lkClose();LK.on=false;LK.fails=0;res()};
  LK.onPat=async p=>{
   const w=Math.ceil((LK.until-Date.now())/1000);if(w>0)return lkBad('Too many tries. Wait '+w+' s.');
   if(p.length<4)return lkBad('Connect at least 4 dots.');
   if(await patOk(p))return done();
   LK.fails++;if(LK.fails>=5){LK.until=Date.now()+30000*(LK.fails-4);return lkBad('Wrong pattern. Wait '+Math.round((LK.until-Date.now())/1000)+' s.')}
   lkBad('Wrong pattern. '+(5-LK.fails)+' tries left.')};
  $('#lkf').onclick=()=>bioAsk(done);
  if(useBio)bioAsk(done)});
 return LK.gate}
LK.start=lockType()==='off'?null:lockGate();
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){LK.hiddenAt=Date.now();return}
 const a=S.settings.lockAfter;
 if(lockType()!=='off'&&!LK.on&&LK.hiddenAt&&a>=0&&Date.now()-LK.hiddenAt>a*1000)lockGate()});

/* [2] SET A PATTERN: draw twice. Resolves true when saved, false when cancelled. */
function lockSetPattern(){return new Promise(res=>{
 let first=null;const ask='Draw a pattern, at least 4 dots';
 lkOpen('New pattern',ask,{cancel:true});
 $('#lkc').onclick=()=>{lkClose();res(false)};
 LK.onPat=async p=>{
  if(p.length<4)return lkBad('Connect at least 4 dots.');
  if(!first){first=p;lkMsg('Draw it again to confirm');LKP.reset();return}
  if(p.join()!==first.join()){first=null;lkBad('Those did not match. Start again.');setTimeout(()=>lkMsg(ask),700);return}
  const salt=Math.random().toString(36).slice(2)+Date.now().toString(36);
  S.lock={...S.lock,salt,h:await hashPat(p,salt)};save();lkClose();res(true)}})}

/* [3] CONFIRM IT IS YOU before the lock is changed or turned off */
function lockVerify(){
 const t=lockType();if(t==='off')return Promise.resolve(true);
 return new Promise(res=>{
  const usePad=t==='pattern'||hasPattern(),useBio=t==='bio'&&!!LOCK,fin=v=>{lkClose();res(v)};
  lkOpen('Confirm it is you',usePad?'Draw your pattern':'Touch the fingerprint sensor',{pad:usePad,bio:useBio,cancel:true});
  $('#lkc').onclick=()=>fin(false);
  LK.onPat=async p=>{if(await patOk(p))fin(true);else lkBad('Wrong pattern.')};
  $('#lkf').onclick=()=>bioAsk(()=>fin(true));
  if(useBio)bioAsk(()=>fin(true))})}

/* [4] SETTINGS ACTIONS */
async function lockOff(){if(lockType()==='off')return;if(await lockVerify()){S.lock={type:'off'};save();applySecure();drawSettings();toast('App lock is off.')}}
async function lockPattern(){
 if(lockType()!=='off'&&!await lockVerify())return;
 if(await lockSetPattern()){S.lock.type='pattern';save();applySecure();drawSettings();toast('Pattern lock is on.')}else drawSettings()}
async function lockBio(){
 if(!LOCK)return;if(lockType()==='bio')return;
 if(lockType()!=='off'&&!await lockVerify())return;
 let a={};try{a=await LOCK.available()}catch{}
 if(!a.ok)return toast(a.why||'This phone has no fingerprint set up. Add one in Android settings first.');
 try{await LOCK.authenticate({title:'Turn on fingerprint lock',subtitle:'Touch the sensor to confirm',cancel:'Cancel'})}catch{return toast('Fingerprint was not confirmed.')}
 S.lock={...S.lock,type:'bio'};save();applySecure();drawSettings();toast('Fingerprint lock is on.')}
async function lockBackup(){if(lockType()==='bio'&&!await lockVerify())return;if(await lockSetPattern()){drawSettings();toast('Pattern backup saved.')}else drawSettings()}
async function lockRmBackup(){if(!await lockVerify())return;delete S.lock.h;delete S.lock.salt;save();drawSettings()}

/* generic pattern prompt used by the Vault. o.twice: draw twice to confirm. o.check(path) -> true or an error text. o.bio / o.rec show the fingerprint and recovery buttons.
   Resolves {path}, {bio:true}, {rec:true} or null (cancelled). */
function patPrompt(title,sub,o={}){return new Promise(res=>{
 let first=null;const rc=$('#lkr');
 lkOpen(title,sub,{cancel:true,bio:!!o.bio});rc.style.display=o.rec?'':'none';
 const fin=v=>{rc.style.display='none';lkClose();res(v)};
 $('#lkc').onclick=()=>fin(null);rc.onclick=()=>fin({rec:true});$('#lkf').onclick=()=>fin({bio:true});
 LK.onPat=async p=>{
  if(p.length<4)return lkBad('Connect at least 4 dots.');
  if(o.twice){
   if(!first){first=p;lkMsg('Draw it again to confirm');LKP.reset();return}
   if(p.join()!==first.join()){first=null;lkBad('Those did not match. Start again.');setTimeout(()=>lkMsg(sub),700);return}
   return fin({path:p})}
  if(o.check){lkMsg('Checking…');const r=await o.check(p);if(r!==true)return lkBad(r||'Wrong pattern.')}
  fin({path:p})}})}
