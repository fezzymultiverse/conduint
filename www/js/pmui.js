/* pmui.js: Conduint Passwords screens (V0.33.0). The password manager is its own app inside Conduint: own vault (pm.js, IndexedDB 'conduint-pm'),
   own master password, own fingerprint key (Lock plugin which:'pm'), own autofill sharing. It reads nothing from the Authenticator;
   the only bridge is the one-time, person-started "Import from Authenticator" (copies, never links).
   Parts: [1] state, lock, navigation, helpers  [2] vault list, item view, item editor  [3] reports, settings, folders, import / export, autofill. The generator screen is not in this build.
   Rule: nothing here may leave a secret in the DOM after lock; pmLock() wipes the in-memory vault and redraws. Strategy Over Impulse. */
const PMCR=(typeof BRIDGE!=='undefined'&&BRIDGE)?plug('Cred'):null;
const PMK={pref:'cnd.pm.prefs',gen:'cnd.pm.gen',share:'cnd.pm.share',fail:'cnd.pm.fail',legacy:'cnd.auth.share'};
const pmLS=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}};
const pmLSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const pmPref=()=>({lock:5,clip:30,icons:true,sort:'name',...pmLS(PMK.pref,{})});
const pmSetPref=(k,v)=>{const p=pmPref();p[k]=v;pmLSet(PMK.pref,p)};
const pmShareOn=()=>{try{return localStorage.getItem(PMK.share)==='1'}catch{return false}};
PM.act=Date.now();PM.busyUntil=0;PM.rp='';PM.pwned=null;PM.pick=null;PM.hk='';
const pmSecure=on=>{try{if(LOCK&&LOCK.secure){if(on&&S.settings.secure)LOCK.secure({on:true}).catch(()=>{});else applySecure()}}catch{}};/* V0.50.0: the Password Manager follows the one screenshot switch in Settings */
const pmHost=v=>{v=String(v||'').trim();if(!v||/^androidapp:/i.test(v))return'';try{const u=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v)?v:'https://'+v);return /\./.test(u.hostname)?u.hostname.replace(/^www\./,''):''}catch{return''}};
const pmWebUrl=v=>{v=String(v||'').trim();return!v||/^androidapp:/i.test(v)?'':/^[a-z][a-z0-9+.-]*:\/\//i.test(v)?v:'https://'+v};
const pmStamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())};
const pmDate=t=>{if(!t)return'';const d=new Date(t);return isNaN(d)?'':d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};

/* [1] OPEN, CLOSE, LOCK */
async function pmOpen(){
 document.body.classList.remove('nav');$('#pmt').classList.add('on');PM.open=true;PM.act=Date.now();pmSecure(true);
 if(!PM.hdr){try{PM.hdr=await pmHdr()||null}catch(e){toast('Could not open the password storage: '+(e&&e.message||e))}}
 PM.stack=[];PM.bioTried=false;
 if(PM.VK){PM.scr='dash';PM.tab='home'}else PM.scr=PM.hdr?'lock':'setup';
 pmRender()}
function pmClose(){PM.open=false;$('#pmt').classList.remove('on');clearInterval(PM.tm);pmSecure(false);if(PM.VK&&pmPref().lock===0)pmLock(true)}
function pmLock(quiet){
 const was=!!PM.VK;PM.VK=null;PM.items=[];PM.folders=[];PM.hist=[];PM.cur=null;PM.draft=null;PM.stack=[];PM.verified=0;PM.rp='';PM.pwned=null;PM.bioTried=false;PM.q='';PM.pick=null;
 clearInterval(PM.tm);pmClipNow();
 if(PM.open){PM.scr=PM.hdr?'lock':'setup';pmRender()}
 if(was&&!quiet)toast('Passwords locked.')}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){PM.hid=Date.now();return}
 if(!PM.VK||!PM.hid)return;const m=pmPref().lock,away=Date.now()-PM.hid;PM.hid=0;
 if(Date.now()<PM.busyUntil){PM.busyUntil=0;return}
 if(m===0||(m>0&&away>m*60000))pmLock()});
document.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('#pmt'))PM.act=Date.now()},true);
document.addEventListener('keydown',e=>{if(e.target.closest&&e.target.closest('#pmt'))PM.act=Date.now()},true);
setInterval(()=>{if(!PM.VK)return;const m=pmPref().lock;if(m>0&&Date.now()-PM.act>m*60000&&Date.now()>PM.busyUntil)pmLock()},10000);

/* [2] NAVIGATION */
function pmRender(){
 clearInterval(PM.tm);const B=$('#pml');B.replaceChildren();B.scrollTop=0;
 const root=!PM.stack.length&&['dash','list','health','set'].includes(PM.scr);
 $('#pmnav').style.display=root?'flex':'none';
 ({dash:(typeof pmDashScr==='function'?pmDashScr:pmListScr),lock:pmLockScr,setup:pmSetupScr,list:pmListScr,view:pmViewScr,edit:pmEditScr,health:pmHealthScr,hlist:pmHlistScr,set:pmSetScr,folders:pmFoldersScr,auto:pmAutoScr}[PM.scr]||pmListScr)(B);
 if(root)pmNav()}
function pmHead(t,sub,back,acts){
 const H=$('#pmh');H.replaceChildren();
 if(back){const b=h('button','ib',null,ico('back'));b.setAttribute('aria-label','Back');b.onclick=()=>pmBack();H.append(b)}
 H.append(h('div','vtt',null,h('b',null,t),h('small',null,sub||'')));
 (acts||[]).forEach(([ic,lab,fn])=>{const b=h('button','ib',null,ico(ic));b.setAttribute('aria-label',lab);b.title=lab;b.onclick=e=>fn(e);H.append(b)})}
function pmNav(){
 const N=$('#pmnav');N.replaceChildren();
 [['home','home','Home'],['vault','key','Vault'],['health','shield','Reports'],['set','gear','Settings']].forEach(([id,ic,t])=>{
  const b=h('button','pmtab'+(PM.tab===id?' on':''),null,ico(ic),h('span',null,t));b.onclick=()=>{if(PM.tab===id&&!PM.stack.length&&PM.scr!=='list'&&id==='vault')return;pmTab(id)};N.append(b)})}
function pmGo(scr,o){PM.stack.push({scr:PM.scr,tab:PM.tab,cur:PM.cur,flt:PM.flt,hk:PM.hk,pick:PM.pick,y:$('#pml').scrollTop});Object.assign(PM,o||{});PM.scr=scr;pmRender()}
function pmTab(t){PM.stack=[];PM.tab=t;PM.scr=t==='home'?'dash':t==='vault'?'list':t==='health'?'health':'set';PM.pick=null;PM.draft=null;pmRender()}
async function pmBack(){
 if(PM.scr==='edit'&&pmDirty()){const r=await dlg({title:'Discard changes?',msg:'What you typed on this screen will be lost.',ok:'Discard',danger:true});if(!r)return}
 if(PM.stack.length){const s=PM.stack.pop();PM.scr=s.scr;PM.tab=s.tab;PM.cur=s.cur;PM.flt=s.flt;PM.hk=s.hk;PM.pick=s.pick;if(s.scr!=='edit')PM.draft=null;pmRender();$('#pml').scrollTop=s.y||0;return}
 if(PM.scr==='lock'||PM.scr==='setup'||PM.tab==='home'){PM.draft=null;return pmClose()}
 pmTab('home')}

/* [3] CLIPBOARD. The copied secret is wiped after the time chosen in Settings (default 30 s) and when the vault locks. */
function pmCopy(t,label){
 const done=()=>{toast((label||'Text')+' copied');pmClipArm(t)};
 (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(done,()=>{const x=document.createElement('textarea');x.value=t;x.style.cssText='position:fixed;opacity:0';document.body.append(x);x.select();try{document.execCommand('copy')}catch{}x.remove();done()})}
function pmClipArm(t){clearTimeout(PM.ct);PM.clipV=t;const s=pmPref().clip;if(s>0)PM.ct=setTimeout(pmClipNow,s*1000)}
async function pmClipNow(){
 clearTimeout(PM.ct);const v=PM.clipV;PM.clipV=null;if(v==null)return;
 try{if(navigator.clipboard){let c=v;try{c=await navigator.clipboard.readText()}catch{}if(c===v)await navigator.clipboard.writeText('')}}catch{}}

/* [4] SMALL PARTS */
const PM_LOGO=new Map();
function pmAv(it){
 const n=String(it.name||'?').trim(),hue=[...n.toLowerCase()].reduce((x,c)=>(x*31+c.charCodeAt(0))%360,7),d=h('span','pmav',(n[0]||'?').toUpperCase());
 d.style.setProperty('--hue',hue);
 if(it.type!==1){d.replaceChildren(ico(PM_TYPES[it.type].ic));return d}
 const dom=pmHost(pmUrl(it));
 /* V0.43.6: the site's own logo, like the cloud storage list. Google's icon service first (128 px), then DuckDuckGo, then the site's own favicon. Each answer is remembered for this session. */
 if(pmPref().icons&&dom){const hit=PM_LOGO.get(dom);
  if(hit){const im=new Image();im.alt='';im.src=hit;d.replaceChildren(im);return d}
  const src=[u=>'https://www.google.com/s2/favicons?sz=128&domain='+encodeURIComponent(u),u=>'https://icons.duckduckgo.com/ip3/'+encodeURIComponent(u)+'.ico',u=>'https://'+u+'/favicon.ico'];
  const tryAt=n=>{if(n>=src.length)return;const im=new Image(),u=src[n](dom);im.referrerPolicy='no-referrer';im.alt='';
   im.onload=()=>{if(im.naturalWidth>16||n===src.length-1){PM_LOGO.set(dom,u);d.replaceChildren(im)}else tryAt(n+1)};im.onerror=()=>tryAt(n+1);im.src=u};
  tryAt(0)}
 return d}
/* ask for text. Passwords are never trimmed (the shared dialog trims, so the raw box value is read instead). */
async function pmAsk(title,msg,ok,o){
 o=o||{};const I=$('#di');I.type=o.plain?'text':'password';I.autocomplete='off';
 try{const r=await dlg({title,msg,value:o.value||'',ok:ok||'OK',danger:o.danger});if(!r)return null;return o.plain?r.v:I.value}
 finally{I.type='text';if(!o.plain)I.value=''}}
async function pmGuardMaster(why,force){
 if(!force&&Date.now()-PM.verified<30000)return true;
 const p=await pmAsk('Master password',why||'Enter your master password to continue.','Verify');if(p==null)return false;
 busy('Checking…');const ok=await pmVerify(p);unbusy();if(!ok)toast('Wrong master password.');return ok}
async function pmRp(it){if(!it.reprompt||PM.rp===it.id)return true;if(await pmGuardMaster('This item asks for your master password each time.',true)){PM.rp=it.id;return true}return false}
async function pmSaveBlob(name,blob,what){
 if(typeof SAF!=='undefined'&&SAF&&SAF.pickTree&&SAF.writeFile){
  PM.busyUntil=Date.now()+120000;let t;try{t=await SAF.pickTree({volume:'',start:''})}catch(e){if(e&&e.code==='CANCELLED')return false;throw e}
  await SAF.writeFile({dir:t.root||t.uri,name,b64:await blobB64(blob),mime:blob.type||'application/octet-stream'});toast((what||'File')+' saved to '+t.name+' / '+name);return true}
 const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);toast('Downloaded '+name);return true}
function pmPickFile(accept,multi){return new Promise(res=>{
 const i=document.createElement('input');i.type='file';i.accept=accept||'';i.multiple=!!multi;i.style.display='none';PM.busyUntil=Date.now()+120000;
 i.onchange=()=>{res([...i.files]);i.remove()};i.oncancel=()=>{res([]);i.remove()};document.body.append(i);i.click()})}
const PM_STRCOL=['#ff2b3d','#ff9100','#ffd400','#2effa0','#00e5ff'];
function pmStrBar(pw){
 const s=pmStrength(pw),w=h('div','pmstr'),f=h('i');f.style.width=(pw?(s.score+1)*20:0)+'%';f.style.background=PM_STRCOL[s.score];
 w.append(h('div','pmbar',null,f),h('small',null,pw?s.label+' · about '+s.bits+' bits':''));return w}
/* a password box with a show / hide button */
function pmPwInput(ph,val,onInput){
 const i=h('input','pmin');i.type='password';i.placeholder=ph||'';i.value=val||'';i.autocomplete='off';i.autocapitalize='off';i.spellcheck=false;
 const eb=h('button','ib pmeye',null,ico('eye'));eb.type='button';eb.setAttribute('aria-label','Show or hide');
 eb.onclick=()=>{const sh=i.type==='password';i.type=sh?'text':'password';eb.replaceChildren(ico(sh?'eyeoff':'eye'))};
 if(onInput)i.oninput=()=>onInput(i.value);
 return{box:h('div','pmpw',null,i,eb),input:i}}
const pmLabel=t=>h('label','pmlb',t);

/* one-time password (TOTP): otpauth:// link, steam:// link or a plain base32 key */
const PM_B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function pmUnB32(s){s=String(s).toUpperCase().replace(/[\s=-]/g,'');let bits='';
 for(const ch of s){const v=PM_B32.indexOf(ch);if(v<0)throw Error('The key has characters a one-time password key cannot have.');bits+=v.toString(2).padStart(5,'0')}
 const o=new Uint8Array(Math.floor(bits.length/8));for(let i=0;i<o.length;i++)o[i]=parseInt(bits.slice(i*8,i*8+8),2);
 if(o.length<8)throw Error('The key is too short.');return o}
function pmTotpParse(str){
 str=String(str||'').trim();if(!str)return null;
 const o={secret:'',digits:6,period:30,algo:'SHA1',steam:false};
 if(/^steam:\/\//i.test(str)){o.secret=str.slice(8);o.steam=true;o.digits=5;return o}
 const m=/^otpauth:\/\/([a-z]+)\/([^?]*)\??(.*)$/i.exec(str);
 if(m){if(m[1].toLowerCase()!=='totp')throw Error('Only time-based (TOTP) links are supported.');
  const q=new URLSearchParams(m[3]);o.secret=q.get('secret')||'';if(!o.secret)throw Error('That link has no secret.');
  o.digits=[6,7,8].includes(+q.get('digits'))?+q.get('digits'):6;o.period=+q.get('period')>0?+q.get('period'):30;o.algo=(q.get('algorithm')||'SHA1').toUpperCase();return o}
 o.secret=str;return o}
async function pmTotpCode(sp,now){
 const alg={SHA1:'SHA-1',SHA256:'SHA-256',SHA512:'SHA-512'}[sp.algo]||'SHA-1';
 let c=Math.floor((now||Date.now())/1000/sp.period);const m=new Uint8Array(8);for(let i=7;i>=0;i--){m[i]=c&255;c=Math.floor(c/256)}
 const k=await crypto.subtle.importKey('raw',pmUnB32(sp.secret),{name:'HMAC',hash:alg},false,['sign']),hh=new Uint8Array(await crypto.subtle.sign('HMAC',k,m)),o=hh[hh.length-1]&15,
  n=((hh[o]&127)<<24)|(hh[o+1]<<16)|(hh[o+2]<<8)|hh[o+3];
 if(sp.steam){const A='23456789BCDFGHJKMNPQRTVWXY';let v=n,s='';for(let i=0;i<5;i++){s+=A[v%26];v=Math.floor(v/26)}return s}
 return String(n%Math.pow(10,sp.digits)).padStart(sp.digits,'0')}
const pmFmtCode=c=>c.length===6?c.slice(0,3)+' '+c.slice(3):c.length===8?c.slice(0,4)+' '+c.slice(4):c;

/* [5] LOCK SCREEN AND FIRST-TIME SETUP */
const pmFail=n=>{if(n===0){pmLSet(PMK.fail,{n:0,until:0});return}const f=pmLS(PMK.fail,{n:0,until:0});if(n===undefined)return f;f.n=(f.n||0)+1;if(f.n>=5)f.until=Date.now()+30000*(f.n-4);pmLSet(PMK.fail,f);return f};
function pmLockScr(B){
 pmHead('Conduint Password Manager','Locked',true,[]);
 const c=h('div','pmc'),ic=h('div','pmbig',null,ico('lock'));
 c.append(ic,h('b','pmh1','Your vault is locked'),h('small','pmmu',PM.hdr?PM.hdr.email:''));
 const pw=pmPwInput('Master password','');pw.input.autofocus=true;c.append(pw.box);
 const msg=h('small','pmmsg','');c.append(msg);
 const go=h('button','chip on pmbtn','Unlock');
 const run=()=>pmDoUnlock(pw.input.value,msg,pw.input);go.onclick=run;pw.input.onkeydown=e=>{if(e.key==='Enter')run()};c.append(go);
 const row=h('div','pmrow2');
 if(PM.hdr&&PM.hdr.bio&&LOCK&&LOCK.bioUnwrap){const fb=h('button','chip pmbtn',null,ico('finger'),h('span',null,' Use fingerprint'));fb.onclick=()=>pmBioUnlock(msg);row.append(fb)}
 if(PM.hdr&&PM.hdr.hint){const hb=h('button','chip pmbtn','Show hint');hb.onclick=()=>{msg.textContent='Hint: '+PM.hdr.hint};row.append(hb)}
 c.append(row);if(typeof pmLockExtras==='function')pmLockExtras(c,msg);c.append(h('small','pmmu',typeof pmLockNote==='function'?pmLockNote():'No recovery exists. If the master password is forgotten the vault cannot be opened, because only you hold the key.'));
 B.append(c);
 if(PM.hdr&&PM.hdr.bio&&LOCK&&LOCK.bioUnwrap&&!PM.bioTried){PM.bioTried=true;setTimeout(()=>{if(PM.scr==='lock'&&!PM.VK)pmBioUnlock(msg)},250)}}
async function pmDoUnlock(pass,msg,inp){
 const f=pmFail(),w=Math.ceil(((f&&f.until)-Date.now())/1000);
 if(w>0){msg.textContent='Too many wrong tries. Wait '+w+' s.';return}
 if(!pass){msg.textContent='Type your master password.';return}
 busy('Unlocking…');
 try{await pmUnlockWith(pass)}
 catch(e){unbusy();PM.VK=null;const fl=pmFail(1);if(inp)inp.value='';
  msg.textContent=e&&e.name!=='OperationError'?'Could not open the vault: '+(e.message||e):(fl.until>Date.now()?'Wrong master password. Wait '+Math.ceil((fl.until-Date.now())/1000)+' s.':'Wrong master password. '+(5-fl.n)+' tries before a wait.');return}
 unbusy();pmFail(0);await pmAfterUnlock()}
async function pmBioUnlock(msg){
 try{
  const r=await LOCK.bioUnwrap({which:'pm',data:PM.hdr.bio,title:'Unlock Conduint Password Manager',subtitle:'Touch the fingerprint sensor',cancel:'Use master password'});
  PM.VK=await pmImportKey(r.b64);await pmLoadAll();
  if(PM.bad&&!PM.items.length&&!PM.folders.length){PM.VK=null;throw Object.assign(Error('The fingerprint key no longer opens this vault. Use your master password and turn fingerprint on again.'),{code:'INVALID'})}
  PM.verified=0;await pmAfterUnlock()}
 catch(e){PM.VK=null;if(e&&e.code!=='CANCELLED'&&msg)msg.textContent=(e&&e.message)||'Fingerprint did not work.'}}
async function pmAfterUnlock(){
 PM.act=Date.now();PM.rp='';PM.q='';PM.flt='all';PM.stack=[];PM.tab='home';PM.scr='dash';PM.pwned=null;
 const old=Date.now()-30*86400000,gone=PM.items.filter(i=>i.deletedDate&&new Date(i.deletedDate).getTime()<old);
 for(const it of gone){try{await pmDeleteItem(it)}catch{}}
 PM.onChange=pmChanged;pmRender();
 if(PM.bad)toast(PM.bad+(PM.bad===1?' record':' records')+' could not be decrypted and '+(PM.bad===1?'was':'were')+' skipped.');
 if(pmShareOn())pmSyncShare()}
function pmSetupScr(B){
 pmHead('Create your vault','Password Manager',true,[]);
 const c=h('div','pmc');c.append(h('div','pmbig',null,ico('key')),h('b','pmh1','Create your vault'),
  h('small','pmmu','Everything is encrypted on this phone with AES-256. Your master password is the only key and there is no way to recover it.'));
 const em=h('input','pmin');em.type='email';em.placeholder='Email address (used as part of the key)';em.autocapitalize='off';em.autocomplete='off';em.spellcheck=false;
 const bar=h('div'),p1=pmPwInput('Master password (12 characters or more)','',v=>{bar.replaceChildren(pmStrBar(v))}),p2=pmPwInput('Confirm master password',''),
  hint=h('input','pmin');hint.placeholder='Master password hint (optional, stored here in plain text)';hint.maxLength=100;
 const ck=h('label','pmck'),cb=document.createElement('input');cb.type='checkbox';ck.append(cb,h('span',null,'I understand that if I forget this master password my vault cannot be recovered.'));
 const msg=h('small','pmmsg',''),go=h('button','chip on pmbtn','Create vault');
 go.onclick=async()=>{
  const e=em.value.trim().toLowerCase(),a=p1.input.value,b=p2.input.value;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return msg.textContent='Enter a valid email address.';
  if(a.length<12)return msg.textContent='Use at least 12 characters.';
  if(a!==b)return msg.textContent='The two master passwords do not match.';
  if(pmStrength(a).score<=1&&!await dlg({title:'Weak master password',msg:'This password is easy to guess. Anyone who copies the vault file could crack it. Use it anyway?',ok:'Use it anyway',danger:true}))return;
  if(!cb.checked)return msg.textContent='Tick the box to confirm you understand.';
  busy('Creating vault…');
  try{await pmCreate(e,a,hint.value.trim())}catch(x){unbusy();return msg.textContent='Could not create the vault: '+(x&&x.message||x)}
  unbusy();PM.verified=Date.now();await pmAfterUnlock();toast('Vault created.');
  if(LOCK&&LOCK.bioWrap&&await pmBioAvail()){const r=await dlg({title:'Unlock with fingerprint?',msg:'Open the vault with your fingerprint instead of typing the master password each time. The master password still works.',ok:'Turn on'});if(r)pmBioToggle(true)}
  if(typeof pmOfferRecovery==='function')await pmOfferRecovery()};
 c.append(pmLabel('Email'),em,pmLabel('Master password'),p1.box,bar,pmLabel('Confirm'),p2.box,hint,ck,msg,go);B.append(c)}
const pmBioAvail=async()=>{try{return!!(LOCK&&LOCK.available&&(await LOCK.available()).ok)}catch{return false}};

/* [6] VAULT LIST */
const PM_FLT=[['all','All'],['fav','Favorites'],['t:1','Logins'],['t:2','Notes'],['t:3','Cards'],['t:4','Identities'],['t:5','SSH keys'],['att','Attachments']];
const pmPos=e=>{const r=((e&&e.currentTarget)||(e&&e.target)||document.body).getBoundingClientRect();return[r.left,r.bottom]};
const pmRedraw=()=>{const y=$('#pml').scrollTop;pmRender();$('#pml').scrollTop=y};
const pmQuick=it=>it.type===1&&it.login.password?[it.login.password,'Password']:it.type===3&&it.card.number?[it.card.number,'Card number']:null;
function pmAddMenu(e){const[x,y]=pmPos(e);menu(x,y,[...[1,2,3,4,5].map(t=>['New '+PM_TYPES[t].n.toLowerCase(),()=>pmNew(t)]),['hr'],['New folder',()=>pmNewFolder()]])}
async function pmNewFolder(){
 const r=await dlg({title:'New folder',value:'',ok:'Create'});if(!r||!r.v)return;
 if(PM.folders.some(f=>f.name.toLowerCase()===r.v.toLowerCase()))return toast('That folder already exists.');
 await pmSaveFolder({id:pmId(),name:r.v.slice(0,100)});toast('Folder created');if(PM.open&&['list','folders'].includes(PM.scr))pmRedraw()}
function pmRowEl(it,extra){
 const r=h('div','pmit'),m=h('div','pmim',null,h('b',null,it.name||'(no name)'),h('small',null,extra||pmSub(it)));
 r.append(pmAv(it),m);
 if(it.favorite&&!it.deletedDate)r.append(ico('starfill','pmfv'));
 if((it.attachments||[]).length)r.append(ico('file','pmat'));
 const q=!it.deletedDate&&pmQuick(it);
 if(q){const b=h('button','ib',null,ico('copy'));b.setAttribute('aria-label','Copy '+q[1].toLowerCase());b.onclick=async e=>{e.stopPropagation();if(await pmRp(it))pmCopy(q[0],q[1])};r.append(b)}
 r.onclick=()=>pmOpenItem(it);return r}
function pmOpenItem(it){PM.cur=it;pmGo('view',{cur:it})}
function pmListScr(B){
 const n=PM.items.filter(i=>!i.deletedDate).length,tn=PM.items.length-n;
 pmHead('Vault',n+(n===1?' item':' items'),false,[['plus','Add item',pmAddMenu],['lock','Lock vault',()=>pmLock()]]);
 const q=h('input','pmin pmq');q.type='search';q.placeholder='Search the vault';q.value=PM.q;q.autocomplete='off';q.autocapitalize='off';q.spellcheck=false;
 const chips=h('div','pmfl2'),L=h('div','pmlist');let lim=200;
 const drawChips=()=>{chips.replaceChildren();
  const all=[...PM_FLT,...PM.folders.slice().sort(pmCmp).map(f=>['f:'+f.id,f.name]),['f:','No folder'],['trash','Trash'+(tn?' ('+tn+')':'')]];
  all.forEach(([k,t])=>{const b=h('button','chip'+(PM.flt===k?' on':''),t);b.onclick=()=>{PM.flt=k;lim=200;drawChips();drawList()};chips.append(b)})};
 const drawList=()=>{L.replaceChildren();const items=pmList();
  if(!items.length){L.append(h('div','pmempty',PM.q?'Nothing matches that search.':PM.flt==='trash'?'The trash is empty. Deleted items stay here for 30 days.':PM.items.length?'Nothing in this view.':'Your vault is empty. Tap + to add your first item, or use Settings > Import.'));return}
  items.slice(0,lim).forEach(it=>L.append(pmRowEl(it)));
  if(items.length>lim){const mb=h('button','chip pmbtn','Show '+Math.min(200,items.length-lim)+' more ('+(items.length-lim)+' left)');mb.onclick=()=>{lim+=200;drawList()};L.append(mb)}
  if(PM.flt==='trash'){const eb=h('button','chip pmbtn danger2','Empty the trash');eb.onclick=pmEmptyTrash;L.append(eb)}};
 q.oninput=()=>{PM.q=q.value;lim=200;drawList()};
 B.append(h('div','pmsrch',null,q),chips,L);drawChips();drawList()}
async function pmEmptyTrash(){
 const t=PM.items.filter(i=>i.deletedDate);if(!t.length)return;
 const r=await dlg({title:'Empty the trash?',msg:t.length+(t.length===1?' item is':' items are')+' erased for good, with their attachments.',ok:'Erase',danger:true});if(!r)return;
 busy('Erasing…');try{for(const it of t)await pmDeleteItem(it)}catch(e){toast('Stopped: '+(e.message||e))}unbusy();pmRedraw()}

/* [7] ITEM VIEW */
function pmFld(lab,val,o){
 o=o||{};if(val===''||val==null)return null;
 const r=h('div','pmf'),v=h('div','pmv'+(o.mono?' mono':'')),mask='\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';let shown=!o.secret;
 const draw=()=>{v.textContent=shown?val:mask};draw();
 const tx=h('div','pmft',null,h('small','pmfl',lab),v),bx=h('div','pmfb');
 if(o.secret){const eb=h('button','ib',null,ico('eye'));eb.setAttribute('aria-label','Show or hide');eb.onclick=async()=>{if(!shown&&o.rp&&!await pmRp(o.rp))return;shown=!shown;draw();eb.replaceChildren(ico(shown?'eyeoff':'eye'))};bx.append(eb)}
 if(o.url){const ob=h('button','ib',null,ico('ext'));ob.setAttribute('aria-label','Open website');ob.onclick=()=>{try{if(typeof brOpenIn==='function')brOpenIn(o.url);else window.open(o.url,'_blank','noopener')}catch(e){toast('Could not open it.')}};bx.append(ob)}
 if(o.copy!==false){const cb=h('button','ib',null,ico('copy'));cb.setAttribute('aria-label','Copy '+lab.toLowerCase());cb.onclick=async()=>{if(o.rp&&!await pmRp(o.rp))return;pmCopy(val,lab)};bx.append(cb)}
 r.append(tx,bx);return r}
function pmTotpRow(it){
 const r=h('div','pmf pmtotp'),tx=h('div','pmft'),bx=h('div','pmfb');r.append(tx,bx);
 let sp;try{sp=pmTotpParse(it.login.totp)}catch(e){tx.append(h('small','pmfl','One-time password'),h('div','pmv',(e&&e.message)||'The key is not valid.'));return r}
 if(!sp)return null;
 if(it.reprompt&&PM.rp!==it.id){const b=h('button','chip pmbtn','Show one-time password');b.onclick=async()=>{if(await pmRp(it))pmRedraw()};tx.append(h('small','pmfl','One-time password'),b);return r}
 const code=h('div','pmv pmcode','······'),bar=h('div','pmbar',null,h('i')),cb=h('button','ib',null,ico('copy'));let cur='',step=-1;
 cb.setAttribute('aria-label','Copy one-time password');cb.onclick=()=>{if(cur)pmCopy(cur,'One-time password')};bx.append(cb);
 tx.append(h('small','pmfl','One-time password'),code,bar);
 const tick=async()=>{const now=Date.now(),st=Math.floor(now/1000/sp.period),left=sp.period-((now/1000)%sp.period);
  if(st!==step){try{cur=await pmTotpCode(sp,now);step=st;code.textContent=pmFmtCode(cur)}catch(e){code.textContent=(e&&e.message)||'Error';clearInterval(PM.tm);return}}
  const f=bar.firstChild;f.style.width=(left/sp.period*100)+'%';f.style.background=left<5?PM_STRCOL[0]:PM_STRCOL[4]};
 tick();PM.tm=setInterval(tick,1000);return r}
function pmViewScr(B){
 const it=PM.cur;if(!it||!PM.items.includes(it)){PM.cur=null;PM.stack=[];PM.scr='list';PM.tab='vault';return pmRender()}
 const tr=!!it.deletedDate;
 pmHead(PM_TYPES[it.type].n,it.folderId?pmFolderName(it.folderId):'No folder',true,tr?
  [['history','Restore',async()=>{await pmRestoreItem(it);toast('Restored');pmBack()}],['trash','Delete forever',()=>pmPurge(it)]]:
  [[it.favorite?'starfill':'star','Favorite',async()=>{it.favorite=!it.favorite;await pmSaveItem(it,{keepHistory:true});pmRedraw()}],['edit','Edit',()=>pmEdit(it)],['more','More',e=>pmItemMenu(e,it)]]);
 B.append(h('div','pmvh',null,pmAv(it),h('div',null,null,h('b','pmvn',it.name||'(no name)'),h('small',null,PM_TYPES[it.type].n+(it.favorite?' · Favorite':'')))));
 if(tr)B.append(h('div','pmban','In the trash. It is erased for good 30 days after it was deleted.'));
 const sec=h('div','pmsec'),add=(l,v,o)=>{const f=pmFld(l,v,o);if(f)sec.append(f)};
 if(it.type===1){
  add('Username',it.login.username);
  add('Password',it.login.password,{secret:true,mono:true,rp:it});
  if(it.login.password){const s=pmStrength(it.login.password);sec.append(h('div','pmstrl',null,pmStrBar(it.login.password)))}
  it.login.uris.filter(u=>u.uri).forEach((u,i)=>add(i?'Website '+(i+1):'Website',u.uri,{url:pmWebUrl(u.uri)}));
  if(it.login.totp){const t=pmTotpRow(it);if(t)sec.append(t)}}
 if(it.type===3){const c=it.card;
  add('Cardholder',c.cardholderName);add('Brand',c.brand);add('Number',c.number,{secret:true,mono:true,rp:it});
  add('Expires',c.expMonth||c.expYear?(c.expMonth||'--')+' / '+(c.expYear||'----'):'');add('Security code',c.code,{secret:true,mono:true,rp:it})}
 if(it.type===4)PM_ID_KEYS.forEach(k=>add(PM_ID_LAB[k],it.identity[k],{secret:['ssn','passportNumber','licenseNumber'].includes(k),rp:it}));
 if(it.type===5){add('Public key',it.sshKey.publicKey,{mono:true});add('Fingerprint',it.sshKey.keyFingerprint,{mono:true});add('Private key',it.sshKey.privateKey,{secret:true,mono:true,rp:it})}
 if(sec.children.length)B.append(sec);
 if(it.notes){const s2=h('div','pmsec');const f=pmFld('Notes',it.notes,{});if(f){f.classList.add('pmnote');s2.append(f);B.append(s2)}}
 (it.moreNotes||[]).forEach((n,i)=>{const s2=h('div','pmsec');const f=pmFld(n.t||('Note '+(i+2)),n.v,{});if(f){f.classList.add('pmnote');s2.append(f);B.append(s2)}});
 if((it.fields||[]).length){const s3=h('div','pmsec');
  it.fields.forEach((f,fi)=>{if(f.type===2)s3.append(pmFld(f.name||'Field',f.value==='true'?'Yes':'No',{copy:false}));else if(f.type===3){const e=pmTotpRow({id:it.id+'-cf-'+fi,login:{totp:f.value||''},reprompt:it.reprompt});if(e){e.classList.add('pmcustomtotp');s3.append(e)}}else{const e=pmFld(f.name||'Field',f.value,{secret:f.type===1,rp:it});if(e)s3.append(e)}});
  if(s3.children.length)B.append(s3)}
 if((it.attachments||[]).length){const s4=h('div','pmsec');s4.append(h('small','pmfl pmsech','Attachments'));
  it.attachments.forEach(a=>{const r=h('div','pmf'),b=h('button','ib',null,ico('down'));b.setAttribute('aria-label','Save '+a.fileName);
   b.onclick=async()=>{if(!await pmRp(it))return;busy('Decrypting…');try{const bl=await pmAttGet(a);unbusy();await pmSaveBlob(a.fileName,bl,'Attachment')}catch(e){unbusy();toast('Could not open it: '+(e.message||e))}};
   r.append(h('div','pmft',null,h('div','pmv',a.fileName),h('small','pmfl',fmt(a.size))),h('div','pmfb',null,b));s4.append(r)});B.append(s4)}
 if(it.type===1&&(it.passwordHistory||[]).length){const s5=h('div','pmsec');s5.append(h('small','pmfl pmsech','Password history'));
  it.passwordHistory.forEach(p=>{const f=pmFld('Used until '+pmDate(p.lastUsedDate),p.password,{secret:true,mono:true,rp:it});if(f)s5.append(f)});B.append(s5)}
 B.append(h('small','pmmu pmdates','Created '+pmDate(it.creationDate)+'\nChanged '+pmDate(it.revisionDate)+(tr?'\nDeleted '+pmDate(it.deletedDate):'')));
 if(tr){const rb=h('button','chip on pmbtn','Restore'),db=h('button','chip pmbtn danger2','Delete forever');rb.onclick=async()=>{await pmRestoreItem(it);toast('Restored');pmBack()};db.onclick=()=>pmPurge(it);B.append(rb,db)}}
async function pmPurge(it){
 const r=await dlg({title:'Delete forever?',msg:'"'+(it.name||'This item')+'" and its attachments are erased. This cannot be undone.',ok:'Delete',danger:true});if(!r)return;
 busy('Erasing…');try{await pmDeleteItem(it)}catch(e){unbusy();return toast('Could not erase it: '+(e.message||e))}unbusy();toast('Deleted');PM.cur=null;pmBack()}
function pmItemMenu(e,it){const[x,y]=pmPos(e);
 menu(x,y,[['Clone',()=>pmClone(it)],['Move to folder',()=>pmMoveFolder(it)],['hr'],['Delete (move to trash)',async()=>{
  const r=await dlg({title:'Move to trash?',msg:'It stays in the trash for 30 days, then it is erased.',ok:'Move to trash',danger:true});if(!r)return;
  await pmTrashItem(it);toast('Moved to trash');PM.cur=null;pmBack()}]])}
async function pmMoveFolder(it){
 const r=await dlg({title:'Move to folder',opts:[['',"No folder"],...PM.folders.slice().sort(pmCmp).map(f=>[f.id,f.name])],val:it.folderId||'',ok:'Move'});if(!r)return;
 it.folderId=r.o||null;await pmSaveItem(it,{keepHistory:true});toast('Moved');pmRedraw()}
async function pmClone(it){
 if(!await pmRp(it))return;
 const c=JSON.parse(JSON.stringify(it));c.id=pmId();c.name=(c.name||'Item')+' (copy)';c.attachments=[];c.passwordHistory=[];if(c.login)delete c.login.fido2Credentials;c.deletedDate=null;c.favorite=false;c.creationDate=c.revisionDate=pmNow();
 PM.draft={it:c,snap:'',add:[],del:[],isNew:true};pmGo('edit',{cur:null});
 if((it.attachments||[]).length)toast('Cloned without attachments.');
 if(it.login&&(it.login.fido2Credentials||[]).length)toast('Cloned without the passkey. A passkey belongs to one item.')}

/* [8] ITEM EDITOR (no generator in this build) */
function pmNew(type){
 const fid=typeof PM.flt==='string'&&PM.flt.startsWith('f:')&&PM.flt.length>2?PM.flt.slice(2):null,it=pmBlank(type,fid);
 PM.draft={it,snap:JSON.stringify(it),add:[],del:[],isNew:true};PM.cur=null;pmGo('edit',{cur:null})}
async function pmEdit(it){
 if(!await pmRp(it))return;
 const c=JSON.parse(JSON.stringify(it));PM.draft={it:c,snap:JSON.stringify(c),add:[],del:[],isNew:false};pmGo('edit',{cur:it})}
const pmDirty=()=>!!PM.draft&&(JSON.stringify(PM.draft.it)!==PM.draft.snap||PM.draft.add.length>0||PM.draft.del.length>0);
function pmSelect(lab,obj,key,opts,after){
 const s=h('select','pmin');opts.forEach(([v,t])=>{const o=h('option',null,t);o.value=v;s.append(o)});s.value=obj[key]==null?'':String(obj[key]);
 s.onchange=()=>{obj[key]=s.value;if(after)after(s.value)};return s}
function pmEditScr(B){
 const D=PM.draft;if(!D){PM.stack=[];PM.scr='list';PM.tab='vault';return pmRender()}
 const it=D.it;
 pmHead((D.isNew?'New ':'Edit ')+PM_TYPES[it.type].n.toLowerCase(),'',true,[['check','Save',()=>pmSaveDraft()]]);
 const fld=(lab,obj,key,o)=>{o=o||{};B.append(pmLabel(lab));let el;
  if(o.secret){const p=pmPwInput(o.ph||'',obj[key],v=>{obj[key]=v;if(o.on)o.on(v)});if(o.mono)p.input.classList.add('mono');el=p.box}
  else if(o.area){el=h('textarea','pmin pmta'+(o.mono?' mono':''));el.value=obj[key]||'';el.rows=o.rows||4;el.spellcheck=false;el.autocapitalize='off';el.oninput=()=>{obj[key]=el.value}}
  else{el=h('input','pmin');el.type=o.type||'text';el.value=obj[key]||'';el.placeholder=o.ph||'';el.autocapitalize=o.cap||'off';el.autocomplete='off';el.spellcheck=false;if(o.mode)el.inputMode=o.mode;el.oninput=()=>{obj[key]=el.value}}
  B.append(el);return el};
 const ck=(lab,obj,key)=>{const l=h('label','pmck'),c=document.createElement('input');c.type='checkbox';c.checked=!!obj[key];c.onchange=()=>{obj[key]=c.checked?1:0;if(key==='favorite')obj[key]=c.checked};l.append(c,h('span',null,lab));B.append(l)};
 fld('Name',it,'name',{cap:'words'});
 if(it.type===1){
  fld('Username',it.login,'username');
  const bar=h('div');bar.append(pmStrBar(it.login.password));
  fld('Password',it.login,'password',{secret:true,mono:true,on:v=>{bar.replaceChildren(pmStrBar(v))}});B.append(bar);
  B.append(pmLabel('Websites'));
  it.login.uris.forEach((u,i)=>{const r=h('div','pmrow2'),inp=h('input','pmin');inp.value=u.uri||'';inp.placeholder='https://example.com';inp.autocapitalize='off';inp.autocomplete='off';inp.spellcheck=false;inp.type='url';inp.oninput=()=>{u.uri=inp.value};
   r.append(inp);if(it.login.uris.length>1){const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Remove website');x.onclick=()=>{it.login.uris.splice(i,1);pmRedraw()};r.append(x)}B.append(r)});
  const au=h('button','chip pmbtn','Add website');au.onclick=()=>{it.login.uris.push({match:null,uri:''});pmRedraw()};B.append(au);
  fld('One-time password key (optional)',it.login,'totp',{secret:true,mono:true,ph:'Base32 key or otpauth:// link'})}
 if(it.type===3){const c=it.card;
  fld('Cardholder name',c,'cardholderName',{cap:'words'});
  B.append(pmLabel('Brand'),pmSelect('Brand',c,'brand',PM_BRANDS.map(b=>[b,b||'Select'])));
  fld('Number',c,'number',{secret:true,mono:true,mode:'numeric'});
  B.append(pmLabel('Expiry month'),pmSelect('Month',c,'expMonth',PM_MONTHS.map(m=>[m,m||'Select'])));
  fld('Expiry year',c,'expYear',{mode:'numeric',ph:'2030'});
  fld('Security code',c,'code',{secret:true,mono:true,mode:'numeric'})}
 if(it.type===4)PM_ID_KEYS.forEach(k=>fld(PM_ID_LAB[k],it.identity,k,{secret:['ssn','passportNumber','licenseNumber'].includes(k),cap:['firstName','middleName','lastName','city','company','address1','address2','address3'].includes(k)?'words':'off'}));
 if(it.type===5){fld('Public key',it.sshKey,'publicKey',{area:true,mono:true,rows:3});fld('Private key',it.sshKey,'privateKey',{area:true,mono:true,rows:6});fld('Fingerprint',it.sshKey,'keyFingerprint',{mono:true})}
 B.append(pmLabel('Folder'),pmSelect('Folder',it,'folderId',[['','No folder'],...PM.folders.slice().sort(pmCmp).map(f=>[f.id,f.name])],v=>{it.folderId=v||null}));
 ck('Favorite',it,'favorite');ck('Ask for the master password before showing or copying this item',it,'reprompt');
 fld('Notes',it,'notes',{area:true,rows:5});
 /* V0.43.6: more than one note per item. Note 1 is the normal Notes box above; extra notes each get an optional title. */
 (it.moreNotes||[]).forEach((n,i)=>{B.append(pmLabel('Note '+(i+2)));
  const r=h('div','pmrow2'),t=h('input','pmin');t.placeholder='Title (optional)';t.value=n.t||'';t.autocapitalize='sentences';t.oninput=()=>{n.t=t.value};
  const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Remove note '+(i+2));x.onclick=()=>{it.moreNotes.splice(i,1);pmRedraw()};r.append(t,x);B.append(r);
  const ta=h('textarea','pmin pmta');ta.value=n.v||'';ta.rows=4;ta.spellcheck=false;ta.autocapitalize='off';ta.oninput=()=>{n.v=ta.value};B.append(ta)});
 {const an=h('button','chip pmbtn','Add another note');an.onclick=()=>{(it.moreNotes=it.moreNotes||[]).push({t:'',v:''});pmRedraw()};B.append(an)}
 B.append(pmLabel('Custom fields'));
 it.fields.forEach((f,i)=>{const box=h('div','pmcf'),nm=h('input','pmin');nm.placeholder='Field name';nm.value=f.name||'';nm.autocapitalize='off';nm.oninput=()=>{f.name=nm.value};
  const ty=pmSelect('Type',f,'type',[['0','Text'],['1','Hidden'],['2','Checkbox'],['3','Authenticator (TOTP)']],v=>{f.type=+v;if(+v===2)f.value=f.value==='true'?'true':'false';if(+v===3)f.value=String(f.value||'').trim();pmRedraw()});
  const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Remove field');x.onclick=()=>{it.fields.splice(i,1);pmRedraw()};
  let vv;if(f.type===3){vv=h('input','pmin');vv.placeholder='Base32 key or otpauth:// link';vv.value=f.value||'';vv.autocapitalize='off';vv.spellcheck=false;vv.oninput=()=>{f.value=vv.value}}
  else if(f.type===2){vv=h('label','pmck');const c=document.createElement('input');c.type='checkbox';c.checked=f.value==='true';c.onchange=()=>{f.value=c.checked?'true':'false'};vv.append(c,h('span',null,'Checked'))}
  else if(f.type===1){vv=pmPwInput('Value',f.value,v=>{f.value=v}).box}
  else{vv=h('input','pmin');vv.placeholder='Value';vv.value=f.value||'';vv.autocapitalize='off';vv.oninput=()=>{f.value=vv.value}}
  box.append(h('div','pmrow2',null,nm,x),ty,vv);B.append(box)});
 const af=h('button','chip pmbtn','Add custom field');af.onclick=()=>{it.fields.push({name:'',value:'',type:0});pmRedraw()};B.append(af);
 B.append(pmLabel('Attachments'));
 it.attachments.forEach((a,i)=>{const r=h('div','pmit',null,h('div','pmim',null,h('b',null,a.fileName),h('small',null,fmt(a.size)))),x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Remove attachment');x.onclick=()=>{D.del.push(it.attachments.splice(i,1)[0]);pmRedraw()};r.append(x);B.append(r)});
 D.add.forEach((f,i)=>{const r=h('div','pmit',null,h('div','pmim',null,h('b',null,f.name),h('small',null,fmt(f.size)+' · new'))),x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Remove attachment');x.onclick=()=>{D.add.splice(i,1);pmRedraw()};r.append(x);B.append(r)});
 const pa=h('button','chip pmbtn','Add attachment');pa.onclick=async()=>{const fs=await pmPickFile('',true);if(!fs.length)return;const bad=fs.filter(f=>f.size>PMMAX);fs.filter(f=>f.size<=PMMAX).forEach(f=>D.add.push(f));if(bad.length)toast('"'+bad[0].name+'" is over '+fmt(PMMAX)+' and was skipped.');pmRedraw()};B.append(pa);
 const sv=h('button','chip on pmbtn','Save');sv.onclick=()=>pmSaveDraft();B.append(sv)}
async function pmSaveDraft(){
 const D=PM.draft;if(!D)return;const it=D.it;
 if(!String(it.name||'').trim())return toast('Give the item a name.');
 if(it.type===1&&String(it.login.totp||'').trim()){try{await pmTotpCode(pmTotpParse(it.login.totp))}catch(e){return toast('One-time password key: '+((e&&e.message)||e))}}
 for(const f of (it.fields||[]).filter(x=>x.type===3&&String(x.value||'').trim())){try{await pmTotpCode(pmTotpParse(f.value))}catch(e){return toast('Authenticator field “'+(f.name||'Field')+'”: '+((e&&e.message)||e))}}
 busy('Saving…');const stored=[];
 try{
  it.name=it.name.trim();if(it.type===1){it.login.totp=String(it.login.totp||'').trim();it.login.uris=it.login.uris.map(u=>({match:u.match==null?null:u.match,uri:String(u.uri||'').trim()})).filter(u=>u.uri)}
  it.fields=it.fields.filter(f=>f.name||f.value);
  if(it.moreNotes){it.moreNotes=it.moreNotes.map(n=>({t:String(n.t||'').trim(),v:String(n.v||'')})).filter(n=>n.t||n.v.trim());if(!it.moreNotes.length)delete it.moreNotes}
  for(const f of D.add){$('#bp').textContent=f.name;const a=await pmAttPut(f);stored.push(a);it.attachments.push(a)}
  const saved=pmNorm(it);await pmSaveItem(saved);
  for(const a of D.del){try{await pmAttDel(a)}catch{}}
  unbusy();toast(D.isNew?'Item added':'Saved');pmAfterSave(saved,D.isNew)}
 catch(e){for(const a of stored){try{await pmAttDel(a)}catch{}}it.attachments=it.attachments.filter(a=>!stored.includes(a));unbusy();toast('Could not save: '+((e&&e.message)||e))}}
function pmAfterSave(saved,isNew){
 PM.draft=null;const s=PM.stack.pop();
 if(s)Object.assign(PM,{scr:s.scr,tab:s.tab,flt:s.flt,hk:s.hk,pick:s.pick});
 if(isNew||!s){PM.cur=saved;if(!s){PM.scr='list'}pmGo('view',{cur:saved});return}
 PM.cur=saved;PM.scr='view';pmRender()}

/* [9] REPORTS */
const PM_REP=[['reused','Reused passwords','The same password is on more than one login.'],['weak','Weak passwords','Easy to guess. Change these first.'],['http','Unsecure websites','The address starts with http:// not https://.'],['no2fa','No one-time password','A website is saved but no one-time password key.'],['empty','Logins with no password','Nothing saved in the password box.']];
function pmHealthScr(B){
 pmHead('Reports','Password health',false,[]);
 const H=pmHealth(),live=PM.items.filter(i=>!i.deletedDate&&i.type===1).length;
 const worst=H.reused.length+H.weak.length+H.http.length;
 B.append(h('div','pmban'+(worst?'':' pmgood'),live?(worst?worst+' problems found across '+live+' logins.':'No reused, weak or unsecure logins in '+live+' logins.'):'Add logins to see reports.'));
 PM_REP.forEach(([k,t,d])=>{const n=H[k].length,b=h('button','pmsr',null,h('div',null,null,h('b',null,t),h('small',null,d)),h('span','pmcnt'+(n&&k!=='no2fa'&&k!=='empty'?' bad':''),String(n)));
  b.onclick=()=>{if(n)pmGo('hlist',{hk:k});else toast('None found.')};B.append(b)});
 const pw=PM.pwned,pb=h('button','pmsr',null,h('div',null,null,h('b',null,'Exposed in data breaches'),h('small',null,pw?'Checked '+pmDate(pw.at)+'. Tap to see the list.':'Checks each password against known breaches. Needs internet.')),h('span','pmcnt'+(pw&&pw.hits.length?' bad':''),pw?String(pw.hits.length):'Check'));
 pb.onclick=()=>{if(pw&&pw.hits.length)pmGo('hlist',{hk:'pwned'});else pmBreach()};B.append(pb);
 if(pw){const rb=h('button','chip pmbtn','Check again');rb.onclick=pmBreach;B.append(rb)}
 B.append(h('small','pmmu','Strength is an estimate from length and mix of characters. The breach check sends only the first 5 characters of a password\u2019s SHA-1 hash to haveibeenpwned.com, never the password.'))}
function pmHlistScr(B){
 const k=PM.hk,rep=PM_REP.find(x=>x[0]===k),title=k==='pwned'?'Exposed in data breaches':rep?rep[1]:'Report';
 let list=[],cnt=new Map();
 if(k==='pwned'&&PM.pwned){PM.pwned.hits.forEach(x=>cnt.set(x.id,x.count));list=PM.items.filter(i=>cnt.has(i.id)&&!i.deletedDate)}
 else if(rep)list=pmHealth()[k];
 pmHead(title,list.length+(list.length===1?' login':' logins'),true,[]);
 if(!list.length)B.append(h('div','pmempty','Nothing to show.'));
 list.slice().sort(pmCmp).forEach(it=>B.append(pmRowEl(it,k==='pwned'?'Seen '+cnt.get(it.id).toLocaleString()+' times in breaches':pmSub(it))))}
async function pmBreach(){
 const r=await dlg({title:'Check for breaches?',msg:'For each password, the first 5 characters of its SHA-1 hash are sent to haveibeenpwned.com. The password never leaves this phone. It needs internet and takes a moment.',ok:'Check'});if(!r)return;
 const logins=PM.items.filter(i=>!i.deletedDate&&i.type===1&&i.login.password);
 if(!logins.length)return toast('No saved passwords to check.');
 let stop=false;busy('Checking passwords…');$('#bc').onclick=()=>{stop=true};
 const hits=[],seen=new Map();let n=0,err=null;
 try{for(const it of logins){
   if(stop)break;n++;$('#bp').textContent=n+' of '+logins.length;
   const p=it.login.password;let c=seen.get(p);
   if(c===undefined){c=await pmPwned(p);seen.set(p,c);await new Promise(r=>setTimeout(r,120))}
   if(c>0)hits.push({id:it.id,count:c})}}
 catch(e){err=(e&&e.message)||String(e)}
 $('#bc').onclick=null;unbusy();
 if(err){toast(err+' Checked '+(n-1)+' of '+logins.length+'.');if(!hits.length)return}
 PM.pwned={at:Date.now(),hits};if(PM.open&&PM.scr==='health')pmRedraw();
 toast(stop?'Stopped.':hits.length?hits.length+' exposed. Change them first.':'None of your passwords were found in known breaches.')}

/* [10] SETTINGS */
const PM_LOCKS=[[0,'When I leave the app'],[1,'After 1 minute'],[5,'After 5 minutes'],[15,'After 15 minutes'],[30,'After 30 minutes'],[60,'After 1 hour'],[-1,'Never (until the app closes)']];
const PM_CLIPS=[[10,'10 seconds'],[30,'30 seconds'],[60,'1 minute'],[120,'2 minutes'],[0,'Never']];
const pmOptName=(L,v)=>(L.find(x=>x[0]===v)||[0,String(v)])[1];
function pmSetRow(t,sub,right,fn){const b=h('button','pmsr',null,h('div',null,null,h('b',null,t),sub?h('small',null,sub):null),right==null?ico('chup','pmchev'):typeof right==='string'?h('span','pmcnt',right):right);if(fn)b.onclick=fn;return b}
const pmSwitch=on=>h('i','pmsw'+(on?' on':''));
function pmSetScr(B){
 pmHead('Settings','Password Manager',false,[]);
 const P=pmPref(),sec=t=>B.append(h('small','pmsech2',t));
 sec('Security');
 B.append(pmSetRow('Auto-lock','Locks and wipes the vault from memory',pmOptName(PM_LOCKS,P.lock),async()=>{
  const r=await dlg({title:'Auto-lock',opts:PM_LOCKS.map(([v,t])=>[String(v),t]),val:String(P.lock),ok:'Save'});if(!r||r.o==null)return;pmSetPref('lock',+r.o);pmRedraw()}));
 B.append(pmSetRow('Clear clipboard','Wipes a copied password after',pmOptName(PM_CLIPS,P.clip),async()=>{
  const r=await dlg({title:'Clear clipboard after',opts:PM_CLIPS.map(([v,t])=>[String(v),t]),val:String(P.clip),ok:'Save'});if(!r||r.o==null)return;pmSetPref('clip',+r.o);pmRedraw()}));
 B.append(pmSetRow('Unlock with fingerprint','Your master password still works',pmSwitch(!!(PM.hdr&&PM.hdr.bio)),()=>pmBioToggle()));
 B.append(pmSetRow('Change master password','Needs the current one',null,pmChangeMasterFlow));
 B.append(pmSetRow('Lock now','',null,()=>pmLock()));
 if(typeof pmSecRows==='function')pmSecRows(B);
 sec('Organize');
 B.append(pmSetRow('Folders',PM.folders.length+(PM.folders.length===1?' folder':' folders'),null,()=>pmGo('folders')));
 const tn=PM.items.filter(i=>i.deletedDate).length;
 B.append(pmSetRow('Trash',tn+(tn===1?' item':' items'),null,()=>{PM.flt='trash';pmTab('vault')}));
 B.append(pmSetRow('Show website icons','Loads each site\u2019s own logo from an icon service (Google, then DuckDuckGo). Off keeps the vault fully offline and shows letters.',pmSwitch(!!P.icons),()=>{pmSetPref('icons',!P.icons);pmRedraw()}));
 sec('Import and export');
 B.append(pmSetRow('Import from a file','Password export (.json, .zip), Chrome / Edge / LastPass (.csv), Conduint backup (.cndpm)',null,pmImportFile));
 B.append(pmSetRow('Import from Authenticator','Copies saved passwords and notes. Nothing is linked.',null,pmImportAuth));
 B.append(pmSetRow('Export encrypted backup','.cndpm sealed with a password you choose. Includes attachments.',null,()=>pmExport('enc')));
 B.append(pmSetRow('Export .json','NOT encrypted',null,()=>pmExport('json')));
 B.append(pmSetRow('Export .zip with attachments','NOT encrypted',null,()=>pmExport('zip')));
 B.append(pmSetRow('Export .csv','Logins and notes only. NOT encrypted',null,()=>pmExport('csv')));
 sec('Tidy up and sync');/* V0.51.0 */
 B.append(pmSetRow('Find duplicates','Logins saved more than once. You choose which one to keep.',null,()=>pmGo('hlist',{hk:'dups'})));
 if(typeof pmAuSyncRow==='function')pmAuSyncRow(B);
 sec('Autofill');
 {const pr=pmSetRow('Passkeys & autofill','Use Conduint to sign in to other apps',null,()=>pmGo('auto'));B.append(pr);
  /* V0.52.0: status light. Green when Conduint is both the passkey provider and the autofill service, amber when only one is on, red when neither. */
  if(PMCR)PMCR.status().then(st=>{if(!pr.isConnected)return;st=st||{};
   const pk=st.passkeyCapable?!!st.providerOn:null,af=st.autofillCapable?!!st.autofillOn:null,v=[pk,af].filter(x=>x!==null),n=v.filter(Boolean).length;
   const col=!v.length?'#808080':n===v.length?'#5fff00':n?'#ffb000':'#ff2b3d',txt=!v.length?'Not available on this phone':n===v.length?'Both on':n?'One is on':'Both off';
   const d=document.createElement('span');d.className='pmlight';d.style.cssText='display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle;background:'+col+';box-shadow:0 0 8px '+col;d.title=txt;d.setAttribute('role','img');d.setAttribute('aria-label',txt);
   const b=pr.querySelector('b');if(b)b.prepend(d);const sm=pr.querySelector('small');if(sm)sm.textContent=txt+'. Tap to change.'}).catch(()=>{})}
 sec('Danger zone');
 B.append(pmSetRow('Erase vault','Deletes every item, folder and attachment on this phone',null,pmEraseFlow));
 const it=PM.items.filter(i=>!i.deletedDate).length;
 B.append(h('small','pmmu pmdates','Conduint Password Manager '+(typeof VER!=='undefined'?VER:'')+'\n'+it+' items · AES-256-GCM · PBKDF2-SHA256 '+(PM.hdr?PM.hdr.n.toLocaleString():'600,000')+' rounds\nCreated '+(PM.hdr&&PM.hdr.created?pmDate(PM.hdr.created):'')+'\nStrategy Over Impulse'))}
async function pmBioToggle(on){
 if(!PM.hdr)return;
 if(on===false||(on===undefined&&PM.hdr.bio)){try{await LOCK.bioForget({which:'pm'})}catch{}PM.hdr={...PM.hdr,bio:null};await pmSaveHdr(PM.hdr);toast('Fingerprint unlock is off.');if(PM.scr==='set')pmRedraw();return}
 if(!await pmBioAvail())return toast('Fingerprint is not set up on this phone.');
 try{const raw=pmB64(new Uint8Array(await crypto.subtle.exportKey('raw',PM.VK)));
  const r=await LOCK.bioWrap({which:'pm',data:raw,title:'Turn on fingerprint for Conduint Password Manager',subtitle:'Touch the sensor to confirm',cancel:'Cancel'});
  PM.hdr={...PM.hdr,bio:r.b64};await pmSaveHdr(PM.hdr);toast('Fingerprint unlock is on.')}
 catch(e){if(!e||e.code!=='CANCELLED')toast((e&&e.message)||'Fingerprint did not turn on.')}
 if(PM.scr==='set')pmRedraw()}
async function pmChangeMasterFlow(){
 const o=await pmAsk('Change master password','Enter your current master password.','Next');if(o==null)return;
 busy('Checking…');const ok=await pmVerify(o);unbusy();if(!ok)return toast('Wrong master password.');
 const a=await pmAsk('New master password','12 characters or more. There is no recovery if you forget it.','Next');if(a==null)return;
 if(a.length<12)return toast('Use at least 12 characters.');
 if(pmStrength(a).score<=1&&!await dlg({title:'Weak master password',msg:'This password is easy to guess. Use it anyway?',ok:'Use it anyway',danger:true}))return;
 const b=await pmAsk('Confirm new master password','Type it again.','Change');if(b==null)return;
 if(a!==b)return toast('The two passwords do not match.');
 busy('Changing…');try{await pmChangeMaster(o,a);unbusy();toast('Master password changed.')}catch(e){unbusy();toast('Could not change it: '+((e&&e.message)||e))}}
async function pmEraseFlow(){
 if(!await pmGuardMaster('Enter your master password to erase the vault.',true))return;
 const r=await dlg({title:'Erase the whole vault?',msg:'Every item, folder and attachment is deleted from this phone. This cannot be undone. Export a backup first if you may need anything. Type ERASE to confirm.',value:'',ok:'Erase everything',danger:true});
 if(!r||r.v!=='ERASE')return r&&toast('Not erased. You must type ERASE.');
 busy('Erasing…');
 try{await pmEraseAll();try{if(PMCR)await PMCR.clearPasswords()}catch{}try{if(PMCR){const l=((await PMCR.listPasskeys())||{}).items||[];for(const p of l)if(p.vault)await PMCR.deletePasskey({id:p.id})}}catch{}PM.lastPk=null;try{localStorage.removeItem(PMK.share)}catch{}
  PM.lastShare=null;PM.stack=[];PM.scr='setup';PM.tab='vault';unbusy();toast('Vault erased.');pmRender()}
 catch(e){unbusy();toast('Could not erase: '+((e&&e.message)||e))}}

/* [11] FOLDERS */
function pmFoldersScr(B){
 pmHead('Folders',PM.folders.length+(PM.folders.length===1?' folder':' folders'),true,[['plus','New folder',()=>pmNewFolder()]]);
 if(!PM.folders.length)B.append(h('div','pmempty','No folders yet. Tap + to make one.'));
 PM.folders.slice().sort(pmCmp).forEach(f=>{const n=PM.items.filter(i=>i.folderId===f.id&&!i.deletedDate).length;
  const r=h('div','pmit',null,h('span','pmav',null,ico('folder')),h('div','pmim',null,h('b',null,f.name),h('small',null,n+(n===1?' item':' items'))));
  const rn=h('button','ib',null,ico('edit')),dl=h('button','ib',null,ico('trash'));rn.setAttribute('aria-label','Rename');dl.setAttribute('aria-label','Delete folder');
  rn.onclick=async()=>{const x=await dlg({title:'Rename folder',value:f.name,ok:'Rename'});if(!x||!x.v)return;f.name=x.v.slice(0,100);await pmSaveFolder(f);pmRedraw()};
  dl.onclick=async()=>{const x=await dlg({title:'Delete folder?',msg:'The items inside are kept and moved to No folder.',ok:'Delete',danger:true});if(!x)return;await pmDeleteFolder(f);if(PM.flt==='f:'+f.id)PM.flt='all';pmRedraw()};
  r.append(rn,dl);B.append(r)})}

/* [12] IMPORT AND EXPORT */
async function pmImportFile(){
 const fs=await pmPickFile('',false);if(!fs.length)return;
 busy('Reading the file…');let d;
 try{d=await pmReadImport(fs[0],async msg=>{unbusy();const p=await pmAsk('Backup password',msg,'Open');busy('Reading the file…');return p})}
 catch(e){unbusy();return dlg({title:'Could not read that file',msg:(e&&e.message)||String(e),ok:'OK',nocancel:true})}
 unbusy();if(!d)return;pmImportRun(d)}
async function pmImportRun(d){
 const ok=await dlg({title:'Import from '+d.src,msg:d.items.length+' items and '+d.folders.length+' folders found. Anything already in the vault is skipped, so you can run it again safely.',ok:'Import'});if(!ok)return;
 busy('Importing…');let r;
 try{r=await pmImportData(d,d.att,n=>{$('#bp').textContent=n})}catch(e){unbusy();return toast('Import stopped: '+((e&&e.message)||e))}
 unbusy();
 const msg=[r.items+' items added',r.dups?r.dups+' already here, skipped':'',r.folders?r.folders+' new folders':'',r.atts?r.atts+' attachments':'',r.bad.length?r.bad.length+' problems:\n'+r.bad.slice(0,8).join('\n'):''].filter(Boolean).join('\n');
 await dlg({title:'Import finished',msg,ok:'OK',nocancel:true});if(PM.open&&PM.VK)pmRedraw()}
async function pmImportAuth(){
 try{
  if(typeof auLoad!=='function')throw Error('The Authenticator is not available.');
  if(typeof auLockOn==='function'&&auLockOn()&&typeof VK!=='undefined'&&!VK&&typeof vUnlock==='function'){if(!await vUnlock())return}
  await auLoad()}
 catch(e){return toast((e&&e.message)||'Could not open the Authenticator.')}
 if(AU.locked||AU.broken)return toast('Open the Authenticator and unlock it first, then try again.');
 const list=AU.list||[];if(!list.length)return toast('The Authenticator has nothing saved.');
 const r=await dlg({title:'Import from Authenticator',msg:'Copies saved passwords, notes, keys and cards into this vault as new items. Nothing in the Authenticator is changed or linked.',opts:[['no','Passwords and notes only'],['yes','Also copy 2FA codes']],val:'no',ok:'Continue'});
 if(!r)return;pmImportRun({...pmFromAuth(list,r.o==='yes'),att:new Map(),src:'Authenticator'})}
async function pmExport(kind){
 if(!await pmGuardMaster('Enter your master password to export.',true))return;
 const base='conduint-passwords-'+pmStamp();
 try{
  if(kind==='enc'){
   const a=await pmAsk('Backup password','Choose a password for this backup (8+ characters). It does not have to be your master password. Without it the file cannot be opened.','Next');if(a==null)return;
   if(a.length<8)return toast('Use at least 8 characters.');
   const b=await pmAsk('Confirm backup password','Type it again.','Back up');if(b==null)return;if(a!==b)return toast('The two passwords do not match.');
   busy('Encrypting…');let r;try{r=await pmBackupMake(a,n=>{$('#bp').textContent=n})}finally{unbusy()}
   await pmSaveBlob(base+'.cndpm',r.blob,'Backup');if(r.skipped)toast(r.skipped+' attachments could not be read and are not in the backup.');return}
  if(!await dlg({title:'Export without encryption?',msg:'The file holds every password in plain text. Anyone who gets it can read them all. Keep it somewhere safe and delete it when you are done.',ok:'Export',danger:true}))return;
  if(kind==='json')return void await pmSaveBlob(base+'.json',new Blob([pmExportJson()],{type:'application/json'}),'Export');
  if(kind==='csv')return void await pmSaveBlob(base+'.csv',new Blob([pmExportCsv()],{type:'text/csv'}),'Export');
  busy('Building zip…');let z;try{z=await pmExportZip(n=>{$('#bp').textContent=n})}finally{unbusy()}
  await pmSaveBlob(base+'.zip',z.blob,'Export');if(z.skipped)toast(z.skipped+' attachments could not be read.')}
 catch(e){toast('Export failed: '+((e&&e.message)||e))}}

/* [13] AUTOFILL SHARING AND PASSKEYS */
const pmShareList=()=>PM.items.filter(i=>!i.deletedDate&&i.type===1&&i.login.password).map(i=>({d:pmHost(pmUrl(i)),t:String(i.name||'').slice(0,80),u:String(i.login.username||'').slice(0,200),p:i.login.password})).filter(x=>x.d);
async function pmSyncShare(force){
 if(!PMCR||!PM.VK||!pmShareOn())return null;
 try{const j=JSON.stringify(pmShareList());if(!force&&j===PM.lastShare)return null;
  const r=await PMCR.syncPasswords({json:j});PM.lastShare=j;return r&&typeof r.count==='number'?r.count:null}catch{return null}}
function pmChanged(){if(!PM.VK||!pmShareOn())return;clearTimeout(PM.sct);PM.sct=setTimeout(()=>pmSyncShare(),800)}
async function pmShareToggle(){
 try{
  if(!pmShareOn()){
   const r=await dlg({title:'Share passwords with autofill?',msg:'Conduint keeps a second copy of your saved logins that have a website address, encrypted with a key in the Android Keystore, so the browser and other apps can ask for them. A password is only filled in after your fingerprint or screen lock. This copy is NOT covered by your master password.',ok:'Share'});if(!r)return;
   try{localStorage.setItem(PMK.share,'1')}catch{}
   try{localStorage.removeItem(PMK.legacy)}catch{}
   const c=await pmSyncShare(true);toast(c==null?'Sharing is on, but the list could not be sent yet.':'Sharing '+c+(c===1?' login':' logins'))}
  else{
   const r=await dlg({title:'Stop sharing?',msg:'The copy kept for autofill is erased. Your vault is not touched.',ok:'Stop and erase',danger:true});if(!r)return;
   try{localStorage.removeItem(PMK.share)}catch{}PM.lastShare=null;if(PMCR)await PMCR.clearPasswords();toast('Sharing is off and the copy is erased.')}}
 catch(e){toast((e&&e.message)||'Could not change sharing.')}
 if(PM.scr==='auto')pmRender()}
async function pmAutoScr(B){
 pmHead('Passkeys & autofill','Password Manager',true,[]);
 const tk=PM.autoTk=(PM.autoTk||0)+1;
 if(!PMCR){B.append(h('div','pmempty','Passkeys and autofill run inside the Android app.'));return}
 if(typeof pmPkSync==='function')await pmPkSync();
 let st,pk;
 try{st=(await PMCR.status())||{};pk=((await PMCR.listPasskeys())||{}).items||[]}
 catch(e){if(tk===PM.autoTk&&PM.scr==='auto')B.append(h('div','pmempty',(e&&e.message)||'Could not read the autofill status.'));return}
 if(tk!==PM.autoTk||PM.scr!=='auto')return;
 B.replaceChildren();
 const state=(on,t)=>h('small','pmst'+(on?' ok':''),(on?'\u25cf ':'\u25cb ')+t),btn=(t,f,on)=>{const b=h('button','chip pmbtn'+(on?' on':''),t);b.onclick=f;return b};
 const open=async fn=>{try{await PMCR[fn]()}catch(e){toast((e&&e.message)||'Android could not open that page.')}};
 const c1=h('div','pmsec pmpad',null,h('b',null,'Passkeys'));
 if(!st.passkeyCapable)c1.append(h('small','pmmu','Passkey providers need Android 14 or newer. This phone is on Android '+st.sdk+'.'));
 else c1.append(state(st.providerOn,st.providerOn?'Conduint is a passkey provider':'Conduint is not switched on yet'),h('small','pmmu','Pick Conduint in Android\u2019s Passwords, passkeys & accounts page. Websites and apps can then save a passkey here, and it is added to your vault as a login.'),btn(st.providerOn?'Open passkey settings':'Switch on in Android settings',()=>open('openProviderSettings'),!st.providerOn));
 const c2=h('div','pmsec pmpad',null,h('b',null,'Autofill'));
 if(!st.autofillCapable)c2.append(h('small','pmmu','Autofill needs Android 8 or newer.'));
 else c2.append(state(st.autofillOn,st.autofillOn?'Conduint is the autofill service':'Conduint is not the autofill service yet'),h('small','pmmu','After you switch it on, login boxes in the browser and other apps offer your saved logins.'),btn(st.autofillOn?'Open autofill settings':'Switch on in Android settings',()=>open('openAutofillSettings'),!st.autofillOn));
 const on=pmShareOn(),c3=h('div','pmsec pmpad',null,h('b',null,'Share saved logins with autofill'));
 c3.append(state(on,on?'Sharing is on \u00b7 '+(st.passwords||0)+' on the phone':'Sharing is off'),h('small','pmmu','Only logins that have a website address are shared ('+pmShareList().length+' now). Each one needs your fingerprint or screen lock before it is filled in.'));
 c3.append(btn(on?'Turn off and erase':'Turn on',pmShareToggle,!on));
 if(on)c3.append(btn('Send again now',async()=>{const c=await pmSyncShare(true);toast(c==null?'Could not send the list.':'Sent '+c);pmRender()}));
 const c4=h('div','pmsec pmpad',null,h('b',null,pk.length?'Passkeys on this phone ('+pk.length+')':'No passkeys saved here yet'));
 pk.forEach(p=>{const r=h('div','pmf',null,h('div','pmft',null,h('div','pmv',p.rpName||p.rp),h('small','pmfl',[p.user||p.display,p.rp,p.vault?'In vault':'Phone only',p.created?dt(p.created):''].filter(Boolean).join(' \u00b7 '))));
  const d=h('button','ib',null,ico('trash'));d.setAttribute('aria-label','Delete passkey');
  d.onclick=async()=>{const x=await dlg({title:'Delete this passkey?',msg:(p.rpName||p.rp)+(p.user?' \u00b7 '+p.user:'')+'\n'+(p.vault?'It is removed from your vault and from this phone. ':'It is removed from this phone only. ')+'The website keeps its record, so remove it there too.',ok:'Delete',danger:true});if(!x)return;
   try{if(p.vault&&typeof pmPkDrop==='function')await pmPkDrop(p.id);await PMCR.deletePasskey({id:p.id});toast('Passkey deleted')}catch(e){toast((e&&e.message)||'Could not delete it.')}pmRender()};
  r.append(h('div','pmfb',null,d));c4.append(r)});
 B.append(c1,c2,c3,c4);
 pmFbPasskeyPanel(B);
 B.append(h('small','pmmu','Passkeys in the list above use Conduint’s existing Android credential-provider service. The direct WebAuthn actions below are for a website/service that supplies registration or sign-in options and verifies the returned response. New responses are not saved automatically.'))}

/* Direct WebAuthn actions: the server must issue options and verify returned responses. Never invent a client-side challenge. */
function pmFbPasskeyPanel(B){
 const api=BRIDGE?plug('FBCredentialPlugin'):null;
 const card=h('div','pmsec pmpad'),title=h('b',null,'Create or sign in with a passkey');
 const intro=h('small','pmmu','Paste the WebAuthn options object generated by your server (either the options object itself or an object containing a publicKey field). Create and sign-in return a response that must be sent back to that same server for verification. This cannot securely register an account by itself.');
 const status=h('small','pmmu','Ready. Native passkey actions require the rebuilt Android app.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const createLabel=h('label','pmmu','Registration options JSON');
 const createInput=h('textarea','pmin pmta mono');createInput.rows=5;createInput.placeholder='Paste server-generated PublicKeyCredentialCreationOptions JSON';createInput.setAttribute('aria-label','Registration options JSON');createInput.spellcheck=false;
 const getLabel=h('label','pmmu','Sign-in options JSON');
 const getInput=h('textarea','pmin pmta mono');getInput.rows=5;getInput.placeholder='Paste server-generated PublicKeyCredentialRequestOptions JSON';getInput.setAttribute('aria-label','Sign-in options JSON');getInput.spellcheck=false;
 const outLabel=h('label','pmmu','Latest response JSON');
 const output=h('textarea','pmin pmta mono');output.rows=6;output.readOnly=true;output.placeholder='Successful responses appear here; send them to your server for verification.';output.setAttribute('aria-label','Latest passkey response JSON');
 const row=h('div','pmrow2');
 const mk=(label,fn)=>{const b=h('button','chip pmbtn',label);b.type='button';b.onclick=fn;return b};
 const copy=mk('Copy response',()=>{if(!output.value)return toast('There is no response to copy yet.');pmCopy(output.value,'Passkey response')});copy.disabled=true;
 const run=async(kind)=>{
  const isCreate=kind==='create',input=isCreate?createInput:getInput,method=isCreate?'createPasskey':'getPasskey';
  if(!api||typeof api[method]!=='function'){status.textContent='Native plugin unavailable. Rebuild and install the Android app after running the Android patch/build script.';return}
  const raw=input.value.trim();if(!raw){status.textContent='Enter the server-generated '+(isCreate?'registration':'sign-in')+' options JSON first.';input.focus();return}
  let parsed;try{parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Expected a JSON object.');if(parsed.publicKey&&typeof parsed.publicKey==='object')parsed=parsed.publicKey}catch(e){status.textContent='Invalid options JSON: '+(e.message||'Check the JSON syntax.');return}
  const buttons=[createBtn,getBtn];buttons.forEach(b=>b.disabled=true);copy.disabled=true;output.value='';status.textContent=(isCreate?'Creating passkey…':'Requesting passkey sign-in…');
  try{
   const result=await api[method]({requestJson:JSON.stringify(parsed)});
   if(!result||typeof result!=='object')throw Error('Android returned an empty response.');
   const expected=isCreate?'registrationResponseJson':'authenticationResponseJson';
   if(typeof result[expected]!=='string'||!result[expected])throw Error('Android response did not contain '+expected+'.');
   output.value=JSON.stringify(result,null,2);copy.disabled=false;
   status.textContent=(isCreate?'Passkey created.':'Passkey sign-in response received.')+' Send the response JSON to your server now; the server must verify it before granting access.';
  }catch(e){status.textContent=(isCreate?'Create passkey failed: ':'Passkey sign-in failed: ')+(e&&e.message?e.message:String(e));}
  finally{buttons.forEach(b=>b.disabled=false)}
 };
 const createBtn=mk('Create Passkey',()=>run('create'));
 const getBtn=mk('Sign In with Passkey',()=>run('get'));
 createBtn.disabled=getBtn.disabled=!api;
 row.append(createBtn,getBtn,copy);
 if(!api)status.textContent='Native plugin unavailable in this session. Install a rebuilt Android APK to use these actions.';
 card.append(title,intro,status,createLabel,createInput,getLabel,getInput,row,outLabel,output);
 B.append(card)
}
const pmFocusBack=()=>{if(!document.hidden&&PM.open&&PM.scr==='auto')pmRender()};
document.addEventListener('visibilitychange',pmFocusBack);window.addEventListener('focus',pmFocusBack);

/* Android back: closes the topmost thing in Passwords. Returns true when it used the press. */
function pmBackKey(){if(!PM.open)return false;pmBack();return true}
