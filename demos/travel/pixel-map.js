/* Whole-map 2px canvas renderer; real OSM geography, schematic itinerary lines. */
'use strict';
window.pixelMapReady=false;
window.pixelBuildingIcon=(key,n,name,color,showLabel)=>L.divIcon({className:'map-marker pixel-map-marker',html:'<span class="map-pin pixel-target" style="--day:'+color+'"><b>'+n+'</b>'+(showLabel?'<span class="pin-label">'+String(name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</span>':'')+'</span>',iconSize:[28,28],iconAnchor:[14,14]});
window.pixelVehicleIcon=()=>L.divIcon({className:'travel-marker pixel-hidden-vehicle',html:'',iconSize:[1,1],iconAnchor:[0,0]});
window.startPixelMap=function(){
 const container=document.getElementById('map'),canvas=document.createElement('canvas');canvas.className='whole-pixel-map';canvas.setAttribute('aria-hidden','true');container.append(canvas);
 const ctx=canvas.getContext('2d',{alpha:false}),base=document.createElement('canvas'),bc=base.getContext('2d',{willReadFrequently:true,alpha:false});
 const scale=2, sprites={}, spriteNames=['train','bus','walker','airport','station','onsen','clocktower','tvtower','canal','market','tree'];
 const spriteFor={airport:'airport',jozankei:'onsen',otaru:'canal',sapporo:'clocktower',station:'station',market:'market',bluepond:'tree',cheese:'market',odori:'tvtower',tanuki:'market',susukino:'station'};
 const P={water:[133,192,180],waterlight:[159,212,202],forest:[126,163,104],grass:[173,192,133],ground:[220,221,174],town:[239,227,186],road:[255,245,213],edge:[183,180,140],highway:[205,155,105]};
 let baseDirty=true,ready=0,frame=0,last=0,failed=0,alive=true;
 const style=document.createElement('style');style.textContent=`
 #map{background:#85c0b4!important}.whole-pixel-map{position:absolute;left:0;top:0;z-index:250;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges}
 #map .leaflet-tile-pane,#map .leaflet-overlay-pane{opacity:0!important}.pixel-hidden-vehicle{visibility:hidden!important}
 .pixel-map-marker .map-pin{border-radius:0!important;background:var(--day)!important;color:#fff5d5!important;box-shadow:2px 2px 0 #28463d!important;border:2px solid #28463d!important;width:24px!important;height:24px!important;transform:none!important;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:14px;position:absolute;left:2px;top:0}
 .pixel-map-marker .map-pin b{font:inherit}.pixel-map-marker .pin-label{background:#fff5d5!important;border:2px solid #28463d!important;border-radius:0!important;color:#28463d!important;box-shadow:2px 2px 0 #28463d!important;left:28px!important;top:0!important;transform:none!important;font-size:14px!important;line-height:18px!important;padding:2px 6px!important;white-space:nowrap}
 .pixel-map-marker:focus{outline:3px dashed #ce7154}.pixel-map-marker .map-pin.selected{outline:3px solid #ce7154;outline-offset:3px}
 @media(max-width:760px){.pixel-map-marker .pin-label{font-size:12px!important;line-height:16px!important;padding:2px 4px!important}}
 `;document.head.append(style);
 function size(){const s=map.getSize();canvas.width=base.width=Math.ceil(s.x/scale);canvas.height=base.height=Math.ceil(s.y/scale);canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';ctx.imageSmoothingEnabled=bc.imageSmoothingEnabled=false;baseDirty=true;}
 function pixelPoint(latlng){const p=map.latLngToContainerPoint(latlng);return {x:Math.round(p.x/scale),y:Math.round(p.y/scale)}}
 function segment(a,b,color,width=1){ctx.fillStyle=color;let x=a.x,y=a.y,dx=Math.abs(b.x-x),sx=x<b.x?1:-1,dy=-Math.abs(b.y-y),sy=y<b.y?1:-1,err=dx+dy;for(let safe=0;safe<9000;safe++){ctx.fillRect(x-Math.floor(width/2),y-Math.floor(width/2),width,width);if(x===b.x&&y===b.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx}if(e<=dx){err+=dx;y+=sy}}}
 function path(points,color,width){for(let i=1;i<points.length;i++)segment(pixelPoint(points[i-1]),pixelPoint(points[i]),color,width)}
 function colorize(r,g,b){
  if(b>r+4&&g>r+4)return P.water;
  if(g>r+7&&g>b+5)return (g<192||r<169)?P.forest:P.grass;
  if(r>211&&g>130&&g<211&&b<164)return P.highway;
  if(r>246&&g>244&&b>228)return P.road;
  if(Math.max(r,g,b)<145)return P.edge;
  if(r>225&&g>217)return P.town;
  if(g>r&&g>b)return P.grass;
  return P.ground;
 }
 function paintBase(){
  bc.fillStyle='#85c0b4';bc.fillRect(0,0,base.width,base.height);let count=0;
  const z=map.getZoom();
  for(const t of Object.values(tiles._tiles||{})){
   const im=t.el;if(!t.loaded||!im.complete||!im.naturalWidth||t.coords.z!==z)continue;
   const nw=map.unproject(L.point(t.coords.x*256,t.coords.y*256),z),p=pixelPoint(nw);
   bc.drawImage(im,0,0,256,256,p.x,p.y,128,128);count++;
  }
  if(count){try{const data=bc.getImageData(0,0,base.width,base.height),d=data.data;const palette=Object.values(P),w=base.width,h=base.height;let ids=new Uint8Array(w*h);for(let i=0;i<ids.length;i++)ids[i]=palette.indexOf(colorize(d[i*4],d[i*4+1],d[i*4+2]));
  // Modal cleanup removes tiny raster-label speckles without blending colors.
  for(let pass=0;pass<2;pass++){const next=new Uint8Array(ids),counts=new Uint8Array(palette.length);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){counts.fill(0);let winner=ids[y*w+x],max=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const id=ids[(y+dy)*w+x+dx],n=++counts[id];if(n>max){max=n;winner=id}}if(max>=4)next[y*w+x]=winner;}ids=next;}
  for(let i=0;i<ids.length;i++){const c=palette[ids[i]];d[i*4]=c[0];d[i*4+1]=c[1];d[i*4+2]=c[2];d[i*4+3]=255}bc.putImageData(data,0,0);}catch(e){failed++;console.warn('Pixel map color processing unavailable',e.message)}}
  ready=count;baseDirty=false;
 }
 function drawSprite(name,p){const im=sprites[name];if(!im)return;ctx.drawImage(im,p.x-16,p.y-31,32,32)}
 function draw(now){
  if(alive)frame=requestAnimationFrame(draw);if(now-last<65&&!baseDirty)return;last=now;if(baseDirty)paintBase();ctx.imageSmoothingEnabled=false;ctx.drawImage(base,0,0);
  routeLayer.eachLayer(l=>{if(l.getLatLngs)path(l.getLatLngs(),l.options.color,l.options.weight>4?4:2)});
  if(replayLine)path(replayLine.getLatLngs(),'#ce7154',3);
  const occupied=[];
  for(const [key,marker] of markers){const p=pixelPoint(marker.getLatLng());const keep=selectedDay!=='all'||['airport','jozankei','otaru','bluepond','cheese','sapporo'].includes(key);if(keep&&!occupied.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<30)){drawSprite(spriteFor[key]||'station',p);occupied.push(p)}}
  if(replayMarker){const p=pixelPoint(replayMarker.getLatLng());const vehicle=selectedDay===4?'walker':selectedDay===1?'bus':'train';drawSprite(vehicle,{x:p.x,y:p.y-5})}
  window.pixelMapReady=ready>0&&Object.keys(sprites).length===spriteNames.length;
 }
 spriteNames.forEach(n=>{const im=new Image();im.onload=()=>{sprites[n]=im};im.onerror=()=>console.warn('Missing pixel sprite '+n);im.src='assets/sprites/'+n+'.png'});
 map.on('move zoom resize',()=>{if(map.getSize().x/2!==canvas.width||map.getSize().y/2!==canvas.height)size();baseDirty=true;});tiles.on('tileload load',()=>baseDirty=true);
 size();frame=requestAnimationFrame(draw);
 window.pixelWorld={canvas,logicalPNG:()=>canvas.toDataURL('image/png'),state:()=>({scale,logical:[canvas.width,canvas.height],tilesVisible:ready,colorFailures:failed,sprites:Object.keys(sprites),zoom:map.getZoom(),running:replayRunning,progress:replayProgress}),redraw:()=>{baseDirty=true},stop:()=>{alive=false;cancelAnimationFrame(frame)},paint:()=>{last=0;draw(performance.now())}};
};
