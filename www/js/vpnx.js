/* vpnx.js: VPN improvements (V0.38.0). Loaded after vpn.js. Added on top, nothing removed.
   [1] Server clarity: the connected card names the server, endpoint, DNS and routes, and the profile rows say Connected / Idle.
   [2] Diagnostics: the live status line explains "no handshake yet" and "handshake is old" in plain words; connect errors are explained, not just shown.
   [3] Leak test: IPv4 through the tunnel, a name lookup, IPv6, and the config check (does it route ::/0, does it name a DNS server).
   [4] Honest notes: counters are real (WireGuard's own byte counts, first value now shown at once), the kill switch is Android's and cannot be verified from inside an app,
       and imported profiles decide the servers: Conduint sells no VPN and runs no servers.
   Strategy Over Impulse. */
const VPX={since:0,key:'',last:null};
const vpxAgo=ms=>{const s=Math.round(ms/1000);return s<60?s+' s':s<3600?Math.round(s/60)+' min':Math.round(s/3600)+' h'};
/* explains a native error in plain words; the original text stays at the end so nothing is hidden */
function vpxExplain(msg){
 const m=String(msg||'');if(!m)return'';
 let w='';
 if(/handshake|timed out|timeout|no route|unreachable|network is unreachable|connection refused/i.test(m))w='The server did not answer. It may be down, the endpoint address or port may be wrong, or your network blocks UDP. Try another profile or another network.';
 else if(/key|auth|decrypt|denied|invalid|not authorized|permission/i.test(m))w='The server refused the keys. The private or public key in this profile does not match the server, or the account behind it expired. Download a fresh config from your provider.';
 else if(/dns|resolve|unknown host|name or service/i.test(m))w='The server address could not be looked up. Check the Endpoint line, or use the server\u2019s IP address instead of a name.';
 else if(/config|parse|can.t be used|bad/i.test(m))w='The profile file is damaged or not a WireGuard config. Delete it and import it again.';
 else if(/engine|backend|could not start/i.test(m))w='The WireGuard engine did not start on this phone. Restart the phone and try again.';
 return w?w+'\n\n('+m+')':m}
const _vpMsgX=vpMsg;
vpMsg=function(e){return vpxExplain(_vpMsgX(e))};

/* [1] + [2] + [4]: wrap the VPN screen */
const _drawVpnX=drawVpn;
drawVpn=function(){
 _drawVpnX();
 if(!VPN)return;
 const B=$('#tbody'),d=VP.d||{profiles:[]},P=d.profiles||[],up=P.find(p=>p.active)||null;
 /* connected card: full server line */
 const sub=B.querySelector('.vpsub');
 if(sub&&up){
  const dns=(up.dns&&up.dns.length)?up.dns.join(', '):'none in the config (your network\u2019s DNS is used)';
  sub.textContent=up.name+' · '+(up.endpoint||'no endpoint');
  const det=h('small','vpsub',(up.fullTunnel?'Full tunnel':'Partial tunnel')+' · IPv4 '+(up.v4route?'through the tunnel':'not routed')+' · IPv6 '+(up.v6route?'through the tunnel':'not routed')+'\nDNS: '+dns);
  det.style.whiteSpace='pre-line';sub.after(det)}
 /* live line under the counters */
 const nx=$('#vpnx');
 if(nx){const dg=h('small','vpsub','');dg.id='vpdiag';dg.style.whiteSpace='pre-line';nx.after(dg)}
 /* stats: show the first real value now instead of waiting two seconds */
 vpxPoll();
 /* profile rows: Connected / Idle, endpoint always visible */
 B.querySelectorAll('.vprow').forEach((row,i)=>{const p=P[i];if(!p||p.bad)return;const b=row.querySelector('b');
  if(b&&!/connected/.test(b.textContent))b.textContent=p.name+' · idle'});
 /* provider transparency */
 const ft=B.querySelector('.vpfoot');
 const note=h('small','vpfoot','Where the servers come from: Conduint does not sell a VPN and runs no servers. The profiles you import (the .conf files from your VPN provider) decide which servers and countries you can use, and the provider sees your traffic. Country and provider are not shown because a WireGuard config holds only an address; name your profiles after the provider and place, for example "Proton NL".\nNumbers on the card are real: they are WireGuard\u2019s own byte counts for this tunnel.');
 note.style.whiteSpace='pre-line';if(ft)ft.before(note);else B.append(note)};
async function vpxPoll(){
 try{
  if(!VPN||TV.view!=='vpn'||!$('#vprx'))return;
  const s=await VPN.status();
  $('#vprx').textContent=fmt(s.rx||0);$('#vptx').textContent=fmt(s.tx||0);
  const key=s.state+'|'+(s.activeId||'');if(VPX.key!==key){VPX.key=key;VPX.since=s.state==='UP'?Date.now():0}
  const dg=$('#vpdiag');if(!dg)return;
  let t='';
  if(s.state==='UP'){
   const up=Date.now()-VPX.since,ha=s.handshakeAgo;
   if(ha<0)t=up<20000?'Connecting… waiting for the first handshake.':'No handshake after '+vpxAgo(up)+'. The server is not answering: wrong endpoint or keys, the server is down, or UDP is blocked on this network.';
   else if(ha>180000)t='Last handshake '+vpxAgo(ha)+' ago. The tunnel may have dropped. If pages stop loading, tap Next server now or reconnect.';
   else t='Handshake '+vpxAgo(ha)+' ago. The tunnel is alive.'}
  dg.textContent=t}
 catch{}}
/* the original poll keeps redrawing on changes; this second timer only adds the diagnostics line */
setInterval(()=>{if(typeof TV!=='undefined'&&TV&&TV.view==='vpn'&&!VP.busy)vpxPoll()},2000);

/* [3] leak test */
vpTest=async function(){
 const P=(VP.d||{}).profiles||[],up=P.find(p=>p.active);
 if(!up)return toast('Connect the VPN first.');
 const t=async u=>{const c=new AbortController(),k=setTimeout(()=>c.abort(),6000);
  try{await fetch(u,{mode:'no-cors',cache:'no-store',signal:c.signal});return true}catch{return false}finally{clearTimeout(k)}};
 const r=await job('Testing the connection…',async()=>({a:await t('https://1.1.1.1/cdn-cgi/trace'),b:await t('https://www.cloudflare.com/cdn-cgi/trace'),c:await t('https://[2606:4700:4700::1111]/cdn-cgi/trace')}));
 if(!r||r===true)return;
 const hasDns=!!(up.dns&&up.dns.length),lines=[],warn=[];
 lines.push('Traffic through the tunnel (IPv4): '+(r.a?'works':'FAILED'));
 lines.push('Name lookup (DNS): '+(r.b?'works':'FAILED'));
 lines.push('IPv6 reachable: '+(r.c?'yes':'no'));
 lines.push('Config routes: IPv4 '+(up.v4route?'all':'not all')+', IPv6 '+(up.v6route?'all':'not all'));
 lines.push('Config DNS: '+(hasDns?up.dns.join(', '):'none'));
 if(!r.a)warn.push('The tunnel carries no traffic. The keys or the server in this profile are not working: try another profile.');
 else if(!r.b)warn.push('The tunnel works but names cannot be looked up. The DNS server in the profile is not answering: try another profile.');
 if(r.c&&!up.v6route)warn.push('IPv6 LEAK RISK: IPv6 works but this profile does not route IPv6 (::/0) through the VPN, so IPv6 traffic can go around it. Use a profile whose AllowedIPs include ::/0, or turn IPv6 off on your network.');
 if(!hasDns)warn.push('DNS LEAK RISK: the profile names no DNS server, so name lookups can go to your network\u2019s resolver. Set one in VPN > DNS and filtering, then reconnect.');
 if(up.v4route===false&&up.fullTunnel)warn.push('This profile does not route all IPv4 through the VPN.');
 const ok=!warn.length;
 await dlg({title:ok?'Leak test: no problems found':'Leak test: check this',msg:lines.join('\n')+'\n\n'+(ok?'The VPN works and nothing in the config suggests a DNS or IPv6 leak. This test reads your config and what is reachable; it cannot see which resolver answered. Run it again after a server switch.':warn.join('\n\n')),ok:'OK',nocancel:true})};

/* kill switch: say what can and cannot be checked */
const _vpKillX=vpKill;
vpKill=async function(){
 const r=await dlg({title:'Kill switch',msg:'Conduint cannot switch the kill switch on or check it from inside the app: Android keeps that setting to itself. On the next screen open this VPN\u2019s settings (the gear next to Conduint) and switch on Always-on VPN and Block connections without VPN.\n\nTo prove it works: connect, turn on airplane mode for a moment, turn it off, and watch that nothing loads until the tunnel is back. The status line on the VPN card also warns when no handshake has happened for a while.',ok:'Open VPN settings'});
 if(!r)return;
 try{await VPN.openSettings()}catch(e){toast(vpMsg(e))}};
