/* authx.js: Authenticator extras (V0.22.0, card/PIN scan V0.31.0). Groups, multi-item secrets, A to Z order, and the CSV / text extractor.
   Pure functions, no DOM. auth.js calls these. Needs auDomain, auMkTotp from auth.js at call time. */
const AUX_MULTI=['bak','rec','ssh','note','pass2','api','card'];
const auxMulti=t=>AUX_MULTI.includes(t);
const auxCmp=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'});
const auxName=a=>(a.issuer||a.name||a.email||'').trim();
const auxGroupOf=a=>(a.group||'').trim();

/* ---- items: every code, key, SSH pair or note is its own item {t:label, v:value, pub, prv, n, u:used} ---- */
function auxItems(a){
 if(Array.isArray(a.items))return a.items;
 const t=a.type;
 if(t==='bak'){const u=a.used||[];return(a.codes||'').split('\n').map(s=>s.trim()).filter(Boolean).map(c=>({t:'',v:c,u:u.includes(c)?1:0}))}
 if(t==='ssh')return(a.pubkey||a.privkey)?[{t:'',pub:a.pubkey||'',prv:a.privkey||''}]:[];
 if(t==='note'||t==='pass2')return a.note?[{t:'',v:a.note}]:[];
 if(t==='api')return a.secret?[{t:'',v:a.secret,n:a.note||''}]:[];
 return[]}
const auxMat=a=>{if(!Array.isArray(a.items))a.items=auxItems(a);return a.items};
/* keep the old single-value fields in step so older builds, search and de-duplication still work */
function auxSync(a){const it=a.items||[];
 if(a.type==='bak'){a.codes=it.map(i=>i.v).join('\n');a.used=it.filter(i=>i.u).map(i=>i.v)}
 else if(a.type==='ssh'){a.pubkey=(it[0]&&it[0].pub)||'';a.privkey=(it[0]&&it[0].prv)||''}
 else if(a.type==='note'||a.type==='pass2')a.note=it.map(i=>(i.t?i.t+'\n':'')+(i.v||'')).join('\n\n');
 else if(a.type==='api'){a.secret=(it[0]&&it[0].v)||'';a.note=(it[0]&&it[0].n)||''}
 return a}
const auxItemKey=i=>i.t||i.v||i.pub||i.prv||'';
const auxItemOrder=(items,mode)=>{const ix=items.map((_,i)=>i);if(mode!=='added')ix.sort((p,q)=>auxCmp(auxItemKey(items[p]),auxItemKey(items[q]))||p-q);return ix};
const auxOrder=(list,idxs,mode)=>{const ix=idxs.slice();if(mode==='added')return ix;return ix.sort((p,q)=>auxCmp(auxName(list[p]),auxName(list[q]))||auxCmp(list[p].name,list[q].name)||p-q)};
/* ---- groups: a group is just a name on each account, so backups and old builds carry it with no format change ---- */
function auxGroups(list,extra){const m=new Map();list.forEach(a=>{const g=auxGroupOf(a);if(g)m.set(g,(m.get(g)||0)+1)});
 (extra||[]).forEach(g=>{if(g&&![...m.keys()].some(k=>k.toLowerCase()===String(g).toLowerCase()))m.set(g,0)});return[...m.entries()].sort((x,y)=>auxCmp(x[0],y[0]))}
function auxCanon(list,name){name=(name||'').trim().replace(/\s+/g,' ').slice(0,40);if(!name)return'';const l=name.toLowerCase();for(const a of list){const g=auxGroupOf(a);if(g.toLowerCase()===l)return g}return name}
function auxSetGroup(a,g){if(g)a.group=g;else delete a.group}
/* ---- the extractor: pulls SSH keys, recovery keys and backup codes out of any text ---- */
const AUX_PRIV=/-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/g;
const AUX_PUB=/(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)[ \t]+[A-Za-z0-9+\/=]{16,}(?:[ \t]+[^\s]+)?/g;
const AUX_KEYKW=/\b(?:(?:recovery|emergency|rescue|restore|backup|encryption|decryption|master)\s+(?:key|phrase|passphrase|seed)s?|seed\s+(?:phrase|words?)|mnemonic|bitlocker)\b/i;
const AUX_CODEHD=/\b(?:backup|recovery|reset|scratch|emergency|one[\s-]?time|2fa|two[\s-]?factor|authenticator)[\s\w-]{0,24}?\bcodes?\b/i;
const AUX_PAT=[[/\b(?:\d{6}-){7}\d{6}\b/,'BitLocker key'],[/\b(?:[A-Z0-9]{4}-){6}[A-Z0-9]{4}\b/,'Recovery key']];
function auxIsCode(p){p=p.replace(/^["'(\[]+|["'.,;:)\]]+$/g,'');
 if(/^\d{8,12}$/.test(p))return true;
 if(/^[A-Za-z0-9]{3,8}(?:-[A-Za-z0-9]{3,8}){1,3}$/.test(p)&&p.length>=8)return(/[A-Za-z]/.test(p)&&/\d/.test(p))||/^\d{4,5}-\d{4,5}$/.test(p);
 if(/^[A-Za-z0-9]{8,12}$/.test(p))return/[A-Za-z]/.test(p)&&/\d/.test(p);
 return false}
function auxTokens(str){
 const t=String(str).trim().replace(/^(?:[-*•·]|\d{1,3}[.)])\s+/,'');if(!t)return null;
 if(/^\d{4}\s\d{4}$/.test(t))return[t];
 const parts=t.split(/[\s,;]+/).filter(Boolean);
 return parts.length&&parts.every(auxIsCode)?parts.map(p=>p.replace(/^["'(\[]+|["'.,;:)\]]+$/g,'')):null}
function auxExtract(text){
 let s=String(text||'').replace(/\r\n?/g,'\n');
 if(/-----BEGIN[^\n]*\\n/.test(s))s=s.replace(/\\r\\n|\\n/g,'\n');
 const out={codes:[],keys:[],ssh:[],rest:''},prv=[],pub=[];
 s=s.replace(AUX_PRIV,m=>{prv.push(m.trim());return'\n'}).replace(AUX_PUB,m=>{pub.push(m.trim());return'\n'});
 const cm=p=>p?(p.split(/\s+/)[2]||''):'';
 if(prv.length===pub.length)prv.forEach((k,i)=>out.ssh.push({t:cm(pub[i]),pub:pub[i],prv:k}));
 else{prv.forEach(k=>out.ssh.push({t:'',pub:'',prv:k}));pub.forEach(p=>out.ssh.push({t:cm(p),pub:p,prv:''}))}
 const L=s.split('\n'),keep=L.map(()=>true);
 for(let i=0;i<L.length;i++){if(!keep[i])continue;const ln=L[i];if(!ln.trim())continue;
  let hit=false;
  for(const[re,nm]of AUX_PAT){const m=re.exec(ln);if(m){const pre=ln.slice(0,m.index).replace(/[\s:=\-]+$/,'').trim(),post=ln.slice(m.index+m[0].length).trim();
    out.keys.push({t:pre&&pre.length<=40?pre:nm,v:m[0]});if(!post&&(!pre||pre.length<=40))keep[i]=false;else L[i]=(pre.length>40?pre+' ':'')+post;hit=true;break}}
  if(hit)continue;
  if(AUX_KEYKW.test(ln)&&ln.length<400&&!AUX_CODEHD.test(ln)){
   const m=/^\s*(?:[-*•]\s*)?([^:=\n]{2,60}?)\s*[:=]\s*(\S.*)$/.exec(ln);
   if(m&&AUX_KEYKW.test(m[1])){out.keys.push({t:m[1].trim(),v:m[2].trim()});keep[i]=false;continue}
   if(!m&&ln.trim().length<60){let j=i+1;while(j<L.length&&!L[j].trim())j++;
    if(j<L.length&&keep[j]&&L[j].trim().length<=400&&!/^[^:]{1,40}:\s/.test(L[j])){out.keys.push({t:ln.replace(/[:\-\s]+$/,'').trim(),v:L[j].trim()});keep[i]=false;keep[j]=false;i=j}}}}
 let run=[],idx=[],ctx=false,hd=-1;
 const flush=()=>{if(run.length>=3||(ctx&&run.length>=1)){out.codes.push(...run);idx.forEach(k=>keep[k]=false);if(hd>=0&&ctx)keep[hd]=false}run=[];idx=[]};
 for(let i=0;i<L.length;i++){if(!keep[i])continue;const t=L[i].trim();if(!t)continue;
  const c=t.indexOf(':');
  if(c>0&&AUX_CODEHD.test(t.slice(0,c))){flush();const tk=auxTokens(t.slice(c+1));
   if(tk){out.codes.push(...tk);keep[i]=false;ctx=true;hd=-1;continue}
   if(!t.slice(c+1).trim()){ctx=true;hd=i;continue}}
  else if(AUX_CODEHD.test(t)&&t.length<60&&!auxTokens(t)){flush();ctx=true;hd=i;continue}
  const tk=auxTokens(t);
  if(tk){run.push(...tk);idx.push(i)}else{flush();ctx=false;hd=-1}}
 flush();
 out.codes=[...new Set(out.codes)];
 out.rest=L.filter((_,i)=>keep[i]).filter(l=>!/^\s*(?:public|private)?\s*(?:ssh\s*)?keys?\s*:?\s*$/i.test(l)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 return out}
/* ---- V0.31.0 card and PIN scan: card numbers (Luhn), CVC/CVV, expiry, cardholder, PINs. Anything it cannot place stays in the note, so nothing is lost ---- */
function auxLuhn(d){d=String(d).replace(/\D/g,'');if(d.length<13||d.length>19)return false;let s=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt){n*=2;if(n>9)n-=9}s+=n;alt=!alt}return s%10===0}
const AUX_CARDNUM=/(?:\d[ -]?){13,19}/g;
function auxCardScan(text){
 const src=String(text||'').replace(/\r\n?/g,'\n'),L=src.split('\n'),items=[],seen=new Set(),keep=L.map(()=>true);
 const add=(t,v)=>{v=String(v).trim();if(!v)return;const k=t+'\u0001'+v;if(seen.has(k))return;seen.add(k);items.push({t,v})};
 const numIn=ln=>{AUX_CARDNUM.lastIndex=0;let m;while((m=AUX_CARDNUM.exec(ln))){const d=m[0].replace(/\D/g,'');if(auxLuhn(d))return{raw:m[0].trim(),d,at:m.index}}return null};
 const strong=L.some(l=>numIn(l))||/\b(?:card\s*(?:number|no)|cardnumber|cvc2?|cvv2?|security\s*code)\b/i.test(src);
 let em='',ey='';
 const LAB=/^\s*(?:[-*\u2022]\s*)?([^:=\n]{1,40}?)\s*[:=]\s*(\S.*)$/;
 for(let i=0;i<L.length;i++){const ln=L[i];if(!ln.trim())continue;
  const m=LAB.exec(ln);
  if(m){const k=m[1].trim().toLowerCase().replace(/[\s_-]+/g,' '),v=m[2].trim();let done=true;
   if(/^(?:card ?number|cardnumber|card no|number)$/.test(k)&&strong&&/^[\d -]{12,23}$/.test(v)&&auxLuhn(v))add('Card number',v);
   else if(/^(?:cvc2?|cvv2?|cid|csc|cvn|security code|card security code|card code|card verification(?: value| code)?)$/.test(k)&&/^\d{3,4}$/.test(v))add('CVC',v);
   else if(k==='code'&&strong&&/^\d{3,4}$/.test(v))add('CVC',v);
   else if(k==='expmonth'||k==='exp month')em=v;
   else if(k==='expyear'||k==='exp year')ey=v;
   else if(/^(?:exp|expiry|expires|expiration|expiry date|expiration date|exp date|valid thru|valid through|valid until)$/.test(k)&&/\d/.test(v))add('Expiry',v);
   else if(/^(?:cardholder ?name|cardholder|card holder|name on card)$/.test(k)&&strong)add('Cardholder',v);
   else if(k==='brand'&&strong)add('Brand',v);
   else if(/(?:^|\s)(?:pin|puk)$/.test(k)&&v.length<=20&&!/\s{2,}/.test(v))add(k.replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bPin\b/,'PIN').replace(/\bPuk\b/,'PUK').replace(/\bAtm\b/,'ATM').replace(/\bSim\b/,'SIM'),v);
   else done=false;
   if(done){keep[i]=false;continue}}
  const n=numIn(ln);
  if(n&&strong){add('Card number',n.raw);const rest=(ln.slice(0,n.at)+' '+ln.slice(n.at+n.raw.length)).replace(/\s+/g,' ').replace(/^[\s:=-]+|[\s:=-]+$/g,'');
   const rl=rest.toLowerCase().replace(/[^a-z ]/g,'').trim();
   if(!rest||/^(?:card|card number|card no|number|visa|mastercard|amex|debit|credit)$/.test(rl))keep[i]=false;else L[i]=rest}
  const cv=/\b(?:cvc2?|cvv2?|cid|security code)\b[\s:=#-]*(\d{3,4})\b/i.exec(L[i]);
  if(cv){add('CVC',cv[1]);const r2=L[i].replace(cv[0],' ').replace(/\s+/g,' ').trim();if(!r2||/^[,;/|\s-]*$/.test(r2))keep[i]=false;else L[i]=r2}
  const ex=/\b(?:exp(?:iry|ires)?(?:\s*date)?|valid\s*(?:thru|through|until))\b[\s:=-]*((?:0?[1-9]|1[0-2])\s*\/\s*(?:\d{2}|\d{4}))\b/i.exec(L[i]);
  if(ex){add('Expiry',ex[1].replace(/\s+/g,''));const r3=L[i].replace(ex[0],' ').replace(/\s+/g,' ').trim();if(!r3||/^[,;/|\s-]*$/.test(r3))keep[i]=false;else L[i]=r3}
  const pn=/^\s*(?:[-*\u2022]\s*)?((?:[A-Za-z]+\s){0,2}(?:pin|puk))\s+(\d{4,12})\s*$/i.exec(L[i]);
  if(pn&&keep[i]){add(pn[1].replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bPin\b/,'PIN').replace(/\bPuk\b/,'PUK'),pn[2]);keep[i]=false}}
 if(em&&ey)add('Expiry',em.padStart(2,'0')+'/'+ey);else if(em)add('Expiry month',em);else if(ey)add('Expiry year',ey);
 return{items,rest:L.filter((_,i)=>keep[i]).join('\n').replace(/\n{3,}/g,'\n\n').trim()}}
/* ---- one source row -> entries ---- */
function auxRowEntries(r){
 const link=(r.url||'').trim(),host=auDomain(link),user=(r.user||'').trim(),title=((r.title||host||user||'').trim())||'Untitled',g=auxCanon([],r.group);
 const txt=[r.note||''].concat(r.extra||[]).filter(Boolean).join('\n'),cs=auxCardScan(txt),ex=auxExtract(cs.rest);
 const base=()=>{const b={issuer:title,name:user,fullname:'',email:/@/.test(user)?user:'',link:host?link:''};if(g)b.group=g;return b};
 const out=[];
 if(r.pw)out.push(Object.assign({type:'pass'},base(),{secret:r.pw,note:ex.rest}));
 if(r.totp){const t=auMkTotp(title,user,r.totp);if(t){t.link=host?link:'';if(g)t.group=g;out.push(t)}else r.badTotp=1}
 if(!r.pw&&ex.rest)out.push(auxSync(Object.assign({type:'note'},base(),{items:[{t:'',v:ex.rest}]})));
 if(ex.codes.length)out.push(auxSync(Object.assign({type:'bak'},base(),{items:ex.codes.map(c=>({t:'',v:c,u:0}))})));
 if(ex.keys.length)out.push(auxSync(Object.assign({type:'rec'},base(),{items:ex.keys.map(k=>({t:k.t,v:k.v}))})));
 if(ex.ssh.length)out.push(auxSync(Object.assign({type:'ssh'},base(),{items:ex.ssh})));
 if(cs.items.length)out.push(auxSync(Object.assign({type:'card'},base(),{items:cs.items})));
 /* V0.31.0: keep the untouched original text whenever the splitter pulled something out of it, so the profile can always show it whole */
 if(out.length&&txt.trim()&&ex.rest!==txt.trim())out[0].orig=txt.trim().slice(0,20000);
 return out}
function auxBlob(text,title){const r=auxRowEntries({title:title||'Imported',note:text});return{items:r,skipped:r.length?0:1}}
/* ---- CSV: every column is kept. Known ones map to fields, the rest become note lines, nothing is dropped ---- */
const AUX_C={title:['name','title','login_name','site','account name','account','item name','service','label'],
 url:['url','login_uri','uri','website','web site','login url','address','web address','urls'],
 user:['username','login_username','user','user name','login name','login','email','e-mail','email address','login_email'],
 pass:['password','login_password','pass'],
 note:['notes','note','extra','comments','comment','secure note','memo'],
 totp:['totp','login_totp','otp','otpauth','2fa','one-time password','totp secret'],
 group:['folder','grouping','group','vault','collection','folders','group name'],
 type:['type','item type','category'],
 fields:['fields','custom fields']};
const AUX_SKIP=['favorite','fav','reprompt','createtime','modifytime','created','modified','date created','date modified','last modified','last used','times used'];
function auxFromCsv(text,rows,fname){
 const hd=rows[0].map(s=>s.trim().toLowerCase()),used=new Set();
 const all=k=>AUX_C[k].map(n=>hd.indexOf(n)).filter(i=>i>=0);
 const C={};for(const k in AUX_C){C[k]=all(k);C[k].forEach(i=>{if(k!=='user'||true)used.add(i)})}
 const known=['title','url','user','pass','note','totp'].filter(k=>C[k].length).length;
 if(known<2||!(C.pass.length||C.totp.length||C.note.length))return auxBlob(text,fname);
 const out=[];let skipped=0;
 for(const r of rows.slice(1)){
  const g=i=>i!=null&&i>=0&&r[i]!=null?r[i].trim():'',first=k=>{for(const i of C[k]){const v=g(i);if(v)return v}return''};
  const ty=first('type').toLowerCase(),url=first('url'),extra=[];
  C.fields.forEach(i=>{if(g(i))extra.push(g(i))});
  C.url.slice(1).forEach(i=>{if(g(i))extra.push('URL: '+g(i))});
  C.user.slice(1).forEach(i=>{if(g(i)&&g(i)!==first('user'))extra.push(hd[i]+': '+g(i))});
  C.title.slice(1).forEach(i=>{if(g(i)&&g(i)!==first('title'))extra.push(hd[i]+': '+g(i))});
  hd.forEach((n,i)=>{if(!used.has(i)&&!AUX_SKIP.includes(n)&&g(i))extra.push((rows[0][i]||'Column '+(i+1)).trim()+': '+g(i))});
  const isNote=/note/.test(ty)||url==='http://sn',login=!ty||/login|password|website|credential/.test(ty);
  const o={title:first('title'),url:isNote?'':url,user:first('user'),pw:(!isNote&&C.pass.length)?(r[C.pass[0]]||''):'',note:first('note'),totp:first('totp'),group:first('group'),extra};
  if(!login&&!isNote){const t=o.title;o.pw='';o.url='';o.user='';o.title=t||ty}
  const e=auxRowEntries(o);if(!e.length||o.badTotp)skipped++;out.push(...e)}
 return{items:out,skipped}}
/* ---- Bitwarden JSON: folders become groups, custom fields, cards and identities are kept ---- */
function auxFromBw(o){
 if(o.encrypted)throw Error('That export is encrypted. Export it unencrypted.');
 const fol={};(o.folders||[]).forEach(f=>fol[f.id]=f.name);const out=[];let skipped=0;
 const lines=(obj,skip)=>Object.keys(obj||{}).filter(k=>obj[k]&&!(skip||[]).includes(k)).map(k=>k+': '+obj[k]);
 for(const it of o.items||[]){
  const extra=(it.fields||[]).filter(f=>f&&f.value).map(f=>(f.name||'Field')+': '+f.value);
  const r={title:it.name,note:it.notes||'',group:fol[it.folderId]||'',extra};
  if(it.type===1&&it.login){const l=it.login,u=(l.uris||[]).map(x=>x.uri).filter(Boolean);Object.assign(r,{url:u[0]||'',user:l.username||'',pw:l.password||'',totp:l.totp||''});u.slice(1).forEach(x=>extra.push('URL: '+x))}
  else if(it.type===3)extra.push(...lines(it.card));
  else if(it.type===4)extra.push(...lines(it.identity));
  else if(it.type!==2){skipped++;continue}
  const e=auxRowEntries(r);if(!e.length||r.badTotp)skipped++;out.push(...e)}
 return{items:out,skipped}}
