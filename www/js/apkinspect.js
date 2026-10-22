/* apkinspect.js: Conduint Shield APK inspector (V0.25.0). Reads an APK WITHOUT installing it (native ToolsPlugin.inspectApk),
   then judges what it finds with the rules in shield-rules.json > "apk" (permissions, risky combinations, fake app names, known-bad signing keys).
   Not a malware scanner: it shows what an app asks for and who signed it, and flags the patterns real malware uses.
   Safety rule: nothing in here may stop the app or an install. If the inspection fails, the install carries on.
   Severity: high = warned before install (blocks only for a known-bad signing key when copying), med = flagged, low = info. */
const SH_APK_FALLBACK={perms:[
 {name:'READ_SMS',label:'Can read your text messages (including 2-step codes)',sev:'high'},
 {name:'RECEIVE_SMS',label:'Can intercept incoming text messages (including 2-step codes)',sev:'high'},
 {name:'BIND_ACCESSIBILITY_SERVICE',label:'Has an accessibility service: it can read the screen and tap for you',sev:'high'},
 {name:'BIND_NOTIFICATION_LISTENER_SERVICE',label:'Can read every notification, including 2-step codes',sev:'high'},
 {name:'BIND_DEVICE_ADMIN',label:'Can become a device administrator',sev:'high'},
 {name:'SYSTEM_ALERT_WINDOW',label:'Can draw over other apps (used for fake login screens)',sev:'med'}],combos:[],brands:[],certs:{}};
const apN=p=>String(p||'').replace(/^android\.permission\./,'');
const apDate=t=>{try{return new Date(t).toLocaleDateString()}catch{return''}};
const apCN=s=>{const m=/(?:^|,)CN=([^,]+)/i.exec(s||'');return m?m[1]:(s||'')};
/* judge one inspectApk result. Returns {findings:[{sev,label,hard}], perms:[{name,sev,label}]} */
function shApkAnalyze(info,rules){
 const A=(rules&&rules.apk&&typeof rules.apk==='object')?rules.apk:SH_APK_FALLBACK,out=[],seen=new Set();
 const f=(sev,label,hard)=>{if(!seen.has(label)){seen.add(label);out.push({sev,label,hard:!!hard})}};
 if(!info||!info.ok){f('med','Android could not read this file as an app (damaged, or not a real APK)');return{findings:out,perms:[]}}
 const req=(info.requested||[]).map(apN),bind=(info.binds||[]).map(apN),have=new Set(req.concat(bind));
 const rule=new Map();for(const r of A.perms||[])if(r&&r.name)rule.set(apN(r.name),r);
 const risky=[];
 for(const [n,r] of rule)if(have.has(n)){f(r.sev||'med',r.label);if(r.sev==='high'||r.sev==='med')risky.push(n)}
 for(const c of A.combos||[]){try{if((c.all||[]).length&&c.all.every(x=>have.has(apN(x))))f(c.sev||'high',c.label)}catch{}}
 for(const b of A.brands||[]){try{if(new RegExp(b.re,'i').test(info.label||'')&&!new RegExp(b.ok,'i').test(info.pkg||''))f(b.sev||'med','Calls itself '+b.label+' but is not the real app (package '+info.pkg+')')}catch{}}
 const sg=info.signers||[],cur=sg[sg.length-1];
 if(info.signRead!==false&&!sg.length)f('med','No signing certificate could be read: Android may refuse to install it');
 for(const s of sg){const k=A.certs&&A.certs[s.sha256];if(k)f('high','Signed with a key known for malware: '+k,true)}
 if(cur){
  if(/CN=Android Debug/i.test(cur.subject||''))f('med','Signed with a debug key: a developer build, not a store release');
  if(cur.to&&cur.to<Date.now())f('low','The signing certificate has expired (Android still installs it)')}
 if(info.multi)f('low','Signed by more than one key');
 if(info.debuggable)f('med','Built as debuggable: a developer build, not a store release');
 if(info.installed&&info.installedMatch===false)f('high','Same app id as the app already on this phone ('+(info.installedVer||'installed')+') but signed by a different key: not a genuine update from that developer');
 else if(info.installed&&info.installedMatch===true)f('low','Update to the app already installed, signed by the same key');
 if(info.targetSdk>0&&info.targetSdk<23&&risky.length)f('med','Built for old Android (target '+info.targetSdk+'): dangerous permissions are granted at install with no prompt');
 const perms=[...new Set(req.concat(bind))].map(n=>{const r=rule.get(n);return{name:n,sev:r?r.sev:null,label:r?r.label:'',bind:bind.includes(n)&&!req.includes(n)}});
 const ord={high:0,med:1,low:2};perms.sort((a,b)=>(a.sev?ord[a.sev]:3)-(b.sev?ord[b.sev]:3)||a.name.localeCompare(b.name));
 return{findings:out,perms}}
async function shApkInspect(path){
 if(typeof TOOLS==='undefined'||!TOOLS||!TOOLS.inspectApk)throw new Error('The APK inspector runs in the Android app.');
 return TOOLS.inspectApk({path})}
/* findings for the copy / move gate (shield.js): high is capped to med there, except a known-bad key */
async function shApkFindings(path,rules){const info=await shApkInspect(path);return shApkAnalyze(info,rules).findings}
/* before Install app: returns true to go ahead. Only a high finding stops to ask; everything is noted in Recent. */
async function shApkGate(name,path){
 try{
  if(!shOn()||typeof TOOLS==='undefined'||!TOOLS||!TOOLS.inspectApk)return true;
  const rules=await shRules();shFxOn('Shield checking the app…');
  const info=await shApkInspect(path),a=shApkAnalyze(info,rules),t=shTally(name,a.findings,'apk');
  if(!t.hi.length){if(t.me.length)shFxDone('ok','Checked: '+t.me.length+' to look at');else shFxDone('ok','Checked');return true}
  shFxDone('bad','Dangerous signs');
  const lines=t.hi.slice(0,3).map(x=>x.label).join('; ')+(t.hi.length>3?'; and '+(t.hi.length-3)+' more':'');
  const ok=await dlg({title:'Shield: check before installing '+(info.ok&&info.label?info.label:name),msg:lines+'. Open Tools > Shield > Inspect an APK to see everything.',ok:'Install anyway',danger:true});
  return !!ok}
 catch{shFxOff();return true}}
async function shCopyText(t){try{await navigator.clipboard.writeText(t);toast('Copied')}catch{toast(t)}}
function shApkReport(name,info,a){
 const o=$('#shres');if(!o)return;o.replaceChildren();
 const hi=a.findings.some(x=>x.sev==='high'),me=a.findings.some(x=>x.sev==='med');
 const v=hi?'blocked':me?'noted':'clean',t=hi?'Dangerous signs':me?'Worth a closer look':'No risky signs found';
 const top=h('div','dc shcard shapk '+v,null,h('b',null,info.ok?(info.label||info.pkg):name),h('small',null,t+(v==='clean'?'. That is not a guarantee.':'')));
 if(info.ok){
  top.append(h('small',null,info.pkg+(info.verName?' · version '+info.verName:'')),
   h('small',null,'Needs Android '+(info.minSdk||'?')+' or newer · built for Android '+(info.targetSdk||'?')+' · '+shMB(info.size||0)));
  if(info.installed)top.append(h('small',null,'Already installed on this phone'+(info.installedVer?' (version '+info.installedVer+')':'')))}
 o.append(top);
 if(a.findings.length){const c=h('div','dc shcard',null,h('b',null,'What Shield found'));
  a.findings.slice().sort((x,y)=>({high:0,med:1,low:2}[x.sev]-{high:0,med:1,low:2}[y.sev])).forEach(x=>c.append(h('div','shlg '+(x.sev==='high'?'blocked':x.sev==='med'?'noted':'clean'),null,h('small',null,(x.sev==='high'?'Dangerous: ':x.sev==='med'?'Check: ':'Info: ')+x.label))));
  o.append(c)}
 const sg=info.signers||[];
 if(info.ok){const c=h('div','dc shcard',null,h('b',null,'Signed by'));
  if(!sg.length)c.append(h('small',null,info.signRead===false?'Could not be read on this phone.':'Nobody. This file carries no signature.'));
  else{const s=sg[sg.length-1];
   c.append(h('small',null,apCN(s.subject)+(s.selfSigned?' (self-signed)':'')),h('small',null,'Valid '+apDate(s.from)+' to '+apDate(s.to)+' · '+(s.alg||'')),
    h('small',null,'SHA-256 fingerprint (tap to copy). A real app always shows the same one.'));
   const fp=h('code','shfp',s.sha256);fp.onclick=()=>shCopyText(s.sha256);c.append(fp);
   if(sg.length>1)c.append(h('small',null,(sg.length-1)+' earlier or additional key'+(sg.length>2?'s':'')+' also in the signing history.'))}
  o.append(c);
  const d=h('details','dc shcard',null,h('summary',null,'Permissions it asks for ('+a.perms.length+')'));
  if(!a.perms.length)d.append(h('small',null,'None.'));
  a.perms.forEach(p=>d.append(h('div','shlg '+(p.sev==='high'?'blocked':p.sev==='med'?'noted':'clean'),null,h('b',null,p.name+(p.bind?'  (guards a service)':'')),h('small',null,p.label||'No rule for this one'))));
  o.append(d)}}
async function shApkPick(){
 try{const r=await SAF.pickDocs({persist:false}),it=((r&&r.items)||[]).filter(x=>!x.dir)[0];if(!it)return;
  if(!/\.apk$/i.test(it.name))return toast('Pick a .apk file. Bundles (.apks, .xapk) are not supported.');
  const out=$('#shres');if(out)out.replaceChildren();
  shFxOn('Inspecting '+it.name+'…');
  const rules=await shRules(),path=(await SAF.cacheCopy({uri:it.uri,name:it.name})).path,info=await shApkInspect(path),a=shApkAnalyze(info,rules);
  shTally(it.name,a.findings,'apk');
  const hi=a.findings.some(x=>x.sev==='high');shFxDone(hi?'bad':'ok',hi?'Dangerous signs':'Inspected');shApkReport(it.name,info,a)}
 catch(e){shFxOff();if(!(e&&e.code==='CANCELLED'))toast(e&&e.message?e.message:'Could not inspect that file.')}}
