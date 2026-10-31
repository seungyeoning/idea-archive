(() => {
  'use strict';
  const base = new URL('assets/voice/', document.currentScript.src);
  const files = {start:'coach-start.mp3?v=map-overlay-1', pause:'coach-pause.mp3?v=room-pause-1', resume:'coach-resume.mp3?v=map-overlay-1', complete:'coach-complete.mp3?v=map-overlay-1'};
  let enabled = false, context, voice = null, epoch = 0, lastPlayed = null, playCount = 0;
  const decoded = new Map(), pending = new Map();
  // Preload files silently. Open the audio device only after a user gesture.
  const bytes = Object.fromEntries(Object.entries(files).map(([cue,file]) => [cue,
    fetch(new URL(file,base)).then(r => {if(!r.ok)throw Error('Voice unavailable');return r.arrayBuffer();}).catch(() => null)
  ]));
  function prime() {
    if (!enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!context && AudioContext) context = new AudioContext({latencyHint:'interactive'});
      if (context && context.state !== 'running' && context.state !== 'closed') context.resume().catch(() => {});
      if (context) Object.keys(files).forEach(buffer);
    } catch {}
  }
  function buffer(cue) {
    if (decoded.has(cue)) return Promise.resolve(decoded.get(cue));
    if (!context || !files[cue]) return Promise.resolve(null);
    if (!pending.has(cue)) pending.set(cue,bytes[cue].then(data => data ? context.decodeAudioData(data.slice(0)) : null)
      .then(audio => {if(audio)decoded.set(cue,audio);return audio;}).catch(() => null));
    return pending.get(cue);
  }
  function stop() {
    epoch++;
    if (voice) {
      try {voice.source.stop();voice.source.disconnect();voice.gain.disconnect();} catch {}
      voice = null;
    }
  }
  async function play(cue) {
    stop();
    if (!enabled || document.hidden || !files[cue]) return 'skipped';
    const token = epoch;
    prime();
    let timeout;
    const audio = await Promise.race([buffer(cue),new Promise(resolve => {timeout=setTimeout(()=>resolve(null),1800);})]);
    clearTimeout(timeout);
    if (token !== epoch || !enabled || document.hidden) return 'skipped';
    if (!audio || context?.state !== 'running') return 'unavailable';
    try {
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=audio;gain.gain.value=.85;source.connect(gain);gain.connect(context.destination);
      const current={source,gain};voice=current;
      source.onended=()=>{if(voice===current)voice=null;source.disconnect();gain.disconnect();};
      source.start();lastPlayed=cue;playCount++;
      return 'played';
    } catch {stop();return 'unavailable';}
  }
  function setEnabled(value) {enabled=!!value;if(!enabled)stop();return enabled;}
  document.addEventListener('pointerdown',prime,{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')prime();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  window.NooprunVoice=Object.freeze({play,prime,stop,setEnabled,
    state:()=>({enabled,ready:[...decoded.keys()],contextState:context?.state||'not-opened',lastPlayed,playCount,activeVoices:voice?1:0,source:'ElevenLabs',voice:'Hongsuk'})});
})();
