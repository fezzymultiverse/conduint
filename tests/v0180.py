"""V0.18.0 tests: EXIF tool (reader, safe writer, Information sheet). Run: python3 tests/v0180.py"""
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
LIB="""
window.T={};
T.jpeg=async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,64,48);gr.addColorStop(0,'#0ff');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,64,48);
 const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));return new Uint8Array(await b.arrayBuffer())};
T.rat=(tag,n,d,le)=>{const r=new Uint8Array(8),v=new DataView(r.buffer);v.setUint32(0,n,le);v.setUint32(4,d,le);return{tag,type:5,count:1,raw:r}};
T.rats=(tag,a,le)=>{const r=new Uint8Array(a.length*8),v=new DataView(r.buffer);a.forEach(([n,d],i)=>{v.setUint32(i*8,n,le);v.setUint32(i*8+4,d,le)});return{tag,type:5,count:a.length,raw:r}};
T.asc=(tag,s)=>xfAscii(tag,s);
T.rich=(le)=>({le,ifd0:[T.asc(0x10F,'HONOR'),T.asc(0x110,'HONOR X5b'),xfShort(0x112,6,le)],
 exif:[T.rat(0x829A,1,120,le),T.rat(0x829D,18,10,le),xfShort(0x8827,100,le),T.rat(0x920A,500,100,le),T.asc(0x9003,'2026:10:10 13:35:00'),{tag:0x927C,type:7,count:20,raw:new Uint8Array(20).fill(7)}],
 gps:[T.asc(1,'S'),T.rats(2,[[33,1],[55,1],[3000,100]],le),T.asc(3,'E'),T.rats(4,[[18,1],[30,1],[0,1]],le)]});
T.seg=(m,payload)=>{const n=payload.length+2,o=new Uint8Array(n+2);o[0]=255;o[1]=m;o[2]=n>>8;o[3]=n&255;o.set(payload,4);return o};
T.cat=(...a)=>{const n=a.reduce((x,y)=>x+y.length,0),o=new Uint8Array(n);let p=0;a.forEach(x=>{o.set(x,p);p+=x.length});return o};
T.dec=async u=>{try{const b=await createImageBitmap(new Blob([u],{type:'image/jpeg'}));b.close&&b.close();return true}catch{return false}};
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':360,'height':740});pg.add_init_script(SEED)
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(url);pg.wait_for_timeout(700);pg.evaluate(LIB)
    ok(not errs,'no script errors on load '+str(errs))
    ok(pg.evaluate("typeof xfOpen==='function'&&typeof xfPack==='function'&&VER==='V0.18.0'"),'module loaded, version V0.18.0')
    for le in ('false','true'):
        nm='little-endian' if le=='true' else 'big-endian'
        r=pg.evaluate("""async le=>{const j=await T.jpeg(),M=T.rich(le),n=xfPack(j,M,false),rd=xfRead(n),f=xfFacts(rd.M);
          return{dec:await T.dec(n),fmt:rd.fmt,dev:f.dev,hero:f.hero,la:f.la,lo:f.lo,mn:!!xfGet(rd.M,'exif',0x927C),or:xfNum(rd.M,'ifd0',0x112),tk:xfText(rd.M,'exif',0x9003),soi:n[0]===255&&n[1]===216}}""",le=='true')
        ok(r['dec'] and r['soi'] and r['fmt']=='JPEG','%s: rebuilt JPEG decodes and re-reads'%nm)
        ok(r['dev']=='HONOR X5b' and r['hero']==['1/120','ƒ/1.8','ISO 100','5 mm'],'%s: camera and exposure read back %s'%(nm,r['hero']))
        ok(abs(r['la']+33.925)<1e-6 and abs(r['lo']-18.5)<1e-6,'%s: GPS south/east signs and degrees correct (%s, %s)'%(nm,r['la'],r['lo']))
        ok(r['mn'] is False and r['or']==6 and r['tk']=='2026:10:10 13:35:00','%s: MakerNote dropped on purpose, orientation and date kept'%nm)
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false),M=xfRead(a).M;xfApply(M,{caption:'Table Mountain',artist:'Fezzy',copyright:'999',taken:'2026:01:02 03:04:05'});
      const n=xfPack(a,M,false),m=xfRead(n).M;return{c:xfText(m,'ifd0',0x10E),ar:xfText(m,'ifd0',0x13B),cp:xfText(m,'ifd0',0x8298),t:xfText(m,'exif',0x9003),mk:xfText(m,'ifd0',0x10F),g:m.gps.length,dec:await T.dec(n)}}""")
    ok(r=={'c':'Table Mountain','ar':'Fezzy','cp':'999','t':'2026:01:02 03:04:05','mk':'HONOR','g':4,'dec':True},'edit caption, artist, copyright, date: other fields untouched '+str(r))
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(true),false),M=xfRead(a).M;xfApply(M,{caption:'x'});xfApply(M,{caption:''});return{c:xfText(M,'ifd0',0x10E),n:M.ifd0.filter(e=>e.tag===0x10E).length}}""")
    ok(r=={'c':'','n':0},'empty value removes the field')
    r=pg.evaluate("""async()=>{let bad='';try{xfApply({ifd0:[],exif:[],gps:[]},{taken:'yesterday'})}catch(e){bad=e.message}return bad}""")
    ok('not valid' in r,'bad date refused: '+r)
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false),M=xfRead(a).M;xfApply(M,{noGps:true});const n=xfPack(a,M,false),m=xfRead(n).M;return{g:m.gps.length,mk:xfText(m,'ifd0',0x10F),dec:await T.dec(n)}}""")
    ok(r=={'g':0,'mk':'HONOR','dec':True},'remove location keeps everything else '+str(r))
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false),enc=s=>new TextEncoder().encode(s);
      const xmp=T.seg(0xE1,T.cat(enc('http://ns.adobe.com/xap/1.0/\\0'),enc('<x/>'))),icc=T.seg(0xE2,T.cat(enc('ICC_PROFILE\\0'),new Uint8Array(30))),com=T.seg(0xFE,enc('hello')),ipt=T.seg(0xED,enc('Photoshop 3.0\\0'));
      const w=T.cat(a.subarray(0,2),xmp,icc,com,ipt,a.subarray(2)),clean=xfPack(w,xfKeepOrient(xfRead(w).M),true),s=xfSplit(clean).segs.map(x=>x.m.toString(16));
      const hasX=clean.length&&s.includes('fe')||s.includes('ed');let xm=false;xfSplit(clean).segs.forEach(x=>{if(x.m===0xE1&&xa(clean,x.s+4,21)==='http://ns.adobe.com/x')xm=true});
      const m=xfRead(clean).M;return{dec:await T.dec(clean),segs:s,xmp:xm,icc:s.includes('e2'),or:m?xfNum(m,'ifd0',0x112):null,mk:m?xfText(m,'ifd0',0x10F):null,gps:m?m.gps.length:-1}}""")
    ok(r['dec'] and not r['xmp'] and 'fe' not in r['segs'] and 'ed' not in r['segs'],'remove all metadata strips XMP, IPTC, comments '+str(r['segs']))
    ok(r['icc'] and r['or']==6 and r['mk']=='' and r['gps']==0,'colour profile and orientation kept, camera and GPS gone')
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),out={};for(const [k,u] of [['trunc',j.subarray(0,30)],['noscan',j.subarray(0,j.length-0).slice(0,2)]]){try{xfPack(u,null,false);out[k]='no error'}catch(e){out[k]=e.message}}
      try{xfRead(new Uint8Array([1,2,3,4,5]));out.junk='read ok'}catch(e){out.junk=e.message}return out}""")
    ok('damaged' in r['trunc'] or 'no picture' in r['trunc'],'truncated JPEG refused: '+r['trunc'])
    ok(r['junk']=='read ok','unknown format reads as no EXIF without throwing')
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false);let s=1,th=0,ok=0;const rnd=()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff,t0=performance.now();
      for(let k=0;k<400;k++){const m=a.slice();for(let q=0;q<1+Math.floor(rnd()*8);q++)m[20+Math.floor(rnd()*Math.min(300,m.length-20))]=Math.floor(rnd()*256);
       try{xfRead(m);ok++}catch(e){if(!(e instanceof Error))th++;else ok++}}return{ok,th,ms:performance.now()-t0}}""")
    ok(r['ok']==400 and r['th']==0 and r['ms']<3000,'400 corrupted EXIF blocks: no crash, no hang (%d ms)'%r['ms'])
    r=pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false),M=xfRead(a).M,t=xfBuild(M),enc=s=>new TextEncoder().encode(s);
      const dv=n=>{const o=new Uint8Array(4);new DataView(o.buffer).setUint32(0,n);return o},ch=(t,d)=>T.cat(dv(d.length),enc(t),d,new Uint8Array(4));
      const png=T.cat(new Uint8Array([137,80,78,71,13,10,26,10]),ch('IHDR',new Uint8Array(13)),ch('eXIf',t),ch('IEND',new Uint8Array(0)));
      const wd=T.cat(enc('Exif\\0\\0'),t),le=n=>{const o=new Uint8Array(4);new DataView(o.buffer).setUint32(0,n,true);return o};
      const body=T.cat(enc('WEBP'),enc('EXIF'),le(wd.length),wd,wd.length&1?new Uint8Array(1):new Uint8Array(0)),webp=T.cat(enc('RIFF'),le(body.length),body);
      return{png:xfRead(png),webp:xfRead(webp)}}""" )
    ok(r['png']['fmt']=='PNG' and r['png']['M']['ifd0'][0]['tag'],'PNG eXIf chunk read')
    ok(r['webp']['fmt']=='WebP' and r['webp']['M']['ifd0'][0]['tag'],'WebP EXIF chunk read (with Exif header)')
    # ---- the sheet, end to end with an in-memory file handle ----
    pg.evaluate("""async()=>{const j=await T.jpeg(),a=xfPack(j,T.rich(false),false);T.f=new File([a],'IMG_0001.jpg',{type:'image/jpeg'});T.wrote=null;
      T.it={name:'IMG_0001.jpg',size:a.length,mtime:Date.now(),fh:{getFile:async()=>T.f,createWritable:async()=>({write:async d=>{T.wrote=new Uint8Array(await new Blob([d]).arrayBuffer())},close:async()=>{}})}};
      xfOpen(T.it)}""");pg.wait_for_timeout(500)
    ok(pg.evaluate("document.querySelector('#xf').classList.contains('on')"),'Information sheet opens')
    heads=pg.evaluate("[...document.querySelectorAll('#xf .xfg h5')].map(x=>x.textContent)")
    ok(heads[:4]==['Camera','Exposure','Date','Image'] and 'Location' in heads and 'File' in heads,'groups: '+','.join(heads))
    ok('HONOR X5b' in pg.evaluate("document.querySelector('#xf .xfhero').textContent") and '1/120' in pg.evaluate("document.querySelector('#xf .xfhero').textContent"),'summary strip shows device and exposure')
    box=pg.evaluate("(()=>{const r=document.querySelector('#xf .xfbox').getBoundingClientRect();return[r.left,r.right,r.bottom,r.height]})()")
    ok(box[0]>=0 and box[1]<=360 and abs(box[2]-740)<2 and box[3]<=740*0.89,'sheet fits a 360 px phone '+str([round(x) for x in box]))
    sq=pg.evaluate("[...document.querySelectorAll('#xf .xfg')].filter(g=>g.scrollHeight>g.clientHeight+1).length")
    ok(sq==0,'no card is squashed or clipped (clipped: %d)'%sq)
    ok(pg.evaluate("[...document.querySelectorAll('#xf .xfg')].every(g=>g.querySelectorAll('.xfr').length>0)"),'every card shows its rows')
    pg.screenshot(path='/tmp/xf_view.png')
    pg.click('#xf .xff .chip.on');pg.wait_for_timeout(150)
    ok(pg.evaluate("!!document.querySelector('#xfc')&&document.querySelector('#xfa').value===''&&document.querySelector('#xfd').value.startsWith('2026-10-10T13:35')"),'Edit view: fields filled from the file')
    pg.fill('#xfc','Sunset over the Cape');pg.fill('#xfa','@philfesters')
    pg.screenshot(path='/tmp/xf_edit.png')
    pg.click('#xf .xff .chip.on');pg.wait_for_timeout(150)
    ok(pg.evaluate("document.querySelector('#dlg').classList.contains('on')"),'confirm dialog before writing')
    pg.click('#dk');pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelector('#dtt').textContent")=='No backup possible','no backup possible here, so it asks first (nothing on this fake handle can keep one)')
    pg.click('#dk');pg.wait_for_timeout(600)
    r=pg.evaluate("""async()=>{if(!T.wrote)return null;const m=xfRead(T.wrote).M;return{c:xfText(m,'ifd0',0x10E),a:xfText(m,'ifd0',0x13B),mk:xfText(m,'ifd0',0x10F),g:m.gps.length,dec:await T.dec(T.wrote),busy:document.querySelector('#busy').classList.contains('on')}}""")
    ok(r and r['c']=='Sunset over the Cape' and r['a']=='@philfesters' and r['mk']=='HONOR' and r['g']==4 and r['dec'],'file written: caption saved, camera and GPS intact, still decodes '+str(r))
    ok(r and r['busy'] is False,'busy overlay closed after saving')
    ok(pg.evaluate("document.querySelector('#xf .xfr b') !== null && /Sunset over the Cape/.test(document.querySelector('#xf').textContent)"),'sheet shows the new caption after saving')
    # remove location path
    pg.click('#xf .xff .chip.on');pg.wait_for_timeout(150)
    pg.click('#xf .xfdz .chip.danger >> nth=0');pg.wait_for_timeout(150);pg.click('#dk');pg.wait_for_timeout(300);pg.click('#dk');pg.wait_for_timeout(600)
    ok(pg.evaluate("xfRead(T.wrote).M.gps.length")==0,'Remove location writes a file with no GPS')
    ok(pg.evaluate("!([...document.querySelectorAll('#xf .xfg h5')].map(x=>x.textContent).includes('Location'))"),'Location card gone from the sheet')
    # back handler
    pg.evaluate("XF.edit=true;xfPaint()");pg.evaluate("xfBack()")
    ok(pg.evaluate("XF.on&&!XF.edit"),'back leaves Edit first')
    pg.evaluate("xfBack()");ok(pg.evaluate("!XF.on&&!document.querySelector('#xf').classList.contains('on')"),'back closes the sheet')
    # non-EXIF picture
    pg.evaluate("""xfOpen({name:'plain.gif',size:10,mtime:0,file:new File([new Uint8Array([71,73,70,56,57,97,1,0,1,0])],'plain.gif')})""");pg.wait_for_timeout(300)
    ok('EXIF can be read from JPEG, PNG and WebP' in pg.evaluate("document.querySelector('#xf .xfb').textContent"),'unsupported format explained, no crash')
    ok(not errs,'no script errors during the run '+str(errs))
    b.close()
print('\nFAILED: '+str(len(fails)) if fails else '\nALL PASSED')
raise SystemExit(1 if fails else 0)
