/* core.js: helpers, constants and persisted state. Loaded first. */
const $=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg';
/* h(tag, class, text, ...children): builds DOM with textContent, never innerHTML */
const h=(t,c,x,...k)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;e.append(...k);return e};
const ico=(n,c)=>{const s=document.createElementNS(NS,'svg'),u=document.createElementNS(NS,'use');s.setAttribute('class','ic '+(c||''));u.setAttribute('href','#i-'+n);s.append(u);return s};
const fmt=b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':b<1073741824?(b/1048576).toFixed(1)+' MB':(b/1073741824).toFixed(2)+' GB';
const dt=t=>t?new Date(t).toLocaleDateString():'';
/* added/modified within the last day: '15 minutes ago', '6 hours ago'; older: the date */
const dtx=t=>{if(!t)return'';if(t<1e11)t*=1000;/* seconds -> ms */const s=Math.floor((Date.now()-t)/1000);if(s<0||s>=86400)return dt(t);
 if(s<60)return'just now';const m=Math.floor(s/60);if(m<60)return m+(m===1?' minute':' minutes')+' ago';const hr=Math.floor(m/60);return hr+(hr===1?' hour':' hours')+' ago'};
/* a date span that keeps counting: '5 minutes ago' for anything from the last 24 hours, the plain date after that. A ticker in ui.js rewrites them. */
const dspan=(i,pre='')=>{const p=(typeof cur!=='undefined'&&cur.cat==='bin')?'Deleted ':'',e=h('span','dt',pre+p+dtx(i.mtime));e.dataset.t=i.mtime||0;e.dataset.p=pre+p;
 if(i.mtime&&Date.now()-(i.mtime<1e11?i.mtime*1000:i.mtime)<86400000)e.classList.add('new');return e};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),3200)};

const VER='V0.52.0';
const SW=['#00e5ff','#ffffff','#2effa0','#ffd400','#ff9100','#ff4d6d','#c77dff','#4d8dff'];
const THEMES={noir:'Noir cyan',amoled:'AMOLED',abyss:'Abyss',paper:'Paper',generic:'Generic'};

/* file kinds drive icons, library views and which viewer opens a file */
const EXT={img:'jpg jpeg png gif webp bmp svg avif heic',aud:'mp3 m4a aac wav ogg opus flac wma amr',vid:'mp4 mkv webm mov m4v 3gp avi ts',doc:'pdf txt md markdown csv tsv json html htm xhtml css sh js py log docx xlsx pptx doc xls ppt odt ods odp rtf xml yml yaml ini conf epub',arc:'zip rar 7z tar gz tgz bz2 xz',apk:'apk apks xapk'};
const KIND={};for(const k in EXT)EXT[k].split(' ').forEach(e=>KIND[e]=k);
/* kind by extension first, then by mime type (cloud files such as Google Docs have no extension) */
const kindOf=(n,m)=>{const k=KIND[n.split('.').pop().toLowerCase()];if(k)return k;m=m||'';
 return m.startsWith('image/')?'img':m.startsWith('audio/')?'aud':m.startsWith('video/')?'vid':/^(text\/|application\/(pdf|msword|vnd\.(openxml|ms-|google-apps\.(document|spreadsheet|presentation))))/.test(m)?'doc':'file'};
const KICON={img:'image',aud:'music',vid:'video',doc:'doc',arc:'zip',apk:'chip',file:'file'};
const CATS={docs:{name:'Documents',kind:'doc',ic:'doc'},imgs:{name:'Images',kind:'img',ic:'image'},songs:{name:'Music',kind:'aud',ic:'music'},vids:{name:'Videos',kind:'vid',ic:'video'},arcs:{name:'Archives',kind:'arc',ic:'zip'},apks:{name:'Installers',kind:'apk',ic:'chip'},bin:{name:'Recycle bin',kind:null,ic:'trash'}};
/* mime types handed to other apps (Acode and friends listen for text/*) */
const MIME={txt:'text/plain',md:'text/plain',log:'text/plain',sh:'text/plain',js:'text/plain',py:'text/plain',json:'text/plain',html:'text/html',csv:'text/csv',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',zip:'application/zip',apk:'application/vnd.android.package-archive',svg:'image/svg+xml',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',mkv:'video/x-matroska',webm:'video/webm'};
const mimeOf=(n,m)=>MIME[n.split('.').pop().toLowerCase()]||(m&&m!=='application/octet-stream'?m:'*/*');

/* persisted state: settings, pins, folder colours, connected storages (handles live in IndexedDB) */
const K='conduint.v1',DEF={theme:'noir',acc:'#00e5ff',fcol:'',view:'grid',tile:128,tv:2,sort:'name',sortDir:'asc',compact:false,dual:false,wid:true,hidden:false,first:true,bin:true,permAsked:false,wake:false,screen:false,keep:false,watchMin:5,autoPerm:true,lockAfter:120,secure:false,online:true,autoApply:true,thumbs:true,thumbCloud:true,fx:'off',fxLevel:1,rth:'night',rfs:18,rfont:'serif',pRep:'all',pShuf:false,pSpd:0,pVol:1,pAuto:true,pRes:true,pSleepEnd:false,txtOpen:'edit'};
let S={};try{S=JSON.parse(localStorage[K]||'{}')}catch{}
S={pins:[],colors:{},mounts:[],trash:[],labels:{},hid:{},lock:{type:'off'},...S,settings:{...DEF,...(S.settings||{})}};
/* V0.9.0 one-time upgrade: bigger tiles, and size / date used to sort biggest and newest first */
if((S.settings.tv||0)<2){S.settings.tile=Math.max(+S.settings.tile||0,128);S.settings.tv=2;if(S.settings.sort==='size'||S.settings.sort==='date')S.settings.sortDir='desc'}
/* library entries can be renamed: S.labels holds the custom names */
const catName=id=>(S.labels&&S.labels[id])||CATS[id].name;
/* files and folders the user hid with Hide: S.hid maps a file id to true. They show again when Show hidden files is on. */
const hidKey=(i,m,p)=>decodeURIComponent(String(i.uri||(m+':'+[...(p||[]),i.name].join('/')))),isHid=(i,m,p)=>!!S.hid[hidKey(i,m,p)];
const save=()=>{try{localStorage[K]=JSON.stringify(S)}catch{}};
const key=(m,p)=>m+':'+p.join('/'),isPin=(m,p)=>S.pins.some(x=>key(x.m,x.path)===key(m,p));
