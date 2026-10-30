/* Gentle geographic drift and a short-lived surface wake. No navigation route is drawn. */
(function(){
  const TAU=Math.PI*2;
  const clamp=x=>Math.max(0,Math.min(1,x));
  function progressAt(u){u=clamp(u);return u-.48*Math.sin(TAU*u)/TAU-.14*Math.sin(TAU*3*u)/(TAU*3);}
  function geographicPoint(p,routeAt){
    p=clamp(p);
    const base=routeAt(p).latlng;
    const before=routeAt(clamp(p-.003)).latlng;
    const after=routeAt(clamp(p+.003)).latlng;
    const cos=Math.cos(base[0]*Math.PI/180);
    const east=(after[1]-before[1])*cos,north=after[0]-before[0];
    const length=Math.hypot(east,north)||1;
    const envelope=Math.sin(Math.PI*p)**2;
    const sidewaysKm=envelope*(5.6*Math.sin(TAU*p*1.7)+1.5*Math.sin(TAU*p*3.1));
    return [base[0]+(east/length)*sidewaysKm/111.32,base[1]-(north/length)*sidewaysKm/(111.32*cos)];
  }
  function pose(seconds){
    return {
      x:Math.sin(seconds*.69)*1.35+Math.sin(seconds*.23)*.7,
      y:Math.sin(seconds*1.05)*1.8+Math.sin(seconds*.41)*.8,
      angle:53+Math.sin(seconds*.53)*12+Math.sin(seconds*.21+.8)*5,
      scaleY:1+Math.sin(seconds*1.05)*.018
    };
  }
  class Wake {
    constructor(map,routeAt){
      this.map=map;this.routeAt=routeAt;this.canvas=document.createElement('canvas');
      this.canvas.className='drift-water';this.canvas.setAttribute('aria-hidden','true');
      map.getPane('shadowPane').append(this.canvas);this.ctx=this.canvas.getContext('2d');this.last={progress:0,seconds:0};
      this.resize();map.on('move zoom resize',()=>{this.resize();this.draw(this.last.progress,this.last.seconds)});
    }
    resize(){
      const size=this.map.getSize(),dpr=window.devicePixelRatio||1;
      if(this.width===size.x&&this.height===size.y&&this.dpr===dpr)return;
      this.width=size.x;this.height=size.y;this.dpr=dpr;this.canvas.width=Math.ceil(size.x*dpr);this.canvas.height=Math.ceil(size.y*dpr);
      this.canvas.style.width=size.x+'px';this.canvas.style.height=size.y+'px';this.ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    project(latlng){return this.map.layerPointToContainerPoint(this.map.project(latlng,this.map.getZoom()).subtract(this.map.getPixelOrigin()));}
    draw(progress,seconds){
      this.last={progress,seconds};L.DomUtil.setPosition(this.canvas,this.map.containerPointToLayerPoint([0,0]));const ctx=this.ctx;ctx.clearRect(0,0,this.width,this.height);
      const at=this.project(geographicPoint(progress,this.routeAt)),b=pose(seconds);
      const current={x:at.x+b.x,y:at.y+b.y+6};
      // Only the water immediately behind the bottle remains; the older wake dissipates.
      let samples=[],distance=0,previous=current;
      const segment=.0012;
      for(let i=0;i<190;i++){
        let p=Math.max(0,progress-i*segment);let pt=this.project(geographicPoint(p,this.routeAt));
        const blend=Math.exp(-i/6);pt={x:pt.x+b.x*blend,y:pt.y+b.y*blend+6};
        distance+=Math.hypot(pt.x-previous.x,pt.y-previous.y);
        samples.push({...pt,d:distance});previous=pt;if(distance>54||p===0)break;
      }
      ctx.lineCap='round';ctx.lineJoin='round';
      for(let i=1;i<samples.length;i++){
        const a=samples[i-1],c=samples[i];const f=Math.max(0,1-c.d/54);
        if(f<=0)continue;
        const dx=c.x-a.x,dy=c.y-a.y,length=Math.hypot(dx,dy)||1;
        const nx=-dy/length,ny=dx/length;
        const spread=3.2+Math.sin(c.d*.11-seconds*.5)*1.2;
        const ripple=.78+.22*Math.sin(c.d*.38-seconds*.8);
        for(const side of [-1,1]){
          ctx.beginPath();ctx.moveTo(a.x+nx*spread*side,a.y+ny*spread*side);ctx.lineTo(c.x+nx*spread*side,c.y+ny*spread*side);
          ctx.lineWidth=.7+.55*f;ctx.strokeStyle=`rgba(248,249,235,${.48*f*f*ripple})`;ctx.stroke();
        }
      }
      // Small incomplete arcs spread on the surface instead of a solid ring or a shadow.
      for(let i=0;i<3;i++){
        const phase=((seconds*.21+i/3)%1+1)%1;
        const opacity=Math.sin(phase*Math.PI)*.24;
        const rx=17+phase*18,ry=5+phase*5;
        ctx.beginPath();ctx.ellipse(current.x,current.y+5,rx,ry,-.28,.18*Math.PI,.91*Math.PI);ctx.lineWidth=.9;ctx.strokeStyle=`rgba(248,249,235,${opacity})`;ctx.stroke();
        ctx.beginPath();ctx.ellipse(current.x,current.y+5,rx*.87,ry*.78,-.28,1.15*Math.PI,1.75*Math.PI);ctx.strokeStyle=`rgba(84,126,130,${opacity*.45})`;ctx.stroke();
      }
    }
  }
  window.DriftMotion={progressAt,geographicPoint,pose,Wake};
})();
