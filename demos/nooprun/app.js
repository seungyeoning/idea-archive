(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KEY = 'nooprun.concept.v1';
  const defaultStore = () => ({version:1, goal:0, sound:true, home:null, active:null, records:[]});
  let storageOK = true, data = defaultStore();
  const validRecord = r => r && typeof r.id === 'string' && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 && Number.isFinite(r.finishedAt);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error('Unsupported saved data');
      data = {...defaultStore(), ...parsed, records:parsed.records.filter(validRecord)};
      if (data.active?.home && !window.NooprunGPS.validHome(data.active.home)) data.active.home = null;
      data.goal = 0; // New sessions are open-ended; saved sessions and records retain their original goal.
      if (!window.NooprunGPS.validHome(data.home)) data.home = null;
      if (data.active && (!Number.isFinite(data.active.baseMs) || data.active.baseMs < 0 || !['running','paused'].includes(data.active.status) || (data.active.status === 'running' && !Number.isFinite(data.active.runSince)))) throw new Error('Invalid active session');
    }
  } catch { storageOK = false; data = defaultStore(); }
  let view = data.active ? 'running' : 'home', result = null, countdown = 3, countdownTimer = null;
  let demoClockMs = null, runMetric = 'time', hold = null, holdFrame = null, ignoreStopClickUntil = 0;
  let countdownGoal = data.goal, demoSession = null, photo = null, photoToken = 0, toastTimer, modalAction = null, focusBeforeModal;
  let gpsIntent = null, setupRadius = data.home?.radius || 50, setupThenStart = false;
  let gpsState = {status:'idle',distance:null,accuracy:null};
  const newID = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const active = () => demoSession || data.active;
  const elapsed = (session = active()) => session ? (session.demo && Number.isFinite(demoClockMs) ? demoClockMs : Math.max(0, session.baseMs + (session.status === 'running' ? Math.max(0,Date.now()-session.runSince) : 0))) : 0;
  const formatTime = ms => {const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);return h ? `${h}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
  const duration = ms => ms < 60000 ? `${Math.floor(ms/1000)}초` : `${Math.floor(ms/60000)}분${Math.floor(ms/1000)%60 ? ' '+Math.floor(ms/1000)%60+'초' : ''}`;
  const dateLabel = time => new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'}).format(time);
  function persist() {
    if (!storageOK) return;
    try { localStorage.setItem(KEY,JSON.stringify(data)); }
    catch { storageOK=false; toast('저장 공간을 사용할 수 없어 이번 기록은 이 창에서만 유지돼요.'); }
  }
  function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3400); }
  const gpsLabels = {idle:'위치 확인 전',acquiring:'현재 위치 확인 중',ready:'현재 위치 확인됨',inside:'집 안에서 기록 중',boundary:'집 경계 · 위치 확인 중',outside:'외출 여부 확인 중',weak:'위치 오차가 커요',stale:'새 위치를 기다리는 중',denied:'위치 권한이 꺼져 있어요',timeout:'위치를 찾는 데 시간이 걸려요',unavailable:'현재 위치를 찾지 못했어요',unsupported:'위치를 지원하는 브라우저에서 열어 주세요',suspended:'화면을 다시 열면 위치를 확인해요'};
  const gps = window.NooprunGPS.create({
    onChange(state) {
      gpsState = state;
      if (data.active?.home && gpsIntent === 'session') {
        if (['weak','stale','denied','timeout','unavailable'].includes(state.status)) data.active.gpsHadGaps = true;
        if (state.status === 'inside') data.active.maxHomeDistance = Math.max(data.active.maxHomeDistance || 0,state.distance);
        persist();
      }
      updateGPS();
      if (gpsIntent === 'start' && state.status === 'inside') {gpsIntent = 'countdown';beginCountdown();}
    },
    onExit(evidence) {
      if (gpsIntent === 'session' && data.active?.home) finish({reason:'left-home',confirmedAt:evidence.confirmedAt});
    }
  });
  const gpsDistance = () => active()?.demo ? '0.00' : Number.isFinite(gpsState.distance) && ['inside','boundary','outside'].includes(gpsState.status) ? (gpsState.distance/1000).toFixed(2) : '—';
  const recordDistance = r => r.homeRadius ? ((r.maxHomeDistance || 0)/1000).toFixed(2) : '0.00';
  function updateGPS() {
    document.querySelectorAll('[data-gps-status]').forEach(e=>{e.textContent=gpsLabels[gpsState.status];e.dataset.status=gpsState.status;});
    document.querySelectorAll('[data-gps-accuracy]').forEach(e=>{e.textContent=Number.isFinite(gpsState.accuracy)?`위치 오차 약 ${Math.round(gpsState.accuracy)}m`:'GPS 수신 대기';});
    document.querySelectorAll('[data-home-distance]').forEach(e=>e.textContent=gpsDistance());
    const save=$('[data-action=save-home]'),fix=gps.fix();
    if(save)save.disabled=!fix || fix.accuracy>Math.min(50,setupRadius/2);
    const retry=$('[data-action=gps-retry]');
    if(retry)retry.hidden=!['weak','stale','denied','timeout','unavailable','unsupported','boundary','outside'].includes(gpsState.status);
  }
  function homeSetup() {
    return `<section class="app-screen home-setup"><header class="app-header">${iconButton('back','cancel-gps','돌아가기')}<span>MY HOME</span><span></span></header><h2>여기가<br>나의 출발선.</h2><p class="home-setup-lede">집에서 위치를 설정해 주세요.<br>정한 구역을 벗어나면 기록이 끝나요.</p><div class="home-zone-art" aria-hidden="true"><div class="home-zone-ring"></div><svg viewBox="0 0 48 48"><path d="M7 23 24 9l17 14v19H7Z"/><path d="M19 42V28h10v14"/></svg><span>HOME</span></div><div class="home-radius" role="group" aria-label="집 구역 반경">${[50,100,200].map(r=>`<button data-radius="${r}" aria-pressed="${setupRadius===r}">${r}m</button>`).join('')}</div><p class="home-setup-help">GPS 오차를 고려한 반경이에요.<br>집 벽이나 현관의 위치까지 구분하지는 못해요.</p><div class="gps-info" role="status"><strong data-gps-status></strong><span data-gps-accuracy></span></div><button class="gps-retry" data-action="gps-retry">위치 다시 확인</button>${primary(setupThenStart?'여기를 집으로 정하고 시작':'집 위치 저장','save-home')}<p class="location-privacy">집 위치는 이 브라우저에 저장해요. 외부로 보내지 않아요.<br>웹 체험은 화면을 켜 둔 동안 위치를 확인할 수 있어요.</p></section>`;
  }
  function locating() {
    return `<section class="app-screen home-setup locating"><header class="app-header">${iconButton('back','cancel-gps','시작 취소')}<span>READY TO STAY</span><span></span></header><h2>오늘의 집콕,<br>출발선 확인.</h2><div class="home-zone-art" aria-hidden="true"><div class="home-zone-ring"></div><span>GPS</span></div><div class="gps-info" role="status"><strong data-gps-status></strong><span data-gps-accuracy></span></div><p class="home-setup-help">저장한 집 반경 ${data.home?.radius}m 안에 있는지<br>확인되면 3초 뒤 시작해요.</p><button class="gps-retry" data-action="gps-retry">위치 다시 확인</button><button class="text-button" data-action="setup-home">집 위치 다시 설정</button><p class="location-privacy">웹 체험은 화면을 켜 둔 동안만 외출을 확인해요.</p></section>`;
  }
  function openSetup(thenStart=false) {
    if(data.active){toast('기록을 마친 뒤 집 위치를 바꿀 수 있어요.');return;}
    setupThenStart=thenStart;setupRadius=data.home?.radius || 50;gpsIntent='setup';view='homeSetup';render(true);gps.start();
  }
  function requestStart() {
    if(data.active){go('running');return;}
    if(!data.home){openSetup(true);return;}
    demoSession=null;gpsIntent='start';view='locating';render(true);gps.start(data.home,{detectExit:false});
  }
  function stopGPS() {gpsIntent=null;gps.stop();gpsState={status:'idle',distance:null,accuracy:null};}
  window.NooprunVoice?.setEnabled(data.sound);
  async function say(cue) {
    if (!data.sound) return;
    const status = await window.NooprunVoice?.play(cue);
    if (data.sound && (!status || status === 'unavailable')) toast('음성을 불러오지 못했어요. 화면 안내로 계속 진행해요.');
  }
  const icon = name => ({back:'<path d="m13 5-7 7 7 7"/>',sound:'<path d="m4 9 4 0 5-4v14l-5-4H4Z"/><path d="M17 8q4 4 0 8"/>',share:'<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'}[name]);
  const iconButton = (name,action,label) => `<button class="icon-button" data-action="${action}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg></button>`;
  const brand = '<div class="app-brand">NOOPRUN<small>NOOP RUN CLUB</small></div>';
  const primary = (text,action,cls='') => `<button class="primary ${cls}" data-action="${action}">${text}<span class="arrow" aria-hidden="true">↗</span></button>`;
  const warning = () => storageOK ? '' : '<p class="storage-warning">이 브라우저의 저장 공간을 사용할 수 없어요. 기록은 이 창에서만 유지돼요.</p>';
  const nav = current => `<nav class="app-bottom-nav" aria-label="앱 메뉴"><button data-action="home" ${current==='home'?'aria-current="page"':''}>집콕</button><button data-action="history" ${current==='history'?'aria-current="page"':''}>나의 기록</button></nav>`;
  const sofa = `<div class="sofa-scene" aria-hidden="true"><svg viewBox="0 0 320 130"><path d="M34 98h248M48 99v10m223-10v10M54 91V67q0-7 7-7h195q11 0 11 10v21M46 70q-9-6-13 0v24h251V70q-5-7-13 0M55 88h210"/><g class="rest-breath"><path d="M88 66q7-8 22-6l59 6 44-28 31 27M166 65l45-14 36 19M110 61l27-13 27 6M136 48l-14 14M244 65l18 1m-16 4h21"/><circle cx="78" cy="56" r="12"/><path d="m73 56 3 1m8-2 3-1M88 59l12 3"/></g><path d="M54 74h51M51 70q4-10 15-6l29 7M275 20h13l-12 11h13m-27-23h8l-7 7h8"/></svg><span class="sofa-caption">MOVEMENT: OPTIONAL.</span></div>`;

  function home() {
    const today=new Date(),dayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime(),dayEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1).getTime();
    const todayRecords=data.records.filter(r=>!r.demo&&r.finishedAt>=dayStart&&r.finishedAt<dayEnd);
    const todayRest=todayRecords.reduce((sum,r)=>sum+r.elapsedMs,0);
    const homeIcon='<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>';
    const chartIcon='<path d="M5 20V12m7 8V4m7 16V8"/>';
    const gearIcon='<path d="m10 3 .5-1h3l.5 3 2 1 2.5-1 1.5 2.6-2 2V13l2 2-1.5 2.6-2.5-1-2 1-.5 3h-3l-.5-3-2-1-2.5 1L3 15l2-2V10L3 8l1.5-2.6L7 6l2-1Z"/><circle cx="11.5" cy="11.5" r="3"/>';
    return `<section class="app-screen home lobby-home club-home">
      <header class="club-header"><h2>집콕</h2><img class="club-app-icon" src="assets/brand/nooprun-recline.png?v=stretch-2" width="42" height="42" alt="눕런: 누워서 기지개 켜는 사람"></header>
      <nav class="club-mode-tabs" aria-label="집콕 메뉴"><button data-action="home" aria-current="page">바로 시작</button><button data-action="history">나의 기록</button></nav>
      <div class="club-stage">
        <svg class="club-map" viewBox="0 0 375 530" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="375" height="530" fill="#f1f2ee"/><g fill="#e6e8e3"><path d="M0 42h91v77H0Zm108-40h94v117h-94Zm111 0h80v119h-80Zm98 4h58v116h-58ZM0 138h93v92H0Zm110 0h92v92h-92Zm108 0h89v92h-89Zm108 0h49v92h-49ZM0 250h91v100H0Zm110 0h92v100h-92Zm109 0h86v100h-86Zm107 0h49v100h-49ZM0 370h91v160H0Zm109 0h94v160h-94Zm111 0h90v160h-90Zm109 0h46v160h-46Z"/></g><path d="m-30 410 198-75 250-44" stroke="#fff" stroke-width="21" fill="none"/><path d="m-25 410 198-75 250-44" stroke="#e1e4dd" stroke-width="2" fill="none"/><path d="M-20 152q67 10 101 4t40 36l-22 27H-20Z" fill="#e0e9d9"/><path d="M293 366h82v115h-82z" fill="#e0e9d9"/><g stroke="#daddd6" stroke-width="1" fill="none"><path d="M18 57h55v43H18Zm110-30h54v73h-54Zm109 3h43v70h-43ZM130 156h51v54h-51Zm107 0h51v54h-51ZM16 271h57v55H16Zm116 0h48v55h-48Zm104 0h51v40h-51ZM19 391h52v77H19Zm112-9h50v91h-50Zm104 8h51v99h-51"/></g></svg>
        <button class="lobby-today club-summary" data-action="history" aria-label="오늘의 집콕 ${duration(todayRest)}, 완주 ${todayRecords.length}회. 나의 기록 보기"><span class="club-summary-copy"><span class="lobby-today-label">오늘의 집콕</span><strong>${formatTime(todayRest)}</strong><span class="lobby-today-count">완주 <b>${todayRecords.length}</b>회</span></span>${window.NooprunArt.markup('club-summary-art')}<svg class="club-summary-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
        <div class="club-location" aria-hidden="true"><span class="club-home-boundary"></span><span class="club-position"></span></div>
        ${warning()}
        <div class="club-launch">
          <button class="club-side-control" data-action="settings" aria-label="설정"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg></button>
          <button class="club-start" data-action="start" aria-label="집콕 시작">시작</button>
          <button class="club-side-control club-sound" data-action="sound" aria-label="시작 음성 ${data.sound?'끄기':'켜기'}" aria-pressed="${!!data.sound}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon('sound')}${data.sound?'':'<path d="M3 3 21 21"/>'}</svg></button>
        </div>
        <button class="club-map-caption home-location-link" data-action="setup-home">${data.home?`집 반경 ${data.home.radius}m · 위치 설정`:'집 위치 설정 · 외출하면 자동 종료'}</button>
      </div>
      <nav class="app-bottom-nav club-tabbar" aria-label="앱 메뉴"><button data-action="home" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true">${homeIcon}</svg><span>집콕</span></button><button data-action="history"><svg viewBox="0 0 24 24" aria-hidden="true">${chartIcon}</svg><span>활동</span></button><button data-action="settings"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg><span>설정</span></button></nav>
    </section>`;
  }

  function counting() {
    return `<section class="app-screen"><header class="app-header">${brand}${iconButton('close','cancel-countdown','시작 취소')}</header><div class="countdown-wrap"><p>가장 편한 자세로.<br>이제, 아무것도 하지 마세요.</p><strong class="countdown-number" id="countdown" aria-live="polite">${countdown}</strong></div><button class="text-button" data-action="cancel-countdown">아직 준비 중이에요</button></section>`;
  }
  function running() {
    const s=active(),paused=s.status==='paused',timeSelected=runMetric==='time';
    const distanceMarkup=s.home?`<strong data-home-distance>${gpsDistance()}</strong>`:'<strong>0.00</strong>';
    const distanceLabel=s.home?'집에서 거리 (km)':'이동 거리 (km)';
    const timer=`<strong class="timer" id="timer" role="timer" aria-label="집콕 경과 시간">${formatTime(elapsed())}</strong>`;
    const pauseIcon='<rect x="6" y="4" width="4" height="20" rx="1"/><rect x="18" y="4" width="4" height="20" rx="1"/>';
    const playIcon='<path d="M8 4 24 14 8 24Z"/>';
    const metrics=paused?`<div class="paused-metrics"><div>${timer}<small>집콕 시간</small></div><div>${distanceMarkup}<small>${distanceLabel}</small></div></div>`:`<div class="metric-tabs" role="group" aria-label="크게 볼 기록 선택"><button data-action="metric" data-metric="time" aria-pressed="${timeSelected}">${timeSelected?`<strong data-elapsed>${formatTime(elapsed())}</strong>`:timer}<small>집콕 시간</small></button><button data-action="metric" data-metric="distance" aria-pressed="${!timeSelected}">${distanceMarkup}<small>${distanceLabel}</small></button></div>`;
    return `<section class="app-screen running" data-paused="${paused}">
      <header class="app-header"><div class="running-top"><i></i><span id="running-state">${paused?'일시정지':'집콕 중'}</span></div>${iconButton('sound','sound',data.sound?'음성 끄기':'음성 켜기')}</header>
      ${paused?`<div class="pause-scene">${window.NooprunArt.markup('run-art paused-art')}<p class="run-mode">집 안에서는 움직여도 괜찮아요.</p></div>${metrics}`:`${metrics}<button class="metric-hero" data-action="metric" data-metric="${timeSelected?'distance':'time'}" aria-label="${timeSelected?'집에서 거리 크게 보기':'집콕 시간 크게 보기'}">${timeSelected?timer:`<strong class="hero-value" ${s.home?'data-home-distance':''}>${s.home?gpsDistance():'0.00'}</strong>`}<span class="hero-label">${timeSelected?'집콕 시간':distanceLabel}</span></button>${window.NooprunArt.markup('run-art')}<p class="run-mode">오늘의 코스는, 집.</p>`}
      <div class="session-controls">
        ${paused?`<div class="session-control"><button class="session-circle stop" data-action="finish" aria-label="종료, 길게 누르기" aria-describedby="hold-hint"><svg class="hold-ring" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="50"/></svg><svg viewBox="0 0 28 28" aria-hidden="true"><rect x="5" y="5" width="18" height="18" rx="1"/></svg></button><span>종료</span><span class="hold-hint" id="hold-hint">길게 눌러 종료</span></div>`:''}
        <div class="session-control"><button class="session-circle" data-action="pause" aria-label="${paused?'이어서 기록':'잠깐 멈춤'}"><svg viewBox="0 0 28 28" aria-hidden="true">${paused?playIcon:pauseIcon}</svg></button><span>${paused?'이어서 기록':'잠깐 멈춤'}</span></div>
      </div>
      ${s.home?'<div class="session-gps" role="status"><span data-gps-status></span><small>화면을 켜 둔 동안 외출 확인</small><button class="gps-retry" data-action="gps-retry" hidden>위치 다시 확인</button></div>':s.demo?'':'<p class="run-note">기존 타이머 기록 · 위치 미연동</p>'}
      ${s.demo?'<p class="demo-badge">시연 중 · 실제 기록에 저장되지 않아요</p>':''}${warning()}
    </section>`;
  }
  function card(r) {
    return `<div class="result-card${photo?' photo-preview':''}" id="result-card"><div class="card-top"><span>NOOP RUN CLUB</span><span>${r.demo?'DEMO / 시연':dateLabel(r.finishedAt)}</span></div><strong class="card-time${r.elapsedMs>=3600000?' long':''}">${formatTime(r.elapsedMs)}</strong><p class="card-desc">${r.demo?'시연용 완주 기록':r.homeRadius?'집에 머문 시간':'아무것도 하지 않은 시간'}</p><hr class="card-rule"><div class="card-footer"><div><strong>${recordDistance(r)} <small>km</small></strong><small class="card-distance-label">${r.homeRadius?'집에서 최대 거리':'시안 이동 거리'}</small></div><span>오늘도, 가만히 완주.<br>${r.demo?'화면 예시':'집콕 기록'}</span></div></div>`;
  }
  function completed() {
    if (!result) {view='home';return home();}
    const hour=new Date(result.finishedAt).getHours(),period=hour<6?'새벽':hour<12?'오전':hour<18?'오후':'저녁';
    const clock=new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit'}).format(result.finishedAt);
    return `<section class="app-screen complete record-detail-screen">
      <header class="app-header">${iconButton('back','history','나의 기록으로')}<span class="finish-label">${result.demo?'시연 기록':'집콕 완료'}</span>${iconButton('share','share','이 기록 공유하기')}</header>
      <p class="record-date">${dateLabel(result.finishedAt)} · ${clock}</p><h2>${period}의 집콕</h2>
      <div class="summary-hero"><strong class="card-time${result.elapsedMs>=3600000?' long':''}">${formatTime(result.elapsedMs)}</strong><span>집콕 시간</span></div>
      <div class="summary-distance"><div><strong>${recordDistance(result)} <small>km</small></strong><span>${result.homeRadius?'집에서 최대 거리':'시안 이동 거리'}</span></div><p>오늘도,<br>가만히 완주.</p></div>
      <p class="exit-reason">${result.endReason==='left-home'?'집을 나서서 자동 완주했어요.':result.homeRadius?'직접 마친 집콕 기록이에요.':''}${result.gpsHadGaps?'<br><small>위치를 확인하지 못한 구간이 포함돼 있어요.</small>':''}</p><p class="mood-label">쉬고 나니 어때요? <span>선택</span></p><div class="mood-options" role="group" aria-label="완주 후 기분">${['개운해요','그냥 좋아요','아직 졸려요'].map(x=>`<button data-mood="${x}" aria-pressed="${result.mood===x}">${x}</button>`).join('')}</div>
      <div class="result-actions">${primary('공유하기','share')}${primary('완료','home','paper')}</div>
      <p class="saved-indicator">${result.demo?'시연 예시 · 실제 기록에는 포함되지 않아요':storageOK?'이 브라우저에 기록을 저장했어요':'현재 창에서만 기록을 보관하고 있어요'}</p>
    </section>`;
  }
  function shareView() {
    if(!result){view='home';return home();}
    return `<section class="app-screen complete share-editor">
      <header class="app-header">${iconButton('back','complete','기록으로 돌아가기')}<h2>공유 카드</h2><span class="header-spacer" aria-hidden="true"></span></header>
      ${card(result)}
      <div class="share-tools"><label tabindex="0" id="photo-label">${photo?'사진 바꾸기':'내 사진 넣기'}<input id="photo-input" type="file" accept="image/*" aria-label="공유 카드 배경 사진 선택"></label>${photo?'<button data-action="remove-photo">포스터로 바꾸기</button>':''}</div>
      <p class="share-caption">${photo?'내 사진 위에 오늘의 기록을 담아요.':'오늘의 집콕을 한 장으로.'}</p>
      <div class="result-actions">${primary('이미지 저장','export')}${primary('기록으로 돌아가기','complete','paper')}</div>
      <p class="saved-indicator">사진은 업로드하지 않아요.</p>
    </section>`;
  }
  function historyView() {
    const records=data.records,total=records.reduce((n,r)=>n+r.elapsedMs,0);
    return `<section class="app-screen history"><header class="app-header">${brand}${iconButton('back','home','집콕 시작으로')}</header><h2>모든 쉼에는<br>기록이 있다.</h2><div class="history-total"><strong>${Math.floor(total/60000)} <small style="font:16px var(--sans)">분</small></strong><span>이 브라우저에서 남긴 ${records.length}번의 완주</span></div>${records.length?`<ul class="records">${records.slice().reverse().map(r=>`<li><button data-record="${esc(r.id)}"><span><strong>${formatTime(r.elapsedMs)}</strong><small>${dateLabel(r.finishedAt)} · 집콕 기록</small></span><span class="record-detail">${esc(r.mood||'내 속도로 쉬었어요')}<br>${recordDistance(r)} km ${r.homeRadius?'· 집 기준':'· 시안'} &nbsp; ↗</span></button></li>`).join('')}</ul>`:'<div class="empty-state">아직 비어 있는 기록장.<br>집에 도착하면 시작해요.</div>'}${warning()}${primary('다시 집콕 시작','home')}${nav('history')}</section>`;
  }
  function settings() {
    return `<section class="app-screen settings"><header class="app-header">${brand}${iconButton('back','home','설정 닫기')}</header><h2>내 페이스대로.</h2><div class="settings-row"><span>나의 집</span><button class="home-setting" data-action="setup-home" ${data.active?'disabled':''}>${data.home?`반경 ${data.home.radius}m`:'위치 설정'} ↗</button></div><p>집에서 시작하고, 외출이 확인되면 자동으로 마쳐요. 위치 오차까지 집 구역 밖에 있어야 종료해요. ${data.active?'기록 중에는 집 위치를 바꿀 수 없어요.':''}</p><div class="settings-row"><span>그림 자동 전환</span><button class="switch" role="switch" aria-label="그림 자동 전환" aria-checked="${window.NooprunArt.state().enabled}" data-action="art">${window.NooprunArt.state().enabled?'켜짐':'꺼짐'}</button></div><p>7가지 쉬는 자세가 천천히 바뀌어요. 기기의 동작 줄이기가 켜져 있으면 그림은 그대로 멈춰 있어요.</p><div class="settings-row"><span>버튼 효과음</span><button class="switch" role="switch" aria-label="버튼 효과음" aria-checked="${!!window.NooprunSFX?.state().enabled}" data-action="effects">${window.NooprunSFX?.state().enabled?'켜짐':'꺼짐'}</button></div><p class="effects-description">선택할 때는 가볍게 톡, 완주할 때는 작은 축하 소리.<br>음성 안내와 따로 켜고 끌 수 있어요.</p><div class="settings-row"><span>음성 안내</span><button class="switch" role="switch" aria-label="음성 안내" aria-checked="${!!data.sound}" data-action="sound">${data.sound?'켜짐':'꺼짐'}</button></div><p>차분한 한국어 목소리로 시작과 완료를 안내해요.</p><button class="voice-preview" data-action="voice-preview" ${data.sound?'':'disabled'}>목소리 들어보기 <span aria-hidden="true">▷</span></button><p>위치 권한을 허용하면 집과의 거리를 확인해요. 집 위치와 기록은 이 브라우저에만 저장하고, 이동 경로는 저장하거나 전송하지 않아요. 거리 수치는 이동 경로의 길이가 아닌 집 중심에서의 직선거리예요.</p><p>웹 시안에서는 화면이 꺼지거나 다른 앱을 사용하는 동안 외출 확인이 멈춰요. 그동안의 시간은 타이머에 포함되며, 완주 기록에 위치 미확인 구간이 있다고 표시해요. 다시 열면 현재 위치를 새로 확인해요.</p><p>앱 이름 ‘눕런’과 이 화면은 기획 시안이에요. 브라우저 저장 공간을 지우면 여기에서 남긴 기록도 사라져요.</p>${warning()}</section>`;
  }
  function render(focus=false) {
    cancelHold();
    if (view==='running'&&!active())view='home';
    $('#phone').dataset.view=view;
    $('#phone').dataset.runState=view==='running'?active().status:'';
    const views={home,countdown:counting,running,complete:completed,share:shareView,history:historyView,settings,homeSetup,locating};
    $('#app').innerHTML=views[view]();
    window.NooprunArt.mount();
    if (photo&&view==='share')$('#result-card').style.backgroundImage=`url("${photo.url}")`;
    if (focus) {const target=$('#app h2')||$('#app .run-mode')||$('#app .countdown-wrap p');if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}
    updateTimer();
    updateGPS();
  }
  function clearPhoto() {photoToken++;if(photo)URL.revokeObjectURL(photo.url);photo=null;}
  function go(screen) {
    if (data.active && screen==='home')screen='running';
    if (demoSession && screen!=='running')demoSession=null;
    if (!['complete','share'].includes(screen))clearPhoto();
    view=screen;render(true);
  }
  function cancelCountdown() {clearInterval(countdownTimer);countdownTimer=null;stopGPS();view='home';render(true);}
  function beginCountdown() {
    countdown=3;countdownGoal=0;runMetric='time';view='countdown';render(true);
    clearInterval(countdownTimer);
    countdownTimer=setInterval(()=>{
      countdown--;
      if(countdown>0){$('#countdown').textContent=countdown;return;}
      clearInterval(countdownTimer);countdownTimer=null;
      if(!gps.fix() || gpsState.status!=='inside'){gpsIntent='start';view='locating';render(true);return;}
      data.active={id:newID(),status:'running',baseMs:0,runSince:Date.now(),startedAt:Date.now(),goal:countdownGoal,demo:false,home:{...data.home},maxHomeDistance:0,gpsHadGaps:false};
      gpsIntent='session';gps.arm();
      persist();view='running';render(true);say('start');
    },1000);
  }
  function pause() {
    const s=active();if(!s)return;
    if(s.status==='running'){s.baseMs=elapsed(s);s.runSince=null;s.status='paused';window.NooprunVoice?.stop();}
    else{s.runSince=Date.now();s.status='running';window.NooprunVoice?.stop();}
    if(!s.demo)persist();render();$('[data-action=pause]')?.focus({preventScroll:true});
  }
  function finish({silent=false,reason='manual',confirmedAt=Date.now()}={}) {
    const s=active();if(!s)return;
    result={id:s.id,elapsedMs:elapsed(s),finishedAt:confirmedAt,goal:s.goal,mood:'',demo:!!s.demo,endReason:reason,homeRadius:s.home?.radius || null,maxHomeDistance:s.maxHomeDistance || 0,gpsHadGaps:!!s.gpsHadGaps};
    if(!s.demo){stopGPS();closeModal();}
    if(!s.demo){if(!data.records.some(r=>r.id===result.id))data.records.push({...result});data.active=null;persist();}
    demoSession=null;demoClockMs=null;view='complete';clearPhoto();render(true);if(!silent){window.NooprunSFX?.play('complete');say('complete');}
  }
  function updateTimer() {
    const t=$('#timer');if(!t||!active())return;
    const ms=elapsed(),label=formatTime(ms);if(t.textContent!==label)t.textContent=label;
    t.classList.toggle('long',ms>=3600000);
    document.querySelectorAll('[data-elapsed]').forEach(e=>{if(e.textContent!==label)e.textContent=label;});

  }
  function showDemo(which) {
    if(data.active){toast('진행 중인 집콕 기록을 먼저 마쳐 주세요. 기록은 그대로 유지돼요.');go('running');return;}
    stopGPS();closeModal();clearInterval(countdownTimer);countdownTimer=null;clearPhoto();demoSession=null;demoClockMs=null;
    if(which==='home')view='home';
    if(which==='running'){demoSession={id:'demo-active',status:'running',baseMs:18*60000+42000,runSince:Date.now(),goal:0,demo:true};view='running';}
    if(which==='complete'){result={id:'demo-result',elapsedMs:1800000,finishedAt:Date.now(),goal:0,mood:'',demo:true};view='complete';}
    render(true);
  }
  function closeModal() {$('#modal')?.remove();$('#app').inert=false;modalAction=null;focusBeforeModal?.focus({preventScroll:true});}
  // A short tap never completes a session. Assistive activation uses a confirmation.
  function confirmFinish() {
    if(active()?.status!=='paused'||$('#modal'))return;
    focusBeforeModal=document.activeElement;
    const id=active().id;
    modalAction=()=>{if(active()?.id===id&&active()?.status==='paused')finish();};
    const box=document.createElement('div');box.id='modal';box.className='modal-backdrop';
    box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title"><h2 id="end-title">집콕 기록을 마칠까요?</h2><p>지금까지 쉰 ${duration(elapsed())}을 기록에 남겨요.</p><div class="modal-actions"><button data-action="keep-resting">취소</button><button class="confirm" data-action="confirm-finish">기록 종료</button></div></section>`;
    $('#phone').append(box);$('#app').inert=true;box.querySelector('button').focus();
  }
  function cancelHold() {
    cancelAnimationFrame(holdFrame);holdFrame=null;
    if(!hold)return;
    const old=hold;hold=null;old.button.style.removeProperty('--hold-progress');
    if(old.pointerId!=null&&old.button.hasPointerCapture(old.pointerId))old.button.releasePointerCapture(old.pointerId);
  }
  function startHold(button,pointerId=null,key=null) {
    if(hold||active()?.status!=='paused'||document.hidden||$('#modal'))return;
    hold={button,pointerId,key,id:active().id,started:performance.now()};
    button.focus({preventScroll:true});
    if(pointerId!=null)button.setPointerCapture(pointerId);
    const tick=now=>{
      if(!hold)return;
      if(!button.isConnected||document.hidden||active()?.id!==hold.id||active()?.status!=='paused'){cancelHold();return;}
      const progress=Math.min(1,(now-hold.started)/1200);
      button.style.setProperty('--hold-progress',progress);
      if(progress>=1){ignoreStopClickUntil=performance.now()+800;cancelHold();finish();return;}
      holdFrame=requestAnimationFrame(tick);
    };
    holdFrame=requestAnimationFrame(tick);
  }
  document.addEventListener('pointerdown',e=>{
    const button=e.target.closest('[data-action=finish]');
    if(button&&e.isPrimary&&e.button===0){e.preventDefault();startHold(button,e.pointerId);}
  });
  document.addEventListener('pointermove',e=>{
    if(!hold||hold.pointerId!==e.pointerId)return;
    const r=hold.button.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)cancelHold();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{if(hold?.pointerId===e.pointerId)cancelHold();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')cancelHold();
    const button=e.target.closest('[data-action=finish]');
    if(button&&(e.key===' '||e.key==='Enter')){e.preventDefault();if(!e.repeat)startHold(button,null,e.key);}
  });
  document.addEventListener('keyup',e=>{if(hold?.key===e.key){e.preventDefault();cancelHold();}});
  document.addEventListener('focusout',e=>{if(hold?.button===e.target)cancelHold();});
  document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-action=finish]'))e.preventDefault();});
  window.addEventListener('blur',cancelHold);
  async function choosePhoto(file) {
    if(!file||view!=='share')return;
    if(!file.type.startsWith('image/')){toast('사진 파일을 골라 주세요.');return;}
    if(file.size>20*1024*1024){toast('20MB 이하의 사진을 골라 주세요.');return;}
    clearPhoto();const token=photoToken,url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{if(token!==photoToken||!['share','complete'].includes(view)){URL.revokeObjectURL(url);return;}photo={url,img};if(view==='share')render();toast('사진은 이 창에서만 사용하고 업로드하지 않아요.');};
    img.onerror=()=>{URL.revokeObjectURL(url);toast('사진을 읽지 못했어요. JPG나 PNG로 다시 골라 주세요.');};img.src=url;
  }
  function exportCard() {
    if(!result)return;
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
    c.fillStyle='#d8f476';c.fillRect(0,0,1080,1350);
    if(photo){const scale=Math.max(1080/photo.img.width,1350/photo.img.height),w=photo.img.width*scale,h=photo.img.height*scale;c.drawImage(photo.img,(1080-w)/2,(1350-h)/2,w,h);c.fillStyle='#0009';c.fillRect(0,0,1080,1350);}
    c.fillStyle=photo?'#fff':'#19201c';
    c.font='bold 34px -apple-system, sans-serif';c.fillText('NOOP RUN CLUB',80,120);
    c.font='28px -apple-system, sans-serif';c.fillText(result.demo?'DEMO · 시연용 완주 기록':dateLabel(result.finishedAt)+' · 집콕 기록',80,174);
    c.font='bold 88px -apple-system, sans-serif';c.fillText('오늘도,',80,345);c.fillText('가만히 완주.',80,455);
    let size=210;const time=formatTime(result.elapsedMs);c.font=`${size}px Impact, sans-serif`;
    while(c.measureText(time).width>920&&size>80){size-=5;c.font=`${size}px Impact, sans-serif`;}
    c.fillText(time,75,755);c.font='31px -apple-system, sans-serif';c.fillText(result.homeRadius?'집에 머문 시간':'아무것도 하지 않은 시간',82,818);
    c.strokeStyle=photo?'#ffffff80':'#19201c60';c.lineWidth=2;c.beginPath();c.moveTo(80,915);c.lineTo(1000,915);c.stroke();
    c.font='115px Impact, sans-serif';c.fillText(recordDistance(result),80,1070);c.font='33px -apple-system, sans-serif';c.fillText('km',355,1068);c.font='24px -apple-system, sans-serif';c.fillText(result.homeRadius?'집에서 최대 거리':'시안 이동 거리',80,1110);
    c.font='28px -apple-system, sans-serif';c.fillText(result.mood||'내 속도로 쉬었어요.',80,1160);
    c.font='22px -apple-system, sans-serif';c.fillText(result.demo?'계획 중인 앱 · 디자인 시안 · 실제 운동 기록 아님':result.gpsHadGaps?'NOOPRUN · 위치 미확인 구간 포함':'NOOPRUN · 집콕 기록',80,1280);
    canvas.toBlob(blob=>{if(!blob){toast('카드를 저장하지 못했어요. 다시 시도해 주세요.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nooprun-${result.demo?'demo':new Date(result.finishedAt).toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('완주 카드 PNG를 저장했어요.');},'image/png');
  }

  const post='집에서 얼마나 뒹굴거렸는지 궁금해서 생각해본 앱.\n\n이름은 눕런.\n나이키런처럼 시작 누르면 “운동을 시작했습니다.” 하는데\n오늘의 코스는 집이야.\n\n누워서 폰 봐도 되고 게임해도 되고\n집 안에서 왔다 갔다 해도 계속 기록돼.\nGPS로 집을 벗어난 게 확인되면 자동으로 끝나고\n오늘 몇 시간 집에 있었는지 완주 기록이 남는 거지.\n\n마지막엔 내 사진에 기록 얹어서\n러닝 인증처럼 집콕 인증하는 거야.';
  function note(name='experience') {
    document.querySelectorAll('[data-note]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.note===name)));
    const content={
      experience:`<p class="note-kicker">01 / NOOP RUN CLUB</p><h2>오늘의 코스는,<br>집.</h2><p class="lede">집에서 얼마나 뒹굴거렸는지 궁금해서. 누워 있든, 게임하든, 집 안을 걷든 — 집에 머문 시간을 진지한 러닝 기록처럼 남겨요.</p><ol class="flow"><li><strong>집에서 시작 버튼</strong>처음 한 번 집 위치와 반경을 정해요.</li><li><strong>“운동을 시작했습니다.”</strong>목표 시간 없이 집콕 시간이 쌓여요.</li><li><strong>외출하면 자동 완주</strong>GPS 오차를 고려해 집 구역 밖임을 확인하면 기록을 마쳐요.</li><li><strong>집콕도 인증</strong>내 사진에 오늘의 기록을 얹어서 저장해요.</li></ol><p class="note-callout">나이키런 패러디 방향. 시작 · 큰 숫자 · 일시정지 · 길게 눌러 종료 · 기록 · 사진 공유까지 익숙한 운동 앱의 흐름으로.</p>`,
      scope:`<p class="note-kicker">02 / HOME, NOT A POSTURE</p><h2>얼마나 오래<br>집에 있었을까.</h2><h3>이번 웹 체험</h3><ul class="scope-list"><li>위치 권한 요청과 집 반경 50·100·200m 설정</li><li>집 안에서 수동 시작, 집 밖에서 자동 종료</li><li>GPS 오차 · 수신 끊김 · 경계 확인 상태</li><li>실제 집과의 직선거리, 기록 · 사진 카드</li></ul><p class="note-callout">웹 화면이 켜진 동안만 외출을 확인해요. 화면을 닫거나 잠그면 확인하지 못한 구간이 생겨요. iOS 백그라운드 감지는 별도 앱 구현과 실제 기기 검증이 필요해요.</p><h3>위치 데이터</h3><p class="lede">집 위치는 이 브라우저에만 저장해요. 현재 위치는 외출 판단에 사용하고, 이동 경로를 저장하거나 서버로 보내지 않아요. 지도 그림은 집 구역을 설명하는 예시예요.</p>`,
      post:`<p class="note-kicker">03 / ASK BEFORE BUILDING MORE</p><h2>친구한테 자랑할<br>쓸데있는 기록.</h2><p class="lede">계획 중인 앱으로 소개하는 쓰레드 초안이에요.</p><textarea class="post-copy" id="post-copy" aria-label="쓰레드 게시글 초안">${esc(post)}</textarea><button class="copy-post" data-action="copy-post">글 복사 ↗</button><p class="note-callout">영상은 화면 방향을 고른 뒤 제작해요. 이번 시안에서는 이미지를 저장할 수 있고, 게시나 외부 전송은 하지 않아요.</p>`
    };
    $('#note-content').innerHTML=content[name]+'<a class="note-link" href="../../#nooprun">전체 기획과 원래 요청 보기 ↗</a>';
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.radius){setupRadius=Number(b.dataset.radius);render();$(`[data-radius="${setupRadius}"]`)?.focus();return;}
    if(b.dataset.note){note(b.dataset.note);return;}
    if(b.dataset.demo){showDemo(b.dataset.demo);return;}
    if(b.dataset.record){result=data.records.find(r=>r.id===b.dataset.record);clearPhoto();view='complete';render(true);return;}
    if(b.dataset.mood){if(!result)return;result.mood=b.dataset.mood;const r=data.records.find(r=>r.id===result.id);if(r){r.mood=result.mood;persist();}render();return;}
    const action=b.dataset.action;
    if(['home','history','settings','share','complete'].includes(action)){go(action);return;}
    if(action==='start'){requestStart();return;}
    if(action==='setup-home'){openSetup(view==='locating');return;}
    if(action==='cancel-gps'){stopGPS();go('home');return;}
    if(action==='gps-retry'){gps.start(gpsIntent==='setup'?null:data.active?.home || data.home,{detectExit:gpsIntent==='session'});return;}
    if(action==='save-home'){
      const fix=gps.fix();if(!fix || fix.accuracy>Math.min(50,setupRadius/2))return;
      data.home={latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy,radius:setupRadius,savedAt:Date.now()};persist();
      stopGPS();if(setupThenStart)requestStart();else go('home');return;
    }
    if(action==='cancel-countdown'){cancelCountdown();return;}
    if(action==='metric'){runMetric=b.dataset.metric==='distance'?'distance':'time';render();$(`.metric-tabs [data-metric=${runMetric}]`)?.focus({preventScroll:true});return;}
    if(action==='art'){window.NooprunArt.toggle();render();$('[data-action=art]')?.focus({preventScroll:true});return;}
    if(action==='effects'){window.NooprunSFX?.toggle();render();return;}
    if(action==='sound'){data.sound=!data.sound;persist();window.NooprunVoice?.setEnabled(data.sound);render();$('[data-action=sound]')?.focus({preventScroll:true});return;}
    if(action==='voice-preview'){say('start');return;}
    if(action==='pause'){pause();return;}
    if(action==='finish'){if(performance.now()<ignoreStopClickUntil)return;if(e.detail===0)confirmFinish();else toast('종료 버튼을 길게 누르면 기록을 마쳐요.');return;}
    if(action==='keep-resting'){closeModal();return;}
    if(action==='confirm-finish'){const fn=modalAction;closeModal();fn?.();return;}
    if(action==='export'){exportCard();return;}
    if(action==='remove-photo'){clearPhoto();render();return;}
    if(action==='copy-post'){try{await navigator.clipboard.writeText($('#post-copy').value);toast('글을 복사했어요.');}catch{$('#post-copy').select();toast('글을 선택했어요. 복사해서 사용하세요.');}}
  });
  document.addEventListener('change',e=>{if(e.target.id==='photo-input')choosePhoto(e.target.files[0]);});
  document.addEventListener('keydown',e=>{
    if(e.target.id==='photo-label'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.NooprunSFX?.play('tap');$('#photo-input').click();}
    const modal=$('#modal');
    if(modal){if(e.key==='Escape'){closeModal();return;}if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
    else if(e.key==='Escape'&&view==='countdown')cancelCountdown();
  });
  function resize(){const width=Math.min(375,Math.max(260,$('.preview').clientWidth)),scale=width/375;$('#phone').style.transform=`scale(${scale})`;$('#phone').style.marginBottom=(812*scale-812)+'px';}
  new ResizeObserver(resize).observe($('.preview'));
  function resumeGPS(){
    if(data.active?.home){gpsIntent='session';gps.start(data.active.home);}
    else if(gpsIntent==='setup')gps.start();
    else if(gpsIntent==='start')gps.start(data.home,{detectExit:false});
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      cancelHold();if(view==='countdown')cancelCountdown();
      if(data.active?.home)data.active.gpsHadGaps=true;
      gps.stop();gpsState={status:'suspended',distance:null,accuracy:null};persist();
    }else{resumeGPS();updateTimer();}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)resumeGPS();});
  window.addEventListener('pagehide',()=>{cancelHold();if(data.active?.home)data.active.gpsHadGaps=true;gps.stop();persist();window.NooprunVoice?.stop();});
  let lastPaint=0;function frame(time){if(time-lastPaint>160){updateTimer();lastPaint=time;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.nooprun={state:()=>({view,runMetric,holding:!!hold,storageOK,active:active()?{...active(),elapsedMs:elapsed()}:null,result:result?{...result}:null,records:data.records.map(r=>({...r})),goal:data.goal,homeConfigured:!!data.home,homeRadius:data.home?.radius || null,gps:{...gpsState}}),showDemo};
  // Deterministic, explicitly labelled demo frames for the introduction video.
  // An actual active session is never replaced; no demo state is persisted.
  function videoFrame({scene='home',elapsedMs=0,countdown:count=3}={}) {
    if (!['home','countdown','running','complete'].includes(scene)) throw new Error('Unknown video scene');
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid demo time');
    if (data.active) return {ok:false,reason:'real-session-active'};
    stopGPS();clearInterval(countdownTimer);countdownTimer=null;
    $('#modal')?.remove();$('#app').inert=false;modalAction=null;
    if (scene !== 'complete' && view !== scene) clearPhoto();
    if (scene === 'home') {demoSession=null;demoClockMs=null;result=null;view='home';}
    if (scene === 'countdown') {demoSession=null;demoClockMs=null;countdown=Math.max(1,Math.min(3,Math.round(count)));view='countdown';}
    if (scene === 'running') {
      demoClockMs=elapsedMs;
      demoSession={id:'demo-video',status:'running',baseMs:elapsedMs,runSince:Date.now(),startedAt:Date.now(),goal:data.goal,demo:true};
      view='running';
    }
    if (scene === 'complete' && !(view==='complete' && result?.demo && result.elapsedMs===elapsedMs)) {
      demoClockMs=elapsedMs;
      demoSession={id:'demo-video',status:'running',baseMs:elapsedMs,runSince:Date.now(),startedAt:Date.now(),goal:data.goal,demo:true};
      finish({silent:true});
    }
    render();
    return {ok:true,...window.nooprun.state()};
  }
  window.nooprunVideo={
    reset:()=>videoFrame({scene:'home'}),
    frame:videoFrame,
    finish:()=>{if(!demoSession?.demo)return false;finish({silent:true});return window.nooprun.state();},
    getState:()=>window.nooprun.state(),
    exportCard:()=>{if(!result?.demo)return false;exportCard();return true;}
  };
  note();render();resize();
  if(data.active?.home){data.active.gpsHadGaps=true;persist();resumeGPS();}
  window.ready=document.fonts.ready;
})();
