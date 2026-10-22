"""V0.4.1 regression: real Android has window.androidBridge and Capacitor.Plugins but may lack isNativePlatform/registerPlugin.
Run: python3 tests/bare-bridge.py"""
import http.server, threading, functools, os, re
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
bare=re.sub(r"window\.Capacitor=\{[^;]*\};","window.androidBridge={};window.Capacitor={Plugins:{Saf:Saf,Tools:Tools,Lock:Lock,Player:Player}};",mock)
assert bare!=mock,'mock line not replaced'
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':412,'height':860});pg.add_init_script(bare)
    pg.add_init_script("localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html');pg.wait_for_timeout(500)
    ok(pg.evaluate('NATIVE')==True,'NATIVE true with bare bridge')
    pg.evaluate("document.body.classList.remove('nav')")
    pg.click('#burger')
    ok(pg.locator('#foot .nv',has_text='Tools').count()==1,'Tools entry visible')
    ok(pg.locator('#foot .nv',has_text='Recycle bin').count()==1,'Recycle bin entry visible')
    ok(pg.locator('#stor .nv',has_text='Internal storage').count()==1,'Internal storage visible')
    ok(pg.locator('#lib .nv').count()==6,'6 library views visible')
    ok(pg.evaluate('!!LOCK&&!!PLAYER'),'Lock and Player plugins found through Capacitor.Plugins')
    ok(pg.locator('#bbar').count()==1,'back bar present')
    pg.screenshot(path=os.environ.get('SHOT','/tmp/drawer.png'))
    ok(not errs,'no console errors: '+str(errs))
print('ALL PASSED' if not fails else 'FAILED: '+str(fails))
