"""V0.22 tests: Authenticator groups (incl. empty groups), secret items, A-Z sorting, CSV / JSON / pasted-text extractor,
and the encrypted backup round trip.
Run: python3 tests/v0220.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os, json
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
CHROME=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION')  # logo fetches fail offline, that is fine
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock);pg.add_init_script("localStorage.setItem('cnd.auth.prof','0')");pg.add_init_script("localStorage['cnd.auth.prof']='0'");pg.add_init_script("localStorage.setItem('cnd.auth.prof','0')")
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(600);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("parseFloat(VER.slice(1))>=0.22&&typeof auxExtract==='function'&&typeof auPaste==='function'&&typeof auxGroups==='function'"),'modules loaded, V0.22 or newer')
    dk=lambda:pg.click('#dk')
    SEED="""async()=>{await openTools();await auLoad();
      AU.list=[
       {type:'totp',issuer:'GitHub',name:'grant',secret:'JBSWY3DPEHPK3PXP',link:'github.com',group:'Dev'},
       {type:'totp',issuer:'GitLab',name:'grant',secret:'JBSWY3DPEHPK3PXP',link:'gitlab.com',group:'Dev'},
       {type:'bak',issuer:'GitHub',codes:'abcd1234\\nefgh5678\\nijkl9012',used:['abcd1234']},
       {type:'rec',issuer:'Microsoft',items:[{t:'Laptop',v:'ABCD-1234-EFGH-5678-IJKL-9012-MNOP-3456'}]},
       {type:'ssh',issuer:'Server',pubkey:'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc grant@x',privkey:'-----BEGIN OPENSSH PRIVATE KEY-----\\nxx\\n-----END OPENSSH PRIVATE KEY-----'},
       {type:'api',issuer:'OpenAI',name:'k',secret:'sk-123',note:'scope'},
       {type:'note',issuer:'Wifi',note:'pass is hunter2'},
       {type:'pass2',issuer:'Vault',note:'correct horse battery'},
       {type:'pass',issuer:'Zed',name:'z@z.com',secret:'pw',link:'zed.com'}];
      AU.eg=[];localStorage.removeItem(AUG);await auSave();AU.ready=true;AU.grp='';AU.tab='all';await tAuth()}"""
    pg.evaluate(SEED);pg.wait_for_timeout(600)
    ok(not errs,'Authenticator list opens '+str(errs))
    # ---------- groups ----------
    ok(pg.evaluate("auxGroups(AU.list).map(g=>g.join(':')).join()")=='Dev:2','group counts')
    ok(pg.locator('.augbar .autab').count()>=4,'group chips drawn: '+str(pg.locator('.augbar .autab').all_inner_texts()))
    pg.locator('.augbar .autab',has_text='Dev').first.click();pg.wait_for_timeout(250)
    ok(pg.locator('.aulist > *').count()==2,'Dev chip shows 2 accounts')
    pg.locator('.augbar .autab',has_text='All').first.click()
    pg.evaluate("()=>{AU.sel=new Set([AU.list[3],AU.list[4]]);drawAu()}");pg.wait_for_timeout(200)
    ok(pg.locator('.auhead b').first.inner_text().startswith('2 selected'),'select mode counts picks')
    pg.evaluate("()=>auAssign([...AU.sel],'Servers',true)");pg.wait_for_timeout(400)
    ok(pg.evaluate("auxGroups(AU.list).map(g=>g[0]).join()")=='Dev,Servers','assign to a new group')
    pg.evaluate("()=>auGroupAdd('Servers')");pg.wait_for_timeout(200)
    pg.locator('.augpick:not(.on)').first.click();pg.locator('.aufab').click();pg.wait_for_timeout(400)
    ok(pg.evaluate("auxGroups(AU.list).find(g=>g[0]==='Servers')[1]")==3,'add accounts screen')
    pg.evaluate("()=>{AU.grp='Servers';drawAu()}");pg.wait_for_timeout(200)
    pg.evaluate("()=>auGroupMenu('Servers',document.querySelector('.augbar .autab.on'))");pg.wait_for_timeout(200)
    pg.get_by_text('Rename group…').click();pg.wait_for_timeout(200);pg.fill('#di','Infra');dk();pg.wait_for_timeout(400)
    ok(pg.evaluate("auxGroups(AU.list).map(g=>g[0]).join()")=='Dev,Infra','rename group')
    pg.evaluate("()=>auGroupMenu('Infra',document.querySelector('.augbar .autab.on'))");pg.wait_for_timeout(200)
    pg.get_by_text('Delete group').click();pg.wait_for_timeout(200);dk();pg.wait_for_timeout(400)
    ok(pg.evaluate("auxGroups(AU.list).map(g=>g[0]).join()")=='Dev' and pg.evaluate("AU.list.length")==9,'delete group keeps accounts')
    # group same platform: GitHub login + GitHub codes are not grouped, so they pair
    pg.evaluate("()=>{AU.list[0].group='';AU.list[1].group='';drawAu()}");pg.wait_for_timeout(200)
    pg.evaluate("()=>{auAutoGroup()}");pg.wait_for_timeout(300);dk();pg.wait_for_timeout(400)
    ok(pg.evaluate("AU.list.filter(a=>a.issuer==='GitHub').every(a=>a.group==='GitHub')"),'group same platform')
    # ---------- empty groups ----------
    pg.evaluate("async()=>{const r=null;auNewGroup()}");pg.wait_for_timeout(200);pg.fill('#di','Banks');dk();pg.wait_for_timeout(400)
    pg.evaluate("()=>{TV.view='au';drawAu()}");pg.wait_for_timeout(300)
    ok(pg.evaluate("auxGroups(AU.list,AU.eg).some(g=>g[0]==='Banks'&&g[1]===0)"),'empty group exists with no account')
    ok(pg.evaluate("JSON.parse(localStorage.getItem(AUG)).includes('Banks')"),'empty group persisted')
    pg.evaluate("async()=>{await auLoad();drawAu()}");pg.wait_for_timeout(300)
    ok(pg.evaluate("AU.eg.includes('Banks')")and pg.locator('.augbar .autab',has_text='Banks').count()==1,'empty group survives a reload')
    pg.evaluate("()=>auAssign([AU.list[8]],'Banks',true)");pg.wait_for_timeout(400)
    ok(pg.evaluate("!AU.eg.includes('Banks')&&auxGroups(AU.list,AU.eg).find(g=>g[0]==='Banks')[1]===1"),'filled group leaves the empty list')
    pg.evaluate("()=>{auNewGroup()}");pg.wait_for_timeout(200);pg.fill('#di','Later');dk();pg.wait_for_timeout(300)
    pg.evaluate("()=>{TV.view='au';AU.grp='Later';drawAu()}");pg.wait_for_timeout(300)
    pg.evaluate("()=>auGroupMenu('Later',document.querySelector('.augbar .autab.on'))");pg.wait_for_timeout(200)
    pg.get_by_text('Rename group…').click();pg.wait_for_timeout(200);pg.fill('#di','Soon');dk();pg.wait_for_timeout(400)
    ok(pg.evaluate("AU.eg.join()")=='Soon','rename empty group')
    pg.evaluate("()=>auGroupMenu('Soon',document.querySelector('.augbar .autab.on'))");pg.wait_for_timeout(200)
    pg.get_by_text('Delete group').click();pg.wait_for_timeout(200);dk();pg.wait_for_timeout(300)
    ok(pg.evaluate("AU.eg.length")==0 and not errs,'delete empty group')
    # ---------- secret items ----------
    for t in ['bak','rec','ssh','api','note','pass2']:
        pg.evaluate(f"()=>{{AU.tab='all';AU.grp='';auOpenDetail(AU.list.find(a=>a.type==='{t}'))}}");pg.wait_for_timeout(250)
        ok(pg.locator('.auitem').count()>=1,f'item screen opens for {t}')
        pg.evaluate("()=>auItemForm(AU.det,0,false)");pg.wait_for_timeout(200);pg.locator('.aufab').click();pg.wait_for_timeout(300)
        ok(pg.locator('.auitem').count()>=1,f'item editor saves for {t}')
    pg.evaluate("()=>{auOpenDetail(AU.list.find(a=>a.type==='bak'));auItemForm(AU.det,null,true)}");pg.wait_for_timeout(200)
    pg.fill('textarea','qqqq1111, wwww2222\nzzzz3333');pg.locator('.aufab').click();pg.wait_for_timeout(300)
    ok(pg.evaluate("AU.list.find(a=>a.type==='bak').items.length")==6,'Add many pushes 3 new codes')
    ok(pg.evaluate("AU.list.find(a=>a.type==='bak').codes.split('\\n').length")==6,'auxSync keeps old codes field in step')
    pg.evaluate("()=>{AU.det.items[0].u=1;auxSync(AU.det)}")
    ok(pg.evaluate("AU.det.used.length")>=1,'auxSync keeps used list')
    # ---------- sorting ----------
    ok(pg.evaluate("JSON.stringify(auxOrder([{issuer:'b'},{issuer:'A'},{issuer:'a10'},{issuer:'a2'}],[0,1,2,3],'az'))")=='[1,3,2,0]','A-Z order is natural and case-insensitive')
    ok(pg.evaluate("JSON.stringify(auxOrder([{issuer:'b'},{issuer:'A'}],[0,1],'added'))")=='[0,1]','added order keeps order')
    pg.evaluate("()=>{localStorage.setItem('cnd.auth.sort','added');TV.view='au';drawAu()}");pg.wait_for_timeout(200)
    ok(pg.evaluate("auSortGet()")=='added' and not errs,'sort toggle to added')
    pg.evaluate("()=>{localStorage.setItem('cnd.auth.sort','az');drawAu()}")
    # ---------- extractor (pure) ----------
    X=pg.evaluate("""()=>{const o=auxExtract(`GitHub recovery codes:
abcd1234
efgh5678
ijkl9012
Recovery key: ABCD-1234-EFGH-5678-IJKL-9012-MNOP-3456
123456-123456-123456-123456-123456-123456-123456-123456
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabcdefghijkl me@laptop
random note`);return{c:o.codes,k:o.keys.map(k=>k.v),s:o.ssh.length,r:o.rest}}""")
    ok(X['c']==['abcd1234','efgh5678','ijkl9012'],'extractor finds 3 backup codes '+str(X['c']))
    ok(len(X['k'])==2,'extractor finds recovery key + BitLocker key '+str(X['k']))
    ok(X['s']==1 and 'random note' in X['r'],'extractor finds SSH key and keeps the note')
    # ---------- CSV / JSON import ----------
    CSV='name,url,username,password,note,folder\\nGitHub,https://github.com,grant,pw1,"Recovery codes:\\nabcd1234\\nefgh5678\\nijkl9012",Dev\\nZed,https://zed.com,z@z.com,pw2,plain note,\\n'
    R=pg.evaluate("async()=>{const r=await auParseImport('%s','test.csv');return{n:r.items.length,t:r.items.map(e=>e.type).join(),g:r.items.map(e=>e.group||'').join()}}"%CSV)
    ok('bak' in R['t'].split(',') and R['t'].split(',').count('pass')==2,'CSV: passwords and a backup-code entry '+str(R))
    ok('Dev' in R['g'],'CSV: folder column becomes a group')
    BW=json.dumps({"folders":[{"id":"f1","name":"Work"}],"items":[{"type":1,"name":"Acme","folderId":"f1","notes":"","login":{"username":"u","password":"p","totp":None,"uris":[{"uri":"https://acme.com"}]},"fields":[{"name":"PIN","value":"4321"}]}]}).replace("'","\\'")
    R=pg.evaluate("async()=>{const r=await auParseImport('%s','bw.json');return{n:r.items.length,g:r.items[0].group,note:r.items[0].note}}"%BW)
    ok(R['n']==2 and R['g']=='Work','Bitwarden JSON: folder to group, custom field kept '+str(R))
    # ---------- paste text screen ----------
    pg.evaluate("()=>{TV.view='au';drawAu()}");pg.wait_for_timeout(200)
    pg.locator('.auhead .auicon').last.click();pg.wait_for_timeout(200)
    pg.get_by_text('Extract from pasted text…').click();pg.wait_for_timeout(250)
    ok(pg.locator('#tbody textarea').count()==1 and pg.locator('#tbody .aufab').count()==1 and not errs,'paste screen: title, textarea, Extract button')
    before=pg.evaluate("AU.list.length")
    pg.fill('.aufld input','Proton');pg.fill('#tbody textarea','Backup codes:\nzxcv1234\nqwer5678\nasdf9012')
    pg.locator('.aufab').click();pg.wait_for_timeout(300);dk();pg.wait_for_timeout(500)
    ok(pg.evaluate("AU.list.length")>before and pg.evaluate("AU.list.some(a=>a.type==='bak'&&a.issuer==='Proton'&&a.items.length===3)"),'paste: Proton backup codes added as 3 items')
    pg.evaluate("()=>auPaste()");pg.wait_for_timeout(200);pg.locator('.aufab').click();pg.wait_for_timeout(200)
    ok(pg.evaluate("TV.view")=='aup','paste: empty text is refused, screen stays')
    pg.evaluate("()=>toolsBack()");pg.wait_for_timeout(200)
    ok(pg.evaluate("TV.view")=='au','paste: back returns to the list')
    # ---------- backup round trip ----------
    pg.evaluate("()=>{AU.eg=['Empty one'];auEgSave()}")
    SNAP=pg.evaluate("async()=>{const text=await auBkMake(AU.list,'correct horse',AU.eg);const was=JSON.stringify(AU.list);const eg=AU.eg.slice();AU.list=[];AU.eg=[];localStorage.removeItem(AUG);await auSave();\
      const list=await auBkRead(text,'correct horse');const r=await auDedupe({items:list,skipped:0});AU.list.push(...r.items);(list.groups||[]).forEach(g=>AU.eg.push(g));auEgSave();await auSave();await auLoad();\
      return{same:JSON.stringify(AU.list)===was,egs:AU.eg,eg0:eg,n:AU.list.length,wrong:await auBkRead(text,'nope').then(()=>false,e=>/Wrong passphrase/.test(e.message))}}""")
    ok(SNAP['same'],'backup, wipe, restore: list identical (groups and items survive)')
    ok(SNAP['egs']==SNAP['eg0'] and SNAP['egs']==['Empty one'],'backup carries empty groups '+str(SNAP['egs']))
    ok(SNAP['wrong'],'wrong passphrase is refused')
    OLD=pg.evaluate("async()=>{const text=await auBkMake(AU.list,'correct horse');const l=await auBkRead(text,'correct horse');return l.groups.length}")
    ok(OLD==0,'backup made without groups restores with none')
    # ---------- Authenticator as a left-panel item ----------
    ok(pg.evaluate("catalog().some(x=>x.id==='auth')&&meta({id:'auth',k:'auth'}).name==='Authenticator'"),'catalog has Authenticator')
    pg.evaluate("()=>{closeTools();const y=layNorm();while(y.panel.length>=PANEL_MAX)y.home.push(y.panel.pop());place('auth','panel')}");pg.wait_for_timeout(300)
    ok(pg.evaluate("S.lay.panel.includes('auth')&&!S.lay.home.includes('auth')"),'Authenticator placed in the left panel, nowhere else')
    ok('Authenticator' in pg.evaluate("document.querySelector('#pnl').innerText") or 'Authenticator' in pg.evaluate("document.querySelector('#pnl').textContent"),'left panel shows Authenticator')
    pg.evaluate("()=>{meta({id:'auth',k:'auth'}).open()}");pg.wait_for_timeout(900)
    ok(pg.evaluate("TV.view")=='au' and pg.evaluate("$('#tools').classList.contains('on')"),'panel item opens the Authenticator list')
    # ---------- pinned codes on Home ----------
    pg.evaluate("()=>{closeTools();AU.list.forEach(a=>delete a.pin);localStorage.removeItem('cnd.auth.hide');goHome();dashShow()}");pg.wait_for_timeout(500)
    ok(pg.evaluate("$('#dau')&&$('#dau').style.display==='none'"),'Home card hidden while nothing is pinned')
    pg.evaluate("async()=>{await auPin(AU.list.find(a=>a.type==='totp'));await auPin(AU.list.filter(a=>a.type==='totp')[1])}");pg.wait_for_timeout(400)
    pg.evaluate("()=>{goHome();dashShow();auhTick()}");pg.wait_for_timeout(1500)
    ok(pg.locator('#dau .daur').count()==2 and pg.evaluate("$('#dau').style.display")=='','Home card shows 2 pinned accounts')
    ok(pg.evaluate("/^\\d{3} \\d{3}$/.test($('#dau .dauc').textContent)"),'Home shows a live 6-digit code: '+pg.evaluate("$('#dau .dauc').textContent"))
    ok(pg.evaluate("auPinned().length")==2 and pg.evaluate("localStorage.getItem('cnd.auth.pinn')")=='2','pin count kept for the locked state')
    pg.evaluate("async()=>{await auPin(AU.list.filter(a=>a.type==='totp')[1]);}");pg.wait_for_timeout(300)
    pg.evaluate("()=>{AU.list.push({type:'totp',issuer:'X1',name:'a',secret:'JBSWY3DPEHPK3PXP'},{type:'totp',issuer:'X2',name:'a',secret:'JBSWY3DPEHPK3PXP'},{type:'totp',issuer:'X3',name:'a',secret:'JBSWY3DPEHPK3PXP'})}")
    pg.evaluate("async()=>{for(const a of AU.list.filter(a=>a.issuer&&/^X[123]$/.test(a.issuer)))await auPin(a)}");pg.wait_for_timeout(400)
    ok(pg.evaluate("auPinned().length")==3,'pin limit is 3')
    pg.evaluate("localStorage.setItem('cnd.auth.hide','1')");pg.evaluate("()=>{AUH.sig='';auhTick()}");pg.wait_for_timeout(1300)
    ok('•' in pg.evaluate("$('#dau .dauc').textContent"),'Hide codes masks the Home code')
    pg.evaluate("localStorage.removeItem('cnd.auth.hide')")
    pg.evaluate("async()=>{await openTools();AU.tab='all';auOpenForm(AU.list.indexOf(AU.list.find(a=>a.pin)))}");pg.wait_for_timeout(300)
    ok(pg.locator('#tbody .aufab').count()==1,'edit form opens for a pinned account')
    pg.locator('#tbody .aufab').click();pg.wait_for_timeout(400)
    ok(pg.evaluate("auPinned().length")==3,'editing a pinned account keeps the pin')
    ok(not errs,'no script errors during the run '+str(errs))
    b.close()
print('\nFAILS:',len(fails))
for f in fails:print(' -',f)
raise SystemExit(1 if fails else 0)
