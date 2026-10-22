"""V0.48.0: wave pull-to-refresh, Home menu groups (no Add a folder), Home sections fold, zip viewer above Tools."""
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
    # Home menu
    pg.click('#bm');pg.wait_for_selector('#menu.on')
    txt=pg.inner_text('#menu')
    ok('Add a folder' not in txt,'no "Add a folder" in Home menu')
    ok(pg.locator('#menu .mg').count()==3,'three menu groups')
    pg.locator('#menu .mgh',has_text='Sync').click()
    ok(pg.locator('#menu .mg.shut').count()==1 and not pg.locator('#menu .mg.shut .mgb').first.is_visible(),'group folds')
    ok(pg.evaluate("S.settings.mg.Sync")==1,'fold remembered')
    pg.keyboard.press('Escape');pg.mouse.click(5,400);pg.wait_for_timeout(100)
    pg.click('#bm');pg.wait_for_selector('#menu.on')
    ok(pg.locator('#menu .mg.shut').count()==1,'fold persists on reopen')
    pg.locator('#menu .mgh',has_text='Sync').click();pg.mouse.click(5,400)
    # Home sections
    ok(pg.locator('.dsx').count()==4,'four Home sections')
    pg.locator('.dsxh',has_text='Library').click()
    ok(not pg.locator('#dfiles').is_visible(),'Library folds')
    pg.locator('.dsxh',has_text='Library').click()
    ok(pg.locator('#dfiles').is_visible(),'Library opens again')
    # wave
    ok(pg.evaluate("document.querySelector('#ptr')&&document.querySelector('#ptr').tagName.toLowerCase()")=='svg','wave element is an svg')
    pg.evaluate("""()=>{const el=document.querySelector('#dscroll');const mk=(t,y)=>{const tc=new Touch({identifier:1,target:el,clientX:200,clientY:y});return new TouchEvent(t,{touches:t==='touchend'?[]:[tc],changedTouches:[tc],bubbles:true,cancelable:true})};
     window.__t=[mk('touchstart',200),mk('touchmove',260),mk('touchmove',330),mk('touchend',330)];el.dispatchEvent(window.__t[0]);el.dispatchEvent(window.__t[1]);el.dispatchEvent(window.__t[2])}""")
    pg.wait_for_timeout(200)
    ok(float(pg.evaluate("getComputedStyle(document.querySelector('#ptr')).opacity"))>0.9,'wave visible while pulling')
    d=pg.evaluate("document.querySelector('#ptr path').getAttribute('d')")
    pg.wait_for_timeout(120);d2=pg.evaluate("document.querySelector('#ptr path').getAttribute('d')")
    ok(d and d!=d2 and d.count('L')>40,'wave path animates')
    ok(pg.evaluate("getComputedStyle(document.querySelector('#dscroll')).transform")=='none','Home does not slide while pulling')
    pg.evaluate("document.querySelector('#dscroll').dispatchEvent(window.__t[3])");pg.wait_for_timeout(1700)
    ok(float(pg.evaluate("getComputedStyle(document.querySelector('#ptr')).opacity"))<0.1,'wave fades after refresh')
    # zip viewer above tools
    pg.evaluate("document.querySelector('#tools').classList.add('on')")
    pg.evaluate("readerOpen({name:'inside.txt',size:5,mime:'text/plain',blob:new Blob(['hello zip']),fromZip:true})");pg.wait_for_timeout(500)
    z=pg.evaluate("[+getComputedStyle(document.querySelector('#rd')).zIndex,+getComputedStyle(document.querySelector('#tools')).zIndex]")
    ok(z[0]>z[1],'viewer opened from zip is above Tools '+str(z))
    top=pg.evaluate("(()=>{const e=document.elementFromPoint(206,430);return !!e.closest('#rd')})()")
    ok(top,'tap lands on the viewer, not Tools')
    b.close()
real=[e for e in errs if 'favicon' not in e]
ok(not real,'no page errors '+str(real[:3]))
print('FAILS',len(fails));sys.exit(1 if fails else 0)
