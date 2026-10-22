"""V0.19.0 tests (updated V0.45.0: six Home tiles, Downloads is a Home tile not a panel item): one place per item, panel cap, no scroll, Vault is a plain row. Run: python3 tests/v0190.py"""
import http.server, threading, functools, os
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
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox'])
    for w,h in((411,860),(360,740)):
        pg=b.new_page(viewport={'width':w,'height':h});pg.add_init_script(SEED)
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(url);pg.wait_for_timeout(600)
        tag=f'[{w}x{h}] '
        ok(pg.evaluate("S.lay.panel.length<=PANEL_MAX"),tag+'panel within 11')
        ok(pg.evaluate("(()=>{const a=[...S.lay.panel,...S.lay.home];return a.length===new Set(a).size})()"),tag+'no item in two places')
        ok(pg.evaluate("(()=>{const s=$('#side'),p=$('#pnl');return p.scrollHeight<=p.clientHeight+1&&s.scrollHeight<=s.clientHeight+1})()"),tag+'panel does not scroll')
        ok(pg.evaluate("!document.querySelector('.vcard')&&!S.lay.panel.includes('vault')&&!S.lay.home.includes('vault')"),tag+'Vault not advertised by default')
        ok(pg.evaluate("document.querySelectorAll('#pnl .nv').length===S.lay.panel.length"),tag+'panel rows match layout')
        # move to Home -> leaves panel, shows on Home, not duplicated
        pg.evaluate("place('cat:arcs','home')");pg.wait_for_timeout(100)
        ok(pg.evaluate("!S.lay.panel.includes('cat:arcs')&&S.lay.home.includes('cat:arcs')"),tag+'move to Home removes from panel')
        pg.evaluate("goHome()");pg.wait_for_timeout(300)
        ok(pg.evaluate("[...document.querySelectorAll('#dspace .dsc span')].some(b=>b.textContent==='Archives')"),tag+'Home shows it')
        ok(pg.evaluate("![...document.querySelectorAll('#pnl .nv b')].some(b=>b.textContent==='Archives')"),tag+'panel no longer')
        ok(pg.evaluate("[...document.querySelectorAll('#dfiles .dtl b')].map(b=>b.textContent).join()==='Internal Storage,Documents,Gallery,Music,Videos,Downloads'"),tag+'six permanent folders (V0.45.0: Videos and Downloads added)')
        # fill panel past 11
        pg.evaluate("for(let i=0;i<9;i++)S.mounts.push({id:'x'+i,name:'Folder '+i,sub:'',ic:'folder'});layNorm();side()")
        ok(pg.evaluate("S.lay.panel.length===PANEL_MAX&&!S.lay.home.includes('m:x8')&&!S.lay.panel.includes('m:x8')"),tag+'cap holds at 11, extra folders go Hidden (never Home)')
        ok(pg.evaluate("(()=>{const p=$('#pnl');return p.scrollHeight<=p.clientHeight+1})()"),tag+'full panel (11) still does not scroll')
        # place vault on panel after freeing a slot; same row height as others
        pg.evaluate("place(S.lay.panel[S.lay.panel.length-1],'off');place('vault','panel')");pg.wait_for_timeout(100)
        ok(pg.evaluate("(()=>{const r=[...document.querySelectorAll('#pnl .nv')];const v=r.find(x=>x.textContent.includes('Conduit Vault'));return v&&Math.abs(v.offsetHeight-r[0].offsetHeight)<=1})()"),tag+'Vault row is normal size')
        # settings cannot be hidden
        pg.evaluate("place('settings','off')")
        ok(pg.evaluate("laySlot('settings')!=='off'"),tag+'Settings never lost')
        # arrange sheet
        pg.evaluate("closeCal&&0;goHome()");pg.wait_for_timeout(200);pg.screenshot(path=f'/tmp/home_{w}.png');pg.evaluate("document.querySelector('.dclk').click()");pg.wait_for_timeout(200);ok(pg.evaluate("$('#calsh').classList.contains('on')"),tag+'tap date opens calendar');pg.evaluate("closeCal()")
        pg.evaluate("window.MOCK_APPS=['Google','Facebook','WhatsApp','Instagram','YouTube','Maps','Gmail','Chrome','Spotify','Netflix','Telegram','Uber','Drive','Photos','Calendar','Keep','Zoom','Slack','Reddit','X'].map(n=>({name:n,pkg:'x.'+n,icon:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 10 10\\'><rect width=\\'10\\' height=\\'10\\' fill=\\'hsl('+(n.length*47)+',70%,50%)\\'/></svg>')}));apOpen()");pg.wait_for_timeout(300)
        ok(pg.evaluate("document.querySelectorAll('#apbody .apt').length===20"),tag+'Apps grid lists apps');pg.screenshot(path=f'/tmp/apps_{w}.png');pg.evaluate("apClose()")
        pg.evaluate("document.querySelector('.brand .paw').dispatchEvent(new MouseEvent('click',{bubbles:true}))");pg.wait_for_timeout(200)
        ok(pg.evaluate("document.body.dataset.theme==='generic'"),tag+'paw switches to Generic');pg.evaluate("goHome()");pg.wait_for_timeout(300);pg.screenshot(path=f'/tmp/generic_home_{w}.png')
        pg.evaluate("document.body.classList.add('nav')");pg.screenshot(path=f'/tmp/generic_panel_{w}.png')
        pg.evaluate("document.querySelector('.brand .paw').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        ok(pg.evaluate("document.body.dataset.theme!=='generic'"),tag+'paw switches back')
        pg.evaluate("go('internal')");pg.wait_for_timeout(200)
        ok(pg.evaluate("(()=>{menu(10,10,[['A',[['a1',()=>{}]]],['B',()=>{}]]);document.querySelector('#menu .mi').click();return document.querySelectorAll('#menu .mi').length===2&&document.querySelector('#menu .mi').textContent.startsWith('‹')})()"),tag+'menu cascades open a sub-list')
        pg.evaluate("hideMenu()")
        pg.evaluate("arrOpen()");pg.wait_for_timeout(100)
        ok(pg.evaluate("$('#arr').classList.contains('on')&&document.querySelectorAll('#abody .arow').length>=8"),tag+'Arrange sheet lists items')
        pg.evaluate("document.body.classList.add('nav')")
        pg.screenshot(path=f'/tmp/v0190_{w}.png')
        pg.close()
    b.close()
ok(not errs,'no page errors '+str(errs[:3]))
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
