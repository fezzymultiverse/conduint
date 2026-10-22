"""V0.51.0: fuller refresh wave, Home first paint, add storage once, Wi-Fi pill spacing, rotating quotes, duplicate scanner, Authenticator -> Password Manager sync."""
import http.server, threading, functools, os, sys
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':412,'height':860},has_touch=True);pg.add_init_script(mock);pg.add_init_script("localStorage['cnd.auth.prof']='0'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    # first paint: the body is already Home before any script runs
    pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{window.__homeAtDcl=document.body.classList.contains('home')})")
    pg.goto(url);pg.evaluate('askedAll=true');pg.evaluate("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')");pg.wait_for_timeout(900)
    ok(pg.evaluate("window.__homeAtDcl===true"),'body is Home from the first paint')
    ok(pg.evaluate("getComputedStyle(document.querySelector('#list')).display")=='none','the file list ("add a folder" text) is hidden on Home')
    ok(pg.evaluate("document.body.classList.contains('home')&&getComputedStyle(document.querySelector('#dash')).display")!='none','Home is showing')
    # refresh wave
    ok(pg.evaluate("(()=>{const P=document.getElementById('ptr');return !!P&&P.querySelectorAll('path').length===4&&getComputedStyle(P).height==='44px'})()"),'wave is taller (44px) with 4 layers (sheet, back wave, wave, beam)')
    ok(pg.evaluate("document.getElementById('ptrg').getAttribute('spreadMethod')==='repeat'"),'beam gradient repeats (no gap)')
    pg.evaluate("document.getElementById('ptr').style.opacity=1");pg.wait_for_timeout(50)
    ptrd=lambda:pg.evaluate("[...document.querySelectorAll('#ptr path')].map(x=>x.getAttribute('d')||'').map(d=>d.length)")
    ok(pg.evaluate("(()=>{ptrAttach;return true})()"),'ptrAttach still defined')
    # add once
    pg.evaluate("window.__picks=0;SAF.pickTree=()=>{window.__picks++;return new Promise(r=>setTimeout(()=>r({uri:'content://t/one',root:'content://t/one',name:'One'}),300))}")
    pg.evaluate("S.mounts=[];S.dash=S.dash||{};S.dash.fm=[]")
    pg.evaluate("Promise.all([connectSaf('','','folder',null,{}),connectSaf('','','folder',null,{}),connectSaf('','','folder',null,{})])");pg.wait_for_timeout(900)
    print('picks after 3 taps =',pg.evaluate('window.__picks'));ok(pg.evaluate("window.__picks")==1,'three rapid add taps open the picker once')
    ok(pg.evaluate("S.mounts.filter(m=>m.uri==='content://t/one').length")==1,'the folder is added once')
    pg.evaluate("connectSaf('','','folder',null,{})");pg.wait_for_timeout(700)
    ok(pg.evaluate("S.mounts.filter(m=>m.uri==='content://t/one').length")==1,'adding the same folder again does not duplicate it')
    pg.evaluate("S.dash.fm=[S.mounts.splice(0,1)[0]]");pg.evaluate("connectSaf('','','folder',null,{})");pg.wait_for_timeout(700)
    ok(pg.evaluate("S.mounts.length")==0 and pg.evaluate("S.dash.fm.length")==1,'a folder already on Home is recognised, not added again')
    pg.evaluate("goHome()");pg.wait_for_timeout(200)
    pg.evaluate("window.__picks=0;S.dash.fm=[]");pg.evaluate("addFolder()");pg.wait_for_timeout(700)
    ok(pg.evaluate("window.__picks")==1,'Home > Add folder goes straight to the picker (one step)')
    pg.evaluate("goHome()");pg.wait_for_timeout(300)
    # Wi-Fi pill
    pg.evaluate("wfShow2('MyWifi')");pg.wait_for_timeout(100)
    r=pg.evaluate("(()=>{const e=document.getElementById('dsub'),c=getComputedStyle(e);return [c.marginTop,c.paddingTop,c.paddingLeft,c.borderRadius.indexOf('999')>=0||parseFloat(c.borderRadius)>20]})()")
    ok(r[0]=='9px' and r[1]=='6px' and r[2]=='12px' and r[3],'Wi-Fi name has room around it '+str(r))
    # quotes
    ok(pg.evaluate("!!document.getElementById('dquote')&&document.getElementById('dquote').textContent.length>3"),'a quote shows on Home')
    n=pg.evaluate("Object.values(QT).reduce((a,x)=>a+x.length,0)")
    ok(n>=100,f'{n} lines in the quote bank')
    ok(pg.evaluate("QT.night.includes('Still up?')&&QT.morning.includes('What\\u2019s today\\u2019s plan?')"),'"Still up?" and "What\'s today\'s plan?" are in')
    a=pg.evaluate("document.querySelector('#dquote .qt').textContent");pg.click('#dquote');pg.wait_for_timeout(700)
    b2=pg.evaluate("document.querySelector('#dquote .qt').textContent")
    ok(a!=b2,'tapping the quote shows the next one')
    seen=set()
    for _ in range(8):
        pg.evaluate("qtNext(true)");seen.add(pg.evaluate("document.querySelector('#dquote .qt').textContent"))
    ok(len(seen)==8,'eight steps give eight different lines')
    ok(pg.evaluate("(()=>{const t=document.querySelector('#dquote .qt');return t.children.length===0})()"),'quote is plain text (textContent)')
    # duplicate scanner
    pg.evaluate("""()=>{PM.VK={};PM.bad=false;const mk=(n,u,pw,uri,extra)=>Object.assign(pmNorm({id:pmId(),type:1,name:n,login:{username:u,password:pw,totp:'',uris:[{uri}]}}),extra||{});
     window.__saved=[];window.__trashed=[];pmSaveItem=async(it)=>{window.__saved.push(it.id);const i=PM.items.findIndex(x=>x.id===it.id);if(i<0)PM.items.push(it);else PM.items[i]=it;return it};
     pmTrashItem=async(it)=>{it.deletedDate=pmNow();window.__trashed.push(it.id)};
     PM.items=[mk('GitHub','Fezzy','pw1','https://github.com'),mk('Github','fezzy','pw2','https://www.github.com/login',{login:{username:'fezzy',password:'pw2',totp:'otpauth://totp/x?secret=ABC',uris:[{uri:'https://www.github.com/login',match:null}]}}),
      mk('Mail','a@x.com','m1','https://mail.x.com'),mk('Mail','a@x.com','m1','https://mail.x.com'),mk('Mail','b@x.com','m2','https://mail.x.com'),mk('NoSite','u','p',''),mk('NoSite','u','q','')];
     PM.hid=0;window.__g=pmdFind()}""")
    r=pg.evaluate("__g.map(g=>[g.items.length,g.exact,g.why])")
    ok(len(r)==3,'three groups found (GitHub, Mail exact copies, no-site pair) '+str(r))
    ok(any(x[1] and x[0]==2 for x in r),'the identical Mail copies are flagged as exact copies')
    ok(not pg.evaluate("__g.some(g=>g.items.some(i=>i.login.username==='b@x.com'))"),'a different user name on the same site is NOT grouped')
    ok(pg.evaluate("__g.some(g=>g.items.some(i=>i.name==='NoSite'))"),'logins with no site are grouped by name + user name')
    # keep flow copies what is missing, trashes the rest
    pg.evaluate("""async()=>{const g=__g.find(g=>g.items.some(i=>i.name==='GitHub')),keep=g.items.find(i=>!i.login.totp),others=g.items.filter(i=>i!==keep);window.__k=keep.id;await pmdKeep(keep,others)}""")
    ok(pg.evaluate("PM.items.find(i=>i.id===__k).login.totp.includes('ABC')"),'the 2FA code is copied into the kept login')
    ok(pg.evaluate("PM.items.find(i=>i.id===__k).login.uris.length>=2"),'the other login\'s link is copied too')
    ok(pg.evaluate("PM.items.find(i=>i.id===__k).passwordHistory.some(x=>x.password==='pw2')"),'the other password is kept in the history')
    ok(pg.evaluate("__trashed.length")==1 and pg.evaluate("__saved.indexOf(__k)")==0,'the kept login is saved first, the other goes to the Trash')
    ok(pg.evaluate("pmdFind().every(g=>!g.items.some(i=>i.name.toLowerCase()==='github'))"),'GitHub is no longer listed as a duplicate')
    # exact copies in one go (dialog auto-accepted)
    pg.evaluate("dlg=async()=>({ok:true})")
    pg.evaluate("pmdExactAll()");pg.wait_for_timeout(200)
    ok(pg.evaluate("PM.items.filter(i=>!i.deletedDate&&i.name==='Mail'&&i.login.username==='a@x.com').length")==1,'exact copies cleared, one kept')
    ok(pg.evaluate("PM.items.some(i=>!i.deletedDate&&i.login.username==='b@x.com')"),'the other Mail login is untouched')
    # not duplicates hides a group
    pg.evaluate("localStorage.removeItem(PMD.ign);window.__g=pmdFind()")
    nb=pg.evaluate("__g.length");pg.evaluate("{const s=pmdIgn();s.add(__g[0].key);pmdIgnSave(s)}")
    ok(pg.evaluate("pmdFind().length")==nb-1,'"Not duplicates" hides that group')
    # screen renders from Reports and Settings
    pg.evaluate("localStorage.removeItem(PMD.ign)")
    ok(pg.evaluate("PM_REP.some(r=>r[0]==='dups')&&Array.isArray(pmHealth().dups)"),'Reports has a Duplicate logins row')
    pg.evaluate("document.getElementById('pm')&&0;PM.open=true;PM.stack=[];PM.scr='hlist';PM.hk='dups';pmRender()");pg.wait_for_timeout(100)
    ok(pg.evaluate("document.querySelectorAll('#pml .pmdg').length")>=1,'the scanner screen draws groups')
    ok(pg.evaluate("[...document.querySelectorAll('#pml .pmdg .chip')].every(c=>c.textContent==='Keep')"),'every row has a Keep button')
    # authenticator sync
    pg.evaluate("""()=>{PM.items=[];window.__saved=[];AU.ready=true;AU.locked=false;AU.broken=false;S.settings.authToPm=true;localStorage.removeItem(PMD.map);
     AU.list=[{type:'totp',issuer:'Google',name:'me@x.com',secret:'JBSWY3DPEHPK3PXP',link:'google.com'},{type:'pass',issuer:'Bank',name:'me',secret:'hunter2',link:'bank.com'},{type:'note',issuer:'Wifi',name:'home',note:'router pin 1234'}]}""")
    r=pg.evaluate("pmAuSync(true)");ok(r['added']==3,'first sync copies all 3 Authenticator entries '+str(r))
    ok(pg.evaluate("PM.items.some(i=>i.name==='Google'&&i.login.totp.includes('JBSWY3DPEHPK3PXP'))"),'the 2FA secret arrives as a login TOTP')
    ok(pg.evaluate("PM.items.some(i=>i.name==='Bank'&&i.login.password==='hunter2')"),'a password entry arrives with its password')
    r=pg.evaluate("pmAuSync(true)");ok(r['added']==0,'a second sync adds nothing (no duplicates)')
    pg.evaluate("AU.list.push({type:'totp',issuer:'Proton',name:'p@x.com',secret:'MFRGGZDFMZTWQ2LK'})")
    r=pg.evaluate("pmAuSync(true)");ok(r['added']==1,'a new Authenticator entry is picked up on the next sync')
    pg.evaluate("PM.items=PM.items.filter(i=>i.name!=='Bank')")
    r=pg.evaluate("pmAuSync(true)");ok(r['added']==0 and not pg.evaluate("PM.items.some(i=>i.name==='Bank')"),'an item deleted in the vault is not brought back')
    ok('JBSWY3DPEHPK3PXP' not in pg.evaluate("localStorage.getItem(PMD.map)||''") and 'hunter2' not in pg.evaluate("localStorage.getItem(PMD.map)||''"),'the sync record holds hashes only, no secrets')
    pg.evaluate("S.settings.authToPm=false;AU.list.push({type:'totp',issuer:'Off',name:'o',secret:'GEZDGNBVGY3TQOJQ'})")
    ok(pg.evaluate("pmAuSync()")is None and not pg.evaluate("PM.items.some(i=>i.name==='Off')"),'switched off: nothing is copied automatically')
    pg.evaluate("PM.VK=null")
    ok(pg.evaluate("pmAuSync(true)")is None,'vault locked: no sync, no error')
    # adopt: an existing identical PM item is reused, not duplicated
    pg.evaluate("""()=>{PM.VK={};S.settings.authToPm=true;localStorage.removeItem(PMD.map);window.__saved=[];PM.items=pmFromAuth([AU.list[0]],true).items.map(pmNorm);AU.list=[AU.list[0]]}""")
    r=pg.evaluate("pmAuSync(true)");ok(r['added']==0 and r['adopted']==1,'an identical vault item is adopted, not duplicated '+str(r))
    # settings rows
    pg.evaluate("PM.open=true;PM.stack=[];PM.scr='set';PM.tab='set';pmRender()");pg.wait_for_timeout(100)
    t=pg.inner_text('#pml')
    ok('Find duplicates' in t and 'Keep Authenticator in this vault' in t and 'Sync Authenticator now' in t,'Settings shows the three new rows')
    ok(not errs,'no page errors '+str(errs[:3]))
    b.close()
print('ALL PASS' if not fails else 'FAILED: '+'; '.join(fails));sys.exit(1 if fails else 0)
