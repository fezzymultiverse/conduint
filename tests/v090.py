"""V0.9.0 tests: tiles whose pictures fill the whole frame, album art in Songs, new sort choices, direct internal storage and Downloads.
Run: python3 tests/v090.py   (needs `pip install playwright` and a Chromium). Uses the same mock as tests/smoke.py."""
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
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']=JSON.stringify({settings:{permAsked:true,autoPerm:false}})")
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(url);pg.wait_for_timeout(500)
    ok(not errs,'no script errors on load: '+str(errs))
    ok(pg.evaluate('typeof vcard')=='function','vault.js loaded (td clash fixed)')
    ok(pg.evaluate('S.settings.tile')>=128,'default tile is bigger: '+str(pg.evaluate('S.settings.tile')))
    # direct internal storage: refuses until All files access is on, then connects by path
    pg.evaluate("document.body.classList.add('nav')")
    pg.locator('#stor .nv').first.click();pg.wait_for_selector('#dlg.on')
    ok('All files access' in pg.inner_text('#dtt'),'internal storage asks for All files access first')
    pg.click('#dk');pg.wait_for_timeout(200)
    ok(('perm','allFiles') in [tuple(x) for x in pg.evaluate('__log')],'All files access page requested')
    pg.evaluate("window.dispatchEvent(new Event('focus'))");pg.wait_for_timeout(500)
    ok(pg.evaluate("S.mounts.some(m=>m.id==='internal'&&m.direct)"),'internal storage connected directly after permission')
    ok(pg.evaluate("SLOTS.some(s=>s.id==='downloads')"),'Downloads slot exists')
    pg.evaluate("document.body.classList.add('nav')")
    pg.locator('#places .nv',has_text='Downloads').click();pg.wait_for_timeout(300)
    ok(pg.evaluate("S.mounts.some(m=>m.id==='downloads'&&m.direct)"),'Downloads connected as a real folder')
    # thumbnails fill the tile
    pg.evaluate("document.body.classList.remove('nav')")
    pg.evaluate("go('internal',[])");pg.wait_for_timeout(300)
    pg.evaluate("""(()=>{__T['Pictures']={dir:true,size:0,mtime:1};__T['Pictures/a.jpg']={dir:false,size:5000,mtime:5};__T['Pictures/v.mp4']={dir:false,size:9000,mtime:4};__T['Pictures/s.mp3']={dir:false,size:7000,mtime:3};__T['Pictures/d.pdf']={dir:false,size:3000,mtime:2}})()""")
    pg.evaluate("go('internal',['Pictures'])");pg.wait_for_timeout(900)
    kinds=pg.evaluate("[...document.querySelectorAll('#list .it .thw')].map(w=>w.className)")
    ok(any('tk-img' in k for k in kinds) and any('tk-vid' in k for k in kinds) and any('tk-aud' in k for k in kinds) and any('tk-pdf' in k for k in kinds),'image, video, music and document tiles get a picture frame: '+str(kinds))
    ok(('thumb','s.mp3','aud') in [tuple(x) for x in pg.evaluate('__log')],'music files ask the native plugin for album art')
    st=pg.evaluate("""(()=>{const t=document.querySelector('#list .it.thp'),w=t.querySelector('.thw'),r=t.getBoundingClientRect(),q=w.getBoundingClientRect(),cs=getComputedStyle(w),im=w.querySelector('img');
      return{tile:Math.round(r.width),frame:Math.round(q.width),h:Math.round(q.height),border:cs.borderTopWidth,bg:cs.backgroundColor,fit:im?getComputedStyle(im).objectFit:'none',pad:getComputedStyle(t).paddingLeft,img:!!im}})()""")
    ok(st['frame']>=st['tile']-2 and st['border']=='0px' and st['pad']=='0px','picture spans the whole tile with no border: '+str(st))
    ok(st['img'] and st['fit']=='cover','picture uses cover so it fills the frame')
    ok(st['frame']>=120,'tiles are big enough to scroll comfortably: '+str(st['frame']))
    # sorting
    pg.evaluate("S.settings.sort='size';S.settings.sortDir='desc';draw()")
    n=lambda:pg.eval_on_selector_all('#list .it .nm','e=>e.map(x=>x.textContent)')
    ok(n()[:2]==['v.mp4','s.mp3'] or n()[0]=='v.mp4','size largest first: '+str(n()))
    pg.evaluate("setSort('size')")
    ok(pg.evaluate('S.settings.sortDir')=='asc' and n()[0]=='d.pdf','tapping the active sort flips it: '+str(n()))
    pg.evaluate("setSort('type')");ok(n()[0]=='a.jpg' or n()[0]=='d.pdf','sort by type runs: '+str(n()))
    pg.evaluate("setSort('kind')");ok(len(n())==4,'sort by category runs')
    pg.evaluate("setSort('date')");ok(n()[0]=='a.jpg','date newest first: '+str(n()))
    pg.click('#bm');labels=pg.eval_on_selector_all('#menu .mi','e=>e.map(x=>x.textContent)')
    ok(sum(1 for l in labels if 'Sort by' in l)==5,'menu offers five sort choices: '+str([l for l in labels if 'Sort' in l]))
    ok(any('Newest first' in l for l in labels),'active sort shows its direction')
    ok(not errs,'no script errors during the run: '+str(errs))
    b.close()
print('FAILED: '+str(fails) if fails else 'ALL PASSED');raise SystemExit(1 if fails else 0)
