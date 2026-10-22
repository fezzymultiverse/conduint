"""V0.43.0: full contacts editor. Run: python3 tests/v0430.py"""
import http.server, threading, functools, os, json
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
CM="""(()=>{const o=window.Capacitor.registerPlugin;window.__saved=null;
const rows=[{id:'1',raw:'1',name:'Ann Lee',first:'Ann',last:'Lee',starred:true,company:'Acme',phones:[{v:'082 111 2222',t:2,l:''},{v:'021 555 0000',t:1,l:''}],emails:[{v:'ann@x.com',t:2,l:''}],addresses:[{street:'12 Main Rd',city:'Cape Town',t:1,l:''}],events:[{v:'1990-05-17',t:3,l:''}],websites:[],relations:[]},
{id:'2',raw:'2',name:'Bob',phone:'0830000000',email:'',company:'',notes:'old api row'}];
const P={async list(){return{contacts:rows,api:2}},async save(d){window.__saved=d;return{saved:true}},async delete(){return{deleted:true}}};
window.Capacitor.registerPlugin=n=>n==='Contacts'?P:o(n)})();"""
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
CHROME=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(mock);pg.add_init_script(CM)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('dialog',lambda d:(print('DIALOG',d.message),d.accept()))
    pg.goto(url);pg.wait_for_timeout(600)
    pg.evaluate("cndContactsOpen()");pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelectorAll('.cndContactRow').length")==2,'two contacts listed')
    ok('Birthday 17 May 1990' in pg.inner_text('#cndContactList'),'birthday shown in list')
    pg.fill('#cndContacts input[type=search]','0821112222');ok(pg.evaluate("document.querySelectorAll('.cndContactRow').length")==1,'search by digits-only phone')
    pg.fill('#cndContacts input[type=search]','cape town');ok(pg.evaluate("document.querySelectorAll('.cndContactRow').length")==1,'search by address city')
    pg.fill('#cndContacts input[type=search]','')
    pg.click('.cndChips button:nth-child(3)');ok(pg.evaluate("document.querySelectorAll('.cndContactRow').length")==1,'birthdays filter')
    pg.click('.cndChips button:nth-child(1)')
    pg.click('.cndContactRow button');pg.wait_for_timeout(200)
    ok(pg.evaluate("document.querySelectorAll('#cndContactList .cndRow select').length")>=4,'edit form has phone/email/date rows')
    ok(pg.evaluate("document.querySelector('[name=first]').value")=='Ann','first name loaded')
    pg.screenshot(path='/home/claude/edit1.png')
    pg.click('text=+ Add phone');pg.click('text=+ Add address');pg.click('text=+ Add date');pg.click('text=+ Add website');pg.click('text=+ Add related person')
    pg.evaluate("document.querySelectorAll('#cndContactList .cndRow input[type=tel]')[2].value='0845550000'")
    pg.screenshot(path='/home/claude/edit2.png',full_page=False)
    pg.click('text=Save contact');pg.wait_for_timeout(300)
    d=pg.evaluate("window.__saved")
    ok(d and d['first']=='Ann' and len(d['phones'])==3 and d['phones'][2]['v']=='0845550000','phones saved incl. new row')
    ok(d['events'][0]['v']=='1990-05-17' and d['events'][0]['t']==3,'birthday round-trips')
    ok(d['addresses'][0]['city']=='Cape Town' and len(d['addresses'])==1,'empty address row dropped, real one kept')
    ok(d['starred']is True,'favourite flag sent')
    pg.evaluate("cndContactsOpen()");pg.wait_for_timeout(200)
    pg.locator('.cndContactRow button').nth(1).click();pg.wait_for_timeout(200)
    ok(pg.evaluate("document.querySelector('[name=first]').value")=='Bob','legacy row maps name->first')
    ok(pg.evaluate("document.querySelectorAll('#cndContactList input[type=tel]')[0].value")=='0830000000','legacy phone mapped')
    ok(not errs,'no page errors '+str(errs))
    b.close()
print('FAILS',len(fails));raise SystemExit(1 if fails else 0)
