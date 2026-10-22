/* shieldz.js (V0.42.5): Shield > WEB FILTERS drawn like VPN > DNS and filtering. Loaded after shieldx.js, shieldy.js, filters.js and dnsx.js. Added on top, nothing removed.
   The old chip card from shieldx.js is replaced on screen only; if anything here fails the old card stays. Nothing in Shield may ever stop the app.
   One master switch (DNS filtering for every app, through the VPN), fold groups for DNS servers (same list and same saved setting as VPN > DNS and filtering),
   a backup server, a custom server, and the browser filter groups (same switches as Browser > Settings > Blocking).
   Honest limits: DNS filtering only works while a VPN profile is connected, and applies the next time it connects. Browser filters only act inside the Conduint Browser.
   Strategy Over Impulse. */
const SHZ={ld:false};
const shzLs=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch{}return''};
const shzFoldGet=()=>{try{return JSON.parse(shzLs('cnd.shield.fold')||'{}')}catch{return{}}};
const shzCan=()=>typeof VPN!=='undefined'&&!!VPN&&typeof VPN.setOptions==='function'&&typeof VP!=='undefined';
const shzMsg=e=>(e&&e.message&&e.message!=='Cancelled')?e.message:'That did not work.';
const shzCur=()=>{try{const d=VP.d||{};return String((d.settings&&d.settings.dns!=null?d.settings.dns:d.dns)||'').trim()}catch{return''}};
const shzNorm=d=>String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//,'').replace(/^www\./,'').split(/[\/?#:]/)[0];
const shzRedraw=()=>{try{if(typeof TV!=='undefined'&&TV.view==='sh'&&$('#tbody'))drawShield()}catch{}};
const SHZ_DNSTAG={ads:'ADS',trk:'TRACKERS',adult:'ADULT'};

/* save the DNS line, remember it as the last one used, then redraw Shield */
async function shzSet(list,msg){
 const v=list.join(', ');
 try{const d=await VPN.setOptions({dns:v});VP.d=d;if(v)shzLs('cnd.vpn.dnsLast',v);
  VP.dnsDirty=!!((d&&d.profiles)||[]).some(p=>p.active);toast(msg||'DNS saved.')}
 catch(e){toast(shzMsg(e))}
 shzRedraw()}

/* browser switch changed: save, push to the browser, keep the background note current, redraw */
function shzBr(){
 try{bsave()}catch{}try{brPush()}catch{}
 try{if(typeof wtKeepSync==='function')wtKeepSync()}catch{}
 shzRedraw()}

/* one fold group; sw is an optional switch drawn at the left of the header */
function shzGroup(key,title,sub,rows,defOpen,sw){
 const f=shzFoldGet(),open=f[key]===undefined?defOpen:f[key],g=h('div','fg'+(open?' open':''));
 const hd=h('div','fgh',null,...[sw,h('div','fgt',null,h('b',null,title),h('small',null,sub)),h('span','fch','\u203a')].filter(Boolean));
 hd.onclick=()=>{const o=!g.classList.contains('open'),q=shzFoldGet();q[key]=o;shzLs('cnd.shield.fold',JSON.stringify(q));g.classList.toggle('open',o)};
 const b=h('div','fgb');rows.forEach(r=>b.append(r));g.append(hd,b);return g}

/* a browser filter group: group switch turns every item on or off, rows keep their own switch */
function shzBrGroup(g,S){
 const [gk,title,sub,rows]=g,tg=rows.filter(r=>!r.dns),cov=t=>typeof dnsCovers==='function'&&dnsCovers(t);
 const allOn=tg.length>0&&tg.every(r=>S[r.k]),n=rows.filter(r=>r.dns?cov(r.dns):!!S[r.k]).length;
 const sw=flSw(allOn,()=>{const v=!allOn;tg.forEach(r=>{S[r.k]=v});shzBr()});
 const out=rows.map(r=>{
  const x=h('div','fx',null,h('b',null,r.n),h('small',null,r.d));
  if(r.dns){const on=cov(r.dns);x.append(h('div','ftags',null,h('span','ftag'+(on?' on':''),on?'ON VIA DNS':'SET IN DNS SERVERS')));
   return h('div','fr',null,flSw(on,()=>toast('Malware and phishing are blocked by DNS. Choose a server under DNS servers above.'),true),x)}
  const tags=h('div','ftags'),cnt=(typeof BL!=='undefined'&&BL[FL_MAP[r.k]]||[]).length;
  tags.append(h('span','ftag',cnt+' DOMAINS'));
  if(SHZ_DNSTAG[r.k]&&cov(SHZ_DNSTAG[r.k]))tags.append(h('span','ftag on','ALL APPS VIA DNS'));
  x.append(tags);
  return h('div','fr',null,flSw(!!S[r.k],()=>{S[r.k]=!S[r.k];shzBr()}),x)});
 return shzGroup('z_'+gk,title,n+' OF '+rows.length+' ON \u00b7 '+sub,out,false,sw)}

/* the whole card */
function shzCard(){
 const S=BD.set,card=h('div','dc shcard');
 const can=shzCan(),cur=can?shzCur():'',st=can?dnsxParse(cur):{a:[],pr:null,bk:null,custom:false},on=!!cur;
 const last=(shzLs('cnd.vpn.dnsLast')||DNSX_ALL[0].a.join(', ')).split(/[,\s]+/).filter(Boolean);
 const brOn=FL_GROUPS.reduce((n,g)=>n+g[3].filter(r=>!r.dns&&S[r.k]).length,0)+((S.custom||[]).length&&!S.customOff?1:0);
 const sub=can?(on?'ON \u00b7 '+(st.pr?st.pr.n+(st.bk?' + BACKUP '+st.bk.n:''):'CUSTOM '+cur):'OFF \u00b7 no DNS filter for other apps')+' \u00b7 BROWSER '+brOn+' ON'
  :'BROWSER '+brOn+' ON \u00b7 DNS filtering runs in the Android app';
 card.append(h('div','fr fmaster',null,
  flSw(on,()=>{if(!can)return toast('DNS filtering runs in the Android app.');on?shzSet([],'DNS filtering is off.'):shzSet(last,'DNS filtering is on.')},!can),
  h('div','fx',null,h('b',null,'WEB FILTERS'),h('small',null,sub))),
  h('small',null,'Filtering blocks categories for every app on the phone while a VPN profile is connected. Choose one server; it applies the next time the VPN connects. Browser filters work inside the Conduint Browser.'));
 if(can){
  const P=(VP.d&&VP.d.profiles)||[],act=P.find(p=>p.active);
  if(VP.d&&!P.length)card.append(h('small','shwarn','No VPN profile yet. DNS filtering runs through the VPN: add a profile under Tools > VPN.'));
  if(VP.dnsDirty&&act&&typeof vpRun==='function')card.append(h('div','shrow',null,vch('Reconnect now to apply',true,async()=>{
   const r=await vpRun('Reconnecting\u2026',()=>VPN.connect({id:act.id}));if(r){VP.dnsDirty=false;toast('Reconnected with the new DNS.');shzRedraw()}})));
  card.append(h('small','shzh','ALL APPS \u00b7 DNS SERVERS'));
  DNSX.forEach(([k,t,s2,list])=>card.append(shzGroup('z'+k,t,s2,list.map(sv=>dnsxRow(sv,st.pr===sv,()=>st.pr===sv?shzSet([],'DNS filtering is off.'):shzSet([...sv.a,...(st.bk&&st.bk!==sv?st.bk.a:[])],sv.n+' selected.'))),k==='rec')));
  const bkRows=[h('div','fr',null,flSw(!st.bk,()=>st.pr?shzSet(st.pr.a,'Backup removed.'):toast('Choose a main server first.')),h('div','fx',null,h('b',null,'NO BACKUP'),h('small',null,'Use the main server only.')))];
  DNSX_ALL.filter(x=>x!==st.pr).forEach(sv=>bkRows.push(dnsxRow(sv,st.bk===sv,()=>st.pr?shzSet(st.bk===sv?st.pr.a:[...st.pr.a,...sv.a],sv.n+(st.bk===sv?' removed.':' set as backup.')):toast('Choose a main server first.'))));
  card.append(shzGroup('zbk','BACKUP SERVER','Used only if the main server does not answer',bkRows,false));
  const ed=vch('Edit',false,async()=>{
   const r=await dlg({title:'Custom DNS',msg:'One to four addresses, separated by commas. Example: 94.140.14.14, 94.140.15.15. Leave empty to turn DNS filtering off.',value:cur,ok:'Save'});if(!r)return;
   const l=String(r.v||'').split(/[,\s]+/).filter(Boolean),bad=l.filter(x=>!dnsxOk(x));
   if(bad.length)return toast('Not a valid address: '+bad[0]);if(l.length>4)return toast('Four addresses at most.');
   shzSet(l,l.length?'Custom DNS saved.':'DNS filtering is off.')});
  card.append(shzGroup('zcu','CUSTOM SERVER','Your own addresses',[h('div','fr',null,h('div','fx',null,h('b',null,st.custom?'IN USE':'NOT IN USE'),h('small',null,st.custom?cur:'Enter any resolver address.')),ed)],false))}
 card.append(h('small','shzh','IN THE CONDUINT BROWSER'));
 FL_GROUPS.forEach(g=>card.append(shzBrGroup(g,S)));
 const c=S.custom||[],tags=h('div','ftags'),x=h('div','fx',null,h('b',null,'BLOCKED SITES'),h('small',null,'Any site you want blocked, including everything under it.'));
 if(c.length){c.forEach(d=>tags.append(h('span','ftag on',String(d).toUpperCase())));x.append(tags)}
 const ce=vch('Edit',false,async()=>{
  const r=await dlg({title:'Blocked sites',msg:'Websites to block, separated by commas. Example: example.com, news.site',value:c.join(', '),ok:'Save'});if(!r)return;
  const raw=String(r.v||'').split(/[,\s]+/).filter(Boolean),l=[],bad=[];
  raw.forEach(d=>{const n=shzNorm(d);if(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(n)){if(!l.includes(n))l.push(n)}else bad.push(d)});
  if(bad.length)return toast('Not a web address: '+bad[0]);
  S.custom=l;shzBr()});
 card.append(shzGroup('zcl','YOUR LIST',(S.customOff?'OFF':'ON')+' \u00b7 '+c.length+(c.length===1?' SITE':' SITES')+' you added',[h('div','fr',null,x,ce)],false,flSw(!S.customOff,()=>{S.customOff=!S.customOff;shzBr()})));
 card.append(h('small',null,'Gambling and shopping lists are not offered by public DNS servers, so they are blocked in the Conduint Browser. Categories are what each provider publishes.'));
 return card}

/* put the new card where the old chip card was; load the VPN state once if it is not loaded yet */
function shzMount(){
 const B=$('#tbody');if(!B)return;
 if(typeof BD==='undefined'||!BD||!BD.set||typeof FL_GROUPS==='undefined'||typeof flSw!=='function'||typeof DNSX==='undefined')return;
 const old=[...B.children].find(el=>el.classList&&el.classList.contains('shcard')&&el.firstElementChild&&el.firstElementChild.tagName==='B'&&el.firstElementChild.textContent==='Web filters');
 if(!old)return;
 const card=shzCard();old.replaceWith(card);
 if(shzCan()&&!VP.d&&!SHZ.ld&&typeof vpLoad==='function'){
  SHZ.ld=true;
  vpLoad().catch(()=>{}).then(()=>{SHZ.ld=false;if(card.isConnected)shzRedraw()})}}
const _drawShieldZ=drawShield;
drawShield=function(){
 _drawShieldZ();
 try{shzMount()}catch(e){try{console.warn('shieldz',e)}catch{}}};
