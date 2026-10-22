/* details.js (V0.29.1): what happens when you touch a zip, and the Details sheet.
   zipAsk(i)   a tap on a .zip asks: browse inside, extract here, or extract to a folder.
   infoOpen(i) Details for any file or folder: date and time, size, item counts, where it is, status and permissions.
               Folders add the item count and the size of everything inside. A .zip also gets its own scan:
               entries, sizes, dates, compression, whether it is encrypted (and which kind: AES-128/192/256 or old ZipCrypto),
               ZIP64, comment, risky paths (../), the system that made it, and the SHA-256 of the file.
   Safety rule: nothing here changes a file. The zip scan only reads the central directory. A scan that fails shows one plain line and the rest stays. */
const INF={tok:0,MAX:256*1048576};
const infMs=t=>t&&t<1e11?t*1000:t;
const infWhen=t=>{t=infMs(t);if(!t)return'';const d=new Date(t),s=Math.max(0,Math.floor((Date.now()-t)/1000));
 const ago=s<60?'just now':s<3600?Math.floor(s/60)+' min ago':s<86400?Math.floor(s/3600)+' h ago':s<86400*60?Math.floor(s/86400)+' days ago':Math.floor(s/86400/30.44)+' months ago';
 return d.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})+', '+d.toLocaleTimeString()+' ('+ago+')'};
const infBytes=n=>fmt(n)+(n>=1024?' ('+n.toLocaleString()+' bytes)':'');
const infPlural=(n,w)=>n+' '+w+(n===1?'':'s');
const infIsZip=i=>!i.dir&&/\.zip$/i.test(i.name||'');

/* ---- the tap on a zip ---- */
function zipAsk(i){
 const here=typeof writable==='function'&&writable()&&!(typeof FLAT!=='undefined'&&FLAT)&&i.uri&&SAF&&!i.incoming,to=i.uri&&SAF&&!i.incoming;
 const L=[['Browse inside (walk through it)',()=>zipBrowse(i)]];
 if(here)L.push(['Extract here',()=>opUnzip(i)]);
 if(to)L.push(['Extract to folder…',()=>opUnzipTo(i)]);
 L.push(['hr'],['Details',()=>infoOpen(i)]);
 menu(Math.max(8,innerWidth/2-110),Math.max(8,innerHeight/3),L);
 const M=$('#menu'),t=h('div',null,i.name+(i.size?'  ·  '+fmt(i.size):''));
 t.style.cssText='padding:8px 12px 6px;font-size:12px;color:var(--mu);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
 M.prepend(t)}

/* ---- the zip scan: reads the central directory only ---- */
function infZip(d){
 const u16=(o)=>d[o]|(d[o+1]<<8),u32=(o)=>(d[o]|(d[o+1]<<8)|(d[o+2]<<16)|(d[o+3]<<24))>>>0;
 let eocd=-1;for(let k=d.length-22;k>=Math.max(0,d.length-65558);k--)if(d[k]===0x50&&d[k+1]===0x4b&&d[k+2]===5&&d[k+3]===6){eocd=k;break}
 if(eocd<0)throw Error('No ZIP directory found. The file may be damaged, cut short, or not a ZIP.');
 let off=u32(eocd+16),cnt=u16(eocd+10),zip64=false;
 const cl=u16(eocd+20),comment=cl?new TextDecoder().decode(d.subarray(eocd+22,eocd+22+cl)):'';
 const dv=new DataView(d.buffer,d.byteOffset,d.byteLength),l64=eocd-20;
 if(l64>=0&&u32(l64)===0x07064b50){const e64=Number(dv.getBigUint64(l64+8,true));
  if(e64>=0&&e64+56<=d.length&&u32(e64)===0x06064b50){zip64=true;cnt=Number(dv.getBigUint64(e64+32,true));off=Number(dv.getBigUint64(e64+48,true))}}
 const dos=(dd,tt)=>dd?new Date(((dd>>9)&127)+1980,((dd>>5)&15)-1,dd&31,(tt>>11)&31,(tt>>5)&63,(tt&31)*2).getTime():0;
 const r={entries:0,files:0,folders:0,raw:0,comp:0,methods:{},enc:{aes128:0,aes192:0,aes256:0,zipcrypto:0,strong:0},encFiles:0,
  oldest:0,newest:0,biggest:null,exts:{},unsafe:[],comment,zip64,host:-1,top:new Set(),dup:0},seen=new Set();
 let pos=off;
 for(let n=0;n<cnt;n++){
  if(pos+46>d.length||u32(pos)!==0x02014b50)break;
  const made=u16(pos+4),flag=u16(pos+8);let method=u16(pos+10);const tm=u16(pos+12),dt=u16(pos+14);
  let comp=u32(pos+20),raw=u32(pos+24);const fl=u16(pos+28),xl=u16(pos+30),kl=u16(pos+32);
  const name=new TextDecoder().decode(d.subarray(pos+46,pos+46+fl));
  let ep=pos+46+fl;const ee=ep+xl;let aes=0;
  while(ep+4<=ee){const tag=u16(ep),sz=u16(ep+2);ep+=4;
   if(tag===1){let f=ep;if(raw===0xffffffff&&f+8<=ep+sz){raw=Number(dv.getBigUint64(f,true));f+=8}if(comp===0xffffffff&&f+8<=ep+sz){comp=Number(dv.getBigUint64(f,true));f+=8}zip64=true}
   if(tag===0x9901&&sz>=7)aes=d[ep+4];
   ep+=sz}
  if(r.host<0)r.host=made>>8;
  const dir=name.endsWith('/');
  r.entries++;if(dir)r.folders++;else{r.files++;r.raw+=raw;r.comp+=comp;
   const ex=(name.split('.').length>1?name.split('.').pop().toLowerCase():'(none)');r.exts[ex]=(r.exts[ex]||0)+1;
   if(!r.biggest||raw>r.biggest.size)r.biggest={name,size:raw}}
  const mn=method===99?'AES':String(method);r.methods[mn]=(r.methods[mn]||0)+1;
  if(flag&1){r.encFiles++;if(method===99){r.enc[aes===1?'aes128':aes===2?'aes192':'aes256']++}else if(flag&0x40)r.enc.strong++;else r.enc.zipcrypto++}
  const t=dos(dt,tm);if(t){if(!r.oldest||t<r.oldest)r.oldest=t;if(t>r.newest)r.newest=t}
  if(/(^|\/)\.\.(\/|$)/.test(name)||name.startsWith('/')||/^[a-z]:/i.test(name)||name.includes('\\'))r.unsafe.push(name);
  if(seen.has(name))r.dup++;seen.add(name);
  r.top.add(name.replace(/\/$/,'').split('/')[0]);
  pos+=46+fl+xl+kl}
 r.read=r.entries;r.expected=cnt;return r}
const INF_METHOD={0:'Stored',8:'Deflate',9:'Deflate64',12:'BZip2',14:'LZMA',93:'Zstandard',95:'XZ',AES:'AES-encrypted'};
const INF_HOST={0:'DOS or Windows (FAT)',3:'Unix or Android',7:'Macintosh',10:'Windows (NTFS)',19:'macOS'};
function infZipLines(r,sha,item){
 const L=['','ZIP CONTENTS',
  'Entries: '+r.entries+' ('+infPlural(r.files,'file')+', '+infPlural(r.folders,'folder')+')'+(r.read<r.expected?'  ·  the directory says '+r.expected+' but only '+r.read+' could be read':''),
  'Top level: '+infPlural(r.top.size,'item')];
 L.push('Unpacked size: '+infBytes(r.raw),'Packed size: '+infBytes(r.comp)+(r.raw>0?'  ·  saves '+Math.max(0,Math.round((1-r.comp/r.raw)*100))+'%':''));
 if(r.biggest)L.push('Biggest file: '+r.biggest.name+' ('+fmt(r.biggest.size)+')');
 const ex=Object.entries(r.exts).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([e,n])=>(e==='(none)'?'no extension':'.'+e)+' ×'+n).join(', ');if(ex)L.push('Most common: '+ex);
 if(r.oldest)L.push('Files inside date from '+new Date(r.oldest).toLocaleDateString()+' to '+new Date(r.newest).toLocaleDateString());
 L.push('Compression: '+(Object.entries(r.methods).map(([m,n])=>(INF_METHOD[m]||'Method '+m)+' ×'+n).join(', ')||'none'));
 const e=r.enc,parts=[];
 if(e.aes256)parts.push('AES-256 ×'+e.aes256);if(e.aes192)parts.push('AES-192 ×'+e.aes192);if(e.aes128)parts.push('AES-128 ×'+e.aes128);
 if(e.strong)parts.push('PKWARE strong encryption ×'+e.strong);if(e.zipcrypto)parts.push('old ZipCrypto ×'+e.zipcrypto);
 L.push('','ENCRYPTION',r.encFiles?
  'Password protected: '+r.encFiles+' of '+r.files+' files\nType: '+parts.join(', ')+(e.zipcrypto?'\nWarning: ZipCrypto is weak and can be broken. Use AES.':'')+'\nFile names are visible without the password. Only the file contents are locked.':
  'Not encrypted. Anyone can open it.');
 L.push('','TRACKING','Made on: '+(INF_HOST[r.host]||(r.host<0?'unknown':'system '+r.host)),'ZIP64: '+(r.zip64?'yes (large archive)':'no'));
 L.push(r.comment?'Comment: '+r.comment.slice(0,160)+(r.comment.length>160?'…':''):'Comment: none');
 if(r.dup)L.push('Duplicate names: '+r.dup+' (two entries share a name, which some tools handle badly)');
 L.push(r.unsafe.length?'WARNING: '+infPlural(r.unsafe.length,'path')+' climb out of the folder or start from the root (for example "'+r.unsafe[0].slice(0,60)+'"). Do not extract it with a tool that trusts names.':'Paths: all stay inside the folder');
 if(sha)L.push('SHA-256: '+sha);
 return L}

/* ---- the Details sheet ---- */
function infBase(i){
 const k=i.dir?'Folder':({img:'Image',aud:'Audio',vid:'Video',doc:'Document',arc:'Archive',apk:'Installer'}[kindOf(i.name,i.mime)]||'File');
 const ext=!i.dir&&/\./.test(i.name)?i.name.split('.').pop().toLowerCase():'';
 const L=['DETAILS','Name: '+i.name,'Type: '+k+(ext?' (.'+ext+')':'')+(i.mime&&!i.dir?'  ·  '+i.mime:'')];
 if(!i.dir)L.push('Size: '+infBytes(i.size||0));
 const t=infMs(i.mtime||i.at);
 L.push(t?'Modified: '+infWhen(t):'Modified: not reported');
 if(i.bin)L.push('In the recycle bin');
 if(!cur.cat&&cur.m)L.push('Location: '+[title(),...cur.path].join(' / '));else if(typeof title==='function'&&cur.cat)L.push('Shown in: '+title());
 const id=i.uri?decodeURIComponent(String(i.uri)).replace(/^.*\/document\//,'').replace(/^.*\/tree\/[^/]*\//,''):'';
 if(id&&id!==String(i.uri))L.push('Android path: '+id);
 const st=[];
 if(i.name.startsWith('.')||(typeof isHid==='function'&&cur.m&&isHid(i,cur.m,cur.path)))st.push('hidden');
 if(i.dir&&cur.m&&S.pins.some(x=>key(x.m,x.path)===key(cur.m,[...cur.path,i.name])))st.push('pinned');
 if(st.length)L.push('Status: '+st.join(', '));
 if(typeof i.flags==='number'&&i.flags){const f=i.flags,p=[];if(f&2)p.push('write');if(f&8)p.push('create inside');if(f&64)p.push('rename');if(f&4)p.push('delete');if(f&128)p.push('copy');if(f&256)p.push('move');
  L.push('Android allows: '+(p.join(', ')||'read only')+(f&512?'  ·  virtual document (no real file behind it)':''))}
 return L}
async function infFolder(i,tok,show){
 const L=[];
 try{const r=await SAF.list({uri:i.uri}),it=r.items||[],fo=it.filter(x=>x.dir),fi=it.filter(x=>!x.dir),hid=it.filter(x=>x.name.startsWith('.')).length;
  L.push('','IN THIS FOLDER','Items: '+it.length+' ('+infPlural(fi.length,'file')+', '+infPlural(fo.length,'folder')+')'+(hid?'  ·  '+hid+' hidden':''));
  const bk={};fi.forEach(x=>{const k=kindOf(x.name,x.mime);bk[k]=(bk[k]||0)+1});
  const NM={img:'images',aud:'songs',vid:'videos',doc:'documents',arc:'archives',apk:'installers',file:'other'};
  const mix=Object.entries(bk).sort((a,b)=>b[1]-a[1]).map(([k,n])=>n+' '+NM[k]).join(', ');if(mix)L.push('Files: '+mix);
  const dated=it.filter(x=>infMs(x.mtime));
  if(dated.length){const nw=dated.reduce((a,b)=>infMs(b.mtime)>infMs(a.mtime)?b:a),od=dated.reduce((a,b)=>infMs(b.mtime)<infMs(a.mtime)?b:a);
   L.push('Newest inside: '+nw.name+' ('+new Date(infMs(nw.mtime)).toLocaleString()+')','Oldest inside: '+od.name+' ('+new Date(infMs(od.mtime)).toLocaleString()+')')}
  if(fi.length){const bg=fi.reduce((a,b)=>(b.size||0)>(a.size||0)?b:a);L.push('Biggest file here: '+bg.name+' ('+fmt(bg.size||0)+')')}
 }catch(e){L.push('','Could not list this folder: '+((e&&e.message)||'Android refused.'))}
 L.push('','SIZE OF FOLDER');show(L.concat(['Measuring everything inside…']));
 if(SAF.dirSize){try{const t0=Date.now(),r=await SAF.dirSize({uri:i.uri});
  L.push('Total: '+infBytes(r.bytes||0),infPlural(r.files||0,'file')+' in '+infPlural(r.folders||0,'subfolder')+' (all levels)'+(r.skipped?'\n'+infPlural(r.skipped,'folder')+' could not be read, so the real size is larger.':''),'Counted in '+((Date.now()-t0)/1000).toFixed(1)+' s')}
  catch(e){L.push('Size not counted: '+((e&&e.message)||'Android refused.'))}}
 else L.push('Size of everything inside needs the Android app.');
 return L}
async function infoOpen(i){
 const tok=++INF.tok,base=infBase(i);let extra=[];
 const live=()=>tok===INF.tok&&$('#dlg').classList.contains('on');
 const show=more=>{if(live())$('#dm').textContent=base.concat(more).join('\n')};
 dlg({title:i.name,msg:base.join('\n'),ok:'Close',nocancel:true}).then(()=>{INF.tok++});
 if(i.dir&&i.uri&&SAF){const L=await infFolder(i,tok,show);show(L);return}
 if(infIsZip(i)&&(i.uri||i.path||i.file)){
  if((i.size||0)>INF.MAX){show(['','ZIP CONTENTS','Too big to scan here ('+fmt(i.size)+'). Browse it or extract it to see inside.']);return}
  show(['','ZIP CONTENTS','Reading the archive…']);
  try{const bytes=await zbBytes(i);if(!live())return;
   const r=infZip(bytes);let sha='';
   try{const h2=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));sha=[...h2].map(b=>b.toString(16).padStart(2,'0')).join('')}catch{}
   show(infZipLines(r,sha,i))}
  catch(e){show(['','ZIP CONTENTS','Could not read it: '+((e&&e.message)||'unknown error')+'\nIf it asks for a password to even list the files, its directory is encrypted.'])}}}
