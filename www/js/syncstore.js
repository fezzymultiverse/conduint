/* syncstore.js: Sync Storage (V0.26.2). Two-way sync between two folders you pick (any storage: phone, OneDrive, Termux...).
   Rules: never deletes anything. A file only on one side is copied to the other. A file changed on one side overwrites the other.
   Changed on BOTH sides: the newer one wins and the older one is kept next to it as "name (older copy).ext". Files over 32 MB are skipped.
   Remembers what each file looked like at the last sync (S.syncs[].st), so a copy is never mistaken for a new change. */
const SSKIP=/^\.(git|trash)$/i,SBAD=/\.(tmp|part|crdownload)$/i;
async function ssWalk(root,out,rel,depth){
 if(depth>12||out.n>8000)return;
 const r=await SAF.list({uri:root});
 for(const i of r.items){
  if(SSKIP.test(i.name)||SBAD.test(i.name))continue;
  const p=rel?rel+'/'+i.name:i.name;
  if(i.dir)await ssWalk(i.uri,out,p,depth+1);
  else{out.n++;out.m.set(p,{uri:i.uri,size:i.size||0,mtime:i.mtime||0,parent:root})}}}
async function ssDir(root,dir,cache){
 if(!dir)return root;let cur=root,acc='';
 for(const n of dir.split('/')){acc=acc?acc+'/'+n:n;
  if(cache[acc]){cur=cache[acc];continue}
  const r=await SAF.ensureDir({parent:cur,name:n});cache[acc]=r.uri;cur=r.uri}
 return cur}
async function ssPut(src,dstRoot,cache,rel){
 const parent=await ssDir(dstRoot,rel.includes('/')?rel.slice(0,rel.lastIndexOf('/')):'',cache);
 const r=await SAF.copy({items:[{uri:src.uri}],parent});return r.uris[0]}
async function ssMark(st,rel,au,bu){
 const [a,b]=await Promise.all([SAF.stat({uri:au}),SAF.stat({uri:bu})]);
 st[rel]={am:a.mtime||0,as:a.size||0,bm:b.mtime||0,bs:b.size||0}}
const ssCh=(x,m,z)=>x.size!==z||(x.mtime&&m&&x.mtime!==m);
const ssBig=x=>x.size>32*1024*1024;
async function ssRun(p){
 const A={m:new Map(),n:0},B={m:new Map(),n:0};
 await ssWalk(p.a.uri,A,'',0);await ssWalk(p.b.uri,B,'',0);
 const st=p.st||(p.st={}),ca={},cb={},sum={toB:0,toA:0,conf:0,err:0};
 for(const rel of new Set([...A.m.keys(),...B.m.keys()])){
  const a=A.m.get(rel),b=B.m.get(rel),s=st[rel];
  try{
   if((a&&ssBig(a))||(b&&ssBig(b))){sum.err++;continue}
   if(a&&!b){await ssMark(st,rel,a.uri,await ssPut(a,p.b.uri,cb,rel));sum.toB++}
   else if(b&&!a){await ssMark(st,rel,await ssPut(b,p.a.uri,ca,rel),b.uri);sum.toA++}
   else if(!s&&a.size===b.size){await ssMark(st,rel,a.uri,b.uri)}
   else{
    const ac=!s||ssCh(a,s.am,s.as),bc=!s||ssCh(b,s.bm,s.bs);
    if(ac&&!bc){await SAF.copyOver({from:a.uri,to:b.uri});await ssMark(st,rel,a.uri,b.uri);sum.toB++}
    else if(bc&&!ac){await SAF.copyOver({from:b.uri,to:a.uri});await ssMark(st,rel,a.uri,b.uri);sum.toA++}
    else if(ac&&bc){
     const aw=a.mtime>=b.mtime,w=aw?a:b,l=aw?b:a,nm=rel.slice(rel.lastIndexOf('/')+1),dot=nm.lastIndexOf('.'),
      old=dot>0?nm.slice(0,dot)+' (older copy)'+nm.slice(dot):nm+' (older copy)';
     const k=await SAF.mkfile({parent:l.parent,name:old});
     await SAF.copyOver({from:l.uri,to:k.uri});
     await SAF.copyOver({from:w.uri,to:l.uri});
     await ssMark(st,rel,a.uri,b.uri);sum.conf++;aw?sum.toB++:sum.toA++}}
  }catch(e){sum.err++}}
 p.last=Date.now();save();return sum}
const ssTxt=m=>m.toB+m.toA+m.conf===0&&!m.err?'Already in sync.':'Sync done. To '+'second: '+m.toB+', to first: '+m.toA+(m.conf?', kept '+m.conf+' older copies':'')+(m.err?', '+m.err+' skipped (too big or not readable)':'')+'.';
async function ssPick(label){
 const opts=[...S.mounts.filter(m=>m.type==='saf'&&m.root).map(m=>['m'+m.id,m.name]),...(S.dash&&S.dash.fm||[]).filter(m=>m.root).map(m=>['m'+m.id,m.name]),['new','A different folder…']];
 const r=await dlg({title:label,msg:'Pick a connected folder or choose another.',opts,val:opts[0][0],ok:'Next'});if(!r)return null;
 if(r.o==='new'){try{const x=await SAF.pickTree({volume:'',start:''});return{uri:x.root,name:x.name}}catch(e){if(e.code!=='CANCELLED')toast(e.message);return null}}
 const m=[...S.mounts,...(S.dash&&S.dash.fm||[])].find(x=>'m'+x.id===r.o);return m?{uri:m.root,name:m.name}:null}
async function syncStorage(){
 if(!NATIVE)return toast('Sync Storage runs in the Android app.');
 const L=S.syncs||(S.syncs=[]);
 const opts=[['add','Add a sync…'],...(L.length?[['all','Sync all now']]:[]),...L.map((p,i)=>['go'+i,'Sync now: '+p.name]),...L.map((p,i)=>['rm'+i,'Remove: '+p.name])];
 const r=await dlg({title:'Sync Storage',msg:L.length?'Two-way. Nothing is ever deleted. If both sides changed a file, the newer wins and the older is kept beside it as "(older copy)".':'Keep two folders the same, both ways. Example: your Obsidian vault on the phone and in OneDrive. Nothing is ever deleted.',opts,val:opts[0][0],ok:'OK'});
 if(!r)return;
 if(r.o==='add'){
  const a=await ssPick('First folder');if(!a)return;const b=await ssPick('Second folder');if(!b)return;
  if(a.uri===b.uri)return toast('Pick two different folders.');
  const p={id:'y'+Date.now(),name:a.name+' ⇄ '+b.name,a,b,st:{},last:0};L.push(p);save();
  const m=await job('Syncing…',()=>ssRun(p));if(m&&m!==true)toast(ssTxt(m));return}
 if(r.o==='all'){for(const p of L){const m=await job('Syncing '+p.name+'…',()=>ssRun(p));if(m&&m!==true)toast(p.name+': '+ssTxt(m))}return}
 if(/^go\d+$/.test(r.o)){const p=L[+r.o.slice(2)];const m=await job('Syncing…',()=>ssRun(p));if(m&&m!==true)toast(ssTxt(m));return}
 if(/^rm\d+$/.test(r.o)){L.splice(+r.o.slice(2),1);save();toast('Removed. Your files were not touched.')}}
