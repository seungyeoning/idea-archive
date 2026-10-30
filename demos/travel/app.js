'use strict';
const $ = id => document.getElementById(id);
const PLACES = {
 airport:{name:'신치토세공항',ja:'新千歳空港',lat:42.7870,lng:141.6801,kind:'공항',aliases:['신치토세공항','신치토세 공항','新千歳空港','new chitose airport']},
 jozankei:{name:'조잔케이 온천',ja:'定山渓温泉',lat:42.9684,lng:141.1643,kind:'온천 마을',aliases:['조잔케이 온천','조잔케이','定山渓温泉','jozankei onsen']},
 market:{name:'삿포로 장외시장',ja:'札幌市中央卸売市場 場外市場',lat:43.0706,lng:141.3228,kind:'시장',aliases:['삿포로 장외시장','장외시장','sapporo central wholesale market','札幌場外市場']},
 otaru:{name:'오타루 운하',ja:'小樽運河',lat:43.2006,lng:141.0015,kind:'산책',aliases:['오타루 운하','오타루운하','오타루','小樽運河','otaru canal']},
 sapporo:{name:'삿포로 도심',ja:'札幌',lat:43.0618,lng:141.3545,kind:'도시 중심 · 대표 좌표',aliases:['삿포로 도심','삿포로','sapporo city','札幌中心部']},
 bluepond:{name:'비에이 청의호수',ja:'白金青い池',lat:43.4935,lng:142.6140,kind:'호수',aliases:['비에이 청의호수','청의호수','청의 호수','비에이 푸른연못','biei blue pond','白金青い池']},
 cheese:{name:'후라노 치즈공방',ja:'富良野チーズ工房',lat:43.3162,lng:142.3760,kind:'들러보기',aliases:['후라노 치즈공방','치즈공방','furano cheese factory','富良野チーズ工房']},
 odori:{name:'오도리공원',ja:'大通公園',lat:43.0598,lng:141.3478,kind:'공원',aliases:['오도리공원','오도리 공원','odori park','大通公園']},
 tanuki:{name:'다누키코지',ja:'狸小路商店街',lat:43.0558,lng:141.3514,kind:'상점가',aliases:['다누키코지','타누키코지','tanukikoji','狸小路']},
 susukino:{name:'스스키노',ja:'すすきの',lat:43.0551,lng:141.3538,kind:'동네 산책',aliases:['스스키노','susukino','すすきの']},
 station:{name:'삿포로역',ja:'札幌駅',lat:43.0687,lng:141.3508,kind:'기차역',aliases:['삿포로역','삿포로 역','sapporo station','札幌駅']}
};
const SAMPLE='DAY 1 · 온천으로 시작하기\n신치토세공항 → 조잔케이 온천\n\nDAY 2 · 시장과 바다\n삿포로 장외시장 → 오타루 운하 → 삿포로\n\nDAY 3 · 조금 더 멀리\n삿포로 → 비에이 청의호수 → 후라노 치즈공방 → 삿포로\n\nDAY 4 · 도시를 천천히\n오도리공원 → 다누키코지 → 스스키노\n이름을 적어둔 카페\n\nDAY 5 · 다음 여행까지\n삿포로역 → 신치토세공항';
const COLORS=['#ce7154','#3f6e4c','#477f91','#b58b3f','#89708d'];
const SHORT_TITLES=['온천으로','시장과 바다','조금 더 멀리','도시 산책','돌아가는 길'];
const storageKey='trip-note-map-pixel-v1';
let plan={raw:SAMPLE,items:[],days:[]},selectedDay='all',selectedId=null,reviewId=null,sourceMode=false;
let markerLayer,routeLayer,markers=new Map(),replayMarker=null,replayLine=null,replayPath=[],replayProgress=0,replayRunning=false,replayFrame=null,replayStart=0,replayDuration=14000;
let savedNoticeShown=false,toastTimer,tileSuccess=0,tileFailure=0;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const colorFor=day=>COLORS[(Number(day)-1)%COLORS.length];
const normalize=t=>t.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const escapeHTML=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const icon=name=>'<svg class="icon"><use href="#'+name+'"/></svg>';
function parse(raw){
 const items=[],dayMap=new Map();let currentDay=1,uid=0;
 raw.split(/\r?\n/).forEach((original,lineIndex)=>{
  const line=original.trim();if(!line)return;
  const match=line.match(/^(?:day\s*(\d+)|(\d+)\s*일차)(?:\s*[·:：|.\-]\s*|\s+)?(.*)$/i);
  if(match){currentDay=Math.min(Math.max(Number(match[1]||match[2]),1),30);dayMap.set(currentDay,match[3].trim()||'여행 '+currentDay+'일차');return;}
  if(/^(메모|참고|note)\s*[:：]/i.test(line))return;
  if(!dayMap.has(currentDay))dayMap.set(currentDay,'여행 '+currentDay+'일차');
  line.split(/\s*(?:→|->|=>|⇒|＞|\|)\s*/).filter(Boolean).forEach(segment=>{
   const clean=segment.replace(/^\s*[-*•]\s*/,'').replace(/^\d{1,2}:\d{2}\s*/,'').trim();if(!clean)return;
   const n=normalize(clean),exact=Object.entries(PLACES).find(([,p])=>p.aliases.some(a=>normalize(a)===n));
   const candidates=Object.entries(PLACES).flatMap(([key,p])=>p.aliases.filter(a=>n.includes(normalize(a))).map(a=>({key,length:normalize(a).length}))).sort((a,b)=>b.length-a.length);
   const key=exact?exact[0]:candidates[0]?.key||null;
   items.push({id:'p'+uid++,day:currentDay,raw:clean,lineIndex,key,excluded:false});
  });
 });
 return {raw,items,days:[...dayMap.entries()].sort((a,b)=>a[0]-b[0]).map(([id,title])=>({id,title}))};
}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:1,plan}));}catch{if(!savedNoticeShown){toast('이 브라우저에서는 저장할 수 없어요. 현재 화면은 계속 사용할 수 있어요.');savedNoticeShown=true;}}}
function load(){try{const v=JSON.parse(localStorage.getItem(storageKey)||'null');if(v?.version===1&&typeof v.plan?.raw==='string'&&v.plan.raw.length<=20000){const parsed=parse(v.plan.raw);for(const item of parsed.items){const old=v.plan.items?.find(o=>o.id===item.id&&o.raw===item.raw);if(old){if(old.key&&PLACES[old.key])item.key=old.key;item.excluded=old.excluded===true;}}plan=parsed;return;}}catch{}plan=parse(SAMPLE);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function visibleItems(){return plan.items.filter(i=>!i.excluded&&i.key&&(selectedDay==='all'||i.day===Number(selectedDay)));}
function unresolved(){return plan.items.filter(i=>!i.key&&!i.excluded);}
const map=L.map('map',{zoomControl:false,attributionControl:true,zoomSnap:1,zoomDelta:1,scrollWheelZoom:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([43.05,141.65],7);
L.control.zoom({position:'bottomright'}).addTo(map);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,minZoom:4,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',crossOrigin:true});
tiles.on('tileload',()=>{tileSuccess++;$('offlineNotice').hidden=true;});
tiles.on('tileerror',()=>{tileFailure++;if(tileFailure>3&&tileSuccess===0)$('offlineNotice').hidden=false;});tiles.addTo(map);
markerLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);
function curve(a,b){const points=[],dx=b[1]-a[1],dy=b[0]-a[0];for(let j=0;j<=32;j++){const t=j/32,off=Math.sin(Math.PI*t)*.07;points.push([a[0]+dy*t+dx*off*.7,a[1]+dx*t-dy*off]);}return points;}
function pathFor(items){let out=[];items.forEach((item,i)=>{const p=PLACES[item.key],coord=[p.lat,p.lng];if(i===0)out.push(coord);else{const prev=PLACES[items[i-1].key];out.push(...curve([prev.lat,prev.lng],coord).slice(1));}});return out;}
function fitRoute(animated=false){const items=visibleItems();if(!items.length)return;const coords=items.map(i=>[PLACES[i.key].lat,PLACES[i.key].lng]);const mobile=innerWidth<=760;const opts={paddingTopLeft:mobile?[45,135]:[75,155],paddingBottomRight:mobile?[135,310]:[140,280],maxZoom:15,animate:false,duration:.7};if(coords.length===1)map.setView(coords[0],12,{animate:false});else map.fitBounds(L.latLngBounds(coords),opts);}
function renderMap(){
 resetRoute();markerLayer.clearLayers();routeLayer.clearLayers();markers.clear();
 const items=visibleItems(),days=[...new Set(items.map(i=>i.day))];
 for(const day of days){const path=pathFor(items.filter(i=>i.day===day));if(path.length>1){L.polyline(path,{color:'#fffef5',weight:7,opacity:.85,lineCap:'round',interactive:false}).addTo(routeLayer);L.polyline(path,{color:colorFor(day),weight:3,opacity:.9,lineCap:'round',interactive:false}).addTo(routeLayer);}}
 const unique=new Map();items.forEach(i=>{if(!unique.has(i.key))unique.set(i.key,i);});let n=0;
 unique.forEach(item=>{n++;const p=PLACES[item.key],showLabel=selectedDay!=='all'||['airport','jozankei','otaru','bluepond','cheese','sapporo'].includes(item.key);
  const markerIcon=pixelBuildingIcon(item.key,n,p.name,colorFor(item.day),showLabel);
  const marker=L.marker([p.lat,p.lng],{icon:markerIcon,keyboard:true,title:p.name,riseOnHover:true}).addTo(markerLayer).on('click',()=>selectPlace(item.id,false));markers.set(item.key,marker);
 });
 replayPath=pathFor(items);$('playButton').disabled=items.length<2;$('resetButton').disabled=items.length<2;fitRoute(false);
}
function renderDays(){const tabs=$('dayTabs');tabs.replaceChildren();[{id:'all',title:'전체 여행'},...plan.days].forEach(day=>{const button=document.createElement('button');button.className='day-tab'+(String(day.id)===String(selectedDay)?' active':'');button.setAttribute('role','tab');button.setAttribute('aria-selected',String(String(day.id)===String(selectedDay)));button.dataset.day=day.id;button.innerHTML='<span class="day-tab-num">'+(day.id==='all'?'전체':String(day.id)+'일차')+'</span><span class="day-tab-title">'+escapeHTML(day.id==='all'?day.title:plan.raw===SAMPLE?(SHORT_TITLES[day.id-1]||day.title):day.title)+'</span>';button.addEventListener('click',()=>selectDay(day.id));tabs.append(button);});}
function renderList(){
 const list=$('placeList');list.replaceChildren();const days=plan.days.filter(d=>selectedDay==='all'||d.id===Number(selectedDay));
 days.forEach(day=>{const group=document.createElement('div');group.className='day-group';group.style.setProperty('--day',colorFor(day.id));const heading=document.createElement('div');heading.className='group-heading';heading.innerHTML='<span class="day-color"></span><b>'+String(day.id)+'일차</b><span>'+escapeHTML(day.title)+'</span>';group.append(heading);
 plan.items.filter(i=>i.day===day.id).forEach((item,idx)=>{const p=PLACES[item.key],row=document.createElement('button');row.className='place-row'+(!p?' unresolved':'')+(item.excluded?' excluded':'')+(item.id===selectedId?' selected':'');row.dataset.id=item.id;row.innerHTML='<span class="place-number">'+(item.excluded?'—':p?idx+1:'?')+'</span><span class="place-text"><strong>'+escapeHTML(p?p.name:item.raw)+'</strong><small>'+(item.excluded?'메모로만 남김':p?escapeHTML(p.kind):'위치 확인 필요')+'</small></span>'+icon(p?'arrow':'pin');row.addEventListener('click',()=>p&&!item.excluded?selectPlace(item.id):openReview(item.id));group.append(row);});list.append(group);});
 if(!days.length){const p=document.createElement('p');p.className='source-intro';p.textContent='아직 지도에 놓을 장소가 없어요. 메모를 가져와 보세요.';list.append(p);}
 $('reviewBanner').hidden=!unresolved().length;$('reviewCount').textContent='확인할 장소 '+unresolved().length+'개';
}
function renderSource(){const box=$('sourceLines');box.replaceChildren();plan.raw.split('\n').forEach((line,index)=>{const el=document.createElement('span');el.className='source-line';el.dataset.line=index;el.textContent=line||' ';box.append(el);});}
function render(){
 const known=plan.items.filter(i=>i.key&&!i.excluded),unique=new Set(known.map(i=>i.key));
 $('daysCount').textContent=plan.days.length+'일';$('placesCount').textContent=unique.size+'개 장소';$('stopCount').textContent=known.length;
 $('tripTitle').innerHTML=plan.raw===SAMPLE?'도트로 떠나는<br>홋카이도':'내 메모 속<br> 여행';document.querySelector('.sample-label').textContent=plan.raw===SAMPLE?'샘플 여행':'내 메모';
 $('routeCount').textContent=selectedDay==='all'?plan.days.length+'일의 여행':Number(selectedDay)+'일차의 여행';$('routeLabel').textContent=selectedDay==='all'?'여행 전체':'하루씩 보기';
 const day=plan.days.find(d=>d.id===Number(selectedDay));$('mapTitle').textContent=selectedDay==='all'?'다음 칸은, 어디일까?':day?.title||'오늘의 여행';$('mapSubtitle').textContent=selectedDay==='all'?'메모 속 여행을 작은 세계로 펼쳐요.':visibleItems().length+'번의 방문 · 원래 메모의 순서대로';
 renderDays();renderList();renderSource();renderMap();
}
function selectDay(day){selectedDay=day==='all'?'all':Number(day);selectedId=null;$('selectedPlace').hidden=true;render();$('dayTabs').querySelector('[data-day="'+selectedDay+'"]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});}
function selectPlace(id,focus=true){const item=plan.items.find(i=>i.id===id),p=PLACES[item?.key];if(!p)return;selectedId=id;renderList();document.querySelectorAll('.source-line').forEach(el=>el.classList.toggle('highlight',Number(el.dataset.line)===item.lineIndex));$('selectedPlace').hidden=false;$('selectedName').textContent=p.name;$('selectedJapanese').textContent=p.ja;$('selectedDayLabel').textContent=String(item.day)+'일차 · '+p.kind;document.querySelectorAll('.map-pin').forEach(el=>el.classList.remove('selected'));markers.get(item.key)?.getElement()?.querySelector('.map-pin')?.classList.add('selected');if(focus)map.panTo([p.lat,p.lng],{animate:!reducedMotion,duration:.6});if(sourceMode)$('sourceLines').querySelector('[data-line="'+item.lineIndex+'"]')?.scrollIntoView({block:'nearest'});}
function setSourceMode(value){sourceMode=value;$('sourceTab').classList.toggle('active',value);$('placesTab').classList.toggle('active',!value);$('sourceTab').setAttribute('aria-selected',String(value));$('placesTab').setAttribute('aria-selected',String(!value));$('sourcePanel').hidden=!value;$('placesPanel').hidden=value;if(value&&selectedId)selectPlace(selectedId,false);}
$('sourceTab').addEventListener('click',()=>setSourceMode(true));$('placesTab').addEventListener('click',()=>setSourceMode(false));$('fitButton').addEventListener('click',()=>fitRoute(true));$('homeLink').addEventListener('click',e=>{e.preventDefault();selectDay('all');});$('closeSelected').addEventListener('click',()=>{$('selectedPlace').hidden=true;selectedId=null;renderList();});
function openImport(){$('tripInput').value=plan.raw;$('inputError').textContent='';$('importDialog').showModal();}
function importText(text){
 if(typeof text!=='string'||!text.trim())return {ok:false,error:'여행 메모를 먼저 넣어 주세요.'};
 if(text.length>20000)return {ok:false,error:'시안에서는 20,000자까지 넣을 수 있어요.'};
 const candidate=parse(text);if(candidate.items.length===0)return {ok:false,error:'날짜 아래에 방문할 장소를 넣어 주세요.'};
 plan=candidate;selectedDay='all';selectedId=null;setSourceMode(false);$('selectedPlace').hidden=true;render();save();return {ok:true,matched:plan.items.filter(i=>i.key).length,unresolved:unresolved().length};
}
$('importButton').addEventListener('click',openImport);$('mobileImport').addEventListener('click',openImport);$('sourceEdit').addEventListener('click',openImport);$('fillSample').addEventListener('click',()=>{$('tripInput').value=SAMPLE;$('inputError').textContent='';});
$('convertButton').addEventListener('click',()=>{const r=importText($('tripInput').value);if(!r.ok){$('inputError').textContent=r.error;return;}$('importDialog').close();$('sidebar').classList.remove('expanded');$('sheetToggle').setAttribute('aria-expanded','false');toast(r.matched?r.matched+'번의 방문을 지도에 놓았어요.'+(r.unresolved?' '+r.unresolved+'곳은 확인이 필요해요.':''):'예시 목록에 없는 장소예요. 확인할 장소에서 직접 골라주세요.');});
function loadSample(){plan=parse(SAMPLE);selectedDay='all';selectedId=null;setSourceMode(false);$('selectedPlace').hidden=true;render();save();return plan;}
$('restoreSample').addEventListener('click',()=>{loadSample();toast('샘플 여행으로 돌아왔어요.');});
Object.entries(PLACES).forEach(([key,p])=>{const o=document.createElement('option');o.value=key;o.textContent=p.name;$('placeChoice').append(o);});
function openReview(id){const item=plan.items.find(i=>i.id===id)||unresolved()[0];if(!item)return;reviewId=item.id;$('unresolvedDay').textContent=String(item.day)+'일차';$('unresolvedText').textContent=item.raw;$('placeChoice').value=item.key||'';$('reviewDialog').showModal();}
$('reviewBanner').addEventListener('click',()=>openReview());
$('confirmPlace').addEventListener('click',()=>{const key=$('placeChoice').value;if(!key){$('placeChoice').focus();return;}const item=plan.items.find(i=>i.id===reviewId);if(!item)return;item.key=key;item.excluded=false;$('reviewDialog').close();render();save();toast('직접 확인한 장소를 지도에 연결했어요.');});
$('excludePlace').addEventListener('click',()=>{const item=plan.items.find(i=>i.id===reviewId);if(!item)return;item.excluded=true;$('reviewDialog').close();render();save();toast('원래 메모는 남겨두고 지도에서만 뺐어요.');});
$('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.close).close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('sheetToggle').addEventListener('click',()=>{const expanded=$('sidebar').classList.toggle('expanded');$('sheetToggle').setAttribute('aria-expanded',String(expanded));$('sheetToggle').querySelector('span:not(.sheet-grip)').textContent=expanded?'지도 크게 보기':'여행 메모 보기';});
function updateReplayUI(){const b=$('playButton');b.classList.toggle('playing',replayRunning);b.querySelector('use').setAttribute('href',replayRunning?'#pause':'#play');b.querySelector('span').textContent=replayRunning?'잠시 멈추기':replayProgress===0?'여행 미리 걷기':replayProgress>=1?'다시 걸어보기':'이어서 걷기';$('playbackProgress').style.width=replayProgress*100+'%';$('playbackLabel').textContent=replayProgress===0?'시작 전':replayProgress>=1?'한 바퀴 완료':Math.round(replayProgress*100)+'%';}
function paintReplay(progress){
 replayProgress=Math.max(0,Math.min(1,Number(progress)||0));if(replayPath.length<2){updateReplayUI();return;}
 const exact=replayProgress*(replayPath.length-1),index=Math.floor(exact),f=exact-index,a=replayPath[index],b=replayPath[Math.min(index+1,replayPath.length-1)],point=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
 if(!replayMarker)replayMarker=L.marker(point,{icon:pixelVehicleIcon(),interactive:false,zIndexOffset:1000}).addTo(map);else replayMarker.setLatLng(point);
 const played=[...replayPath.slice(0,index+1),point];if(!replayLine)replayLine=L.polyline(played,{color:'#c66748',weight:4,opacity:1,interactive:false}).addTo(map);else replayLine.setLatLngs(played);updateReplayUI();
}
function pauseRoute(){if(replayFrame)cancelAnimationFrame(replayFrame);replayFrame=null;replayRunning=false;updateReplayUI();}
function resetRoute(){pauseRoute();replayProgress=0;if(replayMarker){map.removeLayer(replayMarker);replayMarker=null;}if(replayLine){map.removeLayer(replayLine);replayLine=null;}updateReplayUI();}
function playRoute(options={}){if(replayPath.length<2)return;if(reducedMotion){paintReplay(1);return;}if(replayRunning){pauseRoute();return;}if(replayProgress>=1)replayProgress=0;replayDuration=Number(options.duration)||18000;replayStart=performance.now()-replayProgress*replayDuration;replayRunning=true;updateReplayUI();function tick(now){paintReplay((now-replayStart)/replayDuration);if(replayProgress<1&&replayRunning)replayFrame=requestAnimationFrame(tick);else{replayRunning=false;updateReplayUI();}}replayFrame=requestAnimationFrame(tick);}
function seekReplay(progress){pauseRoute();paintReplay(progress);}
function waitForMap(timeout=8000){return new Promise(resolve=>{let timer=null,finished=false;function done(){if(finished)return;finished=true;if(timer)clearTimeout(timer);tiles.off('load',done);resolve({complete:!tiles.isLoading(),tileSuccess,tileFailure});}if(!tiles.isLoading()){done();return;}tiles.once('load',done);timer=setTimeout(done,timeout);});}
$('playButton').addEventListener('click',()=>playRoute());$('resetButton').addEventListener('click',resetRoute);
new ResizeObserver(()=>{map.invalidateSize({pan:false});fitRoute(false);}).observe($('map'));
load();render();startPixelMap();
window.demo={ready:true,loadSample,openImport,importText,selectDay,playRoute,pauseRoute,resetRoute,seekReplay,waitForMap,selectPlace,setSourceMode,sampleText:SAMPLE,getState:()=>({selectedDay,items:JSON.parse(JSON.stringify(plan.items)),raw:plan.raw,playing:replayRunning,progress:replayProgress,tileSuccess,tileFailure}),map};
if(new URLSearchParams(location.search).get('view')==='import')openImport();
