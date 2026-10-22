"""V0.49.0: backup & restore round trip (settings, notes, browser, shield, Password Manager records), wrong passphrase, damaged file, merge, undo copy, Settings rows."""
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
    pg=b.new_page(viewport={'width':412,'height':860});pg.add_init_script(mock);pg.add_init_script("localStorage['cnd.auth.prof']='0'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.evaluate('askedAll=true');pg.evaluate("document.querySelector('#perm')&&document.querySelector('#perm').classList.remove('on')");pg.wait_for_timeout(900)
    ok(pg.evaluate("typeof bkBuild==='function'&&typeof bkRestoreData==='function'"),'backup.js loaded')
    # seed state
    pg.evaluate("""()=>{S.settings.theme='ember';S.settings.tile=150;S.labels={songs:'My Tunes'};S.colors={x:'#ff005f'};
      localStorage.setItem('conduint.notes.v1',JSON.stringify({v:1,notes:[{id:'n1',t:'Secret note SECRETWORD'}]}));
      localStorage.setItem('conduint.browser.v1',JSON.stringify({bm:[{u:'https://example.org'}]}));
      localStorage.setItem('cnd.shield.on','0');save()}""")
    # seed Password Manager records
    pg.evaluate("""async()=>{const db=await pmdb();await new Promise((res,rej)=>{const tx=db.transaction(['meta','recs','chunks'],'readwrite');
      tx.objectStore('meta').put({email:'a@b.c',s:'AAAA',n:600000},'hdr');tx.objectStore('recs').put({t:'i',d:new Uint8Array([1,2,3,250,251])},'rec1');tx.objectStore('chunks').put(new Uint8Array([9,8,7]).buffer,'c1');
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}""")
    ids="['settings','notes','browser','shield','pm','vpn','auth']"
    r=pg.evaluate("(async()=>{const r=await bkBuild("+ids+",'correct horse battery');window.__bk=r.text;return{secs:r.secs,skipped:r.skipped.map(x=>x[0])}})()")
    ok(set(r['secs'])>={'settings','notes','browser','shield','pm'},'built parts: '+str(r['secs']))
    ok(('vpn' in r['skipped'])!=('vpn' in r['secs']),'VPN part is either packed or skipped with a reason')
    txt=pg.evaluate('window.__bk')
    ok('SECRETWORD' not in txt and 'ember' not in txt and 'a@b.c' not in txt,'file holds no plaintext')
    ok(pg.evaluate("bkHead(window.__bk).secs.includes('pm')"),'header lists parts')
    # wrong passphrase / damaged / foreign
    e1=pg.evaluate("bkOpen(window.__bk,'nope nope nope').then(()=>'', e=>e.message)");ok('Wrong passphrase' in e1,'wrong passphrase refused')
    e2=pg.evaluate("bkOpen(window.__bk.slice(0,-40),'correct horse battery').then(()=>'', e=>e.message)");ok(e2!='','damaged file refused: '+e2)
    e3=pg.evaluate("Promise.resolve().then(()=>bkHead('{\"app\":\"other\"}')).then(()=>'', e=>e.message)");ok('not a Conduint' in e3,'foreign file refused')
    # change everything, then restore (replace)
    pg.evaluate("""async()=>{S.settings.theme='noir';S.settings.tile=99;S.labels={};localStorage.removeItem('conduint.browser.v1');localStorage.setItem('cnd.shield.on','1');
      localStorage.setItem('conduint.notes.v1',JSON.stringify({v:1,notes:[{id:'n2',t:'other'}]}));
      const db=await pmdb();await new Promise((res,rej)=>{const tx=db.transaction(['meta','recs','chunks'],'readwrite');tx.objectStore('meta').clear();tx.objectStore('recs').clear();tx.objectStore('chunks').clear();tx.oncomplete=res})}""")
    res=pg.evaluate("(async()=>{const d=await bkOpen(window.__bk,'correct horse battery');const m={settings:'replace',notes:'merge',browser:'replace',shield:'replace',pm:'replace'};return await bkRestoreData(d,['settings','notes','browser','shield','pm'],m)})()")
    ok(all(x[1] for x in res),'restore applied: '+str([x[2][:30] for x in res]))
    ok(pg.evaluate("S.settings.theme==='ember'&&S.settings.tile===150&&S.labels.songs==='My Tunes'&&S.colors.x==='#ff005f'"),'settings restored')
    ok(pg.evaluate("JSON.parse(localStorage.getItem('conduint.browser.v1')).bm[0].u")=='https://example.org','browser restored')
    ok(pg.evaluate("localStorage.getItem('cnd.shield.on')")=='0','shield restored')
    ok(pg.evaluate("JSON.parse(localStorage.getItem('conduint.notes.v1')).notes.map(n=>n.id).sort().join()")=='n1,n2','notes merged (kept n2, added n1)')
    pm=pg.evaluate("""async()=>{const d=await bkDump(pmdb(),['meta','recs','chunks']);return{h:d.meta.find(x=>x[0]==='hdr')[1].email,r:Array.from(d.recs[0][1].d).join(),c:Array.from(new Uint8Array(d.chunks[0][1])).join(),k:d.recs[0][0]}}""")
    ok(pm=={'h':'a@b.c','r':'1,2,3,250,251','c':'9,8,7','k':'rec1'},'Password Manager records restored byte for byte '+str(pm))
    # undo copy store
    ok(pg.evaluate("(async()=>{await bkSnapPut('hello-snap');return (await bkSnapGet())==='hello-snap'&&!!localStorage.getItem('cnd.bk.undo')})()"),'undo copy stored and read back')
    # Settings rows
    pg.evaluate("openSet()");pg.wait_for_timeout(300)
    t=pg.inner_text('#sbody')
    ok('Backup & restore' in t and 'Export' in t and 'Restore' in t and 'Undo the last restore' in t,'Settings shows Backup & restore')
    pg.locator('#sbody .row',has_text='Export settings').locator('button').click();pg.wait_for_selector('#bkp.on')
    ok(pg.locator('#bkp .row').count()==len(pg.evaluate('BKS')),'export sheet lists every part')
    z=pg.evaluate("+getComputedStyle(document.querySelector('#bkp')).zIndex>+getComputedStyle(document.querySelector('#set')).zIndex")
    ok(z,'sheet sits above Settings')
    b.close()
real=[e for e in errs if 'favicon' not in e]
ok(not real,'no page errors '+str(real[:3]))
print('FAILS',len(fails));sys.exit(1 if fails else 0)
