/* aprofile.js: Authenticator profiles (V0.31.0).
   One screen per account that gathers its password, 2FA code, backup codes, recovery keys, cards and PINs, SSH and API keys and notes.
   Nothing is moved or rewritten in storage: a profile is built from the entries you already have, so backups, CSV export and older builds keep working.
   Needs auth.js and authx.js (auDomain, auxItems, auCode, auCopy, auHide, auLogo, auSave, auItemsSave ...) at call time. */
const PF_KINDS=[['pass','Logins','🔑'],['totp','2FA codes','🔐'],['bak','Backup codes','🔒'],['rec','Recovery keys','🗝️'],['card','Cards and PINs','💳'],['pass2','Passphrases','💬'],['api','API keys','⚙️'],['ssh','SSH keys','💻'],['note','Notes','📝']];
const PF_SECRET=['pass','rec','card','pass2','api'];/* masked until you tap the eye */
const pfOn=()=>{try{return localStorage.getItem('cnd.auth.prof')!=='0'}catch{return true}};/* Account profiles are enabled by default; user can switch back to the code list. */
const pfWant=()=>pfOn()&&!AU.sel;
function pfUse(){try{localStorage.setItem('cnd.auth.prof','1')}catch{}AU.apKey=null;pfDraw()}
function pfClassic(){try{localStorage.setItem('cnd.auth.prof','0')}catch{}AU.apKey=null;drawAu()}
function pfDraw(){clearInterval(AU.tm);if(AU.apKey&&pfBuild(AU.list).some(p=>p.key===AU.apKey))drawAuProfile(AU.apKey);else{AU.apKey=null;drawAuProfiles()}}

/* ---- grouping: platform first (site link, else the name written the same way), so GitHub, github and github.com meet in one profile ---- */
const pfNorm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
function pfRoot(host){const p=String(host||'').split('.');if(p.length<=2)return host;const t=p[p.length-1],s=p[p.length-2];
 return(t.length===2&&['co','com','org','net','gov','ac','edu'].includes(s))?p.slice(-3).join('.'):p.slice(-2).join('.')}
function pfBuild(list){
 const dom=a=>{const d=auDomain(a.link);return d?pfRoot(d):''},byName=new Map();
 list.forEach(a=>{const d=dom(a);if(!d)return;[a.issuer,d.split('.')[0]].forEach(n=>{const k=pfNorm(n);if(k&&!byName.has(k))byName.set(k,d)})});
 const map=new Map();
 list.forEach((a,i)=>{const nm=pfNorm(a.issuer||a.name||a.email),key=dom(a)||byName.get(nm)||'n:'+(nm||'untitled');
  let p=map.get(key);if(!p){p={key,idx:[],kinds:{},users:[],link:'',links:[],names:new Map(),group:''};map.set(key,p)}
  const T=a.type||'totp';p.idx.push(i);p.kinds[T]=(p.kinds[T]||0)+1;
  if(!p.link&&auDomain(a.link))p.link=a.link;{const lk=(a.link||'').trim();if(lk&&!p.links.includes(lk))p.links.push(lk)}if(!p.group&&auxGroupOf(a))p.group=auxGroupOf(a);
  const nn=(a.issuer||'').trim();if(nn)p.names.set(nn,(p.names.get(nn)||0)+1);
  if(T==='pass'||T==='totp')[a.name,a.email].forEach(u=>{u=(u||'').trim();if(u&&u.toLowerCase()!==nn.toLowerCase()&&!p.users.some(x=>x.toLowerCase()===u.toLowerCase()))p.users.push(u)})});
 const out=[...map.values()];
 out.forEach(p=>{let best='',n=0;p.names.forEach((c,k)=>{if(c>n||(c===n&&/[A-Z]/.test(k)&&!/[A-Z]/.test(best))){best=k;n=c}});
  p.title=best||auxName(list[p.idx[0]])||(p.link?auDomain(p.link):'Untitled')});
 return out.sort((x,y)=>auxCmp(x.title,y.title))}
const pfFind=key=>pfBuild(AU.list).find(p=>p.key===key);

/* ---- everything about one account as plain text, to read or copy ---- */
function pfText(p){
 const L=AU.list,out=[p.title];if(p.link)out.push('Site: '+p.link);
 p.idx.forEach(i=>{const a=L[i],T=a.type||'totp',tl=(AU_TYPES[T]||{}).label||T,it=auxMulti(T)?auxItems(a):[];
  const who=[a.name,a.email&&a.email!==a.name?a.email:''].filter(Boolean).join(' / ');
  out.push('','== '+tl+(who&&(T==='pass'||T==='totp')?' ('+who+')':'')+' ==');
  if(a.fullname)out.push('Full name: '+a.fullname);
  if(a.link)out.push('Link: '+a.link);
  if(T==='pass'){out.push('Username: '+(a.name||a.email||''));if(a.email&&a.email!==a.name)out.push('Email: '+a.email);out.push('Password: '+(a.secret||''));if(a.note)out.push('Notes:\n'+a.note)}
  else if(T==='totp')out.push('Setup key: '+(a.secret||''));
  else if(T==='bak')out.push(...it.map(x=>x.v+(x.u?'  (used)':'')));
  else if(T==='ssh')it.forEach(x=>{if(x.t)out.push('Label: '+x.t);if(x.pub)out.push(x.pub);if(x.prv)out.push(x.prv)});
  else it.forEach(x=>out.push((x.t?x.t+': ':'')+(x.v||'')+(x.n?'\n'+x.n:'')))});
 return out.join('\n')}
const pfOrig=p=>p.idx.map(i=>AU.list[i].orig).filter(Boolean).join('\n\n');

/* ---- the list: one row per account ---- */
function drawAuProfiles(){
 TV.view='apl';clearInterval(AU.tm);const B=$('#tbody');B.replaceChildren();B.classList.add('auscreen');head('Authenticator',true);
 const ps=pfBuild(AU.list),n=AU.list.length;
 const top=h('div','auhead',null,h('div',null,null,h('b',null,ps.length?ps.length+(ps.length===1?' account':' accounts'):'No accounts yet'),
  h('small',null,ps.length?(n===ps.length?'Tap an account to see everything in it':n+' entries gathered into '+ps.length+' accounts'):'Passwords, codes and keys, encrypted on this phone')));
 if(ps.length){const eye=h('button','auicon'+(auHide()?' on':''),null,ico(auHide()?'eyeoff':'eye'));eye.title='Hide codes';
  eye.onclick=()=>{localStorage.setItem('cnd.auth.hide',auHide()?'0':'1');drawAuProfiles()};top.append(eye)}
 const lk=h('button','auicon'+(auLockOn()?' on':''),null,ico('lock'));lk.title=auLockOn()?'Master lock is on. Tap to turn off.':'Turn on master lock';lk.onclick=auLockToggle;top.append(lk);
 const mo=h('button','auicon',null,ico('more'));
 mo.onclick=e=>{e.stopPropagation();const r=mo.getBoundingClientRect();
  menu(Math.max(10,r.right-250),r.bottom,[
   ['Clean up and find duplicates…',pfCleanup],
   ['All entries (classic list)',pfClassic],
   ['hr'],
   ['Extract from pasted text…',auPaste],
   ['Back up (encrypted)…',auExport],
   ['Export CSV, password (AES)…',()=>auExportCsv('pass')],
   ['Export CSV, no password (this phone)…',()=>auExportCsv('phone')],
   ['Restore or import from file…',auImport],
   ['hr'],
   ['Passkeys & autofill…',drawCk]])};
 top.append(mo);B.append(top);
 if(!ps.length){auEmpty(B);const f=h('button','aufab',null,ico('plus'),h('span',null,'Add account'));f.onclick=()=>auOpenForm();B.append(f);return}
 const find=h('input','ausearch');find.placeholder='Search name, username, site, note or label';find.value=AU.q||'';find.autocomplete='off';B.append(find);
 const list=h('div','aulist rows');B.append(list);
 const hay=p=>(p.title+' '+p.users.join(' ')+' '+p.link+' '+auDomain(p.link)+' '+p.group+' '+p.idx.map(i=>{const a=AU.list[i];return auHay(a)+' '+(a.note||'')}).join(' ')).toLowerCase();
 const build=()=>{list.replaceChildren();const q=(AU.q||'').toLowerCase().trim(),vis=ps.filter(p=>!q||hay(p).includes(q));
  vis.forEach(p=>{
   const el=h('div','aurow apro'),nm=h('div','aunm',null,h('b',null,p.title),h('small',null,p.users.slice(0,2).join(' · ')||(p.link?auDomain(p.link):'No username saved')));
   el.style.setProperty('--h',auHue({link:p.link,issuer:p.title}));
   const bd=h('div','apbadges');PF_KINDS.forEach(([k,,ic])=>{if(p.kinds[k])bd.append(h('span','apb',ic+(p.kinds[k]>1?p.kinds[k]:'')))});
   el.append(auLogo({issuer:p.title,link:p.link}),nm,bd);
   const pw=p.idx.map(i=>AU.list[i]).find(a=>(a.type||'totp')==='pass'&&a.secret);
   if(pw){const cp=h('button','auicon auis apcpb',null,ico('copy'));cp.title='Copy password';cp.onclick=e=>{e.stopPropagation();auCopy(pw.secret,'Password copied')};el.append(cp)}
   el.onclick=()=>drawAuProfile(p.key);list.append(el)});
  if(!vis.length)list.append(h('div','aunote','Nothing matches “'+AU.q+'”.'))};
 find.oninput=()=>{AU.q=find.value;build()};
 const f=h('button','aufab',null,ico('plus'),h('span',null,'Add'));f.onclick=()=>auOpenForm();B.append(f);build()}

/* ---- one account, everything in one place ---- */
function pfMut(fn,msg){return async()=>{const snap=JSON.stringify(AU.list);try{auGuard();fn();await auSave();if(msg)toast(msg)}catch(e){const o=JSON.parse(snap);AU.list.length=0;AU.list.push(...o);toast(e.message||'Could not save.');throw e}}}
function drawAuProfile(key){
 const P=pfFind(key);if(!P){AU.apKey=null;drawAuProfiles();return}
 TV.view='apd';clearInterval(AU.tm);AU.apKey=key;AU.apRev=AU.apRev||new Set();
 const B=$('#tbody'),L=AU.list,redraw=()=>drawAuProfile(key);B.replaceChildren();B.classList.add('auscreen');head(P.title,true);
 const guard=f=>async e=>{if(e)e.stopPropagation();try{await f()}catch(err){toast((err&&err.message)||'Could not save.')}};
 const cpBtn0=(hd,t)=>{const b=h('button','auicon auis',null,ico('copy'));b.title='Copy link';b.onclick=guard(()=>auCopy(t,'Link copied'));hd.append(b)};
 const hd=h('div','aprof',null,auLogo({issuer:P.title,link:P.link}),h('div','aunm',null,h('b',null,P.title),h('small',null,P.links.length>1?P.links.length+' different links (listed below)':P.link?auDomain(P.link):'No site link yet'),
  P.users.length?h('small',null,P.users.slice(0,3).join(' · ')):''));
 hd.style.setProperty('--h',auHue({link:P.link,issuer:P.title}));B.append(hd);
 const bar=h('div','autabs'),chip=(l,f,on)=>{const b=h('button','autab'+(on?' on':''),l);b.onclick=f;bar.append(b)};
 chip('＋ Add',()=>{const r=bar.getBoundingClientRect();
  menu(Math.max(10,r.left+10),r.bottom,AU_TYPE_ORDER.map(t=>[AU_TYPES[t].icon+'  '+AU_TYPES[t].label,()=>auOpenForm(null,{type:t,issuer:P.title,link:P.link,name:P.users[0]&&!/@/.test(P.users[0])?P.users[0]:'',email:P.users.find(u=>/@/.test(u))||''})]))},true);
 chip('Copy all details',()=>auCopy(pfText(P),'All details copied'));
 chip('Rename / site…',async()=>{const a=await dlg({title:'Platform name',value:P.title,ok:'Next'});if(!a||!a.v)return;
  const b=await dlg({title:'Site link (optional)',msg:'Entries that share a name or site are shown as one account.',value:P.link||'',ok:'Save'});if(!b)return;
  try{await pfMut(()=>{P.idx.forEach(i=>{L[i].issuer=a.v;if(b.v)L[i].link=b.v;else if(!b.v&&P.link)delete L[i].link})},'Saved')();AU.apKey=pfBuild(AU.list).find(p=>p.idx.includes(P.idx[0]))?.key||null;pfDraw()}catch{}});
 B.append(bar);
 if(P.links.length){B.append(h('div','ausec','🔗 Links and sources ('+P.links.length+')'));
  const lc=h('div','aulist');B.append(lc);
  P.links.forEach(lk=>{const n=P.idx.filter(i=>(L[i].link||'').trim()===lk).length,el=h('div','auitem'),hd=h('div','auih');
   hd.append(h('b',null,lk));cpBtn0(hd,lk);el.append(hd,h('small',null,n+(n===1?' entry uses':' entries use')+' this link'));el.onclick=guard(()=>auCopy(lk,'Link copied'));lc.append(el)});
  const nl=P.idx.filter(i=>!(L[i].link||'').trim()).length;if(nl)lc.append(h('small','aupvn',nl+(nl===1?' entry has':' entries have')+' no link saved (for example an app login)'))}
 const now0=Date.now(),live=[];
 const sec=(ic,lab,n)=>B.append(h('div','ausec',ic+' '+lab+(n>1?' ('+n+')':'')));
 const revK=(i,k)=>i+':'+k,isRev=(i,k)=>AU.apRev.has(revK(i,k)),flip=(i,k)=>{const x=revK(i,k);AU.apRev.has(x)?AU.apRev.delete(x):AU.apRev.add(x);redraw()};
 const eyeBtn=(i,k,hd)=>{const b=h('button','auicon auis',null,ico(isRev(i,k)?'eyeoff':'eye'));b.title='Show or hide';b.onclick=e=>{e.stopPropagation();flip(i,k)};hd.append(b)};
 const cpBtn=(hd,t,msg)=>{const b=h('button','auicon auis',null,ico('copy'));b.title='Copy';b.onclick=guard(()=>auCopy(t,msg));hd.append(b)};
 const moreBtn=(hd,items)=>{const b=h('button','auicon auis',null,ico('more'));b.onclick=e=>{e.stopPropagation();const r=b.getBoundingClientRect();menu(Math.max(10,r.right-190),r.bottom,items)};hd.append(b)};
 const delEntry=(i,what)=>['Delete',async()=>{const a=L[i];if(!await dlg({title:'Delete '+what+'?',msg:(a.issuer||a.name||'').slice(0,60),ok:'Delete',danger:true}))return;
  try{await pfMut(()=>{L.splice(L.indexOf(a),1)},'Deleted')();redraw()}catch{}}];
 PF_KINDS.forEach(([T,lab,ic])=>{
  const idxs=P.idx.filter(i=>(L[i].type||'totp')===T);if(!idxs.length)return;
  let cnt=0;idxs.forEach(i=>{cnt+=auxMulti(T)?auxItems(L[i]).length:1});sec(ic,lab,cnt);
  const col=h('div','aulist');B.append(col);
  idxs.forEach(i=>{const a=L[i];
   if(T==='pass'){
    const el=h('div','auitem'),hd=h('div','auih'),open=isRev(i,'p'),user=a.name||a.email||'Login';
    hd.append(h('b',null,user));
    if(a.name||a.email){const u=h('button','autab','User');u.title='Copy username';u.onclick=guard(()=>auCopy(a.name||a.email,'Username copied'));hd.append(u)}
    eyeBtn(i,'p',hd);cpBtn(hd,a.secret||'','Password copied');
    moreBtn(hd,[['Edit',()=>auOpenForm(i)],delEntry(i,'this login')]);
    el.append(hd,h('div','auiv',open?(a.secret||'(empty)'):'••••••••••'));
    if(a.email&&a.email!==a.name)el.append(h('small',null,a.email));
    el.append(h('small',null,a.link?'Link: '+a.link:'No link (app login?)'));
    if(a.note){const nt=h('div','apnote apclamp',a.note);nt.onclick=e=>{e.stopPropagation();nt.classList.toggle('apclamp')};el.append(nt)}
    el.onclick=guard(()=>auCopy(a.secret||'','Password copied'));col.append(el)}
   else if(T==='totp'){
    const el=h('div','auitem'),hd=h('div','auih'),code=h('div','auiv aptotp','······'),secs=h('small',null,'');
    hd.append(h('b',null,a.name||a.email||a.issuer||'2FA'));eyeBtn(i,'t',hd);
    moreBtn(hd,[['Copy setup key',()=>auCopy(a.secret||'','Setup key copied')],['Edit',()=>auOpenForm(i)],delEntry(i,'this 2FA code')]);
    el.append(hd,code,secs,h('small',null,a.link?'Link: '+a.link:'No link (app login?)'));el.onclick=guard(()=>{const c=code.dataset.c;if(c)auCopy(c,'Code copied')});col.append(el);live.push({a,code,secs,i})}
   else{
    const it=auxItems(a);
    it.forEach((x,k)=>{
     const el=h('div','auitem'+(T==='bak'&&x.u?' used':'')),hd=h('div','auih'),rk=i+':'+k,open=AU.apRev.has(rk),mask=PF_SECRET.includes(T)?!open:(auHide()&&!open);
     const ttl=x.t||(T==='ssh'?'SSH key':T==='bak'?'':'Untitled');hd.append(h('b',null,ttl||x.v||''));
     const itemMenu=[['Open all items in this entry',()=>auOpenDetail(a)],['Edit entry',()=>auOpenForm(i)],
      ['Delete this item',async()=>{if(!await dlg({title:'Delete this item?',msg:(ttl||x.v||'').slice(0,60),ok:'Delete',danger:true}))return;
        try{await auItemsSave(a,m=>{m.splice(k,1)});toast('Deleted');redraw()}catch(err){toast(err.message||'Could not save.')}}]];
     const flipI=()=>{AU.apRev.has(rk)?AU.apRev.delete(rk):AU.apRev.add(rk);redraw()};
     if(T==='ssh'){
      const p=x.pub||'';el.append(hd,h('div','auiv',open?(p||'(no public key)'):(p?p.slice(0,40)+(p.length>40?'…':''):'(no public key)')),h('small',null,x.prv?'Private key saved':'No private key'));
      if(open&&x.prv)el.append(h('pre','auipre',x.prv));
      if(x.pub){const b=h('button','autab','Pub');b.onclick=guard(()=>auCopy(x.pub,'Public key copied'));hd.append(b)}
      if(x.prv){const b=h('button','autab','Priv');b.onclick=guard(()=>auCopy(x.prv,'Private key copied'));hd.append(b)}
      const eb=h('button','auicon auis',null,ico(open?'eyeoff':'eye'));eb.onclick=e=>{e.stopPropagation();flipI()};hd.append(eb);
      moreBtn(hd,itemMenu);el.onclick=flipI}
     else if(T==='note'){
      const v=x.v||'',ls=v.split('\n');
      const body=h('div','auiv auinote',open?v:ls.slice(0,2).join('\n').slice(0,140)+(v.length>140||ls.length>2?'…':''));
      if(auHide()&&!open)body.textContent='• • • • • •';
      cpBtn(hd,v,'Note copied');moreBtn(hd,itemMenu);el.append(hd,body);el.onclick=flipI}
     else{
      const bodyT=mask?'••••••••••':(x.v||'');el.append(hd,h('div','auiv',bodyT));
      if(T==='api'&&x.n&&!mask)el.append(h('small',null,x.n));
      if(T==='bak'){const b=h('button','auicon auis'+(x.u?' on':''),null,ico('check'));b.title='Mark used';
       b.onclick=guard(async()=>{await auItemsSave(a,m=>{m[k].u=m[k].u?0:1});redraw()});hd.append(b)}
      if(PF_SECRET.includes(T)||auHide()){const eb=h('button','auicon auis',null,ico(open?'eyeoff':'eye'));eb.onclick=e=>{e.stopPropagation();flipI()};hd.append(eb)}
      cpBtn(hd,x.v||'',AU_COPY[T]);moreBtn(hd,itemMenu);
      el.onclick=guard(()=>auCopy(x.v||'',AU_COPY[T]))}
     col.append(el)})}})});
 /* everything as text */
 B.append(h('div','ausec','📋 All details as text'));
 const tw=h('div','aufld'),ta=document.createElement('textarea');ta.className='autarea aptext';ta.readOnly=true;ta.rows=12;ta.spellcheck=false;
 const shown=!auHide()||AU.apTxt===key;ta.value=shown?pfText(P):'(hidden. Tap Show text.)';tw.append(ta);B.append(tw);
 const tb=h('div','autabs');
 const t1=h('button','autab on','Copy all details');t1.onclick=()=>auCopy(pfText(P),'All details copied');tb.append(t1);
 if(auHide()){const t2=h('button','autab',shown?'Hide text':'Show text');t2.onclick=()=>{AU.apTxt=shown?null:key;redraw()};tb.append(t2)}
 const t3=h('button','autab','Select all');t3.onclick=()=>{ta.focus();ta.select()};tb.append(t3);B.append(tb);
 const og=pfOrig(P);
 if(og){B.append(h('div','ausec','📄 Original imported text'),h('small','aupvn','Exactly what was in the notes when you imported, before it was split into the sections above.'));
  const w2=h('div','aufld'),t4=document.createElement('textarea');t4.className='autarea aptext';t4.readOnly=true;t4.rows=8;t4.spellcheck=false;t4.value=(!auHide()||AU.apTxt===key)?og:'(hidden. Tap Show text above.)';w2.append(t4);B.append(w2);
  const cb=h('button','autab on','Copy original text');cb.onclick=()=>auCopy(og,'Original text copied');B.append(h('div','autabs',null,cb))}
 /* live 2FA codes */
 const tick=async()=>{if(TV.view!=='apd'){clearInterval(AU.tm);return}
  const now=Date.now();
  for(const c of live){const per=c.a.period||30,ms=per*1000,ctr=Math.floor(now/ms),left=per-Math.floor(now/1000)%per;
   try{if(c.ctr!==ctr){c.cc=await auCode(c.a,now);c.ctr=ctr}
    const show=!auHide()||isRev(c.i,'t');c.code.dataset.c=c.cc;c.code.textContent=show?auFmt(c.cc):c.cc.replace(/\d/g,'\u2022');c.secs.textContent=left+'s left'}
   catch{c.code.textContent='------';c.secs.textContent='Bad setup key'}}};
 if(live.length){tick();AU.tm=setInterval(tick,500)}}

/* ---- clean up: how many accounts you really have, duplicates, reused passwords ---- */
function pfCleanup(){
 TV.view='apc';clearInterval(AU.tm);AU.apKey=null;const B=$('#tbody'),L=AU.list;B.replaceChildren();B.classList.add('auscreen');head('Clean up',true);
 const ps=pfBuild(L),keyOf=new Map();ps.forEach(p=>p.idx.forEach(i=>keyOf.set(i,p.key)));
 const byType={};L.forEach(a=>{const T=a.type||'totp';byType[T]=(byType[T]||0)+1});
 B.append(h('div','auhead',null,h('div',null,null,h('b',null,L.length+' entries = '+ps.length+' accounts'),
  h('small',null,PF_KINDS.filter(k=>byType[k[0]]).map(k=>k[2]+' '+byType[k[0]]).join('   ')||'Nothing saved yet'))));
 const open=key=>{AU.apKey=key;drawAuProfile(key)},cap=30;
 const group=(title,hint,arr)=>{if(!arr.length)return;B.append(h('div','ausec',title+' ('+arr.length+')'));if(hint)B.append(h('small','aupvn',hint));
  const col=h('div','aulist rows');B.append(col);
  arr.slice(0,cap).forEach(([p,sub])=>{const el=h('div','aurow apro');el.style.setProperty('--h',auHue({link:p.link,issuer:p.title}));
   el.append(auLogo({issuer:p.title,link:p.link}),h('div','aunm',null,h('b',null,p.title),h('small',null,sub||'')));el.onclick=()=>open(p.key);col.append(el)});
  if(arr.length>cap)col.append(h('div','aunote','+'+(arr.length-cap)+' more'))};
 /* exact duplicates: same platform, same type, same user, same secret */
 const seen=new Set(),dupIdx=[];
 L.forEach((a,i)=>{const T=a.type||'totp',k=[keyOf.get(i),T,pfNorm(a.name||a.email),a.secret||'',a.items?JSON.stringify(a.items.map(x=>[x.t,x.v,x.pub,x.prv])):a.note||''].join('\u0001');
  if(seen.has(k))dupIdx.push(i);else seen.add(k)});
 if(dupIdx.length){B.append(h('div','ausec','Exact duplicates ('+dupIdx.length+')'),h('small','aupvn','Same platform, same type, same username and same secret. The first copy is kept.'));
  const rb=h('button','aufab static',null,ico('trash'),h('span',null,'Remove '+dupIdx.length+' exact duplicate'+(dupIdx.length===1?'':'s')));
  rb.onclick=async()=>{if(!await dlg({title:'Remove '+dupIdx.length+' duplicates?',msg:'Only exact copies are removed. Make a backup first if you are unsure.',ok:'Remove',danger:true}))return;
   const rm=new Set(dupIdx.map(i=>L[i]));try{await pfMut(()=>{AU.list=AU.list.filter(a=>!rm.has(a))},'Removed '+rm.size)();pfCleanup()}catch{}};B.append(rb)}
 else B.append(h('div','ausec','Exact duplicates (0)'),h('small','aupvn','None found. Your entries are all different.'));
 group('Several logins on one platform','Could be two real accounts, or the same account saved twice with different passwords.',
  ps.filter(p=>(p.kinds.pass||0)>1).map(p=>[p,p.kinds.pass+' passwords: '+p.idx.filter(i=>(L[i].type||'totp')==='pass').map(i=>L[i].name||L[i].email||'?').join(', ')]));
 group('Several 2FA codes on one platform','',ps.filter(p=>(p.kinds.totp||0)>1).map(p=>[p,p.kinds.totp+' codes: '+p.idx.filter(i=>(L[i].type||'totp')==='totp').map(i=>L[i].name||L[i].email||'?').join(', ')]));
 const bySecret=new Map();L.forEach((a,i)=>{if((a.type||'totp')==='pass'&&a.secret&&a.secret.length>=3){const k=a.secret;if(!bySecret.has(k))bySecret.set(k,new Set());bySecret.get(k).add(keyOf.get(i))}});
 const reused=new Map();bySecret.forEach(s=>{if(s.size>1)s.forEach(k=>reused.set(k,Math.max(reused.get(k)||0,s.size)))});
 group('Same password on different platforms','Change these first. One leak opens all of them.',ps.filter(p=>reused.has(p.key)).map(p=>[p,'Shared with '+(reused.get(p.key)-1)+' other platform'+(reused.get(p.key)===2?'':'s')]));
 group('No site link','Add a link and the logo shows and similar names join up.',ps.filter(p=>!p.link).map(p=>[p,p.idx.length+' entr'+(p.idx.length===1?'y':'ies')]));
 group('Only a 2FA code, no password saved','',ps.filter(p=>p.kinds.totp&&!p.kinds.pass).map(p=>[p,'Add the password so everything is in one place']));
 if(!B.querySelector('.aurow')&&!dupIdx.length)B.append(h('div','aunote','Nothing to clean up.'))}
