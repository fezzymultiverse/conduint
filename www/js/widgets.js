/* widgets.js: header widgets under the Conduint name (live storage ring, battery chip, RAM chip), folder item counts for
   Compact view, quick filter chips and pinch-to-resize tiles. Loaded before ui.js; ui.js calls widApply() from apply(). */
/* ---------- [1] HEADER WIDGETS ---------- */
const WID_EL=$('#wid');
/* storage and RAM: green while there is room, amber, orange, red as they fill up. Battery is the other way round. */
const useCol=f=>f<.6?'#2effa0':f<.8?'#ffd400':f<.9?'#ff9100':'#ff4d6d';
const batCol=f=>f>.5?'#2effa0':f>.3?'#ffd400':f>.15?'#ff9100':'#ff4d6d';
const W={st:null,bat:null,ram:null,b:null,timers:[]};
function wring(f,c){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 28 28');s.setAttribute('class','wr');
 const mk=(cl,st)=>{const e=document.createElementNS(NS,'circle');e.setAttribute('cx',14);e.setAttribute('cy',14);e.setAttribute('r',11);e.setAttribute('fill','none');e.setAttribute('stroke-width',4);e.setAttribute('class',cl);if(st)e.setAttribute('stroke',st);return e};
 const bg=mk('wb'),fg=mk('wf',c),C=2*Math.PI*11;fg.setAttribute('stroke-dasharray',(C*Math.max(.02,Math.min(1,f))).toFixed(1)+' '+C.toFixed(1));fg.setAttribute('stroke-linecap','round');fg.setAttribute('transform','rotate(-90 14 14)');s.append(bg,fg);return s}
function wchip(id,ic,top,sub,f,col,on){const b=h('button','wd',null,ic,h('span','wt',null,h('b',null,top),h('small',null,sub)));b.id=id;b.style.setProperty('--wc',col);b.title=sub;if(on)b.onclick=on;return b}
function wdraw(){
 if(!WID_EL)return;WID_EL.replaceChildren();WID_EL.style.display=S.settings.wid?'':'none';if(!S.settings.wid)return;
 if(W.st)WID_EL.append(wchip('wst',wring(W.st.u,useCol(W.st.u)),W.st.free+' free',Math.round(W.st.u*100)+'% of '+W.st.total+' used',W.st.u,useCol(W.st.u),NATIVE?openTools:null));
 if(W.bat){const f=W.bat.level,c=batCol(f),ic=document.createElementNS(NS,'svg');ic.setAttribute('viewBox','0 0 28 28');ic.setAttribute('class','wr');
  const r=document.createElementNS(NS,'rect');r.setAttribute('x',4);r.setAttribute('y',9);r.setAttribute('width',18);r.setAttribute('height',11);r.setAttribute('rx',2.5);r.setAttribute('fill','none');r.setAttribute('stroke',c);r.setAttribute('stroke-width',2);
  const n=document.createElementNS(NS,'rect');n.setAttribute('x',22.5);n.setAttribute('y',12.5);n.setAttribute('width',2.5);n.setAttribute('height',4);n.setAttribute('fill',c);
  const l=document.createElementNS(NS,'rect');l.setAttribute('x',5.5);l.setAttribute('y',10.5);l.setAttribute('width',Math.max(1,15*f));l.setAttribute('height',8);l.setAttribute('rx',1.2);l.setAttribute('fill',c);ic.append(r,n,l);
  WID_EL.append(wchip('wbt',ic,Math.round(f*100)+'%',W.bat.charging?'Battery, charging':'Battery',f,c))}
 if(W.ram){const u=W.ram.u;WID_EL.append(wchip('wrm',wring(u,useCol(u)),Math.round(u*100)+'%','RAM '+fmt(W.ram.total-W.ram.avail)+' of '+fmt(W.ram.total),u,useCol(u),NATIVE?openTools:null))}}
function fourRefresh(){const f=$('#dfiles');if(f&&typeof filesDesk==='function')f.replaceWith(filesDesk());if(typeof qtUpdate==='function')qtUpdate()}
const gb=b=>b>=1e11?Math.round(b/1073741824)+' GB':(b/1073741824).toFixed(1)+' GB';
async function wStorage(){try{if(TOOLS&&TOOLS.storageInfo){const r=await TOOLS.storageInfo(),v=r.volumes.find(x=>x.primary)||r.volumes[0];if(v&&v.total){W.st={u:(v.total-v.free)/v.total,free:gb(v.free),total:gb(v.total)}}}
  else if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();if(e.quota)W.st={u:e.usage/e.quota,free:gb(e.quota-e.usage),total:gb(e.quota)}}}catch{}wdraw();fourRefresh()}
async function wRam(){try{if(TOOLS&&TOOLS.ramInfo){const r=await TOOLS.ramInfo();if(r.total)W.ram={u:(r.total-r.avail)/r.total,total:r.total,avail:r.avail}}}catch{}wdraw();if(typeof qtUpdate==='function')qtUpdate()}
async function wBat(){try{if(!W.b&&navigator.getBattery){W.b=await navigator.getBattery();['levelchange','chargingchange'].forEach(e=>W.b.addEventListener(e,wBat))}
  if(W.b)W.bat={level:W.b.level,charging:W.b.charging}}catch{}wdraw()}
function widApply(){W.timers.forEach(clearInterval);W.timers=[];if(!S.settings.wid){wdraw();return}
 wStorage();wRam();wBat();W.timers.push(setInterval(()=>{if(!document.hidden)wRam()},6000),setInterval(()=>{if(!document.hidden)wStorage()},60000))}

/* ---------- [2] COMPACT VIEW: item count inside folders, counted one folder at a time as tiles scroll into view ---------- */
const DC=new Map();let DCIO=null,dcChain=Promise.resolve();
function dirCount(n,i){
 const sp=n.querySelector('.mt span');if(!sp)return;
 if(DC.has(i.uri)){sp.textContent=DC.get(i.uri);return}
 sp.textContent='…';n._dc=i;
 if(!DCIO)DCIO=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){DCIO.unobserve(e.target);const t=e.target;dcChain=dcChain.then(()=>dcRun(t)).catch(()=>{})}}),{rootMargin:'160px'});
 DCIO.observe(n)}
async function dcRun(n){const i=n._dc;if(!i||!n.isConnected)return;
 try{const r=await SAF.list({uri:i.uri}),c=r.items.filter(x=>x.name!==TRASH).length,t=plural(c,'item');DC.set(i.uri,t);const sp=n.querySelector('.mt span');if(sp&&n.isConnected)sp.textContent=t}catch{}}

/* ---------- [3] QUICK FILTERS: one row of chips above the list ---------- */
function drawQF(){
 const B=$('#qf');if(!B)return;B.replaceChildren();
 const on=(cur.m||cur.cat)&&cur.cat!=='bin'&&!(cur.cat&&CATS[cur.cat]&&CATS[cur.cat].kind);B.classList.toggle('on',!!on);if(!on)return;
 FILTERS.forEach(([k,t])=>{const c=h('button','chip'+(FK===k?' on':''),t);c.onclick=()=>{if(FK===k)return;FK=k;SEL.clear();$('#list').scrollTop=0;cur.m&&!cur.cat?load():draw()};B.append(c)})}

