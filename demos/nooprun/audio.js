(() => {
  'use strict';
  const base = new URL('assets/sfx/', document.currentScript.src);
  const key = 'nooprun.effects.v1';
  const files = {tap:'ui-tap.mp3', start:'ui-start.mp3', pause:'ui-pause.mp3', complete:'ui-complete.mp3'};
  const levels = {tap:.34, start:.29, pause:.32, complete:.27};
  let enabled = true, context, epoch = 0, lastTap = -Infinity, lastPlayed = null, playCount = 0;
  const pending = new Map(), decoded = new Map(), voices = new Set();
  try { enabled = localStorage.getItem(key) !== 'off'; } catch {}
  // Loading bytes is silent; the audio device is opened only by a user gesture.
  const bytes = Object.fromEntries(Object.entries(files).map(([name,file]) => [name,
    fetch(new URL(file,base)).then(r => {if(!r.ok)throw Error('Sound unavailable');return r.arrayBuffer();}).catch(() => null)
  ]));
  function prime() {
    if (!enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!context && AudioContext) context = new AudioContext({latencyHint:'interactive'});
      if (context?.state === 'suspended') context.resume().catch(() => {});
      if (context) for (const name of Object.keys(files)) buffer(name);
    } catch {}
  }
  async function buffer(name) {
    if (decoded.has(name)) return decoded.get(name);
    if (!context) return null;
    if (!pending.has(name)) pending.set(name, bytes[name].then(data => data ? context.decodeAudioData(data.slice(0)) : null)
      .then(audio => {if(audio)decoded.set(name,audio);return audio;}).catch(() => null));
    return pending.get(name);
  }
  function stop() {
    epoch++;
    for (const voice of voices) {
      try {voice.gain.gain.cancelScheduledValues(context.currentTime);voice.gain.gain.setTargetAtTime(0,context.currentTime,.008);voice.source.stop(context.currentTime+.035);} catch {}
    }
    voices.clear();
  }
  async function play(name='tap') {
    if (!enabled || document.hidden || !files[name]) return false;
    const now = performance.now();
    if(name==='tap' && now-lastTap<65)return false;
    if(name==='tap')lastTap=now;
    const token=epoch;
    prime();
    const audio=await buffer(name);
    if(!audio || !enabled || document.hidden || token!==epoch || !context || context.state!=='running')return false;
    // Keep rapid taps crisp, never build a queue of delayed sounds.
    if(voices.size>=2) {const oldest=voices.values().next().value;try{oldest.source.stop()}catch{}voices.delete(oldest);}
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=audio;gain.gain.value=levels[name];source.connect(gain);gain.connect(context.destination);
    const voice={source,gain};voices.add(voice);
    source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();};
    source.start();lastPlayed=name;playCount++;
    return true;
  }
  function setEnabled(value) {
    enabled=Boolean(value);
    try{localStorage.setItem(key,enabled?'on':'off')}catch{}
    if(!enabled)stop();else{prime();play('tap');}
    return enabled;
  }
  document.addEventListener('pointerdown',prime,{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')prime();});
  document.addEventListener('click',e=>{
    if(e.target instanceof HTMLInputElement)return;
    const button=e.target.closest('button, #photo-label');
    if(!button || button.disabled || button.getAttribute('aria-disabled')==='true' || !button.closest('#phone,.demo-tools,.note-tabs,.notebook'))return;
    const action=button.dataset.action;
    if(action==='effects'||action==='confirm-finish')return;
    if(action==='start')play('start');
    else if(action==='pause')play(window.nooprun?.state().active?.status==='paused'?'start':'pause');
    else if(action==='cancel-countdown'||action==='keep-resting')play('pause');
    else play('tap');
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  window.NooprunSFX=Object.freeze({play,prime,setEnabled,toggle:()=>setEnabled(!enabled),
    state:()=>({enabled,ready:Object.keys(files).filter(k=>decoded.has(k)),contextState:context?.state||'not-opened',lastPlayed,playCount,activeVoices:voices.size,source:'ElevenLabs Sound Effects v2'})});
})();
