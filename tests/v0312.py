"""V0.31.2 tests (updated V0.45.0: Home scrolls instead of shrinking): compact browser widget; Gallery selection bar stays inside the screen.
Run: python3 tests/v0312.py"""
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
    for w,h in [(360,740),(412,860),(360,700)]:
        pg=b.new_page(viewport={'width':w,'height':h});pg.set_default_timeout(8000);pg.add_init_script(mock)
        pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(url);pg.wait_for_timeout(2500);pg.evaluate('askedAll=true')
        r=pg.evaluate("()=>{const d=document.querySelector('#dscroll'),c=document.querySelector('#dbrw');return{need:d.scrollHeight,have:d.clientHeight,card:Math.round(c.getBoundingClientRect().height),tiles:c.querySelectorAll('.dbtile').length,inp:!!c.querySelector('input'),last:Math.round(d.lastElementChild.getBoundingClientRect().bottom),vh:innerHeight}}")
        # V0.45.0: Home no longer shrinks to fit. It keeps full-size cards and scrolls.
        z=pg.evaluate("[...document.querySelector('#dscroll').children].filter(k=>k.style.zoom).length")
        ok(z==0,f'{w}x{h}: no Home card is zoomed down ({z})')
        ok(r['inp'] and r['tiles']==4,f'{w}x{h}: browser widget has a search bar and 4 site tiles')
        ok(r['card']<=170,f'{w}x{h}: browser widget is compact ({r["card"]}px)')
        pg.evaluate("document.querySelector('#dscroll').scrollTo(0,99999)");pg.wait_for_timeout(200)
        r['last']=pg.evaluate("Math.round(document.querySelector('#dscroll').lastElementChild.getBoundingClientRect().bottom)")
        ok(r['last']<=r['vh'],f'{w}x{h}: last Home item ends on screen after scrolling')
        g=pg.evaluate("""()=>{document.body.insertAdjacentHTML('beforeend','<div id="gl" style="position:fixed;inset:0"><div id="glsel" class="glsel"></div></div>');
          GL.selOn=true;GL.view='all';GL.items=[];GL.sel=new Map();for(let i=0;i<4;i++)GL.sel.set('k'+i,{uri:'u'+i,name:'n'+i});glSel();
          const s=document.querySelector('#glsel'),bs=[...s.querySelectorAll('.glab,.chip')];
          return{n:bs.length,over:bs.filter(x=>x.getBoundingClientRect().right>innerWidth-2||x.getBoundingClientRect().left<0).length,sx:s.scrollWidth-s.clientWidth,del:[...s.querySelectorAll('.glab')].some(x=>/Delete/.test(x.textContent)),done:[...s.querySelectorAll('.chip')].some(x=>x.textContent==='Done')}}""")
        ok(g['n']>=9 and g['del'] and g['done'],f'{w}x{h}: selection bar has Done and Delete ({g["n"]} buttons)')
        ok(g['over']==0 and g['sx']<=1,f'{w}x{h}: selection bar buttons all inside the screen, no sideways scroll {g}')
        pg.close()
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
