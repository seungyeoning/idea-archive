'use strict';

// Curated interaction examples, not live OCR or dictionary responses.
const entries = {
  eat: {
    word: '食べさせられた', reading: 'たべさせられた', type: '사역수동 · 과거',
    meaning: '누군가 시켜서 먹었다', short: '문맥에 따라 억지로 먹었다는 느낌이 들어요.',
    base: '食べる', baseMeaning: '먹다', question: '왜 이런 형태일까?',
    aliases: ['食べさせられた', 'たべさせられた'],
    explanation: `<h3>길어 보여도, <b>食べる</b>에서 하나씩 이어진 말이에요.</h3>
      <div class="morph-steps">
        <div class="morph-step"><b lang="ja">食べる</b><span>먹다</span></div><svg class="icon"><use href="#i-arrow"/></svg>
        <div class="morph-step"><b lang="ja">食べさせる</b><span>먹게 시키다</span></div><svg class="icon"><use href="#i-arrow"/></svg>
        <div class="morph-step"><b lang="ja">食べさせられる</b><span>먹도록 시켜지다</span></div><svg class="icon"><use href="#i-arrow"/></svg>
        <div class="morph-step"><b lang="ja">食べさせられた</b><span>과거에 일어난 일</span></div>
      </div><div class="example-sentence"><span lang="ja">苦手な野菜を食べさせられた。</span><span>잘 못 먹는 채소를 억지로 먹어야 했다.</span></div>`
  },
  niyoru: {
    word: 'による', reading: 'による', type: '문장 속 표현',
    meaning: '~로 인한 · ~에 따르다', short: '함께 쓰인 말을 보면 어떤 뜻인지 알 수 있어요.',
    base: null, baseMeaning: '문맥에 따라 달라지는 표현', question: '문장에서는 어떻게 쓸까?',
    aliases: ['による'],
    explanation: `<h3>같은 <b lang="ja">による</b>도, 문장 안에서는 조금씩 달라요.</h3><div class="usage-grid">
      <div class="usage-item"><label>어떤 일이 생긴 원인</label><b lang="ja">雨による中止</b><p>비로 인한 취소</p></div>
      <div class="usage-item"><label>무엇에 따라 달라지는지</label><b lang="ja">結果は人による。</b><p>결과는 사람에 따라 다르다.</p></div></div>
      <p class="related-note">함께 알아두기 · <span lang="ja">ニュースによると</span> → 뉴스에 따르면. <b>によると</b>는 정보의 출처를 나타내는 관련 표현이에요.</p>`
  },
  tanomu: {
    word: '頼んじゃった', reading: 'たのんじゃった', type: '회화체 · 축약',
    meaning: '부탁해 버렸다 · 주문해 버렸다', short: '무엇을 頼む 했는지에 따라 뜻이 달라져요.',
    base: '頼む', baseMeaning: '부탁하다 · 주문하다', question: '어떤 말을 줄였을까?',
    aliases: ['頼んじゃった', 'たのんじゃった'],
    explanation: `<h3><b lang="ja">頼んでしまった</b>를 편하게 줄인 말이에요. 문맥에 따라 아쉬움이나 후회가 담겨요.</h3>
      <div class="morph-steps"><div class="morph-step"><b lang="ja">頼む</b><span>부탁하다 · 주문하다</span></div><svg class="icon"><use href="#i-arrow"/></svg><div class="morph-step"><b lang="ja">頼んでしまった</b><span>주문해 버렸다</span></div><svg class="icon"><use href="#i-arrow"/></svg><div class="morph-step"><b lang="ja">頼んじゃった</b><span>대화할 때 줄여 쓰기</span></div></div>
      <div class="example-sentence"><span lang="ja">同じ本を二冊頼んじゃった。</span><span>같은 책을 두 권 주문해 버렸어.</span></div>`
  },
  warm: {
    word: '暖かい', reading: 'あたたかい', type: 'い형용사',
    meaning: '날씨나 공기가 따뜻하다', short: '봄날의 포근한 공기를 떠올려 보세요.',
    base: '暖かい', baseMeaning: '따뜻하다', question: '温かい와 뭐가 다를까?',
    aliases: ['暖かい', 'あたたかい'],
    explanation: `<h3>둘 다 <b lang="ja">あたたかい</b>라고 읽어요. 무엇이 따뜻한지 보고 골라요.</h3><div class="usage-grid">
      <div class="usage-item"><label>날씨 · 기온 · 공기</label><b lang="ja">今日は暖かい。</b><p>오늘은 날이 따뜻하다.</p></div>
      <div class="usage-item"><label>음식 · 물건 · 마음</label><b lang="ja">温かいお茶を飲む。</b><p>따뜻한 차를 마시다.</p></div></div><p class="related-note">대표적인 쓰임을 비교한 예시예요. 문맥에 따라 비유적으로 쓰이기도 해요.</p>`
  },
  warmObject: {
    word: '温かい', reading: 'あたたかい', type: 'い형용사',
    meaning: '음식이나 마음이 따뜻하다', short: '손에 든 따뜻한 차 한 잔을 떠올려 보세요.',
    base: '温かい', baseMeaning: '따뜻하다', question: '暖かい와 뭐가 다를까?',
    aliases: ['温かい'], explanation: ''
  }
};
entries.warmObject.explanation = entries.warm.explanation;

const $ = id => document.getElementById(id);
const canvas = $('inkCanvas');
const ctx = canvas.getContext('2d');
const storageKey = 'jp-writing-design-v1';
let strokes = [], undoStack = [], activeStroke = null, activePointer = null, activeGeometry = null;
let tool = 'pen', sampleId = null, currentId = null, history = [], explanationOpen = false;
let canvasWidth = 1, canvasHeight = 1, lastSaved = 0, toastTimer, storageWarningShown = false;
const clone = value => JSON.parse(JSON.stringify(value));

function safeLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || saved.version !== 1) return;
    if (Array.isArray(saved.strokes)) strokes = saved.strokes.filter(validStroke).slice(-300);
    if (Array.isArray(saved.history)) history = saved.history.filter(item => entries[item.id] && Array.isArray(item.strokes)).slice(0, 20).map(item => ({ ...item, strokes: item.strokes.filter(validStroke).slice(-300) }));
  } catch { /* A restricted browser can still run the prototype in memory. */ }
}
function validStroke(s) {
  return s && ['pen', 'eraser'].includes(s.tool) && Array.isArray(s.points) && s.points.length < 20000 && s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, strokes, history })); lastSaved = Date.now(); }
  catch { if (!storageWarningShown) { toast('이 브라우저에서는 기록을 저장할 수 없어요. 현재 화면은 계속 사용할 수 있어요.'); storageWarningShown = true; } }
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3100);
}
function updateCanvasUI() {
  const hasInk = strokes.length > 0;
  $('emptyPrompt').hidden = hasInk || Boolean(sampleId);
  $('sampleInk').hidden = !sampleId || hasInk;
  $('writingArea').classList.toggle('has-ink', hasInk);
  $('inkSearch').hidden = !hasInk;
  $('undoButton').disabled = undoStack.length === 0;
  $('canvasState').textContent = tool === 'eraser' ? '지우고 싶은 곳을 문질러 주세요' : hasInk ? '쓴 글씨는 자동으로 보관돼요' : '한자 · 히라가나 · 가타카나';
  $('historyDot').hidden = history.length === 0;
}
function setTool(next) {
  tool = next;
  $('penTool').classList.toggle('active', next === 'pen');
  $('penTool').setAttribute('aria-pressed', String(next === 'pen'));
  $('eraserTool').classList.toggle('active', next === 'eraser');
  $('eraserTool').setAttribute('aria-pressed', String(next === 'eraser'));
  canvas.classList.toggle('erasing', next === 'eraser');
  updateCanvasUI();
}
function saveUndo() {
  undoStack.push({ strokes: clone(strokes), sampleId, currentId, explanationOpen });
  if (undoStack.length > 35) undoStack.shift();
}

// Keep original coordinates and fit the ink to resized space without stretching it.
function geometry() {
  if (activeGeometry) return activeGeometry;
  let minX = 0, minY = 0, maxX = 1200, maxY = 560;
  for (const stroke of strokes) {
    if (stroke.tool !== 'pen') continue;
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x - 8); minY = Math.min(minY, p.y - 8);
      maxX = Math.max(maxX, p.x + 8); maxY = Math.max(maxY, p.y + 8);
    }
  }
  const w = maxX - minX, h = maxY - minY;
  const scale = Math.min(canvasWidth / w, canvasHeight / h);
  return { scale, ox: (canvasWidth - w * scale) / 2 - minX * scale, oy: (canvasHeight - h * scale) / 2 - minY * scale };
}
function pointerPoint(e) {
  const rect = canvas.getBoundingClientRect(), g = geometry();
  return { x: (e.clientX - rect.left - g.ox) / g.scale, y: (e.clientY - rect.top - g.oy) / g.scale };
}
function drawStroke(s, g) {
  if (!s.points.length) return;
  ctx.save(); ctx.translate(g.ox, g.oy); ctx.scale(g.scale, g.scale);
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = '#30392f'; ctx.fillStyle = '#30392f';
  ctx.lineWidth = s.tool === 'eraser' ? 43 : 4.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const p = s.points;
  if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x,p[0].y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill(); }
  else {
    ctx.beginPath(); ctx.moveTo(p[0].x,p[0].y);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x+p[i+1].x)/2, (p[i].y+p[i+1].y)/2);
    ctx.lineTo(p[p.length-1].x,p[p.length-1].y);ctx.stroke();
  }
  ctx.restore();
}
let redrawFrame = null;
function redraw() {
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvasWidth,canvasHeight);
    const g = geometry();
    for (const s of strokes) drawStroke(s, g);
  });
}
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvasWidth = rect.width; canvasHeight = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(rect.width*dpr);canvas.height = Math.round(rect.height*dpr);
  redraw();
}
canvas.addEventListener('pointerdown', e => {
  if (activePointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
  // Broad touch contacts are ignored, but this is not native Pencil palm rejection.
  if (e.pointerType === 'touch' && (e.width > 45 || e.height > 45)) return;
  if (tool === 'eraser' && strokes.length === 0) return;
  e.preventDefault(); saveUndo(); sampleId = null;
  activeGeometry = geometry();
  activePointer = e.pointerId;
  activeStroke = { tool, points: [pointerPoint(e)] };
  strokes.push(activeStroke);canvas.setPointerCapture(e.pointerId);
  updateCanvasUI();redraw();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer || !activeStroke) return;
  e.preventDefault();
  const points = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const event of points.length ? points : [e]) {
    const next = pointerPoint(event), prev = activeStroke.points.at(-1);
    if (Math.hypot(next.x-prev.x,next.y-prev.y) > .6) activeStroke.points.push(next);
  }
  redraw();
});
function finishStroke(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;activeStroke = null;activeGeometry = null;persist();updateCanvasUI();redraw();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);
$('penTool').addEventListener('click', () => setTool('pen'));
$('eraserTool').addEventListener('click', () => setTool('eraser'));
$('undoButton').addEventListener('click', () => {
  const previous = undoStack.pop();if (!previous) return;
  strokes = previous.strokes;sampleId = previous.sampleId;
  if (previous.currentId) showResult(previous.currentId, { record: false, sample: false });
  else collapseResult();
  if (previous.explanationOpen && previous.currentId) toggleExplanation(true);
  updateSample();redraw();updateCanvasUI();persist();
});
function newSearch() {
  if (strokes.length || currentId || sampleId) saveUndo();
  strokes = [];sampleId = null;currentId = null;explanationOpen = false;
  collapseResult();setTool('pen');updateCanvasUI();redraw();persist();
}
$('newButton').addEventListener('click', newSearch);
$('homeLink').addEventListener('click', e => { e.preventDefault(); collapseResult(); });

function updateSample() {
  if (sampleId && entries[sampleId]) {
    $('sampleWriting').textContent = entries[sampleId].word;
    $('sampleInk').classList.toggle('long', entries[sampleId].word.length > 5);
  }
  updateCanvasUI();
}
function showResult(id, { record = true, sample = true } = {}) {
  const entry = entries[id];if (!entry) return;
  currentId = id;explanationOpen = false;
  if (sample && strokes.length === 0) sampleId = id;
  $('resultReading').textContent = entry.reading;
  $('resultWord').textContent = entry.word;
  $('resultType').textContent = entry.type;
  $('resultMeaning').textContent = entry.meaning;
  $('resultShort').textContent = entry.short;
  $('baseForm').replaceChildren();
  if (entry.base) {
    $('baseForm').append(document.createTextNode('기본형'));
    const word = document.createElement('strong');word.lang = 'ja';word.textContent = entry.base;$('baseForm').append(word);
    const meaning = document.createElement('span');meaning.className = 'base-translation';meaning.textContent = entry.baseMeaning;$('baseForm').append(meaning);
  } else $('baseForm').textContent = entry.baseMeaning;
  $('explainToggle').innerHTML = `${entry.question}<svg class="icon"><use href="#i-arrow"/></svg>`;
  $('explainToggle').setAttribute('aria-expanded', 'false');
  $('explanation').innerHTML = entry.explanation;
  $('explanation').hidden = true;
  $('bottomPanel').classList.remove('is-expanded');
  $('emptyResults').hidden = true;$('resultView').hidden = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  if (record) {
    history = [{ id, time: Date.now(), strokes: clone(strokes), sampleId }, ...history.filter(h => h.id !== id)].slice(0, 20);
    persist();
  }
  updateSample();
}
function collapseResult() {
  currentId = null;explanationOpen = false;
  $('emptyResults').hidden = false;$('resultView').hidden = true;$('explanation').hidden = true;
  $('explainToggle').setAttribute('aria-expanded', 'false');
  $('bottomPanel').classList.remove('is-expanded');
}
$('collapseButton').addEventListener('click', collapseResult);
function toggleExplanation(force) {
  explanationOpen = typeof force === 'boolean' ? force : !explanationOpen;
  $('explanation').hidden = !explanationOpen;
  $('explainToggle').setAttribute('aria-expanded', String(explanationOpen));
  $('bottomPanel').classList.toggle('is-expanded', explanationOpen);
}
$('explainToggle').addEventListener('click', () => toggleExplanation());
document.querySelectorAll('[data-entry]').forEach(button => button.addEventListener('click', () => showResult(button.dataset.entry)));

function openSearch(fromInk = false) {
  $('searchTitle').textContent = fromInk ? '쓴 글씨로 뜻을 찾는 자리' : '키보드로 찾아보기';
  $('searchDescription').textContent = fromInk ? '필기 인식은 아직 연결 전이에요. 예시를 고르면 결과가 아래에 펼쳐져요.' : '이 시안에 준비된 표현을 입력하거나 골라보세요.';
  $('searchError').textContent = '';$('searchInput').value = '';
  $('searchDialog').showModal();
}
$('keyboardButton').addEventListener('click', () => openSearch());
$('inkSearch').addEventListener('click', () => openSearch(true));
$('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const query = $('searchInput').value.normalize('NFKC').replace(/\s/g, '');
  const match = Object.entries(entries).find(([,entry]) => entry.aliases.includes(query));
  if (match) showResult(match[0]);
  else $('searchError').textContent = query ? '이 시안에 준비된 예시가 없어요. 아래 표현을 골라보세요.' : '찾아볼 일본어를 입력해 주세요.';
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
}));
function renderHistory() {
  const list = $('historyList');list.replaceChildren();
  if (!history.length) { const empty = document.createElement('p');empty.className = 'history-empty';empty.textContent = '아직 찾아본 말이 없어요.';list.append(empty); }
  for (const item of history) {
    const entry = entries[item.id];
    const button = document.createElement('button');button.className = 'history-item';
    button.innerHTML = `<div><strong lang="ja">${entry.word}</strong><span>${entry.meaning}</span></div><svg class="icon"><use href="#i-arrow"/></svg>`;
    button.addEventListener('click', () => {
      saveUndo();strokes = clone(item.strokes);sampleId = item.sampleId;
      showResult(item.id, { record: false, sample: false });redraw();updateCanvasUI();persist();
    });
    list.append(button);
  }
  $('clearHistory').disabled = history.length === 0;
}
$('historyButton').addEventListener('click', () => {renderHistory();$('historyDialog').showModal();});
$('clearHistory').addEventListener('click', () => {
  history = [];persist();renderHistory();updateCanvasUI();
});
$('copyButton').addEventListener('click', async () => {
  if (!currentId) return;
  const entry = entries[currentId];
  const text = `${entry.word} (${entry.reading})\n${entry.meaning}${entry.base ? `\n기본형: ${entry.base} — ${entry.baseMeaning}` : ''}\n${entry.short}\n[디자인 시안의 예시 설명]`;
  try { await navigator.clipboard.writeText(text);toast('읽는 법과 뜻을 복사했어요.'); }
  catch {
    const area = document.createElement('textarea');area.value = text;area.style.cssText = 'position:fixed;opacity:0;';document.body.append(area);area.select();
    const copied = document.execCommand('copy');area.remove();toast(copied ? '읽는 법과 뜻을 복사했어요.' : '이 브라우저에서 복사를 허용하지 않았어요.');
  }
});
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {e.preventDefault();$('undoButton').click();}
});
window.addEventListener('pagehide', () => {if (Date.now() - lastSaved > 500) persist();});
safeLoad();updateCanvasUI();new ResizeObserver(resizeCanvas).observe($('writingArea'));
