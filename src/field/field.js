(() => {
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4;
  const N = n => reduce ? 0 : Math.round(n * (lowEnd ? .55 : 1));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleepReal = ms => new Promise(r => setTimeout(r, ms));

  const DATA = {
    c1:{name:'シロガネ', cost:8, power:8000, tribe:'光輪', theme:'light'},
    c2:{name:'レン', cost:6, power:7200, tribe:'紅蓮', theme:'crimson', haste:true},
    c3:{name:'ミナモ', cost:5, power:6500, tribe:'蒼空', theme:'water'},
    f1:{name:'炎上アカウント ZERO', cost:4, power:5000, tribe:'炎上', foe:true},
  };
  const MAXMANA = 12, START_LP = 20000;

  /* ============ world clock: hit-stop, shake, waits ============ */
  const S = { t:0, stopUntil:0, trauma:0 };
  const waiters = [];
  const hitstop = ms => { if (!reduce) S.stopUntil = performance.now() + ms; };
  const wt = ms => new Promise(r => waiters.push({at:S.t + (reduce ? Math.min(ms, 120) : ms) / 1000, r}));
  const addTrauma = x => { if (!reduce) S.trauma = Math.min(1, S.trauma + x); };
  const noise = (t, s) => Math.sin(t + s) * .5 + Math.sin(t * 2.3 + s * 1.7) * .3 + Math.sin(t * 4.1 + s * 2.9) * .2;
  function flashPop(peak){ $('flash').animate([{opacity:peak}, {opacity:0}], {duration:240, easing:'ease-out'}); }

  /* ============ particles ============ */
  const cv = $('fx'), ctx = cv.getContext('2d');
  let W = 0, H = 0, parts = [];
  function sizeCanvas(){ const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d,0,0,d,0,0); }
  function sprite(r, stops){ const c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d'); const gr = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c; }
  const SPR = {
    glowW: sprite(32, [[0,'#ffffffff'],[.2,'#fffbe8cc'],[.5,'#fff2c040'],[1,'#ffffff00']]),
    glowG: sprite(32, [[0,'#fff8e0ff'],[.25,'#f2cf7aaa'],[.6,'#f2cf7a30'],[1,'#f2cf7a00']]),
    glowA: sprite(32, [[0,'#ffffffff'],[.25,'#bdf0ffbb'],[.6,'#5cc8f033'],[1,'#5cc8f000']]),
    glowR: sprite(32, [[0,'#ffe0dcff'],[.25,'#ff3b4fbb'],[.6,'#ff3b4f33'],[1,'#ff3b4f00']]),
  };
  const add = p => parts.push(Object.assign({x:0,y:0,vx:0,vy:0,ax:0,ay:0,drag:1,life:0,max:1,size:4,rot:0,vr:0,alpha:1,delay:0}, p));
  function drawPart(p, k){
    ctx.globalAlpha = clamp(p.alpha * (p.fade === 'io' ? Math.sin(Math.PI * Math.min(1, k)) : 1 - k * k), 0, 1);
    ctx.globalCompositeOperation = p.blend || 'source-over';
    switch (p.type){
      case 'glow': { const s = p.size * (1 - k * .6); ctx.drawImage(SPR[p.spr], p.x - s, p.y - s, s * 2, s * 2); break; }
      case 'drop': { const sp = Math.hypot(p.vx, p.vy), len = Math.min(60, p.size + sp * .02), ux = p.vx / (sp || 1), uy = p.vy / (sp || 1);
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke(); break; }
      case 'ring': ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(.5, p.lw * (1 - k)); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * (p.squash || 1), 0, 0, Math.PI * 2); ctx.stroke(); break;
      case 'feather': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .55 + .45 * Math.abs(Math.cos(p.flip || 0)));
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.quadraticCurveTo(p.size * .55, -p.size * .2, 0, p.size); ctx.quadraticCurveTo(-p.size * .55, -p.size * .2, 0, -p.size); ctx.fill(); ctx.restore(); break; }
      case 'shard': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(-p.size, -p.size * .6); ctx.lineTo(p.size, -p.size * .2); ctx.lineTo(-p.size * .2, p.size); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'spark': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; const s = p.size * (1 - k * .5); ctx.beginPath();
        for (let i = 0; i < 8; i++){ const r = i % 2 ? s * .2 : s, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'bubble': { ctx.strokeStyle = '#d8f6ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.stroke(); ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(p.x - p.size * .35, p.y - p.size * .35, p.size * .22, 0, 7); ctx.fill(); break; }
    }
  }
  function updateParts(dt){
    for (const p of parts){
      if (p.delay > 0){ p.delay -= dt; continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag !== 1){ const f = Math.pow(p.drag, dt * 60); p.vx *= f; p.vy *= f; }
      if (p.vrad){ p.r += p.vrad * dt; p.vrad *= Math.pow(p.rdrag || .9, dt * 60); }
      if (p.sway) p.x += Math.sin((p.life + p.ph) * p.sway) * p.swayAmp;
      if (p.flipv) p.flip = (p.flip || 0) + p.flipv * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life += dt;
    }
    parts = parts.filter(p => p.life < p.max);
  }

  /* ============ layout ============ */
  const board = $('board');
  let CW = 120, CH = 168, SW = 90;
  function layout(){
    sizeCanvas();
    const bw = board.clientWidth - 32;
    CW = Math.round(clamp(Math.min(innerWidth * .27, innerHeight * .155), 84, 150)); CH = CW * 88 / 63;
    SW = Math.round(clamp(Math.min((bw - 40) / 3.3, innerHeight * .118), 60, 128));
    document.documentElement.style.setProperty('--cw', CW + 'px');
    board.style.setProperty('--slotW', SW + 'px');
    board.style.setProperty('--handH', Math.round(CH * .62 + 6) + 'px');
    units.forEach(u => u.el.style.width = CW + 'px');
    retarget();
  }

  /* ============ units ============ */
  const units = [...document.querySelectorAll('.unit')].map(el => ({
    id:el.dataset.id, el, d:DATA[el.dataset.id], card:el.querySelector('.card'),
    zone:'hand', slot:null, x:innerWidth / 2, y:innerHeight + 200, rot:0, s:1, vx:0, vy:0, vrot:0, vs:0,
    tx:0, ty:0, trot:0, ts:1, sx:1, sy:1, vsx:0, vsy:0, k:220, c:22, ctrl:null, z:1, canAttack:false, rested:false,
  }));
  const U = id => units.find(u => u.id === id);
  const ro = new ResizeObserver(es => es.forEach(e => e.target.style.setProperty('--w', e.contentRect.width + 'px')));
  document.querySelectorAll('.card-inner, .foe .card').forEach(n => ro.observe(n));

  let hovered = null, dragging = null, mode = 'idle', busy = false;
  const hand = () => units.filter(u => u.zone === 'hand');
  const slotEl = s => document.querySelector(`.slot[data-slot="${s}"]`);
  function slotCenter(s){ const r = slotEl(s).getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2, w:r.width}; }

  function retarget(){
    const hs = hand(), n = hs.length, cx = board.getBoundingClientRect().left + board.clientWidth / 2;
    const spread = Math.min(CW * .8, (Math.min(board.clientWidth, innerWidth) - CW - 40) / Math.max(1, n - 1));
    hs.forEach((u, i) => {
      const o = i - (n - 1) / 2;
      let x = cx + o * spread, y = innerHeight - CH * .36 + o * o * 7, rot = o * 6, s = 1;
      if (hovered && hovered !== u && hovered.zone === 'hand'){ const hi = hs.indexOf(hovered); x += (i < hi ? -1 : 1) * CW * .18; }
      if (u === hovered){ y = innerHeight - CH * .62; rot = 0; s = 1.14; }
      if (u !== dragging) Object.assign(u, {tx:x, ty:y, trot:rot, ts:s});
      u.z = u === hovered ? 40 : 10 + i;
    });
    units.filter(u => u.zone === 'field').forEach(u => { const c = slotCenter(u.slot); Object.assign(u, {tx:c.x, ty:c.y, trot:0, ts:c.w / CW}); u.z = 5; });
  }

  function springU(u, dt){
    const f = (key, vkey, tgt, k, c) => { const a = -k * (u[key] - tgt) - c * u[vkey]; u[vkey] += a * dt; u[key] += u[vkey] * dt; };
    f('x', 'vx', u.tx, u.k, u.c); f('y', 'vy', u.ty, u.k, u.c);
    f('rot', 'vrot', u.trot + clamp(u.vx * .012, -16, 16) * (u === dragging ? 1 : .35), 260, 24);
    f('s', 'vs', u.ts, 260, 22); f('sx', 'vsx', 1, 340, 16); f('sy', 'vsy', 1, 340, 16);
  }
  function applyU(u){
    u.el.style.transform = `translate(${(u.x - CW / 2).toFixed(1)}px,${(u.y - CH / 2).toFixed(1)}px) rotate(${u.rot.toFixed(2)}deg) scale(${(u.s * u.sx).toFixed(4)},${(u.s * u.sy).toFixed(4)})`;
    u.el.style.zIndex = u.z;
    u.el.style.display = u.zone === 'gone' ? 'none' : '';
  }

  /* ============ main loop ============ */
  const world = $('world'), cardsLayer = $('cards');
  let last = performance.now();
  function loop(now){
    let dt = Math.min(.034, (now - last) / 1000); last = now;
    if (now < S.stopUntil) dt = 0;
    if (dt > 0){
      S.t += dt;
      for (let i = waiters.length - 1; i >= 0; i--) if (S.t >= waiters[i].at){ waiters[i].r(); waiters.splice(i, 1); }
      units.forEach(u => { if (u.zone === 'gone') return; u.ctrl ? u.ctrl(dt) : springU(u, dt); });
      updateParts(dt);
      S.trauma = Math.max(0, S.trauma - dt * 1.3);
    }
    units.forEach(applyU);
    const sh = S.trauma * S.trauma;
    const tf = sh > .0004 ? `translate(${(18 * sh * noise(S.t * 30, 1)).toFixed(2)}px,${(18 * sh * noise(S.t * 30, 5)).toFixed(2)}px) rotate(${(1.6 * sh * noise(S.t * 30, 9)).toFixed(3)}deg)` : '';
    world.style.transform = tf; cardsLayer.style.transform = tf;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) if (!(p.delay > 0)) drawPart(p, p.life / p.max);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(loop);
  }

  /* ============ card surface tilt (holo follows the pointer) ============ */
  function tiltCard(card, nx, ny, g){
    const s = card.style; nx = clamp(nx, -1, 1); ny = clamp(ny, -1, 1);
    s.setProperty('--nx', nx.toFixed(3)); s.setProperty('--ny', ny.toFixed(3));
    s.setProperty('--ry', (nx * 14).toFixed(2) + 'deg'); s.setProperty('--rx', (-ny * 11).toFixed(2) + 'deg');
    s.setProperty('--mx', (50 + nx * 50).toFixed(1) + '%'); s.setProperty('--my', (50 + ny * 50).toFixed(1) + '%');
    s.setProperty('--g', g.toFixed(2));
  }
  units.forEach(u => tiltCard(u.card, -.3, -.3, .3));

  /* ============ HUD ============ */
  const st = { mana:MAXMANA, eLP:START_LP, pLP:START_LP, eHand:4, eTrash:0, turn:1 };
  function hud(){
    $('manaTxt').textContent = `${st.mana} / ${MAXMANA}`;
    $('gems').innerHTML = Array.from({length:MAXMANA}, (_, i) => `<i class="${i >= st.mana ? 'used' : ''}"></i>`).join('');
    $('eTrash').textContent = st.eTrash;
    $('ehand').innerHTML = Array.from({length:st.eHand}, () => '<span class="bk"></span>').join('');
    $('turnLabel').textContent = `YOUR TURN · ${st.turn}`;
  }
  function countTo(el, from, to, ms = 700){
    const t0 = performance.now();
    (function f(n){ const k = Math.min(1, (n - t0) / ms); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0);
  }
  let toastAnim = null;
  function toast(msg, ms = 1800){
    const t = $('toast'); t.textContent = msg;
    toastAnim && toastAnim.cancel();
    toastAnim = t.animate([{opacity:0, transform:'translateY(8px)'}, {opacity:1, transform:'none', offset:.12}, {opacity:1, offset:.85}, {opacity:0}], {duration:ms, fill:'forwards'});
  }
  function dmgPop(x, y, text){
    const d = document.createElement('div'); d.className = 'dmg'; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d);
    d.animate([{transform:'scale(2.2)', opacity:0}, {transform:'scale(1)', opacity:1, offset:.18}, {transform:'translateY(-10px)', opacity:1, offset:.7}, {transform:'translateY(-40px)', opacity:0}], {duration:1100, easing:'cubic-bezier(.2,.8,.2,1)'}).finished.then(() => d.remove());
  }

  /* ============ play effects ============ */
  function impactBase(u, power){
    hitstop(70); addTrauma(power); u.sx = 1.13; u.sy = .87; u.vsx = u.vsy = 0;
  }
  async function playLand(u, slot){
    const c = slotCenter(slot);
    const theme = u.d.theme;
    u.zone = 'field'; u.slot = slot; retarget();
    if (theme === 'light'){
      // falls like a weight from above the slot
      u.x = c.x; u.y = c.y - innerHeight * .55; u.vy = 0; u.rot = 0; u.s = c.w / CW; u.trot = 0;
      let landed = false;
      await new Promise(res => { u.ctrl = dt => { if (!landed){ u.vy += 5200 * dt; u.y += u.vy * dt; u.x += (c.x - u.x) * .3;
        const stv = clamp(u.vy / 5000, 0, .16); u.sy = 1 + stv; u.sx = 1 - stv * .5;
        if (u.y >= c.y){ u.y = c.y; landed = true; u.vy = 0; res(); } } else springU(u, dt); }; });
      impactBase(u, .5); flashPop(.35);
      add({type:'ring', x:c.x, y:c.y + c.w * .65, r:10, vrad:1300, rdrag:.86, squash:.25, lw:7, color:'#fff6dc', max:.6, blend:'lighter'});
      for (let i = 0; i < N(40); i++){ const dir = Math.random() < .5 ? -1 : 1; add({type:'glow', spr:Math.random() < .5 ? 'glowW' : 'glowG', x:c.x + dir * rnd(0, c.w * .5), y:c.y + c.w * .65, vx:dir * rnd(300, 1000), vy:-rnd(20, 160), drag:.88, size:rnd(4, 10), max:rnd(.6, 1.1), blend:'lighter'}); }
      for (let i = 0; i < N(14); i++){ const a = rnd(-Math.PI * .9, -Math.PI * .1), v = rnd(400, 900); add({type:'feather', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:120, drag:.9, size:rnd(6, 11), rot:rnd(0, 6), vr:rnd(-4, 4), flipv:rnd(3, 6), sway:2.5, swayAmp:.5, ph:rnd(0, 6), color:'#ffffff', max:rnd(1.6, 2.4)}); }
    } else if (theme === 'crimson'){
      // dashes in, overshoots, embers fly off the stop
      u.k = 900; u.c = 26; u.vrot = -900;
      await wt(170);
      impactBase(u, .55); flashPop(.25);
      add({type:'ring', x:c.x, y:c.y, r:c.w * .3, vrad:1100, rdrag:.86, lw:5, color:'#ff3b4f', max:.5, blend:'lighter'});
      for (let i = 0; i < N(45); i++){ const a = rnd(0, Math.PI * 2), v = rnd(250, 700); add({type:'glow', spr:'glowR', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v - 80, ay:200, drag:.96, size:rnd(3, 7), max:rnd(.6, 1.2), blend:'lighter'}); }
      for (let i = 0; i < N(10); i++){ const a = rnd(0, Math.PI * 2), v = rnd(300, 600); add({type:'feather', x:c.x, y:c.y, vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:400, drag:.95, size:rnd(7, 12), rot:rnd(0, 6), vr:rnd(-7, 7), flipv:6, color:'#0d0a0e', max:rnd(.9, 1.3)}); }
      u.k = 220; u.c = 22;
    } else {
      // dives into the slot like into water: splash, bubbles, ripple
      u.k = 320; u.c = 18;
      await wt(200);
      impactBase(u, .32);
      add({type:'ring', x:c.x, y:c.y + c.w * .3, r:c.w * .3, vrad:900, rdrag:.88, squash:.32, lw:4, color:'#d8f6ff', max:.7, blend:'lighter'});
      for (let i = 0; i < N(60); i++){ const side = rnd(-1, 1), a = -Math.PI / 2 + side * rnd(.2, 1), v = rnd(350, 1000); add({type:'drop', x:c.x + side * c.w * .5, y:c.y + c.w * .3, vx:Math.cos(a) * v, vy:Math.sin(a) * v, ay:2400, size:rnd(1.5, 3.4), color:Math.random() < .3 ? '#ffffff' : '#c9f3ff', max:rnd(.7, 1.1)}); }
      for (let i = 0; i < N(18); i++) add({type:'bubble', x:c.x + rnd(-c.w * .5, c.w * .5), y:c.y + rnd(-c.w * .4, c.w * .6), vy:-rnd(40, 90), ay:-rnd(120, 220), size:rnd(2, 6), sway:6, swayAmp:.5, ph:rnd(0, 6), max:rnd(1, 1.6)});
      u.k = 220; u.c = 22;
    }
    u.ctrl = null;
    await wt(160);
  }

  async function tryPlay(u, slot){
    const cost = u.d.cost - (u.d.tribe === '光輪' ? units.filter(x => x !== u && x.zone === 'field' && x.d.tribe === '光輪').length : 0);
    if (cost > st.mana){
      toast(`話題力が足りません（必要 ${cost}・残り ${st.mana}）`);
      u.el.animate([{translate:'0 0'}, {translate:'-8px 0'}, {translate:'8px 0'}, {translate:'-5px 0'}, {translate:'0 0'}], {duration:280});
      retarget(); return;
    }
    busy = true;
    st.mana -= cost; hud();
    tiltCard(u.card, 0, -.2, .35);
    await playLand(u, slot);
    if (u.d.haste){ u.canAttack = true; u.el.classList.add('can-attack'); toast('速攻：このターンから攻撃できる'); }
    if (u.id === 'c3'){ toast('山札の上から3枚を確認…〈蒼空〉カードはなかった。山札の下に戻した', 2600); }
    busy = false;
  }

  /* ============ battle ============ */
  function enemyTargets(){ const t = []; const f = U('f1'); if (f.zone === 'field') t.push(f); return t; }
  function setTargetMode(on, attacker){
    mode = on ? 'target' : 'idle'; targetAttacker = on ? attacker : null;
    enemyTargets().forEach(f => f.el.classList.toggle('targetable', on));
    $('eLeader').classList.toggle('targetable', on);
    $('hint').textContent = on ? '攻撃先を選んでください（ほかの場所をタップで取り消し）' : 'カードをドラッグして場に出す ・ タップで詳細';
  }
  let targetAttacker = null;

  async function attack(a, target){
    busy = true; setTargetMode(false);
    const tgtPos = target === 'leader' ? (() => { const r = $(a.d.foe ? 'pLP' : 'eLeader').closest('.leader').getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2}; })() : {x:target.x, y:target.y};
    const home = {x:a.tx, y:a.ty};
    const dir = Math.sign(tgtPos.y - home.y) || -1;
    // wind-up: pull back and swell
    a.ctrl = dt => { a.tx = home.x; a.ty = home.y - dir * 26; a.ts = (SW / CW) * 1.12; a.k = 300; a.c = 24; springU(a, dt); };
    a.z = 60;
    await wt(220);
    // dash
    a.ctrl = dt => { a.tx = tgtPos.x; a.ty = tgtPos.y - dir * 20; a.k = 1500; a.c = 40; springU(a, dt); };
    await new Promise(res => { const chk = () => (Math.hypot(a.x - a.tx, a.y - a.ty) < 26 ? res() : requestAnimationFrame(chk)); chk(); });
    hitstop(95); addTrauma(.7); flashPop(.3);
    const ix = tgtPos.x, iy = tgtPos.y;
    const col = a.d.theme === 'crimson' ? 'glowR' : a.d.theme === 'water' ? 'glowA' : 'glowG';
    for (let i = 0; i < N(50); i++){ const an = rnd(0, Math.PI * 2), v = rnd(300, 1200); add({type:'glow', spr:col, x:ix, y:iy, vx:Math.cos(an) * v, vy:Math.sin(an) * v, drag:.88, size:rnd(4, 11), max:rnd(.4, .9), blend:'lighter'}); }
    add({type:'ring', x:ix, y:iy, r:20, vrad:1400, rdrag:.86, lw:6, color:'#ffffff', max:.5, blend:'lighter'});
    a.sx = .86; a.sy = 1.12;
    let msg = '';
    if (target === 'leader'){
      const key = a.d.foe ? 'pLP' : 'eLP';
      const from = st[key]; st[key] = Math.max(0, from - a.d.power);
      dmgPop(ix, iy - 30, '-' + a.d.power);
      countTo($(key), from, st[key]);
      $(key).closest('.leader').animate([{translate:'0 0'}, {translate:'-10px 4px'}, {translate:'8px -3px'}, {translate:'-4px 2px'}, {translate:'0 0'}], {duration:360});
    } else {
      dmgPop(ix, iy - 30, a.d.power + ' vs ' + target.d.power);
      if (a.d.power >= target.d.power) await destroy(target);
      if (target.d.power >= a.d.power) await destroy(a);
    }
    await wt(140);
    if (a.zone === 'field'){
      a.ctrl = null; a.k = 220; a.c = 22; retarget();
      a.canAttack = false; a.rested = true; a.el.classList.remove('can-attack'); a.el.classList.add('rested');
    }
    // Ren: on attack, the opponent discards a card
    if (a.id === 'c2' && st.eHand > 0){ await discardEnemy(); msg = '相手の手札を1枚捨てさせた'; }
    if (msg) toast(msg);
    if (st.eLP <= 0) toast('勝利！ 相手のフォロワーが0になった', 3200);
    if (st.pLP <= 0) toast('敗北… あなたのフォロワーが0になった', 3200);
    busy = false;
  }
  async function destroy(u){
    const c = {x:u.x, y:u.y};
    hitstop(60); addTrauma(.4);
    const colors = u.d.foe ? ['#ff5a6a', '#4a1620', '#ffb0b8', '#12070b'] : ['#ffffff', '#c9d3e6', '#8fd8ff'];
    for (let i = 0; i < N(46); i++){ const an = rnd(0, Math.PI * 2), v = rnd(200, 900); add({type:'shard', x:c.x + rnd(-CW * .3, CW * .3) * (SW / CW), y:c.y + rnd(-CH * .3, CH * .3) * (SW / CW), vx:Math.cos(an) * v, vy:Math.sin(an) * v - 150, ay:1600, drag:.97, size:rnd(4, 10), rot:rnd(0, 6), vr:rnd(-12, 12), color:colors[i % colors.length], max:rnd(.8, 1.3)}); }
    await u.el.animate([{opacity:1, filter:'brightness(1)'}, {opacity:1, filter:'brightness(3)', offset:.2}, {opacity:0, filter:'brightness(3)'}], {duration:280}).finished;
    u.zone = 'gone';
    if (u.d.foe) { st.eTrash++; hud(); }
    retarget();
  }
  async function discardEnemy(){
    const bks = $('ehand').querySelectorAll('.bk'); const b = bks[bks.length - 1]; if (!b) return;
    const r = b.getBoundingClientRect(), t = $('eTrash').getBoundingClientRect();
    const fly = b.cloneNode(); fly.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; margin:0; z-index:8`;
    document.body.appendChild(fly); b.style.visibility = 'hidden';
    await fly.animate([{transform:'none'}, {transform:`translate(${(t.left - r.left) * .5}px, ${t.top - r.top + 40}px) rotate(200deg) scale(1.6)`, offset:.5}, {transform:`translate(${t.left - r.left + 5}px, ${t.top - r.top + 6}px) rotate(380deg) scale(1)`}], {duration:620, easing:'cubic-bezier(.3,.7,.3,1)'}).finished;
    fly.remove(); st.eHand--; st.eTrash++; hud();
    $('eTrash').animate([{transform:'scale(1.3)'}, {transform:'scale(1)'}], {duration:300});
  }

  /* ============ turn flow ============ */
  async function endTurn(){
    if (busy) return; busy = true; setTargetMode(false);
    $('turnLabel').textContent = `OPPONENT · ${st.turn}`;
    toast('相手のターン');
    await sleepReal(900);
    const f = U('f1');
    if (f.zone === 'field'){ busy = false; await attack(f, 'leader'); busy = true; f.el.classList.remove('rested'); f.rested = false; }
    await sleepReal(700);
    st.turn++; st.mana = MAXMANA; hud();
    units.filter(u => u.zone === 'field' && !u.d.foe).forEach(u => { u.canAttack = true; u.rested = false; u.el.classList.remove('rested'); u.el.classList.add('can-attack'); });
    toast(`あなたのターン ${st.turn}：話題力が回復した`);
    busy = false;
  }
  function reset(){
    setTargetMode(false); closeModal(); parts = [];
    Object.assign(st, {mana:MAXMANA, eLP:START_LP, pLP:START_LP, eHand:4, eTrash:0, turn:1});
    $('eLP').textContent = START_LP; $('pLP').textContent = START_LP;
    units.forEach((u, i) => {
      u.el.classList.remove('rested', 'can-attack', 'targetable'); u.el.style.opacity = ''; u.el.getAnimations().forEach(a => a.cancel());
      Object.assign(u, {zone:'hand', slot:null, canAttack:false, rested:false, ctrl:null, k:220, c:22, x:innerWidth / 2 + (i - 1) * 40, y:innerHeight + CH, vx:0, vy:0, s:1, sx:1, sy:1});
    });
    const f = U('f1'); f.zone = 'field'; f.slot = 'e1';
    hud(); retarget();
  }
  $('endBtn').addEventListener('click', endTurn);
  $('resetBtn').addEventListener('click', () => { if (!busy) reset(); });

  /* ============ input ============ */
  let down = null;
  units.forEach(u => {
    u.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && u.zone === 'hand' && !dragging && !busy){ hovered = u; retarget(); } });
    u.el.addEventListener('pointerleave', e => { if (hovered === u && !dragging){ hovered = null; retarget(); tiltCard(u.card, -.3, -.3, .3); } });
    u.el.addEventListener('pointermove', e => {
      if (dragging || u.zone !== 'hand' || hovered !== u) return;
      const r = u.el.getBoundingClientRect(); tiltCard(u.card, ((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, .8);
    });
    u.el.addEventListener('pointerdown', e => {
      if (busy || !$('modal').hidden) return;
      e.preventDefault();
      down = {u, x:e.clientX, y:e.clientY, id:e.pointerId, moved:false};
      u.el.setPointerCapture(e.pointerId);
    });
    u.el.addEventListener('pointermove', e => {
      if (!down || down.u !== u || down.id !== e.pointerId) return;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7 && u.zone === 'hand' && mode === 'idle'){
        down.moved = true; dragging = u; hovered = null; u.el.classList.add('dragging'); u.z = 80; u.k = 900; u.c = 42;
        document.querySelectorAll('#pField .slot').forEach(s => { if (!units.some(x => x.zone === 'field' && x.slot === s.dataset.slot)) s.classList.add('hot'); });
        retarget();
      }
      if (dragging === u){
        u.tx = e.clientX; u.ty = e.clientY - CH * .25; u.ts = 1.06; u.trot = 0;
        const r = u.el.getBoundingClientRect(); tiltCard(u.card, clamp(u.vx / 900, -1, 1), clamp(u.vy / 900, -1, 1), .9);
        document.querySelectorAll('.slot.hot').forEach(s => { const sr = s.getBoundingClientRect(); s.classList.toggle('over', e.clientX > sr.left - 20 && e.clientX < sr.right + 20 && e.clientY > sr.top - 30 && e.clientY < sr.bottom + 30); });
      }
    });
    const up = e => {
      if (!down || down.u !== u) return;
      const wasDrag = down.moved; down = null;
      if (wasDrag){
        dragging = null; u.el.classList.remove('dragging'); u.k = 220; u.c = 22;
        const over = document.querySelector('.slot.hot.over');
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('hot', 'over'));
        tiltCard(u.card, -.3, -.3, .3);
        if (over) tryPlay(u, over.dataset.slot); else retarget();
        return;
      }
      // tap
      if (mode === 'target'){ if (u.d.foe && u.zone === 'field') attack(targetAttacker, u); else setTargetMode(false); return; }
      if (u.zone === 'field' && !u.d.foe && u.canAttack){ setTargetMode(true, u); return; }
      openModal(u);
    };
    u.el.addEventListener('pointerup', up);
    u.el.addEventListener('pointercancel', up);
  });
  $('eLeader').addEventListener('click', () => { if (mode === 'target' && targetAttacker) attack(targetAttacker, 'leader'); });
  document.addEventListener('pointerdown', e => { if (mode === 'target' && !e.target.closest('.unit') && !e.target.closest('#eLeader')) setTargetMode(false); });

  /* ============ detail modal ============ */
  let modalCard = null, modalMove = 0;
  function openModal(u){
    const m = $('modal'), mc = $('mc');
    const cls = u.el.firstElementChild.className;
    mc.innerHTML = `<div class="${cls}"><div class="card">${u.card.innerHTML}</div></div>`;
    modalCard = mc.querySelector('.card');
    const inner = mc.querySelector('.card-inner') || modalCard; ro.observe(inner);
    m.hidden = false; hovered = null; retarget();
    mc.animate([{transform:'scale(.6) translateY(40px)', opacity:0}, {transform:'none', opacity:1}], {duration:380, easing:'cubic-bezier(.2,.9,.25,1.15)'});
    $('closeModal').focus();
  }
  function closeModal(){ $('modal').hidden = true; modalCard = null; }
  $('closeModal').addEventListener('click', closeModal);
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); setTargetMode(false); } });
  $('modal').addEventListener('pointermove', e => {
    if (!modalCard) return; const r = modalCard.getBoundingClientRect(); modalMove = performance.now();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1; tiltCard(modalCard, nx, ny, Math.min(1, Math.hypot(nx, ny)));
  });
  (function idle(t){ if (modalCard && t - modalMove > 2000 && !reduce){ const s = t / 1000; tiltCard(modalCard, Math.sin(s * .8) * .5, Math.sin(s * 1.1 + 1) * .35, .45 + Math.sin(s) * .25); } requestAnimationFrame(idle); })(0);

  /* ============ boot ============ */
  addEventListener('resize', layout);
  reset(); layout();
  // deal the opening hand with a little stagger
  units.filter(u => u.zone === 'hand').forEach((u, i) => { u.x = innerWidth / 2; u.y = innerHeight + CH; u.k = 0; setTimeout(() => { u.k = 220; }, 150 + i * 140); });
  requestAnimationFrame(loop);
})();
