/* exif.js: the EXIF tool (V0.18.0). Opens from the photo viewer (More > Information) and from the Gallery (select a picture > More > Information).
   READS EXIF from JPEG, PNG (eXIf chunk) and WebP (EXIF chunk). EDITS JPEG only: caption, artist, copyright, date taken,
   remove location (GPS), remove all metadata (orientation is kept so the picture never flips).
   SAFE WRITE: the new file is rebuilt in memory, re-read, and decoded as a picture BEFORE anything is written, and the
   original is copied to .conduint-originals first. Dropped on purpose when a JPEG is rewritten: MakerNote (its internal
   offsets break when the block moves), the embedded EXIF thumbnail and the interoperability block. XMP and IPTC are left
   untouched except by "Remove all metadata". */
const XT=[0,1,1,2,4,8,1,1,2,4,8,4,8],XDROP=[0x8769,0x8825,0xA005,0x927C];
const XN={0x10E:'Caption',0x10F:'Make',0x110:'Model',0x112:'Orientation',0x131:'Software',0x132:'Modified',0x13B:'Artist',0x8298:'Copyright',
 0x829A:'Exposure time',0x829D:'F-number',0x8822:'Exposure programme',0x8827:'ISO',0x9003:'Date taken',0x9004:'Date digitised',0x9204:'Exposure bias',
 0x9207:'Metering mode',0x9209:'Flash',0x920A:'Focal length',0xA001:'Colour space',0xA002:'Width',0xA003:'Height',0xA403:'White balance',
 0xA405:'Focal length (35 mm)',0xA434:'Lens model'};
const XO=['','Normal','Mirrored','Rotated 180°','Mirrored vertically','Mirrored, rotated 90° right','Rotated 90° right','Mirrored, rotated 90° left','Rotated 90° left'];
const XF={on:false,it:null,u8:null,rd:null,edit:false,all:false,busy:false,quiet:false};
const xa=(b,i,n)=>{let s='';for(let k=0;k<n&&i+k<b.length;k++)s+=String.fromCharCode(b[i+k]);return s};

/* ---------- [1] READ: containers and the TIFF directory ---------- */
function xfSplit(u8){
 if(u8[0]!==0xFF||u8[1]!==0xD8)throw new Error('This is not a JPEG file.');
 const segs=[];let p=2;
 while(p+4<=u8.length){
  if(u8[p]!==0xFF){p++;continue}
  let m=u8[p+1];while(m===0xFF&&p+2<u8.length){p++;m=u8[p+1]}
  if(m===0xDA)return{segs,scan:p};
  if(m===0x01||m===0xD8||(m>=0xD0&&m<=0xD7)){p+=2;continue}
  if(m===0xD9)break;
  const len=(u8[p+2]<<8)|u8[p+3];if(len<2||p+2+len>u8.length)throw new Error('This JPEG is damaged, so nothing was changed.');
  segs.push({m,s:p,e:p+2+len});p+=2+len}
 throw new Error('This JPEG has no picture data, so nothing was changed.')}
const xfIsExif=(u8,s)=>s.m===0xE1&&xa(u8,s.s+4,6)==='Exif\0\0';
function xfParse(u8,o){
 const a=u8[o],b=u8[o+1];if(!((a===0x49&&b===0x49)||(a===0x4D&&b===0x4D)))throw new Error('No EXIF data.');
 const le=a===0x49,dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),g16=p=>dv.getUint16(p,le),g32=p=>dv.getUint32(p,le);
 if(o+8>u8.length||g16(o+2)!==42)throw new Error('The EXIF header is damaged.');
 const M={le,ifd0:[],exif:[],gps:[]},seen=new Set();
 const rd=(off,key)=>{let p=o+off;if(off<8||p+2>u8.length||seen.has(off))return;seen.add(off);
  const n=g16(p);p+=2;if(p+n*12>u8.length)throw new Error('The EXIF directory is damaged.');
  for(let k=0;k<n;k++,p+=12){const tag=g16(p),type=g16(p+2),cnt=g32(p+4);if(!XT[type])continue;const sz=XT[type]*cnt;if(!isFinite(sz)||sz>2e6)continue;
   const q=sz>4?o+g32(p+8):p+8;if(q<0||q+sz>u8.length)continue;M[key].push({tag,type,count:cnt,raw:u8.slice(q,q+sz)})}};
 rd(g32(o+4),'ifd0');
 const ptr=t=>{const e=M.ifd0.find(x=>x.tag===t);return e&&e.raw.length>=4?new DataView(e.raw.buffer).getUint32(0,le):0};
 rd(ptr(0x8769),'exif');rd(ptr(0x8825),'gps');return M}
function xfRead(u8){
 if(u8[0]===0xFF&&u8[1]===0xD8){const{segs}=xfSplit(u8);for(const s of segs)if(xfIsExif(u8,s))return{fmt:'JPEG',M:xfParse(u8,s.s+10)};return{fmt:'JPEG',M:null}}
 const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
 if(xa(u8,1,3)==='PNG'){let p=8;while(p+8<=u8.length){const n=dv.getUint32(p),t=xa(u8,p+4,4);if(t==='eXIf')return{fmt:'PNG',M:xfParse(u8,p+8)};if(t==='IEND')break;p+=12+n}return{fmt:'PNG',M:null}}
 if(xa(u8,0,4)==='RIFF'&&xa(u8,8,4)==='WEBP'){let p=12;while(p+8<=u8.length){const t=xa(u8,p,4),n=dv.getUint32(p+4,true);
  if(t==='EXIF'){const o=xa(u8,p+8,6)==='Exif\0\0'?p+14:p+8;return{fmt:'WebP',M:xfParse(u8,o)}}p+=8+n+(n&1)}return{fmt:'WebP',M:null}}
 return{fmt:null,M:null}}
function xfNums(e,le){const dv=new DataView(e.raw.buffer,e.raw.byteOffset,e.raw.byteLength),t=e.type,o=[];
 for(let i=0;i<e.count;i++){
  if(t===1||t===7)o.push(dv.getUint8(i));else if(t===6)o.push(dv.getInt8(i));
  else if(t===3)o.push(dv.getUint16(i*2,le));else if(t===8)o.push(dv.getInt16(i*2,le));
  else if(t===4)o.push(dv.getUint32(i*4,le));else if(t===9)o.push(dv.getInt32(i*4,le));
  else if(t===5){const d=dv.getUint32(i*8+4,le);o.push(d?dv.getUint32(i*8,le)/d:0)}
  else if(t===10){const d=dv.getInt32(i*8+4,le);o.push(d?dv.getInt32(i*8,le)/d:0)}
  else if(t===11)o.push(dv.getFloat32(i*4,le));else if(t===12)o.push(dv.getFloat64(i*8,le))}
 return o}
function xfStr(e){let r=e.raw;const z=r.indexOf(0);if(z>=0)r=r.subarray(0,z);try{return new TextDecoder('utf-8').decode(r).trim()}catch{return''}}
const xfGet=(M,k,t)=>M&&M[k].find(e=>e.tag===t);
function xfText(M,k,t){const e=xfGet(M,k,t);return e&&e.type===2?xfStr(e):''}
function xfNum(M,k,t){const e=xfGet(M,k,t);if(!e||e.type===2||e.type===7&&e.count>1)return null;const v=xfNums(e,M.le)[0];return v==null||!isFinite(v)?null:v}

/* ---------- [2] WRITE: rebuild the TIFF block and the JPEG ---------- */
const xfAscii=(tag,s)=>{const b=new TextEncoder().encode(s),r=new Uint8Array(b.length+1);r.set(b);return{tag,type:2,count:r.length,raw:r}};
const xfShort=(tag,v,le)=>{const r=new Uint8Array(2);new DataView(r.buffer).setUint16(0,v,le);return{tag,type:3,count:1,raw:r}};
function xfBuild(M){
 const le=M.le,strip=a=>a.filter(e=>!XDROP.includes(e.tag)),I=strip(M.ifd0),E=strip(M.exif),G=M.gps.slice(),ptr=t=>({tag:t,type:4,count:1,raw:new Uint8Array(4)});
 const pe=E.length?ptr(0x8769):null,pg=G.length?ptr(0x8825):null;if(pe)I.push(pe);if(pg)I.push(pg);
 [I,E,G].forEach(a=>a.sort((x,y)=>x.tag-y.tag));
 const sz=a=>2+a.length*12+4;let pos=8;const o0=pos;pos+=sz(I);const oE=E.length?pos:0;if(E.length)pos+=sz(E);const oG=G.length?pos:0;if(G.length)pos+=sz(G);
 if(pe)new DataView(pe.raw.buffer).setUint32(0,oE,le);if(pg)new DataView(pg.raw.buffer).setUint32(0,oG,le);
 let total=pos;[I,E,G].forEach(a=>a.forEach(e=>{if(e.raw.length>4)total+=e.raw.length+(e.raw.length&1)}));
 const out=new Uint8Array(total),dv=new DataView(out.buffer);out[0]=out[1]=le?0x49:0x4D;dv.setUint16(2,42,le);dv.setUint32(4,8,le);let dp=pos;
 const wr=(a,at)=>{dv.setUint16(at,a.length,le);let p=at+2;
  for(const e of a){dv.setUint16(p,e.tag,le);dv.setUint16(p+2,e.type,le);dv.setUint32(p+4,e.count,le);
   if(e.raw.length>4){dv.setUint32(p+8,dp,le);out.set(e.raw,dp);dp+=e.raw.length+(e.raw.length&1)}else out.set(e.raw,p+8);p+=12}
  dv.setUint32(p,0,le)};
 wr(I,o0);if(E.length)wr(E,oE);if(G.length)wr(G,oG);return out}
/* o: {caption, artist, copyright, taken:'YYYY:MM:DD HH:MM:SS', noGps}. An empty string removes that field. */
function xfApply(M,o){
 const set=(k,t,v)=>{M[k]=M[k].filter(e=>e.tag!==t);if(v)M[k].push(xfAscii(t,v))};
 if('caption' in o)set('ifd0',0x10E,o.caption);if('artist' in o)set('ifd0',0x13B,o.artist);if('copyright' in o)set('ifd0',0x8298,o.copyright);
 if('taken' in o){if(o.taken&&!/^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(o.taken))throw new Error('Date taken is not valid.');set('exif',0x9003,o.taken)}
 if(o.noGps)M.gps=[]}
/* M=model to write (or null for none); all=true also removes XMP, IPTC and comments */
function xfPack(u8,M,all){
 const{segs,scan}=xfSplit(u8),tiff=M&&(M.ifd0.length||M.exif.length||M.gps.length)?xfBuild(M):null;
 if(tiff&&tiff.length+8>65535)throw new Error('There is too much metadata for one EXIF block.');
 const keep=segs.filter(s=>{if(xfIsExif(u8,s))return false;
  if(all&&s.m===0xE1&&xa(u8,s.s+4,21)==='http://ns.adobe.com/x')return false;
  if(all&&(s.m===0xED||s.m===0xFE))return false;return true});
 const parts=[u8.subarray(0,2)];let put=!tiff;
 const ins=()=>{if(put)return;put=true;const h8=new Uint8Array(10),n=tiff.length+8;h8[0]=0xFF;h8[1]=0xE1;h8[2]=n>>8;h8[3]=n&255;h8.set([0x45,0x78,0x69,0x66,0,0],4);parts.push(h8,tiff)};
 keep.forEach(s=>{if(s.m!==0xE0)ins();parts.push(u8.subarray(s.s,s.e))});ins();parts.push(u8.subarray(scan));
 const n=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;parts.forEach(x=>{out.set(x,p);p+=x.length});return out}
const xfKeepOrient=M=>{const e=M&&xfGet(M,'ifd0',0x112);return e?{le:M.le,ifd0:[e],exif:[],gps:[]}:null};

/* ---------- [3] SAFE SAVE ---------- */
const xfB64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
async function xfBytes(it){
 if(it.uri&&typeof SAF!=='undefined'&&SAF){const r=await SAF.cacheCopy({uri:it.uri,name:it.name}),p=r.path,src=CAP.convertFileSrc?CAP.convertFileSrc(p):location.origin+'/_capacitor_file_'+p;
  const res=await fetch(src);if(!res.ok)throw new Error('This picture could not be read.');return new Uint8Array(await res.arrayBuffer())}
 const f=it.file||(it.fh&&await it.fh.getFile());if(!f)throw new Error('This picture could not be read.');return new Uint8Array(await f.arrayBuffer())}
/* returns the backup's file name (truthy) or false. The root comes from the mount, or from the /storage volume for direct file paths.
   S.dash.gorig remembers where each original came from, so the Gallery's Originals tab can put it back. */
async function xfBackup(it,u8){
 const root=typeof glRootOf==='function'?glRootOf(it):(it.m&&typeof mount==='function'&&mount(it.m)?mount(it.m).root:'');
 if(!(it.uri&&SAF&&root))return false;
 const d=await SAF.ensureDir({parent:root,name:'.conduint-originals'}),bn=Date.now().toString(36)+'~'+it.name;
 await SAF.writeFile({dir:d.uri,name:bn,b64:xfB64(u8),mime:'image/jpeg'});
 try{S.dash=S.dash||{};(S.dash.gorig=S.dash.gorig||{})[bn]={from:it.uri,name:it.name,m:it.m,parent:typeof gpar==='function'?gpar(it):(it.parent||''),pname:it.pname||''};save()}catch{}
 return bn}
async function xfCommit(it,old,nu,what){
 if(nu.length>25*1048576)throw new Error('This picture is too large to rewrite safely (25 MB limit).');
 const chk=xfRead(nu);if(!chk.fmt)throw new Error('The rebuilt file failed its check. Nothing was written.');
 try{const bm=await createImageBitmap(new Blob([nu],{type:'image/jpeg'}));if(bm.close)bm.close()}catch{throw new Error('The rebuilt picture did not decode. Nothing was written.')}
 let kept=false;try{kept=await xfBackup(it,old)}catch{kept=false}
 if(!kept){unbusy();const r=await dlg({title:'No backup possible',msg:'A copy of the original could not be kept. Save anyway?',ok:'Save anyway',danger:true});busy('Writing…');if(!r)return false}
 if(it.uri&&SAF&&SAF.writeUri)await SAF.writeUri({uri:it.uri,b64:xfB64(nu)});
 else if(it.fh&&it.fh.createWritable){const w=await it.fh.createWritable();await w.write(nu);await w.close()}
 else throw new Error('This location is read-only.');
 it.size=nu.length;it.mtime=Date.now();if(!XF.quiet)toast(what+(kept?' Original kept in .conduint-originals.':''));
 if(typeof IV!=='undefined'&&IV.on&&IV.list[IV.i]===it)ivLoad();if(typeof glHomeRefresh==='function')glHomeRefresh();return true}

/* ---------- [4] FORMAT ---------- */
const xfCoord=(M,r,v)=>{const e=xfGet(M,'gps',v),f=xfText(M,'gps',r);if(!e||e.count<3)return null;const n=xfNums(e,M.le);if(n.some(x=>!isFinite(x)))return null;
 let d=n[0]+n[1]/60+n[2]/3600;if(f==='S'||f==='W')d=-d;return d};
function xfFacts(M,it){
 const G=[],add=(t,rows)=>{rows=rows.filter(r=>r[1]!==''&&r[1]!=null);if(rows.length)G.push({t,rows})};
 const mk=xfText(M,'ifd0',0x10F),md=xfText(M,'ifd0',0x110),et=xfNum(M,'exif',0x829A),fn=xfNum(M,'exif',0x829D),iso=xfNum(M,'exif',0x8827),fl=xfNum(M,'exif',0x920A),fl35=xfNum(M,'exif',0xA405);
 const fx=xfNum(M,'exif',0x9209),eb=xfNum(M,'exif',0x9204),pw=xfNum(M,'exif',0xA002),ph=xfNum(M,'exif',0xA003),or=xfNum(M,'ifd0',0x112),cs=xfNum(M,'exif',0xA001);
 add('Camera',[['Device',md&&mk&&!md.toLowerCase().startsWith(mk.toLowerCase())?mk+' '+md:md||mk],['Lens',xfText(M,'exif',0xA434)],['Software',xfText(M,'ifd0',0x131)]]);
 add('Exposure',[['Shutter',et?(et>=1?+et.toFixed(1)+' s':'1/'+Math.round(1/et)+' s'):''],['Aperture',fn?'ƒ/'+(+fn.toFixed(1)):''],['ISO',iso!=null?String(iso):''],
  ['Focal length',fl?+fl.toFixed(1)+' mm'+(fl35?' ('+Math.round(fl35)+' mm equiv.)':''):''],['Exposure bias',eb!=null?(eb>0?'+':'')+(+eb.toFixed(2))+' EV':''],['Flash',fx!=null?(fx&1?'Fired':'Did not fire'):'']]);
 const tk=xfText(M,'exif',0x9003);add('Date',[['Taken',tk.replace(/^(\d{4}):(\d\d):(\d\d)/,'$1-$2-$3')],['Modified',xfText(M,'ifd0',0x132).replace(/^(\d{4}):(\d\d):(\d\d)/,'$1-$2-$3')]]);
 add('Image',[['Size',pw&&ph?pw+' × '+ph:''],['Orientation',or?XO[or]||String(or):''],['Colour space',cs===1?'sRGB':cs===65535?'Uncalibrated':'']]);
 const la=xfCoord(M,0x1,0x2),lo=xfCoord(M,0x3,0x4),al=xfNum(M,'gps',0x6);
 add('Location',[['Latitude',la!=null?la.toFixed(6):''],['Longitude',lo!=null?lo.toFixed(6):''],['Altitude',al!=null?Math.round(al)+' m':'']]);
 add('Description',[['Caption',xfText(M,'ifd0',0x10E)],['Artist',xfText(M,'ifd0',0x13B)],['Copyright',xfText(M,'ifd0',0x8298)]]);
 return{G,la,lo,hero:[et?(et>=1?+et.toFixed(1)+'s':'1/'+Math.round(1/et)):'',fn?'ƒ/'+(+fn.toFixed(1)):'',iso!=null?'ISO '+iso:'',fl?+fl.toFixed(1)+' mm':''].filter(Boolean),dev:md&&mk&&!md.toLowerCase().startsWith(mk.toLowerCase())?mk+' '+md:md||mk}}
const xfAllRows=M=>[['ifd0','Image'],['exif','Exif'],['gps','GPS']].flatMap(([k,g])=>M[k].map(e=>{
 let v;if(e.type===2)v=xfStr(e);else if(e.type===7&&e.count>16)v=e.count+' bytes';else v=xfNums(e,M.le).slice(0,8).map(x=>Number.isInteger(x)?x:+x.toFixed(4)).join(', ');
 return[(XN[e.tag]||'0x'+e.tag.toString(16).toUpperCase().padStart(4,'0')),g+' · '+v]}));

/* ---------- [5] THE INFORMATION SHEET ---------- */
function xfShell(){let s=$('#xf');if(s)return s;s=h('section','xf');s.id='xf';s.setAttribute('aria-label','Photo information');
 const x=h('button','ib',null,ico('x'));x.setAttribute('aria-label','Close information');x.onclick=xfClose;
 s.append(h('div','xfbox',null,h('div','xfgrab'),h('div','xfhd',null,h('div','xfti',null,h('b',null,'Information'),h('small',null,'')),x),h('div','xfb'),h('div','xff')));
 s.addEventListener('pointerdown',e=>{if(e.target===s)xfClose()});document.body.append(s);return s}
async function xfOpen(it){
 if(!it)return;XF.it=it;XF.edit=false;XF.all=false;XF.u8=null;XF.rd=null;const s=xfShell();s.classList.add('on');XF.on=true;
 s.querySelector('.xfti small').textContent=it.name;xfPaint('Reading…');
 try{XF.u8=await xfBytes(it);XF.rd=xfRead(XF.u8)}catch(e){XF.rd={fmt:null,M:null,err:e.message||'This picture could not be read.'}}
 if(XF.it===it)xfPaint()}
function xfClose(){XF.on=false;XF.u8=null;XF.rd=null;const s=$('#xf');if(s)s.classList.remove('on')}
function xfBack(){if(XF.edit){XF.edit=false;xfPaint();return}xfClose()}
function xfBtn(t,cls,f){const b=h('button','chip '+(cls||''),t);b.onclick=f;return b}
function xfPaint(msg){const B=$('#xf .xfb'),F=$('#xf .xff');B.replaceChildren();F.replaceChildren();const it=XF.it,R=XF.rd;
 if(msg||!R){B.append(h('div','xfnone',msg||''));return}
 if(R.err){B.append(h('div','xfnone',R.err));return}
 const jpeg=R.fmt==='JPEG';
 if(XF.edit)return xfEditView(B,F);
 const file=[['Name',it.name],['Format',R.fmt||(it.name.split('.').pop()||'').toUpperCase()],['Size',it.size?fmt(it.size):''],['Modified',it.mtime?new Date(it.mtime).toLocaleString():'']];
 const iw=typeof ivi!=='undefined'&&ivi.naturalWidth?ivi.naturalWidth+' × '+ivi.naturalHeight:'';if(iw)file.splice(2,0,['Dimensions',iw]);
 if(!R.M){B.append(xfCard('File',file),h('div','xfnone',R.fmt?'This picture has no EXIF data.':'EXIF can be read from JPEG, PNG and WebP pictures.'))}
 else{const f=xfFacts(R.M,it);
  if(f.dev||f.hero.length){const hr=h('div','xfhero');if(f.dev)hr.append(h('b',null,f.dev));if(f.hero.length){const c=h('div','xfchips');f.hero.forEach(x=>c.append(h('span',null,x)));hr.append(c)}B.append(hr)}
  f.G.forEach(g=>B.append(xfCard(g.t,g.rows)));B.append(xfCard('File',file));
  const al=xfAllRows(R.M),tg=h('button','xftg',XF.all?'Hide all fields':'All fields ('+al.length+')');tg.onclick=()=>{XF.all=!XF.all;xfPaint()};B.append(tg);
  if(XF.all)B.append(xfCard('All fields',al));
  if(f.la!=null&&f.lo!=null)F.append(xfBtn('Copy coordinates','',async()=>{const t=f.la.toFixed(6)+', '+f.lo.toFixed(6);try{await navigator.clipboard.writeText(t);toast('Coordinates copied.')}catch{toast(t)}}))}
 if(jpeg)F.append(xfBtn('Edit','on',()=>{XF.edit=true;xfPaint()}));else if(R.fmt)F.append(h('small','xfnote','Editing is available for JPEG pictures.'))}
function xfCard(t,rows){const c=h('div','xfg',null,h('h5',null,t));rows.forEach(([k,v])=>c.append(h('div','xfr',null,h('span',null,k),h('b',null,v))));return c}
function xfEditView(B,F){const M=XF.rd.M||{le:false,ifd0:[],exif:[],gps:[]},fld=(lb,id,val,type)=>{const i=document.createElement('input');i.id=id;i.type=type||'text';i.value=val||'';i.autocomplete='off';i.spellcheck=false;if(type==='datetime-local')i.step=1;
  return h('label','xfld',null,h('span',null,lb),i)};
 const tk=xfText(M,'exif',0x9003).replace(/^(\d{4}):(\d\d):(\d\d) (.*)$/,'$1-$2-$3T$4');
 const f=h('div','xfg',null,h('h5',null,'Edit details'),fld('Caption','xfc',xfText(M,'ifd0',0x10E)),fld('Artist','xfa',xfText(M,'ifd0',0x13B)),fld('Copyright','xfy',xfText(M,'ifd0',0x8298)),fld('Date taken','xfd',tk,'datetime-local'));
 B.append(f);const has=M.gps.length>0;
 const dz=h('div','xfg xfdz',null,h('h5',null,'Privacy'));
 const rl=xfBtn('Remove location','danger',()=>xfRun({noGps:true},'Location removed.','Remove location?','The GPS position is removed from this picture. Everything else stays.'));rl.disabled=!has;dz.append(rl);
 dz.append(xfBtn('Remove all metadata','danger',()=>xfRun(null,'All metadata removed.','Remove all metadata?','EXIF, XMP, IPTC and comments are removed. Orientation is kept so the picture stays upright.')));B.append(dz);
 F.append(xfBtn('Cancel','',()=>{XF.edit=false;xfPaint()}),xfBtn('Save','on',()=>{
  const d=$('#xfd').value;let tkn='';if(d){const m=d.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/);if(!m)return toast('Date taken is not valid.');tkn=m[1]+':'+m[2]+':'+m[3]+' '+m[4]+':'+m[5]+':'+(m[6]||'00')}
  xfRun({caption:$('#xfc').value.trim(),artist:$('#xfa').value.trim(),copyright:$('#xfy').value.trim(),taken:tkn},'Details saved.','Save changes?','The details are written into the picture file.')}))}
/* o=null means "remove all metadata" */
async function xfRun(o,done,title,msg){
 if(XF.busy||!XF.it||!XF.u8)return;
 const r=await dlg({title,msg:msg+'\nA copy of the original is kept first.',ok:'Continue',danger:!o||!!o.noGps});if(!r)return;
 XF.busy=true;busy('Writing…');
 try{const it=XF.it,old=XF.u8;let nu;
  if(o)nu=xfPack(old,(()=>{const M=XF.rd.M||{le:false,ifd0:[],exif:[],gps:[]},c={le:M.le,ifd0:M.ifd0.slice(),exif:M.exif.slice(),gps:M.gps.slice()};xfApply(c,o);return c})(),false);
  else nu=xfPack(old,xfKeepOrient(XF.rd.M),true);
  if(await xfCommit(it,old,nu,done)){XF.u8=nu;XF.rd=xfRead(nu);XF.edit=false;xfPaint()}}
 catch(e){toast(e.message||'That did not work. Nothing was changed.')}
 finally{XF.busy=false;unbusy()}}

/* ---------- [6] REMOVE LOCATION FROM MANY (Gallery selection bar > More). JPEG only. Every file gets the same safe write as the single-picture tool: rebuilt, re-read, decoded, original copied first. ---------- */
async function xfStripMany(list){
 if(XF.busy)return;
 const all=(list||[]).filter(Boolean),jp=all.filter(i=>/\.jpe?g$/i.test(i.name||''));
 if(!jp.length)return toast('Location can only be removed from JPEG pictures.');
 const skip=all.length-jp.length;
 const r=await dlg({title:'Remove location from '+plural(jp.length,'picture')+'?',msg:'The GPS position is removed from each picture. Everything else stays.'+(skip?'\n'+plural(skip,'picture')+' that are not JPEG will be skipped.':'')+'\nA copy of each original is kept first.',ok:'Remove location',danger:true});
 if(!r)return;
 XF.busy=true;XF.quiet=true;let ok=0,none=0,bad=0;
 try{
  for(let n=0;n<jp.length;n++){
   busy('Removing location '+(n+1)+' of '+jp.length+'…');
   const it=jp[n];
   try{
    const old=await xfBytes(it),R=xfRead(old);
    if(R.fmt!=='JPEG'||!R.M||!R.M.gps.length){none++;continue}
    const c={le:R.M.le,ifd0:R.M.ifd0.slice(),exif:R.M.exif.slice(),gps:R.M.gps.slice()};xfApply(c,{noGps:true});
    if(await xfCommit(it,old,xfPack(old,c,false),''))ok++;else none++}
   catch{bad++}}}
 finally{XF.busy=false;XF.quiet=false;unbusy()}
 toast(plural(ok,'picture')+' cleaned'+(none?', '+none+' had no location':'')+(bad?', '+bad+' could not be changed':'')+'.')}
