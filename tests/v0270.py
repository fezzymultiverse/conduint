"""V0.27 tests: cloud logos and account emails, Keep running, Folder watcher (baseline, upload, deny, answers from the notification).
Run: python3 tests/v0270.py   (needs `pip install playwright` and a Chromium)"""
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
EXTRA="""(()=>{const orig=Capacitor.registerPlugin,Saf=orig('Saf'),T=window.__T,Pp=u=>u.slice(6);
window.__prov={icon:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',label:'Google Drive',email:'me@example.com'};
Saf.providerInfo=async()=>window.__prov;
Saf.copyOver=async({from,to})=>{T[Pp(to)]={...T[Pp(from)],mtime:Date.now()}};
const W={calls:[],answers:[],async start(o){this.calls.push(['start',o.minutes,o.text])},async stop(){this.calls.push(['stop'])},
 async ask(o){this.calls.push(['ask',o.id,o.title,o.text])},async clear(o){this.calls.push(['clear',o.id])},
 async takeAnswers(){const a=this.answers;this.answers=[];return{items:a}},async addListener(){return{remove(){}}}};
window.__watch=W;Capacitor.registerPlugin=n=>n==='Watch'?W:orig(n)})();"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock);pg.add_init_script(EXTRA)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("/^V0\\.\\d+\\.\\d+$/.test(VER)"),'version looks like V0.x.y')
    ok(pg.evaluate("typeof wtOpen==='function'&&typeof cloudLook==='function'&&typeof wtUpload==='function'&&!!WATCH"),'watch module and plugin handle exist')

    # ---------- cloud logo and email ----------
    pg.evaluate("""(()=>{S.mounts.push({id:'c1',type:'saf',name:'Cloud: Drive',sub:'Drive',ic:'cloud',uri:'mock:/Docs',root:'mock:/Docs'});save();layRefresh&&layRefresh()})()""")
    pg.evaluate("cloudLook(S.mounts.find(m=>m.id==='c1'))");pg.wait_for_timeout(300)
    m=pg.evaluate("(()=>{const m=S.mounts.find(m=>m.id==='c1');return{logo:(m.logo||'').slice(0,22),email:m.email,prov:m.prov}})()")
    ok(m['logo']=='data:image/png;base64,' and m['email']=='me@example.com' and m['prov']=='Google Drive','logo, provider name and email stored on the cloud')
    pg.evaluate("drawPanel()")
    ok(pg.evaluate("[...document.querySelectorAll('#pnl .nv')].some(n=>n.querySelector('img.plogo')&&n.textContent.includes('me@example.com'))"),'side panel shows the logo and the email under the cloud name')
    ok(pg.evaluate("[...document.querySelectorAll('#pnl .nv')].filter(n=>!n.textContent.includes('Cloud: Drive')).every(n=>!n.querySelector('img.plogo'))"),'other storages keep their normal icon')
    pg.evaluate("(()=>{const m=S.mounts.find(m=>m.id==='c1');m.email='typed@mail.com';m.emailEdit=1})()")
    pg.evaluate("cloudLook(S.mounts.find(m=>m.id==='c1'),true)");pg.wait_for_timeout(200)
    ok(pg.evaluate("S.mounts.find(m=>m.id==='c1').email")=='typed@mail.com','an email you typed is never overwritten by detection')
    pg.evaluate("window.__prov={label:'Dropbox'}")
    pg.evaluate("(()=>{const m=S.mounts.find(m=>m.id==='c1');delete m.email;delete m.emailEdit;delete m.logo})()")
    pg.evaluate("cloudLook(S.mounts.find(m=>m.id==='c1'),true)");pg.wait_for_timeout(200)
    ok(pg.evaluate("!S.mounts.find(m=>m.id==='c1').email")and pg.evaluate("S.mounts.find(m=>m.id==='c1').prov")=='Dropbox','no email found: nothing invented, name still saved')

    # ---------- keep running ----------
    pg.evaluate("(()=>{__watch.calls.length=0;S.watch=[];S.settings.keep=true;S.settings.watchMin=15})()")
    pg.evaluate("wtKeepSync()");pg.wait_for_timeout(100)
    c=pg.evaluate("__watch.calls")
    ok(c and c[-1][0]=='start' and c[-1][1]==15 and 'Keeping' in c[-1][2],'Keep running starts the service with the chosen interval')
    pg.evaluate("S.settings.keep=false");pg.evaluate("wtKeepSync()");pg.wait_for_timeout(100)
    ok(pg.evaluate("__watch.calls.at(-1)[0]")=='stop','turning it off with no watch on stops the service')

    # ---------- folder watcher ----------
    pg.evaluate("""(()=>{const T=__T,old=Date.now()-120000;
      T['Dest']={dir:true,size:0,mtime:old};
      for(const k of Object.keys(T))if(k.startsWith('Docs')&&!T[k].dir)T[k].mtime=old})()""")
    pg.evaluate("""(async()=>{window.W1={id:'w1',name:'Docs → Dest',src:{uri:'mock:/Docs',name:'Docs'},dst:{uri:'mock:/Dest',name:'Dest'},on:true,ask:[],meta:{},askedKey:'',last:0,upl:0};
      S.watch=[W1];window.__n0=await wtBaseline(W1)})()""");pg.wait_for_timeout(100)
    ok(pg.evaluate("__n0")==3,'baseline reads the 3 files already there')
    ok(pg.evaluate("wtCheck(W1)")==0,'files that were already there never ask')
    pg.evaluate("__watch.calls.length=0")
    pg.evaluate("__T['Docs/new.txt']={dir:false,size:50,mtime:Date.now()-60000}")
    ok(pg.evaluate("wtCheck(W1)")==1,'a new file is found')
    c=pg.evaluate("__watch.calls.filter(x=>x[0]==='ask')")
    ok(len(c)==1 and c[0][1]=='w1' and 'Upload 1 file?' in c[0][2] and 'new.txt' in c[0][3],'a notification asks Upload or Deny with the file name')
    pg.evaluate("wtCheck(W1)")
    ok(pg.evaluate("__watch.calls.filter(x=>x[0]==='ask').length")==1,'the same change does not ask twice')
    pg.evaluate("__T['Docs/busy.part']={dir:false,size:1,mtime:Date.now()-60000};__T['Docs/writing.txt']={dir:false,size:9,mtime:Date.now()-2000}")
    pg.evaluate("wtCheck(W1)")
    ok(pg.evaluate("W1.ask.includes('writing.txt')")==False,'a file written in the last 20 seconds waits for the next check')
    # Upload
    pg.evaluate("wtUpload(W1)");pg.wait_for_timeout(400)
    ok(pg.evaluate("!!__T['Dest/new.txt']"),'Upload copies the new file to the destination')
    ok(pg.evaluate("!__T['Dest/a.txt']"),'Upload copies only what you were asked about')
    ok(pg.evaluate("wtCheck(W1)")>=0 and pg.evaluate("!W1.ask.includes('new.txt')"),'an uploaded file does not ask again')
    ok(pg.evaluate("__watch.calls.some(x=>x[0]==='clear'&&x[1]==='w1')"),'the question is removed after the answer')
    # changed file that already exists at the destination replaces it
    pg.evaluate("__T['Docs/new.txt']={dir:false,size:77,mtime:Date.now()-50000}")
    ok(pg.evaluate("wtCheck(W1)")>=1 and pg.evaluate("W1.ask.includes('new.txt')"),'a changed file asks again')
    pg.evaluate("wtUpload(W1)");pg.wait_for_timeout(400)
    ok(pg.evaluate("__T['Dest/new.txt'].size")==77,'Upload replaces the older copy, nothing is deleted')
    ok(pg.evaluate("Object.keys(__T).filter(k=>k.startsWith('Dest/')&&k.includes('(')).length")==0,'no stray duplicate files')
    # Deny
    pg.evaluate("W1.ask=[];__T['Docs/skip.md']={dir:false,size:5,mtime:Date.now()-60000}")
    pg.evaluate("wtCheck(W1)")
    ok(pg.evaluate("W1.ask.includes('skip.md')"),'another new file asks')
    pg.evaluate("wtDeny(W1)")
    ok(pg.evaluate("wtCheck(W1)")>=0 and pg.evaluate("!W1.ask.includes('skip.md')"),'Deny marks it as seen, it will not ask again')
    ok(pg.evaluate("!__T['Dest/skip.md']"),'Deny uploads nothing')
    pg.evaluate("__T['Docs/skip.md']={dir:false,size:6,mtime:Date.now()-30000}")
    ok(pg.evaluate("wtCheck(W1)")>=1 and pg.evaluate("W1.ask.includes('skip.md')"),'a denied file asks again only after it changes')
    # answer tapped on the notification while Conduint was not open
    pg.evaluate("__watch.answers.push({id:'w1',ok:True})".replace('True','true'))
    pg.evaluate("wtAnswers()");pg.wait_for_timeout(400)
    ok(pg.evaluate("!!__T['Dest/skip.md']"),'an Upload tapped on the notification is carried out when Conduint collects it')
    pg.evaluate("__T['Docs/other.md']={dir:false,size:3,mtime:Date.now()-60000}")
    pg.evaluate("wtCheck(W1)")
    pg.evaluate("__watch.answers.push({id:'w1',ok:false})")
    pg.evaluate("wtAnswers()");pg.wait_for_timeout(200)
    ok(pg.evaluate("!__T['Dest/other.md']")and pg.evaluate("W1.ask.length")==0,'a Deny tapped on the notification is carried out too')
    # paused rules do not ask; a rule on starts the service by itself
    pg.evaluate("W1.on=false;__T['Docs/p.md']={dir:false,size:3,mtime:Date.now()-60000};__watch.calls.length=0")
    pg.evaluate("wtTick()");pg.wait_for_timeout(300)
    ok(pg.evaluate("__watch.calls.filter(x=>x[0]==='ask').length")==0,'a paused watch stays quiet')
    pg.evaluate("W1.on=true;S.settings.keep=false;wtKeepSync()");pg.wait_for_timeout(100)
    ok(pg.evaluate("__watch.calls.at(-1)[0]")=='start' and 'Watching 1 folder' in pg.evaluate("__watch.calls.at(-1)[2]"),'a watch that is on keeps the service running by itself')
    # settings screen
    pg.evaluate("openSet()");pg.wait_for_timeout(300)
    t=pg.evaluate("document.querySelector('#set').textContent")
    ok('Keep running in the background' in t and 'Folder watcher' in t and 'Check watched folders every' in t,'Settings shows Keep running, the interval and the Folder watcher')
    ok(not errs,'no script errors during the run '+str(errs))
    b.close()
print('\n%d failed'%len(fails) if fails else '\nALL PASSED')
raise SystemExit(1 if fails else 0)
