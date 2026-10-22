/* bigdirs.js (V0.28.2): Tools > Largest folders. One level at a time: every sub-folder with its full size, biggest first,
   with a bar. Tap a folder to look inside it, Back goes up (answers are kept, so Back is instant). Measuring is native
   (Tools.folderSizes, real paths, needs All files access) and runs behind the busy overlay with Cancel. */
const BIGD={stack:[],cache:{}};
const bdPct=(a,b)=>b>0?(a/b*100>=1?Math.round(a/b*100)+'%':'<1%'):'0%';

async function tBigDirs(){
 if(!TOOLS||typeof TOOLS.folderSizes!=='function')return toast('Largest folders runs in the Android app.');
 if(!await needFiles())return;
 let v=[];try{v=(await TOOLS.storageInfo()).volumes||[]}catch{}
 if(!v.length)return toast('Conduint could not find a storage to measure.');
 BIGD.stack=[];BIGD.cache={};
 if(v.length===1)return bdOpen(v[0].path,v[0].primary?'Internal storage':'Storage');
 TV.view='bigvols';const B=$('#tbody');B.replaceChildren();head('Largest folders',true);
 B.append(h('small','vpfoot','Pick the storage to measure.'));
 v.forEach(x=>{const r=h('div','mtr bdrow',null,h('div','ml',null,h('b',null,x.primary?'Internal storage':'SD card or USB'),h('small',null,fmt(x.total-x.free)+' used of '+fmt(x.total))));
  r.onclick=()=>bdOpen(x.path,x.primary?'Internal storage':'SD card or USB');B.append(r)})}

async function bdOpen(path,name,again){
 let r=again?null:BIGD.cache[path];
 if(!r){r=await scanJob('Measuring '+name+'…',()=>TOOLS.folderSizes({path}));if(!r||r===true)return;BIGD.cache[path]=r}
 if(again&&BIGD.stack.length&&BIGD.stack[BIGD.stack.length-1].path===path)BIGD.stack.pop();
 BIGD.stack.push({path,name});drawBigDirs()}

function drawBigDirs(){
 TV.view='bigdirs';const B=$('#tbody');B.replaceChildren();head('Largest folders',true);
 const cur=BIGD.stack[BIGD.stack.length-1],r=BIGD.cache[cur.path];if(!r){tBigDirs();return}
 const items=r.items||[],max=Math.max(1,r.looseSize||0,...items.map(x=>x.size));
 B.append(h('div','dc shcard',null,h('b',null,BIGD.stack.map(x=>x.name).join(' / ')),
  h('small',null,fmt(r.total)+' in '+plural(r.totalCount,'file')+' · '+plural(items.length,'folder')+' here')));
 const bar=(w,lab,sub,right,click)=>{const f=h('i');f.style.width=Math.max(2,Math.round(w/max*100))+'%';
  const row=h('div','mtr'+(click?' bdrow':''),null,h('div','ml',null,h('b',null,lab),h('small',null,sub+(right?' · '+right:''))),h('div','bar',null,f));
  if(click)row.onclick=click;return row};
 if(!items.length&&!r.looseCount)B.append(h('div','empty','This folder is empty.'));
 items.forEach(x=>B.append(bar(x.size,x.name,fmt(x.size)+' · '+plural(x.count,'file'),bdPct(x.size,r.total)+' of this folder',x.size>0||x.count>0?()=>bdOpen(x.path,x.name):null)));
 if(r.looseCount)B.append(bar(r.looseSize,'Files directly in this folder',fmt(r.looseSize)+' · '+plural(r.looseCount,'file'),bdPct(r.looseSize,r.total)+' of this folder',null));
 const row=h('div','shrow'),again=h('button','chip','Measure again');again.onclick=()=>bdOpen(cur.path,cur.name,true);row.append(again);
 B.append(row,h('small','vpfoot','Sizes include hidden files. Android hides other apps\' data under Android/data, so those folders can show as empty.'))}
