(() => {
  'use strict';
  const poses=['bed-phone','bed-side','bed-prone','bed-stretch','bed-blanket','sofa-phone','rest-editorial'];
  const valid=id=>poses.includes(id);
  function choose(){const n=new Uint32Array(1);crypto.getRandomValues(n);return poses[n[0]%poses.length];}
  function forRecord(record){if(valid(record?.artId))return record.artId;const text=String(record?.id||'solo');let n=0;for(const c of text)n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return poses[n%poses.length];}
  const source=id=>`assets/illustrations/${valid(id)?id:poses[0]}.png`;
  const markup=(classes='',id=poses[0])=>`<span class="pose-stage ${classes}" data-pose-stage aria-hidden="true"><img class="pose-current" src="${source(id)}" alt="" width="1536" height="1024" decoding="async"></span>`;
  // A record owns one image. Rendering, visibility, and elapsed time never reselect it.
  window.NooprunArt=Object.freeze({markup,choose,forRecord,source,mount:()=>{},state:()=>({enabled:false,count:poses.length,changes:0})});
})();
