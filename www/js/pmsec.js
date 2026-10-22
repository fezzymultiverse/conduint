/* pmsec.js: Conduint Passwords unlock and recovery (V0.35.0). Loaded after pmui.js.
   Ways in:  master password (pm.js)  ·  fingerprint (pmui.js)  ·  PIN  ·  backup codes  ·  optional authenticator step (TOTP).
   How each one works, so nothing here is a surprise:
   - PIN: 4 to 8 digits. The vault key is wrapped with a key made from the PIN AND a secret that lives only in this phone's Keystore
     (LOCK.deviceSecret), so a copied vault file cannot be brute-forced elsewhere. Five wrong tries delete the PIN (master password still works).
   - Backup codes: 10 single-use codes of 12 letters and numbers. Each one wraps the vault key on its own. A used code is deleted. Using one
     opens the vault and asks for a NEW master password. They also skip the authenticator step, because they are the way back in.
   - Authenticator step: after any unlock the vault asks for a 6-digit code. The secret is stored INSIDE the encrypted vault. It is a second
     lock on the app: it stops someone who learns your master password or PIN but has no authenticator. It cannot protect a copy of the vault
     file (that is protected by the master password alone).
   Strategy Over Impulse. */
const PM_CODE_A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',PM_REC_ITER=150000,PM_PIN_ITER=250000;
const pmB32Enc=u=>{let bits='',o='';for(const b of u)bits+=b.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5)o+=PM_B32[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return o};
const pmCodeNorm=s=>String(s||'').toUpperCase().replace(/[^A-Z2-9]/g,'');
const pmCodeFmt=c=>c.slice(0,4)+'-'+c.slice(4,8)+'-'+c.slice(8);
const pmDev=async()=>{try{if(LOCK&&LOCK.deviceSecret)return(await LOCK.deviceSecret()).b64}catch{}return''};
const pmHasCodes=()=>!!(PM.hdr&&PM.hdr.rec&&PM.hdr.rec.list&&PM.hdr.rec.list.length);
const pmTfaOn=()=>!!(PM.sec&&PM.sec.totp);

/* ---------- screens: hook into the existing render, lock and unlock functions ---------- */
const _pmRender=pmRender;
pmRender=function(){
 if(PM.tfaPend&&PM.VK){clearInterval(PM.tm);const B=$('#pml');B.replaceChildren();B.scrollTop=0;$('#pmnav').style.display='none';pmTfaScr(B);return}
 if(PM.scr!=='codes')PM.codes=null;
 if(PM.scr!=='tfasetup')PM.tfaDraft=null;
 if(PM.VK&&PM.scr==='codes'&&PM.codes){clearInterval(PM.tm);const B=$('#pml');B.replaceChildren();B.scrollTop=0;$('#pmnav').style.display='none';pmCodesScr(B);return}
 if(PM.VK&&PM.scr==='tfasetup'&&PM.tfaDraft){clearInterval(PM.tm);const B=$('#pml');B.replaceChildren();B.scrollTop=0;$('#pmnav').style.display='none';pmTfaSetupScr(B);return}
 return _pmRender.apply(this,arguments)};
const _pmLock=pmLock;
pmLock=function(){PM.tfaPend=false;PM.tfaOk=false;PM.tfaFail=0;PM.sec=null;PM.codes=null;PM.tfaDraft=null;return _pmLock.apply(this,arguments)};
const _pmAfterUnlock=pmAfterUnlock;
pmAfterUnlock=async function(){
 if(pmTfaOn()&&!PM.tfaOk){PM.tfaPend=true;pmRender();return}
 PM.tfaPend=false;return _pmAfterUnlock.apply(this,arguments)};

/* ---------- lock screen extras (called from pmLockScr) ---------- */
const pmLockNote=()=>(pmHasCodes()||(PM.hdr&&PM.hdr.mail&&PM.hdr.mail.w))?'Forgot the master password? Use a backup code or your email recovery key.':'No recovery exists. If the master password is forgotten the vault cannot be opened, because only you hold the key. Make backup codes in Settings once you are in.';
function pmLockExtras(c,msg){
 const hd=PM.hdr;if(!hd)return;
 const row=h('div','pmrow2 pmwrap');
 if(hd.pin){const b=h('button','chip pmbtn',null,ico('lock'),h('span',null,' Use PIN'));b.onclick=()=>pmPinUnlock(msg);row.append(b)}
 if(pmHasCodes()){const b=h('button','chip pmbtn','Use a backup code');b.onclick=()=>pmUseCode(msg);row.append(b)}
 if(row.children.length)c.append(row)}

/* ---------- settings rows (called from pmSetScr) ---------- */
function pmSecRows(B){
 B.append(h('small','pmsech2','Unlock and recovery'));
 const pin=!!(PM.hdr&&PM.hdr.pin),n=((PM.hdr&&PM.hdr.rec&&PM.hdr.rec.list)||[]).length,tf=pmTfaOn();
 B.append(pmSetRow('Unlock with PIN',pin?'On. 4 to 8 digits, works on this phone only':'4 to 8 digits. Five wrong tries remove it',pmSwitch(pin),()=>pin?pmPinOff():pmPinSet()));
 B.append(pmSetRow('Backup codes',n?n+(n===1?' code':' codes')+' left. Each works once.':'None yet. Your way back in if you forget the master password.',n?String(n):null,pmCodesMenu));
 B.append(pmSetRow('Authenticator step (TOTP)',tf?'On. A 6-digit code is asked after every unlock':'Ask for a 6-digit code after every unlock',pmSwitch(tf),()=>tf?pmTfaOff():pmTfaSetup()));
 B.append(h('small','pmmu','Master password, fingerprint and PIN each open the vault. Backup codes open it when all of those fail. The authenticator step adds a code after any of them (backup codes skip it).'))}

/* ---------- PIN ---------- */
async function pmPinKey(pin,dev,salt,n){
 const b=await crypto.subtle.importKey('raw',pmTe.encode(String(pin)+'|'+dev),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:n},b,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey'])}
async function pmPinAsk(title,msg,ok){
 const I=$('#di');
 for(;;){I.inputMode='numeric';let v;try{v=await pmAsk(title,msg,ok)}finally{I.inputMode=''}
  if(v==null)return null;if(/^\d{4,8}$/.test(v))return v;toast('Use 4 to 8 digits.')}}
async function pmPinSet(){
 if(!PM.VK)return;
 if(!await pmGuardMaster('Enter your master password to set a PIN.',true))return;
 const a=await pmPinAsk('Choose a PIN','4 to 8 digits. It opens the vault on this phone only. Five wrong tries remove it, then you need the master password.','Next');if(a==null)return;
 const b=await pmPinAsk('Confirm PIN','Type the same PIN again.','Save');if(b==null)return;
 if(a!==b)return toast('The two PINs do not match.');
 busy('Saving PIN…');
 try{const dev=await pmDev(),salt=pmRnd(16),iv=pmRnd(12),k=await pmPinKey(a,dev,salt,PM_PIN_ITER),w=await crypto.subtle.wrapKey('raw',PM.VK,k,{name:'AES-GCM',iv});
  PM.hdr={...PM.hdr,pin:{s:pmB64(salt),i:pmB64(iv),w:pmB64(new Uint8Array(w)),n:PM_PIN_ITER,d:dev?1:0,f:0}};await pmSaveHdr(PM.hdr);unbusy();toast('PIN is on.')}
 catch(e){unbusy();toast('Could not save the PIN: '+((e&&e.message)||e))}
 if(PM.scr==='set')pmRedraw()}
async function pmPinOff(){
 if(!await pmGuardMaster('Enter your master password to turn the PIN off.',true))return;
 PM.hdr={...PM.hdr,pin:null};await pmSaveHdr(PM.hdr);toast('PIN is off.');if(PM.scr==='set')pmRedraw()}
async function pmPinUnlock(msg){
 const pn=PM.hdr&&PM.hdr.pin;if(!pn)return;
 const v=await pmPinAsk('PIN','Enter your PIN.','Unlock');if(v==null)return;
 busy('Unlocking…');
 let vk=null,why='';
 try{
  const dev=await pmDev();
  if(pn.d&&!dev)why='This phone\u2019s secure key is not available. Use your master password.';
  else{const k=await pmPinKey(v,dev,pmUnB64(pn.s),pn.n);
   vk=await crypto.subtle.unwrapKey('raw',pmUnB64(pn.w),k,{name:'AES-GCM',iv:pmUnB64(pn.i)},{name:'AES-GCM'},true,['encrypt','decrypt'])}}
 catch{vk=null}
 unbusy();
 if(!vk){
  if(why){msg.textContent=why;return}
  const f=(pn.f||0)+1;
  if(f>=5){PM.hdr={...PM.hdr,pin:null};await pmSaveHdr(PM.hdr);toast('Wrong PIN five times. The PIN was removed. Use your master password.');pmRender();return}
  PM.hdr={...PM.hdr,pin:{...pn,f}};await pmSaveHdr(PM.hdr);
  msg.textContent='Wrong PIN. '+(5-f)+(5-f===1?' try':' tries')+' left before the PIN is removed.';return}
 try{PM.VK=vk;await pmLoadAll()}catch(e){PM.VK=null;msg.textContent='Could not open the vault: '+((e&&e.message)||e);return}
 if(pn.f){PM.hdr={...PM.hdr,pin:{...pn,f:0}};await pmSaveHdr(PM.hdr)}
 PM.verified=0;await pmAfterUnlock()}

/* ---------- backup codes ---------- */
async function pmMakeCodes(noGuard){
 if(!PM.VK)return;
 if(!noGuard&&!await pmGuardMaster('Enter your master password to make backup codes.',true))return;
 busy('Making codes…');
 try{
  const codes=[],list=[];
  for(let i=0;i<10;i++){const r=pmRnd(12);let c='';for(const b of r)c+=PM_CODE_A[b&31];codes.push(c);list.push({id:pmId().slice(0,8),...await pmWrap(PM.VK,c,PM.hdr.email,PM_REC_ITER)})}
  PM.hdr={...PM.hdr,rec:{list,made:Date.now()}};await pmSaveHdr(PM.hdr);
  unbusy();PM.codes=codes;pmGo('codes')}
 catch(e){unbusy();toast('Could not make the codes: '+((e&&e.message)||e))}}
function pmCodesScr(B){
 pmHead('Backup codes','Password Manager',true,[]);
 const cs=PM.codes||[],c=h('div','pmc');
 const txt='Conduint Password Manager backup codes ('+(PM.hdr?PM.hdr.email:'')+')\nEach code works once.\n\n'+cs.map(pmCodeFmt).join('\n')+'\n';
 c.append(h('b','pmh1','Save these 10 codes now'),
  h('small','pmmu','Each code works once. Any one of them opens the vault if you forget the master password, and skips the authenticator step. They are shown only now: once you leave this screen they cannot be seen again. Keep them off this phone.'));
 const box=h('div','pmcodes');cs.forEach(x=>box.append(h('div','pmcode',pmCodeFmt(x))));
 const cp=h('button','chip on pmbtn','Copy all');cp.onclick=()=>pmCopy(txt,'Backup codes');
 const sv=h('button','chip pmbtn','Save as .txt (NOT encrypted)');sv.onclick=async()=>{try{await pmSaveBlob('conduint-passwords-backup-codes.txt',new Blob([txt],{type:'text/plain'}),'Backup codes')}catch(e){toast((e&&e.message)||'Could not save the file.')}};
 const dn=h('button','chip pmbtn','I saved them');dn.onclick=()=>pmBack();
 c.append(box,cp,sv,dn);B.append(c)}
async function pmCodesMenu(){
 if(!pmHasCodes())return pmMakeCodes();
 const r=await dlg({title:'Backup codes',opts:[['new','Make 10 new codes (the old ones stop working)'],['off','Delete all backup codes']],val:'new',ok:'Continue'});
 if(!r||r.o==null)return;
 if(r.o==='new')return pmMakeCodes();
 if(pmTfaOn()&&!await dlg({title:'Delete the codes?',msg:'The authenticator step is on. If you lose your authenticator you could be locked out with no way back in.',ok:'Delete anyway',danger:true}))return;
 if(!await pmGuardMaster('Enter your master password to delete the backup codes.',true))return;
 PM.hdr={...PM.hdr,rec:null};await pmSaveHdr(PM.hdr);toast('Backup codes deleted.');if(PM.scr==='set')pmRedraw()}
/* tries every stored code; returns {vk, hit} or null. A code is 12 letters and numbers. */
async function pmTryCode(text){
 const code=pmCodeNorm(text),list=(PM.hdr.rec&&PM.hdr.rec.list)||[];
 if(code.length!==12)return null;
 for(let i=0;i<list.length;i++){
  try{const vk=await pmUnwrap({email:PM.hdr.email,s:list[i].s,i:list[i].i,w:list[i].w,n:list[i].n},code);return{vk,hit:i}}catch{}}
 return null}
async function pmSpendCode(hit){
 const list=PM.hdr.rec.list.filter((_,i)=>i!==hit);
 PM.hdr={...PM.hdr,rec:list.length?{...PM.hdr.rec,list}:null};await pmSaveHdr(PM.hdr)}
async function pmUseCode(msg){
 const f=pmFail(),w=Math.ceil(((f&&f.until)-Date.now())/1000);
 if(w>0){msg.textContent='Too many wrong tries. Wait '+w+' s.';return}
 const t=await pmAsk('Backup code','Type one of your backup codes.','Unlock',{plain:true});if(t==null)return;
 busy('Checking the code…');const r=await pmTryCode(t);unbusy();
 if(!r){const fl=pmFail(1);msg.textContent=fl.until>Date.now()?'Wrong code. Wait '+Math.ceil((fl.until-Date.now())/1000)+' s.':'That code is wrong or already used. '+(5-fl.n)+' tries before a wait.';return}
 pmFail(0);
 try{PM.VK=r.vk;await pmLoadAll()}catch(e){PM.VK=null;msg.textContent='Could not open the vault: '+((e&&e.message)||e);return}
 await pmSpendCode(r.hit);
 PM.tfaOk=true;PM.verified=0;
 toast('Backup code accepted. It cannot be used again.');
 await pmForceMaster();
 await pmAfterUnlock()}
async function pmForceMaster(){
 for(;;){
  const a=await pmAsk('Choose a new master password','You got in with a backup code, so set a new master password now. 12 characters or more.','Next');
  if(a==null){if(await dlg({title:'Keep the old master password?',msg:'The vault is open now, but the old master password is still the one that unlocks it.',ok:'Skip',danger:true}))return;continue}
  if(a.length<12){toast('Use at least 12 characters.');continue}
  if(pmStrength(a).score<=1&&!await dlg({title:'Weak master password',msg:'This password is easy to guess. Use it anyway?',ok:'Use it anyway',danger:true}))continue;
  const b=await pmAsk('Confirm new master password','Type it again.','Save');if(b==null)continue;
  if(a!==b){toast('The two passwords do not match.');continue}
  busy('Saving…');
  try{const w=await pmWrap(PM.VK,a,PM.hdr.email,PMITER);PM.hdr={...PM.hdr,...w};await pmSaveHdr(PM.hdr);unbusy();toast('New master password saved.');return}
  catch(e){unbusy();toast('Could not save it: '+((e&&e.message)||e))}}}
/* after first-time setup: the one thing worth asking for straight away */
async function pmOfferRecovery(){
 const r=await dlg({title:'Make backup codes?',msg:'Without them, a forgotten master password cannot be recovered. It takes ten seconds.',ok:'Make codes'});
 if(r)await pmMakeCodes(true)}

/* ---------- authenticator step (TOTP) ---------- */
async function pmTotpOk(sp,code){
 const c=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(c))return false;
 const now=Date.now();for(const d of[-1,0,1]){if(await pmTotpCode(sp,now+d*sp.period*1000)===c)return true}return false}
async function pmTfaSetup(){
 if(!PM.VK)return;
 if(!pmHasCodes()&&!(PM.hdr&&PM.hdr.mail&&PM.hdr.mail.w)){
  const r=await dlg({title:'Make backup codes first',msg:'If you lose your authenticator you could be locked out of this vault. Backup codes are your way back in.',ok:'Make codes'});
  if(!r)return;return pmMakeCodes()}
 if(!await pmGuardMaster('Enter your master password to set up the authenticator step.',true))return;
 PM.tfaDraft={secret:pmB32Enc(pmRnd(20))};pmGo('tfasetup')}
function pmTfaSetupScr(B){
 pmHead('Authenticator step','Password Manager',true,[]);
 const d=PM.tfaDraft,c=h('div','pmc'),sk=d.secret.match(/.{1,4}/g).join(' ');
 const link='otpauth://totp/'+encodeURIComponent('Conduint Password Manager:'+PM.hdr.email)+'?secret='+d.secret+'&issuer='+encodeURIComponent('Conduint Password Manager');
 c.append(h('b','pmh1','Add this vault to your authenticator'),
  h('small','pmmu','1. In your authenticator app (for example the Conduint Authenticator) add an account by key or by link.\n2. Type the 6-digit code it shows below.\n\nAfter that, every unlock asks for a code. Backup codes skip it.'),
  h('div','pmcode pmkey',sk));
 const ck=h('button','chip pmbtn','Copy setup key');ck.onclick=()=>pmCopy(d.secret,'Setup key');
 const cl=h('button','chip pmbtn','Copy setup link');cl.onclick=()=>pmCopy(link,'Setup link');
 const inp=h('input','pmin');inp.inputMode='numeric';inp.maxLength=7;inp.placeholder='6-digit code from your authenticator';inp.autocomplete='one-time-code';
 const msg=h('small','pmmsg',''),go=h('button','chip on pmbtn','Turn on');
 go.onclick=async()=>{
  const sp={secret:d.secret,digits:6,period:30,algo:'SHA1'};
  if(!await pmTotpOk(sp,inp.value)){msg.textContent='That code does not match. Check the phone clock and try the next code.';return}
  busy('Saving…');
  try{await pmPut({id:'sec',totp:sp},'s');PM.sec={id:'sec',totp:sp};PM.tfaOk=true;PM.tfaDraft=null;unbusy();toast('Authenticator step is on.');pmBack()}
  catch(e){unbusy();msg.textContent='Could not save it: '+((e&&e.message)||e)}};
 c.append(ck,cl,inp,msg,go,h('small','pmmu','This is a second lock on the app. It stops someone who learns your master password or PIN but has no authenticator. It cannot protect a copy of the vault file: only the master password protects that.'));
 B.append(c)}
async function pmTfaOff(){
 if(!await pmGuardMaster('Enter your master password to turn the authenticator step off.',true))return;
 try{await pmPut({id:'sec',totp:null},'s');PM.sec={id:'sec',totp:null};toast('Authenticator step is off.');if(PM.scr==='set')pmRedraw()}
 catch(e){toast('Could not turn it off: '+((e&&e.message)||e))}}
/* the second step shown right after an unlock; the vault key is in memory but nothing is drawn until the code is right */
function pmTfaScr(B){
 pmHead('Conduint Password Manager','Second step',false,[]);
 const c=h('div','pmc');
 c.append(h('div','pmbig',null,ico('shield')),h('b','pmh1','Enter your authenticator code'),h('small','pmmu','Open the authenticator app this vault was added to and type the 6-digit code.'));
 const inp=h('input','pmin');inp.inputMode='numeric';inp.maxLength=7;inp.placeholder='123 456';inp.autocomplete='one-time-code';
 const msg=h('small','pmmsg',''),go=h('button','chip on pmbtn','Verify');
 const pass=async()=>{PM.tfaFail=0;PM.tfaOk=true;PM.tfaPend=false;await _pmAfterUnlock()};
 const run=async()=>{
  if(!PM.sec||!PM.sec.totp)return pass();
  if(!await pmTotpOk(PM.sec.totp,inp.value)){
   PM.tfaFail=(PM.tfaFail||0)+1;inp.value='';
   if(PM.tfaFail>=5){pmLock(true);toast('Too many wrong codes. The vault is locked.');return}
   msg.textContent='Wrong code. '+(5-PM.tfaFail)+(5-PM.tfaFail===1?' try':' tries')+' left.';return}
  await pass()};
 go.onclick=run;inp.onkeydown=e=>{if(e.key==='Enter')run()};
 const row=h('div','pmrow2 pmwrap');
 if(pmHasCodes()){const b=h('button','chip pmbtn','Use a backup code');b.onclick=async()=>{
  const t=await pmAsk('Backup code','Type one of your backup codes.','Continue',{plain:true});if(t==null)return;
  busy('Checking the code…');const r=await pmTryCode(t);unbusy();
  if(!r){PM.tfaFail=(PM.tfaFail||0)+1;if(PM.tfaFail>=5){pmLock(true);toast('Too many wrong codes. The vault is locked.');return}msg.textContent='That code is wrong or already used.';return}
  await pmSpendCode(r.hit);toast('Backup code accepted. It cannot be used again.');await pass()};row.append(b)}
 const lk=h('button','chip pmbtn','Lock');lk.onclick=()=>pmLock();row.append(lk);
 c.append(inp,msg,go,row);B.append(c);setTimeout(()=>{try{inp.focus()}catch{}},100)}
