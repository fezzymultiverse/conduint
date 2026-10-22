/* pmx.js: Conduint Password Manager additions (V0.36.0). Loaded after pmsec.js. Everything here is added on top of pm.js / pmui.js / pmsec.js.
   [1] Authenticator key on Secure notes: hidden input in the editor, live 6-digit code + hidden key in the item view, kept in exports and imports.
   [2] Search: sticky box with a clear button, a result count, and it also reads folder names, type names and plain custom fields.
   [3] The vault list shows EVERY item (no 200 cap), counts notes in the header and warns when saved records could not be decrypted.
   [4] Email recovery key: a 20-character key you email to yourself. Forgot everything? Lock screen > "Recover with email key": type the vault email and the key.
       Honest limit: Conduint has no server, so it cannot send mail by itself. It opens your mail app with the key ready to send. Anyone who can read that
       mailbox AND has a copy of the vault file can open the vault, so keep that mailbox behind 2-step login.
   Strategy Over Impulse. */

/* ---------- [1] Authenticator key on Secure notes ---------- */
const _pmBlankX=pmBlank;
pmBlank=function(type,folderId){const it=_pmBlankX(type,folderId);if(type===2)it.totp='';return it};
const PM_TOTP_FIELD=/^(totp|otp|2fa|authenticator|authenticator (key|code)|one[- ]time (password|code)( key)?)$/i;
const _pmNormX=pmNorm;
pmNorm=function(o){
 const it=_pmNormX(o);
 if(it.type===2){
  let t=String(o&&o.totp!=null?o.totp:'').trim();
  if(!t){const i=(it.fields||[]).findIndex(x=>x&&x.value&&PM_TOTP_FIELD.test(String(x.name||'').trim()));if(i>=0){t=String(it.fields[i].value).trim();it.fields.splice(i,1)}}
  it.totp=t}
 else delete it.totp;
 return it};
/* V0.43.6: more than one note per item. Other apps only know one Notes box, so exports join every note into it; the Conduint keys below let a Conduint backup or import split them back. */
const pmAllNotes=it=>[it.notes||'',...(it.moreNotes||[]).map(n=>(n.t?n.t+'\n':'')+(n.v||''))].filter(x=>String(x).trim()).join('\n\n');
const _pmBwItemX=pmBwItem;
pmBwItem=function(it){
 const o=_pmBwItemX(it);
 if((it.moreNotes||[]).length){o.notes=pmAllNotes(it)||null;o.cndNote0=it.notes||'';o.cndMoreNotes=it.moreNotes.map(n=>({t:n.t||'',v:n.v||''}))}
 if(it.type===2&&it.totp)o.fields=[...(o.fields||[]),{name:'Authenticator key',value:it.totp,type:1,linkedId:null}];
 return o};
pmExportCsv=function(){
 const head='folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',rows=[head];
 for(const it of PM.items.filter(i=>!i.deletedDate&&(i.type===1||i.type===2))){
  const l=it.login,fl=(it.fields||[]).map(f=>f.name+': '+f.value);
  if(it.type===2&&it.totp)fl.push('Authenticator key: '+it.totp);
  rows.push([pmFolderName(it.folderId),it.favorite?1:'',it.type===1?'login':'note',it.name,pmAllNotes(it),fl.join('\n'),it.reprompt||'',
   l?l.uris.map(u=>u.uri).filter(Boolean).join('\n'):'',l?l.username:'',l?l.password:'',l?l.totp:''].map(pmCsvCell).join(','))}
 return rows.join('\n')};
const _pmSubX=pmSub;
pmSub=function(it){return it.type===2?(it.totp?'Authenticator code':''):_pmSubX(it)};

/* editor: the key box sits right under the Name */
const _pmEditScrX=pmEditScr;
pmEditScr=function(B){
 _pmEditScrX(B);
 const D=PM.draft;if(!D||D.it.type!==2)return;
 const it=D.it,p=pmPwInput('Base32 key or otpauth:// link (hidden)',it.totp||'',v=>{it.totp=v});
 p.input.classList.add('mono');p.input.setAttribute('aria-label','Authenticator key');
 const lab=pmLabel('Authenticator key (optional, hidden)'),note=h('small','pmmu','Paste the setup key a website gave you. It is hidden here and in the note. The note then shows the live 6-digit code.');
 const anchor=B.children[1]||B.lastChild;
 if(anchor&&anchor.after){anchor.after(lab,p.box,note)}else B.append(lab,p.box,note)};
const _pmSaveDraftX=pmSaveDraft;
pmSaveDraft=async function(){
 const D=PM.draft;
 if(D&&D.it.type===2&&String(D.it.totp||'').trim()){
  D.it.totp=String(D.it.totp).trim();
  try{await pmTotpCode(pmTotpParse(D.it.totp))}catch(e){return toast('Authenticator key: '+((e&&e.message)||e))}}
 return _pmSaveDraftX.apply(this,arguments)};
/* view: code and hidden key right under the title */
const _pmViewScrX=pmViewScr;
pmViewScr=function(B){
 _pmViewScrX(B);
 const it=PM.cur;if(!it||!PM.items.includes(it)||it.type!==2||!it.totp)return;
 const sec=h('div','pmsec'),t=pmTotpRow({id:it.id,reprompt:it.reprompt,login:{totp:it.totp}});
 if(t)sec.append(t);
 const k=pmFld('Authenticator key',it.totp,{secret:true,mono:true,rp:it});if(k)sec.append(k);
 const vh=B.querySelector('.pmvh');
 if(sec.children.length){if(vh&&vh.after)vh.after(sec);else B.prepend(sec)}};

/* ---------- [2] Search ---------- */
pmMatch=function(it,q){
 q=String(q||'').trim().toLowerCase();if(!q)return true;
 const id=it.identity?Object.values(it.identity).join(' '):'',cd=it.card?[it.card.cardholderName,it.card.brand].join(' '):'',
  hay=[it.name,pmSub(it),it.notes,...(it.moreNotes||[]).map(n=>(n.t||'')+' '+(n.v||'')),PM_TYPES[it.type]?PM_TYPES[it.type].n:'',pmFolderName(it.folderId),
   ...(it.login?it.login.uris.map(u=>u.uri):[]),...(it.login?[it.login.username]:[]),
   ...(it.fields||[]).map(f=>f.name+' '+(f.type===0?f.value:'')),...(it.attachments||[]).map(a=>a.fileName),id,cd,
   it.sshKey?it.sshKey.publicKey:'',it.totp?'authenticator code 2fa otp':''].join('\n').toLowerCase();
 return q.split(/\s+/).every(w=>hay.includes(w))};

/* ---------- [3] Vault list: everything is loaded, nothing is capped ---------- */
pmListScr=function(B){
 const live=PM.items.filter(i=>!i.deletedDate),n=live.length,notes=live.filter(i=>i.type===2).length,tn=PM.items.length-n;
 pmHead('Vault',n+(n===1?' item':' items')+(notes?' · '+notes+(notes===1?' note':' notes'):''),false,[['plus','Add item',pmAddMenu],['lock','Lock vault',()=>pmLock()]]);
 const q=h('input','pmin pmq');q.type='search';q.placeholder='Search everything: names, notes, sites, folders';q.value=PM.q;q.autocomplete='off';q.autocapitalize='off';q.spellcheck=false;
 const clr=h('button','ib pmclr',null,ico('x'));clr.setAttribute('aria-label','Clear search');clr.type='button';
 const bar=h('div','pmsrch pmsrchx',null,q,clr),cnt=h('small','pmmu pmcnt2',''),chips=h('div','pmfl2'),L=h('div','pmlist');
 if(PM.bad)B.append(h('div','pmban',PM.bad+(PM.bad===1?' saved record could not be decrypted and is not shown.':' saved records could not be decrypted and are not shown.')+' Import your encrypted backup (Settings > Import) to bring them back.'));
 let tok=0;
 const drawChips=()=>{chips.replaceChildren();
  const all=[...PM_FLT,...PM.folders.slice().sort(pmCmp).map(f=>['f:'+f.id,f.name]),['f:','No folder'],['trash','Trash'+(tn?' ('+tn+')':'')]];
  all.forEach(([k,t])=>{const b=h('button','chip'+(PM.flt===k?' on':''),t);b.onclick=()=>{PM.flt=k;drawChips();drawList()};chips.append(b)})};
 const drawList=()=>{
  L.replaceChildren();let items=pmList(),acc=0;const my=++tok;
  /* V0.43.6: on All, the logins sit in one Accounts folder and are not repeated in the list. Tap it (or the Logins chip) to open them. Search still finds every item. */
  if(PM.flt==='all'&&!PM.q){const lg=items.filter(i=>i.type===1);if(lg.length){acc=lg.length;items=items.filter(i=>i.type!==1);
   const av=h('span','pmav',null,ico('folder'));av.style.setProperty('--hue',200);
   const fr=h('div','pmit',null,av,h('div','pmim',null,h('b',null,'Accounts'),h('small',null,acc+(acc===1?' login':' logins'))),ico('next'));
   fr.onclick=()=>{PM.flt='t:1';drawChips();drawList()};L.append(fr)}}
  clr.style.visibility=PM.q?'visible':'hidden';
  cnt.textContent=PM.q?items.length+(items.length===1?' match':' matches'):(PM.flt==='all'?'':items.length+(items.length===1?' item':' items')+' in this view');
  if(!items.length&&!acc){L.append(h('div','pmempty',PM.q?'Nothing matches that search.':PM.flt==='trash'?'The trash is empty. Deleted items stay here for 30 days.':PM.items.length?'Nothing in this view.':'Your vault is empty. Tap + to add your first item, or use Settings > Import.'));return}
  let i=0;const step=()=>{if(my!==tok)return;const end=Math.min(items.length,i+150);for(;i<end;i++)L.append(pmRowEl(items[i]));if(i<items.length)setTimeout(step,0);else if(PM.flt==='trash'){const eb=h('button','chip pmbtn danger2','Empty the trash');eb.onclick=pmEmptyTrash;L.append(eb)}};
  step()};
 q.oninput=()=>{PM.q=q.value;drawList()};
 clr.onclick=()=>{q.value='';PM.q='';drawList();q.focus()};
 B.append(bar,cnt,chips,L);drawChips();drawList()};

/* ---------- [4] Email recovery key ---------- */
const PM_MAIL_LEN=20;
const pmMailKeyFmt=k=>k.match(/.{1,4}/g).join('-');
const pmHasMail=()=>!!(PM.hdr&&PM.hdr.mail&&PM.hdr.mail.w);
async function pmMakeMailKey(noGuard){
 if(!PM.VK)return;
 if(!noGuard&&!await pmGuardMaster('Enter your master password to make an email recovery key.',true))return;
 busy('Making the key…');
 try{
  let key='';for(const b of pmRnd(PM_MAIL_LEN))key+=PM_CODE_A[b&31];
  const w=await pmWrap(PM.VK,key,PM.hdr.email,PM_REC_ITER);
  PM.hdr={...PM.hdr,mail:{...w,made:Date.now()}};await pmSaveHdr(PM.hdr);
  unbusy();PM.mailKey=key;pmGo('mailkey')}
 catch(e){unbusy();toast('Could not make the key: '+((e&&e.message)||e))}}
function pmMailKeyText(){
 const key=pmMailKeyFmt(PM.mailKey||''),em=PM.hdr?PM.hdr.email:'';
 return{subject:'Conduint Password Manager recovery key',
  body:'Conduint Password Manager: email recovery key\n\nVault email: '+em+'\nRecovery key: '+key+'\n\nHow to use it: on the lock screen tap "Recover with email key", type the vault email and this key, then choose a new master password.\nThis key works once. Keep this email private and delete it when you make a new key.\n'}}
const _pmRenderX=pmRender;
pmRender=function(){
 if(PM.scr!=='mailkey')PM.mailKey=null;
 if(PM.VK&&PM.scr==='mailkey'&&PM.mailKey){clearInterval(PM.tm);const B=$('#pml');B.replaceChildren();B.scrollTop=0;$('#pmnav').style.display='none';pmMailKeyScr(B);return}
 return _pmRenderX.apply(this,arguments)};
function pmMailKeyScr(B){
 pmHead('Email recovery key','Password Manager',true,[]);
 const c=h('div','pmc'),t=pmMailKeyText();
 c.append(h('b','pmh1','Send this key to your email'),
  h('small','pmmu','This key opens the vault if you forget the master password and your fingerprint and PIN fail. It is shown only now. Send it to yourself and keep that email private. It works once, then you set a new master password.'),
  h('div','pmcode pmkey',pmMailKeyFmt(PM.mailKey)));
 const em=h('button','chip on pmbtn','Email it to '+(PM.hdr?PM.hdr.email:'myself'));
 em.onclick=()=>{
  PM.busyUntil=Date.now()+180000;
  const a=document.createElement('a');a.href='mailto:'+encodeURIComponent(PM.hdr.email).replace(/%40/g,'@')+'?subject='+encodeURIComponent(t.subject)+'&body='+encodeURIComponent(t.body);
  a.style.display='none';document.body.append(a);a.click();a.remove()};
 const sh=h('button','chip pmbtn','Share…');
 sh.onclick=async()=>{PM.busyUntil=Date.now()+180000;try{if(navigator.share)await navigator.share({title:t.subject,text:t.body});else pmCopy(t.body,'Recovery message')}catch(e){if(e&&e.name!=='AbortError')toast('Could not share it.')}};
 const cp=h('button','chip pmbtn','Copy key');cp.onclick=()=>pmCopy(pmMailKeyFmt(PM.mailKey),'Recovery key');
 const dn=h('button','chip pmbtn','I saved it');dn.onclick=()=>pmBack();
 c.append(em,sh,cp,dn,h('small','pmmu','Conduint has no server, so it cannot send the email by itself: tapping the first button opens your mail app with the message ready. Anyone who can read that mailbox and also gets a copy of this vault file could open the vault, so keep the mailbox behind 2-step login.'));
 B.append(c)}
async function pmMailMenu(){
 if(!pmHasMail())return pmMakeMailKey();
 const r=await dlg({title:'Email recovery key',opts:[['new','Make a new key (the old one stops working)'],['off','Delete the email recovery key']],val:'new',ok:'Continue'});
 if(!r||r.o==null)return;
 if(r.o==='new')return pmMakeMailKey();
 if(!await pmGuardMaster('Enter your master password to delete the email recovery key.',true))return;
 PM.hdr={...PM.hdr,mail:null};await pmSaveHdr(PM.hdr);toast('Email recovery key deleted.');if(PM.scr==='set')pmRedraw()}
const _pmSecRowsX=pmSecRows;
pmSecRows=function(B){
 _pmSecRowsX(B);
 const on=pmHasMail(),row=pmSetRow('Email recovery key',on?'On. Made '+pmDate(PM.hdr.mail.made)+'. Needs '+PM.hdr.email:'Email yourself a key that gets you back in if you forget the master password',on?'On':null,pmMailMenu);
 const last=B.lastElementChild;if(last)B.insertBefore(row,last);else B.append(row)};
/* tries the typed email and key; returns the vault key or null. The email must be the one the vault was made with. */
async function pmTryMail(email,text){
 const hd=PM.hdr;if(!hd||!hd.mail)return null;
 if(String(email||'').trim().toLowerCase()!==hd.email)return null;
 const key=pmCodeNorm(text);if(key.length!==PM_MAIL_LEN)return null;
 try{return await pmUnwrap({email:hd.email,s:hd.mail.s,i:hd.mail.i,w:hd.mail.w,n:hd.mail.n},key)}catch{return null}}
async function pmAskMail(){
 const em=await pmAsk('Vault email','Type the email this vault was made with.','Next',{plain:true});if(em==null)return null;
 const k=await pmAsk('Email recovery key','Type the key you emailed to yourself.','Unlock',{plain:true});if(k==null)return null;
 busy('Checking the key…');const vk=await pmTryMail(em,k);unbusy();return vk||false}
async function pmSpendMail(){PM.hdr={...PM.hdr,mail:null};await pmSaveHdr(PM.hdr)}
async function pmOfferNewMail(){
 const r=await dlg({title:'Make a new email recovery key?',msg:'The key you just used cannot be used again. Make a new one and email it to yourself.',ok:'Make new key'});
 if(r)await pmMakeMailKey(true)}
async function pmMailUnlock(msg){
 const f=pmFail(),w=Math.ceil(((f&&f.until)-Date.now())/1000);
 if(w>0){msg.textContent='Too many wrong tries. Wait '+w+' s.';return}
 const vk=await pmAskMail();if(vk==null)return;
 if(!vk){const fl=pmFail(1);msg.textContent=fl.until>Date.now()?'Wrong email or key. Wait '+Math.ceil((fl.until-Date.now())/1000)+' s.':'That email or key is wrong, or the key was already used. '+(5-fl.n)+' tries before a wait.';return}
 pmFail(0);
 try{PM.VK=vk;await pmLoadAll()}catch(e){PM.VK=null;msg.textContent='Could not open the vault: '+((e&&e.message)||e);return}
 await pmSpendMail();PM.tfaOk=true;PM.verified=0;
 toast('Email key accepted. It cannot be used again.');
 await pmForceMaster();await pmAfterUnlock();await pmOfferNewMail()}
const _pmLockExtrasX=pmLockExtras;
pmLockExtras=function(c,msg){
 _pmLockExtrasX(c,msg);
 if(!pmHasMail())return;
 const row=h('div','pmrow2 pmwrap'),b=h('button','chip pmbtn','Recover with email key');b.onclick=()=>pmMailUnlock(msg);row.append(b);c.append(row)};
/* the authenticator step also accepts the email key, so a lost authenticator is not a dead end */
const _pmTfaScrX=pmTfaScr;
pmTfaScr=function(B){
 _pmTfaScrX(B);
 if(!pmHasMail())return;
 const c=B.querySelector('.pmc');if(!c)return;
 const msg=c.querySelector('.pmmsg')||h('small','pmmsg',''),b=h('button','chip pmbtn','Use email recovery key');
 b.onclick=async()=>{
  const vk=await pmAskMail();if(vk==null)return;
  if(!vk){PM.tfaFail=(PM.tfaFail||0)+1;if(PM.tfaFail>=5){pmLock(true);toast('Too many wrong tries. The vault is locked.');return}msg.textContent='That email or key is wrong, or the key was already used.';return}
  await pmSpendMail();toast('Email key accepted. It cannot be used again.');
  PM.tfaFail=0;PM.tfaOk=true;PM.tfaPend=false;await pmForceMaster();await _pmAfterUnlock();await pmOfferNewMail()};
 c.append(b)};

/* V0.43.6: importing a Conduint export splits the joined notes back into Note 1 + extra notes */
const _pmNormNotes=pmNorm;
pmNorm=function(o){
 const it=_pmNormNotes(o);
 if(Array.isArray(o.cndMoreNotes)){it.notes=o.cndNote0==null?'':String(o.cndNote0);
  const m=o.cndMoreNotes.filter(n=>n&&(n.t||n.v)).map(n=>({t:String(n.t||''),v:String(n.v||'')}));if(m.length)it.moreNotes=m;else delete it.moreNotes}
 delete it.cndNote0;delete it.cndMoreNotes;return it};
