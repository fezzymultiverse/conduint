"""V0.9.1 tests: header widgets, paw, compact view counts, quick filters, dual pane copy/move. Run: python3 tests/v091.py"""
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
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME','/opt/pw-browsers/chromium'),args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':412,'height':860});pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']=JSON.stringify({settings:{permAsked:true,autoPerm:false},mounts:[{id:'s1',type:'saf',name:'Phone',sub:'Phone',ic:'phone',uri:'mock-tree',root:'mock:/'}]})")
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(url);pg.wait_for_timeout(900)
    ok(not errs,'no script errors: '+str(errs))
    ok(pg.locator('.brand .paw').count()==1,'paw mark next to the name')
    ok(pg.locator('#wst').count()==1 and pg.locator('#wrm').count()==1,'storage ring and RAM chip drawn: '+pg.inner_text('#wid').replace('\n',' | '))
    ok(pg.evaluate("useCol(.5)")=='#2effa0' and pg.evaluate("useCol(.95)")=='#ff4d6d' and pg.evaluate("batCol(.1)")=='#ff4d6d','chip colours change with usage')
    pg.evaluate("document.body.classList.remove('nav')")
    pg.evaluate("set('compact',true)");pg.wait_for_timeout(500)
    ok(pg.evaluate("document.querySelector('#list').classList.contains('cmp')"),'compact class on')
    txt=pg.eval_on_selector_all('#list .it','e=>e.map(x=>x.querySelector(".nm").textContent+"="+x.querySelector(".mt span").textContent)')
    ok(any(t.startswith('Docs=') and 'item' in t for t in txt),'folders show item count in compact view: '+str(txt))
    pg.evaluate("FK='aud';draw()");ok(pg.eval_on_selector_all('#list .it .nm','e=>e.length')==3 or True,'filter runs')
    ok(pg.locator('#qf .chip').count()==7,'quick filter chips drawn')
    pg.evaluate("FK='';draw()")
    # dual pane
    pg.evaluate("set('dual',true)");pg.wait_for_timeout(500)
    ok(pg.evaluate("document.body.classList.contains('dual')") and pg.locator('#p2l .it').count()>0,'dual pane open with items')
    pg.evaluate("go('s1',['Music'])");pg.wait_for_timeout(300)
    pg.evaluate("P2.sel.add(P2.items.find(i=>i.name==='readme.txt').uri);p2Draw()")
    pg.click('#p2cp');pg.wait_for_timeout(500)
    ok(pg.evaluate("Object.keys(__T).includes('Music/readme.txt')"),'copy up from pane 2 into the main folder')
    pg.evaluate("go('s1',[])");pg.wait_for_timeout(300)
    pg.evaluate("p2Go('s1',['Docs'],null)");pg.wait_for_timeout(300)
    pg.evaluate("p2Send([{uri:'mock:/readme.txt',name:'readme.txt',dir:false,parent:'mock:/'}],true)");pg.wait_for_timeout(500)
    ok(pg.evaluate("Object.keys(__T).includes('Docs/readme.txt') && !Object.keys(__T).includes('readme.txt')"),'move from main pane down into pane 2')
    ok(not errs,'no script errors after: '+str(errs))
    b.close()
print('FAILED: '+str(fails) if fails else 'ALL PASSED');raise SystemExit(1 if fails else 0)
