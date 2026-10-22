/* dnsx.js (V0.42.0): VPN > DNS AND FILTERING. Master switch, servers grouped by what they block, backup server, custom addresses.
   Writes the real VPN DNS option (VPN.setOptions({dns})), which replaces the DNS line of the active profile on the next connect.
   Android asks the first address first and only moves on if it does not answer, so a backup keeps names resolving; it does not add blocking. */
const DNSX=[
 ['rec','RECOMMENDED','Servers that block three or more categories',[
  {n:'ADGUARD DEFAULT',a:['94.140.14.14','94.140.15.15'],t:['ADS','TRACKERS','MALWARE','PHISHING'],d:'General-purpose ad, tracker and threat filtering.'},
  {n:'ADGUARD FAMILY',a:['94.140.14.15','94.140.15.16'],t:['ADS','TRACKERS','MALWARE','PHISHING','ADULT','SAFE SEARCH'],d:'Everything in Default, plus adult sites and enforced safe search.'},
  {n:'CLOUDFLARE FAMILY',a:['1.1.1.3','1.0.0.3'],t:['MALWARE','PHISHING','ADULT'],d:'Fast resolver with threat and adult-content filtering.'},
  {n:'CLEANBROWSING FAMILY',a:['185.228.168.168','185.228.169.168'],t:['ADULT','MALWARE','PHISHING','PROXIES AND VPNS','SAFE SEARCH'],d:'Strict family filter. May block proxy and VPN websites.'}]],
 ['sec','SECURITY ONLY','Threats only, nothing else is blocked',[
  {n:'QUAD9',a:['9.9.9.9','149.112.112.112'],t:['MALWARE','PHISHING'],d:'Non-profit resolver with threat blocking.'},
  {n:'CLOUDFLARE SECURITY',a:['1.1.1.2','1.0.0.2'],t:['MALWARE','PHISHING'],d:'Cloudflare with threat blocking only.'},
  {n:'CLEANBROWSING SECURITY',a:['185.228.168.9','185.228.169.9'],t:['MALWARE','PHISHING'],d:'Blocks malicious and phishing domains.'}]],
 ['plain','NO FILTERING','Fast resolvers that block nothing',[
  {n:'CLOUDFLARE',a:['1.1.1.1','1.0.0.1'],t:[],d:'Plain, fast resolver.'},
  {n:'ADGUARD NON-FILTERING',a:['94.140.14.140','94.140.14.141'],t:[],d:'Plain resolver, no blocking.'}]]];
const DNSX_ALL=DNSX.flatMap(g=>g[3]);
const dnsxLs=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch{}return''};
const dnsxFold=()=>{try{return JSON.parse(dnsxLs('cnd.vpn.dnsFold')||'{}')}catch{return{}}};
function dnsxParse(cur){
 const a=String(cur||'').split(/[,\s]+/).filter(Boolean),pr=DNSX_ALL.find(s=>s.a[0]===a[0]&&s.a[1]===a[1])||null,rest=pr?a.slice(2):[];
 const bk=pr&&rest.length?DNSX_ALL.find(s=>s.a[0]===rest[0]&&s.a[1]===rest[1])||null:null;
 return{a,pr,bk,custom:a.length>0&&!pr}}
function dnsCovers(tag){try{const st=dnsxParse(((VP.d||{}).settings||{}).dns);return !!(st.pr&&st.pr.t.includes(String(tag).toUpperCase()))}catch{return false}}
const dnsxOk=t=>(/^(\d{1,3}\.){3}\d{1,3}$/.test(t)&&t.split('.').every(n=>+n<=255))||(/^[0-9a-f:]{2,39}$/i.test(t)&&t.includes(':'));
async function dnsxSet(list,msg){
 const v=list.join(', ');
 try{VP.d=await VPN.setOptions({dns:v});if(v)dnsxLs('cnd.vpn.dnsLast',v);VP.dnsDirty=((VP.d.profiles||[]).some(p=>p.active));drawVpn();toast(msg||'DNS saved.')}
 catch(e){toast(vpMsg(e))}}
function dnsxGroup(key,title,sub,rows,defOpen){
 const f=dnsxFold(),open=f[key]===undefined?defOpen:f[key],g=h('div','fg'+(open?' open':''));
 const hd=h('div','fgh',null,h('div','fgt',null,h('b',null,title),h('small',null,sub)),h('span','fch','›'));
 hd.onclick=()=>{const o=!g.classList.contains('open'),q=dnsxFold();q[key]=o;dnsxLs('cnd.vpn.dnsFold',JSON.stringify(q));g.classList.toggle('open',o)};
 const b=h('div','fgb');rows.forEach(r=>b.append(r));g.append(hd,b);return g}
function dnsxRow(s,on,fn){
 const tg=h('div','ftags');s.t.forEach(t=>tg.append(h('span','ftag on',t)));if(!s.t.length)tg.append(h('span','ftag','NO BLOCKING'));
 return h('div','fr',null,flSw(on,fn),h('div','fx',null,h('b',null,s.n),h('small',null,s.a.join(' · ')),tg,h('small',null,s.d)))}
function vpDnsCard(s,P){
 const cur=(s.dns||'').trim(),st=dnsxParse(cur),on=!!cur,card=h('div','dc shcard');
 const last=(dnsxLs('cnd.vpn.dnsLast')||DNSX_ALL[0].a.join(', ')).split(/[,\s]+/).filter(Boolean);
 card.append(h('div','fr fmaster',null,
  flSw(on,()=>on?dnsxSet([],'Using the server\u2019s own DNS.'):dnsxSet(last,'DNS filtering is on.')),
  h('div','fx',null,h('b',null,'DNS AND FILTERING'),h('small',null,on?'ON · '+(st.pr?st.pr.n+(st.bk?' + BACKUP '+st.bk.n:''):'CUSTOM '+cur):'OFF · the VPN server\u2019s own DNS'))),
  h('small',null,'Filtering blocks categories for every app on the phone while the VPN is on. Choose one server; it applies the next time the VPN connects.'));
 const act=(P||[]).find(p=>p.active);
 if(VP.dnsDirty&&act)card.append(h('div','shrow',null,vch('Reconnect now to apply',true,async()=>{const r=await vpRun('Reconnecting…',()=>VPN.connect({id:act.id}));if(r){VP.dnsDirty=false;toast('Reconnected with the new DNS.');drawVpn()}})));
 DNSX.forEach(([k,t,sub,list])=>card.append(dnsxGroup(k,t,sub,list.map(sv=>dnsxRow(sv,st.pr===sv,()=>st.pr===sv?dnsxSet([],'Using the server\u2019s own DNS.'):dnsxSet([...sv.a,...(st.bk&&st.bk!==sv?st.bk.a:[])],sv.n+' selected.'))),k==='rec')));
 const bkRows=[h('div','fr',null,flSw(!st.bk,()=>st.pr?dnsxSet(st.pr.a,'Backup removed.'):toast('Choose a main server first.')),h('div','fx',null,h('b',null,'NO BACKUP'),h('small',null,'Use the main server only.')))];
 DNSX_ALL.filter(x=>x!==st.pr).forEach(sv=>bkRows.push(dnsxRow(sv,st.bk===sv,()=>st.pr?dnsxSet(st.bk===sv?st.pr.a:[...st.pr.a,...sv.a],sv.n+(st.bk===sv?' removed.':' set as backup.')):toast('Choose a main server first.'))));
 card.append(dnsxGroup('bk','BACKUP SERVER','Used only if the main server does not answer',bkRows,false));
 const ed=vch('Edit',false,async()=>{
  const r=await dlg({title:'Custom DNS',msg:'One to four addresses, separated by commas. Example: 94.140.14.14, 94.140.15.15. Leave empty to use the server\u2019s own DNS.',value:cur,ok:'Save'});if(!r)return;
  const l=String(r.v||'').split(/[,\s]+/).filter(Boolean),bad=l.filter(x=>!dnsxOk(x));
  if(bad.length)return toast('Not a valid address: '+bad[0]);if(l.length>4)return toast('Four addresses at most.');
  dnsxSet(l,l.length?'Custom DNS saved.':'Using the server\u2019s own DNS.')});
 card.append(dnsxGroup('cu','CUSTOM SERVER','Your own addresses',[h('div','fr',null,h('div','fx',null,h('b',null,st.custom?'IN USE':'NOT IN USE'),h('small',null,st.custom?cur:'Enter any resolver address.')),ed)],false));
 card.append(h('small',null,'Gambling and shopping lists are not offered by public DNS servers, so those are blocked in the Conduint Browser (Browser > Settings > Blocking). Categories are what each provider publishes.'));
 return card}
