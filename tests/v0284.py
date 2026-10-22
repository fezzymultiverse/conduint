"""V0.28.4 tests: Scan on open (clean, remembered, dangerous, medium, switch, skips, failure paths, double tap), settings row, vertical refresh light.
Run: python3 tests/v0283.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
css=open(os.path.join(root,'www','css','style.css')).read()
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
CHROME=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION','ERR_TUNNEL')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("/^V0\\.(28|29)\\.\\d+$/.test(VER)"),'version is V0.28.x or V0.29.x or V0.29.x')
    ok(pg.evaluate("typeof shOpenGate==='function'&&typeof shOpenNeeds==='function'"),'shOpenGate and shOpenNeeds exist')
    # stubs: scanner (name decides), openWith recorder, dialog recorder
    pg.evaluate("""(()=>{window.__scans=0;window.__opened=[];window.__dlgs=[];window.__ans=true;window.__mode='';
     shScanItem=async it=>{window.__scans++;if(window.__mode==='throw')throw new Error('boom');
       return it.name.includes('bad')?[{sev:'high',label:'Test rule'}]:it.name.includes('odd')?[{sev:'med',label:'Looks odd'}]:[]};
     SAF.openWith=async o=>{window.__opened.push(o.uri)};
     dlg=async o=>{window.__dlgs.push(o);return window.__ans?{v:''}:null};
     S.settings.shOn=undefined;})()""")
    reset=lambda:pg.evaluate("(()=>{__scans=0;__opened.length=0;__dlgs.length=0;__ans=true;__mode='';SHOPEN_OK.clear();S.settings.shOpen=undefined;localStorage.removeItem('cnd.shield.on')})()")
    op=lambda f:pg.evaluate("open(%s,[])"%f)
    F=lambda n,extra='':"{name:'%s',uri:'mock:/Docs/%s',size:10,mtime:1%s}"%(n,n,extra)

    # clean file opens and is remembered
    reset();op(F('a.bin'));pg.wait_for_timeout(500)
    ok(pg.evaluate("__scans")==1 and pg.evaluate("__opened")==['mock:/Docs/a.bin'],'clean file is scanned once, then opens')
    op(F('a.bin'));pg.wait_for_timeout(300)
    ok(pg.evaluate("__scans")==1 and len(pg.evaluate("__opened"))==2,'same file again opens without a second scan')
    op("{name:'a.bin',uri:'mock:/Docs/a.bin',size:10,mtime:2}");pg.wait_for_timeout(300)
    ok(pg.evaluate("__scans")==2,'a changed file (new modified time) is scanned again')

    # dangerous: asks, cancel does not open, confirm opens
    reset();pg.evaluate("__ans=false");op(F('bad.bin'));pg.wait_for_timeout(500)
    d=pg.evaluate("__dlgs")
    ok(len(d)==1 and 'bad.bin' in d[0]['title'] and 'Test rule' in d[0]['msg'] and d[0].get('danger') is True,'dangerous file asks, names the file and the rule '+str(d))
    ok(pg.evaluate("__opened")==[],'cancel: dangerous file does not open')
    pg.evaluate("__ans=true");op(F('bad.bin'));pg.wait_for_timeout(500)
    ok(pg.evaluate("__opened")==['mock:/Docs/bad.bin'],'Open anyway: it opens')
    log=pg.evaluate("JSON.parse(localStorage.getItem('cnd.shield.log')||'[]')")
    ok(any(e['n']=='bad.bin' and e['v']=='blocked' for e in log),'dangerous open is written to Recent')

    # medium: opens straight away, noted in Recent
    reset();op(F('odd.bin'));pg.wait_for_timeout(500)
    ok(pg.evaluate("__opened")==['mock:/Docs/odd.bin'] and pg.evaluate("__dlgs.length")==0,'medium finding opens with no dialog')
    log=pg.evaluate("JSON.parse(localStorage.getItem('cnd.shield.log')||'[]')")
    ok(any(e['n']=='odd.bin' and e['v']=='noted' for e in log),'medium finding is noted in Recent')

    # switch off
    reset();pg.evaluate("S.settings.shOpen=false");op(F('bad.bin'));pg.wait_for_timeout(400)
    ok(pg.evaluate("__scans")==0 and pg.evaluate("__opened")==['mock:/Docs/bad.bin'],'Scan on open off: no scan, file opens')
    reset();pg.evaluate("localStorage.setItem('cnd.shield.on','0')");op(F('bad.bin'));pg.wait_for_timeout(400)
    ok(pg.evaluate("__scans")==0 and len(pg.evaluate("__opened"))==1,'Shield off: no scan, file opens')

    # skips: folders, APKs (own gate), lost files, big files
    reset();ok(pg.evaluate("shOpenNeeds({name:'x.apk',uri:'mock:/x.apk',size:5})")==False,'APK is left to the install check')
    ok(pg.evaluate("shOpenNeeds({name:'d',uri:'mock:/d',dir:true})")==False,'folders are not scanned')
    ok(pg.evaluate("shOpenNeeds({name:'a.bin',uri:'mock:/a.bin',lost:true})")==False,'lost files are not scanned')
    reset();op("{name:'big.bin',uri:'mock:/Docs/big.bin',size:30*1048576,mtime:1}");pg.wait_for_timeout(500)
    ok(pg.evaluate("__scans")==0 and len(pg.evaluate("__opened"))==1,'file over 25 MB: no full scan, still opens')

    # failure paths
    reset();pg.evaluate("__mode='throw'");op(F('c.bin'));pg.wait_for_timeout(500)
    ok(len(pg.evaluate("__opened"))==1 and pg.evaluate("__dlgs.length")==0,'scanner error: the file still opens, no dialog')
    ok(pg.evaluate("SHOPEN_OK.size")==0,'a failed scan is not remembered as clean')

    # double tap while scanning
    reset();pg.evaluate("(()=>{shScanItem=async it=>{__scans++;await new Promise(r=>setTimeout(r,400));return[]}})()")
    op(F('slow.bin'));op(F('slow.bin'));pg.wait_for_timeout(900)
    ok(pg.evaluate("__scans")==1 and len(pg.evaluate("__opened"))==1,'double tap while scanning opens once')

    # settings row
    pg.evaluate("openSet()");pg.wait_for_timeout(500)
    txt=pg.evaluate("document.querySelector('#set').innerText")
    ok('Scan a file when you open it' in txt,'Settings > Shield shows the Scan a file when you open it row')

    # vertical refresh light
    ok('#ptr.spin::after' in css and 'translateY(-28px)' in css and 'background-position:-60% 0' not in css,'refresh light CSS is vertical (translateY), no sideways sweep')
    pg.evaluate("document.body.insertAdjacentHTML('beforeend','<div id=ptr class=spin style=\"opacity:1\"></div>')") if not pg.evaluate("!!document.querySelector('#ptr')") else pg.evaluate("document.querySelector('#ptr').className='spin'")
    pg.wait_for_timeout(200)
    an=pg.evaluate("getComputedStyle(document.querySelector('#ptr'),'::after').animationName")
    ok(an=='ptrsweep','spinning light uses the ptrsweep animation')
    b.close()
print('ALL PASS' if not fails else 'FAILED: '+str(len(fails)))
