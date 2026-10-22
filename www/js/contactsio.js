/* contactsio.js (V0.46.0): Contacts export and import for the Contacts screen (contacts.js).
   Export: vCard 3.0 (.vcf, every field) or CSV (.csv, names, phones, emails, addresses, websites, birthday, notes).
   Import: .vcf (vCard 2.1, 3.0, 4.0, QUOTED-PRINTABLE, Apple item groups) or .csv (Conduint, Google and Outlook style headers).
   Imported contacts are saved through the same Contacts.save the editor uses, so nothing native changed. Duplicates (same phone number,
   same email, or same name) can be skipped. Files are written with auSaveOut (folder picker in the app, a download in a browser).
   Strategy Over Impulse. */
(()=>{
 const S=v=>(v==null?'':String(v));
 const PTN={1:'Home',2:'Mobile',3:'Work',4:'Work fax',5:'Home fax',6:'Pager',7:'Other',8:'Callback',9:'Car',10:'Company main',12:'Main',17:'Work mobile',19:'Assistant'};
 const ETN={1:'Home',2:'Work',3:'Other',4:'Mobile'},ATN={1:'Home',2:'Work',3:'Other'};
 const WTN={1:'Homepage',2:'Blog',3:'Profile',4:'Home',5:'Work',7:'Other'};
 const RTN={14:'Spouse',10:'Partner',4:'Domestic partner',5:'Father',8:'Mother',9:'Parent',3:'Child',2:'Brother',13:'Sister',12:'Relative',6:'Friend',7:'Manager',1:'Assistant',11:'Referred by'};
 const rev=m=>{const o={};for(const k in m)o[m[k].toLowerCase()]=+k;return o};
 const PNR={...rev(PTN),cell:2,fax:4,'work cell':17,iphone:2,telephone:3},ENR={...rev(ETN),personal:1,private:1},ANR=rev(ATN),WNR={...rev(WTN),website:1,'web page':1},RNR=rev(RTN);
 const blank=()=>({id:'',raw:'',first:'',middle:'',last:'',prefix:'',suffix:'',nickname:'',company:'',department:'',title:'',notes:'',phones:[],emails:[],addresses:[],events:[],websites:[],relations:[],starred:false});
 const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())};
 const dispName=c=>[c.prefix,c.first,c.middle,c.last,c.suffix].filter(Boolean).join(' ').trim()||c.name||c.company||'';

 /* ---------- vCard export (3.0) ---------- */
 const esc=s=>S(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 const fold=l=>{const a=Array.from(l);if(a.length<=70)return l;const o=[a.slice(0,70).join('')];for(let i=70;i<a.length;i+=69)o.push(' '+a.slice(i,i+69).join(''));return o.join('\r\n')};
 const PTYPE={1:'HOME',2:'CELL',3:'WORK',4:'FAX,WORK',5:'FAX,HOME',6:'PAGER',7:'OTHER',8:'X-CALLBACK',9:'CAR',10:'X-COMPANY-MAIN',12:'MAIN',17:'WORK,CELL',19:'X-ASSISTANT'};
 const ETYPE={1:'HOME',2:'WORK',3:'OTHER',4:'MOBILE'},ATYPE={1:'HOME',2:'WORK',3:'OTHER'},WTYPE={1:'HOMEPAGE',2:'BLOG',3:'PROFILE',4:'HOME',5:'WORK',7:'OTHER'};
 function toVcf(x){
  const L=['BEGIN:VCARD','VERSION:3.0'];let g=0;
  const put=(name,val,map,it)=>{const t=+it.t,lab=S(it.l).trim();
   if(t===0&&lab){const k='item'+(++g);L.push(k+'.'+name+':'+val,k+'.X-ABLabel:'+esc(lab))}
   else L.push(name+(map&&map[t]?';TYPE='+map[t]:'')+':'+val)};
  L.push('N:'+[x.last,x.first,x.middle,x.prefix,x.suffix].map(esc).join(';'));
  L.push('FN:'+esc(dispName(x)||(x.phones[0]&&x.phones[0].v)||'Unnamed'));
  if(x.nickname)L.push('NICKNAME:'+esc(x.nickname));
  if(x.company||x.department)L.push('ORG:'+esc(x.company)+(x.department?';'+esc(x.department):''));
  if(x.title)L.push('TITLE:'+esc(x.title));
  x.phones.forEach(p=>put('TEL',esc(p.v),PTYPE,p));
  x.emails.forEach(p=>put('EMAIL',esc(p.v),ETYPE,p));
  x.addresses.forEach(a=>put('ADR',[a.pobox,a.hood,a.street,a.city,a.region,a.postcode,a.country].map(esc).join(';'),ATYPE,a));
  x.websites.forEach(p=>put('URL',esc(p.v),WTYPE,p));
  let bd=false;
  x.events.forEach(e=>{const t=+e.t,v=S(e.v).trim();if(!v)return;
   if(t===3&&!bd){bd=true;L.push('BDAY:'+v)}
   else if(t===1)L.push('X-ANNIVERSARY:'+v);
   else{const lab=S(e.l).trim();if(t===0&&lab){const k='item'+(++g);L.push(k+'.X-DATE:'+v,k+'.X-ABLabel:'+esc(lab))}else L.push('X-DATE:'+v)}});
  x.relations.forEach(r=>{const k='item'+(++g),t=+r.t,lab=t===0?S(r.l).trim():RTN[t];L.push(k+'.X-ABRELATEDNAMES:'+esc(r.v));if(lab)L.push(k+'.X-ABLabel:'+(t===0?esc(lab):'_$!<'+lab+'>!$_'))});
  if(x.notes)L.push('NOTE:'+esc(x.notes));
  if(x.starred)L.push('X-FAVORITE:1');
  L.push('END:VCARD');
  return L.map(fold).join('\r\n')+'\r\n'}

 /* ---------- vCard import ---------- */
 const TD=new TextDecoder(),TE=new TextEncoder();
 const qpDec=s=>{const b=[];for(let i=0;i<s.length;i++){const c=s[i],h=s.slice(i+1,i+3);if(c==='='&&/^[0-9A-Fa-f]{2}$/.test(h)){b.push(parseInt(h,16));i+=2}else b.push(...TE.encode(c))}return TD.decode(new Uint8Array(b))};
 function unfold(text){
  const raw=S(text).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/),out=[];let qp=false;
  for(const ln of raw){
   if(qp&&out.length){out[out.length-1]=out[out.length-1].slice(0,-1)+ln;qp=/=$/.test(ln);continue}
   if(out.length&&/^[ \t]/.test(ln)){out[out.length-1]+=ln.slice(1);continue}
   out.push(ln);qp=/QUOTED-PRINTABLE/i.test(ln)&&/=$/.test(ln)}
  return out}
 function parseLine(ln){
  const i=ln.indexOf(':');if(i<1)return null;
  const parts=ln.slice(0,i).split(';');let name=parts.shift(),grp='';const d=name.indexOf('.');if(d>0){grp=name.slice(0,d);name=name.slice(d+1)}
  const types=new Set(),pr={};
  parts.forEach(p=>{const e=p.indexOf('=');if(e<0){types.add(p.toLowerCase());return}const k=p.slice(0,e).toLowerCase(),v=p.slice(e+1).replace(/^"|"$/g,'');
   if(k==='type')v.split(',').forEach(t=>types.add(t.toLowerCase().replace(/^"|"$/g,'')));else pr[k]=v});
  let val=ln.slice(i+1);if(/quoted-printable/i.test(pr.encoding||'')||types.has('quoted-printable'))val=qpDec(val);
  return{name:name.toUpperCase(),grp,types,pr,val}}
 const sc=v=>S(v).split(/(?<!\\);/);
 const un=s=>S(s).replace(/\\([nN,;\\])/g,(m,c)=>c==='n'||c==='N'?'\n':c);
 const cleanLab=s=>un(s).replace(/^_\$!<(.*)>!\$_$/,'$1').trim();
 function ymd(s){s=S(s).trim().replace(/T.*$/,'');let m,y,mo,d;
  if(m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s)){y=m[1];mo=+m[2];d=+m[3]}
  else if(m=/^--(\d{2})-?(\d{2})$/.exec(s)){y='';mo=+m[1];d=+m[2]}
  else if(m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s)){y=m[3];const a=+m[1],b=+m[2];if(b>12){mo=a;d=b}else{d=a;mo=b}}/* day first unless the second number cannot be a month */
  else return'';
  if(mo<1||mo>12||d<1||d>31)return'';const p=n=>String(n).padStart(2,'0');
  return(!y||y==='0000'||y==='1604')?'--'+p(mo)+'-'+p(d):y+'-'+p(mo)+'-'+p(d)}
 const phoneT=t=>{const h=x=>t.has(x);
  if(h('fax'))return h('home')?5:4;if(h('pager'))return 6;if(h('car'))return 9;if(h('x-callback')||h('callback'))return 8;if(h('x-assistant'))return 19;if(h('x-company-main'))return 10;
  if(h('cell')||h('mobile'))return h('work')?17:2;if(h('work'))return 3;if(h('home'))return 1;if(h('main'))return 12;if(h('other'))return 7;return 2};
 const mailT=t=>t.has('home')?1:t.has('work')?2:t.has('mobile')?4:3;
 const addrT=t=>t.has('work')?2:t.has('other')?3:1;
 const urlT=t=>t.has('blog')?2:t.has('profile')?3:t.has('work')?5:t.has('home')?4:t.has('other')?7:1;
 const typedItem=(v,L,map,fallbackT)=>{const key=L.toLowerCase();return(L&&map[key]!=null)?{v,t:map[key],l:''}:L?{v,t:0,l:L}:{v,t:fallbackT,l:''}};
 function buildVcf(P){
  const c=blank(),lab={};let fn='';
  P.forEach(p=>{if(p.name==='X-ABLABEL')lab[p.grp]=cleanLab(p.val)});
  for(const p of P){const v=p.val,L=(p.grp&&lab[p.grp])||'';
   switch(p.name){
    case'N':{const a=sc(v).map(un);c.last=a[0]||'';c.first=a[1]||'';c.middle=a[2]||'';c.prefix=a[3]||'';c.suffix=a[4]||'';break}
    case'FN':fn=un(v).trim();break;
    case'NICKNAME':c.nickname=un(v).trim();break;
    case'ORG':{const a=sc(v).map(un);c.company=(a[0]||'').trim();c.department=a.slice(1).filter(Boolean).join(' / ').trim();break}
    case'TITLE':c.title=un(v).trim();break;
    case'NOTE':c.notes=un(v);break;
    case'TEL':{const x=un(v).trim();if(x)c.phones.push(typedItem(x,L,PNR,phoneT(p.types)));break}
    case'EMAIL':{const x=un(v).trim();if(x)c.emails.push(typedItem(x,L,ENR,mailT(p.types)));break}
    case'URL':{const x=un(v).trim();if(x)c.websites.push(typedItem(x,L,WNR,urlT(p.types)));break}
    case'ADR':{const a=sc(v).map(un).map(s=>s.trim()),o={pobox:a[0]||'',hood:a[1]||'',street:a[2]||'',city:a[3]||'',region:a[4]||'',postcode:a[5]||'',country:a[6]||''};
     if(Object.values(o).some(Boolean)){const t=typedItem('',L,ANR,addrT(p.types));c.addresses.push({...o,t:t.t,l:t.l})}break}
    case'BDAY':{const d=ymd(un(v));if(d)c.events.push({v:d,t:3,l:''});break}
    case'ANNIVERSARY':case'X-ANNIVERSARY':{const d=ymd(un(v));if(d)c.events.push({v:d,t:1,l:''});break}
    case'X-DATE':{const d=ymd(un(v));if(d)c.events.push(L?{v:d,t:0,l:L}:{v:d,t:2,l:''});break}
    case'X-ABRELATEDNAMES':case'RELATED':case'X-RELATION':{const x=un(v).trim();if(!x)break;
     const key=(L||[...p.types][0]||'').toLowerCase(),t=RNR[key];c.relations.push(t!=null?{v:x,t,l:''}:key?{v:x,t:0,l:L||[...p.types][0]}:{v:x,t:12,l:''});break}
    case'X-FAVORITE':case'X-STARRED':if(/^(1|true|yes)$/i.test(un(v).trim()))c.starred=true;break;
    case'CATEGORIES':if(/favou?rite|starred/i.test(v))c.starred=true;break}}
  if(!c.first&&!c.last&&!c.middle&&fn&&fn!==c.company)c.first=fn;
  return(c.first||c.last||c.middle||c.nickname||c.company||c.phones.length||c.emails.length)?c:null}
 function parseVcf(text){
  const out=[];let cur=null;
  for(const ln of unfold(text)){const u=ln.trim().toUpperCase();
   if(u==='BEGIN:VCARD'){cur=[];continue}
   if(u==='END:VCARD'){if(cur){const c=buildVcf(cur);if(c)out.push(c)}cur=null;continue}
   if(cur&&ln){const p=parseLine(ln);if(p)cur.push(p)}}
  return out}

 /* ---------- CSV export ---------- */
 const q=s=>{s=S(s);return/[",\r\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 const lab=(it,m)=>(+it.t===0?S(it.l):m[+it.t]||'');
 function toCsv(rows){
  const mx=k=>Math.max(1,...rows.map(r=>r[k].length));
  const np=mx('phones'),ne=mx('emails'),nw=mx('websites'),na=mx('addresses');
  const H=['First Name','Middle Name','Last Name','Name Prefix','Name Suffix','Nickname','Company','Department','Job Title','Birthday','Notes','Favourite'];
  for(let i=1;i<=np;i++)H.push('Phone '+i+' - Label','Phone '+i+' - Value');
  for(let i=1;i<=ne;i++)H.push('E-mail '+i+' - Label','E-mail '+i+' - Value');
  for(let i=1;i<=nw;i++)H.push('Website '+i+' - Label','Website '+i+' - Value');
  for(let i=1;i<=na;i++)H.push('Address '+i+' - Label','Address '+i+' - Street','Address '+i+' - Neighborhood','Address '+i+' - PO Box','Address '+i+' - City','Address '+i+' - Region','Address '+i+' - Postal Code','Address '+i+' - Country');
  const out=[H.map(q).join(',')];
  rows.forEach(r=>{const bd=(r.events.find(e=>+e.t===3)||{}).v||'',R=[r.first,r.middle,r.last,r.prefix,r.suffix,r.nickname,r.company,r.department,r.title,bd,r.notes,r.starred?'Yes':''];
   for(let i=0;i<np;i++){const p=r.phones[i];R.push(p?lab(p,PTN):'',p?p.v:'')}
   for(let i=0;i<ne;i++){const p=r.emails[i];R.push(p?lab(p,ETN):'',p?p.v:'')}
   for(let i=0;i<nw;i++){const p=r.websites[i];R.push(p?lab(p,WTN):'',p?p.v:'')}
   for(let i=0;i<na;i++){const a=r.addresses[i];R.push(...(a?[lab(a,ATN),a.street,a.hood,a.pobox,a.city,a.region,a.postcode,a.country]:['','','','','','','','']))}
   out.push(R.map(q).join(','))});
  return '\uFEFF'+out.join('\r\n')+'\r\n'}

 /* ---------- CSV import ---------- */
 function parseCsv(text){
  text=S(text).replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0],cm=first.split(',').length,del=first.split(';').length>cm?';':first.split('\t').length>cm?'\t':',';
  const rows=[];let row=[],f='',inq=false;
  for(let i=0;i<text.length;i++){const c=text[i];
   if(inq){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else inq=false}else f+=c}
   else if(c==='"')inq=true;
   else if(c===del){row.push(f);f=''}
   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';if(row.some(x=>x!==''))rows.push(row);row=[]}
   else f+=c}
  row.push(f);if(row.some(x=>x!==''))rows.push(row);
  return rows}
 const hn=s=>S(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const SIMPLE={'first name':'first','given name':'first','firstname':'first','first':'first','middle name':'middle','additional name':'middle','middle':'middle','last name':'last','family name':'last','surname':'last','lastname':'last','last':'last',
  'name prefix':'prefix','prefix':'prefix','name suffix':'suffix','suffix':'suffix','nickname':'nickname','nick name':'nickname',
  'company':'company','organization':'company','organisation':'company','organization name':'company','organization 1 name':'company','company name':'company',
  'department':'department','organization department':'department','organization 1 department':'department',
  'job title':'title','organization title':'title','organization 1 title':'title','title':'title','occupation':'title','notes':'notes','note':'notes'};
 const FULL=new Set(['name','display name','full name','contact name']),BDAY=new Set(['birthday','birthdate','birth date','date of birth','dob']),STAR=new Set(['favourite','favorite','starred']);
 const KIND={phone:'ph','e mail':'em',email:'em',website:'web',address:'ad'};
 const wordPhone=h=>/fax/.test(h)?(/home/.test(h)?5:4):/pager/.test(h)?6:/car/.test(h)?9:/main|primary/.test(h)?12:/(home)/.test(h)?1:/(business|work|office)/.test(h)?3:/other/.test(h)?7:2;
 function fromCsv(rows){
  if(rows.length<2)return[];
  const H=rows[0].map(hn),out=[];
  for(let r=1;r<rows.length;r++){
   const R=rows[r],c=blank(),I={ph:{},em:{},web:{},ad:{}};let full='',bd='';
   H.forEach((h,i)=>{const v=S(R[i]).trim();if(!v)return;let m;
    if(SIMPLE[h]){c[SIMPLE[h]]=v;return}
    if(FULL.has(h)){full=v;return}if(BDAY.has(h)){bd=v;return}if(STAR.has(h)){c.starred=/^(1|true|yes|y|x)$/i.test(v);return}
    if(m=/^(phone|e mail|email|website|address) (\d+) (label|type|value|street|city|region|state|postal code|zip|country|po box|neighborhood|neighbourhood)$/.exec(h)){
     const k=KIND[m[1]],o=I[k][m[2]]=I[k][m[2]]||{s:{}},f=m[3];
     if(f==='label'||f==='type')o.l=v;else if(f==='value')o.v=v;else o.s[f]=v;return}
    if(m=/^(e mail|email)(?: (\d+))? address$/.exec(h)||/^(e mail|email)()$/.exec(h)){const o=I.em[m[2]||'1']=I.em[m[2]||'1']||{s:{}};o.v=v;return}
    if(/^(website|web page|url|homepage)$/.test(h)){I.web['x'+i]={v,s:{}};return}
    if(/^(street|home street|business street|work street|address|home address|business address)$/.test(h)){I.ad['x'+i]={s:{street:v},l:/business|work/.test(h)?'Work':/home/.test(h)?'Home':''};return}
    if(/(phone|mobile|cell|telephone|tel|fax|pager)/.test(h)&&!/(type|label|country code)/.test(h)){I.ph['x'+i]={v,t:wordPhone(h),s:{}}}});
   const key=k=>Object.keys(I[k]).sort((a,b)=>(+a||1e6)-(+b||1e6)||(a<b?-1:1));
   key('ph').forEach(k=>{const o=I.ph[k];if(!o.v)return;c.phones.push(o.t?{v:o.v,t:o.t,l:''}:typedItem(o.v,S(o.l).trim(),PNR,2))});
   key('em').forEach(k=>{const o=I.em[k];if(o.v)c.emails.push(typedItem(o.v,S(o.l).trim(),ENR,3))});
   key('web').forEach(k=>{const o=I.web[k];if(o.v)c.websites.push(typedItem(o.v,S(o.l).trim(),WNR,1))});
   key('ad').forEach(k=>{const o=I.ad[k],s=o.s,a={street:s.street||'',hood:s.neighborhood||s.neighbourhood||'',pobox:s['po box']||'',city:s.city||'',region:s.region||s.state||'',postcode:s['postal code']||s.zip||'',country:s.country||''};
    if(!Object.values(a).some(Boolean))return;const t=typedItem('',S(o.l).trim(),ANR,1);c.addresses.push({...a,t:t.t,l:t.l})});
   if(!c.first&&!c.last&&!c.middle&&full)c.first=full;
   const d=ymd(bd);if(d)c.events.push({v:d,t:3,l:''});
   if(c.first||c.last||c.middle||c.nickname||c.company||c.phones.length||c.emails.length)out.push(c)}
  return out}

 /* ---------- duplicates ---------- */
 const digits=s=>S(s).replace(/\D/g,'').slice(-9);
 const keysOf=c=>{const k=[];c.phones.forEach(p=>{const d=digits(p.v);if(d.length>=7)k.push('p'+d)});c.emails.forEach(e=>{const m=S(e.v).trim().toLowerCase();if(m)k.push('e'+m)});if(!k.length){const n=dispName(c).toLowerCase();if(n)k.push('n'+n)}return k};
 const isDup=(c,seen)=>keysOf(c).some(k=>seen.has(k)),mark=(c,seen)=>keysOf(c).forEach(k=>seen.add(k));

 /* ---------- screens ---------- */
 function download(name,text,mime){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type:mime}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);toast('Downloaded '+name);return true}
 async function cndExport(rows){
  if(!rows||!rows.length)return alert('There are no contacts to export.');
  const n=rows.length,r=await dlg({title:'Export contacts',msg:n+' contact'+(n===1?'':'s')+'.\nvCard (.vcf) keeps every field and opens in Android, Google, iPhone and Outlook. CSV (.csv) keeps names, phones, emails, addresses, websites, birthday and notes, for spreadsheets.',opts:[['vcf','vCard (.vcf)'],['csv','CSV (.csv)']],val:'vcf',ok:'Export'});
  if(!r)return;
  const vcf=r.o!=='csv',name='conduint-contacts-'+stamp()+(vcf?'.vcf':'.csv'),mime=vcf?'text/vcard':'text/csv';
  try{const text=vcf?rows.map(toVcf).join(''):toCsv(rows);
   if(typeof auSaveOut==='function')await auSaveOut(name,text,'Contacts',mime);else download(name,text,mime)}
  catch(e){alert('Could not save the file: '+((e&&e.message)||e))}}
 function pick(){return new Promise(res=>{
  const i=document.createElement('input');i.type='file';i.accept='.vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv,text/comma-separated-values,application/csv,text/plain';i.style.display='none';document.body.append(i);
  i.onchange=()=>{const f=i.files&&i.files[0];i.remove();res(f||null)};i.addEventListener('cancel',()=>{i.remove();res(null)});i.click()})}
 let busyImp=false;
 async function cndImport(C,rows,reload,say){
  if(busyImp)return;
  if(!C||!C.save)return alert('Importing needs the installed Android app and the Contacts permission.');
  const f=await pick();if(!f)return;
  if(f.size>20971520)return alert('That file is too big (20 MB max).');
  let list;try{const t=await f.text();list=/BEGIN:VCARD/i.test(t.slice(0,4000))?parseVcf(t):fromCsv(parseCsv(t))}
  catch(e){return alert('Could not read that file: '+((e&&e.message)||e))}
  if(!list.length)return alert('No contacts found in that file. Use a .vcf (vCard) file, or a .csv file with a header row (First Name, Last Name, Phone 1 - Value, E-mail 1 - Value...).');
  const seen=new Set();rows.forEach(x=>mark(x,seen));
  const flags=list.map(c=>{const d=isDup(c,seen);mark(c,seen);return d}),dup=flags.filter(Boolean).length,n=list.length;
  const r=await dlg({title:'Import contacts',msg:'Found '+n+' contact'+(n===1?'':'s')+' in '+f.name+'.'+(dup?'\n'+dup+' already look like contacts on this phone (same phone number, same email, or same name).':''),
   opts:dup?[['skip','Skip duplicates ('+dup+')'],['all','Import everything']]:[],val:'skip',ok:'Import'});
  if(!r)return;
  const todo=list.filter((c,i)=>r.o==='all'||!flags[i]);
  if(!todo.length){alert('Nothing to import: every contact in the file already exists.');return}
  busyImp=true;let ok=0,bad=0,why='';
  try{for(let i=0;i<todo.length;i++){
    say&&say('Importing '+(i+1)+' of '+todo.length+'…');
    try{await C.save(todo[i]);ok++}catch(e){bad++;if(!why)why=(e&&e.message)||'save failed';if(!ok&&bad>=3)break}}}
  finally{busyImp=false;say&&say('')}
  await reload();
  const skipped=n-todo.length;
  const msg='Imported '+ok+' contact'+(ok===1?'':'s')+(skipped?', skipped '+skipped+' duplicate'+(skipped===1?'':'s'):'')+(bad?', '+bad+' failed ('+why+')':'')+'.';
  if(bad)alert(msg);else toast(msg)}
 window.cndExport=cndExport;window.cndImport=cndImport;
 window.cndIO={toVcf,parseVcf,toCsv,parseCsv,fromCsv,ymd};
})();
