/* apps.js (V0.19.0): the Apps panel item. A scrollable grid of the apps you installed (not bare system apps), small or bigger icons, search, tap to open.
   Needs the native Tools plugin (userApps, appIcon, launchApp). In the browser preview it shows a note, or window.MOCK_APPS for testing. */
const AP={open:false,apps:null,q:'',io:null};
function apOpen(){
 let A=$('#ap');
 if(!A){A=h('section');A.id='ap';A.setAttribute('aria-label','Apps');
  const bk=h('button','ib',null,ico('back'));bk.setAttribute('aria-label','Back');bk.onclick=apClose;
  const sz=h('button','ib',null,ico('grid'));sz.id='apsz';sz.setAttribute('aria-label','Icon size');sz.onclick=()=>{S.dash.apsz=S.dash.apsz==='big'?'small':'big';dsave();apDraw()};
  const ti=h('div','glti',null,h('b',null,'Apps'),h('small',null,''));ti.id='apti';
  const q=document.createElement('input');q.type='search';q.className='glq';q.id='apq';q.placeholder='Search your apps…';q.autocomplete='off';q.spellcheck=false;q.oninput=()=>{AP.q=q.value;apDraw()};
  const body=h('div','apbody');body.id='apbody';
  A.append(h('div','glhd',null,bk,ti,sz),q,body);document.body.append(A)}
 document.body.classList.remove('nav');AP.open=true;A.classList.add('on');
 if(AP.apps)return apDraw();
 $('#apbody').replaceChildren(h('div','dnone','Loading your apps…'));
 const src=(typeof TOOLS!=='undefined'&&TOOLS&&TOOLS.userApps)?TOOLS.userApps():Promise.resolve({apps:window.MOCK_APPS||null});
 src.then(r=>{AP.apps=r.apps||[];if(!r.apps)AP.apps=null;apDraw()}).catch(e=>{$('#apbody').replaceChildren(h('div','dnone','Could not read your apps: '+(e.message||e)))})}
function apClose(){const A=$('#ap');if(A)A.classList.remove('on');AP.open=false}
function apDraw(){
 const B=$('#apbody');if(!B)return;B.replaceChildren();if(AP.io)AP.io.disconnect();
 if(!AP.apps){B.append(h('div','dnone','Your installed apps show here in the Android app.'));return}
 const big=S.dash.apsz==='big',q=AP.q.toLowerCase(),L=AP.apps.filter(a=>a.name.toLowerCase().includes(q));
 B.className='apbody '+(big?'big':'small');$('#apti small').textContent=plural(AP.apps.length,'app');
 AP.io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;AP.io.unobserve(e.target);apIcon(e.target)}),{root:B,rootMargin:'300px'});
 L.forEach(a=>{const im=h('img');im.alt='';im.draggable=false;const t=h('button','apt',null,h('span','api',null,im),h('span','apn',a.name));t._a=a;
  t.onclick=()=>{if(typeof TOOLS!=='undefined'&&TOOLS&&TOOLS.launchApp)TOOLS.launchApp({pkg:a.pkg}).catch(e=>toast(e.message))};B.append(t);AP.io.observe(t)});
 if(!L.length)B.append(h('div','dnone','No apps match.'))}
const APC={};
async function apIcon(t){const a=t._a,im=t.querySelector('img');
 if(APC[a.pkg]){im.src=APC[a.pkg];return}
 if(a.icon){im.src=APC[a.pkg]=a.icon;return}
 try{const r=await TOOLS.appIcon({pkg:a.pkg});im.src=APC[a.pkg]='data:image/png;base64,'+r.png}catch{im.replaceWith(h('i',null,a.name.slice(0,1).toUpperCase()))}}
