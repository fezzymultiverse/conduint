"""V0.24 tests: Shield rules update (Settings > Shield link, Update rules, validation, no downgrade, reset).
Run: python3 tests/v0240.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os, json
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
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION')
HASH='ab'*32
GOOD={'v':2,'updated':'2026-11-01','hashes':{HASH:'Test malware'},'names':[],'scripts':[{'re':'evilword','flags':'i','label':'Evil word','sev':'high'}],'content':[]}
resp={'body':json.dumps(GOOD),'status':200}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.route('https://rules.test/**',lambda r:r.fulfill(status=resp['status'],body=resp['body'],headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}))
    pg.goto(url);pg.wait_for_timeout(600);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("parseFloat(VER.slice(1))>=0.24"),'version is V0.24 or newer')
    ok(pg.evaluate("typeof shUpdate==='function'&&typeof shCheck==='function'&&typeof shDoUpdate==='function'"),'update functions exist')
    # settings shows the field and the button
    pg.evaluate("document.querySelector('#set').classList.add('on');drawSettings()")
    ok(pg.locator('#sbody input.shurl').count()==1,'Settings > Shield has the link field')
    ok(pg.locator('#sbody .chip',has_text='Update rules').count()==1,'Settings > Shield has the Update rules button')
    # no link -> toast, nothing changes
    pg.click('#sbody .chip:has-text("Update rules")');pg.wait_for_timeout(200)
    ok('Set the rules link' in pg.inner_text('#toast'),'empty link asks for a link')
    # http link refused
    r=pg.evaluate("shUpdate('http://rules.test/a.json').then(()=>'ok',e=>e.message)")
    ok('https://' in r,'plain http refused: '+r)
    # type link in the field and update through the button
    pg.fill('#sbody input.shurl','https://rules.test/shield-rules.json');pg.dispatch_event('#sbody input.shurl','change')
    pg.click('#sbody .chip:has-text("Update rules")');pg.wait_for_timeout(700)
    ok('Rules updated' in pg.inner_text('#toast'),'good download updates: '+pg.inner_text('#toast'))
    ok(pg.evaluate("shJ(SHR,null).v")==2 and pg.evaluate("SHRULES.v")==2,'new rules saved and active')
    ok(pg.evaluate("SHRULES.hashes['"+HASH+"']")=='Test malware','new hash is live')
    ok(pg.evaluate("S.settings.shUrl")=='https://rules.test/shield-rules.json','link is remembered')
    # same file again -> already up to date
    r=pg.evaluate("shUpdate()");ok('Already up to date' in r,'same file says up to date: '+r)
    # older version refused
    resp['body']=json.dumps({**GOOD,'v':1});r=pg.evaluate("shUpdate().then(()=>'ok',e=>e.message)")
    ok('older' in r and pg.evaluate("SHRULES.v")==2,'older version refused: '+r)
    # invalid regex refused
    resp['body']=json.dumps({**GOOD,'v':3,'scripts':[{'re':'(unclosed','label':'x'}]});r=pg.evaluate("shUpdate().then(()=>'ok',e=>e.message)")
    ok('not valid' in r or 'Invalid' in r,'bad regex refused: '+r)
    # bad hash refused
    resp['body']=json.dumps({**GOOD,'v':3,'hashes':{'nothex':'x'}});r=pg.evaluate("shUpdate().then(()=>'ok',e=>e.message)")
    ok('SHA-256' in r,'bad hash refused: '+r)
    # not json refused
    resp['body']='<html>nope</html>';r=pg.evaluate("shUpdate().then(()=>'ok',e=>e.message)")
    ok('not valid JSON' in r,'non-JSON refused: '+r)
    # server error refused
    resp['status']=404;resp['body']='x';r=pg.evaluate("shUpdate().then(()=>'ok',e=>e.message)")
    ok('404' in r,'server error reported: '+r);resp['status']=200
    ok(pg.evaluate("shJ(SHR,null).v")==2,'failed updates changed nothing')
    # newer version applies and scans use it
    resp['body']=json.dumps({**GOOD,'v':3});r=pg.evaluate("shUpdate()");ok('version 3' in r,'newer version applies: '+r)
    # shield screen shows the button and the source line
    pg.evaluate("document.querySelector('#set').classList.remove('on');openTools().then(tShield)");pg.wait_for_timeout(400)
    ok(pg.locator('#tbody .chip',has_text='Update rules').count()==1,'Shield screen has Update rules')
    ok('from your link' in pg.inner_text('#tbody'),'Shield screen shows the update source')
    # reset
    pg.evaluate("shReset()");pg.wait_for_timeout(300)
    ok(pg.evaluate("localStorage.getItem(SHR)")is None,'Use built-in clears the saved copy')
    ok(pg.evaluate("shRules().then(r=>r.v)")>=2,'bundled rules active again')
    ok(not errs,'no script errors at the end '+str(errs))
    b.close()
print('\n'+('ALL PASS' if not fails else 'FAILED: '+str(fails)))
raise SystemExit(1 if fails else 0)
