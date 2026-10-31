/* Live position stays in memory. OSM receives only the requested map tile area. */
(() => {
  'use strict';
  const CLOSE_ZOOM=19;
  const DEMO_HOME={latitude:37.5665,longitude:126.978,accuracy:5,radius:50};
  let map=null,home=null,position=null,range=null,observer=null,tiles=null,example=false;
  const validFix=fix=>fix&&Number.isFinite(fix.latitude)&&Math.abs(fix.latitude)<=90&&Number.isFinite(fix.longitude)&&Math.abs(fix.longitude)<=180&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&Number.isFinite(fix.timestamp)&&Date.now()-fix.timestamp<=30000&&fix.timestamp<=Date.now()+1000;
  function unmount(){
    observer?.disconnect();observer=null;
    map?.remove();map=null;home=null;position=null;range=null;tiles=null;example=false;
  }
  function mount(savedHome,fix,{demo=false,locked=false}={}){
    unmount();
    const element=document.getElementById('session-map');
    if(!element)return;
    example=demo;
    const origin=demo?DEMO_HOME:savedHome;
    if(!window.NooprunGPS.validHome(origin)){
      element.innerHTML='<p class="session-map-empty">이 기록에 연결된 집 위치가 없어요.</p>';
      document.querySelectorAll('[data-session-map-control]').forEach(b=>b.disabled=true);
      return;
    }
    home=[origin.latitude,origin.longitude];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    map=L.map(element,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:false,minZoom:15,maxZoom:19}).setView(home,CLOSE_ZOOM);
    map.attributionControl.setPrefix(false);
    const mountedMap=map;
    const syncControls=()=>{
      if(map!==mountedMap)return;
      const plus=document.querySelector('[data-action=session-map-in]'),minus=document.querySelector('[data-action=session-map-out]');
      if(plus)plus.disabled=map.getZoom()>=map.getMaxZoom();
      if(minus)minus.disabled=map.getZoom()<=map.getMinZoom();
    };
    map.on('zoomend',syncControls);syncControls();
    tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      minZoom:3,maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });
    let failed=false;
    tiles.on('loading',()=>{failed=false;});
    tiles.on('tileerror',()=>{failed=true;});
    tiles.on('load',()=>{
      if(map!==mountedMap)return;
      const status=document.querySelector('[data-session-tile-status]');
      if(status){status.hidden=!failed;status.textContent=failed?'지도를 불러오지 못했어요. 집으로 버튼을 눌러 다시 불러올 수 있어요.':'';}
    });
    tiles.addTo(map);
    const house=L.divIcon({className:'session-home-marker',iconSize:[38,44],iconAnchor:[19,44],
      html:'<span class="session-home-pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 9v11h5v-6h4v6h5V9"/></svg></span>'});
    L.marker(home,{icon:house,keyboard:false,interactive:false,zIndexOffset:50}).addTo(map);
    observer=new ResizeObserver(()=>{if(map===mountedMap)map.invalidateSize({pan:false});});observer.observe(element);
    setLocked(locked);
    if(demo)paint({...DEMO_HOME,latitude:DEMO_HOME.latitude+8/111195,accuracy:12,timestamp:Date.now()},true);
    else update(fix);
  }
  function paint(fix,isExample=false){
    const coordinate=[fix.latitude,fix.longitude];
    if(!range)range=L.circle(coordinate,{radius:fix.accuracy,color:'#277be7',weight:1,opacity:.55,fillColor:'#277be7',fillOpacity:.12,interactive:false}).addTo(map);
    else range.setLatLng(coordinate).setRadius(fix.accuracy).setStyle({opacity:.55,fillOpacity:.12});
    if(!position){
      const icon=L.divIcon({className:'session-position-marker',iconSize:[20,20],iconAnchor:[10,10],html:'<span></span>'});
      position=L.marker(coordinate,{icon,keyboard:false,interactive:false,zIndexOffset:100}).addTo(map);
    }else position.setLatLng(coordinate);
    position.getElement()?.classList.remove('is-stale');
    const label=document.querySelector('[data-session-position-label]');if(label)label.textContent=isExample?'현재 위치 예시':'현재 위치';
    const accuracy=document.querySelector('[data-session-accuracy]');if(accuracy)accuracy.textContent=`오차 약 ${Math.round(fix.accuracy)}m${isExample?' · 예시':''}`;
    const caption=document.querySelector('[data-session-map-caption]');if(caption)caption.textContent=isExample?'서울시청 주변 지도 예시 · 실제 위치 아님':'파란 원은 위치 오차예요.';
    const element=map.getContainer();element.dataset.positionState=isExample?'example':'live';
    element.setAttribute('aria-label',isExample?'서울시청 주변의 지도 시연. 실제 위치가 아니에요.':'집 주변 지도. 집 표시와 현재 위치점, GPS 오차 범위. 방향키로 이동하고 더하기와 빼기로 확대하거나 축소할 수 있어요.');
  }
  function update(fix,state={}){
    if(!map||example)return;
    const unavailable=['suspended','denied','unavailable','timeout','stale','acquiring','idle','unsupported'].includes(state.status);
    if(validFix(fix)&&!unavailable){paint(fix);return;}
    position?.getElement()?.classList.add('is-stale');
    range?.setStyle({opacity:0,fillOpacity:0});
    const label=document.querySelector('[data-session-position-label]');if(label)label.textContent=position?'마지막 위치':'위치 확인 중';
    const accuracy=document.querySelector('[data-session-accuracy]');if(accuracy)accuracy.textContent='새 위치 대기';
    const caption=document.querySelector('[data-session-map-caption]');if(caption)caption.textContent=position?'회색 점은 마지막으로 확인한 위치예요.':'현재 위치가 확인되면 파란 점이 나타나요.';
    map.getContainer().dataset.positionState=position?'stale':'waiting';
    map.getContainer().setAttribute('aria-label',position?'집 주변 지도. 회색 점은 마지막으로 확인한 위치이며 현재 위치는 확인 중이에요.':'저장된 집 주변 지도. 현재 위치는 아직 확인 중이에요.');
  }
  function recenter(){
    if(!map||!home)return;
    map.setView(home,CLOSE_ZOOM,{animate:false});
    if(!document.querySelector('[data-session-tile-status]')?.hidden)tiles.redraw();
  }
  function zoom(direction){if(map)map.setZoom(map.getZoom()+direction,{animate:false});}
  function setLocked(locked){
    if(!map)return;
    for(const handler of ['dragging','touchZoom','doubleClickZoom','boxZoom','keyboard'])map[handler]?.[locked?'disable':'enable']();
  }
  window.NooprunSessionMap={mount,unmount,update,recenter,zoom,setLocked};
})();
