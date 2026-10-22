/* editor.js: text and Markdown editor. Opens from the reader menu (Edit) and when a text file is long-pressed > Edit.
   Native undo/redo (execCommand keeps the browser history), find and replace, Markdown tools with live preview, word wrap, font size, safe save.
   V0.19.2: split-pane live preview (editor left / rendered right), export to HTML file, open-with pipe for PDF/DOCX.
   All text goes in through .value / textContent, never innerHTML. */
const ED={on:false,src:null,t0:'',md:false,prev:false,split:false,wrap:true,fs:15};
const edT=()=>$('#etx');
const edDirty=()=>ED.on&&edT().value!==ED.t0;
function edStat(){
 const t=edT(),v=t.value,p=t.selectionStart,b=v.slice(0,p).split('\n');
 $('#efs').textContent='Ln '+b.length+', Col '+(b[b.length-1].length+1)+'  ·  '+wc(v)+' words  ·  '+v.length+' chars';
 $('#ett').classList.toggle('dirty',edDirty());$('#esv').disabled=!edDirty()}
function edPrev(){if(!ED.prev)return;$('#epv').replaceChildren(mdRender(edT().value))}
function edIns(a,b,ph){ /* wrap the selection (or a placeholder) with a and b; native undo still works */
 const t=edT();t.focus();const s=t.selectionStart,e=t.selectionEnd,sel=t.value.slice(s,e)||ph||'';
 document.execCommand('insertText',false,a+sel+b);
 t.setSelectionRange(s+a.length,s+a.length+sel.length);edStat();edPrev()}
function edLine(pre){ /* prefix every selected line */
 const t=edT();t.focus();const v=t.value;let s=v.lastIndexOf('\n',t.selectionStart-1)+1,e=v.indexOf('\n',t.selectionEnd);if(e<0)e=v.length;
 t.setSelectionRange(s,e);document.execCommand('insertText',false,v.slice(s,e).split('\n').map(l=>pre+l).join('\n'));edStat();edPrev()}
async function edOpen(src){
 let t='';try{t=tdec(new Uint8Array(await rdBytes(src)))}catch(e){return toast(e.message||'Could not open this file')}
 if(src.vault)return toast('Vault files are read-only here. Export the file first to edit it.');
 if(t.length>1500000)return toast('This file is too large to edit here (over 1.5 MB). Use Open with.');
 ED.on=true;ED.src=src;ED.t0=t;ED.md=/\.(md|markdown)$/i.test(src.name);ED.prev=false;ED.split=false;
 const E=$('#ed');E.className='on'+(ED.md?' md':'');E.dataset.rt=$('#rd').dataset.rt||'night';
 $('#ett').textContent=src.name;edT().value=t;edT().scrollTop=0;edT().setSelectionRange(0,0);
 edApplySplit();edWrap();edSize(0);$('#epv').replaceChildren();$('#efind').classList.remove('on');document.body.classList.add('edon');edStat()}

/* V0.19.2 ── split-pane live preview ─────────────────────────────────────── */
function edApplySplit(){
 const E=$('#ed');
 E.classList.toggle('split',!!(ED.split&&ED.md));
 if(ED.split&&ED.md){$('#epv').replaceChildren(mdRender(edT().value))}
 else{$('#epv').replaceChildren()}}

/* Export the current markdown as a standalone HTML file and trigger Save-As via SAF picker or download */
async function edExportHtml(){
 if(!ED.md)return toast('Only Markdown files can be exported as HTML.');
 const body=document.createElement('div');body.className='rdoc';body.append(mdRender(edT().value));
 const css=`body{margin:0;padding:1rem 1.5rem;font-family:system-ui,sans-serif;line-height:1.6;max-width:780px;margin-inline:auto}
  h1,h2,h3{margin-top:1.5em}code{background:#f4f4f4;padding:.1em .35em;border-radius:4px}
  pre{background:#f4f4f4;padding:1em;overflow-x:auto;border-radius:6px}
  blockquote{border-left:3px solid #999;margin-left:0;padding-left:1em;color:#555}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.4em .7em}`;
 const html='<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>'+ED.src.name.replace(/\.md$/i,'')+'</title>\n<style>'+css+'</style></head>\n<body>'+body.innerHTML+'</body></html>';
 const name=ED.src.name.replace(/\.(md|markdown)$/i,'.html');
 /* Try SAF save picker first (Android), fall back to <a download> */
 if(SAF&&SAF.saveText){try{await SAF.saveText({name,text:html});toast('Saved '+name);return}catch{}}
 const a=document.createElement('a'),u=URL.createObjectURL(new Blob([html],{type:'text/html'}));
 a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);
 toast('Downloaded '+name);}

/* Open-with pipe: share the current document to another app (PDF viewer, Word, etc.)
   Works by writing a temp file and firing ACTION_VIEW via SAF.openWith */
async function edShareAs(fmt){
 const text=edT().value,name=ED.src.name;
 if(fmt==='html'){await edExportHtml();return;}
 /* For PDF/DOCX we use the native openWith path — the user picks a compatible app */
 if(fmt==='openWith'&&SAF&&SAF.openWith&&ED.src.uri){
  try{await SAF.openWith({uri:ED.src.uri,mime:mimeOf?mimeOf(name):'text/plain',edit:false});return}catch(e){toast(e.message||'Could not open with another app.');}
 }
 toast('Save this file first, then use Open with from the file browser.');}
function edWrap(){edT().style.whiteSpace=ED.wrap?'pre-wrap':'pre';edT().wrap=ED.wrap?'soft':'off'}
function edSize(d){ED.fs=Math.max(11,Math.min(26,ED.fs+d));edT().style.fontSize=ED.fs+'px';$('#epv').style.fontSize=(ED.fs+2)+'px'}
async function edSave(quiet){
 const s=ED.src,text=edT().value;
 try{
  if(s.uri&&SAF&&SAF.writeUri)await SAF.writeUri({uri:s.uri,text});
  else if(s.fh&&s.fh.createWritable){const w=await s.fh.createWritable();await w.write(text);await w.close()}
  else{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.href=u;a.download=s.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),4000)}
 }catch(e){toast('Could not save: '+(e.message||e));return false}
 ED.t0=text;s.size=new Blob([text]).size;edStat();if(!quiet)toast('Saved');return true}
async function edClose(force){
 if(!ED.on)return;
 if(!force&&edDirty()){
  const r=await dlg({title:'Unsaved changes',msg:'Save before closing?',ok:'Save',opts:[['s','Save'],['d','Discard']],val:'s'});
  if(!r)return;if(r.o==='s'&&!(await edSave(true)))return}
 ED.on=false;$('#ed').className='';document.body.classList.remove('edon');edT().blur();
 if(RD.on&&RD.src===ED.src)readerOpen(RD.src)}
function edFind(dir,all){
 const t=edT(),q=$('#efq').value;if(!q)return;const v=t.value,lo=v.toLowerCase(),ql=q.toLowerCase();
 if(all){const r=$('#efr').value,n=lo.split(ql).length-1;if(!n)return toast('Not found');
  t.focus();t.select();document.execCommand('insertText',false,v.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),()=>r));toast(n+' replaced');edStat();edPrev();return}
 let i=dir<0?lo.lastIndexOf(ql,t.selectionStart-1):lo.indexOf(ql,t.selectionEnd);
 if(i<0)i=dir<0?lo.lastIndexOf(ql):lo.indexOf(ql);if(i<0)return toast('Not found');
 t.focus();t.setSelectionRange(i,i+q.length);
 const ln=v.slice(0,i).split('\n').length;t.scrollTop=Math.max(0,(ln-4)*ED.fs*1.55)}
function edReplace(){const t=edT(),q=$('#efq').value;if(!q)return;
 if(t.value.slice(t.selectionStart,t.selectionEnd).toLowerCase()===q.toLowerCase()){t.focus();document.execCommand('insertText',false,$('#efr').value);edStat();edPrev()}
 edFind(1)}
function edTabBtn(id,f){$(id).onclick=f}
$('#ecl').onclick=()=>edClose();
$('#esv').onclick=()=>edSave();
$('#eun').onclick=()=>{edT().focus();document.execCommand('undo');edStat();edPrev()};
$('#ere').onclick=()=>{edT().focus();document.execCommand('redo');edStat();edPrev()};
$('#efd').onclick=()=>$('#efind').classList.toggle('on')||0;
$('#epb').onclick=()=>{ED.prev=!ED.prev;ED.split=false;$('#ed').classList.toggle('prev',ED.prev);$('#ed').classList.remove('split');$('#epb').classList.toggle('on',ED.prev);edPrev()};
/* V0.19.2: split-pane live preview button */
$('#espb').onclick=()=>{ED.split=!ED.split;if(ED.split)ED.prev=false;$('#ed').classList.remove('prev');$('#epb').classList.remove('on');$('#espb').classList.toggle('on',ED.split);edApplySplit()};
$('#emo').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();
 const items=[['Word wrap: '+(ED.wrap?'On → Off':'Off → On'),()=>{ED.wrap=!ED.wrap;edWrap()}],['Text size +',()=>edSize(1)],['Text size −',()=>edSize(-1)],
  ['Save a copy…',async()=>{const r=await dlg({title:'Save a copy',value:ED.src.name,ok:'Download',sel:true});if(!r)return;
    const a=document.createElement('a'),u=URL.createObjectURL(new Blob([edT().value],{type:'text/plain'}));a.href=u;a.download=r.v||ED.src.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),4000)}]];
 /* V0.19.2: export & share options in More menu */
 if(ED.md)items.push(['Export as HTML…',()=>edExportHtml()]);
 if(ED.src&&ED.src.uri)items.push(['Open with another app…',()=>edShareAs('openWith')]);
 menu(Math.max(8,r.right-220),r.bottom,items)};
$('#efn').onclick=()=>edFind(1);$('#efp').onclick=()=>edFind(-1);$('#efrep').onclick=edReplace;$('#efall').onclick=()=>edFind(1,true);
$('#efq').onkeydown=e=>{if(e.key==='Enter')edFind(1)};
edT().addEventListener('input',()=>{edStat();clearTimeout(ED.pt);ED.pt=setTimeout(()=>{edPrev();if(ED.split&&ED.md)$('#epv').replaceChildren(mdRender(edT().value));},250)});
['keyup','click','select'].forEach(ev=>edT().addEventListener(ev,edStat));
edT().addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();edSave()}
 if(e.key==='Tab'){e.preventDefault();document.execCommand('insertText',false,'  ')}});
$('#emd').querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=b.dataset.k;
 ({b:()=>edIns('**','**','bold'),i:()=>edIns('*','*','italic'),h:()=>edLine('## '),c:()=>edIns('`','`','code'),l:()=>edLine('- '),q:()=>edLine('> '),k:()=>edIns('[',']( https://)','link text'),t:()=>edLine('- [ ] ')})[k]()});
