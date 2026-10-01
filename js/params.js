/* 12.8 L sıralı 6 silindir ağır vasıta dizel motoru — ölçüler, kinematik, supap zamanlaması, silindir basıncı.
   Birim: cm (sahne birimi), açılar derece (aksi belirtilmedikçe). Saf fonksiyonlar; Node'da da çalışır. */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const mod = (a, n) => ((a % n) + n) % n;

  // ---- Temel ölçüler (D13 sınıfı: 131 x 158 mm = 12.78 L) ----
  const G = {
    B: 13.1,            // silindir çapı
    S: 15.8,            // strok
    R: 7.9,             // krank yarıçapı = S/2
    L: 26.2,            // biyel boyu (merkezden merkeze)
    P: 15.6,            // silindir aralığı
    N: 6,
    CH: 9.0,            // piston pim ekseninden tepe yüzeyine
    HEAD_BOTTOM: 43.45, // silindir kapağı alt yüzeyi (y)
    CR: 17.0,           // sıkıştırma oranı
    FIRE_ORDER: [1, 5, 3, 6, 2, 4],
  };
  G.vdCyl = Math.PI / 4 * G.B * G.B * G.S;     // cc
  G.vdTotal = G.vdCyl * G.N / 1000;            // litre

  // Ateşleme sırasına göre her silindirin ateşleme TDC açısı (krank derecesi, 0..720)
  const fire = new Array(G.N);
  G.FIRE_ORDER.forEach((cyl, k) => { fire[cyl - 1] = k * 120; });
  G.fire = fire;                               // [0,480,240,600,120,360]
  G.alpha = fire.map(f => f % 360);            // krank pimi fazı (TDC'ye geldiği krank açısı)

  // ---- Supap / enjektör zamanlaması (silindir çevrimi φ: 0 = ateşleme TDC'si, 720° çevrim) ----
  const TIM = {
    int: { open: 348, close: 580, lift: 1.30 },   // EVO/IVC: 12° BTDC açılır, 40° ABDC kapanır
    exh: { open: 140, close: 372, lift: 1.35 },   // 40° BBDC açılır, 12° ATDC kapanır
    inj: { start: 600, peak: 725, end: 795, lift: 1.0, sprayStart: 706, sprayEnd: 740 },
  };
  // Külbütör oranları (valf ucundaki hareket / kam yüksekliği)
  const ROCK = { pivotZ: 9.0, pushZ: 3.0, injPivotZ: 12.0, injRollerZ: 2.0 };
  ROCK.valveRatio = (ROCK.pivotZ - ROCK.pushZ) / ROCK.pivotZ;          // 0.667
  ROCK.injRatio = ROCK.injPivotZ / (ROCK.injPivotZ - ROCK.injRollerZ);  // 1.2

  function bump(u) {
    if (u <= 0 || u >= 1) return 0;
    const s = (1 - Math.cos(2 * Math.PI * u)) / 2;
    return Math.pow(s, 0.75);
  }
  function valveLift(phi, t) {              // supap yüksekliği (cm)
    const span = t.close - t.open;
    return t.lift * bump(mod(phi - t.open, 720) / span);
  }
  function injCamLift(phi) {                // pompa-enjektör kam yüksekliği (cm)
    const t = TIM.inj, p = mod(phi - t.start, 720), rise = t.peak - t.start, fall = t.end - t.peak;
    if (p <= 0 || p >= rise + fall) return 0;
    if (p < rise) { const u = p / rise; return t.lift * (0.35 * (1 - Math.cos(Math.PI * u)) / 2 + 0.65 * u * u); }
    const u = (p - rise) / fall;
    return t.lift * (1 + Math.cos(Math.PI * u)) / 2;
  }
  const camLiftInt = phi => valveLift(phi, TIM.int) / ROCK.valveRatio;
  const camLiftExh = phi => valveLift(phi, TIM.exh) / ROCK.valveRatio;

  // ---- Piston kinematiği ----
  function pistonY(psiRad) {     // pim ekseninin krank eksenine uzaklığı
    const s = Math.sin(psiRad), c = Math.cos(psiRad);
    return G.R * c + Math.sqrt(G.L * G.L - G.R * G.R * s * s);
  }
  const TDC_Y = G.R + G.L;       // pim ekseni üst ölü noktada

  // Strok adı: 0 İş, 1 Egzoz, 2 Emme, 3 Sıkıştırma
  function strokeIndex(phi) { return Math.floor(mod(phi, 720) / 180); }
  const STROKE_NAMES = ['İş (Genleşme)', 'Egzoz', 'Emme', 'Sıkıştırma'];

  // ---- Silindir basıncı (tek bölgeli model, Wiebe yanma) ----
  function buildPressure(load) {            // load 0..1
    load = Math.min(1, Math.max(0.05, load));
    const A = Math.PI / 4 * G.B * G.B, Vc = G.vdCyl / (G.CR - 1);
    const V = phi => { const p = phi * DEG; return Vc + A * (G.R + G.L - pistonY(p)); };
    const pBoost = 1.15 + 1.45 * load;       // bar (mutlak, emme manifoldu)
    const pExh = 1.1 + 1.2 * load;
    const Qtot = 1300 + 8600 * load;         // J / çevrim / silindir
    const gamma = 1.31;
    const xs = -3, dur = 26 + 12 * load, a = 6.9, m = 0.85;
    const wiebe = phi => { const d = (phi - xs) / dur; return d <= 0 ? 0 : 1 - Math.exp(-a * Math.pow(d, m + 1)); };
    const step = 0.25, tbl = new Float32Array(720);
    // IVC (580) -> EVO (140+720): sıkıştırma + yanma + genleşme
    let p = pBoost, phi = 580, pEVO = 0, pk = 0;
    const out = new Float32Array(1441);      // 0.5° çözünürlük
    const store = (ph, pv) => { const i = Math.round(mod(ph, 720) * 2); out[i] = pv; };
    store(phi, p);
    while (phi < 860 - 1e-9) {
      const ph1 = phi + step;
      const vA = V(phi), vB = V(ph1);
      const dV = vB - vA, Vm = (vA + vB) / 2;
      const dx = wiebe(mod(ph1 + 360, 720) - 360) - wiebe(mod(phi + 360, 720) - 360);
      const dQ = Qtot * Math.max(0, dx);
      p += -gamma * p * dV / Vm + 10 * (gamma - 1) * dQ / Vm;
      phi = ph1; store(phi, p);
      if (p > pk) pk = p;
      if (Math.abs(mod(phi, 720) - 140) < step / 2) pEVO = p;
    }
    // Egzoz boşalma ve gaz değişimi
    for (let ph = 140; ph < 580; ph += 0.5) {
      let v;
      if (ph < 372) {
        const k = (ph - 140);
        v = pExh + (pEVO - pExh) * Math.exp(-k / 11);
        if (ph > 340) v = v + (pBoost - v) * ((ph - 340) / 32) * 0.5;
      } else if (ph < 540) v = pBoost * 0.97;
      else v = pBoost;
      store(ph, v);
    }
    // Aralıkları doldur (0.5° adımda kayma olmaması için)
    for (let i = 1; i < 1441; i++) if (!out[i]) out[i] = out[i - 1];
    // IMEP (bar) — kapalı integral p dV (çevrim boyunca)
    let W = 0;
    for (let ph = 0; ph < 720; ph += 0.5) {
      const p0 = out[Math.round(ph * 2)], p1 = out[Math.round(mod(ph + 0.5, 720) * 2)];
      W += (p0 + p1) / 2 * (V(ph + 0.5) - V(ph));
    }
    const imep = W / G.vdCyl;                // bar (cc*bar / cc)
    return {
      table: out, peak: pk, pBoost, imep, load,
      at(phi) {
        const x = mod(phi, 720) * 2, i = Math.floor(x), f = x - i;
        return out[i] * (1 - f) + out[Math.min(i + 1, 1440)] * f;
      },
      burn: phi => wiebe(mod(phi + 360, 720) - 360),
      burnRate(phi) { return (wiebe(mod(phi + 360, 720) - 360 + 1) - wiebe(mod(phi + 360, 720) - 360 - 1)) / 2; },
      V, Vc,
      // Fren gücü / tork (yaklaşık): sabit IMEP + mekanik kayıplar; yüksek devirde dolum azalır (tork eğrisi)
      power(rpm) {
        const tf = rpm <= 1400 ? (rpm < 1000 ? 0.88 + 0.12 * (rpm - 600) / 400 : 1) : Math.max(0.55, 1 - 0.22 * (rpm - 1400) / 500 - (rpm > 1900 ? 0.18 * (rpm - 1900) / 300 : 0));
        const Pind = imep * 1e5 * (G.vdTotal * 1e-3) * (rpm / 120) / 1000;   // kW (gösterge)
        const Nm = Pind * 0.88 * 1000 / (rpm * 2 * Math.PI / 60) * tf;
        const kW = Nm * rpm * 2 * Math.PI / 60 / 1000;
        return { kW, hp: kW * 1.341, Nm };
      },
    };
  }

  root.EngineParams = { DEG, mod, G, TIM, ROCK, bump, valveLift, injCamLift, camLiftInt, camLiftExh,
    pistonY, TDC_Y, strokeIndex, STROKE_NAMES, buildPressure };
  if (typeof module !== 'undefined') module.exports = root.EngineParams;
})(typeof window !== 'undefined' ? window : globalThis);
