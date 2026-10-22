/* gcrop.js: Crop and rotate (V0.21.0). Opens from the photo viewer (More) and the Gallery selection bar (Crop, one picture).
   Always saves a NEW picture next to the original (name_edit.jpg). The original is never touched.
   Orientation: the browser draws a picture upright (EXIF Orientation applied), so the crop frame is built from the upright picture, the saved
   pixels are upright, and the Orientation tag is dropped from the copied metadata (otherwise the copy would turn a second time).
   Tools: aspect presets, 90° turns, flip, Straighten (±45°, the picture is zoomed just enough that no corner is empty), drag the corners,
   edges or the box. Metadata: JPEG copies keep the EXIF (camera, date taken, caption, GPS unless turned off in Gallery settings); the MakerNote
   and the old thumbnail are dropped, the size tags are rewritten. PNG and WebP copies carry no EXIF. */
const GC={on:false,it:null,img:null,url:null,meta:null,iw:0,ih:0,q:0,fx:false,fy:false,ang:0,r:null,asp:'free',ps:1,dpr:1,busy:false,fmt:'jpeg',drag:null};
const GCASP=[['free','Free',0],['orig','Original',-1],['1:1','1:1',1],['4:3','4:3',4/3],['3:4','3:4',3/4],['16:9','16:9',16/9],['9:16','9:16',9/16],['3:2','3:2',3/2],['2:3','2:3',2/3]];
const gcFrame=()=>GC.q%2?{w:GC.ih,h:GC.iw}:{w:GC.iw,h:GC.ih};
/* zoom that keeps the turned picture covering the whole frame: cos a + sin a * longer/shorter side */
const gcZoom=()=>{const f=gcFrame(),a=Math.abs(GC.ang)*Math.PI/180;return Math.cos(a)+Math.sin(a)*Math.max(f.w/f.h,f.h/f.w)};
function gcRatio(){const p=GCASP.find(x=>x[0]===GC.asp);if(!p||!p[2])return 0;if(p[2]<0){const f=gcFrame();return f.w/f.h}return p[2]}
function gcFit(R){const f=gcFrame();if(!R)return{x:0,y:0,w:f.w,h:f.h};let w,h;if(f.w/f.h>R){h=f.h;w=h*R}else{w=f.w;h=w/R}return{x:(f.w-w)/2,y:(f.h-h)/2,w,h}}
/* draw the frame: turn by quarters, mirror, straighten, with the frame point (ox,oy) at the canvas origin, scaled by sc */
function gcDraw(ctx,sc,ox,oy){const f=gcFrame(),z=gcZoom();ctx.save();ctx.translate((f.w/2-ox)*sc,(f.h/2-oy)*sc);ctx.rotate(GC.ang*Math.PI/180);
 ctx.scale(z*sc*(GC.fx?-1:1),z*sc*(GC.fy?-1:1));ctx.rotate(GC.q*Math.PI/2);ctx.drawImage(GC.img,-GC.iw/2,-GC.ih/2);ctx.restore()}
const gcDirty=()=>{const f=gcFrame(),r=GC.r;return !!(GC.q||GC.fx||GC.fy||GC.ang||Math.abs(r.w-f.w)>1||Math.abs(r.h-f.h)>1)};
const gcSniff=u=>u[0]===255&&u[1]===216?'jpeg':u[0]===137&&u[1]===80&&u[2]===78&&u[3]===71?'png':u[8]===87&&u[9]===69&&u[10]===66&&u[11]===80?'webp':'other';

async function gcOpen(it){
 if(!it||GC.on||GC.busy)return;
 if(it.size>40*1048576)return toast('This picture is too large to edit here (40 MB limit).');
 busy('Opening…');let bytes;
 try{bytes=await xfBytes(it)}catch(e){unbusy();return toast(e.message||'This picture could not be read.')}
 const fm=gcSniff(bytes),url=URL.createObjectURL(new Blob([bytes],{type:fm==='png'?'image/png':fm==='webp'?'image/webp':'image/jpeg'})),img=new Image();
 try{img.src=url;await img.decode()}catch{URL.revokeObjectURL(url);unbusy();return toast("This picture couldn't be decoded here.")}
 if(img.naturalWidth*img.naturalHeight>64e6){URL.revokeObjectURL(url);unbusy();return toast('This picture is too large to edit here (over 64 megapixels).')}
 Object.assign(GC,{on:true,it,img,url,iw:img.naturalWidth,ih:img.naturalHeight,q:0,fx:false,fy:false,ang:0,asp:'free',fmt:fm,meta:null,busy:false,drag:null});
 if(fm==='jpeg'){try{GC.meta=xfRead(bytes).M}catch{GC.meta=null}}
 GC.r=gcFit(0);unbusy();gcShell();$('#gc').classList.add('on');document.body.classList.add('gcon');gcPaint()}
function gcClose(){GC.on=false;GC.drag=null;const s=$('#gc');if(s)s.classList.remove('on');document.body.classList.remove('gcon');if(GC.url)URL.revokeObjectURL(GC.url);GC.url=null;GC.img=null;GC.meta=null}
function gcBack(){if(!GC.on)return false;if(GC.busy)return true;
 if(gcDirty())dlg({title:'Discard changes?',msg:'The picture has not been saved.',ok:'Discard',danger:true}).then(r=>{if(r)gcClose()});else gcClose();return true}

function gcShell(){let s=$('#gc');if(s)s.remove();s=h('section','gc');s.id='gc';s.setAttribute('aria-label','Crop and rotate');
 const btn=(ic,lb,f,cls)=>{const b=h('button','ib '+(cls||''),null,ico(ic));b.setAttribute('aria-label',lb);b.onclick=f;return b};
 const x=btn('x','Close',gcBack),sv=h('button','chip on','Save copy');sv.id='gcsv';sv.onclick=gcSave;
 const hd=h('div','gch',null,x,h('div','gcti',null,h('b',null,'Crop and rotate'),h('small',null,'')),sv);hd.querySelector('small').id='gcdim';
 const cv=document.createElement('canvas');cv.id='gcv';
 const box=h('div','gcbox');box.id='gcbox';['nw','n','ne','e','se','s','sw','w'].forEach(k=>{const e=h('i','gcp gcp-'+k);e.dataset.h=k;box.append(e)});
 box.append(h('span','gcg gcg1'),h('span','gcg gcg2'),h('span','gcg gcg3'),h('span','gcg gcg4'));
 const wrap=h('div','gcwrap',null,cv,box),st=h('div','gcst',null,wrap);
 const asp=h('div','gcasp');GCASP.forEach(([id,nm])=>{const c=h('button','chip'+(GC.asp===id?' on':''),nm);c.dataset.a=id;c.onclick=()=>{GC.asp=id;GC.r=gcFit(gcRatio());gcPaint()};asp.append(c)});
 const row=h('div','gcrow',null,btn('rot','Rotate left',()=>gcTurn(3),'gcl'),btn('rot','Rotate right',()=>gcTurn(1)),btn('flip','Flip left and right',()=>{GC.fx=!GC.fx;gcPaint()}),btn('flip','Flip top and bottom',()=>{GC.fy=!GC.fy;gcPaint()},'gcv90'),
  (()=>{const r=h('button','chip','Reset');r.onclick=gcReset;return r})());
 const sl=document.createElement('input');sl.type='range';sl.min=-45;sl.max=45;sl.step=.5;sl.value=0;sl.id='gcsl';sl.setAttribute('aria-label','Straighten');
 sl.oninput=()=>{GC.ang=+sl.value;gcPaint()};sl.ondblclick=()=>{sl.value=0;GC.ang=0;gcPaint()};
 const srow=h('div','gcsr',null,h('span',null,'Straighten'),sl,h('b',null,'0°'));srow.querySelector('b').id='gcan';
 s.append(hd,st,h('div','gcft',null,asp,row,srow));document.body.append(s);
 /* dragging: corners and edges resize, the middle moves */
 box.addEventListener('pointerdown',e=>{if(GC.busy)return;e.preventDefault();box.setPointerCapture(e.pointerId);GC.drag={hd:e.target.dataset&&e.target.dataset.h||'move',x:e.clientX,y:e.clientY,r:{...GC.r}}});
 box.addEventListener('pointermove',e=>{const d=GC.drag;if(!d)return;GC.r=gcMove(d.hd,d.r,(e.clientX-d.x)/GC.ps,(e.clientY-d.y)/GC.ps);gcPlace()});
 ['pointerup','pointercancel'].forEach(v=>box.addEventListener(v,()=>{GC.drag=null}))}
function gcTurn(n){GC.q=(GC.q+n)%4;GC.r=gcFit(gcRatio());gcPaint()}
function gcReset(){GC.q=0;GC.fx=GC.fy=false;GC.ang=0;GC.asp='free';GC.r=gcFit(0);const sl=$('#gcsl');if(sl)sl.value=0;gcPaint()}
/* resize / move the crop box in frame pixels. Locked ratio keeps the opposite corner (or edge middle) fixed and stays inside the frame. */
function gcMove(hd,r0,dx,dy){const f=gcFrame(),MIN=Math.max(24,Math.min(f.w,f.h)*.05),R=gcRatio();let{x,y,w,h}=r0;
 if(hd==='move')return{x:Math.min(Math.max(0,x+dx),f.w-w),y:Math.min(Math.max(0,y+dy),f.h-h),w,h};
 let l=x,t=y,rt=x+w,b=y+h;
 if(!R){if(hd.includes('w'))l=Math.min(Math.max(0,l+dx),rt-MIN);if(hd.includes('e'))rt=Math.max(Math.min(f.w,rt+dx),l+MIN);
  if(hd.includes('n'))t=Math.min(Math.max(0,t+dy),b-MIN);if(hd.includes('s'))b=Math.max(Math.min(f.h,b+dy),t+MIN);return{x:l,y:t,w:rt-l,h:b-t}}
 const hx=hd.includes('w')?-1:hd.includes('e')?1:0,hy=hd.includes('n')?-1:hd.includes('s')?1:0,ax=hx<0?rt:hx>0?l:x+w/2,ay=hy<0?b:hy>0?t:y+h/2;let nw=w,nh=h;
 if(hx&&hy){nw=Math.max(MIN,w+hx*dx);nh=Math.max(MIN,h+hy*dy);if(nw/nh>R)nh=nw/R;else nw=nh*R}
 else if(hx){nw=Math.max(MIN,w+hx*dx);nh=nw/R}else{nh=Math.max(MIN,h+hy*dy);nw=nh*R}
 const mw=hx<0?ax:hx>0?f.w-ax:2*Math.min(ax,f.w-ax),mh=hy<0?ay:hy>0?f.h-ay:2*Math.min(ay,f.h-ay),k=Math.min(1,mw/nw,mh/nh);nw*=k;nh*=k;
 return{x:hx<0?ax-nw:hx>0?ax:ax-nw/2,y:hy<0?ay-nh:hy>0?ay:ay-nh/2,w:nw,h:nh}}
function gcPlace(){const b=$('#gcbox');if(!b)return;const r=GC.r,p=GC.ps;b.style.left=r.x*p+'px';b.style.top=r.y*p+'px';b.style.width=r.w*p+'px';b.style.height=r.h*p+'px';
 const d=$('#gcdim');if(d)d.textContent=Math.round(r.w)+' × '+Math.round(r.h)}
function gcPaint(){const s=$('#gc');if(!s||!GC.img)return;const f=gcFrame(),st=s.querySelector('.gcst'),W=st.clientWidth-24,H=st.clientHeight-24;
 if(W<40||H<40)return;GC.ps=Math.min(W/f.w,H/f.h,2);GC.dpr=Math.min(devicePixelRatio||1,2);
 const cv=$('#gcv'),wr=s.querySelector('.gcwrap');wr.style.width=f.w*GC.ps+'px';wr.style.height=f.h*GC.ps+'px';
 cv.width=Math.max(1,Math.round(f.w*GC.ps*GC.dpr));cv.height=Math.max(1,Math.round(f.h*GC.ps*GC.dpr));cv.style.width='100%';cv.style.height='100%';
 const cx=cv.getContext('2d');cx.imageSmoothingQuality='high';gcDraw(cx,GC.ps*GC.dpr,0,0);gcPlace();
 s.querySelectorAll('.gcasp .chip').forEach(c=>c.classList.toggle('on',c.dataset.a===GC.asp));
 const an=$('#gcan');if(an)an.textContent=(GC.ang%1?GC.ang.toFixed(1):GC.ang)+'°'}
addEventListener('resize',()=>{if(GC.on)gcPaint()});

/* metadata for the copy: keep everything except the old orientation (the pixels are upright now) and the old picture size */
function gcMeta(M,W,H){if(!M)return null;const L=(tag,v)=>{const r=new Uint8Array(4);new DataView(r.buffer).setUint32(0,v,M.le);return{tag,type:4,count:1,raw:r}};
 const N={le:M.le,ifd0:M.ifd0.filter(e=>e.tag!==0x112),exif:M.exif.filter(e=>e.tag!==0xA002&&e.tag!==0xA003),gps:gset().cropGps?M.gps.slice():[]};
 N.exif.push(L(0xA002,W),L(0xA003,H));return N}
async function gcSave(){
 if(GC.busy||!GC.on)return;const it=GC.it,f=gcFrame(),r=GC.r;
 if(!gcDirty())return toast('Nothing to save yet. Crop, turn or flip first.');
 const dir=gpar(it);if(!dir||!(typeof SAF!=='undefined'&&SAF))return toast('There is nowhere to save a copy of this picture.');
 let W=Math.round(r.w),H=Math.round(r.h),sc=1;const k=Math.min(1,Math.sqrt(40e6/(W*H)),8192/Math.max(W,H));if(k<1){sc=k;W=Math.round(W*k);H=Math.round(H*k)}
 const mime=GC.fmt==='png'?'image/png':GC.fmt==='webp'?'image/webp':'image/jpeg',ext=GC.fmt==='png'?'png':GC.fmt==='webp'?'webp':'jpg';
 busy('Saving a copy…');GC.busy=true;
 try{const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d');if(mime==='image/jpeg'){cx.fillStyle='#000';cx.fillRect(0,0,W,H)}
  cx.imageSmoothingQuality='high';gcDraw(cx,sc,r.x,r.y);
  const blob=await new Promise(res=>cv.toBlob(res,mime,.92));if(!blob)throw Error('The picture could not be encoded.');
  let u8=new Uint8Array(await blob.arrayBuffer()),meta=false;
  if(mime==='image/jpeg'&&GC.meta){try{const p=xfPack(u8,gcMeta(GC.meta,W,H),false),bm=await createImageBitmap(new Blob([p],{type:mime}));bm.close&&bm.close();u8=p;meta=true}catch{meta=false}}
  const base=it.name.replace(/\.[^.]+$/,''),have=new Set(((await SAF.list({uri:dir})).items||[]).map(x=>x.name.toLowerCase()));
  let nm=base+'_edit.'+ext,n=2;while(have.has(nm.toLowerCase()))nm=base+'_edit'+(n++)+'.'+ext;
  const w=await SAF.writeFile({dir,name:nm,b64:xfB64(u8),mime});let st={};try{st=await SAF.stat({uri:w.uri})}catch{}
  const ni={uri:w.uri,name:st.name||nm,size:st.size||u8.length,mtime:st.mtime||Date.now(),mime,parent:dir,pname:it.pname,path:it.path,m:it.m,fs:it.fs};
  if(GL.items)GL.items.push(ni);libReset&&libReset();
  const msg='Saved '+ni.name+'.'+(GC.fmt==='jpeg'?(meta?' EXIF kept.':' EXIF could not be kept.'):'')+(sc<1?' Reduced to fit.':'');
  gcClose();unbusy();GC.busy=false;
  if(typeof IV!=='undefined'&&IV.on){IV.list.splice(IV.i+1,0,ni);IV.i++;ivLoad()}
  if(GL.open)glRedraw();glHomeRefresh();toast(msg);return ni}
 catch(e){toast(e.message||'The copy could not be saved.')}
 finally{unbusy();GC.busy=false}}
