/* pmdash.js: Conduint Passwords Home dashboard (V0.40.0). Loaded after pmx.js. Opens first after unlock.
   Shows: welcome + vault email, security score, counts of logins / notes / cards / identities / SSH keys, password health,
   protections checklist, sync + backup status, quick actions, recent items. Header: Videos, Sync, Add item, Settings.
   Reads only what the vault already holds in memory. Nothing new is stored except the time of the last encrypted backup.
   The Gallery screens are not touched. Strategy Over Impulse. */
const PMK_BK='cnd.pm.lastbackup';
const pmAgo=t=>{if(!t)return'never';const m=Math.floor((Date.now()-t)/60000);if(m<1)return'just now';if(m<60)return m+' min ago';const hr=Math.floor(m/60);if(hr<24)return hr+(hr===1?' hour ago':' hours ago');const d=Math.floor(hr/24);return d+(d===1?' day ago':' days ago')};
/* remember when an encrypted backup (.cndpm) was last saved */
const _pmSaveBlobD=pmSaveBlob;
pmSaveBlob=async function(name){const r=await _pmSaveBlobD.apply(this,arguments);if(r&&/\.cndpm$/i.test(String(name)))pmLSet(PMK_BK,Date.now());return r};

function pmDashStats(){
 const live=PM.items.filter(i=>!i.deletedDate),by=t=>live.filter(i=>i.type===t).length,H=pmHealth(),hd=PM.hdr||{},P=pmPref();
 const logins=by(1),bad=new Set([...H.reused,...H.weak,...H.http].map(i=>i.id)).size;
 /* score: 70 points from password health, 30 from protections that are switched on */
 const prot=[
  ['Fingerprint unlock',!!hd.bio,8,'Settings > Unlock with fingerprint'],
  ['PIN unlock',!!hd.pin,4,'Settings > Unlock with PIN'],
  ['Authenticator step on unlock',typeof pmTfaOn==='function'&&pmTfaOn(),8,'Settings > Authenticator step (TOTP)'],
  ['Recovery (backup codes or email key)',(typeof pmHasCodes==='function'&&pmHasCodes())||!!(hd.mail&&hd.mail.w),5,'Settings > Backup codes'],
  ['Auto-lock is on',P.lock!==-1&&P.lock!=null,5,'Settings > Auto-lock']];
 const pts=prot.reduce((a,x)=>a+(x[1]?x[2]:0),0),health=logins?Math.round(70-70*bad/logins):70;
 return{live,logins,notes:by(2),cards:by(3),ids:by(4),ssh:by(5),fav:live.filter(i=>i.favorite).length,att:live.filter(i=>(i.attachments||[]).length).length,
  trash:PM.items.length-live.length,H,bad,prot,score:Math.max(0,Math.min(100,health+pts))}}

function pmSyncMenu(e){
 const[x,y]=pmPos(e),on=pmShareOn(),lb=pmLS(PMK_BK,0);
 menu(x,y,[
  ['Back up now (encrypted)  ·  '+pmAgo(lb),()=>pmExport('enc')],
  [on?'Sync to autofill now':'Turn on autofill sync',async()=>{if(on){const c=await pmSyncShare(true);toast(c==null?'Could not sync yet.':'Synced '+c+(c===1?' login':' logins'))}else{await pmShareToggle();if(PM.scr==='dash')pmRedraw()}}],
  ...(on?[['Turn off autofill sync',async()=>{await pmShareToggle();if(PM.scr==='dash')pmRedraw()}]]:[]),
  ['hr'],
  ['Import from a file',()=>pmImportFile()],
  ['More in Settings',()=>pmTab('set')]])}

function pmDashScr(B){
 const S=pmDashStats(),hd=PM.hdr||{},em=hd.email||'',hr=new Date().getHours(),
  gr=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening',nm=em?em.split('@')[0]:'';
 pmHead('Dashboard','Conduint Passwords',false,[
  ['video','Videos',()=>{pmClose();goCat('vids')}],
  ['cloud','Sync and backup',e=>pmSyncMenu(e)],
  ['plus','Add item',pmAddMenu],
  ['gear','Settings',()=>pmTab('set')]]);
 /* welcome + score */
 const col=S.score>=85?'var(--acc)':S.score>=60?'#ffb020':'var(--red)',lab=S.score>=85?'Strong':S.score>=60?'Fair':'At risk';
 const ring=h('div','pmring',null,h('b',null,String(S.score)),h('small',null,'/100'));ring.style.setProperty('--p',S.score);ring.style.setProperty('--c',col);
 const wel=h('div','pmwel',null,ring,h('div',null,null,
  h('small','pmgr',gr+(nm?',':'')),h('b','pmnm',nm||'Welcome back'),h('small','pmem',em),
  h('span','pmlab',lab+' security'),
  h('small','pmem',S.logins?(S.bad?S.bad+(S.bad===1?' login needs':' logins need')+' attention':'All '+S.logins+' logins look healthy'):'Add logins to see your score')));
 B.append(h('div','pmdc pmhero',null,wel));
 /* counts */
 const T=[['Passwords',S.logins,'key','t:1'],['Secure notes',S.notes,'doc','t:2'],['Cards',S.cards,'file','t:3'],['Identities',S.ids,'phone','t:4'],['SSH keys',S.ssh,'code','t:5'],['Favorites',S.fav,'star','fav'],['Attachments',S.att,'zip','att'],['Trash',S.trash,'trash','trash']];
 const grid=h('div','pmtiles');
 T.forEach(([t,n,ic,f])=>{const b=h('button','pmtile',null,ico(ic),h('b',null,String(n)),h('small',null,t));b.onclick=()=>{PM.flt=f;PM.q='';pmTab('vault')};grid.append(b)});
 B.append(h('small','pmsech2','Your vault'),grid);
 /* password health */
 B.append(h('small','pmsech2','Password health'));
 const hs=[['reused','Reused'],['weak','Weak'],['http','Unsecure sites'],['no2fa','No 2FA key']];
 const hrow=h('div','pmhrow');
 hs.forEach(([k,t])=>{const n=S.H[k].length,b=h('button','pmhc'+(n&&k!=='no2fa'?' bad':''),null,h('b',null,String(n)),h('small',null,t));b.onclick=()=>{if(n)pmGo('hlist',{hk:k});else toast('None found.')};hrow.append(b)});
 B.append(hrow);
 const pw=PM.pwned;
 B.append(pmSetRow('Breach check',pw?'Checked '+pmAgo(new Date(pw.at).getTime()):'Check every password against known breaches. Needs internet.',pw?String(pw.hits.length):'Check',()=>{if(pw&&pw.hits.length)pmGo('hlist',{hk:'pwned'});else pmBreach()}));
 /* sync + backup */
 const lb=pmLS(PMK_BK,0),on=pmShareOn(),old=!lb||Date.now()-lb>30*86400000;
 B.append(h('small','pmsech2','Sync and backup'));
 B.append(pmSetRow('Encrypted backup',lb?'Last backup '+pmAgo(lb)+(old?'. Time for a new one.':''):'No backup yet. Save a .cndpm to your Drive or SD card.',lb&&!old?'OK':'Back up',()=>pmExport('enc')));
 B.append(pmSetRow('Autofill sync',on?'On. Logins with a website address are kept ready for other apps.':'Off. Turn on to use Conduint to sign in to other apps.',pmSwitch(on),async()=>{await pmShareToggle();pmRedraw()}));
 if(on)B.append(pmSetRow('Sync now','Send the latest logins to autofill',null,async()=>{const c=await pmSyncShare(true);toast(c==null?'Could not sync yet.':'Synced '+c+(c===1?' login':' logins'))}));
 /* protections */
 B.append(h('small','pmsech2','Protections'));
 S.prot.forEach(([t,ok,pt,where])=>B.append(pmSetRow(t,ok?'On':where,ok?'On':'Off',()=>pmTab('set'))));
 /* V0.52.0: is Conduint Password Manager the trusted passkey provider and autofill service on this phone? Tap opens the Android page that switches it on. */
 if(typeof PMCR!=='undefined'&&PMCR){
  const pr=pmSetRow('Passkeys & Autofill','Checking…','…',()=>pmGo('auto'));B.append(pr);
  PMCR.status().then(st=>{if(!pr.isConnected)return;st=st||{};
   const pk=st.passkeyCapable?!!st.providerOn:true,af=st.autofillCapable?!!st.autofillOn:true,ok=pk&&af;
   const sub=ok?'Conduint Password Manager is trusted for passkeys and autofill':(!pk&&!af?'Not switched on for passkeys or autofill. Tap to switch on.':!pk?'Passkeys are not switched on. Tap to switch on.':'Autofill is not switched on. Tap to switch on.');
   const d=pr.querySelector('small,.pmmu,.sub');if(d)d.textContent=sub;
   const c=pr.querySelector('.pmcnt');if(c)c.textContent=ok?'On':'Off'}).catch(()=>{if(pr.isConnected)pr.remove()})}
 /* quick actions */
 B.append(h('small','pmsech2','Quick actions'));
 const qa=h('div','pmqa');
 [['plus','New login',()=>pmNew(1)],['doc','New note',()=>pmNew(2)],['down','Import',()=>pmImportFile()],['lock','Lock now',()=>pmLock()]].forEach(([ic,t,fn])=>{const b=h('button','pmqb',null,ico(ic),h('span',null,t));b.onclick=fn;qa.append(b)});
 B.append(qa);
 /* recent */
 const rec=S.live.slice().sort((a,b)=>String(b.revisionDate).localeCompare(String(a.revisionDate))).slice(0,5);
 B.append(h('small','pmsech2','Recently changed'));
 if(!rec.length)B.append(h('div','pmempty','Nothing yet. Tap + to add your first item.'));
 else{const L=h('div','pmlist');rec.forEach(it=>L.append(pmRowEl(it)));B.append(L);
  const all=h('button','chip pmbtn','Open the full vault ('+S.live.length+')');all.onclick=()=>{PM.flt='all';PM.q='';pmTab('vault')};B.append(all)}
 B.append(h('small','pmmu pmdates','AES-256-GCM · everything stays on this phone\nStrategy Over Impulse'))}

/* Videos shortcut in the main top bar (opens the Videos list; the Gallery is not changed) */
{const v=document.getElementById('bvid');if(v)v.onclick=()=>{try{pmOpen&&PM.open&&pmClose()}catch{}goCat('vids')}}
