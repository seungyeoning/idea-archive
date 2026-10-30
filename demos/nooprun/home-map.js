/* Home is stored locally. OSM receives the requested map tile area, not a user profile. */
(() => {
  'use strict';
  let map=null, home=null, resizeObserver=null, tiles=null;
  function unmount() {
    resizeObserver?.disconnect();resizeObserver=null;
    map?.remove();map=null;home=null;tiles=null;
  }
  function mount(savedHome) {
    unmount();
    const element=document.getElementById('home-map');
    if(!element || !window.NooprunGPS.validHome(savedHome))return;
    home=[savedHome.latitude,savedHome.longitude];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    map=L.map(element,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced}).setView(home,17);
    map.attributionControl.setPrefix(false);
    tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,minZoom:3,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });
    let failed=false;
    tiles.on('loading',()=>{failed=false;});
    tiles.on('tileerror',()=>{failed=true;});
    tiles.on('load',()=>{
      const status=document.querySelector('[data-tile-status]');
      if(status){status.hidden=!failed;status.textContent=failed?'지도를 불러오지 못했어요. 연결을 확인하고 우리 집을 눌러 주세요.':'';}
    });
    tiles.addTo(map);
    const house=L.divIcon({className:'own-home-marker',iconSize:[90,94],iconAnchor:[45,59],
      html:'<span class="own-pin-halo"></span><span class="own-pin-house"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z"/></svg></span><span class="own-pin-label">우리 집</span>'});
    L.marker(home,{icon:house,keyboard:false,interactive:false}).addTo(map);
    element.setAttribute('role','region');
    element.setAttribute('aria-label','저장된 우리 집 위치 지도. 방향키로 이동하고 더하기와 빼기로 확대하거나 축소할 수 있어요.');
    resizeObserver=new ResizeObserver(()=>map?.invalidateSize({pan:false}));
    resizeObserver.observe(element);
  }
  function recenter() {
    if(!map||!home)return;
    map.setView(home,17,{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});
    if(!document.querySelector('[data-tile-status]')?.hidden)tiles.redraw();
  }
  window.NooprunHomeMap={mount,unmount,recenter};
})();
