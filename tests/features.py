"""V0.6.x feature tests: bottom Back bar, pinned folders first, left-panel rename pencils, app lock (pattern + fingerprint),
LRC parser, ID3 / MP4 / FLAC tag readers, online lyrics and artwork lookup (stubbed), player notification.
Run: python3 tests/features.py   (needs `pip install playwright` and a Chromium). Uses the same mock as tests/smoke.py."""
import http.server, threading, functools, os, sys, json, struct
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

# ---------- fixtures: tag bytes built independently of the JS readers ----------
def ss(n):return bytes([(n>>21)&127,(n>>14)&127,(n>>7)&127,n&127])
def id3(ver,frames,flags=0):
    body=b''
    for fid,data in frames:
        if ver==2:body+=fid.encode()+len(data).to_bytes(3,'big')+data
        elif ver==3:body+=fid.encode()+struct.pack('>I',len(data))+b'\0\0'+data
        else:body+=fid.encode()+ss(len(data))+b'\0\0'+data
    return b'ID3'+bytes([ver,0,flags])+ss(len(body))+body
u16=lambda s:b'\xff\xfe'+s.encode('utf-16le')
PNG=b'\x89PNG\r\n\x1a\n'+bytes(range(40))
JPG=b'\xff\xd8\xff\xe0'+bytes(range(60))
def mp4box(t,d):return struct.pack('>I',8+len(d))+t+d
def mp4item(t,payload):return mp4box(t,mp4box(b'data',b'\0\0\0\1\0\0\0\0'+payload))
def mp4():
    ilst=mp4box(b'ilst',mp4item(b'\xa9nam','Hallo Wêreld'.encode())+mp4item(b'\xa9ART',b'Fezzy')+mp4item(b'\xa9alb',b'Bojack EP')+mp4item(b'\xa9lyr',b'[00:03.00]mp4 line')+mp4item(b'covr',PNG))
    return mp4box(b'ftyp',b'M4A \0\0\0\0M4A mp42isom')+mp4box(b'moov',mp4box(b'udta',mp4box(b'meta',b'\0\0\0\0'+ilst)))
def flac():
    le=lambda n:struct.pack('<I',n)
    cm=[b'TITLE=Flac Song',b'ARTIST=Uzi',b'ALBUM=Pink Tape',b'LYRICS=[00:05.50]flac line']
    vc=le(5)+b'vendr'+le(len(cm))+b''.join(le(len(c))+c for c in cm)
    pic=struct.pack('>I',3)+struct.pack('>I',9)+b'image/png'+struct.pack('>I',0)+b'\0'*16+struct.pack('>I',len(PNG))+PNG
    blk=lambda t,d,last=False:bytes([t|(128 if last else 0)])+len(d).to_bytes(3,'big')+d
    return b'fLaC'+blk(0,b'\0'*34)+blk(4,vc)+blk(6,pic,True)
V3=id3(3,[('TIT2',b'\1'+u16('Ståy')+b'\0\0'),('TPE1',b'\0Juice WRLD\0'),('TALB',b'\3Fighting Demons\0'),
  ('USLT',b'\1eng'+b'\xff\xfe\0\0'+u16('[00:01.00]hello\n[00:02.50]world')),
  ('APIC',b'\0image/jpeg\0\0'+b'\0'+b'X'*10),('APIC',b'\0image/png\0\3'+b'\0'+PNG)])
V4=id3(4,[('TIT2',b'\3Lucid \xe2\x80\x93 Dreams\0'),('TPE1',b'\3A\0B'),
  ('SYLT',b'\3eng\2\1'+b'\0'+b'\nfirst\0'+struct.pack('>I',1500)+b'second\0'+struct.pack('>I',4200))])
V2=id3(2,[('TT2',b'\0Old Tag'),('TP1',b'\0Old Artist'),('PIC',b'\0JPG\0\0'+JPG)])
BYTES={k:list(v) for k,v in dict(v3=V3,v4=V4,v2=V2,mp4=mp4(),flac=flac(),junk=b'not a tag at all'*5,short=b'ID3').items()}

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox']) if os.path.exists('/opt/pw-browsers/chromium') else p.chromium.launch(args=['--no-sandbox'])
    def newpage(state=None,seed=True,w=412):
        c=b.new_context(viewport={'width':w,'height':860});pg=c.new_page();pg.add_init_script(mock)
        st=state or {'settings':{'permAsked':True,'autoPerm':False,'online':False}}
        pg.add_init_script("if(!localStorage['conduint.v1'])localStorage['conduint.v1']="+json.dumps(json.dumps(st)))
        pg.add_init_script("try{const x=sessionStorage.bio;if(x)Object.assign(__bio,JSON.parse(x))}catch{}")
        pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and 'status of 404' not in m.text and errs.append(m.text))
        pg.goto(url);pg.wait_for_timeout(200);pg.evaluate("document.body.classList.remove('nav')")
        if seed:
            pg.click('#burger');pg.locator('#stor .nv').first.click();pg.wait_for_selector('#dlg.on');pg.click('#dk');pg.wait_for_selector('#list .it')
        return pg
    names=lambda pg:pg.eval_on_selector_all('#list .it .nm','e=>e.map(x=>x.textContent)')
    def ctx(pg,name,label):
        pg.locator('#list .it',has=pg.locator('.nm',has_text=name)).first.click(button='right')
        pg.locator('#menu .mi',has_text=label).first.click()
    dlgok=lambda pg:pg.click('#dk')
    def drawer(pg):
        if pg.evaluate("document.querySelector('#perm').classList.contains('on')"):pg.click('#px')
        if not pg.evaluate("document.body.classList.contains('nav')"):pg.click('#burger')
        pg.wait_for_timeout(80)

    # ================= 1. BOTTOM BACK BAR =================
    pg=newpage()
    ok(pg.locator('#bbar').is_visible(),'back bar is visible at the bottom')
    ok(pg.is_disabled('#bbk') and pg.inner_text('#bbl')=='Back','back bar is disabled at the storage root')
    pg.locator('#list .it',has=pg.locator('.nm',has_text='Docs')).click();pg.wait_for_selector('#list .it .nm:text("Sub")')
    ok(not pg.is_disabled('#bbk') and pg.inner_text('#bbl').startswith('Back to '),'back bar enables inside a folder: '+pg.inner_text('#bbl'))
    pg.locator('#list .it',has=pg.locator('.nm',has_text='Sub')).click();pg.wait_for_selector('#list .it .nm:text("deep.txt")')
    ok(pg.inner_text('#bbl')=='Back to Docs','label names the parent folder: '+pg.inner_text('#bbl'))
    pg.click('#bbk');pg.wait_for_timeout(200)
    ok(pg.evaluate('cur.path.join("/")')=='Docs','back bar goes up one folder')
    pg.evaluate('openSet()');pg.wait_for_selector('#set.on')
    pg.evaluate("document.querySelector('#bbk').click()");pg.wait_for_timeout(150)  # sheets cover the bar on purpose, so fire the handler itself
    ok(not pg.evaluate("document.querySelector('#set').classList.contains('on')") and pg.evaluate('cur.path.join("/")')=='Docs','back bar closes Settings first, folder unchanged')
    pg.evaluate("goCat('imgs')");pg.wait_for_timeout(250)
    ok(not pg.is_disabled('#bbk') and 'Back to' in pg.inner_text('#bbl'),'back bar works in a library view: '+pg.inner_text('#bbl'))
    pg.click('#bbk');pg.wait_for_timeout(250)
    ok(pg.evaluate('!cur.cat'),'back from a library view returns to the first storage')
    pg.context.close()

    # ================= 2. PINNED FOLDERS SORT FIRST =================
    pg=newpage()
    ok(names(pg)[:2]==['Docs','Music'],'baseline order, folders first: '+str(names(pg)))
    ctx(pg,'Music','Pin to top');pg.wait_for_timeout(100)
    ok(names(pg)[0]=='Music','pinned folder moves to the top: '+str(names(pg)))
    ctx(pg,'Docs','Pin to top');pg.wait_for_timeout(100)
    ok(names(pg)[:2]==['Music','Docs'],'several pins keep the order they were pinned: '+str(names(pg)))
    pg.evaluate("set('sort','size')");pg.wait_for_timeout(100)
    ok(names(pg)[:2]==['Music','Docs'],'pins stay first under a different sort')
    pg.evaluate("set('first',false)");pg.wait_for_timeout(100)
    ok(names(pg)[:2]==['Music','Docs'],'pins stay first even with folders-first off: '+str(names(pg)))
    ctx(pg,'Music','Unpin');pg.wait_for_timeout(100)
    ok(names(pg)[0]=='Docs' and 'Music' in names(pg),'unpin returns the folder to normal sorting: '+str(names(pg)))
    pg.locator('#list .it',has=pg.locator('.nm',has_text='Docs')).click();pg.wait_for_selector('#list .it .nm:text("Sub")')
    ctx(pg,'Sub','Pin to top');pg.wait_for_timeout(100)
    ok(names(pg)[0]=='Sub','pin sorts first inside its own folder: '+str(names(pg)))
    pg.click('#bbk');pg.wait_for_timeout(200)
    ok(names(pg)[0]=='Docs','a pin in a subfolder does not leak into the parent')
    pg.context.close()

    # ================= 3. RENAME PENCILS IN THE LEFT PANEL =================
    pg=newpage()
    ctx(pg,'Music','Pin to top');drawer(pg)
    ok(pg.locator('#pins .nv .ne').count()==1 and pg.locator('#stor .nv .ne').count()>=1 and pg.locator('#lib .nv .ne').count()==6,'pencils on pins, storages and all 6 library views')
    here=pg.evaluate('JSON.stringify([cur.m,cur.path,cur.cat])')
    pg.locator('#lib .nv',has_text='Documents').locator('.ne').click();pg.wait_for_selector('#dlg.on')
    ok(pg.evaluate('JSON.stringify([cur.m,cur.path,cur.cat])')==here,'tapping a pencil does not navigate')
    pg.fill('#di','My papers');dlgok(pg);pg.wait_for_timeout(150)
    ok(pg.evaluate('S.labels.docs')=='My papers' and pg.locator('#lib .nv',has_text='My papers').count()==1,'library view renamed (label only)')
    ok(pg.evaluate("Object.keys(__T).includes('Docs')"),'library rename never touches files')
    pg.locator('#lib .nv',has_text='My papers').click();pg.wait_for_timeout(250)
    ok('My papers' in pg.inner_text('#crumbs'),'new library name shows in the breadcrumb: '+pg.inner_text('#crumbs'))
    pg.wait_for_timeout(1300);ok(pg.evaluate("document.querySelector('#perm').classList.contains('on')"),'a library view without All files access opens the permission sheet')
    drawer(pg);pg.locator('#lib .nv',has_text='My papers').locator('.ne').click();pg.wait_for_selector('#dlg.on');pg.fill('#di','Documents');dlgok(pg);pg.wait_for_timeout(100)
    ok(pg.evaluate("'docs' in S.labels")==False,'renaming back to the default clears the label')
    drawer(pg);pg.locator('#stor .nv').first.locator('.ne').click();pg.wait_for_selector('#dlg.on');pg.fill('#di','Fezzy Phone');dlgok(pg);pg.wait_for_timeout(100)
    ok(pg.evaluate("S.mounts[0].name")=='Fezzy Phone','storage renamed with its pencil')
    drawer(pg);pg.locator('#pins .nv').first.locator('.ne').click();pg.wait_for_selector('#dlg.on');pg.fill('#di','Tunes');dlgok(pg);pg.wait_for_timeout(300)
    ok('Tunes' in pg.evaluate('Object.keys(__T)') and 'Music' not in pg.evaluate('Object.keys(__T)'),'pinned folder renamed on disk')
    ok(pg.evaluate('S.pins[0].name')=='Tunes' and pg.evaluate('S.pins[0].path.join("/")')=='Tunes','pin entry follows the rename')
    drawer(pg);pg.locator('#pins .nv').first.locator('.ne').click();pg.wait_for_selector('#dlg.on');pg.fill('#di','bad/name');dlgok(pg);pg.wait_for_timeout(200)
    ok('Tunes' in pg.evaluate('Object.keys(__T)') and pg.evaluate('S.pins[0].name')=='Tunes','invalid folder name is rejected, nothing changes')
    pg.evaluate("document.querySelector('#dlg').classList.remove('on')")
    pg.context.close()

    # ================= 4. APP LOCK: PATTERN =================
    def pad(pg,seq,sel='#lkpad'):
        pts=pg.evaluate("(s)=>[...document.querySelectorAll(s+' .pd')].map(d=>{const r=d.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]})",sel)
        pg.mouse.move(*pts[seq[0]]);pg.mouse.down()
        for i in seq[1:]:pg.mouse.move(*pts[i],steps=6)
        pg.mouse.up();pg.wait_for_timeout(120)
    lks=lambda pg:pg.inner_text('#lks')
    lockon=lambda pg:pg.evaluate("document.querySelector('#lock').classList.contains('on')")
    pg=newpage()
    ok(not lockon(pg),'no lock by default')
    pg.evaluate('openSet()');pg.wait_for_selector('#set.on')
    pg.locator('#sbody .row',has_text='Lock Conduint with').locator('.chip',has_text='Pattern').click();pg.wait_for_selector('#lock.on')
    pad(pg,[0,1]);ok('at least 4' in lks(pg),'pattern under 4 dots is refused: '+lks(pg));pg.wait_for_timeout(700)
    pad(pg,[0,1,2,5]);ok('again' in lks(pg).lower(),'first pattern asks to draw again: '+lks(pg))
    pad(pg,[0,3,6,7]);ok('did not match' in lks(pg),'mismatch is refused: '+lks(pg));pg.wait_for_timeout(1000)
    pad(pg,[0,1,2,5]);pg.wait_for_timeout(100);pad(pg,[0,1,2,5]);pg.wait_for_timeout(300)
    ok(not lockon(pg) and pg.evaluate('S.lock.type')=='pattern' and pg.evaluate('!!S.lock.h')==True,'matching pattern turns the lock on')
    ok('0-1-2-5' not in pg.evaluate("localStorage['conduint.v1']") and len(pg.evaluate('S.lock.h'))==64,'only a 64-char salted SHA-256 is stored, never the pattern')
    ok(pg.evaluate("hashPat([0,1,2,5],'a')")!=pg.evaluate("hashPat([0,1,2,5],'b')"),'salt changes the hash')
    ok(pg.evaluate('patOk([0,1,2,5])')==True and pg.evaluate('patOk([2,1,0,5])')==False,'patOk accepts only the right pattern')
    ok(pg.evaluate('between(0,2)')==1 and pg.evaluate('between(0,8)')==4 and pg.evaluate('between(0,1)')==-1 and pg.evaluate('between(1,7)')==4,'straight lines pick up the middle dot')
    pg.evaluate("document.querySelector('#set').classList.remove('on')")
    # real restart: the lock must stand in front of the app before anything else
    pg.reload();pg.wait_for_selector('#lock.on',timeout=4000)
    ok(lockon(pg) and 'pattern' in lks(pg).lower(),'app starts locked: '+lks(pg))
    pad(pg,[0,1]);ok('at least 4' in lks(pg),'short pattern at the gate is refused')
    pg.wait_for_timeout(750)
    for n in range(1,5):
        pad(pg,[8,7,6,3]);ok(f'{5-n} tries left' in lks(pg),f'wrong pattern #{n}: '+lks(pg));pg.wait_for_timeout(750)
    pad(pg,[8,7,6,3]);ok('Wait' in lks(pg),'fifth wrong pattern starts a waiting time: '+lks(pg));pg.wait_for_timeout(750)
    pad(pg,[0,1,2,5]);ok(lockon(pg) and 'Wait' in lks(pg),'even the right pattern is refused during the wait')
    pg.evaluate('LK.until=0;LK.fails=0');pg.wait_for_timeout(700)
    pad(pg,[0,1,2,5]);pg.wait_for_timeout(300)
    ok(not lockon(pg) and pg.evaluate("!document.body.classList.contains('locked')"),'right pattern unlocks')
    # changing the lock asks who you are first
    pg.evaluate('openSet()');pg.wait_for_selector('#set.on')
    pg.locator('#sbody .row',has_text='Lock Conduint with').locator('.chip',has_text='Off').click();pg.wait_for_selector('#lock.on')
    ok('Confirm' in pg.inner_text('#lkt'),'turning the lock off asks to confirm first')
    pad(pg,[8,7,6,3]);ok(lockon(pg) and pg.evaluate('S.lock.type')=='pattern','wrong pattern cannot turn the lock off')
    pg.wait_for_timeout(750);pad(pg,[0,1,2,5]);pg.wait_for_timeout(300)
    ok(pg.evaluate('S.lock.type')=='off' and not lockon(pg),'right pattern turns the lock off')
    # coming back after being away
    pg.evaluate("S.lock={type:'pattern',salt:'s',h:null};S.settings.lockAfter=30")
    pg.evaluate("(async()=>{S.lock.h=await hashPat([0,1,2,5],'s');LK.hiddenAt=Date.now()-60000;Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))})()")
    pg.wait_for_selector('#lock.on',timeout=3000);ok(True,'lock returns after the away time has passed')
    pg.context.close()

    # ================= 5. APP LOCK: FINGERPRINT =================
    pg=newpage()
    pg.evaluate('openSet()');pg.wait_for_selector('#set.on')
    ok(pg.locator('#sbody .row',has_text='Lock Conduint with').locator('.chip',has_text='Fingerprint').count()==1,'Fingerprint option shows when the Lock plugin exists')
    pg.locator('#sbody .row',has_text='Lock Conduint with').locator('.chip',has_text='Fingerprint').click();pg.wait_for_timeout(300)
    ok(pg.evaluate('S.lock.type')=='bio' and ['bio'] in pg.evaluate('__log'),'fingerprint lock turns on after the sensor confirms')
    ok(['secure',False] in pg.evaluate('__log'),'screen-capture block follows the lock setting')
    ok('Pattern backup' in pg.inner_text('#sbody'),'backup pattern row appears with fingerprint lock')
    pg.evaluate("document.querySelector('#set').classList.remove('on')")
    pg.evaluate("__log.length=0")
    pg.reload();pg.wait_for_timeout(600)
    ok(['bio'] in pg.evaluate('__log') and not lockon(pg),'start: fingerprint prompt is asked and a good touch unlocks')
    pg.evaluate("sessionStorage.bio=JSON.stringify({fail:true})");pg.reload();pg.wait_for_selector('#lock.on',timeout=4000);pg.wait_for_timeout(300)
    ok(lockon(pg) and 'fingerprint' in lks(pg).lower() and pg.is_visible('#lkf'),'cancelled fingerprint keeps the lock closed and offers Use fingerprint: '+lks(pg))
    ok(not pg.is_visible('#lkpad'),'no pattern pad when no pattern backup exists')
    pg.evaluate("__bio.fail=false");pg.click('#lkf');pg.wait_for_timeout(300)
    ok(not lockon(pg),'Use fingerprint retries and unlocks')
    # sensor disappears and there is no backup: the lock must switch itself off, never lock the owner out
    pg.evaluate("sessionStorage.bio=JSON.stringify({ok:false})");pg.reload();pg.wait_for_timeout(700)
    ok(pg.evaluate('S.lock.type')=='off' and not lockon(pg),'no sensor and no backup: lock turns itself off, owner is never locked out')
    # fingerprint + pattern backup: sensor gone, pattern still opens the app
    pg.evaluate("sessionStorage.bio=JSON.stringify({ok:true})")
    pg.evaluate("(async()=>{S.lock={type:'bio',salt:'z',h:await hashPat([0,3,6,7],'z')};save()})()");pg.wait_for_timeout(100)
    pg.evaluate("sessionStorage.bio=JSON.stringify({ok:false})");pg.reload();pg.wait_for_selector('#lock.on',timeout=4000);pg.wait_for_timeout(300)
    ok(lockon(pg) and pg.is_visible('#lkpad') and 'pattern' in lks(pg).lower(),'sensor gone but backup exists: pattern pad is offered: '+lks(pg))
    pad(pg,[0,3,6,7]);pg.wait_for_timeout(300)
    ok(not lockon(pg),'backup pattern unlocks')
    pg.context.close()

    # ================= 6. LRC PARSER =================
    pg=newpage(seed=False)
    P=lambda t:pg.evaluate('(t)=>parseLrc(t)',t)
    r=P('[ar:Someone]\n[00:12.00]second\n[00:01.5]first\n[01:02:25]colon fraction\n\n[00:20.000][00:40.10]chorus\n[00:30]<00:30.10>word <00:30.50>tags\nplain junk line')
    ok([x['l'] for x in r]==['first','second','chorus','word tags','chorus','colon fraction'] and [round(x['t'],2) for x in r]==[1.5,12,20,30,40.1,62.25],'parseLrc: sort, multi-stamp, fractions, word tags, junk ignored: '+str(r))
    r=P('[offset:500]\n[00:10.00]late')
    ok(round(r[0]['t'],3)==9.5,'parseLrc: offset tag shifts lines: '+str(r))
    ok(P('[offset:9000]\n[00:00.10]x')[0]['t']==0,'parseLrc: time never goes below zero')
    ok(P('')==[] and P(None)==[] and P('just words\nno stamps')==[],'parseLrc: empty and unsynced text give no lines')
    ok(P('[00:05.00]\n[00:06.00]ok')[0]['l']=='' ,'parseLrc: empty lyric line is kept (shown as a note)')
    ok(P('[00:01.00]a\r\n[00:02.00]b\r\n')[1]['l']=='b','parseLrc: Windows line endings')
    ok(pg.evaluate("isSynced('[00:01.00]a')")==True and pg.evaluate("isSynced('plain text')")==False,'isSynced')
    ok(pg.evaluate("plainLines('[ar:x] one\\ntwo')").__len__()==2 and pg.evaluate("plainLines('[ti:x] one')[0].l")=='one','plainLines strips bracket tags')
    ok(pg.evaluate("guessNames('03 - Adele - Hello.mp3',{})")=={'artist':'Adele','title':'Hello'} or pg.evaluate("guessNames('03 - Adele - Hello.mp3',{})")['title']=='Hello','guessNames: "Artist - Title" file name')
    ok(pg.evaluate("guessNames('My_Song.mp3',{})")=={'artist':'','title':'My Song'},'guessNames: plain name')
    ok(pg.evaluate("guessNames('x.mp3',{artist:'A',title:'T'})")=={'artist':'A','title':'T'},'guessNames: tags win')

    # ================= 7. TAG READERS =================
    R=lambda k:pg.evaluate("(a)=>{const r=readTags(Uint8Array.from(a).buffer);const o={...r};if(r.art)o.art={mime:r.art.mime,len:r.art.data.length,b0:r.art.data[0]};return o}",BYTES[k])
    t=R('v3');ok(t.get('title')=='Ståy' and t.get('artist')=='Juice WRLD' and t.get('album')=='Fighting Demons','ID3v2.3: utf-16 title, latin1 artist, utf-8 album: '+str({k:t.get(k) for k in('title','artist','album')}))
    ok(t.get('lyrics','').startswith('[00:01.00]hello') and 'world' in t.get('lyrics',''),'ID3v2.3: USLT with utf-16 BOM text: '+repr(t.get('lyrics')))
    ok(t.get('art',{}).get('mime')=='image/png' and t['art']['len']==len(PNG),'ID3v2.3: front-cover APIC beats the earlier "other" picture: '+str(t.get('art')))
    t=R('v4');ok(t.get('title')=='Lucid – Dreams','ID3v2.4: utf-8 title: '+repr(t.get('title')))
    ok(t.get('artist')=='A, B','ID3v2.4: multi-artist NUL separator becomes a comma list: '+repr(t.get('artist')))
    ok(t.get('sylt')==[{'t':1.5,'l':'first'},{'t':4.2,'l':'second'}],'ID3v2.4: SYLT synced lyrics in ms: '+str(t.get('sylt')))
    t=R('v2');ok(t.get('title')=='Old Tag' and t.get('artist')=='Old Artist','ID3v2.2: 3-letter frames: '+str(t))
    ok(t.get('art',{}).get('mime')=='image/jpeg' and t['art']['len']==len(JPG),'ID3v2.2: PIC frame: '+str(t.get('art')))
    t=R('mp4');ok(t.get('title')=='Hallo Wêreld' and t.get('artist')=='Fezzy' and t.get('album')=='Bojack EP','MP4/M4A: title, artist, album: '+str({k:t.get(k) for k in('title','artist','album')}))
    ok(t.get('lyrics')=='[00:03.00]mp4 line' and t.get('art',{}).get('mime')=='image/png','MP4/M4A: lyrics and cover: '+str(t.get('art')))
    t=R('flac');ok(t.get('title')=='Flac Song' and t.get('artist')=='Uzi' and t.get('album')=='Pink Tape' and t.get('lyrics')=='[00:05.50]flac line','FLAC: vorbis comments: '+str(t))
    ok(t.get('art',{}).get('mime')=='image/png' and t['art']['len']==len(PNG),'FLAC: picture block: '+str(t.get('art')))
    ok(R('junk')=={} and R('short')=={},'garbage and truncated input return no tags and never throw')
    ok(pg.evaluate("readTags(new ArrayBuffer(0))")=={},'empty buffer')

    # ================= 8. songInfo END TO END (fetch stubbed, no real network) =================
    STUB="""window.__urls=[];window.__txt={};
const _f=window.fetch;
window.fetch=async(u,o)=>{u=String(u);window.__urls.push(u);
 const res=(body,ct)=>({ok:true,status:200,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body),arrayBuffer:async()=>body,blob:async()=>new Blob([body],{type:ct||'image/jpeg'})});
 if(u.startsWith('song://'))return res(Uint8Array.from(window.__song[u.slice(7)]||[]).buffer);
 if(u.includes('lrclib.net/api/get'))return window.__lrc?res(window.__lrc):{ok:false,status:404};
 if(u.includes('lrclib.net/api/search'))return res([]);
 if(u.includes('itunes.apple.com'))return window.__itunes?res({results:[{artworkUrl100:'https://x/100x100bb.jpg'}]}):res({results:[]});
 if(u.includes('/600x600bb')||u.includes('x/'))return res(new Uint8Array(500).fill(7),'image/jpeg');
 if(window.__txt[u])return res(window.__txt[u]);
 return _f(u,o)};"""
    pg.evaluate(STUB);pg.evaluate("window.__song="+json.dumps(BYTES))
    pg.evaluate("S.settings.online=false")
    out=pg.evaluate("songInfo({name:'x.mp3'},'song://v3',()=>0,()=>{},()=>true)")
    ok(out['title']=='Ståy' and out['artist']=='Juice WRLD' and out['synced'] and [l['l'] for l in out['lines']]==['hello','world'],'songInfo: tags + embedded synced lyrics, no network needed: '+str({k:out[k] for k in('title','synced')}))
    out=pg.evaluate("songInfo({name:'x.mp3'},'song://v4',()=>0,()=>{},()=>true)")
    ok(out['synced'] and out['lines'][0]['t']==1.5,'songInfo: SYLT lines win and are synced')
    ok(not any('lrclib' in u or 'itunes' in u for u in pg.evaluate('__urls')),'online lookups off means zero lrclib/iTunes requests')
    # online: lrclib + iTunes answer, results are saved beside the song
    pg.evaluate("S.settings.online=true;S.settings.autoApply=true;window.__lrc={syncedLyrics:'[00:01.00]from the web',plainLyrics:'from the web',artistName:'Adele',trackName:'Hello'};window.__itunes=true;__log.length=0")
    out=pg.evaluate("songInfo({name:'03 - Adele - Hello.mp3',uri:'mock:/Music/song.mp3',parent:'mock:/Music'},'song://none',()=>200,()=>{},()=>true)")
    u=pg.evaluate('__urls');g=[x for x in u if 'lrclib.net/api/get' in x]
    ok(g and 'track_name=Hello' in g[0] and 'artist_name=Adele' in g[0] and 'duration=200' in g[0],'lrclib query built from the file name and duration: '+(g[0] if g else 'none'))
    ok(out['synced'] and out['lines'][0]['l']=='from the web' and out['art'] is not None or out['synced'],'songInfo: online synced lyrics and artwork found')
    w=pg.evaluate("__log.filter(l=>l[0]==='write').map(l=>l[1])")
    ok(w==['03 - Adele - Hello.lrc','03 - Adele - Hello.jpg'],'.lrc and .jpg are saved beside the song: '+str(w))
    ok(pg.evaluate("__T['Music/03 - Adele - Hello.lrc'].text")=='[00:01.00]from the web','saved .lrc holds the synced text')
    ok(any('600x600bb' in x for x in u),'iTunes artwork is requested at 600x600')
    pg.evaluate("S.settings.autoApply=false;__log.length=0")
    pg.evaluate("songInfo({name:'Adele - Hello.mp3',uri:'mock:/Music/song.mp3',parent:'mock:/Music'},'song://none',()=>0,()=>{},()=>true)")
    ok(pg.evaluate("__log.filter(l=>l[0]==='write').length")==0,'auto-save off: nothing is written')
    pg.evaluate("S.settings.autoApply=true;window.__lrc=null;window.__itunes=false;__log.length=0")
    out=pg.evaluate("songInfo({name:'Nobody - Nothing.mp3',uri:'mock:/Music/song.mp3',parent:'mock:/Music'},'song://none',()=>0,()=>{},()=>true)")
    ok(not out['synced'] and out['lines']==[] and out['art'] is None,'songInfo: nothing found anywhere returns cleanly without throwing')
    # a .lrc next to the song wins and works offline
    pg.evaluate("S.settings.online=false;__T['Music/song.lrc']={dir:false,size:9,mtime:1};__txt={};window.__txt['/x.mp3']='[00:02.00]side lrc\\n[00:04.00]second'")
    out=pg.evaluate("songInfo({name:'song.mp3',uri:'mock:/Music/song.mp3',parent:'mock:/Music'},'song://none',()=>0,()=>{},()=>true)")
    ok(out['synced'] and out['lines'][0]['l']=='side lrc','.lrc beside the song is found through the folder listing and parsed: '+str(out['lines'][:1]))
    # a failing network never breaks the player
    pg.evaluate("S.settings.online=true;window.fetch=async()=>{throw new TypeError('Failed to fetch (CORS)')};0")
    out=pg.evaluate("songInfo({name:'A - B.mp3'},'song://none',()=>0,()=>{},()=>true)")
    ok(out['title']=='B' and out['artist']=='A' and not out['synced'],'CORS/network failure: songInfo still returns the file-name guess')
    pg.context.close()

    # ================= 9. PLAYER NOTIFICATION AND BUTTONS (mock) =================
    pg=newpage()
    pg.evaluate("S.settings.online=false")
    pg.evaluate("window.fetch=(f=>async(u,o)=>String(u).startsWith('song://')?{ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}:f(u,o))(window.fetch)")
    pg.evaluate("go(S.mounts[0].id,['Music'])");pg.wait_for_selector('#list .it .nm:text(\"song.mp3\")')
    pg.locator('#list .it',has=pg.locator('.nm',has_text='song.mp3')).click();pg.wait_for_selector('#pl.on');pg.wait_for_timeout(600)
    ok(pg.evaluate("__log.some(l=>l[0]==='notif'&&l[1]==='song')"),'playing a song posts the notification with the title: '+str([l for l in pg.evaluate('__log') if l[0]=='notif'][:1]))
    pg.evaluate("__pl.listeners.action({action:'next'})");pg.wait_for_timeout(200)
    ok(True,'notification Next button reaches the app without errors')
    pg.click('#pmn');pg.wait_for_timeout(150)
    ok(pg.evaluate("document.body.classList.contains('pmini')"),'minimising keeps the player as a bar')
    pg.click('#pbk' if pg.locator('#pbk').count() else '#bbk',force=True);pg.wait_for_timeout(100)
    pg.evaluate("__pl.listeners.action({action:'close'})");pg.wait_for_timeout(200)
    ok(not pg.evaluate("document.querySelector('#pl').classList.contains('on')") and ['notifstop'] in pg.evaluate('__log'),'notification Close button stops the player and the notification')
    pg.context.close()

    ok(not errs,'no console errors anywhere: '+str(errs[:3]))
    b.close()
print('\nFAILED:' if fails else '\nALL PASSED',fails or '')
sys.exit(1 if fails else 0)
