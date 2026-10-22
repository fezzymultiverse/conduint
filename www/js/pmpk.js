/* pmpk.js (V0.43.7): passkeys are vault items. Loaded after pmx.js.
   A passkey saved through Android's Credential Manager is now a P-256 key made in software (native/CredStore.java), sealed on the phone
   and copied into this vault as a Login item (Bitwarden shape: login.fido2Credentials). The vault is then the truth:
     pull  = new passkeys made on the phone (even while the vault was locked) become vault items, then the phone is told the vault has them
     push  = the vault's passkeys are sent back so they can sign in while the vault is locked (fingerprint / screen lock is still asked)
   They are part of every export (.json, .zip) and the encrypted .cndpm backup, and they come back on import.
   Old Keystore passkeys (made before V0.43.7) cannot leave the Keystore, so they stay "Phone only". Strategy Over Impulse. */

const pmPkB64u=u8=>btoa(String.fromCharCode(...u8)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const pmPkUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* the id a website knows: a Conduint id is already base64url; a Bitwarden id is a GUID whose 16 bytes are the real id */
const pmPkRawId=cid=>{cid=String(cid||'');if(!pmPkUuid.test(cid))return cid;const x=cid.replace(/-/g,'');return pmPkB64u(Uint8Array.from(x.match(/../g).map(b=>parseInt(b,16))))};
const pmPkOk=c=>!!(c&&c.credentialId&&c.rpId&&c.keyValue&&(!c.keyAlgorithm||/^ecdsa$/i.test(c.keyAlgorithm))&&(!c.keyCurve||c.keyCurve==='P-256'));
const pmPkHost=u=>String(u||'').toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//,'').split(/[\/?#]/)[0].replace(/:\d+$/,'').replace(/^www\./,'');
const pmPkLive=()=>PM.items.filter(i=>i.type===1&&i.login&&!i.deletedDate);
const pmPkCreds=trash=>PM.items.filter(i=>i.type===1&&i.login&&(trash||!i.deletedDate)).flatMap(i=>(i.login.fido2Credentials||[]).filter(pmPkOk));

/* a passkey the phone made -> the vault's credential record */
const pmPkCred=r=>({credentialId:r.id,keyType:'public-key',keyAlgorithm:'ECDSA',keyCurve:'P-256',keyValue:r.priv,rpId:r.rp,rpName:r.rpName||r.rp,counter:'0',
 userHandle:r.uid||null,userName:r.user||null,userDisplayName:r.display||null,discoverable:'true',creationDate:new Date(r.created||Date.now()).toISOString()});

async function pmPkAdd(r){
 const c=pmPkCred(r),host=pmPkHost(r.rp),un=String(r.user||'').toLowerCase();
 let it=un?pmPkLive().find(i=>String(i.login.username||'').toLowerCase()===un&&(i.login.uris||[]).some(u=>{const h2=pmPkHost(u.uri);return h2&&(h2===host||h2.endsWith('.'+host))})):null;
 if(it){it.login.fido2Credentials=[...(it.login.fido2Credentials||[]),c]}
 else{it=pmBlank(1,null);it.name=String(r.rpName||r.rp).slice(0,100);it.login.uris=[{match:null,uri:'https://'+r.rp}];it.login.username=String(r.user||r.display||'').slice(0,200);it.login.fido2Credentials=[c]}
 await pmSaveItem(it,{keepHistory:true})}

async function pmPkPull(){
 const res=await PMCR.pendingPasskeys(),list=(res&&res.items)||[];if(!list.length)return 0;
 const have=new Set(pmPkCreds(true).map(c=>pmPkRawId(c.credentialId))),done=[];
 for(const r of list){if(!have.has(r.id)){await pmPkAdd(r);have.add(r.id)}done.push(r.id)}
 await PMCR.ackPasskeys({ids:done});return done.length}

async function pmPkPush(force){
 if(!PMCR||!PM.VK||PM.bad)return null; /* never mirror a vault that could not be read in full */
 const out=pmPkCreds(false).map(c=>({id:pmPkRawId(c.credentialId),rp:c.rpId,rpName:c.rpName||'',uid:c.userHandle||'',user:c.userName||'',display:c.userDisplayName||'',priv:c.keyValue,created:Date.parse(c.creationDate)||Date.now()}));
 const j=JSON.stringify(out);if(!force&&j===PM.lastPk)return null;
 const r=await PMCR.setVaultPasskeys({json:j});PM.lastPk=j;return r&&typeof r.count==='number'?r.count:null}

let pmPkBusy=false;
async function pmPkSync(force){
 if(!PMCR||!PM.VK||pmPkBusy)return;pmPkBusy=true;
 try{await pmPkPull();await pmPkPush(force)}catch{}finally{pmPkBusy=false}}

/* Passkeys & autofill screen: delete a vault passkey from the vault too */
async function pmPkDrop(id){
 for(const it of PM.items.filter(i=>i.type===1&&i.login&&(i.login.fido2Credentials||[]).length)){
  const keep=it.login.fido2Credentials.filter(c=>pmPkRawId(c.credentialId)!==id);
  if(keep.length!==it.login.fido2Credentials.length){if(keep.length)it.login.fido2Credentials=keep;else delete it.login.fido2Credentials;await pmSaveItem(it,{keepHistory:true})}}}

/* ---------- keep passkeys through normalising, export, search and view ---------- */
const _pmNormPk=pmNorm;
pmNorm=function(o){
 const it=_pmNormPk(o);
 if(it.type===1&&o&&o.login&&Array.isArray(o.login.fido2Credentials)){
  const f=o.login.fido2Credentials.filter(pmPkOk).map(c=>({credentialId:String(c.credentialId),keyType:'public-key',keyAlgorithm:'ECDSA',keyCurve:'P-256',keyValue:String(c.keyValue),rpId:String(c.rpId),rpName:String(c.rpName||c.rpId),
   counter:String(c.counter==null?'0':c.counter),userHandle:c.userHandle==null?null:String(c.userHandle),userName:c.userName==null?null:String(c.userName),userDisplayName:c.userDisplayName==null?null:String(c.userDisplayName),
   discoverable:String(c.discoverable==null?'true':c.discoverable),creationDate:c.creationDate||pmNow()}));
  if(f.length)it.login.fido2Credentials=f}
 return it};

const _pmBwItemPk=pmBwItem;
pmBwItem=function(it){
 const o=_pmBwItemPk(it);
 if(it.type===1&&it.login&&(it.login.fido2Credentials||[]).length)o.login.fido2Credentials=it.login.fido2Credentials.filter(pmPkOk).map(c=>({...c}));
 return o};

const _pmSubPk=pmSub;
pmSub=function(it){
 const s=_pmSubPk(it);
 return it.type===1&&it.login&&(it.login.fido2Credentials||[]).length?(s?s+' · ':'')+'Passkey':s};

const _pmViewScrPk=pmViewScr;
pmViewScr=function(B){
 _pmViewScrPk(B);
 const it=PM.cur;if(!it||it.type!==1||!it.login)return;
 const cs=(it.login.fido2Credentials||[]).filter(pmPkOk);if(!cs.length)return;
 const sec=B.querySelector('.pmsec');if(!sec)return;
 cs.forEach(c=>{const f=pmFld(cs.length>1?'Passkey ('+c.rpId+')':'Passkey',[c.rpId,c.userName||c.userDisplayName,c.creationDate?pmDate(c.creationDate):''].filter(Boolean).join(' · '),{copy:false});if(f)sec.append(f)})};

/* ---------- when to sync ---------- */
const _pmLoadAllPk=pmLoadAll;
pmLoadAll=async function(){const r=await _pmLoadAllPk.apply(this,arguments);setTimeout(()=>pmPkSync(),60);return r};
const _pmChangedPk=pmChanged;
pmChanged=function(){try{_pmChangedPk.apply(this,arguments)}catch{}clearTimeout(PM.pkt);PM.pkt=setTimeout(()=>pmPkSync(),900)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&PM.VK)pmPkSync()});
window.addEventListener('focus',()=>{if(PM.VK)pmPkSync()});
