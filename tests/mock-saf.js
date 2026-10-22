/* mock-saf.js: in-memory stand-in for the native Saf plugin, used only by tests/smoke.py.
   It mimics the plugin's contract (same method names, same result shapes) so the UI logic can be tested in a browser. */
(()=>{
const T={'':{dir:true}},LOG=[];window.__T=T;window.__log=LOG;
const U=p=>'mock:/'+p,Pp=u=>u.slice(6),par=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'',nm=p=>p.slice(p.lastIndexOf('/')+1);
const add=(p,dir,size=0)=>{T[p]={dir,size,mtime:Date.now()}};
['Docs','Docs/Sub','Music'].forEach(p=>add(p,true));
[['Docs/a.txt',120],['Docs/b.md',2048],['Docs/Sub/deep.txt',5],['Music/song.mp3',900000],['readme.txt',33]].forEach(([p,s])=>add(p,false,s));
const kids=p=>Object.keys(T).filter(k=>k&&par(k)===p);
const row=p=>({name:nm(p),uri:U(p),dir:T[p].dir,mime:T[p].dir?'vnd.android.document/directory':'',size:T[p].size,mtime:T[p].mtime,flags:0});
const uniq=(d,n)=>{let x=n,i=1;while(T[d?d+'/'+x:x])x=n+' ('+i+++')';return d?d+'/'+x:x};
const sub=p=>Object.keys(T).filter(k=>k===p||k.startsWith(p+'/'));
const mv=(a,b)=>{for(const k of sub(a)){T[b+k.slice(a.length)]=T[k];delete T[k]}};
const cp=(a,b)=>{for(const k of sub(a))T[b+k.slice(a.length)]={...T[k]}};
const need=p=>{if(!T[p])throw Error('Item not found')};
const Saf={
 async pickTree(){return{uri:'mock-tree',root:U(''),name:'Phone'}},
 async release(){},async cancel(){},async clearCache(){},
 async list({uri}){const p=Pp(uri);need(p);return{items:kids(p).map(row)}},
 async stat({uri}){const p=Pp(uri);need(p);return row(p)},
 async ensureDir({parent,name}){const p=Pp(parent),t=p?p+'/'+name:name;if(!T[t])add(t,true);return{uri:U(t)}},
 async mkdir({parent,name}){const t=uniq(Pp(parent),name);add(t,true);return{uri:U(t)}},
 async mkfile({parent,name}){const t=uniq(Pp(parent),name);add(t,false);return{uri:U(t)}},
 async rename({uri,name}){const p=Pp(uri),t=par(p)?par(p)+'/'+name:name;if(T[t])throw Error("Couldn't rename. That name may already be taken.");mv(p,t);return{uri:U(t)}},
 async remove({uris}){uris.forEach(u=>sub(Pp(u)).forEach(k=>delete T[k]))},
 async copy({items,parent}){const d=Pp(parent);return{uris:items.map(i=>{const s=Pp(i.uri),t=uniq(d,nm(s));cp(s,t);return U(t)})}},
 async move({items,parent}){const d=Pp(parent);return{uris:items.map(i=>{const s=Pp(i.uri),t=uniq(d,nm(s));mv(s,t);return U(t)})}},
 async zip({items,parent,name,level}){const d=Pp(parent),t=uniq(d,name);add(t,false,1234);LOG.push(['zip',items.map(i=>nm(Pp(i.uri))),name,level]);return{uri:U(t)}},
 async unzip({uri,parent,name}){const t=uniq(Pp(parent),name);add(t,true);add(t+'/inside.txt',false,9);LOG.push(['unzip',nm(Pp(uri)),name]);return{uri:U(t)}},
 async scan({uri,exts}){const out=[];for(const k of Object.keys(T))if(!T[k].dir&&!k.includes('.conduint-trash')&&exts.includes(nm(k).split('.').pop())){out.push({...row(k),parent:U(par(k)),pname:nm(par(k))})}return{items:out}},
 async dirSize({uri}){const p=Pp(uri);need(p);const k=sub(p).filter(x=>x!==p);const f=k.filter(x=>!T[x].dir);if(window.__sizeFail)throw Error('Could not read this folder.');return{files:f.length,folders:k.length-f.length,bytes:f.reduce((a,x)=>a+(T[x].size||0),0),skipped:window.__sizeSkip||0}},
 async openWith(o){LOG.push(['openWith',nm(Pp(o.uri)),o.mime,!!o.edit])},
 async share(o){LOG.push(['share',o.uris.map(u=>nm(Pp(u)))])},
 async cacheCopy({uri}){return{path:window.__cache&&window.__cache[uri]||'/x.mp3'}},
 async writeFile(o){const p=Pp(o.dir),t=p?p+'/'+o.name:o.name;add(t,false,(o.text||o.b64||'').length);T[t].text=o.text;T[t].b64=o.b64;LOG.push(['write',o.name,o.mime]);return{uri:U(t)}},
 async writeUri({uri,b64}){const p=Pp(uri);need(p);T[p].b64=b64;T[p].size=b64.length;T[p].mtime=Date.now();LOG.push(['writeUri',nm(p)])},
 async thumb(o){LOG.push(['thumb',nm(Pp(o.uri)),o.kind]);return{b64:'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='}},
 async volumes(){return{removable:['SD card']}},
 async roots(){return{allFiles:!!window.__perm.allFiles,internal:'mock:/',downloads:'mock:/Docs',documents:'mock:/Docs/Sub',removable:[]}},
 async providers(){return{items:[{label:'Google Drive',pkg:'com.google.android.apps.docs'},{label:'OneDrive',pkg:'com.microsoft.skydrive'}]}},
 async pickDocs(){LOG.push(['pickDocs']);return{items:[{name:'drive-note.txt',uri:'mock:/Docs/a.txt',dir:false,mime:'text/plain',size:120,mtime:Date.now()}]}},
 async saveCopy(o){LOG.push(['saveCopy',o.name])},
 async addListener(){return{remove(){}}}
};

/* mock of the Tools plugin: fake phone file system on real-looking paths */
const R='/storage/emulated/0/',F={},PERM={sdk:34,battery:false,images:false,video:false,audio:false,media:false,allFiles:false,notifications:false};window.__F=F;window.__perm=PERM;
const fadd=(p,size,c,dir)=>F[R+p]={size,c:c||p,dir:!!dir,mtime:Date.now()-(p.length*1000)};
[['Download/a.tmp',100],['Download/old.log',2000],['Download/empty.bin',0],['Pictures/x.jpg',50000,'same'],['Pictures/copy/x.jpg',50000,'same'],['Pictures/x2.jpg',50000,'same'],['Movies/big.mp4',90*1048576],['Download/app.apk',5000000],['Music/s.mp3',4000000,'song'],['Music/s2.mp3',4000000,'other']].forEach(a=>fadd(a[0],a[1],a[2]));
['Pictures/copy','Empty1','Empty1/inner','com.gone.app','com.still.here'].forEach(d=>fadd(d,0,'',true));
const fk=p=>Object.keys(F).filter(k=>k.startsWith(p+'/'));
const bn=p=>p.slice(p.lastIndexOf('/')+1);
const ext=n=>n.includes('.')?n.split('.').pop().toLowerCase():'';
const frow=p=>({path:p,name:bn(p),size:F[p].size,mtime:F[p].mtime,dir:F[p].dir});
const files=()=>Object.keys(F).filter(k=>!F[k].dir&&!k.includes('.conduint-trash'));
const fneed=()=>{if(!PERM.allFiles){const e=Error('Allow "All files access" first (Settings, Permissions).');e.code='NOPERM';throw e}};
window.__toBack=0;
const Tools={
 async toBack(){window.__toBack++},
 async permissions(){return{...PERM}},
 async installApk(o){LOG.push(['install',o.path]);return{needAllow:false}},
 async inspectApk({path}){LOG.push(['inspect',path]);return window.__apk&&window.__apk[path]||{ok:false,size:0}},
 async wakeLock(o){LOG.push(['wake',!!o.cpu,!!o.screen]);return{...PERM}},
 async library({exts}){if(!PERM.allFiles){const e=Error('Allow All files access first.');e.code='NOPERM';throw e}return{items:files().filter(k=>exts.includes(ext(k))).map(k=>({name:bn(k),uri:'file://'+k,dir:false,size:F[k].size,mtime:F[k].mtime,pname:bn(k.slice(0,k.lastIndexOf('/')))}))}},
 async request({what}){LOG.push(['perm',what]);if(what==='media')PERM.images=PERM.video=PERM.audio=PERM.media=true;else PERM[what]=true;return{...PERM}},
 async openSettings(o){LOG.push(['settings',o.what])},async notice(o){LOG.push(['notify',o.title])},async cancel(){},
 async storageInfo(){return{volumes:[{path:'/storage/emulated/0',total:64e9,free:20e9,primary:true}]}},
 async ramInfo(){return{total:6e9,avail:1.5e9,threshold:3e8,low:false}},
 async ramBoost(){LOG.push(['ram']);return{before:1.5e9,after:2.1e9,total:6e9,apps:7}},
 async cacheSize(){return{size:777000}},async clearCache(){LOG.push(['cache']);return{freed:777000}},
 async analyze(){fneed();return{cats:[{name:'images',size:150000,count:3},{name:'videos',size:94371840,count:1}],folders:[{name:'Movies',size:94371840,count:1}]}},
 async largeFiles(){fneed();return{items:files().filter(k=>F[k].size>=50*1048576).map(frow)}},
 async apks(){fneed();return{items:files().filter(k=>ext(k)==='apk').map(frow)}},
 async junk(){fneed();return{items:files().filter(k=>['tmp','log'].includes(ext(k))||F[k].size===0).map(k=>({...frow(k),why:F[k].size===0?'Empty file':'Temporary or leftover file'}))}},
 async emptyFolders(){fneed();return{items:Object.keys(F).filter(k=>F[k].dir&&!fk(k).length&&k!==R+'Pictures/copy'&&!k.includes('com.')).map(k=>k.endsWith('inner')?R+'Empty1':k).filter((v,i,a)=>a.indexOf(v)===i).map(frow)}},
 async orphans(){fneed();return{visibleOk:true,installedCount:120,items:[R+'com.gone.app'].map(k=>({...frow(k),where:'Top level'}))}},
 async duplicates(){fneed();const g={};files().forEach(k=>{if(F[k].size>=4096){const x=F[k].size+'|'+F[k].c;(g[x]=g[x]||[]).push(k)}});
  return{groups:Object.values(g).filter(a=>a.length>1).map(a=>({size:F[a[0]].size,files:a.sort((x,y)=>F[x].mtime-F[y].mtime).map(frow)}))}},
 async trash({paths}){fneed();const items=[];for(const p of paths){if(!F[p])continue;const t=R+'.conduint-trash/'+bn(p);for(const k of [p,...fk(p)]){F[t+k.slice(p.length)]=F[k];delete F[k]}items.push({from:p,trash:t,tname:bn(p),name:bn(p),size:F[t].size,dir:F[t].dir})}return{items,failed:0}},
 async fsRemove({paths}){paths.forEach(p=>[p,...fk(p)].forEach(k=>delete F[k]));return{freed:1}},
 async fsRestore({items}){return{items:items.map(i=>{if(!F[i.trash])return{id:i.id,lost:true};for(const k of [i.trash,...fk(i.trash)]){F[i.from+k.slice(i.trash.length)]=F[k];delete F[k]}return{id:i.id,path:i.from}})}},
 async folderSizes({path}){fneed();if(window.__bdFail)throw Error('Android would not let Conduint open that folder.');const base=path.replace(/\/$/,'')+'/',under=Object.keys(F).filter(k=>k.startsWith(base));const g={};let ls=0,lc=0;
  under.forEach(k=>{const rel=k.slice(base.length),i=rel.indexOf('/');if(F[k].dir)return;if(i<0){ls+=F[k].size;lc++}else{const n=rel.slice(0,i);(g[n]=g[n]||{name:n,path:base+n,size:0,count:0});g[n].size+=F[k].size;g[n].count++}});
  const items=Object.values(g).sort((a,b)=>b.size-a.size);return{items,looseSize:ls,looseCount:lc,total:items.reduce((a,x)=>a+x.size,0)+ls,totalCount:items.reduce((a,x)=>a+x.count,0)+lc}},
 async fsExists({paths}){return{exists:paths.map(p=>!!F[p])}},
 async addListener(){return{remove(){}}}
};
/* mock of the Lock plugin (fingerprint) and the Player plugin (notification) */
window.__bio={ok:true,fail:false};
const Lock={
 async available(){return window.__bio.ok?{ok:true,why:''}:{ok:false,why:'No fingerprint is set up on this phone.'}},
 async authenticate(){LOG.push(['bio']);if(window.__bio.fail){const e=Error('Cancelled');e.code='CANCELLED';throw e}return{ok:true}},
 async secure(o){LOG.push(['secure',!!o.on])}
};
const PL={listeners:{}};window.__pl=PL;
const Player={
 async update(o){LOG.push(['notif',o.title,o.artist,!!o.playing,(o.art||'').length>0])},
 async stop(){LOG.push(['notifstop'])},
 async addListener(n,f){PL.listeners[n]=f;return{remove(){}}}
};
const Browser=new Proxy({},{get:(t,k)=>k==='then'?undefined:async()=>({})});
const Wifi={async check(){if(window.__wifiErr)throw new Error('boom');return window.__wifi||{online:true,transport:'wifi',viaWifi:true,security:{type:2},captive:{flag:false,validated:true,probe:'ok'},dns:{servers:['192.168.0.1'],privateOn:false,nxdomain:'ok',anchors:[{host:'one.one.one.one',result:'ok'},{host:'dns.google',result:'ok'}],private:[]}}}};
/* V0.29.0 Cred mock: records what the web side sends so tests can check the autofill hook */
window.__cred={passkeys:[{id:'pk1',rp:'example.com',rpName:'Example',user:'grant',display:'Grant',created:1760000000000}],pw:null,opened:[],syncs:0,provider:false,autofill:false,fail:false};
const Cred={async status(){return{sdk:34,passkeyCapable:true,autofillCapable:true,passkeys:__cred.passkeys.length,passwords:__cred.pw?JSON.parse(__cred.pw).length:0,autofillOn:__cred.autofill,providerOn:__cred.provider}},
 async openProviderSettings(){__cred.opened.push('provider')},async openAutofillSettings(){__cred.opened.push('autofill')},
 async listPasskeys(){return{items:__cred.passkeys}},async deletePasskey({id}){__cred.passkeys=__cred.passkeys.filter(p=>p.id!==id);return{deleted:true}},
 async syncPasswords({json}){if(__cred.fail)throw new Error('native boom');__cred.syncs++;__cred.pw=json;return{count:JSON.parse(json).length}},async clearPasswords(){__cred.pw=null}};
window.Capacitor={isNativePlatform:()=>true,registerPlugin:n=>n==='Cred'?Cred:n==='Wifi'?Wifi:n==='Tools'?Tools:n==='Lock'?Lock:n==='Player'?Player:n==='Browser'?Browser:Saf,convertFileSrc:p=>p};
})();
