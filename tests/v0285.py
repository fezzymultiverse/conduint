"""V0.28.5 tests: Wi-Fi check (analysis of every finding, offline/cellular/VPN notes, error paths, screen, Tools grid, privacy rules in the source).
Run: python3 tests/v0285.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os, json
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.path.join(root,'www'));H.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{srv.server_port}/index.html'
mock=open(os.path.join(root,'tests','mock-saf.js')).read()
java=open(os.path.join(root,'native','WifiPlugin.java')).read()
wjs=open(os.path.join(root,'www','js','wifi.js')).read()
patch=open(os.path.join(root,'scripts','patch-android.sh')).read()
mainact=open(os.path.join(root,'native','MainActivity.java')).read()
fails=[];errs=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
CHROME=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
OFFLINE=('ERR_NAME_NOT_RESOLVED','ERR_INTERNET_DISCONNECTED','ERR_CONNECTION','ERR_TUNNEL')
BASE={"online":True,"transport":"wifi","viaWifi":True,"security":{"type":2},"captive":{"flag":False,"validated":True,"probe":"ok"},
 "dns":{"servers":["192.168.0.1"],"privateOn":True,"privateHost":"dns.example","nxdomain":"ok","anchors":[{"host":"one.one.one.one","result":"ok"},{"host":"dns.google","result":"ok"}],"private":[]}}
def mk(**kw):
    r=json.loads(json.dumps(BASE))
    for k,v in kw.items():
        if '__' in k:
            a,b=k.split('__');r[a][b]=v
        else:r[k]=v
    return r
# source rules
ok('getSSID' not in java and 'getBSSID' not in java and 'getIpAddress' not in java and 'ACCESS_FINE_LOCATION' not in java and 'ACCESS_COARSE_LOCATION' not in java,'native plugin never reads the network name, BSSID, phone address or location')
ok('ssid' not in wjs.lower(),'wifi.js never handles a network name')
ok('WifiPlugin' in patch and 'conduint-wifi' in patch and 'ACCESS_WIFI_STATE' in patch and 'ACCESS_FINE_LOCATION' not in patch,'build script copies the plugin and adds only the Wi-Fi state permission')
ok('registerPlugin(WifiPlugin.class)' in mainact,'MainActivity registers WifiPlugin')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']) if os.path.exists(CHROME) else p.chromium.launch(args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.set_default_timeout(8000);pg.add_init_script(mock)
    pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']='{\"settings\":{\"permAsked\":true,\"autoPerm\":false}}'")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:m.type=='error' and not any(o in m.text for o in OFFLINE) and 'Failed to load resource' not in m.text and errs.append('console: '+m.text))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("/^V0\\.(28|29)\\.\\d+$/.test(VER)"),'version is V0.28.x or V0.29.x or V0.29.x')
    ok(pg.evaluate("typeof wfAnalyze==='function'&&typeof tWifi==='function'&&!!WIFI&&typeof WIFI.check==='function'"),'wfAnalyze, tWifi and the Wifi handle exist')
    A=lambda r:pg.evaluate("r=>wfAnalyze(r)",r)
    sev=lambda a:[x['sev'] for x in a['items']]
    labels=lambda a:' | '.join(x['label'] for x in a['items'])
    a=A(BASE);ok(a['level']=='ok' and 'No problems' in a['verdict'] and 'high' not in sev(a) and 'med' not in sev(a),'healthy WPA2 network: no problems '+a['verdict'])
    ok('DNS servers in use: 192.168.0.1' in ' '.join(a['notes']),'DNS servers are listed as a note')
    a=A(mk(security={"type":0}));ok(a['level']=='high' and 'Open Wi-Fi' in labels(a),'open Wi-Fi is high')
    a=A(mk(security={"type":1}));ok(a['level']=='high' and 'WEP' in labels(a),'WEP is high')
    a=A(mk(security={"type":4}));ok(a['level']=='ok' and 'WPA3' in labels(a),'WPA3 passes')
    a=A(mk(security={"type":6}));ok(a['level']=='ok' and 'Enhanced Open' in labels(a) and 'low' in sev(a),'Enhanced Open is a low note, not a problem')
    a=A(mk(security={"type":-1}));ok(a['level']=='ok' and 'did not report' in labels(a),'unknown security type is a low note (Android 11 or older)')
    a=A(mk(captive__flag=True));ok(a['level']=='med' and 'sign-in' in labels(a),'captive portal flag is med')
    a=A(mk(captive__probe='tls'));ok(a['level']=='high' and 'intercepted' in labels(a),'bad certificate on the test page, no portal flag: high')
    a=A(mk(captive__probe='tls',captive__flag=True));ok(a['level']=='med' and 'high' not in sev(a),'bad certificate while a portal is flagged: only med (the portal explains it)')
    a=A(mk(captive__probe='redirect'));ok(a['level']=='med' and 'rewrote' in labels(a),'test page rewritten: med')
    a=A(mk(captive__probe='fail'));ok(a['level']=='med' and 'No answer' in labels(a),'no answer from the internet: med')
    a=A(mk(dns__nxdomain='rewritten'));ok(a['level']=='high' and 'cannot exist' in labels(a),'made-up name resolves: high')
    a=A(mk(dns__anchors=[{"host":"one.one.one.one","result":"wrong"},{"host":"dns.google","result":"ok"}]));ok(a['level']=='high' and 'one.one.one.one' in labels(a) and 'dns.google' not in [x['label'] for x in a['items'] if x['sev']=='high'][0],'wrong fixed answer names only the bad host: high')
    a=A(mk(dns__anchors=[{"host":"one.one.one.one","result":"none"},{"host":"dns.google","result":"none"}]));ok(a['level']=='ok' and 'Could not check' in labels(a),'both anchors unresolved while internet works: low note only')
    a=A(mk(dns__private=['www.google.com']));ok(a['level']=='med' and 'private or blank' in labels(a),'public site answered with a private address: med')
    a=A(mk(dns__privateOn=False));ok(a['level']=='ok' and 'Private DNS is off' in labels(a),'Private DNS off is a low note')
    a=A({"online":False,"transport":"none"});ok('Not connected' in a['verdict'] and not a['items'],'offline: says not connected')
    a=A(mk(transport='cellular',viaWifi=False));ok('mobile data' in ' '.join(a['notes']) and 'Password-protected' not in labels(a),'cellular: security skipped, note shown')
    a=A(mk(vpn=True));ok('VPN is on' in ' '.join(a['notes']),'VPN on: note says tests ran through the tunnel')
    a=A({"online":False,"transport":"unknown","error":"The check could not run on this phone."});ok('could not run' in a['verdict'],'native error becomes a plain verdict')
    ok(pg.evaluate("wfAnalyze(null).verdict")=='The check could not run.','null result does not throw')
    # screen
    pg.evaluate("openTools()");pg.wait_for_timeout(500)
    ok('Wi-Fi check' in pg.evaluate("document.querySelector('#tbody').innerText"),'Tools grid has the Wi-Fi check tile')
    pg.evaluate("tWifi()");pg.wait_for_timeout(300)
    ok('Run the check' in pg.evaluate("document.querySelector('#tbody').innerText"),'screen opens with a Run button')
    pg.evaluate("window.__wifi=%s"%json.dumps(mk(security={"type":0})))
    pg.evaluate("(()=>{window.__calls=0;const o=WIFI.check.bind(WIFI);WIFI.check=async()=>{__calls++;await new Promise(r=>setTimeout(r,300));return o()}})()")
    pg.evaluate("(()=>{const b=document.querySelector('#tbody .chip.on');b.click();b.click()})()");pg.wait_for_timeout(900)
    t=pg.evaluate("document.querySelector('#wfres').innerText")
    ok('Not safe' in t and 'Open Wi-Fi' in t,'result shows the verdict and the finding')
    ok(pg.evaluate("__calls")==1,'double tap runs the check once')
    ok(pg.evaluate("document.querySelector('#tbody .chip.on').textContent")=='Run the check' and not pg.evaluate("document.querySelector('#tbody .chip.on').disabled"),'button comes back after the check')
    # error path
    pg.evaluate("(()=>{WIFI.check=async()=>{throw new Error('boom')}})()")
    pg.evaluate("document.querySelector('#tbody .chip.on').click()");pg.wait_for_timeout(500)
    ok('boom' in pg.evaluate("document.querySelector('#wfres').innerText"),'a failing check shows a plain message and keeps the app running')
    ok(not errs,'no script errors during the screen tests '+str(errs))
    b.close()
print('ALL PASS' if not fails else 'FAILED: '+str(len(fails)))
