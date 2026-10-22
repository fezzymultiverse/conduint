"""V0.32.0: Authenticator is 2FA only; show/copy setup key; link check; readable key export/import. Run: python3 tests/v0320.py"""
import http.server, threading, functools, os, json
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
KEY='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':800});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_function("typeof tAuth==='function'");pg.evaluate('askedAll=true')
    pg.evaluate("""async()=>{AU.list=[{type:'totp',issuer:'GitHub',name:'me@x.com',fullname:'Grant F',email:'me@x.com',secret:'%s',link:'github.com',digits:6,period:30,algo:'SHA1'},
      {type:'pass',issuer:'Netflix',name:'me',secret:'hunter2'},{type:'note',issuer:'Secret note',items:[{t:'x',v:'y'}]}];AU.eg=[];await auSave();AU.ready=true;AU.grp='';AU.tab='all';AU.q='';
      window.__c=[];auCopy=(t,m)=>{window.__c.push(t)};document.querySelector('#tools').classList.add('on');await tAuth()}"""%KEY)
    pg.wait_for_timeout(600)
    txt=pg.evaluate("document.querySelector('#tbody').innerText")
    ok('GitHub' in txt and 'Netflix' not in txt and 'Secret note' not in txt,'list shows only the 2FA account (passwords and notes hidden)')
    ok('1 account' in txt,'count says 1 account')
    ok(pg.evaluate("AU.list.length")==3,'hidden entries are still in storage (not deleted)')
    ok(not pg.evaluate("document.querySelector('.autabs:not(.augbar)')"),'no type tabs (Password / Note ...)')
    # menu has no other-type options, has key exports
    pg.evaluate("document.querySelector('.auhead .auicon:last-child').click()");pg.wait_for_timeout(200)
    mt=pg.evaluate("document.querySelector('#menu').innerText")
    ok('Extract from pasted text' not in mt and 'Passkeys' not in mt and 'Profiles view' not in mt,'menu: no pasted-text extract, passkeys or profiles')
    ok('Export setup keys, readable' in mt and 'Export setup keys as links' in mt and 'Restore or import' in mt and 'Back up (encrypted)' in mt,'menu: key export, backup and import present')
    pg.keyboard.press('Escape');pg.evaluate("document.querySelector('#menu').classList.remove('on')")
    # card menu
    pg.evaluate("auMenu(0,document.querySelector('.aumore'))");pg.wait_for_timeout(150)
    mt=pg.evaluate("document.querySelector('#menu').innerText")
    ok('Show setup key' in mt and 'Copy setup key' in mt and 'Copy setup link' in mt,'card menu: show / copy setup key and link')
    pg.evaluate("document.querySelector('#menu').classList.remove('on')")
    pg.evaluate("auCopyKey(AU.list[0])");ok(pg.evaluate("__c.at(-1)")==KEY,'copy setup key gives the raw key')
    pg.evaluate("auCopyLink(AU.list[0])");l=pg.evaluate("__c.at(-1)");ok(l.startswith('otpauth://totp/GitHub:')and 'secret='+KEY in l,'copy setup link gives an otpauth link '+l[:50])
    pg.evaluate("auShowKey(AU.list[0])");pg.wait_for_timeout(200)
    ok(pg.evaluate("document.querySelector('#di').value")=='JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP','show key dialog shows the key in groups of 4')
    pg.evaluate("document.querySelector('#dk').click()");pg.wait_for_timeout(150);ok(pg.evaluate("__c.at(-1)")==KEY,'Copy key button copies it')
    # form: no entry type picker, labels, check link
    pg.evaluate("auOpenForm()");pg.wait_for_timeout(300)
    ft=pg.evaluate("document.querySelector('#tbody').innerText")
    ok('Entry type' not in ft and 'Password' not in ft.split('Details')[0],'form: no entry type picker')
    ok('Platform name' in ft and 'Your name' in ft and 'Account name' in ft and 'Platform link' in ft,'form: platform name, your name, account name, platform link')
    pg.evaluate("AU.form.link='https://www.gitlab.com/users/sign_in'");pg.evaluate("auCheckLink(AU.form,()=>{window.__chk=1})");pg.wait_for_function("window.__chk===1",timeout=9000)
    ok(pg.evaluate("AU.form.link")=='gitlab.com' and pg.evaluate("AU.form.issuer")=='GitLab','Check link: URL cleaned to gitlab.com and platform name filled in as GitLab')
    pg.evaluate("AU.form.issuer='';AU.form.link='codeberg.org';auCheckLink(AU.form,()=>{window.__chk=2})");pg.wait_for_function("window.__chk===2",timeout=9000)
    ok(pg.evaluate("AU.form.issuer")=='Codeberg','Check link: unknown site gets a tidy name (Codeberg)')
    pg.evaluate("AU.form.link='not a link';window.__chk=0;auCheckLink(AU.form,()=>{window.__chk=3})");pg.wait_for_timeout(300)
    ok(pg.evaluate("window.__chk")==0,'Check link: rejects text that is not a website')
    # export keys
    pg.evaluate("window.__out=null;auSaveOut=async(n,t,w,m)=>{window.__out={n,t,w,m};return true};drawAu()")
    pg.evaluate("auExportKeys('json')");pg.wait_for_timeout(200);pg.evaluate("document.querySelector('#dk').click()");pg.wait_for_timeout(300)
    o=pg.evaluate("__out");j=json.loads(o['t'])
    e=j['entries'][0]
    ok(len(j['entries'])==1 and e['key']==KEY and e['platform']=='GitHub' and e['fullname']=='Grant F' and e['link']=='github.com' and 'Netflix' not in o['t'],'readable export: only 2FA, with key, platform, name, email, link')
    pg.evaluate("auExportKeys('txt')");pg.wait_for_timeout(200);pg.evaluate("document.querySelector('#dk').click()");pg.wait_for_timeout(300)
    o=pg.evaluate("__out");ok(o['n'].endswith('.txt') and o['t'].startswith('otpauth://totp/GitHub:') and KEY in o['t'],'links export (.txt) holds the otpauth link with the key')
    # import round trip
    jt=json.dumps(j)
    r=pg.evaluate("async t=>{AU.list=[];const r=await auParseImport(t,'k');return r.items.map(a=>[a.type,a.issuer,a.name,a.fullname,a.email,a.link,a.secret])}",jt)
    ok(r==[['totp','GitHub','me@x.com','Grant F','me@x.com','github.com',KEY]],'import of the readable file restores platform, name, email, link and key '+str(r))
    r=pg.evaluate("async t=>{const r=await auParseImport(t,'k');return r.items.length+'/'+r.bad}",o['t']);ok(r=='1/0','import of the .txt links works')
    r=pg.evaluate("""async()=>{const bw=JSON.stringify({items:[{type:1,name:'Netflix',login:{username:'u',password:'p',totp:null}},{type:1,name:'Site',login:{username:'u',password:'p',totp:'%s'}}]});const r=await auParseImport(bw,'bw');return r.items.map(a=>a.type+':'+a.issuer)}"""%KEY)
    ok(all(x.startswith('totp') for x in r),'importing from another app keeps 2FA codes only '+str(r))
    ok(not errs,'no script errors '+str(errs))
    b.close()
print('FAILED' if fails else 'ALL PASS');raise SystemExit(1 if fails else 0)
