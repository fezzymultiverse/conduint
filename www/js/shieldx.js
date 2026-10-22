/* shieldx.js: Shield additions (V0.36.0). Loaded after shield.js, watch.js, browser.js and vpn.js. Added on top, nothing removed.
   [1] Web filters inside Shield: the same switches as Browser > Settings > Blocking (ads, trackers, adult, gambling, shopping) and the DNS filter picks.
   [2] Run in the background: a shield icon in the notification bar and a wake lock (the existing keep-running service), switched on here.
   [3] Scan the whole device: walks all storage (needs All files access), skips Android/data and Android/obb, up to 30,000 files, with Stop.
   Honest limits: the browser switches filter pages inside the Conduint Browser. Filtering other apps is done by DNS (VPN), and Android allows one VPN at a time.
   The device scan checks files with the same rules as Scan a folder: a file check, not a full antivirus. Strategy Over Impulse. */
const SHX={stop:false,run:false};
const SHX_MAX=30000,SHX_DNS=[['Off',''],['Malware','1.1.1.2, 1.0.0.2'],['Malware + adult','1.1.1.3, 1.0.0.3'],['Ads + trackers','94.140.14.14, 94.140.15.15'],['Ads + adult','94.140.14.15, 94.140.15.16']];
const shxCount=()=>{try{return typeof BD!=='undefined'&&BD&&BD.set&&typeof BL_CATS!=='undefined'?BL_CATS.filter(c=>BD.set[c[0]]).length+((BD.set.custom||[]).length?1:0):0}catch{return 0}};

/* [2] the background notification: reuse the keep-running service, with a Shield wording (KeepService draws the shield badge for it) */
const _wtNoteTextX=typeof wtNoteText==='function'?wtNoteText:null;
wtNoteText=function(){
 if(S.settings.shBg){const n=typeof wtActive==='function'?wtActive().length:0,f=shxCount();
  return 'Shield is on · '+(f?f+(f===1?' web filter':' web filters'):'file check')+(n?' · watching '+n+(n===1?' folder':' folders'):'')}
 return _wtNoteTextX?_wtNoteTextX():'Keeping Conduint running'};
wtKeepSync=async function(){
 if(!WATCH)return;
 const want=!!S.settings.keep||!!S.settings.shBg||(typeof wtActive==='function'&&wtActive().length>0);
 try{if(want)await WATCH.start({minutes:S.settings.watchMin||5,text:wtNoteText()});else await WATCH.stop()}catch{}};

/* [1] + [2] cards on the Shield screen, right under the on/off card */
const _drawShieldX=drawShield;
drawShield=function(){
 _drawShieldX();
 const B=$('#tbody'),first=B.firstElementChild;if(!first)return;
 const cards=[];
 /* web filters */
 const wf=h('div','dc shcard',null,h('b',null,'Web filters'),h('small',null,'Ads, trackers and bad sites are blocked inside the Conduint Browser. To filter every app on the phone, pick a DNS filter below (it runs through the VPN).'));
 if(typeof BD!=='undefined'&&BD&&BD.set&&typeof BL_CATS!=='undefined'){
  const row=h('div','shrow');
  BL_CATS.forEach(([k,l])=>{const on=!!BD.set[k],c=h('button','chip'+(on?' on':''),l.replace(/^Block /,'')+': '+(on?'On':'Off'));
   c.onclick=()=>{BD.set[k]=!on;try{bsave();brPush()}catch{}wtKeepSync();drawShield()};row.append(c)});
  wf.append(row)}
 else wf.append(h('small','shwarn','The browser filters are not available in this build.'));
 if(typeof VPN!=='undefined'&&VPN&&typeof VPN.setOptions==='function'){
  const cur=(typeof VP!=='undefined'&&VP&&VP.d&&VP.d.dns!=null?String(VP.d.dns):'').trim(),dr=h('div','shrow');
  wf.append(h('small',null,'All apps (DNS filter)'));
  SHX_DNS.forEach(([t,v])=>{const c=h('button','chip'+(cur===v?' on':''),t);
   c.onclick=async()=>{try{const d=await VPN.setOptions({dns:v});if(typeof VP!=='undefined'&&VP)VP.d=d;toast(v?'DNS filter set. Reconnect the VPN to use it.':'DNS filter off.')}catch(e){toast((e&&e.message)||'Could not set it.')}drawShield()};dr.append(c)});
  wf.append(dr)}
 cards.push(wf);
 /* background protection */
 if(typeof NATIVE!=='undefined'&&NATIVE&&typeof WATCH!=='undefined'&&WATCH){
  const bg=!!S.settings.shBg,bc=h('div','dc shcard',null,h('b',null,'Run in the background'),
   h('small',null,'Shows a shield icon in your notifications while Shield is on and keeps Conduint awake with a wake lock, so filters and folder checks keep working with the screen off. Swiping Conduint away from recent apps stops it.'));
  const t=h('button','chip'+(bg?' on':''),bg?'On':'Off');
  t.onclick=async()=>{S.settings.shBg=!bg;save();if(!bg&&typeof wtKeepAsk==='function'){try{await wtKeepAsk()}catch{}}await wtKeepSync();drawShield()};
  bc.append(t);
  if(bg&&typeof PERM!=='undefined'&&PERM&&(PERM.battery===false||PERM.notifications===false))bc.append(h('small','shwarn','Android may stop this: '+(PERM.notifications===false?'notifications are off for Conduint. ':'')+(PERM.battery===false?'the battery optimiser is not switched off for Conduint.':'')));
  cards.push(bc)}
 /* whole device scan */
 const dv=h('div','dc shcard',null,h('b',null,'Scan the whole device'),h('small',null,'Checks every file in phone storage (and the SD card) with the same rules as Scan a folder. Needs All files access. Up to '+SHX_MAX.toLocaleString()+' files; large scans take a while.'));
 const sb=h('button','chip on',SHX.run?'Scanning…':'Scan whole device'),st=h('button','chip','Stop');
 sb.onclick=shxScanAll;st.onclick=()=>{SHX.stop=true;toast('Stopping after the current file…')};dv.append(h('div','shrow',null,sb,st));
 cards.push(dv);
 first.after(...cards)};

/* [3] whole device scan */
async function shxWalk(uri,out,depth,st){
 if(SHX.stop||out.length>=SHX_MAX){st.cap=out.length>=SHX_MAX;return}
 let r;try{r=await SAF.list({uri})}catch{st.skip++;return}
 for(const x of r.items||[]){
  if(SHX.stop||out.length>=SHX_MAX){st.cap=out.length>=SHX_MAX;return}
  if(x.dir){if(depth<14&&!/\/Android\/(data|obb)(\/|$)/i.test(decodeURIComponent(String(x.uri||''))))await shxWalk(x.uri,out,depth+1,st)}
  else{out.push({uri:x.uri,name:x.name,size:x.size});if(out.length%250===0)shFxText('Listing files… '+out.length)}}}
async function shxScanAll(){
 if(SHX.run)return toast('A device scan is already running.');
 try{
  if(typeof NATIVE==='undefined'||!NATIVE||typeof SAF==='undefined'||!SAF)return toast('The device scan runs in the Android app.');
  await readPerm();
  if(!PERM.allFiles){const r=await dlg({title:'Allow All files access',ok:'Open settings',msg:'Scanning the whole device needs All files access. Switch it on for Conduint, then come back and tap Scan whole device again.'});if(r)askPerm('allFiles');return}
  let R;try{R=await SAF.roots()}catch(e){return toast((e&&e.message)||'Could not read storage.')}
  const roots=[R.internal,...((R.removable||[]).map(x=>x.uri))].filter(Boolean);
  if(!roots.length)return toast('No storage found.');
  SHX.run=true;SHX.stop=false;shFxOn('Listing files…');
  const out=[],st={skip:0,cap:false};
  for(const u of roots)await shxWalk(u,out,0,st);
  if(!out.length){shFxOff();SHX.run=false;return toast(SHX.stop?'Stopped.':'No files found.')}
  const rules=await shRules(),bad=[],note=[];let i=0;
  for(const it of out){
   if(SHX.stop)break;i++;
   if(i%10===0||i===1){shFxText(i+'/'+out.length+'  '+it.name);await new Promise(r=>setTimeout(r,0))}
   let f=[];try{f=await shScanItem(it,rules)}catch{continue}
   const t=shTally(it.name,f);
   if(t.hi.length)bad.push(it.name+': '+t.hi[0].label);else if(t.me.length)note.push(it.name+': '+t.me[0].label)}
  const done=Math.min(i,out.length),stopped=SHX.stop;
  shFxDone(bad.length?'bad':'ok',bad.length?bad.length+' dangerous':stopped?'Stopped':'Clean');
  const sum=done+' files scanned · '+bad.length+' dangerous · '+note.length+' to check'+(stopped?' (stopped early)':'')+(st.cap?'\nOnly the first '+SHX_MAX.toLocaleString()+' files were listed.':'')+(st.skip?'\n'+st.skip+(st.skip===1?' folder':' folders')+' could not be read.':'');
  if(bad.length)shNote('block',bad.length===1?'Shield found a dangerous file':'Shield found '+bad.length+' dangerous files',bad.slice(0,5).join('\n')+(bad.length>5?'\nand '+(bad.length-5)+' more':'')+'\n'+sum);
  else shNote('scan','Shield device scan finished',sum);
  SHX.run=false;SHX.stop=false;
  await dlg({title:'Device scan finished',msg:sum+'\n\n'+(bad.length?bad.slice(0,12).join('\n')+(bad.length>12?'\nand '+(bad.length-12)+' more':''):'Nothing dangerous found.')+(note.length?'\n\nTo check:\n'+note.slice(0,8).join('\n')+(note.length>8?'\nand '+(note.length-8)+' more':''):''),ok:'OK',nocancel:true});
  if(TV&&TV.view==='sh')drawShield()}
 catch(e){SHX.run=false;shFxOff();if(e&&e.code!=='CANCELLED')toast((e&&e.message)||'The scan failed.')}}
