"""V0.30.0 tests: browser widget, browser as placeable item, status pill. Run: python3 tests/v0300.py"""
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
    pg=b.new_page(viewport={'width':360,'height':800},device_scale_factor=2);pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(1200)
    ok(pg.evaluate("!!document.querySelector('#dbrw')"),'browser widget is on Home')
    ok(pg.evaluate("document.querySelectorAll('#dbrw .dbtile').length>=1"),'widget lists sites (suggested when empty)')
    ok(pg.evaluate("getComputedStyle(document.querySelector('#dbrw')).borderTopColor").startswith('rgba(230'),'silver lining on widgets')
    ok(pg.evaluate("[...document.querySelectorAll('#dspace .dsc')].some(x=>x.textContent.includes('Browser'))"),'Browser pill still on Home by default')
    ok(pg.evaluate("layNorm().home.includes('browser')"),'browser starts in Home list')
    pg.evaluate("place('browser','panel')");pg.wait_for_timeout(200)
    ok(pg.evaluate("layNorm().panel.includes('browser')"),'browser can move to the left panel')
    ok(not pg.evaluate("[...document.querySelectorAll('#dspace .dsc')].some(x=>x.textContent.includes('Browser'))"),'pill leaves Home when moved')
    ok(pg.evaluate("[...document.querySelectorAll('#pnl .nv')].some(x=>x.textContent.includes('Browser'))"),'Browser shows in the left panel')
    pg.evaluate("place('browser','home')")
    ok(pg.evaluate("$('#dcp').dataset.m")=='time','pill shows the time when no songs are loaded')
    pg.evaluate("DASH.songs=[{name:'a.mp3',uri:'u1'},{name:'b.mp3',uri:'u2'}];DASH.state='ok';drawSongs()")
    ok(pg.evaluate("$('#dcp').textContent")=='2 songs','pill shows the song count')
    pg.evaluate("DASH.songs=[];DASH.state='sync';drawSongs()")
    ok(pg.evaluate("$('#dma').textContent")=='Syncing…','Syncing… in header')
    pg.evaluate("document.body.classList.remove('nav')");pg.evaluate("BD.bm.push({u:'https://github.com',t:'GitHub'},{u:'https://news.ycombinator.com',t:'Hacker News'});brwDraw();DASH.songs=[];DASH.state='sync';drawSongs()");pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/home.png')
    pg.evaluate("document.querySelector('#dscroll').scrollTo(0,99999)");pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/home2.png')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('FAILS',fails);raise SystemExit(1 if fails else 0)
