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
  let activityPeriod='주', sessionPage='metrics';
  let countSeconds=3, screenLocked=false;
  let demoClockMs = null, runMetric = 'time', hold = null, holdFrame = null, ignoreStopClickUntil = 0;
  let countdownGoal = data.goal, demoSession = null, photo = null, photoToken = 0, toastTimer, modalAction = null, focusBeforeModal;
  let gpsIntent = null, startAfterHome = false;
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
      if (gpsIntent === 'initial-home' && state.status === 'ready') {
        const fix=gps.fix();
        if(fix && fix.accuracy<=50 && !data.home){
          saveHome(fix);const shouldStart=startAfterHome;startAfterHome=false;
          stopGPS();render();
          if(shouldStart)requestStart();
          return;
        }
      }
      updateGPS();
      if (gpsIntent === 'start' && state.status === 'inside') {gpsIntent = 'countdown';beginCountdown();}
    },
    onExit(evidence) {
      if (gpsIntent === 'session' && data.active?.home) finish({reason:'left-home',confirmedAt:evidence.confirmedAt});
    }
  });
  function updateGPS() {
    document.querySelectorAll('[data-gps-status]').forEach(e=>{e.textContent=gpsLabels[gpsState.status];e.dataset.status=gpsState.status;});
    document.querySelectorAll('[data-gps-accuracy]').forEach(e=>{e.textContent=Number.isFinite(gpsState.accuracy)?`위치 오차 약 ${Math.round(gpsState.accuracy)}m`:'GPS 수신 대기';});
    const save=$('[data-action=save-home]'),fix=gps.fix();
    if(save)save.disabled=!fix || fix.accuracy>50;
    const retry=$('[data-action=gps-retry]');
    if(retry)retry.hidden=!['weak','stale','denied','timeout','unavailable','unsupported','boundary','outside','idle'].includes(gpsState.status);
    const label=$('[data-home-status]');
    if(label)label.textContent=gpsIntent==='start'?'집에 있는지 확인하고 있어요':data.home?'오늘의 코스는, 집.':'현재 위치를 우리 집으로 표시해요';
    const start=$('[data-action=start]');
    if(start)start.disabled=(gpsIntent==='start'||startAfterHome)&&gpsState.status==='acquiring';
    const cancel=$('[data-action=cancel-start]');if(cancel)cancel.hidden=!(gpsIntent==='start'||startAfterHome);
    const inline=$('.own-home-location-status');
    if(inline)inline.hidden=!!data.home&&gpsIntent!=='start';
  }
  function saveHome(fix) {
    data.home={latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy,radius:fix.accuracy<=25?50:100,savedAt:Date.now()};persist();
  }
  function acquireInitialHome(thenStart=false) {
    startAfterHome=thenStart;gpsIntent='initial-home';gps.start();
  }
  function openSetup() {
    if(data.active){toast('기록을 마친 뒤 집 위치를 바꿀 수 있어요.');return;}
    showPanel('지금 있는 곳을 우리 집으로',`<p>집에 있을 때 바꿔 주세요. 저장된 집은 아래 버튼을 눌렀을 때만 변경돼요.</p><p data-gps-status role="status"></p><button class="gps-retry" data-action="gps-retry" hidden>위치 다시 확인</button><button class="primary" data-action="save-home" disabled>여기로 변경</button>`);
    startAfterHome=false;gpsIntent='relocate';gps.start();
  }
  function requestStart() {
    if(data.active){go('running');return;}
    demoSession=null;
    if(view!=='home'){view='home';render(true);}
    if(!data.home){acquireInitialHome(true);return;}
    gpsIntent='start';gps.start(data.home,{detectExit:false});
  }
  function stopGPS() {startAfterHome=false;gpsIntent=null;gps.stop();gpsState={status:'idle',distance:null,accuracy:null};}
  window.NooprunVoice?.setEnabled(data.sound);
  async function say(cue) {
    if (!data.sound) return;
    const status = await window.NooprunVoice?.play(cue);
    if (data.sound && (!status || status === 'unavailable')) toast('음성을 불러오지 못했어요. 화면 안내로 계속 진행해요.');
  }
  const icon = name => ({back:'<path d="m13 5-7 7 7 7"/>',sound:'<path d="m4 9 4 0 5-4v14l-5-4H4Z"/><path d="M17 8q4 4 0 8"/>',share:'<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'}[name]);
  const iconButton = (name,action,label) => `<button class="icon-button" data-action="${action}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg></button>`;
  const primary = (text,action,cls='') => `<button class="primary ${cls}" data-action="${action}">${text}<span class="arrow" aria-hidden="true">↗</span></button>`;
  const warning = () => storageOK ? '' : '<p class="storage-warning">이 브라우저의 저장 공간을 사용할 수 없어요. 기록은 이 창에서만 유지돼요.</p>';

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
  const tabbar=current=>`<nav class="nrc-tabbar own-tabbar" aria-label="앱 메뉴">${[['home','home','눕기'],['history','activity','기록'],['settings','settings','설정']].map(([action,g,label])=>`<button data-action="${action}" ${current===action?'aria-current="page"':''}>${svgIcon(g)}<span>${label}</span></button>`).join('')}</nav>`;
  const topbar=()=>`<header class="own-brand"><img src="assets/brand/nooprun-recline.png?v=own-1" width="32" height="32" alt="눕런"><span>눕런</span><span class="own-brand-caption">집에서 보내는 시간</span></header>`;
  function home() {
    const today=new Date(),dayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime(),dayEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1).getTime();
    const todayRecords=data.records.filter(r=>!r.demo&&r.finishedAt>=dayStart&&r.finishedAt<dayEnd);
    const todayRest=todayRecords.reduce((sum,r)=>sum+r.elapsedMs,0);
    const homeIcon='<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>';
    const chartIcon='<path d="M5 20V12m7 8V4m7 16V8"/>';
    const gearIcon='<path d="m10 3 .5-1h3l.5 3 2 1 2.5-1 1.5 2.6-2 2V13l2 2-1.5 2.6-2.5-1-2 1-.5 3h-3l-.5-3-2-1-2.5 1L3 15l2-2V10L3 8l1.5-2.6L7 6l2-1Z"/><circle cx="11.5" cy="11.5" r="3"/>';
    return `<section class="app-screen home lobby-home club-home">
      <header class="club-header"><h2>집콕</h2><img class="club-app-icon" src="assets/brand/nooprun-recline.png?v=own-1" width="42" height="42" alt="눕런: 다리를 꼬고 누워 있는 사람"></header>
      <nav class="club-mode-tabs" aria-label="집콕 메뉴"><button data-action="home" aria-current="page">바로 시작</button><button data-action="history">나의 기록</button></nav>
      <div class="club-stage">
        <div id="home-map" class="own-home-map" aria-label="우리 집 주변 지도"></div>
        <button class="lobby-today club-summary" data-action="history" aria-label="오늘의 집콕 ${duration(todayRest)}, 완주 ${todayRecords.length}회. 나의 기록 보기"><span class="club-summary-copy"><span class="lobby-today-label">오늘의 집콕</span><strong>${formatTime(todayRest)}</strong><span class="lobby-today-count">완주 <b>${todayRecords.length}</b>회</span></span>${window.NooprunArt.markup('club-summary-art')}<svg class="club-summary-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
        <div class="own-map-empty" ${data.home?'hidden':''}><strong>우리 집 위치 확인</strong><span>위치를 허용하면 지도에 표시돼요.</span></div>
        <div class="own-map-status" role="status"><span data-home-status></span><div class="own-home-location-status"><span data-gps-status></span><div class="own-map-actions"><button class="gps-retry" data-action="gps-retry" hidden>위치 다시 확인</button><button data-action="cancel-start" hidden>취소</button></div></div></div>
        <p class="own-tile-status" data-tile-status role="status" hidden></p>
        ${warning()}
        <div class="club-launch">
          <button class="club-side-control" data-action="settings" aria-label="설정"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg></button>
          <button class="club-start" data-action="start" aria-label="눕기">눕기</button>
          <button class="club-side-control club-sound" data-action="sound" aria-label="시작 음성 ${data.sound?'끄기':'켜기'}" aria-pressed="${!!data.sound}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon('sound')}${data.sound?'':'<path d="M3 3 21 21"/>'}</svg></button>
        </div>
        <button class="club-map-caption home-location-link" data-action="recenter-home">우리 집 위치 · 외출하면 자동 종료</button>
      </div>
      <nav class="app-bottom-nav club-tabbar" aria-label="앱 메뉴"><button data-action="home" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true">${homeIcon}</svg><span>집콕</span></button><button data-action="history"><svg viewBox="0 0 24 24" aria-hidden="true">${chartIcon}</svg><span>활동</span></button><button data-action="settings"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg><span>설정</span></button></nav>
    </section>`;
  }

  function counting(preview=false) {
    const close=preview?'keep-resting':'cancel-countdown';
    return `<section class="app-screen nrc-countdown" ${preview?'role="dialog" aria-modal="true" aria-labelledby="countdown-preview-title"':''}><header class="app-header">${preview?'<span id="countdown-preview-title">시작 문구 미리보기</span>':''}${iconButton('close',close,preview?'미리보기 닫기':'취소')}</header><div class="countdown-wrap"><p class="countdown-copy">가장 편한 자세로.<br>이제, 아무것도 하지 마세요.</p><strong class="countdown-number" id="${preview?'countdown-preview':'countdown'}" ${preview?'aria-label="카운트다운 화면 예시, 2"':'aria-live="polite"'}>${preview?2:countdown}</strong></div><button class="text-button" data-action="${close}">${preview?'닫기':'취소'}</button></section>`;
  }
  function running() {
    const s=active(),paused=s.status==='paused';
    if(sessionPage==='settings')return sessionSettings();
    const started=new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit'}).format(s.startedAt||Date.now()-elapsed(s));
    return `<section class="app-screen running own-session" data-paused="${paused}"><header class="app-header"><span class="own-session-status"><i></i>${paused?'잠깐 움직이는 중':'눕는 중'}</span><button class="nrc-plain-icon" data-action="session-settings" aria-label="기록 설정">${svgIcon('settings')}</button></header><div class="own-live-header"><span>${dateLabel(s.startedAt||Date.now())}</span><span>${started} 시작</span></div><div class="own-timer"><strong id="timer" class="timer" role="timer">${formatTime(elapsed())}</strong><span>집에서 보낸 시간</span></div>${window.NooprunArt.markup('own-session-art')}<p class="own-session-copy">${paused?'다시 편해지면 이어서 누워요.':'누워도, 뒹굴어도. 오늘의 기록이 쌓여요.'}</p><div class="own-session-controls">${paused?`<button class="own-end stop" data-action="finish" aria-label="눕기 종료, 길게 누르기"><svg class="hold-ring" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="50"/></svg><span>오늘은<br>여기까지</span></button>`:''}<button class="own-pause" data-action="pause">${paused?'다시 눕기':'잠깐 움직이기'} ${svgIcon(paused?'arrow':'pause')}</button></div>${paused?'<p class="own-hold-note">종료하려면 왼쪽 버튼을 길게 눌러요.</p>':''}<div class="own-session-footer">${s.home?'<span data-gps-status></span><button class="gps-retry" data-action="gps-retry" hidden>위치 다시 확인</button>':s.demo?'<span>시연 중 · 기록은 저장되지 않아요</span>':'<span>집 위치를 연결하지 않은 기존 기록</span>'}<button data-action="sound" aria-label="음성 안내 ${data.sound?'끄기':'켜기'}">${svgIcon('sound')}</button></div>${warning()}</section>`;
  }
  function sessionSettings(){return `<section class="app-screen own-settings nrc-settings"><header class="app-header"><button class="nrc-plain-icon" data-session-page="metrics" aria-label="기록으로 돌아가기">${svgIcon('back')}</button><h2>기록 설정</h2><span class="header-spacer"></span></header><div class="own-setting-card">${switchRow('음성 안내','sound',data.sound)}${switchRow('버튼 소리','effects',window.NooprunSFX?.state().enabled)}${switchRow('화면 잠금','screen-lock',screenLocked)}</div><p class="own-setting-note">집을 나가면 기록이 자동으로 끝나요.<br>웹에서는 화면을 켜 둔 동안 위치를 확인해요.</p><button class="own-primary own-return" data-session-page="metrics"><strong data-elapsed>${formatTime(elapsed())}</strong> · 기록으로 돌아가기</button></section>`;}
  function card(r) {
    return `<div class="result-card${photo?' photo-preview':''}" id="result-card"><div class="card-top"><span>NOOPRUN</span><span>${r.demo?'DEMO / 시연':dateLabel(r.finishedAt)}</span></div><strong class="card-time${r.elapsedMs>=3600000?' long':''}">${formatTime(r.elapsedMs)}</strong><p class="card-desc">집에서 보낸 시간</p><hr class="card-rule"><div class="card-footer"><div><strong class="own-card-end">오늘도 잘 누웠다.</strong><small class="card-distance-label">${r.demo?'시연용 기록':r.endReason==='left-home'?'밖에 나가서 종료':'내가 정한 마무리'}</small></div><span>눕런<br>오늘은 여기까지.</span></div></div>`;
  }
  function completed() {
    if (!result) {view='home';return home();}
    const hour=new Date(result.finishedAt).getHours(),period=hour<6?'새벽':hour<12?'오전':hour<18?'오후':'저녁';
    const clock=new Intl.DateTimeFormat('ko-KR',{hour:'numeric',minute:'2-digit',hour12:false}).format(result.finishedAt),weekday=new Intl.DateTimeFormat('ko-KR',{weekday:'long'}).format(result.finishedAt);
    return `<section class="app-screen complete own-detail"><header class="app-header">${iconButton('back','history','기록으로 돌아가기')}<span>눕기 기록</span><button class="nrc-plain-icon nrc-more" data-action="record-menu" aria-label="더 보기">•••</button></header><p class="record-date">${dateLabel(result.finishedAt)} · ${clock}</p><h2>${esc(result.title||weekday+' '+period+' 눕기')}<button data-action="edit-record" aria-label="기록 제목 편집">${svgIcon('edit')}</button></h2><div class="own-summary"><span>오늘도 잘 누웠다.</span><strong>${formatTime(result.elapsedMs)}</strong><small>집에서 보낸 시간</small></div>${window.NooprunArt.markup('own-result-art')}<p class="exit-reason">${result.endReason==='left-home'?'외출해서 기록을 마쳤어요.':'직접 마친 기록이에요.'}${result.gpsHadGaps?'<br>위치를 확인하지 못한 구간이 포함돼 있어요.':''}</p><button class="nrc-detail-row" data-action="feeling">쉬고 나니 어때요?<span>${esc(result.mood||'선택하기')}</span></button><div class="result-actions">${primary('눕기 인증하기','share')}${primary('완료','home','paper')}</div><p class="saved-indicator">${result.demo?'시연용 기록 · 저장되지 않음':'이 기기에 저장됐어요'}</p></section>`;
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
    const max=Math.max(1,...weekly);
    return `<section class="app-screen nrc-shell nrc-activity">${topbar()}<h2 class="nrc-title">기록</h2><div class="nrc-periods" aria-label="활동 기간">${['주','월','년','전체'].map(x=>`<button data-period="${x}" aria-pressed="${activityPeriod===x}">${x}</button>`).join('')}</div><div class="nrc-content"><p class="nrc-period-date">${activityPeriod==='주'?'이번 주':activityPeriod==='월'?now.getFullYear()+'년 '+(now.getMonth()+1)+'월':activityPeriod==='년'?now.getFullYear()+'년':'전체 활동'}</p><div class="nrc-activity-total"><strong>${formatTime(total)}</strong><span>누워 있던 시간</span></div><div class="nrc-activity-stats"><span><b>${records.length}번</b>눕기</span><span><b>${formatTime(records.length?total/records.length:0)}</b>한 번에 평균</span></div>${`<div class="nrc-chart" style="--bars:${buckets.length}" aria-label="요일별 집콕 시간">${weekly.map((v,i)=>`<div><span style="height:${v?Math.max(3,v/max*100):0}%" title="${buckets[i]} ${duration(v)}"></span><small>${buckets.length>12&&i%5!==0?'':buckets[i]}</small></div>`).join('')}</div>`}<div class="nrc-section-heading"><h3>최근 눕기</h3><span>${records.length}</span></div>${records.length?`<ul class="records">${records.slice().sort((a,b)=>b.finishedAt-a.finishedAt).map(r=>`<li><button data-record="${esc(r.id)}"><span class="nrc-record-thumb">${svgIcon('home')}</span><span class="nrc-record-copy"><small>${dateLabel(r.finishedAt)}</small><strong>${esc(r.title||'눕기 기록')}</strong><span>${formatTime(r.elapsedMs)}</span></span>${svgIcon('arrow')}</button></li>`).join('')}</ul>`:'<div class="empty-state">아직 눕기 기록이 없어요.</div>'}${warning()}</div>${tabbar('history')}</section>`;
  }
  const settingsHeader=(title,action='settings',done=false)=>`<header class="app-header">${done?'<span class="header-spacer"></span>':iconButton('back',action,'뒤로')}<h2>${title}</h2>${done?'<button data-action="home" class="nrc-text-action">완료</button>':'<span class="header-spacer"></span>'}</header>`;
  const switchRow=(label,action,on)=>`<div class="settings-row"><span>${label}</span><button class="switch" role="switch" aria-label="${label}" aria-checked="${!!on}" data-action="${action}"><span></span></button></div>`;
  function settings() {
    return `<section class="app-screen nrc-shell own-settings nrc-settings settings">${topbar()}<h2 class="nrc-title">설정</h2><div class="own-settings-body"><h3>우리 집</h3><div class="own-setting-card"><button class="nrc-setting-link" data-action="setup-home" ${data.active?'disabled':''}><span>${svgIcon('home')} 집 위치</span><span>${data.home?'변경':'확인하기'} ${svgIcon('arrow')}</span></button></div><p class="own-setting-note">${data.active?'기록을 마치면 집 위치를 바꿀 수 있어요.':'집에 있을 때 현재 위치로 변경할 수 있어요.'}</p><h3>소리와 화면</h3><div class="own-setting-card">${switchRow('음성 안내','sound',data.sound)}${switchRow('버튼 소리','effects',window.NooprunSFX?.state().enabled)}${switchRow('그림 자동 전환','art',window.NooprunArt.state().enabled)}<button class="nrc-setting-link" data-action="voice-preview"><span>목소리 들어보기</span>${svgIcon('sound')}</button><button class="nrc-setting-link" data-action="countSettings"><span>시작 전 준비 시간</span><span>${countSeconds}초 ${svgIcon('arrow')}</span></button></div><p class="own-setting-note">집 위치와 기록은 이 기기에 저장해요. 지도 표시를 위해 주변 지도 영역을 OpenStreetMap에 요청해요.<br>화면이 꺼지거나 다른 앱을 사용하면 위치 확인은 잠시 멈춰요.</p></div>${warning()}${tabbar('settings')}</section>`;
  }
  function countSettings(){return `<section class="app-screen own-settings nrc-settings">${settingsHeader('준비 시간')}<p class="own-setting-note">편하게 누울 시간을 정해요.</p><div class="own-setting-card">${[3,6,9].map(n=>`<button class="nrc-setting-link" data-count-seconds="${n}"><span>${n}초</span><span class="nrc-radio ${countSeconds===n?'selected':''}"></span></button>`).join('')}</div></section>`;}
  function showPanel(title,body) {
    closeModal();focusBeforeModal=document.activeElement;
    const box=document.createElement('div');box.id='modal';box.className='modal-backdrop nrc-backdrop';
    box.innerHTML=`<section class="modal nrc-sheet" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header><h2 id="panel-title">${title}</h2><button data-action="keep-resting" aria-label="닫기">${svgIcon('close')}</button></header>${body}</section>`;
    $('#phone').append(box);$('#app').inert=true;box.querySelector('button').focus();
  }
  function openPanel(action) {
    const content={
      'record-menu':['눕기 기록','<button class="nrc-choice" data-action="panel-share">공유하기</button><button class="nrc-choice" data-action="edit-record">제목 바꾸기</button><button class="nrc-choice nrc-delete" data-action="delete-record">삭제</button>'],
      feeling:['쉬고 나니 어때요?',`<div class="nrc-feelings">${['개운해요','편안해요','그냥 좋아요','더 누울래요'].map(x=>`<button data-mood="${x}">${x}</button>`).join('')}</div>`]
    };if(content[action]){showPanel(...content[action]);return true;}return false;
  }
  function render(focus=false) {
    cancelHold();
    if (view==='running'&&!active())view='home';
    $('#phone').dataset.view=view;
    $('#phone').dataset.sessionPage=sessionPage;
    $('#phone').dataset.runState=view==='running'?active().status:'';
    const views={home,countdown:counting,running,complete:completed,share:shareView,history:historyView,settings,countSettings};
    window.NooprunHomeMap.unmount();
    $('#app').innerHTML=views[view]();
    if(view==='home')window.NooprunHomeMap.mount(data.home);
    window.NooprunArt.mount();
    if (photo&&view==='share')$('#result-card').style.backgroundImage=`url("${photo.url}")`;
    if (focus) {const target=$('#app h2')||$('#app .run-mode')||$('#app .countdown-wrap p');if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}
    updateTimer();
    updateGPS();
  }
  function clearPhoto() {photoToken++;if(photo)URL.revokeObjectURL(photo.url);photo=null;}
  function go(screen) {
    if(gpsIntent==='start' || startAfterHome)stopGPS();
    if (data.active && screen==='home')screen='running';
    if (demoSession && screen!=='running')demoSession=null;
    if (!['complete','share'].includes(screen))clearPhoto();
    view=screen;render(true);
  }
  function cancelCountdown() {clearInterval(countdownTimer);countdownTimer=null;stopGPS();view='home';render(true);}
  function beginCountdown() {
    countdown=countSeconds;countdownGoal=0;runMetric='time';sessionPage='metrics';view='countdown';render(true);
    clearInterval(countdownTimer);
    countdownTimer=setInterval(()=>{
      countdown--;
      if(countdown>0){$('#countdown').textContent=countdown;return;}
      clearInterval(countdownTimer);countdownTimer=null;
      if(!gps.fix() || gpsState.status!=='inside'){gpsIntent='start';view='home';render(true);return;}
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
    if(which==='countdown'){
      closeModal();focusBeforeModal=document.activeElement;
      const box=document.createElement('div');box.id='modal';box.className='modal-backdrop countdown-preview-backdrop';
      box.innerHTML=counting(true);$('#phone').append(box);$('#app').inert=true;
      box.querySelector('button').focus({preventScroll:true});
      $('#phone').scrollIntoView({block:'center',behavior:'instant'});
      return;
    }
    if(data.active){toast('진행 중인 집콕 기록을 먼저 마쳐 주세요. 기록은 그대로 유지돼요.');go('running');return;}
    stopGPS();closeModal();clearInterval(countdownTimer);countdownTimer=null;clearPhoto();demoSession=null;demoClockMs=null;
    if(which==='home')view='home';
    if(which==='running'){runMetric='time';sessionPage='metrics';screenLocked=false;demoSession={id:'demo-active',status:'running',baseMs:18*60000+42000,runSince:Date.now(),goal:0,demo:true};view='running';}
    if(which==='complete'){result={id:'demo-result',elapsedMs:1800000,finishedAt:Date.now(),goal:0,mood:'',demo:true};view='complete';}
    render(true);
  }
  function closeModal() {if(gpsIntent==='relocate')stopGPS();$('#modal')?.remove();$('#app').inert=false;modalAction=null;focusBeforeModal?.focus({preventScroll:true});}
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
    c.fillStyle='#e6f344';c.fillRect(0,0,1080,1200);
    if(photo){const scale=Math.max(1080/photo.img.width,1200/photo.img.height),w=photo.img.width*scale,h=photo.img.height*scale;c.drawImage(photo.img,(1080-w)/2,(1200-h)/2,w,h);c.fillStyle='#0008';c.fillRect(0,0,1080,1200);}
    c.fillStyle=photo?'#fff':'#111';c.font='28px -apple-system, sans-serif';c.fillText('NOOPRUN',77,104);c.textAlign='right';c.fillText(r.demo?'DEMO / 시연':dateLabel(r.finishedAt),1003,104);c.textAlign='left';
    const time=formatTime(r.elapsedMs);let size=r.elapsedMs>=3600000?160:240;c.font=`650 ${size}px -apple-system, sans-serif`;while(c.measureText(time).width>925&&size>80){size-=5;c.font=`650 ${size}px -apple-system, sans-serif`;}c.fillText(time,77,512);
    c.font='38px -apple-system, sans-serif';c.fillText('집에서 보낸 시간',77,608);
    c.strokeStyle=photo?'#ffffff55':'#0003';c.beginPath();c.moveTo(77,896);c.lineTo(1003,896);c.stroke();
    c.font='650 47px -apple-system, sans-serif';c.fillText('오늘도 잘 누웠다.',77,1030);c.font='35px -apple-system, sans-serif';c.fillText(r.demo?'시연용 기록':r.endReason==='left-home'?'밖에 나가서 종료':'내가 정한 마무리',77,1100);
    c.textAlign='right';c.font='34px -apple-system, sans-serif';c.fillText('눕런',1003,1042);c.fillText('오늘은 여기까지.',1003,1100);
    canvas.toBlob(async blob=>{
      if(!blob){toast('이미지를 저장하지 못했어요. 다시 시도해 주세요.');return;}
      const filename=`nooprun-${r.demo?'demo':new Date(r.finishedAt).toISOString().slice(0,10)}.png`,file=new File([blob],filename,{type:'image/png'});
      if(share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'눕런 기록'});return;}catch(e){if(e.name==='AbortError')return;}}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast(share?'공유할 이미지를 저장했어요.':'이미지를 저장했어요.');
    },'image/png');
  }

  const post='집에서 얼마나 뒹굴거렸는지 궁금해서 생각해본 앱.\n\n이름은 눕런.\n열자마자 지도에 우리 집이 보이고\n눕기 누르면 시간이 쌓여.\n\n누워서 폰 봐도 되고 게임해도 되고\n집 안을 왔다 갔다 해도 되고.\n밖으로 나가면 기록이 끝나는 거지.\n\n오늘 얼마나 집에서 뒹굴었는지\n사진에 얹어서 눕기 인증도 할 수 있어.';
  function note(name='experience') {
    document.querySelectorAll('[data-note]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.note===name)));
    const content={
      experience:`<p class="note-kicker">01 / NOOPRUN</p><h2>오늘의 코스는,<br>집.</h2><p class="lede">집에서 얼마나 뒹굴거렸는지 궁금해서. 눕런은 집에 머문 시간을 기록해요.</p><ol class="flow"><li><strong>열자마자 우리 집 지도</strong>첫 사용 때 위치를 허용하면 집이 지도에 표시돼요.</li><li><strong>눕기</strong>목표 없이 오늘의 시간이 쌓여요.</li><li><strong>밖에 나가면 종료</strong>위치 오차를 살피고 외출을 확인해요.</li><li><strong>오늘의 눕기 인증</strong>내 사진에 기록을 얹어 저장해요.</li></ol>`,
      scope:`<p class="note-kicker">02 / OUR PLACE</p><h2>주소 대신,<br>지금 있는 곳.</h2><p class="lede">거리나 구역 크기를 고르지 않아요. 집에서 앱을 열고 위치를 허용하면 현재 위치를 집으로 기억해요.</p><h3>위치와 기록</h3><p class="lede">집 위치는 이 기기에 저장해요. 지도를 그릴 때 주변 지도 영역을 OpenStreetMap에 요청해요. GPS 오차를 고려해 외출 여부를 확인하므로 현관을 넘는 순간까지 구분하지는 못해요.</p><p class="note-callout">웹 시안은 화면을 켜 둔 동안만 위치를 확인해요. 화면이 꺼지거나 다른 앱을 사용하는 동안 확인하지 못한 구간은 기록에 표시해요.</p>`,
      post:`<p class="note-kicker">03 / IDEA NOTE</p><h2>집에 있었던 시간도<br>기록이 된다면.</h2><textarea class="post-copy" id="post-copy" aria-label="게시글 초안">${esc(post)}</textarea><button class="copy-post" data-action="copy-post">글 복사 ↗</button>`
    };$('#note-content').innerHTML=content[name];
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(screenLocked&&view==='running'&&sessionPage!=='settings'&&b.closest('#app')&&b.dataset.action!=='session-settings'){toast('기록 설정에서 화면 잠금을 해제할 수 있어요.');return;}
    if(b.dataset.note){note(b.dataset.note);return;}
    if(b.dataset.demo){showDemo(b.dataset.demo);return;}
    if(b.dataset.record){result=data.records.find(r=>r.id===b.dataset.record);clearPhoto();view='complete';render(true);return;}
    if(b.dataset.mood){if(!result)return;closeModal();result.mood=b.dataset.mood;const r=data.records.find(r=>r.id===result.id);if(r){r.mood=result.mood;persist();}render();return;}
    if(b.dataset.countSeconds){countSeconds=Number(b.dataset.countSeconds);go('countSettings');return;}
    if(b.dataset.period){activityPeriod=b.dataset.period;render();return;}
    if(b.dataset.sessionPage){sessionPage=b.dataset.sessionPage;render();return;}
    const action=b.dataset.action;
    if(screenLocked&&view==='running'&&sessionPage!=='settings'&&b.closest('#app')&&action!=='session-settings'){toast('기록 설정에서 화면 잠금을 해제할 수 있어요.');return;}
    if(action==='session-settings'){sessionPage='settings';render();return;}
    if(action==='screen-lock'){screenLocked=!screenLocked;render();return;}
    if(openPanel(action))return;
    if(action==='edit-record'&&result){showPanel('기록 편집',`<label class="nrc-input-label">제목<input id="record-title" maxlength="80" value="${esc(result.title||'눕기 기록')}" autocomplete="off"></label><button class="nrc-black-pill" data-action="save-record-title">저장</button>`);return;}
    if(action==='save-record-title'&&result){const title=$('#record-title').value.trim();if(!title){$('#record-title').focus();return;}result.title=title;const saved=data.records.find(r=>r.id===result.id);if(saved){saved.title=title;persist();}closeModal();render();return;}
    if(action==='delete-record'&&result){showPanel('눕기 기록 삭제','<p>이 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.</p><div class="modal-actions"><button data-action="keep-resting">취소</button><button class="nrc-delete" data-action="confirm-delete-record">삭제</button></div>');return;}
    if(action==='confirm-delete-record'&&result){data.records=data.records.filter(r=>r.id!==result.id);persist();result=null;closeModal();go('history');return;}
    if(action==='panel-share'){closeModal();go('share');return;}
    if(action==='panel-sound'){closeModal();data.sound=!data.sound;persist();window.NooprunVoice?.setEnabled(data.sound);render();return;}
    if(action==='panel-home'){closeModal();openSetup();return;}
    if(action==='panel-settings'){closeModal();go('settings');return;}
    if(action==='panel-run'){closeModal();go('home');return;}
    if(action==='native-share'){exportCard(true);return;}
    if(['home','history','settings','share','complete','countSettings'].includes(action)){go(action);return;}
    if(action==='start'){requestStart();return;}
    if(action==='setup-home'){openSetup();return;}
    if(action==='recenter-home'){if(data.home)window.NooprunHomeMap.recenter();else acquireInitialHome();return;}
    if(action==='cancel-start'){stopGPS();updateGPS();return;}
    if(action==='cancel-gps'){stopGPS();go('home');return;}
    if(action==='gps-retry'){if(!data.home&&gpsIntent!=='relocate'){acquireInitialHome(startAfterHome);return;}gps.start(gpsIntent==='relocate'?null:data.active?.home || data.home,{detectExit:gpsIntent==='session'});return;}
    if(action==='save-home'){
      const fix=gps.fix();if(!fix || fix.accuracy>50)return;
      if(gpsIntent!=='relocate')return;
      saveHome(fix);closeModal();go('home');return;
    }
    if(action==='cancel-countdown'){cancelCountdown();return;}
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
  document.addEventListener('pointerup',e=>{if(!swipeStart||swipeStart.id!==e.pointerId)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;swipeStart=null;if(view!=='running'||screenLocked||Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.5)return;const pages=['metrics','settings'];sessionPage=pages[Math.max(0,Math.min(2,pages.indexOf(sessionPage)+(dx<0?1:-1)))];render();});
  document.addEventListener('pointercancel',()=>swipeStart=null);
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
    else if(['relocate','initial-home'].includes(gpsIntent))gps.start();
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
  const previewCountdown=new URLSearchParams(location.search).get('preview')==='countdown';
  if(data.active?.home){data.active.gpsHadGaps=true;persist();resumeGPS();}
  else if(!data.active&&!data.home&&!previewCountdown)acquireInitialHome();
  if(previewCountdown)showDemo('countdown');
  window.ready=document.fonts.ready;
})();
