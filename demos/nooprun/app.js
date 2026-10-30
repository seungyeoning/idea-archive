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
  let activityPeriod='월', guideIndex=0, sessionPage='metrics';
  let metricSlots=['pace','bpm','time'], countSeconds=3, voiceTime=true, voiceDistance=true, screenLocked=false;
  let demoClockMs = null, runMetric = 'distance', hold = null, holdFrame = null, ignoreStopClickUntil = 0;
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

  const glyphs={
    settings:'<path d="m10 2-.5 3-2 1L5 4.5 2.5 8 5 10v4l-2.5 2L5 19.5 7.5 18l2 1 .5 3h4l.5-3 2-1 2.5 1.5 2.5-3.5-2.5-2v-4l2.5-2L19 4.5 16.5 6l-2-1-.5-3Z"/><circle cx="12" cy="12" r="3.5"/>',
    home:'<path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z"/>',
    pin:'<path d="M12 22S4 12 4 8a8 8 0 1 1 16 0c0 4-8 14-8 14Z"/><circle cx="12" cy="8" r="3"/>',camera:'<path d="M3 6h4l2-3h6l2 3h4v15H3Z"/><circle cx="12" cy="13" r="4"/>',
    plan:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M8 11l3 3 5-6"/>',
    run:'<circle cx="15" cy="3" r="2"/><path d="m4 9 5-3 5 4 5 1M13 9l-3 6 5 3 1 4M10 15l-5 5H2m7-14 2 4-3 3"/>',
    club:'<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M1 21v-3a7 7 0 0 1 14 0v3Zm14-8a6 6 0 0 1 8 5v3h-5"/>',
    activity:'<path d="M3 22V13h5v9m0 0V7h5v15m0 0V2h5v20M1 22h21"/>',
    pause:'<path d="M8 3v18m8-18v18"/>',clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v5m-3-12h6m-3 0v3"/>',device:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 19h4"/>',heart:'<path d="M12 21S1 14 1 7c0-6 9-7 11-1 2-6 11-5 11 1 0 7-11 14-11 14ZM3 11h5l2-4 4 9 2-5h5"/>',watch:'<rect x="6" y="5" width="12" height="14" rx="4"/><path d="M9 5V1h6v4m-6 14v4h6v-4"/>',
    music:'<path d="M8 17V5l12-3v13M8 9l12-3"/><ellipse cx="5" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
    signal:'<circle cx="12" cy="9" r="2"/><path d="M12 11v10M7 5a6 6 0 0 0 0 9m10-9a6 6 0 0 1 0 9M4 2a10 10 0 0 0 0 15m16-15a10 10 0 0 1 0 15"/>',
    bookmark:'<path d="M5 3h14v19l-7-5-7 5Z"/>',
    shoe:'<path d="m3 14 6-5 3 3 7 2 2 5H3Zm1 5v3h17v-3M9 9l1-4 4 4-2 3m1 2 2-3"/>',
    arrow:'<path d="m9 4 8 8-8 8"/>',
    edit:'<path d="m3 16 12-13 6 6L8 22H2Zm9-10 6 6M3 16l5 6"/>',
    plus:'<path d="M12 3v18M3 12h18"/>'
  };
  const svgIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${glyphs[name]||icon(name)||''}</svg>`;
  const tabbar=current=>`<nav class="nrc-tabbar" aria-label="앱 메뉴">${[['feed','home','홈'],['plan','plan','플랜'],['home','run','러닝'],['club','club','클럽'],['history','activity','활동']].map(([action,g,label])=>`<button data-action="${action}" ${current===action?'aria-current="page"':''}>${svgIcon(g)}<span>${label}</span></button>`).join('')}</nav>`;
  const topbar=(extra='')=>`<header class="nrc-topbar"><button class="nrc-avatar" data-action="profile" aria-label="프로필"><img src="assets/brand/nooprun-recline.png?v=sharp-tip-1" alt="눕런" width="32" height="32"></button>${extra}</header>`;
  // Stylized public fixture: no coordinates, buildings, or labels from the private phone capture.
  const mapArt=()=>`<svg class="nrc-map" viewBox="0 0 375 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="375" height="500" fill="#f1f1ed"/><path d="M-90 30 210 520H85L-110 120Z" fill="#d5eef8"/><g fill="#e5e9e0"><path d="m36 50 45-25 58 100-45 25Zm69 120 49-28 65 112-49 28Zm123 120 58-32 68 112-58 32Z"/></g><g stroke="#fff" fill="none"><path d="m30-40 330 580M90-40l310 540M-20 240 420-20M50 470 420 250M-10 120 380-90" stroke-width="18"/><path d="M30 125 390 335M90 410 390 230M160 36 365 390" stroke-width="7"/></g><g stroke="#d4d5d1" stroke-width="1" fill="none"><path d="m30-40 330 580M90-40l310 540M-20 240 420-20M50 470 420 250"/></g><g fill="#dbe5d3"><circle cx="116" cy="240" r="24"/><circle cx="300" cy="120" r="32"/></g></svg>`;
  function home() {
    return `<section class="app-screen nrc-shell nrc-run-start">
      ${topbar(`<button class="nrc-plain-icon" data-action="saved-guides" aria-label="저장한 러닝 가이드">${svgIcon('bookmark')}</button>`)}
      <h2 class="nrc-title">러닝</h2><nav class="nrc-mode-tabs" aria-label="러닝 메뉴"><button data-action="home" aria-current="page">바로 시작</button><button data-action="guides">러닝 가이드</button></nav>
      <div class="nrc-run-stage">${mapArt()}<div class="nrc-map-fade"></div>
        <div class="nrc-guide-carousel"><button class="nrc-guide-card" data-action="guides"><span class="nrc-guide-art">${svgIcon(guideIndex?'run':'plan')}</span><span>${guideIndex?'러닝 가이드 체험하기<br><strong>첫 번째 러닝</strong>':'코치 및 운동선수들과<br>함께하는 러닝 가이드 더 보기'}</span></button><div class="nrc-carousel-dots" aria-label="러닝 가이드 카드"><button data-guide="0" aria-label="가이드 소개" aria-pressed="${!guideIndex}"></button><button data-guide="1" aria-label="첫 번째 러닝" aria-pressed="${!!guideIndex}"></button></div></div>
        <div class="nrc-location"><div class="nrc-map-tools"><button data-action="shoes" aria-label="러닝화">${svgIcon('shoe')}</button><button data-action="gps-info" aria-label="GPS 신호">${svgIcon('signal')}</button></div><span class="nrc-position" aria-hidden="true"></span></div>
        <div class="nrc-launch"><button class="nrc-map-control" data-action="settings" aria-label="설정">${svgIcon('settings')}</button><button class="nrc-start club-start" data-action="start">시작</button><button class="nrc-map-control" data-action="music" aria-label="음악 연결하기">${svgIcon('music')}<span class="nrc-slash" aria-hidden="true"></span></button></div>
        <button class="nrc-goal" data-action="goal">목표 설정</button>${warning()}
      </div>${tabbar('home')}</section>`;
  }
  function counting() {
    return `<section class="app-screen nrc-countdown"><header class="app-header">${iconButton('close','cancel-countdown','취소')}</header><div class="countdown-wrap"><strong class="countdown-number" id="countdown" aria-live="polite">${countdown}</strong></div><button class="text-button" data-action="cancel-countdown">취소</button></section>`;
  }
  function running() {
    const s=active(),paused=s.status==='paused';
    if(sessionPage==='settings')return sessionSettings();
    const values={time:formatTime(elapsed()),distance:gpsDistance(),pace:'–′–″',bpm:'—',cadence:'—'};
    const labels={time:'시간',distance:'킬로미터',pace:'페이스',bpm:'BPM',cadence:'케이던스'};
    const metric=(name,hero=false)=>`<strong ${name==='time'?(hero?'id="timer" role="timer"':'data-elapsed'):name==='distance'?'data-home-distance':''} class="${hero?(name==='time'?'timer':'hero-value'):''}">${values[name]}</strong>`;
    const pauseIcon='<rect x="6" y="4" width="4" height="20" rx="1"/><rect x="18" y="4" width="4" height="20" rx="1"/>';
    const metrics=`<div class="nrc-live-metrics metric-tabs">${metricSlots.map((k,i)=>`<button data-metric-slot="${i}" aria-label="${labels[k]}, 눌러 지표 변경">${metric(k)}<small>${labels[k]}</small></button>`).join('')}</div>`;
    return `<section class="app-screen running nrc-session" data-paused="${paused}" data-page="${sessionPage}">
      ${paused||sessionPage==='map'?`<div class="nrc-pause-map">${mapArt()}<span class="nrc-position" aria-hidden="true"></span></div>`:metrics+`<button class="metric-hero" data-action="metric" data-metric="${runMetric==='time'?'distance':runMetric==='distance'?'pace':'time'}" aria-label="다음 기록 크게 보기">${metric(runMetric,true)}<span class="hero-label">${runMetric==='pace'?'현재 페이스':labels[runMetric]}</span></button>`}
      ${paused?`<div class="nrc-pause-metrics">${['distance','pace','time'].map(k=>`<div>${metric(k,k==='time')}<small>${k==='pace'?'평균 페이스':labels[k]}</small></div>`).join('')}<div><strong>—</strong><small>칼로리</small></div><div><strong>—</strong><small>고도</small></div><div><strong>—</strong><small>BPM</small></div></div>`:''}
      <div class="session-controls">${paused?`<button class="session-circle stop" data-action="finish" aria-label="종료, 길게 누르기"><svg class="hold-ring" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="50"/></svg><svg viewBox="0 0 28 28" aria-hidden="true"><rect x="5" y="5" width="18" height="18" rx="1"/></svg></button>`:''}<button class="session-circle" data-action="pause" aria-label="${paused?'다시 시작':'일시정지'}"><svg viewBox="0 0 28 28" aria-hidden="true">${paused?'<path d="M8 4 24 14 8 24Z"/>':pauseIcon}</svg></button></div>
      <div class="nrc-page-dots" aria-label="기록 화면 선택"><button data-session-page="map" aria-label="지도" aria-pressed="${sessionPage==='map'}"></button><button data-session-page="metrics" aria-label="기록" aria-pressed="${sessionPage==='metrics'}"></button><button data-action="session-settings" aria-label="기록 설정"></button></div>
      <button class="nrc-music-button" data-action="music">음악 연결하기</button>
      ${s.home?'<div class="session-gps"><span data-gps-status></span><button class="gps-retry" data-action="gps-retry" hidden>위치 다시 확인</button></div>':''}${warning()}
    </section>`;
  }
  function sessionSettings(){
    return `<section class="app-screen nrc-session-settings nrc-settings"><h2>설정</h2><div class="nrc-session-links"><button data-session-page="map">지도 ${svgIcon('pin')}</button><label tabindex="0" id="session-photo-label">카메라 ${svgIcon('camera')}<input id="session-photo-input" type="file" accept="image/*" capture="environment" aria-label="사진 선택"></label><button data-action="location-share-info">러닝 위치 공유 ${svgIcon('signal')}</button></div><div class="nrc-session-switches">${switchRow('자동 일시 중지','auto-pause-info',true)}${switchRow('음성 피드백','sound',data.sound)}${switchRow('러닝 화면 잠금','screen-lock',screenLocked)}</div><button class="nrc-return-run" data-session-page="metrics"><strong data-elapsed>${formatTime(elapsed())}</strong><span>→</span></button></section>`;
  }
  function card(r) {
    return `<div class="result-card${photo?' photo-preview':''}" id="result-card"><div class="card-top"><span>NOOP RUN CLUB</span><span>${r.demo?'DEMO / 시연':dateLabel(r.finishedAt)}</span></div><strong class="card-time${r.elapsedMs>=3600000?' long':''}">${formatTime(r.elapsedMs)}</strong><p class="card-desc">${r.demo?'시연용 완주 기록':r.homeRadius?'집에 머문 시간':'아무것도 하지 않은 시간'}</p><hr class="card-rule"><div class="card-footer"><div><strong>${recordDistance(r)} <small>km</small></strong><small class="card-distance-label">${r.homeRadius?'집에서 최대 거리':'시안 이동 거리'}</small></div><span>오늘도, 가만히 완주.<br>${r.demo?'화면 예시':'집콕 기록'}</span></div></div>`;
  }
  function completed() {
    if (!result) {view='home';return home();}
    const hour=new Date(result.finishedAt).getHours(),period=hour<6?'새벽':hour<12?'오전':hour<18?'오후':'저녁';
    const clock=new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit',hour12:false}).format(result.finishedAt);
    const weekday=new Intl.DateTimeFormat('ko-KR',{weekday:'long'}).format(result.finishedAt);
    return `<section class="app-screen complete nrc-detail">
      <header class="app-header">${iconButton('back','history','활동으로 돌아가기')}<span></span><button class="nrc-plain-icon nrc-more" data-action="record-menu" aria-label="더 보기">•••</button></header>
      <p class="record-date">${dateLabel(result.finishedAt)} ${clock}</p><h2>${esc(result.title||weekday+' '+period+' 러닝')}<button data-action="edit-record" aria-label="러닝 제목 편집">${svgIcon('edit')}</button></h2>
      <div class="nrc-result-distance"><strong>${recordDistance(result)}</strong><span>킬로미터</span></div>
      <div class="nrc-result-grid"><div><strong>–′–″</strong><span>평균 페이스</span></div><div><strong>${formatTime(result.elapsedMs)}</strong><span>시간</span></div><div><strong>—</strong><span>칼로리</span></div><div><strong>—</strong><span>고도 상승</span></div><div><strong>—</strong><span>평균 심박수</span></div><div><strong>—</strong><span>케이던스</span></div></div>
      <div class="nrc-record-map">${mapArt()}<span class="nrc-position"></span></div>
      <p class="exit-reason">${result.endReason==='left-home'?'집을 벗어나 기록을 종료했어요.':''}${result.gpsHadGaps?'<br>위치를 확인하지 못한 구간이 포함돼 있어요.':''}</p>
      <button class="nrc-detail-row" data-action="feeling">기분이 어떠셨나요?<span>${esc(result.mood||'＋')}</span></button>
      <button class="nrc-detail-row" data-action="shoes">러닝화<span>＋</span></button>
      <div class="result-actions">${primary('공유','share')}${primary('완료','home','paper')}</div>
      <p class="saved-indicator">${result.demo?'시연용 기록 · 저장되지 않음':'이 브라우저에 저장됨'}</p>
    </section>`;
  }
  function shareView() {
    if(!result){view='home';return home();}
    return `<section class="app-screen complete share-editor"><header class="app-header">${iconButton('close','complete','취소')}<h2>공유</h2><button class="nrc-text-action" data-action="export">저장</button></header>${card(result)}<div class="share-tools"><label tabindex="0" id="photo-label">사진<input id="photo-input" type="file" accept="image/*" aria-label="사진 선택"></label><button data-action="remove-photo" aria-pressed="${!photo}">배경</button></div><p class="share-caption">사진은 이 기기에서만 사용해요.</p><div class="result-actions">${primary('공유하기','native-share')}</div></section>`;
  }
  function periodRecords() {
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if(activityPeriod==='주')start.setDate(start.getDate()-((start.getDay()+6)%7));
    if(activityPeriod==='월')start.setDate(1);
    if(activityPeriod==='년')start.setMonth(0,1);
    if(activityPeriod==='전체')return data.records;
    return data.records.filter(r=>r.finishedAt>=start.getTime()&&r.finishedAt<=Date.now());
  }
  function historyView() {
    const records=periodRecords(),total=records.reduce((n,r)=>n+r.elapsedMs,0),days=['월','화','수','목','금','토','일'];
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-((start.getDay()+6)%7));
    const buckets=activityPeriod==='주'?days:activityPeriod==='월'?Array.from({length:new Date(now.getFullYear(),now.getMonth()+1,0).getDate()},(_,i)=>String(i+1)):Array.from({length:12},(_,i)=>String(i+1));
    const weekly=buckets.map((_,i)=>records.filter(r=>{const d=new Date(r.finishedAt);return activityPeriod==='주'?r.finishedAt>=+start+i*86400000&&r.finishedAt<+start+(i+1)*86400000:activityPeriod==='월'?d.getDate()===i+1:d.getMonth()===i;}).reduce((n,r)=>n+r.elapsedMs,0));
    const distance=records.reduce((sum,r)=>sum+Number(recordDistance(r)),0).toFixed(2);
    const max=Math.max(1,...weekly);
    return `<section class="app-screen nrc-shell nrc-activity">${topbar(`<button class="nrc-plain-icon" data-action="activity-info" aria-label="활동 정보">${svgIcon('plus')}</button>`)}<h2 class="nrc-title">활동</h2><div class="nrc-periods" aria-label="활동 기간">${['주','월','년','전체'].map(x=>`<button data-period="${x}" aria-pressed="${activityPeriod===x}">${x}</button>`).join('')}</div><div class="nrc-content"><p class="nrc-period-date">${activityPeriod==='주'?'이번 주':activityPeriod==='월'?now.getFullYear()+'년 '+(now.getMonth()+1)+'월':activityPeriod==='년'?now.getFullYear()+'년':'전체 활동'}</p><div class="nrc-activity-total"><strong>${distance}</strong><span>킬로미터</span></div><div class="nrc-activity-stats"><span><b>${records.length}</b>러닝</span><span><b>–′–″</b>평균 페이스</span><span><b>${formatTime(total)}</b>시간</span></div>${`<div class="nrc-chart" style="--bars:${buckets.length}" aria-label="요일별 집콕 시간">${weekly.map((v,i)=>`<div><span style="height:${v?Math.max(3,v/max*100):0}%" title="${buckets[i]} ${duration(v)}"></span><small>${buckets.length>12&&i%5!==0?'':buckets[i]}</small></div>`).join('')}</div>`}<div class="nrc-section-heading"><h3>최근 활동</h3><span>${records.length}</span></div>${records.length?`<ul class="records">${records.slice().sort((a,b)=>b.finishedAt-a.finishedAt).map(r=>`<li><button data-record="${esc(r.id)}"><span class="nrc-record-thumb">${svgIcon('run')}</span><span class="nrc-record-copy"><small>${dateLabel(r.finishedAt)}</small><strong>러닝</strong><span>${formatTime(r.elapsedMs)} · ${recordDistance(r)} km</span></span>${svgIcon('arrow')}</button></li>`).join('')}</ul>`:'<div class="empty-state">아직 활동이 없습니다.</div>'}${warning()}</div>${tabbar('history')}</section>`;
  }
  const settingTile=(g,value,label,action)=>`<button data-action="${action}">${svgIcon(g)}<span>${value}</span><strong>${label}</strong></button>`;
  const settingsHeader=(title,action='settings',done=false)=>`<header class="app-header">${done?'<span class="header-spacer"></span>':iconButton('back',action,'뒤로')}<h2>${title}</h2>${done?'<button data-action="home" class="nrc-text-action">완료</button>':'<span class="header-spacer"></span>'}</header>`;
  const switchRow=(label,action,on)=>`<div class="settings-row"><span>${label}</span><button class="switch" role="switch" aria-label="${label}" aria-checked="${!!on}" data-action="${action}"><span></span></button></div>`;
  function settings() {
    return `<section class="app-screen nrc-settings settings">${settingsHeader('설정','home',true)}<h3 class="nrc-setting-caption">측정</h3><div class="nrc-setting-tiles">${settingTile('home','집','실내/실외','measurement')}${settingTile('pause','켜기','러닝 자동 일시 정지','auto-pause-info')}</div><h3 class="nrc-setting-caption">표시 및 음성</h3><div class="nrc-setting-tiles">${settingTile('sound',data.sound?'켜기 / 여성':'끄기','음성 피드백','voiceSettings')}${settingTile('clock',countSeconds+'초','카운트다운','countSettings')}${settingTile('device','세로','화면 방향','orientation-info')}${settingTile('activity','러닝 레벨 색상','표시','display-info')}</div><h3 class="nrc-setting-caption">기기</h3><div class="nrc-setting-tiles">${settingTile('heart','연결 전','심박수 표시','heart-info')}${settingTile('watch','설정','Apple Watch','watch-info')}</div><div class="nrc-settings-group"><h3>눕런</h3><button class="nrc-setting-link" data-action="setup-home"><span>집 위치</span><span>${data.home?`반경 ${data.home.radius}m`:'설정'} ${svgIcon('arrow')}</span></button>${switchRow('효과음','effects',window.NooprunSFX?.state().enabled)}<p>집 위치와 기록은 이 브라우저에만 저장해요. 거리는 집 중심에서의 직선거리예요.</p><p>화면이 꺼지거나 다른 앱을 사용하는 동안 외출 확인은 멈춰요. 심박수·칼로리·페이스는 측정하지 않아요.</p></div>${warning()}</section>`;
  }
  function countSettings(){return `<section class="app-screen nrc-settings">${settingsHeader('러닝 카운트다운')}<div class="nrc-settings-group">${switchRow('러닝 카운트다운','countdown-info',true)}${[3,6,9].map(n=>`<button class="nrc-setting-link" data-count-seconds="${n}"><span>${n}초</span><span class="nrc-radio ${countSeconds===n?'selected':''}"></span></button>`).join('')}<h3>추가 옵션</h3>${switchRow('러닝 시작 시 앱 잠금','lock-info',false)}</div></section>`;}
  function voiceSettings(){return `<section class="app-screen nrc-settings">${settingsHeader('음성 피드백')}<div class="nrc-settings-group">${switchRow('음성 피드백','sound',data.sound)}<h3>음성 타입</h3><button class="nrc-setting-link" data-action="voice-type-info"><span>남성</span><span class="nrc-radio"></span></button><button class="nrc-setting-link" data-action="voice-preview"><span>여성</span><span class="nrc-radio selected"></span></button><h3>피드백</h3>${switchRow('시간','voice-time',voiceTime)}${switchRow('거리','voice-distance',voiceDistance)}<button class="nrc-setting-link" data-action="voice-preview">음성 안내 미리 듣기 ${svgIcon('signal')}</button><p>현재 시안에는 시작·종료 음성이 연결되어 있어요. 주기별 음성 피드백은 연결 전입니다.</p></div></section>`;}
  function feed() {
    return `<section class="app-screen nrc-shell">${topbar()}<h2 class="nrc-title">홈</h2><div class="nrc-content nrc-feed"><div class="nrc-section-heading"><h3>새로운 소식</h3><button data-action="guides">모두 보기</button></div><p class="nrc-muted">눕런의 최신 소식을 확인해 보세요.</p><button class="nrc-editorial" data-action="home"><span>NOOP RUN CLUB</span><strong>오늘의 코스는,<br>집.</strong><img src="assets/brand/nooprun-recline.png?v=sharp-tip-1" alt=""><b>시작하기</b></button></div>${tabbar('feed')}</section>`;
  }
  function guides() {
    return `<section class="app-screen nrc-shell">${topbar(`<button class="nrc-plain-icon" data-action="saved-guides" aria-label="저장한 러닝 가이드">${svgIcon('bookmark')}</button>`)}<h2 class="nrc-title">러닝</h2><nav class="nrc-mode-tabs"><button data-action="home">바로 시작</button><button data-action="guides" aria-current="page">러닝 가이드</button></nav><div class="nrc-content"><h3 class="nrc-section-title">시작하기</h3><button class="nrc-guide-feature" data-action="guide-detail"><span>첫 번째 러닝</span><strong>FIRST<br>RUN.</strong><small>러닝 가이드</small></button><p class="nrc-muted nrc-feature-note">가이드 화면 시안 · 코칭 오디오는 제공하지 않습니다.</p></div>${tabbar('home')}</section>`;
  }
  function plan() {
    return `<section class="app-screen nrc-shell">${topbar()}<h2 class="nrc-title">플랜</h2><div class="nrc-content"><h3 class="nrc-section-title">모든 시작을 위한 플랜</h3><button class="nrc-plan-card" data-action="plan-detail"><span>첫 시작</span><strong>GET<br>STARTED.</strong><small>플랜 보기 →</small></button><p class="nrc-muted nrc-feature-note">플랜 화면 시안 · 훈련 프로그램은 아직 연결하지 않았습니다.</p></div>${tabbar('plan')}</section>`;
  }
  function club() {
    return `<section class="app-screen nrc-shell">${topbar()}<h2 class="nrc-title">클럽</h2><div class="nrc-mode-tabs"><button data-club-tab="challenges" aria-current="page">챌린지</button><button data-club-tab="friends">친구</button></div><div class="nrc-content" id="club-content"><div class="nrc-section-heading"><h3>챌린지</h3><button data-action="club-detail">모두 보기</button></div><div class="nrc-club-empty">${svgIcon('club')}<h3>함께 시작하세요.</h3><p>친구와 챌린지는 연결 전입니다.</p><button class="nrc-black-pill" data-action="club-detail">자세히 보기</button></div></div>${tabbar('club')}</section>`;
  }
  function showPanel(title,body) {
    closeModal();focusBeforeModal=document.activeElement;
    const box=document.createElement('div');box.id='modal';box.className='modal-backdrop nrc-backdrop';
    box.innerHTML=`<section class="modal nrc-sheet" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header><h2 id="panel-title">${title}</h2><button data-action="keep-resting" aria-label="닫기">${svgIcon('close')}</button></header>${body}</section>`;
    $('#phone').append(box);$('#app').inert=true;box.querySelector('button').focus();
  }
  function openPanel(action) {
    const content={
      'location-share-info':['러닝 위치 공유','<p>실시간 위치 공유는 아직 연결하지 않았습니다. 현재 위치는 외부로 전송하지 않습니다.</p>'],
      'record-menu':['러닝','<button class="nrc-choice" data-action="panel-share">공유하기</button><button class="nrc-choice" data-action="edit-record">러닝 편집</button><button class="nrc-choice nrc-delete" data-action="delete-record">삭제</button><button class="nrc-choice" data-action="keep-resting">취소</button>'],
      measurement:['실내/실외','<p>눕런은 집 GPS를 기준으로 기록합니다.</p><button class="nrc-black-pill" data-action="panel-home">집 위치 설정</button>'],
      'auto-pause-info':['러닝 자동 일시 정지','<p>눕런은 집 밖 이동을 확인하면 기록을 종료합니다. NRC의 이동 정지 감지 기능은 연결하지 않았습니다.</p>'],
      'orientation-info':['화면 방향','<p>이 웹 시안은 세로 화면으로 표시됩니다.</p>'],
      'display-info':['표시','<p>현재 화면은 실제 NRC에서 확인한 초록색으로 맞췄습니다.</p>'],
      'heart-info':['심박수 표시','<p>심박 센서가 연결되지 않았습니다.</p>'],
      'watch-info':['Apple Watch','<p>Apple Watch 앱은 아직 연결하지 않았습니다.</p>'],
      'countdown-info':['러닝 카운트다운','<p>3초, 6초, 9초 중 선택할 수 있습니다.</p>'],
      'lock-info':['러닝 시작 시 앱 잠금','<p>웹 시안은 앱 잠금을 지원하지 않습니다.</p>'],
      'voice-type-info':['음성 타입','<p>현재는 여성 음성만 연결되어 있습니다.</p>'],
      music:['음악 연결하기','<p>음악 서비스 연결은 아직 제공하지 않습니다.</p><div class="settings-row"><span>음성 안내</span><button data-action="panel-sound" class="nrc-black-pill">'+(data.sound?'끄기':'켜기')+'</button></div>'],
      goal:['목표 설정','<button class="nrc-choice" data-action="keep-resting">자유롭게 <span>✓</span></button><p>눕런은 목표 시간 없이 기록하며, 외출을 확인하면 종료합니다.</p>'],
      shoes:['러닝화','<p>러닝화 연동은 제공하지 않습니다. 눕런은 집에 머문 시간을 기록하는 앱 시안입니다.</p>'],
      'gps-info':['GPS 신호',`<p>${gpsLabels[gpsState.status]}</p><p>현재 설정: ${data.home?'집 반경 '+data.home.radius+'m':'집 위치 설정 전'}</p><button class="nrc-black-pill" data-action="panel-home">집 위치 설정</button>`],
      profile:['프로필','<p>로그인 없이 이 브라우저에 기록을 보관합니다.</p><button class="nrc-choice" data-action="panel-settings">설정 '+svgIcon('arrow')+'</button>'],
      'saved-guides':['저장한 러닝 가이드','<p>저장한 러닝 가이드가 없습니다.</p>'],
      'guide-detail':['첫 번째 러닝','<p>코칭 오디오는 아직 연결하지 않았습니다. 자유롭게 기록을 시작할 수 있습니다.</p><button class="nrc-black-pill" data-action="panel-run">바로 시작</button>'],
      'plan-detail':['플랜','<p>플랜 소개 화면입니다. 훈련 일정 등록이나 자동 시작 기능은 제공하지 않습니다.</p>'],
      'club-detail':['클럽','<p>친구 초대와 온라인 챌린지는 연결 전입니다. 실제 초대나 등록은 이루어지지 않습니다.</p>'],
      'activity-info':['활동','<p>이 기기에서 완료한 집콕 기록입니다. 거리는 집에서 가장 멀리 떨어졌던 직선거리이며, 이동 경로의 길이가 아닙니다.</p>'],
      'session-settings-unused':['기록 설정','<p>기록은 화면을 벗어나도 유지됩니다. 웹 시안의 위치 확인은 화면을 켜 둔 동안 동작합니다.</p><button class="nrc-black-pill" data-action="panel-sound">음성 안내 '+(data.sound?'끄기':'켜기')+'</button>'],
      feeling:['기분이 어떠셨나요?',`<div class="nrc-feelings">${['아주 좋음','좋음','보통','힘듦','매우 힘듦'].map(x=>`<button data-mood="${x}">${x}</button>`).join('')}</div>`]
    };if(content[action]){showPanel(...content[action]);return true;}return false;
  }
  function render(focus=false) {
    cancelHold();
    if (view==='running'&&!active())view='home';
    $('#phone').dataset.view=view;
    $('#phone').dataset.sessionPage=sessionPage;
    $('#phone').dataset.runState=view==='running'?active().status:'';
    const views={home,countdown:counting,running,complete:completed,share:shareView,history:historyView,settings,homeSetup,locating,feed,guides,plan,club,countSettings,voiceSettings};
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
    countdown=countSeconds;countdownGoal=0;runMetric='distance';sessionPage='metrics';view='countdown';render(true);
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
    demoSession=null;demoClockMs=null;screenLocked=false;sessionPage='metrics';view='complete';clearPhoto();render(true);if(!silent){window.NooprunSFX?.play('complete');say('complete');}
  }
  function updateTimer() {
    if(!active())return;
    const t=$('#timer'),ms=elapsed(),label=formatTime(ms);if(t&&t.textContent!==label)t.textContent=label;
    t?.classList.toggle('long',ms>=3600000);
    document.querySelectorAll('[data-elapsed]').forEach(e=>{if(e.textContent!==label)e.textContent=label;});

  }
  function showDemo(which) {
    if(data.active){toast('진행 중인 집콕 기록을 먼저 마쳐 주세요. 기록은 그대로 유지돼요.');go('running');return;}
    stopGPS();closeModal();clearInterval(countdownTimer);countdownTimer=null;clearPhoto();demoSession=null;demoClockMs=null;
    if(which==='home')view='home';
    if(which==='running'){runMetric='distance';sessionPage='metrics';screenLocked=false;demoSession={id:'demo-active',status:'running',baseMs:18*60000+42000,runSince:Date.now(),goal:0,demo:true};view='running';}
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
    if(screenLocked||hold||active()?.status!=='paused'||document.hidden||$('#modal'))return;
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
  function exportCard(share=false) {
    if(!result)return;
    const r={...result},canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1200;const c=canvas.getContext('2d');
    c.fillStyle='#0bf77c';c.fillRect(0,0,1080,1200);
    if(photo){const scale=Math.max(1080/photo.img.width,1200/photo.img.height),w=photo.img.width*scale,h=photo.img.height*scale;c.drawImage(photo.img,(1080-w)/2,(1200-h)/2,w,h);c.fillStyle='#0008';c.fillRect(0,0,1080,1200);}
    c.fillStyle=photo?'#fff':'#111';c.font='28px -apple-system, sans-serif';c.fillText('NOOP RUN CLUB',77,104);c.textAlign='right';c.fillText(r.demo?'DEMO / 시연':dateLabel(r.finishedAt),1003,104);c.textAlign='left';
    const time=formatTime(r.elapsedMs);let size=r.elapsedMs>=3600000?160:240;c.font=`italic 850 ${size}px -apple-system, sans-serif`;while(c.measureText(time).width>925&&size>80){size-=5;c.font=`italic 850 ${size}px -apple-system, sans-serif`;}c.fillText(time,77,512);
    c.font='38px -apple-system, sans-serif';c.fillText(r.demo?'시연용 완주 기록':r.homeRadius?'집에 머문 시간':'아무것도 하지 않은 시간',77,608);
    c.strokeStyle=photo?'#ffffff55':'#0003';c.beginPath();c.moveTo(77,896);c.lineTo(1003,896);c.stroke();
    c.font='650 88px -apple-system, sans-serif';c.fillText(recordDistance(r),77,1030);const w=c.measureText(recordDistance(r)).width;c.font='38px -apple-system, sans-serif';c.fillText('km',90+w,1030);c.font='35px -apple-system, sans-serif';c.fillText(r.homeRadius?'집에서 최대 거리':'시안 이동 거리',77,1100);
    c.textAlign='right';c.font='34px -apple-system, sans-serif';c.fillText('오늘도, 가만히 완주.',1003,1042);c.fillText(r.demo?'화면 예시':'집콕 기록',1003,1100);
    canvas.toBlob(async blob=>{
      if(!blob){toast('이미지를 저장하지 못했어요. 다시 시도해 주세요.');return;}
      const filename=`nooprun-${r.demo?'demo':new Date(r.finishedAt).toISOString().slice(0,10)}.png`,file=new File([blob],filename,{type:'image/png'});
      if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'눕런 기록'});return;}catch(e){if(e.name==='AbortError')return;}}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast(share?'공유할 이미지를 저장했어요.':'이미지를 저장했어요.');
    },'image/png');
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
    if(screenLocked&&view==='running'&&sessionPage!=='settings'&&b.dataset.action!=='session-settings'){toast('기록 설정에서 화면 잠금을 해제할 수 있어요.');return;}
    if(b.dataset.radius){setupRadius=Number(b.dataset.radius);render();$(`[data-radius="${setupRadius}"]`)?.focus();return;}
    if(b.dataset.note){note(b.dataset.note);return;}
    if(b.dataset.demo){showDemo(b.dataset.demo);return;}
    if(b.dataset.record){result=data.records.find(r=>r.id===b.dataset.record);clearPhoto();view='complete';render(true);return;}
    if(b.dataset.mood){if(!result)return;closeModal();result.mood=b.dataset.mood;const r=data.records.find(r=>r.id===result.id);if(r){r.mood=result.mood;persist();}render();return;}
    if(b.dataset.metricSlot){const i=Number(b.dataset.metricSlot),keys=['distance','pace','bpm','time','cadence'];metricSlots[i]=keys[(keys.indexOf(metricSlots[i])+1)%keys.length];render();return;}
    if(b.dataset.countSeconds){countSeconds=Number(b.dataset.countSeconds);go('countSettings');return;}
    if(b.dataset.period){activityPeriod=b.dataset.period;render();return;}
    if(b.dataset.guide){guideIndex=Number(b.dataset.guide);render();return;}
    if(b.dataset.sessionPage){sessionPage=b.dataset.sessionPage;render();return;}
    if(b.dataset.clubTab){document.querySelectorAll('[data-club-tab]').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','page');$('#club-content').innerHTML=b.dataset.clubTab==='friends'?'<h3 class="nrc-section-title">친구</h3><div class="nrc-club-empty"><p>연결된 친구가 없습니다.</p><button class="nrc-black-pill" data-action="club-detail">친구 추가</button></div>':'<h3 class="nrc-section-title">챌린지</h3><div class="nrc-club-empty"><p>온라인 챌린지는 연결 전입니다.</p><button class="nrc-black-pill" data-action="club-detail">자세히 보기</button></div>';return;}
    const action=b.dataset.action;
    if(screenLocked&&view==='running'&&sessionPage!=='settings'&&action!=='session-settings'){toast('기록 설정에서 화면 잠금을 해제할 수 있어요.');return;}
    if(action==='session-settings'){sessionPage='settings';render();return;}
    if(action==='screen-lock'){screenLocked=!screenLocked;render();return;}
    if(openPanel(action))return;
    if(action==='edit-record'&&result){showPanel('러닝 편집',`<label class="nrc-input-label">제목<input id="record-title" maxlength="80" value="${esc(result.title||'러닝')}" autocomplete="off"></label><button class="nrc-black-pill" data-action="save-record-title">저장</button>`);return;}
    if(action==='save-record-title'&&result){const title=$('#record-title').value.trim();if(!title){$('#record-title').focus();return;}result.title=title;const saved=data.records.find(r=>r.id===result.id);if(saved){saved.title=title;persist();}closeModal();render();return;}
    if(action==='delete-record'&&result){showPanel('러닝 삭제','<p>이 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.</p><div class="modal-actions"><button data-action="keep-resting">취소</button><button class="nrc-delete" data-action="confirm-delete-record">삭제</button></div>');return;}
    if(action==='confirm-delete-record'&&result){data.records=data.records.filter(r=>r.id!==result.id);persist();result=null;closeModal();go('history');return;}
    if(action==='panel-share'){closeModal();go('share');return;}
    if(action==='voice-time'||action==='voice-distance'){toast('주기별 음성 피드백은 아직 연결하지 않았어요.');return;}
    if(action==='panel-sound'){closeModal();data.sound=!data.sound;persist();window.NooprunVoice?.setEnabled(data.sound);render();return;}
    if(action==='panel-home'){closeModal();openSetup();return;}
    if(action==='panel-settings'){closeModal();go('settings');return;}
    if(action==='panel-run'){closeModal();go('home');return;}
    if(action==='native-share'){exportCard(true);return;}
    if(['home','history','settings','share','complete','feed','guides','plan','club','countSettings','voiceSettings'].includes(action)){go(action);return;}
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
    if(action==='metric'){runMetric=['time','distance','pace'].includes(b.dataset.metric)?b.dataset.metric:'time';render();$(`.metric-tabs [data-metric=${runMetric}]`)?.focus({preventScroll:true});return;}
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
  let swipeStart=null;
  document.addEventListener('pointerdown',e=>{if(view==='running'&&!e.target.closest('button,label,input'))swipeStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
  document.addEventListener('pointerup',e=>{if(!swipeStart||swipeStart.id!==e.pointerId)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;swipeStart=null;if(view!=='running'||screenLocked||Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.5)return;const pages=['map','metrics','settings'];sessionPage=pages[Math.max(0,Math.min(2,pages.indexOf(sessionPage)+(dx<0?1:-1)))];render();});
  document.addEventListener('pointercancel',()=>swipeStart=null);
  document.addEventListener('change',e=>{if(e.target.id==='session-photo-input'&&e.target.files[0]){const file=e.target.files[0];if(!file.type.startsWith('image/')){toast('사진 파일을 골라 주세요.');return;}toast('사진을 선택했어요. 이 시안에서는 저장하거나 전송하지 않아요.');e.target.value='';}});
  document.addEventListener('keydown',e=>{if(e.target.id==='session-photo-label'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('#session-photo-input').click();}});
  document.addEventListener('change',e=>{if(e.target.id==='photo-input')choosePhoto(e.target.files[0]);});
  document.addEventListener('keydown',e=>{
    if(e.target.id==='photo-label'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.NooprunSFX?.play('tap');$('#photo-input').click();}
    const modal=$('#modal');
    if(modal){if(e.key==='Escape'){closeModal();return;}if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button,input,[tabindex="0"]')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
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
