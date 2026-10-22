"""V0.50.3: Internal storage and Downloads can be added to the left panel (they stay fixed Home tiles). Off by default; Panel / Hide in Arrange;
long-press the Home tile > Add to / Remove from left panel; never in the Home list; counts toward the 14; survives an old layout and a fresh one."""
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
    pnl=lambda:pg.evaluate("document.querySelector('#pnl').textContent")
    # default: off
    pg.evaluate("S.lay=null;layNorm();side()")
    ok(pg.evaluate("catalog().some(x=>x.id==='slot:internal')&&catalog().some(x=>x.id==='slot:downloads')"),'both are in the placeable list again')
    ok(pg.evaluate("S.lay.panel.every(i=>i!=='slot:internal'&&i!=='slot:downloads')"),'fresh layout: neither is in the left panel by default')
    ok('Internal' not in pnl() and 'Downloads' not in pnl(),'left panel does not show them until you add them')
    # existing layout (no knowledge of them): still off
    r=pg.evaluate("()=>{S.lay={v:2,panel:['slot:mydocs'],home:[],seen:[]};const y=layNorm();return [y.panel.includes('slot:internal'),y.panel.includes('slot:downloads'),y.home.includes('slot:internal'),y.home.includes('slot:downloads')]}")
    ok(r==[False,False,False,False],'an existing layout is not changed by the update '+str(r))
    # add via place()
    ok(pg.evaluate("place('slot:internal','panel')")==True,'place(internal, panel) works')
    ok(pg.evaluate("place('slot:downloads','panel')")==True,'place(downloads, panel) works')
    pg.wait_for_timeout(100)
    t=pnl();ok('Internal storage' in t or 'Internal Storage' in t,'Internal storage shows in the left panel');ok('Downloads' in t,'Downloads shows in the left panel')
    ok(pg.evaluate("laySlot('slot:internal')")=='panel','laySlot says panel')
    # they never go to the Home list; Home tiles stay
    ok(pg.evaluate("place('slot:internal','home')")==False,'place(internal, home) is refused')
    ok(pg.evaluate("layNorm().home.every(i=>!i.startsWith('slot:internal')&&!i.startsWith('slot:downloads'))"),'Home list never holds them')
    pg.evaluate("goHome()");pg.wait_for_timeout(250)
    tiles=pg.inner_text('#dfiles')
    ok('Internal Storage' in tiles and 'Downloads' in tiles,'the fixed Home tiles are still there')
    # Hide takes it out of the panel only
    pg.evaluate("place('slot:downloads','off')");pg.wait_for_timeout(100)
    ok('Downloads' not in pnl() and 'Internal' in pnl(),'Hide removes just that one from the panel')
    ok('Downloads' in pg.inner_text('#dfiles'),'the Downloads Home tile stays after Hide')
    # counts toward 14
    pg.evaluate("()=>{for(let i=0;i<14;i++)S.mounts.push({id:'t'+i,type:'saf',name:'Folder '+i,ic:'folder',uri:'content://x/'+i,root:'content://x/'+i});S.lay={v:2,panel:[],home:[],seen:[]};layNorm();const y=S.lay;y.panel=[];for(let i=0;i<14;i++)y.panel.push('m:t'+i);y.seen=catalog().map(x=>x.id)}")
    ok(pg.evaluate("place('slot:internal','panel')")==False,'with 14 in the panel, adding Internal storage is refused (counts toward 14)')
    ok(pg.evaluate("layNorm().panel.length")==14,'panel stays at 14')
    # long-press Home tiles: menu lines
    pg.evaluate("S.mounts=S.mounts.filter(m=>!m.id.startsWith('t'));S.lay=null;layNorm();layRefresh()");pg.wait_for_timeout(150)
    for slot,label in (('internal','Add to left panel'),('downloads','Add to left panel')):
        pg.evaluate("document.querySelector('#menu')&&document.querySelector('#menu').classList.remove('on')")
        pg.evaluate("""(s)=>{const t=document.querySelector('#dfiles [data-slot="'+s+'"]');const r=t.getBoundingClientRect();t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))}""",slot)
        pg.wait_for_selector('#menu.on',timeout=3000)
        ok(label in pg.inner_text('#menu'),f'long-press {slot} tile shows "{label}"')
        pg.evaluate("[...document.querySelectorAll('#menu button, #menu .mi, #menu div')].find(e=>e.textContent.trim()==='Add to left panel').click()");pg.wait_for_timeout(150)
    ok('Downloads' in pnl() and ('Internal' in pnl()),'both added from the Home tile menus')
    pg.evaluate("document.querySelector('#menu')&&document.querySelector('#menu').classList.remove('on')")
    pg.evaluate("""()=>{const t=document.querySelector('#dfiles [data-slot="downloads"]');const r=t.getBoundingClientRect();t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))}""")
    pg.wait_for_selector('#menu.on',timeout=3000)
    ok('Remove from left panel' in pg.inner_text('#menu'),'once added, the menu says Remove from left panel')
    pg.evaluate("document.querySelector('#menu').classList.remove('on')")
    # Arrange sheet
    pg.evaluate("arrOpen()");pg.wait_for_timeout(150)
    at=pg.inner_text('#abody')
    ok('always stay as tiles on Home' in at,'Arrange explains the two fixed tiles')
    rows=pg.evaluate("""()=>[...document.querySelectorAll('#abody .arow')].map(r=>[r.querySelector('.anm').textContent,[...r.querySelectorAll('.ctl .chip')].map(c=>c.textContent)])""")
    ir=[r for r in rows if 'Internal' in r[0]]
    ok(bool(ir) and 'Home' not in ir[0][1] and 'Hide' in ir[0][1],'Internal storage row has Hide but no Home chip '+str(ir))
    pg.evaluate("document.querySelector('#arr').classList.remove('on')")
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('ALL PASS' if not fails else 'FAILED: '+str(fails))
sys.exit(1 if fails else 0)
