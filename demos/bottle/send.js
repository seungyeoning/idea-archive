/* All coordinates are phone-local. No recording, network sending or timers outside the app loop. */
(function(){
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=t=>1-Math.pow(1-clamp(t),3);
  const mix=(a,b,t)=>a+(b-a)*t;
  class BottleRelease {
    constructor({screen,reduced,onRelease,onInteract}){
      this.screen=screen;this.reduced=reduced;this.onRelease=onRelease;this.onInteract=onInteract;
      this.bottle=screen.querySelector('.launch-bottle');this.paper=screen.querySelector('.launch-quote');
      this.cork=screen.querySelector('.bottle-cork');this.note=screen.querySelector('.bottle-note');
      this.hint=screen.querySelector('.launch-hint');this.release=screen.querySelector('.launch-release');
      this.canvas=screen.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.phase='idle';
      this.release.addEventListener('click',()=>this.send());
      this.bottle.addEventListener('click',e=>{if(e.detail===0)this.send()});
      this.bottle.addEventListener('pointerdown',e=>{
        if(this.phase!=='ready'||!e.isPrimary||e.button!==0)return;
        this.onInteract();
        this.pointer=e.pointerId;this.start={x:e.clientX,y:e.clientY};
        this.scale=this.screen.getBoundingClientRect().width/390;
        this.bottle.setPointerCapture(e.pointerId);e.preventDefault();
      });
      this.bottle.addEventListener('pointermove',e=>{
        if(this.pointer!==e.pointerId)return;
        this.dx=clamp((e.clientX-this.start.x)/this.scale,-78,78);
        this.dy=clamp((e.clientY-this.start.y)/this.scale,-155,35);
        this.say(this.dy<-74?'손을 놓으면, 여정이 시작돼요.':'병을 위로 밀어보세요.');
      });
      const finish=(e,cancelled)=>{
        if(this.pointer!==e.pointerId)return;
        this.pointer=null;
        if(this.bottle.hasPointerCapture(e.pointerId))this.bottle.releasePointerCapture(e.pointerId);
        if(!cancelled&&this.dy<-74)this.send();else this.say('병을 위로 밀어, 바다에 놓아주세요.');
      };
      this.bottle.addEventListener('pointerup',e=>finish(e,false));
      this.bottle.addEventListener('pointercancel',e=>finish(e,true));
      this.bottle.addEventListener('lostpointercapture',e=>finish(e,true));
    }
    say(text){if(this.hint.textContent!==text)this.hint.textContent=text;}
    setPhase(phase){this.phase=phase;this.screen.dataset.phase=phase;this.bottle.disabled=phase!=='ready';this.release.disabled=phase!=='ready';}
    enter(text,direction){
      this.leave();this.elapsed=0;this.time=0;this.dx=0;this.dy=0;this.releaseTime=0;
      this.flowSign=1;
      this.screen.style.opacity='1';this.screen.querySelector('.launch-heading').style.opacity='1';
      this.screen.querySelector('.launch-meta').style.opacity='1';
      this.paper.querySelector('span').textContent=text.slice(0,90);
      this.screen.querySelector('#launch-direction').textContent='일본 어딘가의 당신에게';
      this.screen.querySelector('#launch-heading').innerHTML='이제,<br><em>바람에게.</em>';
      this.setPhase(this.reduced.matches?'ready':'packing');
      this.say(this.phase==='packing'?'당신의 하루를 병에 담는 중':'병을 위로 밀어, 바다에 놓아주세요.');
      const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=390*dpr;this.canvas.height=820*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this.paint();
    }
    leave(){
      const pointer=this.pointer;this.pointer=null;
      if(pointer!=null&&this.bottle.hasPointerCapture(pointer))this.bottle.releasePointerCapture(pointer);
      this.phase='idle';
    }
    send(){
      if(this.phase!=='ready')return;
      this.onInteract();const pointer=this.pointer;this.pointer=null;
      if(pointer!=null&&this.bottle.hasPointerCapture(pointer))this.bottle.releasePointerCapture(pointer);
      this.from={x:this.dx,y:this.dy};this.releaseTime=0;this.setPhase('releasing');
      this.say('잘 가, 나의 작은 이야기.');
      this.screen.querySelector('#launch-heading').innerHTML='어딘가의<br><em>당신에게.</em>';
      if(this.reduced.matches){this.onRelease();return;}
    }
    reduceMotion(){
      if(this.phase==='releasing'){this.onRelease();return;}
      if(this.phase==='packing'){this.elapsed=1.8;this.setPhase('ready');this.say('병을 위로 밀어, 바다에 놓아주세요.');}
      this.time=0;this.dx=0;this.dy=0;this.paint();
    }
    sample(seconds){
      this.elapsed=Math.min(1.8,seconds);this.time=this.reduced.matches?0:seconds;this.dx=0;this.dy=0;
      this.setPhase(seconds<1.8?'packing':seconds<3.2?'ready':'releasing');
      this.releaseTime=Math.max(0,seconds-3.2);this.from={x:0,y:0};
      this.say(seconds<1.8?'당신의 하루를 병에 담는 중':seconds<3.2?'병을 위로 밀어, 바다에 놓아주세요.':'잘 가, 나의 작은 이야기.');
      this.paint();
    }
    tick(dt){
      if(this.phase==='idle')return;
      if(!this.reduced.matches)this.time+=dt/1000;
      if(this.phase==='packing'){
        this.elapsed+=dt/1000;
        if(this.elapsed>=1.8){this.setPhase('ready');this.say('병을 위로 밀어, 바다에 놓아주세요.');}
      }
      if(this.phase==='ready'&&this.pointer==null){const f=1-Math.exp(-dt/100);this.dx*=1-f;this.dy*=1-f;}
      if(this.phase==='releasing'){
        this.releaseTime+=dt/1000;
        if(this.releaseTime>=2.35){this.setPhase('arriving');this.onRelease();return;}
      }
      this.paint();
    }
    paint(){
      const t=this.time||0,packing=this.phase==='packing',releasing=this.phase==='releasing';
      const roll=packing?ease((this.elapsed-.12)/.6):1,insert=packing?ease((this.elapsed-.65)/.65):1;
      this.paper.style.transform=`translateY(${insert*113}px) scale(${mix(1,.125,roll)},${mix(1,.58,roll)}) rotate(${mix(-6,0,roll)}deg)`;
      this.paper.style.borderRadius=`${mix(2,20,roll)}px`;
      this.paper.style.opacity=String(1-clamp((insert-.55)/.45));
      this.note.style.opacity=String(insert);
      const cork=packing?ease((this.elapsed-1.14)/.48):1;
      this.cork.style.transform=`translateY(${mix(-36,0,cork)}px) rotate(${mix(-18,0,cork)}deg)`;
      this.cork.style.opacity=String(packing?clamp((this.elapsed-.98)/.16):1);
      let x=this.dx||0,y=this.dy||0,angle=x*.14,scale=1;
      if(!packing){y+=Math.sin(t*1.3)*3;angle+=Math.sin(t*.75)*4;}
      let travel=0;
      if(releasing){
        travel=ease(this.releaseTime/2.2);x=mix(this.from.x,65*this.flowSign,travel)+Math.sin(travel*Math.PI)*16*this.flowSign;
        y=mix(this.from.y,-182,travel);angle=mix(this.from.x*.14,57*this.flowSign,travel);scale=mix(1,.32,travel);
      }
      this.bottle.style.transform=`translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${scale})`;
      this.bottle.style.opacity=String(releasing?1-clamp((this.releaseTime-2.05)/.3):1);
      this.screen.querySelector('.launch-heading').style.opacity=String(1-travel*.6);
      this.screen.querySelector('.launch-meta').style.opacity=String(1-travel);
      this.water(t,{x:195+x,y:542+y,scale,travel});
    }
    water(t,b){
      const c=this.ctx;c.clearRect(0,0,390,820);
      // Broad, low-contrast bands act as water, never as a drawn flight path.
      for(let j=0;j<9;j++){
        const y=355+j*47+Math.sin(t*.3+j)*7;
        c.beginPath();c.moveTo(-40,y);
        c.bezierCurveTo(90,y-30+Math.sin(t*.35+j)*18,260,y+40,440,y-18);
        c.lineWidth=j%3===0?14:1;c.strokeStyle=j%3===0?'rgba(85,128,124,.04)':'rgba(171,199,176,.09)';c.stroke();
      }
      for(let i=0;i<3;i++){
        const p=((t*.19+i/3)%1),alpha=Math.sin(p*Math.PI)*.23;
        c.beginPath();c.ellipse(b.x,b.y,35*b.scale+p*55,9*b.scale+p*14,-.18,.1*Math.PI,.92*Math.PI);
        c.lineWidth=.9;c.strokeStyle=`rgba(213,223,181,${alpha})`;c.stroke();
        c.beginPath();c.ellipse(b.x,b.y,29*b.scale+p*43,7*b.scale+p*11,-.18,1.17*Math.PI,1.78*Math.PI);c.stroke();
      }
      if(this.phase==='ready'&&this.pointer!=null){
        const a=clamp(-this.dy/74);c.beginPath();c.arc(195,622,9,Math.PI*.5,Math.PI*.5+a*Math.PI*2);c.strokeStyle='#dce3b1';c.lineWidth=1.5;c.stroke();
      }
    }
    state(){return {phase:this.phase,dragX:this.dx,dragY:this.dy,packingSeconds:this.elapsed,releaseSeconds:this.releaseTime};}
  }
  window.BottleRelease=BottleRelease;
})();
