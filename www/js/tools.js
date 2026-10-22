/* tools.js: permissions sheet and the Tools sheet (RAM, cache, junk, duplicates, empty folders, orphans, large files, APKs).
   The scanning is native (TOOLS plugin, real file paths, needs All files access). This file only draws results and
   asks before deleting. Deleting goes to the recycle bin first unless the bin is turned off. */
const onSheet=s=>$(s).classList.contains('on');
const short=p=>p.replace(/^\/storage\/emulated\/0\/?/,'').replace(/^\/storage\//,'');
const parentOf=p=>{const s=short(p),i=s.lastIndexOf('/');return i<0?'Internal storage':s.slice(0,i)};
const CATN={images:'Images',videos:'Videos',audio:'Audio',docs:'Documents',apks:'Installers (APK)',archives:'Archives',other:'Other'};
let PERM={},chain=false,tried=new Set(),lastAsk=0,permKey='';

/* ---------- [1] PERMISSIONS ---------- */
async function readPerm(){try{PERM=TOOLS?await TOOLS.permissions():{}}catch{PERM={}}return PERM}
async function askPerm(what){lastAsk=Date.now();try{await TOOLS.request({what})}catch(e){toast(e.message)}}
const PROWS=()=>[
 ['Photos and images','images','media','Show and clean your pictures.'],
 ['Videos','video','media','Show and play your videos.'],
 ['Music and audio','audio','media','Show and play your songs.'],
 ['All files access','allFiles','allFiles','Lets the tools scan every folder: duplicates, empty folders, junk, orphans. Android opens a settings page, switch Conduint Files on there.'],
 ['Document viewer','allFiles','allFiles','Lets Conduint find and open your PDF, Word, PowerPoint, text and HTML files wherever they are on the phone. It is the same Android switch as All files access: tap Allow, then switch Conduint Files on.'],
 ['Notifications','notifications','notifications','Tells you when a cleanup or a Shield scan finishes, and when Shield stops a file.'],
 ['Ignore battery optimiser','battery','battery','Stops Android from freezing Conduint in the background. Android asks you to confirm.']];
const missing=()=>['media','notifications','allFiles','battery'].filter(w=>!({media:PERM.media,notifications:PERM.notifications,allFiles:PERM.allFiles,battery:PERM.battery}[w]));
async function drawPerm(){
 await readPerm();const B=$('#pbody');B.replaceChildren();
 if(!TOOLS){B.append(h('div','empty','Permissions only exist in the Android app.'));return}
 PROWS().forEach(([t,k,w,d])=>{const ok=!!PERM[k],b=h('button','chip'+(ok?' on':''),ok?'Granted':'Allow');
  if(!ok)b.onclick=()=>askPerm(w);else b.disabled=true;
  B.append(h('div','row',null,h('div','pt',null,h('b',null,t),h('small',null,d)),b))});
 const all=missing().length===0;
 const a=h('button','chip'+(all?' on':''),all?'Everything is allowed':'Allow everything');
 if(all)a.disabled=true;else a.onclick=()=>{chain=true;tried=new Set();stepChain()};
 B.append(h('div','row',null,h('span',null,'One tap for all'),a));
 B.append(h('div','note',(PERM.sdk>=33?'Android 13+: photos, videos and music are three separate permissions, asked together.':'On this Android version photos, videos and music share one Files permission.')+
  ' You can also change them later in Android Settings.'));
 const s=h('button','chip','Open Android app settings');s.onclick=()=>TOOLS.openSettings({what:'app'});
 B.append(h('div','row',null,h('span',null,'Something stuck?'),s))}
async function stepChain(){
 if(!chain)return;await readPerm();
 const n=missing().find(w=>!tried.has(w));
 if(!n){chain=false;drawPerm();return missing().length?toast('Some permissions are still off. Use the buttons above.'):toast('All permissions allowed.')}
 tried.add(n);askPerm(n)}
function openPerm(){$('#perm').classList.add('on');drawPerm()}
/* the system dialogs and the settings page give no callback, so re-read when the app regains focus and every second */
async function refreshPerm(){
 if(!TOOLS||(!onSheet('#perm')&&!onSheet('#tools')&&!onSheet('#set')))return;
 const before=JSON.stringify(PERM);await readPerm();
 if(JSON.stringify(PERM)!==before){if(PERM.allFiles&&LIBC.doc===undefined)countLib();if(onSheet('#perm'))drawPerm();if(onSheet('#set'))drawSettings();if(onSheet('#tools')&&TV.view==='home')drawTools();if(onSheet('#tools')&&TV.view==='sh'&&typeof drawShield==='function')drawShield()}
 if(chain&&Date.now()-lastAsk>1600)stepChain()}
addEventListener('focus',refreshPerm);document.addEventListener('visibilitychange',()=>!document.hidden&&refreshPerm());setInterval(()=>{if(!document.hidden)refreshPerm()},2500);
$('#px').onclick=()=>{chain=false;$('#perm').classList.remove('on')};$('#perm').onclick=e=>{if(e.target.id==='perm')$('#px').click()};

/* ---------- [2] TOOLS SHEET ---------- */
const TV={view:'home',list:null};
const meter=(label,used,total,warn)=>{const f=h('i');f.style.width=Math.min(100,Math.round(used/Math.max(1,total)*100))+'%';
 return h('div','mtr'+(warn?' warn':''),null,h('div','ml',null,h('b',null,label),h('small',null,fmt(used)+' used of '+fmt(total))),h('div','bar',null,f))};
async function openTools(){document.body.classList.remove('nav');$('#tools').classList.add('on');TV.view='home';await drawTools()}
function closeTools(){$('#tools').classList.remove('on');if(typeof ZB!=='undefined'&&ZB.on){ZB.on=false;ZB.tok++}}
function toolsBack(){if(TV.view==='home')return closeTools();
 if(TV.view==='zb'&&typeof zbBack==='function')return zbBack();
 if(TV.view==='npe'&&typeof npBack==='function')return npBack();
 if(TV.view==='vpapps'){TV.view='vpn';return drawVpn()}
 if(TV.view==='vpfw'){TV.view='vpn';return drawVpn()}
 if(TV.view==='bigdirs'){BIGD.stack.pop();if(BIGD.stack.length)return drawBigDirs()}
 if(TV.view==='vpn'){clearInterval(VP.tm)}
 if(TV.view==='aua'||TV.view==='aug'||TV.view==='aud'||TV.view==='aup'||TV.view==='auk'){TV.view='au';return drawAu()}
 if(TV.view==='auai')return drawAuDetail()
 if(TV.view==='apd'||TV.view==='apc'){clearInterval(AU.tm);AU.apKey=null;return pfDraw()}
 if(TV.view==='apl'){clearInterval(AU.tm);AU.apBack=null}
 if(TV.view==='au'){clearInterval(AU.tm)}
 if(TV.view==='zlp'){$('#tbar').classList.remove('on');TV.view='zl';return drawZl()}
 if(TV.view==='zl'){$('#tbar').classList.remove('on')}
TV.view='home';drawTools()}
$('#tx').onclick=closeTools;$('#tback').onclick=toolsBack;$('#tools').onclick=e=>{if(e.target.id==='tools')closeTools()};
const head=(t,back)=>{$('#tt').textContent=t;$('#tback').style.display=back?'grid':'none';$('#tbar').classList.remove('on')};

async function drawTools(){
 const B=$('#tbody');B.replaceChildren();head('Tools',false);
 if(!TOOLS){B.append(h('div','empty','The cleaning tools run inside the Android app.'));return}
 await readPerm();
 if(!PERM.allFiles){const b=h('button','chip on','Allow');b.onclick=()=>askPerm('allFiles');
  B.append(h('div','ban',null,h('div',null,null,h('b',null,'All files access is off'),h('small',null,'The scanners need it to see every folder.')),b))}
 const box=h('div','mtrs');B.append(box);
 TOOLS.storageInfo().then(r=>r.volumes.forEach(v=>box.append(meter(v.primary?'Internal storage':'SD card or USB',v.total-v.free,v.total,v.free/v.total<.1)))).catch(()=>{});
 TOOLS.ramInfo().then(r=>box.append(meter('Memory (RAM)',r.total-r.avail,r.total,r.low))).catch(()=>{});
 const grid=h('div','tg');B.append(grid);
 [['edit','Notepad','Notes, checklists, search, backup',tNotes],
  ['shield','Authenticator','2-step codes with logos, encrypted here',tAuth],
  ['key','Password Manager','Conduint Password Manager, encrypted here',()=>{closeTools();pmOpen()}],
  ['shield','Shield','Scan files, see what was blocked',tShield],
  ['globe','VPN','WireGuard with auto-rotating servers',tVpn],
  ['globe','Wi-Fi check','Security type, sign-in pages, DNS tampering',tWifi],
  ['lock','Zipliner','Encrypt to ZIP or 7z with AES-256 / 128',tZipliner],
  ['bolt','Storage optimizer','Junk, empty folders and cache in one go',tOptimize],
  ['chip','RAM optimizer','Stop background apps and free memory',tRam],
  ['broom','Cache cleanup','Clear this app\'s cache',tCache],
  ['trash','Junk files','Temp, log, leftover and empty files',tJunk],
  ['copy','Duplicate finder','Same content, byte for byte',tDup],
  ['folder','Empty folders','Folders with nothing inside',tEmpty],
  ['code','Orphan folders','Left behind by uninstalled apps',tOrphan],
  ['eye','Hidden files finder','Secret dot-files and folders, biggest first',tHidden],
  ['phone','Large files','Biggest files first',tLarge],
  ['folder','Largest folders','Biggest folders first, tap to look inside',tBigDirs],
  ['history','Forgotten files','Untouched for a year, biggest first',tForgotten],
  ['bolt','Fresh files','What changed in the last 3 days, newest first',tFresh],
  ['zip','Old installers','APK files you can remove',tApk],
  ['search','Storage analyzer','What is using your space',tAnalyze],
  ['tune','Other apps\' cache','Opens Android\'s app storage page',()=>TOOLS.openSettings({what:'apps'})],
  ['shield','Permissions','Storage, music, files, notifications',openPerm]
 ].forEach(([ic,t,s,f])=>{const b=h('button','tc',null,ico(ic),h('b',null,t),h('small',null,s));
  if(t==='Shield'||t==='VPN'){const g=h('span','tgst','');b.querySelector('b').append(g);
   const put=on=>{g.textContent=on?'ON':'OFF';g.className='tgst '+(on?'on':'off')};
   if(t==='Shield'&&typeof shOn==='function')put(shOn());
   else if(typeof VPN!=='undefined'&&VPN&&typeof VPN.status==='function')VPN.status().then(r=>put(!!r&&r.state==='UP')).catch(()=>{})}
  b.onclick=()=>Promise.resolve().then(f).catch(e=>e&&e.code!=='CANCELLED'&&toast(e.message||'That did not work.'));grid.append(b)})}

/* run a scan behind the busy overlay; a missing permission sends the person to the permission page */
async function scanJob(t,fn){
 try{return await job(t,fn)}catch(e){return false}}
const needFiles=async()=>{await readPerm();if(PERM.allFiles)return true;
 const r=await dlg({title:'Allow All files access',msg:'The scanner needs it to see every folder. Android opens a settings page: switch Conduint Files on, then come back.',ok:'Open settings'});
 if(r)askPerm('allFiles');return false};
const rowOf=(x,o={})=>({path:x.path,name:x.name,size:x.size||0,dir:x.dir,sub:o.sub||parentOf(x.path),sec:o.sec||'',sel:o.sel!==false,g:o.g});

/* ---------- [3] RESULT LIST (select, then move to bin or delete) ---------- */
function showList(o){TV.view='list';TV.list=o;drawList()}
function drawList(){
 const o=TV.list,B=$('#tbody'),y=B.scrollTop;B.replaceChildren();head(o.title,true);
 if(o.note)B.append(h('div','note',o.note));
 if(!o.rows.length){B.append(h('div','empty',o.none||'Nothing found. This part is tidy.'));return}
 let last=null;
 o.rows.forEach(r=>{
  if(r.sec&&r.sec!==last)B.append(h('h3',null,r.sec));last=r.sec;
  const n=h('div','lr'+(r.sel?' sel':''),null,h('span','ck'+(r.sel?' on':''),null,ico('check')),
   ico(r.dir?'folder':KICON[kindOf(r.name)]||'file',r.dir?'fo':''),
   h('div','li',null,h('b',null,r.name),h('small',null,r.sub)),h('span','sz',r.size?fmt(r.size):''));
  n.onclick=()=>{r.sel=!r.sel;drawList()};B.append(n)});
 B.scrollTop=y;
 const sel=o.rows.filter(r=>r.sel),tot=sel.reduce((a,r)=>a+r.size,0),bar=$('#tbar');bar.replaceChildren();bar.classList.add('on');
 const all=sel.length===o.rows.length;
 const c1=h('button','chip',all?'None':'All');c1.onclick=()=>{o.rows.forEach(r=>r.sel=!all);drawList()};bar.append(c1);
 if(o.keep){const k=h('button','chip','Keep: '+o.keep);k.onclick=()=>{o.keep=o.keep==='oldest'?'newest':'oldest';autoKeep(o);drawList()};bar.append(k)}
 bar.append(h('b','sum',(sel.length?plural(sel.length,'item')+' · '+fmt(tot):'Nothing selected')));
 const d=h('button','chip on danger2',S.settings.bin?'To bin':'Delete');d.onclick=()=>delRows(o,false);bar.append(d);
 if(S.settings.bin){const f=h('button','chip danger','Forever');f.onclick=()=>delRows(o,true);bar.append(f)}}
function autoKeep(o){const gs={};o.rows.forEach(r=>(gs[r.g]=gs[r.g]||[]).push(r));
 Object.values(gs).forEach(a=>a.forEach((r,i)=>r.sel=o.keep==='oldest'?i!==0:i!==a.length-1))}

async function delRows(o,forever){
 const sel=o.rows.filter(r=>r.sel);if(!sel.length)return toast('Tap items to select them first.');
 const bin=S.settings.bin&&!forever,tot=sel.reduce((a,r)=>a+r.size,0);
  const r=await dlg({title:bin?'Move to recycle bin?':'Delete forever?',msg:plural(sel.length,'item')+' ('+fmt(tot)+')'+(bin?' can be restored from the recycle bin.':' will be removed for good.'),ok:bin?'Move to bin':'Delete',danger:true});if(!r)return;
 let failed=0;
 const ok=await job(bin?'Moving to bin…':'Deleting…',async()=>{
  const paths=sel.filter(x=>!x.special).map(x=>x.path);
  if(paths.length){
   if(bin){const t=await TOOLS.trash({paths});failed=t.failed||0;
    t.items.forEach(x=>S.trash.push({id:sid(),p:1,m:'fs',name:x.name,tname:x.tname,dir:!!x.dir,size:x.size||0,at:Date.now(),fpath:x.trash,from:x.from}));save()}
   else await TOOLS.fsRemove({paths})}
  if(sel.some(x=>x.special==='cache'))await TOOLS.clearCache();
  return true});
 if(!ok)return;
 o.rows=o.rows.filter(x=>!x.sel);
 if(o.keep){const c={};o.rows.forEach(x=>c[x.g]=(c[x.g]||0)+1);o.rows=o.rows.filter(x=>c[x.g]>1)}
 const msg=(bin?'Moved ':'Deleted ')+plural(sel.length-failed,'item')+' · '+fmt(tot)+(failed?' ('+failed+' could not be removed)':'');
 toast(msg);TOOLS.notice({title:'Cleanup finished',text:msg}).catch(()=>{});
 drawList();side();if(cur.m||cur.cat)refresh()}

/* ---------- [4] THE TOOLS ---------- */
async function tJunk(){if(!await needFiles())return;
 const r=await scanJob('Looking for junk…',()=>TOOLS.junk());if(!r)return;
 showList({title:'Junk files',note:'Temporary, leftover, log and empty files, plus thumbnail and cache folders.',rows:r.items.map(x=>rowOf(x,{sub:x.why+' · '+parentOf(x.path)}))})}
async function tEmpty(){if(!await needFiles())return;
 const r=await scanJob('Looking for empty folders…',()=>TOOLS.emptyFolders());if(!r)return;
 showList({title:'Empty folders',note:'Only the top folder of each empty tree is listed. Standard folders like DCIM and Download are never offered.',rows:r.items.map(x=>rowOf(x,{sub:parentOf(x.path)}))})}
async function tOrphan(){if(!await needFiles())return;
 const r=await scanJob('Checking installed apps…',()=>TOOLS.orphans());if(!r)return;
 if(!r.visibleOk)return showList({title:'Orphan folders',rows:[],none:'Android is hiding your installed app list ('+r.installedCount+' visible), so results would not be safe. Nothing is shown.'});
 showList({title:'Orphan folders',note:'Folders named after an app that is no longer installed. They are not selected by default: some hold your own saves or exports.',
  rows:r.items.map(x=>rowOf(x,{sel:false,sub:x.where+' · '+parentOf(x.path)})),none:'No leftovers from uninstalled apps.'})}
async function tLarge(){if(!await needFiles())return;
 const r=await scanJob('Finding large files…',()=>TOOLS.largeFiles({minMb:50}));if(!r)return;
 showList({title:'Large files',note:'Files over 50 MB, biggest first. Nothing is selected for you.',rows:r.items.map(x=>rowOf(x,{sel:false})),none:'No files over 50 MB.'})}
/* V0.15.0: the extra tool. Finds files and folders that hide behind a leading dot, which most file apps never show. */
async function tHidden(){if(!await needFiles())return;
 const r=await scanJob('Looking for hidden files…',()=>TOOLS.hiddenFiles());if(!r)return;
 showList({title:'Hidden files finder',note:'Items whose name starts with a dot. Android and apps use some of them, so nothing is selected for you. '+(r.total>r.items.length?'Showing the biggest '+r.items.length+' of '+r.total+'.':''),
  rows:r.items.map(x=>rowOf(x,{sel:false,sub:parentOf(x.path)})),none:'No hidden files or folders found.'})}
async function tApk(){if(!await needFiles())return;
 const r=await scanJob('Finding installers…',()=>TOOLS.apks());if(!r)return;
 showList({title:'Old installers',note:'APK files already installed or no longer needed. Nothing is selected for you.',rows:r.items.map(x=>rowOf(x,{sel:false})),none:'No APK files found.'})}
async function tDup(){if(!await needFiles())return;
 const r=await scanJob('Comparing files…',()=>TOOLS.duplicates({minKb:4}));if(!r)return;
 const rows=[];r.groups.forEach((g,gi)=>g.files.forEach(f=>rows.push(rowOf(f,{g:gi,sec:g.files[0].name+' · '+g.files.length+' copies · '+fmt(g.size)+' each'}))));
 const o={title:'Duplicate finder',note:'Files with identical content (every byte compared). One copy per group is kept.',rows,keep:'oldest',none:'No duplicate files found.'};
 autoKeep(o);showList(o)}
async function tAnalyze(){if(!await needFiles())return;
 const r=await scanJob('Measuring storage…',()=>TOOLS.analyze());if(!r)return;
 TV.view='custom';const B=$('#tbody');B.replaceChildren();head('Storage analyzer',true);
 const cats=r.cats.slice().sort((a,b)=>b.size-a.size),max=Math.max(1,...cats.map(c=>c.size),...r.folders.map(c=>c.size));
 const bars=(t,a,lab)=>{B.append(h('h3',null,t));a.forEach(c=>{const f=h('i');f.style.width=Math.max(2,Math.round(c.size/max*100))+'%';
  B.append(h('div','mtr',null,h('div','ml',null,h('b',null,lab(c.name)),h('small',null,fmt(c.size)+' · '+plural(c.count,'file'))),h('div','bar',null,f)))})};
 bars('By type',cats,n=>CATN[n]||n);bars('Biggest top-level folders',r.folders,n=>n)}

async function tCache(){
 const c=await TOOLS.cacheSize(),r=await dlg({title:'Cache cleanup',msg:'Clears this app\'s cache ('+fmt(c.size)+'): temporary copies made for the player and previews. Your files are not touched.\n\nAndroid does not let one app clear another app\'s cache. Use "Other apps\' cache" in Tools for that.',ok:'Clear cache'});
 if(!r)return;const x=await TOOLS.clearCache();toast('Freed '+fmt(x.freed)+' of cache.');TOOLS.notice({title:'Cache cleared',text:'Freed '+fmt(x.freed)}).catch(()=>{})}
async function tRam(){
 const r=await dlg({title:'RAM optimizer',msg:'Asks Android to stop background processes of the apps you installed and frees this app\'s memory. Apps you are using stay open. Android may restart some of them later, that is normal.',ok:'Optimize now'});if(!r)return;
 const x=await job('Freeing memory…',()=>TOOLS.ramBoost());if(!x||x===true)return;
 const gain=x.after-x.before;
 await dlg({title:'RAM optimized',msg:'Free memory: '+fmt(x.before)+' to '+fmt(x.after)+(gain>0?' (+'+fmt(gain)+')':' (no change, Android was already keeping it free)')+'\nBackground apps asked to stop: '+x.apps,ok:'Done',nocancel:true});
 TOOLS.notice({title:'RAM optimized',text:gain>0?'Freed '+fmt(gain):'Memory was already free'}).catch(()=>{});drawTools()}
async function tOptimize(){if(!await needFiles())return;
 const x=await scanJob('Scanning storage…',async()=>({j:await TOOLS.junk(),e:await TOOLS.emptyFolders(),c:await TOOLS.cacheSize()}));if(!x)return;
 const rows=[];
 if(x.c.size)rows.push({special:'cache',name:'App cache',size:x.c.size,sub:'Conduint Files cache',sec:'Cache',sel:true});
 x.j.items.forEach(i=>rows.push(rowOf(i,{sec:'Junk files',sub:i.why+' · '+parentOf(i.path)})));
 x.e.items.forEach(i=>rows.push(rowOf(i,{sec:'Empty folders'})));
 showList({title:'Storage optimizer',note:'Everything below is selected. Untick what you want to keep, then tap '+(S.settings.bin?'To bin':'Delete')+'.',rows,none:'Nothing to clean. Storage is already tidy.'})}


/* ---------- V0.14.2: Forgotten files + Fresh files (one native scan, two views) ---------- */
const ago=t=>{const d=Math.max(0,Math.round((Date.now()-t)/864e5));return d<1?'today':d===1?'yesterday':d<60?d+' days ago':d<700?Math.round(d/30)+' months ago':(d/365).toFixed(1)+' years ago'};
async function tForgotten(){if(!await needFiles())return;
 const r=await scanJob('Finding forgotten files…',()=>TOOLS.filesByAge({minDays:365,minKb:1024}));if(!r)return;
 showList({title:'Forgotten files',note:'Over 1 MB and not touched for a year, biggest first. Nothing is selected for you: you decide what still matters.',
  rows:r.items.map(x=>rowOf(x,{sel:false,sub:'Last changed '+ago(x.mtime)+' · '+parentOf(x.path)})),none:'Nothing here has gone untouched for a year.'})}
async function tFresh(){if(!await needFiles())return;
 const r=await scanJob('Finding fresh files…',()=>TOOLS.filesByAge({maxDays:3,newest:true}));if(!r)return;
 showList({title:'Fresh files',note:'Everything created or changed in the last 3 days, newest first. Handy to find that download or take you just made.',
  rows:r.items.map(x=>rowOf(x,{sel:false,sub:ago(x.mtime)+' · '+parentOf(x.path)})),none:'No files changed in the last 3 days.'})}

/* ---------- [5] V0.14.0: shortcuts used by the Home three-dot menu ---------- */
/* Storage analyser straight from Home: opens the Tools sheet already on the analyser (Back goes to the Tools list). */
async function openAnalyzer(){
 if(!TOOLS)return toast('The storage analyser runs in the Android app.');
 document.body.classList.remove('nav');$('#tools').classList.add('on');TV.view='home';
 try{await tAnalyze()}catch(e){if(e&&e.code!=='CANCELLED')toast(e.message||'That did not work.')}
 if(TV.view==='home')drawTools()}/* permission refused or scan cancelled: fall back to the Tools list instead of an empty sheet */

/* Optimise Conduit: one tap, no questions.
   1) asks Android to stop background processes of the apps you installed (apps you are using stay open),
   2) clears Conduint's own cache (skipped while a song or video is open, the player plays from it),
   3) turns off Conduint's own battery drains: wake lock, keep-screen-on and the background effect.
   Android does not let an app change system battery settings, so this is everything an app can honestly do. */
async function optimiseConduit(){
 if(!NATIVE||!TOOLS)return toast('Optimise Conduit runs in the Android app.');
 const s=S.settings,playing=pl.classList.contains('on');
 const x=await job('Optimising Conduit…',async()=>{const r={};
  try{r.ram=await TOOLS.ramBoost()}catch(e){r.err=e&&e.message||'could not stop background apps'}
  if(!playing){try{r.freed=(await TOOLS.clearCache()).freed||0}catch{}}
  return r});
 if(!x||x===true)return;
 const saved=[];
 if(s.wake){s.wake=false;saved.push('wake lock off')}
 if(s.screen){s.screen=false;saved.push('keep-screen-on off')}
 if(s.fx&&s.fx!=='off'){s.fx='off';saved.push('background effect off')}
 if(saved.length){save();apply();applyPower();draw()}
 const L=[];
 if(x.ram){const gain=x.ram.after-x.ram.before;L.push('Background apps asked to stop: '+x.ram.apps,'Free memory: '+fmt(x.ram.before)+' to '+fmt(x.ram.after)+(gain>0?' (+'+fmt(gain)+')':' (Android was already keeping it free)'))}
 else if(x.err)L.push('Background apps: '+x.err);
 if(playing)L.push('Cache kept while media is open.');else if(x.freed!=null)L.push('Conduint cache cleared: '+fmt(x.freed));
 L.push(saved.length?'Battery: '+saved.join(', ')+'.':'Battery: Conduint was already not draining extra.');
 await dlg({title:'Conduint optimised',msg:L.join('\n'),ok:'Done',nocancel:true});
 TOOLS.notice({title:'Conduint optimised',text:x.ram?'Asked '+x.ram.apps+' background apps to stop':'Done'}).catch(()=>{});
 if(typeof widApply==='function')widApply()}
