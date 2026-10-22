/* shieldy.js: Shield V0.39.0. Loaded after shieldx.js. Added on top, nothing removed.
   [1] Four result labels: Clean, Suspicious, Malicious match, Not fully scanned (nothing unreadable or skipped reads as Clean any more).
   [2] Scan history with times and per-file findings (kept on this phone, last 20 scans).
   [3] Quarantine: move a flagged file into a hidden .conduint-quarantine folder next to it, renamed so it cannot run; Restore or Delete forever.
   [4] Deeper archive scan: inside .zip .jar .docx .xlsx .pptx .odt (up to 300 files, 20 MB each, 150 MB in total). 7z, rar and tar are only checked by name and type.
   [5] Signed rule updates: a link update must carry an ECDSA P-256 signature (the .sig file) that matches the key in shieldkey.js, and cannot be older than the rules in use.
   Honest limits: a file check, not a full antivirus. No real-time protection. Quarantine needs the file's folder, so it works for folder scans and the device scan, not for loose files picked one by one. */
const SHYH='cnd.shield.hist',SHYQ='cnd.shield.quar',SHY_MAXF=300,SHY_ENTRY=20971520,SHY_TOTAL=157286400;
const SHY_L={mal:'Malicious match',sus:'Suspicious',inc:'Not fully scanned',ok:'Clean'};
const SHY_INC=/^(Too big to scan|Could not read this file|Scan error|Archive contents not scanned|Archive scan stopped)/;
const SHY_ZIPX=new Set(['zip','jar','docx','xlsx','pptx','odt']),SHY_NEST=new Set(['zip','jar','apk','7z','rar','tar','gz','tgz']);
const SHY={cur:null};
const shyCls=f=>f.some(x=>x.sev==='high')?'mal':f.some(x=>x.sev==='med')?'sus':f.some(x=>SHY_INC.test(x.label))?'inc':'ok';
const shyParent=it=>it.parent||(/^file:\/\//.test(it.uri||'')?String(it.uri).replace(/\/[^\/]+\/?$/,''):'');
const shyExt=n=>(String(n||'').indexOf('.')>=0?String(n).split('.').pop():'').toLowerCase();
const shyRow={mal:'blocked',sus:'noted',inc:'noted',ok:''};

/* ---- [2] sessions and history ---- */
function shyBegin(src){
 const s={id:Date.now(),t0:Date.now(),src:src||'Scan',n:0,c:{ok:0,sus:0,mal:0,inc:0},files:[],mem:[],
  add(it,f,st){this.n++;this.c[st]++;if(st==='ok')return;
   const L=f.filter(x=>x.sev!=='low'||SHY_INC.test(x.label)).map(x=>x.label.slice(0,140));
   if(this.files.length<100)this.files.push({n:it.name,st,f:L.slice(0,4)});
   this.mem.push({n:it.name,st,f:f.slice(0,6),uri:it.uri,p:shyParent(it),sz:it.size})}};
 SHY.cur=s;return s}
function shyEnd(s){
 if(SHY.cur===s)SHY.cur=null;if(!s||!s.n)return;
 s.t1=Date.now();const h0=shJ(SHYH,[]);
 h0.unshift({id:s.id,t0:s.t0,t1:s.t1,src:s.src,n:s.n,c:s.c,files:s.files});shSet(SHYH,h0.slice(0,20))}
function shyDetail(s){
 const sec=Math.max(1,Math.round((s.t1-s.t0)/1000)),c=s.c;
 const head=new Date(s.t0).toLocaleString()+' · '+sec+' s · '+s.src+'\n'+s.n+' files: '+c.ok+' clean · '+c.sus+' suspicious · '+c.mal+' malicious match · '+c.inc+' not fully scanned';
 const body=s.files.slice(0,40).map(x=>SHY_L[x.st]+': '+x.n+(x.f.length?'\n   '+x.f.slice(0,3).join(' · '):'')).join('\n');
 dlg({title:'Scan details',msg:head+'\n\n'+(body||'Every file was clean.')+(s.files.length>40?'\nand '+(s.files.length-40)+' more':''),ok:'OK',nocancel:true})}

/* ---- [4] deeper archive scan ---- */
async function shyInflate(bytes,cap){
 const rd=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let n=0;
 for(;;){const r=await rd.read();if(r.done)break;n+=r.value.length;if(n>cap){try{await rd.cancel()}catch{}return null}parts.push(r.value)}
 const o=new Uint8Array(n);let p=0;for(const x of parts){o.set(x,p);p+=x.length}return o}
async function shyZip(it,rules,f){
 const add=(sev,label)=>{if(!f.some(x=>x.label===label))f.push({sev,label})},nm0=it.name||'';
 let b;try{const r=await SAF.cacheCopy({uri:it.uri,name:nm0});b=await(await fetch(CAP.convertFileSrc?CAP.convertFileSrc(r.path):r.path)).blob()}catch{return}
 const sz=b.size;if(sz<22||sz>SH_MAX)return;
 const tl=new Uint8Array(await b.slice(Math.max(0,sz-65557),sz).arrayBuffer());let p=-1;
 for(let i=tl.length-22;i>=0;i--){if(tl[i]===0x50&&tl[i+1]===0x4B&&tl[i+2]===5&&tl[i+3]===6){p=i;break}}
 if(p<0)return;
 const cdSize=u32(tl,p+12),cdOff=u32(tl,p+16);
 if(cdOff===0xFFFFFFFF||cdSize===0xFFFFFFFF){add('low','Archive contents not scanned: very large archive format');return}
 if(cdOff+cdSize>sz||cdSize>4194304)return;
 const cd=new Uint8Array(await b.slice(cdOff,cdOff+cdSize).arrayBuffer());
 let pos=0,count=0,total=0;
 while(pos+46<=cd.length&&cd[pos]===0x50&&cd[pos+1]===0x4B&&cd[pos+2]===1&&cd[pos+3]===2){
  const fl=u16(cd,pos+8),me=u16(cd,pos+10),cs=u32(cd,pos+20),us=u32(cd,pos+24),nl=u16(cd,pos+28),el=u16(cd,pos+30),cl=u16(cd,pos+32),off=u32(cd,pos+42);
  const nm=new TextDecoder('utf-8').decode(cd.subarray(pos+46,pos+46+nl));pos+=46+nl+el+cl;
  if(nm.endsWith('/'))continue;
  if(++count>SHY_MAXF){add('low','Archive scan stopped: more than '+SHY_MAXF+' files inside, the rest was not scanned');break}
  const tag='Inside archive: '+nm+': ',ext=shyExt(nm);
  for(const r of rules.names){try{if(shRe(r).test(nm))add(r.sev||'med',tag+r.label)}catch{}}
  if(SHY_NEST.has(ext)&&nm!=='AndroidManifest.xml'){add('low','Archive contents not scanned: an archive inside the archive')}
  if(fl&1){add('low','Archive contents not scanned: some files inside are password protected');continue}
  if(us>SHY_ENTRY){add('low','Archive contents not scanned: a file inside is larger than 20 MB');continue}
  total+=us;if(total>SHY_TOTAL){add('low','Archive scan stopped: more than 150 MB inside, the rest was not scanned');break}
  if(me!==0&&me!==8){add('low','Archive contents not scanned: an unusual compression method');continue}
  try{
   const lh=new Uint8Array(await b.slice(off,off+30).arrayBuffer());
   if(lh.length<30||u32(lh,0)!==0x04034B50){add('med','Archive looks damaged (a file entry points to the wrong place)');continue}
   const st0=off+30+u16(lh,26)+u16(lh,28),raw=new Uint8Array(await b.slice(st0,st0+cs).arrayBuffer());
   const dat=me===0?raw:await shyInflate(raw,Math.max(us,1024)+1024);
   if(!dat){add('med',tag+'expands to far more than the archive says (zip bomb)');continue}
   if(dat.length<=SH_HASHMAX){try{const d=new Uint8Array(await crypto.subtle.digest('SHA-256',dat)),hex=[...d].map(x=>x.toString(16).padStart(2,'0')).join(''),hit=rules.hashes[hex];if(hit)add('high',tag+'Known malware: '+hit)}catch{}}
   const hd=dat.subarray(0,65536),act=shKind(hd),hs=shStr(hd);
   for(const r of rules.content){try{const n=(r.all||[r.text||'']).join('');if(n&&hs.indexOf(n)>=0)add(r.sev||'high',tag+r.label)}catch{}}
   if(SH_PROG[act]&&SH_TEXT.has(ext)&&ext)add('med',tag+'a '+SH_PROG[act]+' is hiding behind a .'+ext+' name');
   if(nm.toLowerCase().endsWith('vbaproject.bin'))add('med',tag+'Office macros (can run code when opened)');
   if(!act&&dat.length<=2097152&&(SH_TEXT.has(ext)||(hd[0]===0x23&&hd[1]===0x21))){
    const t=new TextDecoder('utf-8').decode(dat.subarray(0,409600));
    for(const r of rules.scripts){try{if(shRe(r).test(t))add(r.sev||'med',tag+r.label)}catch{}}}
  }catch{add('low','Archive contents not scanned: a file inside could not be read')}}}
const _shScanItemY=shScanItem;
shScanItem=async function(it,rules){
 const f=await _shScanItemY(it,rules);
 if(SHY.cur){
  try{const ext=shyExt(it.name);
   if(!f.some(x=>x.sev==='high')&&!f.some(x=>/^Too big to scan|^Could not read/.test(x.label))){
    if(SHY_ZIPX.has(ext))await shyZip(it,rules,f);
    else if(/^(7z|rar|tar|gz|tgz|bz2|xz)$/.test(ext))f.push({sev:'low',label:'Archive contents not scanned: .'+ext+' archives are only checked by name and type'})}}catch{}
  SHY.cur.add(it,f,shyCls(f))}
 return f};

/* walks: same as before, plus the folder each file lives in (for quarantine), and they skip the quarantine folder */
shWalk=async function(uri,out,depth,st){
 let r;try{r=await SAF.list({uri})}catch{st.skip++;return}
 for(const x of r.items||[]){if(out.length>=SH_WALKMAX){st.cap=true;return}
  if(x.dir){if(depth<8&&!/^\.conduint-quarantine$/.test(x.name||''))await shWalk(x.uri,out,depth+1,st)}else out.push({uri:x.uri,name:x.name,size:x.size,parent:uri})}};
shxWalk=async function(uri,out,depth,st){
 if(SHX.stop||out.length>=SHX_MAX){st.cap=out.length>=SHX_MAX;return}
 let r;try{r=await SAF.list({uri})}catch{st.skip++;return}
 for(const x of r.items||[]){
  if(SHX.stop||out.length>=SHX_MAX){st.cap=out.length>=SHX_MAX;return}
  if(x.dir){if(depth<14&&x.name!=='.conduint-quarantine'&&!/\/Android\/(data|obb)(\/|$)/i.test(decodeURIComponent(String(x.uri||''))))await shxWalk(x.uri,out,depth+1,st)}
  else{out.push({uri:x.uri,name:x.name,size:x.size,parent:uri});if(out.length%250===0)shFxText('Listing files… '+out.length)}}};
const _shxScanAllY=shxScanAll;
shxScanAll=async function(){const s=shyBegin('Whole device');try{return await _shxScanAllY()}finally{shyEnd(s)}};

/* ---- [1] the scan run, now with the four labels, history and a Quarantine button ---- */
shRun=async function(items,src){
 const out=$('#shres');if(out)out.replaceChildren();
 const S0=shyBegin(src||(items.length===1?items[0].name:items.length+' files'));
 try{const rules=await shRules();shFxOn('Scanning…');let i=0;const rows=[];
  for(const it of items){i++;shFxText(i+'/'+items.length+'  '+it.name);let f=[];
   try{f=await shScanItem(it,rules)}catch(e){f=[{sev:'low',label:'Scan error: '+(e.message||e)}];S0.add(it,f,shyCls(f))}
   shTally(it.name,f);const st=shyCls(f);
   rows.push({it,st,f,txt:f.filter(x=>x.sev!=='low'||SHY_INC.test(x.label)).map(x=>x.label).join(' · ')})}
  const c=S0.c,bad=c.mal,note=c.sus+c.inc;
  shFxDone(bad?'bad':'ok',bad?bad+' dangerous':note?'Check results':'Clean');
  const sum=items.length+(items.length===1?' file':' files')+' scanned · '+bad+' malicious match · '+c.sus+' suspicious · '+c.inc+' not fully scanned';
  const badRows=rows.filter(r=>r.st==='mal').map(r=>r.it.name+': '+(r.f.find(x=>x.sev==='high')||{label:''}).label);
  if(bad)shNote('block',bad===1?'Shield found a dangerous file':'Shield found '+bad+' dangerous files',badRows.slice(0,5).join('\n')+(bad>5?'\nand '+(bad-5)+' more':'')+'\n'+sum);
  else shNote('scan','Shield scan finished',sum);
  const o=$('#shres');
  if(o){o.append(h('div','dc shcard',null,h('b',null,sum)));
   rows.forEach(r=>{const el=h('div','shlg '+shyRow[r.st],null,h('b',null,r.it.name),h('small',null,SHY_L[r.st]+(r.txt?': '+r.txt:'')));
    if(r.st==='mal'||r.st==='sus'){const m=S0.mem.find(x=>x.uri===r.it.uri&&x.n===r.it.name);
     const b=h('button','chip','Quarantine');b.onclick=async()=>{b.disabled=true;if(await shyQuar(m||{n:r.it.name,uri:r.it.uri,p:shyParent(r.it),f:r.f,st:r.st})){el.remove()}else b.disabled=false};el.append(b)}
    o.append(el)})}
  return{n:items.length,bad,note,inc:c.inc,flag:rows.filter(r=>r.st!=='ok').map(r=>r.it.name+': '+SHY_L[r.st]+(r.txt?' ('+r.txt.slice(0,120)+')':''))}}
 catch(e){shFxOff();toast(e.message||'The scan failed.');return null}
 finally{shyEnd(S0)}};

/* ---- [3] quarantine ---- */
async function shyQuar(rec){
 if(!rec||!rec.uri)return false;
 if(!rec.p){toast('Conduint cannot move this one because it was picked without its folder. Scan the folder instead, or delete the file yourself.');return false}
 try{
  let hash='';if(!rec.sz||rec.sz<=SH_HASHMAX){try{const r=await SAF.cacheCopy({uri:rec.uri,name:rec.n}),bl=await(await fetch(CAP.convertFileSrc?CAP.convertFileSrc(r.path):r.path)).blob();
    hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await bl.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('')}catch{}}
  const d=await SAF.ensureDir({parent:rec.p,name:'.conduint-quarantine'});
  const m=await SAF.move({items:[{uri:rec.uri,parent:rec.p}],parent:d.uri});
  let u=(m&&m.uris&&m.uris[0])||'';if(!u)throw Error('Could not move the file.');
  let qn=rec.n;try{const r=await SAF.rename({uri:u,name:rec.n+'.quarantined'});if(r&&r.uri){u=r.uri;qn=rec.n+'.quarantined'}}catch{}
  const q=shJ(SHYQ,[]);
  q.unshift({id:Date.now(),n:rec.n,qn,uri:u,qd:d.uri,p:rec.p,t:Date.now(),sz:rec.sz||0,st:rec.st||'mal',f:(rec.f||[]).filter(x=>x.sev!=='low').slice(0,4).map(x=>String(x.label).slice(0,140)),h:hash});
  shSet(SHYQ,q);toast('Quarantined '+rec.n+'.');shRefreshUI();return true}
 catch(e){toast('Could not quarantine: '+((e&&e.message)||'unknown error'));return false}}
async function shyRestore(q){
 if(!await dlg({title:'Restore '+q.n+'?',msg:'Shield flagged this file'+(q.f[0]?': '+q.f[0]:'')+'.\nIt goes back to where it was found. Only restore it if you are sure it is safe.',ok:'Restore'}))return;
 try{const m=await SAF.move({items:[{uri:q.uri,parent:q.qd}],parent:q.p});const u=m&&m.uris&&m.uris[0];
  if(u&&q.qn!==q.n){try{await SAF.rename({uri:u,name:q.n})}catch{}}
  shSet(SHYQ,shJ(SHYQ,[]).filter(x=>x.id!==q.id));toast('Restored '+q.n+'.');shRefreshUI()}
 catch(e){toast('Could not restore: '+((e&&e.message)||'the original folder may have moved')+'.')}}
async function shyDelete(q){
 if(!await dlg({title:'Delete '+q.n+' forever?',msg:'This cannot be undone.',ok:'Delete forever'}))return;
 try{await SAF.remove({uris:[q.uri]});shSet(SHYQ,shJ(SHYQ,[]).filter(x=>x.id!==q.id));toast('Deleted '+q.n+'.');shRefreshUI()}
 catch(e){toast('Could not delete: '+((e&&e.message)||'unknown error'))}}

/* ---- the two new cards on the Shield screen ---- */
const _drawShieldY=drawShield;
drawShield=function(){
 _drawShieldY();
 const B=$('#tbody');if(!B)return;
 const qs=shJ(SHYQ,[]),hs=shJ(SHYH,[]);
 const qc=h('div','dc shcard',null,h('b',null,'Quarantine'),h('small',null,qs.length?qs.length+(qs.length===1?' file is':' files are')+' held in a hidden folder next to where they were found, renamed so they cannot run.':'Nothing in quarantine. After a folder scan, dangerous or suspicious files get a Quarantine button.'));
 qs.slice(0,30).forEach(q=>{
  const el=h('div','shlg blocked',null,h('b',null,q.n),h('small',null,(q.f[0]||'Flagged')+' · '+new Date(q.t).toLocaleString()+(q.h?' · SHA-256 '+q.h.slice(0,12)+'…':'')));
  const r=h('div','shrow'),b1=h('button','chip','Restore'),b2=h('button','chip','Delete forever');
  b1.onclick=()=>shyRestore(q);b2.onclick=()=>shyDelete(q);r.append(b1,b2);el.append(r);qc.append(el)});
 const hc=h('div','dc shcard',null,h('b',null,'Scan history'));
 if(!hs.length)hc.append(h('small',null,'No scans yet.'));
 hs.forEach(s=>{const el=h('div','shlg'+(s.c.mal?' blocked':s.c.sus||s.c.inc?' noted':''),null,h('b',null,s.src),h('small',null,new Date(s.t0).toLocaleString()+' · '+s.n+' files · '+s.c.mal+' malicious · '+s.c.sus+' suspicious · '+s.c.inc+' not fully scanned'));
  el.style.cursor='pointer';el.onclick=()=>shyDetail(s);hc.append(el)});
 if(hs.length){const c=h('button','chip','Clear history');c.onclick=()=>{try{localStorage.removeItem(SHYH)}catch{}drawShield()};hc.append(c)}
 B.append(qc,hc)};

/* ---- [5] signed rule updates ---- */
const _shGetY=shGet;let SHY_V=false;
async function shyVerify(txt,u){
 const k=typeof SHY_KEY!=='undefined'?SHY_KEY:null;
 if(!k||!k.x||!k.y)throw new Error('Rule updates from a link are switched off until a signing key is set (see "Signed rule updates" in the README). The rules built into the app stay in use.');
 let sig;try{const U=new URL(u);U.pathname=U.pathname.replace(/\/+$/,'')+'.sig';sig=await _shGetY(U.toString())}
 catch{throw new Error('No signature found. It must sit at the rules link plus .sig. Nothing changed.')}
 let ok=false;
 try{const raw=Uint8Array.from(atob(String(sig).trim().replace(/\s+/g,'')),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:k.x,y:k.y,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,raw,new TextEncoder().encode(txt))}catch{ok=false}
 if(!ok)throw new Error('The signature does not match, so these rules were not used. Nothing changed.')}
shGet=async function(u){const t=await _shGetY(u);if(!SHY_V)return t;SHY_V=false;await shyVerify(t,u);return t};
const _shUpdateY=shUpdate;
shUpdate=async function(u){u=(u||(S.settings.shUrl||'')).trim();SHY_V=true;try{return await _shUpdateY(u)}finally{SHY_V=false}};
