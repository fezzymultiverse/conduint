/* Conduint Contacts V0.43.0 (export and import added V0.46.0, see contactsio.js): in-app contact list and full editor backed by Android Contacts.
   Fields: name parts, nickname, company/department/title, many phones, emails, addresses, websites,
   birthday and other dates, related people, notes, favourite. Filters: All, Favourites, Birthdays. */
(()=>{
 const C=(typeof BRIDGE!=='undefined'&&BRIDGE)?plug('Contacts'):null;
 const st=document.createElement('style');st.textContent=`
 #cndContacts{position:fixed;inset:0;z-index:10000;background:var(--bg,#07090c);color:var(--tx,#f2f5f7);display:none;flex-direction:column;padding:calc(12px + env(safe-area-inset-top)) 14px calc(12px + env(safe-area-inset-bottom));font:14px system-ui}
 #cndContacts.on{display:flex}#cndContacts header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
 #cndContacts header b{flex:1;font-size:16px;letter-spacing:.1em}#cndContacts header small{color:var(--mu,#a7b4bb)}
 #cndContacts button{background:var(--card,#111a20);color:inherit;border:1px solid var(--ln,#26343c);border-radius:10px;padding:9px 12px;font:inherit}
 #cndContacts button.pri{background:var(--acc,#00d9f5);color:var(--onacc,#00181c);border-color:var(--acc,#00d9f5);font-weight:700}
 #cndContacts button.danger{color:#ff7b7b;border-color:#ff7b7b66}
 #cndContacts input,#cndContacts textarea,#cndContacts select{background:var(--card,#10151a);color:inherit;border:1px solid var(--ln,#34434b);border-radius:10px;padding:12px;width:100%;box-sizing:border-box;margin:0 0 10px;font:inherit}
 #cndContacts select{flex:1;min-width:0;margin:0}#cndContacts input[type=checkbox]{width:auto;margin:0 8px 0 0}
 #cndContacts textarea{min-height:96px;resize:vertical}
 #cndContactList{overflow:auto;flex:1;min-height:0}.cndL{color:var(--acc,#00d9f5);font-size:11px;font-weight:700;letter-spacing:.14em;padding:12px 2px 4px}
 .cndContactRow{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--ln,#20282d);padding:10px 2px}
 .cndAv{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:var(--acc,#00d9f5);border:1px solid var(--acc,#00d9f5)}
 .cndContactRow .cx{flex:1;min-width:0}.cndContactRow span{display:block;color:var(--mu,#a7b4bb);margin-top:3px;font-size:12px;overflow:hidden;text-overflow:ellipsis}
 .cndContactRow span.m2{color:var(--acc,#00d9f5);opacity:.85}
 #cndContactFoot{padding-top:8px;color:var(--mu,#a7b4bb);font-size:12px}
 .cndLabel{display:block;font-size:11px;line-height:1.4;color:var(--mu,#a7b4bb);letter-spacing:.08em;margin:2px 0 8px}
 .cndLabel>input,.cndLabel>textarea{display:block;margin:6px 0 0}
 #cndContacts input:focus,#cndContacts textarea:focus,#cndContacts select:focus{outline:none;border-color:var(--acc,#00d9f5);box-shadow:inset 0 0 0 1px var(--acc,#00d9f5)}
 #cndContacts form.cndEdit{padding:0 1px 8px}
 #cndContacts header{position:static;flex:none;background:none;border:0;padding:0}
 .cndActions{display:flex;gap:8px;justify-content:flex-end;padding:10px 0 4px;margin-top:6px;position:sticky;bottom:0;background:var(--bg,#07090c)}
 .cndChips{display:flex;gap:8px;margin:0 0 8px}.cndChips button{flex:1;padding:8px 6px}.cndChips button.on{border-color:var(--acc,#00d9f5);color:var(--acc,#00d9f5);font-weight:700}
 #cndContacts.ed .cndTop,#cndContacts.ed #cndContactFoot{display:none}
 .cndSec{margin:6px 0 12px}.cndRow,.cndCard{border:1px solid var(--ln,#26343c);border-radius:12px;padding:8px;margin:0 0 8px}
 .cndRowTop{display:flex;gap:8px;margin:0 0 8px}.cndX{flex:none;width:44px;padding:9px 0!important}
 .cndG2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
 .cndChk{display:flex;align-items:center;margin:0 0 10px;color:var(--mu,#a7b4bb)}
 .cndWarn{border:1px solid #ffb84d88;color:#ffb84d;border-radius:10px;padding:8px 10px;margin:0 0 10px;font-size:12px}
 body.cndopen #dlg,body.cndopen #busy{z-index:10002}
 #cndContacts details summary{color:var(--acc,#00d9f5);font-size:12px;letter-spacing:.08em;padding:4px 0 10px;cursor:pointer}`;
 document.head.append(st);
 const PT=[[2,'Mobile'],[1,'Home'],[3,'Work'],[12,'Main'],[17,'Work mobile'],[4,'Fax work'],[5,'Fax home'],[6,'Pager'],[19,'Assistant'],[10,'Company main'],[9,'Car'],[8,'Callback'],[7,'Other'],[0,'Custom']];
 const ET=[[1,'Home'],[2,'Work'],[4,'Mobile'],[3,'Other'],[0,'Custom']];
 const AT=[[1,'Home'],[2,'Work'],[3,'Other'],[0,'Custom']];
 const WT=[[1,'Homepage'],[2,'Blog'],[3,'Profile'],[4,'Home'],[5,'Work'],[7,'Other'],[0,'Custom']];
 const DT=[[3,'Birthday'],[1,'Anniversary'],[2,'Other'],[0,'Custom']];
 const RT=[[14,'Spouse'],[10,'Partner'],[4,'Domestic partner'],[5,'Father'],[8,'Mother'],[9,'Parent'],[3,'Child'],[2,'Brother'],[13,'Sister'],[12,'Relative'],[6,'Friend'],[7,'Manager'],[1,'Assistant'],[11,'Referred by'],[0,'Custom']];
 const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
 const btn=(x,c)=>{const b=el('button',c,x);b.type='button';return b};
 const panel=el('section');panel.id='cndContacts';
 const hd=el('header'),ti=el('b',null,'CONTACTS'),cn=el('small'),cl=btn('Close');
 cl.onclick=()=>{panel.classList.remove('on','ed');document.body.classList.remove('cndopen')};hd.append(ti,cn,cl);
 const top=el('div','cndTop');
 const q=el('input');q.type='search';q.placeholder='Search contacts';q.autocomplete='off';
 const chips=el('div','cndChips');let mode='all';
 const chipBtn={};[['all','All'],['fav','Favourites'],['bday','Birthdays']].forEach(([k,l])=>{const b=btn(l);b.onclick=()=>{mode=k;draw()};chipBtn[k]=b;chips.append(b)});
 const ad=btn('+ Add contact','pri');ad.style.marginBottom='8px';ad.style.width='100%';ad.onclick=()=>editor(null);
 top.append(q,chips,ad);
 const list=el('div');list.id='cndContactList';
 const ft=el('div');ft.id='cndContactFoot';ft.textContent='Saved directly to Android Contacts. Edit contacts here without opening the system editor.';
 /* V0.46.0: export and import (contactsio.js). 'rows' and 'open' are declared below; the buttons only use them when tapped. */
 const FT=ft.textContent,io=el('div','cndChips'),ex=btn('Export'),im=btn('Import');
 ex.onclick=()=>{if(window.cndExport)window.cndExport(rows)};
 im.onclick=()=>{if(window.cndImport)window.cndImport(C,rows,open,t=>{ft.textContent=t||FT})};
 io.append(ex,im);top.append(io);
 panel.append(hd,top,list,ft);document.body.append(panel);
 let rows=[],apiOK=true;
 const msg=t=>{list.replaceChildren();list.append(el('p',null,t))};
 const S=v=>(v==null?'':String(v));
 /* normalise a row from the native layer (older APKs only return phone/email/company/notes) */
 function norm(x){
  const o={...x};
  ['first','middle','last','prefix','suffix','nickname','company','department','title','notes','name'].forEach(k=>o[k]=S(o[k]));
  o.phones=o.phones||(o.phone?[{v:o.phone,t:2,l:''}]:[]);
  o.emails=o.emails||(o.email?[{v:o.email,t:1,l:''}]:[]);
  ['addresses','websites','events','relations'].forEach(k=>o[k]=o[k]||[]);
  o.addresses=o.addresses.map(a=>{a={...a};if(!a.street&&!a.city&&!a.region&&!a.postcode&&!a.country&&!a.hood&&!a.pobox&&a.fmt)a.street=a.fmt;return a});
  if(!o.first&&!o.last&&!o.middle&&!o.prefix&&!o.suffix&&o.name&&o.name!==o.company&&o.name!==o.nickname)o.first=o.name;
  o.starred=!!o.starred;
  return o}
 function pd(s){s=S(s).trim();let m;
  if(m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))return{y:(m[1]==='0000'||m[1]==='1604')?'':m[1],m:m[2].padStart(2,'0'),d:m[3].padStart(2,'0')};
  if(m=/^--(\d{1,2})-?(\d{1,2})$/.exec(s))return{y:'',m:m[1].padStart(2,'0'),d:m[2].padStart(2,'0')};
  if(m=/^(\d{4})(\d{2})(\d{2})$/.exec(s))return{y:m[1],m:m[2],d:m[3]};
  return null}
 function bday(x){
  const e=(x.events||[]).find(e=>+e.t===3&&pd(e.v));if(!e)return null;const p=pd(e.v);
  const now=new Date(),t0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let d=new Date(t0.getFullYear(),+p.m-1,+p.d);if(d<t0)d=new Date(t0.getFullYear()+1,+p.m-1,+p.d);
  return{days:Math.round((d-t0)/864e5),text:(+p.d)+' '+MON[+p.m-1]+(p.y?' '+p.y:''),age:p.y?d.getFullYear()-(+p.y):0}}
 function hay(x){
  if(x._h)return x._h;
  const a=[x.name,x.first,x.middle,x.last,x.prefix,x.suffix,x.nickname,x.company,x.department,x.title,x.notes];
  x.phones.forEach(p=>a.push(p.v,S(p.v).replace(/[^\d+]/g,'')));x.emails.forEach(p=>a.push(p.v));x.websites.forEach(p=>a.push(p.v));
  x.relations.forEach(p=>a.push(p.v));x.addresses.forEach(p=>a.push(p.street,p.hood,p.city,p.region,p.postcode,p.country,p.pobox));
  return x._h=a.join(' ').toLowerCase()}
 function fill(sel,opts,t){
  let o=opts.slice();if(t!=null&&!o.some(p=>p[0]===+t))o.push([+t,'Type '+t]);
  o.forEach(([v,l])=>{const op=el('option',null,l);op.value=String(v);sel.append(op)});
  sel.value=String(t==null?o[0][0]:+t)}
 function group(form,title,addText,make,items,min){
  const sec=el('div','cndSec'),h=el('div','cndL',title),box=el('div'),add=btn(addText),rs=[];
  const push=it=>{const r=make(it,()=>{rs.splice(rs.indexOf(r),1);r.el.remove()});rs.push(r);box.append(r.el);return r};
  add.style.width='100%';add.onclick=()=>{const r=push(null);if(r.focus)r.focus()};
  (items&&items.length?items:(min?[null]:[])).forEach(push);
  sec.append(h,box,add);form.append(sec);
  return{get:()=>rs.map(r=>r.get()).filter(Boolean)}}
 function labelRow(sel,lb){const f=()=>{lb.style.display=sel.value==='0'?'':'none'};sel.onchange=f;f()}
 const typed=(opts,fb,o)=>(it,rm)=>{
  const r=el('div','cndRow'),sel=el('select'),v=el('input'),lb=el('input'),x=btn('×','cndX'),tp=el('div','cndRowTop');
  fill(sel,opts,it?it.t:fb);v.type=o.type;v.placeholder=o.ph;v.value=it?S(it.v):'';v.autocomplete='off';if(o.im)v.inputMode=o.im;
  v.style.marginBottom='8px';lb.placeholder='Custom label';lb.value=it?S(it.l):'';lb.style.marginBottom='0';labelRow(sel,lb);
  x.setAttribute('aria-label','Remove');x.onclick=rm;tp.append(sel,x);r.append(tp,v,lb);
  return{el:r,focus:()=>v.focus(),get:()=>{const val=v.value.trim();if(!val)return null;const t=+sel.value;return{v:val,t,l:t===0?lb.value.trim():''}}}};
 const dateRow=(it,rm)=>{
  const r=el('div','cndRow'),sel=el('select'),v=el('input'),lb=el('input'),x=btn('×','cndX'),tp=el('div','cndRowTop'),ny=el('label','cndChk'),cb=el('input');
  fill(sel,DT,it?it.t:3);const p=it?pd(it.v):null,raw=it&&!p?S(it.v):'';
  v.type=raw?'text':'date';v.style.marginBottom='8px';v.value=raw||(p?(p.y||'2000')+'-'+p.m+'-'+p.d:'');
  cb.type='checkbox';cb.checked=!!(p&&!p.y);ny.append(cb,document.createTextNode('Year unknown'));if(raw)ny.style.display='none';
  lb.placeholder='Custom label';lb.value=it?S(it.l):'';lb.style.marginBottom='0';labelRow(sel,lb);
  x.setAttribute('aria-label','Remove');x.onclick=rm;tp.append(sel,x);r.append(tp,v,ny,lb);
  return{el:r,focus:()=>v.focus(),get:()=>{let val=v.value.trim();if(!val)return null;
   if(!raw&&cb.checked)val='--'+val.slice(5);const t=+sel.value;return{v:val,t,l:t===0?lb.value.trim():''}}}};
 const addrRow=(it,rm)=>{
  const r=el('div','cndCard'),sel=el('select'),x=btn('×','cndX'),tp=el('div','cndRowTop'),lb=el('input'),I={};
  fill(sel,AT,it?it.t:1);lb.placeholder='Custom label';lb.value=it?S(it.l):'';lb.style.marginBottom='8px';labelRow(sel,lb);
  x.setAttribute('aria-label','Remove');x.onclick=rm;tp.append(sel,x);r.append(tp,lb);
  const mk=(k,ph)=>{const i=el('input');i.placeholder=ph;i.value=it?S(it[k]):'';i.autocomplete='off';I[k]=i;return i};
  const g=(a,b)=>{const d=el('div','cndG2');d.append(mk(a[0],a[1]),mk(b[0],b[1]));return d};
  r.append(mk('street','Street, unit or block'),g(['hood','Suburb / area'],['pobox','PO box']),g(['city','City / town'],['postcode','Postal code']),g(['region','Province / state'],['country','Country']));
  return{el:r,focus:()=>I.street.focus(),get:()=>{const o={};let any=false;for(const k in I){o[k]=I[k].value.trim();if(o[k])any=true}
   if(!any)return null;o.t=+sel.value;o.l=o.t===0?lb.value.trim():'';return o}}};
 function field(parent,label,key,value,ph,area){
  const w=el('label','cndLabel',label),i=area?el('textarea'):el('input');
  i.name=key;i.value=value||'';i.placeholder=ph||label;if(area)i.maxLength=8000;i.autocomplete='off';
  w.append(i);parent.append(w);return i}
 function editor(x){
  panel.classList.add('ed');
  list.replaceChildren();x=x?norm(x):null;
  const form=el('form','cndEdit');form.noValidate=true;
  form.append(el('div','cndL',x?'EDIT CONTACT':'NEW CONTACT'));
  if(!apiOK)form.append(el('div','cndWarn','The installed app is older than V0.43.0. Rebuild and install it to save addresses, birthdays and the extra fields.'));
  const F={};
  F.first=field(form,'FIRST NAME','first',x&&x.first,'First name');
  F.last=field(form,'LAST NAME','last',x&&x.last,'Last name');
  const more=document.createElement('details'),sm=el('summary',null,'MORE NAME FIELDS');more.append(sm);
  F.prefix=field(more,'PREFIX','prefix',x&&x.prefix,'Mr, Dr, Prof');F.middle=field(more,'MIDDLE NAME','middle',x&&x.middle,'Middle name');
  F.suffix=field(more,'SUFFIX','suffix',x&&x.suffix,'Jr, III, PhD');F.nickname=field(more,'NICKNAME','nickname',x&&x.nickname,'Nickname');
  if(x&&(x.prefix||x.middle||x.suffix||x.nickname))more.open=true;form.append(more);
  const starL=el('label','cndChk'),star=el('input');star.type='checkbox';star.checked=!!(x&&x.starred);starL.append(star,document.createTextNode('Favourite'));form.append(starL);
  const gp=group(form,'PHONE NUMBERS','+ Add phone',typed(PT,2,{type:'tel',ph:'Phone number',im:'tel'}),x&&x.phones,true);
  const ge=group(form,'EMAIL','+ Add email',typed(ET,1,{type:'email',ph:'name@example.com',im:'email'}),x&&x.emails,true);
  form.append(el('div','cndL','WORK'));
  F.company=field(form,'COMPANY','company',x&&x.company,'Company or organisation');
  F.department=field(form,'DEPARTMENT','department',x&&x.department,'Department');
  F.title=field(form,'JOB TITLE','title',x&&x.title,'Job title');
  const ga=group(form,'ADDRESSES','+ Add address',addrRow,x&&x.addresses,false);
  const gd=group(form,'BIRTHDAY AND DATES','+ Add date',dateRow,x&&x.events,false);
  const gw=group(form,'WEBSITES','+ Add website',typed(WT,1,{type:'url',ph:'https://',im:'url'}),x&&x.websites,false);
  const gr=group(form,'RELATED PEOPLE','+ Add related person',typed(RT,6,{type:'text',ph:'Name'}),x&&x.relations,false);
  form.append(el('div','cndL','NOTES'));
  F.notes=field(form,'NOTES','notes',x&&x.notes,'Private contact notes',true);
  const actions=el('div','cndActions');
  const cancel=btn('Cancel');cancel.onclick=()=>{panel.classList.remove('ed');draw()};
  if(x&&x.id&&C&&C.delete){
   const del=btn('Delete','danger');
   del.onclick=async()=>{if(!confirm('Delete '+(x.name||'this contact')+' from Android Contacts? This cannot be undone.'))return;
    del.disabled=true;try{await C.delete({id:x.id});await open();toast('Contact deleted.')}catch(err){alert((err&&err.message)||'Could not delete contact.');del.disabled=false}};
   actions.append(del)}
  const save=btn('Save contact','pri');save.type='submit';actions.append(cancel,save);form.append(actions);
  form.onsubmit=async e=>{
   e.preventDefault();const d={id:x&&x.id||'',raw:x&&x.raw||''};
   for(const k in F)d[k]=F[k].value.trim();
   if(!(d.first||d.last||d.middle||d.nickname||d.company))return alert('Enter a name or company.');
   d.phones=gp.get();d.emails=ge.get();d.addresses=ga.get();d.events=gd.get();d.websites=gw.get();d.relations=gr.get();d.starred=star.checked;
   if(!C||!C.save)return alert('This version of the installed Android app does not include the in-app contact save API.');
   save.disabled=true;save.textContent='Saving…';
   try{await C.save(d);panel.classList.remove('ed');await open();toast('Contact saved.')}
   catch(err){alert((err&&err.message)||'Could not save contact.');save.disabled=false;save.textContent='Save contact'}};
  list.append(form);list.scrollTop=0;if(!x)F.first.focus()}
 function draw(){
  for(const k in chipBtn)chipBtn[k].classList.toggle('on',k===mode);
  const s=q.value.trim().toLowerCase(),s2=s.replace(/[^\d+]/g,'');
  let f=rows.filter(x=>!s||hay(x).includes(s)||(s2.length>2&&hay(x).includes(s2)));
  if(mode==='fav')f=f.filter(x=>x.starred);
  const nm=x=>x.name||x.company||'';
  if(mode==='bday'){f=f.filter(x=>bday(x));f.sort((a,b)=>bday(a).days-bday(b).days)}
  else f.sort((a,b)=>(nm(a)||'~').localeCompare(nm(b)||'~'));
  cn.textContent=rows.length?f.length+' of '+rows.length:'';
  if(!f.length)return msg(rows.length?(mode==='fav'?'No favourites yet.':mode==='bday'?'No birthdays saved.':'No matching contacts.'):'No contacts found.');
  list.replaceChildren();let L='';
  f.forEach(x=>{
   const n=nm(x)||'(Unnamed contact)',l=(n[0]||'#').toUpperCase(),k=/[A-Z]/.test(l)?l:'#';
   if(mode!=='bday'&&k!==L){L=k;list.append(el('div','cndL',k))}
   const r=el('div','cndContactRow'),av=el('div','cndAv',k),cx=el('div','cx'),b=el('b',null,(x.starred?'★ ':'')+n);
   const p=el('span',null,[x.phones[0]&&x.phones[0].v,x.emails[0]&&x.emails[0].v,x.company].filter(Boolean).join(' · ')||'No contact details');
   cx.append(b,p);
   const bd=bday(x),ad0=x.addresses.find(a=>a.city||a.street),m2=[];
   if(bd)m2.push((mode==='bday'?(bd.days===0?'Today':'In '+bd.days+' d')+' · ':'Birthday ')+bd.text+(mode==='bday'&&bd.age?' · turns '+bd.age:''));
   if(ad0&&mode!=='bday')m2.push(ad0.city||ad0.street);
   if(m2.length)cx.append(el('span','m2',m2.join(' · ')));
   const ed=btn('Edit');ed.onclick=()=>editor(x);r.append(av,cx,ed);list.append(r)})}
 async function open(){
  panel.classList.add('on');panel.classList.remove('ed');document.body.classList.add('cndopen');q.value='';
  if(!C||!C.list)return msg('Contacts require the installed Android app and the Contacts permission.');
  msg('Loading contacts…');
  try{const r=await C.list();rows=((r&&r.contacts)||[]).map(norm);apiOK=!!(r&&r.api>=2);draw()}catch(e){msg((e&&e.message)||'Could not read contacts. Grant Contacts permission and try again.')}}
 q.addEventListener('input',draw);window.cndContactsOpen=open;
})();
