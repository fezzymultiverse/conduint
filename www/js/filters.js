/* filters.js (V0.42.0): Browser > Settings > Blocking as grouped, collapsible lists. Switch on the left, names in capitals.
   Group switch turns every item in the group on or off; the arrow opens or closes the group (state is remembered in BD.set.fold). */
function flSw(on,fn,dis){const b=h('button','fsw'+(on?' on':'')+(dis?' dis':''),null,h('i'));b.setAttribute('role','switch');b.setAttribute('aria-checked',on?'true':'false');b.onclick=e=>{e.stopPropagation();fn(b)};return b}
const FL_MAP={ads:'ads',trk:'trackers',adult:'adult',gamb:'gambling',shop:'shopping',social:'social',mining:'mining',shorteners:'shorteners',video:'video'};
const FL_GROUPS=[
 ['security','SECURITY','Threats and risky links',[
  {k:'malware',n:'MALWARE',d:'Known malware hosts. Blocked by DNS, not by a list here.',dns:'MALWARE'},
  {k:'phishing',n:'PHISHING',d:'Fake login and scam pages. Blocked by DNS, not by a list here.',dns:'PHISHING'},
  {k:'mining',n:'CRYPTO MINERS',d:'Browser-based cryptocurrency mining.'},
  {k:'shorteners',n:'URL SHORTENERS',d:'Hide the real address of a link. May block shared links.'}]],
 ['privacy','PRIVACY','What follows you around the web',[
  {k:'ads',n:'ADS',d:'Common ad servers, blocked as parts of a page.'},
  {k:'trk',n:'TRACKERS',d:'Analytics, pixels and fingerprinting servers.'}]],
 ['parental','PARENTAL CONTROL','Whole pages blocked',[
  {k:'adult',n:'ADULT',d:'Pornography and adult cams.'},
  {k:'gamb',n:'GAMBLING',d:'Betting, casinos and poker.'}]],
 ['content','CONTENT','Shops, social and video',[
  {k:'shop',n:'SHOPPING',d:'Online shops and marketplaces.'},
  {k:'social',n:'SOCIAL MEDIA',d:'Social networks and community feeds.'},
  {k:'video',n:'VIDEO PLATFORMS',d:'Streaming and video sites. May block embedded media.'}]]];
function blFilters(B,s){
 s.fold=s.fold||{};
 B.append(bpNote('Filters block sites in this browser. Use a group switch to turn the whole group on or off, or open the group to choose single items. Reload a page after changing these.'));
 const cov=t=>typeof dnsCovers==='function'&&dnsCovers(t);
 const mkGroup=g=>{
  const [gk,title,sub,rows]=g,tg=rows.filter(r=>!r.dns),el=h('div','fg'+(s.fold[gk]?' open':'')),allOn=tg.every(r=>s[r.k]);
  const n=rows.filter(r=>r.dns?cov(r.dns):!!s[r.k]).length;
  const head=h('div','fgh',null,flSw(allOn,()=>{const v=!allOn;tg.forEach(r=>{s[r.k]=v});bsave();brPush();el.replaceWith(mkGroup(g))}),
   h('div','fgt',null,h('b',null,title),h('small',null,n+' OF '+rows.length+' ON · '+sub)),h('span','fch','›'));
  head.onclick=()=>{s.fold[gk]=!el.classList.contains('open');el.classList.toggle('open',s.fold[gk]);bsave()};
  const body=h('div','fgb');
  rows.forEach(r=>{
   const x=h('div','fx',null,h('b',null,r.n),h('small',null,r.d));
   if(r.dns){const on=cov(r.dns);x.append(h('div','ftags',null,h('span','ftag'+(on?' on':''),on?'ON VIA DNS':'SET IN VPN > DNS')));
    body.append(h('div','fr',null,flSw(on,()=>toast('Malware and phishing are blocked by DNS. Choose a server under VPN > DNS and filtering.'),true),x));return}
   const cnt=(BL[FL_MAP[r.k]]||[]).length;
   body.append(h('div','fr',null,flSw(!!s[r.k],()=>{s[r.k]=!s[r.k];bsave();brPush();el.replaceWith(mkGroup(g))}),x,h('span','ftag',cnt+' DOMAINS')))});
  el.append(head,body);return el};
 FL_GROUPS.forEach(g=>B.append(mkGroup(g)));
 const mkCustom=()=>{
  const c=s.custom||[],el=h('div','fg'+(s.fold.custom?' open':''));
  const head=h('div','fgh',null,flSw(!s.customOff,()=>{s.customOff=!s.customOff;bsave();brPush();el.replaceWith(mkCustom())}),
   h('div','fgt',null,h('b',null,'YOUR LIST'),h('small',null,(s.customOff?'OFF':'ON')+' · '+c.length+(c.length===1?' SITE':' SITES')+' you added')),h('span','fch','›'));
  head.onclick=()=>{s.fold.custom=!el.classList.contains('open');el.classList.toggle('open',s.fold.custom);bsave()};
  const body=h('div','fgb'),x=h('div','fx',null,h('b',null,'BLOCKED SITES'),h('small',null,'Any site you want blocked, including everything under it.'));
  if(c.length){const t=h('div','ftags');c.forEach(d=>t.append(h('span','ftag on',d.toUpperCase())));x.append(t)}
  const ed=brChip('Edit',false,async()=>{const r=await bdlg({title:'Blocked sites',msg:'Websites to block, separated by commas. Example: example.com, news.site',value:c.join(', '),ok:'Save'});if(r){s.custom=r.v.split(/[,\s]+/).filter(Boolean);bsave();brPush();el.replaceWith(mkCustom())}});
  body.append(h('div','fr',null,x,ed));el.append(head,body);return el};
 B.append(mkCustom());
 B.append(bpNote('Gambling and shopping lists are not offered by public DNS servers, so they are blocked here. Malware and phishing are blocked by DNS: VPN > DNS and filtering.'))}
