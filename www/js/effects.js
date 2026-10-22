/* effects.js: floating background effects behind the whole app. Smoke, bubbles, rain drops, waterfall (fast rain with mist), dog paws.
   One canvas behind the UI, coloured by your accent, paused while the app is hidden, strength Calm / Normal / Wild in Settings.
   Loaded before ui.js; ui.js apply() calls fxApply() whenever a setting changes. */
const FXN={smoke:'Smoke',bubbles:'Bubbles',drops:'Rain drops',fall:'Waterfall',paws:'Paws'};
const FX={cv:null,cx:null,w:0,h:0,d:1,P:[],mode:'off',raf:0,last:0,spr:null,sprKey:''};
const rnd=(a,b)=>a+Math.random()*(b-a);
const rgb=hex=>{const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex||'');return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[0,229,255]};
const rgba=(c,a)=>'rgba('+c[0]+','+c[1]+','+c[2]+','+Math.max(0,Math.min(1,a)).toFixed(3)+')';
const fxMul=()=>[.5,1,1.8][S.settings.fxLevel]||1;
const FXT={smoke:12,bubbles:28,drops:80,fall:260,paws:9};

/* a soft round puff, drawn once and stretched for every smoke and mist particle */
function fxSprite(){
 const light=['paper','generic'].includes(document.body.dataset.theme),key=light?'l':'d';if(FX.spr&&FX.sprKey===key)return;
 const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64),t=light?'40,60,70':'235,245,250';
 r.addColorStop(0,'rgba('+t+',1)');r.addColorStop(.45,'rgba('+t+',.35)');r.addColorStop(1,'rgba('+t+',0)');g.fillStyle=r;g.fillRect(0,0,128,128);FX.spr=c;FX.sprKey=key}

function fxSize(){
 if(!FX.cv)return;FX.d=Math.min(window.devicePixelRatio||1,1.5);
 FX.w=FX.cv.width=Math.round(innerWidth*FX.d);FX.h=FX.cv.height=Math.round(innerHeight*FX.d)}

function fxSpawn(init){
 const m=FX.mode,w=FX.w,h=FX.h,d=FX.d,p={k:m,x:rnd(0,w),y:0,vx:0,vy:0,r:0,gr:0,pk:0,age:0,life:0,ph:rnd(0,6.28),rot:0,vr:0,len:0,lw:1,a:1,wob:0,x0:0,land:0};
 if(m==='smoke'){p.r=rnd(40,100)*d;p.gr=rnd(10,22)*d;p.vy=-rnd(20,48)*d;p.vx=rnd(-10,10)*d;p.pk=rnd(.07,.15);p.life=rnd(7,13);p.y=init?rnd(0,h):h+p.r*.5;if(init)p.age=rnd(0,p.life*.8)}
 else if(m==='bubbles'){p.r=rnd(5,26)*d;p.vy=-rnd(28,75)*d;p.wob=rnd(6,18)*d;p.x0=p.x;p.y=init?rnd(0,h):h+p.r}
 else if(m==='drops'){p.len=rnd(10,22)*d;p.vy=rnd(520,820)*d;p.vx=-rnd(20,60)*d;p.a=rnd(.25,.5);p.lw=1.2*d;p.land=rnd(h*.45,h);p.y=init?rnd(0,p.land):-p.len}
 else if(m==='fall'){p.len=rnd(50,130)*d;p.vy=rnd(1500,2300)*d;p.vx=-rnd(0,40)*d;p.a=rnd(.14,.34);p.lw=rnd(1.2,2.8)*d;p.land=h+p.len;p.y=init?rnd(-p.len,h):-p.len}
 else if(m==='paws'){p.r=rnd(20,42)*d;p.vy=-rnd(14,34)*d;p.vx=rnd(-10,10)*d;p.rot=rnd(0,6.28);p.vr=rnd(-.35,.35);p.pk=rnd(.16,.3);p.life=rnd(9,16);p.y=init?rnd(0,h):h+p.r;if(init)p.age=rnd(0,p.life*.8)}
 FX.P.push(p)}

function fxPaw(g,s){
 g.beginPath();g.ellipse(0,.24*s,.5*s,.38*s,0,0,6.2832);
 [[-.62,-.1,-.35],[-.22,-.5,-.1],[.22,-.5,.1],[.62,-.1,.35]].forEach(([x,y,r])=>{g.moveTo(x*s+.2*s,y*s);g.ellipse(x*s,y*s,.2*s,.28*s,r,0,6.2832)});g.fill()}

function fxTick(ts){
 FX.raf=requestAnimationFrame(fxTick);
 const dt=Math.min(.05,(ts-FX.last)/1000||0);FX.last=ts;
 const g=FX.cx,w=FX.w,h=FX.h,d=FX.d,acc=rgb(S.settings.acc),neu=['paper','generic'].includes(document.body.dataset.theme)?[40,60,70]:[235,245,250],m=FX.mode;
 g.clearRect(0,0,w,h);let live=0;const P=FX.P;
 for(let i=P.length-1;i>=0;i--){
  const p=P[i];p.age+=dt;let dead=false;
  if(p.k==='smoke'){const k=p.age/p.life;if(k>=1)dead=true;else{p.x+=p.vx*dt+Math.sin(p.ph+p.age*.7)*8*dt*d;p.y+=p.vy*dt;p.r+=p.gr*dt;g.globalAlpha=p.pk*Math.sin(Math.PI*k);g.drawImage(FX.spr,p.x-p.r,p.y-p.r,p.r*2,p.r*2)}}
  else if(p.k==='bubbles'){p.y+=p.vy*dt;const x=p.x0+Math.sin(p.ph+p.age*1.6)*p.wob;if(p.y<-p.r)dead=true;else{const a=Math.min(1,p.age*2);
   g.globalAlpha=1;g.beginPath();g.arc(x,p.y,p.r,0,6.2832);g.fillStyle=rgba(acc,.07*a);g.fill();g.lineWidth=1.5*d;g.strokeStyle=rgba(acc,.55*a);g.stroke();
   g.beginPath();g.arc(x-p.r*.35,p.y-p.r*.35,p.r*.2,0,6.2832);g.fillStyle=rgba(neu,.5*a);g.fill()}}
  else if(p.k==='drops'||p.k==='fall'){p.y+=p.vy*dt;p.x+=p.vx*dt;
   if(p.y>=p.land){dead=true;if(p.k==='drops')P.push({k:'rip',x:p.x,y:p.land,r:1,age:0,life:.9})}
   else{g.globalAlpha=1;g.strokeStyle=rgba(acc,p.a);g.lineWidth=p.lw;g.lineCap='round';g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x-p.vx/p.vy*p.len,p.y-p.len);g.stroke()}}
  else if(p.k==='rip'){const k=p.age/p.life;if(k>=1)dead=true;else{g.globalAlpha=1;g.strokeStyle=rgba(acc,.4*(1-k));g.lineWidth=1.2*d;g.beginPath();g.ellipse(p.x,p.y,1+k*28*d,(1+k*28*d)*.35,0,0,6.2832);g.stroke()}}
  else if(p.k==='paws'){const k=p.age/p.life;if(k>=1)dead=true;else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=rgba(acc,p.pk*Math.sin(Math.PI*k));g.globalAlpha=1;fxPaw(g,p.r);g.restore()}}
  if(dead){P[i]=P[P.length-1];P.pop()}else if(p.k===m)live++}
 g.globalAlpha=1;
 /* the waterfall throws mist where it lands */
 if(m==='fall'&&Math.random()<.4*fxMul()){const r=rnd(60,140)*d;P.push({k:'smoke',x:rnd(0,w),y:h-rnd(0,24*d),vx:rnd(-8,8)*d,vy:-rnd(10,30)*d,r,gr:rnd(10,24)*d,pk:.09,age:0,life:rnd(2.5,4),ph:rnd(0,6.28)})}
 const want=Math.round(FXT[m]*fxMul());let n=0;while(live<want&&n<4){fxSpawn(false);live++;n++}
 if(P.length>want*3+60)P.splice(0,P.length-want*3-60)}

function fxStop(){if(FX.raf)cancelAnimationFrame(FX.raf);FX.raf=0;if(FX.cx)FX.cx.clearRect(0,0,FX.w,FX.h);if(FX.cv)FX.cv.style.display='none'}
function fxApply(){
 const m=S.settings.fx,on=!!FXN[m];document.body.classList.toggle('fx',on);
 if(!on){FX.mode='off';FX.P=[];fxStop();return}
 if(!FX.cv){const c=document.createElement('canvas');c.id='fx';c.setAttribute('aria-hidden','true');document.body.insertBefore(c,document.body.firstChild);FX.cv=c;FX.cx=c.getContext('2d');addEventListener('resize',fxSize)}
 FX.cv.style.display='';fxSprite();fxSize();
 if(m!==FX.mode){FX.mode=m;FX.P=[];const n=Math.round(FXT[m]*fxMul());for(let i=0;i<n;i++)fxSpawn(true)}
 if(!FX.raf&&!document.hidden){FX.last=performance.now();FX.raf=requestAnimationFrame(fxTick)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(FX.raf){cancelAnimationFrame(FX.raf);FX.raf=0}}else if(FX.mode!=='off'&&!FX.raf){FX.last=performance.now();FX.raf=requestAnimationFrame(fxTick)}});
