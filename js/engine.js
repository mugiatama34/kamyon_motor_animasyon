/* 3D motor modeli: parça üretimi, kesit (stencil kapak) altyapısı, kinematik güncelleme. */
(function (root) {
  'use strict';
  const T = root.THREE, EP = root.EngineParams, GEO = root.EngineGeo, G = EP.G, ROCK = EP.ROCK, TIM = EP.TIM;
  const { revolve, revolveX, cylX, tubeX, tubeY, boxG, extYZ, extXZ, extXY, rectPts, convexHull, circPts, gearOutline, polarZY, Helix } = GEO;
  const DEG = EP.DEG, TAU = Math.PI * 2, mod = EP.mod;
  const X0 = j => (j - 2.5) * G.P;
  const MAIN_X = k => (k - 3) * G.P;
  const HB = G.HEAD_BOTTOM;
  const Y_PLATE_TOP = HB + 3.0, Y_PORT_TOP = Y_PLATE_TOP + 5.0, Y_ROOF_TOP = Y_PORT_TOP + 1.0;
  const PORT_Y = (Y_PLATE_TOP + Y_PORT_TOP) / 2;
  const VZ = ROCK.pushZ, VX = 2.3;
  const CAM_Y = 66.4, ROLLER_R = 1.0, CAM_BASE = 2.4, ROCK_Y = 64.0;
  const SLOT = { exh: -4.6, inj: 1.4, int: 6.4 };
  const HALF_W = 17.0, END_X = 50.5, HEAD_TOP = 60.5;
  const BRIDGE_Y = 59.5, PLUNGER_TOP = 58.9;
  const INJ_SIGMA = Math.atan2(-ROCK.injRollerZ, -Math.sqrt(Math.pow(CAM_BASE + ROLLER_R, 2) - ROCK.injRollerZ * ROCK.injRollerZ));
  const TURBO = { x: -58, y: 43, z: -38 };
  const GEAR_X = 54;

  function mergeGeos(list) {
    const gs = list.map(g => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); return n; });
    let total = 0; gs.forEach(g => total += g.attributes.position.count);
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3);
    let o = 0;
    gs.forEach(g => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(P, 3)); out.setAttribute('normal', new T.BufferAttribute(N, 3));
    return out;
  }
  const tr = (g, x, y, z) => g.translate(x, y, z);
  // (y,z) düzleminde p0->p1 arası, x'te genişliği w, kalınlığı h olan çubuk; x merkezi xc
  function bar(p0, p1, w, h, xc) {
    const dy = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dy, dz);
    const g = new T.BoxGeometry(w, h, len); g.rotateX(Math.atan2(-dy, dz));
    g.translate(xc, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); return g;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  function build(scene) {
    const R3 = new T.Group(); scene.add(R3);
    const clipPlane = new T.Plane(new T.Vector3(0, 0, -1), 0);
    const allMats = [], capGroups = {}, pickables = [], explodables = [], visGroups = {};
    let capOrder = 0;
    const state = { clip: { on: false, axis: 'z', pos: 0, flip: false }, xray: false, pressure: EP.buildPressure(1) };

    // ------------------------------------------------------------ malzeme / kapak altyapısı
    function mat(color, o = {}) {
      const m = new T.MeshStandardMaterial({
        color, metalness: o.metal !== undefined ? o.metal : 0.6, roughness: o.rough !== undefined ? o.rough : 0.45,
        transparent: o.opacity !== undefined && o.opacity < 1, opacity: o.opacity !== undefined ? o.opacity : 1,
        side: o.double ? T.DoubleSide : T.FrontSide, emissive: o.emissive || 0x000000, depthWrite: o.depthWrite !== undefined ? o.depthWrite : true,
      });
      m.clippingPlanes = [clipPlane];
      m.userData = { ghost: !!o.ghost, baseOpacity: o.opacity !== undefined ? o.opacity : 1, baseTransparent: o.opacity !== undefined && o.opacity < 1, baseDepthWrite: o.depthWrite !== undefined ? o.depthWrite : true };
      allMats.push(m); return m;
    }
    function defCap(name, color) {
      const i = capOrder++;
      const mk = (side, op) => {
        const m = new T.MeshBasicMaterial({ depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: T.AlwaysStencilFunc, side });
        m.stencilFail = op; m.stencilZFail = op; m.stencilZPass = op; m.clippingPlanes = [clipPlane]; return m;
      };
      const capMat = new T.MeshBasicMaterial({
        color, side: T.DoubleSide, toneMapped: false, stencilWrite: true, stencilRef: 0, stencilFunc: T.NotEqualStencilFunc,
        stencilFail: T.ReplaceStencilOp, stencilZFail: T.ReplaceStencilOp, stencilZPass: T.ReplaceStencilOp, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -i,
      });
      capMat.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
          .replace('#include <color_fragment>', '#include <color_fragment>\nfloat hs = fract((vWP.x + vWP.y + vWP.z) * 0.7);\ndiffuseColor.rgb *= 0.80 + 0.20 * step(0.3, hs);');
      };
      capMat.customProgramCacheKey = () => 'capHatch';
      const plane = new T.Mesh(new T.PlaneGeometry(900, 900), capMat);
      plane.renderOrder = i * 10 + 2; plane.visible = false; plane.frustumCulled = false;
      plane.onAfterRender = r => r.clearStencil();
      R3.add(plane);
      capGroups[name] = { name, order: i * 10 + 1, back: mk(T.BackSide, T.IncrementWrapStencilOp), front: mk(T.FrontSide, T.DecrementWrapStencilOp), plane, meshes: [], stencils: [], mat: capMat };
    }
    const CAPS = { block: 0x5f7fa3, liner: 0x8fa9c2, head: 0x6f8fb3, piston: 0xe0a93a, ring: 0x40454c, rod: 0xe5792c, crank: 0xd0462e, valve: 0x2f8fe8, inj: 0x22b56c, cam: 0xe6c030, rocker: 0xa7b4c4, gear: 0xc98a45, sheet: 0x56708c, pipe: 0x7b93ad, bearing: 0xc9763a, turbo: 0xd1a73f };
    for (const k of Object.keys(CAPS)) defCap(k, CAPS[k]);

    function attachCap(m, name) {
      const cg = capGroups[name]; if (!cg) throw new Error('cap yok: ' + name);
      const b = new T.Mesh(m.geometry, cg.back), f = new T.Mesh(m.geometry, cg.front);
      b.renderOrder = f.renderOrder = cg.order; b.userData.stencil = f.userData.stencil = true;
      m.add(b, f); cg.meshes.push(m); cg.stencils.push(b, f); b.visible = f.visible = state.clip.on;
    }
    function add(parent, geom, material, o = {}) {
      const m = new T.Mesh(geom, material);
      if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
      if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
      m.renderOrder = 1000;
      if (o.label) { m.userData.label = o.label; if (o.info) m.userData.info = o.info; pickables.push(m); }
      if (o.cyl !== undefined) m.userData.cyl = o.cyl;
      if (o.cap) attachCap(m, o.cap);
      parent.add(m); return m;
    }
    const grp = (parent, name) => { const g = new T.Group(); g.name = name || ''; (parent || R3).add(g); return g; };
    const reg = (key, ...objs) => { (visGroups[key] = visGroups[key] || []).push(...objs); };
    const explode = (g, v) => { explodables.push({ g, base: g.position.clone(), v }); };

    // ------------------------------------------------------------ malzemeler
    function gasMat() {
      const m = new T.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.25, depthWrite: false, side: T.DoubleSide, toneMapped: false });
      m.clippingPlanes = [clipPlane]; return m;
    }
    const M = {
      block: mat(0x56616e, { metal: 0.55, rough: 0.62, ghost: true }),
      liner: mat(0xc3ccd4, { metal: 0.85, rough: 0.28, ghost: true }),
      head: mat(0x7b8794, { metal: 0.6, rough: 0.5, ghost: true }),
      pan: mat(0x39434e, { metal: 0.5, rough: 0.6, ghost: true }),
      cover: mat(0x28303a, { metal: 0.3, rough: 0.5, opacity: 0.55, ghost: true, double: true }),
      piston: mat(0xdfe3e8, { metal: 0.9, rough: 0.3 }),
      ring: mat(0x23262a, { metal: 0.8, rough: 0.35 }),
      pin: mat(0x4a4f57, { metal: 0.9, rough: 0.25 }),
      rod: mat(0xb7bec7, { metal: 0.85, rough: 0.33 }),
      bearing: mat(0xc07a3e, { metal: 0.9, rough: 0.3 }),
      crank: mat(0x8695a6, { metal: 0.85, rough: 0.32 }),
      cw: mat(0x6f7f91, { metal: 0.85, rough: 0.4 }),
      valveInt: mat(0x4aa8ff, { metal: 0.9, rough: 0.25 }),
      valveExh: mat(0xff7a3d, { metal: 0.9, rough: 0.3 }),
      spring: mat(0xe6e8ea, { metal: 0.9, rough: 0.25, double: true }),
      bridge: mat(0x9aa4af, { metal: 0.8, rough: 0.4 }),
      inj: mat(0x33c27c, { metal: 0.7, rough: 0.35 }),
      plunger: mat(0xd9dde2, { metal: 0.9, rough: 0.25 }),
      cam: mat(0xe4b93c, { metal: 0.85, rough: 0.3 }),
      camShaft: mat(0xb8bec6, { metal: 0.85, rough: 0.3 }),
      rocker: mat(0x65717f, { metal: 0.8, rough: 0.38 }),
      ped: mat(0x70808f, { metal: 0.6, rough: 0.5, ghost: true }),
      gear: mat(0xc9ced4, { metal: 0.85, rough: 0.35 }),
      gearPlate: mat(0x58616b, { metal: 0.6, rough: 0.55, ghost: true }),
      fly: mat(0x7d8793, { metal: 0.85, rough: 0.4 }),
      ringGear: mat(0xb9bfc7, { metal: 0.9, rough: 0.3 }),
      damper: mat(0x2f3640, { metal: 0.7, rough: 0.45 }),
      intake: mat(0x5b95d6, { metal: 0.5, rough: 0.35, opacity: 0.5, ghost: true }),
      exhaust: mat(0xa65b36, { metal: 0.6, rough: 0.5, opacity: 0.55, ghost: true }),
      turbo: mat(0xcdb47a, { metal: 0.8, rough: 0.35, opacity: 0.42, ghost: true }),
      wheel: mat(0xd9dde2, { metal: 0.9, rough: 0.25 }),
      water: mat(0x3a8dff, { metal: 0, rough: 0.2, opacity: 0.16, depthWrite: false }),
      oil: mat(0xd49a2c, { metal: 0, rough: 0.2, opacity: 0.55, depthWrite: false }),
    };

    // ============================================================ BLOK
    const gBlock = grp(R3, 'block'); reg('block', gBlock);
    {
      const bl = (g, o) => add(gBlock, g, M.block, Object.assign({ label: 'Motor bloğu (sfero/GJV dökme demir)', info: 'Silindirleri, ana yatakları ve su ceketini taşıyan ana gövde.', cap: 'block' }, o));
      const holes7 = []; for (let j = 0; j < 6; j++) holes7.push({ circle: [X0(j), 0, 7.2] });
      bl(extXZ(rectPts(-END_X, -HALF_W, END_X, HALF_W), holes7, 3.0, 40.4));            // üst güverte
      bl(extXZ(rectPts(-END_X, -HALF_W, END_X, HALF_W), holes7, 3.0, 12.0));            // alt gömlek plakası
      bl(boxG(2 * END_X, 49.4, 1.5), { pos: [0, 18.7, 16.25] }); bl(boxG(2 * END_X, 49.4, 1.5), { pos: [0, 18.7, -16.25] });
      for (const s of [-1, 1]) bl(extYZ(rectPts(-HALF_W, -6, HALF_W, 43.4), [{ circle: [0, 0, 5.7] }], 1.5), { pos: [s * 49.75, 0, 0] });
      for (let k = 0; k < 7; k++) {
        bl(extYZ(rectPts(-15.5, -6, 15.5, 12), [{ circle: [0, 0, 5.5] }], 3.0), { pos: [MAIN_X(k), 0, 0] });
        add(gBlock, revolveX([[5.2, -1.5], [5.5, -1.5], [5.5, 1.5], [5.2, 1.5]], 36), M.bearing, { pos: [MAIN_X(k), 0, 0], label: 'Ana yatak kabuğu', info: 'Krank milini blokta taşıyan kaymalı yatak.', cap: 'bearing' });
      }
      for (let k = 1; k <= 5; k++) bl(boxG(1.0, 25.4, 31), { pos: [MAIN_X(k), 27.7, 0] });
      for (let k = 0; k <= 6; k++) for (const sgn of [-1, 1]) bl(boxG(1.4, 46, 1.4), { pos: [MAIN_X(k), 17, sgn * 17.6], label: 'Blok nervürü' });
      for (const sgn of [-1, 1]) { bl(boxG(2 * END_X, 1.3, 1.3), { pos: [0, 14, sgn * 17.6], label: 'Blok nervürü' }); bl(boxG(2 * END_X, 1.3, 1.3), { pos: [0, 0, sgn * 17.6], label: 'Blok nervürü' }); }
      bl(extXZ(rectPts(-51, -18.5, 51, 18.5), [{ pts: rectPts(-48.5, -15, 48.5, 15) }], 1.2, -7.2));
      // su ceketi (soğutma suyu)
      const water = add(gBlock, extXZ(rectPts(-49, -15.5, 49, 15.5), holes7, 25.4, 15), M.water, { label: 'Soğutma suyu ceketi', info: 'Silindir gömleklerini çevreleyen soğutma suyu hacmi.' });
      water.renderOrder = 1100; reg('water', water);
      // silindir gömlekleri
      for (let j = 0; j < 6; j++) add(gBlock, revolve([[6.55, 12], [7.2, 12], [7.2, 42.4], [7.9, 42.4], [7.9, 43.4], [6.55, 43.4]], 56), M.liner, { pos: [X0(j), 0, 0], label: 'Silindir gömleği', info: 'Çap 131 mm. Pistonun kaydığı sertleştirilmiş yüzey.', cap: 'liner' });
    }

    // ============================================================ SİLİNDİR KAPAĞI
    const gHead = grp(R3, 'head'); reg('head', gHead); explode(gHead, [0, 26, 0]);
    {
      const hd = (g, o) => add(gHead, g, M.head, Object.assign({ label: 'Silindir kapağı', info: 'Dört supaplı çapraz akışlı kapak: emme portları bir yanda, egzoz portları diğer yanda.', cap: 'head' }, o));
      const th = [], gd = [];
      for (let j = 0; j < 6; j++) {
        th.push({ circle: [X0(j) - VX, VZ, 1.85] }, { circle: [X0(j) + VX, VZ, 1.85] }, { circle: [X0(j) - VX, -VZ, 1.85] }, { circle: [X0(j) + VX, -VZ, 1.85] }, { circle: [X0(j), 0, 1.3] });
        gd.push({ circle: [X0(j) - VX, VZ, 0.65] }, { circle: [X0(j) + VX, VZ, 0.65] }, { circle: [X0(j) - VX, -VZ, 0.65] }, { circle: [X0(j) + VX, -VZ, 0.65] }, { circle: [X0(j), 0, 1.4] });
      }
      hd(extXZ(rectPts(-END_X, -HALF_W, END_X, HALF_W), th, 3.0, HB));
      hd(extXZ(rectPts(-49, -15.5, 49, 15.5), gd, 1.0, Y_PORT_TOP));
      const openings = []; for (let j = 0; j < 6; j++) openings.push({ pts: rectPts(X0(j) - 4.8, Y_PLATE_TOP, X0(j) + 4.8, Y_PORT_TOP) });
      hd(extXY(rectPts(-END_X, HB, END_X, HEAD_TOP), openings, 1.5, 15.5));
      hd(extXY(rectPts(-END_X, HB, END_X, HEAD_TOP), openings, 1.5, -17));
      for (const s of [-1, 1]) hd(extYZ(rectPts(-HALF_W, HB, HALF_W, HEAD_TOP), [], 1.5), { pos: [s * 49.75, 0, 0] });
      const U = [[-4.8, Y_PLATE_TOP], [-4.8, Y_PORT_TOP], [4.8, Y_PORT_TOP], [4.8, Y_PLATE_TOP], [4.2, Y_PLATE_TOP], [4.2, Y_PORT_TOP - 0.6], [-4.2, Y_PORT_TOP - 0.6], [-4.2, Y_PLATE_TOP]];
      const gIn = extXY(U, [], 14.6, 0.9), gEx = extXY(U, [], 14.6, -15.5);
      for (let j = 0; j < 6; j++) {
        hd(gIn, { pos: [X0(j), 0, 0], label: 'Emme portu', info: 'Doldurulmuş havanın supaplara aktığı kanal.' });
        hd(gEx, { pos: [X0(j), 0, 0], label: 'Egzoz portu', info: 'Yanmış gazın egzoz manifolduna çıktığı kanal.' });
      }
      // supaplar
      const vProf = [[0, 0], [2.1, 0], [2.1, 0.4], [0.35, 2.3], [0.35, 13.8], [1.5, 13.8], [1.5, 14.6], [0.35, 14.6], [0.35, 15.55], [0, 15.55]];
      const vGeo = revolve(vProf, 28);
      const sGeo = new T.TubeGeometry(new Helix(1.35, 5.2, 7.5), 160, 0.2, 6, false);
      const brGeo = boxG(2 * VX + 2.4, 0.9, 1.6);
      const injBody = revolve([[0, 43.25], [0.5, 43.45], [0.5, 44.2], [1.25, 44.2], [1.25, 56], [0.9, 56], [0.9, 57.2], [0, 57.2]], 24);
      const plGeo = revolve([[0, 57.2], [0.75, 57.2], [0.75, 58.4], [1.2, 58.4], [1.2, PLUNGER_TOP], [0, PLUNGER_TOP]], 20);
      state.cyl = [];
      for (let j = 0; j < 6; j++) {
        const c = { x: X0(j), fire: G.fire[j], alpha: G.alpha[j], valves: { int: [], exh: [] }, springs: { int: [], exh: [] }, bridges: {} };
        for (const [type, z] of [['int', VZ], ['exh', -VZ]]) {
          const vm = type === 'int' ? M.valveInt : M.valveExh;
          for (const sx of [-1, 1]) {
            const v = add(gHead, vGeo, vm, { pos: [c.x + sx * VX, HB, z], cap: 'valve', label: type === 'int' ? 'Emme supabı' : 'Egzoz supabı', info: type === 'int' ? 'Silindire hava alır. Çap ~42 mm, kalkış ~13 mm.' : 'Yanmış gazı boşaltır. Egzoz supabı daha yüksek ısıya dayanır.' });
            c.valves[type].push(v);
            const sp = add(gHead, sGeo, M.spring, { pos: [c.x + sx * VX, Y_ROOF_TOP, z], label: 'Supap yayı', info: 'Supabı kapalı tutar; kam kalkarken sıkışır.' });
            c.springs[type].push(sp);
          }
          c.bridges[type] = add(gHead, brGeo, M.bridge, { pos: [c.x, BRIDGE_Y, z], cap: 'valve', label: 'Supap köprüsü', info: 'Külbütörün kuvvetini aynı anda iki supaba dağıtır.' });
        }
        add(gHead, injBody, M.inj, { pos: [c.x, 0, 0], cap: 'inj', label: 'Pompa-enjektör', info: 'Kam ile tahrik edilen yüksek basınçlı (>2000 bar) yakıt enjeksiyon ünitesi.' });
        c.plunger = add(gHead, plGeo, M.plunger, { pos: [c.x, 0, 0], cap: 'inj', label: 'Enjektör pistonu', info: 'Külbütör bu pistona basarak yakıtı yüksek basınçla püskürtür.' });
        state.cyl.push(c);
      }
    }

    // ============================================================ ÜST TAKIM: kam mili, külbütörler, yataklar
    const gTop = grp(R3, 'top'); reg('valvetrain', gTop); explode(gTop, [0, 52, 0]);
    const gCam = grp(gTop, 'cam'); gCam.position.set(0, CAM_Y, 0);
    {
      const pedX = []; for (let j = 0; j < 6; j++) pedX.push(X0(j) - 6.9); pedX.push(X0(5) + 8.7);
      const pedOut = [[-13.5, HEAD_TOP], [10.5, HEAD_TOP], [10.5, 71], [-13.5, 71]];
      const pedHoles = [{ circle: [0, CAM_Y, 2.8] }, { circle: [ROCK.pivotZ, ROCK_Y, 1.15] }, { circle: [-ROCK.pivotZ, ROCK_Y, 1.15] }, { circle: [-ROCK.injPivotZ, ROCK_Y, 1.15] }];
      const pedG = extYZ(pedOut, pedHoles, 1.4);
      pedX.forEach(x => add(gTop, pedG, M.ped, { pos: [x, 0, 0], cap: 'head', label: 'Kam mili yatak yuvası', info: 'Kam milini ve külbütör millerini kapağa bağlar.' }));
      for (const [z, y] of [[ROCK.pivotZ, ROCK_Y], [-ROCK.pivotZ, ROCK_Y], [-ROCK.injPivotZ, ROCK_Y]])
        add(gTop, cylX(1.1, 104), M.camShaft, { pos: [0, y, z], cap: 'cam', label: 'Külbütör mili' });
      add(gCam, cylX(1.9, 110), M.camShaft, { pos: [2, 0, 0], cap: 'cam', label: 'Kam mili', info: 'Tek üst kam mili: emme, egzoz ve enjektör kamlarını taşır. Krank hızının yarısında döner.' });
      pedX.forEach(x => add(gCam, cylX(2.6, 1.6), M.camShaft, { pos: [x, 0, 0], cap: 'cam', label: 'Kam mili yatak muylusu' }));
      // kam lobları (profil gerçek zamanlama fonksiyonundan üretilir)
      const lobe = (peak, lift) => {
        const pts = [], n = 180;
        for (let i = 0; i < n; i++) { const s = -Math.PI + i / n * TAU; pts.push(polarZY(CAM_BASE + lift(peak - 2 * s / DEG), s)); }
        return extYZ(pts, [{ circle: [0, 0, 1.0] }], 2.6);
      };
      const peakI = (TIM.int.open + TIM.int.close) / 2, peakE = (TIM.exh.open + TIM.exh.close) / 2, peakJ = TIM.inj.peak;
      const lobeG = { int: lobe(peakI, EP.camLiftInt), exh: lobe(peakE, EP.camLiftExh), inj: lobe(peakJ, EP.injCamLift) };
      const peak = { int: peakI, exh: peakE, inj: peakJ };
      const sig = { int: Math.PI, exh: Math.PI, inj: INJ_SIGMA };
      const names = { int: 'Emme kamı', exh: 'Egzoz kamı', inj: 'Enjektör kamı' };
      state.cyl.forEach((c, j) => {
        for (const t of ['int', 'exh', 'inj']) {
          const nu = sig[t] - (c.fire + peak[t]) / 2 * DEG;
          add(gCam, lobeG[t], M.cam, { pos: [c.x + SLOT[t], 0, 0], rot: [nu, 0, 0], cap: 'cam', label: names[t], info: 'Profil gerçek supap zamanlamasından üretilmiştir.' });
        }
      });
      // külbütörler
      const mkRocker = (type) => {
        const dir = type === 'int' ? -1 : 1, slot = SLOT[type];
        const armLen = type === 'inj' ? 10.0 : 9.0, rollerY = type === 'inj' ? (CAM_Y - 2.75) - ROCK_Y : (CAM_Y - CAM_BASE - ROLLER_R) - ROCK_Y;
        const pushLen = type === 'inj' ? ROCK.injPivotZ : ROCK.pivotZ - VZ;
        const yArm = (zl) => rollerY * (zl / armLen);
        const targetTop = type === 'inj' ? PLUNGER_TOP : (BRIDGE_Y + 0.45);
        const list = [];
        list.push(cylX(1.35, 2.4, 24).translate(slot, 0, 0));
        list.push(bar([0, 0], [rollerY, dir * armLen], 1.8, 1.5, slot));
        list.push(cylX(ROLLER_R, 1.8, 24).translate(slot, rollerY, dir * armLen));
        const yFoot = yArm(pushLen);
        list.push(new T.BoxGeometry(Math.abs(slot) + 0.8, 1.0, 1.6).translate(slot / 2, yFoot - 0.2, dir * pushLen));
        const sl = (yFoot - 0.7) - (targetTop - ROCK_Y);
        list.push(new T.CylinderGeometry(0.4, 0.4, sl, 14).translate(0, (yFoot - 0.7) - sl / 2, dir * pushLen));
        return mergeGeos(list);
      };
      const rockG = { int: mkRocker('int'), exh: mkRocker('exh'), inj: mkRocker('inj') };
      state.cyl.forEach((c) => {
        c.rock = {};
        for (const t of ['int', 'exh', 'inj']) {
          const g = grp(gTop, 'rocker'); const z = t === 'int' ? ROCK.pivotZ : (t === 'exh' ? -ROCK.pivotZ : -ROCK.injPivotZ);
          g.position.set(c.x, ROCK_Y, z);
          add(g, rockG[t], M.rocker, { cap: 'rocker', label: t === 'inj' ? 'Enjektör külbütörü' : 'Külbütör', info: 'Kamdan aldığı hareketi supap köprüsüne / enjektör pistonuna iletir.' });
          c.rock[t] = g;
        }
      });
    }

    // ============================================================ SUPAP KAPAĞI
    const gCover = grp(R3, 'cover'); reg('cover', gCover); explode(gCover, [0, 85, 0]); gCover.visible = false;
    {
      const out = [[-17, HEAD_TOP], [-17, HEAD_TOP + 1.2], [-15.2, HEAD_TOP + 1.2], [-15.2, 72], [-11.5, 75.5], [11.5, 75.5], [15.2, 72], [15.2, HEAD_TOP + 1.2], [17, HEAD_TOP + 1.2], [17, HEAD_TOP],
        [14.4, HEAD_TOP], [14.4, 71.6], [11.1, 74.7], [-11.1, 74.7], [-14.4, 71.6], [-14.4, HEAD_TOP]];
      add(gCover, extYZ(out, [], 2 * END_X), M.cover, { cap: 'sheet', label: 'Supap kapağı', info: 'Üst takımı kapatan ve yağı içeride tutan kapak.' });
      for (const s of [-1, 1]) add(gCover, extYZ([[-15.2, HEAD_TOP], [-15.2, 72], [-11.5, 75.5], [11.5, 75.5], [15.2, 72], [15.2, HEAD_TOP]], [], 0.8), M.cover, { pos: [s * 50.9, 0, 0], cap: 'sheet', label: 'Supap kapağı' });
    }

    // ============================================================ YAĞ KARTERİ
    const gPan = grp(R3, 'pan'); reg('pan', gPan); explode(gPan, [0, -38, 0]);
    {
      const outer = [[-18, -7.2], [-14, -27.5], [14, -27.5], [18, -7.2], [17, -7.2], [13.2, -26.7], [-13.2, -26.7], [-17, -7.2]];
      add(gPan, extYZ(outer, [], 100), M.pan, { cap: 'sheet', label: 'Yağ karteri', info: 'Motor yağı deposu. Yağ pompası buradan emer.' });
      for (const s of [-1, 1]) add(gPan, extYZ([[-18, -7.2], [-14, -27.5], [14, -27.5], [18, -7.2]], [], 0.8), M.pan, { pos: [s * 50.1, 0, 0], cap: 'sheet', label: 'Yağ karteri' });
      add(gPan, extYZ([[-13.1, -26.6], [13.1, -26.6], [14.9, -21.5], [-14.9, -21.5]], [], 98), M.oil, { label: 'Motor yağı', info: 'Yağ seviyesi.' }).renderOrder = 1100;
    }

    // ============================================================ KRANK MİLİ
    const gCrank = grp(R3, 'crank'); reg('crank', gCrank);
    {
      for (let k = 0; k < 7; k++) add(gCrank, cylX(5.2, 4.6, 40), M.crank, { pos: [MAIN_X(k), 0, 0], cap: 'crank', label: 'Krank mili ana muylusu', info: 'Ana yataklarda dönen ekseni oluşturur (Ø104).' });
      add(gCrank, cylX(4.5, 12, 32), M.crank, { pos: [-52.8, 0, 0], cap: 'crank', label: 'Krank mili ön ucu' });
      add(gCrank, cylX(4.6, 14, 32), M.crank, { pos: [51.8, 0, 0], cap: 'crank', label: 'Krank mili arka ucu' });
      add(gCrank, cylX(9.5, 2, 40), M.crank, { pos: [59, 0, 0], cap: 'crank', label: 'Krank mili volan flanşı' });
      // kol (web) + karşı ağırlık geometrileri (pim +y yönünde), sonra her kol için döndürülür
      const webPts = convexHull(circPts(0, 0, 5.8).concat(circPts(G.R, 0, 5.0)));
      const webG = extYZ(webPts, [], 2.6);
      const cwPts = [[0, 0]]; for (let i = 0; i <= 24; i++) cwPts.push(polarZY(11.0, Math.PI + (i / 24 - 0.5) * 2 * 56 * DEG));
      const cwG = extYZ(cwPts, [], 2.6);
      for (let j = 0; j < 6; j++) {
        const p = -G.alpha[j] * DEG, xj = X0(j);
        add(gCrank, cylX(4.2, 5.8, 36), M.crank, { pos: [xj, G.R * Math.cos(p), G.R * Math.sin(p)], cap: 'crank', label: 'Krank pimi', info: 'Biyel başının bağlandığı muylu (Ø84). Altı pim 120° faz farklıdır.' });
        for (const s of [-1, 1]) {
          add(gCrank, webG, M.crank, { pos: [xj + s * 4.2, 0, 0], rot: [p, 0, 0], cap: 'crank', label: 'Krank kolu', info: 'Pimi ana muyluya bağlar.' });
          add(gCrank, cwG, M.cw, { pos: [xj + s * 4.2, 0, 0], rot: [p, 0, 0], cap: 'crank', label: 'Karşı ağırlık', info: 'Dönen ve gidip gelen kütlelerin salınımını dengeler.' });
        }
      }
    }

    // ============================================================ PİSTON + BİYEL (her silindir)
    {
      const pProf = [[0, 7.6], [1.0, 7.65], [2.0, 7.9], [3.0, 8.4], [3.6, 9.0], [6.3, 9.0], [6.45, 8.8], [6.45, -5.4], [5.75, -5.4], [5.75, 6.5], [0, 6.5]];
      const pistonG = revolve(pProf, 56);
      const bowlG = revolve([[0, 7.6], [1.0, 7.65], [2.0, 7.9], [3.0, 8.4], [3.6, 9.0], [0, 9.0]], 40);
      const ringG = revolve([[6.1, -0.17], [6.55, -0.17], [6.55, 0.17], [6.1, 0.17]], 56);
      const bossG = cylX(2.9, 3.2, 28), webG2 = new T.BoxGeometry(3.2, 6.5, 5.0);
      const pinG = cylX(2.25, 10.8, 28);
      const L = G.L;
      const bigEnd = revolveX([[4.45, -2.7], [5.7, -2.7], [5.7, 2.7], [4.45, 2.7]], 40);
      const shell = revolveX([[4.2, -2.7], [4.45, -2.7], [4.45, 2.7], [4.2, 2.7]], 40);
      const smallEnd = revolveX([[2.25, -1.9], [3.3, -1.9], [3.3, 1.9], [2.25, 1.9]], 28);
      const wb = 5.2, wt = 3.4;
      const web = extYZ([[-wb / 2 + 0.1, 4.8], [wb / 2 - 0.1, 4.8], [wt / 2 - 0.1, L - 3.0], [-wt / 2 + 0.1, L - 3.0]], [], 1.1);
      const flL = extYZ([[-wb / 2, 4.8], [-wb / 2 + 0.8, 4.8], [-wt / 2 + 0.8, L - 3.0], [-wt / 2, L - 3.0]], [], 3.4);
      const flR = extYZ([[wb / 2, 4.8], [wb / 2 - 0.8, 4.8], [wt / 2 - 0.8, L - 3.0], [wt / 2, L - 3.0]], [], 3.4);
      const neckBig = extYZ([[-2.9, 4.0], [2.9, 4.0], [2.6, 6.0], [-2.6, 6.0]], [], 3.4);
      const neckSmall = extYZ([[-1.9, L - 4.0], [1.9, L - 4.0], [2.2, L - 2.0], [-2.2, L - 2.0]], [], 3.4);
      const rodMerged = mergeGeos([web, flL, flR, neckBig, neckSmall, bigEnd.clone(), smallEnd.translate(0, L, 0)]);
      const gasG = new T.CylinderGeometry(6.5, 6.5, 1, 40, 1, false);
      state.cyl.forEach((c, j) => {
        const gp = grp(R3, 'piston' + j); reg('piston', gp); gp.position.set(c.x, EP.TDC_Y, 0);
        add(gp, pistonG, M.piston, { cap: 'piston', cyl: j, label: 'Piston', info: 'Alüminyum/çelik piston, tepesinde yanma odası çukuru. Ø131, strok 158 mm.' });
        for (const y of [7.95, 6.9, 5.85]) add(gp, ringG, M.ring, { pos: [0, y, 0], cap: 'ring', label: 'Piston segmanı', info: 'Sızdırmazlık (2 kompresyon) ve yağ sıyırma (1 yağ) segmanları.' });
        for (const s of [-1, 1]) { add(gp, bossG, M.piston, { pos: [s * 3.9, 0, 0], cap: 'piston' }); add(gp, webG2, M.piston, { pos: [s * 3.9, 3.25, 0], cap: 'piston' }); }
        add(gp, pinG, M.pin, { cap: 'piston', label: 'Piston pimi', info: 'Pistonu biyelin küçük başına bağlar.' });
        const gas = new T.Mesh(gasG, gasMat()); gas.renderOrder = 1200; gas.userData.cyl = j; gas.userData.label = 'Yanma odası gazı'; gas.userData.info = 'Renk: mavi=emme havası, sarı=sıkıştırma, turuncu=yanma, gri=egzoz.';
        R3.add(gas); pickables.push(gas); reg('gas', gas); c.gas = gas;
        const bowl = new T.Mesh(bowlG, gasMat()); bowl.renderOrder = 1200; bowl.userData.cyl = j;
        gp.add(bowl); reg('gas', bowl); c.bowl = bowl;
        const gr = grp(R3, 'rod' + j); reg('rod', gr);
        add(gr, rodMerged, M.rod, { cap: 'rod', cyl: j, label: 'Biyel (piston kolu)', info: 'Pistonun doğrusal hareketini krank pimine döner harekete çevirir. Boy: 262 mm.' });
        add(gr, shell, M.bearing, { cap: 'bearing', label: 'Biyel yatağı' });
        c.piston = gp; c.rod = gr;
        // enjeksiyon spreyi
        const spray = new T.Mesh(new T.ConeGeometry(1, 1, 24, 1, true), new T.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
        spray.material.clippingPlanes = [clipPlane]; spray.renderOrder = 1300; spray.position.set(c.x, 42, 0); R3.add(spray); reg('gas', spray); c.spray = spray;
      });
    }

    // ============================================================ ZAMANLAMA DİŞLİLERİ + ARKA PLAKA
    const gGears = grp(R3, 'gears'); reg('gears', gGears); explode(gGears, [16, 0, 0]);
    const gears = [];
    {
      const m = 0.3, Ns = [36, 64, 48, 72, 72];
      const rp = Ns.map(n => n * m / 2);
      const pos = [[0, 0]];                         // (z,y)
      const p1 = [5.5, Math.sqrt(Math.pow(rp[0] + rp[1], 2) - 5.5 * 5.5)];
      const d12 = rp[1] + rp[2], p2z = -2.0, p2 = [p2z, p1[1] + Math.sqrt(d12 * d12 - Math.pow(p2z - p1[0], 2))];
      const p4 = [0, CAM_Y], d23 = rp[2] + rp[3], d34 = rp[3] + rp[4];
      const dx = p4[0] - p2[0], dy = p4[1] - p2[1], D = Math.hypot(dx, dy);
      const aa = (d23 * d23 - d34 * d34 + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, d23 * d23 - aa * aa));
      const mx = p2[0] + aa * dx / D, my = p2[1] + aa * dy / D;
      const p3 = [mx + hh * dy / D, my - hh * dx / D];
      const P = [pos[0], p1, p2, p3, p4];
      const dirs = [1, -1, 1, -1, 1];
      // diş fazlarını geçerli kavraşma için hesapla
      const ang0 = [0]; let fracPrev = 0;
      const deltas = [0];
      for (let i = 1; i < 5; i++) {
        const a = P[i - 1], b = P[i];
        const psi = Math.atan2(b[0] - a[0], b[1] - a[1]);        // +y'den +z'ye
        const pitchA = TAU / Ns[i - 1], pitchB = TAU / Ns[i];
        const fa = mod((psi - deltas[i - 1]) / pitchA, 1);
        const fb = mod(fa + 0.5, 1);
        deltas[i] = psi + Math.PI - fb * pitchB;
      }
      const names = ['Krank dişlisi', 'Ara dişli 1', 'Ara dişli 2', 'Ara dişli 3', 'Kam mili dişlisi'];
      for (let i = 0; i < 5; i++) {
        const g = grp(gGears, 'gear' + i); g.position.set(GEAR_X, P[i][1], P[i][0]);
        const holes = [{ circle: [0, 0, i === 4 ? 2.0 : (i === 0 ? 4.6 : 1.3)] }];
        if (i > 0 && i !== 4) for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; holes.push({ circle: [rp[i] * 0.58 * Math.sin(a), rp[i] * 0.58 * Math.cos(a), rp[i] * 0.2] }); }
        const body = add(g, extYZ(gearOutline(Ns[i], rp[i], m), holes, 3.0), M.gear, { cap: 'gear', label: names[i], info: Ns[i] + ' diş. Kam mili krank hızının yarısında döner (diş oranı 1:2).' });
        gears.push({ g, N: Ns[i], dir: dirs[i], delta: deltas[i], body });
      }
      // kam dişlisi mile geçmeli: gövde mil açısına göre ofsetli, delta dönen grupta tutulur
      // arka plaka
      const gPlate = grp(R3, 'gearplate'); reg('gears', gPlate); explode(gPlate, [8, 0, 0]);
      const plate = extYZ([[-17, -8], [17, -8], [17, 76], [-17, 76]], [{ circle: [0, 0, 5.6] }, { circle: [0, CAM_Y, 3.0] }], 1.2);
      add(gPlate, plate, M.gearPlate, { pos: [51.3, 0, 0], cap: 'sheet', label: 'Dişli kutusu arka plakası', info: 'Dişli takımını blok ucuna bağlar.' });
      for (let i = 1; i <= 3; i++) add(gPlate, cylX(1.2, 3.2, 20), M.camShaft, { pos: [52.9, P[i][1], P[i][0]], cap: 'gear', label: 'Ara dişli mili' });
      state.gearP = P;
    }

    // ============================================================ VOLAN + ÖN DAMPER
    const gFly = grp(R3, 'fly'); reg('flywheel', gFly); explode(gFly, [34, 0, 0]);
    {
      add(gFly, revolveX([[0, 58], [24.8, 58], [24.8, 64], [20.5, 64], [20.5, 61], [9, 61], [9, 63], [0, 63]], 72), M.fly, { cap: 'crank', label: 'Volan', info: 'Ağır dönen kütle; güç strokları arasında dönüşü düzgünleştirir. Dişlisine marş motoru girer.' });
      const n = 150, tg = new T.BoxGeometry(4.5, 1.3, 0.95);
      const im = new T.InstancedMesh(tg, M.ringGear, n), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      for (let i = 0; i < n; i++) { const a = i / n * TAU; e.set(a, 0, 0); q.setFromEuler(e); mt.compose(new T.Vector3(61.5, 25.5 * Math.cos(a), 25.5 * Math.sin(a)), q, new T.Vector3(1, 1, 1)); im.setMatrixAt(i, mt); }
      im.renderOrder = 1000; im.frustumCulled = false; im.userData.label = 'Volan dişlisi (marş)'; pickables.push(im); gFly.add(im);
    }
    const gDamp = grp(R3, 'damper'); reg('damper', gDamp); explode(gDamp, [-30, 0, 0]);
    {
      const prof = [[0, -63], [11, -63]]; for (let i = 0; i < 4; i++) { const x = -62.3 + i * 1.1; prof.push([11, x], [10.4, x + 0.45], [11, x + 0.9]); }
      prof.push([11, -58], [14, -58], [14, -52], [0, -52]);
      add(gDamp, revolveX(prof, 64), M.damper, { cap: 'crank', label: 'Titreşim damperi / kasnak', info: 'Krank milinin burulma titreşimini sönümler; V-kayış kasnağını taşır.' });
    }

    // ============================================================ EMME MANİFOLDU / EGZOZ MANİFOLDU / TURBO
    const gInt = grp(R3, 'intake'); reg('manifold', gInt); explode(gInt, [0, 8, 34]);
    const gExh = grp(R3, 'exhaust'); reg('manifold', gExh); explode(gExh, [0, 8, -34]);
    const gTurbo = grp(R3, 'turbo'); reg('turbo', gTurbo); explode(gTurbo, [-26, 0, -16]);
    {
      const tubeZ = (rIn, rOut, z0, z1) => { const g = tubeY(rIn, rOut, 0, z1 - z0, 40); g.rotateX(Math.PI / 2); g.translate(0, 0, z0); return g; };
      const diskX = (r, x, t) => cylX(r, t, 40).translate(x, 0, 0);
      const ductO = rectPts(-4.8, -2.5, 4.8, 2.5), ductI = [{ pts: rectPts(-4.2, -1.9, 4.2, 1.9) }];
      const flangeO = rectPts(-5.9, -3.5, 5.9, 3.5);
      // emme
      add(gInt, tubeX(3.6, 4.2, 118.5), M.intake, { pos: [-14.75, PORT_Y, 25], cap: 'pipe', label: 'Emme manifoldu', info: 'Turbodan gelen basınçlı havayı altı silindire dağıtır.' });
      add(gInt, diskX(4.2, 44.5, 0.8), M.intake, { pos: [0, PORT_Y, 25], cap: 'pipe', label: 'Emme manifoldu' });
      add(gInt, diskX(4.2, -74.5, 0.8), M.intake, { pos: [0, PORT_Y, 25], cap: 'pipe', label: 'Emme manifoldu' });
      add(gInt, tubeZ(3.6, 4.2, -38, 25), M.intake, { pos: [-74, PORT_Y, 0], cap: 'pipe', label: 'Şarj havası borusu', info: 'Kompresör çıkışından emme manifolduna giden basınçlı hava hattı.' });
      for (let j = 0; j < 6; j++) {
        add(gInt, extXY(ductO, ductI, 5.5, 17.0), M.intake, { pos: [X0(j), PORT_Y, 0], cap: 'pipe', label: 'Emme dirseği' });
        add(gInt, extXY(flangeO, ductI, 0.7, 17.0), M.intake, { pos: [X0(j), PORT_Y, 0], cap: 'pipe', label: 'Emme flanşı' });
      }
      // egzoz
      add(gExh, tubeX(3.6, 4.2, 102), M.exhaust, { pos: [-7, PORT_Y, -25], cap: 'pipe', label: 'Egzoz manifoldu', info: 'Silindirlerden çıkan sıcak gazı (~600–700 °C) turbo türbinine toplar.' });
      add(gExh, diskX(4.2, 44.4, 0.8), M.exhaust, { pos: [0, PORT_Y, -25], cap: 'pipe', label: 'Egzoz manifoldu' });
      for (let j = 0; j < 6; j++) {
        add(gExh, extXY(ductO, ductI, 5.5, -22.5), M.exhaust, { pos: [X0(j), PORT_Y, 0], cap: 'pipe', label: 'Egzoz dirseği' });
        add(gExh, extXY(flangeO, ductI, 0.7, -17.7), M.exhaust, { pos: [X0(j), PORT_Y, 0], cap: 'pipe', label: 'Egzoz flanşı' });
      }
      add(gExh, tubeZ(3.2, 3.9, -31.5, -25), M.exhaust, { pos: [TURBO.x, PORT_Y, 0], cap: 'pipe', label: 'Türbin giriş borusu', info: 'Egzoz gazı türbin çarkına teğet girer.' });
      // turbo gövdeleri
      const housing = (r1, rOut, x0, x1, hole) => revolveX([[hole, x1], [rOut, x1], [rOut, x0], [2.0, x0], [2.0, x0 + 0.8], [rOut - 0.8, x0 + 0.8], [rOut - 0.8, x1 - 0.8], [hole, x1 - 0.8]], 56);
      add(gTurbo, housing(0, 9.4, -62, -54, 3.0), M.turbo, { pos: [0, TURBO.y, TURBO.z], cap: 'turbo', label: 'Türbin gövdesi', info: 'Egzoz enerjisini milin dönüşüne çevirir.' });
      add(gTurbo, housing(0, 10.4, -78, -70, 4.6), M.turbo, { pos: [0, TURBO.y, TURBO.z], cap: 'turbo', label: 'Kompresör gövdesi', info: 'Dönen kompresör çarkı havayı sıkıştırır (~2–3 bar).' });
      add(gTurbo, cylX(4.2, 8, 36), M.turbo, { pos: [-66, TURBO.y, TURBO.z], cap: 'turbo', label: 'Turbo yatak gövdesi' });
      add(gTurbo, tubeX(2.6, 3.3, 8), M.exhaust, { pos: [-50, TURBO.y, TURBO.z], cap: 'pipe', label: 'Türbin çıkışı' });
      add(gTurbo, tubeY(2.6, 3.3, TURBO.y - 24, TURBO.y), M.exhaust, { pos: [-46.5, 0, TURBO.z], cap: 'pipe', label: 'Egzoz çıkış borusu' });
      add(gTurbo, tubeX(3.8, 4.5, 12), M.intake, { pos: [-84, TURBO.y, TURBO.z], cap: 'pipe', label: 'Hava giriş borusu', info: 'Filtreden gelen temiz hava buradan girer.' });
      // turbo çarkları
      const mkWheel = (r, nb, len, hub) => {
        const g = new T.Group(); add(g, revolveX([[0, -len / 2], [hub, -len / 2], [hub * 0.55, len / 2], [0, len / 2]], 24), M.wheel, { cap: 'turbo' });
        const bg = new T.BoxGeometry(len * 0.8, r - hub * 0.8, 0.28); bg.rotateY(0.5); bg.translate(0, (r + hub * 0.8) / 2, 0);
        for (let i = 0; i < nb; i++) { const m = add(g, bg, M.wheel, { rot: [i / nb * TAU, 0, 0] }); }
        return g;
      };
      const turbine = mkWheel(5.4, 12, 3.0, 2.0), comp = mkWheel(7.0, 9, 3.4, 2.2);
      const gSpin = grp(gTurbo, 'spin'); gSpin.position.set(0, TURBO.y, TURBO.z);
      turbine.position.x = -58; comp.position.x = -74; gSpin.add(turbine, comp);
      add(gSpin, cylX(1.0, 26, 16), M.camShaft, { pos: [-66, 0, 0], label: 'Turbo mili', cap: 'turbo' });
      turbine.userData.label = 'Türbin çarkı'; comp.userData.label = 'Kompresör çarkı';
      turbine.traverse(o => { if (o.isMesh) { o.userData.label = 'Türbin çarkı'; pickables.push(o); } });
      comp.traverse(o => { if (o.isMesh) { o.userData.label = 'Kompresör çarkı'; pickables.push(o); } });
      state.turboSpin = gSpin;
    }


    // ============================================================ YARDIMCI DONANIM (dış görünüm)
    const gAcc = grp(R3, 'acc'); reg('acc', gAcc); explode(gAcc, [0, 0, -22]);
    {
      const mStarter = mat(0x4b5662, { metal: 0.6, rough: 0.5, ghost: true }), mBelt = mat(0x15181c, { metal: 0.1, rough: 0.9 });
      const mFilterO = mat(0x2d6fd6, { metal: 0.5, rough: 0.45, ghost: true }), mFilterF = mat(0x2faa6e, { metal: 0.5, rough: 0.45, ghost: true });
      const mAlt = mat(0x9aa4ae, { metal: 0.7, rough: 0.4, ghost: true });
      const ac = (g, m, o) => add(gAcc, g, m, Object.assign({ cap: 'sheet' }, o));
      // marş motoru (volan dişlisine kavrar)
      ac(cylX(6.2, 22, 32), mStarter, { pos: [45, 0, -28.7], label: 'Marş motoru', info: 'Volan dişlisine kavrayarak motoru ilk hareketle döndürür.' });
      ac(cylX(3.6, 15, 24), mStarter, { pos: [44, 8.8, -28.7], label: 'Marş selenoidi' });
      ac(cylX(2.9, 6, 24), mStarter, { pos: [58.5, 0, -28.7], label: 'Marş motoru' });
      ac(cylX(2.4, 3.2, 20), M.ringGear, { pos: [61.5, 0, -28.7], label: 'Marş pinyonu' });
      ac(boxG(6, 14, 14), mStarter, { pos: [53, 0, -22.7], label: 'Marş bağlantı flanşı' });
      // yağ filtresi ve yakıt filtresi
      ac(boxG(18, 16, 4.2), mStarter, { pos: [16, 3, -19.2], label: 'Yağ filtresi bloğu' });
      add(gAcc, revolve([[0, -9], [5.4, -9], [5.4, 11], [0, 11]], 40), mFilterO, { pos: [16, 0, -25.2], cap: 'sheet', label: 'Yağ filtresi', info: 'Yağdaki metal ve kurum parçacıklarını süzer.' });
      add(gAcc, revolve([[0, -8], [4.3, -8], [4.3, 8], [0, 8]], 36), mFilterF, { pos: [34, 4, -24.0], cap: 'sheet', label: 'Yakıt filtresi', info: 'Yakıtı enjektörlere gitmeden önce temizler ve sudan ayırır.' });
      // alternatör + kayış
      ac(cylX(7, 13, 32), mAlt, { pos: [-52.5, 10, -30], label: 'Alternatör', info: 'Kayışla tahrik edilir; aküyü şarj eder, elektrik sistemini besler.' });
      ac(cylX(4.4, 3, 28), M.damper, { pos: [-60.5, 10, -30], label: 'Alternatör kasnağı' });
      const hull = (r1, r2) => convexHull(circPts(0, 0, r1, 40).concat(circPts(10, -30, r2, 32)));
      add(gAcc, extYZ(hull(11.7, 4.9), [{ pts: hull(11.0, 4.2) }], 2.4), mBelt, { pos: [-60.5, 0, 0], cap: 'sheet', label: 'V-kayış (çok kanallı)', info: 'Krank kasnağından alternatör/su pompası/klimaya güç aktarır.' });
      // yakıt filtresi (emme tarafı) ve yağ çubuğu borusu
      add(gAcc, revolve([[0, -8], [4.2, -8], [4.2, 9], [0, 9]], 36), mFilterF, { pos: [-24, 6, 24.5], cap: 'sheet', label: 'Yakıt ön filtresi' });
    }

    // ============================================================ HAVA / GAZ AKIŞ PARÇACIKLARI
    const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
    const gFlow = grp(R3, 'flows'); reg('flows', gFlow);
    function stream(n, color, size) {
      const geo = new T.BufferGeometry(); const pos = new Float32Array(n * 3); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.PointsMaterial({ color, size, map: dot, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, blending: T.AdditiveBlending, toneMapped: false });
      m.clippingPlanes = [clipPlane];
      const pts = new T.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 1400; gFlow.add(pts);
      const s = new Float32Array(n), jit = new Float32Array(n * 3), side = new Float32Array(n);
      for (let i = 0; i < n; i++) { s[i] = Math.random(); jit[i * 3] = (Math.random() - 0.5); jit[i * 3 + 1] = (Math.random() - 0.5); jit[i * 3 + 2] = (Math.random() - 0.5); side[i] = Math.random() < 0.5 ? -1 : 1; }
      return { n, pos, geo, mat: m, s, jit, side, pts };
    }
    function polyAt(pts, u, out) {
      // pts: [[x,y,z],...] eşit olmayan uzunluk; u 0..1 uzunluğa göre
      let tot = 0; const L = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); L.push(l); tot += l; }
      let d = u * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
      const k = L[i] > 1e-9 ? d / L[i] : 0, a = pts[i], b = pts[i + 1];
      out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
    }
    const flowMain = {
      int: { st: stream(70, 0x7ec8ff, 1.5), path: [[-96, 43, TURBO.z], [-72, 43, TURBO.z], [-74, PORT_Y, TURBO.z + 4], [-74, PORT_Y, 25], [44, PORT_Y, 25]] },
      exh: { st: stream(90, 0xffa047, 1.7), path: [[44, PORT_Y, -25], [-58, PORT_Y, -25], [-58, PORT_Y, -33], [-58, 45, TURBO.z], [-55, 43, TURBO.z], [-46.5, 43, TURBO.z], [-46.5, 16, TURBO.z]] },
    };
    const o3 = [0, 0, 0];
    function stepMain(dt, k) {
      for (const f of Object.values(flowMain)) {
        const st = f.st, a = st.pos;
        for (let i = 0; i < st.n; i++) {
          st.s[i] = (st.s[i] + dt * 0.11 * k) % 1; polyAt(f.path, st.s[i], o3);
          a[i * 3] = o3[0] + st.jit[i * 3] * 3.0; a[i * 3 + 1] = o3[1] + st.jit[i * 3 + 1] * 3.0; a[i * 3 + 2] = o3[2] + st.jit[i * 3 + 2] * 3.0;
        }
        st.geo.attributes.position.needsUpdate = true; st.mat.opacity = Math.min(0.95, 0.25 + 0.6 * k);
      }
    }
    state.cyl.forEach((c, j) => { c.fi = stream(18, 0x7ec8ff, 1.3); c.fe = stream(18, 0xff9a3c, 1.4); });
    function stepCyl(c, dt, k, lI, lE, top) {
      const x = c.x;
      for (const [st, lf, isInt] of [[c.fi, lI / TIM.int.lift, true], [c.fe, lE / TIM.exh.lift, false]]) {
        const a = st.pos, sp = dt * (0.35 + 1.2 * lf) * k * (isInt ? 0.9 : 1.1);
        st.mat.opacity = Math.min(0.95, lf * 4);
        if (lf < 0.02) { st.geo.attributes.position.needsUpdate = false; continue; }
        const pp = [[], []];
        for (const sd of [0, 1]) {
          const sx = sd ? 1 : -1;
          pp[sd] = isInt
            ? [[x, PORT_Y, 24], [x, PORT_Y, 6], [x + sx * VX, PORT_Y - 0.4, VZ], [x + sx * VX, HB + 0.4, VZ], [x + sx * 1.4, Math.max(top + 2.5, 32), 1.2], [x + sx * 0.5, Math.max(top + 1.2, 30), 0]]
            : [[x + sx * 0.5, Math.max(top + 1.2, 30), 0], [x + sx * 1.4, Math.max(top + 2.5, 32), -1.2], [x + sx * VX, HB + 0.4, -VZ], [x + sx * VX, PORT_Y - 0.4, -VZ], [x, PORT_Y, -6], [x, PORT_Y, -24]];
        }
        for (let i = 0; i < st.n; i++) {
          st.s[i] = (st.s[i] + sp) % 1; polyAt(pp[st.side[i] > 0 ? 1 : 0], st.s[i], o3);
          a[i * 3] = o3[0] + st.jit[i * 3] * 0.9; a[i * 3 + 1] = o3[1] + st.jit[i * 3 + 1] * 0.9; a[i * 3 + 2] = o3[2] + st.jit[i * 3 + 2] * 0.9;
        }
        st.geo.attributes.position.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------ ışık / ortam: app.js
    // ============================================================ API
    function gasLook(phi, p, pr) {
      const phs = phi > 360 ? phi - 720 : phi;               // -360..360 (0 = ateşleme TDC)
      let r, g, b, a;
      if (phi >= 180 && phi < 360) {                        // egzoz
        const h = Math.exp(-(phi - 180) / 45);
        r = lerp(0.50, 1.0, h); g = lerp(0.47, 0.42, h); b = lerp(0.45, 0.10, h); a = 0.34 + 0.2 * h;
      } else if (phi >= 360 && phi < 580) { r = 0.22; g = 0.55; b = 1.0; a = 0.30; }
      else if (phs < -3) {                                  // sıkıştırma
        const t = clamp((p - pr.pBoost) / (pr.at(716) - pr.pBoost + 1e-6));
        r = lerp(0.22, 1.0, t); g = lerp(0.55, 0.78, t); b = lerp(1.0, 0.18, t); a = 0.30 + 0.25 * t;
      } else {                                              // yanma + genleşme
        const bf = pr.burn(phs), rate = clamp(pr.burnRate(phs) * 45, 0, 1), fade = 1 - smooth(60, 175, phs);
        const glow = clamp((0.35 + 0.65 * bf) * fade + 0.5 * rate * fade, 0, 1.2);
        const cool = smooth(5, 135, phs), ld = 0.45 + 0.55 * state.pressure.load;
        r = 1.0; g = lerp(0.82, 0.30, cool); b = lerp(0.35, 0.06, cool);
        a = 0.25 + 0.60 * Math.min(1, glow) * ld; const k = 0.55 + 0.45 * Math.min(1, glow); r *= k; g *= k; b *= k;
      }
      return [r, g, b, a];
    }
    function update(thetaDeg, dt, flowK) {
      dt = dt || 0; flowK = flowK === undefined ? 1 : flowK;
      const th = thetaDeg * DEG, pr = state.pressure;
      gCrank.rotation.x = th; gFly.rotation.x = th; gDamp.rotation.x = th; gCam.rotation.x = th / 2;
      state.turboSpin.rotation.x = th * (6 + 10 * pr.load);
      const Rr = G.R, L = G.L;
      for (let j = 0; j < 6; j++) {
        const c = state.cyl[j];
        const phi = mod(thetaDeg - c.fire, 720), psi = (thetaDeg - c.alpha) * DEG;
        const s = Math.sin(psi), co = Math.cos(psi), yPin = Rr * co + Math.sqrt(L * L - Rr * Rr * s * s);
        c.piston.position.y = yPin;
        c.rod.position.set(c.x, Rr * co, Rr * s); c.rod.rotation.x = Math.atan2(-Rr * s, yPin - Rr * co);
        const top = yPin + G.CH, h = Math.max(0.02, HB - top);
        c.gas.scale.y = h; c.gas.position.set(c.x, top + h / 2, 0);
        // supap / külbütör
        const cI = EP.camLiftInt(phi), cE = EP.camLiftExh(phi), cJ = EP.injCamLift(phi);
        const lI = cI * ROCK.valveRatio, lE = cE * ROCK.valveRatio, lJ = cJ * ROCK.injRatio;
        c.rock.int.rotation.x = -cI / ROCK.pivotZ; c.rock.exh.rotation.x = cE / ROCK.pivotZ; c.rock.inj.rotation.x = cJ / (ROCK.injPivotZ - ROCK.injRollerZ);
        for (const v of c.valves.int) v.position.y = HB - lI;
        for (const v of c.valves.exh) v.position.y = HB - lE;
        c.bridges.int.position.y = BRIDGE_Y - lI; c.bridges.exh.position.y = BRIDGE_Y - lE;
        c.plunger.position.y = -lJ;
        for (const sp of c.springs.int) sp.scale.y = (5.2 - lI) / 5.2;
        for (const sp of c.springs.exh) sp.scale.y = (5.2 - lE) / 5.2;
        // gaz görünümü
        const p = pr.at(phi), look = gasLook(phi, p, pr);
        for (const gm of [c.gas.material, c.bowl.material]) { gm.color.setRGB(look[0], look[1], look[2]); gm.opacity = look[3]; }
        // püskürtme
        const inj = phi >= TIM.inj.sprayStart || phi <= (TIM.inj.sprayEnd - 720);
        const u = inj ? clamp(((phi >= TIM.inj.sprayStart ? phi : phi + 720) - TIM.inj.sprayStart) / (TIM.inj.sprayEnd - TIM.inj.sprayStart)) : -1;
        if (u >= 0) {
          const k = Math.sin(u * Math.PI), l = Math.max(0.6, (yPin + 8.0) - 43.25 < 0 ? 0.6 : 1);
          c.spray.visible = true; c.spray.material.opacity = 0.75 * k * (0.35 + 0.65 * pr.load);
          const bot = yPin + 8.2, hgt = Math.max(0.4, 43.25 - bot);
          c.spray.scale.set(3.4 * (0.3 + u), hgt, 3.4 * (0.3 + u)); c.spray.position.set(c.x, 43.25 - hgt / 2, 0);
        } else c.spray.visible = false;
        c.phi = phi; c.p = p;
        if (gFlow.visible) stepCyl(c, dt > 0 ? dt : 1e-4, dt > 0 ? flowK : 0, lI, lE, top);
      }
      if (gFlow.visible) stepMain(dt > 0 ? dt : 1e-4, dt > 0 ? flowK * (0.4 + 0.8 * pr.load) : 0);
      // dişliler
      const t0 = thetaDeg * DEG;
      gears.forEach((gr, i) => { gr.g.rotation.x = gr.dir * t0 * gears[0].N / gr.N; gr.body.rotation.x = gr.delta; });
    }

    function setClip(cfg) {
      Object.assign(state.clip, cfg);
      const c = state.clip, n = new T.Vector3(), ax = c.axis;
      n.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
      const flip = ax === 'x' ? !c.flip : c.flip;   // varsayılan: z,y ekseninde değer <= konum kalır; x'te (ön görünüm için) değer >= konum kalır
      if (!flip) n.negate();
      clipPlane.normal.copy(n); clipPlane.constant = c.on ? (flip ? -c.pos : c.pos) : 1e5;
      refreshCaps();
    }
    const isVis = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
    function refreshCaps() {
      const c = state.clip, p0 = new T.Vector3();
      clipPlane.coplanarPoint(p0);
      for (const k of Object.keys(capGroups)) {
        const cg = capGroups[k];
        cg.plane.visible = c.on && cg.meshes.some(isVis);
        for (const sm of cg.stencils) sm.visible = c.on;
        cg.plane.position.copy(p0);
        cg.plane.lookAt(p0.x + clipPlane.normal.x, p0.y + clipPlane.normal.y, p0.z + clipPlane.normal.z);
      }
    }
    function setVisible(key, v) { (visGroups[key] || []).forEach(o => o.visible = v); refreshCaps(); }
    function setExplode(e) { state.explodeAmt = e; gFlow.position.y = 0; explodables.forEach(x => x.g.position.set(x.base.x + x.v[0] * e, x.base.y + x.v[1] * e, x.base.z + x.v[2] * e)); refreshCaps(); }
    function setXray(on) {
      state.xray = on;
      allMats.forEach(m => {
        if (!m.userData.ghost) return;
        if (on) { m.transparent = true; m.opacity = Math.min(m.userData.baseOpacity, 0.16); m.depthWrite = false; }
        else { m.transparent = m.userData.baseTransparent; m.opacity = m.userData.baseOpacity; m.depthWrite = m.userData.baseDepthWrite; }
        m.needsUpdate = true;
      });
    }
    function setLoad(l) { state.pressure = EP.buildPressure(l); }
    function pickHit(hits) {          // kesitte yok sayılan yarıdan gelen vuruşları ele
      for (const h of hits) {
        if (state.clip.on && clipPlane.distanceToPoint(h.point) < -0.01) continue;
        let o = h.object; while (o && !o.userData.label) o = o.parent;
        if (o && isVis(h.object)) return { object: h.object, label: o.userData.label, info: o.userData.info, cyl: h.object.userData.cyl !== undefined ? h.object.userData.cyl : o.userData.cyl };
      }
      return null;
    }
    return { root: R3, state, update, setClip, setVisible, setExplode, setXray, setLoad, pickables, pickHit, clipPlane, capGroups, refreshCaps, visGroups,
      get pressure() { return state.pressure; }, cyl: state.cyl };
  }

  root.EngineModel = { build, constants: { X0, MAIN_X, CAM_Y, PORT_Y, HEAD_TOP, END_X, TURBO } };
})(window);
