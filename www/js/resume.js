/* resume.js (V0.50.0): leaving Conduint and coming back puts you exactly where you were. It never reloads over you.
   - Alive in the background: nothing happens on return (the old "back to Home after 5 minutes" is gone).
   - Android closed it in the background: the last folder (or library) and the open document come back, the document at the page you were on.
   What is saved is only where you were (folder, scroll, which document): no file contents. Loaded last. */
const RS={key:'conduint.resume',busy:false};
function rsSnap(){
 try{
  if(typeof RD!=='undefined'&&RD.on&&typeof rdSave==='function')rdSave();/* page position of an open document */
  const r={t:Date.now(),m:cur.m,cat:cur.cat,path:cur.path||[],dirs:cur.dirs||[],sc:($('#list')||{}).scrollTop||0};
  if(typeof RD!=='undefined'&&RD.on&&RD.src&&RD.src.uri&&!RD.src.vault&&!RD.src.fromZip)r.rd={uri:RD.src.uri,name:RD.src.name,mime:RD.src.mime||'',size:RD.src.size||0};
  localStorage.setItem(RS.key,JSON.stringify(r))}catch{}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)rsSnap()});
addEventListener('pagehide',rsSnap);
setInterval(()=>{if(!document.hidden)rsSnap()},15000);/* in case Android ends the app without telling the page */
async function rsRestore(){
 if(RS.busy||!NATIVE)return;RS.busy=true;
 let r=null;try{r=JSON.parse(localStorage.getItem(RS.key)||'null')}catch{}
 if(!r||Date.now()-r.t>7*864e5)return;
 /* something already opened (a file another app sent to Conduint): leave it alone */
 if(document.body.classList.contains('rdon')||(typeof ZB!=='undefined'&&ZB.on)||(typeof RD!=='undefined'&&RD.on))return;
 try{
  if(r.cat&&typeof goCat==='function'&&r.cat!=='bin')await goCat(r.cat);
  else if(r.m&&mount(r.m))await go(r.m,r.path||[],r.dirs&&r.dirs.length?r.dirs:undefined);
  const L=$('#list');if(L&&r.sc)requestAnimationFrame(()=>{L.scrollTop=r.sc});
  if(r.rd&&typeof readerOpen==='function'&&rdType(r.rd.name,r.rd.mime))readerOpen(r.rd)}
 catch{}}
(LK.start||Promise.resolve()).then(()=>setTimeout(rsRestore,1100));
