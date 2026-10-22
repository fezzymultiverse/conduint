/* pm.js: Conduint Passwords (V0.33.0), the Conduint Password Manager. Data layer: keys, storage, items, attachments, zip, import, export.
   Keys: one random 256-bit vault key encrypts every item, folder and attachment chunk (AES-256-GCM, Web Crypto). The vault key is never stored in the clear:
   it is wrapped by your MASTER PASSWORD (PBKDF2-SHA256, 600,000 rounds, salted with a random salt + your email, like Bitwarden) and, if you turn it on, by the fingerprint.
   Only wrapped copies and encrypted records are saved (IndexedDB 'conduint-pm'). Wrong master password = the wrapped key does not open. There is no recovery: forget it and the vault cannot be read.
   Items use the Bitwarden JSON shape, so Bitwarden exports import as they are and exports go back into Bitwarden. The screens are in pmui.js. Strategy Over Impulse. */
const PMDB='conduint-pm',PMCH=4194304,PMMAX=268435456,PMITER=600000;
const PM={VK:null,items:[],folders:[],hist:[],hdr:null,open:false,scr:'lock',tab:'vault',flt:'all',q:'',cur:null,draft:null,stack:[],hid:0,verified:0};

const pmTe=new TextEncoder(),pmTd=new TextDecoder();
const pmB64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
const pmUnB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const pmRnd=n=>crypto.getRandomValues(new Uint8Array(n));
const pmId=()=>{const r=pmRnd(16);r[6]=r[6]&15|64;r[8]=r[8]&63|128;const x=[...r].map(b=>b.toString(16).padStart(2,'0')).join('');return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20)};
const pmNow=()=>new Date().toISOString();
/* uniform random integer below n (no modulo bias) */
function pmRand(n){const lim=Math.floor(4294967296/n)*n,a=new Uint32Array(1);for(;;){crypto.getRandomValues(a);if(a[0]<lim)return a[0]%n}}

/* [1] DATABASE: meta (header), recs (encrypted items, folders, generator history), chunks (encrypted attachment pieces) */
const pmdb=()=>pmdb.p||(pmdb.p=new Promise((res,rej)=>{const r=indexedDB.open(PMDB,1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('meta');d.createObjectStore('recs');d.createObjectStore('chunks')};
 r.onsuccess=()=>res(r.result);r.onerror=()=>{pmdb.p=null;rej(r.error)}}));
const pmreq=(st,mode,fn)=>pmdb().then(d=>new Promise((res,rej)=>{const tx=d.transaction(st,mode),q=fn(tx.objectStore(st));
 tx.oncomplete=()=>res(q&&q.result);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)}));
const pmHdr=()=>pmreq('meta','readonly',s=>s.get('hdr'));
const pmSaveHdr=hd=>pmreq('meta','readwrite',s=>s.put(hd,'hdr'));

/* [2] KEYS */
async function pmKek(pass,email,salt,iter){
 const sl=new Uint8Array(salt.length+pmTe.encode(email).length);sl.set(salt);sl.set(pmTe.encode(email),salt.length);
 const b=await crypto.subtle.importKey('raw',pmTe.encode(pass.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:sl,iterations:iter},b,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey'])}
async function pmWrap(vk,pass,email,iter){
 const salt=pmRnd(16),iv=pmRnd(12),k=await pmKek(pass,email,salt,iter),w=await crypto.subtle.wrapKey('raw',vk,k,{name:'AES-GCM',iv});
 return{s:pmB64(salt),i:pmB64(iv),w:pmB64(new Uint8Array(w)),n:iter}}
async function pmUnwrap(hd,pass){
 const k=await pmKek(pass,hd.email,pmUnB64(hd.s),hd.n);
 return crypto.subtle.unwrapKey('raw',pmUnB64(hd.w),k,{name:'AES-GCM',iv:pmUnB64(hd.i)},{name:'AES-GCM'},true,['encrypt','decrypt'])}
const pmImportKey=b=>crypto.subtle.importKey('raw',pmUnB64(b),{name:'AES-GCM'},true,['encrypt','decrypt']);
async function pmEncB(u8,key){const iv=pmRnd(12),c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key||PM.VK,u8)),o=new Uint8Array(12+c.length);o.set(iv);o.set(c,12);return o}
async function pmDecB(u8,key){u8=new Uint8Array(u8);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:u8.slice(0,12)},key||PM.VK,u8.subarray(12)))}
const pmEnc=async o=>pmB64(await pmEncB(pmTe.encode(JSON.stringify(o))));
const pmDec=async s=>JSON.parse(pmTd.decode(await pmDecB(pmUnB64(s))));

/* [3] ACCOUNT: create, unlock, change master password */
async function pmCreate(email,pass,hint){
 const vk=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const em=email.trim().toLowerCase(),w=await pmWrap(vk,pass,em,PMITER);
 const hd={v:1,email:em,hint:(hint||'').slice(0,100),...w,bio:null,created:Date.now()};
 await pmSaveHdr(hd);PM.hdr=hd;PM.VK=vk;PM.items=[];PM.folders=[];PM.hist=[];return hd}
async function pmUnlockWith(pass){PM.VK=await pmUnwrap(PM.hdr,pass);await pmLoadAll();PM.verified=Date.now()}
async function pmVerify(pass){try{await pmUnwrap(PM.hdr,pass);PM.verified=Date.now();return true}catch{return false}}
async function pmChangeMaster(oldp,newp){
 if(!await pmVerify(oldp))throw Error('The current master password is wrong.');
 const w=await pmWrap(PM.VK,newp,PM.hdr.email,PMITER);PM.hdr={...PM.hdr,...w};await pmSaveHdr(PM.hdr)}
async function pmLoadAll(){
 const rs=await pmreq('recs','readonly',s=>s.getAll());PM.items=[];PM.folders=[];PM.hist=[];PM.sec=null;let bad=0;
 for(const r of rs){try{const o=await pmDec(r.d);if(r.t==='f')PM.folders.push(o);else if(r.t==='g')PM.hist=o.list||[];else if(r.t==='s')PM.sec=o;else PM.items.push(o)}catch{bad++}}
 PM.bad=bad}

/* [4] ITEMS (Bitwarden shape). type: 1 login, 2 secure note, 3 card, 4 identity, 5 SSH key */
const PM_TYPES={1:{n:'Login',ic:'key'},2:{n:'Secure note',ic:'doc'},3:{n:'Card',ic:'card'},4:{n:'Identity',ic:'person'},5:{n:'SSH key',ic:'code'}};
const PM_BRANDS=['','Visa','Mastercard','American Express','Discover','Diners Club','JCB','Maestro','UnionPay','RuPay','Other'];
const PM_MONTHS=['','01','02','03','04','05','06','07','08','09','10','11','12'];
const PM_ID_KEYS=['title','firstName','middleName','lastName','address1','address2','address3','city','state','postalCode','country','company','email','phone','ssn','username','passportNumber','licenseNumber'];
const PM_ID_LAB={title:'Title',firstName:'First name',middleName:'Middle name',lastName:'Last name',address1:'Address 1',address2:'Address 2',address3:'Address 3',city:'City / Town',state:'State / Province',postalCode:'Zip / Postal code',country:'Country',company:'Company',email:'Email',phone:'Phone',ssn:'Social security number',username:'Username',passportNumber:'Passport number',licenseNumber:'License number'};
function pmBlank(type,folderId){
 const t=now=>now,n=pmNow(),it={id:pmId(),organizationId:null,folderId:folderId||null,type,reprompt:0,name:'',notes:'',favorite:false,fields:[],collectionIds:null,attachments:[],passwordHistory:[],creationDate:n,revisionDate:n,deletedDate:null};
 if(type===1)it.login={uris:[{match:null,uri:''}],username:'',password:'',totp:''};
 if(type===2)it.secureNote={type:0};
 if(type===3)it.card={cardholderName:'',brand:'',number:'',expMonth:'',expYear:'',code:''};
 if(type===4){it.identity={};PM_ID_KEYS.forEach(k=>it.identity[k]='')}
 if(type===5)it.sshKey={privateKey:'',publicKey:'',keyFingerprint:''};
 return it}
/* fill every field a type needs, whatever an import brought */
function pmNorm(o){
 const t=[1,2,3,4,5].includes(+o.type)?+o.type:2,b=pmBlank(t,o.folderId||null),it={...b,...o,type:t};
 it.id=String(o.id||b.id);it.name=String(o.name==null?'':o.name);it.notes=o.notes==null?'':String(o.notes);it.favorite=!!o.favorite;it.reprompt=+o.reprompt?1:0;
 it.fields=Array.isArray(o.fields)?o.fields.filter(f=>f&&(f.name||f.value)).map(f=>({name:String(f.name==null?'':f.name),value:f.value==null?'':String(f.value),type:[0,1,2].includes(+f.type)?+f.type:(+f.type===3&&String(f.value==null?'':f.value).trim()?3:0)})):[];/* V0.51.2: type 3 is Authenticator (TOTP). It used to be squashed to Text here on every save, so the field lost its live code and never synced. An empty type 3 (a Bitwarden linked field) still becomes Text. */
 it.attachments=Array.isArray(o.attachments)?o.attachments.filter(a=>a&&a.id&&a.n>0):[];
 it.passwordHistory=Array.isArray(o.passwordHistory)?o.passwordHistory.filter(x=>x&&x.password).slice(0,5):[];
 it.creationDate=o.creationDate||b.creationDate;it.revisionDate=o.revisionDate||b.revisionDate;it.deletedDate=o.deletedDate||null;
 if(t===1){const l=o.login||{};it.login={uris:(Array.isArray(l.uris)&&l.uris.length?l.uris:[{uri:''}]).map(u=>({match:u&&u.match!=null?u.match:null,uri:u&&u.uri?String(u.uri):''})),username:l.username==null?'':String(l.username),password:l.password==null?'':String(l.password),totp:l.totp==null?'':String(l.totp)}}
 if(t===2)it.secureNote={type:0};
 if(t===3){const c=o.card||{};it.card={...b.card};for(const k in b.card)it.card[k]=c[k]==null?'':String(c[k])}
 if(t===4){const c=o.identity||{};it.identity={};PM_ID_KEYS.forEach(k=>it.identity[k]=c[k]==null?'':String(c[k]))}
 if(t===5){const c=o.sshKey||{};it.sshKey={privateKey:c.privateKey||'',publicKey:c.publicKey||'',keyFingerprint:c.keyFingerprint||''}}
 for(const k of['login','card','identity','secureNote','sshKey'])if(!(k==='login'&&t===1)&&!(k==='card'&&t===3)&&!(k==='identity'&&t===4)&&!(k==='secureNote'&&t===2)&&!(k==='sshKey'&&t===5))delete it[k];
 return it}
const pmTouch=()=>{try{PM.onChange&&PM.onChange()}catch{}};
async function pmPut(o,kind){const d=await pmEnc(o);await pmreq('recs','readwrite',s=>s.put({id:o.id,t:kind||'i',d},o.id));pmTouch()}
async function pmSaveItem(it,opt){
 it.revisionDate=pmNow();
 if(!opt||!opt.keepHistory){const old=PM.items.find(x=>x.id===it.id);
  if(old&&old.type===1&&it.type===1&&old.login.password&&old.login.password!==it.login.password){it.passwordHistory=[{lastUsedDate:pmNow(),password:old.login.password},...(it.passwordHistory||[])].slice(0,5)}}
 await pmPut(it,'i');const i=PM.items.findIndex(x=>x.id===it.id);if(i<0)PM.items.push(it);else PM.items[i]=it;return it}
async function pmTrashItem(it){it.deletedDate=pmNow();await pmSaveItem(it,{keepHistory:true})}
async function pmRestoreItem(it){it.deletedDate=null;await pmSaveItem(it,{keepHistory:true})}
async function pmDeleteItem(it){
 for(const a of it.attachments||[])await pmAttDel(a);
 await pmreq('recs','readwrite',s=>s.delete(it.id));PM.items=PM.items.filter(x=>x.id!==it.id);pmTouch()}
async function pmSaveFolder(f){await pmPut(f,'f');const i=PM.folders.findIndex(x=>x.id===f.id);if(i<0)PM.folders.push(f);else PM.folders[i]=f}
async function pmDeleteFolder(f){
 for(const it of PM.items.filter(x=>x.folderId===f.id)){it.folderId=null;await pmSaveItem(it,{keepHistory:true})}
 await pmreq('recs','readwrite',s=>s.delete(f.id));PM.folders=PM.folders.filter(x=>x.id!==f.id);pmTouch()}
async function pmSaveHist(){await pmPut({id:'genhist',list:PM.hist.slice(0,50)},'g')}
async function pmEraseAll(){
 const d=await pmdb();await new Promise((res,rej)=>{const tx=d.transaction(['meta','recs','chunks'],'readwrite');['meta','recs','chunks'].forEach(n=>tx.objectStore(n).clear());tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
 PM.VK=null;PM.items=[];PM.folders=[];PM.hist=[];PM.hdr=null;try{await LOCK.bioForget({which:'pm'})}catch{}pmTouch()}

/* [5] ATTACHMENTS: encrypted in 4 MB pieces, read straight from the file so a big file never sits in memory whole */
async function pmAttPut(file,onTick){
 if(file.size>PMMAX)throw Error('"'+file.name+'" is over '+fmt(PMMAX)+'.');
 const id=pmId(),n=Math.max(1,Math.ceil(file.size/PMCH));
 try{for(let i=0;i<n;i++){
  const c=await pmEncB(new Uint8Array(await file.slice(i*PMCH,(i+1)*PMCH).arrayBuffer()));
  await pmreq('chunks','readwrite',s=>s.put(c.buffer,id+':'+i));if(onTick)onTick(Math.min(file.size,(i+1)*PMCH))}}
 catch(e){await pmAttDel({id,n});throw e}
 return{id,fileName:file.name||'file',size:file.size,n,mime:file.type||'',added:Date.now()}}
async function pmAttGet(a){
 const parts=[];for(let i=0;i<a.n;i++)parts.push(await pmDecB(await pmreq('chunks','readonly',s=>s.get(a.id+':'+i))));
 return new Blob(parts,{type:a.mime||'application/octet-stream'})}
async function pmAttDel(a){if(!a||!a.id)return;await pmreq('chunks','readwrite',s=>{for(let i=0;i<(a.n||1);i++)s.delete(a.id+':'+i)})}

/* [6] ZIP: read (stored or deflate) and write (stored). Bitwarden's "with attachments" export is data.json + attachments/<item id>/<file>. */
async function pmInflate(u8){const ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(u8);w.close();return new Uint8Array(await new Response(ds.readable).arrayBuffer())}
async function pmZipRead(buf){
 const u=new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength);let e=-1;
 for(let i=u.length-22;i>=Math.max(0,u.length-65558);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
 if(e<0)throw Error('That is not a zip file.');
 const cnt=dv.getUint16(e+10,true),off=dv.getUint32(e+16,true);
 if(cnt===0xffff||off===0xffffffff)throw Error('Zip64 files are not supported. Export a smaller zip.');
 const out=[];let p=off;
 for(let k=0;k<cnt;k++){
  if(dv.getUint32(p,true)!==0x02014b50)throw Error('The zip is damaged.');
  const fl=dv.getUint16(p+8,true),mt=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
  const name=pmTd.decode(u.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
  if(name.endsWith('/'))continue;
  if(fl&1)throw Error('That zip is password protected. Export it again without a password.');
  if(dv.getUint32(lo,true)!==0x04034b50)throw Error('The zip is damaged.');
  const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),raw=u.subarray(ds,ds+cs);
  out.push({name,get:async()=>mt===0?raw:mt===8?await pmInflate(raw):Promise.reject(Error('Unsupported zip compression.'))})}
 return out}
const PM_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const pmCrc=u=>{let c=0xffffffff;for(let i=0;i<u.length;i++)c=PM_CRC[(c^u[i])&255]^(c>>>8);return(c^0xffffffff)>>>0};
function pmZipMake(files){/* files: [{name, data: Uint8Array}] -> Blob (stored, UTF-8 names) */
 const parts=[],cen=[];let off=0;const d=new Date(),dd=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),tt=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
 for(const f of files){
  const nm=pmTe.encode(f.name),crc=pmCrc(f.data),lh=new DataView(new ArrayBuffer(30));
  lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,tt,true);lh.setUint16(12,dd,true);
  lh.setUint32(14,crc,true);lh.setUint32(18,f.data.length,true);lh.setUint32(22,f.data.length,true);lh.setUint16(26,nm.length,true);lh.setUint16(28,0,true);
  parts.push(new Uint8Array(lh.buffer),nm,f.data);
  const ch=new DataView(new ArrayBuffer(46));
  ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,tt,true);ch.setUint16(14,dd,true);
  ch.setUint32(16,crc,true);ch.setUint32(20,f.data.length,true);ch.setUint32(24,f.data.length,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);
  cen.push(new Uint8Array(ch.buffer),nm);off+=30+nm.length+f.data.length}
 let cs=0;cen.forEach(x=>cs+=x.length);
 const en=new DataView(new ArrayBuffer(22));en.setUint32(0,0x06054b50,true);en.setUint16(8,files.length,true);en.setUint16(10,files.length,true);en.setUint32(12,cs,true);en.setUint32(16,off,true);
 return new Blob([...parts,...cen,new Uint8Array(en.buffer)],{type:'application/zip'})}

/* [7] CSV */
function pmCsvParse(text){
 text=String(text||'').replace(/^\uFEFF/,'');
 /* Password exports are usually comma-delimited, but some spreadsheet apps save TSV or semicolon CSV. */
 const first=text.split(/\r\n|\n|\r/,1)[0]||'';let delim=',',best=-1;
 for(const d of [',',';','\t']){
  let count=0,quoted=false;
  for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"'){i++;continue}quoted=!quoted}else if(!quoted&&first[i]===d)count++}
  if(count>best){best=count;delim=d}
 }
 const rows=[];let r=[],f='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"')q=true;
  else if(c===delim){r.push(f);f=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;r.push(f);f='';if(r.length>1||r[0]!=='')rows.push(r);r=[]}
  else f+=c}
 if(f!==''||r.length){r.push(f);rows.push(r)}
 return rows
}
const pmCsvCell=v=>{v=v==null?'':String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};

/* [8] IMPORT: Bitwarden JSON, Bitwarden zip with attachments, Bitwarden CSV, Chrome / Edge CSV, LastPass CSV, Conduint encrypted backup */
function pmFromBwJson(j){
 if(j&&j.encrypted)throw Error('That export is encrypted. Export it again as unencrypted .json or as .zip (with attachments).');
 if(!j||!Array.isArray(j.items))throw Error('That file is not a password export (no items found).');
 const folders=(Array.isArray(j.folders)?j.folders:[]).filter(f=>f&&f.id&&f.name).map(f=>({id:String(f.id),name:String(f.name)}));
 return{folders,items:j.items.filter(x=>x&&typeof x==='object')}}
function pmFieldsFromText(s){return String(s||'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const i=l.indexOf(': ');return i>0?{name:l.slice(0,i),value:l.slice(i+2),type:0}:{name:'',value:l,type:0}})}
function pmFromCsv(text){
 const rows=pmCsvParse(text);if(rows.length<2)throw Error('That CSV has no data rows. Export the vault as CSV and make sure the file includes its header row.');
 /* Normalize common vendor/spreadsheet header names before format detection. */
 const aliases={website:'url',login_url:'url',websites:'url',site:'url',login:'username',user:'username',user_name:'username',useremail:'username',login_name:'username',pass:'password',login_password:'password',description:'name',title:'name',label:'name',notes:'note',comments:'note',folder:'grouping',group:'grouping',totp_secret:'totp',two_factor:'totp',otp:'totp',uri:'login_uri'};
 const hd=rows[0].map(x=>{const k=x.trim().toLowerCase().replace(/[ -]+/g,'_');return aliases[k]||k}),ix=n=>hd.indexOf(n),folders=new Map(),items=[];
 const fid=name=>{if(!name)return null;if(!folders.has(name))folders.set(name,{id:pmId(),name});return folders.get(name).id};
 const bw=ix('login_uri')>=0||ix('login_username')>=0,chrome=ix('url')>=0&&ix('username')>=0&&ix('password')>=0&&!bw,lp=chrome&&ix('grouping')>=0;
 if(!bw&&!chrome)throw Error('Unrecognised CSV columns: '+hd.filter(Boolean).slice(0,16).join(', ')+'. Supported exports include Bitwarden, Chrome / Edge / Brave, and LastPass. Export as CSV or JSON, then retry.');
 for(const r of rows.slice(1)){
  const g=n=>{const i=ix(n);return i<0?'':(r[i]||'')};
  if(bw){
   const ty=(g('type')||'login').toLowerCase(),it={id:pmId(),type:ty==='note'?2:ty==='card'?3:ty==='identity'?4:1,folderId:fid(g('folder')),favorite:g('favorite')==='1'||g('favorite').toLowerCase()==='true',reprompt:+g('reprompt')||0,name:g('name'),notes:g('notes'),fields:pmFieldsFromText(g('fields'))};
   if(it.type===1)it.login={uris:g('login_uri').split('\n').map(x=>x.trim()).filter(Boolean).map(uri=>({match:null,uri})),username:g('login_username'),password:g('login_password'),totp:g('login_totp')};
   items.push(it)}
  else{
   const it={id:pmId(),type:1,folderId:lp?fid(g('grouping')):null,favorite:lp&&g('fav')==='1',name:g('name')||g('url'),notes:g('note')||g('extra')||g('notes'),login:{uris:g('url')&&g('url')!=='http://sn'?[{match:null,uri:g('url')}]:[],username:g('username'),password:g('password'),totp:g('totp')}};
   if(lp&&g('url')==='http://sn'){it.type=2;delete it.login}
   items.push(it)}}
 return{folders:[...folders.values()],items}}
/* Conduint Authenticator entries -> items. Passwords become logins, 2FA codes become the login's one-time password, the rest become notes / SSH keys. */
function pmFromAuth(list,withTotp){
 const items=[],bytype={};
 const link=a=>{const l=(a.link||'').trim();return l?[{match:null,uri:/^[a-z]+:\/\//i.test(l)?l:'https://'+l}]:[]};
 const nm=a=>a.issuer||a.name||a.email||'Entry';
 for(const a of list||[]){
  const t=a.type||'totp';
  if(t==='totp'){if(!withTotp)continue;
   items.push({id:pmId(),type:1,name:nm(a),login:{uris:link(a),username:a.email||a.name||'',password:'',totp:a.secret?'otpauth://totp/'+encodeURIComponent(nm(a))+':'+encodeURIComponent(a.name||a.email||'account')+'?secret='+String(a.secret).replace(/\s/g,'')+'&issuer='+encodeURIComponent(nm(a))+(a.digits&&a.digits!==6?'&digits='+a.digits:'')+(a.period&&a.period!==30?'&period='+a.period:'')+(a.algo&&a.algo!=='SHA1'?'&algorithm='+a.algo:''):''},notes:a.fullname?'Name: '+a.fullname:''});continue}
  if(t==='pass'){items.push({id:pmId(),type:1,name:nm(a),login:{uris:link(a),username:a.name||a.email||'',password:a.secret||'',totp:''},notes:[a.fullname?'Name: '+a.fullname:'',a.email&&a.email!==a.name?'Email: '+a.email:''].filter(Boolean).join('\n')});continue}
  if(t==='ssh'){const it=auxItemsSafe(a);if(!it.length)it.push({pub:a.pubkey||'',prv:a.privkey||''});
   it.forEach((x,i)=>items.push({id:pmId(),type:5,name:nm(a)+(it.length>1?' '+(i+1):''),notes:a.name||'',sshKey:{privateKey:x.prv||'',publicKey:x.pub||'',keyFingerprint:''}}));continue}
  if(t==='card'){items.push({id:pmId(),type:2,name:nm(a)+' (card / PIN)',notes:auxItemsSafe(a).map(x=>(x.t?x.t+': ':'')+(x.v||'')).join('\n')||a.note||''});continue}
  const its=auxItemsSafe(a),label={api:'API key',bak:'Backup codes',rec:'Recovery key',pass2:'Passphrase',note:'Note'}[t]||'Note';
  const body=its.length?its.map(x=>[x.t,x.v,x.n].filter(Boolean).join('\n')+(x.u?'  (used)':'')).join(t==='bak'?'\n':'\n\n'):(a.note||a.codes||a.secret||'');
  items.push({id:pmId(),type:2,name:nm(a)+(t==='note'?'':' ('+label+')'),notes:(a.name&&t!=='note'?a.name+'\n':'')+body})}
 return{folders:[],items}}
const auxItemsSafe=a=>{try{return(typeof auxItems==='function'?auxItems(a):[]).map(x=>({...x}))}catch{return[]}};

const pmSig=it=>[it.type,(it.name||'').trim().toLowerCase(),it.login?(it.login.username||'').toLowerCase():'',it.login?it.login.password||'':'',it.login&&it.login.uris[0]?it.login.uris[0].uri.toLowerCase():'',it.card?it.card.number||'':'',(it.notes||'').trim(),(it.fields||[]).map(f=>f.name+'='+f.value).join('|'),it.totp||''].join('\u0001');
/* data: {folders, items}; att: Map itemId -> [{fileName, get:async()=>Uint8Array}]. Returns counts. Duplicates (same type, name, login and note) are skipped so an import can be repeated. */
async function pmImportData(data,att,onTick){
 const have=new Set(PM.items.map(pmSig)),fmap=new Map(),res={items:0,dups:0,folders:0,atts:0,bad:[]};
 for(const f of data.folders||[]){
  let ex=PM.folders.find(x=>x.name.toLowerCase()===f.name.toLowerCase());
  if(!ex){ex={id:pmId(),name:f.name};await pmSaveFolder(ex);res.folders++}
  fmap.set(f.id,ex.id)}
 for(const raw of data.items||[]){
  try{
   const it=pmNorm({...raw,attachments:[]});
   if(it.folderId)it.folderId=fmap.get(it.folderId)||null;
   const sg=pmSig(it);if(have.has(sg)){res.dups++;continue}
   const oid=String(raw.id||''),keep=PM.items.some(x=>x.id===it.id);if(keep)it.id=pmId();
   const files=att&&att.get(oid)||[];
   for(const f of files){
    try{if(onTick)onTick(f.fileName);const u8=await f.get();it.attachments.push(await pmAttPut(new File([u8],f.fileName)));res.atts++}
    catch(e){res.bad.push((it.name||'item')+' / '+f.fileName+': '+(e.message||e))}}
   await pmSaveItem(it,{keepHistory:true});have.add(sg);res.items++;
   if(res.items%25===0)await new Promise(r=>setTimeout(r,0))}
  catch(e){res.bad.push((raw&&raw.name||'item')+': '+(e.message||e))}}
 return res}
/* reads any supported file: .json, .csv, .zip (Bitwarden with attachments), .cndpm (Conduint encrypted backup) */
async function pmReadImport(file,askPass){
 const n=(file.name||'').toLowerCase(),head=new Uint8Array(await file.slice(0,8).arrayBuffer());
 const isZip=head[0]===0x50&&head[1]===0x4b,isCnd=pmTd.decode(head.subarray(0,6))==='CNDPM1';
 if(isCnd){const pw=await askPass('This backup is encrypted. Enter its password.');if(pw==null)return null;
  const z=await pmBackupOpen(new Uint8Array(await file.arrayBuffer()),pw);return pmFromZip(z)}
 if(isZip||n.endsWith('.zip'))return pmFromZip(new Uint8Array(await file.arrayBuffer()));
 const text=await file.text(),t=text.trimStart();
 if(t[0]==='{'||t[0]==='['){let j;try{j=JSON.parse(text)}catch{throw Error('That file is not valid JSON.')}
  if(j&&j.format==='conduint-authenticator')throw Error('Use Import from Authenticator for Authenticator backups.');
  return{...pmFromBwJson(j),att:new Map(),src:'JSON file'}}
 return{...pmFromCsv(text),att:new Map(),src:'CSV'}}
async function pmFromZip(u8){
 const ents=await pmZipRead(u8.buffer.byteLength===u8.length?u8.buffer:u8.slice().buffer),dj=ents.find(e=>/(^|\/)data\.json$/i.test(e.name));
 if(!dj)throw Error('That zip has no data.json. Use a password export (.zip with attachments).');
 const data=pmFromBwJson(JSON.parse(pmTd.decode(await dj.get()))),att=new Map();
 for(const e of ents){const m=/(?:^|\/)attachments\/([^/]+)\/(.+)$/.exec(e.name);if(!m)continue;
  if(!att.has(m[1]))att.set(m[1],[]);att.get(m[1]).push({fileName:m[2],get:e.get})}
 return{...data,att,src:'zip file'}}

/* [9] EXPORT */
const pmFolderName=id=>{const f=PM.folders.find(x=>x.id===id);return f?f.name:''};
function pmBwItem(it){/* the exact Bitwarden export shape; attachments are not part of the JSON (they go in the zip) */
 const o={id:it.id,organizationId:null,folderId:it.folderId||null,type:it.type,reprompt:it.reprompt||0,name:it.name,notes:it.notes||null,favorite:!!it.favorite,
  fields:(it.fields||[]).map(f=>({name:f.name,value:f.value,type:f.type,linkedId:null})),
  collectionIds:null,revisionDate:it.revisionDate,creationDate:it.creationDate,deletedDate:it.deletedDate||null};
 if(it.passwordHistory&&it.passwordHistory.length)o.passwordHistory=it.passwordHistory;
 if(it.type===1)o.login={uris:(it.login.uris||[]).filter(u=>u.uri).map(u=>({match:u.match==null?null:u.match,uri:u.uri})),username:it.login.username||null,password:it.login.password||null,totp:it.login.totp||null};
 if(it.type===2)o.secureNote={type:0};
 if(it.type===3)o.card={cardholderName:it.card.cardholderName||null,brand:it.card.brand||null,number:it.card.number||null,expMonth:it.card.expMonth||null,expYear:it.card.expYear||null,code:it.card.code||null};
 if(it.type===4){o.identity={};PM_ID_KEYS.forEach(k=>o.identity[k]=it.identity[k]||null)}
 if(it.type===5)o.sshKey={privateKey:it.sshKey.privateKey||null,publicKey:it.sshKey.publicKey||null,keyFingerprint:it.sshKey.keyFingerprint||null};
 return o}
const pmExportObj=(withTrash)=>({encrypted:false,folders:PM.folders.map(f=>({id:f.id,name:f.name})),items:PM.items.filter(i=>withTrash||!i.deletedDate).map(pmBwItem)});
const pmExportJson=()=>JSON.stringify(pmExportObj(false),null,2);
function pmExportCsv(){
 const head='folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',rows=[head];
 for(const it of PM.items.filter(i=>!i.deletedDate&&(i.type===1||i.type===2))){
  const l=it.login;
  rows.push([pmFolderName(it.folderId),it.favorite?1:'',it.type===1?'login':'note',it.name,it.notes||'',(it.fields||[]).map(f=>f.name+': '+f.value).join('\n'),it.reprompt||'',
   l?l.uris.map(u=>u.uri).filter(Boolean).join('\n'):'',l?l.username:'',l?l.password:'',l?l.totp:''].map(pmCsvCell).join(','))}
 return rows.join('\n')}
const pmSafeName=s=>String(s||'file').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)||'file';
async function pmExportZip(onTick){
 const files=[{name:'data.json',data:pmTe.encode(pmExportJson())}];let skipped=0;
 for(const it of PM.items.filter(i=>!i.deletedDate)){
  const used=new Set();
  for(const a of it.attachments||[]){
   try{if(onTick)onTick(a.fileName);const b=new Uint8Array(await (await pmAttGet(a)).arrayBuffer());let n=pmSafeName(a.fileName),k=2;while(used.has(n))n=k++ +'_'+pmSafeName(a.fileName);used.add(n);files.push({name:'attachments/'+it.id+'/'+n,data:b})}
   catch{skipped++}}}
 return{blob:pmZipMake(files),skipped}}
/* Conduint encrypted backup: "CNDPM1" + salt(16) + iv(12) + AES-GCM(zip). Key = PBKDF2-SHA256(password, 600k). Holds items, folders and attachments. */
async function pmBackupKey(pw,salt){const b=await crypto.subtle.importKey('raw',pmTe.encode(pw.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:PMITER},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function pmBackupMake(pw,onTick){
 const z=await pmExportZip(onTick),zb=new Uint8Array(await z.blob.arrayBuffer()),salt=pmRnd(16),k=await pmBackupKey(pw,salt),iv=pmRnd(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,zb));
 const head=pmTe.encode('CNDPM1'),o=new Uint8Array(6+16+12+ct.length);o.set(head);o.set(salt,6);o.set(iv,22);o.set(ct,34);
 return{blob:new Blob([o],{type:'application/octet-stream'}),skipped:z.skipped}}
async function pmBackupOpen(u8,pw){
 try{const k=await pmBackupKey(pw,u8.slice(6,22));return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:u8.slice(22,34)},k,u8.subarray(34)))}
 catch{throw Error('Wrong backup password, or the file is damaged.')}}

/* [10] GENERATOR, STRENGTH, HEALTH */
const PM_GEN_DEF={mode:'pw',len:20,up:true,low:true,num:true,sym:true,minNum:1,minSym:1,amb:false,words:5,sep:'-',cap:true,wnum:false};
function pmGenPw(o){
 o={...PM_GEN_DEF,...o};const len=Math.max(5,Math.min(128,+o.len||20));
 let U='ABCDEFGHIJKLMNOPQRSTUVWXYZ',L='abcdefghijklmnopqrstuvwxyz',N='0123456789',Sy='!@#$%^&*';
 if(!o.amb){U=U.replace(/[IO]/g,'');L=L.replace(/l/g,'');N=N.replace(/[01]/g,'')}
 const pools=[];if(o.up)pools.push(U);if(o.low)pools.push(L);if(o.num)pools.push(N);if(o.sym)pools.push(Sy);
 if(!pools.length)pools.push(L);
 const out=[];
 if(o.num)for(let i=0;i<Math.max(0,+o.minNum||0)&&out.length<len;i++)out.push(N[pmRand(N.length)]);
 if(o.sym)for(let i=0;i<Math.max(0,+o.minSym||0)&&out.length<len;i++)out.push(Sy[pmRand(Sy.length)]);
 for(const p of pools)if(out.length<len&&!out.some(c=>p.includes(c)))out.push(p[pmRand(p.length)]);
 const all=pools.join('');while(out.length<len)out.push(all[pmRand(all.length)]);
 for(let i=out.length-1;i>0;i--){const j=pmRand(i+1);[out[i],out[j]]=[out[j],out[i]]}
 return out.join('')}
function pmGenPhrase(o){
 o={...PM_GEN_DEF,...o};const n=Math.max(3,Math.min(20,+o.words||5)),w=[];
 for(let i=0;i<n;i++){let x=PMWORDS[pmRand(PMWORDS.length)];if(o.cap)x=x[0].toUpperCase()+x.slice(1);w.push(x)}
 if(o.wnum){const i=pmRand(n);w[i]+=pmRand(10)}
 return w.join(o.sep==null?'-':o.sep)}
const pmGen=o=>(o&&o.mode==='phrase')?pmGenPhrase(o):pmGenPw(o);
const PM_COMMON=new Set('password 123456 12345678 123456789 qwerty abc123 password1 111111 iloveyou admin welcome letmein monkey dragon football baseball sunshine princess 1234567 12345 qwerty123 000000 passw0rd p@ssw0rd 654321 master hello freedom whatever trustno1 shadow superman michael jordan harley 1q2w3e4r zaq12wsx login starwars'.split(' '));
/* entropy estimate in bits, 0..4 score */
function pmStrength(pw){
 pw=String(pw||'');if(!pw)return{bits:0,score:0,label:''};
 if(PM_COMMON.has(pw.toLowerCase()))return{bits:8,score:0,label:'Very weak'};
 let pool=0;if(/[a-z]/.test(pw))pool+=26;if(/[A-Z]/.test(pw))pool+=26;if(/[0-9]/.test(pw))pool+=10;if(/[^A-Za-z0-9]/.test(pw))pool+=33;
 let bits=pw.length*Math.log2(Math.max(2,pool));
 const uniq=new Set(pw).size;bits-=(pw.length-uniq)*Math.log2(Math.max(2,pool))*.6;
 let seq=0;for(let i=2;i<pw.length;i++){const a=pw.charCodeAt(i-2),b=pw.charCodeAt(i-1),c=pw.charCodeAt(i);if(b-a===1&&c-b===1||a-b===1&&b-c===1)seq++}
 bits-=seq*Math.log2(Math.max(2,pool))*.8;
 if(/^[a-zA-Z]+\d{1,4}[!@#$%^&*]?$/.test(pw)&&pw.length<14)bits-=10;
 if(/^[A-Za-z]+(-[A-Za-z]+)+\d?$/.test(pw)&&pw.length>14)bits=Math.min(bits,pw.split('-').length*11);
 bits=Math.max(0,Math.round(bits));
 const score=bits<28?0:bits<40?1:bits<60?2:bits<80?3:4;
 return{bits,score,label:['Very weak','Weak','Good','Strong','Excellent'][score]}}
const pmUrl=it=>{const u=it.login&&it.login.uris.find(x=>x.uri);return u?u.uri:''};
function pmHealth(){
 const live=PM.items.filter(i=>!i.deletedDate&&i.type===1),by={};
 live.forEach(i=>{const p=i.login.password;if(p)(by[p]=by[p]||[]).push(i)});
 return{
  reused:live.filter(i=>i.login.password&&by[i.login.password].length>1),
  weak:live.filter(i=>i.login.password&&pmStrength(i.login.password).score<=1),
  http:live.filter(i=>i.login.uris.some(u=>/^http:\/\//i.test(u.uri))),
  no2fa:live.filter(i=>!i.login.totp&&i.login.uris.some(u=>u.uri)&&i.login.password),
  empty:live.filter(i=>!i.login.password)}}
async function pmSha1Hex(s){return[...new Uint8Array(await crypto.subtle.digest('SHA-1',pmTe.encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()}
/* only the first 5 characters of the SHA-1 leave the phone (k-anonymity); returns how many times a password appears in known breaches */
async function pmPwned(pw){const h=await pmSha1Hex(pw),r=await fetch('https://api.pwnedpasswords.com/range/'+h.slice(0,5),{headers:{'Add-Padding':'true'}});
 if(!r.ok)throw Error('The breach check could not be reached.');const t=await r.text(),s=h.slice(5);
 for(const l of t.split('\n')){const[a,b]=l.trim().split(':');if(a===s)return+b||0}return 0}

/* [11] SEARCH AND FILTERS */
function pmSub(it){
 if(it.type===1)return it.login.username||'';
 if(it.type===3){const n=(it.card.number||'').replace(/\s/g,'');return[it.card.brand,n?'*'+n.slice(-4):''].filter(Boolean).join(', ')}
 if(it.type===4)return[it.identity.firstName,it.identity.lastName].filter(Boolean).join(' ');
 if(it.type===5)return it.sshKey.keyFingerprint||'';
 return''}
function pmMatch(it,q){
 q=q.trim().toLowerCase();if(!q)return true;
 const hay=[it.name,pmSub(it),it.notes,...(it.login?it.login.uris.map(u=>u.uri):[]),...(it.fields||[]).map(f=>f.name),...(it.attachments||[]).map(a=>a.fileName),it.identity?[it.identity.email,it.identity.company,it.identity.phone].join(' '):''].join('\n').toLowerCase();
 return q.split(/\s+/).every(w=>hay.includes(w))}
const pmCmp=(a,b)=>String(a.name).localeCompare(String(b.name),undefined,{sensitivity:'base',numeric:true});
function pmList(){
 const f=PM.flt;let L=PM.items.filter(i=>f==='trash'?!!i.deletedDate:!i.deletedDate);
 if(f==='fav')L=L.filter(i=>i.favorite);
 else if(typeof f==='string'&&f.startsWith('t:'))L=L.filter(i=>i.type===+f.slice(2));
 else if(typeof f==='string'&&f.startsWith('f:')){const id=f.slice(2);L=L.filter(i=>id===''?!i.folderId:i.folderId===id)}
 else if(f==='att')L=L.filter(i=>(i.attachments||[]).length);
 if(PM.q)L=L.filter(i=>pmMatch(i,PM.q));
 return L.sort(pmCmp)}
