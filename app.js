'use strict';
(()=>{
  const items=Array.isArray(window.ARCHIVE_ITEMS)?window.ARCHIVE_ITEMS:[];
  const byId=new Map(items.filter(i=>i&&typeof i.id==='string').map(i=>[i.id,i]));
  const $=id=>document.getElementById(id), grid=$('projectGrid'), dialog=$('projectDialog'), video=$('detailVideo');
  let filter='all',activeId=null,lastFocus=null,copyTimer;
  const labels={app:'앱',game:'게임'};
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localUrl=value=>{if(typeof value!=='string'||!value)return null;try{const u=new URL(value,location.href);if(u.origin!==location.origin||!['http:','https:','file:'].includes(u.protocol))return null;return value;}catch{return null}};
  const theme=value=>/^#[0-9a-f]{3,8}$/i.test(String(value))?value:'#f5f5f7';
  const arrow='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';
  const check='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
  function imageMarkup(item,extra=''){const src=localUrl(item.cover);return src?`<img src="${escapeHtml(src)}" alt="${escapeHtml(item.title)} 시안" ${extra}>`:'';}
  $('countAll').textContent=String(items.length);$('countApp').textContent=String(items.filter(i=>i.category==='app').length);$('countGame').textContent=String(items.filter(i=>i.category==='game').length);
  function renderHero(){
    const travel=items.find(i=>/travel|plan-to-map/.test(i.id))||items.find(i=>/여행/.test(i.title))||items[0];
    const musubi=items.find(i=>/musubi/i.test(i.id+' '+i.title))||items.find(i=>i.id!==travel?.id);
    const game=items.find(i=>i.category==='game')||items.find(i=>i.id!==travel?.id&&i.id!==musubi?.id);
    const picks=[musubi,travel,game].filter(Boolean).filter((item,i,a)=>a.findIndex(x=>x.id===item.id)===i);
    $('heroStage').innerHTML=picks.map(item=>`<button class="hero-preview" type="button" data-project="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 자세히 보기"><span class="preview-chrome" aria-hidden="true"><i></i><i></i><i></i><span>${escapeHtml(item.title)}</span></span><span class="preview-image" style="background:${theme(item.theme)}">${imageMarkup(item,'decoding="async" fetchpriority="high"')}</span></button>`).join('');
  }
  function render(){
    const normalize=value=>String(value).toLocaleLowerCase('ko').replace(/\s+/g,'');
    const query=normalize($('searchInput').value);
    const shown=items.filter(item=>(filter==='all'||item.category===filter)&&(!query||normalize([item.title,item.tagline,item.summary,...(item.features||[])].join(' ')).includes(query)));
    grid.innerHTML=shown.map(item=>`<article class="project-card"><button type="button" class="card-button" data-project="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)} 자세히 보기"><span class="card-art" style="--card-theme:${theme(item.theme)}">${imageMarkup(item,'loading="lazy" decoding="async"')}<span class="card-open">${arrow}</span></span><span class="card-body"><span class="card-meta"><span class="card-category">${labels[item.category]||'아이디어'}</span><span class="meta-dot" aria-hidden="true"></span><span>${escapeHtml(item.status||'기획')}</span></span><span class="card-title">${escapeHtml(item.title)}</span><span class="card-tagline">${escapeHtml(item.tagline)}</span></span></button></article>`).join('');
    $('emptyState').hidden=shown.length!==0;
    $('resultStatus').textContent=`${filter==='all'?'전체':labels[filter]} 아이디어 ${shown.length}개${query?`, ‘${$('searchInput').value.trim()}’ 검색 결과`:''}`;
  }
  function setFilter(value){filter=['all','app','game'].includes(value)?value:'all';document.querySelectorAll('[data-filter]').forEach(button=>{const on=button.dataset.filter===filter;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on))});render()}
  function stopVideo(){video.pause();video.removeAttribute('src');video.load();video.hidden=true;$('detailCover').hidden=false;}
  function closeDetail(updateLocation=true){
    if(!dialog.open)return;stopVideo();dialog.close();document.body.classList.remove('modal-open');activeId=null;clearTimeout(copyTimer);
    if(updateLocation&&byId.has(decodeHash()))history.replaceState(null,'',location.pathname+location.search+'#archive');
    if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});else $('archiveTitle').scrollIntoView({block:'nearest'});
  }
  function openDetail(id,push=true){
    const item=byId.get(id);if(!item)return;
    if(!dialog.open)lastFocus=document.activeElement;
    stopVideo();activeId=id;clearTimeout(copyTimer);$('copyStatus').textContent='';$('copyLink').textContent='링크 복사';
    $('detailTitle').textContent=item.title;$('detailTagline').textContent=item.tagline||'';$('detailSummary').textContent=item.summary||'';$('detailCategory').textContent=labels[item.category]||'아이디어';$('detailStatus').textContent=item.status||'기획';
    const cover=localUrl(item.cover);$('detailCover').src=cover||'';$('detailCover').hidden=!cover;$('detailCover').alt=item.title+' 시안';$('detailMedia').style.background=theme(item.theme);
    $('detailFeatures').innerHTML=(item.features||[]).map(feature=>`<div class="feature-line">${check}<span>${escapeHtml(feature)}</span></div>`).join('');
    $('detailNote').textContent=item.note||'기획과 디자인을 살펴보는 시안입니다.';
    const demo=localUrl(item.demo);$('detailDemo').hidden=!demo;if(demo)$('detailDemo').href=demo;
    $('playVideo').hidden=!localUrl(item.video);
    if(!dialog.open)dialog.showModal();document.body.classList.add('modal-open');dialog.scrollTop=0;$('closeDetail').focus({preventScroll:true});
    if(push&&decodeHash()!==id)history.pushState({project:id},'',location.pathname+location.search+'#'+encodeURIComponent(id));
  }
  function decodeHash(){try{return decodeURIComponent(location.hash.slice(1))}catch{return''}}
  function syncRoute(){const id=decodeHash();if(byId.has(id)){if(activeId!==id||!dialog.open)openDetail(id,false)}else if(dialog.open)closeDetail(false)}
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-project]');if(trigger)openDetail(trigger.dataset.project)});
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.filter)));
  $('searchInput').addEventListener('input',render);
  $('resetSearch').addEventListener('click',()=>{$('searchInput').value='';setFilter('all');$('searchInput').focus()});
  $('closeDetail').addEventListener('click',()=>closeDetail());
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail()});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDetail()}});
  $('playVideo').addEventListener('click',()=>{const item=byId.get(activeId),src=localUrl(item?.video);if(!src)return;video.src=src;video.poster=localUrl(item.cover)||'';video.hidden=false;$('detailCover').hidden=true;$('playVideo').hidden=true;video.play().catch(()=>{});video.focus()});
  $('copyLink').addEventListener('click',async()=>{if(!activeId)return;const url=new URL(location.href);url.hash=activeId;try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(url.href);$('copyLink').textContent='복사했어요';$('copyStatus').textContent='이 아이디어의 링크를 복사했어요.';}catch{$('copyStatus').textContent='브라우저 주소창의 링크를 복사해주세요.'}clearTimeout(copyTimer);copyTimer=setTimeout(()=>{$('copyLink').textContent='링크 복사';$('copyStatus').textContent=''},3500)});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!dialog.open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)&&!event.metaKey&&!event.ctrlKey){event.preventDefault();$('searchInput').focus()}});
  addEventListener('hashchange',syncRoute);addEventListener('popstate',syncRoute);
  renderHero();render();syncRoute();
})();
