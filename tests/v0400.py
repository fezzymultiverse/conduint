"""V0.40.0: Passwords Home dashboard + Videos shortcut. Run: python3 tests/v0400.py"""
import http.server, threading, functools, os
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
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(600);pg.evaluate('askedAll=true')
    ok(pg.evaluate("!!document.getElementById('bvid')"),'main top bar has a Videos icon')
    pg.evaluate("""async()=>{await pmCreate('fezzy@example.com','TestMaster123!','');
      const mk=async(t,n,f)=>{const it=pmBlank(t);it.name=n;f&&f(it);await pmSaveItem(it)};
      await mk(1,'Gmail',i=>{i.login.username='a@b.c';i.login.password='abc123';i.login.uris[0].uri='http://gmail.com';i.favorite=true});
      await mk(1,'GitHub',i=>{i.login.username='x';i.login.password='abc123';i.login.uris[0].uri='https://github.com'});
      await mk(1,'Bank',i=>{i.login.username='y';i.login.password='Xk9#mP2$vL8@qR5!';i.login.uris[0].uri='https://bank.com'});
      await mk(2,'Wifi note');await mk(3,'Visa');await mk(5,'Server key');await mk(4,'Me');
      pmOpen()}""")
    pg.wait_for_timeout(500)
    ok(pg.evaluate("PM.scr==='dash'&&PM.tab==='home'"),'opens on the dashboard')
    t=pg.inner_text('#pml')
    ok('dashboard' in pg.inner_text('#pmh').lower(),'header title')
    ok('fezzy' in t and 'fezzy@example.com' in t,'welcome shows name and email')
    ok(pg.evaluate("[...document.querySelectorAll('.pmtile')].map(x=>x.querySelector('b').textContent).join(',')")=='3,1,1,1,1,1,0,0','tile counts 3 logins,1 note,1 card,1 id,1 ssh,1 fav')
    ok(pg.evaluate("document.querySelectorAll('#pmh button').length")==4,'header: Videos, Sync, Add, Settings')
    ok(pg.evaluate("document.querySelectorAll('#pmnav .pmtab').length")==4,'bottom nav has Home, Vault, Reports, Settings')
    pg.screenshot(path='/tmp/dash1.png');pg.evaluate("document.querySelector('#pml').scrollTop=9999");pg.screenshot(path='/tmp/dash2.png')
    pg.evaluate("document.querySelectorAll('.pmtile')[0].click()");pg.wait_for_timeout(200)
    ok(pg.evaluate("PM.scr==='list'&&PM.flt==='t:1'"),'logins tile opens the vault filtered to logins')
    pg.evaluate("pmBack()");pg.wait_for_timeout(200)
    ok(pg.evaluate("PM.scr==='dash'"),'back from vault returns to the dashboard')
    pg.evaluate("document.querySelectorAll('#pmh button')[3].click()");pg.wait_for_timeout(200)
    ok(pg.evaluate("PM.scr==='set'"),'gear opens Settings')
    pg.evaluate("pmTab('home')");pg.evaluate("document.querySelectorAll('#pmh button')[2].click()");pg.wait_for_timeout(200)
    ok(pg.evaluate("document.querySelectorAll('#menu .mi, #menu button').length")>0,'plus opens the add-item menu')
    pg.keyboard.press('Escape');pg.evaluate("document.body.click()")
    pg.evaluate("pmTab('home');document.querySelectorAll('#pmh button')[1].click()");pg.wait_for_timeout(200)
    ok('Back up now' in pg.inner_text('#menu'),'sync icon opens the sync menu')
    pg.evaluate("document.body.click()")
    pg.evaluate("pmTab('home');document.querySelectorAll('#pmh button')[0].click()");pg.wait_for_timeout(400)
    ok(pg.evaluate("!PM.open&&!document.getElementById('pmt').classList.contains('on')"),'Videos icon in the panel leaves the vault and opens Videos')
    ok(not errs,'no script errors '+str(errs))
    b.close()
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
