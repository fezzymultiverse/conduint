/* mediax.js (V0.44.0): video Enhance panel, resolution badge, and video to audio conversion. Loaded after player.js.
   HONEST LIMITS. Local videos play at the resolution of the file, decoded by the phone's hardware, so there is no quality ladder to switch:
   a soft picture is a soft file. "Enhance" is a live display filter (brightness, contrast, colour, sharpening). It makes video look better
   but cannot add detail the file does not have, and Sharpness above 0 costs battery and can stutter 1080p on a weak phone.
   Conversion runs in the native Convert plugin: MP3 and M4A through ffmpeg-kit when this build has it, Original audio (no re-encode) always. */

/* ---------- [1] Enhance ---------- */
const VEN_PRE=[['Off',{b:100,c:100,s:100,sh:0}],['Enhance',{b:104,c:112,s:114,sh:35}],['Vivid',{b:102,c:118,s:135,sh:30}],['Cinema',{b:96,c:122,s:92,sh:20}],['Night',{b:125,c:108,s:100,sh:15}],['Sharp',{b:100,c:108,s:104,sh:80}]];
const VEN_SL=[['b','Brightness',60,160],['c','Contrast',60,160],['s','Colour',0,200],['sh','Sharpness',0,100]];
const venGet=()=>{const v=(S.settings&&S.settings.vEn)||{};const o={b:100,c:100,s:100,sh:0};for(const k in o)if(typeof v[k]==='number')o[k]=Math.max(0,Math.min(200,v[k]));return o};
const venIsOff=v=>v.b===100&&v.c===100&&v.s===100&&v.sh===0;
(()=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','0');s.setAttribute('height','0');s.style.position='absolute';
 s.innerHTML='<filter id="vsharp" color-interpolation-filters="sRGB"><feConvolveMatrix id="vsk" order="3" kernelMatrix="0 0 0 0 1 0 0 0 0" preserveAlpha="true"/></filter>';document.body.append(s)})();
function venApply(){
 const v=venGet(),vid=pl.classList.contains('k-vid');
 if(!vid||venIsOff(v)){pv.style.removeProperty('filter');return}
 const a=v.sh/100;$('#vsk').setAttribute('kernelMatrix',[0,-a,0,-a,1+4*a,-a,0,-a,0].join(' '));
 pv.style.filter='brightness('+v.b+'%) contrast('+v.c+'%) saturate('+v.s+'%)'+(v.sh>0?' url(#vsharp)':'')}
function venSet(o){S.settings.vEn={...venGet(),...o};save();venApply()}
let venEl=null;
function venClose(){if(venEl)venEl.classList.remove('on')}
function venOpen(){
 if(!venEl){venEl=h('div');venEl.id='ven';document.body.append(venEl)}
 const draw=()=>{const v=venGet();venEl.replaceChildren();
  const hd=h('div','venh',null,h('b',null,'Enhance video')),x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Close');x.onclick=venClose;hd.append(x);venEl.append(hd);
  const pr=h('div','venp');VEN_PRE.forEach(([n,p])=>{const on=JSON.stringify(p)===JSON.stringify(v),b=h('button','chip'+(on?' on':''),n);b.onclick=()=>{venSet(p);draw()};pr.append(b)});venEl.append(pr);
  VEN_SL.forEach(([k,l,lo,hi])=>{const r=h('label','venr',null,h('span',null,l),h('b',null,String(v[k])));const i=h('input');i.type='range';i.min=lo;i.max=hi;i.value=v[k];
   i.oninput=()=>{r.lastChild.textContent=i.value;venSet({[k]:+i.value})};i.onchange=draw;r.append(i);venEl.append(r)});
  venEl.append(h('small','venn','Live display filter. It cannot add detail the file does not have, and Sharpness uses more battery.'))};
 draw();venEl.classList.add('on')}
new MutationObserver(()=>{if(!pl.classList.contains('on')||!pl.classList.contains('k-vid'))venClose();venApply()}).observe(pl,{attributes:true,attributeFilter:['class']});

/* ---------- [2] resolution badge and codec message ---------- */
pv.addEventListener('loadedmetadata',()=>{
 venApply();
 if(!pl.classList.contains('k-vid')||!pv.videoWidth)return;
 const w=pv.videoWidth,h2=pv.videoHeight,m=Math.max(w,h2)>=3800||Math.min(w,h2)>=2160?'4K':Math.min(w,h2)>=1440?'2K':Math.min(w,h2)>=1080?'Full HD':Math.min(w,h2)>=720?'HD':'SD',el=$('#pa2');
 if(el)el.textContent=w+'×'+h2+' · '+m});
pv.addEventListener('error',()=>{if(pl.classList.contains('k-vid')&&pv.error&&pv.error.code===4)toast('This phone cannot decode this video here (often H.265/HEVC or MKV). Use "Open with…" in the file menu to play it in another player.')});
$('#pen').onclick=()=>venOpen();

/* ---------- [3] video to audio ---------- */
const CVT=(typeof BRIDGE!=='undefined'&&BRIDGE)?plug('Convert'):null;
const CVT_Q=[['mp3:320','MP3 · 320 kbps (best)'],['mp3:256','MP3 · 256 kbps'],['mp3:192','MP3 · 192 kbps (good)'],['mp3:128','MP3 · 128 kbps (standard)'],['mp3:96','MP3 · 96 kbps (small)'],['mp3:64m','MP3 · 64 kbps mono (voice, smallest)'],['mp3:v0','MP3 · variable, highest quality'],['m4a:256','M4A (AAC) · 256 kbps'],['m4a:128','M4A (AAC) · 128 kbps']];
async function cvtOpen(item){
 if(!CVT)return toast('Conversion runs inside the Android app.');
 if(!item||!item.uri)return toast('Convert works on videos stored on this phone.');
 let cap={};try{cap=await CVT.capabilities()||{}}catch{}
 const L=[...(cap.ffmpeg?CVT_Q:[]),['copy:0','Original audio, no re-encode (M4A, instant)']];
 const r=await dlg({title:'Convert to audio',msg:item.name+(cap.ffmpeg?'':'\nMP3 needs the converter library and this build does not have it, so only the original audio can be extracted (AAC audio only).'),opts:L,val:L[0][0],ok:'Convert'});
 if(!r||r.o==null)return;
 const[fmt,q]=r.o.split(':'),kb=q==='v0'?0:parseInt(q,10)||0,mono=/m$/.test(q||''),base=item.name.replace(/\.[^.]+$/,'');
 let src=null,out=null;
 busy('Preparing '+item.name+'…');
 try{
  src=(await SAF.cacheCopy({uri:item.uri,name:item.name})).path;
  busy('Converting… keep Conduint open');
  out=await CVT.toAudio({path:src,name:base,format:fmt,kbps:kb,mono});
  unbusy();
  await SAF.saveCopy({uri:'file://'+out.path,name:out.name,mime:fmt==='mp3'?'audio/mpeg':'audio/mp4'});
  toast('Saved '+out.name+' ('+fmt0(out.size)+')')}
 catch(e){unbusy();if(!e||e.code!=='CANCELLED')toast((e&&e.message)||'Conversion failed.')}
 finally{try{if(src)await CVT.clean({path:src})}catch{}try{if(out)await CVT.clean({path:out.path})}catch{}}}
const fmt0=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
$('#pcv').onclick=()=>{const it=Q[qi];if(it)cvtOpen(it)};
