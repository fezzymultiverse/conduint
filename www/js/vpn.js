/* vpn.js: the VPN screen (V0.26.0, Shield phase 4). Tools > VPN.
   Native side: VpnPlugin (bridge), VpnCore (WireGuard engine, encrypted profiles, rotation), VpnKeeper (background service).
   Config text goes into the native side and never comes back: this file only ever sees summaries, never a private key. */
const VP={d:null,tm:null,key:undefined,ap:null,apps:[],busy:false};
/* V0.34.0: app firewall state. rules = {package: 'wifi'|'mobile'|'both'|'focus'} (an app with no rule is not blocked) */
const FW={d:null,rules:{},q:'',f:'all',busy:false};
const FW_RULES=[['','Allow'],['wifi','Wi-Fi'],['mobile','Mobile'],['both','Both'],['focus','Focus']];
const FW_NET={wifi:'Wi-Fi',mobile:'mobile data',other:'another network',none:'no network'};
const vpIn=ms=>{const m=Math.max(0,Math.round(ms/60000));return m>=60?Math.floor(m/60)+' h '+(m%60)+' min':(m<1?'under a minute':m+' min')};
const VP_DNS=[['Server default',''],['Cloudflare','1.1.1.1, 1.0.0.1'],['Cloudflare: malware','1.1.1.2, 1.0.0.2'],['Cloudflare: malware + adult','1.1.1.3, 1.0.0.3'],['AdGuard: ads + trackers','94.140.14.14, 94.140.15.15'],['AdGuard: + adult','94.140.14.15, 94.140.15.16'],['Quad9: malware','9.9.9.9, 149.112.112.112']];
const vch=(t,on,f)=>{const b=h('button','chip'+(on?' on':''),t);b.onclick=f;return b};
let vpMsg=e=>(e&&e.message&&e.message!=='Cancelled')?e.message:'That did not work.';

/* load profiles + settings from the native side; never throws */
async function vpLoad(){
 try{VP.d=await VPN.profiles()}
 catch(e){VP.d=VP.d||{profiles:[],settings:{},error:''};toast(vpMsg(e))}
 await fwLoad();
 return VP.d}

/* V0.34.0: firewall state from the native side; never throws */
async function fwLoad(){
 if(!VPN||typeof VPN.fwState!=='function')return FW.d;
 try{FW.d=await VPN.fwState()}catch(e){FW.d=FW.d||{enabled:false,running:false,net:'none',rules:{},wgUp:false}}
 return FW.d}
const fwCount=r=>{const c={wifi:0,mobile:0,both:0,focus:0};Object.values(r||{}).forEach(v=>{if(c[v]!==undefined)c[v]++});c.all=c.wifi+c.mobile+c.both+c.focus;return c};

/* same as vpRun, but keeps its own state so the profile list is never overwritten */
async function fwRun(label,fn){
 const go=async()=>{try{return await fn()}
  catch(e){if(e&&e.code==='VPN_NOT_AUTHORIZED'){
    const g=await VPN.requestPermission();
    if(!g||!g.granted)throw Error('Android did not allow the VPN. Tap again and accept the request.');
    return await fn()}
   throw e}};
 let r=null;
 try{r=await job(label,go)}catch(e){toast(vpMsg(e));return null}
 if(r&&r!==true)FW.d=r;
 return r}

/* run a native call behind the busy overlay. Missing VPN consent is asked for once, then the call is retried. */
async function vpRun(label,fn){
 const go=async()=>{try{return await fn()}
  catch(e){if(e&&e.code==='VPN_NOT_AUTHORIZED'){
    const g=await VPN.requestPermission();
    if(!g||!g.granted)throw Error('Android did not allow the VPN. Tap Connect again and accept the request.');
    return await fn()}
   throw e}};
 VP.busy=true;
 let r;try{r=await job(label,go)}finally{VP.busy=false}
 if(r&&r!==true){VP.d=r}
 return r}

async function tVpn(){
 TV.view='vpn';
 if(!VPN){drawVpn();return}
 await vpLoad();drawVpn()}

function drawVpn(){
 TV.view='vpn';clearInterval(VP.tm);
 const B=$('#tbody');B.replaceChildren();B.classList.remove('auscreen');head('VPN',true);
 if(!VPN){B.append(h('div','empty','The VPN runs inside the Android app.'));return}
 const d=VP.d||{profiles:[],settings:{},error:''},P=d.profiles||[],s=d.settings||{};
 const up=P.find(p=>p.active)||null;
 VP.key=(up?'UP':'DOWN')+'|'+(up?up.id:'');

 /* ---- status card ---- */
 const card=h('div','dc vpcard'+(up?' on':''));
 const orb=h('div','vporb',null,ico('shield'));
 const stats=h('div','vpstats',null,
  h('span',null,null,h('small',null,'Down'),h('b',null,'0 B')),
  h('span',null,null,h('small',null,'Up'),h('b',null,'0 B')));
 stats.children[0].lastChild.id='vprx';stats.children[1].lastChild.id='vptx';
 const nx=h('small','vpnx','');nx.id='vpnx';
 const btn=onOff(!!up,async v=>{
  if(!v){const r=await vpRun('Disconnecting…',()=>VPN.disconnect());if(r){VP.upKnown=0;drawVpn();if(typeof layRefresh==='function')layRefresh()}return}
  const pick=P.find(p=>p.id===s.activeId&&!p.bad)||P.find(p=>!p.bad);
  if(!pick)return toast('No usable profile. Import a WireGuard config first.');
  const r=await vpRun('Connecting…',()=>VPN.connect({id:pick.id}));
  if(r){VP.upKnown=1;toast('VPN connected.');drawVpn();if(typeof layRefresh==='function')layRefresh()}},!P.length);
 card.append(orb,h('b','vpstate','VPN is '+(up?'ON':'OFF')),
  h('small','vpsub',up?'Connected to '+up.name+(up.endpoint?' · '+up.endpoint:''):(P.length?'Not connected. Tap ON to start.':'Import a WireGuard config to begin.')),
  stats,nx,btn);
 if(up&&P.filter(p=>!p.bad).length>1){
  const nb=h('button','chip','Next server now');
  nb.onclick=async()=>{const r=await vpRun('Switching server…',()=>VPN.next());if(r){toast('Now on '+(r.now||'the next server')+'.');drawVpn()}};
  card.append(nb)}
 card.append(h('small','vpslogan','STRATEGY OVER IMPULSE · S.O.I. × BOJACK SECURITY'));
 const er=h('div','ban vperr',d.error||'');er.id='vperr';er.style.display=d.error?'block':'none';


 /* ---- V0.34.0: block apps (Wi-Fi, mobile data, both, Focus) ---- */
 const fd=FW.d||{enabled:false,running:false,net:'none',rules:{},wgUp:false},fc=fwCount(fd.rules);
 const fwc=h('div','dc shcard'+(fd.enabled?' fwon':''),null,h('b',null,'Block apps'),
  h('small',null,'Cut chosen apps off from Wi-Fi, from mobile data, or from both. Focus blocks an app completely: no network of any kind. Works without root. Android allows one VPN at a time, so turning this on disconnects the WireGuard VPN above, and connecting that VPN turns this off.'),
  h('small','fwsum',fd.enabled?('ON · '+(fd.running?'blocking now, on '+(FW_NET[fd.net]||'the network'):'starting…')):('OFF · '+(fc.all?fc.all+(fc.all===1?' app is':' apps are')+' set to be blocked':'no apps chosen yet'))),
  fc.all?h('small','fwsum','Wi-Fi '+fc.wifi+' · Mobile '+fc.mobile+' · Both '+fc.both+' · Focus '+fc.focus):'');
 const fwr=h('div','shrow');
 fwr.append(vch('Block apps: '+(fd.enabled?'On':'Off'),!!fd.enabled,fwToggle),vch('Choose apps…',false,fwOpen));
 fwc.append(fwr);

 /* ---- rotation ---- */
 const rot=h('div','dc shcard',null,h('b',null,'Auto-rotate servers'),
  h('small',null,'Switches to the next profile on a timer, also with the screen off. A server that fails is skipped. The connection drops for a second or two at each switch.'));
 const rt=vch(s.rotate?'On':'Off',!!s.rotate,async()=>{
  if(!s.rotate&&P.length<2)return toast('Add at least two profiles first.');
  try{VP.d=await VPN.setOptions({rotate:!s.rotate});drawVpn()}catch(e){toast(vpMsg(e))}});
 const iv=h('div','shrow');
 [[30,'30 min'],[60,'1 hour'],[120,'2 hours'],[360,'6 hours']].forEach(([m,t])=>
  iv.append(vch(t,(s.minutes||60)===m,async()=>{try{VP.d=await VPN.setOptions({minutes:m});drawVpn()}catch(e){toast(vpMsg(e))}})));
 const od=h('div','shrow');
 od.append(vch('In order',!s.random,async()=>{try{VP.d=await VPN.setOptions({random:false});drawVpn()}catch(e){toast(vpMsg(e))}}),
  vch('Random',!!s.random,async()=>{try{VP.d=await VPN.setOptions({random:true});drawVpn()}catch(e){toast(vpMsg(e))}}));
 rot.append(rt,iv,od);

 /* ---- background ---- */
 const bg=h('div','dc shcard',null,h('b',null,'Background'),
  h('small',null,'Keep running in the background shows a small notification with Next server and Disconnect buttons, so Android does not stop the VPN or the rotation.'));
 const kr=h('div','shrow');
 kr.append(vch('Keep running: '+(s.keepAlive!==false?'On':'Off'),s.keepAlive!==false,async()=>{try{VP.d=await VPN.setOptions({keepAlive:s.keepAlive===false});drawVpn()}catch(e){toast(vpMsg(e))}}),
  vch('Free memory when screen is off: '+(s.freeMem?'On':'Off'),!!s.freeMem,async()=>{try{VP.d=await VPN.setOptions({freeMem:!s.freeMem});drawVpn()}catch(e){toast(vpMsg(e))}}));
 const bt=h('div','shrow');
 bt.append(vch('Battery: allow unrestricted',false,()=>TOOLS&&TOOLS.openSettings({what:'battery'}).catch(()=>toast('Android\'s battery page could not be opened.'))));
 bg.append(kr,h('small',null,'Free memory asks Android to stop other apps\' background processes after the screen has been off for two minutes. Apps playing music are left alone.'),bt);

 /* ---- profiles ---- */
 const pf=h('div','dc shcard',null,h('b',null,'Profiles'));
 if(!P.length)pf.append(h('small',null,'No profiles yet. Import the .conf files from your VPN provider (for example Proton). You can add several and rotate between them.'));
 P.forEach(p=>{
  const mode=p.mode||'all',n=(p.apps||[]).length;
  const route=mode==='exclude'&&n?n+(n===1?' app':' apps')+' skip the VPN':mode==='include'&&n?'Only '+n+(n===1?' app':' apps')+' use the VPN':'All apps use the VPN';
  const row=h('div','vprow'+(p.active?' on':''),null,
   h('b',null,p.name+(p.active?' · connected':'')),
   h('small',null,p.bad?'This profile could not be read. Delete it and import it again.':((p.endpoint||'No server address')+' · '+(p.fullTunnel?'Full tunnel':'Partial tunnel')+' · '+route)));
  const acts=h('div','shrow');
  if(!p.bad&&!p.active)acts.append(vch('Connect',true,async()=>{const r=await vpRun('Connecting…',()=>VPN.connect({id:p.id}));if(r){toast('Connected to '+p.name+'.');drawVpn()}}));
  if(!p.bad)acts.append(vch('Apps…',false,()=>vpApps(p.id)));
  acts.append(vch('Rename',false,async()=>{
   const r=await dlg({title:'Rename profile',value:p.name,ok:'Save'});if(!r||!r.v)return;
   try{VP.d=await VPN.renameProfile({id:p.id,name:r.v});drawVpn()}catch(e){toast(vpMsg(e))}}),
   vch('Delete',false,async()=>{
    const r=await dlg({title:'Delete '+p.name+'?',msg:p.active?'It is connected right now, so the VPN will turn off.':'The saved config is removed from this phone.',ok:'Delete',danger:true});if(!r)return;
    try{VP.d=await VPN.deleteProfile({id:p.id});drawVpn()}catch(e){toast(vpMsg(e))}}));
  row.append(acts);pf.append(row)});

 const row=h('div','shrow');
 row.append(vch('Import config files…',true,vpImport),vch('Paste config',false,vpPaste),vch('Test connection',false,vpTest),vch('Kill switch…',false,vpKill));
 pf.append(row,h('small',null,'Profiles are stored encrypted on this phone. Delete the downloaded .conf files after importing: they contain your private key.'));

 /* ---- V0.32.1: DNS filtering through the VPN ---- */
 const dn=vpDnsCard(s,P);
 B.append(card,er,fwc,rot,bg,dn,pf,h('small','vpfoot','A VPN moves trust from your network to the server operator and does not make you anonymous. Only one VPN can be active on Android at a time.'));
 vpBadge();vpPoll()}

/* poll the live counters; when the connection or the active profile changes (rotation), redraw */
function vpPoll(){
 clearInterval(VP.tm);
 VP.tm=setInterval(async()=>{
  if(TV.view!=='vpn'||!$('#vprx')||!$('#tools').classList.contains('on')){clearInterval(VP.tm);return}
  if(VP.busy)return; /* a switch is in progress: the tunnel is briefly down on purpose, do not redraw */
  try{
   const s=await VPN.status();
   $('#vprx').textContent=fmt(s.rx||0);$('#vptx').textContent=fmt(s.tx||0);
   const nx=$('#vpnx');
   if(nx)nx.textContent=s.state==='UP'&&s.rotate?(s.nextAt?'Next server in '+vpIn(s.nextAt-Date.now()):'Rotation is on'):'';
   const e=$('#vperr');if(e){e.textContent=s.error||'';e.style.display=s.error?'block':'none'}
   const key=s.state+'|'+(s.state==='UP'?s.activeId:'');
   if(VP.key!==undefined&&VP.key!==key){VP.key=key;await vpLoad();if(TV.view==='vpn')drawVpn()}
  }catch{}},2000)}

async function vpImport(){
 try{
  const r=await VPN.importFiles();VP.d=r;
  const a=r.added||[],f=r.failed||[];
  if(a.length)toast('Added '+a.length+(a.length===1?' profile.':' profiles.'));
  if(f.length)await dlg({title:'Some files were skipped',msg:f.map(x=>x.name+'\n'+x.error).join('\n\n'),ok:'OK',nocancel:true});
  else if(!a.length)toast('Nothing was added.');
  drawVpn()}
 catch(e){if(e&&e.code!=='CANCELLED')toast(vpMsg(e))}}

async function vpPaste(){
 let t='';
 try{t=await navigator.clipboard.readText()}catch{return toast('Copy the whole config first. If Android blocks the clipboard, use Import config files instead.')}
 if(!/\[Interface\]/i.test(t||''))return toast('The clipboard does not hold a WireGuard config.');
 const r=await dlg({title:'Name this profile',value:'VPN',ok:'Save'});if(!r)return;
 try{VP.d=await VPN.addProfile({name:r.v||'VPN',config:t});toast('Profile saved.');drawVpn()}
 catch(e){toast(vpMsg(e))}
 t=''}

/* V0.31.3: tells you where a connected VPN stops working. Three quick checks from inside the app:
   1) an address with no name lookup (does the tunnel carry traffic?), 2) a name (does DNS work?), 3) IPv6. */
async function vpTest(){
 if(!((VP.d||{}).profiles||[]).some(p=>p.active))return toast('Connect the VPN first.');
 const t=async u=>{const c=new AbortController(),k=setTimeout(()=>c.abort(),6000);
  try{await fetch(u,{mode:'no-cors',cache:'no-store',signal:c.signal});return true}catch{return false}finally{clearTimeout(k)}};
 const r=await job('Testing the connection…',async()=>({a:await t('https://1.1.1.1/cdn-cgi/trace'),b:await t('https://www.cloudflare.com/cdn-cgi/trace'),c:await t('https://[2606:4700:4700::1111]/cdn-cgi/trace')}));
 if(!r||r===true)return;
 const hint=!r.a?'The tunnel carries no traffic. The keys or the server in this config are not working: try another profile.'
  :!r.b?'The tunnel works but names cannot be looked up. The DNS server in the config is not answering: try another profile.'
  :'The VPN itself works. If a download still fails, open Browser > Downloads: the reason is shown under the file (for example HTTP 403 means the site blocks VPN addresses).';
 await dlg({title:'Connection test',msg:'Through the tunnel (IPv4): '+(r.a?'works':'FAILED')+'\nName lookup (DNS): '+(r.b?'works':'FAILED')+'\nIPv6: '+(r.c?'works':'not reachable (normal for many servers)')+'\n\n'+hint,ok:'OK',nocancel:true})}

/* Android cannot let an app switch the kill switch on, so open its VPN page and say what to tick */
async function vpKill(){
 const r=await dlg({title:'Kill switch',msg:'Android only lets you turn this on yourself. On the next screen, open the settings of this VPN (the gear next to Conduint), then switch on Always-on VPN and Block connections without VPN. With both on, nothing leaves your phone outside the VPN, also while the server switches.',ok:'Open VPN settings'});
 if(!r)return;
 try{await VPN.openSettings()}catch(e){toast(vpMsg(e))}}

/* ---- per-app routing for one profile ---- */
async function vpApps(id){
 const p=((VP.d||{}).profiles||[]).find(x=>x.id===id);if(!p)return;
 if(!TOOLS)return toast('The app list runs in the Android app.');
 let apps;try{apps=(await TOOLS.userApps()).apps||[]}catch{return toast('The app list could not be read.')}
 VP.apps=apps;VP.ap={id,name:p.name,mode:p.mode||'all',sel:new Set(p.apps||[]),q:''};drawVpApps()}

function drawVpApps(){
 TV.view='vpapps';clearInterval(VP.tm);
 const A=VP.ap,B=$('#tbody');B.replaceChildren();B.classList.remove('auscreen');head('Apps · '+A.name,true);
 const md=h('div','shrow');
 [['all','All apps use the VPN'],['exclude','Selected apps skip the VPN'],['include','Only selected apps use the VPN']].forEach(([m,t])=>
  md.append(vch(t,A.mode===m,()=>{A.mode=m;drawVpApps()})));
 const q=h('input','shurl');q.type='search';q.placeholder='Search apps';q.value=A.q;
 q.oninput=()=>{A.q=q.value;vpAppList()};
 const list=h('div','vplist');list.id='vplist';
 const save=h('button','chip on','Save');
 save.onclick=async()=>{
  try{VP.d=await VPN.setRouting({id:A.id,mode:A.mode,apps:[...A.sel]});toast('Saved. It applies the next time this profile connects.');TV.view='vpn';drawVpn()}
  catch(e){toast(vpMsg(e))}};
 B.append(h('small','vpfoot','Per-app routing applies the next time this profile connects. Android cannot use both lists at once, so pick one mode.'),md,q,list,h('div','shrow',null,save));
 vpAppList()}

function vpAppList(){
 const A=VP.ap,L=$('#vplist');if(!L)return;L.replaceChildren();
 if(A.mode==='all'){L.append(h('div','empty','Every app uses the VPN. Choose a mode above to pick apps.'));return}
 const q=A.q.trim().toLowerCase();
 const rows=VP.apps.filter(a=>!q||a.name.toLowerCase().includes(q)||a.pkg.toLowerCase().includes(q));
 if(!rows.length){L.append(h('div','empty','No apps match.'));return}
 rows.forEach(a=>{
  const cb=h('input');cb.type='checkbox';cb.checked=A.sel.has(a.pkg);
  const r=h('label','vparow',null,cb,h('span',null,null,h('b',null,a.name),h('small',null,a.pkg)));
  cb.onchange=()=>{cb.checked?A.sel.add(a.pkg):A.sel.delete(a.pkg)};
  L.append(r)})}

/* ---- V0.34.0: app firewall ---- */
async function fwToggle(){
 if(!VPN||typeof VPN.fwEnable!=='function')return toast('Blocking apps runs in the Android app.');
 const d=FW.d||{enabled:false,rules:{},wgUp:false};
 if(d.enabled){const r=await fwRun('Turning off…',()=>VPN.fwEnable({on:false}));if(r)drawVpn();return}
 if(!fwCount(d.rules).all){toast('Pick at least one app first.');return fwOpen()}
 if(d.wgUp||((VP.d||{}).profiles||[]).some(p=>p.active)){
  const c=await dlg({title:'Turn the VPN off?',msg:'Android allows only one VPN at a time. Blocking apps will disconnect the WireGuard VPN. Connecting the VPN again turns blocking off.',ok:'Block apps'});
  if(!c)return}
 const r=await fwRun('Turning on…',()=>VPN.fwEnable({on:true}));
 if(r){toast('Blocking is on.');await vpLoad();drawVpn()}}

async function fwOpen(){
 if(!VPN||typeof VPN.fwSetRules!=='function'||!TOOLS)return toast('Blocking apps runs in the Android app.');
 let apps;try{apps=(await TOOLS.userApps()).apps||[]}catch{return toast('The app list could not be read.')}
 await fwLoad();
 VP.apps=apps;FW.rules=Object.assign({},(FW.d||{}).rules||{});FW.q='';FW.f='all';drawFw()}

function drawFw(){
 TV.view='vpfw';clearInterval(VP.tm);
 const B=$('#tbody');B.replaceChildren();B.classList.remove('auscreen');head('Block apps',true);
 const info=h('div','dc shcard',null,h('b',null,'Pick a rule for each app'),
  h('small',null,'Allow: online as normal. Wi-Fi: blocked only while on Wi-Fi. Mobile: blocked only on mobile data. Both: blocked on Wi-Fi and mobile data. Focus: blocked completely, on every network, always.'));
 const q=h('input','shurl');q.type='search';q.placeholder='Search apps';q.value=FW.q;
 q.oninput=()=>{FW.q=q.value;fwList()};
 const fl=h('div','shrow');
 [['all','All apps'],['blocked','Blocked only']].forEach(([k,t])=>fl.append(vch(t,FW.f===k,()=>{FW.f=k;drawFw()})));
 const list=h('div','vplist fwlist');list.id='fwlist';
 const save=h('button','chip on','Save');
 save.onclick=async()=>{
  const r=await fwRun('Saving…',()=>VPN.fwSetRules({rules:FW.rules}));
  if(r){toast(r.enabled?'Saved. Applied now.':'Saved. Turn Block apps on to use it.');TV.view='vpn';await vpLoad();drawVpn()}};
 const clr=vch('Clear all',false,()=>{FW.rules={};drawFw()});
 B.append(info,q,fl,list,h('div','shrow',null,save,clr));
 fwList()}

function fwList(){
 const L=$('#fwlist');if(!L)return;L.replaceChildren();
 const q=FW.q.trim().toLowerCase();
 const rows=VP.apps.filter(a=>(!q||a.name.toLowerCase().includes(q)||a.pkg.toLowerCase().includes(q))&&(FW.f!=='blocked'||FW.rules[a.pkg]));
 if(!rows.length){L.append(h('div','empty',FW.f==='blocked'?'No apps are blocked yet.':'No apps match.'));return}
 rows.forEach(a=>{
  const cur=FW.rules[a.pkg]||'';
  const chips=h('div','fwchips');
  FW_RULES.forEach(([k,t])=>{
   const c=vch(t,cur===k,()=>{if(k)FW.rules[a.pkg]=k;else delete FW.rules[a.pkg];fwList()});
   if(k==='focus')c.classList.add('fwfocus');
   chips.append(c)});
  L.append(h('div','fwrow'+(cur?' blk':''),null,h('b',null,a.name),h('small',null,a.pkg),chips))})}

/* ---- key icon in the top bar (V0.28.0): visible while the VPN is connected, tap opens the VPN screen.
   Android shows its own key in the status bar too; this one is Conduint's, so you see it inside the app. ---- */
async function vpBadge(){
 const b=$('#vpk');if(!b)return;
 if(!VPN||typeof VPN.status!=='function'){b.style.display='none';return}
 try{const s=await VPN.status(),up=!!s&&s.state==='UP';
  const was=VP.upKnown;VP.upKnown=up?1:0;if(was!==VP.upKnown&&typeof layRefresh==='function')layRefresh();
  b.style.display=up?'':'none';
  if(up)b.setAttribute('aria-label','VPN connected'+(s.name?' to '+s.name:'')+'. Open VPN');
 }catch{b.style.display='none'}}
{const b=$('#vpk');
 if(b){b.onclick=async()=>{try{await openTools();tVpn()}catch{}};
  if(typeof VPN!=='undefined'&&VPN){vpBadge();setInterval(()=>{if(!document.hidden)vpBadge()},5000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)vpBadge()})}}}
