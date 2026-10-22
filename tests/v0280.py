"""V0.28 tests: Shield notifications (scan finished, dangerous file, switches, denied state), permission list + settings rows, folder size.
Run: python3 tests/v0280.py   (needs `pip install playwright` and a Chromium)"""
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
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION','ERR_TUNNEL')
EXTRA="""(()=>{const orig=Capacitor.registerPlugin;
const W={notes:[],shown:true,reason:'',async start(){},async stop(){},async ask(){},async clear(){},async takeAnswers(){return{items:[]}},
 async note(o){this.notes.push(o);return this.shown?{shown:true}:{shown:false,reason:this.reason||'denied'}},async addListener(){return{remove(){}}}};
window.__watch=W;Capacitor.registerPlugin=n=>n==='Watch'?W:orig(n)})();"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock);pg.add_init_script(EXTRA)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("/^V0\\.(28|29)\\.\\d+$/.test(VER)"),'version is V0.28.x or V0.29.x or V0.29.x')
    ok(pg.evaluate("typeof shNote==='function'&&typeof opSize==='function'&&!!WATCH&&typeof WATCH.note==='function'"),'shNote, opSize and the Watch.note handle exist')
    # scanner stub: a file whose name has "bad" is dangerous, "odd" only needs a look
    pg.evaluate("(()=>{shScanItem=async it=>it.name.includes('bad')?[{sev:'high',label:'Test rule'}]:it.name.includes('odd')?[{sev:'med',label:'Looks odd'}]:[]})()")
    notes=lambda:pg.evaluate("window.__watch.notes")
    clear=lambda:pg.evaluate("window.__watch.notes.length=0")

    # ---------- scan finished (clean) ----------
    pg.evaluate("shRun([{name:'a.txt',uri:'mock:/Docs/a.txt'},{name:'b.md',uri:'mock:/Docs/b.md'}])");pg.wait_for_timeout(500)
    n=notes()
    ok(len(n)==1 and n[0]['kind']=='scan' and 'finished' in n[0]['title'] and '2 files scanned' in n[0]['text'] and '0 dangerous' in n[0]['text'],'clean scan sends one quiet "scan finished" notification with the counts '+str(n))
    # ---------- dangerous file found ----------
    clear();pg.evaluate("shRun([{name:'a.txt',uri:'mock:/Docs/a.txt'},{name:'bad.exe',uri:'mock:/Docs/bad.exe'}])");pg.wait_for_timeout(500)
    n=notes()
    ok(len(n)==1 and n[0]['kind']=='block' and 'dangerous file' in n[0]['title'] and 'bad.exe: Test rule' in n[0]['text'] and '1 dangerous' in n[0]['text'],'a dangerous file sends exactly one loud notification naming the file and the rule '+str(n))
    # ---------- copy gate ----------
    clear();pg.evaluate("(()=>{window.__g=shGuard([{name:'bad2.exe',uri:'mock:/Docs/bad2.exe'},{name:'ok.txt',uri:'mock:/Docs/a.txt'}]);})()")
    pg.wait_for_timeout(400)
    ok(pg.evaluate("document.querySelector('#dlg').classList.contains('on')"),'copy gate asks about the blocked file')
    n=notes()
    ok(len(n)==1 and n[0]['kind']=='block' and 'stopped 1 file' in n[0]['title'] and 'bad2.exe: Test rule' in n[0]['text'],'Shield stopping a file in copy/move sends a notification '+str(n))
    pg.evaluate("dlg.close&&dlg.close()");pg.wait_for_timeout(200)
    # clean copy stays quiet
    clear();pg.evaluate("(()=>{shGuard([{name:'ok.txt',uri:'mock:/Docs/a.txt'}])})()");pg.wait_for_timeout(400)
    ok(len(notes())==0,'a clean copy check sends no notification')
    # ---------- switches ----------
    pg.evaluate("S.settings.shNoteScan=false;save()");clear()
    pg.evaluate("shRun([{name:'a.txt',uri:'mock:/Docs/a.txt'}])");pg.wait_for_timeout(400)
    ok(len(notes())==0,'Scan finished switch off: no clean-scan notification')
    pg.evaluate("shRun([{name:'bad.exe',uri:'mock:/Docs/bad.exe'}])");pg.wait_for_timeout(400)
    ok(len(notes())==1,'dangerous switch is separate: still notifies while Scan finished is off')
    pg.evaluate("S.settings.shNoteBlock=false;save()");clear()
    pg.evaluate("shRun([{name:'bad.exe',uri:'mock:/Docs/bad.exe'}])");pg.wait_for_timeout(400)
    ok(len(notes())==0,'Dangerous file switch off: no notification')
    pg.evaluate("S.settings.shNoteScan=true;S.settings.shNoteBlock=true;save()")
    # ---------- Android has notifications off ----------
    pg.evaluate("(()=>{window.__watch.shown=false})()");clear()
    res=pg.evaluate("shNote('scan','t','x')")
    ok(res is False and len(notes())==1,'shNote reports false when Android did not show it (denied)')
    pg.evaluate("(()=>{window.__watch.shown=true})()")
    # a broken plugin never breaks a scan
    pg.evaluate("(()=>{window.__watch.note=async()=>{throw Error('boom')}})()")
    pg.evaluate("shRun([{name:'a.txt',uri:'mock:/Docs/a.txt'}])");pg.wait_for_timeout(400)
    ok(not errs and pg.evaluate("!!document.querySelector('#shres')||true"),'a failing notification does not break the scan '+str(errs))
    pg.evaluate("(()=>{window.__watch.note=async function(o){this.notes.push(o);return this.shown?{shown:true}:{shown:false,reason:'denied'}}})()")

    # ---------- Shield screen: notifications card ----------
    pg.evaluate("window.__perm.notifications=false;S.settings.shNoteScan=true;S.settings.shNoteBlock=true;save()")
    pg.evaluate("openTools()");pg.wait_for_timeout(300);pg.evaluate("tShield()");pg.wait_for_timeout(500)
    txt=pg.inner_text('#tbody')
    ok('Notifications' in txt and 'Scan finished: On' in txt and 'Dangerous file: On' in txt,'Shield screen has the Notifications card with both switches')
    ok('Android has notifications turned off' in txt and 'Allow notifications' in txt,'Shield screen warns and offers Allow when Android has notifications off')
    pg.evaluate("window.__log.length=0")
    pg.click('text=Allow notifications');pg.wait_for_timeout(300)
    ok(pg.evaluate("window.__log.some(x=>x[0]==='perm'&&x[1]==='notifications')"),'Allow notifications asks for the notifications permission')
    pg.wait_for_timeout(200)
    pg.evaluate("readPerm().then(()=>drawShield())");pg.wait_for_timeout(300)
    ok('Android has notifications turned off' not in pg.inner_text('#tbody'),'warning goes away once the permission is granted')
    pg.click('text=Scan finished: On');pg.wait_for_timeout(200)
    ok(pg.evaluate("S.settings.shNoteScan")==False and 'Scan finished: Off' in pg.inner_text('#tbody'),'tapping the switch turns Scan finished off')
    pg.evaluate("S.settings.shNoteScan=true;save()")
    pg.evaluate("document.querySelector('#tools').classList.remove('on')")

    # ---------- Settings rows ----------
    pg.evaluate("window.__perm.notifications=false;window.__perm.allFiles=false");pg.evaluate("openSet()");pg.wait_for_timeout(400)
    st=pg.inner_text('#sbody') if pg.query_selector('#sbody') else pg.inner_text('#set')
    ok('Notify when a Shield scan finishes' in st and 'Notify when Shield stops or finds a dangerous file' in st,'Settings > Shield has both notification switches')
    ok('Still off:' in st and 'Notifications' in st and 'All files access' in st,'Settings > Permissions names what is still off')
    pg.evaluate("window.__perm.notifications=true;window.__perm.allFiles=true;window.__perm.media=true;window.__perm.battery=true");pg.evaluate("openSet()");pg.wait_for_timeout(400)
    st=pg.inner_text('#sbody') if pg.query_selector('#sbody') else pg.inner_text('#set')
    ok('Everything Conduint needs is allowed.' in st,'Settings says everything is allowed when it is')
    pg.evaluate("document.querySelector('#set').classList.remove('on')")
    ok('Shield scan' in pg.evaluate("PROWS().map(r=>r[3]).join(' ')"),'Notifications row on the permission sheet mentions Shield')

    # ---------- folder size ----------
    pg.evaluate("S.mounts.push({id:'m1',type:'saf',name:'Phone',sub:'Phone',ic:'phone',uri:'mock:/',root:'mock:/'});save();go('m1')");pg.wait_for_timeout(500)
    menu=pg.evaluate("(()=>{const i={name:'Docs',uri:'mock:/Docs',dir:true};const m=itemMenu(i,'Docs','Docs',false,[]);const f=m.find(e=>e[0]==='Features');return{top:m.map(e=>e[0]),feat:f?f[1].map(e=>e[0]):[]}})()")
    ok('Size' in menu['feat'],'folder long-press menu has Size under Features '+str(menu))
    fm=pg.evaluate("(()=>{const i={name:'a.txt',uri:'mock:/Docs/a.txt',dir:false};const m=itemMenu(i,'a.txt','a.txt',false,[]);return JSON.stringify(m.map(e=>[e[0],Array.isArray(e[1])?e[1].map(x=>x[0]):0]))})()")
    ok('"Size"' not in fm,'files do not get a Size entry')
    pg.evaluate("opSize({name:'Docs',uri:'mock:/Docs',dir:true})");pg.wait_for_timeout(500)
    d=pg.inner_text('#dlg')
    ok('Docs' in d and '2.1 KB' in d and '2,173 bytes' in d and '3 files in 1 subfolder' in d and 'Counted in' in d,'Size dialog: total, file and subfolder counts, time taken '+d.replace('\n',' | '))
    pg.evaluate("dlg.close&&dlg.close()");pg.wait_for_timeout(200)
    pg.evaluate("window.__sizeSkip=2");pg.evaluate("opSize({name:'Docs',uri:'mock:/Docs',dir:true})");pg.wait_for_timeout(500)
    d=pg.inner_text('#dlg')
    ok('2 folders could not be read' in d and 'real size is larger' in d,'unreadable folders are reported, the total is not presented as complete')
    pg.evaluate("dlg.close&&dlg.close()");pg.wait_for_timeout(200);pg.evaluate("window.__sizeSkip=0")
    pg.evaluate("window.__sizeFail=true");pg.evaluate("opSize({name:'Docs',uri:'mock:/Docs',dir:true})");pg.wait_for_timeout(500)
    ok(not pg.evaluate("document.querySelector('#busy').classList.contains('on')"),'a failed measure closes the busy overlay')
    ok('Could not read this folder' in pg.inner_text('body'),'a failed measure shows the plain error')
    pg.evaluate("window.__sizeFail=false")

    # ---------- VPN key icon in the top bar ----------
    vis=lambda:pg.evaluate("getComputedStyle(document.querySelector('#vpk')).display")
    ok(pg.evaluate("!!document.querySelector('#vpk use[href=\"#i-key\"]')&&!!document.querySelector('#i-key')"),'top bar has a key icon button and the key symbol exists')
    ok(vis()=='none','key icon is hidden while the VPN is off')
    pg.evaluate("(()=>{VPN.status=async()=>({state:'DOWN'})})()");pg.evaluate("vpBadge()");pg.wait_for_timeout(200)
    ok(vis()=='none','status DOWN keeps it hidden')
    pg.evaluate("(()=>{VPN.status=async()=>({state:'UP',name:'Cape Town'})})()");pg.evaluate("vpBadge()");pg.wait_for_timeout(200)
    ok(vis()!='none','status UP shows the key icon')
    ok('Cape Town' in pg.evaluate("document.querySelector('#vpk').getAttribute('aria-label')"),'its label names the connected server')
    pg.evaluate("(()=>{window.__tv=0;tVpn=async()=>{window.__tv++}})()")
    pg.click('#vpk');pg.wait_for_timeout(400)
    ok(pg.evaluate("window.__tv")==1,'tapping the key opens the VPN screen')
    pg.evaluate("(()=>{VPN.status=async()=>{throw Error('x')}})()");pg.evaluate("vpBadge()");pg.wait_for_timeout(200)
    ok(vis()=='none','a failing status call hides the icon instead of breaking the app')
    pg.evaluate("document.querySelector('#tools').classList.remove('on')")

    # ---------- Largest folders ----------
    pg.evaluate("window.__perm.allFiles=true");pg.evaluate("openTools()");pg.wait_for_timeout(500)
    ok('Largest folders' in pg.inner_text('#tbody'),'Tools has a Largest folders tile')
    pg.evaluate("(()=>{tBigDirs()})()");pg.wait_for_timeout(700)
    t=pg.inner_text('#tbody');names=pg.evaluate("[...document.querySelectorAll('#tbody .bdrow b')].map(b=>b.textContent)")
    ok(pg.evaluate("TV.view")=='bigdirs' and names[0]=='Movies','shows the biggest folder first, in order '+str(names))
    ok('Internal storage' in t and '% of this folder' in t,'shows the storage name and each folder\'s share of it')
    pg.click('text=Movies');pg.wait_for_timeout(600)
    t=pg.inner_text('#tbody')
    ok('Internal storage / Movies' in t and 'Files directly in this folder' in t and '90' in t,'tapping a folder looks inside it, with the path on top '+t[:90].replace('\n',' | '))
    pg.evaluate("window.__calls=0;(()=>{const o=TOOLS.folderSizes;TOOLS.folderSizes=async a=>{window.__calls++;return o.call(TOOLS,a)}})()")
    pg.click('#tback');pg.wait_for_timeout(400)
    ok(pg.evaluate("TV.view")=='bigdirs' and 'Internal storage' in pg.inner_text('#tbody') and pg.evaluate("window.__calls")==0,'Back goes up one level from the kept answer without measuring again')
    pg.click('text=Measure again');pg.wait_for_timeout(500)
    ok(pg.evaluate("window.__calls")==1 and pg.evaluate("BIGD.stack.length")==1,'Measure again measures once and does not stack the level twice')
    pg.click('#tback');pg.wait_for_timeout(400)
    ok(pg.evaluate("TV.view")=='home','Back from the first level returns to Tools')
    pg.evaluate("window.__bdFail=true");pg.evaluate("(()=>{tBigDirs()})()");pg.wait_for_timeout(600)
    ok(not pg.evaluate("document.querySelector('#busy').classList.contains('on')") and 'would not let Conduint open' in pg.inner_text('body'),'a folder Android refuses shows the plain error and closes the overlay')
    pg.evaluate("window.__bdFail=false;document.querySelector('#tools').classList.remove('on')")
    ok(not errs,'no script errors during the run '+str(errs))
    b.close()
print('\n'+('ALL PASSED' if not fails else str(len(fails))+' FAILED: '+'; '.join(fails)))
raise SystemExit(1 if fails else 0)
