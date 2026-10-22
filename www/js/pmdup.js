/* pmdup.js (V0.51.2: also vault -> Authenticator sync and the combined Sync, see the end of the file; V0.51.0): Password Manager duplicate scanner, and the Authenticator -> Password Manager sync. Loaded after pmpk.js and pmdash.js.
   DUPLICATES: logins that share a site and a user name (or, with no site, a name and a user name) are shown in groups. Nothing is merged or removed
   by itself. You pick the one to keep; the others go to the Trash (they can be restored), and anything the kept one is missing (2FA code, passkey,
   extra links, notes, files, old passwords) is copied into it first. "Not duplicates" hides a group. Exact copies can be cleared in one go.
   SYNC: accounts, codes and keys added in the Authenticator are copied into this vault as new items while the vault is open (and once when it is
   unlocked). It only ever ADDS: an item you changed or deleted in the vault is never overwritten or brought back. Passkeys the phone saved are pulled in too. */

const PMD={ign:'cnd.pm.dupign',map:'cnd.pm.authmap',to:'cnd.pm.tomap',busy:false,syncBusy:false,toBusy:false,tt:0};
const pmdIgn=()=>{try{return new Set(JSON.parse(localStorage.getItem(PMD.ign)||'[]'))}catch{return new Set()}};
const pmdIgnSave=s=>{try{localStorage.setItem(PMD.ign,JSON.stringify([...s].slice(-500)))}catch{}};
const pmdHost=u=>String(u||'').toLowerCase().trim().replace(/^[a-z][a-z0-9+.-]*:\/\//,'').split(/[\/?#]/)[0].replace(/:\d+$/,'').replace(/^www\./,'');
const pmdHosts=it=>[...new Set((it.login.uris||[]).map(u=>pmdHost(u.uri)).filter(Boolean))];
const pmdUser=it=>String(it.login.username||'').trim().toLowerCase();
const pmdTime=it=>Date.parse(it.revisionDate||it.creationDate||'')||0;

/* find groups. Union-find over live logins; two logins are linked when they share "user name + site", or "name + user name" when they have no site. */
function pmdFind(){
 const live=PM.items.filter(i=>i.type===1&&i.login&&!i.deletedDate),par=live.map((_,i)=>i),
  fd=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i]}return i},un=(a,b)=>{a=fd(a);b=fd(b);if(a!==b)par[a]=b},seen=new Map();
 live.forEach((it,i)=>{const u=pmdUser(it),hs=pmdHosts(it),keys=[];
  if(u)hs.forEach(h2=>keys.push('s|'+u+'|'+h2));
  if(u&&!hs.length&&(it.name||'').trim())keys.push('n|'+u+'|'+(it.name||'').trim().toLowerCase());
  keys.forEach(k=>{if(seen.has(k))un(i,seen.get(k));else seen.set(k,i)})});
 const by=new Map();live.forEach((it,i)=>{const r=fd(i);(by.get(r)||by.set(r,[]).get(r)).push(it)});
 const ign=pmdIgn(),out=[];
 by.forEach(items=>{if(items.length<2)return;
  const key=items.map(i=>i.id).sort().join(',');if(ign.has(key))return;
  items.sort((a,b)=>pmdTime(b)-pmdTime(a));
  const sig0=pmSig(items[0]),exact=items.every(i=>pmSig(i)===sig0),pw0=items[0].login.password||'',samePw=items.every(i=>(i.login.password||'')===pw0);
  out.push({key,items,exact,why:exact?'Exact copies':samePw?'Same site, user name and password':'Same site and user name, different passwords'})});
 out.sort((a,b)=>(b.exact-a.exact)||b.items.length-a.items.length||String(a.items[0].name).localeCompare(String(b.items[0].name)));
 return out}

/* keep one login: copy over what it lacks, then move the others to the Trash */
async function pmdKeep(keep,others){
 const L=keep.login;
 for(const o of others){const ol=o.login;
  const have=new Set((L.uris||[]).map(u=>(u.uri||'').toLowerCase()).filter(Boolean));
  L.uris=(L.uris||[]).filter(u=>u.uri);
  (ol.uris||[]).forEach(u=>{const x=(u.uri||'').toLowerCase();if(x&&!have.has(x)){L.uris.push({match:u.match==null?null:u.match,uri:u.uri});have.add(x)}});
  if(!L.uris.length)L.uris=[{match:null,uri:''}];
  if(!L.username&&ol.username)L.username=ol.username;
  if(!L.totp&&ol.totp)L.totp=ol.totp;
  if(!L.password&&ol.password)L.password=ol.password;
  else if(ol.password&&ol.password!==L.password){keep.passwordHistory=[{lastUsedDate:pmNow(),password:ol.password},...(keep.passwordHistory||[])].filter((x,i,a)=>a.findIndex(y=>y.password===x.password)===i&&x.password!==L.password).slice(0,5)}
  const f=ol.fido2Credentials||[];
  if(f.length){const ids=new Set((L.fido2Credentials||[]).map(c=>c.credentialId)),add=f.filter(c=>!ids.has(c.credentialId));if(add.length)L.fido2Credentials=(L.fido2Credentials||[]).concat(add)}
  const kn=(keep.notes||'').trim(),on=(o.notes||'').trim();if(on&&!kn.includes(on))keep.notes=kn?kn+'\n\n'+on:on;
  keep.fields=(keep.fields||[]);(o.fields||[]).forEach(x=>{if(!keep.fields.some(k=>k.name===x.name&&k.value===x.value))keep.fields.push(x)});
  if((o.attachments||[]).length){keep.attachments=(keep.attachments||[]).concat(o.attachments);o.attachments=[]}}
 /* the kept login is saved FIRST, so nothing is lost if a later step fails */
 await pmSaveItem(keep,{keepHistory:true});
 for(const o of others)await pmTrashItem(o)}

async function pmdKeepFlow(g,keep){
 const others=g.items.filter(i=>i!==keep),extra=[];
 if(others.some(o=>(o.login.totp&&!keep.login.totp)))extra.push('2FA codes');
 if(others.some(o=>(o.login.fido2Credentials||[]).length))extra.push('passkeys');
 if(others.some(o=>(o.attachments||[]).length))extra.push('files');
 const r=await dlg({title:'Keep \u201c'+(keep.name||'this login')+'\u201d?',ok:'Keep this one',danger:true,
  msg:others.length+(others.length===1?' other login goes':' other logins go')+' to the Trash, where you can restore '+(others.length===1?'it':'them')+'. Missing links, notes'+(extra.length?', '+extra.join(', '):'')+' are copied into the one you keep.'});
 if(!r)return;
 try{await pmdKeep(keep,others);toast('Kept 1, moved '+others.length+' to the Trash.')}catch(e){toast((e&&e.message)||'Could not finish. Nothing was lost.')}
 pmRedraw()}

async function pmdExactAll(){
 const gs=pmdFind().filter(g=>g.exact);if(!gs.length)return toast('No exact copies.');
 const n=gs.reduce((a,g)=>a+g.items.length-1,0);
 const r=await dlg({title:'Trash '+n+' exact cop'+(n===1?'y':'ies')+'?',ok:'Trash them',danger:true,msg:'In each group the oldest login is kept and the identical copies go to the Trash, where you can restore them.'});
 if(!r)return;let done=0;
 try{for(const g of gs){const asc=g.items.slice().sort((a,b)=>(Date.parse(a.creationDate||'')||0)-(Date.parse(b.creationDate||'')||0)),keep=asc[0];await pmdKeep(keep,asc.slice(1));done+=asc.length-1}}
 catch(e){toast((e&&e.message)||'Stopped part way. Nothing kept was changed.')}
 if(done)toast('Moved '+done+' to the Trash.');pmRedraw()}

const pmdLine=it=>{let d='';try{d=pmDate(it.revisionDate||it.creationDate)}catch{}
 return[it.login.username||'(no user name)',pmdHosts(it)[0]||'',d,it.login.totp?'2FA':'',(it.login.fido2Credentials||[]).length?'Passkey':''].filter(Boolean).join(' \u00b7 ')};

function pmDupScr(B){
 const gs=pmdFind(),n=gs.reduce((a,g)=>a+g.items.length,0),ex=gs.filter(g=>g.exact);
 pmHead('Duplicate logins',gs.length+(gs.length===1?' group':' groups'),true,[]);
 B.append(h('div','pmban'+(gs.length?'':' pmgood'),gs.length?n+' logins in '+gs.length+(gs.length===1?' group look':' groups look')+' like the same account. You choose what to keep.':'No duplicates found. Every login has its own site and user name.'));
 if(ex.length){const b=h('button','chip pmbtn','Trash exact copies ('+ex.reduce((a,g)=>a+g.items.length-1,0)+')');b.onclick=pmdExactAll;B.append(b)}
 gs.forEach(g=>{
  const card=h('div','pmdg',null,h('div','pmdgh',null,h('span',null,g.why),h('span',null,String(g.items.length))));
  g.items.forEach(it=>{
   const r=h('div','pmdr'),m=h('div','pmim',null,h('b',null,it.name||'(no name)'),h('small',null,pmdLine(it)));
   m.onclick=()=>pmOpenItem(it);
   const k=h('button','chip','Keep');k.setAttribute('aria-label','Keep '+(it.name||'this login'));k.onclick=()=>pmdKeepFlow(g,it);
   try{r.append(pmAv(it))}catch{}r.append(m,k);card.append(r)});
  const nd=h('button','pmdn','Not duplicates \u2013 hide this group');nd.onclick=()=>{const s=pmdIgn();s.add(g.key);pmdIgnSave(s);pmRedraw()};card.append(nd);
  B.append(card)});
 if(gs.length&&pmdIgn().size){const rs=h('button','chip pmbtn','Show hidden groups again');rs.onclick=()=>{pmdIgnSave(new Set());pmRedraw()};B.append(rs)}
 B.append(h('small','pmmu','Two logins are a group when they share a user name and a site (or, with no site, a name and a user name). Logins with a different user name on the same site are never grouped. Nothing is removed by itself.'))}

/* the Reports tab gets a Duplicate logins row; the list screen for it is the scanner */
if(typeof PM_REP!=='undefined'&&!PM_REP.some(r=>r[0]==='dups'))PM_REP.push(['dups','Duplicate logins','The same account saved more than once. You choose which to keep.']);
{const _ph=pmHealth;pmHealth=function(){const H=_ph.apply(this,arguments);try{H.dups=pmdFind()}catch{H.dups=[]}return H}}
{const _hl=pmHlistScr;pmHlistScr=function(B){if(PM.hk==='dups')return pmDupScr(B);return _hl.apply(this,arguments)}}

/* ---------- Authenticator -> Password Manager ---------- */
const pmasOn=()=>S.settings.authToPm!==false;
const pmasLoad=()=>{try{const m=JSON.parse(localStorage.getItem(PMD.map)||'{}');return m&&typeof m==='object'?m:{}}catch{return{}}};
const pmasSave=m=>{try{localStorage.setItem(PMD.map,JSON.stringify(m))}catch{}};
async function pmasHash(s){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join('')}
/* the identity of an Authenticator entry. A 2FA entry is its secret; a password entry is its site and name; the rest is its content. Only a hash is kept, never the secret. */
const pmasKey=a=>{const t=a.type||'totp';
 if(t==='totp')return pmasHash(JSON.stringify([t,String(a.secret||'').replace(/\s/g,'').toUpperCase()||[a.issuer,a.name,a.email]]));
 if(t==='pass')return pmasHash(JSON.stringify([t,a.issuer||'',a.name||'',a.email||'',a.link||'']));
 return pmasHash(JSON.stringify([t,a.issuer||'',a.name||'',a.email||'',a.link||'',a.note||'',a.codes||'',a.pubkey||'',a.privkey||'',a.secret||'',(typeof auxItemsSafe==='function'?auxItemsSafe(a):[]).map(x=>[x.t,x.v].join(':'))]))};

async function pmAuSync(manual){
 if(PMD.syncBusy)return null;if(!manual&&!pmasOn())return null;
 if(!PM.VK||PM.bad||typeof AU==='undefined'||typeof pmFromAuth!=='function')return null;
 PMD.syncBusy=true;
 try{
  if(!AU.ready&&!AU.edit&&typeof auLoad==='function'){try{await auLoad();if(!AU.locked&&!AU.broken)AU.ready=true}catch{}}
  if(AU.locked||AU.broken||!Array.isArray(AU.list))return manual?{added:0,adopted:0,total:0,blocked:true}:null;
  const map=pmasLoad(),have=new Map(PM.items.filter(i=>!i.deletedDate).map(i=>[pmSig(i),i]));
  let added=0,adopted=0,dirty=false;
  for(const a of AU.list.slice()){
   const k=await pmasKey(a);if(map[k])continue;/* already copied once: never overwrite or bring back what you changed or deleted */
   const made=pmFromAuth([a],true).items;if(!made.length){continue}
   const ids=[];
   for(const raw of made){
    const it=pmNorm(raw),ex=have.get(pmSig(it));
    if(ex){ids.push(ex.id);adopted++;continue}
    await pmSaveItem(it,{keepHistory:true});have.set(pmSig(it),it);ids.push(it.id);added++}
   map[k]=ids[0];dirty=true;
   if(dirty&&(added+adopted)%20===0)pmasSave(map)}
  if(dirty)pmasSave(map);
  try{if(typeof pmPkSync==='function')await pmPkSync()}catch{}/* passkeys the phone saved come along too */
  return{added,adopted,total:AU.list.length}}
 catch(e){return manual?{error:(e&&e.message)||String(e),added:0,adopted:0,total:0}:null}
 finally{PMD.syncBusy=false}}
const pmasMsg=r=>!r?'Could not sync.':r.error?r.error:r.blocked?'Open the Authenticator and unlock it first.':r.added?'Copied '+r.added+' new item'+(r.added===1?'':'s')+' from the Authenticator.':'Already up to date ('+r.total+' in the Authenticator).';

/* run it after every Authenticator save, once when the vault unlocks, and when the app comes back */
{const _s=auSave;auSave=async function(){const r=await _s.apply(this,arguments);setTimeout(()=>{pmAuSync().then(x=>{if(x&&x.added)toast('Copied '+x.added+' new to the Password Manager.')}).catch(()=>{})},500);return r}}
{const _l=pmLoadAll;pmLoadAll=async function(){const r=await _l.apply(this,arguments);setTimeout(()=>{pmAuSync().then(x=>{if(x&&x.added)toast('Copied '+x.added+' new from the Authenticator.')}).catch(()=>{})},1500);return r}}
{const _e=pmEraseAll;pmEraseAll=async function(){const r=await _e.apply(this,arguments);try{localStorage.removeItem(PMD.map);localStorage.removeItem(PMD.ign)}catch{}return r}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&PM.VK)setTimeout(()=>pmAuSync().catch(()=>{}),800)});

/* ---------- V0.51.2: Password Manager -> Authenticator (the bare one-time password box + Authenticator (TOTP) fields), and one Sync button for both ways ---------- */
const pmToOn=()=>S.settings.pmToAuth!==false;
const pmToLoad=()=>{try{const m=JSON.parse(localStorage.getItem(PMD.to)||'{}');return m&&typeof m==='object'?m:{}}catch{return{}}};
const pmToSave=m=>{try{localStorage.setItem(PMD.to,JSON.stringify(m))}catch{}};
const pmNormSecret=s=>String(s||'').replace(/[\s=-]/g,'').toUpperCase();
/* every one-time password key an item holds: a login's One-time password box and a Secure note's Authenticator key (a bare Base32 key or an otpauth:// link), and any custom field of type Authenticator (TOTP) */
function pmTotpSources(it){
 const out=[];if(!it||it.deletedDate)return out;
 if(it.type===1&&it.login&&String(it.login.totp||'').trim())out.push({raw:String(it.login.totp).trim(),label:''});
 if(it.type===2&&String(it.totp||'').trim())out.push({raw:String(it.totp).trim(),label:''});/* the Authenticator key on a Secure note (pmx.js) */
 (it.fields||[]).forEach(f=>{if(f&&f.type===3&&String(f.value||'').trim())out.push({raw:String(f.value).trim(),label:String(f.name||'').trim()})});
 return out}
const pmHasTotp=it=>pmTotpSources(it).length>0;
async function pmasReady(){
 if(!PM.VK||PM.bad||typeof AU==='undefined')return false;
 if(!AU.ready&&!AU.edit&&typeof auLoad==='function'){try{await auLoad();if(!AU.locked&&!AU.broken)AU.ready=true}catch{}}
 return!(AU.locked||AU.broken||!Array.isArray(AU.list))}
/* vault -> Authenticator. Add-only, same as the other way: a code you deleted from the Authenticator is never brought back, and nothing already there is changed. */
async function pmToAuSync(manual){
 if(PMD.toBusy||PMD.syncBusy)return null;if(!manual&&!pmToOn())return null;
 if(!PM.VK||PM.bad||typeof AU==='undefined'||typeof auSave!=='function'||typeof pmTotpParse!=='function')return null;
 PMD.toBusy=true;
 try{
  if(!await pmasReady())return manual?{added:0,total:0,blocked:true}:null;
  const have=new Set(AU.list.filter(a=>(a.type||'totp')==='totp').map(a=>pmNormSecret(a.secret))),seenTo=pmToLoad(),back=pmasLoad(),fresh=[];let total=0;
  for(const it of PM.items.slice()){
   const src=pmTotpSources(it);
   for(const x of src){
    let sp;try{sp=pmTotpParse(x.raw)}catch{continue}
    if(!sp||sp.steam)continue;
    const sec=pmNormSecret(sp.secret);if(!sec)continue;
    try{pmUnB32(sec)}catch{continue}
    total++;
    const k=await pmasHash('to|'+sec);
    if(have.has(sec)){seenTo[k]=1;continue}
    if(seenTo[k])continue;/* already copied once, then you removed it: leave it removed */
    const host=it.login?(pmdHosts(it)[0]||''):'',a={type:'totp',issuer:(it.name||'').trim()||'Account',name:((it.login&&it.login.username)||'').trim()||x.label,fullname:'',email:'',secret:sec,digits:sp.digits||6,period:sp.period||30,algo:sp.algo||'SHA1',link:(host&&typeof auDomain==='function'&&auDomain(host))?host:''};
    try{if(typeof auCode==='function')await auCode(a)}catch{continue}
    fresh.push(a);have.add(sec);seenTo[k]=1;
    back[await pmasKey(a)]=it.id}/* mark it as copied so the Authenticator -> vault sync does not copy it straight back */
  }
  if(fresh.length){
   const n0=AU.list.length;fresh.forEach(a=>AU.list.push(a));
   try{await auSave()}catch(e){AU.list.length=n0;return manual?{error:(e&&e.message)||String(e),added:0,total}:null}
   pmasSave(back)}
  pmToSave(seenTo);
  return{added:fresh.length,total}}
 catch(e){return manual?{error:(e&&e.message)||String(e),added:0,total:0}:null}
 finally{PMD.toBusy=false}}
const pmToMsg=r=>!r?'':r.error?r.error:r.blocked?'Open the Authenticator and unlock it first.':r.added?'Copied '+r.added+' code'+(r.added===1?'':'s')+' to the Authenticator.':'';

/* one Sync: Authenticator -> vault, then vault -> Authenticator. Returns the text to show. */
async function pmSyncBoth(manual){
 const a=await pmAuSync(manual),b=await pmToAuSync(manual);
 if(manual&&!PM.VK)return'Unlock the Password Manager first.';
 const bits=[];
 if(a&&a.error)return a.error;if(b&&b.error)return b.error;
 if((a&&a.blocked)||(b&&b.blocked))return'Open the Authenticator and unlock it first.';
 if(a&&a.added)bits.push(a.added+' to the Password Manager');
 if(b&&b.added)bits.push(b.added+' to the Authenticator');
 if(bits.length)return'Copied '+bits.join(' and ')+'.';
 return a?'Already up to date ('+a.total+' in the Authenticator).':'Could not sync.'}

/* run it when a vault item with a key is saved, when the vault unlocks, and when the app comes back */
{const _s=pmSaveItem;pmSaveItem=async function(it){const r=await _s.apply(this,arguments);
 try{if(!PMD.toBusy&&pmToOn()&&pmHasTotp(it)){clearTimeout(PMD.tt);PMD.tt=setTimeout(()=>{pmToAuSync().then(x=>{if(x&&x.added)toast('Copied '+x.added+' code'+(x.added===1?'':'s')+' to the Authenticator.')}).catch(()=>{})},600)}}catch{}
 return r}}
{const _l=pmLoadAll;pmLoadAll=async function(){const r=await _l.apply(this,arguments);setTimeout(()=>{pmToAuSync().then(x=>{if(x&&x.added)toast('Copied '+x.added+' code'+(x.added===1?'':'s')+' to the Authenticator.')}).catch(()=>{})},2500);return r}}
{const _e=pmEraseAll;pmEraseAll=async function(){const r=await _e.apply(this,arguments);try{localStorage.removeItem(PMD.to)}catch{}return r}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&PM.VK)setTimeout(()=>pmToAuSync().catch(()=>{}),1200)});

/* the Passwords dashboard cloud button: Sync is the first thing in it, and it works without Android autofill */
pmSyncMenu=function(e){
 const[x,y]=pmPos(e),on=pmShareOn(),lb=pmLS(PMK_BK,0);
 menu(x,y,[
  ['Sync now  \u00b7  Authenticator and vault',async()=>{toast('Syncing\u2026');let m;try{m=await pmSyncBoth(true)}catch(er){m=(er&&er.message)||'Could not sync.'}
   if(on){try{const c=await pmSyncShare(true);if(c!=null)m+=' Autofill: '+c+(c===1?' login.':' logins.')}catch{}}
   toast(m);if(PM.scr==='dash')pmRedraw()}],
  ['Back up now (encrypted)  \u00b7  '+pmAgo(lb),()=>pmExport('enc')],
  [on?'Sync to autofill now':'Turn on autofill sync',async()=>{if(on){const c=await pmSyncShare(true);toast(c==null?(PMCR?'Could not sync yet.':'Autofill sync runs in the Android app.'):'Synced '+c+(c===1?' login':' logins'))}else{await pmShareToggle();if(PM.scr==='dash')pmRedraw()}}],
  ...(on?[['Turn off autofill sync',async()=>{await pmShareToggle();if(PM.scr==='dash')pmRedraw()}]]:[]),
  ['hr'],
  ['Import from a file',()=>pmImportFile()],
  ['More in Settings',()=>pmTab('set')]])};

/* Password Manager > Settings rows (called from pmSetScr) */
function pmAuSyncRow(B){
 const on=pmasOn(),to=pmToOn();
 B.append(pmSetRow('Keep Authenticator in this vault',on?'New accounts, codes, notes and keys added in the Authenticator are copied here. Nothing you change here is overwritten.':'Off. Turn on to copy new Authenticator accounts into this vault.',on?'On':'Off',async()=>{
  S.settings.authToPm=!on;save();
  if(!on){const r=await pmAuSync(true);toast(pmasMsg(r))}
  pmRedraw()}));
 B.append(pmSetRow('Keep vault codes in the Authenticator',to?'A key typed in a login\u2019s One-time password box (a plain Base32 key or an otpauth:// link), or in an Authenticator (TOTP) field, is copied to the Authenticator.':'Off. Turn on to copy one-time password keys from this vault into the Authenticator.',to?'On':'Off',async()=>{
  S.settings.pmToAuth=!to;save();
  if(!to){const r=await pmToAuSync(true);toast(pmToMsg(r)||'Already up to date.')}
  pmRedraw()}));
 B.append(pmSetRow('Sync now','Copies anything new both ways right now, and pulls in passkeys saved on this phone',null,async()=>{toast('Syncing\u2026');let m;try{m=await pmSyncBoth(true)}catch(er){m=(er&&er.message)||'Could not sync.'}toast(m);pmRedraw()}))}
