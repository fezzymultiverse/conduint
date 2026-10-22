/* credkeys.js (V0.29.0): Authenticator > Passkeys & autofill.
   Native side: CredPlugin ("Cred"). This file is the screen (status, the buttons that open Android's settings pages, the passkey list)
   and the hook that shares saved passwords with the autofill service.
   What is shared: only entries of type Password (not 2FA codes, notes, keys or backup codes), and only when the switch on this screen is on.
   The copy lives in the Android Keystore on this phone. AutofillAuthActivity asks for the fingerprint or screen lock before any of it is released.
   Safety rule: nothing in here may stop saving an account. Every call to the native side is wrapped; a failure shows a plain sentence or is ignored. */
const CRED=BRIDGE?plug('Cred'):null;
const CK={flag:'cnd.auth.share',last:null,tok:0};
const ckOn=()=>{try{return localStorage.getItem(CK.flag)==='1'}catch{return false}};

/* the list the autofill service may offer: [{d: site, t: title, u: user name, p: password}] */
function ckList(){
 return(AU.list||[]).filter(a=>(a.type||'totp')==='pass'&&String(a.secret||'')).map(a=>({
  d:auDomain(a.link)||auDomain(a.issuer)||'',
  t:String(a.issuer||a.fullname||auDomain(a.link)||'').slice(0,80),
  u:String(a.name||a.email||'').slice(0,200),
  p:String(a.secret)}))}

/* THE HOOK. auSave() calls this after every successful save, so the shared copy follows every add, edit, delete, import and restore.
   It does nothing while sharing is off, while the list could not be opened (so a locked or broken list never replaces the shared copy with an empty one),
   and when nothing changed since the last send. It never throws. Returns the number of passwords the phone now holds, or null. */
async function ckSync(force){
 if(!CRED||!ckOn()||AU.broken||AU.locked)return null;
 try{const j=JSON.stringify(ckList());
  if(!force&&j===CK.last)return null;
  const r=await CRED.syncPasswords({json:j});CK.last=j;return r&&typeof r.count==='number'?r.count:null}
 catch{return null}}

async function ckShareToggle(){
 try{
  if(!ckOn()){
   try{auGuard()}catch(e){toast(e.message);return}
   const r=await dlg({title:'Share passwords with autofill?',ok:'Share',
    msg:'Conduint keeps a second copy of your saved Password entries (not 2FA codes, notes or keys), encrypted with a key in the Android Keystore, so the browser and other apps can ask for them. A password is only filled in after your fingerprint or screen lock. If this phone has no screen lock, nothing asks. The master lock does not cover this copy. Turning this off erases it.'});
   if(!r)return;
   localStorage.setItem(CK.flag,'1');
   const c=await ckSync(true);
   toast(c==null?'Sharing is on, but the list could not be sent yet.':'Sharing '+c+(c===1?' password':' passwords'))}
  else{
   const r=await dlg({title:'Stop sharing?',msg:'The copy kept for autofill is erased. Your accounts in the Authenticator are not touched.',ok:'Stop and erase',danger:true});
   if(!r)return;
   localStorage.removeItem(CK.flag);CK.last=null;
   if(CRED)await CRED.clearPasswords();
   toast('Sharing is off and the copy is erased')}}
 catch(e){toast((e&&e.message)||'Could not change sharing.')}
 drawCk()}

async function ckOpen(fn){try{await CRED[fn]()}catch(e){toast((e&&e.message)||'Android could not open that page.')}}

async function ckDeletePasskey(p){
 const r=await dlg({title:'Delete this passkey?',ok:'Delete',danger:true,
  msg:(p.rpName||p.rp)+(p.user?' · '+p.user:'')+'\nIt is removed from this phone only. The website keeps its record of it, so remove it there too or you may not be able to sign in with it again.'});
 if(!r)return;
 try{await CRED.deletePasskey({id:p.id});toast('Passkey deleted')}catch(e){toast((e&&e.message)||'Could not delete it.')}
 drawCk()}

async function drawCk(){
 TV.view='auk';clearInterval(AU.tm);const tok=++CK.tok,B=$('#tbody');B.replaceChildren();B.classList.add('auscreen');head('Passkeys & autofill',true);
 if(!CRED){B.append(h('div','empty','Passkeys and autofill run inside the Android app.'));return}
 let st,pk;
 try{st=await CRED.status()||{};pk=((await CRED.listPasskeys())||{}).items||[]}
 catch(e){if(tok===CK.tok)B.append(h('div','empty',(e&&e.message)||'Could not read the passkey and autofill status.'));return}
 if(tok!==CK.tok||TV.view!=='auk')return;
 B.replaceChildren();
 B.append(h('div','auhead',null,h('div',null,null,h('b',null,'Passkeys & autofill'),h('small',null,'Use Conduint to sign in on this phone'))));
 const state=(on,txt)=>h('small','ckst'+(on?' ckok':''),(on?'● ':'○ ')+txt),row=(...b)=>h('div','ckrow',null,...b);
 const btn=(t,f,on)=>{const b=h('button','chip'+(on?' on':''),t);b.onclick=f;return b};

 /* passkeys */
 const c1=h('div','dc shcard',null,h('b',null,'Passkeys'));
 if(!st.passkeyCapable)c1.append(h('small',null,'Passkey providers need Android 14 or newer. This phone is on Android '+st.sdk+'.'));
 else{
  c1.append(state(st.providerOn,st.providerOn?'Conduint is a passkey provider':'Conduint is not switched on yet'),
   h('small',null,'Pick Conduint in Android\u2019s Passwords, passkeys & accounts page, then websites and apps can save a passkey here.'),
   row(btn(st.providerOn?'Open passkey settings':'Switch on in Android settings',()=>ckOpen('openProviderSettings'),!st.providerOn)))}
 B.append(c1);

 /* autofill */
 const c2=h('div','dc shcard',null,h('b',null,'Autofill'));
 if(!st.autofillCapable)c2.append(h('small',null,'Autofill needs Android 8 or newer.'));
 else c2.append(state(st.autofillOn,st.autofillOn?'Conduint is the autofill service':'Conduint is not the autofill service yet'),
  h('small',null,'Android asks you to confirm. After that, login boxes in other apps and the browser offer your saved passwords.'),
  row(btn(st.autofillOn?'Open autofill settings':'Switch on in Android settings',()=>ckOpen('openAutofillSettings'),!st.autofillOn)));
 B.append(c2);

 /* sharing */
 const on=ckOn(),eligible=ckList().length,c3=h('div','dc shcard',null,h('b',null,'Share saved passwords with autofill'));
 c3.append(state(on,on?'Sharing is on · '+st.passwords+' on the phone for autofill':'Sharing is off'),
  h('small',null,'Only entries of type Password are shared ('+eligible+' saved now). Each one needs your fingerprint or screen lock before it is filled.'));
 if(AU.locked||AU.broken)c3.append(h('small','ckwarn','The Authenticator list is not open, so nothing can be sent. Open the Authenticator and unlock it first.'));
 const rb=[btn(on?'Turn off and erase':'Turn on',ckShareToggle,!on)];
 if(on)rb.push(btn('Send again now',async()=>{const c=await ckSync(true);toast(c==null?'Could not send the list.':'Sent '+c);drawCk()}));
 c3.append(row(...rb));B.append(c3);

 /* passkey list */
 const c4=h('div','dc shcard',null,h('b',null,pk.length?'Passkeys on this phone ('+pk.length+')':'No passkeys saved here yet'));
 pk.forEach(p=>{const t=h('div','shlg',null,h('b',null,p.rpName||p.rp),h('small',null,[p.user||p.display,p.rp,p.created?dt(p.created):''].filter(Boolean).join(' · ')));
  t.append(row(btn('Delete',()=>ckDeletePasskey(p))));c4.append(t)});
 B.append(c4);
 B.append(h('div','note','Passkeys are made and kept in this phone\u2019s Keystore and cannot be copied off it. If you lose the phone, sign in another way and add a new passkey.'))}

/* coming back from Android's settings page: redraw so the status is current */
const ckBack=()=>{if(!document.hidden&&TV.view==='auk')drawCk()};
document.addEventListener('visibilitychange',ckBack);window.addEventListener('focus',ckBack);
