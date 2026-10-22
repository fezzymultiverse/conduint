/* about.js (V0.52.0): double-tap the Conduint logo for the story of the app: what it is, how it is built around one idea, and every room in it.
   Pure text and layout, nothing is read or stored. The feature list below is written by hand from what the app really contains; update it when a feature is added.
   Strategy Over Impulse. */
const ABOUT_INTRO='One app. One room. Everything in its place.';
const ABOUT_STORY='Conduint Files was planned, piece by piece, by Grant. It began with a simple refusal: why should your files, your passwords, your music, your security and your browser live in a dozen different apps, each with its own rules, its own look and its own way of getting in your way? Here they share one home. You decide what sits on Home, what lives in the left panel, and what stays hidden, and every item has exactly one place, so nothing is ever duplicated, lost or scattered across venues.';
/* What's new: newest first. Add one line here for every version, and the About card shows the latest at the top and the rest under "Earlier". */
const ABOUT_NEW=[
 ['V0.52.0','Utilities can sit in the left panel, exports save properly, ZIPs open on one tap, Home scrolls smoother and redraws less, and this About card arrived.'],
 ['V0.51.2','Authenticator notes and fields sync with the Password Manager, and the Sync button works both ways.'],
 ['V0.51.0','Duplicate login scanner, rotating quotes under the greeting, a fuller refresh wave and Home first on start.']];
const ABOUT_SECTIONS=[
 ['Home, built your way',['A Home screen made of your own folders, with Internal storage and Downloads always one tap away.','A left panel you arrange yourself: add, remove and reorder anything, including Utilities. Every item lives in one place, never two.','Weather, Wi-Fi name, storage, memory and battery at a glance, with a rotating line of words for the day.','Now playing sits on Home and minimises into a panel, so your music is always within reach.']],
 ['Files that behave',['Details view with size and info on each tile, or List view with thumbnails.','Pin, hide, move, copy, rename and a Recycle bin that gives things back.','Tap a ZIP to walk straight inside it. Long-press to extract here or to a folder.','Open with, Share, Select many, and a Shield scan before anything risky opens.']],
 ['Music, pictures and reading',['A media player with a docked mini panel, queue and settings.','Gallery with crop, rotate, EXIF details and an Originals tab that puts the untouched picture back.','A Reader for PDF, books and documents that remembers your page.','Convert video to audio without leaving the app.']],
 ['Security, all in the same room',['Conduit Vault: AES-256 encrypted, unlocked by fingerprint and pattern, with a recovery PIN as the last line of defence.','Conduint Password Manager: AES-256 vault, logins, notes, cards and identities, health reports, a duplicate scanner, and import or export for Bitwarden, Chrome and LastPass shapes.','Passkeys and Autofill: Conduint can be your phone’s passkey provider and autofill service, with the status shown right on its dashboard.','Authenticator: 2-step codes held encrypted on the phone, with encrypted backups, Aegis import, and a two-way sync with the Password Manager.','Shield: scans files, keeps blocklists and shows what it stopped.','VPN: WireGuard with servers that rotate on their own.','Zipliner: label, zip and lock old data.']],
 ['Everyday tools',['Contacts with a full editor, plus vCard and CSV export and import.','Notepad for notes and checklists.','Browser with tabs, bookmarks, history and a private mode.','Utilities: Storage analyser, Optimiser, and duplicate finding.','Backup: one encrypted file for your settings, VPN, Authenticator and Password Manager.','Apps list and Wi-Fi tools.']],
 ['Yours to dress up',['Themes and accent colours, a Home wallpaper, and background effects: smoke, bubbles, rain drops, waterfall and paws.','Bojack, the dog on the paw, keeps watch over it all.']]];
function aboutClose(){const A=document.getElementById('about');if(A)A.classList.remove('on')}
function aboutOpen(){
 let A=document.getElementById('about');
 if(!A){
  A=document.createElement('div');A.id='about';A.setAttribute('role','dialog');A.setAttribute('aria-label','About Conduint Files');
  const bx=document.createElement('div');bx.className='abx';
  const x=document.createElement('button');x.className='abclose';x.type='button';x.setAttribute('aria-label','Close');x.textContent='×';x.onclick=aboutClose;
  const hd=document.createElement('div');hd.className='abhd';
  const t=document.createElement('b');t.className='abt';t.textContent='CONDUINT FILES';
  const v=document.createElement('small');v.className='abv';v.textContent=(typeof VER==='string'?VER:'')+'  ·  STRATEGY OVER IMPULSE';
  const q=document.createElement('p');q.className='abq';q.textContent=ABOUT_INTRO;
  hd.append(t,v,q);bx.append(x,hd);
  const nw=document.createElement('section');nw.className='absec abnew';
  const nh=document.createElement('h3');nh.textContent='What\u2019s new';nw.append(nh);
  ABOUT_NEW.forEach(([ver,txt],i)=>{
   const p=document.createElement('p');p.className=i?'abold':'abtop';
   const vb=document.createElement('b');vb.textContent=ver+'  ';p.append(vb,document.createTextNode(txt));
   if(i===1){const e=document.createElement('small');e.className='abear';e.textContent='Earlier';nw.append(e)}
   nw.append(p)});
  bx.append(nw);
  const st=document.createElement('p');st.className='abs';st.textContent=ABOUT_STORY;bx.append(st);
  ABOUT_SECTIONS.forEach(([title,items],i)=>{
   const sec=document.createElement('section');sec.className='absec c'+(i%4);
   const hh=document.createElement('h3');hh.textContent=title;sec.append(hh);
   const ul=document.createElement('ul');items.forEach(s=>{const li=document.createElement('li');li.textContent=s;ul.append(li)});sec.append(ul);bx.append(sec)});
  const ft=document.createElement('p');ft.className='abf';ft.textContent='Planned by Grant. Built to be one place for everything, and nothing in the way.';bx.append(ft);
  A.append(bx);A.onclick=e=>{if(e.target===A)aboutClose()};document.body.append(A)}
 A.classList.add('on');const b=A.querySelector('.abx');if(b)b.scrollTop=0}
/* double tap on the logo or the name (not on the pencil button): two taps within 350 ms, close together */
(function(){
 const br=document.querySelector('.brand');if(!br)return;
 let t0=0,x0=0,y0=0;
 br.addEventListener('pointerup',e=>{
  if(e.target.closest&&e.target.closest('button'))return;
  const n=Date.now();
  if(n-t0<350&&Math.hypot(e.clientX-x0,e.clientY-y0)<40){t0=0;aboutOpen();return}
  t0=n;x0=e.clientX;y0=e.clientY});
})();
