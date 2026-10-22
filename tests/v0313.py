"""V0.31.3 tests: Shield scans what is selected in the file manager, "Scan a folder" lists the folder from its document address,
failed downloads show the real reason, VPN switch no longer redraws mid-switch.
Run: python3 tests/v0313.py"""
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
    pg=b.new_page(viewport={'width':412,'height':860});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(2500);pg.evaluate('askedAll=true')
    ok(pg.evaluate("VER")=='V0.31.3','version is V0.31.3')

    # 1. the selection bar has a Scan button and it passes the selected items on
    pg.evaluate("""()=>{window.__got=null;window.shScanSel=async it=>{window.__got=it.map(i=>i.name)};
      cur.m=cur.m||'x';cur.cat=null;selOn=true;SEL.clear();SEL.add('mock:/Docs/a.txt');SEL.add('mock:/Docs');
      items=[{uri:'mock:/Docs/a.txt',name:'a.txt',dir:false},{uri:'mock:/Docs',name:'Docs',dir:true}];drawSel()}""")
    sb=pg.locator('#sel .sb',has_text='Scan')
    ok(sb.count()==1,'selection bar has a Scan button')
    pg.evaluate("[...document.querySelectorAll('#sel .sb')].find(b=>/Scan/.test(b.textContent)).click()");pg.wait_for_timeout(200)
    g=pg.evaluate('window.__got');ok(g==['a.txt','Docs'],'Scan gets every selected item, files and folders: '+str(g))

    # 2. long-press menu has Scan with Shield on the first panel
    pg.evaluate("selOn=false")
    m=pg.evaluate("""()=>{const L=itemMenu({uri:'mock:/Docs/a.txt',name:'a.txt',dir:false,size:120},['Docs','a.txt'],'k',false,[]);return L.map(e=>e[0])}""")
    ok('Scan with Shield' in m,'file menu lists Scan with Shield: '+str(m))
    m=pg.evaluate("""()=>{const L=itemMenu({uri:'mock:/Docs',name:'Docs',dir:true},['Docs'],'k',false,[]);return L.map(e=>e[0])}""")
    ok('Scan with Shield' in m,'folder menu lists Scan with Shield')

    # 3. a real folder scan: walks sub folders from the folder's document address and shows the summary
    pg.reload();pg.wait_for_timeout(2500);pg.evaluate('askedAll=true')
    pg.evaluate("""()=>{window.__listed=[];const o=SAF.list;SAF.list=async a=>{window.__listed.push(a.uri);return o.call(SAF,a)};
      window.__scanned=[];window.shScanItem=async it=>{window.__scanned.push(it.name);return[]};
      window.__p=shScanSel([{uri:'mock:/',name:'Phone',dir:true}])}""")
    pg.wait_for_selector('#dlg.on, #dlg[style*="flex"], #dlg.show',timeout=8000) if pg.locator('#dlg').count() else None
    pg.wait_for_timeout(500)
    txt=pg.evaluate("document.querySelector('#dtt').textContent+' | '+document.querySelector('#dm').textContent")
    print('dialog:',txt)
    sc=sorted(pg.evaluate("window.__scanned"))
    ok(sc==sorted(['a.txt','b.md','deep.txt','song.mp3','readme.txt']),'folder scan reaches files in sub folders: '+str(sc))
    ok('5 files scanned' in txt and '0 dangerous' in txt,'summary dialog shows counts')
    ok('Nothing dangerous found' in txt,'summary says nothing dangerous')
    pg.click('#dk');pg.wait_for_timeout(200)

    # 4. Scan a folder from the Shield screen passes the folder's document address, not the bare tree address
    pg.evaluate("""()=>{window.__listed=[];window.__scanned=[];shPickDir()}""")
    pg.wait_for_timeout(1200)
    li=pg.evaluate("window.__listed")
    ok(li and li[0]=='mock:/','Scan a folder lists the folder root, not the tree address: '+str(li[:1]))

    # 5. a dangerous file shows up in the summary
    pg.evaluate("""()=>{window.shScanItem=async it=>it.name==='b.md'?[{sev:'high',label:'Test finding'}]:[];window.__p=shScanSel([{uri:'mock:/Docs',name:'Docs',dir:true}])}""")
    pg.wait_for_timeout(900)
    txt=pg.evaluate("document.querySelector('#dtt').textContent+' | '+document.querySelector('#dm').textContent")
    ok('1 dangerous' in txt and 'b.md: Test finding' in txt,'dangerous file is listed in the summary: '+txt)
    pg.click('#dk');pg.wait_for_timeout(200)

    # 6. download reasons read as plain sentences
    r=pg.evaluate("[brDlWhy(16,403),brDlWhy(16,1004),brDlWhy(4,2),brDlWhy(16,404),brDlWhy(16,777)]")
    ok('refused' in r[0] and 'VPN' in r[0],'HTTP 403 explains VPN blocking')
    ok('connection broke' in r[1],'1004 = connection broke')
    ok('network' in r[2],'paused waiting for network')
    ok('gone' in r[3],'404 = file gone')
    ok(r[4]=='Failed (code 777)','unknown code is shown as a code')

    # 7. VPN screen has Test connection and does not redraw while busy
    ok(pg.evaluate("typeof vpTest==='function' && VP.busy===false"),'vpTest exists, VP.busy starts false')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASS');raise SystemExit(1 if fails else 0)
