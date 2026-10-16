(() => {
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4;
  const N = n => reduce ? 0 : Math.round(n * (lowEnd ? .55 : 1));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const E = {
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
  };

  const CHARS = {
    c1:{rar:'UR', ep:'光輪の招き手', nm:'シロガネ', glow:'#cfe3ff', fx:lightFx},
    c2:{rar:'SEC', ep:'紅蓮の簒奪者', nm:'レン', glow:'#ff3b4f', fx:crimsonFx},
    c3:{rar:'SP', ep:'天空の歌姫', nm:'ミナモ', glow:'#5cc8f0', fx:waterFx},
  };

  /* ================= world clock: hit-stop, tweens, waits ================= */
  const S = { t:0, stopUntil:0, trauma:0 };
  const tweens = [], waiters = [];
  function hitstop(ms){ if (!reduce) S.stopUntil = performance.now() + ms; }
  function wt(ms){ return new Promise(r => waiters.push({at:S.t + (reduce ? Math.min(ms, 120) : ms) / 1000, r})); }
  function tween(o, key, to, ms, ease = E.outCubic){
    return new Promise(r => tweens.push({o, key, from:o[key], to, d:Math.max(.001, (reduce ? Math.min(ms, 150) : ms) / 1000), t:0, ease, r}));
  }
  function style(el, prop, unit = ''){ return { set v(x){ el.style[prop] = x + unit; }, get v(){ return parseFloat(el.style[prop]) || 0; } }; }
  const op = id => { const p = style($(id), 'opacity'); return p; };
  function addTrauma(x){ if (!reduce) S.trauma = Math.min(1, S.trauma + x); }

  /* ================= card body (physics-driven transform of #flip) ================= */
  const flipEl = $('flip');
  const B = { on:true, x:0, y:0, vx:0, vy:0, ry:0, vry:0, rz:0, vrz:0, s:1, vs:0, sx:1, vsx:0, sy:1, vsy:0, ctrl:null };
  function spring(key, target, k, c, dt){ const vk = 'v' + key; const a = -k * (B[key] - target) - c * B[vk]; B[vk] += a * dt; B[key] += B[vk] * dt; }
  function settle(dt, ryTarget){
    spring('x', 0, 180, 18, dt); spring('y', 0, 180, 18, dt); spring('rz', 0, 160, 16, dt);
    spring('s', 1, 220, 18, dt); spring('sx', 1, 320, 16, dt); spring('sy', 1, 320, 16, dt);
    spring('ry', ryTarget, 120, 13, dt);
  }
  B.ctrl = dt => settle(dt, B.restRy || 0);
  function applyBody(){
    flipEl.style.transform = `translate(${B.x.toFixed(2)}px,${B.y.toFixed(2)}px) rotateZ(${B.rz.toFixed(3)}deg) rotateY(${B.ry.toFixed(2)}deg) scale(${(B.s * B.sx).toFixed(4)},${(B.s * B.sy).toFixed(4)})`;
  }

  /* ================= particles + water on canvas ================= */
  const cv = $('fx'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, parts = [];
  function size(){ dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  size(); addEventListener('resize', size);
  function sprite(r, stops){
    const c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
  }
  const SPR = {
    glowW: sprite(32, [[0,'#ffffffff'],[.2,'#fffbe8cc'],[.5,'#fff2c040'],[1,'#ffffff00']]),
    glowG: sprite(32, [[0,'#fff8e0ff'],[.25,'#f2cf7aaa'],[.6,'#f2cf7a30'],[1,'#f2cf7a00']]),
    glowA: sprite(32, [[0,'#ffffffff'],[.25,'#bdf0ffbb'],[.6,'#5cc8f033'],[1,'#5cc8f000']]),
    bubble: (() => { const r = 48, c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d');
      let gr = g.createRadialGradient(r, r, 0, r, r, r);
      [[0,'#ffffff08'],[.62,'#bdf0ff14'],[.8,'#8fe3ff70'],[.88,'#ffb3d180'],[.95,'#ffffffb0'],[1,'#ffffff00']].forEach(([o,cc]) => gr.addColorStop(o, cc));
      g.fillStyle = gr; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill();
      gr = g.createRadialGradient(r * .62, r * .58, 0, r * .62, r * .58, r * .3); gr.addColorStop(0, '#ffffffee'); gr.addColorStop(1, '#ffffff00');
      g.fillStyle = gr; g.beginPath(); g.arc(r * .62, r * .58, r * .3, 0, 7); g.fill(); return c; })(),
  };
  function add(p){ parts.push(Object.assign({x:0,y:0,vx:0,vy:0,ax:0,ay:0,drag:1,life:0,max:1,size:4,rot:0,vr:0,alpha:1,delay:0}, p)); }
  function center(){ const r = $('slot').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2, w:r.width, h:r.height, top:r.top, bottom:r.bottom}; }

  const WT = { on:false, level:0, amp:10, t:0 };   // water: level = fraction of screen height from the bottom
  function surfaceY(x){
    const base = H * (1 - WT.level);
    return base + Math.sin(x * .012 + WT.t * 3.1) * WT.amp + Math.sin(x * .027 - WT.t * 2.3) * WT.amp * .55 + Math.sin(x * .006 + WT.t * 1.3) * WT.amp * .8;
  }
  function drawWater(){
    if (!WT.on || WT.level <= 0.001) return;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const top = H * (1 - WT.level) - WT.amp * 2;
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, '#9fe6ffa8'); g.addColorStop(.25, '#4fb6e6b8'); g.addColorStop(1, '#0d4f80e6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // caustic bands under the surface
    ctx.save(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#d8f6ff'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++){
      ctx.globalAlpha = .07 + .05 * Math.sin(WT.t * 2 + i);
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 18){
        const y = top + 40 + i * (H * .11) + Math.sin(x * .02 + WT.t * (1.4 + i * .2) + i) * 14;
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // surface highlight
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); for (let x = 0; x <= W + 12; x += 12){ const y = surfaceY(x); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawPart(p, k){
    let a = p.alpha * (p.fade === 'io' ? Math.sin(Math.PI * Math.min(1, k)) : 1 - k * k);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.globalCompositeOperation = p.blend || 'source-over';
    switch (p.type){
      case 'glow': { const s = p.size * (p.shrink ? 1 - k * .7 : 1); ctx.drawImage(SPR[p.spr || 'glowW'], p.x - s, p.y - s, s * 2, s * 2); break; }
      case 'bubble': { const s = p.size; ctx.drawImage(SPR.bubble, p.x - s, p.y - s, s * 2, s * 2); break; }
      case 'drop': {   // stretched along velocity: fast drops read as streaks, slow ones as beads
        const sp = Math.hypot(p.vx, p.vy), len = Math.min(70, p.size + sp * .022);
        const ux = p.vx / (sp || 1), uy = p.vy / (sp || 1);
        ctx.strokeStyle = p.color || '#eafcff'; ctx.lineWidth = p.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke(); break;
      }
      case 'ring': {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(.5, p.lw * (1 - k));
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * (p.squash || 1), 0, 0, Math.PI * 2); ctx.stroke(); break;
      }
      case 'feather': {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .55 + .45 * Math.abs(Math.cos(p.flip || 0)));
        ctx.fillStyle = p.color; ctx.beginPath();
        ctx.moveTo(0, -p.size); ctx.quadraticCurveTo(p.size * .55, -p.size * .2, 0, p.size); ctx.quadraticCurveTo(-p.size * .55, -p.size * .2, 0, -p.size); ctx.fill();
        ctx.strokeStyle = p.vein; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(0, p.size * 1.25); ctx.stroke(); ctx.restore(); break;
      }
      case 'spark': {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; const s = p.size * (1 - k * .5); ctx.beginPath();
        for (let i = 0; i < 8; i++){ const r = i % 2 ? s * .2 : s; const an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore(); break;
      }
      case 'streak': {
        const ux = Math.cos(p.ang), uy = Math.sin(p.ang);
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * p.len, p.y - uy * p.len); ctx.stroke(); break;
      }
      case 'ember': { ctx.drawImage(SPR.glowW, p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break; }
    }
  }
  function updateParts(dt){
    for (const p of parts){
      if (p.delay > 0){ p.delay -= dt; continue; }
      if (p.attract){ const dx = p.attract.x - p.x, dy = p.attract.y - p.y, d = Math.hypot(dx, dy) || 1; const f = p.pull * (1 + p.life * 3); p.vx += dx / d * f * dt; p.vy += dy / d * f * dt; if (d < 18){ p.life = p.max; } }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag !== 1){ const f = Math.pow(p.drag, dt * 60); p.vx *= f; p.vy *= f; }
      if (p.sway) p.x += Math.sin((p.life + p.ph) * p.sway) * p.swayAmp * dt * 60;
      if (p.vrad) { p.r += p.vrad * dt; p.vrad *= Math.pow(p.rdrag || .9, dt * 60); }
      if (p.flipv) p.flip = (p.flip || 0) + p.flipv * dt;
      if (p.type === 'bubble' && WT.on && p.y < surfaceY(p.x)) { p.life = p.max; add({type:'ring', x:p.x, y:surfaceY(p.x), r:p.size * .5, vrad:120, rdrag:.9, squash:.3, lw:1.5, color:'#ffffff', max:.5, blend:'lighter'}); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life += dt;
    }
    parts = parts.filter(p => p.life < p.max);
  }

  /* ================= main loop ================= */
  const world = $('world');
  let last = performance.now();
  function noise(t, seed){ return Math.sin(t * 1.0 + seed) * .5 + Math.sin(t * 2.3 + seed * 1.7) * .3 + Math.sin(t * 4.1 + seed * 2.9) * .2; }
  function loop(now){
    let dt = Math.min(.034, (now - last) / 1000); last = now;
    if (now < S.stopUntil) dt = 0;
    if (dt > 0){
      S.t += dt; WT.t += dt;
      for (let i = tweens.length - 1; i >= 0; i--){ const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.d); const v = w.from + (w.to - w.from) * w.ease(k); if (w.o instanceof Object && 'v' in w.o && w.key === 'v') w.o.v = v; else w.o[w.key] = v; if (k >= 1){ tweens.splice(i, 1); w.r(); } }
      for (let i = waiters.length - 1; i >= 0; i--) if (S.t >= waiters[i].at){ waiters[i].r(); waiters.splice(i, 1); }
      if (B.on && B.ctrl) B.ctrl(dt);
      updateParts(dt);
      S.trauma = Math.max(0, S.trauma - dt * 1.25);
    }
    if (B.on) applyBody();
    const sh = S.trauma * S.trauma;
    world.style.transform = sh > .0004 ? `translate(${(22 * sh * noise(S.t * 30, 1)).toFixed(2)}px,${(22 * sh * noise(S.t * 30, 5)).toFixed(2)}px) rotate(${(2.2 * sh * noise(S.t * 30, 9)).toFixed(3)}deg)` : '';
    ctx.clearRect(0, 0, W, H);
    drawWater();
    for (const p of parts) if (!(p.delay > 0)) drawPart(p, p.life / p.max);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ================= card sizing + tilt (after reveal) ================= */
  const ro = new ResizeObserver(es => es.forEach(e => e.target.style.setProperty('--w', e.contentRect.width + 'px')));
  document.querySelectorAll('.card-inner').forEach(n => ro.observe(n));
  let activeCard = null, lastMove = 0, revealed = false;
  function tilt(nx, ny, g){
    if (!activeCard) return;
    nx = clamp(nx, -1, 1); ny = clamp(ny, -1, 1);
    const s = activeCard.style;
    s.setProperty('--nx', nx.toFixed(3)); s.setProperty('--ny', ny.toFixed(3));
    s.setProperty('--ry', (nx * 16).toFixed(2) + 'deg'); s.setProperty('--rx', (-ny * 13).toFixed(2) + 'deg');
    s.setProperty('--mx', (50 + nx * 50).toFixed(1) + '%'); s.setProperty('--my', (50 + ny * 50).toFixed(1) + '%');
    s.setProperty('--g', g.toFixed(2));
  }
  document.addEventListener('pointermove', e => {
    if (!revealed || !activeCard) return;
    const r = activeCard.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    lastMove = performance.now(); tilt(nx, ny, Math.min(1, Math.hypot(nx, ny)));
  });
  (function idle(t){
    if (revealed && activeCard && t - lastMove > 2200 && !reduce){ const s = t / 1000; tilt(Math.sin(s * .8) * .5, Math.sin(s * 1.1 + 1) * .35, .45 + Math.sin(s) * .25); }
    requestAnimationFrame(idle);
  })(0);

  /* ================= shared: charge (anticipation) + omen ================= */
  const flash = op('flash');
  async function whitePop(peak = .85){ flash.v = peak; await tween(flash, 'v', 0, 260, E.outQuad); }
  async function charge(){
    const c = center(), pillar = $('pillar');
    pillar.className = 'pillar';
    tween(op('pillar'), 'v', .7, 900, E.inQuad);
    // light is sucked in, accelerating; the card trembles harder and harder
    for (let i = 0; i < N(90); i++){
      const a = rnd(0, Math.PI * 2), d = rnd(Math.max(W, H) * .4, Math.max(W, H) * .7);
      add({type:'glow', spr:'glowW', x:c.x + Math.cos(a) * d, y:c.y + Math.sin(a) * d, attract:c, pull:rnd(500, 900), size:rnd(4, 9), max:2.2, delay:rnd(0, .8), fade:'io', blend:'lighter'});
    }
    const t0 = S.t;
    B.ctrl = dt => {
      const k = clamp((S.t - t0) / 1.15, 0, 1), amp = k * k * 5;
      B.x = noise(S.t * 38, 2) * amp; B.rz = noise(S.t * 34, 7) * amp * .5;
      spring('s', 1 + k * .03, 200, 18, dt); spring('ry', 0, 200, 20, dt); spring('y', 0, 200, 20, dt);
      spring('sx', 1, 300, 18, dt); spring('sy', 1, 300, 18, dt);
    };
    await wt(1150);
    // anticipation: a quick crouch before the release
    B.ctrl = dt => { spring('s', .9, 600, 30, dt); spring('x', 0, 400, 30, dt); spring('rz', 0, 400, 30, dt); };
    await wt(170);
    hitstop(90); whitePop(.9); addTrauma(.45);
    pillar.classList.add('rainbow');
    B.vs = 4.5;
    B.ctrl = dt => settle(dt, 0);
    for (let i = 0; i < N(40); i++){ const a = rnd(0, Math.PI * 2), v = rnd(500, 1400); add({type:'glow', spr:'glowG', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, drag:.88, size:rnd(4, 10), max:rnd(.5, .9), blend:'lighter', shrink:true}); }
    await wt(420);
  }

  /* ================= SHIROGANE: launch → white-out → heavy descent → impact ================= */
  async function lightFx(){
    const c = center(), dim = op('dim'), rays = op('rays'), fl = $('flare');
    tween(dim, 'v', .88, 380, E.outCubic);
    // light sweeps in from the right edge (anamorphic streak)
    fl.style.top = (c.y - 3) + 'px';
    const fs = { v:0 }; const flareOp = op('flare'); flareOp.v = 1;
    const flareTick = () => { fl.style.transform = `scaleX(${fs.v})`; };
    const ft = setInterval(flareTick, 16);
    await tween(fs, 'v', 1, 300, E.outExpo);
    // crouch, then launch upward, stretching with speed
    B.ctrl = dt => { spring('y', 26, 500, 28, dt); spring('s', .94, 500, 28, dt); spring('sy', .92, 500, 28, dt); spring('sx', 1.05, 500, 28, dt); };
    await wt(200);
    B.vy = -2400;
    B.ctrl = dt => {
      B.vy -= 2600 * dt; B.y += B.vy * dt;
      const st = clamp(-B.vy / 3000, 0, .3); spring('sy', 1 + st, 900, 30, dt); spring('sx', 1 - st * .55, 900, 30, dt);
    };
    tween(flareOp, 'v', 0, 380, E.inQuad);
    await wt(170);
    // white-out
    await tween(flash, 'v', 1, 300, E.inCubic);
    clearInterval(ft); fl.style.transform = 'scaleX(0)';
    hitstop(110);
    dim.v = .55; rays.v = .6;
    B.ry = 180; B.vry = 0; B.y = -H * 1.05; B.vy = 0; B.sx = B.sy = 1; B.vsx = B.vsy = 0; B.s = 1; B.vs = 0;
    for (let i = 0; i < N(34); i++){
      add({type:'feather', x:rnd(0, W), y:rnd(-H * .3, H * .5), vy:rnd(40, 90), size:rnd(8, 15), rot:rnd(-.6, .6), vr:rnd(-.6, .6), flipv:rnd(2, 5),
        sway:rnd(2, 3.5), swayAmp:rnd(.4, 1.1), ph:rnd(0, 6), color:'#ffffff', vein:'#c9d3e6', max:rnd(3.5, 5), fade:'io'});
    }
    // white-in while the card drops like a weight
    tween(flash, 'v', 0, 650, E.outCubic);
    let landed = false;
    await new Promise(res => {
      B.ctrl = dt => {
        if (!landed){
          B.vy += 6200 * dt; B.y += B.vy * dt;
          const st = clamp(B.vy / 5200, 0, .18); spring('sy', 1 + st, 900, 30, dt); spring('sx', 1 - st * .5, 900, 30, dt);
          if (B.y >= 0){ B.y = 0; landed = true; impact(); res(); }
        } else settle(dt, 180);
      };
    });
    function impact(){
      hitstop(85); addTrauma(.75);
      B.vy = 0; B.sx = 1.14; B.sy = .84; B.vsx = 0; B.vsy = 0;
      const cc = center(), by = cc.bottom - 6;
      whitePop(.5);
      add({type:'ring', x:cc.x, y:by, r:20, vrad:2400, rdrag:.86, squash:.22, lw:10, color:'#fff6dc', max:.7, blend:'lighter'});
      add({type:'ring', x:cc.x, y:cc.y, r:cc.w * .4, vrad:1600, rdrag:.88, lw:6, color:'#f2cf7a', max:.6, blend:'lighter'});
      for (let i = 0; i < N(70); i++){
        const dir = Math.random() < .5 ? -1 : 1, v = rnd(500, 1800);
        add({type:'glow', spr:Math.random() < .5 ? 'glowW' : 'glowG', x:cc.x + dir * rnd(0, cc.w * .45), y:by + rnd(-6, 6), vx:dir * v, vy:-rnd(30, 260), ay:-60, drag:.88, size:rnd(5, 14), max:rnd(.7, 1.4), blend:'lighter', shrink:true});
      }
      for (let i = 0; i < N(28); i++){
        const a = rnd(-Math.PI * .95, -Math.PI * .05), v = rnd(700, 1500);
        add({type:'feather', x:cc.x + rnd(-cc.w * .3, cc.w * .3), y:by - rnd(0, 40), vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:120, drag:.9, size:rnd(9, 17), rot:rnd(0, 6), vr:rnd(-5, 5), flipv:rnd(3, 7),
          sway:rnd(2, 3), swayAmp:rnd(.3, .9), ph:rnd(0, 6), color:'#ffffff', vein:'#c9d3e6', max:rnd(2.4, 3.6)});
      }
      for (let i = 0; i < N(26); i++) add({type:'spark', x:cc.x + rnd(-cc.w, cc.w) * .8, y:cc.y + rnd(-cc.h, cc.h) * .55, size:rnd(3, 8), vr:rnd(-2, 2), color:Math.random() < .5 ? '#ffffff' : '#f2cf7a', max:rnd(.5, 1.1), delay:rnd(0, .5), fade:'io', blend:'lighter'});
    }
    await wt(500);
    tween(rays, 'v', 0, 1600, E.inOutCubic); tween(dim, 'v', 0, 1400, E.inOutCubic);
  }

  /* ================= MINAMO: flood → buoyant hold → breach & crown splash → drain → flip ================= */
  async function waterFx(){
    const c = center(), dim = op('dim');
    tween(dim, 'v', .5, 500, E.outCubic);
    WT.on = true; WT.level = 0; WT.amp = 26;
    tween(WT, 'level', (H - c.top + 70) / H, 950, E.outCubic);
    tween(WT, 'amp', 9, 1300, E.outCubic);
    for (let i = 0; i < N(60); i++){
      const s = rnd(4, 26);
      add({type:'bubble', x:rnd(0, W), y:H + rnd(10, 120), vy:-rnd(60, 160), ay:-rnd(260, 420), drag:.985, size:s, sway:rnd(4, 7), swayAmp:rnd(.4, 1.2), ph:rnd(0, 6), max:3, delay:rnd(0, .9)});
    }
    // underwater: heavy, slow, buoyant
    const t0 = S.t;
    B.ctrl = dt => {
      spring('y', Math.sin((S.t - t0) * 2.2) * 8 + 6, 40, 6, dt); spring('rz', Math.sin((S.t - t0) * 1.6) * 2.2, 30, 5, dt);
      spring('s', .98, 60, 9, dt); spring('sx', 1, 200, 16, dt); spring('sy', 1, 200, 16, dt); spring('ry', 0, 80, 10, dt);
    };
    await wt(1050);
    // anticipation: sink and squeeze while bubbles stream off the card
    B.ctrl = dt => { spring('y', 46, 160, 16, dt); spring('s', .93, 200, 18, dt); spring('sy', .93, 260, 18, dt); spring('sx', 1.04, 260, 18, dt); spring('rz', 0, 120, 14, dt); };
    for (let i = 0; i < N(45); i++){
      add({type:'bubble', x:c.x + rnd(-c.w * .5, c.w * .5), y:c.y + rnd(-c.h * .4, c.h * .5), vy:-rnd(80, 200), ay:-rnd(500, 900), drag:.98, size:rnd(3, 12), sway:rnd(5, 8), swayAmp:rnd(.3, .8), ph:rnd(0, 6), max:2});
    }
    await wt(380);
    // breach
    B.vy = -1500;
    let splashed = false, flipping = false, falling = false;
    await new Promise(res => {
      B.ctrl = dt => {
        if (!falling){
          B.vy += 3900 * dt; B.y += B.vy * dt;
          const st = clamp(-B.vy / 2600, 0, .28); spring('sy', 1 + st, 900, 30, dt); spring('sx', 1 - st * .5, 900, 30, dt); spring('s', 1, 300, 20, dt); spring('rz', 0, 200, 18, dt);
          if (!splashed && B.y < -80){ splashed = true; splash(); }
          if (B.vy > -300 && !flipping){ flipping = true; B.vry = 900; }
          if (flipping) spring('ry', 180, 70, 7, dt);
          if (B.vy > 0 && B.y >= -2){ falling = true; B.y = 0; addTrauma(.3); B.sx = 1.08; B.sy = .9; res(); }
        } else settle(dt, 180);
      };
    });
    function splash(){
      hitstop(80); addTrauma(.6);
      const sy = surfaceY(c.x);
      for (let i = 0; i < N(150); i++){
        const side = rnd(-1, 1), a = -Math.PI / 2 + side * rnd(.15, .9), v = rnd(600, 1900) * (1 - Math.abs(side) * .35);
        add({type:'drop', x:c.x + side * c.w * .55, y:sy + rnd(-6, 10), vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:2600, drag:.995, size:rnd(1.8, 4.5), max:rnd(1.1, 1.8), color:Math.random() < .3 ? '#ffffff' : '#c9f3ff'});
      }
      for (let i = 0; i < N(40); i++){
        const a = rnd(-Math.PI, 0), v = rnd(200, 700);
        add({type:'glow', spr:'glowA', x:c.x + rnd(-c.w * .4, c.w * .4), y:sy, vx:Math.cos(a) * v, vy:Math.sin(a) * v, drag:.9, size:rnd(8, 18), max:rnd(.4, .8), blend:'lighter', shrink:true});
      }
      add({type:'ring', x:c.x, y:sy, r:c.w * .3, vrad:1500, rdrag:.88, squash:.25, lw:5, color:'#ffffff', max:.8, blend:'lighter'});
      WT.amp = 46;
      tween(WT, 'level', 0, 520, E.inCubic).then(() => { WT.on = false; });
      tween(WT, 'amp', 12, 520, E.outQuad);
    }
    // rain of droplets settles, rings spread where they land
    for (let i = 0; i < N(26); i++){
      const x = rnd(W * .05, W * .95), y = rnd(H * .55, H * .9);
      add({type:'ring', x, y, r:2, vrad:rnd(160, 260), rdrag:.95, squash:.3, lw:1.6, color:'#d8f6ff', max:rnd(.6, 1), delay:rnd(0, .8), blend:'lighter'});
    }
    tween(dim, 'v', 0, 1200, E.inOutCubic);
  }

  /* ================= REN (kept): slash, with hit-stop and shake added ================= */
  const wa = (el, kf, opt) => el.animate(kf, Object.assign({fill:'forwards', easing:'ease-out'}, opt, reduce ? {duration:Math.min(opt.duration, 150)} : {})).finished.catch(()=>{});
  async function crimsonFx(){
    const c = center();
    wa($('halfA'), [{opacity:0, transform:'none'}, {opacity:1, transform:'none'}], {duration:280});
    wa($('halfB'), [{opacity:0, transform:'none'}, {opacity:1, transform:'none'}], {duration:280});
    for (let i = 0; i < N(220); i++){
      const ang = rnd(0, Math.PI * 2), d = Math.max(W, H) * rnd(.6, .9), sp = rnd(1500, 2700);
      add({type:'streak', x:c.x + Math.cos(ang) * d, y:c.y + Math.sin(ang) * d, vx:-Math.cos(ang) * sp, vy:-Math.sin(ang) * sp,
        ang:ang + Math.PI, len:rnd(60, 180), size:rnd(1, 2.6), color:Math.random() < .25 ? '#fff' : '#ff3b4f', max:d / sp * .8, delay:rnd(0, .55), blend:'lighter'});
    }
    await wt(800);
    const slash = $('slash');
    slash.style.opacity = 1;
    await wa(slash, [{transform:'rotate(-13.5deg) scaleX(0)'}, {transform:'rotate(-13.5deg) scaleX(1)'}], {duration:160, easing:'cubic-bezier(.7,0,.3,1)'});
    hitstop(90); addTrauma(.7); whitePop(.6);
    await wt(10);
    wa($('halfA'), [{opacity:1, transform:'none'}, {opacity:1, transform:'translate(-6%,-70%)'}], {duration:620, easing:'cubic-bezier(.6,0,.2,1)'});
    wa($('halfB'), [{opacity:1, transform:'none'}, {opacity:1, transform:'translate(6%,70%)'}], {duration:620, easing:'cubic-bezier(.6,0,.2,1)'});
    wa(slash, [{opacity:1}, {opacity:0}], {duration:300});
    for (let i = 0; i < N(70); i++){
      const a = rnd(0, Math.PI * 2), v = rnd(250, 800);
      add({type:'ember', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v - 120, ay:180, drag:.975, size:rnd(1.4, 3), color:Math.random() < .3 ? '#ffd0c4' : '#ff3b4f', max:rnd(.8, 1.5), blend:'lighter'});
    }
    for (let i = 0; i < N(26); i++){
      const a = rnd(0, Math.PI * 2), v = rnd(300, 700);
      add({type:'feather', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:400, drag:.96, size:rnd(9, 18), rot:rnd(0, 6), vr:rnd(-8, 8), flipv:rnd(4, 8), color:'#0d0a0e', vein:'#3a2a30', max:rnd(1.2, 1.7)});
    }
    // the card spins in from close to the lens, then lands with weight
    B.ry = 0; B.s = 2.4; B.vs = 0; B.vry = 2400;
    wa($('slot'), [{filter:'blur(10px)'}, {filter:'blur(0px)'}], {duration:480});
    let done = false;
    await new Promise(res => {
      B.ctrl = dt => {
        spring('s', 1, 260, 20, dt);
        if (!done){ B.ry += B.vry * dt; B.vry *= Math.pow(.93, dt * 60); if (B.ry >= 540){ B.ry = 180; done = true; addTrauma(.35); B.sx = 1.08; B.sy = .9; res(); } }
        else settle(dt, 180);
      };
    });
  }

  /* ================= flow ================= */
  let mode = 'rand', bag = [], runId = 0;
  document.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.m; document.querySelectorAll('.chips button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  function pick(){ if (mode !== 'rand') return mode; if (!bag.length) bag = ['c1','c2','c3'].sort(() => Math.random() - .5); return bag.pop(); }

  async function showBanner(ch, id){
    const b = $('banner');
    $('b-rar').textContent = ch.rar; $('b-ep').textContent = ch.ep; $('b-nm').textContent = ch.nm;
    b.style.setProperty('--bc', ch.glow);
    await wa(b, [{opacity:0, transform:'translateX(-30px)'}, {opacity:1, transform:'none'}], {duration:420, easing:'cubic-bezier(.2,.8,.2,1)'});
    await wt(1300);
    if (id !== runId) return;
    wa(b, [{opacity:1}, {opacity:0}], {duration:500});
  }

  function reset(){
    runId++; revealed = false;
    [...document.querySelectorAll('.pane, #banner'), $('slot'), flipEl].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    ['flash','dim','rays','flare','pillar'].forEach(id => $(id).style.opacity = 0);
    $('slash').style.opacity = ''; $('slot').style.filter = '';
    tweens.length = 0; parts = []; WT.on = false; WT.level = 0;
    Object.assign(B, {on:true, x:0, y:0, vx:0, vy:0, ry:0, vry:0, rz:0, vrz:0, s:1, vs:0, sx:1, vsx:0, sy:1, vsy:0, restRy:0});
    B.ctrl = dt => settle(dt, 0);
    ['c1','c2','c3'].forEach(id => $(id).hidden = true);
  }

  const pullBtn = $('pull');
  pullBtn.addEventListener('click', async () => {
    pullBtn.disabled = true;
    document.querySelectorAll('.chips button').forEach(b => b.disabled = true);
    reset();
    const id = pick(), ch = CHARS[id], my = runId;
    $(id).hidden = false;
    activeCard = $(id).querySelector('.card'); tilt(0, 0, .3);
    await charge();
    await ch.fx();
    B.restRy = 180; B.ctrl = dt => settle(dt, 180);
    tween(op('pillar'), 'v', 0, 700, E.inOutCubic);
    revealed = true; lastMove = 0;
    showBanner(ch, my);
    pullBtn.textContent = 'もう一度引く';
    pullBtn.disabled = false;
    document.querySelectorAll('.chips button').forEach(b => b.disabled = false);
  });
})();
