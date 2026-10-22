"""V0.19.1 music/video routing: songs play on the Home hub with no sheet or bar, the hub opens the full player, Back hides it, video keeps its own sheet.
Run: python3 tests/v0191music.py"""
import http.server, threading, functools, os, tempfile
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots=os.environ.get('SHOTS',tempfile.gettempdir())
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
SEED="if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'"
chrome=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=chrome,args=['--no-sandbox']) if os.path.exists(chrome) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':411,'height':860});pg.add_init_script(mock);pg.add_init_script(SEED)
    pg.on('pageerror',lambda e:'BRW.scripts' not in str(e) and errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html');pg.evaluate('askedAll=true')
    pg.evaluate("window.__t=[];new MutationObserver(()=>__t.push($('#toast').textContent)).observe($('#toast'),{childList:true,characterData:true,subtree:true})")
    pg.evaluate("(()=>{connectSaf('phone','Phone','folder',null)})()");pg.wait_for_selector('#list .it');pg.evaluate("document.body.classList.remove('nav')")
    pg.locator('#list .it',has=pg.locator('.nm',has_text='Music')).first.click();pg.wait_for_selector('#list .it .nm:text("song.mp3")')
    pg.locator('#list .it',has=pg.locator('.nm',has_text='song.mp3')).first.click();pg.wait_for_timeout(500)
    vis=lambda:pg.evaluate("getComputedStyle($('#pl')).display!=='none'&&$('#pl').getBoundingClientRect().height>0")
    ok(pg.evaluate("pl.classList.contains('on')&&pl.classList.contains('k-aud')&&pl.classList.contains('dock')"),'song starts in the engine, hidden')
    ok(not vis(),'no player sheet or bottom bar for a song')
    ok(not pg.evaluate("document.body.classList.contains('pon')"),'no extra bottom padding for a bar that is not there')
    ok('Playing on Home' in pg.evaluate('__t'),'toast says Playing on Home')
    pg.screenshot(path=os.path.join(shots,'v0191_song_in_folder.png'))
    pg.evaluate("goHome()");pg.wait_for_timeout(500)
    ok(pg.evaluate("!$('#hscr').classList.contains('idle')"),'Home hub shows the song as playing')
    pg.screenshot(path=os.path.join(shots,'v0191_home_hub.png'))
    pg.evaluate("$('#hmax').click()");pg.wait_for_timeout(300)
    ok(vis() and pg.evaluate("pl.classList.contains('k-aud')"),'hub open-player button shows the full player')
    pg.screenshot(path=os.path.join(shots,'v0191_full_player.png'))
    ok(pg.evaluate("back()")==1 and not vis(),'Back hides the full player, nothing minimised')
    ok(pg.evaluate("pl.classList.contains('on')"),'music engine still on after hide')
    pg.evaluate("openMedia({name:'clip.mp4',uri:'mock://clip.mp4',size:9},[{name:'clip.mp4',uri:'mock://clip.mp4',size:9}])");pg.wait_for_timeout(500)
    ok(vis() and pg.evaluate("pl.classList.contains('k-vid')"),'video opens its own sheet')
    ok(pg.evaluate("getComputedStyle($('#pmn')).display")=='none','video sheet has no hide/minimise button')
    pg.screenshot(path=os.path.join(shots,'v0191_video_sheet.png'))
    ok(pg.evaluate('back()')==1 and not pg.evaluate("pl.classList.contains('on')"),'Back closes the video sheet')
    b.close()
ok(not errs,'no page errors '+str(errs[:3]))
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
