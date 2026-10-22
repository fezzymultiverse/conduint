/* auth.js: Authenticator + Secure Vault. TOTP, Passwords, Secure Notes, SSH Keys, API Keys, Backup Codes, Passphrases.
   Secrets are AES-GCM encrypted at rest. The key is a non-extractable WebCrypto key kept in IndexedDB on this phone.
   Each account can carry a platform link: its logo is fetched when online (letter tile when offline).        */

/* ---- entry types ---- */
const AU_TYPES={
 totp: {label:'2FA Code',    icon:'🔐', hue:200, fields:['issuer','fullname','email','name','secret','link']},
 pass: {label:'Password',    icon:'🔑', hue:140, fields:['issuer','fullname','email','name','secret','link']},
 note: {label:'Secure Note', icon:'📝', hue:50,  fields:['issuer','note']},
 ssh:  {label:'SSH Key',     icon:'💻', hue:280, fields:['issuer','name','pubkey','privkey']},
 api:  {label:'API Key',     icon:'⚙️', hue:20,  fields:['issuer','name','secret','note']},
 bak:  {label:'Backup Codes',icon:'🔒', hue:0,   fields:['issuer','codes']},
 rec:  {label:'Recovery Key',icon:'🗝️', hue:320, fields:['issuer']},
 pass2:{label:'Passphrase',  icon:'💬', hue:170, fields:['issuer','note']},
 card: {label:'Card / PIN',  icon:'💳', hue:90,  fields:['issuer']}};
const AU_TYPE_ORDER=['totp','pass','note','ssh','api','bak','rec','pass2','card'];

const AU={list:[],eg:[],edit:null,form:null,tm:0,ready:false};
const auIs2fa=a=>(a.type||'totp')==='totp';/* V0.32.0: the Authenticator shows 2FA codes only; other saved entries are kept in storage, untouched and hidden */
/* empty groups (V0.22.1): names of groups that hold no account yet, kept in their own key and carried in backups as `groups` */
const AUG='cnd.auth.groups';
function auEgLoad(){try{const a=JSON.parse(localStorage.getItem(AUG)||'[]');return Array.isArray(a)?a.filter(s=>typeof s==='string'&&s.trim()).slice(0,200):[]}catch{return[]}}
function auEgSave(){const used=new Set(AU.list.map(a=>auxGroupOf(a).toLowerCase()).filter(Boolean));
 AU.eg=AU.eg.filter((g,i)=>!used.has(g.toLowerCase())&&AU.eg.findIndex(x=>x.toLowerCase()===g.toLowerCase())===i);
 try{AU.eg.length?localStorage.setItem(AUG,JSON.stringify(AU.eg)):localStorage.removeItem(AUG)}catch{}}
const auCanonAll=n=>auxCanon(AU.list.concat(AU.eg.map(g=>({group:g}))),n);
const AUK='cnd.auth.v1';
/* ---- crypto + storage ---- */
const auDB=()=>new Promise((res,rej)=>{const r=indexedDB.open('cnd-auth',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function auKey(){const db=await auDB();
 const get=()=>new Promise((res,rej)=>{const q=db.transaction('k').objectStore('k').get('main');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
 let k=await get();if(k)return k;
 k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await new Promise((res,rej)=>{const t=db.transaction('k','readwrite');t.objectStore('k').put(k,'main');t.oncomplete=res;t.onerror=()=>rej(t.error)});return k}
const au64=u=>{let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return btoa(s)};
const au64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const AU_BROKEN_MSG='Saved accounts could not be unlocked. Saving is blocked so they are not overwritten.';
function auGuard(){if(AU.broken)throw Error(AU_BROKEN_MSG);if(AU.locked)throw Error('Authenticator is locked. Unlock it first.')}
/* ---- master lock: when on, the list is encrypted with the Vault master key (VK, vault.js) and opens only with the Vault pattern / fingerprint / recovery PIN ---- */
const AUM='cnd.auth.m1',AUL='cnd.auth.lock';
const auLockOn=()=>localStorage.getItem(AUL)==='1';
async function auEncWith(k,obj){
 const iv=crypto.getRandomValues(new Uint8Array(12)),
  c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify(obj)))),o=new Uint8Array(12+c.length);
 o.set(iv);o.set(c,12);return au64(o)}
async function auDecWith(k,raw){
 const u=au64d(raw);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12)},k,u.subarray(12))))}
async function auLoad(){
 AU.broken=false;AU.locked=false;AU.eg=auEgLoad();
 const m=auLockOn(),sk=m?AUM:AUK;
 try{const raw=localStorage.getItem(sk);if(!raw){AU.list=[];return}
  if(m&&!VK){AU.list=[];AU.locked=true;return}
  AU.list=await auDecWith(m?VK:await auKey(),raw)}
 catch(e){AU.list=[];AU.broken=true;
  try{const raw=localStorage.getItem(sk);if(raw&&!localStorage.getItem(sk+'.bak'))localStorage.setItem(sk+'.bak',raw)}catch(_){}
  toast('Could not unlock saved accounts on this phone. They are kept untouched.')}}
async function auSave(){
 auGuard();
 if(auLockOn()){
  if(!VK&&!await vUnlock())throw Error('Unlock the vault to save.');
  localStorage.setItem(AUM,await auEncWith(VK,AU.list))}
 else localStorage.setItem(AUK,await auEncWith(await auKey(),AU.list));
 try{localStorage.setItem(AUP,String(auPinned().length))}catch{}
 if(typeof ckSync==='function')ckSync()}
async function auLockToggle(){
 try{
  auGuard();
  if(!auLockOn()){
   const r=await dlg({title:'Turn on master lock?',msg:'Your accounts will be encrypted with your Vault key and open only with your Vault pattern or fingerprint. If you lose the pattern, fingerprint and recovery PIN, they cannot be recovered.',ok:'Turn on'});if(!r)return;
   if(!await vUnlock())return;
   const raw=await auEncWith(VK,AU.list);
   if(JSON.stringify(await auDecWith(VK,raw))!==JSON.stringify(AU.list))throw Error('Check failed. Nothing was changed.');
   localStorage.setItem(AUM,raw);localStorage.setItem(AUL,'1');localStorage.removeItem(AUK);
   toast('Master lock is on.')}
  else{
   const r=await dlg({title:'Turn off master lock?',msg:'Your accounts will open without the Vault pattern or fingerprint.',ok:'Turn off'});if(!r)return;
   if(!await vUnlock())return;
   const k=await auKey(),raw=await auEncWith(k,AU.list);
   if(JSON.stringify(await auDecWith(k,raw))!==JSON.stringify(AU.list))throw Error('Check failed. Nothing was changed.');
   localStorage.setItem(AUK,raw);localStorage.removeItem(AUL);localStorage.removeItem(AUM);
   toast('Master lock is off.')}
  drawAu()}
 catch(e){toast(e.message||'Could not change the lock.')}}
/* ---- TOTP ---- */
function auB32(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';s=s.toUpperCase().replace(/[\s=-]/g,'');let bits='';
 for(const ch of s){const v=A.indexOf(ch);if(v<0)throw Error('That secret has characters a code key cannot have.');bits+=v.toString(2).padStart(5,'0')}
 const out=new Uint8Array(Math.floor(bits.length/8));for(let i=0;i<out.length;i++)out[i]=parseInt(bits.slice(i*8,i*8+8),2);
 if(out.length<10)throw Error('That secret is too short.');return out}
async function auCode(a,now){
 const per=a.period||30,dig=a.digits||6,alg={SHA1:'SHA-1',SHA256:'SHA-256',SHA512:'SHA-512'}[(a.algo||'SHA1').toUpperCase()]||'SHA-1';
 let c=Math.floor((now||Date.now())/1000/per);const m=new Uint8Array(8);for(let i=7;i>=0;i--){m[i]=c&255;c=Math.floor(c/256)}
 const k=await crypto.subtle.importKey('raw',auB32(a.secret),{name:'HMAC',hash:alg},false,['sign']),
  h=new Uint8Array(await crypto.subtle.sign('HMAC',k,m)),o=h[h.length-1]&15,
  n=(((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%Math.pow(10,dig);
 return String(n).padStart(dig,'0')}
function auParseUri(u){
 const m=/^otpauth:\/\/totp\/([^?]*)\?(.*)$/i.exec(u.trim());if(!m)throw Error('Only otpauth://totp links are supported.');
 const lab=decodeURIComponent(m[1]),q=new URLSearchParams(m[2]),i=lab.indexOf(':');
 const issuer=q.get('issuer')||(i>0?lab.slice(0,i):''),name=(i>0?lab.slice(i+1):lab).trim();
 if(!q.get('secret'))throw Error('That link has no secret.');
 return{issuer:issuer.trim(),name,secret:q.get('secret'),digits:+q.get('digits')||6,period:+q.get('period')||30,algo:(q.get('algorithm')||'SHA1').toUpperCase()}}
/* ---- platform link -> domain, logo, colour ---- */
function auDomain(v){v=(v||'').trim();if(!v)return'';try{const u=new URL(/^[a-z]+:\/\//i.test(v)?v:'https://'+v);return /\./.test(u.hostname)?u.hostname.replace(/^www\./,''):''}catch{return''}}
const auHue=a=>{const s=auDomain(a.link)||(a.issuer||a.name||'?').toLowerCase();let x=7;for(const c of s)x=(x*31+c.charCodeAt(0))%360;return x};
function auLogo(a){
 const box=h('div','aulogo'),d=auDomain(a.link),L=((a.issuer||a.name||'?').trim()[0]||'?').toUpperCase();
 box.append(h('span',null,L));
 if(d){const im=new Image();im.alt='';im.referrerPolicy='no-referrer';
  im.onload=()=>{if(im.naturalWidth>16)box.replaceChildren(im)};
  im.onerror=()=>{const j=new Image();j.referrerPolicy='no-referrer';j.onload=()=>box.replaceChildren(j);j.src='https://'+d+'/favicon.ico'};
  im.src='https://www.google.com/s2/favicons?sz=128&domain='+encodeURIComponent(d)}
 return box}
const auFmt=c=>c.length===6?c.slice(0,3)+' '+c.slice(3):c.length===8?c.slice(0,4)+' '+c.slice(4):c;
const auHide=()=>localStorage.getItem('cnd.auth.hide')==='1';
const AU_COPY={totp:'Code copied',pass:'Password copied',note:'Note copied',ssh:'Key copied',api:'API key copied',bak:'Backup code copied',rec:'Recovery key copied',pass2:'Passphrase copied',card:'Copied'};
function auCopy(t,msg){const ok=()=>toast(msg||'Copied');
 (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(ok,()=>{const x=document.createElement('textarea');x.value=t;document.body.append(x);x.select();try{document.execCommand('copy')}catch{}x.remove();ok()})}
/* ---- the account card ---- */
function auRingSvg(){const s=document.createElementNS(NS,'svg');s.setAttribute('class','aurg');s.setAttribute('viewBox','0 0 60 60');
 s.innerHTML='<circle class="bg" cx="30" cy="30" r="27"/><circle class="fg" cx="30" cy="30" r="27" transform="rotate(-90 30 30)"/>';return s}
/* ---- shared card helpers ---- */
function auCardShell(a,typeClass){
 const t=AU_TYPES[a.type||'totp']||AU_TYPES.totp;
 const hue=a._hue!=null?a._hue:t.hue;
 const el=h('div','aucard aucard-'+( a.type||'totp')+' '+(typeClass||''));
 el.style.setProperty('--h',hue);
 const more=h('button','ib aumore',null,ico('more'));
 const badge=h('span','autbadge',t.icon);
 const emailEl=h('span','auem',a.email||'');
 if(a.email){emailEl.title='Tap to copy email';emailEl.onclick=e=>{e.stopPropagation();auCopy(a.email,'Email copied')}}
 const nm=h('div','aunm',null,
  h('div','aunmrow',null,badge,h('b',null,a.issuer||a.name||t.label)),
  a.fullname?h('span','aufn',a.fullname):'',
  h('small',null,a.issuer&&a.name?a.name:''),
  emailEl);
 const cp=h('div','aucp','Copied');
 el.append(h('div','auhd',null,auLogo(a),nm,more),cp);
 return{el,more,cp,
  flash(){cp.classList.add('on');clearTimeout(el._ft);el._ft=setTimeout(()=>cp.classList.remove('on'),1100)}};
}

/* TOTP card (existing behaviour) */
function auCard(a){
 const ring=auRingSvg();
 const shell=auCardShell(a);
 const{el,more,cp,flash}=shell;
 /* swap logo area for ring+logo */
 const logo=el.querySelector('.aulogo');
 const rw=h('div','aurw',null,ring,logo);
 el.querySelector('.auhd').prepend(rw);
 el.querySelector('.auhd').querySelector('.aulogo').remove();/* remove duplicate */
 const code=h('div','aucd'),secs=h('span','aut'),nx=h('span','aunx');
 el.querySelector('.auhd').after(h('div','aubd',null,code,h('div','aumeta',null,secs,nx)));
 const C=2*Math.PI*27,fg=ring.querySelector('.fg');fg.style.strokeDasharray=C;
 const o={el,more,x:{rev:0},
  set(c,left,per,frac,next){
   const show=!auHide()||Date.now()<o.x.rev;
   const t=show?auFmt(c):c.replace(/\d/g,'\u2022').replace(/^(\u2022{3})/,'$1 ');
   if(code.textContent!==t)code.textContent=t;code.classList.toggle('hid',!show);
   fg.style.strokeDashoffset=C*(1-frac);el.classList.toggle('low',left<=5);secs.textContent=left+'s';
   secs.style.opacity='1';
   nx.textContent=next&&show?'Next '+auFmt(next):'';o.c=c},
  flash};
 return o}

/* PASSWORD card */
function auCardPass(a){
 const{el,more,flash}=auCardShell(a);
 const show=()=>!auHide();
 const val=h('div','aucd aucd-pass',null,
  h('span','aucdlbl','Password'),
  h('span','aucdval',show()?'••••••••':'••••••••'));
 el.append(h('div','aubd',null,val,h('div','aumeta',null,h('span','autbadge-sm','🔑'))));
 el._copyVal=a.secret||'';
 return{el,more,flash,c:a.secret||''}}

/* SECRET cards (backup codes, recovery keys, SSH, API keys, notes, passphrases): a summary; tap opens the individual items */
function auCardMulti(a){
 const{el,more,flash}=auCardShell(a),it=auxItems(a),bak=a.type==='bak',o={el,more,flash,c:''};
 const lab=bak?it.filter(i=>!i.u).length+' of '+it.length+' codes left':it.length+(it.length===1?' item':' items');
 const chips=h('div','aubakbar');
 auxItemOrder(it,AU.sort).slice(0,4).forEach(k=>{const i=it[k];chips.append(h('span','aubakpill'+(bak&&i.u?' used':''),bak?(auHide()?'••••••':i.v):(i.t||'Untitled')))});
 if(it.length>4)chips.append(h('span','aubakpill','+'+(it.length-4)));
 el.append(h('div','aubd aunote-bd',null,h('span','aucdlbl',lab),chips));
 return o}
/* compact list rows (V0.28.6): one line per account, many on one screen. Same interface as a card: {el,more,flash,c,x,set?} */
const auViewGet=()=>{try{return localStorage.getItem('cnd.auth.view')==='card'?'card':'list'}catch{return'list'}};
function auRowAny(a){
 const T=a.type||'totp',t=AU_TYPES[T]||AU_TYPES.totp,it=auxMulti(T)?auxItems(a):[];
 const el=h('div','aurow aurow-'+T),cp=h('div','aucp','Copied'),more=h('button','ib aumore',null,ico('more'));
 el.style.setProperty('--h',a._hue!=null?a._hue:t.hue);
 const sub=(T==='totp'||T==='pass')?[a.issuer&&a.name?a.name:'',a.email&&a.email!==a.name?a.email:''].filter(Boolean).join(' · '):[t.label,a.name].filter(Boolean).join(' · ');
 const side=h('div','auside'),o={el,more,x:{rev:0},c:'',flash(){cp.classList.add('on');clearTimeout(el._ft);el._ft=setTimeout(()=>cp.classList.remove('on'),1100)}};
 el.append(auLogo(a),h('div','aunm',null,h('b',null,a.issuer||a.name||t.label),h('small',null,sub||t.label)),side,more,cp);
 if(T==='totp'){
  const code=h('span','aurc','······'),secs=h('small','aurs'),bar=h('i','aurbar');side.append(code,secs);el.append(bar);
  o.set=(c,left,per,frac,next)=>{const show=!auHide()||Date.now()<o.x.rev;
   const tx=show?auFmt(c):c.replace(/\d/g,'\u2022').replace(/^(\u2022{3})/,'$1 ');
   if(code.textContent!==tx)code.textContent=tx;code.classList.toggle('hid',!show);
   secs.textContent=left+'s'+(next&&show?' · next '+auFmt(next):'');bar.style.width=(frac*100)+'%';el.classList.toggle('low',left<=5);o.c=c}}
 else if(T==='pass'){side.append(h('span','aurc hid','\u2022\u2022\u2022\u2022\u2022\u2022'),h('small','aurs','tap to copy'));o.c=a.secret||''}
 else{const bak=T==='bak';side.append(h('span','aurc cnt',bak?it.filter(i=>!i.u).length+'/'+it.length:String(it.length)),h('small','aurs',bak?'codes left':it.length===1?'item':'items'))}
 return o}
function auCardAny(a){return auxMulti(a.type)?auCardMulti(a):a.type==='pass'?auCardPass(a):auCard(a)}
/* ---- main screen ---- */
function drawAuLocked(){
 TV.view='au';clearInterval(AU.tm);AU.list=[];const B=$('#tbody');B.replaceChildren();head('Authenticator',true);B.classList.add('auscreen');
 const w=h('div','auempty');w.append(h('b',null,'Authenticator is locked'),h('p',null,'Unlock with your Vault pattern or fingerprint.'));
 const b=h('button','aufab static',null,ico('lock'),h('span',null,'Unlock'));b.onclick=()=>tAuth();B.append(w,b)}
async function tAuth(){TV.view='au';AU.q='';AU.apKey=null;
 if(auLockOn()&&!VK){drawAuLocked();
  try{if(!await vUnlock())return}catch(e){toast('Vault error: '+(e.message||e));return}
  if(TV.view!=='au')return}
 await auLoad();AU.ready=true;drawAu()}
const auEmpty=B=>{
 const w=h('div','auempty');
 w.innerHTML='<svg viewBox="0 0 120 120" class="auhero"><defs><linearGradient id="aug" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--acc)"/><stop offset="1" stop-color="var(--red)"/></linearGradient></defs><path d="M60 10l38 14v28c0 26-16 44-38 56C38 96 22 78 22 52V24z" fill="none" stroke="url(#aug)" stroke-width="5" stroke-linejoin="round"/><circle cx="60" cy="52" r="10" fill="none" stroke="url(#aug)" stroke-width="5"/><path d="M60 62v22M60 74h9" fill="none" stroke="url(#aug)" stroke-width="5" stroke-linecap="round"/></svg>';
 w.append(h('b',null,'Your codes live here'),h('p',null,'Add GitLab, GitHub, Google and anything else that asks for a 6-digit code. Secrets stay encrypted on this phone.'));
 const row=h('div','auqp');AU_PICKS.slice(0,6).forEach(([n,d])=>{const b=h('button','auchip',null,auLogo({issuer:n,link:d}),h('span',null,n));b.style.setProperty('--h',auHue({link:d}));b.onclick=()=>auOpenForm(null,{issuer:n,link:d});row.append(b)});
 w.append(row);B.append(w)};
const auHay=a=>[a.issuer,a.name,a.fullname,a.email,a.link,auDomain(a.link),a.group].concat(auxItems(a).map(i=>i.t)).filter(Boolean).join(' ').toLowerCase();
const auSortGet=()=>{try{return localStorage.getItem('cnd.auth.sort')==='added'?'added':'az'}catch{return'az'}};
const AU_NOGRP='\u0000';
function drawAu(){
 if(auLockOn()&&!VK){tAuth();return}
 /* V0.32.0: Authenticator is 2FA codes only, so the profile screen (logins, notes, keys) is not used */
 TV.view='au';clearInterval(AU.tm);AU.sort=auSortGet();const B=$('#tbody');B.replaceChildren();head('Authenticator',true);B.classList.add('auscreen');
 const n=AU.list.filter(auIs2fa).length,gl=auxGroups(AU.list.filter(auIs2fa),AU.eg),sel=AU.sel||null,az=AU.sort==='az';
 if(AU.grp&&AU.grp!==AU_NOGRP&&!gl.some(g=>g[0]===AU.grp))AU.grp='';
 let cnt=null,top;
 if(sel){cnt=h('b',null,sel.size+' selected');
  top=h('div','auhead',null,h('div',null,null,cnt,h('small',null,'Tap accounts to pick them')));
  const gb=h('button','autab on','Group…'),db=h('button','autab','Delete'),xb=h('button','autab','Done');
  gb.onclick=()=>{if(sel.size)auGroupPick([...sel]);else toast('Pick at least one account.')};
  db.onclick=async()=>{if(!sel.size)return;const r=await dlg({title:'Delete '+sel.size+' accounts?',msg:'They cannot be recovered unless you have a backup.',ok:'Delete',danger:true});if(!r)return;
   try{auGuard()}catch(e){toast(e.message);return}
   const keep=AU.list.filter(a=>!sel.has(a)),old=AU.list;AU.list=keep;try{await auSave()}catch(e){AU.list=old;toast(e.message||'Could not save.');return}
   AU.sel=null;drawAu();toast('Deleted')};
  xb.onclick=()=>{AU.sel=null;drawAu()};top.append(gb,db,xb)}
 else{
  top=h('div','auhead',null,h('div',null,null,h('b',null,n?n+(n===1?' account':' accounts'):'No accounts yet'),h('small',null,n?'Tap a code to copy it':'Two-step codes, encrypted on this phone')));
  if(n){const vw=h('button','auicon',null,ico(auViewGet()==='list'?'grid':'list'));vw.title=auViewGet()==='list'?'Card view':'List view';
   vw.onclick=()=>{try{localStorage.setItem('cnd.auth.view',auViewGet()==='list'?'card':'list')}catch{}drawAu()};top.append(vw);
   const eye=h('button','auicon'+(auHide()?' on':''),null,ico(auHide()?'eyeoff':'eye'));eye.title='Hide codes';
   eye.onclick=()=>{localStorage.setItem('cnd.auth.hide',auHide()?'0':'1');drawAu()};top.append(eye)}
  const lk=h('button','auicon'+(auLockOn()?' on':''),null,ico('lock'));lk.title=auLockOn()?'Master lock is on. Tap to turn off.':'Turn on master lock';lk.onclick=auLockToggle;top.append(lk);
  const im=h('button','auicon',null,ico('more'));im.title='Groups, sort, back up, import';
  im.onclick=e=>{e.stopPropagation();const r=im.getBoundingClientRect();
   menu(Math.max(10,r.right-230),r.bottom,[
    ['Clean up and find duplicates…',pfCleanup],
    ['Select accounts…',()=>{AU.sel=new Set();drawAu()}],
    ['New group…',()=>auNewGroup()],
    ['Group same platform…',auAutoGroup],
    [auViewGet()==='list'?'Card view':'List view',()=>{try{localStorage.setItem('cnd.auth.view',auViewGet()==='list'?'card':'list')}catch{}drawAu()}],
    ['Sort A to Z',()=>{try{localStorage.setItem('cnd.auth.sort',az?'added':'az')}catch{}drawAu()},'c',az],
    ['hr'],
    ['Back up (encrypted)…',auExport],
    ['Export CSV, password (AES)…',()=>auExportCsv('pass')],
    ['Export CSV, no password (this phone)…',()=>auExportCsv('phone')],
    ['Export setup keys, readable (.json)…',()=>auExportKeys('json')],
    ['Export setup keys as links (.txt)…',()=>auExportKeys('txt')],
    ['Restore or import from file…',auImport]])};
  top.append(im)}
 B.append(top);
 if(!n){auEmpty(B);const f=h('button','aufab',null,ico('plus'),h('span',null,'Add account'));f.onclick=()=>auOpenForm();B.append(f);return}
 const find=h('input','ausearch');find.placeholder='Search name, email, site or group';find.value=AU.q||'';find.autocomplete='off';B.append(find);
 const gbar=h('div','autabs augbar'),tabs=h('div','autabs'),list=h('div','aulist');
 B.append(gbar);
 const allTypes=['all',...AU_TYPE_ORDER.filter(t=>AU.list.some(a=>(a.type||'totp')===t))];
 let activeTab=allTypes.includes(AU.tab)?AU.tab:'all';
 const drawTabs=()=>{tabs.replaceChildren();allTypes.forEach(t=>{
  const lbl=t==='all'?'All':(AU_TYPES[t]||{}).icon+' '+(AU_TYPES[t]||{}).label;
  const b=h('button','autab'+(t===activeTab?' on':''),lbl);
  b.onclick=()=>{activeTab=t;AU.tab=t;drawTabs();build()};tabs.append(b)})};
 if(allTypes.length>2)B.append(tabs);
 B.append(list);drawTabs();
 const ungrouped=AU.list.filter(a=>auIs2fa(a)&&!auxGroupOf(a)).length;
 const drawG=()=>{gbar.replaceChildren();
  const mk=(lbl,val,c)=>{const on=(AU.grp||'')===val,b=h('button','autab'+(on?' on':''),lbl+(c!=null?' '+c:''));
   b.onclick=()=>{if(on&&val&&val!==AU_NOGRP){auGroupMenu(val,b);return}AU.grp=val;drawG();build()};gbar.append(b)};
  mk('All','',null);gl.forEach(([g,c])=>mk(g,g,c));if(gl.length&&ungrouped)mk('No group',AU_NOGRP,ungrouped);
  const nb=h('button','autab','＋ Group');nb.onclick=()=>auNewGroup();gbar.append(nb)};
 drawG();
 const cards=[],col=AU.col||(AU.col=new Set()),listMode=auViewGet()==='list';list.classList.toggle('rows',listMode);
 const build=()=>{list.replaceChildren();cards.length=0;const q=(AU.q||'').toLowerCase(),g0=AU.grp||'';
  const idxs=auxOrder(AU.list,AU.list.map((_,i)=>i).filter(i=>{const a=AU.list[i];
   if(!auIs2fa(a))return false;
   if(activeTab!=='all'&&(a.type||'totp')!==activeTab)return false;
   if(g0===AU_NOGRP&&auxGroupOf(a))return false;if(g0&&g0!==AU_NOGRP&&auxGroupOf(a)!==g0)return false;
   return!q||auHay(a).includes(q)}),AU.sort);
  const addCard=idx=>{const a=AU.list[idx],c=listMode?auRowAny(a):auCardAny(a);c.a=a;c.idx=idx;
   c.el.classList.toggle('ausel',!!(AU.sel&&AU.sel.has(a)));
   let lpT=0,lp=false,px=0,py=0;
   c.el.onpointerdown=e=>{lp=false;clearTimeout(lpT);if(AU.sel)return;px=e.clientX;py=e.clientY;lpT=setTimeout(()=>{lp=true;navigator.vibrate&&navigator.vibrate(12);AU.sel=new Set([a]);drawAu()},520)};
   c.el.onpointermove=e=>{if(Math.hypot(e.clientX-px,e.clientY-py)>10)clearTimeout(lpT)};
   c.el.onpointerup=c.el.onpointercancel=c.el.onpointerleave=()=>clearTimeout(lpT);
   c.el.onclick=()=>{if(lp){lp=false;return}
    if(AU.sel){AU.sel.has(a)?AU.sel.delete(a):AU.sel.add(a);c.el.classList.toggle('ausel',AU.sel.has(a));if(cnt)cnt.textContent=AU.sel.size+' selected';return}
    if(auxMulti(a.type)){auOpenDetail(a);return}
    if(c.c){auCopy(c.c,AU_COPY[a.type||'totp']);c.flash();if(c.x&&auHide()){c.x.rev=Date.now()+10000;tick()}}};
   c.more.onclick=e=>{e.stopPropagation();if(!AU.sel)auMenu(idx,c.more)};
   if(AU.sel)c.more.style.visibility='hidden';
   list.append(c.el);cards.push(c)};
  if(g0===''&&gl.length&&!q){
   [...gl.map(g=>g[0]),''].forEach(name=>{const m=idxs.filter(i=>auxGroupOf(AU.list[i])===name);if(!m.length)return;
    const hd=h('button','augh',null,h('b',null,name||'No group'),h('small',null,String(m.length)),h('span',null,col.has(name)?'▸':'▾'));
    hd.onclick=()=>{col.has(name)?col.delete(name):col.add(name);build()};
    list.append(hd);if(!col.has(name))m.forEach(addCard)})}
  else idxs.forEach(addCard);
  if(!idxs.length)list.append(h('div','aunote',q?'Nothing matches “'+AU.q+'”.':'Nothing here yet.'));tick()};
 const tick=async()=>{if(TV.view!=='au'){clearInterval(AU.tm);return}
  if(auLockOn()&&!VK){clearInterval(AU.tm);tAuth();return}
  const now=Date.now();
  for(const c of cards){if(!c.set)continue;const per=c.a.period||30,ms=per*1000,ctr=Math.floor(now/ms),left=per-Math.floor(now/1000)%per,frac=1-(now%ms)/ms;
   try{if(c.ctr!==ctr){c.cc=await auCode(c.a,now);c.nc=null;c.ctr=ctr}
    if(left<=5&&!c.nc)c.nc=await auCode(c.a,now+ms);
    c.set(c.cc,left,per,frac,left<=5?c.nc:null)}
   catch(e){c.set('------',left,per,frac,null);if(!c.bad){c.bad=1;toast('One account has a bad setup key.')}}}};
 find.oninput=()=>{AU.q=find.value;build()};
 if(!sel){const f=h('button','aufab',null,ico('plus'),h('span',null,'Add'));f.onclick=()=>auOpenForm();B.append(f)}
 build();AU.tm=setInterval(tick,500)}
function auMenu(i,anchor){const a=AU.list[i];
 const r=anchor.getBoundingClientRect(),m=[];
 if(auxMulti(a.type))m.push(['Open items',()=>auOpenDetail(a)]);
 if((a.type||'totp')==='totp')m.push([a.pin?'Unpin from Home':'Pin to Home',()=>auPin(a)],['Show setup key…',()=>auShowKey(a)],['Copy setup key',()=>auCopyKey(a)],['Copy setup link',()=>auCopyLink(a)]);
 m.push(['Edit',()=>auOpenForm(i)],['Group…',()=>auGroupPick([a])],
  ['Delete',async()=>{const r=await dlg({title:'Delete '+(a.issuer||a.name||'account')+'?',msg:'You lose these codes unless you saved the setup key. Turn 2-step off on the site first, or you may get locked out.',ok:'Delete',danger:true});
   if(!r)return;try{auGuard()}catch(e){toast(e.message);return}
   const at=AU.list.indexOf(a);AU.list.splice(at,1);try{await auSave()}catch(e){AU.list.splice(at,0,a);toast(e.message||'Could not save.');return}drawAu();toast('Deleted')}]);
 menu(Math.max(10,r.right-170),r.bottom,m)}
/* ---- add / edit ---- */
const AU_PICKS=[['GitLab','gitlab.com'],['GitHub','github.com'],['Google','google.com'],['Microsoft','microsoft.com'],['Discord','discord.com'],['Dropbox','dropbox.com'],['Cloudflare','cloudflare.com'],['Amazon','amazon.com'],['PayPal','paypal.com'],['Epic Games','epicgames.com']];
function auxFormItems(F){
 const lines=x=>String(x||'').split('\n').map(v=>v.trim().replace(/^(?:[-*•]|\d{1,3}[.)])\s+/,'')).filter(Boolean),t=(F.itl||'').trim();
 switch(F.type){
  case'bak':return lines(F.codes).map(c=>({t:'',v:c,u:0}));
  case'rec':case'card':return F.secret.trim()?[{t,v:F.secret.trim()}]:[];
  case'ssh':return(F.pubkey.trim()||F.privkey.trim())?[{t,pub:F.pubkey.trim(),prv:F.privkey.trim()}]:[];
  case'note':case'pass2':return F.note.trim()?[{t,v:F.note.trim()}]:[];
  case'api':return F.secret.trim()?[{t,v:F.secret.trim(),n:F.note||''}]:[]}
 return[]}
function auOpenForm(i,pre){AU.edit=i==null?null:i;const a=i==null?{}:AU.list[i];
 AU.form=Object.assign({type:'totp',issuer:a.issuer||'',name:a.name||'',fullname:a.fullname||'',email:a.email||'',secret:a.secret||'',note:a.note||'',pubkey:a.pubkey||'',privkey:a.privkey||'',codes:a.codes||'',link:a.link||'',group:a.group||'',itl:'',digits:a.digits||6,period:a.period||30,algo:a.algo||'SHA1',adv:false},pre||{});
 if(i==null&&AU.grp&&AU.grp!==AU_NOGRP&&!AU.form.group)AU.form.group=AU.grp;
 drawAuForm()}
function drawAuForm(){
 TV.view='aua';clearInterval(AU.tm);const B=$('#tbody'),F=AU.form,old=AU.edit!=null?AU.list[AU.edit]:null,isNew=AU.edit==null;B.replaceChildren();B.classList.add('auscreen');head(isNew?'New account':'Edit account',true);
 const pv=h('div','aupv');
 const paint=async()=>{pv.replaceChildren();const dom=auDomain(F.link);
  const a={type:F.type||'totp',issuer:F.issuer.trim()||AU_TYPES[F.type||'totp'].label,name:F.name.trim(),fullname:F.fullname.trim(),email:F.email.trim(),link:F.link,secret:F.secret.replace(/\s/g,''),note:F.note,pubkey:F.pubkey,privkey:F.privkey,codes:F.codes,digits:F.digits,period:F.period,algo:F.algo};
  if(auxMulti(a.type))a.items=isNew?auxFormItems(F):auxItems(old.type===a.type?old:Object.assign({},old,{type:a.type,items:undefined}));
  const c=auCardAny(a);c.more.style.visibility='hidden';
  if(a.type==='totp'){
   let code='';try{if(a.secret&&!/^otpauth:/i.test(a.secret))code=await auCode(a)}catch{}
   if(c.set)c.set(code||'000000',F.period-Math.floor(Date.now()/1000)%F.period,F.period,.6,null);
   if(!code){c.el.classList.add('ghost');const cd=c.el.querySelector('.aucd');if(cd)cd.textContent='••• •••'}}
  pv.append(c.el,h('small','aupvn',a.type==='totp'?(dom?(a.secret?'Live code. If it matches the site, your key is right.':'Logo from '+dom+' (loads when online)'):'Add a platform link to show its logo.'):AU_TYPES[a.type].label+' entry preview.'))};
 B.append(h('div','ausec','Preview'),pv);
 const picks=h('div','auqp scroll');
 AU_PICKS.forEach(([n,d])=>{const b=h('button','auchip',null,auLogo({issuer:n,link:d}),h('span',null,n));b.style.setProperty('--h',auHue({link:d}));b.onclick=()=>{F.issuer=n;F.link=d;drawAuForm()};picks.append(b)});
  if(F.type==='totp')B.append(h('div','ausec','Quick pick'),picks);
 B.append(h('div','ausec','Details'));
 const fld=(lab,key,ph,hint,extra,textarea)=>{
  const w=h('div','aufld');w.append(h('label',null,lab));
  const r=h('div','aufr');let inp;
  if(textarea){inp=document.createElement('textarea');inp.className='autarea';inp.rows=4}else inp=h('input');
  inp.value=F[key]||'';inp.placeholder=ph||'';inp.autocomplete='off';inp.spellcheck=false;inp.autocapitalize='none';
  inp.oninput=()=>{F[key]=inp.value;clearTimeout(fld.t);fld.t=setTimeout(paint,250)};
  inp.onchange=()=>{if(key==='secret'&&/^otpauth:/i.test(inp.value)){try{Object.assign(F,auParseUri(inp.value));drawAuForm()}catch(e){toast(e.message)}}};
  r.append(inp);if(extra)r.append(extra(inp));w.append(r);if(hint)w.append(h('small',null,hint));B.append(w);return inp};
 const eye=inp=>{inp.type='password';const b=h('button','auicon',null,'👁');b.onclick=()=>{inp.type=inp.type==='password'?'text':'password'};return b};
 const multi=auxMulti(F.type);
 fld('Platform name','issuer','GitHub','Shown as the card title. Tap Check on the link below to fill it in for you.');
 if(['totp','pass'].includes(F.type)){
  fld('Your name','fullname','Jane Smith','Shown on the card.');
  fld('Email','email','you@example.com','Tap the card to copy.');
  fld('Account name','name','you@example.com','The username or email you log in with.')}
 if(F.type==='totp'){
  fld('Setup key or otpauth:// link','secret','JBSW Y3DP EHPK 3PXP','Paste the key from “can’t scan the QR code?”.',inp=>{
   const b=h('button','auicon',null,ico('copy'));b.title='Paste';b.onclick=async()=>{try{inp.value=await navigator.clipboard.readText();inp.oninput();inp.onchange()}catch{toast('Long-press the field to paste.')}};return b});
  fld('Platform link','link','github.com','Paste the site address, then tap Check. It sets the logo and fills in the platform name.',inp=>{const b=h('button','auicon',null,'Check');b.style.cssText='width:auto;padding:0 12px;font-size:12px;font-weight:700';b.onclick=()=>auCheckLink(F,drawAuForm);return b})}
 if(F.type==='pass'){fld('Password','secret','','',eye);fld('Website','link','https://example.com');fld('Notes','note','Optional','',null,true)}
 if(multi&&!isNew)B.append(h('small','aupvn','Add, edit and delete the individual items on the next screen. Each code, key, SSH pair or note is its own item.'));
 if(multi&&isNew){
  B.append(h('div','ausec','First item (optional, add more after saving)'));
  if(F.type!=='bak')fld(F.type==='ssh'?'Key label':'Item label','itl','e.g. Laptop, Work, Old phone');
  if(F.type==='note'||F.type==='pass2')fld(F.type==='pass2'?'Passphrase':'Note','note','Write it here…','',null,true);
  if(F.type==='ssh'){fld('Public key','pubkey','ssh-ed25519 AAAA…','',null,true);fld('Private key','privkey','-----BEGIN …','Stored encrypted on this phone.',null,true)}
  if(F.type==='api'){fld('API Key','secret','sk-…','',eye);fld('Notes','note','Scope, expiry…','',null,true)}
  if(F.type==='rec')fld('Recovery key','secret','Paste the key or phrase','',null,true);
  if(F.type==='card')fld('Value','secret','Card number, CVC, expiry, PIN…','Add the other details after saving. Each one copies on its own.',null,true);
  if(F.type==='bak')fld('Backup codes','codes','One code per line…','Each code becomes its own item you can cross off, copy or delete.',null,true)}
 B.append(h('div','ausec','Group'));
 const gw=h('div','auqp'),gs=auxGroups(AU.list).map(g=>g[0]);if(F.group&&!gs.includes(F.group))gs.push(F.group);
 const gc=(lbl,val)=>{const b=h('button','autab'+((F.group||'')===val?' on':''),lbl);b.onclick=()=>{F.group=val;drawAuForm()};gw.append(b)};
 gc('None','');gs.forEach(g=>gc(g,g));
 const nb=h('button','autab','＋ New');nb.onclick=async()=>{const r=await dlg({title:'New group',value:'',ok:'Create'});if(r&&r.v){F.group=auxCanon(AU.list,r.v);drawAuForm()}};gw.append(nb);B.append(gw);
 if(F.type==='totp'){
  const adv=h('button','auadv',(F.adv?'Hide':'Show')+' advanced');adv.onclick=()=>{F.adv=!F.adv;drawAuForm()};B.append(adv);
  if(F.adv){const seg=(lab,key,opts)=>{const w=h('div','aufld');w.append(h('label',null,lab));const r=h('div','auseg');opts.forEach(([v,t])=>{const b=h('button',F[key]===v?'on':'',t);b.onclick=()=>{F[key]=v;drawAuForm()};r.append(b)});w.append(r);B.append(w)};
   seg('Digits','digits',[[6,'6'],[8,'8']]);seg('Refresh every','period',[[30,'30 s'],[60,'60 s']]);seg('Algorithm','algo',[['SHA1','SHA-1'],['SHA256','SHA-256'],['SHA512','SHA-512']])}}
 const save=h('button','aufab static',null,ico('check'),h('span',null,isNew?'Save account':'Save changes'));
 save.onclick=async()=>{try{
   auGuard();
   const type=F.type||'totp';let a;
   if(type==='totp'){
    const sec=F.secret.trim();
    if(/^otpauth:/i.test(sec)){a=Object.assign(auParseUri(sec),{type});if(F.issuer.trim())a.issuer=F.issuer.trim();if(F.name.trim())a.name=F.name.trim()}
    else a={type,issuer:F.issuer.trim(),name:F.name.trim(),secret:sec.replace(/\s/g,''),digits:F.digits,period:F.period,algo:F.algo};
    a.link=F.link.trim();
    if(a.link&&!auDomain(a.link))throw Error('That platform link does not look right.');
    await auCode(a)}
   else if(multi){
    const same=old&&old.type===type;
    a=same?Object.assign({},old):{type};
    a.issuer=F.issuer.trim();a.name=(F.name||'').trim();
    a.items=!old?auxFormItems(F):same?auxItems(old).map(x=>Object.assign({},x)):auxItems(Object.assign({},old,{type,items:undefined}));
    auxSync(a)}
   else a={type,issuer:F.issuer.trim(),name:(F.name||'').trim(),secret:F.secret,link:F.link.trim(),note:F.note};
   a.fullname=(F.fullname||'').trim();a.email=(F.email||'').trim();
   if(!a.issuer&&!a.name)throw Error('Add a title or name.');
   auxSetGroup(a,auxCanon(AU.list,F.group));
   const at=AU.edit,prev=at==null?null:AU.list[at];
   if(prev&&prev.pin&&(a.type||'totp')==='totp')a.pin=1;
   if(at==null)AU.list.push(a);else AU.list[at]=a;
   try{await auSave()}catch(e){if(at==null)AU.list.pop();else AU.list[at]=prev;throw e}
   if(multi){auOpenDetail(a);toast('Saved')}else{drawAu();toast('Saved')}}catch(e){toast(e.message||'Could not save.')}};
 B.append(save);paint()}

/* ---- import: CSV (Google, Chrome, Edge, Firefox, Bitwarden, LastPass, 1Password), Bitwarden JSON, Aegis plain JSON, otpauth:// lists ---- */
function auCsv(text){
 text=text.replace(/^﻿/,'');
 const first=text.split(/\r?\n/,1)[0]||'';
 const d=first.includes('\t')?'\t':(first.split(';').length>first.split(',').length?';':',');
 const rows=[];let row=[],f='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"'&&f==='')q=true;
  else if(c===d){row.push(f);f=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';rows.push(row);row=[]}
  else f+=c}
 if(f!==''||row.length){row.push(f);rows.push(row)}
 return rows.filter(r=>r.some(x=>x.trim()!==''))}
function auMkTotp(issuer,name,sec){
 sec=(sec||'').trim();if(!sec)return null;
 if(/^otpauth:/i.test(sec)){try{const p=auParseUri(sec);if(!p.issuer&&issuer)p.issuer=issuer;if(!p.name&&name)p.name=name;return Object.assign(p,{type:'totp',link:''})}catch{return null}}
 return{type:'totp',issuer:issuer||name||'',name:name||'',secret:sec.replace(/\s/g,''),digits:6,period:30,algo:'SHA1',link:''}}
function auFromAegis(o){
 const db=o.db;if(!db||typeof db==='string')throw Error('That Aegis file is encrypted. Export it as plain JSON.');
 const out=[];let skipped=0;
 for(const e of db.entries||[]){
  if(String(e.type).toLowerCase()!=='totp'||!e.info||!e.info.secret){skipped++;continue}
  out.push({type:'totp',issuer:e.issuer||e.name||'',name:e.name||'',secret:String(e.info.secret).replace(/\s/g,''),digits:+e.info.digits||6,period:+e.info.period||30,algo:String(e.info.algo||'SHA1').toUpperCase(),link:''})}
 return{items:out,skipped}}
function auFromOtp(text){
 const out=[];let skipped=0;
 for(const ln of text.split(/\r?\n/)){const s=ln.trim();if(!s)continue;
  const t=/^otpauth:/i.test(s)?auMkTotp('','',s):null;if(t)out.push(t);else skipped++}
 return{items:out,skipped}}
const auKeyOf=e=>[e.type||'totp',(e.issuer||'').toLowerCase(),(e.name||'').toLowerCase(),e.secret||e.note||e.codes||e.privkey||e.pubkey||'',e.items?JSON.stringify(e.items):''].join('\u0001');
async function auDedupe(r){
 const items=[],have=new Set(AU.list.map(auKeyOf));let bad=r.skipped||0,dup=0;
 for(const e of r.items){
  if(!e||typeof e!=='object'||!AU_TYPES[e.type||'totp']){bad++;continue}
  if((e.type||'totp')==='totp'){try{await auCode(e)}catch{bad++;continue}}
  const k=auKeyOf(e);if(have.has(k)){dup++;continue}have.add(k);items.push(e)}
 return{items,bad,dup}}
async function auParseImport(text,fname,keepAll){
 const t=text.replace(/^﻿/,'').trim();if(!t)throw Error('That file is empty.');
 let r;
 if(t[0]==='{'||t[0]==='['){let o;try{o=JSON.parse(t)}catch{throw Error('That JSON file could not be read.')}
  if(o&&o.app==='conduint-auth-keys'&&Array.isArray(o.entries))r=auFromKeys(o);
  else if(o&&Array.isArray(o.items))r=auxFromBw(o);
  else if(o&&o.db!==undefined)r=auFromAegis(o);
  else throw Error('Unknown JSON format. Bitwarden and Aegis (plain) are supported.')}
 else if(/^otpauth:/i.test(t))r=auFromOtp(t);
 else{let rows=[];try{rows=auCsv(t)}catch{}
  r=rows.length>=2&&rows[0].length>=2?auxFromCsv(t,rows,fname||'Imported'):auxBlob(t,fname||'Imported')}
 if(!keepAll){const n0=r.items.length;r.items=r.items.filter(auIs2fa);r.skipped=(r.skipped||0)+n0-r.items.length}/* V0.32.0: only 2FA codes come in from other apps */
 return auDedupe(r)}
/* ---- encrypted backup: passphrase -> PBKDF2-SHA256 -> AES-256-GCM. Works on any phone, independent of the Vault key and this phone's key ---- */
const AU_BK_ITER=310000,AU_BK_APP='conduint-auth-backup';
async function auBkKey(pass,salt,iter){
 const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function auBkMake(list,pass,groups){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),k=await auBkKey(pass,salt,AU_BK_ITER);
 const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify({v:1,list,groups:(groups||[]).filter(s=>typeof s==='string')}))));
 return JSON.stringify({app:AU_BK_APP,v:1,kdf:'PBKDF2-SHA256',iter:AU_BK_ITER,salt:au64(salt),iv:au64(iv),ct:au64(ct),n:list.length,at:new Date().toISOString()})}
async function auBkRead(text,pass){
 let o;try{o=JSON.parse(text)}catch{throw Error('That backup file is damaged.')}
 if(!o||o.app!==AU_BK_APP)throw Error('That is not a Conduint authenticator backup.');
 if(o.v!==1||o.kdf!=='PBKDF2-SHA256'||!(o.iter>=100000&&o.iter<=2000000))throw Error('That backup version is not supported.');
 let p;try{p=await crypto.subtle.decrypt({name:'AES-GCM',iv:au64d(o.iv)},await auBkKey(pass,au64d(o.salt),o.iter),au64d(o.ct))}catch{throw Error('Wrong passphrase, or the file is damaged.')}
 let d;try{d=JSON.parse(new TextDecoder().decode(p))}catch{throw Error('That backup file is damaged.')}
 if(!d||!Array.isArray(d.list))throw Error('That backup file is damaged.');
 d.list.groups=Array.isArray(d.groups)?d.groups.filter(s=>typeof s==='string'&&s.trim()):[];return d.list}
async function auAskPass(title,msg,ok){
 const I=$('#di');I.type='password';
 try{const r=await dlg({title,msg,value:'',ok:ok||'OK'});return r?r.v:null}
 finally{I.type='text'}}
async function auExport(){
 try{
  auGuard();
  if(!AU.list.length&&!AU.eg.length)throw Error('Nothing to back up yet.');
  const a=await auAskPass('Backup passphrase','Choose a passphrase for this backup, 8 characters or more. You need it to restore. It cannot be recovered if you forget it.','Next');if(a==null)return;
  if(a.length<8)throw Error('Use at least 8 characters.');
  const b=await auAskPass('Confirm passphrase','Type the same passphrase again.','Create backup');if(b==null)return;
  if(a!==b)throw Error('Those did not match. No backup was made.');
  busy('Encrypting backup…');let text;try{text=await auBkMake(AU.list,a,AU.eg)}finally{unbusy()}
  if(await auSaveOut('conduint-authenticator-backup-'+auStamp()+'.json',text,'Backup'))try{localStorage.setItem('cnd.auth.bk',String(Date.now()))}catch{}}
 catch(e){toast(e.message||'Could not make the backup.')}}
const auStamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())};
/* writes a text file: the folder picker when the native bridge is there, a download otherwise. Returns false when the person cancels. */
async function auSaveOut(name,text,what,mime){
 if(typeof SAF!=='undefined'&&SAF&&SAF.pickTree&&SAF.writeFile){
  let t;try{t=await SAF.pickTree({volume:'',start:''})}catch(e){if(e&&e.code==='CANCELLED')return false;throw e}
  await SAF.writeFile({dir:t.root||t.uri,name,b64:au64(new TextEncoder().encode(text)),mime:mime||'application/json'});
  toast(what+' saved to '+t.name+' / '+name);return true}
 const x=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type:mime||'application/json'}));
 x.href=u;x.download=name;x.click();setTimeout(()=>URL.revokeObjectURL(u),5000);toast('Downloaded '+name);return true}
/* ---- CSV export (V0.28.6). Same columns as a Bitwarden CSV, so Conduint and most managers read it back. It is NEVER written in the clear:
   the CSV text is sealed with AES-256-GCM first. Two ways to lock it:
   password  = PBKDF2-SHA256 (310k rounds) from a passphrase you choose. Opens on any phone with Conduint and that passphrase.
   this phone = the same non-extractable key that protects your accounts here. No passphrase to type, but only this phone's Conduint can open it. ---- */
const AU_CSV_APP='conduint-auth-csv',AU_CSV_HEAD=['folder','favorite','type','name','notes','fields','reprompt','login_uri','login_username','login_password','login_totp'];
const auCsvCell=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
function auTotpUri(a){
 const s=String(a.secret||'').trim();if(/^otpauth:/i.test(s))return s;
 const iss=String(a.issuer||'').replace(/:/g,' ').trim(),nm=String(a.name||'').trim(),q=new URLSearchParams();
 q.set('secret',s.replace(/\s/g,''));if(iss)q.set('issuer',iss);q.set('algorithm',(a.algo||'SHA1').toUpperCase());q.set('digits',String(a.digits||6));q.set('period',String(a.period||30));
 return'otpauth://totp/'+(iss?encodeURIComponent(iss)+':':'')+encodeURIComponent(nm)+'?'+q.toString()}
function auNoteText(a){
 const it=auxItems(a),T=a.type;
 if(T==='bak')return'Backup codes:\n'+it.map(i=>i.v).join('\n');
 if(T==='ssh')return it.map(i=>[i.t?'Label: '+i.t:'',i.pub||'',i.prv||''].filter(Boolean).join('\n')).join('\n\n');
 if(T==='rec'||T==='api'||T==='card')return it.map(i=>(i.t?i.t+': ':'')+(i.v||'')+(i.n?'\n'+i.n:'')).join('\n');
 return it.map(i=>(i.t?i.t+'\n':'')+(i.v||'')).join('\n\n')}
function auCsvBuild(list){
 const rows=[AU_CSV_HEAD.map(auCsvCell).join(',')];
 for(const a of list){
  const T=a.type||'totp',title=a.issuer||a.name||AU_TYPES[T].label,user=a.name||a.email||'',extra=[];
  if(a.fullname)extra.push('Full name: '+a.fullname);if(a.email&&a.email!==user)extra.push('Email: '+a.email);
  const base={folder:auxGroupOf(a),name:title,fields:extra.join('\n'),uri:auDomain(a.link)?a.link:'',user};
  const put=o=>rows.push([o.folder,'',o.type,o.name,o.notes||'',o.fields||'','',o.uri||'',o.user||'',o.pw||'',o.totp||''].map(auCsvCell).join(','));
  if(T==='totp')put(Object.assign({},base,{type:'login',totp:auTotpUri(a)}));
  else if(T==='pass')put(Object.assign({},base,{type:'login',pw:a.secret||'',notes:a.note||''}));
  else put(Object.assign({},base,{type:'note',uri:'',user:'',notes:auNoteText(a)}))}
 return rows.join('\r\n')+'\r\n'}
async function auCsvSeal(csv,mode,n,pass){
 const iv=crypto.getRandomValues(new Uint8Array(12)),o={app:AU_CSV_APP,v:1,mode,n,at:new Date().toISOString()};let k;
 if(mode==='pass'){const salt=crypto.getRandomValues(new Uint8Array(16));k=await auBkKey(pass,salt,AU_BK_ITER);Object.assign(o,{kdf:'PBKDF2-SHA256',iter:AU_BK_ITER,salt:au64(salt)})}
 else k=await auKey();
 o.iv=au64(iv);o.ct=au64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(csv))));
 return JSON.stringify(o)}
async function auCsvOpen(text,pass){
 let o;try{o=JSON.parse(text)}catch{throw Error('That file is damaged.')}
 if(!o||o.app!==AU_CSV_APP||o.v!==1||!o.iv||!o.ct)throw Error('That is not a Conduint encrypted CSV.');
 let k;
 if(o.mode==='pass'){if(o.kdf!=='PBKDF2-SHA256'||!(o.iter>=100000&&o.iter<=2000000))throw Error('That file version is not supported.');k=await auBkKey(pass,au64d(o.salt),o.iter)}
 else if(o.mode==='phone')k=await auKey();
 else throw Error('That file version is not supported.');
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:au64d(o.iv)},k,au64d(o.ct)))}
 catch{throw Error(o.mode==='pass'?'Wrong passphrase, or the file is damaged.':'This file was locked to another phone, or this phone’s key was reset. It cannot be opened here.')}}
async function auExportCsv(mode){
 try{
  auGuard();
  if(!AU.list.length)throw Error('Nothing to export yet.');
  let pass='';
  if(mode==='pass'){
   const a=await auAskPass('CSV passphrase','Choose a passphrase, 8 characters or more. The CSV is sealed with AES-256 and you need this passphrase to open it. It cannot be recovered if you forget it.','Next');if(a==null)return;
   if(a.length<8)throw Error('Use at least 8 characters.');
   const b=await auAskPass('Confirm passphrase','Type the same passphrase again.','Export CSV');if(b==null)return;
   if(a!==b)throw Error('Those did not match. Nothing was exported.');pass=a}
  else{
   const r=await dlg({title:'Export without a passphrase?',msg:'The CSV is still sealed with AES-256, using the key that protects your accounts on this phone. Only Conduint on this phone can open it. If you clear the app’s data or uninstall it, the file can never be opened. For a file you can move to another phone, use the passphrase export.',ok:'Export'});if(!r)return}
  busy('Encrypting CSV…');let text;try{text=await auCsvSeal(auCsvBuild(AU.list),mode,AU.list.length,pass)}finally{unbusy()}
  await auSaveOut('conduint-authenticator-csv-'+(mode==='pass'?'password':'phone')+'-'+auStamp()+'.json',text,'Encrypted CSV')}
 catch(e){toast(e.message||'Could not export the CSV.')}}
function auImport(){
 try{auGuard()}catch(e){toast(e.message);return}
 const inp=document.createElement('input');inp.type='file';inp.accept='.csv,.tsv,.json,.txt,.md,.pem,.pub,.key,text/csv,text/plain,application/json';inp.style.display='none';
 document.body.append(inp);
 inp.addEventListener('cancel',()=>inp.remove());
 inp.onchange=async()=>{const f=inp.files&&inp.files[0];inp.remove();if(!f)return;
  try{
   if(f.size>5242880)throw Error('That file is too big (5 MB max).');
   const text=await f.text();let r,enc=false;
   if(/"app"\s*:\s*"conduint-auth-backup"/.test(text.slice(0,300))){
    enc=true;let list=null;
    for(;;){const pw=await auAskPass('Backup passphrase','Enter the passphrase for this backup.','Restore');if(pw==null)return;
     try{list=await auBkRead(text,pw);break}catch(e){if(/Wrong passphrase/.test(e.message)){toast(e.message);continue}throw e}}
    r=await auDedupe({items:list,skipped:0});r.groups=list.groups||[]}
   else if(/"app"\s*:\s*"conduint-auth-csv"/.test(text.slice(0,300))){
    enc=true;let csv=null,mode='';try{mode=JSON.parse(text).mode}catch{}
    if(mode==='pass'){for(;;){const pw=await auAskPass('CSV passphrase','Enter the passphrase for this encrypted CSV.','Open');if(pw==null)return;
      try{csv=await auCsvOpen(text,pw);break}catch(e){if(/Wrong passphrase/.test(e.message)){toast(e.message);continue}throw e}}}
    else csv=await auCsvOpen(text,'');
    r=await auParseImport(csv,'Imported',true)}
   else r=await auParseImport(text,(f.name||'').replace(/\.[^.]+$/,''));
   if(!r.items.length&&!(r.groups&&r.groups.length))throw Error('Nothing new to '+(enc?'restore':'import')+'.'+(r.dup?' '+r.dup+' already here.':'')+(r.bad?' '+r.bad+' skipped.':''));
   const n=t=>r.items.filter(e=>(e.type||'totp')===t).length,c=t=>r.items.filter(e=>e.type===t).reduce((x,e)=>x+auxItems(e).length,0),gs=new Set(r.items.map(auxGroupOf).filter(Boolean)).size;
   const ok=await dlg({title:(enc?'Restore ':'Import ')+r.items.length+' entries?',msg:n('pass')+' passwords, '+n('totp')+' 2FA codes, '+n('note')+' notes, '+c('bak')+' backup codes, '+c('rec')+' recovery keys, '+c('card')+' card/PIN details, '+c('ssh')+' SSH keys'+(gs?', '+gs+' groups':'')+'. '+r.dup+' duplicates and '+r.bad+' empty rows skipped.'+(enc?'':' Delete the file afterwards: it holds your secrets in plain text.'),ok:enc?'Restore':'Import'});
   if(!ok)return;
   auGuard();
   const before=AU.list.length,eg0=AU.eg.slice();AU.list.push(...r.items);
   (r.groups||[]).forEach(g=>{const c=auCanonAll(g);if(c&&!auxGroups(AU.list,AU.eg).some(x=>x[0]===c))AU.eg.push(c)});
   try{await auSave()}catch(e){AU.list.length=before;AU.eg=eg0;throw e}
   auEgSave();drawAu();toast((enc?'Restored ':'Imported ')+r.items.length+'.')}
  catch(e){toast(e.message||'Could not import.')}};
 inp.click()}

/* ---- groups ---- */
async function auAssign(entries,g,go){
 try{auGuard();const prev=entries.map(a=>a.group);entries.forEach(a=>auxSetGroup(a,g));
  try{await auSave()}catch(e){entries.forEach((a,i)=>auxSetGroup(a,prev[i]));throw e}
  auEgSave();AU.sel=null;if(go)AU.grp=g||'';drawAu();toast(g?entries.length+(entries.length===1?' account':' accounts')+' in '+g:'Removed from group')}
 catch(e){toast(e.message||'Could not save.')}}
async function auNewGroup(entries){
 const r=await dlg({title:'New group',msg:entries?'':'Name it, then pick the accounts that belong in it. The group stays even if you pick none.',value:'',ok:entries?'Create':'Next'});
 if(!r||!r.v)return;const g=auCanonAll(r.v);if(!g)return;
 if(entries)auAssign(entries,g,true);
 else{if(!auxGroups(AU.list,AU.eg).some(x=>x[0]===g)){AU.eg.push(g);auEgSave()}AU.grp=g;auGroupAdd(g)}}
function auGroupPick(entries){
 const m=auxGroups(AU.list,AU.eg).map(([g])=>[g,()=>auAssign(entries,g,false)]);
 m.push(['New group…',()=>auNewGroup(entries)]);
 if(entries.some(a=>auxGroupOf(a)))m.push(['hr'],['Remove from group',()=>auAssign(entries,'',false)]);
 menu(Math.max(10,innerWidth/2-110),Math.max(10,innerHeight/4),m)}
function auGroupAdd(name){
 TV.view='aug';clearInterval(AU.tm);const B=$('#tbody');B.replaceChildren();B.classList.add('auscreen');head('Add to '+name,true);
 const pick=new Set(),idx=auxOrder(AU.list,AU.list.map((_,i)=>i),'az'),list=h('div','aulist'),btn=h('button','aufab static',null,ico('check'),h('span',null,'Pick accounts'));
 const upd=()=>{btn.lastChild.textContent=pick.size?'Add '+pick.size+' to '+name:'Pick accounts';btn.disabled=!pick.size;btn.style.opacity=pick.size?'1':'.5'};
 B.append(h('div','ausec','Tap every account that belongs in “'+name+'”'));
 idx.forEach(i=>{const a=AU.list[i],g=auxGroupOf(a),
  row=h('button','augpick',null,auLogo(a),h('div','augpn',null,h('b',null,auxName(a)||'(no title)'),h('small',null,[AU_TYPES[a.type||'totp'].label,a.name,g&&g!==name?'now in '+g:''].filter(Boolean).join(' · '))),h('span','augck',g===name?'✓':''));
  if(g===name){row.classList.add('on');row.disabled=true}
  else row.onclick=()=>{pick.has(a)?pick.delete(a):pick.add(a);row.classList.toggle('on',pick.has(a));row.lastChild.textContent=pick.has(a)?'✓':'';upd()};
  list.append(row)});
 btn.onclick=()=>{if(pick.size)auAssign([...pick],name,true)};
 B.append(list,btn);upd()}
function auGroupMenu(name,anchor){const r=anchor.getBoundingClientRect();
 menu(Math.max(10,r.left),r.bottom,[
  ['Add accounts…',()=>auGroupAdd(name)],
  ['Rename group…',async()=>{const v=await dlg({title:'Rename group',value:name,ok:'Rename'});if(!v||!v.v||v.v===name)return;
   const mem=AU.list.filter(a=>auxGroupOf(a)===name),g=auxCanon(AU.list.filter(a=>auxGroupOf(a)!==name).concat(AU.eg.filter(x=>x!==name).map(x=>({group:x}))),v.v),prev=mem.map(a=>a.group);
   if(!g)return;
   mem.forEach(a=>a.group=g);
   try{auGuard();await auSave()}catch(e){mem.forEach((a,i)=>a.group=prev[i]);toast(e.message||'Could not save.');return}
   AU.eg=AU.eg.map(x=>x===name?g:x);auEgSave();AU.grp=g;drawAu()}],
  ['Delete group',async()=>{const mem=AU.list.filter(a=>auxGroupOf(a)===name);
   const v=await dlg({title:'Delete group '+name+'?',msg:'The '+mem.length+' accounts stay. Only the group goes.',ok:'Delete group',danger:true});if(!v)return;
   AU.grp='';AU.eg=AU.eg.filter(x=>x!==name);auEgSave();if(mem.length)auAssign(mem,'',false);else drawAu()}]])}
async function auAutoGroup(){
 try{auGuard();const m=new Map();
  AU.list.forEach(a=>{const k=auxName(a).toLowerCase();if(!k||auxGroupOf(a))return;if(!m.has(k))m.set(k,[]);m.get(k).push(a)});
  const sets=[...m.values()].filter(v=>v.length>1);if(!sets.length)throw Error('No ungrouped accounts share a platform name.');
  const r=await dlg({title:'Group by platform?',msg:sets.length+' groups would be made from '+sets.reduce((x,v)=>x+v.length,0)+' accounts that share a name, for example '+auxName(sets[0][0])+'.',ok:'Group'});if(!r)return;
  const prev=new Map();sets.forEach(v=>{const g=auxCanon(AU.list,auxName(v[0]));v.forEach(a=>{prev.set(a,a.group);a.group=g})});
  try{await auSave()}catch(e){prev.forEach((g,a)=>auxSetGroup(a,g));throw e}
  drawAu();toast(sets.length+' groups made')}
 catch(e){toast(e.message||'Could not group.')}}
/* ---- pinned codes on Home (V0.22.3): up to 3 2FA accounts show a live code on the Home screen. A pin is a `pin:1` flag on the account. ---- */
const AUH={tm:0,busy:0,rev:new Map(),sig:''},AU_PINMAX=3,AUP='cnd.auth.pinn';
const auPinned=()=>AU.list.filter(a=>(a.type||'totp')==='totp'&&a.pin);
async function auPin(a){
 try{auGuard();
  if(!a.pin&&auPinned().length>=AU_PINMAX)throw Error('Home shows '+AU_PINMAX+' codes. Unpin one first.');
  const was=a.pin;if(was)delete a.pin;else a.pin=1;
  try{await auSave()}catch(e){if(was)a.pin=was;else delete a.pin;throw e}
  drawAu();toast(a.pin?'Pinned to Home':'Unpinned');AUH.sig='';auhTick()}
 catch(e){toast(e.message||'Could not save.')}}
function auhCard(){const c=h('div','dc dau');c.id='dau';c.style.display='none';return c}
function auhStart(){if(!AUH.tm)AUH.tm=setInterval(auhTick,1000);auhTick()}
const auhOpen=async()=>{await openTools();tAuth()};
async function auhTick(){
 const c=$('#dau');
 if(!c||!isHome()){clearInterval(AUH.tm);AUH.tm=0;return}
 if(document.hidden||AUH.busy)return;AUH.busy=1;
 try{
  if(auLockOn()&&!VK){
   const n=+(localStorage.getItem(AUP)||0);
   if(!n){c.style.display='none';AUH.sig='';return}
   if(AUH.sig!=='locked'){AUH.sig='locked';c._rows=null;const t=h('div','dauh',null,h('b',null,'2FA codes'),h('small',null,'Locked. Tap to unlock.'));t.onclick=auhOpen;c.replaceChildren(t)}
   c.style.display='';return}
  if(!AU.ready||AU.locked){await auLoad();AU.ready=true}
  const P=auPinned().slice(0,AU_PINMAX);
  if(!P.length){c.style.display='none';AUH.sig='';c._rows=null;return}
  const sig=P.map(a=>[a.issuer,a.name,a.link,(a.secret||'').length].join('|')).join('~');
  if(sig!==AUH.sig){AUH.sig=sig;
   const t=h('div','dauh',null,h('b',null,'2FA codes'),h('small',null,'Tap a code to copy')),eye=h('small','dauo','Open');t.onclick=auhOpen;t.append(eye);
   c.replaceChildren(t);c._rows=P.map(a=>{
    const code=h('span','dauc','······'),left=h('span','daul',''),bar=h('i'),
     r=h('button','daur',null,auLogo(a),h('div','daun',null,h('b',null,a.issuer||a.name||'Account'),h('small',null,a.issuer&&a.name?a.name:'')),code,left);
    r.append(h('div','daub',null,bar));
    const row={a,r,code,left,bar,c:''};
    r.onclick=()=>{if(!row.c)return;if(auHide())AUH.rev.set(a,Date.now()+10000);auCopy(row.c,'Code copied');auhTick()};
    c.append(r);return row})}
  c.style.display='';
  const now=Date.now();
  for(const row of c._rows||[]){const a=row.a,per=a.period||30,left=per-Math.floor(now/1000)%per,frac=1-(now%(per*1000))/(per*1000);
   try{row.c=await auCode(a,now)}catch{row.c=''}
   const show=!auHide()||(AUH.rev.get(a)||0)>now;
   row.code.textContent=row.c?(show?auFmt(row.c):'••• •••'):'------';
   row.left.textContent=left+'s';row.r.classList.toggle('low',left<=5);row.bar.style.width=(frac*100)+'%'}}
 catch(e){}
 finally{AUH.busy=0}}
/* ---- extract from pasted text (V0.22.1): same extractor as the CSV / file import ---- */
function auPaste(){
 try{auGuard()}catch(e){toast(e.message);return}
 AU.px=AU.px||{title:'',txt:''};
 TV.view='aup';clearInterval(AU.tm);const B=$('#tbody');B.replaceChildren();B.classList.add('auscreen');head('Extract from text',true);
 const fld=(lab,get,set,ph,ta,hint)=>{const w=h('div','aufld');w.append(h('label',null,lab));const r=h('div','aufr');
  let inp;if(ta){inp=document.createElement('textarea');inp.className='autarea';inp.rows=ta}else inp=h('input');
  inp.value=get();inp.placeholder=ph||'';inp.autocomplete='off';inp.spellcheck=false;inp.autocapitalize='none';inp.oninput=()=>set(inp.value);
  r.append(inp);w.append(r);if(hint)w.append(h('small',null,hint));B.append(w)};
 fld('Title',()=>AU.px.title,v=>{AU.px.title=v},'e.g. GitHub, Old laptop');
 fld('Text',()=>AU.px.txt,v=>{AU.px.txt=v},'Paste notes, codes or keys here',12,'Backup codes, recovery keys and SSH keys become their own items. Anything else stays as a note.');
 const go=h('button','aufab static',null,ico('check'),h('span',null,'Extract'));go.onclick=auPasteGo;B.append(go)}
async function auPasteGo(){
 const x=AU.px||{title:'',txt:''};
 try{auGuard();if(!x.txt.trim())throw Error('Paste some text first.');
  const r=await auDedupe(auxBlob(x.txt,x.title.trim()||'Pasted text'));
  if(!r.items.length)throw Error('Nothing found to add.'+(r.dup?' '+r.dup+' already here.':''));
  const n=t=>r.items.filter(e=>(e.type||'totp')===t).length,c=t=>r.items.filter(e=>e.type===t).reduce((s,e)=>s+auxItems(e).length,0);
  const ok=await dlg({title:'Add '+r.items.length+(r.items.length===1?' entry?':' entries?'),msg:n('note')+' notes, '+c('bak')+' backup codes, '+c('rec')+' recovery keys, '+c('ssh')+' SSH keys. '+r.dup+' duplicates skipped.',ok:'Add'});
  if(!ok)return;
  auGuard();const before=AU.list.length;AU.list.push(...r.items);
  try{await auSave()}catch(e){AU.list.length=before;throw e}
  AU.px=null;TV.view='au';drawAu();toast('Added '+r.items.length+'.')}
 catch(e){toast(e.message||'Could not extract.')}}
/* ---- secret items: every code, key, SSH pair and note on its own ---- */
const AU_ILAB={bak:'Backup code',rec:'Recovery key',ssh:'SSH key',api:'API key',note:'Note',pass2:'Passphrase',card:'Card detail'};
function auOpenDetail(a){AU.det=a;AU.rev=new Set();AU.dq='';drawAuDetail()}
async function auItemsSave(a,mut){
 const snap=JSON.stringify(a);
 try{auGuard();auxMat(a);mut(a.items);auxSync(a);await auSave()}
 catch(e){Object.keys(a).forEach(k=>delete a[k]);Object.assign(a,JSON.parse(snap));throw e}}
function drawAuDetail(){
 const a=AU.det;if(!a||!AU.list.includes(a)){drawAu();return}
 TV.view='aud';clearInterval(AU.tm);AU.sort=auSortGet();const B=$('#tbody'),T=a.type,az=AU.sort==='az',items=auxMat(a);
 B.replaceChildren();B.classList.add('auscreen');head(auxName(a)||AU_TYPES[T].label,true);
 const sh=auCardShell(a);sh.more.style.visibility='hidden';B.append(sh.el);
 const bar=h('div','autabs'),chip=(l,f,on)=>{const b=h('button','autab'+(on?' on':''),l);b.onclick=f;bar.append(b)};
 chip('＋ Add',()=>auItemForm(a,null,false),true);
 if(['bak','rec','api','card'].includes(T))chip('Add many',()=>auItemForm(a,null,true));
 chip(az?'A–Z':'Added order',()=>{try{localStorage.setItem('cnd.auth.sort',az?'added':'az')}catch{}drawAuDetail()});
 if(T==='bak'){
  chip('Copy unused',()=>{const u=a.items.filter(i=>!i.u).map(i=>i.v);u.length?auCopy(u.join('\n'),u.length+' codes copied'):toast('No unused codes.')});
  chip('Reset used',async()=>{if(!a.items.some(i=>i.u))return;try{await auItemsSave(a,it=>it.forEach(i=>i.u=0));drawAuDetail()}catch(e){toast(e.message||'Could not save.')}})}
 if(T==='rec'||T==='api'||T==='card')chip('Copy all',()=>auCopy(a.items.map(i=>(i.t?i.t+': ':'')+i.v).join('\n'),'Copied'));
 chip('Edit',()=>auOpenForm(AU.list.indexOf(a)));
 B.append(bar);
 let find=null;if(items.length>8){find=h('input','ausearch');find.placeholder='Search items';find.value=AU.dq||'';find.autocomplete='off';B.append(find)}
 const list=h('div','aulist');B.append(list);
 const build=()=>{list.replaceChildren();const q=(AU.dq||'').toLowerCase(),cur=a.items,
  ord=auxItemOrder(cur,AU.sort).filter(k=>!q||auxItemKey(cur[k]).toLowerCase().includes(q));
  ord.forEach(k=>list.append(auItemRow(a,k,build)));
  if(!ord.length)list.append(h('div','aunote',cur.length?'Nothing matches.':'No items yet. Tap ＋ Add.'))};
 if(find)find.oninput=()=>{AU.dq=find.value;build()};
 build()}
function auItemRow(a,k,redraw){
 const it=a.items[k],T=a.type,open=AU.rev.has(it),show=!auHide()||open,el=h('div','auitem'+(it.u?' used':'')),hd=h('div','auih');
 const ttl=it.t||(T==='bak'?'':T==='ssh'?'SSH key':'Untitled'),guard=f=>async e=>{e.stopPropagation();try{await f()}catch(err){toast(err.message||'Could not save.')}};
 hd.append(h('b',null,ttl||it.v||''));
 const save=(mut,msg)=>async()=>{await auItemsSave(a,mut);if(msg)toast(msg);redraw()};
 let body;
 if(T==='ssh'){const p=it.pub||'';
  body=h('div',null,null,h('div','auiv',open?(p||'(no public key)'):(p?p.slice(0,46)+(p.length>46?'…':''):'(no public key)')),h('small',null,it.prv?'Private key saved':'No private key'));
  if(open&&it.prv)body.append(h('pre','auipre',it.prv));
  if(it.pub){const b=h('button','autab','Pub');b.onclick=guard(()=>auCopy(it.pub,'Public key copied'));hd.append(b)}
  if(it.prv){const b=h('button','autab','Priv');b.onclick=guard(()=>auCopy(it.prv,'Private key copied'));hd.append(b)}}
 else if(T==='note'||T==='pass2'){const v=it.v||'',ls=v.split('\n');
  body=h('div','auiv auinote',!show?'• • • • • •':open?v:ls.slice(0,2).join('\n').slice(0,140)+(v.length>140||ls.length>2?'…':''));
  const b=h('button','auicon auis',null,ico('copy'));b.onclick=guard(()=>auCopy(v,'Note copied'));hd.append(b)}
 else{body=h('div','auiv',show?(it.v||''):'••••••••');
  if(T==='api'&&it.n&&show)body.append(h('small',null,it.n));
  const b=h('button','auicon auis',null,ico('copy'));b.onclick=guard(()=>auCopy(it.v,AU_COPY[T]));hd.append(b)}
 if(T==='bak'){const b=h('button','auicon auis'+(it.u?' on':''),null,ico('check'));b.title='Mark used';b.onclick=guard(save(x=>{x[k].u=x[k].u?0:1}));hd.append(b)}
 if(auHide()&&T!=='note'&&T!=='pass2'&&T!=='ssh'){const b=h('button','auicon auis',null,ico(open?'eyeoff':'eye'));b.onclick=e=>{e.stopPropagation();open?AU.rev.delete(it):AU.rev.add(it);redraw()};hd.append(b)}
 const mb=h('button','auicon auis',null,ico('more'));
 mb.onclick=e=>{e.stopPropagation();const r=mb.getBoundingClientRect();
  menu(Math.max(10,r.right-170),r.bottom,[['Edit',()=>auItemForm(a,k,false)],
   ['Delete',async()=>{const v=await dlg({title:'Delete this item?',msg:(ttl||it.v||'').slice(0,60),ok:'Delete',danger:true});if(!v)return;
    try{await auItemsSave(a,x=>{x.splice(k,1)});toast('Deleted');redraw()}catch(err){toast(err.message||'Could not save.')}}]])};
 hd.append(mb);
 el.append(hd,body);
 el.onclick=()=>{if(T==='note'||T==='pass2'||T==='ssh'){open?AU.rev.delete(it):AU.rev.add(it);redraw()}else if(it.v){auCopy(it.v,AU_COPY[T])}};
 return el}
function auItemForm(a,k,many){
 AU.ie={a,k,many:!!many,txt:'',f:Object.assign({t:'',v:'',pub:'',prv:'',n:'',u:0},k==null?{}:auxMat(a)[k])};drawAuItemForm()}
function drawAuItemForm(){
 const{a,k,many,f}=AU.ie,T=a.type,B=$('#tbody');
 TV.view='auai';clearInterval(AU.tm);B.replaceChildren();B.classList.add('auscreen');head(many?'Add many':k==null?'New '+AU_ILAB[T].toLowerCase():'Edit item',true);
 const fld=(lab,get,set,ph,ta,hint)=>{const w=h('div','aufld');w.append(h('label',null,lab));const r=h('div','aufr');
  let inp;if(ta){inp=document.createElement('textarea');inp.className='autarea';inp.rows=ta}else inp=h('input');
  inp.value=get();inp.placeholder=ph||'';inp.autocomplete='off';inp.spellcheck=false;inp.autocapitalize='none';inp.oninput=()=>set(inp.value);
  r.append(inp);w.append(r);if(hint)w.append(h('small',null,hint));B.append(w)};
 if(many)fld('Items',()=>AU.ie.txt,v=>{AU.ie.txt=v},'',10,T==='bak'?'One code per line. Commas also separate them.':'One per line. Write  Label: value  to name each one.');
 else{
  fld(T==='bak'?'Label (optional)':'Label',()=>f.t,v=>{f.t=v},T==='ssh'?'e.g. Laptop, Work server':'e.g. Main, Old phone');
  if(T==='ssh'){fld('Public key',()=>f.pub,v=>{f.pub=v},'ssh-ed25519 AAAA…',4);fld('Private key',()=>f.prv,v=>{f.prv=v},'-----BEGIN …',6,'Stored encrypted on this phone.')}
  else{fld(AU_ILAB[T],()=>f.v,v=>{f.v=v},'',T==='bak'?2:T==='note'||T==='pass2'?8:3);if(T==='api')fld('Notes',()=>f.n,v=>{f.n=v},'Scope, expiry…',3)}}
 const save=h('button','aufab static',null,ico('check'),h('span',null,'Save'));
 save.onclick=async()=>{try{
  let add=[];
  if(many){const have=new Set(auxMat(a).map(i=>i.v));
   let parts=AU.ie.txt.split(/[\r\n;,]+/).map(x=>x.trim().replace(/^(?:[-*•]|\d{1,3}[.)])\s+/,'')).filter(Boolean);
   if(T==='bak'&&parts.length===1&&/\s/.test(parts[0])&&parts[0].split(/\s+/).every(auxIsCode))parts=parts[0].split(/\s+/);
   parts.forEach(p=>{let t='',v=p;if(T!=='bak'){const m=/^([^:]{1,40}):\s*(\S.*)$/.exec(p);if(m){t=m[1].trim();v=m[2].trim()}}
    if(!have.has(v)){have.add(v);add.push(T==='bak'?{t:'',v,u:0}:{t,v})}});
   if(!add.length)throw Error('Nothing new to add.')}
  else{const x={t:f.t.trim()};
   if(T==='ssh'){x.pub=f.pub.trim();x.prv=f.prv.trim();if(!x.pub&&!x.prv)throw Error('Add a public or private key.')}
   else{x.v=f.v.trim();if(!x.v)throw Error('Add a value.');if(T==='api')x.n=f.n.trim();if(T==='bak')x.u=f.u?1:0}
   add=[x]}
  await auItemsSave(a,items=>{if(!many&&k!=null)Object.assign(items[k],add[0]);else items.push(...add)});
  toast(many?add.length+' added':'Saved');drawAuDetail()}catch(e){toast(e.message||'Could not save.')}};
 B.append(save)}

/* ---- V0.32.0: setup key (show / copy / export / import) and platform link check ---- */
const auKeyText=a=>{const t=String(a.secret||'').trim();if(/^otpauth:/i.test(t)){try{return auParseUri(t).secret}catch{return t}}return t.replace(/\s/g,'')};
function auCopyKey(a){const k=auKeyText(a);if(!k){toast('This account has no setup key.');return}auCopy(k,'Setup key copied')}
function auCopyLink(a){const k=auKeyText(a);if(!k){toast('This account has no setup key.');return}auCopy(auTotpUri(Object.assign({},a,{secret:k})),'Setup link copied')}
async function auShowKey(a){const k=auKeyText(a);if(!k){toast('This account has no setup key.');return}
 const r=await dlg({title:(a.issuer||a.name||'Account')+' setup key',msg:'Keep this private: anyone with it can make your codes. Tap Copy key to copy it, or type it into another authenticator to set up the same account.',value:k.replace(/(.{4})(?=.)/g,'$1 '),ok:'Copy key'});
 if(r)auCopy(k,'Setup key copied')}
function auPlatName(d){const r=typeof pfRoot==='function'?pfRoot(d):d,p=AU_PICKS.find(x=>x[1]===r||x[1]===d);if(p)return p[0];const w=(r.split('.')[0]||'');return w?w[0].toUpperCase()+w.slice(1):''}
async function auCheckLink(F,redraw){
 const raw=(F.link||'').trim();if(!raw){toast('Type or paste a platform link first.');return}
 const d=auDomain(raw);if(!d){toast('That does not look like a website address. Try github.com');return}
 F.link=d;if(!(F.issuer||'').trim())F.issuer=auPlatName(d);
 toast('Checking '+d+'…');
 const st=await new Promise(res=>{const im=new Image(),t=setTimeout(()=>res(0),6000);im.referrerPolicy='no-referrer';
  im.onload=()=>{clearTimeout(t);res(im.naturalWidth>16?1:2)};im.onerror=()=>{clearTimeout(t);res(0)};
  im.src='https://www.google.com/s2/favicons?sz=128&domain='+encodeURIComponent(d)});
 toast(st===1?'Icon set from '+d+'.':st===2?d+' has no logo of its own. A letter tile will be used.':'Link looks right. The icon loads when you are online.');
 redraw()}
async function auExportKeys(kind){
 try{auGuard();const L=AU.list.filter(auIs2fa).filter(a=>auKeyText(a));if(!L.length)throw Error('No 2FA accounts to export.');
  const ok=await dlg({title:'Export setup keys?',msg:'This file is NOT encrypted. It holds the setup key of every account, so anyone who gets it can make your codes. Keep it private and delete it when you are done. For a locked copy use Back up (encrypted).',ok:'Export',danger:true});if(!ok)return;
  const E=a=>Object.assign({},a,{secret:auKeyText(a)});let text,name;
  if(kind==='txt'){text=L.map(a=>auTotpUri(E(a))).join('\n')+'\n';name='conduint-keys-'+auStamp()+'.txt'}
  else{text=JSON.stringify({app:'conduint-auth-keys',v:1,exported:new Date().toISOString(),entries:L.map(a=>({platform:a.issuer||'',name:a.name||'',fullname:a.fullname||'',email:a.email||'',link:a.link||'',group:auxGroupOf(a)||'',key:auKeyText(a),digits:a.digits||6,period:a.period||30,algo:(a.algo||'SHA1').toUpperCase(),otpauth:auTotpUri(E(a))}))},null,2);name='conduint-keys-'+auStamp()+'.json'}
  await auSaveOut(name,text,'Keys',kind==='txt'?'text/plain':'application/json')}
 catch(e){toast(e.message||'Could not export.')}}
function auFromKeys(o){const out=[];let skipped=0;
 for(const e of o.entries){if(!e||typeof e!=='object'){skipped++;continue}
  const t=auMkTotp(e.platform||e.issuer||'',e.name||'',String(e.key||e.secret||e.otpauth||''));if(!t){skipped++;continue}
  if(e.digits)t.digits=+e.digits||t.digits;if(e.period)t.period=+e.period||t.period;if(e.algo)t.algo=String(e.algo).toUpperCase();
  t.link=String(e.link||'');t.fullname=String(e.fullname||'');t.email=String(e.email||'');if(e.group)auxSetGroup(t,String(e.group));
  out.push(t)}
 return{items:out,skipped}}
