"""V0.42.5: Shield web filters in the VPN DNS filtering look. Run: python3 tests/v0425.py"""
import http.server, threading, functools, os
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
VPNMOCK="""(()=>{const o=window.Capacitor.registerPlugin;let st={profiles:[{id:'p1',name:'Home',active:true}],settings:{dns:''}};
window.__vpnFail=false;window.__conn=0;
const V={async profiles(){return st},async fwState(){return{enabled:false,running:false,net:'none',rules:{},wgUp:false}},
async setOptions(o){if(window.__vpnFail)throw new Error('boom');st={...st,settings:{...st.settings,...o}};return st},
async connect(){window.__conn++;return st}};
window.Capacitor.registerPlugin=n=>n==='Vpn'?V:o(n)})();"""
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
CHROME=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock);pg.add_init_script(VPNMOCK)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('tools').classList.add('on');tShield()");pg.wait_for_timeout(800)
    n=lambda s:pg.evaluate(f"document.querySelectorAll({s!r}).length")
    ok(pg.evaluate("[...document.querySelectorAll('#tbody .shcard')].some(c=>c.querySelector('.fmaster'))"),'new card with master row is shown')
    ok(not pg.evaluate("[...document.querySelectorAll('#tbody .shcard')].some(c=>c.firstElementChild&&c.firstElementChild.textContent==='Web filters')"),'old chip card is gone')
    ok(n('#tbody .shcard .fg')>=9,'fold groups drawn: %d'%n('#tbody .shcard .fg'))
    ok('OFF' in pg.evaluate("document.querySelector('#tbody .fmaster small').textContent"),'master starts OFF')
    pg.click('#tbody .fmaster .fsw');pg.wait_for_timeout(400)
    ok(pg.evaluate("VP.d.settings.dns")=='94.140.14.14, 94.140.15.15','master on saves last/default server')
    ok('ADGUARD DEFAULT' in pg.evaluate("document.querySelector('#tbody .fmaster small').textContent"),'master shows server name')
    ok(n('#tbody .shcard .shrow .chip')>=1 and 'Reconnect' in pg.evaluate("document.querySelector('#tbody .shcard .shrow .chip').textContent"),'Reconnect now chip appears')
    pg.click('#tbody .shcard .shrow .chip');pg.wait_for_timeout(500)
    ok(pg.evaluate("window.__conn")>=1,'Reconnect now calls connect')
    # pick Quad9 by opening Security group
    pg.evaluate("[...document.querySelectorAll('#tbody .fg')].find(g=>g.textContent.includes('SECURITY ONLY')).querySelector('.fgh').click()")
    pg.evaluate("[...document.querySelectorAll('#tbody .fr')].find(r=>r.textContent.includes('QUAD9')).querySelector('.fsw').click()");pg.wait_for_timeout(400)
    ok(pg.evaluate("VP.d.settings.dns")=='9.9.9.9, 149.112.112.112','server pick saves its addresses')
    ok(pg.evaluate("VP.d.settings.dns")==pg.evaluate("dnsxParse(VP.d.settings.dns).pr.a.join(', ')"),'same value VPN screen parses')
    # failure path
    pg.evaluate("window.__vpnFail=true");pg.click('#tbody .fmaster .fsw');pg.wait_for_timeout(400)
    ok(pg.evaluate("VP.d.settings.dns")=='9.9.9.9, 149.112.112.112','failed save leaves DNS unchanged')
    ok(n('#tbody .shcard .fmaster')==1,'card still drawn after failure')
    pg.evaluate("window.__vpnFail=false")
    # browser group switch
    pg.evaluate("[...document.querySelectorAll('#tbody .fg')].find(g=>g.textContent.includes('PARENTAL')).querySelector('.fsw').click()");pg.wait_for_timeout(300)
    ok(pg.evaluate("BD.set.adult===true&&BD.set.gamb===true"),'group switch turns adult and gambling on')
    pg.evaluate("[...document.querySelectorAll('#tbody .fg')].find(g=>g.textContent.includes('PARENTAL')).querySelector('.fsw').click()");pg.wait_for_timeout(300)
    ok(pg.evaluate("BD.set.adult===false&&BD.set.gamb===false"),'group switch turns them off again')
    ok(pg.evaluate("[...document.querySelectorAll('#tbody .ftag')].some(t=>t.textContent==='ALL APPS VIA DNS')")==False,'no ALL APPS tag for Quad9 (malware only)')
    # custom list
    pg.evaluate("BD.set.custom=[];BD.set.customOff=false;drawShield()")
    pg.evaluate("[...document.querySelectorAll('#tbody .fg')].find(g=>g.textContent.includes('YOUR LIST')).querySelector('.fsw').click()");pg.wait_for_timeout(300)
    ok(pg.evaluate("BD.set.customOff===true"),'your list switch toggles')
    # no stray errors
    ok(not errs,'no page errors: '+str(errs))
    b.close()
print('FAILED' if fails else 'ALL PASSED');raise SystemExit(1 if fails else 0)
