const params=new URLSearchParams(location.search),theme=['a','b','c'].includes(params.get('theme'))?params.get('theme'):'a';
const app=document.querySelector('#app');app.className='theme-'+theme;document.querySelectorAll('.mark').forEach(i=>i.src=`assets/logo-${theme}.png`);
let view=params.get('view')||'lobby',previous='lobby',mode='혼자',elapsed=2538,running=false,lastTick=performance.now();
const fixed=params.has('capture');const map=L.map('map',{zoomControl:false,attributionControl:true,scrollWheelZoom:false,dragging:!fixed}).setView([37.5665,126.978],17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
L.marker([37.5665,126.978],{icon:L.divIcon({className:'house-marker',iconSize:[44,44],iconAnchor:[22,22],html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8M6 9v11h12V9M10 20v-7h4v7" stroke-linecap="round" stroke-linejoin="round"/></svg>'})}).addTo(map);
function paint(){const m=Math.floor(elapsed/60),s=Math.floor(elapsed%60);document.querySelector('#minutes').textContent=String(m).padStart(2,'0');document.querySelector('#seconds').textContent=String(s).padStart(2,'0');document.querySelector('#share-time').innerHTML=`${m}<span>분</span>${String(s).padStart(2,'0')}<span>초</span>`;}
function setView(next){view=next;running=next==='record'&&!fixed;lastTick=performance.now();['activity','share'].forEach(id=>document.getElementById(id).hidden=next!==id);document.querySelector('#state-label').textContent=next==='pause'?'잠깐 움직이는 중':next==='record'?'눕는 중':'오늘은 얼마나 누울까';document.querySelector('#meter-label').textContent=next==='lobby'?'오늘의 눕기':'누워 있던 시간';document.querySelector('#controls').innerHTML=next==='lobby'?'<button class="primary" data-action="start">눕기 <span aria-hidden="true">↗</span></button>':next==='pause'?'<button class="stop" data-action="end" aria-label="눕기 종료">■</button><button class="primary" data-action="resume">다시 눕기</button>':'<button class="primary" data-action="pause">Ⅱ &nbsp; 잠깐 움직이기</button>';document.querySelector('#session-context').textContent=mode==='혼자'?'나만의 휴식':'함께 쉬는 중';document.querySelector('.mode').innerHTML=mode+' <span>⌄</span>';document.querySelector('.mode').disabled=['record','pause'].includes(next);paint();setTimeout(()=>map.invalidateSize(),0);window.parent.postMessage({type:'nooprun-concept-view',view,theme},location.origin);}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
if(action==='mode'){document.querySelector(`#mode-dialog input[value="${mode}"]`).checked=true;document.querySelector('#mode-dialog').showModal();}
if(action==='start'){elapsed=0;setView('record');}
if(action==='pause')setView('pause');if(action==='resume')setView('record');if(action==='lobby')setView('lobby');
if(['activity','share'].includes(action)){previous=view;setView(action);}
if(action==='back')setView(['activity','share'].includes(previous)?'lobby':previous);
if(action==='end'){previous='lobby';setView('share');}
if(action==='center')map.setView([37.5665,126.978],17,{animate:false});
if(action==='flash'){const f=document.querySelector('#flash');f.classList.remove('flash');void f.offsetWidth;f.classList.add('flash');document.querySelector('.receipt').scrollIntoView({block:'center',behavior:'smooth'});}
});
document.querySelector('#mode-dialog').addEventListener('close',e=>{if(e.target.returnValue==='save'){mode=document.querySelector('#mode-dialog input:checked').value;setView(view);}});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data.type==='nooprun-concept-set-view')setView(e.data.view);});
setInterval(()=>{const now=performance.now();if(running){elapsed+=(now-lastTick)/1000;paint();}lastTick=now;},250);
setView(view);window.concept={setView,state:()=>({view,theme,mode,elapsed,running})};
