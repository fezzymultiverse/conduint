/* reader.js: one reader for PDF, Markdown, PowerPoint (.pptx), Word (.docx), HTML, plain text, pictures, audio and video.
   Everything is drawn with DOM nodes (textContent only, never innerHTML). HTML files run in a sandboxed frame without scripts.
   PDF pages come from Android's PdfRenderer (Saf.pdfPage), so big PDFs stay light; Office files are unzipped here with DecompressionStream.
   Strategy Over Impulse. */
const tdec=u=>new TextDecoder('utf-8').decode(u);
const fileUrl=p=>CAP.convertFileSrc?CAP.convertFileSrc(p):location.origin+'/_capacitor_file_'+p;
const RX={pdf:'pdf',md:'md',markdown:'md',html:'html',htm:'html',xhtml:'html',pptx:'ppt',docx:'docx',txt:'txt',log:'txt',csv:'csv',tsv:'csv',json:'txt',xml:'txt',yml:'txt',yaml:'txt',ini:'txt',conf:'txt',sh:'txt',js:'txt',py:'txt',css:'txt'};
function rdType(n,m){
 const e=n.split('.').pop().toLowerCase();if(RX[e])return RX[e];
 const k=kindOf(n,m);if(k==='img')return'img';if(k==='aud'||k==='vid')return'av';
 return /^text\//.test(m||'')?'txt':null}
const RD={on:false,tok:0,t:'',src:null,key:'',urls:[],sc:null,io:null,zoom:1,cb:null,pos:0};
const RTH=['night','sepia','day'],RTN={night:'Night',sepia:'Sepia',day:'Day'};
const xmlp=u=>new DOMParser().parseFromString(tdec(u),'application/xml');
const ch=(e,n)=>e?[...e.children].filter(c=>c.localName===n):[];
const c1=(e,n)=>ch(e,n)[0]||null;
const ds=(e,n)=>e?[...e.getElementsByTagNameNS('*',n)]:[];
const at=(e,n)=>e?e.getAttribute(n):null;
const ra=(e,n)=>{if(e)for(const a of e.attributes)if(a.localName===n&&/relationships/.test(a.namespaceURI||''))return a.value;return null};

/* [1] BYTES */
async function rdBytes(s){
 if(s.blob)return s.blob.arrayBuffer();if(s.file)return s.file.arrayBuffer();
 if(s.fh)return(await s.fh.getFile()).arrayBuffer();
 if(s.uri&&SAF){const p=(await SAF.cacheCopy({uri:s.uri,name:s.name})).path;return(await fetch(fileUrl(p))).arrayBuffer()}
 throw Error('This file cannot be read here.')}
async function rdPath(s){
 if(s.uri&&SAF)return(await SAF.cacheCopy({uri:s.uri,name:s.name})).path;
 const b=s.blob||s.file||(s.fh&&await s.fh.getFile());if(!b)throw Error('This file cannot be read here.');
 return(await SAF.cachePut({name:s.name,b64:await blobB64(b)})).path}
async function rdUrl(s){
 if(s.blob||s.file||s.fh){const u=URL.createObjectURL(s.blob||s.file||await s.fh.getFile());RD.urls.push(u);return u}
 return fileUrl((await SAF.cacheCopy({uri:s.uri,name:s.name})).path)}

/* [2] ZIP (Office files) */
async function zipRead(ab){
 const u=new Uint8Array(ab),dv=new DataView(ab);let e=u.length-22;
 for(const lo=Math.max(0,u.length-65558);e>=lo;e--)if(dv.getUint32(e,true)===0x06054b50)break;
 if(e<0||dv.getUint32(e,true)!==0x06054b50)throw Error('This is not a valid Office file (no zip directory).');
 const n=dv.getUint16(e+10,true),M=new Map();let p=dv.getUint32(e+16,true);
 for(let i=0;i<n;i++){if(dv.getUint32(p,true)!==0x02014b50)break;
  const meth=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
  M.set(tdec(u.subarray(p+46,p+46+nl)),{meth,cs,off});p+=46+nl+el+cl}
 const get=async name=>{const f=M.get(name);if(!f)return null;
  const nl=dv.getUint16(f.off+26,true),el=dv.getUint16(f.off+28,true),s=f.off+30+nl+el,raw=u.subarray(s,s+f.cs);
  if(f.meth===0)return raw;
  if(f.meth!==8)throw Error('This file uses a compression method Conduint cannot read.');
  if(typeof DecompressionStream==='undefined')throw Error('This Android WebView is too old to open Office files. Update Android System WebView.');
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())};
 return{has:k=>M.has(k),get,names:()=>[...M.keys()]}}
function rpath(base,t){if(t[0]==='/')return t.slice(1);const r=[];for(const s of(base+t).split('/')){if(s==='..')r.pop();else if(s&&s!=='.')r.push(s)}return r.join('/')}
async function zrels(z,part){
 const i=part.lastIndexOf('/'),base=part.slice(0,i+1),b=await z.get(base+'_rels/'+part.slice(i+1)+'.rels'),m={};
 if(b)ds(xmlp(b),'Relationship').forEach(r=>{m[at(r,'Id')]={t:at(r,'Type')||'',p:rpath(base,at(r,'Target')||'')}});return m}

/* [3] MARKDOWN */
function mdInline(s){
 const out=[],re=/(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9])_([^_\s][^_]*?)_(?![A-Za-z0-9])|!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<)]+)/g;
 let i=0,m;
 while((m=re.exec(s))){
  if(m.index>i)out.push(s.slice(i,m.index));i=re.lastIndex;
  if(m[2]!=null)out.push(h('code',null,m[2]));
  else if(m[3]!=null||m[4]!=null)out.push(h('strong',null,null,...mdInline(m[3]!=null?m[3]:m[4])));
  else if(m[5]!=null)out.push(h('del',null,null,...mdInline(m[5])));
  else if(m[6]!=null||m[7]!=null)out.push(h('em',null,null,...mdInline(m[6]!=null?m[6]:m[7])));
  else if(m[9]!=null){
   if(m[0][0]==='!')out.push(h('span','mdimg','Image: '+(m[8]||m[9])));
   else if(/^(https?:|mailto:|tel:)/i.test(m[9])){const a=h('a',null,null,...mdInline(m[8]||m[9]));a.href=m[9];a.target='_blank';a.rel='noopener noreferrer';out.push(a)}
   else out.push(h('span',null,null,...mdInline(m[8])))}
  else if(m[10]!=null){const a=h('a',null,m[10]);a.href=m[10];a.target='_blank';a.rel='noopener noreferrer';out.push(a)}}
 if(i<s.length)out.push(s.slice(i));return out}
function mdRender(src){
 const L=src.replace(/\r\n?/g,'\n').split('\n'),root=document.createDocumentFragment(),blank=l=>!l.trim();
 const LI=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/;let i=0;
 if(L[0]==='---'){const e=L.indexOf('---',1);if(e>0)i=e+1}
 const parseList=ind=>{
  const first=L[i].match(LI),el=h(/\d/.test(first[2])?'ol':'ul');
  while(i<L.length){
   if(blank(L[i])){let j=i;while(j<L.length&&blank(L[j]))j++;
    if(j<L.length&&LI.test(L[j])&&L[j].match(LI)[1].length===ind)i=j;else break}
   const m=L[i].match(LI);if(!m||m[1].length!==ind)break;
   const li=h('li');let t=m[3];i++;
   const tk=t.match(/^\[([ xX])\]\s+(.*)$/);
   if(tk){li.className='task';const cb=document.createElement('input');cb.type='checkbox';cb.disabled=true;cb.checked=tk[1]!==' ';li.append(cb);t=tk[2]}
   li.append(...mdInline(t));
   for(;;){
    if(i>=L.length)break;const nx=L[i];
    if(blank(nx)){let j=i;while(j<L.length&&blank(L[j]))j++;
     if(j<L.length&&LI.test(L[j])&&L[j].match(LI)[1].length>ind){i=j;continue}break}
    const nm=nx.match(LI);
    if(nm&&nm[1].length>ind){li.append(parseList(nm[1].length));continue}
    if(!nm&&nx.search(/\S/)>ind){li.append(' ',...mdInline(nx.trim()));i++;continue}
    break}
   el.append(li)}
  return el};
 while(i<L.length){
  const l=L[i];if(blank(l)){i++;continue}let m;
  if((m=l.match(/^(`{3,}|~{3,})\s*([\w+-]*)/))){
   const f=m[1][0],n=m[1].length,end=new RegExp('^\\s*\\'+f+'{'+n+',}\\s*$'),buf=[];i++;
   while(i<L.length&&!end.test(L[i]))buf.push(L[i++]);i++;
   const pre=h('pre',null,null,h('code',null,buf.join('\n')));if(m[2])pre.dataset.lang=m[2];root.append(pre);continue}
  if((m=l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))){root.append(h('h'+m[1].length,null,null,...mdInline(m[2])));i++;continue}
  if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)){root.append(h('hr'));i++;continue}
  if(/^\s{0,3}>/.test(l)){const b=[];while(i<L.length&&/^\s{0,3}>/.test(L[i]))b.push(L[i++].replace(/^\s{0,3}>\s?/,''));
   const q=h('blockquote');q.append(mdRender(b.join('\n')));root.append(q);continue}
  if(/^\s*\|/.test(l)&&i+1<L.length&&/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i+1])){
   const cells=r=>r.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
   const hd=cells(l),al=cells(L[i+1]).map(c=>/^:-*:$/.test(c)?'center':/-:$/.test(c)?'right':'');i+=2;
   const tr0=h('tr'),tb=h('tbody');
   hd.forEach((c,k)=>{const e=h('th',null,null,...mdInline(c));if(al[k])e.style.textAlign=al[k];tr0.append(e)});
   while(i<L.length&&/^\s*\|/.test(L[i])){const tr=h('tr');
    cells(L[i]).forEach((c,k)=>{const e=h('td',null,null,...mdInline(c));if(al[k])e.style.textAlign=al[k];tr.append(e)});tb.append(tr);i++}
   root.append(h('div','tw',null,h('table',null,null,h('thead',null,null,tr0),tb)));continue}
  if(LI.test(l)){root.append(parseList(l.match(LI)[1].length));continue}
  const b=[];
  while(i<L.length&&!blank(L[i])&&!/^(#{1,6}\s|```|~~~|\s{0,3}>)/.test(L[i])&&!(b.length&&LI.test(L[i])))b.push(L[i++]);
  if(!b.length)b.push(L[i++]);
  root.append(h('p',null,null,...mdInline(b.map(x=>x.trim()).join(' '))))}
 return root}

/* [4] CHROME: themes, text size, progress, position memory */
function rdApply(){
 const s=S.settings,R=$('#rd');R.dataset.rt=RTH.includes(s.rth)?s.rth:'night';R.dataset.rf=s.rfont||'serif';R.style.setProperty('--rfs',(s.rfs||18)+'px')}
function rdSave(){
 if(!RD.on||!RD.key)return;S.rpos=S.rpos||{};delete S.rpos[RD.key];S.rpos[RD.key]=RD.pos;
 const k=Object.keys(S.rpos);if(k.length>60)delete S.rpos[k[0]];save()}
function rdScroll(sc,foot){
 RD.sc=sc;let tm=0;
 sc.addEventListener('scroll',()=>{
  const mx=sc.scrollHeight-sc.clientHeight,p=mx>0?sc.scrollTop/mx:0;RD.pos=p;
  $('#rprog i').style.width=(p*100).toFixed(1)+'%';if(foot)foot(p);
  clearTimeout(tm);tm=setTimeout(rdSave,500)},{passive:true});
 sc.addEventListener('click',e=>{if(getSelection().toString()||e.target.closest('a'))return;$('#rd').classList.toggle('imm')});
 const sp=(S.rpos||{})[RD.key];if(sp>0.005)requestAnimationFrame(()=>{sc.scrollTop=sp*(sc.scrollHeight-sc.clientHeight)})}
function rdMount(B,node,words){
 const sc=h('div','rscroll',null,node);B.replaceChildren(sc);
 const foot=p=>{const left=Math.max(0,Math.ceil(words*(1-p)/220));$('#rf').replaceChildren(h('span',null,Math.round(p*100)+'%'),h('span',null,left?'~'+left+' min left':'Finished'),h('span','soi','Strategy Over Impulse'))};
 foot(0);rdScroll(sc,foot);$('#rs').textContent='~'+Math.max(1,Math.ceil(words/220))+' min read · '+fmt(RD.src.size||0)}
const wc=t=>(t.match(/\S+/g)||[]).length;
const sizeBump=d=>{const s=S.settings;
 if(RD.t==='pdf')return pdfZoom(d);
 s.rfs=Math.max(13,Math.min(30,(s.rfs||18)+d*2));save();rdApply()};

/* [5] OPEN AND CLOSE */
async function readerOpen(src){
 const t=rdType(src.name,src.mime);if(!t)return false;
 rdClose(true);RD.on=true;RD.src=src;RD.t=t;RD.zoom=1;RD.pos=0;RD.key=(src.vault?'v:':'')+(src.uri||src.name)+':'+(src.size||0);
 const R=$('#rd');R.className='on t-'+t;R.classList.remove('imm');if(src.fromZip)R.classList.add('zv');document.body.classList.add('rdon');rdApply();
 $('#rt').textContent=src.name;$('#rs').textContent=fmt(src.size||0);$('#rf').replaceChildren();$('#rprog i').style.width='0%';
 const B=$('#rb'),my=++RD.tok;B.replaceChildren(h('div','rload',null,h('div','spin'),h('b',null,'Opening…')));
 try{await RV[t](src,B,my)}
 catch(e){if(my!==RD.tok)return true;
  const m=h('div','rerr',null,h('b',null,'Could not open this file'),h('p',null,e.message||String(e)));
  if(src.uri&&SAF){const b=h('button','chip on','Open with another app');b.onclick=()=>opOpenWith(src,true);m.append(b)}
  B.replaceChildren(m)}
 return true}
function rdClose(keep){
 if(RD.on)rdSave();RD.tok++;RD.on=false;
 if(RD.io){RD.io.disconnect();RD.io=null}
 if(RD.cb){RD.cb();RD.cb=null}
 RD.urls.forEach(u=>URL.revokeObjectURL(u));RD.urls=[];RD.sc=null;
 const v=$('#rb').querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load()}
 $('#rb').replaceChildren();
 if(!keep){$('#rd').className='';document.body.classList.remove('rdon');
  if(SAF&&!pl.classList.contains('on'))SAF.clearCache().catch(()=>{})}}

/* [6] VIEWERS */
const RV={};
RV.md=async(s,B,my)=>{const t=tdec(new Uint8Array(await rdBytes(s)));if(my!==RD.tok)return;
 const a=h('article','rdoc');a.append(mdRender(t),h('div','rend','Strategy Over Impulse'));rdMount(B,a,wc(t))};
RV.txt=async(s,B,my)=>{let t=tdec(new Uint8Array(await rdBytes(s)));if(my!==RD.tok)return;
 const cut=t.length>2000000;if(cut)t=t.slice(0,2000000);
 const a=h('article','rdoc txt');a.append(h('pre',null,t));if(cut)a.append(h('p','rnote','Showing the first 2 MB. Use Open with for the rest.'));rdMount(B,a,wc(t))};
RV.csv=async(s,B,my)=>{
 const raw=tdec(new Uint8Array(await rdBytes(s)));if(my!==RD.tok)return;
 const isTsv=/\.(tsv)$/i.test(s.name);
 /* parse: handle quoted fields with embedded commas/newlines */
 function parseCSV(text,sep){
  const rows=[],re=new RegExp('("(?:[^"]|"")*"|[^'+sep+'\\r\\n]*)('+sep+'|\\r?\\n|\\r|$)','g');
  let row=[];re.lastIndex=0;
  for(;;){const m=re.exec(text);if(!m)break;
   const v=m[1][0]==='"'?m[1].slice(1,-1).replace(/""/g,'"'):m[1];
   row.push(v);
   if(m[2]!==sep){rows.push(row);row=[];if(m[2]===''||re.lastIndex>=text.length)break}}
  /* drop trailing empty row */
  if(rows.length&&rows[rows.length-1].every(c=>!c.trim()))rows.pop();
  return rows}
 const sep=isTsv?'\t':',';
 const rows=parseCSV(raw.length>2000000?raw.slice(0,2000000):raw,sep);
 const cut=raw.length>2000000;
 if(!rows.length){const a=h('article','rdoc txt');a.append(h('pre',null,'(empty file)'));rdMount(B,a,0);return}
 const ncols=Math.max(...rows.map(r=>r.length));
 const wrap=h('div','rscroll csv-wrap');
 const tbl=document.createElement('table');tbl.className='csv-tbl';
 const thead=document.createElement('thead'),tbody=document.createElement('tbody');
 /* first row = header */
 const hrow=document.createElement('tr');
 /* row-number gutter header */
 const gh=document.createElement('th');gh.className='csv-gutter';gh.textContent='#';hrow.append(gh);
 rows[0].forEach((c,i)=>{const th=document.createElement('th');th.textContent=c||'Col '+(i+1);th.title=c;hrow.append(th)});
 /* fill missing cols */
 for(let i=rows[0].length;i<ncols;i++){const th=document.createElement('th');hrow.append(th)}
 thead.append(hrow);tbl.append(thead);
 const MAX_ROWS=5000;
 rows.slice(1,MAX_ROWS+1).forEach((r,ri)=>{
  const tr=document.createElement('tr');
  const gd=document.createElement('td');gd.className='csv-gutter';gd.textContent=ri+1;tr.append(gd);
  for(let ci=0;ci<ncols;ci++){const td=document.createElement('td');td.textContent=r[ci]||'';td.title=r[ci]||'';tr.append(td)}
  tbody.append(tr)});
 tbl.append(tbody);wrap.append(tbl);
 if(cut||rows.length>MAX_ROWS+1){const note=h('p','rnote','Showing '+(Math.min(rows.length-1,MAX_ROWS)).toLocaleString()+' of '+(rows.length-1).toLocaleString()+' rows.');wrap.append(note)}
 const info=(rows.length-1).toLocaleString()+' rows · '+ncols+' cols · '+fmt(s.size||0);
 $('#rs').textContent=info;B.replaceChildren(wrap);RD.sc=wrap;
 /* simple column sort on header click */
 let sortCol=-1,sortAsc=true;
 thead.querySelectorAll('th:not(.csv-gutter)').forEach((th,ci)=>{th.style.cursor='pointer';
  th.onclick=()=>{const asc=sortCol===ci?!sortAsc:true;sortCol=ci;sortAsc=asc;
   thead.querySelectorAll('th:not(.csv-gutter)').forEach((t,i)=>{t.dataset.sort=i===ci?(asc?'asc':'desc'):''});
   const rowData=[...tbody.rows];
   rowData.sort((a,b)=>{const av=a.cells[ci+1]?.textContent||'',bv=b.cells[ci+1]?.textContent||'';
    const an=parseFloat(av),bn=parseFloat(bv);
    if(!isNaN(an)&&!isNaN(bn))return asc?an-bn:bn-an;
    return asc?av.localeCompare(bv):bv.localeCompare(av)});
   rowData.forEach((r,i)=>{r.cells[0].textContent=i+1;tbody.append(r)})}})};
RV.html=async(s,B,my)=>{const t=tdec(new Uint8Array(await rdBytes(s)));if(my!==RD.tok)return;
 RD.html={t,src:false};rdHtml(B);$('#rs').textContent='HTML · '+fmt(s.size||0)};
function rdHtml(B){
 B=B||$('#rb');
 if(RD.html.src){const a=h('article','rdoc txt');a.append(h('pre',null,RD.html.t));rdMount(B,a,wc(RD.html.t));$('#rs').textContent='HTML source';return}
 const f=document.createElement('iframe');f.className='rframe';f.setAttribute('sandbox','');f.srcdoc=RD.html.t;B.replaceChildren(f);RD.sc=null}
RV.img=async(s,B,my)=>{const u=await rdUrl(s);if(my!==RD.tok)return;
 const im=document.createElement('img');im.src=u;im.alt=s.name;im.className='rimg';im.onclick=()=>im.classList.toggle('full');
 B.replaceChildren(h('div','rscroll rcenter',null,im));$('#rs').textContent='Tap the picture for actual size'};
RV.av=async(s,B,my)=>{const u=await rdUrl(s);if(my!==RD.tok)return;
 const v=document.createElement('video');v.controls=true;v.playsInline=true;v.src=u;v.className='rav';v.onerror=()=>toast("This file's format or codec isn't supported here.");
 B.replaceChildren(h('div','rscroll rcenter',null,v));v.play().catch(()=>{})};

/* DOCX */
RV.docx=async(s,B,my)=>{
 const z=await zipRead(await rdBytes(s));if(my!==RD.tok)return;
 const db=await z.get('word/document.xml');if(!db)throw Error('This is not a .docx file. Old .doc files need another app (Open with).');
 const body=ds(xmlp(db),'body')[0],art=h('article','rdoc');let words=0;
 const on=e=>{if(!e)return false;const v=at(e,'val');return v!=='0'&&v!=='false'&&v!=='none'};
 const runs=p=>{const f=document.createDocumentFragment();
  ds(p,'r').forEach(r=>{const rp=c1(r,'rPr');let n=[];
   for(const k of r.children){if(k.localName==='t'){words+=wc(k.textContent);n.push(k.textContent)}else if(k.localName==='tab')n.push('    ');else if(k.localName==='br')n.push(h('br'))}
   if(!n.length)return;let el=n.length===1&&typeof n[0]==='string'?document.createTextNode(n[0]):h('span',null,null,...n);
   if(rp&&on(c1(rp,'i'))){el=h('em',null,null,el)}if(rp&&on(c1(rp,'b'))){el=h('strong',null,null,el)}f.append(el)});return f};
 const para=p=>{
  const ppr=c1(p,'pPr'),st=at(c1(ppr,'pStyle'),'val')||'',m=st.match(/^Heading\s?([1-6])$/i),f=runs(p);
  if(!f.childNodes.length)return null;
  if(m)return h('h'+m[1],null,null,f);if(/^title$/i.test(st))return h('h1',null,null,f);if(/^subtitle$/i.test(st))return h('h2',null,null,f);
  if(c1(ppr,'numPr')||/list/i.test(st)){const d=h('div','dli',null,h('span','bu','•'),h('div',null,null,f));return d}
  return h('p',null,null,f)};
 const walk=(par,out)=>{for(const c of par.children){
  if(c.localName==='p'){const e=para(c);if(e)out.append(e)}
  else if(c.localName==='tbl'){const t=h('table'),tb=h('tbody');
   ch(c,'tr').forEach(r=>{const tr=h('tr');ch(r,'tc').forEach(tc=>{const td2=h('td');walk(tc,td2);tr.append(td2)});tb.append(tr)});t.append(tb);out.append(h('div','tw',null,t))}
  else if(c.localName==='sdt'){const sc=c1(c,'sdtContent');if(sc)walk(sc,out)}}};
 walk(body,art);
 if(!art.childNodes.length)art.append(h('p','rnote','No readable text found in this document.'));
 art.append(h('div','rend','Strategy Over Impulse'));rdMount(B,art,words)};

/* PPTX */
RV.ppt=async(s,B,my)=>{
 const z=await zipRead(await rdBytes(s));if(my!==RD.tok)return;
 const pb=await z.get('ppt/presentation.xml');if(!pb)throw Error('This is not a .pptx presentation. Old .ppt files need another app (Open with).');
 const pd=xmlp(pb),pr=await zrels(z,'ppt/presentation.xml'),sz=ds(pd,'sldSz')[0],CX=+(at(sz,'cx')||9144000),CY=+(at(sz,'cy')||5143500);
 const parts=ds(pd,'sldId').map(e=>pr[ra(e,'id')]).filter(Boolean).map(r=>r.p);
 if(!parts.length)throw Error('This presentation has no slides.');
 /* theme colours and the master's colour map */
 const C={th:{},map:{bg1:'lt1',tx1:'dk1',bg2:'lt2',tx2:'dk2'}};
 const mr=Object.values(pr).find(r=>/slideMaster$/.test(r.t)),mx=mr&&await z.get(mr.p),mxml=mx&&xmlp(mx);
 if(mxml){const cm=ds(mxml,'clrMap')[0];if(cm)for(const a of cm.attributes)C.map[a.name]=a.value}
 const thr=mr&&Object.values(await zrels(z,mr.p)).find(r=>/theme$/.test(r.t)),tb=await z.get(thr?thr.p:'ppt/theme/theme1.xml');
 if(tb){const cs=ds(xmlp(tb),'clrScheme')[0];if(cs)for(const k of cs.children){const v=k.firstElementChild;if(v)C.th[k.localName]='#'+(at(v,'lastClr')||at(v,'val')||'000000')}}
 const colOf=el=>{if(!el)return null;for(const k of el.children){const v=at(k,'val'),n=k.localName;
  if(n==='srgbClr')return'#'+v;if(n==='schemeClr')return C.th[C.map[v]||v]||null;if(n==='sysClr')return'#'+(at(k,'lastClr')||'000000');
  if(n==='prstClr')return v==='white'?'#ffffff':v==='black'?'#000000':null}return null};
 const lum=c=>{const n=parseInt(c.slice(1),16);return(.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255))/255};
 const bgOf=root=>{const cs=ds(root,'cSld')[0],b=cs&&c1(cs,'bg');if(!b)return null;
  const p=c1(b,'bgPr'),sf=p&&c1(p,'solidFill');return sf?colOf(sf):colOf(c1(b,'bgRef'))};
 const xfr=x=>{const o=c1(x,'off'),e=c1(x,'ext');if(!o||!e)return null;
  const r={x:+at(o,'x'),y:+at(o,'y'),w:+at(e,'cx'),h:+at(e,'cy')},co=c1(x,'chOff'),ce=c1(x,'chExt');
  if(co&&ce){r.cx=+at(co,'x');r.cy=+at(co,'y');r.cw=+at(ce,'cx')||1;r.ch=+at(ce,'cy')||1}return r};
 const phOf=sp=>{const nv=c1(c1(sp,'nvSpPr'),'nvPr'),ph=c1(nv,'ph');return ph?{type:at(ph,'type')||'body',idx:at(ph,'idx')}:null};
 const phMap=xml=>{const m={};ds(xml,'sp').forEach(sp=>{const ph=phOf(sp),x=xfr(c1(c1(sp,'spPr'),'xfrm'));if(!ph||!x)return;
  if(ph.idx!=null)m['i:'+ph.idx]=x;m['t:'+ph.type]=x});return m};
 const mph=mxml?phMap(mxml):{};
 const tkey={ctrTitle:'title',subTitle:'body'};
 const paras=tx=>ch(tx,'p').map(p=>{
  const pp=c1(p,'pPr'),lvl=+(at(pp,'lvl')||0),bc=pp&&c1(pp,'buChar'),bu=bc?at(bc,'char'):(pp&&c1(pp,'buAutoNum')?'#':(pp&&c1(pp,'buNone')?'':null)),runs=[];
  for(const r of p.children){
   if(r.localName==='r'||r.localName==='fld'){const t=c1(r,'t');if(!t)continue;const rp=c1(r,'rPr'),u=at(rp,'u');
    runs.push({t:t.textContent,sz:at(rp,'sz')?+at(rp,'sz')/100:0,b:at(rp,'b')==='1',i:at(rp,'i')==='1',u:!!u&&u!=='none',c:rp?colOf(c1(rp,'solidFill')):null})}
   else if(r.localName==='br')runs.push({br:1})}
  return{lvl,algn:at(pp,'algn'),bu,runs}});
 const slides=[];
 for(const part of parts){
  const sb=await z.get(part);if(!sb)continue;const sx=xmlp(sb),sr=await zrels(z,part);
  const lr=Object.values(sr).find(r=>/slideLayout$/.test(r.t)),lb=lr&&await z.get(lr.p),lx=lb&&xmlp(lb),lph=lx?phMap(lx):{};
  const sl={bg:bgOf(sx)||(lx&&bgOf(lx))||(mxml&&bgOf(mxml))||'#ffffff',shapes:[]};
  const place=(ph,x)=>x||(ph&&((ph.idx!=null&&lph['i:'+ph.idx])||lph['t:'+ph.type]||mph['t:'+(tkey[ph.type]||ph.type)]))||null;
  const walk=async(par,T)=>{for(const el of [...par.children]){const n=el.localName;
   if(n==='grpSp'){const x=xfr(c1(c1(el,'grpSpPr'),'xfrm'));let T2=T;
    if(x&&x.cw){const kx=x.w/x.cw,ky=x.h/x.ch;T2={x0:T.x0+(x.x-x.cx*kx)*T.kx,y0:T.y0+(x.y-x.cy*ky)*T.ky,kx:T.kx*kx,ky:T.ky*ky}}await walk(el,T2)}
   else if(n==='sp'||n==='pic'||n==='graphicFrame'){
    const ph=n==='sp'?phOf(el):null;let x=n==='graphicFrame'?xfr(c1(el,'xfrm')):xfr(c1(c1(el,'spPr'),'xfrm'));x=place(ph,x);if(!x)continue;
    const g={x:T.x0+x.x*T.kx,y:T.y0+x.y*T.ky,w:x.w*T.kx,h:x.h*T.ky};
    if(n==='sp'){const sp=c1(el,'spPr'),tx=c1(el,'txBody'),gm=sp&&c1(sp,'prstGeom'),bp=tx&&c1(tx,'bodyPr');
     const o={k:'t',...g,ph:ph&&ph.type,fill:sp?colOf(c1(sp,'solidFill')):null,geom:gm?at(gm,'prst'):'',anchor:at(bp,'anchor')||(ph&&/title/i.test(ph.type)?'ctr':'t'),paras:tx?paras(tx):[]};
     if(o.paras.some(p=>p.runs.length)||o.fill)sl.shapes.push(o)}
    else if(n==='pic'){const bl=ds(el,'blip')[0],id=ra(bl,'embed'),r=id&&sr[id];
     if(r&&z.has(r.p)){const ex=r.p.split('.').pop().toLowerCase(),mt={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',bmp:'image/bmp'}[ex];
      if(mt){const u=URL.createObjectURL(new Blob([await z.get(r.p)],{type:mt}));RD.urls.push(u);sl.shapes.push({k:'p',...g,src:u})}}}
    else{const tbl=ds(el,'tbl')[0];
     if(tbl)sl.shapes.push({k:'tbl',...g,rows:ch(tbl,'tr').map(r=>ch(r,'tc').map(c=>ds(c,'t').map(t=>t.textContent).join(' ')))});
     else sl.shapes.push({k:'t',...g,ph:null,fill:'#8884',geom:'',anchor:'ctr',paras:[{lvl:0,algn:'ctr',bu:'',runs:[{t:'Chart or diagram (not drawn)',sz:12,c:null}]}]})}}}};
  const tree=ds(sx,'spTree')[0];if(tree)await walk(tree,{x0:0,y0:0,kx:1,ky:1});
  slides.push(sl)}
 if(my!==RD.tok)return;if(!slides.length)throw Error('No slides could be read.');
 const N=slides.length;let cur=Math.min(N-1,Math.max(0,Math.round(((S.rpos||{})[RD.key]||0)*(N-1))));
 const stage=h('div','pstage'),body=h('div','pbody',null,stage),outline=h('div','rscroll');outline.style.display='none';
 const art=h('article','rdoc');
 slides.forEach((sl,i)=>{const hd=h('h3',null,'Slide '+(i+1));art.append(hd);
  sl.shapes.filter(x=>x.k==='t').forEach(x=>x.paras.forEach(p=>{const t=p.runs.map(r=>r.br?' ':r.t).join('').trim();if(!t)return;
   art.append(/title/i.test(x.ph||'')?h('p',null,null,h('strong',null,t)):h('p',null,t))}))});
 art.append(h('div','rend','Strategy Over Impulse'));outline.append(art);
 const num=h('button','pgn',(cur+1)+' / '+N),prev=h('button','ib',null,ico('prev')),next=h('button','ib',null,ico('next')),ol=h('button','chip','Outline');
 prev.setAttribute('aria-label','Previous slide');next.setAttribute('aria-label','Next slide');
 const rf=$('#rf');rf.replaceChildren(prev,num,next,ol);
 const draw=()=>{
  const sl=slides[cur],aw=body.clientWidth||innerWidth,ah=body.clientHeight||innerHeight,W=Math.max(120,Math.min(aw-16,(ah-16)*CX/CY)),k=W/CX,dark=lum(sl.bg)<.5,dflt=dark?'#ffffff':'#111111';
  const el=h('div','sl');el.style.width=W+'px';el.style.height=(CY*k)+'px';el.style.background=sl.bg;const fits=[];
  sl.shapes.forEach(s=>{const b=h('div','shp');b.style.left=(s.x*k)+'px';b.style.top=(s.y*k)+'px';b.style.width=(s.w*k)+'px';b.style.height=(s.h*k)+'px';
   if(s.k==='p'){const im=document.createElement('img');im.src=s.src;im.alt='';im.draggable=false;b.append(im)}
   else if(s.k==='tbl'){const t=h('table'),tbd=h('tbody');b.style.fontSize=(14*12700*k)+'px';b.style.color=dflt;
    s.rows.forEach(r=>{const tr=h('tr');r.forEach(c=>tr.append(h('td',null,c)));tbd.append(tr)});t.append(tbd);b.append(t)}
   else{b.classList.add('tx');if(s.fill){b.style.background=s.fill;if(/^#[0-9a-f]{6}$/i.test(s.fill))b.style.color=lum(s.fill)<.5?'#fff':'#111'}
    else b.style.color=dflt;
    if(s.geom==='ellipse')b.style.borderRadius='50%';else if(s.geom==='roundRect')b.style.borderRadius='8%';
    b.style.justifyContent=s.anchor==='ctr'?'center':s.anchor==='b'?'flex-end':'flex-start';
    const isT=/title/i.test(s.ph||''),defPt=isT?(s.ph==='ctrTitle'?40:32):s.ph==='subTitle'?22:s.ph==='body'?20:16;
    let n=0;
    s.paras.forEach(p=>{if(!p.runs.length){b.append(h('div','sp','\u00a0'));return}
     const d=h('div','sp'),bu=p.bu==null?(s.ph==='body'?'•':''):p.bu;
     d.style.textAlign=p.algn==='ctr'?'center':p.algn==='r'?'right':p.algn==='just'?'justify':(s.ph==='ctrTitle'||s.ph==='subTitle'?'center':'left');
     {const f0=(p.runs.find(r=>!r.br)||{}).sz||defPt;d.style.fontSize='calc('+(f0*12700*k)+'px*var(--z,1))'}
     if(bu){n=bu==='#'?n+1:0;d.style.paddingLeft=(p.lvl*1.1+1.1)+'em';d.style.textIndent='-1.1em';d.append(h('span','bul',bu==='#'?n+'.':bu))}
     else{n=0;d.style.paddingLeft=(p.lvl*1.1)+'em'}
     p.runs.forEach(r=>{if(r.br){d.append(h('br'));return}
      const sp=h('span',null,r.t),px=(r.sz||defPt)*12700*k;sp.style.fontSize='calc('+px+'px*var(--z,1))';
      if(r.b||isT)sp.style.fontWeight='700';if(r.i)sp.style.fontStyle='italic';if(r.u)sp.style.textDecoration='underline';if(r.c)sp.style.color=r.c;d.append(sp)});
     b.append(d)});fits.push(b)}
   el.append(b)});
  stage.replaceChildren(el);
  fits.forEach(b=>{let z=1,g=0;while(b.scrollHeight>b.clientHeight+2&&z>.35&&g++<14){z*=.92;b.style.setProperty('--z',z)}});
  num.textContent=(cur+1)+' / '+N;RD.pos=N>1?cur/(N-1):0;$('#rprog i').style.width=(N>1?cur/(N-1)*100:100)+'%';rdSave()};
 const go2=d=>{const n=Math.max(0,Math.min(N-1,cur+d));if(n!==cur){cur=n;draw()}};
 prev.onclick=()=>go2(-1);next.onclick=()=>go2(1);
 num.onclick=async()=>{const r=await dlg({title:'Go to slide',msg:'1 to '+N,value:String(cur+1),ok:'Go'});const v=r&&parseInt(r.v,10);if(v>=1&&v<=N){cur=v-1;draw()}};
 let ox=0,oy=0;
 stage.addEventListener('pointerdown',e=>{ox=e.clientX;oy=e.clientY});
 stage.addEventListener('pointerup',e=>{const dx=e.clientX-ox,dy=e.clientY-oy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)go2(dx<0?1:-1);else if(Math.abs(dx)<8&&Math.abs(dy)<8){const r=stage.getBoundingClientRect();go2(e.clientX>r.left+r.width/2?1:-1)}});
 let mode=0;ol.onclick=()=>{mode=1-mode;body.style.display=mode?'none':'';outline.style.display=mode?'':'none';ol.classList.toggle('on',!!mode);prev.disabled=next.disabled=!!mode};
 const key=e=>{if(!RD.on||RD.t!=='ppt')return;if(e.key==='ArrowRight'||e.key==='PageDown')go2(1);else if(e.key==='ArrowLeft'||e.key==='PageUp')go2(-1)};
 document.addEventListener('keydown',key);let rt=0;const rs=()=>{clearTimeout(rt);rt=setTimeout(()=>{if(RD.on&&RD.t==='ppt'&&!mode)draw()},150)};addEventListener('resize',rs);
 RD.cb=()=>{document.removeEventListener('keydown',key);removeEventListener('resize',rs)};
 B.replaceChildren(body,outline);$('#rs').textContent=N+' slides';
 draw();requestAnimationFrame(draw)};

/* PDF */
RV.pdf=async(s,B,my)=>{
 if(!(SAF&&SAF.pdfInfo)){ /* desktop preview: the browser's own PDF viewer */
  const u=await rdUrl(s);if(my!==RD.tok)return;
  const f=document.createElement('iframe');f.className='rframe';f.src=u;B.replaceChildren(f);return}
 const path=await rdPath(s);if(my!==RD.tok)return;
 const inf=await SAF.pdfInfo({path});if(my!==RD.tok)return;
 const N=inf.pages,sz=inf.sizes||[];if(!N)throw Error('This PDF has no pages.');
 const sc=h('div','rscroll pdf'),pgs=h('div','pgs'),pg=[];let gen=0;
 for(let n=0;n<N;n++){const w=sz[2*n]||sz[0]||612,hh=sz[2*n+1]||sz[1]||792,d=h('div','pp',null,h('span','pn',String(n+1)));
  d.dataset.n=n;d.style.aspectRatio=w+'/'+hh;pgs.append(d);pg.push(d)}
 sc.append(pgs);B.replaceChildren(sc);
 const render=async d=>{
  const n=+d.dataset.n;if(d._busy||d._g===gen)return;d._busy=1;const g=gen;
  try{const wpx=Math.min(2400,Math.round(sc.clientWidth*RD.zoom*Math.min(devicePixelRatio||1,2.5)));
   const r=await SAF.pdfPage({path,page:n,width:wpx});if(my!==RD.tok)return;
   let im=d.querySelector('img');if(!im){im=document.createElement('img');im.alt='Page '+(n+1);im.draggable=false;d.append(im)}
   im.src=fileUrl(r.path);d.style.aspectRatio=r.w+'/'+r.h;d._g=g;d.classList.add('ok');d.classList.remove('bad')}
  catch{d.classList.add('bad')}
  finally{d._busy=0;if(my===RD.tok&&d._g!==gen&&d.dataset.vis==='1'&&!d.classList.contains('bad'))render(d)}};
 const io=new IntersectionObserver(es=>es.forEach(e=>{e.target.dataset.vis=e.isIntersecting?'1':'0';if(e.isIntersecting)render(e.target)}),{root:sc,rootMargin:'900px 0px'});
 RD.io=io;pg.forEach(d=>io.observe(d));
 const cpage=()=>{const t=sc.scrollTop+sc.clientHeight/3;let c=0;for(let i=0;i<N;i++){if(pg[i].offsetTop<=t)c=i;else break}return c};
 const num=h('button','pgn','1 / '+N),zin=h('button','ib',null,ico('plus')),zout=h('button','ib',null,ico('min'));
 zin.setAttribute('aria-label','Zoom in');zout.setAttribute('aria-label','Zoom out');zin.onclick=()=>pdfZoom(1);zout.onclick=()=>pdfZoom(-1);
 $('#rf').replaceChildren(zout,num,zin,h('span','soi','Strategy Over Impulse'));
 num.onclick=async()=>{const r=await dlg({title:'Go to page',msg:'1 to '+N,value:String(cpage()+1),ok:'Go'});const v=r&&parseInt(r.v,10);if(v>=1&&v<=N)sc.scrollTop=pg[v-1].offsetTop};
 let sw=0;
 rdScroll(sc,()=>{const c=cpage();num.textContent=(c+1)+' / '+N;
  clearTimeout(sw);sw=setTimeout(()=>pg.forEach((d,i)=>{if(Math.abs(i-c)>10&&d._g!=null&&d.querySelector('img')){d.querySelector('img').remove();d._g=null;d.classList.remove('ok')}}),700)});
 const applyZ=z=>{const p=sc.scrollTop/Math.max(1,sc.scrollHeight);RD.zoom=z;pgs.style.setProperty('--z',z);gen++;
  requestAnimationFrame(()=>{sc.scrollTop=p*sc.scrollHeight;pg.forEach(x=>{io.unobserve(x);io.observe(x)})});toast('Zoom '+Math.round(z*100)+'%')};
 RD.zoomFn=d=>{const Z=[.5,.75,1,1.5,2,3];let i=0;Z.forEach((v,k)=>{if(Math.abs(v-RD.zoom)<Math.abs(Z[i]-RD.zoom))i=k});
  const j=Math.max(0,Math.min(Z.length-1,i+d));if(Z[j]!==RD.zoom)applyZ(Z[j])};
 RD.fitFn=m=>{if(m==='w')return applyZ(1);const w0=sz[0]||612,h0=sz[1]||792,avW=sc.clientWidth-20,avH=sc.clientHeight-20;
  applyZ(Math.max(.3,Math.min(1,(avH/(avW*h0/w0)))))};
 if((S.settings.rfit||'')==='p')requestAnimationFrame(()=>RD.fitFn('p'));
 $('#rs').textContent=N+(N===1?' page':' pages')};
const pdfZoom=d=>{if(RD.zoomFn)RD.zoomFn(d)};

/* [7] BUTTONS */
$('#rcl').onclick=()=>rdClose();
$('#rfd').onclick=()=>sizeBump(-1);$('#rfu').onclick=()=>sizeBump(1);
$('#rth').onclick=()=>{const s=S.settings,i=RTH.indexOf(s.rth);s.rth=RTH[(i+1)%RTH.length];save();rdApply();toast(RTN[s.rth]+' theme')};
$('#rmo').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),s=RD.src,L=[];if(!s)return;
 if(RD.t==='md'||RD.t==='docx'||RD.t==='txt')L.push(['Font: '+((S.settings.rfont||'serif')==='serif'?'serif → sans':'sans → serif'),()=>{S.settings.rfont=(S.settings.rfont||'serif')==='serif'?'sans':'serif';save();rdApply()}]);
 if(RD.t==='csv')L.push(['View as plain text',()=>{RD.t='txt';readerOpen(RD.src)}]);
 if(RD.t==='html')L.push([RD.html&&RD.html.src?'View rendered page':'View source',()=>{RD.html.src=!RD.html.src;rdHtml()}]);
 if((RD.t==='md'||RD.t==='txt'||RD.t==='html')&&!s.vault)L.push(['Edit',()=>edOpen(s)]);
 if(RD.t==='pdf'&&RD.fitFn)L.push(['Fit to width',()=>RD.fitFn('w')],['Fit whole page',()=>RD.fitFn('p')]);
 if(s.uri&&SAF&&!s.vault)L.push(['Open with…',()=>opOpenWith(s,true)]);
 L.push(['Theme: '+RTN[S.settings.rth||'night'],()=>$('#rth').click()],['Details',()=>toast(s.name+' · '+fmt(s.size||0)+(s.vault?' · in the vault':''))]);
 menu(Math.max(8,r.right-230),r.bottom,L)};
