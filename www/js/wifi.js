/* wifi.js (V0.28.5): Tools > Wi-Fi check. Native side: WifiPlugin.check() returns plain facts about the network the phone is on.
   This file turns them into findings. It never reads or shows the network name or any address of the phone.
   Severity: high = do not trust this network, med = look at it, low = good to know.
   Safety rule: nothing in here may stop the app. A failed check shows a plain sentence and carries on. */
const WFB={busy:false,last:null};
const WF_SEC={0:['high','Open Wi-Fi: no password, so nothing stops people nearby reading what is not encrypted'],
 1:['high','WEP security: it is broken and can be cracked in minutes'],
 2:['ok','Password-protected (WPA or WPA2)'],3:['ok','Enterprise security (WPA2 or WPA3 with a login)'],
 4:['ok','Strong security (WPA3)'],5:['ok','Strong enterprise security (WPA3, 192-bit)'],9:['ok','Enterprise security (WPA3)'],
 6:['low','Encrypted but open to anyone (Enhanced Open): nearby people cannot read your traffic, but anyone can join']};
/* r = what WifiPlugin.check() returned. Returns {verdict,level,items:[{sev,label,why}],notes:[text]} */
function wfAnalyze(r){
 const items=[],notes=[],add=(sev,label,why)=>items.push({sev,label,why:why||''});
 if(!r||r.error)return{verdict:(r&&r.error)||'The check could not run.',level:'low',items,notes};
 if(!r.online)return{verdict:'Not connected to any network.',level:'low',items,notes};
 if(r.transport==='cellular')notes.push('You are on mobile data. The Wi-Fi security type does not apply; the sign-in and DNS checks still ran.');
 if(r.vpn)notes.push('A VPN is on, so the sign-in and DNS checks ran through the VPN tunnel. Turn the VPN off and run again to test the Wi-Fi network itself.');
 /* security type */
 if(r.viaWifi){
  const t=r.security?r.security.type:-1,m=WF_SEC[t];
  if(m){if(m[0]==='ok')add('ok',m[1]);else add(m[0],m[1],t===0?'Use a VPN, or leave this network for anything private.':t===1?'Ask for a WPA2 or WPA3 network.':'')}
  else if(t===-1)add('low','Android did not report the security type','This needs Android 12 or newer.');
  else add('low','Other Wi-Fi security type ('+t+')')}
 /* captive portal */
 const c=r.captive||{};
 if(c.flag)add('med','This network wants a sign-in page (captive portal)','Until you sign in, traffic may be redirected. Do not enter passwords on a page you did not expect.');
 if(c.probe==='tls'&&!c.flag)add('high','Secure connections are being intercepted','A secure test page was answered with a certificate Android does not trust. Someone on this network may be reading or changing traffic.');
 else if(c.probe==='redirect')add('med','This network rewrote a secure test page','A page that should answer with nothing came back with content: a sign-in or filter page is in the way.');
 else if(c.probe==='fail'&&!c.flag)add('med','No answer from the internet','The network is connected but the test pages did not answer.');
 else if(c.probe==='ok'&&!c.flag)add('ok','Direct internet: no sign-in page or interception found');
 /* DNS */
 const d=r.dns||{};
 if(d.nxdomain==='rewritten')add('high','DNS answers names that cannot exist','A made-up name came back with an address. This network rewrites DNS answers: hijacking, or a filter that injects pages or ads.');
 const wrong=(d.anchors||[]).filter(a=>a.result==='wrong').map(a=>a.host);
 if(wrong.length)add('high','DNS gave a wrong answer for '+wrong.join(' and '),'These names have fixed answers. A different one means the DNS reply was replaced, so sites you open may not be the real ones.');
 else if((d.anchors||[]).length&&(d.anchors||[]).every(a=>a.result==='none')&&c.probe==='ok')add('low','Could not check the fixed DNS answers','Both test names failed to resolve.');
 else if((d.anchors||[]).length&&d.nxdomain!=='rewritten')add('ok','DNS answers match: no sign of DNS replacement');
 if((d.private||[]).length)add('med','DNS answered a public site with a private or blank address ('+d.private.join(', ')+')','A filtering DNS does this on purpose to block sites. A hijack can do it too. If you did not set a filter, treat this network with care.');
 if(d.privateOn===false)add('low','Private DNS is off','DNS questions travel as plain text and this network can read and change them. Android Settings > Network > Private DNS (automatic or a provider name) fixes that.');
 else if(d.privateOn===true)add('ok','Private DNS is on'+(d.privateHost?' ('+d.privateHost+')':''));
 const sv=d.servers||[];
 if(sv.length)notes.push('DNS servers in use: '+sv.join(', '));
 const hi=items.filter(x=>x.sev==='high').length,me=items.filter(x=>x.sev==='med').length;
 return hi?{verdict:'Not safe: '+hi+(hi===1?' serious problem':' serious problems')+' found.',level:'high',items,notes}
  :me?{verdict:'Look at '+me+(me===1?' thing':' things')+' on this network.',level:'med',items,notes}
  :{verdict:'No problems found on this network.',level:'ok',items,notes}}
async function tWifi(){TV.view='wifi';drawWifi()}
function drawWifi(){
 TV.view='wifi';const B=$('#tbody');B.replaceChildren();B.classList.remove('auscreen');head('Wi-Fi check',true);
 if(typeof WIFI==='undefined'||!WIFI){B.append(h('div','empty','The Wi-Fi check runs inside the Android app.'));return}
 const top=h('div','dc shcard',null,h('b',null,'Check this network'),
  h('small',null,'Looks at the Wi-Fi security type, whether a sign-in page is in the way, and whether DNS answers are being replaced. It never shows the network name or your address, and nothing is uploaded.'));
 const go=h('button','chip on','Run the check');go.onclick=()=>wfRun(go);top.append(go);B.append(top);
 const res=h('div','shres');res.id='wfres';B.append(res);
 if(WFB.last)wfShow(WFB.last)}
function wfShow(a){
 const o=$('#wfres');if(!o)return;o.replaceChildren();
 const v=h('div','dc shcard',null,h('b',null,a.verdict));v.firstChild.style.color=a.level==='high'?'var(--red)':a.level==='med'?'#ffb54a':'var(--acc)';o.append(v);
 a.items.forEach(x=>o.append(h('div','shlg '+(x.sev==='high'?'blocked':x.sev==='med'?'noted':''),null,h('b',null,x.label),...(x.why?[h('small',null,x.why)]:[]))));
 a.notes.forEach(t=>o.append(h('div','note',t)))}
async function wfRun(btn){
 if(WFB.busy)return;WFB.busy=true;const lab=btn&&btn.textContent;if(btn){btn.textContent='Checking…';btn.disabled=true}
 const fx=typeof shFxOn==='function';try{if(fx)shFxOn('Checking this network…')}catch{}
 let a;
 try{const r=await Promise.race([WIFI.check(),new Promise((_,j)=>setTimeout(()=>j(Error('The check took too long.')),30000))]);a=wfAnalyze(r)}
 catch(e){a={verdict:(e&&e.message)||'The check could not run.',level:'low',items:[],notes:[]}}
 WFB.last=a;WFB.busy=false;
 try{if(fx)shFxDone(a.level==='high'?'bad':'ok',a.level==='high'?'Problem found':'Checked')}catch{}
 try{if(a.level==='high'&&typeof shNote==='function')shNote('block','Wi-Fi check found a problem',a.items.filter(x=>x.sev==='high').map(x=>x.label).join('\n'))}catch{}
 if(btn&&btn.isConnected){btn.textContent=lab;btn.disabled=false}
 if(TV.view==='wifi')wfShow(a)}

/* ---------- V0.50.0: the Wi-Fi name on Home ----------
   Shown under the greeting while you are on Wi-Fi. Android only reveals a Wi-Fi name to an app that may use Location, so the first time on Wi-Fi
   Conduint asks once. If you say no it stays quiet (it never nags). The name is only shown, never saved or sent. Settings > Wi-Fi name on Home turns it off. */
const WHN={last:'',busy:false};
function wfShow2(txt){const el=$('#dsub');if(!el)return;WHN.last=txt;
 if(!txt){el.replaceChildren();el.classList.remove('wfn');return}
 el.classList.add('wfn');el.replaceChildren(ico('globe'),h('span',null,txt))}
async function wfHome(ask){
 if(WHN.busy||typeof WIFI==='undefined'||!WIFI||!WIFI.ssid||!document.body.classList.contains('home'))return;
 if(S.settings.ssidOn===false)return wfShow2('');
 WHN.busy=true;
 try{
  const first=ask&&!S.settings.ssidAsked;
  const r=await WIFI.ssid({ask:!!first});
  if(first){S.settings.ssidAsked=true;save()}
  if(!r||!r.granted)return wfShow2('');
  if(!r.wifi)return wfShow2('');
  wfShow2(r.ssid?r.ssid:'Wi-Fi connected (turn on Location to see its name)')}
 catch{wfShow2('')}
 finally{WHN.busy=false}}
/* check when Home opens, when the app comes back, and when the connection changes */
setTimeout(()=>wfHome(true),1500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)wfHome(false)});
addEventListener('online',()=>setTimeout(()=>wfHome(false),800));addEventListener('offline',()=>wfShow2(''));
try{if(navigator.connection)navigator.connection.addEventListener('change',()=>setTimeout(()=>wfHome(false),800))}catch{}
setInterval(()=>{if(!document.hidden)wfHome(false)},10000);
