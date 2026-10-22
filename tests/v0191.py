"""V0.19.1 tests: one View and Sort panel in the top bar, a short three-dot menu, a long-press menu of six entries ending in Features.
Run: python3 tests/v0191.py   (SHOTS=/some/dir to keep screenshots)"""
import http.server, threading, functools, os, tempfile
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots=os.environ.get('SHOTS',tempfile.gettempdir())
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
SEED="if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'"
chrome=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=chrome,args=['--no-sandbox']) if os.path.exists(chrome) else p.chromium.launch(args=['--no-sandbox'])
    for w,h in((411,860),(360,740)):
        tag=f'[{w}x{h}] '
        pg=b.new_page(viewport={'width':w,'height':h});pg.add_init_script(mock);pg.add_init_script(SEED)
        pg.on('pageerror',lambda e:'BRW.scripts' not in str(e) and errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and 'BRW.scripts' not in m.text and errs.append(m.text))
        pg.goto(url);pg.evaluate('askedAll=true')
        pg.evaluate("(()=>{connectSaf('phone','Phone','folder',null)})()");pg.wait_for_selector('#list .it');pg.evaluate("document.body.classList.remove('nav')")
        items=lambda:pg.eval_on_selector_all('#menu .mi','e=>e.map(x=>x.textContent)')
        fits=lambda:pg.evaluate("(()=>{const r=$('#menu').getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()")
        ok(not pg.evaluate("!!document.querySelector('#bsort')"),tag+'no extra sort button crowding the top bar')
        ok(pg.evaluate("['#burger','#up','#bs','#bv','#bm'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>0&&r.right<=innerWidth})"),tag+'top bar buttons all fit')
        # View and Sort panel
        pg.click('#bv');m=items()
        ok(m==['Grid','List','Details','Name','Type','Size','Last modified','Category','Ascending','Folders first'],tag+'panel rows: '+str(m))
        ok(pg.locator('#menu .mx.on').count()==4 and pg.locator('#menu .mhr').count()==2,tag+'one view, one sort, two tick boxes marked, two dividers')
        ok(fits(),tag+'panel fits on screen')
        pg.screenshot(path=os.path.join(shots,f'v0191_viewsort_{w}.png'))
        pg.locator('#menu .mi',has_text='List').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.view")=='list' and pg.evaluate("$('#list').classList.contains('list')"),tag+'List switches the view')
        ok('#i-list' in pg.evaluate("$('#bv use').getAttribute('href')"),tag+'button shows the current view')
        pg.click('#bv');pg.locator('#menu .mi',has_text='Size').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.sort")=='size' and pg.evaluate("S.settings.sortDir")=='desc',tag+'Size sorts by size, largest first')
        pg.click('#bv');pg.locator('#menu .mi',has_text='Size').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.sortDir")=='desc',tag+'tapping the active sort does not flip the order (Ascending does)')
        pg.click('#bv');pg.locator('#menu .mi',has_text='Ascending').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.sortDir")=='asc',tag+'Ascending box flips the order')
        pg.click('#bv');pg.locator('#menu .mi',has_text='Folders first').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.first")==False,tag+'Folders first box toggles')
        pg.click('#bv');pg.locator('#menu .mi',has_text='Folders first').click();pg.wait_for_timeout(100)
        pg.click('#bv');pg.locator('#menu .mi',has_text='Grid').click();pg.click('#bv');pg.locator('#menu .mi',has_text='Name').click();pg.wait_for_timeout(100)
        # three-dot menu
        pg.click('#bm');m=items()
        ok(not any(x.startswith(('View','Sort','Grid','List','Details','Compact','Dual','Name','Size')) for x in m),tag+'three-dot menu has no View or Sort: '+str(m))
        ok(len(m)<=6,tag+'three-dot menu has six or fewer: '+str(len(m)))
        pg.screenshot(path=os.path.join(shots,f'v0191_dots_{w}.png'))
        pg.locator('#menu .mi',has_text='Show hidden').click();pg.wait_for_timeout(100)
        ok(pg.evaluate("S.settings.hidden")==True,tag+'Show hidden files tick box works')
        pg.click('#bm');pg.locator('#menu .mi',has_text='Show hidden').click();pg.wait_for_timeout(100)
        # long-press menu
        pg.locator('#list .it',has=pg.locator('.nm',has_text='Docs')).first.click(button='right');m=items()
        ok(m[:7]==['Open','Copy','Cut','Rename','Delete','Pin to top','Hide'] and m[-1].startswith('Features') and len(m)==8,tag+'long-press on a folder: '+str(m))
        pg.screenshot(path=os.path.join(shots,f'v0191_press_{w}.png'))
        pg.locator('#menu .mi',has_text='Features').click();m=items()
        ok(m[0].startswith('‹') and 'Compress to ZIP' in m and 'Folder colour…' in m and 'Details' in m and not any('Propert' in x for x in m),tag+'Features panel: '+str(m))
        ok(m.index('Compress to ZIP')<m.index('Folder colour…')<m.index('Details'),tag+'Features panel is ordered zip, colour, ... details')
        ok(fits(),tag+'Features panel fits on screen')
        pg.screenshot(path=os.path.join(shots,f'v0191_features_{w}.png'))
        pg.locator('#menu .mi',has_text='Folder colour').click()
        ok(pg.locator('#menu .sw').count()>=6,tag+'Folder colour opens the palette by itself')
        pg.evaluate('hideMenu()')
        # a zip file: Extract is one entry that opens here / folder; Open with is one entry; Send to replaces Share
        lab=pg.evaluate("(()=>{const L=itemMenu({name:'a.zip',uri:'u',size:5},['a.zip'],'k',false,[]);const F=L.find(e=>e[0]==='Features')[1];return JSON.stringify({main:L.map(e=>e[0]),feat:F.map(e=>e[0]),ext:(F.find(e=>e[0]==='Extract')||[0,[]])[1].map(e=>e[0])})})()")
        import json;d=json.loads(lab)
        ok(d['main'][:7]==['Open','Copy','Cut','Rename','Delete','Hide','Features'] or d['main'][:6]==['Open','Copy','Cut','Rename','Delete','Hide'],tag+'file: Pin only for folders: '+str(d['main']))
        ok('Open with…' in d['feat'] and not any('Edit in another' in x for x in d['feat']),tag+'one Open with, no Edit in another app: '+str(d['feat']))
        ok('Share to…' in d['feat'] and not any(x.startswith('Send to') for x in d['feat']),tag+'Share to is there, no Send to (Copy already covers it): '+str(d['feat']))
        ok(d['ext']==['Extract here','Extract to folder…'],tag+'Extract opens here / folder: '+str(d['ext']))
        pg.close()
    b.close()
ok(not errs,'no page errors '+str(errs[:3]))
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
