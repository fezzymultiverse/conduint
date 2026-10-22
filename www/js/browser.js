/* browser.js: Conduint Browser (V0.13.0). A Chrome-style web sheet that slides up from the bottom of the screen and can be maximised.
   This file draws everything you touch (address bar, tabs, menu, history, bookmarks, downloads, extensions, settings, sign-in).
   The pages themselves are real Android WebViews owned by native/BrowserPlugin.java and laid over #brc, the content area.
   In a normal desktop browser (no Android bridge) the pages fall back to an iframe so the interface can still be tried.
   Everything is saved in localStorage under conduint.browser.v1 and stays there. */
const BRW=BRIDGE?plug('Browser'):null;
const BK='conduint.browser.v1';
const ENGINES={google:['Google','https://www.google.com/search?q='],ddg:['DuckDuckGo','https://duckduckgo.com/?q='],bing:['Bing','https://www.bing.com/search?q='],brave:['Brave','https://search.brave.com/search?q='],ecosia:['Ecosia','https://www.ecosia.org/search?q=']};
const BDEF={prof:{on:false,name:'',color:'#00e5ff'},hist:[],bm:[],dl:[],ext:[],bi:{},tabs:[],cur:'',set:{engine:'google',home:'',desktop:false,js:true,tpc:true,ads:true,popups:true,opendl:true,zoom:100,keep:true,trk:true,adult:false,gamb:false,shop:false,custom:[]}};
let BD;try{BD=JSON.parse(localStorage[BK]||'null')}catch{}
BD={...BDEF,...(BD||{})};BD.set={...BDEF.set,...BD.set};BD.prof={...BDEF.prof,...BD.prof};
BD.dl=(BD.dl||[]).map(d=>d.run?{...d,run:false,ok:false,err:'Stopped when the app closed. Start it again.'}:d);
let bsT;const bsave=()=>{clearTimeout(bsT);bsT=setTimeout(()=>{try{BD.tabs=BR.tabs.filter(t=>!t.priv).map(t=>({id:t.id,u:t.u,t:t.t,desk:t.desk}));BD.cur=BR.cur;localStorage[BK]=JSON.stringify(BD)}catch{}},250)};

/* built-in extensions: CSS and JS that run on matching pages. Your own extensions work the same way. */
const BI=[
 {id:'dark',name:'Dark mode for pages',desc:'Inverts light pages. Pictures and video keep their colours.',matches:['*'],css:'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}img,picture,video,canvas,svg image,iframe{filter:invert(1) hue-rotate(180deg)!important}'},
 {id:'cookies',name:'Hide cookie banners',desc:'Hides the common cookie and consent pop-ups.',matches:['*'],css:'#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,.cc-window,.cookie-banner,.cookie-notice,#cookie-banner,#cookieConsent,.cmp-container,[id^=sp_message_container],.fc-consent-root,#truste-consent-track{display:none!important}html,body{overflow:auto!important}'},
 {id:'zoom',name:'Allow zoom everywhere',desc:'Lets you pinch-zoom on pages that switch zooming off.',matches:['*'],js:"var m=document.querySelector('meta[name=viewport]');if(m)m.setAttribute('content','width=device-width,initial-scale=1');"},
 {id:'select',name:'Allow text selection and right-click',desc:'Removes the no-copy rules some sites add.',matches:['*'],css:'*{-webkit-user-select:text!important;user-select:text!important}'}
];
const BR={open:false,max:false,panel:'',menu:false,sug:false,modal:false,find:false,tabs:[],cur:'',shown:false,seq:0,built:false,edit:null};
BR.tabs=(BD.tabs||[]).map(t=>({...t,made:false,prog:100,back:false,fwd:false,priv:false}));
BR.cur=BR.tabs.some(t=>t.id===BD.cur)?BD.cur:(BR.tabs[0]||{}).id||'';

/* ---------- helpers ---------- */
const brHost=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return''}};
const brTab=id=>BR.tabs.find(t=>t.id===id);
const brCur=()=>brTab(BR.cur);
const brSecure=u=>/^https:/i.test(u||'');
function brUrl(s){s=(s||'').trim();if(!s)return'';
 if(/^(https?:\/\/|about:blank$)/i.test(s))return s;
 if(/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(s))return'http://'+s;
 if(!/\s/.test(s)&&/^[^\s.]+(\.[^\s.]+)+(:\d+)?(\/.*)?$/.test(s))return'https://'+s;
 return ENGINES[BD.set.engine][1]+encodeURIComponent(s)}
const brBtn=(ic,label,fn,cls)=>{const b=h('button','ib'+(cls?' '+cls:''),null,ico(ic));b.setAttribute('aria-label',label);b.title=label;b.onclick=fn;return b};
const brChip=(t,on,fn)=>{const c=h('button','chip'+(on?' on':''),t);c.onclick=()=>fn(c);return c};
function brFav(u){const hs=brHost(u),s=h('span','bfv',(hs[0]||'?').toUpperCase());
 if(hs&&navigator.onLine!==false){const im=new Image();im.alt='';im.onload=()=>{s.textContent='';s.append(im)};im.src='https://www.google.com/s2/favicons?domain='+encodeURIComponent(hs)+'&sz=64'}return s}
const brDay=ts=>{const d=new Date(ts),n=new Date(),a=new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime(),y=a-864e5;
 return ts>=a?'Today':ts>=y?'Yesterday':d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})};
async function bdlg(o){BR.modal=true;nat();try{return await dlg(o)}finally{BR.modal=false;nat()}}

/* ---------- build the sheet once ---------- */
function brBuild(){if(BR.built)return;BR.built=true;
 const S1=h('div');S1.id='brs';
 const sh=h('section');sh.id='br';sh.setAttribute('aria-label','Browser');
 const hd=h('div');hd.id='brh';
 const hide=brBtn('chdown','Hide browser',()=>brClose());hide.id='brhide';
 const grab=h('div');grab.id='brgrab';
 const mx=brBtn('max','Maximise',()=>brMax(!BR.max));mx.id='brmax';
 hd.append(hide,grab,mx);
 const tb=h('div');tb.id='brt';
 const bk=brBtn('back','Back',()=>brGo('back'));bk.id='brbk';
 const fw=brBtn('next','Forward',()=>brGo('fwd'));fw.id='brfw';
 const rl=brBtn('rot','Reload',()=>brGo('reload'));rl.id='brrl';
 const om=h('div');om.id='bro';
 const lk=ico('lock');lk.id='brlk';
 const inp=h('input');inp.id='bri';inp.setAttribute('autocomplete','off');inp.setAttribute('autocapitalize','off');inp.setAttribute('autocorrect','off');inp.setAttribute('spellcheck','false');inp.setAttribute('enterkeyhint','go');inp.placeholder='Search or type web address';
 const cl=brBtn('x','Clear',()=>{inp.value='';inp.focus();brSug()});cl.id='brcl';
 om.append(lk,inp,cl);
 const tbn=h('button','ib');tbn.id='brtabs';tbn.setAttribute('aria-label','Tabs');tbn.append(h('b',null,'0'));tbn.onclick=()=>brPanel('tabs');
 const mn=brBtn('more','Menu',()=>brMenu());mn.id='brmn';
 tb.append(bk,fw,rl,om,tbn,mn);
 const pg=h('div');pg.id='brpg';pg.append(h('i'));
 const fd=h('div');fd.id='brfind';
 const fi=h('input');fi.id='brfi';fi.placeholder='Find in page';fi.setAttribute('autocomplete','off');
 fd.append(fi,brBtn('up','Previous match',()=>brFindNext(false)),brBtn('chdown','Next match',()=>brFindNext(true)),brBtn('x','Close find',()=>brFind(false)));
 const ct=h('div');ct.id='brc';
 const ntp=h('div');ntp.id='brntp';
 const ifr=document.createElement('iframe');ifr.id='brif';ifr.setAttribute('referrerpolicy','no-referrer');ifr.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin allow-popups');
 const pan=h('div');pan.id='brpan';
 const sug=h('div');sug.id='brsug';
 const mb=h('div');mb.id='brmb';mb.onclick=()=>brMenu(false);
 const mm=h('div');mm.id='brmenu';
 ct.append(ntp,ifr,pan,sug);
 sh.append(hd,tb,pg,fd,ct,mb,mm);
 document.body.append(S1,sh);
 S1.onclick=()=>brClose();
 inp.onfocus=()=>{inp.select();BR.sug=true;brSug();nat()};
 inp.onblur=()=>setTimeout(()=>{if(document.activeElement!==inp){BR.sug=false;$('#brsug').classList.remove('on');nat();brDraw()}},120);
 inp.oninput=()=>brSug();
 inp.onkeydown=e=>{if(e.key==='Enter'){const v=inp.value;inp.blur();brLoad(v)}};
 fi.oninput=()=>{const t=brCur();if(BRW&&t)BRW.find({id:t.id,q:fi.value}).catch(()=>{})};
 fi.onkeydown=e=>{if(e.key==='Enter')brFindNext(!e.shiftKey)};
 /* drag the top bar: up = maximise, down = minimise, down again = hide */
 let sy=null,moved=false;
 hd.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;sy=e.clientY;moved=false;hd.setPointerCapture(e.pointerId)});
 hd.addEventListener('pointermove',e=>{if(sy==null||moved)return;const d=e.clientY-sy;
  if(d<-36){moved=true;brMax(true)}else if(d>50){moved=true;BR.max?brMax(false):brClose()}});
 ['pointerup','pointercancel'].forEach(v=>hd.addEventListener(v,()=>{sy=null}));
 grab.onclick=()=>brMax(!BR.max);
 addEventListener('resize',()=>{if(BR.open)nat()});
 if(BRW&&BRW.addListener)brEvents()}

/* ---------- native events ---------- */
function brEvents(){
 BRW.addListener('state',e=>{const t=brTab(e.id);if(!t)return;
  if(e.url&&e.url!=='about:blank')t.u=e.url;if(e.title)t.t=e.title;t.prog=e.progress;t.back=!!e.back;t.fwd=!!e.fwd;
  if(e.progress>=100&&t.u)brVisit(t);if(t.id===BR.cur)brDraw();bsave()});
 BRW.addListener('newtab',e=>{const t={id:e.id,u:'',t:'',desk:false,made:true,prog:0,back:false,fwd:false,priv:!!(brTab(e.opener)||{}).priv};BR.tabs.push(t);brSelect(t.id);brBadge()});
 BRW.addListener('closetab',e=>brClose1(e.id));
 BRW.addListener('crash',e=>{const t=brTab(e.id);if(t){t.made=false;if(t.id===BR.cur)brSelect(t.id)}toast('The page crashed. Reloading it.')});
 BRW.addListener('download',e=>{BD.dl.unshift({name:e.name,url:e.url,ts:Date.now(),ok:!!e.ok,run:!!e.ok,err:e.error||'',id:e.id||'',done:0,total:-1});BD.dl=BD.dl.slice(0,200);bsave();
  toast(e.ok?'Downloading '+e.name:'Could not download: '+(e.error||'unknown'));if(BR.panel==='dl')brPanel('dl')});
 /* V0.32.2: Conduint downloads the file itself (through the VPN tunnel) and reports progress and the real failure reason */
 BRW.addListener('dlstate',e=>{const d=BD.dl.find(x=>x.id&&x.id===e.id);if(!d)return;
  if(e.name)d.name=e.name;
  if(e.status===8){d.ok=true;d.run=false;d.err='';d.done=e.done;d.total=e.total;toast('Saved '+d.name+' in Downloads');if(BD.set.opendl&&!d.opened){d.opened=true;brDlOpen(d)}}
  else if(e.status===16){d.ok=false;d.run=false;d.err=brDlWhy(16,e.reason);toast('Download failed: '+d.err)}
  else{d.run=true;d.done=e.done||0;d.total=e.total==null?-1:e.total;d.err=''}
  if(e.status!==2||BR.panel==='dl'){bsave()}
  if(BR.panel==='dl')brPanel('dl')})}
/* V0.43.5: when a download finishes, Conduint opens it (a .zip is browsed inside, text/docs open in the reader, media in the player).
   The file is found in the Downloads folder by name (newest match). Turn it off in Browser > Settings > Site settings. */
async function brDlOpen(d,tries=0){
 try{
  if(!SAF||!SAF.roots||!SAF.list)return;
  const R=await SAF.roots();if(!R||!R.downloads)return;
  const L=await SAF.list({uri:R.downloads}),base=(d.name||'').replace(/\.[^.]+$/,''),ext=((d.name||'').match(/\.[^.]+$/)||[''])[0];
  let c=(L.items||[]).filter(x=>!x.dir&&x.name===d.name);
  if(!c.length)c=(L.items||[]).filter(x=>!x.dir&&x.name.startsWith(base)&&x.name.endsWith(ext));
  if(!c.length){if(tries<4)return setTimeout(()=>brDlOpen(d,tries+1),700);return toast('Saved '+d.name+'. Find it in Downloads.')}
  c.sort((a,b)=>(b.mtime||0)-(a.mtime||0));const it=c[0];
  if(/\.apk$/i.test(it.name))return;/* an installer is never opened by itself */
  brClose();
  if(/\.zip$/i.test(it.name)&&typeof zipBrowse==='function')return zipBrowse(it);
  open(it,[it]);
 }catch(e){toast('Could not open '+(d.name||'the file')+': '+(e.message||e))}}
function brSz(n){n=+n||0;return n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B'}
function brDlWhy(s,r){
 if(r===401||r===403)return'The site refused the download (HTTP '+r+'). Many sites block VPN addresses: try another server, or turn the VPN off for this file.';
 if(r===404||r===410)return'The file is gone (HTTP '+r+').';
 if(r===429)return'Too many requests (HTTP 429). Wait a while or switch server.';
 if(r>=500&&r<600)return'The site had a problem (HTTP '+r+').';
 if(r>=400&&r<500)return'The site said no (HTTP '+r+').';
 return({1000:'Unknown error',1001:'The file could not be written',1002:'The site sent an answer the downloader cannot use',1004:'The connection broke and could not be resumed. Try again or switch VPN server.',1005:'Too many redirects',1006:'Not enough free space',1007:'Downloads folder not available',1008:'The site does not allow resuming a broken download. Start it again.',1010:'The site name could not be looked up (DNS). Check VPN > DNS, or try another server.',1011:'Could not reach the site (timed out). Try another VPN server.',1012:'The secure connection failed. The VPN or the site may be blocking it.'})[r]||'Failed (code '+r+')'}

function brVisit(t){if(t.priv||!BD.set.keep||!/^https?:/i.test(t.u))return;
 const top=BD.hist[0];
 if(t.lastRec===t.u&&top&&top.u===t.u){if(t.t)top.t=t.t;return}
 t.lastRec=t.u;BD.hist.unshift({u:t.u,t:t.t||brHost(t.u),ts:Date.now()});if(BD.hist.length>3000)BD.hist.length=3000;bsave()}

/* ---------- tabs ---------- */
function brNew(url,priv){const t={id:'t'+Date.now().toString(36)+(++BR.seq),u:'',t:'',desk:!!BD.set.desktop,made:false,prog:100,back:false,fwd:false,priv:!!priv};
 BR.tabs.push(t);brSelect(t.id);if(url)brNav(t,url);return t}
function brSelect(id){const t=brTab(id);if(!t)return;BR.cur=id;BR.panel='';
 if(BRW&&t.u&&!t.made){BRW.open({id:t.id,url:t.u,desktop:t.desk,select:true}).catch(()=>{});t.made=true}
 else if(BRW&&t.made)BRW.select({id:t.id}).catch(()=>{});
 brPanelDraw();brDraw();nat();bsave()}
function brClose1(id){const i=BR.tabs.findIndex(t=>t.id===id);if(i<0)return;const was=BR.tabs[i];BR.tabs.splice(i,1);
 if(BRW&&was.made)BRW.close({id}).catch(()=>{});
 if(BR.cur===id){const n=BR.tabs[Math.min(i,BR.tabs.length-1)];if(n)brSelect(n.id);else{BR.cur='';brNew('')}}
 else{brDraw();bsave()}brBadge();if(BR.panel==='tabs')brPanel('tabs')}
function brNav(t,input){const u=brUrl(input);if(!u)return;t.u=u;t.t='';t.prog=5;t.lastRec='';
 if(BRW){if(!t.made){BRW.open({id:t.id,url:u,desktop:t.desk,select:true}).catch(()=>{});t.made=true}else BRW.go({id:t.id,url:u}).catch(()=>{});BRW.select({id:t.id}).catch(()=>{})}
 else{$('#brif').src=u;t.t=brHost(u);t.prog=100;brVisit(t)}
 BR.panel='';brPanelDraw();brDraw();nat();bsave()}
function brLoad(v){const t=brCur()||brNew('');brNav(t,v)}
function brGo(what){const t=brCur();if(!t)return;
 if(what==='reload'){if(t.prog<100&&BRW){BRW.stop({id:t.id});return}if(!t.u)return;BRW?BRW.reload({id:t.id}):($('#brif').src=t.u);return}
 if(!BRW)return;if(what==='back'){if(t.back)BRW.back({id:t.id});else if(t.u)toast('No earlier page.')}
 else if(what==='fwd'&&t.fwd)BRW.forward({id:t.id})}
const brBadge=()=>{const n=BR.tabs.length,b=document.querySelector('.brbtn');if(b){b.dataset.n=n&&!BR.open?n:''}};

/* ---------- show / hide / maximise ---------- */
function brOpen(url){brBuild();BR.open=true;
 if(!BR.tabs.length)brNew(BD.set.home||'');
 else if(!brCur())brSelect(BR.tabs[0].id);
 else brSelect(BR.cur);
 if(url)brNav(brCur(),url);
 $('#brs').classList.add('on');$('#br').classList.add('on');document.body.classList.add('bro');brDraw();brFollow(460);brBadge();
 if(!BRW)toast('Preview mode: the real browser engine runs in the Android app.')}
function brClose(){if(!BR.built)return;BR.open=false;BR.menu=false;BR.sug=false;BR.panel='';brFind(false);
 const i=$('#bri');if(i)i.blur();$('#brs').classList.remove('on');$('#br').classList.remove('on');document.body.classList.remove('bro');nat();brBadge();bsave();if(typeof brwDraw==='function')brwDraw()}
function brMax(v){BR.max=!!v;$('#br').classList.toggle('max',BR.max);
 const b=$('#brmax');b.replaceChildren(ico(BR.max?'min':'max'));b.setAttribute('aria-label',BR.max?'Minimise':'Maximise');b.title=BR.max?'Minimise':'Maximise';brFollow(460)}
/* keeps the native page view glued to the sheet while it slides or resizes */
let brFT=0;function brFollow(ms){const end=performance.now()+ms;if(brFT)return;
 const f=()=>{nat(true);if(performance.now()<end)brFT=requestAnimationFrame(f);else{brFT=0;nat(true)}};brFT=requestAnimationFrame(f)}

/* the page view is only visible when nothing of ours has to be drawn over it */
function nat(force){if(!BRW||!BR.built)return;const t=brCur();
 const want=BR.open&&!BR.panel&&!BR.sug&&!BR.menu&&!BR.modal&&t&&t.u&&t.made;
 if(want){const r=$('#brc').getBoundingClientRect(),FR=7,o={x:r.left+FR,y:r.top+FR,w:Math.max(1,r.width-FR*2),h:Math.max(1,r.height-FR*2)};
  if(!BR.shown){BR.shown=true;BRW.show(o).catch(()=>{})}else BRW.bounds(o).catch(()=>{})}
 else if(BR.shown){BR.shown=false;BRW.hide().catch(()=>{})}}

/* ---------- toolbar + new-tab page ---------- */
function brDraw(){if(!BR.built)return;const t=brCur(),i=$('#bri');
 $('#br').classList.toggle('priv',!!(t&&t.priv));
 if(document.activeElement!==i)i.value=t&&t.u?(brSecure(t.u)||/^http:/i.test(t.u)?(brHost(t.u)||t.u):t.u):'';
 const lk=$('#brlk');lk.style.display=t&&t.u?'':'none';lk.style.color=t&&brSecure(t.u)?'var(--acc)':'#ff9100';
 $('#brbk').disabled=!(t&&t.back);$('#brfw').disabled=!(t&&t.fwd);
 const load=t&&t.prog<100&&t.u;$('#brrl').replaceChildren(ico(load?'x':'rot'));$('#brrl').setAttribute('aria-label',load?'Stop':'Reload');
 const pg=$('#brpg');pg.classList.toggle('on',!!load);pg.firstChild.style.width=(load?Math.max(6,t.prog):0)+'%';
 $('#brtabs b').textContent=BR.tabs.length;$('#brcl').style.display=document.activeElement===i&&i.value?'':'none';
 const ntp=$('#brntp'),show=!!t&&!t.u&&!BR.panel;ntp.classList.toggle('on',show);if(show)brNtp(t);
 const f=$('#brif');f.style.display=!BRW&&t&&t.u&&!BR.panel?'block':'none';if(!BRW&&t&&t.u&&f.getAttribute('src')!==t.u)f.src=t.u}

function brNtp(t){const N=$('#brntp');N.replaceChildren();
 const w=h('div','ntw'),hr=new Date().getHours(),hi=hr<5?'Late night':hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
 w.append(h('div','ntl',null,ico('globe'),h('b',null,'Conduint')),h('small','nts',t.priv?'INCOGNITO':'STRATEGY OVER IMPULSE'));
 const q=h('input','ntq');q.placeholder='Search '+ENGINES[BD.set.engine][0]+' or type a web address';q.setAttribute('enterkeyhint','go');q.setAttribute('autocomplete','off');
 q.onkeydown=e=>{if(e.key==='Enter'&&q.value.trim())brNav(t,q.value)};w.append(q);
 w.append(h('div','ntgr',(BD.prof.on&&BD.prof.name?hi+', '+BD.prof.name:hi)+' · '+new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})));
 if(t.priv)w.append(h('p','ntp','No history, no suggestions and no saved searches for this tab. Android shares cookies with normal tabs, so a site you log in to stays logged in.'));
 const cnt={};BD.hist.slice(0,600).forEach(x=>{const k=brHost(x.u);if(!k)return;(cnt[k]=cnt[k]||{u:x.u,t:x.t,n:0}).n++});
 const seen=new Set(),sc=[];BD.bm.forEach(b=>{const k=brHost(b.u);if(!seen.has(k)){seen.add(k);sc.push({u:b.u,t:b.t})}});
 Object.values(cnt).sort((a,b)=>b.n-a.n).forEach(x=>{const k=brHost(x.u);if(!seen.has(k)&&sc.length<7){seen.add(k);sc.push({u:x.u,t:x.t})}});
 [['https://www.google.com','Google'],['https://www.youtube.com','YouTube'],['https://github.com','GitHub'],['https://en.wikipedia.org','Wikipedia'],['https://www.reddit.com','Reddit'],['https://x.com','X'],['https://news.ycombinator.com','Hacker News']].forEach(d=>{const k=brHost(d[0]);if(sc.length<7&&!seen.has(k)){seen.add(k);sc.push({u:d[0],t:d[1]})}});
 const g=h('div','ntg');
 sc.slice(0,7).forEach(x=>{const b=h('button','nt',null,brFav(x.u),h('span',null,(x.t||brHost(x.u)).slice(0,14)));b.onclick=()=>brNav(t,x.u);g.append(b)});
 const add=h('button','nt',null,h('span','bfv','+'),h('span',null,'Add'));
 add.onclick=async()=>{const r=await bdlg({title:'Add shortcut',msg:'Web address',value:'https://',ok:'Add'});if(r&&r.v){const u=brUrl(r.v);if(!BD.bm.some(b=>b.u===u))BD.bm.push({u,t:brHost(u),ts:Date.now()});bsave();brDraw()}};
 g.append(add);w.append(g);N.append(w)}

/* address bar suggestions */
function brSug(){const S=$('#brsug'),v=$('#bri').value.trim().toLowerCase(),t=brCur();S.replaceChildren();S.classList.add('on');
 const add=(ic,title,sub,fn)=>{const b=h('button','brr',null,ic,h('div','brx',null,h('b',null,title),h('small',null,sub)));b.onpointerdown=e=>e.preventDefault();b.onclick=fn;S.append(b)};
 if($('#bri').value.trim())add(ico('search'),$('#bri').value.trim(),/^\S+\.\S+$/.test(v)?'Open web address':'Search '+ENGINES[BD.set.engine][0],()=>{$('#bri').blur();brLoad($('#bri').value)});
 const seen=new Set(),out=[];
 const push=(x,star)=>{if(seen.has(x.u))return;seen.add(x.u);out.push({...x,star})};
 BD.bm.forEach(b=>{if(!v||(b.u+' '+b.t).toLowerCase().includes(v))push(b,1)});
 if(!(t&&t.priv))BD.hist.slice(0,1500).forEach(x=>{if(out.length<20&&(!v||(x.u+' '+x.t).toLowerCase().includes(v)))push(x,0)});
 out.slice(0,v?7:9).forEach(x=>add(brFav(x.u),x.t||brHost(x.u),(x.star?'★ ':'')+x.u.replace(/^https?:\/\//,''),()=>{$('#bri').blur();brLoad(x.u)}));
 $('#brcl').style.display=v?'':'none'}

/* ---------- find in page ---------- */
function brFind(on){BR.find=on;$('#brfind').classList.toggle('on',on);const t=brCur();
 if(on)setTimeout(()=>$('#brfi').focus(),50);else{$('#brfi').value='';if(BRW&&t)BRW.find({id:t.id,q:''}).catch(()=>{})}brFollow(300)}
function brFindNext(f){const t=brCur();if(BRW&&t)BRW.findNext({id:t.id,fwd:f}).catch(()=>{})}

/* ---------- menu (the three dots) ---------- */
function brMenu(on){if(on===undefined)on=!BR.menu;BR.menu=on;$('#br').classList.toggle('menu',on);nat();if(!on)return;
 const t=brCur(),M=$('#brmenu');M.replaceChildren();
 const bm=t&&BD.bm.find(b=>b.u===t.u),pg=!!(t&&t.u);
 const top=h('div','bmt');
 const ib=(ic,l,fn,dis,on)=>{const b=h('button','bmi'+(on?' on':''),null,ico(ic),h('small',null,l));b.disabled=!!dis;b.onclick=()=>{brMenu(false);fn()};return b};
 top.append(ib('next','Forward',()=>brGo('fwd'),!(t&&t.fwd)),ib(bm?'starfill':'star',bm?'Bookmarked':'Bookmark',()=>brStar(),!pg,!!bm),ib('rot','Reload',()=>brGo('reload'),!pg),ib('share','Share',()=>brShare(),!pg));
 M.append(top);
 const row=(ic,l,fn,note,on)=>{const b=h('button','bmr'+(on?' on':''),null,ico(ic),h('span',null,l));if(note)b.append(h('small',null,note));b.onclick=()=>{brMenu(false);fn()};M.append(b)};
 row('plus','New tab',()=>brNew(BD.set.home||''));
 row('eyeoff','New Incognito tab',()=>brNew('',true));
 M.append(h('hr'));
 row('history','History',()=>brPanel('history'));
 row('down','Downloads',()=>brPanel('dl'));
 row('star','Bookmarks',()=>brPanel('bm'));
 row('ext','Extensions',()=>brPanel('ext'),BD.ext.filter(x=>x.on).length+BI.filter(x=>BD.bi[x.id]).length||'');
 row('shield','Cookies for this site',()=>brPanel('cookies'),'',false);
 M.append(h('hr'));
 row('search','Find in page',()=>brFind(true));
 row('phone','Desktop site',()=>brDesk(),t&&t.desk?'On':'',!!(t&&t.desk));
 M.append(h('hr'));
 row('theme',BD.prof.on?BD.prof.name:'Sign in',()=>brPanel('profile'),BD.prof.on?'Profile':'');
 row('tune','Settings',()=>brPanel('settings'))}
function brStar(){const t=brCur();if(!t||!t.u)return;const i=BD.bm.findIndex(b=>b.u===t.u);
 if(i>=0){BD.bm.splice(i,1);toast('Bookmark removed')}else{BD.bm.unshift({u:t.u,t:t.t||brHost(t.u),ts:Date.now()});toast('Bookmarked')}bsave();brDraw()}
async function brShare(){const t=brCur();if(!t||!t.u)return;
 try{if(navigator.share){await navigator.share({title:t.t||'',url:t.u});return}}catch(e){if(e&&e.name==='AbortError')return}
 try{await navigator.clipboard.writeText(t.u);toast('Link copied')}catch{toast(t.u)}}
function brDesk(){const t=brCur();if(!t)return;t.desk=!t.desk;if(BRW&&t.made)BRW.desktop({id:t.id,on:t.desk}).catch(()=>{});toast(t.desk?'Desktop site on':'Mobile site');bsave()}

/* ---------- panels: tabs, history, bookmarks, downloads, extensions, cookies, profile, settings, clear ---------- */
const BP_TITLE={tabs:'Tabs',history:'History',bm:'Bookmarks',dl:'Downloads',ext:'Extensions',extedit:'Extension',cookies:'Cookies',profile:'You',settings:'Settings',clear:'Clear browsing data'};
const BP_UP={extedit:'ext',cookies:'settings',clear:'settings',profile:'settings'};
function brPanel(n,arg){BR.panel=n;BR.sug=false;BR.menu=false;$('#br').classList.remove('menu');brPanelDraw(arg);nat();brDraw()}
function brPanelClose(){BR.panel='';brPanelDraw();nat();brDraw()}
function brPanelBack(){const u=BP_UP[BR.panel];if(u)brPanel(u);else brPanelClose()}
function brPanelDraw(arg){const P=$('#brpan');if(!BR.built)return;P.classList.toggle('on',!!BR.panel);P.replaceChildren();if(!BR.panel)return;
 const hd=h('div','bph',null,brBtn('back','Back',brPanelBack),h('b',null,BP_TITLE[BR.panel]||''));
 const body=h('div','bpb');P.append(hd,body);
 ({tabs:pTabs,history:pHist,bm:pBm,dl:pDl,ext:pExt,extedit:pExtEdit,cookies:pCookies,profile:pProfile,settings:pSet,clear:pClear})[BR.panel](body,hd,arg)}
const bpRow=(lead,title,sub,fn,...acts)=>{const r=h('div','brr',null,lead,h('div','brx',null,h('b',null,title),h('small',null,sub||'')),...acts);if(fn){r.classList.add('tap');r.onclick=e=>{if(!e.target.closest('button'))fn()}}return r};
const bpNote=t=>h('div','bpn',t);
const bpSec=t=>h('div','bps',t);

function pTabs(B,H){
 H.append(brBtn('plus','New tab',()=>brNew(BD.set.home||'')),brBtn('eyeoff','New Incognito tab',()=>brNew('',true)));
 const g=h('div','tcg');
 BR.tabs.forEach(t=>{const c=h('div','tcd'+(t.id===BR.cur?' cur':'')+(t.priv?' priv':''));
  const x=brBtn('x','Close tab',e=>{brClose1(t.id)});x.onclick=e=>{e.stopPropagation();brClose1(t.id)};
  c.append(h('div','tct',null,t.u?brFav(t.u):h('span','bfv','+'),h('b',null,t.t||brHost(t.u)||'New tab'),x),h('small',null,t.u?brHost(t.u):(t.priv?'Incognito':'New tab')));
  c.onclick=()=>{brSelect(t.id)};g.append(c)});
 B.append(g);
 if(BR.tabs.length>1){const ca=h('button','chip danger','Close all tabs');ca.onclick=()=>{BR.tabs.slice().forEach(t=>{if(BRW&&t.made)BRW.close({id:t.id}).catch(()=>{})});BR.tabs=[];BR.cur='';brNew('');brBadge()};B.append(h('div','bpa',null,ca))}}

function pHist(B,H){
 const q=h('input','bpq');q.placeholder='Search history';B.append(q);
 const clr=brBtn('trash','Clear history',()=>brPanel('clear'));H.append(clr);
 const list=h('div');B.append(list);
 const draw=()=>{list.replaceChildren();const v=q.value.trim().toLowerCase();let day='',n=0;
  for(const x of BD.hist){if(v&&!(x.u+' '+x.t).toLowerCase().includes(v))continue;if(++n>300)break;
   const d=brDay(x.ts);if(d!==day){day=d;list.append(bpSec(d))}
   const del=brBtn('x','Remove',()=>{BD.hist.splice(BD.hist.indexOf(x),1);bsave();draw()});
   list.append(bpRow(brFav(x.u),x.t||brHost(x.u),brHost(x.u)+' · '+new Date(x.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}),()=>brOpenIn(x.u),del))}
  if(!n)list.append(bpNote(v?'Nothing matches.':'No history yet. Pages you visit show up here and stay here.'))};
 q.oninput=draw;draw()}

function brOpenIn(u){const t=brCur();if(t&&!t.u)brNav(t,u);else brNew(u)}

function pBm(B,H){
 const t=brCur();
 if(t&&t.u&&!BD.bm.some(b=>b.u===t.u))H.append(brBtn('star','Bookmark this page',()=>{brStar();brPanel('bm')}));
 const list=h('div');B.append(list);
 const draw=()=>{list.replaceChildren();
  BD.bm.forEach(b=>{const ed=brBtn('edit','Rename',async()=>{const r=await bdlg({title:'Rename bookmark',value:b.t,ok:'Save'});if(r&&r.v){b.t=r.v;bsave();draw()}});
   const del=brBtn('x','Remove',()=>{BD.bm.splice(BD.bm.indexOf(b),1);bsave();draw()});
   list.append(bpRow(brFav(b.u),b.t||brHost(b.u),b.u.replace(/^https?:\/\//,''),()=>brOpenIn(b.u),ed,del))});
  if(!BD.bm.length)list.append(bpNote('No bookmarks yet. Open a page, tap the three dots, then the star.'))};draw()}

function pDl(B,H){
 if(BD.dl.length)H.append(brBtn('trash','Clear list',()=>{BD.dl=[];bsave();brPanel('dl')}));
 BD.dl.forEach(d=>B.append(bpRow(ico(d.run||d.ok?'down':'x'),d.name,d.run?('Downloading · '+brSz(d.done)+(d.total>0?' of '+brSz(d.total)+' ('+Math.min(99,Math.round(d.done*100/d.total))+'%)':'')):d.ok?(d.err||brDay(d.ts)+' · saved in your Downloads folder'):(d.err||'Failed'))));
 if(!BD.dl.length)B.append(bpNote('Files you download from websites appear here and are saved in your Downloads folder.'));
 const od=h('button','chip','Open Downloads folder');od.onclick=()=>{brClose();try{go('downloads')}catch(e){}};B.append(h('div','bpa',null,od))}

/* extensions are scripts and styles that run on the pages you choose. Chrome Web Store extensions cannot run in Android WebView. */
function brExtList(){const l=[];BI.forEach(x=>{if(BD.bi[x.id])l.push({id:'bi-'+x.id,matches:x.matches,js:x.js||'',css:x.css||''})});
 BD.ext.forEach(x=>{if(x.on)l.push({id:'u-'+x.id,matches:(x.matches||'*').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean),js:x.js||'',css:x.css||''})});return l}
function brPush(){if(BRW)BRW.scripts({list:brExtList()}).catch(()=>{});if(BRW){const L=blLists(BD.set);BRW.set({js:BD.set.js,tpc:BD.set.tpc,ads:BD.set.ads,popups:BD.set.popups,zoom:BD.set.zoom,sub:L.sub,site:L.site}).catch(()=>{})}}
function pExt(B,H){
 H.append(brBtn('plus','Add extension',()=>{BR.edit={id:'x'+Date.now().toString(36),name:'',matches:'*',js:'',css:'',on:true,fresh:true};brPanel('extedit')}));
 B.append(bpSec('Built in'));
 BI.forEach(x=>{const on=!!BD.bi[x.id],c=brChip(on?'On':'Off',on,()=>{BD.bi[x.id]=!BD.bi[x.id];bsave();brPush();brPanel('ext');toast('Applies to pages you open next. Reload the current page.')});
  B.append(bpRow(ico('ext'),x.name,x.desc,null,c))});
 B.append(bpSec('Your extensions'));
 BD.ext.forEach(x=>{const c=brChip(x.on?'On':'Off',x.on,()=>{x.on=!x.on;bsave();brPush();brPanel('ext')}),ed=brBtn('edit','Edit',()=>{BR.edit={...x};brPanel('extedit')});
  B.append(bpRow(ico('code'),x.name||'Untitled',(x.matches||'*').split(/[\n,]+/)[0]+((x.matches||'').split(/[\n,]+/).length>1?' …':''),null,ed,c))});
 if(!BD.ext.length)B.append(bpNote('Add your own: pick the sites, paste a little JavaScript and/or CSS, and it runs on those pages every time.'));
 B.append(bpNote('Chrome Web Store extensions (.crx) cannot be installed: Android\u2019s web engine has no extension host. Built in and your own scripts cover the common cases.'))}
function pExtEdit(B,H){const x=BR.edit;if(!x)return brPanel('ext');
 const f=(l,k,rows,ph)=>{const a=rows?h('textarea','bpt'):h('input','bpq');if(rows)a.rows=rows;a.value=x[k]||'';a.placeholder=ph||'';a.spellcheck=false;a.setAttribute('autocapitalize','off');a.oninput=()=>x[k]=a.value;B.append(bpSec(l),a)};
 f('Name','name',0,'My extension');f('Runs on (one per line, * means every site)','matches',3,'*\nyoutube.com\n*://*.example.com/*');f('JavaScript (runs after the page loads)','js',6,'document.title = "Hi";');f('CSS (applied early)','css',5,'body { font-size: 18px }');
 const sv=h('button','chip on','Save');sv.onclick=()=>{if(!x.name.trim())x.name='Extension';const o={id:x.id,name:x.name.trim(),matches:x.matches.trim()||'*',js:x.js,css:x.css,on:x.on!==false},i=BD.ext.findIndex(e=>e.id===x.id);
  if(i>=0)BD.ext[i]=o;else BD.ext.push(o);bsave();brPush();BR.edit=null;brPanel('ext');toast('Saved. Reload a page to use it.')};
 const del=h('button','chip danger','Delete');del.onclick=()=>{BD.ext=BD.ext.filter(e=>e.id!==x.id);bsave();brPush();BR.edit=null;brPanel('ext')};
 B.append(h('div','bpa',null,sv,...(x.fresh?[]:[del])));
 B.append(bpNote('Only add scripts you wrote or trust. They can read and change every page they run on.'))}

async function pCookies(B,H){const t=brCur(),u=t&&t.u&&/^https?:/i.test(t.u)?t.u:'';
 if(!u){B.append(bpNote('Open a website first, then come back here to see its cookies.'));return}
 B.append(bpSec(brHost(u)));
 if(!BRW){B.append(bpNote('Cookies are kept by the Android browser engine and are listed here in the app.'));return}
 let c='';try{c=(await BRW.cookies({url:u})).cookie||''}catch{}
 if(BR.panel!=='cookies')return;
 const list=c.split(/;\s*/).filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i<0?s.length:i),i<0?'':s.slice(i+1)]});
 if(!list.length)B.append(bpNote('This site has not stored any cookies.'));
 list.forEach(([k,v])=>{const del=brBtn('x','Delete cookie',async()=>{await BRW.delcookie({url:u,name:k}).catch(()=>{});brPanel('cookies')});
  B.append(bpRow(ico('shield'),k,v.length>60?v.slice(0,60)+'…':v,null,del))});
 if(list.length){const ca=h('button','chip danger','Delete all cookies for this site');ca.onclick=async()=>{for(const [k] of list)await BRW.delcookie({url:u,name:k}).catch(()=>{});brPanel('cookies')};B.append(h('div','bpa',null,ca))}
 B.append(bpNote('Values are shown shortened. Cookies are what keep you signed in to a website.'))}

const BSIGN=[['Google','https://accounts.google.com/'],['Microsoft','https://login.live.com/'],['GitHub','https://github.com/login'],['Apple','https://appleid.apple.com/sign-in'],['Facebook','https://m.facebook.com/login'],['X','https://x.com/i/flow/login'],['Reddit','https://www.reddit.com/login'],['Amazon','https://www.amazon.com/ap/signin']];
function pProfile(B){const p=BD.prof;
 const av=h('div','bpav',p.on?(p.name[0]||'?').toUpperCase():'?');av.style.background=p.color;
 B.append(h('div','bpc',null,av,h('div',null,null,h('b',null,p.on?p.name:'Not signed in'),h('small',null,p.on?'Local profile on this phone':'Create a profile to personalise the browser'))));
 const nm=h('input','bpq');nm.placeholder='Your name';nm.value=p.name;B.append(nm);
 const cr=h('div','bpa');SW.forEach(c=>{const b=h('button','sw');b.style.background=c;b.onclick=()=>{p.color=c;av.style.background=c};cr.append(b)});B.append(cr);
 const sv=h('button','chip on',p.on?'Save':'Sign in');sv.onclick=()=>{if(!nm.value.trim()){toast('Add a name first.');return}p.name=nm.value.trim();p.on=true;bsave();toast('Signed in as '+p.name);brPanel('profile')};
 const out=h('button','chip danger','Sign out');out.onclick=()=>{BD.prof={...BDEF.prof};bsave();brPanel('profile')};
 B.append(h('div','bpa',null,sv,...(p.on?[out]:[])));
 B.append(bpNote('This profile lives on your phone only. History, bookmarks and settings stay here; nothing is uploaded.'));
 B.append(bpSec('Sign in to a website'));
 BSIGN.forEach(([n,u])=>B.append(bpRow(brFav(u),n,brHost(u),()=>{brNew(u)})));
 B.append(bpNote('Sites keep you signed in with cookies, so you stay signed in after closing the sheet. Passwords can be filled by your phone\u2019s autofill service (Google, Bitwarden, 1Password and so on). Google may refuse sign-in inside any app; if it does, use another site\u2019s login or Chrome for that one.'))}

function pSet(B){const s=BD.set,tog=(l,sub,k,after)=>{const c=brChip(s[k]?'On':'Off',s[k],()=>{s[k]=!s[k];bsave();brPush();if(after)after();brPanel('settings')});B.append(bpRow(ico('check'),l,sub,null,c))};
 B.append(bpRow(ico('theme'),BD.prof.on?BD.prof.name:'Sign in','Profile and sign-in options',()=>brPanel('profile')));
 B.append(bpSec('Search engine'));
 const eg=h('div','bpa');Object.entries(ENGINES).forEach(([k,v])=>eg.append(brChip(v[0],s.engine===k,()=>{s.engine=k;bsave();brPanel('settings')})));B.append(eg);
 B.append(bpRow(ico('home'),'Homepage',s.home||'New tab page',async()=>{const r=await bdlg({title:'Homepage',msg:'Leave empty for the new tab page.',value:s.home,ok:'Save'});if(r){s.home=r.v?brUrl(r.v):'';bsave();brPanel('settings')}}));
 B.append(bpSec('Site settings'));
 tog('JavaScript','Turn off only if a page misbehaves','js');
 tog('Third-party cookies','Needed for some logins and embedded players','tpc');
 tog('Block pop-ups','Stops pages opening windows by themselves','popups');
 tog('Open downloads in Conduint','When a download finishes, open it here (zip files are browsed inside)','opendl');
 B.append(bpSec('Blocking'));
 blFilters(B,s);
 B.append(bpSec('More'));
 tog('Desktop site for new tabs','Ask sites for the big-screen version','desktop');
 B.append(bpRow(ico('shield'),'Cookies for this site','See and delete them',()=>brPanel('cookies')));
 B.append(bpSec('Text size'));
 const z=h('input');z.type='range';z.min=70;z.max=160;z.step=10;z.value=s.zoom;const zl=h('small','bpn',s.zoom+'%');z.oninput=()=>{s.zoom=+z.value;zl.textContent=s.zoom+'%'};z.onchange=()=>{bsave();brPush()};B.append(h('div','bpa',null,z,zl));
 B.append(bpSec('Privacy'));
 tog('Save browsing history','Off means normal tabs behave like Incognito for history','keep');
 B.append(bpRow(ico('trash'),'Clear browsing data','History, cookies, cache and downloads list',()=>brPanel('clear')));
 B.append(bpSec('About'));
 B.append(bpNote('Conduint Browser '+VER+' · '+(BRW?'Android web engine':'preview (iframe)')+' · Strategy over impulse'))}

const BCLR={hist:true,cookies:false,cache:false,dl:false,tabs:false};
function pClear(B){
 const rows=[['hist','Browsing history'],['cookies','Cookies and site data (signs you out of sites)'],['cache','Cached images and files'],['dl','Downloads list (the files stay in Downloads)'],['tabs','Close all tabs']];
 rows.forEach(([k,l])=>{const c=brChip(BCLR[k]?'Yes':'No',BCLR[k],()=>{BCLR[k]=!BCLR[k];brPanel('clear')});B.append(bpRow(ico('check'),l,'',null,c))});
 const gb=h('button','chip danger','Clear data');gb.onclick=async()=>{
  if(BCLR.hist)BD.hist=[];if(BCLR.dl)BD.dl=[];
  if(BRW)await BRW.clear({cookies:BCLR.cookies,storage:BCLR.cookies,cache:BCLR.cache,history:BCLR.hist}).catch(()=>{});
  if(BCLR.tabs){BR.tabs.forEach(t=>{if(BRW&&t.made)BRW.close({id:t.id}).catch(()=>{})});BR.tabs=[];BR.cur='';brNew('');brBadge()}
  bsave();toast('Cleared');brPanel('settings')};
 B.append(h('div','bpa',null,gb))}

/* ---------- Android back button ---------- */
function brBack(){if(!BR.open)return 0;
 if(BR.menu){brMenu(false);return 1}
 if(BR.sug){$('#bri').blur();return 1}
 if(BR.find){brFind(false);return 1}
 if(BR.panel){brPanelBack();return 1}
 const t=brCur();if(BRW&&t&&t.back){BRW.back({id:t.id});return 1}
 if(BR.max){brMax(false);return 1}
 brClose();return 1}

brPush();
