/* Uygulama: sahne, kamera, arayüz, grafikler, ses. */
(function () {
  'use strict';
  const T = THREE, EP = EngineParams, G = EP.G, DEG = EP.DEG, mod = EP.mod, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const canvas = $('c');

  // ------------------------------------------------------------ renderer / sahne
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: qs.has('shot') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  const scene = new T.Scene(); scene.background = new T.Color(0x0c1117);
  scene.fog = new T.Fog(0x0c1117, 380, 760);
  const camera = new T.PerspectiveCamera(38, 1, 2, 1600);

  // ortam haritası (procedural stüdyo)
  (function () {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#9db3cc'); g.addColorStop(0.45, '#4a5666'); g.addColorStop(0.5, '#2a323d'); g.addColorStop(1, '#0d1116');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    x.filter = 'blur(10px)';
    for (const [px, py, w, h, a] of [[140, 90, 220, 70, 1], [520, 60, 300, 50, .9], [820, 110, 160, 90, .8], [330, 200, 120, 40, .6], [960, 40, 90, 60, .7]]) { x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(px, py, w, h); }
    const tex = new T.CanvasTexture(c); tex.mapping = T.EquirectangularReflectionMapping; tex.encoding = T.sRGBEncoding;
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose();
  })();
  scene.add(new T.HemisphereLight(0xcfe0ff, 0x1a1f26, 0.45));
  const key = new T.DirectionalLight(0xfff2e0, 1.15); key.position.set(90, 160, 140); scene.add(key);
  const fill = new T.DirectionalLight(0x9ab8ff, 0.45); fill.position.set(-120, 60, -80); scene.add(fill);
  const rim = new T.DirectionalLight(0xffffff, 0.35); rim.position.set(0, -50, 120); scene.add(rim);

  // zemin
  (function () {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const sh = new T.Mesh(new T.PlaneGeometry(300, 120), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, -34.9, 0); scene.add(sh);
    const grid = new T.GridHelper(1200, 60, 0x2a3442, 0x1a222c); grid.position.y = -35; grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
  })();

  // ------------------------------------------------------------ motor
  const engine = EngineModel.build(scene);
  const X0 = EngineModel.constants.X0;

  // ------------------------------------------------------------ kamera (özel orbit)
  const orbit = { target: new T.Vector3(-8, 26, 0), r: 215, th: 0.42, ph: 1.28, vth: 0, vph: 0, auto: false, tween: null };
  function applyCam() {
    const s = Math.sin(orbit.ph), p = orbit.target;
    camera.position.set(p.x + orbit.r * s * Math.sin(orbit.th), p.y + orbit.r * Math.cos(orbit.ph), p.z + orbit.r * s * Math.cos(orbit.th));
    camera.lookAt(p);
  }
  const ptrs = new Map(); let dragMoved = 0, lastPinch = 0, lastMid = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }); dragMoved = 0; orbit.tween = null; canvas.focus(); });
  canvas.addEventListener('pointerup', e => {
    const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); lastPinch = 0; lastMid = null;
    if (was && dragMoved < 5) onClick(e);
  });
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); });
  function pan(dx, dy) {
    const k = orbit.r * Math.tan(camera.fov * DEG / 2) * 2 / canvas.clientHeight;
    const right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrix, 1);
    orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; dragMoved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) {
      if (p.b === 2 || p.shift || e.shiftKey || p.b === 1) pan(dx, dy);
      else { orbit.th -= dx * 0.006; orbit.ph = Math.min(Math.PI - 0.05, Math.max(0.05, orbit.ph - dy * 0.006)); }
      hideTip();
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinch) orbit.r = Math.min(700, Math.max(18, orbit.r * lastPinch / d));
      if (lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
      lastPinch = d; lastMid = mid;
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); orbit.r = Math.min(700, Math.max(18, orbit.r * Math.exp(e.deltaY * 0.0012))); orbit.tween = null; }, { passive: false });
  canvas.addEventListener('pointerleave', hideTip);
  function flyTo(v, dur = 900) {
    const from = { t: orbit.target.clone(), r: orbit.r, th: orbit.th, ph: orbit.ph };
    let dth = (v.th !== undefined ? v.th : orbit.th) - orbit.th; dth = ((dth + Math.PI) % TAU + TAU) % TAU - Math.PI;
    orbit.tween = { t0: performance.now(), dur, from, to: { t: v.t ? new T.Vector3(...v.t) : orbit.target.clone(), r: v.r !== undefined ? v.r : orbit.r, dth, ph: v.ph !== undefined ? v.ph : orbit.ph } };
  }
  const VIEWS = {
    'Genel': { t: [-8, 26, 0], r: 215, th: 0.42, ph: 1.28 }, 'Yan (kesit)': { t: [0, 26, 0], r: 215, th: 0, ph: 1.5708 }, 'Ön': { t: [-20, 24, 0], r: 230, th: -1.35, ph: 1.3 }, 'Arka': { t: [30, 24, 0], r: 230, th: 1.45, ph: 1.3 },
    'Üst': { t: [0, 40, 0], r: 230, th: 0.1, ph: 0.2 }, 'Silindir': { t: [X0(2), 28, 0], r: 78, th: 0.25, ph: 1.4 }, 'Üst takım': { t: [0, 62, 0], r: 105, th: 0.2, ph: 1.15 }, 'Turbo': { t: [-62, 44, -34], r: 85, th: -0.9, ph: 1.2 }, 'Dişliler': { t: [52, 32, 0], r: 120, th: 1.5, ph: 1.4 },
  };
  Object.keys(VIEWS).forEach(n => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => flyTo(VIEWS[n]); $('cams').appendChild(b); });

  // ------------------------------------------------------------ durum
  const S = { flowsOn: true, theta: 0, running: true, rpm: 1200, slow: 1 / 30, load: 1, selCyl: 0, auto: false, explode: 0 };
  engine.setLoad(1);

  // ------------------------------------------------------------ arayüz
  const fmt = (v, d = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  function bindRange(id, valId, f, cb) { const el = $(id); const upd = () => { $(valId).textContent = f(+el.value); cb(+el.value); }; el.addEventListener('input', upd); upd(); return el; }
  bindRange('rpm', 'rpmV', v => fmt(v) + ' d/d', v => { S.rpm = v; updateEstimates(); });
  bindRange('load', 'loadV', v => '%' + v, v => { S.load = v / 100; engine.setLoad(S.load); updateEstimates(); });
  $('slow').addEventListener('change', e => { S.slow = +e.target.value; });
  $('slow').value = '0.0333';
  const angEl = $('ang'); angEl.addEventListener('input', () => { S.theta = +angEl.value; S.running = false; syncPlay(); });
  function syncPlay() { $('play').textContent = S.running ? '⏸ Durdur' : '▶ Çalıştır'; }
  $('play').onclick = () => { S.running = !S.running; syncPlay(); };
  $('stepF').onclick = () => { S.running = false; S.theta = mod(S.theta + 10, 720); syncPlay(); };
  $('stepB').onclick = () => { S.running = false; S.theta = mod(S.theta - 10, 720); syncPlay(); };
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { if (e.code !== 'Space') return; }
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.code === 'ArrowRight') $('stepF').click(); if (e.code === 'ArrowLeft') $('stepB').click();
  });
  $('menuBtn').onclick = () => $('left').classList.toggle('open');

  const clipEls = { on: $('clipOn'), axis: $('clipAxis'), pos: $('clipPos'), flip: $('clipFlip') };
  function applyClip() {
    $('clipV').textContent = fmt(+clipEls.pos.value, 1) + ' cm';
    engine.setClip({ on: clipEls.on.checked, axis: clipEls.axis.value, pos: +clipEls.pos.value, flip: clipEls.flip.checked });
  }
  const AXRANGE = { z: [-30, 30, 0], x: [-60, 60, -7.8], y: [-20, 75, 28] };
  clipEls.axis.addEventListener('change', () => { const r = AXRANGE[clipEls.axis.value]; clipEls.pos.min = r[0]; clipEls.pos.max = r[1]; clipEls.pos.value = r[2]; applyClip(); if (clipEls.axis.value === 'x') flyTo({ th: -1.2, ph: 1.4, r: 160 }); else if (clipEls.axis.value === 'z') flyTo(VIEWS['Genel']); else flyTo({ th: 0.3, ph: 0.55, r: 200 }); });
  Object.values(clipEls).forEach(el => el.addEventListener('input', applyClip));
  clipEls.pos.min = -30; clipEls.pos.max = 30;

  function applyFlows() { engine.setVisible('flows', S.flowsOn && S.explode < 0.02); }
  const PARTS = [['block', 'Motor bloğu', '#8a97a6', true], ['water', 'Soğutma suyu', '#3a8dff', true], ['head', 'Silindir kapağı', '#9aa6b3', true], ['valvetrain', 'Kam & külbütör', '#e4b93c', true],
    ['cover', 'Supap kapağı', '#3a4452', false], ['pan', 'Yağ karteri', '#4d5865', true], ['manifold', 'Emme/egzoz manif.', '#5b95d6', true], ['turbo', 'Turbo', '#cdb47a', true],
    ['gears', 'Zaman dişlileri', '#c9ced4', true], ['flywheel', 'Volan', '#7d8793', true], ['damper', 'Ön damper', '#2f3640', true], ['gas', 'Gaz & püskürtme', '#ff6a2a', true], ['flows', 'Hava/gaz akışı', '#7ec8ff', true], ['acc', 'Yardımcı donanım', '#2d6fd6', true]];
  PARTS.forEach(([k, n, col, on]) => {
    const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span class="sw" style="background:${col}"></span>${n}`;
    l.firstChild.addEventListener('change', e => { if (k === 'flows') { S.flowsOn = e.target.checked; applyFlows(); } else engine.setVisible(k, e.target.checked); }); $('parts').appendChild(l); if (k === 'flows') { S.flowsOn = on; applyFlows(); } else engine.setVisible(k, on);
  });
  bindRange('expl', 'explV', v => '%' + Math.round(v * 100), v => { S.explode = v; engine.setExplode(v); applyFlows(); });
  $('xray').addEventListener('change', e => engine.setXray(e.target.checked));
  $('spin').addEventListener('change', e => { orbit.auto = e.target.checked; });
  applyClip();

  // seçili silindir
  for (let j = 0; j < 6; j++) { const o = document.createElement('option'); o.value = j; o.textContent = 'Silindir ' + (j + 1); $('selCyl').appendChild(o); }
  $('selCyl').addEventListener('change', e => selectCyl(+e.target.value));
  function selectCyl(j) { S.selCyl = j; $('selCyl').value = j; document.querySelectorAll('#strokes .st').forEach((el, i) => el.classList.toggle('sel', i === j)); }
  const STCOL = ['#ff7a3d', '#85807d', '#54a0ff', '#ffc542'];
  for (let j = 0; j < 6; j++) { const d = document.createElement('div'); d.className = 'st'; d.onclick = () => selectCyl(j); $('strokes').appendChild(d); }
  selectCyl(0);

  // teknik veri
  $('spec').innerHTML = [
    ['Konfigürasyon', 'Sıralı 6, 4 zamanlı dizel'], ['Silindir çapı × strok', '131 × 158 mm'], ['Toplam hacim', fmt(G.vdTotal, 2) + ' L'], ['Sıkıştırma oranı', '≈ 17 : 1'],
    ['Ateşleme sırası', '1-5-3-6-2-4'], ['Supap', '4 / silindir (2 emme, 2 egzoz)'], ['Valf mekanizması', 'Tek üst kam mili (SOHC)'], ['Yakıt sistemi', 'Pompa-enjektör (kam tahrikli)'],
    ['Aşırı doldurma', 'Turbo (+ ara soğutucu hattı)'], ['Biyel boyu', '262 mm'], ['Krank mili', '7 ana yatak, 12 karşı ağırlık'], ['Zaman dişlileri', 'Arka (volan tarafı), kam 1:2'],
  ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

  function updateEstimates() {
    const pw = engine.pressure.power(S.rpm);
    $('hRpm').textContent = fmt(S.rpm) + ' d/d'; $('hPow').textContent = fmt(pw.hp) + ' hp (' + fmt(pw.kW) + ' kW)'; $('hTq').textContent = fmt(pw.Nm) + ' N·m';
    $('hPk').textContent = fmt(engine.pressure.peak) + ' bar';
  }
  updateEstimates();

  // ------------------------------------------------------------ ipucu / seçim
  const tip = $('tip'); const ray = new T.Raycaster(); const mouse = new T.Vector2(); let hoverQueued = null;
  function hideTip() { tip.style.display = 'none'; canvas.style.cursor = 'grab'; }
  function pickAt(e) {
    const r = canvas.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    return engine.pickHit(ray.intersectObjects(engine.pickables, false));
  }
  function hover(e) {
    hoverQueued = e; if (hover.raf) return;
    hover.raf = requestAnimationFrame(() => {
      hover.raf = 0; const ev = hoverQueued; if (!ev) return;
      const h = pickAt(ev);
      if (!h) { hideTip(); return; }
      canvas.style.cursor = 'pointer';
      let extra = '';
      if (h.cyl !== undefined) { const c = engine.cyl[h.cyl], k = EP.strokeIndex(c.phi); extra = `<br><span style="color:${STCOL[k]}">Silindir ${h.cyl + 1} · ${EP.STROKE_NAMES[k]} · ${fmt(c.p)} bar</span>`; }
      tip.innerHTML = `<b>${h.label}</b><span>${h.info || ''}</span>${extra}`;
      tip.style.display = 'block';
      const w = tip.offsetWidth, hh = tip.offsetHeight;
      tip.style.left = Math.min(innerWidth - w - 8, ev.clientX + 16) + 'px'; tip.style.top = Math.min(innerHeight - hh - 8, ev.clientY + 16) + 'px';
    });
  }
  function onClick(e) { const h = pickAt(e); if (h && h.cyl !== undefined) selectCyl(h.cyl); }

  // ------------------------------------------------------------ grafikler
  function fitCanvas(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return d; }
  const tlc = $('tlc'), ptc = $('ptc'), tlx = tlc.getContext('2d'), ptx = ptc.getContext('2d');
  function drawTimeline() {
    const d = fitCanvas(tlc), W = tlc.width, H = tlc.height, x = tlx; x.clearRect(0, 0, W, H);
    const L = 34 * d, T0 = 16 * d, rowH = (H - T0 - 4 * d) / 6, gap = 3 * d, pw = W - L - 6 * d;
    x.font = `${10 * d}px system-ui, sans-serif`; x.fillStyle = '#93a1b0'; x.textBaseline = 'middle';
    for (let a = 0; a <= 720; a += 180) { const px = L + a / 720 * pw; x.strokeStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.moveTo(px, T0 - 4 * d); x.lineTo(px, H - 2 * d); x.stroke(); x.textAlign = a === 720 ? 'right' : (a === 0 ? 'left' : 'center'); x.fillText(a + '°', px, 8 * d); }
    for (let j = 0; j < 6; j++) {
      const y = T0 + j * rowH; x.textAlign = 'left'; x.fillStyle = j === S.selCyl ? '#ffb020' : '#93a1b0'; x.fillText('S' + (j + 1), 4 * d, y + rowH / 2);
      const f = G.fire[j];
      for (let k = 0; k < 4; k++) {
        const t0 = mod(k * 180 + f, 720); const w = 180 / 720 * pw; let px = L + t0 / 720 * pw;
        x.fillStyle = STCOL[k]; x.globalAlpha = 0.85;
        const draw = (xx, ww) => x.fillRect(xx, y + gap / 2, ww, rowH - gap);
        if (t0 + 180 <= 720) draw(px, w); else { const w1 = (720 - t0) / 720 * pw; draw(px, w1); draw(L, w - w1); }
        x.globalAlpha = 1;
      }
      // supap açıklık çizgileri
      for (const [tt, col, off] of [[EP.TIM.int, '#0b3a6b', 0.28], [EP.TIM.exh, '#7a2a05', 0.72]]) {
        const a0 = mod(tt.open + f, 720), len = tt.close - tt.open; x.fillStyle = col;
        const yy = y + rowH * off - 1 * d, hh = 2.4 * d;
        if (a0 + len <= 720) x.fillRect(L + a0 / 720 * pw, yy, len / 720 * pw, hh); else { const w1 = (720 - a0) / 720 * pw; x.fillRect(L + a0 / 720 * pw, yy, w1, hh); x.fillRect(L, yy, len / 720 * pw - w1, hh); }
      }
    }
    const cx = L + mod(S.theta, 720) / 720 * pw; x.strokeStyle = '#fff'; x.lineWidth = 2 * d; x.beginPath(); x.moveTo(cx, T0 - 4 * d); x.lineTo(cx, H - 2 * d); x.stroke(); x.lineWidth = 1;
  }
  function drawPressure() {
    const d = fitCanvas(ptc), W = ptc.width, H = ptc.height, x = ptx; x.clearRect(0, 0, W, H);
    const pr = engine.pressure, L = 32 * d, B = 16 * d, Tt = 8 * d, pw = W - L - 8 * d, ph = H - B - Tt, pmax = Math.max(60, Math.ceil(pr.peak * 1.1 / 50) * 50);
    const X = a => L + a / 720 * pw, Y = p => Tt + ph - p / pmax * ph;
    x.font = `${10 * d}px system-ui, sans-serif`; x.fillStyle = '#93a1b0'; x.strokeStyle = 'rgba(255,255,255,.1)'; x.textBaseline = 'middle'; x.textAlign = 'right';
    for (let p = 0; p <= pmax; p += 50) { x.beginPath(); x.moveTo(L, Y(p)); x.lineTo(L + pw, Y(p)); x.stroke(); x.fillText(p, L - 4 * d, Y(p)); }
    x.textAlign = 'center'; for (let a = 0; a <= 720; a += 180) x.fillText(a + '°', X(a), H - 6 * d);
    // strok arka planı
    for (let k = 0; k < 4; k++) { x.fillStyle = STCOL[k]; x.globalAlpha = 0.07; x.fillRect(X(k * 180), Tt, 180 / 720 * pw, ph); } x.globalAlpha = 1;
    const c = engine.cyl[S.selCyl], phi = c.phi;
    // supap kalkışı
    for (const [tt, col] of [[EP.TIM.int, '#4aa8ff'], [EP.TIM.exh, '#ff7a3d']]) {
      x.strokeStyle = col; x.lineWidth = 1.5 * d; x.globalAlpha = 0.8; x.beginPath();
      for (let a = 0; a <= 720; a += 4) { const l = EP.valveLift(a, tt) / 1.4, yy = Tt + ph - l * ph * 0.22; a ? x.lineTo(X(a), yy) : x.moveTo(X(a), yy); } x.stroke(); x.globalAlpha = 1;
    }
    x.strokeStyle = '#ffd34a'; x.lineWidth = 2 * d; x.beginPath();
    for (let a = 0; a <= 720; a += 2) { const p = pr.at(a); a ? x.lineTo(X(a), Y(p)) : x.moveTo(X(a), Y(p)); } x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 1.5 * d; x.beginPath(); x.moveTo(X(phi), Tt); x.lineTo(X(phi), Tt + ph); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(X(phi), Y(c.p), 4 * d, 0, TAU); x.fill();
    x.textAlign = phi > 520 ? 'right' : 'left'; x.fillText(fmt(c.p) + ' bar', X(phi) + (phi > 520 ? -8 : 8) * d, Math.max(Tt + 8 * d, Y(c.p) - 8 * d));
    x.textAlign = 'left'; x.fillStyle = '#93a1b0'; x.fillText('bar', 2 * d, Tt + 4 * d);
  }
  function updateHud() {
    $('hAng').textContent = fmt(mod(S.theta, 720), 0); $('hCyc').textContent = fmt(mod(S.theta, 720)) + ' / 720°';
    const els = $('strokes').children;
    for (let j = 0; j < 6; j++) { const c = engine.cyl[j], k = EP.strokeIndex(c.phi), el = els[j]; el.style.borderLeftColor = STCOL[k]; el.innerHTML = `<b>Silindir ${j + 1}</b>${EP.STROKE_NAMES[k].split(' ')[0]} · ${fmt(c.p)} bar`; }
    angEl.value = Math.round(mod(S.theta, 720));
    $('angV').textContent = fmt(mod(S.theta, 720)) + '°';
  }

  // ------------------------------------------------------------ ses (sentetik)
  const snd = { ctx: null, on: false };
  function startSound() {
    const ctx = snd.ctx = snd.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (snd.src) return;
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.05), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 55 * t) * 0.9 + (Math.random() * 2 - 1) * 0.5 * Math.exp(-t * 90)) * Math.exp(-t * 60); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const gain = ctx.createGain(); gain.gain.value = 0; src.connect(lp); lp.connect(gain); gain.connect(ctx.destination); src.start();
    snd.src = src; snd.gain = gain; snd.lp = lp;
  }
  function updateSound() {
    if (!snd.src) return; const on = snd.on && S.running;
    const f = 3 * S.rpm / 60;     // altı silindir 4 zamanlı: devir başına 3 ateşleme
    snd.src.playbackRate.setTargetAtTime(f * 0.05, snd.ctx.currentTime, 0.05);
    snd.gain.gain.setTargetAtTime(on ? 0.25 + 0.35 * S.load : 0, snd.ctx.currentTime, 0.1);
    snd.lp.frequency.setTargetAtTime(300 + S.rpm * 0.25, snd.ctx.currentTime, 0.1);
  }
  $('sound').addEventListener('change', e => { snd.on = e.target.checked; if (snd.on) { startSound(); snd.ctx.resume(); } });

  // ------------------------------------------------------------ döngü
  const inset = { l: 0, r: 0, t: 0, b: 0 };
  function layout() {
    const w = innerWidth, h = innerHeight, wide = w > 900;
    const bb = $('bottom').getBoundingClientRect();
    inset.l = wide ? $('left').getBoundingClientRect().right + 8 : 0; inset.r = 0; inset.t = wide ? 58 : 84; inset.b = Math.max(0, h - bb.top) + 6;
    const dx = (inset.l - inset.r) / 2, dy = (inset.t - inset.b) / 2;
    camera.setViewOffset(w, h, -dx, -dy, w, h);
  }
  function fitR(sx = 205, sy = 122) {            // motoru serbest alana sığdıran kamera uzaklığı
    const w = innerWidth, h = innerHeight, k = 2 * Math.tan(camera.fov * DEG / 2), fw = Math.max(200, w - inset.l - inset.r), fh = Math.max(150, h - inset.t - inset.b);
    return Math.min(520, Math.max(sx / (k * (w / h) * fw / w), sy / (k * fh / h)));
  }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; layout(); camera.updateProjectionMatrix(); VIEWS.Genel.r = fitR(); }
  addEventListener('resize', resize);
  resize(); if (!qs.has('view') && !qs.has('cam')) { orbit.r = VIEWS.Genel.r; }
  let last = performance.now(), frames = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.running) S.theta = mod(S.theta + S.rpm * 6 * S.slow * dt, 720);
    if (orbit.tween) {
      const k = Math.min(1, (now - orbit.tween.t0) / orbit.tween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, tw = orbit.tween;
      orbit.target.lerpVectors(tw.from.t, tw.to.t, e); orbit.r = tw.from.r + (tw.to.r - tw.from.r) * e; orbit.th = tw.from.th + tw.to.dth * e; orbit.ph = tw.from.ph + (tw.to.ph - tw.from.ph) * e;
      if (k >= 1) orbit.tween = null;
    } else if (orbit.auto && ptrs.size === 0) orbit.th += dt * 0.25;
    applyCam();
    engine.update(S.theta, S.running ? dt : 0, Math.min(2.5, Math.max(0.4, Math.sqrt(S.rpm * S.slow / 40))));
    updateHud(); drawTimeline(); drawPressure(); updateSound();
    renderer.render(scene, camera);
    if (++frames === 2) { const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 600); }
    requestAnimationFrame(frame);
  }
  // test / URL parametreleri
  if (qs.has('theta')) S.theta = +qs.get('theta');
  if (qs.has('rpm')) { $('rpm').value = qs.get('rpm'); $('rpm').dispatchEvent(new Event('input')); }
  if (qs.get('run') === '0') { S.running = false; syncPlay(); }
  if (qs.get('clip') === '0') { clipEls.on.checked = false; applyClip(); }
  if (qs.has('axis')) { clipEls.axis.value = qs.get('axis'); const r = AXRANGE[qs.get('axis')]; clipEls.pos.min = r[0]; clipEls.pos.max = r[1]; clipEls.pos.value = qs.has('pos') ? qs.get('pos') : r[2]; applyClip(); }
  if (qs.has('expl')) { $('expl').value = qs.get('expl'); $('expl').dispatchEvent(new Event('input')); }
  if (qs.get('xray') === '1') { $('xray').checked = true; engine.setXray(true); }
  if (qs.get('cover') === '1') { engine.setVisible('cover', true); }
  if (qs.has('hide')) qs.get('hide').split(',').forEach(k => engine.setVisible(k, false));
  if (qs.has('view')) { const v = VIEWS[qs.get('view')]; if (v) { orbit.target.set(...v.t); orbit.r = v.r; orbit.th = v.th; orbit.ph = v.ph; } }
  if (qs.has('cam')) { const [r, th, ph, tx, ty, tz] = qs.get('cam').split(',').map(Number); orbit.r = r; orbit.th = th; orbit.ph = ph; orbit.target.set(tx || 0, ty === undefined ? 24 : ty, tz || 0); }
  if (qs.get('ui') === '0') document.querySelectorAll('#left,#hud,#bottom,#title,#hint,#menuBtn').forEach(e => e.style.display = 'none');
  window.__app = { S, engine, orbit, camera, renderer, scene, flyTo };
  requestAnimationFrame(frame);
})();
