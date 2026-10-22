"""V0.13.0 tests: Conduint Browser web sheet. Part A runs in plain Chromium (iframe preview), part B with a mock of the native
Browser plugin to check the exact calls the Java side receives. Run: python3 tests/v0130.py"""
import http.server, threading, functools, os, json
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
SEED="if(!localStorage['conduint.v1'])localStorage['conduint.v1']=JSON.stringify({settings:{permAsked:true,autoPerm:false}})"
MOCK="""
window.androidBridge=true;window.__calls=[];window.__ls={};
const mk=n=>async a=>{window.__calls.push([n,a]);if(n==='cookies')return{cookie:'sid=abc123; theme=dark'};return{}};
const B={addListener(e,f){(window.__ls[e]=window.__ls[e]||[]).push(f);return{remove(){}}}};
['show','bounds','hide','open','select','close','go','back','forward','reload','stop','desktop','find','findNext','exec','set','scripts','cookies','delcookie','clear'].forEach(n=>B[n]=mk(n));
window.Capacitor={isNativePlatform:()=>true,Plugins:{Browser:B}};
window.__emit=(e,d)=>(window.__ls[e]||[]).forEach(f=>f(d));
"""
def calls(pg,n):return pg.evaluate("n=>window.__calls.filter(c=>c[0]===n).map(c=>c[1])",n)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME','/opt/pw-browsers/chromium'),args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    # ---------- A: interface in plain Chromium ----------
    pg=b.new_page(viewport={'width':412,'height':860});pg.add_init_script(SEED)
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and 'favicons' not in m.text and 'Failed to load resource' not in m.text and errs.append(m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate("document.body.classList.remove('nav')")
    ok(not errs,'no script errors on load: '+str(errs))
    ok(pg.locator('.dhead .brbtn').count()==1,'browser icon sits in the Home header')
    ok(pg.evaluate("getComputedStyle(document.querySelector('.brbtn')).width")!='0px','icon is visible')
    pg.click('.brbtn');pg.wait_for_timeout(600)
    ok(pg.evaluate("document.querySelector('#br').classList.contains('on')"),'sheet slides up')
    r=pg.evaluate("(()=>{const r=document.querySelector('#br').getBoundingClientRect();return[r.bottom,r.height,innerHeight]})()")
    ok(abs(r[0]-r[2])<2 and 0.6<r[1]/r[2]<0.8,'sheet sits on the bottom at about 72% height: '+str(r))
    ok(pg.locator('#brntp.on').count()==1 and pg.locator('.ntq').count()==1,'new tab page with search box')
    pg.screenshot(path='/tmp/br-half.png')
    pg.click('#brmax');pg.wait_for_timeout(600)
    r=pg.evaluate("(()=>{const r=document.querySelector('#br').getBoundingClientRect();return[r.top,r.height,innerHeight]})()")
    ok(r[0]<2 and abs(r[1]-r[2])<2,'maximise fills the screen: '+str(r))
    pg.click('#brmax');pg.wait_for_timeout(600)
    ok(pg.evaluate("document.querySelector('#br').getBoundingClientRect().height/innerHeight")<0.85,'minimise returns to the sheet')
    # address bar: typing a word searches, a domain opens https
    ok(pg.evaluate("[brUrl('example.com'),brUrl('cats and dogs'),brUrl('localhost:3000'),brUrl('https://a.b/c'),brUrl('javascript:alert(1)')]")==['https://example.com','https://www.google.com/search?q=cats%20and%20dogs','http://localhost:3000','https://a.b/c','https://www.google.com/search?q=javascript%3Aalert(1)'],'address bar rules (javascript: becomes a search, never runs)')
    pg.click('#bri');pg.fill('#bri','exa');pg.wait_for_timeout(200)
    ok(pg.locator('#brsug.on').count()==1 and pg.locator('#brsug .brr').count()>=1,'suggestions open while typing')
    pg.fill('#bri','127.0.0.1:%d/index.html'%srv.server_port);pg.keyboard.press('Enter');pg.wait_for_timeout(500)
    ok(pg.evaluate("BR.tabs[0].u").startswith('http://127.0.0.1'),'Enter opens the address: '+pg.evaluate("BR.tabs[0].u"))
    ok(pg.evaluate("BD.hist.length")==1,'visit recorded in history')
    # menu
    pg.click('#brmn');pg.wait_for_timeout(250)
    ok(pg.locator('#br.menu #brmenu .bmr').count()>=9,'menu has Chrome-style items: '+str(pg.locator('#brmenu .bmr span').all_inner_texts()))
    pg.screenshot(path='/tmp/br-menu.png')
    pg.click('#brmenu .bmt .bmi:nth-child(2)');pg.wait_for_timeout(200)
    ok(pg.evaluate("BD.bm.length")==1,'star bookmarks the page')
    pg.click('#brmn');pg.click('#brmenu .bmr:has-text("New tab")');pg.wait_for_timeout(300)
    ok(pg.evaluate("BR.tabs.length")==2 and pg.locator('#brtabs b').inner_text()=='2','new tab: count shows 2')
    pg.click('#brmn');pg.click('#brmenu .bmr:has-text("Incognito")');pg.wait_for_timeout(300)
    ok(pg.evaluate("BR.tabs.length==3&&BR.tabs[2].priv")and pg.evaluate("document.querySelector('#br').classList.contains('priv')"),'incognito tab is marked')
    pg.click('#brtabs');pg.wait_for_timeout(250)
    ok(pg.locator('.tcd').count()==3,'tab switcher shows all three tabs')
    pg.screenshot(path='/tmp/br-tabs.png')
    pg.locator('.tcd').nth(0).click();pg.wait_for_timeout(250)
    ok(pg.evaluate("BR.cur===BR.tabs[0].id")and pg.locator('#brpan.on').count()==0,'tapping a tab selects it and closes the switcher')
    # history, bookmarks, extensions, settings, cookies
    for name,sel in [('History','#brmenu .bmr:has-text("History")'),('Bookmarks','#brmenu .bmr:has-text("Bookmarks")')]:
        pg.click('#brmn');pg.click(sel);pg.wait_for_timeout(250)
        ok(pg.locator('#brpan.on .bph b').inner_text()==name and pg.locator('#brpan .brr').count()>=1,name+' panel lists items')
        pg.click('#brpan .bph .ib');pg.wait_for_timeout(150)
    pg.click('#brmn');pg.click('#brmenu .bmr:has-text("Extensions")');pg.wait_for_timeout(250)
    ok(pg.locator('#brpan .brr').count()>=4,'extensions panel lists built-ins')
    pg.click('#brpan .bph .ib:nth-child(3)');pg.wait_for_timeout(200)
    pg.fill('.bpq','Big text');pg.locator('textarea.bpt').nth(0).fill('example.com');pg.locator('textarea.bpt').nth(2).fill('body{font-size:22px}')
    pg.click('.bpa .chip.on');pg.wait_for_timeout(200)
    ok(pg.evaluate("BD.ext.length")==1 and pg.evaluate("brExtList().length")==1,'own extension saved and queued for the engine')
    pg.click('#brpan .bph .ib');pg.wait_for_timeout(100);pg.click('#brpan .bph .ib');pg.wait_for_timeout(100)
    pg.click('#brmn');pg.click('#brmenu .bmr:has-text("Settings")');pg.wait_for_timeout(250)
    pg.click('#brpan .chip:has-text("DuckDuckGo")');pg.wait_for_timeout(150)
    ok(pg.evaluate("BD.set.engine")=='ddg' and 'duckduckgo' in pg.evaluate("brUrl('hello world')"),'search engine switch works')
    pg.screenshot(path='/tmp/br-settings.png')
    pg.click('#brpan .bps:has-text("Privacy") ~ .brr:has-text("Clear browsing data")');pg.wait_for_timeout(200)
    ok(pg.locator('#brpan .bph b').inner_text()=='Clear browsing data','clear data panel opens')
    pg.click('#brpan .chip.danger');pg.wait_for_timeout(250)
    ok(pg.evaluate("BD.hist.length")==0,'clear removes history')
    # Android back unwinds one layer at a time
    pg.evaluate("history.back()");pg.wait_for_timeout(200)
    ok(pg.evaluate("BR.panel")=='','back closes the open panel first')
    pg.evaluate("history.back()");pg.wait_for_timeout(500)
    ok(not pg.evaluate("BR.open"),'back then hides the sheet')
    # persistence
    pg.reload();pg.wait_for_timeout(700)
    ok(pg.evaluate("BD.bm.length")==1 and pg.evaluate("BD.tabs.length")==2,'bookmarks and open tabs survive a restart (private tab not kept): tabs='+str(pg.evaluate("BD.tabs.length")))
    ok(pg.evaluate("document.querySelector('.brbtn').dataset.n")=='2','Home icon shows the open tab count')
    ok(not errs,'no script errors during the run: '+str(errs))
    pg.close()
    # ---------- B: native contract with a mock plugin ----------
    errs.clear()
    pg=b.new_page(viewport={'width':412,'height':860});pg.add_init_script(SEED);pg.add_init_script(MOCK)
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(700)
    ok(pg.evaluate("typeof BRW")=='object' and len(calls(pg,'scripts'))>=1 and len(calls(pg,'set'))>=1,'on start: extensions and settings are pushed to the engine')
    pg.evaluate("brOpen('https://example.com')");pg.wait_for_timeout(700)
    op=calls(pg,'open')
    ok(len(op)==1 and op[0]['url']=='https://example.com' and op[0]['select'] is True,'tab opened natively: '+json.dumps(op))
    sh=calls(pg,'show')
    ok(len(sh)==1 and sh[0]['h']>300 and sh[0]['y']>200,'native view placed under the toolbar: '+json.dumps(sh[:1]))
    pg.evaluate("__emit('state',{id:BR.cur,url:'https://example.com/',title:'Example Domain',progress:40,back:false,fwd:false})")
    ok(pg.evaluate("document.querySelector('#brpg').classList.contains('on')"),'progress bar shows while loading')
    pg.evaluate("__emit('state',{id:BR.cur,url:'https://example.com/',title:'Example Domain',progress:100,back:true,fwd:false})")
    ok(pg.evaluate("BD.hist[0].t")=='Example Domain' and not pg.evaluate("document.querySelector('#brbk').disabled"),'history gets the title; back button enables')
    pg.click('#brbk');ok(len(calls(pg,'back'))==1,'back button calls native back')
    pg.click('#brmn');pg.wait_for_timeout(200)
    ok(len(calls(pg,'hide'))>=1,'native view is hidden while the menu is drawn over it')
    pg.click('#brmenu .bmr:has-text("Cookies")');pg.wait_for_timeout(400)
    ok('sid' in pg.inner_text('#brpan') and 'theme' in pg.inner_text('#brpan'),'cookie panel lists the site cookies')
    pg.click('#brpan .brr:has-text("sid") .ib');pg.wait_for_timeout(200)
    ok(calls(pg,'delcookie')[0]['name']=='sid','single cookie delete reaches native')
    pg.click('#brpan .bph .ib');pg.wait_for_timeout(100);pg.click('#brpan .bph .ib');pg.wait_for_timeout(300)
    pg.evaluate("__emit('newtab',{id:'pop1',opener:BR.cur})");pg.wait_for_timeout(200)
    ok(pg.evaluate("BR.cur")=='pop1' and len(calls(pg,'select'))>=1,'a page opening a new window becomes a tab')
    pg.evaluate("__emit('download',{name:'a.pdf',url:'https://x/a.pdf',ok:true})")
    ok(pg.evaluate("BD.dl[0].name")=='a.pdf','download event is logged')
    pg.click('#brmax');pg.wait_for_timeout(700)
    ok(len(calls(pg,'bounds'))>5,'bounds follow the sheet while it maximises ('+str(len(calls(pg,'bounds')))+' updates)')
    pg.click('#brhide');pg.wait_for_timeout(500)
    ok(pg.evaluate("BR.shown")==False and len(calls(pg,'hide'))>=2,'closing the sheet hides the native view but keeps tabs')
    ok(pg.evaluate("BR.tabs.length")==2,'tabs are kept after hiding')
    ok(not errs,'no script errors with the native mock: '+str(errs))
    b.close()
print('\nFAILED: '+str(fails) if fails else '\nALL PASSED');raise SystemExit(1 if fails else 0)
