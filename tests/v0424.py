"""V0.42.4: Utilities + Settings in the fixed block under the left panel. Run: python3 tests/v0424.py"""
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
    pg.goto(url);pg.wait_for_timeout(600);pg.evaluate('askedAll=true;drawBin()')
    ids=pg.evaluate("[...document.querySelectorAll('#foot .nv')].map(n=>n.id)")
    ok(ids==['navcontacts','navutil','navset','navbin'],'order is Contacts, Utilities, Settings, Recycle bin: '+str(ids))
    names=pg.evaluate("[...document.querySelectorAll('#foot .nv b')].map(n=>n.textContent)")
    ok(names==['Contacts','Utilities','Settings','Recycle bin'],'labels: '+str(names))
    pg.evaluate("document.body.classList.add('nav')");pg.click('#navutil');pg.wait_for_timeout(400)
    ok(pg.evaluate("document.getElementById('tools').classList.contains('on')"),'Utilities opens Tools')
    pg.evaluate("document.getElementById('tools').classList.remove('on')")
    pg.evaluate("document.body.classList.add('nav')");pg.click('#navset');pg.wait_for_timeout(400)
    ok(pg.evaluate("document.getElementById('set').classList.contains('on')"),'Settings opens Settings')
    pg.evaluate("document.getElementById('set').classList.remove('on')")
    pg.evaluate("document.body.classList.add('nav')");pg.click('#navbin');pg.wait_for_timeout(400)
    ok(pg.evaluate("cur.cat==='bin'"),'Recycle bin still opens')
    ok(pg.evaluate("document.getElementById('foot').getBoundingClientRect().bottom<=innerHeight+1"),'fixed block fits on screen')
    ok(pg.evaluate("VER==='V0.42.4'"),'version is V0.42.4')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('FAILS',len(fails));raise SystemExit(1 if fails else 0)
