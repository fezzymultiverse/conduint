"""V0.29.2 tests: Back at the first screen sends the app to the background instead of closing it.
Run: python3 tests/v0292.py"""
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
    pg=b.new_page(viewport={'width':412,'height':860});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(900);pg.evaluate('askedAll=true');pg.evaluate("document.body.classList.remove('nav')")
    pg.evaluate("history.back()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__toBack")==1,'Back at the first screen sends the app to the background')
    ok(not pg.evaluate("document.querySelector('#toast').classList.contains('on')"),'no "press back again to exit" message')
    pg.evaluate("history.back()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__toBack")==2,'it works again the next time (history is re-armed)')
    pg.evaluate("openTools()");pg.wait_for_timeout(200)
    pg.evaluate("history.back()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__toBack")==2 and not pg.evaluate("$('#tools').classList.contains('on')"),'Back inside a screen goes back in the app and does not leave it')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
