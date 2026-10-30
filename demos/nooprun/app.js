(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KEY = 'nooprun.concept.v1';
  const defaultStore = () => ({version:1, goal:0, sound:true, active:null, records:[]});
  let storageOK = true, data = defaultStore();
  const validRecord = r => r && typeof r.id === 'string' && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 && Number.isFinite(r.finishedAt);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error('Unsupported saved data');
      data = {...defaultStore(), ...parsed, records:parsed.records.filter(validRecord)};
      data.goal = 0; // New sessions are open-ended; saved sessions and records retain their original goal.
      if (data.active && (!Number.isFinite(data.active.baseMs) || data.active.baseMs < 0 || !['running','paused'].includes(data.active.status) || (data.active.status === 'running' && !Number.isFinite(data.active.runSince)))) throw new Error('Invalid active session');
    }
  } catch { storageOK = false; data = defaultStore(); }
  let view = data.active ? 'running' : 'home', result = null, countdown = 3, countdownTimer = null;
  let demoClockMs = null;
  let countdownGoal = data.goal, demoSession = null, photo = null, photoToken = 0, toastTimer, modalAction = null, focusBeforeModal;
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
  function say(message) {
    if (!data.sound) return;
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {toast('음성 대신 화면 안내로 진행해요.');return;}
    try {const u=new SpeechSynthesisUtterance(message);u.lang='ko-KR';u.rate=.95;u.volume=.8;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);} catch {toast('이 환경에서는 시작 음성을 재생할 수 없어요.');}
  }
  const icon = name => ({back:'<path d="m13 5-7 7 7 7"/>',sound:'<path d="m4 9 4 0 5-4v14l-5-4H4Z"/><path d="M17 8q4 4 0 8"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'}[name]);
  const iconButton = (name,action,label) => `<button class="icon-button" data-action="${action}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg></button>`;
  const brand = '<div class="app-brand">NOOPRUN<small>NOOP RUN CLUB</small></div>';
  const primary = (text,action,cls='') => `<button class="primary ${cls}" data-action="${action}">${text}<span class="arrow" aria-hidden="true">↗</span></button>`;
  const warning = () => storageOK ? '' : '<p class="storage-warning">이 브라우저의 저장 공간을 사용할 수 없어요. 기록은 이 창에서만 유지돼요.</p>';
  const nav = current => `<nav class="app-bottom-nav" aria-label="앱 메뉴"><button data-action="home" ${current==='home'?'aria-current="page"':''}>빈둥</button><button data-action="history" ${current==='history'?'aria-current="page"':''}>나의 기록</button></nav>`;
  const sofa = `<div class="sofa-scene" aria-hidden="true"><svg viewBox="0 0 320 130"><path d="M34 98h248M48 99v10m223-10v10M54 91V67q0-7 7-7h195q11 0 11 10v21M46 70q-9-6-13 0v24h251V70q-5-7-13 0M55 88h210"/><g class="rest-breath"><path d="M88 66q7-8 22-6l59 6 44-28 31 27M166 65l45-14 36 19M110 61l27-13 27 6M136 48l-14 14M244 65l18 1m-16 4h21"/><circle cx="78" cy="56" r="12"/><path d="m73 56 3 1m8-2 3-1M88 59l12 3"/></g><path d="M54 74h51M51 70q4-10 15-6l29 7M275 20h13l-12 11h13m-27-23h8l-7 7h8"/></svg><span class="sofa-caption">MOVEMENT: OPTIONAL.</span></div>`;

  function home() {
    const today=new Date(),dayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime(),dayEnd=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1).getTime();
    const todayRecords=data.records.filter(r=>!r.demo&&r.finishedAt>=dayStart&&r.finishedAt<dayEnd);
    const todayRest=todayRecords.reduce((sum,r)=>sum+r.elapsedMs,0);
    const homeIcon='<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>';
    const chartIcon='<path d="M5 20V12m7 8V4m7 16V8"/>';
    const gearIcon='<path d="m10 3 .5-1h3l.5 3 2 1 2.5-1 1.5 2.6-2 2V13l2 2-1.5 2.6-2.5-1-2 1-.5 3h-3l-.5-3-2-1-2.5 1L3 15l2-2V10L3 8l1.5-2.6L7 6l2-1Z"/><circle cx="11.5" cy="11.5" r="3"/>';
    return `<section class="app-screen home lobby-home club-home">
      <header class="club-header"><h2>빈둥</h2><span class="club-wordmark">NOOP<br>RUN CLUB</span></header>
      <nav class="club-mode-tabs" aria-label="빈둥 메뉴"><button data-action="home" aria-current="page">바로 시작</button><button data-action="history">나의 기록</button></nav>
      <div class="club-stage">
        <svg class="club-map" viewBox="0 0 375 530" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="375" height="530" fill="#f1f2ee"/><g fill="#e6e8e3"><path d="M0 42h91v77H0Zm108-40h94v117h-94Zm111 0h80v119h-80Zm98 4h58v116h-58ZM0 138h93v92H0Zm110 0h92v92h-92Zm108 0h89v92h-89Zm108 0h49v92h-49ZM0 250h91v100H0Zm110 0h92v100h-92Zm109 0h86v100h-86Zm107 0h49v100h-49ZM0 370h91v160H0Zm109 0h94v160h-94Zm111 0h90v160h-90Zm109 0h46v160h-46Z"/></g><path d="m-30 410 198-75 250-44" stroke="#fff" stroke-width="21" fill="none"/><path d="m-25 410 198-75 250-44" stroke="#e1e4dd" stroke-width="2" fill="none"/><path d="M-20 152q67 10 101 4t40 36l-22 27H-20Z" fill="#e0e9d9"/><path d="M293 366h82v115h-82z" fill="#e0e9d9"/><g stroke="#daddd6" stroke-width="1" fill="none"><path d="M18 57h55v43H18Zm110-30h54v73h-54Zm109 3h43v70h-43ZM130 156h51v54h-51Zm107 0h51v54h-51ZM16 271h57v55H16Zm116 0h48v55h-48Zm104 0h51v40h-51ZM19 391h52v77H19Zm112-9h50v91h-50Zm104 8h51v99h-51"/></g></svg>
        <button class="lobby-today club-summary" data-action="history" aria-label="오늘의 빈둥 ${duration(todayRest)}, 완주 ${todayRecords.length}회. 나의 기록 보기"><span class="club-summary-copy"><span class="lobby-today-label">오늘의 빈둥</span><strong>${formatTime(todayRest)}</strong><span class="lobby-today-count">완주 <b>${todayRecords.length}</b>회</span></span><span class="club-summary-art" aria-hidden="true"><img src="assets/illustrations/rest-editorial.png" width="1536" height="1024" alt="" decoding="async"></span><svg class="club-summary-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
        <div class="club-location" aria-hidden="true"><span class="club-position"></span></div>
        ${warning()}
        <div class="club-launch">
          <button class="club-side-control" data-action="settings" aria-label="설정"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg></button>
          <button class="club-start" data-action="start" aria-label="빈둥 시작">시작</button>
          <button class="club-side-control club-sound" data-action="sound" aria-label="시작 음성 ${data.sound?'끄기':'켜기'}" aria-pressed="${!!data.sound}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon('sound')}${data.sound?'':'<path d="M3 3 21 21"/>'}</svg></button>
        </div>
        <span class="club-map-caption">시안 지도 · 위치를 수집하지 않아요</span>
      </div>
      <nav class="app-bottom-nav club-tabbar" aria-label="앱 메뉴"><button data-action="home" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true">${homeIcon}</svg><span>빈둥</span></button><button data-action="history"><svg viewBox="0 0 24 24" aria-hidden="true">${chartIcon}</svg><span>활동</span></button><button data-action="settings"><svg viewBox="0 0 24 24" aria-hidden="true">${gearIcon}</svg><span>설정</span></button></nav>
    </section>`;
  }

  function counting() {
    return `<section class="app-screen"><header class="app-header">${brand}${iconButton('close','cancel-countdown','시작 취소')}</header><div class="countdown-wrap"><p>가장 편한 자세로.<br>이제, 아무것도 하지 마세요.</p><strong class="countdown-number" id="countdown" aria-live="polite">${countdown}</strong></div><button class="text-button" data-action="cancel-countdown">아직 준비 중이에요</button></section>`;
  }
  function running() {
    const s=active(),paused=s.status==='paused';
    return `<section class="app-screen running"><header class="app-header"><div class="running-top"><i></i><span id="running-state">${paused?'TAKE YOUR TIME':'REST IN PROGRESS'}</span></div>${iconButton('sound','sound',data.sound?'음성 끄기':'음성 켜기')}</header><p class="run-mode">${paused?'잠깐 멈춰 있어요.':'좋아요. 그 자세 그대로.'}</p><span class="timer-label">${s.demo?'시연용 빈둥 시간':'빈둥 시간'}</span><div class="timer" id="timer" role="timer" aria-label="빈둥 경과 시간">${formatTime(elapsed())}</div><div class="run-visual" aria-hidden="true"><i class="still-dot"></i><span>YOU ARE RIGHT HERE.</span></div><div class="run-metrics"><div><strong>0.00</strong><small>km</small><label>이동 거리 · 빈둥 콘셉트</label></div><div><strong>${s.goal?s.goal/60:'FREE'}</strong><small>${s.goal?'분':''}</small><label>${s.goal?'오늘 정한 시간':'빈둥 모드'}</label></div></div><p class="run-note" id="run-note">${s.goal&&elapsed()>=s.goal*1000?'목표만큼 쉬었어요. 더 쉬어도 좋아요.':'페이스가 아주 일정해요.<br>서두르지 않아도 괜찮아요.'}</p><div class="run-actions"><button class="pause" data-action="pause">${paused?'다시 빈둥':'잠깐 멈춤'}</button><button class="finish" data-action="finish">오늘은 여기까지</button></div>${s.demo?'<p class="demo-badge">시연 중 · 실제 기록에 저장되지 않아요</p>':''}${warning()}</section>`;
  }
  function card(r) {
    return `<div class="result-card${photo?' photo-preview':''}" id="result-card"><div class="card-top"><span>NOOP RUN CLUB</span><span>${r.demo?'DEMO / 시연':dateLabel(r.finishedAt)}</span></div><strong class="card-time">${formatTime(r.elapsedMs)}</strong><p class="card-desc">${r.demo?'시연용 완주 기록':'아무것도 하지 않은 시간'}</p><hr class="card-rule"><div class="card-footer"><div><strong>0.00 <small>km</small></strong></div><span>오늘도, 가만히 완주.<br>${r.demo?'화면 예시':'빈둥 기록'}</span></div></div>`;
  }
  function completed() {
    if (!result) {view='home';return home();}
    return `<section class="app-screen complete"><header class="app-header"><span class="finish-label">${result.demo?'DEMO FINISH':'REST FINISHED'}</span>${iconButton('close','home','처음으로')}</header><h2>잘 쉬었습니다.<br>이것도 완주니까.</h2>${card(result)}<div class="share-tools"><label tabindex="0" id="photo-label">내 사진 넣기<input id="photo-input" type="file" accept="image/*" aria-label="공유 카드 배경 사진 선택"></label>${photo?'<button data-action="remove-photo">사진 빼기</button>':''}</div><p class="mood-label">지금 기분은 어때요? <span>선택</span></p><div class="mood-options" role="group" aria-label="완주 후 기분">${['개운해요','그냥 좋아요','아직 졸려요'].map(x=>`<button data-mood="${x}" aria-pressed="${result.mood===x}">${x}</button>`).join('')}</div><div class="result-actions">${primary('완주 카드 이미지 저장','export')}${primary('나의 기록 보기','history','paper')}</div><p class="saved-indicator">${result.demo?'시연 예시 · 실제 기록에는 포함되지 않아요':storageOK?'이 브라우저에 기록을 저장했어요':'현재 창에서만 기록을 보관하고 있어요'}</p></section>`;
  }
  function historyView() {
    const records=data.records,total=records.reduce((n,r)=>n+r.elapsedMs,0);
    return `<section class="app-screen history"><header class="app-header">${brand}${iconButton('back','home','빈둥 시작으로')}</header><h2>모든 쉼에는<br>기록이 있다.</h2><div class="history-total"><strong>${Math.floor(total/60000)} <small style="font:16px var(--sans)">분</small></strong><span>이 브라우저에서 남긴 ${records.length}번의 완주</span></div>${records.length?`<ul class="records">${records.slice().reverse().map(r=>`<li><button data-record="${esc(r.id)}"><span><strong>${formatTime(r.elapsedMs)}</strong><small>${dateLabel(r.finishedAt)} · 빈둥 기록</small></span><span class="record-detail">${esc(r.mood||'내 속도로 쉬었어요')}<br>0.00 km &nbsp; ↗</span></button></li>`).join('')}</ul>`:'<div class="empty-state">아직 비어 있는 기록장.<br>잠깐 누워 있는 것부터 시작해요.</div>'}${warning()}${primary('다시 빈둥 시작','home')}${nav('history')}</section>`;
  }
  function settings() {
    return `<section class="app-screen settings"><header class="app-header">${brand}${iconButton('back','home','설정 닫기')}</header><h2>내 페이스대로.</h2><div class="settings-row"><span>버튼 효과음</span><button class="switch" role="switch" aria-label="버튼 효과음" aria-checked="${!!window.NooprunSFX?.state().enabled}" data-action="effects">${window.NooprunSFX?.state().enabled?'켜짐':'꺼짐'}</button></div><p class="effects-description">선택할 때는 가볍게 톡, 완주할 때는 작은 축하 소리.<br>음성 안내와 따로 켜고 끌 수 있어요.</p><div class="settings-row"><span>시작·멈춤·완주 음성</span><button class="switch" role="switch" aria-checked="${!!data.sound}" data-action="sound">${data.sound?'켜짐':'꺼짐'}</button></div><p>시작하면 “운동을 시작했습니다”라고 말해요. 이 시안에서는 기기의 한국어 읽기 음성을 사용해요. 브라우저와 음성 설치 상태에 따라 소리가 나지 않을 수 있어요.</p><p>타이머와 기록은 이 브라우저 안에 보관해요. 로그인, 실제 운동량 측정, 다른 사람에게 전송하는 기능은 없어요.</p><p>오래 쉬는 사람을 순위로 매기지 않아요. 언제 끝내도 기록은 남길 수 있어요.</p><p>앱 이름 ‘눕런’과 이 화면은 기획 시안이에요. 브라우저 저장 공간을 지우면 여기에서 남긴 기록도 사라져요.</p>${warning()}</section>`;
  }
  function render(focus=false) {
    if (view==='running'&&!active())view='home';
    $('#phone').dataset.view=view;
    const views={home,countdown:counting,running,complete:completed,history:historyView,settings};
    $('#app').innerHTML=views[view]();
    if (photo&&view==='complete')$('#result-card').style.backgroundImage=`url("${photo.url}")`;
    if (focus) {const target=$('#app h2')||$('#app .run-mode')||$('#app .countdown-wrap p');if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}
    updateTimer();
  }
  function clearPhoto() {photoToken++;if(photo)URL.revokeObjectURL(photo.url);photo=null;}
  function go(screen) {
    if (data.active && screen==='home')screen='running';
    if (demoSession && screen!=='running')demoSession=null;
    if (screen!=='complete')clearPhoto();
    view=screen;render(true);
  }
  function cancelCountdown() {clearInterval(countdownTimer);countdownTimer=null;view='home';render(true);}
  function beginCountdown() {
    countdown=3;countdownGoal=0;view='countdown';render(true);
    clearInterval(countdownTimer);
    countdownTimer=setInterval(()=>{
      countdown--;
      if(countdown>0){$('#countdown').textContent=countdown;return;}
      clearInterval(countdownTimer);countdownTimer=null;
      data.active={id:newID(),status:'running',baseMs:0,runSince:Date.now(),startedAt:Date.now(),goal:countdownGoal,demo:false};
      persist();view='running';render(true);say('운동을 시작했습니다.');
    },1000);
  }
  function pause() {
    const s=active();if(!s)return;
    if(s.status==='running'){s.baseMs=elapsed(s);s.runSince=null;s.status='paused';say('운동을 일시 정지했습니다.');}
    else{s.runSince=Date.now();s.status='running';say('운동을 다시 시작합니다.');}
    if(!s.demo)persist();render();
  }
  function finish({silent=false}={}) {
    const s=active();if(!s)return;
    result={id:s.id,elapsedMs:elapsed(s),finishedAt:Date.now(),goal:s.goal,mood:'',demo:!!s.demo};
    if(!s.demo){if(!data.records.some(r=>r.id===result.id))data.records.push({...result});data.active=null;persist();}
    demoSession=null;demoClockMs=null;view='complete';clearPhoto();render(true);if(!silent){window.NooprunSFX?.play('complete');say('운동을 완료했습니다. 잘 쉬었습니다.');}
  }
  function updateTimer() {
    const t=$('#timer');if(!t||!active())return;
    const ms=elapsed(),label=formatTime(ms);if(t.textContent!==label)t.textContent=label;
    t.classList.toggle('long',ms>=3600000);
    const s=active(),text=s.goal&&ms>=s.goal*1000?'목표만큼 쉬었어요. 더 쉬어도 좋아요.':null;
    if(text&&$('#run-note').textContent!==text)$('#run-note').textContent=text;
  }
  function showDemo(which) {
    if(data.active){toast('진행 중인 빈둥 기록을 먼저 마쳐 주세요. 기록은 그대로 유지돼요.');go('running');return;}
    closeModal();clearInterval(countdownTimer);countdownTimer=null;clearPhoto();demoSession=null;demoClockMs=null;
    if(which==='home')view='home';
    if(which==='running'){demoSession={id:'demo-active',status:'running',baseMs:18*60000+42000,runSince:Date.now(),goal:0,demo:true};view='running';}
    if(which==='complete'){result={id:'demo-result',elapsedMs:1800000,finishedAt:Date.now(),goal:0,mood:'',demo:true};view='complete';}
    render(true);
  }
  function closeModal() {$('#modal')?.remove();$('#app').inert=false;modalAction=null;focusBeforeModal?.focus({preventScroll:true});}
  function confirmFinish() {
    const s=active();if(!s)return;
    if(s.goal&&elapsed(s)<s.goal*1000){
      focusBeforeModal=document.activeElement;modalAction=finish;
      const box=document.createElement('div');box.id='modal';box.className='modal-backdrop';
      box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title"><h2 id="end-title">여기까지도 충분해요.</h2><p>지금까지 빈둥거린 ${duration(elapsed())}을 남길까요?<br>정한 시간보다 일찍 마쳐도 완주예요.</p><div class="modal-actions"><button data-action="keep-resting">더 쉬기</button><button class="confirm" data-action="confirm-finish">기록 남기기</button></div></section>`;
      $('#phone').append(box);box.querySelector('button').focus();
    }else finish();
  }
  async function choosePhoto(file) {
    if(!file||view!=='complete')return;
    if(!file.type.startsWith('image/')){toast('사진 파일을 골라 주세요.');return;}
    if(file.size>20*1024*1024){toast('20MB 이하의 사진을 골라 주세요.');return;}
    clearPhoto();const token=photoToken,url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{if(token!==photoToken||view!=='complete'){URL.revokeObjectURL(url);return;}photo={url,img};render();toast('사진은 이 창에서만 사용하고 업로드하지 않아요.');};
    img.onerror=()=>{URL.revokeObjectURL(url);toast('사진을 읽지 못했어요. JPG나 PNG로 다시 골라 주세요.');};img.src=url;
  }
  function exportCard() {
    if(!result)return;
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');
    c.fillStyle='#d8f476';c.fillRect(0,0,1080,1350);
    if(photo){const scale=Math.max(1080/photo.img.width,1350/photo.img.height),w=photo.img.width*scale,h=photo.img.height*scale;c.drawImage(photo.img,(1080-w)/2,(1350-h)/2,w,h);c.fillStyle='#0009';c.fillRect(0,0,1080,1350);}
    c.fillStyle=photo?'#fff':'#19201c';
    c.font='bold 34px -apple-system, sans-serif';c.fillText('NOOP RUN CLUB',80,120);
    c.font='28px -apple-system, sans-serif';c.fillText(result.demo?'DEMO · 시연용 완주 기록':dateLabel(result.finishedAt)+' · 빈둥 기록',80,174);
    c.font='bold 88px -apple-system, sans-serif';c.fillText('오늘도,',80,345);c.fillText('가만히 완주.',80,455);
    let size=210;const time=formatTime(result.elapsedMs);c.font=`${size}px Impact, sans-serif`;
    while(c.measureText(time).width>920&&size>80){size-=5;c.font=`${size}px Impact, sans-serif`;}
    c.fillText(time,75,755);c.font='31px -apple-system, sans-serif';c.fillText('아무것도 하지 않은 시간',82,818);
    c.strokeStyle=photo?'#ffffff80':'#19201c60';c.lineWidth=2;c.beginPath();c.moveTo(80,915);c.lineTo(1000,915);c.stroke();
    c.font='115px Impact, sans-serif';c.fillText('0.00',80,1070);c.font='33px -apple-system, sans-serif';c.fillText('km',355,1068);
    c.font='28px -apple-system, sans-serif';c.fillText(result.mood||'내 속도로 쉬었어요.',80,1160);
    c.font='22px -apple-system, sans-serif';c.fillText(result.demo?'계획 중인 앱 · 디자인 시안 · 실제 운동 기록 아님':'NOOPRUN · HTML 시안에서 남긴 빈둥 기록',80,1280);
    canvas.toBlob(blob=>{if(!blob){toast('카드를 저장하지 못했어요. 다시 시도해 주세요.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nooprun-${result.demo?'demo':new Date(result.finishedAt).toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('완주 카드 PNG를 저장했어요.');},'image/png');
  }

  const post='러닝앱처럼 진지하게\n누워 있던 시간을 기록하는 앱을 생각 중이야.\n\n시작하면 “운동을 시작했습니다.”\n30분 동안 소파에 누워 있다가 끝내면\n빈둥 시간 30:00 / 이동 거리 0.00km.\n\n마지막엔 내 사진 위에 기록을 얹어서\n진짜 완주한 것처럼 공유하는 거야.\n\n이름은 눕런.\n오늘도, 가만히 완주.\n\n이런 앱 있으면 친구한테 한 번쯤 자랑할 것 같아?';
  function note(name='experience') {
    document.querySelectorAll('[data-note]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.note===name)));
    const content={
      experience:`<p class="note-kicker">01 / A VERY SERIOUS REST</p><h2>화면은 진지하게.<br>기록은 조금 엉뚱하게.</h2><p class="lede">나이키런 같은 익숙한 운동 기록 흐름에, 누워서 빈둥거린 시간을 담아요. 재미가 터지는 순간은 0.00km로 완주 카드를 받았을 때예요.</p><ol class="flow"><li><strong>편한 자세로 시작</strong>목표 시간 없이, 시작 버튼만 눌러요.</li><li><strong>“운동을 시작했습니다.”</strong>3초 뒤 음성과 함께 빈둥 타이머가 돌아요.</li><li><strong>멈춤도, 일찍 마침도 자유</strong>쉬고 싶은 만큼만 쉬어요. 거리 표시는 0.00km.</li><li><strong>완주 카드를 남겨요</strong>내 사진에 빈둥 시간과 기분을 얹어요.</li></ol><p class="note-callout">오래 누워 있는 경쟁보다 “나 오늘 이것도 완주했어”라는 가벼운 농담. 기록을 받은 사람이 한 번 웃고, 친구에게 보내고 싶은 순간을 만듭니다.</p>`,
      scope:`<p class="note-kicker">02 / FIRST VERSION</p><h2>한 번의 완주가<br>끝까지 이어지도록.</h2><h3>먼저 만들 것</h3><ul class="scope-list"><li>시작·멈춤·재개·완주 타이머와 음성</li><li>목표 시간 없이 자유롭게 기록</li><li>날짜별 기록과 누적 빈둥 시간</li><li>사진·기분을 넣은 완주 카드 저장</li><li>로그인 없이 시작하는 흐름</li></ul><h3>나중에 검토할 것</h3><ul class="scope-list"><li>캐릭터 자세, 기록 카드, 음성 팩</li><li>잠금 화면·다이나믹 아일랜드의 타이머</li><li>가격은 반응을 본 뒤 결정</li></ul><p class="note-callout">현재는 브라우저 안의 동작 시안이에요. 원래 모바일 프로젝트의 빌드·기기 검증은 별도이며, 수면·칼로리·건강 상태를 측정하지 않아요.</p><h3>첫 반응에서 볼 것</h3><p class="lede">설명 없이 농담을 이해하는지, 한 번 완주하는지, 카드로 친구에게 보내고 싶어 하는지. 다시 켜는 이유까지 확인해요.</p>`,
      post:`<p class="note-kicker">03 / ASK BEFORE BUILDING MORE</p><h2>친구한테 자랑할<br>쓸데있는 기록.</h2><p class="lede">계획 중인 앱으로 소개하는 쓰레드 초안이에요.</p><textarea class="post-copy" id="post-copy" aria-label="쓰레드 게시글 초안">${esc(post)}</textarea><button class="copy-post" data-action="copy-post">글 복사 ↗</button><p class="note-callout">영상은 화면 방향을 고른 뒤 제작해요. 이번 시안에서는 이미지를 저장할 수 있고, 게시나 외부 전송은 하지 않아요.</p>`
    };
    $('#note-content').innerHTML=content[name]+'<a class="note-link" href="../../#nooprun">아카이브에서 기획 보기 ↗</a>';
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.note){note(b.dataset.note);return;}
    if(b.dataset.demo){showDemo(b.dataset.demo);return;}
    if(b.dataset.record){result=data.records.find(r=>r.id===b.dataset.record);clearPhoto();view='complete';render(true);return;}
    if(b.dataset.mood){if(!result)return;result.mood=b.dataset.mood;const r=data.records.find(r=>r.id===result.id);if(r){r.mood=result.mood;persist();}render();return;}
    const action=b.dataset.action;
    if(['home','history','settings'].includes(action)){go(action);return;}
    if(action==='start'){beginCountdown();return;}
    if(action==='cancel-countdown'){cancelCountdown();return;}
    if(action==='effects'){window.NooprunSFX?.toggle();render();return;}
    if(action==='sound'){data.sound=!data.sound;persist();if(!data.sound)window.speechSynthesis?.cancel();render();$('[data-action=sound]')?.focus({preventScroll:true});return;}
    if(action==='pause'){pause();return;}
    if(action==='finish'){confirmFinish();return;}
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
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();else updateTimer();});
  window.addEventListener('pagehide',()=>{persist();window.speechSynthesis?.cancel();});
  let lastPaint=0;function frame(time){if(time-lastPaint>160){updateTimer();lastPaint=time;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.nooprun={state:()=>({view,storageOK,active:active()?{...active(),elapsedMs:elapsed()}:null,result:result?{...result}:null,records:data.records.map(r=>({...r})),goal:data.goal}),showDemo};
  // Deterministic, explicitly labelled demo frames for the introduction video.
  // An actual active session is never replaced; no demo state is persisted.
  function videoFrame({scene='home',elapsedMs=0,countdown:count=3}={}) {
    if (!['home','countdown','running','complete'].includes(scene)) throw new Error('Unknown video scene');
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid demo time');
    if (data.active) return {ok:false,reason:'real-session-active'};
    clearInterval(countdownTimer);countdownTimer=null;
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
  window.ready=document.fonts.ready;
})();
