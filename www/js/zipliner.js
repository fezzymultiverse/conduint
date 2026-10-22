/* zipliner.js: Zipliner, password protected archives (Tools sheet).
   Create: ZIP with AES-256 or AES-128, or 7z with AES-256 (file names hidden). Extract: ZIP and 7z, with password.
   Native work is in ZiplinerPlugin.java (ZL). Works on real paths, so it needs All files access. */
const ZS={mode:'create',sel:[],fmt:'zip256',level:6,pw:'',pw2:'',show:false,name:'',out:'',arc:null,info:null,xname:'',path:'/storage/emulated/0',pick:null};
const ZFMT=[['zip256','ZIP · AES-256','Recommended. Opens in ZArchiver, 7-Zip, WinZip.'],['zip128','ZIP · AES-128','Faster. Opens almost everywhere.'],['7z','7z · AES-256','Also hides file names. Stored, not compressed.']];
const strength=p=>{let s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;return p?Math.max(1,Math.min(4,s-(p.length<8?1:0))):0};
const SLAB=['','Weak','Fair','Good','Strong'];
const genPw=()=>{const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?',a=new Uint32Array(18);crypto.getRandomValues(a);return[...a].map(x=>c[x%c.length]).join('')};
const baseOf=p=>p.replace(/\/+$/,'').split('/').pop();
const dirOf=p=>{const i=p.replace(/\/+$/,'').lastIndexOf('/');return i<=0?'/storage/emulated/0':p.slice(0,i)};
const zlExt=()=>ZS.fmt==='7z'?'.7z':'.zip';

async function tZipliner(){
 if(!ZL)return toast('Zipliner runs inside the Android app.');
 if(!await needFiles())return;
 TV.view='zl';drawZl()}

function drawZl(){
 TV.view='zl';const B=$('#tbody');B.replaceChildren();head('Zipliner',true);
 const seg=h('div','zseg');
 [['create','Create'],['extract','Extract']].forEach(([m,t])=>{const b=h('button',ZS.mode===m?'on':'',t);b.onclick=()=>{ZS.mode=m;drawZl()};seg.append(b)});
 B.append(h('div','zhero',null,ico('lock'),h('div',null,null,h('b',null,'Zipliner'),h('small',null,'Lock files inside an encrypted archive'))),seg);
 ZS.mode==='create'?zlCreate(B):zlExtract(B)}

function zlPwBox(B,confirm){
 const wrap=h('div','zfield');wrap.append(h('label',null,'Password'));
 const row=h('div','zpw'),i=h('input');i.type=ZS.show?'text':'password';i.value=ZS.pw;i.placeholder='Enter a password';i.autocomplete='off';i.spellcheck=false;
 const eye=h('button','ib',null,ico(ZS.show?'eyeoff':'eye'));eye.onclick=()=>{ZS.show=!ZS.show;drawZl()};
 row.append(i,eye);wrap.append(row);
 let meter,lab;
 if(confirm){
  const g=h('button','chip','Generate');g.onclick=()=>{ZS.pw=ZS.pw2=genPw();ZS.show=true;drawZl()};row.append(g);
  meter=h('div','zmeter');for(let k=0;k<4;k++)meter.append(h('i'));lab=h('small','zl0','');wrap.append(meter,lab)}
 const paint=()=>{if(!meter)return;const s=strength(ZS.pw);[...meter.children].forEach((e,k)=>e.className=k<s?'s'+s:'');lab.textContent=s?SLAB[s]+(s<3?' · try 12+ characters with mixed types':''):''};
 i.oninput=()=>{ZS.pw=i.value;paint()};paint();B.append(wrap);
 if(confirm){const w2=h('div','zfield');w2.append(h('label',null,'Confirm password'));
  const j=h('input');j.type=ZS.show?'text':'password';j.value=ZS.pw2;j.placeholder='Repeat it';j.autocomplete='off';j.oninput=()=>ZS.pw2=j.value;w2.append(j);B.append(w2)}}

function zlCreate(B){
 B.append(h('h3',null,'1 · Files'));
 const add=h('button','zadd',null,ico('plus'),h('span',null,ZS.sel.length?'Add more':'Choose files and folders'));
 add.onclick=()=>zlPicker('create');B.append(add);
 ZS.sel.forEach((x,k)=>{const r=h('div','zsel',null,ico(x.dir?'folder':'file',x.dir?'fo':''),h('div','li',null,h('b',null,x.name),h('small',null,x.dir?'Folder':fmt(x.size))));
  const rm=h('button','ib',null,ico('x'));rm.onclick=()=>{ZS.sel.splice(k,1);drawZl()};r.append(rm);B.append(r)});
 B.append(h('h3',null,'2 · Format'));
 ZFMT.forEach(([k,t,d])=>{const c=h('button','zopt'+(ZS.fmt===k?' on':''),null,h('span','zrad'),h('div',null,null,h('b',null,t),h('small',null,d)));
  c.onclick=()=>{ZS.fmt=k;if(ZS.name)ZS.name=ZS.name.replace(/\.(zip|7z)$/i,'')+zlExt();drawZl()};B.append(c)});
 if(ZS.fmt!=='7z'){const row=h('div','zlv');[[0,'Store'],[1,'Fast'],[6,'Normal'],[9,'Maximum']].forEach(([v,t])=>{const b=h('button','chip'+(ZS.level===v?' on':''),t);b.onclick=()=>{ZS.level=v;drawZl()};row.append(b)});B.append(row)}
 B.append(h('h3',null,'3 · Password'));zlPwBox(B,true);
 const nf=h('div','zfield');nf.append(h('label',null,'Archive name'));
 const ni=h('input');if(!ZS.name&&ZS.sel.length)ZS.name=(ZS.sel.length===1?ZS.sel[0].name.replace(/\.[^.]+$/,''):'Archive')+zlExt();
 ni.value=ZS.name;ni.oninput=()=>ZS.name=ni.value;ni.autocomplete='off';nf.append(ni);
 const where=h('small','zwhere','Saved in: '+short(ZS.sel.length?dirOf(ZS.sel[0].path):ZS.out||'Internal storage'));nf.append(where);B.append(nf);
 const go=h('button','zgo',null,ico('lock'),h('span',null,'Create encrypted archive'));go.onclick=zlRunCreate;B.append(go);
 B.append(h('div','note','Without the password the files cannot be recovered. Zipliner never stores it. 7z uses AES-256 only (7-Zip has no AES-128); choose ZIP for AES-128.'))}

async function zlRunCreate(){
 if(!ZS.sel.length)return toast('Choose at least one file or folder.');
 if(!ZS.pw)return toast('Enter a password.');
 if(ZS.pw!==ZS.pw2)return toast('The two passwords do not match.');
 if(strength(ZS.pw)<2&&!await dlg({title:'Weak password',msg:'This password is easy to guess. Use it anyway?',ok:'Use it',danger:true}))return;
 let n=(ZS.name||'Archive').trim();const e=badName(n);if(e)return toast(e);
 if(!/\.(zip|7z)$/i.test(n)||!n.toLowerCase().endsWith(zlExt()))n=n.replace(/\.(zip|7z)$/i,'')+zlExt();
 const dest=dirOf(ZS.sel[0].path)+'/'+n;
 const r=await job('Encrypting…',()=>ZL.create({paths:ZS.sel.map(x=>x.path),dest,format:ZS.fmt==='7z'?'7z':'zip',bits:ZS.fmt==='zip128'?128:256,level:ZS.level,password:ZS.pw}));
 if(!r||r===true)return;
 toast('Created '+n+' · '+fmt(r.size||0));TOOLS.notice({title:'Zipliner',text:n+' is ready'}).catch(()=>{});
 ZS.sel=[];ZS.pw=ZS.pw2='';ZS.name='';drawZl();if(cur.m||cur.cat)refresh()}

function zlExtract(B){
 B.append(h('h3',null,'Archive'));
 const add=h('button','zadd',null,ico('zip'),h('span',null,ZS.arc?ZS.arc.name:'Choose a .zip or .7z'));add.onclick=()=>zlPicker('extract');B.append(add);
 if(ZS.arc&&ZS.info){const i=ZS.info;
  B.append(h('div','zinfo'+(i.encrypted?' enc':''),null,ico(i.encrypted?'lock':'check'),h('div',null,null,h('b',null,(i.type==='7z'?'7z':'ZIP')+(i.encrypted?' · password protected':' · not encrypted')),h('small',null,i.count!=null?plural(i.count,'item')+' · '+fmt(ZS.arc.size):fmt(ZS.arc.size)+' · contents are hidden until you unlock it'))))}
 if(ZS.arc&&(!ZS.info||ZS.info.encrypted)){B.append(h('h3',null,'Password'));zlPwBox(B,false)}
 if(ZS.arc){const nf=h('div','zfield');nf.append(h('label',null,'Extract into folder'));const ni=h('input');ni.value=ZS.xname;ni.oninput=()=>ZS.xname=ni.value;nf.append(ni);
  nf.append(h('small','zwhere','Created next to the archive: '+short(dirOf(ZS.arc.path))));B.append(nf);
  const go=h('button','zgo',null,ico('unlock'),h('span',null,'Unlock and extract'));go.onclick=zlRunExtract;B.append(go)}
 else B.append(h('div','empty','Pick an archive to unlock it. ZIP (AES or classic) and 7z are supported.'))}

async function zlRunExtract(){
 const e=badName(ZS.xname||'');if(e)return toast(e);
 const dest=dirOf(ZS.arc.path)+'/'+ZS.xname.trim();
 const ok=await job('Extracting…',()=>ZL.extract({path:ZS.arc.path,dest,password:ZS.pw}));
 if(!ok)return;toast('Extracted to '+short(dest));ZS.pw='';drawZl();if(cur.m||cur.cat)refresh()}

/* ---------- picker (real folders) ---------- */
async function zlPicker(mode){
 ZS.pick=mode;TV.view='zlp';if(mode==='extract'&&ZS.arc)ZS.path=dirOf(ZS.arc.path);else if(mode==='create'&&ZS.sel.length)ZS.path=dirOf(ZS.sel[0].path);
 await drawPick()}
async function drawPick(){
 const B=$('#tbody'),bar=$('#tbar');B.replaceChildren();bar.replaceChildren();
 head(baseOf(ZS.path)||'Internal storage',true);
 let r;try{r=await ZL.list({path:ZS.path})}catch(e){toast(e.message||'Cannot open folder');TV.view='zl';return drawZl()}
 B.append(h('div','zcrumb',short(ZS.path)||'Internal storage'));
 if(ZS.path!=='/storage/emulated/0'&&r.parent){const u=h('div','lr',null,ico('back'),h('div','li',null,h('b',null,'Up one folder')));u.onclick=()=>{ZS.path=r.parent;drawPick()};B.append(u)}
 const ex=ZS.pick==='extract';let shown=0;
 r.items.forEach(x=>{
  if(ex&&!x.dir&&!/\.(zip|7z)$/i.test(x.name))return;shown++;
  const on=!ex&&ZS.sel.some(s=>s.path===x.path);
  const n=h('div','lr'+(on?' sel':''),null,ex&&!x.dir?null:h('span','ck'+(on?' on':''),null,ico('check')),ico(x.dir?'folder':KICON[kindOf(x.name)]||'file',x.dir?'fo':''),h('div','li',null,h('b',null,x.name),h('small',null,x.dir?'Folder':fmt(x.size))),h('span','sz',x.dir?'':fmt(x.size)));
  if(x.dir){const go=h('button','ib',null,ico('next'));go.onclick=e=>{e.stopPropagation();ZS.path=x.path;drawPick()};n.append(go)}
  n.onclick=async()=>{
   if(ex){if(x.dir){ZS.path=x.path;return drawPick()}
    ZS.arc=x;ZS.xname=x.name.replace(/\.(zip|7z)$/i,'');ZS.info=null;ZS.pw='';TV.view='zl';bar.classList.remove('on');
    try{ZS.info=await ZL.inspect({path:x.path})}catch{}drawZl();return}
   const k=ZS.sel.findIndex(s=>s.path===x.path);k>=0?ZS.sel.splice(k,1):ZS.sel.push(x);drawPick()};
  B.append(n)});
 if(!shown)B.append(h('div','empty',ex?'No ZIP or 7z files in this folder.':'This folder is empty.'));
 if(!ex){bar.classList.add('on');
  const c=h('button','chip',ZS.sel.length?'Clear':'Cancel');c.onclick=()=>{if(ZS.sel.length){ZS.sel=[];drawPick()}else{TV.view='zl';bar.classList.remove('on');drawZl()}};
  bar.append(c,h('b','sum',ZS.sel.length?plural(ZS.sel.length,'item')+' selected':'Tap to select'));
  const d=h('button','chip on','Done');d.onclick=()=>{TV.view='zl';bar.classList.remove('on');ZS.name='';drawZl()};bar.append(d)}
 else bar.classList.remove('on')}

if(ZL&&ZL.addListener)ZL.addListener('zlProgress',e=>{$('#bp').textContent=e.name||''});
