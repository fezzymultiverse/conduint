"""V0.31.0 tests: Authenticator account profiles, card/PIN capture, original text kept, clean up.
Run: python3 tests/v0310.py   (needs `pip install playwright` and a Chromium)"""
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
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION','ERR_TUNNEL')
NOTES="Backup codes:\\na1b2c3d4e5\\nf6g7h8i9j0\\nk1l2m3n4o5\\nRecovery key: ABCD-EFGH-IJKL\\nsecurity answer: blue whale"
BW=json.dumps({"folders":[{"id":"f1","name":"Dev"}],"items":[
 {"type":1,"name":"GitHub","folderId":"f1","notes":NOTES.replace('\\n','\n'),"login":{"username":"fezzy@example.com","password":"hunter2pw","totp":"JBSWY3DPEHPK3PXP","uris":[{"uri":"https://github.com/login"}]}},
 {"type":1,"name":"github","login":{"username":"fezzy@example.com","password":"hunter2pw","uris":[{"uri":"https://www.github.com"}]}},
 {"type":1,"name":"Netflix","login":{"username":"a@b.c","password":"hunter2pw","uris":[{"uri":"https://netflix.com"}]}},
 {"type":3,"name":"My Visa","notes":"Bank PIN: 4821","card":{"cardholderName":"G Festers","brand":"Visa","number":"4242424242424242","expMonth":"8","expYear":"2028","code":"999"}},
 {"type":2,"name":"Wifi","notes":"router password is hunter2"}]})
SEED="""async()=>{AU.list=[];AU.eg=[];await auSave();AU.ready=true;AU.grp='';AU.tab='all';AU.q='';
 const r=await auParseImport(%s,'bw');AU.list.push(...r.items);await auSave();window.__copied=[];auCopy=(t,m)=>{window.__copied.push(t)};document.querySelector('#tools').classList.add('on');await tAuth();return r.items.length}"""%json.dumps(BW)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_function("typeof tAuth==='function'&&typeof pfBuild==='function'");pg.evaluate('askedAll=true')
    ok(pg.evaluate("/^V0\\.(3[1-9])\\.\\d+$/.test(VER)"),'version is V0.31.x or later')
    n=pg.evaluate(SEED);pg.wait_for_timeout(300)
    ok(n>=7,'import made separate entries (%d)'%n)
    types=pg.evaluate("[...new Set(AU.list.map(a=>a.type))].sort().join()")
    ok('card' in types and 'bak' in types and 'rec' in types and 'pass' in types and 'totp' in types,'import produced card, bak, rec, pass, totp entries: '+types)
    # card from Bitwarden card item and PIN from its note
    card=pg.evaluate("auxItems(AU.list.find(a=>a.type==='card'&&a.issuer==='My Visa')).map(i=>i.t+'='+i.v).join('|')")
    ok('Card number=4242424242424242' in card and 'CVC=999' in card and 'Expiry=08/2028' in card and 'Cardholder=G Festers' in card,'Bitwarden card kept number, CVC, expiry, cardholder: '+card)
    ok('PIN=4821' in card,'PIN line found in the card note')
    ok(pg.evaluate("auxCardScan('code: 1234\\nhello').items.length")==0,'a bare "code: 1234" without card context is not taken as a CVC')
    ok(pg.evaluate("auxLuhn('4242 4242 4242 4242')&&!auxLuhn('1234 5678 9012 3456')"),'Luhn check accepts a real test number and rejects a wrong one')
    # original text kept
    ok(pg.evaluate("AU.list.some(a=>a.orig&&a.orig.includes('security answer: blue whale'))"),'original imported notes are kept on the entry')
    # profile list
    ok(pg.evaluate("TV.view")=='apl','Authenticator opens on the account list (profiles)')
    cnt=pg.evaluate("pfBuild(AU.list).length")
    ok(cnt==4,'GitHub, github and github.com became one profile: 4 accounts (got %d)'%cnt)
    ok(pg.evaluate("document.querySelectorAll('.apro').length")==4,'4 rows on screen')
    ok('4 accounts' in pg.inner_text('.auhead') and 'entries gathered into 4 accounts' in pg.inner_text('.auhead'),'header says entries gathered into 4 accounts')
    # search by a word that only exists inside a note
    pg.evaluate("()=>{const i=document.querySelector('.ausearch');i.value='blue whale';i.dispatchEvent(new Event('input'))}");pg.wait_for_timeout(150)
    ok(pg.evaluate("document.querySelectorAll('.apro').length")==1,'search finds an account by text inside its notes')
    pg.evaluate("()=>{const i=document.querySelector('.ausearch');i.value='';i.dispatchEvent(new Event('input'))}");pg.wait_for_timeout(100)
    # copy password from the list row, not the email
    pg.evaluate("window.__copied=[]")
    pg.evaluate("[...document.querySelectorAll('.apro')].find(r=>r.innerText.includes('Netflix')).querySelector('.apcpb').click()")
    ok(pg.evaluate("window.__copied")==['hunter2pw'],'row copy button copies the password')
    # open GitHub profile
    pg.evaluate("[...document.querySelectorAll('.apro')].find(r=>r.innerText.includes('GitHub')).click()");pg.wait_for_timeout(500)
    ok(pg.evaluate("TV.view")=='apd','tapping an account opens its profile')
    txt=pg.inner_text('#tbody').lower()
    for w in ['Logins','2FA codes','Backup codes','Recovery keys','All details as text','Original imported text']:
        ok(w.lower() in txt,'profile shows section: '+w)
    ok(pg.evaluate("document.querySelectorAll('.apd, .auitem').length")>=6,'profile lists each login, code and item')
    full=pg.evaluate("document.querySelector('.aptext').value")
    ok('Password: hunter2pw' in full and 'a1b2c3d4e5' in full and 'ABCD-EFGH-IJKL' in full and 'Setup key: JBSWY3DPEHPK3PXP' in full,'text field holds password, backup codes, recovery key, setup key')
    ok('blue whale' in pg.evaluate("document.querySelectorAll('.aptext')[1].value"),'original text field holds the untouched notes')
    ok(pg.evaluate("[...document.querySelectorAll('.aptotp')].every(e=>/^\\d{3} \\d{3}$/.test(e.textContent))"),'live 2FA code is showing')
    ok('links and sources' in txt,'profile lists links and sources')
    ok(pg.evaluate("(()=>{const p=pfBuild(AU.list).find(x=>x.title==='GitHub');return p.links.length>=1&&document.querySelector('#tbody').innerText.includes('github.com/login')})()"),'profile shows each different link the account holds')
    ok('Link: https://github.com/login' in full,'text field has a Link line per entry')
    # tap login row copies password; the username button copies the username
    pg.evaluate("window.__copied=[]")
    pg.evaluate("[...document.querySelectorAll('.auitem')].find(e=>e.innerText.includes('fezzy@example.com')&&e.querySelector('.auiv').textContent.includes('•')).click()")
    ok(pg.evaluate("window.__copied")==['hunter2pw'],'tapping a login copies the password, not the email')
    pg.evaluate("[...document.querySelectorAll('.autab')].find(b=>b.textContent==='User').click()")
    ok(pg.evaluate("window.__copied.slice(-1)[0]")=='fezzy@example.com','the User button copies the username')
    pg.evaluate("window.__copied=[]")
    pg.evaluate("[...document.querySelectorAll('.auitem')].find(e=>e.querySelector('.auiv')&&e.querySelector('.auiv').textContent==='a1b2c3d4e5').click()")
    ok(pg.evaluate("window.__copied")==['a1b2c3d4e5'],'tapping a backup code copies it')
    pg.evaluate("window.__copied=[]")
    pg.evaluate("[...document.querySelectorAll('.autab')].find(b=>b.textContent==='Copy all details').click()")
    ok('hunter2pw' in pg.evaluate("window.__copied[0]||''"),'Copy all details copies the whole account')
    # card profile: items masked then copyable
    pg.evaluate("history.back()");pg.wait_for_timeout(300)
    ok(pg.evaluate("TV.view")=='apl','Back from a profile returns to the account list')
    pg.evaluate("[...document.querySelectorAll('.apro')].find(r=>r.innerText.includes('My Visa')).click()");pg.wait_for_timeout(400)
    ok('cards and pins' in pg.inner_text('#tbody').lower(),'card profile has a Cards and PINs section')
    ok(pg.evaluate("[...document.querySelectorAll('.auiv')].some(e=>e.textContent.includes('4242'))")==False,'card number is hidden until revealed')
    pg.evaluate("window.__copied=[]")
    pg.evaluate("[...document.querySelectorAll('.auitem')].find(e=>e.innerText.includes('CVC')).click()")
    ok(pg.evaluate("window.__copied")==['999'],'tapping the CVC item copies the CVC')
    # edit form round trip returns to the profile
    pg.evaluate("auOpenForm(AU.list.findIndex(a=>a.issuer==='My Visa'))");pg.wait_for_timeout(200)
    pg.evaluate("toolsBack()");pg.wait_for_timeout(300)
    ok(pg.evaluate("TV.view")=='apd','back from the edit form returns to the same profile')
    pg.evaluate("toolsBack()");pg.wait_for_timeout(200)
    # cleanup: add an exact duplicate then remove it
    pg.evaluate("async()=>{AU.list.push(Object.assign({},AU.list.find(a=>a.type==='pass'&&a.issuer==='Netflix')));await auSave();drawAu()}");pg.wait_for_timeout(300)
    pg.evaluate("pfCleanup()");pg.wait_for_timeout(300)
    ok(pg.evaluate("TV.view")=='apc','clean up screen opens')
    t=pg.inner_text('#tbody').lower()
    ok('exact duplicates (1)' in t,'finds the exact duplicate')
    ok('same password on different platforms' in t,'flags the password reused on several platforms')
    before=pg.evaluate("AU.list.length")
    pg.evaluate("[...document.querySelectorAll('.aufab')].find(b=>b.textContent.includes('Remove')).click()");pg.wait_for_timeout(250)
    pg.evaluate("document.querySelector('#dk').click()");pg.wait_for_timeout(500)
    ok(pg.evaluate("AU.list.length")==before-1,'remove deletes exactly the one duplicate')
    ok('exact duplicates (0)' in pg.inner_text('#tbody').lower(),'screen shows none left')
    # classic list still works and old data untouched
    pg.evaluate("pfClassic()");pg.wait_for_timeout(300)
    ok(pg.evaluate("TV.view")=='au' and pg.evaluate("document.querySelectorAll('.aurow, .aucard').length")>=7,'classic list still shows every entry')
    pg.evaluate("pfUse()");pg.wait_for_timeout(300)
    ok(pg.evaluate("TV.view")=='apl','Profiles view switches back on')
    # backup round trip keeps card items and original text
    sealed=pg.evaluate("async()=>auBkMake(AU.list,'pw12345678',[])")
    back=pg.evaluate("async s=>{const l=await auBkRead(s,'pw12345678');return {c:l.filter(a=>a.type==='card').length,o:l.some(a=>a.orig)}}",sealed)
    ok(back['c']>=1 and back['o'],'encrypted backup keeps card entries and original text')
    csv=pg.evaluate("auCsvBuild(AU.list)")
    ok('Card number: 4242424242424242' in csv,'CSV export carries the card details')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
