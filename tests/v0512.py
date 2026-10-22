"""V0.51.2: vault -> Authenticator sync (bare one-time password box + Authenticator (TOTP) field), one Sync button for both ways on the Passwords dashboard."""
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
    pg.goto(url);pg.evaluate('askedAll=true');pg.wait_for_timeout(800)
    ev=lambda js:pg.evaluate(js)
    ev("(async()=>{await pmCreate('t@t.co','Passw0rd!x','');await auLoad();AU.ready=true})()");pg.wait_for_timeout(500)
    ok(ev("!!PM.VK&&!AU.locked&&Array.isArray(AU.list)"),'vault and Authenticator open')
    # 1. bare one-time password box
    ev("pmSaveItem(pmNorm({id:pmId(),type:1,name:'Bare site',login:{uris:[{match:null,uri:'https://bare.example.com'}],username:'bob',password:'x',totp:'jbsw y3dp ehpk 3pxp'}}),{keepHistory:true})");pg.wait_for_timeout(1800)
    ok(ev("AU.list.length")==1,'bare key in the box lands in the Authenticator: '+str(ev("JSON.stringify(AU.list)")))
    ok(ev("AU.list[0]&&AU.list[0].secret")=='JBSWY3DPEHPK3PXP','secret is normalised (no spaces, upper case)')
    ok(ev("AU.list[0]&&AU.list[0].issuer+'|'+AU.list[0].name+'|'+AU.list[0].link")=='Bare site|bob|bare.example.com','title, user name and link carried over')
    ok(ev("PM.items.filter(i=>!i.deletedDate).length")==1,'no copy came back into the vault (still 1 item)')
    # 2a. Secure note with its Authenticator key
    ev("pmSaveItem(pmNorm({id:pmId(),type:2,name:'Note with key',notes:'n',totp:'KRSXG5CTMVRXEZLU'}),{keepHistory:true})");pg.wait_for_timeout(1800)
    ok(ev("AU.list.length")==2,'Secure note Authenticator key lands in the Authenticator')
    ok(ev("PM.items.filter(i=>!i.deletedDate).length")==2,'still 2 vault items, no loop')
    # 2b. Authenticator (TOTP) custom field (type 3) on a login, with digits and period in the link
    ev("pmSaveItem(pmNorm({id:pmId(),type:1,name:'Field site',login:{uris:[],username:'amy',password:'',totp:''},fields:[{name:'Work code',type:3,value:'otpauth://totp/X:y?secret=MFRGGZDFMZTWQ2LK&digits=8&period=60'}]}),{keepHistory:true})");pg.wait_for_timeout(1800)
    ok(ev("PM.items.find(i=>i.name==='Field site').fields[0].type")==3,'the Authenticator (TOTP) field keeps its type through saving')
    ok(ev("AU.list.length")==3,'Authenticator (TOTP) field lands in the Authenticator')
    ok(ev("(()=>{const a=AU.list.find(x=>x.secret==='MFRGGZDFMZTWQ2LK');return !!a&&a.digits===8&&a.period===60&&a.name==='amy'})()"),'digits and period from the otpauth link kept')
    ok(ev("PM.items.filter(i=>!i.deletedDate).length")==3,'still 3 vault items, no loop')
    # 3. saving again does not duplicate; a removed code stays removed
    ev("(async()=>{const it=PM.items.find(i=>i.name==='Bare site');await pmSaveItem(it,{keepHistory:true})})()");pg.wait_for_timeout(1500)
    ok(ev("AU.list.length")==3,'saving again adds nothing')
    ev("(async()=>{AU.list=AU.list.filter(a=>a.secret!=='JBSWY3DPEHPK3PXP');await auSave()})()");pg.wait_for_timeout(1200)
    r=ev("(async()=>JSON.stringify(await pmToAuSync(true)))()")
    ok(ev("AU.list.length")==2,'a code you removed from the Authenticator is not brought back: '+r)
    # 4. invalid key is skipped without an error
    ev("pmSaveItem(pmNorm({id:pmId(),type:1,name:'Bad',login:{uris:[],username:'',password:'',totp:'not a key!!'}}),{keepHistory:true})");pg.wait_for_timeout(1200)
    ok(ev("AU.list.length")==2,'a bad key is skipped')
    # 5. Authenticator -> vault still works (note + code)
    ev("(async()=>{AU.list.push({type:'note',issuer:'Auth note',name:'',note:'from auth'});AU.list.push({type:'totp',issuer:'Fresh',name:'f',secret:'GEZDGNBVGY3TQOJQ',digits:6,period:30,algo:'SHA1',link:''});await auSave()})()");pg.wait_for_timeout(2500)
    ok(ev("PM.items.some(i=>i.name==='Auth note'&&i.notes==='from auth')"),'Authenticator note reaches the vault')
    ok(ev("PM.items.some(i=>i.name==='Fresh'&&(i.login.totp||'').includes('GEZDGNBVGY3TQOJQ'))"),'Authenticator code reaches the vault')
    n=ev("AU.list.length");pg.wait_for_timeout(1500)
    ok(ev("AU.list.length")==n,'no ping-pong: Authenticator count steady at '+str(n))
    # 6. Passwords dashboard sync button
    ev("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')");ev("pmOpen()");pg.wait_for_timeout(900);ev("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')")
    scr=ev("PM.scr");print('PM.scr =',scr)
    btn=pg.locator('[aria-label="Sync and backup"]')
    ok(btn.count()>=1,'dashboard has the Sync and backup button (screen: '+str(scr)+')')
    if btn.count()>=1:
        btn.first.click();pg.wait_for_timeout(300)
        first=ev("(()=>{const m=document.querySelector('#menu');return m?m.innerText.split('\\n')[0]:''})()")
        ok('Sync now' in first,'first menu row is Sync now: '+first)
        ev("AU.list.push({type:'totp',issuer:'Late',name:'l',secret:'ORSXG5BAON2HE2LOM4QGC3LF',digits:6,period:30,algo:'SHA1',link:''})")
        pg.locator('#menu .mi',has_text='Sync now').first.click();pg.wait_for_timeout(1500)
        ok(ev("PM.items.some(i=>i.name==='Late')"),'tapping Sync now copies a new Authenticator code into the vault')
        toast=ev("(()=>{const t=document.querySelector('#toast');return t?t.innerText:''})()");print('toast:',toast)
    ok(not errs,'no page errors: '+str(errs[:3]))
    b.close()
print('FAILS:',len(fails));sys.exit(1 if fails else 0)
