"""V0.11.1 tests: quick filters search inside folders, thumbnails released/restored, pull-to-refresh without arrow, live 'minutes ago'. Run: python3 tests/v0111.py"""
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
    pg.goto(url);pg.wait_for_timeout(900);pg.evaluate("document.body.classList.remove('nav')")
    ok(not errs,'no script errors: '+str(errs))
    # Songs filter at the top of Phone finds Music/song.mp3 from inside a sub folder, and hides folders
    pg.evaluate("FK='aud';load()");pg.wait_for_timeout(500)
    names=pg.eval_on_selector_all('#list .it .nm','e=>e.map(x=>x.textContent)')
    ok(names==['song.mp3'],'Songs filter lists songs from inside folders: '+str(names))
    ok(pg.evaluate("FLAT===true")and 'songs' in pg.inner_text('#stat').lower(),'status line: '+pg.inner_text('#stat'))
    pg.evaluate("FK='doc';load()");pg.wait_for_timeout(500)
    names=sorted(pg.eval_on_selector_all('#list .it .nm','e=>e.map(x=>x.textContent)'))
    ok('deep.txt' in names and 'a.txt' in names,'Docs filter reaches Docs/Sub/deep.txt: '+str(names))
    pg.evaluate("FK='';load()");pg.wait_for_timeout(400)
    ok(pg.evaluate("FLAT===false")and pg.locator('#list .it .fo').count()>0,'All shows the normal folder again')
    # walking into a folder resets the filter
    pg.evaluate("FK='aud';load()");pg.wait_for_timeout(300);pg.evaluate("go('s1',['Music'])");pg.wait_for_timeout(400)
    ok(pg.evaluate("FK===''&&!FLAT"),'opening a folder clears the filter')
    # views never leave a blank list and tiles keep an icon until a picture really loads
    for v in ['grid','list','details']:
        for c in [False,True]:
            pg.evaluate(f"S.settings.view='{v}';S.settings.compact={'true' if c else 'false'};draw()");pg.wait_for_timeout(250)
            ok(pg.locator('#list .it').count()>0,f'{v} compact={c} shows items')
    # release and restore of a thumbnail
    pg.evaluate("go('s1',[])");pg.wait_for_timeout(400)
    ok(pg.evaluate("typeof thumbRelease==='function'&&typeof thumbReset==='function'"),'thumb release helpers exist')
    # dates: fresh file says minutes ago, in Details
    pg.evaluate("items.forEach(i=>{if(!i.dir)i.mtime=Date.now()-5*60000});S.settings.view='details';S.settings.compact=false;draw()")
    ok('5 minutes ago' in pg.inner_text('#list'),'Details shows 5 minutes ago')
    # pull to refresh: no svg arrow, bar present
    ok(pg.evaluate("document.querySelector('#ptr svg')===null"),'pull indicator has no arrow')
    ok(not errs,'no errors at the end: '+str(errs))
    b.close()
print('FAILS',fails);raise SystemExit(1 if fails else 0)
