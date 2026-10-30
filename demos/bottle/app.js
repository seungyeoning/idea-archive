'use strict';
const params=new URLSearchParams(location.search),isCard=params.get('view')==='card';
document.body.classList.toggle('is-card',isCard);
document.querySelector(isCard?'#share-slot':'#preview-slot').append(document.getElementById('phone-template').content.cloneNode(true));
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let releaseScene;
let current='home',previous='home',direction='wind',sent=false,replying=false,original=false,auto=false,autoEpoch=0,capturing=false,progress=0,paused=reduced.matches,follow=true,lastFrame=0,mapEntered=0,toastTimer;
const defaultLetter=$('#letter').value;
const stories={
home:{step:1,title:'바다 건너,<br>오늘의 세 줄.',head:'한국과 일본 사이,<br>서로의 하루를.',body:'한국과 일본 어딘가의 사람과,\n하루 세 줄을 나누는\n익명 교환일기.',note:'짧게 쓰고, 천천히 기다리고,\n서로의 일상을 이어가요.'},
write:{step:2,title:'하루 세 줄이면,<br>이야기가 시작돼요.',head:'대단한 하루가<br>아니어도 괜찮아요.',body:'오늘 먹은 것, 돌아오는 길,\n잠깐 웃었던 순간을 적어요.\n일본 어딘가의 한 사람에게.',note:'세 줄의 하루를 병에 담으면\n바다를 건너는 여정이 시작돼요.'},
launch:{step:2,title:'한 통의 마음을,<br>바다에 놓아주세요.',head:'손끝을 떠나면,<br>여정이 시작돼요.',body:'편지를 돌돌 말아 병에 담고,\n코르크 마개를 닫아요.\n병을 위로 밀어 바다에 놓아보세요.',note:'직접 밀어 보내거나 버튼으로 띄울 수 있어요.'},
map:{step:3,title:'내 병은 지금,<br>어느 바다를 건널까요?',head:'지도를 열면,<br>편지의 여정이 보여요.',body:'부산의 바다에 띄운 작은 병.\n물결에 흔들리고, 잠시 머물다가\n다시 낯선 바다로 흘러가요.',note:'거리에 따라 도착 시간이 달라지는 구상.\n현재 지도와 시간은 시연 예시예요.'},
receipt:{step:4,title:'멀리 흘러간 편지가,<br>한 사람에게 닿았어요.',head:'“당신의 편지를<br>읽었어요.”',body:'누가 내 병을 건졌는지,\n편지를 읽었는지.\n조용히 소식을 전해줘요.',note:'공개 닉네임과 국가로만 확인해요.'},
reply:{step:4,title:'바다 건너에서,<br>작은 답장이 왔어요.',head:'“저도 오늘<br>하늘을 봤어요.”',body:'나와 전혀 다른 하루를 보낸\n누군가가 건네는 한마디.\n가끔은 그걸로 충분하니까.',note:'다른 언어의 편지는 번역해서 읽고,\n서로 원하면 다음 편지를 이어가요.'}
};
const routes={
east:{points:[[35.07,129.18],[34.95,129.40],[34.66,129.65],[34.31,129.92],[34.04,130.14],[33.85,130.26],[33.71,130.32],[33.67,130.35]],name:'하루',country:'일본',en:'JAPAN',initial:'は',language:'일본어',place:'후쿠오카의 바다',ocean:'대한해협',original:'私も今日、空を見ました。\n同じ空を見ていたと思うとうれしいです。\n明日のことも聞かせてください。'},
};
const koreanReply='저도 오늘 하늘을 봤어요.\n같은 하늘을 봤다니 반가워요.\n내일의 하루도 들려주세요.';
let cameraApplying=false;
function setMapView(...args){cameraApplying=true;map.setView(...args);cameraApplying=false;}
let route=routes.east,map,landLayer,bottleMarker,originMarker,camera,wake,routePoints=[],routeLengths=[],routeTotal=0;
let driftTime=0,journeyPhase=0;const LIVE_JOURNEY_SECONDS=64;
function icon(name){return `<svg aria-hidden="true"><use href="#${name}"/></svg>`}
function smoothPoints(points){let out=[];for(let i=0;i<points.length-1;i++){let a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];for(let j=0;j<14;j++){let t=j/14,t2=t*t,t3=t2*t;out.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)))}}out.push(points.at(-1));return out}
function km(a,b){const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;const v=Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v))}
function pointAt(p){const target=p*routeTotal;let i=1;while(i<routeLengths.length-1&&routeLengths[i]<target)i++;const before=routeLengths[i-1],den=routeLengths[i]-before,t=den?(target-before)/den:0,a=routePoints[i-1],b=routePoints[i];return {latlng:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],i}}
function addLabel(latlng,text,kind='place-label'){return L.marker(latlng,{icon:L.divIcon({className:kind,html:kind==='place-label'?`<div><i></i>${text}</div>`:`<div>${text}</div>`,iconSize:kind==='place-label'?[80,20]:[110,28],iconAnchor:kind==='place-label'?[2,10]:[55,14]}),interactive:false,keyboard:false}).addTo(map)}
function initMap(){if(map)return;map=L.map('journey-map',{zoomControl:false,attributionControl:false,preferCanvas:true,zoomSnap:.1,zoomDelta:.5,minZoom:2.5,maxZoom:8.5,maxBounds:[[-65,-185],[80,185]],maxBoundsViscosity:.8,worldCopyJump:false,fadeAnimation:false,zoomAnimation:!reduced.matches,markerZoomAnimation:false,scrollWheelZoom:true});map.setView([34.5,130],6.6);landLayer=L.geoJSON(window.WORLD_DATA,{style:{color:'#b3bdad',weight:.7,fillColor:'#f4f1e5',fillOpacity:1},interactive:false,smoothFactor:1}).addTo(map);
const labels=[[35.1796,129.0756,'부산'],[37.5665,126.978,'서울'],[33.5904,130.4017,'후쿠오카'],[34.6937,135.5023,'오사카'],[35.6762,139.6503,'도쿄'],[31.2304,121.4737,'상하이'],[29.8683,121.544,'닝보'],[25.033,121.5654,'타이베이']];labels.forEach(v=>addLabel([v[0],v[1]],v[2]));
addLabel([36.6,127.9],'대한민국','country-label');addLabel([32.7,131.3],'일본','country-label');addLabel([33.2,118.4],'중국','country-label');addLabel([34.1,128.65],'대한해협','ocean-label');addLabel([29.2,127.4],'동중국해','ocean-label');addLabel([25.8,143.2],'태평양','ocean-label');
// Keep the coast static; only the bottle and its short wake animate.
originMarker=L.circleMarker(route.points[0],{radius:3,color:'#718f91',weight:1.2,fillColor:'#f8f5ea',fillOpacity:1,interactive:false}).addTo(map);
// Leaflet's default coordinate conversion rounds to whole pixels. Keep this moving marker at subpixel precision.
const SmoothMarker=L.Marker.extend({update:function(){if(this._icon&&this._map){const point=this._map.project(this._latlng,this._map.getZoom()).subtract(this._map.getPixelOrigin());L.DomUtil.setPosition(this._icon,point);this._icon.style.zIndex='600';}return this;}});
bottleMarker=new SmoothMarker(route.points[0],{icon:L.divIcon({className:'bottle-pin',html:'<div class="pin-shape"><span class="pin-shadow"></span><svg viewBox="0 0 80 120"><use href="#bottle-mark"/></svg></div>',iconSize:[48,63],iconAnchor:[24,38]}),title:'내 편지 병',alt:'지도 위에서 이동하는 내 편지 병',keyboard:true}).addTo(map);bottleMarker.on('click',()=>toast('내 편지는 '+Math.round(routeTotal*progress)+' km를 흘러왔어요. (예시)'));
wake=new DriftMotion.Wake(map,pointAt);
map.on('dragstart',()=>{follow=false});map.on('zoomstart',()=>{if(!capturing&&!cameraApplying)follow=false});map.on('zoomend',()=>{$$('.country-label').forEach(x=>x.style.opacity=map.getZoom()>6?'0':'1')});
$('#zoom-in').addEventListener('click',()=>{stopAuto();follow=false;map.zoomIn(.5)});$('#zoom-out').addEventListener('click',()=>{stopAuto();follow=false;map.zoomOut(.5)});$('#world-view').addEventListener('click',()=>{stopAuto();follow=false;map.setView([27,130],3.5,{animate:!reduced.matches});});$('#recenter').addEventListener('click',()=>{stopAuto();follow=true;map.setView(camera.center,camera.zoom,{animate:!reduced.matches});});
configureRoute();}
function fitCamera(){map.invalidateSize({animate:false});cameraApplying=true;map.fitBounds(L.latLngBounds(route.points),{paddingTopLeft:[48,175],paddingBottomRight:[48,340],maxZoom:7.2,animate:false});cameraApplying=false;camera={center:map.getCenter(),zoom:map.getZoom()};}
function configureRoute(){route=routes.east;routePoints=smoothPoints(route.points);routeLengths=[0];routeTotal=0;for(let i=1;i<routePoints.length;i++){routeTotal+=km(routePoints[i-1],routePoints[i]);routeLengths.push(routeTotal)}if(!map)return;originMarker.setLatLng(route.points[0]);fitCamera();updateJourney(progress);updateRecipient();}
function updateRecipient(){$('#recipient-name').textContent=route.name;$('#recipient-country').textContent=route.country+' · 공개 닉네임';$('.recipient-mark').textContent=route.initial;$('#retrieved-by').textContent=route.name+'가 병을 건졌어요';$('#reply-country').innerHTML=route.en+'<br>바다를 건너온 편지';$('#reply-signature').textContent='바다 건너에서, '+route.name;$('#reply-message').textContent=original?route.original:koreanReply;$('#translation-label').textContent=original?route.language+' 원문 · 예시':route.language+' → 한국어 · 예시';$('#translation').textContent=original?'번역 보기':'원문 보기';}
function putText(selector,value){const el=$(selector);if(el.textContent!==value)el.textContent=value;}
function renderDrift(seconds){if(!map||!routeTotal)return;const at=DriftMotion.geographicPoint(progress,pointAt),p=DriftMotion.pose(seconds);bottleMarker.setLatLng(at);const body=bottleMarker.getElement().querySelector('.pin-shape');body.style.transform=`translate3d(${p.x}px,${p.y}px,0) rotate(${p.angle}deg) scaleY(${p.scaleY})`;wake.draw(progress,seconds);}
function updateJourney(p,seconds=driftTime){progress=Math.max(0,Math.min(1,p));if(!map)return;renderDrift(seconds);$('#journey-progress').style.transform=`scaleX(${progress})`;putText('#journey-distance',Math.round(routeTotal*progress)+' km');putText('#journey-location',progress>=1?route.place+'에 닿았어요':progress<.15?'부산의 물결에 몸을 맡겼어요':route.ocean+'에서 천천히 표류 중');putText('#journey-day','여정 '+(1+Math.floor(progress*2))+'일째 · 예시');const heading=progress>=1?route.country+'의 '+route.name+'에게<br>편지가 닿았어요.':'어느 바다에서<br>당신을 만날까요?';if($('#journey-heading').innerHTML!==heading)$('#journey-heading').innerHTML=heading;putText('#map-status',progress>=1?'병을 건진 사람이 있어요':'물결을 따라 표류하는 중');const label=progress>=1?'도착 소식 보기':'도착 소식 미리 보기';if($('#see-arrival').dataset.label!==label){$('#see-arrival').dataset.label=label;$('#see-arrival').innerHTML=label+icon('arrow');}}

function show(name,{focus=false,launch=false}={}){if(!stories[name]&&name!=='info')name='home';if(name==='info')previous=current;if(current==='launch'&&name!=='launch')releaseScene.leave();$('.phone').classList.remove('map-arriving');current=name;$$('.screen').forEach(s=>{let on=s.dataset.screen===name;s.classList.toggle('active',on);s.inert=!on;s.setAttribute('aria-hidden',String(!on));});$('.phone').dataset.screen=name;$('#journey-map').inert=name!=='map';$('#journey-map').setAttribute('aria-hidden',String(name!=='map'));$$('.scene-nav [data-go]').forEach(b=>{let on=b.dataset.go===name||(name==='receipt'&&b.dataset.go==='reply');b.classList.toggle('active',on);b.setAttribute('aria-current',on?'step':'false')});const d=stories[name]||stories.home;$('#share-title').innerHTML=d.title;$('#share-step').textContent=['첫 번째, 나의 바다','두 번째, 편지 쓰기','세 번째, 병의 여정','네 번째, 바다 건너 답장'][d.step-1];$('#share-heading').innerHTML=d.head;$('#share-body').textContent=d.body;$('#share-note').textContent=d.note;$$('.share-dots i').forEach((i,n)=>i.classList.toggle('on',n===d.step-1));
if(name==='launch')releaseScene.enter($('#letter').value,direction);
if(name==='map'){initMap();map.invalidateSize({animate:false});follow=true;fitCamera();mapEntered=performance.now();renderDrift(driftTime);}
if(name==='receipt'||name==='reply')updateRecipient();if(focus){const heading=$(`.screen[data-screen="${name}"] h2`)||$(`.screen[data-screen="${name}"] header`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}
}
function stopAuto(){auto=false;$('#demo-play span').textContent='흐름 재생';$('#demo-play use').setAttribute('href','#play')}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>{stopAuto();const dest=b.dataset.go;if(dest==='write'&&current!=='info'){replying=false;$('#letter-title').textContent='오늘의 세 줄.';$('#send').innerHTML='편지를 병에 담기'+icon('arrow');}if(dest==='map'&&!sent){journeyPhase=.36;progress=DriftMotion.progressAt(journeyPhase);}show(dest,{focus:true})}));
function updateCount(){$('#count').textContent=$('#letter').value.length+' / 500';$('#send').disabled=!$('#letter').value.trim()}$('#letter').addEventListener('input',updateCount);updateCount();
function startJourney(){sent=true;progress=0;journeyPhase=0;driftTime=0;paused=reduced.matches;follow=true;initMap();configureRoute();show('map',{focus:true});$('.phone').classList.add('map-arriving');updatePause();if(replying){toast('답장 병을 띄웠어요. (시안 체험)');replying=false;}}
$('#send').addEventListener('click',()=>{if(!$('#letter').value.trim())return;stopAuto();show('launch',{focus:true})});
$('#launch-back').addEventListener('click',()=>{stopAuto();show('write',{focus:true})});
$('#see-arrival').addEventListener('click',()=>{stopAuto();journeyPhase=1;updateJourney(1);show('receipt',{focus:true})});
$('#reply-button').addEventListener('click',()=>{stopAuto();replying=true;show('write');$('#letter-title').textContent=route.name+'에게.';$('#letter').value='';$('#letter').placeholder='당신의 하루도 세 줄로 들려주세요.';$('#send').innerHTML='답장을 병에 담기'+icon('arrow');updateCount();$('#letter').focus()});
$('#translation').addEventListener('click',()=>{original=!original;updateRecipient()});
function returnFromInfo(){show(previous,{focus:true})}$('#close-info').addEventListener('click',returnFromInfo);$('#info-back').addEventListener('click',returnFromInfo);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&current==='info')returnFromInfo();else if(e.key==='Escape'&&current==='launch'){stopAuto();show('write',{focus:true})}});
function updatePause(){$('#map-pause').setAttribute('aria-label',paused?'이동 재생':'이동 일시정지');$('#map-pause').setAttribute('aria-pressed',String(paused));$('#map-pause use').setAttribute('href',paused?'#play':'#pause')}
$('#map-pause').addEventListener('click',()=>{stopAuto();paused=!paused;updatePause()});
$('#demo-play').addEventListener('click',()=>{if(auto){stopAuto();return}auto=true;capturing=false;autoEpoch=performance.now();direction='wind';original=false;replying=false;$('#letter').value=defaultLetter;updateCount();if(map)configureRoute();$('#demo-play span').textContent='재생 멈추기';$('#demo-play use').setAttribute('href','#pause');show('home')});
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000)}
function tide(ms){if(reduced.matches&&!capturing)return;const t=ms/1000;$('#tide-lines').setAttribute('transform',`translate(${Math.sin(t*.5)*12},${Math.cos(t*.6)*5})`);$('.floating-bottle').style.transform=`translate(${Math.sin(t*.8)*5}px,${Math.cos(t*1.15)*6}px) rotate(${24+Math.sin(t*.75)*5}deg)`;}
function timeline(ms){const t=ms%28000;const name=t<2500?'home':t<5000?'write':t<10700?'launch':t<23000?'map':t<25000?'receipt':'reply';if(name!==current)show(name);if(name==='launch')releaseScene.sample((t-5000)/1000);if(name==='map'){journeyPhase=Math.min(1,(t-10700)/12100);driftTime=(t-10700)/1000;updateJourney(DriftMotion.progressAt(journeyPhase),driftTime);}tide(ms);}
function loop(now){const dt=lastFrame?Math.min(now-lastFrame,80):0;lastFrame=now;if(!capturing){if(auto){timeline(now-autoEpoch);}else{if(current==='home')tide(now);if(current==='launch'&&!document.hidden)releaseScene.tick(dt);if(current==='map'&&!paused&&!document.hidden){driftTime+=dt/1000;journeyPhase=Math.min(1,journeyPhase+dt/(LIVE_JOURNEY_SECONDS*1000));updateJourney(DriftMotion.progressAt(journeyPhase),driftTime);}}}requestAnimationFrame(loop)}

reduced.addEventListener('change',()=>{if(reduced.matches){stopAuto();paused=true;updatePause();if(current==='launch')releaseScene.reduceMotion();if(map&&camera)map.setView(camera.center,camera.zoom,{animate:false})}});
function resizePhone(){if(isCard)return;const w=Math.min(390,Math.max(280,innerWidth-24)),scale=w/390;$('.phone-slot').style.width=w+'px';$('.phone-slot').style.height=(820*scale)+'px';$('.phone').style.transform=`scale(${scale})`;if(map)map.invalidateSize({animate:false})}window.addEventListener('resize',resizePhone);resizePhone();
window.renderAt=ms=>{capturing=true;document.body.classList.add('capturing');timeline(ms)};
window.setScreen=name=>{capturing=true;document.body.classList.add('capturing');show(name);tide(1500);if(name==='launch')releaseScene.sample(2);if(name==='map'){journeyPhase=.48;driftTime=8;updateJourney(DriftMotion.progressAt(journeyPhase),driftTime);fitCamera();wake.draw(progress,driftTime);}};
window.captureState=()=>({screen:current,launch:releaseScene.state(),direction,progress,paused,center:map?map.getCenter():null,zoom:map?map.getZoom():null,hasMap:!!map,letterLength:$('#letter').value.length,routeKm:routeTotal,driftTime,journeyPhase,bottlePosition:bottleMarker?bottleMarker.getLatLng():null,bottlePose:DriftMotion.pose(driftTime)});
window.journeyCoordinates=()=>Array.from({length:401},(_,i)=>DriftMotion.geographicPoint(i/400,pointAt));
window.previewDrift=(seconds,phase)=>{capturing=true;document.body.classList.add('capturing');if(current!=='map')show('map');journeyPhase=phase;driftTime=seconds;updateJourney(DriftMotion.progressAt(phase),seconds);};
$('.launch-vessel').innerHTML=$('#bottle-mark').innerHTML;
releaseScene=new BottleRelease({screen:$('.launch-screen'),reduced,onRelease:startJourney,onInteract:stopAuto});
window.ready=Promise.all([document.fonts.ready]).then(()=>{initMap();show(params.get('screen')||'home');updatePause();return true});
requestAnimationFrame(loop);
