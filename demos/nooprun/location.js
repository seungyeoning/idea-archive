/* Browser location prototype. No coordinates are transmitted by this module. */
(() => {
  'use strict';
  const FRESH_MS = 30000, EXIT_MS = 10000, MAX_ACCURACY = 50;
  const radians = value => value * Math.PI / 180;
  const distance = (a, b) => {
    const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  };
  const validHome = h => !!h && Number.isFinite(h.latitude) && Math.abs(h.latitude) <= 90 && Number.isFinite(h.longitude) && Math.abs(h.longitude) <= 180 && [50,100,200].includes(h.radius) && Number.isFinite(h.accuracy) && h.accuracy >= 0 && h.accuracy <= Math.min(MAX_ACCURACY, h.radius / 2);
  function create({onChange, onExit}) {
    let home = null, fix = null, watcher = null, watchdog = null, confirmation = null, generation = 0;
    let state = {status:'idle', distance:null, accuracy:null}, candidate = null, lastTimestamp = -Infinity, ended = false, armed = true;
    const snapshot = () => ({...state, watching:watcher !== null, outsideSince:candidate?.since || null});
    const emit = () => onChange?.(snapshot());
    const resetCandidate = () => {candidate = null; clearTimeout(confirmation); confirmation = null;};
    function stop() {
      generation++;
      if (watcher !== null) navigator.geolocation?.clearWatch(watcher);
      watcher = null; clearInterval(watchdog); watchdog = null; resetCandidate();
    }
    function error(e) {
      resetCandidate(); fix = null;
      state = {status:e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable', distance:null, accuracy:null};
      if (e.code === 1) stop();
      emit();
    }
    function start(nextHome = null, {detectExit = true} = {}) {
      stop(); home = validHome(nextHome) ? {...nextHome} : null; fix = null; ended = false; lastTimestamp = -Infinity;
      armed = detectExit;
      state = {status:'acquiring', distance:null, accuracy:null}; emit();
      if (!window.isSecureContext || !navigator.geolocation) {state.status = 'unsupported'; emit(); return;}
      const token = generation;
      let refreshing = false, lastRefresh = Date.now();
      const accept = p => {
        if (token !== generation || ended || document.hidden) return;
        const {latitude,longitude,accuracy} = p.coords, now = Date.now();
        if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(p.timestamp) || p.timestamp > now + 1000 || now - p.timestamp > FRESH_MS) {
          resetCandidate(); fix = null; state = {status:'stale', distance:null, accuracy:null}; emit(); return;
        }
        if (p.timestamp <= lastTimestamp) return;
        lastTimestamp = p.timestamp;
        fix = {latitude,longitude,accuracy,timestamp:p.timestamp};
        const d = home ? distance(home,fix) : null;
        state = {status:'ready', distance:d, accuracy, timestamp:p.timestamp};
        if (accuracy > Math.min(MAX_ACCURACY, (home?.radius || 100) / 2)) {
          state.status = 'weak'; resetCandidate(); emit(); return;
        }
        if (home) {
          const uncertainty = accuracy + home.accuracy;
          if (d - uncertainty > home.radius) {
            state.status = 'outside';
            if (!armed) {resetCandidate();emit();return;}
            if (!candidate || p.timestamp - candidate.last > FRESH_MS) candidate = {since:p.timestamp,last:p.timestamp,count:1};
            else {candidate.last=p.timestamp;candidate.count++;}
            if (candidate.count >= 2 && p.timestamp - candidate.since >= EXIT_MS) {
              ended = true; const evidence = {confirmedAt:now, firstOutsideAt:candidate.since, distance:d, accuracy};
              stop(); emit(); onExit?.(evidence); return;
            }
            if (!confirmation) confirmation = setTimeout(() => {
              confirmation = null;
              if (token === generation && !document.hidden) navigator.geolocation.getCurrentPosition(accept,fail,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
            }, EXIT_MS);
          } else {
            resetCandidate(); state.status = d + uncertainty <= home.radius ? 'inside' : 'boundary';
          }
        }
        emit();
      };
      const fail = e => {if (token === generation) error(e);};
      watcher = navigator.geolocation.watchPosition(accept,fail,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
      watchdog = setInterval(() => {
        if (token !== generation) return;
        if (fix && Date.now() - fix.timestamp > FRESH_MS) {
          fix = null; resetCandidate(); state = {status:'stale',distance:null,accuracy:null}; emit();
        }
        // A stationary device need not trigger watchPosition. Refresh while visible.
        if (!document.hidden && !refreshing && Date.now() - lastRefresh >= 15000) {
          refreshing = true; lastRefresh = Date.now();
          navigator.geolocation.getCurrentPosition(
            p=>{refreshing=false;accept(p);},
            e=>{refreshing=false;fail(e);},
            {enableHighAccuracy:true,maximumAge:0,timeout:15000}
          );
        }
      },3000);
    }
    return {start,stop,arm:()=>{armed=true;resetCandidate();},state:snapshot,fix:() => fix && Date.now() - fix.timestamp <= FRESH_MS ? {...fix} : null};
  }
  window.NooprunGPS = {create,validHome,distance};
})();
