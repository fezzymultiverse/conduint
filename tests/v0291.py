"""V0.29.1 tests: tap on a zip asks, long-press first panel (zip choices, Select, Details), Details sheet for folders and zips (AES, risky paths, SHA-256).
Run: python3 tests/v0291.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os, struct, hashlib
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
def mkzip(entries,comment=b''):
    out=b'';cd=b''
    for name,data,flag,method,extra in entries:
        nb=name.encode();off=len(out)
        out+=struct.pack('<IHHHHHIIIHH',0x04034b50,20,flag,method,0,0x5A21,0,len(data),len(data),len(nb),len(extra))+nb+extra+data
        cd+=struct.pack('<IHHHHHHIIIHHHHHII',0x02014b50,(3<<8)|63,20,flag,method,0,0x5A21,0,len(data),len(data),len(nb),len(extra),0,0,0,0,off)+nb+extra
    return out+cd+struct.pack('<IHHHHIIH',0x06054b50,0,0,len(entries),len(entries),len(cd),len(out),len(comment))+comment
AES=struct.pack('<HHH2sBH',0x9901,7,2,b'AE',3,8)
Z1=mkzip([('docs/readme.txt',b'hello',0,0,b''),('secret/a.bin',b'x'*50,1,99,AES),('secret/b.bin',b'y'*60,1,99,AES),('../evil.txt',b'e',0,0,b'')],b'made by test')
Z2=mkzip([('a.txt',b'hello',0,0,b''),('b.txt',b'world',0,0,b'')])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':412,'height':860});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/z.zip',lambda r:r.fulfill(body=Z1,content_type='application/zip'))
    pg.route('**/p.zip',lambda r:r.fulfill(body=Z2,content_type='application/zip'))
    pg.goto(url);pg.wait_for_timeout(900);pg.evaluate('askedAll=true');pg.evaluate("document.body.classList.remove('nav')")
    pg.evaluate("(()=>{S.mounts.push({id:'t1',type:'saf',name:'Phone',sub:'Test',ic:'phone',uri:'mock:/',root:'mock:/'});save()})()")
    pg.evaluate("(()=>{__T['pack.zip']={dir:false,size:%d,mtime:Date.now()-3600000};__T['plain.zip']={dir:false,size:%d,mtime:Date.now()};window.__cache={'mock:/pack.zip':'/z.zip','mock:/plain.zip':'/p.zip'}})()"%(len(Z1),len(Z2)))
    pg.evaluate("go('t1',[])");pg.wait_for_selector('#list .it .nm:text-is(\"pack.zip\")')
    row=lambda n:pg.locator('#list .it',has=pg.locator('.nm',has_text=n)).first
    menu=lambda:[t.strip() for t in pg.locator('#menu .mi').all_inner_texts()]
    # ---- tap on a zip asks ----
    row('plain.zip').click();pg.wait_for_selector('#menu.on')
    m=menu()
    ok(any('Browse inside' in x for x in m) and 'Extract here' in m and 'Extract to folder…' in m,'a tap on a zip asks: browse, extract here, extract to folder '+str(m))
    ok(pg.evaluate("TV.view")!='zb','the tap does not jump straight into the zip')
    pg.locator('#menu .mi',has_text='Browse inside').click();pg.wait_for_function("TV.view==='zb'")
    ok(True,'Browse inside walks into the zip')
    pg.evaluate("zbClose&&zbClose()");pg.evaluate("go('t1',[])");pg.wait_for_selector('#list .it')
    # ---- long press: first panel ----
    row('pack.zip').click(button='right');pg.wait_for_selector('#menu.on')
    m=menu()
    for want in ['Browse ZIP contents','Extract here','Extract to folder…','Select','Details']:
        ok(want in m,'long-press first panel has "%s"'%want)
    ok('Features ›' in m,'the Features sub-menu still exists for the rest')
    pg.locator('#menu .mi',has_text='Select').first.click()
    ok(pg.evaluate("selOn===true&&SEL.size===1"),'Select from the first panel starts selection')
    pg.evaluate("setSel(false)")
    # a folder and a plain file also get Select + Details on the first panel
    row('Docs').click(button='right');pg.wait_for_selector('#menu.on');m=menu()
    ok('Select' in m and 'Details' in m,'folder long-press has Select and Details on the first panel '+str(m))
    pg.keyboard.press('Escape');pg.mouse.click(5,5)
    # ---- Details: folder ----
    row('Docs').click(button='right');pg.wait_for_selector('#menu.on');pg.locator('#menu .mi',has_text='Details').first.click()
    pg.wait_for_function("document.querySelector('#dm').textContent.includes('Total:')")
    t=pg.inner_text('#dm')
    ok('Items: 3 (2 files, 1 folder)' in t,'folder details: item count '+t.split('Items:')[1].split('\n')[0] if 'Items:' in t else 'folder details: no item count')
    ok('SIZE OF FOLDER' in t and 'files in' in t and 'Modified:' in t and 'Name: Docs' in t,'folder details: size of folder, date and time, name')
    pg.click('#dk')
    # ---- Details: encrypted zip ----
    row('pack.zip').click(button='right');pg.wait_for_selector('#menu.on');pg.locator('#menu .mi',has_text='Details').first.click()
    pg.wait_for_function("document.querySelector('#dm').textContent.includes('SHA-256')")
    t=pg.inner_text('#dm')
    ok('Entries: 4 (4 files, 0 folders)' in t,'zip: entry count')
    ok('Password protected: 2 of 4 files' in t and 'AES-256 ×2' in t,'zip: AES-256 detected on 2 files')
    ok('File names are visible without the password' in t,'zip: says names stay visible')
    ok('WARNING: 1 path' in t,'zip: risky ../ path is flagged')
    ok('made by test' in t,'zip: comment shown')
    ok(hashlib.sha256(Z1).hexdigest() in t,'zip: SHA-256 matches the file')
    ok('Modified:' in t and ('ago' in t),'zip: date and time with age')
    ok('Made on: Unix or Android' in t,'zip: made-on system')
    pg.click('#dk')
    # ---- Details: plain zip ----
    row('plain.zip').click(button='right');pg.wait_for_selector('#menu.on');pg.locator('#menu .mi',has_text='Details').first.click()
    pg.wait_for_function("document.querySelector('#dm').textContent.includes('SHA-256')")
    t=pg.inner_text('#dm')
    ok('Not encrypted' in t and 'Paths: all stay inside the folder' in t,'plain zip: not encrypted, paths safe')
    pg.click('#dk')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
