"""V0.28.6 tests: Authenticator encrypted CSV export (password + this phone), restore from both, list view.
Run: python3 tests/v0286.py   (needs `pip install playwright` and a Chromium)"""
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
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION','ERR_TUNNEL')
SEED="""async()=>{
 AU.list=[
  {type:'totp',issuer:'GitHub',name:'fezzy@example.com',secret:'JBSWY3DPEHPK3PXP',digits:6,period:30,algo:'SHA1',link:'github.com',group:'Dev'},
  {type:'totp',issuer:'Big, "Quoted" Co',name:'a@b.c',secret:'JBSWY3DPEHPK3PXP',digits:8,period:60,algo:'SHA256',link:''},
  {type:'pass',issuer:'Bank',name:'grant',email:'g@x.com',secret:'p@ss,"w\\nord',link:'https://bank.example',note:'line1\\nline2'},
  {type:'bak',issuer:'GitLab',items:[{t:'',v:'a1b2c3d4e5',u:0},{t:'',v:'f6g7h8i9j0',u:1},{t:'',v:'k1l2m3n4o5',u:0}]},
  {type:'ssh',issuer:'Server',items:[{t:'laptop',pub:'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAbcdefghijklmnop laptop',prv:''}]},
  {type:'note',issuer:'Wifi',items:[{t:'',v:'router password is hunter2'}]}
 ];
 AU.list.forEach(a=>{if(['bak','ssh','note'].includes(a.type))auxSync(a)});
 AU.eg=[];await auSave();AU.ready=true;AU.grp='';AU.tab='all';await tAuth()}"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock);pg.add_init_script("localStorage.setItem('cnd.auth.prof','0')");pg.add_init_script("localStorage['cnd.auth.prof']='0'")
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("/^V0\\.(28|29|3\\d)\\.\\d+$/.test(VER)"),'version is V0.28.x or V0.29.x or V0.29.x')
    pg.evaluate("openTools()");pg.wait_for_timeout(300)
    pg.evaluate(SEED);pg.wait_for_timeout(500)
    ok(not errs,'no script errors after seeding '+str(errs))
    # ---- list view is the default
    ok(pg.evaluate("auViewGet()")=='list' and pg.locator('.aurow').count()==6 and pg.locator('.aucard').count()==0,'list view is the default: 6 rows, no cards')
    pg.wait_for_timeout(700)
    code=pg.locator('.aurow-totp .aurc').first.inner_text()
    ok(len(code.replace(' ',''))in(6,8) and code.replace(' ','').isdigit(),'2FA row shows a live code: '+code)
    ok(pg.locator('.aurow-totp .aurbar').count()==2,'2FA rows carry a timer bar')
    ok('left' in pg.locator('.aurow-bak .aurs').inner_text() and pg.locator('.aurow-bak .aurc').inner_text()=='2/3','backup codes row shows codes left 2/3')
    pg.screenshot(path='/tmp/claude-0/-home-claude/40acc2f9-c9eb-568c-be4f-62fb35dbb95a/scratchpad/list.png')
    hd=pg.evaluate("()=>{const t=document.querySelector('.auhead');return [...t.children].map(e=>Math.round(e.getBoundingClientRect().width))}")
    ok(all(w>0 for w in hd) and hd[0]>=90,'header title keeps room beside the icons '+str(hd))
    # ---- copy on tap
    pg.evaluate("()=>{window.__cp=null;auCopy=(t,m)=>{window.__cp=t}}")
    pg.locator('.aurow-pass').click();pg.wait_for_timeout(100)
    ok(pg.evaluate("window.__cp")=='p@ss,"w\nord','tapping a password row copies the password')
    # ---- toggle to cards and back
    pg.locator('.auhead .auicon').first.click();pg.wait_for_timeout(300)
    ok(pg.evaluate("auViewGet()")=='card' and pg.locator('.aucard').count()==6 and pg.locator('.aurow').count()==0,'toggle switches to card view')
    pg.screenshot(path='/tmp/claude-0/-home-claude/40acc2f9-c9eb-568c-be4f-62fb35dbb95a/scratchpad/card.png')
    pg.locator('.auhead .auicon').first.click();pg.wait_for_timeout(300)
    ok(pg.evaluate("auViewGet()")=='list' and pg.locator('.aurow').count()==6,'toggle switches back to list')
    # ---- the menu offers both exports
    pg.evaluate("()=>{const m=[...document.querySelectorAll('.auhead .auicon')].pop();m.click()}");pg.wait_for_timeout(200)
    mt=pg.locator('#menu .mi').all_inner_texts()
    ok(any('Export CSV, password' in t for t in mt) and any('Export CSV, no password' in t for t in mt) and any('Card view' in t for t in mt),'menu lists both CSV exports and the view switch')
    pg.keyboard.press('Escape');pg.evaluate("hideMenu()")
    # ---- CSV content
    csv=pg.evaluate("auCsvBuild(AU.list)")
    rows=pg.evaluate("t=>auCsv(t)",csv)
    ok(rows[0]==['folder','favorite','type','name','notes','fields','reprompt','login_uri','login_username','login_password','login_totp'],'CSV header is the Bitwarden layout')
    ok(len(rows)==7,'one CSV row per account (6) + header, quotes and newlines survive parsing: %d'%len(rows))
    pw=[r for r in rows if r[3]=='Bank'][0]
    ok(pw[9]=='p@ss,"w\nord' and pw[4]=='line1\nline2' and pw[8]=='grant' and pw[7]=='https://bank.example','password row keeps comma, quote, newline, notes, user and site')
    gh=[r for r in rows if r[3]=='GitHub'][0]
    ok(gh[0]=='Dev' and gh[10].startswith('otpauth://totp/GitHub:') and 'secret=JBSWY3DPEHPK3PXP' in gh[10] and 'period=30' in gh[10],'2FA row carries an otpauth link and the group as folder')
    # ---- encrypted: password
    sealed=pg.evaluate("async()=>auCsvSeal(auCsvBuild(AU.list),'pass',6,'correct horse battery')")
    o=json.loads(sealed)
    ok(o['app']=='conduint-auth-csv' and o['mode']=='pass' and o['kdf']=='PBKDF2-SHA256' and o['iter']>=300000,'password file declares AES via PBKDF2 container')
    ok('JBSWY3DPEHPK3PXP' not in sealed and 'GitHub' not in sealed and 'hunter2' not in sealed and 'bank.example' not in sealed,'password file holds no readable account data')
    back=pg.evaluate("async s=>auCsvOpen(s,'correct horse battery')",sealed)
    ok(back==csv,'right passphrase returns the exact CSV')
    bad=pg.evaluate("async s=>{try{await auCsvOpen(s,'wrong passphrase');return 'opened'}catch(e){return e.message}}",sealed)
    ok('Wrong passphrase' in bad,'wrong passphrase is refused: '+bad)
    tam=json.loads(sealed);tam['ct']=tam['ct'][:-6]+('AAAAAA' if tam['ct'][-6:]!='AAAAAA' else 'BBBBBB')
    bad=pg.evaluate("async s=>{try{await auCsvOpen(s,'correct horse battery');return 'opened'}catch(e){return e.message}}",json.dumps(tam))
    ok('Wrong passphrase' in bad,'a tampered file is refused (GCM tag)')
    # ---- encrypted: this phone
    sealed2=pg.evaluate("async()=>auCsvSeal(auCsvBuild(AU.list),'phone',6,'')")
    o2=json.loads(sealed2)
    ok(o2['mode']=='phone' and 'salt' not in o2 and 'JBSWY3DPEHPK3PXP' not in sealed2 and 'GitHub' not in sealed2,'no-password file is still ciphertext, no readable data')
    ok(pg.evaluate("async s=>auCsvOpen(s,'')",sealed2)==csv,'this phone opens its own no-password file')
    ok(sealed!=sealed2 and json.loads(pg.evaluate("async()=>auCsvSeal('x','phone',1,'')"))['iv']!=o2['iv'],'every export uses a fresh IV')
    # ---- the export flow end to end (saved file content)
    pg.evaluate("""()=>{window.__out=null;auSaveOut=async(n,t,w)=>{window.__out={n,t,w};return true};window.__asked=[];
      auAskPass=async(t,m,ok)=>{window.__asked.push(t);return 'my long passphrase'};}""")
    pg.evaluate("auExportCsv('pass')");pg.wait_for_timeout(2500)
    out=pg.evaluate("window.__out")
    ok(out and out['n'].startswith('conduint-authenticator-csv-password-') and out['n'].endswith('.json') and json.loads(out['t'])['mode']=='pass','password export writes an encrypted file: '+(out['n'] if out else 'none'))
    ok(pg.evaluate("window.__asked.length")==2,'password export asks twice (confirm)')
    pg.evaluate("window.__out=null;window.__asked=[];auAskPass=async()=>{window.__asked.push(1);return window.__asked.length==1?'my long passphrase':'different one'};0")
    pg.evaluate("auExportCsv('pass')");pg.wait_for_timeout(600)
    ok(pg.evaluate("window.__out")is None,'mismatched confirmation exports nothing')
    pg.evaluate("window.__out=null;auAskPass=async()=>'short';0");pg.evaluate("auExportCsv('pass')");pg.wait_for_timeout(500)
    ok(pg.evaluate("window.__out")is None,'passphrase under 8 characters exports nothing')
    pg.evaluate("window.__out=null;window.__dlgs=[];dlg=async o=>{window.__dlgs.push(o.msg);return {v:''}};0")
    pg.evaluate("auExportCsv('phone')");pg.wait_for_timeout(2500)
    out=pg.evaluate("window.__out")
    ok(out and json.loads(out['t'])['mode']=='phone' and 'only conduint on this phone' in pg.evaluate("window.__dlgs[0]").lower(),'no-password export warns, then writes an encrypted file')
    pg.evaluate("window.__out=null;dlg=async()=>null;0");pg.evaluate("auExportCsv('phone')");pg.wait_for_timeout(500)
    ok(pg.evaluate("window.__out")is None,'declining the warning exports nothing')
    # ---- restore: both files come back through the importer
    for label,sl,pwd in (('password',sealed,'correct horse battery'),('this phone',sealed2,'')):
        r=pg.evaluate("""async([s,pw])=>{
          const csv=await auCsvOpen(s,pw),keep=AU.list;AU.list=[];const r=await auParseImport(csv,'Imported');AU.list=keep;const by=t=>r.items.filter(e=>e.type===t);
          const gh=r.items.find(e=>e.type==='totp'&&e.issuer==='GitHub'),q=r.items.find(e=>e.type==='totp'&&/Quoted/.test(e.issuer)),bk=by('bak')[0];
          return {n:r.items.length,bad:r.bad,pass:by('pass').map(e=>[e.issuer,e.secret,e.name,e.note,e.link]),gh:gh&&[gh.secret,gh.digits,gh.period,gh.algo,gh.group],
           q:q&&[q.secret,q.digits,q.period,q.algo,q.issuer],bak:bk?auxItems(bk).map(i=>i.v):[],ssh:by('ssh').length,note:by('note').map(e=>e.issuer)}}""",[sl,pwd])
        ok(r['bad']==0,label+': restore skips nothing')
        ok(r['pass']==[['Bank','p@ss,"w\nord','grant','line1\nline2\nEmail: g@x.com','https://bank.example']],label+': password round-trips exactly '+str(r['pass']))
        ok(r['gh']==['JBSWY3DPEHPK3PXP',6,30,'SHA1','Dev'],label+': GitHub 2FA keeps secret, digits, period, algorithm, group '+str(r['gh']))
        ok(r['q']==['JBSWY3DPEHPK3PXP',8,60,'SHA256','Big, "Quoted" Co'],label+': 2FA with odd name keeps 8 digits, 60 s, SHA-256 '+str(r['q']))
        ok(set(['a1b2c3d4e5','f6g7h8i9j0','k1l2m3n4o5'])<=set(r['bak']),label+': backup codes come back '+str(r['bak']))
        ok(r['ssh']>=1,label+': SSH key comes back')
    # ---- import flow detects the encrypted CSV
    pg.evaluate("window.__imp=null")
    ok(pg.evaluate("auImport.toString().includes('conduint-auth-csv')"),'import screen recognises the encrypted CSV')
    b.close()
print('\nFAILED: '+str(fails) if fails else '\nALL PASS')
raise SystemExit(1 if fails else 0)
