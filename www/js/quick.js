/* quick.js (V0.45.0): the Quick tools widget at the bottom of Home, above "Strategy over impulse".
   One card: a live storage ring, a RAM meter, six scan tools, an Optimise button, and two status pills (Recycle bin, Shield).
   It is built once (qtCard) and then only updated in place (qtUpdate), so a tap is never lost to a redraw. qtUpdate runs from the
   storage and RAM readers in widgets.js and whenever Home is shown. Every tool opens the same Tools sheet and result lists as
   Tools > ..., and nothing is removed until you confirm there. The scanners need the Android app and All files access.
   Strategy Over Impulse. */
const QT_RING=2*Math.PI*26;
const QT_TOOLS=[
 ['phone','Large files','Over 50 MB',()=>tLarge()],
 ['copy','Duplicates','Same bytes',()=>tDup()],
 ['trash','Junk','Temp and logs',()=>tJunk()],
 ['chip','Installers','Old APKs',()=>tApk()],
 ['history','Fresh files','Last 3 days',()=>tFresh()],
 ['search','Analyzer','What fills it',()=>tAnalyze()]];
/* opens the Tools sheet on the chosen tool. A refused permission or a cancelled scan falls back to the Tools list, never an empty sheet. */
async function qtRun(fn){
 if(!NATIVE||!TOOLS)return toast('Quick tools run in the Android app.');
 try{document.body.classList.remove('nav');$('#tools').classList.add('on');TV.view='home';await fn()}
 catch(e){if(e&&e.code!=='CANCELLED')toast((e&&e.message)||'That did not work.')}
 if($('#tools').classList.contains('on')&&TV.view==='home')drawTools()}
function qtRing(){
 const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 64 64');s.setAttribute('class','qtr');s.setAttribute('aria-hidden','true');
 const mk=c=>{const e=document.createElementNS(NS,'circle');e.setAttribute('cx',32);e.setAttribute('cy',32);e.setAttribute('r',26);e.setAttribute('fill','none');e.setAttribute('stroke-width',7);e.setAttribute('class',c);return e};
 const fg=mk('qf');fg.setAttribute('stroke-linecap','round');fg.setAttribute('transform','rotate(-90 32 32)');fg.setAttribute('stroke-dasharray','0 '+QT_RING.toFixed(1));
 s.append(mk('qb'),fg);return s}
function qtCard(){
 const c=h('div','dc dqt');c.id='dqt';
 const opt=h('button','qto',null,ico('bolt'),h('span',null,'Optimise'));opt.setAttribute('aria-label','Optimise Conduint: free memory, clear cache, stop battery drains');
 opt.onclick=()=>optimiseConduit();
 const head=h('div','qth',null,h('div','qtt',null,h('b',null,'Quick tools'),h('small',null,'Nothing is deleted until you confirm')),opt);
 const ring=h('button','qtrw',null,qtRing(),h('b','qtpc','–'));ring.setAttribute('aria-label','Open the storage analyzer');ring.onclick=()=>qtRun(()=>tAnalyze());
 const ramBar=h('span','dbar qtbar',null,h('i'));
 const gm=h('div','qtm',null,
  h('div','qtl',null,h('b','qtst','Internal storage'),h('small','qtsub','Reading storage…')),
  h('div','qtl',null,h('b',null,'Memory'),h('small','qtram','Reading memory…')),ramBar);
 const gauge=h('div','qtg',null,ring,gm);
 const grid=h('div','qtgrid');
 QT_TOOLS.forEach(([ic,t,sub,f])=>{const b=h('button','qtk',null,h('span','qti',null,ico(ic)),h('b',null,t),h('small',null,sub));b.onclick=()=>qtRun(f);grid.append(b)});
 const bin=h('button','qtpill qtbin',null,ico('trash'),h('span',null,'Recycle bin'));bin.onclick=()=>goCat('bin');
 const sh=h('button','qtpill qtsh',null,ico('shield'),h('span',null,'Shield'));
 sh.onclick=()=>qtRun(async()=>{if(typeof tShield==='function')await tShield();else toast('Shield is not available.')});
 c.append(head,gauge,grid,h('div','qtpills',null,bin,sh));
 qtUpdate();return c}
/* in-place refresh: storage ring, RAM bar, bin count, Shield state. Safe to call at any time, even before the card exists. */
function qtUpdate(){
 const c=$('#dqt');if(!c)return;
 const st=W.st,fg=c.querySelector('.qf'),pc=c.querySelector('.qtpc');
 if(st){const f=Math.max(0,Math.min(1,st.u)),col=useCol(f);
  fg.setAttribute('stroke-dasharray',(QT_RING*Math.max(.02,f)).toFixed(1)+' '+QT_RING.toFixed(1));fg.style.stroke=col;
  pc.textContent=Math.round(f*100)+'%';pc.style.color=col;
  c.querySelector('.qtsub').textContent=st.free+' free of '+st.total}
 const rm=W.ram,bar=c.querySelector('.qtbar i');
 if(rm){const u=Math.max(0,Math.min(1,rm.u));bar.style.width=Math.round(u*100)+'%';bar.style.background=useCol(u);
  c.querySelector('.qtram').textContent=Math.round(u*100)+'% used · '+fmt(rm.avail)+' free'}
 else{bar.style.width='0';c.querySelector('.qtram').textContent=NATIVE?'Reading memory…':'Android app only'}
 const n=(S.trash||[]).length;c.querySelector('.qtbin span').textContent='Recycle bin · '+(n?plural(n,'item'):'empty');
 const on=typeof shOn==='function'?shOn():null,sp=c.querySelector('.qtsh span'),b=c.querySelector('.qtsh');
 sp.textContent='Shield'+(on==null?'':on?' · ON':' · OFF');b.classList.toggle('on',on===true);b.classList.toggle('off',on===false)}
