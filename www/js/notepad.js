/* notepad.js (V0.47.0): Notepad inside Tools. Notes stay on this phone (localStorage 'conduint.notes.v1'), nothing is uploaded.
   List: search, colour filter, pinned first, recycle bin (30 days), backup (JSON or TXT) and restore.
   Editor: title, autosave, own undo / redo, checklist lines (Enter continues a list), word / character count, copy, share, colour, pin.
   Loaded after tools.js helpers; tools.js calls tNotes() and npBack(), arrange.js calls npCount(). */
const NPK='conduint.notes.v1',NPC=['','#00e5ff','#5fff00','#ffd400','#ff9100','#ff005f','#af5fff'],NPBIN=30*864e5;
const NP={notes:[],q:'',tag:-1,bin:false,id:null,hist:[],hi:0,ht:0,st:0,loaded:false};
function npLoad(){
 if(NP.loaded)return;NP.loaded=true;
 try{const o=JSON.parse(localStorage.getItem(NPK)||'null');NP.notes=o&&Array.isArray(o.notes)?o.notes.filter(n=>n&&typeof n.id==='string'):[]}catch{NP.notes=[]}
 const now=Date.now();NP.notes=NP.notes.filter(n=>!(n.d&&now-n.d>NPBIN))}
function npWrite(){try{localStorage.setItem(NPK,JSON.stringify({v:1,notes:NP.notes}));return true}catch{toast('Could not save notes. Storage is full or blocked.');return false}}
const npLive=()=>{npLoad();return NP.notes.filter(n=>!n.d)};
function npCount(){const n=npLive().length;return n?n+(n===1?' note':' notes'):'Notes, checklists'}
const npGet=id=>NP.notes.find(n=>n.id===id);
const npNew=()=>({id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),t:'',b:'',c:0,p:0,at:Date.now(),ut:Date.now(),d:0});
const npName=n=>(n.t||'').trim()||((n.b||'').split('\n').find(l=>l.trim())||'').replace(/^[☐☑]\s?/,'').trim().slice(0,60)||'Untitled';
const npWhen=t=>{const d=new Date(t),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:d.getFullYear()===n.getFullYear()?undefined:'numeric'})};
const npStat=b=>{const w=(b.trim().match(/\S+/g)||[]).length;return w+(w===1?' word':' words')+' · '+b.length+' characters'};

/* ---------- list ---------- */
async function tNotes(){npLoad();TV.view='np';NP.id=null;npList()}
function npList(){
 const B=$('#tbody');B.replaceChildren();head(NP.bin?'Notepad bin':'Notepad',true);TV.view='np';
 const all=NP.bin?NP.notes.filter(n=>n.d):npLive(),q=NP.q.trim().toLowerCase();
 let L=all.filter(n=>(NP.bin||NP.tag<0||n.c===NP.tag)&&(!q||(n.t+'\n'+n.b).toLowerCase().includes(q)));
 L.sort((a,b)=>NP.bin?b.d-a.d:(b.p-a.p)||(b.ut-a.ut));
 const si=h('input','npq');si.type='search';si.placeholder='Search notes';si.value=NP.q;si.setAttribute('aria-label','Search notes');
 si.oninput=()=>{NP.q=si.value;const p=si.selectionStart;npList();const x=$('#tbody .npq');if(x){x.focus();try{x.setSelectionRange(p,p)}catch{}}};B.append(si);
 const r=h('div','npr');
 if(!NP.bin){
  const nw=h('button','chip on','+ New note');nw.onclick=()=>{const n=npNew();NP.notes.push(n);npEdit(n.id)};r.append(nw);
  const ca=h('button','chip'+(NP.tag<0?' on':''),'All');ca.onclick=()=>{NP.tag=-1;npList()};r.append(ca);
  for(let i=1;i<NPC.length;i++){const d=h('button','npd'+(NP.tag===i?' on':''));d.style.background=NPC[i];d.setAttribute('aria-label','Colour '+i);d.onclick=()=>{NP.tag=NP.tag===i?-1:i;npList()};r.append(d)}}
 else{const eb=h('button','chip danger','Empty bin');eb.onclick=async()=>{if(!all.length)return;if(!await dlg({title:'Empty the bin?',msg:all.length+' note(s) will be deleted for good.',ok:'Delete',danger:true}))return;NP.notes=NP.notes.filter(n=>!n.d);npWrite();npList()};r.append(eb)}
 B.append(r);
 if(!L.length)B.append(h('div','empty',q?'No note matches that.':NP.bin?'The bin is empty.':'No notes yet. Tap New note.'));
 L.forEach(n=>{
  const row=h('div','npn'),bar=h('div','bar');bar.style.background=NPC[n.c]||'var(--acc)';
  const body=h('div','bd',null,h('b',null,npName(n)),h('small',null,(n.b||'').replace(/\s+/g,' ').trim().slice(0,90)||'Empty note'),h('small','dt',npWhen(n.ut)));
  row.append(bar,body);
  if(NP.bin){
   const rs=h('button','chip','Restore');rs.onclick=e=>{e.stopPropagation();n.d=0;n.ut=Date.now();npWrite();npList()};
   const df=h('button','chip danger','Delete');df.onclick=e=>{e.stopPropagation();NP.notes=NP.notes.filter(x=>x!==n);npWrite();npList()};
   row.append(rs,df);row.style.cursor='default'}
  else{const pb=h('button','pb',n.p?'★':'☆');pb.setAttribute('aria-label',n.p?'Unpin':'Pin');pb.onclick=e=>{e.stopPropagation();n.p=n.p?0:1;npWrite();npList()};row.append(pb);row.onclick=()=>npEdit(n.id)}
  B.append(row)});
 const f=h('div','npr');
 const bn=h('button','chip',NP.bin?'Back to notes':'Bin ('+NP.notes.filter(n=>n.d).length+')');bn.onclick=()=>{NP.bin=!NP.bin;npList()};f.append(bn);
 if(!NP.bin){
  const bj=h('button','chip','Backup');bj.onclick=npBackup;const bt=h('button','chip','Export .txt');bt.onclick=npExportTxt;
  const bi=h('button','chip','Restore');bi.onclick=npRestore;f.append(bj,bt,bi)}
 B.append(f,h('div','note',npLive().length+' notes saved on this phone only. Back them up before you clear app data or uninstall.'))}

/* ---------- editor ---------- */
function npEdit(id){
 const n=npGet(id);if(!n)return npList();
 NP.id=id;TV.view='npe';NP.hist=[n.b];NP.hi=0;
 const B=$('#tbody');B.replaceChildren();head('Note',true);TV.view='npe';
 const ti=h('input','npt');ti.placeholder='Title';ti.value=n.t;ti.maxLength=120;ti.setAttribute('aria-label','Title');
 const ta=h('textarea','npa');ta.placeholder='Write here…';ta.value=n.b;ta.setAttribute('aria-label','Note');ta.spellcheck=true;
 const st=h('div','nps',null,h('span',null,npStat(n.b)),h('span',null,'Saved '+npWhen(n.ut)));
 const stamp=()=>{st.firstChild.textContent=npStat(ta.value);st.lastChild.textContent='Saved '+npWhen(n.ut)};
 const commit=()=>{n.t=ti.value;n.b=ta.value;n.ut=Date.now();if(npWrite())stamp()};
 const later=()=>{clearTimeout(NP.st);NP.st=setTimeout(commit,350)};
 const snap=()=>{clearTimeout(NP.ht);NP.ht=setTimeout(()=>{if(NP.hist[NP.hi]===ta.value)return;NP.hist=NP.hist.slice(0,NP.hi+1);NP.hist.push(ta.value);if(NP.hist.length>150)NP.hist.shift();NP.hi=NP.hist.length-1},500)};
 const flushSnap=()=>{clearTimeout(NP.ht);if(NP.hist[NP.hi]!==ta.value){NP.hist=NP.hist.slice(0,NP.hi+1);NP.hist.push(ta.value);NP.hi=NP.hist.length-1}};
 ti.oninput=later;ta.oninput=()=>{later();snap();stamp()};
 NP.flush=()=>{clearTimeout(NP.st);clearTimeout(NP.ht);if(n.d)return;commit()};
 const apply=v=>{ta.value=v;later();stamp()};
 const lines=()=>{const v=ta.value,a=v.lastIndexOf('\n',ta.selectionStart-1)+1;let b=v.indexOf('\n',Math.max(ta.selectionEnd,ta.selectionStart));if(b<0)b=v.length;return{v,a,b}};
 const mapLines=f=>{flushSnap();const{v,a,b}=lines(),mid=v.slice(a,b).split('\n').map(f).join('\n'),nv=v.slice(0,a)+mid+v.slice(b);apply(nv);ta.setSelectionRange(a,a+mid.length);flushSnap();ta.focus()};
 const un=()=>{flushSnap();if(NP.hi>0){NP.hi--;apply(NP.hist[NP.hi])}else toast('Nothing to undo')};
 const re=()=>{flushSnap();if(NP.hi<NP.hist.length-1){NP.hi++;apply(NP.hist[NP.hi])}else toast('Nothing to redo')};
 const tb=h('div','npr');
 const btn=(t,f,l)=>{const b=h('button','chip',t);if(l)b.setAttribute('aria-label',l);b.onmousedown=e=>e.preventDefault();b.onclick=f;tb.append(b);return b};
 btn('↶',un,'Undo');btn('↷',re,'Redo');
 btn('☐ List',()=>mapLines(l=>/^[☐☑] /.test(l)?l.slice(2):'☐ '+l),'Checklist');
 btn('☑ Tick',()=>mapLines(l=>/^☐ /.test(l)?'☑ '+l.slice(2):/^☑ /.test(l)?'☐ '+l.slice(2):l),'Tick item');
 const pn=btn(n.p?'★ Pinned':'☆ Pin',()=>{n.p=n.p?0:1;pn.textContent=n.p?'★ Pinned':'☆ Pin';later()});
 const cr=h('div','npr');for(let i=0;i<NPC.length;i++){const d=h('button','npd'+(n.c===i?' on':''));d.style.background=NPC[i]||'transparent';d.setAttribute('aria-label',i?'Colour '+i:'No colour');d.onclick=()=>{n.c=i;[...cr.children].forEach((x,j)=>x.classList.toggle('on',j===i));later()};cr.append(d)}
 const ac=h('div','npr');
 const ab=(t,f,c)=>{const b=h('button','chip'+(c?' '+c:''),t);b.onclick=f;ac.append(b)};
 ab('Copy',async()=>{try{await navigator.clipboard.writeText((ti.value?ti.value+'\n\n':'')+ta.value);toast('Copied')}catch{ta.select();toast('Select and copy')}});
 ab('Share',()=>npShare(ti.value||npName(n),ta.value));
 ab('Delete',()=>{clearTimeout(NP.st);n.t=ti.value;n.b=ta.value;n.d=Date.now();npWrite();toast('Moved to the bin');NP.flush=null;npList()},'danger');
 /* Enter inside a checklist line starts the next box; Enter on an empty box ends the list */
 ta.addEventListener('beforeinput',e=>{if(e.inputType!=='insertLineBreak'&&e.inputType!=='insertParagraph')return;
  if(ta.selectionStart!==ta.selectionEnd)return;const{v,a}=lines(),l=v.slice(a,ta.selectionStart);
  if(!/^[☐☑] /.test(l))return;e.preventDefault();flushSnap();
  if(l.length<=2){ta.setRangeText('',a,ta.selectionStart,'end');ta.setRangeText('\n',a,a,'end')}else ta.setRangeText('\n☐ ',ta.selectionStart,ta.selectionEnd,'end');
  later();snap();stamp()});
 B.append(ti,tb,ta,st,h('div','note','Colour'),cr,ac);
 if(!n.b&&!n.t)setTimeout(()=>ta.focus(),60)}
function npBack(){
 if(NP.flush){NP.flush();NP.flush=null}
 const n=npGet(NP.id);
 if(n&&!n.d&&!(n.t||'').trim()&&!(n.b||'').trim()){NP.notes=NP.notes.filter(x=>x!==n);npWrite()}/* an empty note is not kept */
 NP.id=null;npList()}

/* ---------- share, export, backup, restore ---------- */
function npDownload(name,text,mime){try{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type:mime}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);toast('Saved '+name)}catch{toast('Could not save the file.')}}
async function npShare(t,b){
 const text=b||'';if(!text&&!t)return toast('Nothing to share.');
 try{if(navigator.share){await navigator.share({title:t,text});return}}catch(e){if(e&&e.name==='AbortError')return}
 npDownload((t||'note').replace(/[^\w\- ]+/g,'').trim().slice(0,40)+'.txt',(t?t+'\n\n':'')+text,'text/plain')}
const npStampName=()=>{const d=new Date(),p=x=>String(x).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())};
function npBackup(){const L=npLive();if(!L.length)return toast('No notes to back up.');npDownload('conduint-notes-'+npStampName()+'.json',JSON.stringify({v:1,app:'conduint-notepad',notes:NP.notes},null,1),'application/json')}
function npExportTxt(){const L=npLive().sort((a,b)=>b.ut-a.ut);if(!L.length)return toast('No notes to export.');
 npDownload('conduint-notes-'+npStampName()+'.txt',L.map(n=>'=== '+npName(n)+' ===\n'+new Date(n.ut).toLocaleString()+'\n\n'+n.b).join('\n\n\n'),'text/plain')}
function npRestore(){
 const f=document.createElement('input');f.type='file';f.accept='.json,application/json';
 f.onchange=async()=>{const file=f.files&&f.files[0];if(!file)return;
  try{const o=JSON.parse(await file.text());if(!o||!Array.isArray(o.notes))throw 0;
   const ids=new Set(NP.notes.map(n=>n.id));let add=0,upd=0;
   o.notes.forEach(x=>{if(!x||typeof x.id!=='string')return;
    const n={id:x.id,t:String(x.t||''),b:String(x.b||''),c:Math.min(6,Math.max(0,+x.c||0)),p:x.p?1:0,at:+x.at||Date.now(),ut:+x.ut||Date.now(),d:+x.d||0};
    if(ids.has(n.id)){const cur=npGet(n.id);if(n.ut>cur.ut){Object.assign(cur,n);upd++}}else{NP.notes.push(n);ids.add(n.id);add++}});
   npWrite();npList();toast(add+' added, '+upd+' updated')}
  catch{toast('That is not a Conduint notes backup.')}};
 f.click()}
