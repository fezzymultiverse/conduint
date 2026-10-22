/* thumbs.js: previews instead of the plain icon. PDF first page, EPUB cover, Office / OpenDocument thumbnail, photo, video frame.
   Made by the native Saf.thumb, only for tiles that scroll into view, kept on the phone (IndexedDB) so each file is rendered once.
   Cloud files are downloaded by the provider to make a preview, so they have their own switch and a 30 MB limit. Loaded before ui.js. */
const THUMB={mem:new Map(),bad:new Map(),q:[],busy:0,io:null,puts:0};
/* thumbnail size follows the layout, so grid / details tiles are as sharp as the screen can show (list rows are small, so cheaper) */
function thumbPx(){const s=S.settings;return s.view==='list'?256:s.compact?384:512}
const THUMB_ZIP='epub docx xlsx pptx odt ods odp';
const thumbOn=()=>!!(SAF&&SAF.thumb&&S.settings.thumbs);
const isCloud=u=>!!u&&!u.startsWith('file:')&&!u.includes('com.android.externalstorage');
function thumbKind(i){
 if(i.dir)return'';const e=i.name.split('.').pop().toLowerCase(),k=kindOf(i.name,i.mime);
 if(k==='img')return e==='svg'?'':'img';if(k==='vid')return'vid';if(k==='aud')return'aud';if(e==='pdf')return'pdf';return THUMB_ZIP.split(' ').includes(e)?'zip':''}

/* the saved previews: one small database, cleared when it grows past 2500 */
let TDBP=null;/* one connection, kept open: before, every tile that scrolled into view opened the database again */
const tdbOpen=()=>TDBP||(TDBP=new Promise(res=>{try{const r=indexedDB.open('conduint-thumbs',1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('t')}catch{}};
 r.onerror=r.onblocked=()=>{TDBP=null;res(null)};
 r.onsuccess=()=>{const d=r.result;d.onclose=d.onversionchange=()=>{TDBP=null;try{d.close()}catch{}};res(d)}}catch{TDBP=null;res(null)}}));
const tdb=(mode,fn)=>tdbOpen().then(d=>!d?null:new Promise(res=>{try{const t=d.transaction('t',mode),q=fn(t.objectStore('t'));t.oncomplete=()=>res(q&&q.result!==undefined?q.result:null);t.onerror=t.onabort=()=>res(null)}catch{TDBP=null;res(null)}}));
const tget=k=>tdb('readonly',s=>s.get(k));
async function tput(k,v){tdb('readwrite',s=>s.put(v,k));if(++THUMB.puts%200===0){const n=await tdb('readonly',s=>s.count());if(n>2500)tdb('readwrite',s=>s.clear())}}
function thumbClear(){THUMB.mem.clear();THUMB.q.length=0;return tdb('readwrite',s=>s.clear())}

/* the picture fills its frame edge to edge (object-fit:cover): no white border, no inner card. The icon stays as the placeholder until it arrives */
function thumbApply(n,b){
 if(!b||!n.isConnected)return;const w=n.querySelector('.thw');if(!w||w.querySelector('img'))return;
 const im=new Image();im.alt='';im.draggable=false;im.decoding='async';
 /* the icon is only hidden once the picture has really loaded; if it fails the icon stays and the tile can try again */
 im.onload=()=>{if(im.isConnected)w.classList.add('ok')};
 im.onerror=()=>{im.remove();w.classList.remove('ok');n._busy=false};
 im.src='data:image/jpeg;base64,'+b;w.append(im)}
/* a tile that has scrolled far away gives its picture back, so a big folder never holds hundreds of decoded bitmaps at once
   (that is what made tiles go blurred and then blank on the phone). It is put back from memory the moment the tile returns. */
function thumbRelease(n){const w=n.querySelector&&n.querySelector('.thw');if(!w)return;const im=w.querySelector('img');if(im){im.onload=im.onerror=null;im.removeAttribute('src');im.remove()}w.classList.remove('ok');n._busy=false}
/* a new drawing of the list: forget the old tiles and anything still waiting for them */
function thumbReset(){if(THUMB.io)$('#list').querySelectorAll('.it').forEach(n=>THUMB.io.unobserve(n))}
const thumbMem=(k,b)=>{THUMB.mem.set(k,b);if(THUMB.mem.size>400)THUMB.mem.delete(THUMB.mem.keys().next().value)};
function pump(){
 while(THUMB.busy<3&&THUMB.q.length){const job=THUMB.q.pop();THUMB.busy++;job().catch(()=>{}).finally(()=>{THUMB.busy--;pump()})}}
async function thumbLoad(n){
 const{i,k}=n._th,px=thumbPx(),key=i.uri+'|'+i.size+'|'+i.mtime+'|'+px;
 if(THUMB.mem.has(key)){thumbApply(n,THUMB.mem.get(key));return}
 const saved=await tget(key);if(saved){thumbMem(key,saved);thumbApply(n,saved);return}
 const bt=THUMB.bad.get(key);if(bt&&Date.now()-bt<20000){n._busy=false;return}
 THUMB.q.push(async()=>{
  if(!n.isConnected||!thumbOn()){n._busy=false;return}
  if(!n._vis){n._busy=false;return}/* scrolled away before its turn: it loads again when it comes back */
  let b='';try{const r=await SAF.thumb({uri:i.uri,kind:k,name:i.name,size:px});b=(r&&r.b64)||''}catch{}
  if(b){thumbMem(key,b);tput(key,b);thumbApply(n,b)}
  else{THUMB.bad.set(key,Date.now());n._busy=false}});
 pump()}
/* called for every tile; only tiles that come into view do any work */
function thumbAttach(n,i){
 if(!thumbOn()||!i.uri)return;const k=thumbKind(i);if(!k)return;
 const cloud=isCloud(i.uri);if(cloud&&!S.settings.thumbCloud)return;if(i.size>(cloud?30e6:300e6))return;
 n._th={i,k};
 /* frame the icon in a fixed square now so tiles do not jump when the picture arrives */
 {const old=n.firstChild;if(old){const w=h('div','thw tk-'+k);n.classList.add('thp');n.replaceChild(w,old);w.append(old)}}
 if(!THUMB.io)THUMB.io=new IntersectionObserver(es=>es.forEach(e=>{const t=e.target;t._vis=e.isIntersecting;if(e.isIntersecting){if(!t._busy){t._busy=true;thumbLoad(t)}}else thumbRelease(t)}),{rootMargin:'420px'});
 THUMB.io.observe(n)}
