/* photo.js: the Photo viewer (V0.15.0). Pictures open here, never in the media player.
   Pinch to zoom, double-tap to zoom in or out, drag when zoomed, swipe left / right for the next / previous picture,
   tap once to hide the bars. Options: rotate, slideshow, share, delete, details, open with, edit in another app. */
const IV={on:false,list:[],i:0,sc:1,tx:0,ty:0,rot:0,url:null,tok:0,slide:null,pts:new Map(),pd:0,ps:1,lt:0,bars:true};
const iv=$('#iv'),ivi=$('#ivi'),ivs=$('#ivs');
function ivApply(){let f=1;if(IV.rot%180){f=Math.min(1,ivs.clientWidth/(ivi.clientHeight||1),ivs.clientHeight/(ivi.clientWidth||1))}
 ivi.style.transform='translate('+IV.tx+'px,'+IV.ty+'px) rotate('+IV.rot+'deg) scale('+(IV.sc*f)+')'}
function ivReset(){IV.sc=1;IV.tx=IV.ty=0;ivApply()}
async function ivOpen(item,list){IV.list=list&&list.length?list:[item];IV.i=Math.max(0,IV.list.indexOf(item));
 IV.on=true;iv.classList.add('on');document.body.classList.add('ivon');await ivLoad()}
async function ivLoad(){const it=IV.list[IV.i],my=++IV.tok;IV.rot=0;ivReset();iv.classList.add('load');
 $('#ivt').textContent=it.name;ivFavSync();$('#ivn').textContent=(IV.i+1)+' / '+IV.list.length+(it.size?' · '+fmt(it.size):'');ivi.removeAttribute('src');
 let src,path;
 try{
  if(it.uri){path=(await SAF.cacheCopy({uri:it.uri,name:it.name})).path;if(my!==IV.tok)return;src=CAP.convertFileSrc?CAP.convertFileSrc(path):location.origin+'/_capacitor_file_'+path}
  else{const f=it.file||await it.fh.getFile();if(my!==IV.tok)return;if(IV.url)URL.revokeObjectURL(IV.url);IV.url=URL.createObjectURL(f);src=IV.url}
 }catch(e){if(e.code!=='CANCELLED')toast(e.message);iv.classList.remove('load');return}
 ivi.onload=()=>{if(my===IV.tok){iv.classList.remove('load');ivApply()}};
 ivi.onerror=()=>{if(my===IV.tok){iv.classList.remove('load');toast("This picture's format isn't supported here.")}};
 ivi.src=src;if(path&&SAF)SAF.clearCache({keep:path}).catch(()=>{})}
const ivStep=d=>{if(IV.list.length<2){ivReset();return}IV.i=(IV.i+d+IV.list.length)%IV.list.length;ivLoad()};
function ivClose(){IV.tok++;IV.on=false;clearInterval(IV.slide);IV.slide=null;setIcon('#ivsl','play');
 iv.classList.remove('on','load');document.body.classList.remove('ivon');ivi.removeAttribute('src');
 if(IV.url){URL.revokeObjectURL(IV.url);IV.url=null}if(SAF)SAF.clearCache().catch(()=>{})}
function ivSlide(){if(IV.slide){clearInterval(IV.slide);IV.slide=null;setIcon('#ivsl','play');toast('Slideshow stopped.');return}
 if(IV.list.length<2)return toast('Only one picture here.');
 IV.slide=setInterval(()=>ivStep(1),3500);setIcon('#ivsl','pause');iv.classList.remove('bars');toast('Slideshow: tap to stop.')}
async function ivDelete(){const it=IV.list[IV.i];
 /* the Gallery's delete handles direct file paths too, and drops the picture from favourites and categories (it calls ivSwap, which moves the viewer on) */
 if(typeof glDeleteItems==='function'&&!it.orig){await glDeleteItems([it]);return}
 const ok=await opDelete([it]);if(!ok)return;
 IV.list.splice(IV.i,1);if(!IV.list.length)return ivClose();IV.i=Math.min(IV.i,IV.list.length-1);ivLoad()}
/* heart button: filled when the picture is a favourite (kept in step with the Gallery by glFavSet) */
function ivFavSync(){const b=$('#ivfv');if(!b)return;const it=IV.list[IV.i],on=!!it&&typeof glIsFav==='function'&&glIsFav(it);setIcon('#ivfv',on?'heartfill':'heart');b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')}
/* a picture was renamed, moved or deleted: map is old key -> new item (or null). Keep the viewer pointing at the right one. */
function ivSwap(map){if(!IV.on||!IV.list.length)return;const cur=IV.list[IV.i],ck=cur&&(cur.uri||cur.name);let gone=false;
 const L=[];IV.list.forEach((i,n)=>{const k=i.uri||i.name;if(map.has(k)){const v=map.get(k);if(v)L.push(v);else{if(n===IV.i)gone=true}}else L.push(i)});
 const at=IV.i;IV.list=L;if(!L.length)return ivClose();
 if(gone){IV.i=Math.min(at,L.length-1);ivLoad();return}
 IV.i=Math.max(0,L.findIndex(i=>map.has(ck)?i===map.get(ck):i===cur));const now=IV.list[IV.i];if(now){$('#ivt').textContent=now.name;$('#ivn').textContent=(IV.i+1)+' / '+IV.list.length+(now.size?' · '+fmt(now.size):'');ivFavSync()}}
function ivMore(e){const r=e.currentTarget.getBoundingClientRect(),it=IV.list[IV.i];
 menu(r.right,r.top-8,[['Information',()=>typeof xfOpen==='function'?xfOpen(it):it.uri&&SAF?opInfo(it):toast(it.name+(it.size?', '+fmt(it.size):''))],
  ...(it.uri&&SAF?[['Open with…',()=>opOpenWith(it,true)]]:[]),
  ...(it.uri&&SAF&&!it.orig&&typeof glRename==='function'?[['Rename…',()=>glRename(it)],['Move to album…',()=>glPickDest('move',[it])],['Copy to album…',()=>glPickDest('copy',[it])],['Crop and rotate…',()=>gcOpen(it)]]:[]),
  ['Rotate left',()=>{IV.rot=(IV.rot+270)%360;ivApply()}],['Reset zoom',ivReset]])}
/* gestures */
ivs.addEventListener('pointerdown',e=>{ivs.setPointerCapture(e.pointerId);IV.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(IV.pts.size===1){IV.x0=e.clientX;IV.y0=e.clientY;IV.t0=Date.now();IV.moved=0}
 if(IV.pts.size===2){const [a,b]=[...IV.pts.values()];IV.pd=Math.hypot(a.x-b.x,a.y-b.y)||1;IV.ps=IV.sc}});
ivs.addEventListener('pointermove',e=>{const p=IV.pts.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 IV.moved=Math.max(IV.moved,Math.hypot(e.clientX-IV.x0,e.clientY-IV.y0));
 if(IV.pts.size===2){const [a,b]=[...IV.pts.values()];IV.sc=Math.max(.6,Math.min(8,IV.ps*Math.hypot(a.x-b.x,a.y-b.y)/IV.pd))}
 else if(IV.sc>1.02){IV.tx+=dx;IV.ty+=dy}
 else IV.tx=e.clientX-IV.x0;/* swipe feedback */
 ivApply()});
const ivUp=e=>{if(!IV.pts.delete(e.pointerId))return;if(IV.pts.size)return;
 if(IV.sc<1.05){const dx=e.clientX-IV.x0,dy=e.clientY-IV.y0;IV.sc=1;IV.ty=0;IV.tx=0;
  if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.3&&e.type==='pointerup'){ivApply();ivStep(dx<0?1:-1);return}ivApply()}
 if(IV.moved<10&&Date.now()-IV.t0<300&&e.type==='pointerup'){const n=Date.now();
  if(IV.slide){ivSlide();return}
  if(n-IV.lt<300){IV.lt=0;IV.sc=IV.sc>1.2?1:2.5;IV.tx=IV.ty=0;ivApply()}
  else{IV.lt=n;setTimeout(()=>{if(IV.lt===n){IV.lt=0;iv.classList.toggle('bars')}},310)}}};
ivs.addEventListener('pointerup',ivUp);ivs.addEventListener('pointercancel',ivUp);
$('#ivx').onclick=ivClose;$('#ivr').onclick=()=>{IV.rot=(IV.rot+90)%360;ivApply()};
$('#ivfv').onclick=()=>{const it=IV.list[IV.i];if(it&&typeof glFavSet==='function')glFavSet([it],!glIsFav(it))};
$('#ivsl').onclick=ivSlide;$('#ivsh').onclick=()=>opShare([IV.list[IV.i]]);$('#ivdl').onclick=ivDelete;$('#ivmo').onclick=ivMore;
addEventListener('resize',()=>{if(IV.on)ivApply()});
