"""V0.50.0: folders-only left panel (14), folders-only Home with Add folder, Conduit Manager bar, steady beam wave, gallery card fold,
zip viewer layering and open-any-entry, screenshots allowed, Document viewer permission row, resume snapshot, Wi-Fi name on Home."""
import http.server, threading, functools, os, sys
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
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':412,'height':860},has_touch=True);pg.add_init_script(mock);pg.add_init_script("localStorage['cnd.auth.prof']='0'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.evaluate('askedAll=true');pg.evaluate("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')");pg.wait_for_timeout(900)
    ok(pg.evaluate("isHome()"),'starts on Home')
    ok(pg.evaluate("PANEL_MAX")==14,'left panel holds 14')
    ok(pg.evaluate("catalog().every(x=>x.k==='slot'||x.k==='mount')"),'catalog is folders only (no tools, no browser)')
    # many folders: never more than 14 in the panel
    n=pg.evaluate("""()=>{for(let i=0;i<20;i++)S.mounts.push({id:'t'+i,type:'saf',name:'Folder '+i,ic:'folder',uri:'content://x/'+i,root:'content://x/'+i});S.lay=null;const y=layNorm();return [y.panel.length,y.panel.every(i=>i.startsWith('m:')||i.startsWith('slot:'))]}""")
    ok(n[0]<=14,f'panel never above 14 ({n[0]})');ok(n[1],'panel ids are folders only')
    pg.evaluate("S.mounts=S.mounts.filter(m=>m.id==='t0'||m.id==='t1');S.lay=null;layNorm()")
    # an old layout with tools in it is cleaned
    r=pg.evaluate("""()=>{S.lay={v:1,panel:['browser','zip','m:t0','cat:arcs'],home:['notes','vpn'],seen:[]};const y=layNorm();return [y.panel,y.home]}""")
    ok(all(x.startswith('m:') or x.startswith('slot:') for x in r[0]) and 'browser' not in r[0] and 'zip' not in r[0],'old tool entries leave the panel '+str(r[0]))
    ok(all(x.startswith('m:') or x.startswith('slot:') for x in r[1]),'old shortcuts leave Home')
    pg.evaluate("S.lay=null;side()")
    txt=pg.evaluate("document.querySelector('#pnl').textContent")
    ok('Browser' not in txt and 'Zipliner' not in txt and 'Shield' not in txt,'left panel shows no Browser or tools')
    ok('Conduit Manager' in pg.evaluate("document.querySelector('#foot').textContent"),'bar is called Conduit Manager')
    ok('Shortcuts' not in pg.evaluate("document.querySelector('#foot').textContent"),'old name Shortcuts is gone')
    ok('Utilities' in pg.evaluate("document.querySelector('#foot').textContent"),'Utilities stays in the bottom bar')
    # Home: folders only
    pg.evaluate("goHome()");pg.wait_for_timeout(200)
    sp=pg.inner_text('#dspace')
    ok('Add folder' in sp,'Home has an Add folder button')
    ok(all(w not in sp for w in ['Utilities','Settings','Vault','Browser','Notepad','Contacts']),'Home has no shortcuts or Utilities')
    pg.evaluate("S.lay.home=['notes','vpn','browser','opt'];layRefresh()")
    sp=pg.inner_text('#dspace')
    ok(all(w not in sp for w in ['Notepad','VPN','Browser','Optimiser']),'tools put on Home by an old layout do not show')
    # add to Home / back to the panel
    pg.evaluate("S.lay=null;layNorm();place('m:t1','home')");pg.wait_for_timeout(100)
    ok('Folder 1' in pg.inner_text('#dspace'),'a folder added to Home shows on Home')
    ok('Folder 1' not in pg.evaluate("document.querySelector('#pnl').textContent"),'...and leaves the left panel (one place)')
    pg.evaluate("place('m:t1','panel')");pg.wait_for_timeout(100)
    ok('Folder 1' in pg.evaluate("document.querySelector('#pnl').textContent") and 'Folder 1' not in pg.inner_text('#dspace'),'moves back to the panel')
    pg.evaluate("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')")
    pg.click('#bm');pg.wait_for_selector('#menu.on')
    ok('Add folder to Home' in pg.inner_text('#menu'),'Home menu has Add folder to Home')
    pg.keyboard.press('Escape');pg.mouse.click(5,400);pg.wait_for_timeout(100)
    # beam wave
    css=pg.evaluate("""()=>{const P=document.querySelector('#ptr');const a=getComputedStyle(P.querySelector('.w1')).strokeWidth,b=getComputedStyle(P.querySelector('.w2')).strokeWidth;return [a,b,P.querySelectorAll('animate,animateTransform').length]}""")
    ok(css[0]==css[0] and css[2]==0,'beam has no spin animation')
    pg.evaluate("""()=>{const el=document.querySelector('#dscroll');const mk=(t,y)=>new Touch({identifier:1,target:el,clientX:200,clientY:y});
     const ev=(t,y)=>el.dispatchEvent(new TouchEvent(t,{touches:t==='touchend'?[]:[mk(t,y)],changedTouches:[mk(t,y)],bubbles:true,cancelable:true}));
     ev('touchstart',200);ev('touchmove',250);window.__w1=document.querySelector('#ptr .w1').getAttribute('stroke-width');ev('touchmove',330);window.__cls=document.querySelector('#ptr').getAttribute('class');window.__top=document.querySelector('#ptr').style.top}""")
    pg.wait_for_timeout(120)
    ok(pg.evaluate("+getComputedStyle(document.querySelector('#ptr')).opacity")>0.5,'beam shows while pulling')
    d1=pg.evaluate("document.querySelector('#ptr .w1').getAttribute('d')");pg.wait_for_timeout(200);d2=pg.evaluate("document.querySelector('#ptr .w1').getAttribute('d')")
    ok(d1!=d2,'beam flows sideways')
    ok(pg.evaluate("window.__cls")in(None,''),'beam has no spin or grow state')
    pg.evaluate("""()=>{const el=document.querySelector('#dscroll');const mk=(y)=>new Touch({identifier:1,target:el,clientX:200,clientY:y});el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[mk(330)],bubbles:true}))}""")
    pg.wait_for_timeout(1700)
    ok(pg.evaluate("+getComputedStyle(document.querySelector('#ptr')).opacity")<0.2,'beam fades out after refresh')
    # permissions row
    pg.evaluate("openPerm()");pg.wait_for_timeout(300)
    ok('Document viewer' in pg.inner_text('#pbody'),'Document viewer permission row')
    pg.evaluate("document.querySelector('#perm').classList.remove('on')")
    # screenshots
    ok('lockType' not in pg.evaluate("applySecure.toString()"),'screenshot block no longer tied to the lock')
    ok(pg.evaluate("S.settings.secure")==False,'screenshots allowed by default')
    # zip layering
    z=pg.evaluate("""()=>{document.body.classList.add('zbon');const r=['#rd','#iv','#ed','#gc'].map(s=>{const e=document.querySelector(s);return e?+getComputedStyle(e).zIndex:null});document.body.classList.remove('zbon');return r}""")
    ok(all(v==66 for v in z if v is not None) and any(v==66 for v in z),'viewers sit above Tools while a zip is open '+str(z))
    ok(pg.evaluate("typeof zbOpenAny==='function'"),'zip entries without a viewer open through Android')
    # resume
    pg.evaluate("rsSnap()");ok(pg.evaluate("!!localStorage.getItem('conduint.resume')"),'resume snapshot saved')
    # wifi name
    pg.evaluate("goHome();wfShow2('Fezzy WiFi')");pg.wait_for_timeout(100)
    ok('Fezzy WiFi' in pg.inner_text('#dsub'),'Wi-Fi name shows under the greeting')
    pg.wait_for_timeout(1300)
    ok('Fezzy WiFi' in pg.inner_text('#dsub'),'clock tick keeps the Wi-Fi name')
    pg.evaluate("wfShow2('')");ok(pg.inner_text('#dsub').strip()=='','Wi-Fi name clears when off Wi-Fi')
    # gallery card fold
    g=pg.evaluate("""()=>{if(typeof glOpen!=='function')return null;glOpen();GL.view='all';GL.selOn=true;GL.sel.set('a',{name:'a.jpg',uri:'u:a'});glSel();const s=document.querySelector('#glsel');if(!s)return 'nosel';
      const a=s.classList.contains('min');const btn=s.querySelector('.glsm');btn.click();const s2=document.querySelector('#glsel');return [a,s2.classList.contains('min'),getComputedStyle(s2.querySelector('.glact')).display]}""")
    ok(isinstance(g,list) and g[0]==False and g[1]==True and g[2]=='none','gallery card folds and hides the action grid '+str(g))
    ok(not errs,'no page errors '+str(errs[:3]))
    b.close()
print('\n'+('ALL PASS' if not fails else 'FAILED: '+', '.join(fails)))
sys.exit(1 if fails else 0)
