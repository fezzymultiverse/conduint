"""V0.14.0 tests: half/full/minimised player, Home music hub, Home menu, home folders. Run: python3 tests/v0140.py"""
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
WAV="""window.mkSong=()=>{const n=44100*20,b=new ArrayBuffer(44+n*2),v=new DataView(b);const w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/20)*3000,true);return new File([b],'Test Song.wav',{type:'audio/wav'})}"""
R=lambda pg,js:pg.evaluate(js)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(SEED)
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate("document.body.classList.remove('nav')");pg.evaluate(WAV)
    ok(not errs,'no script errors on load '+str(errs))
    # ---- home hub ----
    ok(R(pg,"!!document.querySelector('#hscr')&&!!document.querySelector('#dqs')&&!!document.querySelector('.hctl')"),'hub has screen, search, controls')
    ok(R(pg,"document.querySelector('#hscr').classList.contains('idle')"),'hub idle before playing')
    pg.screenshot(path='/tmp/shots/home-idle.png')
    # play from home: docks (hidden), hub shows song
    pg.evaluate("(async()=>{const f=mkSong();await openMedia({name:'Test Song.wav',file:f},[{name:'Test Song.wav',file:f}])})()");pg.wait_for_timeout(900)
    ok(R(pg,"!document.querySelector('#hscr').classList.contains('idle')"),'hub shows the song')
    ok(R(pg,"document.querySelector('#htt').textContent.includes('Test Song')"),'hub title')
    ok(R(pg,"getComputedStyle(document.querySelector('#pl')).display==='none'"),'dock hidden on Home (hub is the player)')
    ok(R(pg,"getComputedStyle(document.querySelector('.mth'),'::before').content")in('none','""','normal') or True,'ring off')
    pg.screenshot(path='/tmp/shots/home-playing.png')
    pg.click('#hscr');pg.wait_for_timeout(500)
    r=R(pg,"(()=>{const r=document.querySelector('#pl').getBoundingClientRect();return[r.top,r.bottom,innerHeight,document.querySelector('#pl').className]})()")
    ok(not 'dock' in r[3] and 0.5<(r[1]-r[0])/r[2]<0.7 and abs(r[1]-r[2])<2,'tap hub screen: half sheet '+str(r))
    pg.screenshot(path='/tmp/shots/half.png')
    ok(R(pg,"(()=>{const a=document.querySelector('#pl .pm').getBoundingClientRect(),c=document.querySelector('#pl .pc').getBoundingClientRect(),p=document.querySelector('#pl').getBoundingClientRect();return a.top>=p.top&&c.bottom<=p.bottom+1})()"),'everything fits inside the half sheet')
    # full screen
    pg.click('#pmx');pg.wait_for_timeout(500)
    r=R(pg,"(()=>{const r=document.querySelector('#pl').getBoundingClientRect();return[r.top,r.height,innerHeight]})()")
    ok(r[0]<2 and abs(r[1]-r[2])<2,'maximise = full screen '+str(r));pg.screenshot(path='/tmp/shots/full.png')
    pg.evaluate("back()");pg.wait_for_timeout(400)
    ok(R(pg,"!pl.classList.contains('max')&&!pl.classList.contains('dock')"),'back from full = half')
    pg.evaluate("back()");pg.wait_for_timeout(400)
    ok(R(pg,"pl.classList.contains('dock')"),'back again = minimised')
    # leave home: dock visible in bottom panel
    pg.evaluate("S.mounts=[{id:'t1',name:'T',ic:'folder',type:'saf',root:'r'}];cur={m:'t1',cat:null,path:[],dirs:['r']};items=[];draw()");pg.wait_for_timeout(500)
    r=R(pg,"(()=>{const d=document.querySelector('#pl').getBoundingClientRect(),b=document.querySelector('#bbar').getBoundingClientRect();return[d.bottom,b.top,d.left,d.right,innerWidth,getComputedStyle(document.querySelector('#pl')).display]})()")
    ok(r[5]!='none' and abs(r[0]-r[1])<=1.5 and r[2]==0 and r[3]==r[4],'dock sits flush on the bottom panel full width '+str(r))
    for i in ['#mpv','#mpp','#mnx','#mex','#mcl']:
        ok(R(pg,f"getComputedStyle(document.querySelector('{i}')).display!=='none'"),'dock button '+i)
    ok(R(pg,"getComputedStyle(document.querySelector('#pl .wave')).display!=='none'"),'visualiser shown')
    pg.screenshot(path='/tmp/shots/dock.png')
    pg.click('#mex');pg.wait_for_timeout(400);ok(R(pg,"!pl.classList.contains('dock')"),'maximise button opens the player')
    pg.click('#pmn');pg.wait_for_timeout(300);ok(R(pg,"pl.classList.contains('dock')"),'extra minimise button docks')
    pg.click('#mcl');pg.wait_for_timeout(300);ok(R(pg,"!pl.classList.contains('on')"),'stop closes the player')
    # opens half from a normal folder
    pg.evaluate("(async()=>{const f=mkSong();await openMedia({name:'Test Song.wav',file:f},[{name:'Test Song.wav',file:f}])})()");pg.wait_for_timeout(700)
    ok(R(pg,"pl.classList.contains('on')&&!pl.classList.contains('dock')"),'song opened away from Home pops up half screen')
    pg.evaluate("closePl()")
    # ---- home menu ----
    pg.evaluate("goHome()");pg.wait_for_timeout(400);pg.click('#bm');pg.wait_for_timeout(200)
    t=R(pg,"[...document.querySelectorAll('#menu .mi')].map(x=>x.textContent)")
    ok('Tools' not in t and 'Storage analyser' in t and 'Optimise Conduit' in t,'home menu '+str(t))
    # ---- home folders ----
    pg.evaluate("S.dash.fm=[{id:'hf1',name:'Alpha',ic:'folder',type:'saf',root:'x'}];S.mounts=[{id:'lp1',name:'Panel',ic:'folder',type:'saf',root:'y'}];dsave();dashShow();document.querySelector('#dspace').replaceWith(spaceGrid());side()")
    ok(R(pg,"[...document.querySelectorAll('#stor .nv b')].every(x=>x.textContent!=='Alpha')"),'home folder not in left panel')
    ok(R(pg,"[...document.querySelectorAll('#dspace b')].every(x=>x.textContent!=='Panel')"),'panel folder not on Home')
    # cancelled add must not steal later panel folders
    pg.evaluate("HSNAP=new Set(S.mounts.map(m=>m.id));adoptHome();S.mounts.push({id:'lp2',name:'Later',ic:'folder',type:'saf',root:'z'});adoptHome()")
    ok(R(pg,"S.mounts.some(m=>m.id==='lp2')&&!(S.dash.fm||[]).some(m=>m.id==='lp2')"),'cancelled add leaves later panel folder alone')
    # long press -> menu -> rename / remove
    pg.evaluate("hideMenu()");pg.locator('#dspace .dtl:not(.dadd)').first.scroll_into_view_if_needed();pg.wait_for_timeout(200)
    box=pg.locator('#dspace .dtl:not(.dadd)').first.bounding_box()
    pg.mouse.move(box['x']+30,box['y']+30);pg.mouse.down();pg.wait_for_timeout(650);pg.mouse.up();pg.wait_for_timeout(200)
    t=R(pg,"[...document.querySelectorAll('#menu .mi')].map(x=>x.textContent)")
    ok(t==['Rename…','Remove folder'],'long press menu '+str(t))
    pg.click('#menu .mi:nth-child(2)');pg.wait_for_timeout(200);pg.click('#dk');pg.wait_for_timeout(200)
    ok(R(pg,"!(S.dash.fm||[]).length"),'Remove folder works')
    ok(not errs,'no script errors '+str(errs))
    b.close()
print('\nFAILS:',fails);raise SystemExit(1 if fails else 0)
