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
    L.circle(home,{radius:savedHome.radius,color:'#89965d',weight:1,opacity:.5,fillColor:'#e4ff3b',fillOpacity:.09,interactive:false}).addTo(map);
    const house=L.divIcon({className:'home-position-marker',iconSize:[58,58],iconAnchor:[29,29],
      html:'<span class="home-position-halo"></span><span class="home-position-dot"></span>'});
    L.marker(home,{icon:house,keyboard:false,interactive:false}).addTo(map);
    map.panBy([0,Math.round(element.clientHeight*.06)],{animate:false});
    element.setAttribute('role','region');
    element.setAttribute('aria-label','저장된 우리 집 위치 지도. 방향키로 이동하고 더하기와 빼기로 확대하거나 축소할 수 있어요.');
    resizeObserver=new ResizeObserver(()=>map?.invalidateSize({pan:false}));
    resizeObserver.observe(element);
  }
  function recenter() {
    if(!map||!home)return;
    map.setView(home,17,{animate:false});
    map.panBy([0,Math.round(map.getContainer().clientHeight*.06)],{animate:false});
    if(!document.querySelector('[data-tile-status]')?.hidden)tiles.redraw();
  }
  window.NooprunHomeMap={mount,unmount,recenter};
})();
