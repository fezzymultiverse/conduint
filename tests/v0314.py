"""V0.31.4: Gallery rows no longer squash (same cause as V0.14.1). Run: python3 tests/v0314.py"""
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
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'{url}');pg.wait_for_timeout(600);pg.evaluate('askedAll=true')
    pg.evaluate("""()=>{const T=__T,add=(p,dir,t)=>{T[p]={dir,size:dir?0:1000+p.length,mtime:t||Date.now()}};
      add('Pictures',true);add('Pictures/Camera',true);const L=[];
      for(let i=0;i<120;i++){const q='Pictures/Camera/p'+i+'.jpg';add(q,false,Date.UTC(2026,9,1+(i%25),12));L.push(q)}
      S.mounts=[{id:'s1',type:'saf',name:'Phone',ic:'folder',uri:'mock-tree',root:'mock:/'}];save();
      window.__cache={};L.forEach(q=>__cache['mock:/'+q]='/pic/'+q)}""")
    pg.evaluate('glOpen()');pg.wait_for_selector('#glbody .glt');pg.wait_for_timeout(500)
    for lay in ['tiny','grid','cards','list']:
        pg.evaluate(f"gsetPut('layout','{lay}');glRedraw()");pg.wait_for_timeout(250)
        r=pg.evaluate("""()=>{const B=document.querySelector('#glbody'),t=[...B.querySelectorAll('.glt')],th=t.map(x=>x.querySelector('.glth')).filter(Boolean);
          const bad=th.filter(x=>{const a=x.getBoundingClientRect();return a.width>2&&Math.abs(a.height-a.width)>2&&!B.classList.contains('l-cards')}).length;
          const clip=t.filter(x=>{const a=x.getBoundingClientRect(),c=x.querySelector('.glth').getBoundingClientRect();return c.bottom>a.bottom+2}).length;
          return{n:t.length,bad,clip,sh:B.scrollHeight,ch:B.clientHeight}}""")
        ok(r['n']>0 and r['bad']==0 and r['clip']==0 and r['sh']>r['ch'],f"{lay}: {r['n']} tiles, squashed={r['bad']}, clipped={r['clip']}, scrolls={r['sh']}>{r['ch']}")
    ok(not errs,'no script errors '+str(errs))
    b.close()
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
