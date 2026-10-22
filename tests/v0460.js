/* V0.46.0: contacts export/import parser round trip (no browser, no device). Run: node tests/v0460.js */
const vm=require('vm'),fs=require('fs');
const w={};const ctx={window:w,document:{},toast(){},dlg(){},alert(){},TextDecoder,TextEncoder,URL,Blob};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','www','js','contactsio.js'),'utf8'),ctx);
const IO=ctx.window.cndIO;let bad=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)bad++};
const c1={first:'Ana, Maria',middle:'',last:'Smith; Jr',prefix:'Dr',suffix:'',nickname:'Annie',company:'Acme',department:'R&D',title:'CTO',notes:'Line1\nLine2, with; chars \\ end',
 phones:[{v:'+27 82 123 4567',t:2,l:''},{v:'021 555 0101',t:0,l:'Gym'},{v:'021 555 0102',t:4,l:''}],emails:[{v:'ana@x.com',t:2,l:''}],
 addresses:[{street:'1 Long St',hood:'CBD',city:'Cape Town',region:'WC',postcode:'8001',country:'ZA',pobox:'',t:1,l:''}],
 events:[{v:'--05-17',t:3,l:''},{v:'2010-02-03',t:1,l:''}],websites:[{v:'https://x.com',t:1,l:''}],relations:[{v:'Joe',t:14,l:''},{v:'Pal',t:0,l:'Gym buddy'}],starred:true};
const c2={first:'Zed',middle:'',last:'',prefix:'',suffix:'',nickname:'',company:'',department:'',title:'',notes:'',phones:[{v:'0711112222',t:1,l:''}],emails:[],addresses:[],events:[{v:'1990-12-01',t:3,l:''}],websites:[],relations:[],starred:false};
const v=IO.toVcf(c1)+IO.toVcf(c2);
ok(/BEGIN:VCARD\r\nVERSION:3.0/.test(v)&&v.includes('END:VCARD'),'vcf has envelope');
const back=IO.parseVcf(v);ok(back.length===2,'parsed 2 back');
const b=back[0];
ok(b.first==='Ana, Maria'&&b.last==='Smith; Jr'&&b.prefix==='Dr'&&b.nickname==='Annie','name parts + escapes survive');
ok(b.company==='Acme'&&b.department==='R&D'&&b.title==='CTO','org/title');
ok(b.notes==='Line1\nLine2, with; chars \\ end','notes escapes/newline');
ok(b.phones.length===3&&b.phones[0].t===2&&b.phones[1].t===0&&b.phones[1].l==='Gym'&&b.phones[2].t===4,'phones with types and custom label '+JSON.stringify(b.phones.map(p=>[p.t,p.l])));
ok(b.emails[0].t===2&&b.emails[0].v==='ana@x.com','email');
ok(b.addresses[0].street==='1 Long St'&&b.addresses[0].hood==='CBD'&&b.addresses[0].postcode==='8001'&&b.addresses[0].t===1,'address');
ok(b.events.some(e=>e.t===3&&e.v==='--05-17')&&b.events.some(e=>e.t===1&&e.v==='2010-02-03'),'birthday + anniversary');
ok(b.relations.some(r=>r.t===14&&r.v==='Joe')&&b.relations.some(r=>r.t===0&&r.l==='Gym buddy'),'relations '+JSON.stringify(b.relations));
ok(b.starred===true&&back[1].starred===false,'favourite');
// 2.1 quoted-printable from old Android
const qp='BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=89milie;Zo=C3=AB;;;\r\nTEL;CELL:+27 83 000 1111\r\nTEL;WORK;FAX:021 000 000\r\nBDAY:19850304\r\nNOTE;ENCODING=QUOTED-PRINTABLE:Hello=0Aworld=\r\n and more\r\nEND:VCARD\r\n';
const q=IO.parseVcf(qp)[0];ok(q&&q.last==='Émilie'&&q.first==='Zoë','QP utf-8 name');ok(q.phones[0].t===2&&q.phones[1].t===4,'2.1 bare types');ok(q.events[0].v==='1985-03-04','BDAY compact form');ok(/Hello\nworld and more/.test(q.notes),'QP soft break + newline '+JSON.stringify(q.notes));
ok(IO.parseVcf('garbage').length===0&&IO.parseVcf('').length===0,'garbage / empty file gives nothing, no throw');
ok(IO.parseVcf('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n').length===0,'empty card skipped');
// CSV roundtrip
const csv=IO.toCsv([c1,c2]);const rows=IO.parseCsv(csv);ok(rows.length===3,'csv rows '+rows.length);
const cb=IO.fromCsv(rows);ok(cb.length===2,'csv back 2');
ok(cb[0].first==='Ana, Maria'&&cb[0].last==='Smith; Jr'&&cb[0].notes.includes('Line1\nLine2'),'csv names + multiline notes in quotes');
ok(cb[0].phones.length===3&&cb[0].phones[0].t===2&&cb[0].phones[1].l==='Gym'&&cb[0].phones[2].t===4,'csv phones '+JSON.stringify(cb[0].phones.map(p=>[p.t,p.l])));
ok(cb[0].addresses[0].city==='Cape Town'&&cb[0].events[0].v==='--05-17'&&cb[0].starred,'csv address/birthday/favourite');
// Google/Outlook-ish headers, semicolon delimiter, d/m/y birthday
const g='﻿First Name;Last Name;E-mail Address;Mobile Phone;Home Phone;Birthday;Company\r\nSam;Lee;sam@x.org;0821112222;0215553333;25/12/1980;Co\r\n;;;;;;\r\n';
const gb=IO.fromCsv(IO.parseCsv(g));ok(gb.length===1&&gb[0].first==='Sam'&&gb[0].emails[0].v==='sam@x.org'&&gb[0].phones.length===2&&gb[0].phones[0].t===2&&gb[0].phones[1].t===1,'google/outlook style csv '+JSON.stringify(gb[0]&&gb[0].phones));
ok(gb[0].events[0].v==='1980-12-25','d/m/y birthday');
ok(IO.fromCsv(IO.parseCsv('just one line')).length===0,'csv with no data rows gives nothing');
ok(IO.ymd('2020-13-40')===''&&IO.ymd('x')==='','bad dates rejected');
process.exit(bad?1:0)
