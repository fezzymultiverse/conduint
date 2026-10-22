"""V0.21.0 tests: Gallery upgrade (date groups, favourites, albums, move / copy / rename / delete with cross-reference remap,
selection bar, settings sheet, Originals tab, album picker, back layers) and the Crop and rotate editor.
Run: python3 tests/v0190.py   (needs `pip install playwright` and a Chromium)"""
import http.server, threading, functools, os, base64
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
    pg.goto(url);pg.wait_for_timeout(600);pg.evaluate('askedAll=true')
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("parseFloat(VER.slice(1))>=0.21&&typeof glRemap==='function'&&typeof gcOpen==='function'&&typeof ivSwap==='function'"),'modules loaded, version V0.21.0 or newer')
    dlgok=lambda:pg.click('#dk')
    # a real picture with EXIF (orientation 6, camera, date, GPS), built with the V0.18 EXIF writer, served for every cacheCopy path
    LIB=open(os.path.join(root,'tests','v0180.py')).read().split('LIB="""')[1].split('"""')[0]
    pg.evaluate(LIB)
    b64=pg.evaluate("""async()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,200,100);gr.addColorStop(0,'#0ff');gr.addColorStop(1,'#f0f');g.fillStyle=gr;g.fillRect(0,0,200,100);
      g.fillStyle='#fff';g.fillRect(0,0,30,30);const bl=await new Promise(r=>c.toBlob(r,'image/jpeg',.9)),j=new Uint8Array(await bl.arrayBuffer()),n=xfPack(j,T.rich(false),false);return xfB64(n)}""")
    JPG=base64.b64decode(b64)
    pg.route('**/pic/**',lambda r:r.fulfill(body=JPG,content_type='image/jpeg'))
    pg.route('**/x.mp3',lambda r:r.fulfill(body=JPG,content_type='image/jpeg'))  # the mock's default cacheCopy path (backups)
    pg.route('**/junk/**',lambda r:r.fulfill(body=b'not a picture at all',content_type='image/jpeg'))
    # seed the mock phone: two albums, four dated pictures, one mount
    pg.evaluate("""()=>{const D=(y,m,d,h)=>Date.UTC(y,m,d,h||12),T=__T,add=(p,dir,t)=>{T[p]={dir,size:dir?0:1000+p.length,mtime:t||Date.now()}};
      ['Pictures','Pictures/Camera','Pictures/Screenshots'].forEach(p=>add(p,true));
      add('Pictures/Camera/a.jpg',false,D(2026,9,5,15));add('Pictures/Camera/b.jpg',false,D(2026,9,5,9));add('Pictures/Camera/c.jpg',false,D(2026,8,12));add('Pictures/Screenshots/s1.png',false,D(2026,7,1));
      S.mounts=[{id:'s1',type:'saf',name:'Phone',ic:'folder',uri:'mock-tree',root:'mock:/'}];save();
      window.__cache={};['Pictures/Camera/a.jpg','Pictures/Camera/b.jpg','Pictures/Camera/c.jpg','Pictures/Screenshots/s1.png'].forEach(p=>__cache['mock:/'+p]='/pic/'+p)}""")
    # ---------- Gallery: scan, date groups ----------
    pg.evaluate('glOpen()');pg.wait_for_selector('#glbody .glt');pg.wait_for_timeout(300)
    n=pg.evaluate('GL.items.length');ok(n==4,'gallery scans 4 pictures (%d)'%n)
    heads=lambda:pg.eval_on_selector_all('#glbody .glh span','e=>e.map(x=>x.textContent)')
    ok(len(heads())==3,'group by month: 3 headers '+str(heads()))
    pg.evaluate("gsetPut('group','day');glRedraw()");ok(len(heads())==3 and any('5' in x for x in heads()),'group by day: 3 headers (two pictures share a day) '+str(heads()))
    pg.evaluate("gsetPut('group','year');glRedraw()");ok(heads()==['2026'],'group by year: one header '+str(heads()))
    ok(pg.eval_on_selector('#glbody .glh em','e=>e.textContent')=='4','group header shows its count')
    pg.evaluate("gsetPut('group','none');glRedraw()");ok(len(heads())==0,'group none: no headers')
    pg.evaluate("gsetPut('group','month');glRedraw()")
    # ---------- selection bar ----------
    pg.evaluate("GL.selOn=true;glDraw()");pg.locator('#glbody .glt').nth(0).click();pg.locator('#glbody .glt').nth(1).click()
    labs=lambda:pg.eval_on_selector_all('#glsel .glab span','e=>e.map(x=>x.textContent)')
    ok(labs()==['Favourite','Category','Move','Copy','Share','More','Delete'],'selection bar, two pictures: '+str(labs()))
    pg.locator('#glbody .glt').nth(1).click()
    ok(labs()==['Favourite','Category','Move','Copy','Rename','Crop','Share','More','Delete'],'selection bar, one picture adds Rename and Crop: '+str(labs()))
    ok(pg.inner_text('#glsel .glst b')=='1 picture selected','selection count reads 1 picture selected')
    # tap a group header in select mode selects the whole group
    pg.locator('#glbody .glh').nth(0).click();ok(pg.evaluate('GL.sel.size')==2,'tap a date header selects its group (%s)'%pg.evaluate('GL.sel.size'))
    pg.evaluate("GL.sel.clear();GL.selOn=false;glDraw()")
    # ---------- favourites ----------
    pg.evaluate("window.A=GL.items.find(i=>i.name==='a.jpg');window.B2=GL.items.find(i=>i.name==='b.jpg');window.C=GL.items.find(i=>i.name==='c.jpg');glFavSet([A,B2],true)")
    ok(pg.evaluate('gfav().length')==2 and pg.evaluate('glIsFav(A)'),'favourite two pictures')
    ok(pg.locator('#glbody .glfv.on').count()==2,'hearts drawn on favourites')
    pg.evaluate("glGoTab('fav')");ok(pg.locator('#glbody .glt').count()==2,'Favourites tab lists 2')
    pg.evaluate("glGoTab('all')")
    pg.evaluate("gsetPut('hearts',false);glRedraw()");ok(pg.evaluate("getComputedStyle(document.querySelector('#glbody .glfv.on')).display")=='none','hearts setting off hides them')
    pg.evaluate("gsetPut('hearts',true);glRedraw()")
    # viewer heart in step with the gallery
    pg.evaluate("ivOpen(A,GL.items.slice())");pg.wait_for_timeout(300)
    ok(pg.get_attribute('#ivfv','aria-pressed')=='true' and 'heartfill' in pg.get_attribute('#ivfv use','href'),'viewer heart shows favourite')
    pg.click('#ivfv');ok(pg.evaluate('!glIsFav(A)') and pg.get_attribute('#ivfv','aria-pressed')=='false' and pg.get_attribute('#ivfv use','href')=='#i-heart','viewer heart toggles off and its icon follows')
    pg.click('#ivfv');ok(pg.evaluate('glIsFav(A)'),'viewer heart toggles on')
    # categories remember pictures too
    pg.evaluate("gcats().push({id:'k1',name:'Trips',items:[glSlim(A),glSlim(C)],pin:false});glSave()")
    # ---------- album picker, new album, back layers ----------
    pg.evaluate("void(window.__p=glPkAsk('Move 1 picture to…'))");pg.wait_for_selector('#glpk.on')
    ok(pg.locator('#glpk .glpkr').count()==3,'picker lists New album + 2 albums (%d)'%pg.locator('#glpk .glpkr').count())
    ok(pg.evaluate("back()")==1 and pg.evaluate("document.querySelector('#glpk').classList.contains('on')")==False,'Android back closes the picker first')
    ok(pg.evaluate("__p")is None,'closing the picker answers null')
    pg.evaluate("ivClose()")
    pg.evaluate("glGoTab('albums')");ok(pg.locator('#glbody .glcv').count()==3,'Albums tab: New album tile + 2 albums')
    pg.evaluate("void(window.__p=glNewAlbum())");pg.wait_for_selector('#dlg.on');pg.fill('#di','Trip');dlgok();a=pg.evaluate("__p")
    ok(a and a['name']=='Trip' and pg.evaluate("'Trip' in __T"),'new album creates the folder: '+str(a))
    ok(pg.locator('#glbody .glcv').count()==4,'empty album shows in Albums')
    # ---------- move: favourites and categories follow ----------
    pg.evaluate("window.__d={uri:'mock:/Trip',name:'Trip'}")
    r=pg.evaluate("glTransfer('move',[A,B2],__d)");ok(r is True,'move two pictures to Trip')
    T=lambda:pg.evaluate("Object.keys(__T)")
    ok('Trip/a.jpg' in T() and 'Pictures/Camera/a.jpg' not in T(),'files moved in storage')
    ok(pg.evaluate("gfav().sort().join()")=='mock:/Trip/a.jpg,mock:/Trip/b.jpg','favourites follow the move: '+pg.evaluate("gfav().join()"))
    ok(pg.evaluate("gcats()[0].items.map(i=>i.uri).sort().join()")=='mock:/Pictures/Camera/c.jpg,mock:/Trip/a.jpg','category follows the move')
    ok(pg.evaluate("GL.items.find(i=>i.name==='a.jpg').pname")=='Trip','scan list updated (album name)')
    pg.evaluate("window.A=GL.items.find(i=>i.name==='a.jpg');window.B2=GL.items.find(i=>i.name==='b.jpg')")
    # ---------- copy: new picture listed, originals' favourites unchanged ----------
    n0=pg.evaluate('GL.items.length');favs0=pg.evaluate('gfav().length')
    r=pg.evaluate("glTransfer('copy',[C],__d)");ok(r is True and pg.evaluate('GL.items.length')==n0+1,'copy adds one picture to the list')
    ok(pg.evaluate('gfav().length')==favs0 and 'Pictures/Camera/c.jpg' in T() and 'Trip/c.jpg' in T(),'copy keeps the original, favourites unchanged')
    ok(pg.evaluate("glTransfer('move',[A],__d)")is False,'moving into the album a picture is already in is refused')
    # ---------- rename (extension kept), also while the viewer is open ----------
    pg.evaluate("ivOpen(A,GL.items.filter(i=>i.pname==='Trip'))");pg.wait_for_timeout(300)
    pg.evaluate("void(window.__p=glRename(A))");pg.wait_for_selector('#dlg.on');pg.fill('#di','sunset');dlgok();pg.wait_for_timeout(200)
    ok('Trip/sunset.jpg' in T() and 'Trip/a.jpg' not in T(),'rename keeps the .jpg extension')
    ok(pg.inner_text('#ivt')=='sunset.jpg','open viewer title follows the rename')
    ok(pg.evaluate("gfav().includes('mock:/Trip/sunset.jpg')")and pg.evaluate("gcats()[0].items.some(i=>i.uri==='mock:/Trip/sunset.jpg')"),'favourites and category follow the rename')
    pg.evaluate("ivClose()");pg.evaluate("window.A=GL.items.find(i=>i.name==='sunset.jpg')")
    # ---------- rename album (provider URIs: rescan + match by name) ----------
    pg.evaluate("void(window.__p=glRenameAlbum([...glAlbumMap().values()].find(a=>a.name==='Trip')))");pg.wait_for_selector('#dlg.on');pg.fill('#di','Journey');dlgok();pg.wait_for_timeout(500)
    ok('Journey/sunset.jpg' in T() and 'Trip' not in T(),'album folder renamed')
    ok(pg.evaluate("gfav().includes('mock:/Journey/sunset.jpg')")and pg.evaluate("GL.items.find(i=>i.name==='sunset.jpg').pname")=='Journey','favourites follow a renamed album')
    ok(pg.evaluate("gd().galb.some(x=>x.name==='Journey')"),'created album entry renamed too')
    pg.evaluate("window.A=GL.items.find(i=>i.name==='sunset.jpg');window.B2=GL.items.find(i=>i.name==='b.jpg')")
    # ---------- delete: bin, remap ----------
    pg.evaluate("void(window.__p=glDeleteItems([B2]))");pg.wait_for_selector('#dlg.on');dlgok();ok(pg.evaluate("__p")is True,'delete (to bin) reports success')
    ok(pg.evaluate("!GL.items.some(i=>i.name==='b.jpg')")and pg.evaluate("!gfav().some(k=>k.endsWith('b.jpg'))"),'deleted picture leaves the list and favourites')
    ok(pg.evaluate("S.trash.length")>=1,'deleted picture is in the recycle bin list')
    # direct file path (Tools plugin): trash by path
    pg.evaluate("__perm.allFiles=true");pg.evaluate("window.FS={uri:'file:///storage/emulated/0/Pictures/x.jpg',name:'x.jpg',size:50000,mtime:Date.now(),pname:'Pictures',fs:true};GL.items.push(FS);glFavSet([FS],true)")
    pg.evaluate("void(window.__p=glDeleteItems([FS]))");pg.wait_for_selector('#dlg.on');dlgok();pg.wait_for_timeout(200)
    ok(pg.evaluate("S.trash.some(t=>t.p&&t.name==='x.jpg')")and pg.evaluate("!__F['/storage/emulated/0/Pictures/x.jpg']"),'direct file path goes to the bin through the Tools plugin')
    ok(pg.evaluate("!gfav().includes('file:///storage/emulated/0/Pictures/x.jpg')"),'favourite dropped with the file')
    # ---------- settings sheet ----------
    pg.evaluate("glGoTab('all')");pg.click('.glhd .ib[aria-label="Gallery settings"]');pg.wait_for_selector('#glset.on')
    ok(pg.locator('#glset .glsr').count()>=9,'settings sheet rows (%d)'%pg.locator('#glset .glsr').count())
    pg.locator('#glset .glsr.col',has_text='Picture fit').locator('.chip',has_text='Whole picture').click()
    ok(pg.evaluate("document.querySelector('#glbody').classList.contains('fit-contain')"),'fit: whole picture')
    pg.locator('#glset .glsr',has_text='Show file names').click();ok(pg.evaluate("document.querySelector('#glbody').classList.contains('names')"),'file names on')
    pg.locator('#glset .glsr.col',has_text='Picture size').locator('.chip',has_text='Large').click()
    ok(pg.evaluate("document.querySelector('#glbody').style.gridTemplateColumns")=='repeat(3, 1fr)','size Large: 3 columns in Grid')
    pg.locator('#glset .glsr.col',has_text='Layout').locator('.chip',has_text='Tiny').click()
    ok(pg.evaluate("document.querySelector('#glbody').style.gridTemplateColumns")=='repeat(5, 1fr)','size Large + Tiny: 5 columns')
    ok(pg.evaluate("back()")==1 and not pg.evaluate("GL.set") and pg.evaluate("GL.open"),'Android back closes settings first, gallery stays')
    pg.evaluate("glSetShow(true)");pg.locator('#glset .glsr',has_text='Reset gallery settings').click()
    ok(pg.evaluate("JSON.stringify(gset())==JSON.stringify(GSET_DEF)&&glLay()==='grid'"),'reset restores defaults')
    pg.evaluate("glSetShow(false)")
    # ---------- Originals: backup record, list, restore (swap), delete ----------
    pg.evaluate("window.A=GL.items.find(i=>i.name==='sunset.jpg');A.m='s1'")
    pg.evaluate("__cache['mock:/Journey/sunset.jpg']='/pic/sunset.jpg'")
    bn=pg.evaluate("(async()=>xfBackup(A,await xfBytes(A)))()");ok(bn and '~sunset.jpg' in bn,'backup written: '+str(bn))
    ok(pg.evaluate("'.conduint-originals/'+%r in __T"%bn),'backup file lives in .conduint-originals')
    ok(pg.evaluate("gd().gorig[%r].from"%bn)=='mock:/Journey/sunset.jpg','backup remembers where it came from')
    pg.evaluate("glGoTab('orig')");pg.wait_for_selector('#glbody .glor');ok(pg.locator('#glbody .glor').count()==1,'Originals tab lists the backup')
    ok(not pg.evaluate("GL.items.some(i=>/conduint-originals/.test(i.uri))"),'backups never appear as pictures')
    pg.locator('#glbody .glor .chip',has_text='Restore').click();pg.wait_for_selector('#dlg.on');dlgok();pg.wait_for_timeout(500)
    ok(pg.evaluate("__log.some(l=>l[0]==='writeUri'&&l[1]==='sunset.jpg')"),'restore wrote the original back over the picture')
    ok(pg.locator('#glbody .glor').count()==1 and bn not in pg.evaluate("GL.orig.map(x=>x.name)"),'restore swaps: old backup gone, the replaced version kept as a new one')
    pg.locator('#glbody .glor .ib').click();pg.wait_for_selector('#dlg.on');dlgok();pg.wait_for_timeout(300)
    ok(pg.locator('#glbody .glor').count()==0 and pg.evaluate("Object.keys(gd().gorig||{}).length")==0,'delete a saved original removes file and record')
    # restore when the picture is gone: written back to its folder
    bn=pg.evaluate("(async()=>xfBackup(A,await xfBytes(A)))()");pg.evaluate("delete __T['Journey/sunset.jpg']")
    pg.evaluate("glOrigLoad(true)");pg.wait_for_selector('#glbody .glor')
    pg.locator('#glbody .glor .chip',has_text='Restore').click();pg.wait_for_timeout(500)
    ok(pg.evaluate("'Journey/sunset.jpg' in __T"),'restore recreates a missing picture in its folder')
    pg.evaluate("glGoTab('all')")
    # ---------- Crop and rotate ----------
    pg.evaluate("window.C2=GL.items.find(i=>i.name==='c.jpg'&&i.pname==='Camera');C2.m='s1'")
    pg.evaluate("void(window.__p=gcOpen(C2))");pg.wait_for_selector('#gc.on');pg.wait_for_timeout(300)
    ok(pg.evaluate("GC.iw===100&&GC.ih===200"),'EXIF orientation 6 is applied: 200x100 file edits as 100x200 (%s)'%pg.evaluate("GC.iw+'x'+GC.ih"))
    ok(pg.evaluate("GC.r.w===100&&GC.r.h===200")and pg.inner_text('#gcdim')=='100 × 200','crop box starts as the full picture')
    pg.locator('#gc .gcasp .chip',has_text='1:1').click();ok(pg.evaluate("Math.abs(GC.r.w-GC.r.h)<.01&&GC.r.w===100"),'1:1 preset: largest centred square %s'%pg.evaluate("JSON.stringify(GC.r)"))
    pg.evaluate("gcTurn(1)");ok(pg.evaluate("gcFrame().w===200&&gcFrame().h===100")and pg.evaluate("Math.abs(GC.r.w-GC.r.h)<.01"),'rotate right: frame 200x100, square kept')
    pg.locator('#gc .gcasp .chip',has_text='Free').click();pg.locator('#gc .gcasp .chip',has_text='4:3').click()
    ok(pg.evaluate("Math.abs(GC.r.w/GC.r.h-4/3)<.01"),'4:3 preset')
    # drag the south-east corner inward: ratio stays 4:3 and stays inside the frame
    pg.evaluate("window.R0={...GC.r}");bb=pg.locator('#gc .gcp-se').bounding_box();x0,y0=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    pg.mouse.move(x0,y0);pg.mouse.down();pg.mouse.move(x0-40,y0-20,steps=5);pg.mouse.up()
    ok(pg.evaluate("GC.r.w<R0.w-1&&Math.abs(GC.r.w/GC.r.h-4/3)<.01&&GC.r.x>=0&&GC.r.y>=0&&GC.r.x+GC.r.w<=gcFrame().w+.01&&GC.r.y+GC.r.h<=gcFrame().h+.01"),'corner drag keeps 4:3 and stays inside %s'%pg.evaluate("JSON.stringify(GC.r)"))
    pg.locator('#gc .gcasp .chip',has_text='Free').click()
    bb=pg.locator('#gc .gcp-e').bounding_box();pg.evaluate("window.R1={...GC.r}")
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);pg.mouse.down();pg.mouse.move(bb['x']-30,bb['y']+bb['height']/2,steps=4);pg.mouse.up()
    ok(pg.evaluate("GC.r.w<R1.w-1&&GC.r.h===R1.h"),'free mode: edge drag changes one side only')
    bb=pg.locator('#gcbox').bounding_box();pg.evaluate("window.R2={...GC.r}")
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);pg.mouse.down();pg.mouse.move(bb['x']+bb['width']/2+25,bb['y']+bb['height']/2+8,steps=4);pg.mouse.up()
    ok(pg.evaluate("GC.r.w===R2.w&&GC.r.x>R2.x&&GC.r.x+GC.r.w<=gcFrame().w+.01"),'dragging the middle moves the box without resizing')
    pg.evaluate("document.querySelector('#gcsl').value=12;document.querySelector('#gcsl').dispatchEvent(new Event('input'))")
    ok(pg.evaluate("GC.ang===12&&gcZoom()>1.2")and pg.inner_text('#gcan')=='12°','straighten 12°: zoom keeps corners filled (zoom %.2f)'%pg.evaluate("gcZoom()"))
    pg.evaluate("GC.fx=true;gcPaint()")
    pg.evaluate("window.EXP={w:Math.round(GC.r.w),h:Math.round(GC.r.h)}")
    pg.click('#gcsv');pg.wait_for_selector('#gc.on',state='detached');pg.wait_for_timeout(500)
    ok('Camera/c_edit.jpg' in T() or 'Pictures/Camera/c_edit.jpg' in T(),'copy saved next to the original as c_edit.jpg')
    ok(pg.evaluate("__T['Pictures/Camera/c.jpg'].b64===undefined"),'original file untouched')
    res=pg.evaluate("""async()=>{const f=__T['Pictures/Camera/c_edit.jpg'],u=Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0)),bm=await createImageBitmap(new Blob([u],{type:'image/jpeg'})),rd=xfRead(u),M=rd.M,F=M?xfFacts(M):{};
      return{w:bm.width,h:bm.height,or:M?xfNum(M,'ifd0',0x112):'noM',mk:M?xfText(M,'ifd0',0x10F):'',la:F.la,tk:M?xfText(M,'exif',0x9003):'',mn:M?!!xfGet(M,'exif',0x927C):false,px:M?xfNum(M,'exif',0xA002):null,py:M?xfNum(M,'exif',0xA003):null}}""")
    exp=pg.evaluate('EXP')
    ok(res['w']==exp['w'] and res['h']==exp['h'],'saved picture has the cropped size %s'%res)
    ok(res['or'] is None,'Orientation tag dropped (pixels are upright)')
    ok(res['mk']=='HONOR' and res['tk']=='2026:10:10 13:35:00' and abs(res['la']+33.925)<1e-6,'EXIF kept: camera, date taken and GPS')
    ok(res['mn'] is False and res['px']==exp['w'] and res['py']==exp['h'],'MakerNote dropped, size tags rewritten')
    ok(pg.evaluate("GL.items.some(i=>i.name==='c_edit.jpg')"),'new copy appears in the gallery list')
    # second save: unique name, location removed by setting
    pg.evaluate("gsetPut('cropGps',false)");pg.evaluate("void(window.__p=gcOpen(C2))");pg.wait_for_selector('#gc.on');pg.evaluate("gcTurn(1)");pg.click('#gcsv');pg.wait_for_selector('#gc.on',state='detached');pg.wait_for_timeout(500)
    ok('Pictures/Camera/c_edit2.jpg' in T(),'second copy gets a unique name (c_edit2.jpg)')
    g=pg.evaluate("""async()=>{const f=__T['Pictures/Camera/c_edit2.jpg'],u=Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0)),M=xfRead(u).M;return{g:M.gps.length,mk:xfText(M,'ifd0',0x10F)}}""")
    ok(g['g']==0 and g['mk']=='HONOR','Keep location off: GPS gone, camera kept')
    pg.evaluate("gsetPut('cropGps',true)")
    # back with unsaved edits asks first
    pg.evaluate("void(window.__p=gcOpen(C2))");pg.wait_for_selector('#gc.on');pg.evaluate("gcTurn(1)")
    ok(pg.evaluate("back()")==1 and pg.evaluate("document.querySelector('#dlg').classList.contains('on')"),'Android back with unsaved edits asks to discard')
    dlgok();ok(not pg.evaluate("GC.on"),'discard closes the editor')
    pg.evaluate("void(window.__p=gcOpen(C2))");pg.wait_for_selector('#gc.on');ok(pg.evaluate("back()")==1 and not pg.evaluate("GC.on"),'Android back with no edits closes at once')
    # not a picture
    pg.evaluate("__cache['mock:/Pictures/Camera/c.jpg']='/junk/c.jpg'");pg.evaluate("void(window.__p=gcOpen(C2))");pg.wait_for_timeout(500)
    ok(not pg.evaluate("GC.on")and "decoded" in pg.inner_text('#toast'),'undecodable file refused with a message: '+pg.inner_text('#toast'))
    # ---------- selection delete through the toolbar still works, no stray errors ----------
    ok(not errs,'no script errors during the run '+str(errs))
    b.close()
print('\n%d failed'%len(fails) if fails else '\nall passed')
raise SystemExit(1 if fails else 0)
