"""V0.29.0 tests: Passkeys & autofill screen, the buttons that open Android settings, and the password-sharing hook.
Run: python3 tests/v0290.py   (needs `pip install playwright` and a Chromium)"""
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
SEED="""async()=>{
 AU.list=[
  {type:'totp',issuer:'GitHub',name:'fezzy@example.com',secret:'JBSWY3DPEHPK3PXP',digits:6,period:30,algo:'SHA1',link:'github.com'},
  {type:'pass',issuer:'Bank',name:'grant',email:'g@x.com',secret:'pw-one',link:'https://www.bank.example/login'},
  {type:'pass',issuer:'Shop',email:'s@x.com',secret:'pw-two',link:''},
  {type:'pass',issuer:'Empty',name:'x',secret:'',link:'e.com'}];
 AU.eg=[];await auSave();AU.ready=true;AU.grp='';AU.tab='all';await tAuth()}"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock);pg.add_init_script("localStorage.setItem('cnd.auth.prof','0')");pg.add_init_script("localStorage['cnd.auth.prof']='0'")
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_function("typeof tAuth==='function'&&typeof drawCk==='function'")
    pg.evaluate('openTools()');pg.evaluate(SEED)
    # hook is a no-op while sharing is off
    ok(pg.evaluate("__cred.syncs")==0,'nothing is sent while sharing is off')
    # list shape: only non-empty Password entries, domain from the link, user name falls back to email
    L=pg.evaluate("ckList()")
    ok(len(L)==2,'only Password entries with a password are shared (got %d)'%len(L))
    ok(L[0]=={'d':'bank.example','t':'Bank','u':'grant','p':'pw-one'},'domain, title, user name and password are mapped')
    ok(L[1]['u']=='s@x.com' and L[1]['d']=='','email is used when there is no user name; no site stays empty')
    # screen opens from the menu and shows both settings buttons
    pg.evaluate("drawCk()");pg.wait_for_selector('text=Passkeys on this phone')
    ok(pg.locator('text=Switch on in Android settings').count()==2,'both settings buttons are shown while off')
    pg.locator('button:has-text("Switch on in Android settings")').nth(0).click()
    pg.locator('button:has-text("Switch on in Android settings")').nth(1).click()
    ok(pg.evaluate("__cred.opened")==['provider','autofill'],'the buttons open the provider and autofill pages')
    # turning sharing on sends the list
    pg.locator('button:has-text("Turn on")').click();pg.wait_for_selector('#dlg.on')
    pg.locator('#dk').click();pg.wait_for_function("__cred.syncs>=1")
    ok(json.loads(pg.evaluate("__cred.pw"))==L,'turning sharing on sends the password list')
    # the hook follows saves
    pg.evaluate("(async()=>{AU.list.push({type:'pass',issuer:'New',name:'n',secret:'pw-three',link:'new.example'});await auSave()})()")
    pg.wait_for_function("__cred.syncs>=2")
    ok(len(json.loads(pg.evaluate("__cred.pw")))==3,'a new password reaches autofill after auSave')
    pg.evaluate("(async()=>{await auSave()})()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__cred.syncs")==2,'an unchanged list is not sent again')
    # a 2FA-only change does not change what is shared, so nothing is sent
    pg.evaluate("(async()=>{AU.list[0].issuer='GH';await auSave()})()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__cred.syncs")==2,'changing a 2FA entry sends nothing')
    # a native failure never breaks saving
    pg.evaluate("__cred.fail=true")
    r=pg.evaluate("(async()=>{try{AU.list.push({type:'pass',issuer:'Z',name:'z',secret:'zz',link:'z.example'});await auSave();return 'saved'}catch(e){return 'threw '+e.message}})()")
    ok(r=='saved','a failing native call does not stop an account being saved')
    pg.evaluate("__cred.fail=false")
    # a locked list never replaces the shared copy
    pg.evaluate("AU.locked=true;AU.list=[]");before=pg.evaluate("__cred.pw")
    pg.evaluate("ckSync(true)");pg.wait_for_timeout(200)
    ok(pg.evaluate("__cred.pw")==before,'a locked list does not overwrite the shared copy')
    pg.evaluate("AU.locked=false")
    # passkey delete
    pg.evaluate("drawCk()");pg.wait_for_selector('text=Example')
    pg.locator('button:has-text("Delete")').click();pg.wait_for_selector('#dlg.on');pg.locator('#dk').click()
    pg.wait_for_function("__cred.passkeys.length===0")
    ok(True,'a passkey can be deleted')
    # turning it off erases the copy and stops sending
    pg.evaluate("drawCk()");pg.wait_for_selector('button:has-text("Turn off and erase")')
    pg.locator('button:has-text("Turn off and erase")').click();pg.wait_for_selector('#dlg.on');pg.locator('#dk').click()
    pg.wait_for_function("__cred.pw===null")
    ok(pg.evaluate("localStorage.getItem('cnd.auth.share')")is None,'turning sharing off erases the copy and clears the switch')
    # back button returns to the Authenticator
    pg.evaluate("drawCk()");pg.wait_for_selector('text=No passkeys saved here yet');pg.locator('#tback').click()
    ok(pg.evaluate("TV.view")=='au','back from the screen returns to the Authenticator')
    b.close()
ok(not errs,'no page errors '+str(errs))
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
