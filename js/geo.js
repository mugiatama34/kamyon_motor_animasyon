/* Geometri yardımcıları: devrim katıları, ekstrüzyonlar, dişli profili, helis yay. */
(function (root) {
  'use strict';
  const T = root.THREE, EP = root.EngineParams;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ geometri yardımcıları
  function fixOrient(g) {
    const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    let vol = 0;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      vol += a.dot(b.cross(c));
    }
    if (vol < 0) {
      if (idx) for (let i = 0; i < n; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); }
      else {
        for (const name of Object.keys(g.attributes)) {
          const at = g.attributes[name], s = at.itemSize;
          for (let i = 0; i < n; i += 3) for (let k = 0; k < s; k++) {
            const t = at.array[(i + 1) * s + k]; at.array[(i + 1) * s + k] = at.array[(i + 2) * s + k]; at.array[(i + 2) * s + k] = t;
          }
        }
      }
      const nr = g.attributes.normal;
      if (nr) for (let i = 0; i < nr.array.length; i++) nr.array[i] = -nr.array[i];
    }
    return g;
  }

  // Y ekseni etrafında döndürülen (r,y) profilinden kapalı katı üretir; köşeler keskin, çevre yönü yumuşak.
  function revolve(profile, seg = 48) {
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const sgn = area >= 0 ? 1 : -1;
    const P = [], N = [];
    const push = (v, n) => { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); };
    for (let i = 0; i < profile.length; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[(i + 1) % profile.length];
      const dx = r1 - r0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (len < 1e-9 || (r0 < 1e-9 && r1 < 1e-9)) continue;
      const nr = sgn * dy / len, ny = -sgn * dx / len;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU, am = (a0 + a1) / 2;
        const A = [r0 * Math.cos(a0), y0, r0 * Math.sin(a0)], B = [r1 * Math.cos(a0), y1, r1 * Math.sin(a0)];
        const C = [r1 * Math.cos(a1), y1, r1 * Math.sin(a1)], D = [r0 * Math.cos(a1), y0, r0 * Math.sin(a1)];
        const nA = [nr * Math.cos(a0), ny, nr * Math.sin(a0)], nB = nA, nC = [nr * Math.cos(a1), ny, nr * Math.sin(a1)], nD = nC;
        const nm = [nr * Math.cos(am), ny, nr * Math.sin(am)];
        const cross = (p, q, r) => { const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
          return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const tri = (p, pn, q, qn, r, rn) => {
          const cr = cross(p, q, r);
          if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-12) return;
          if (dot(cr, nm) >= 0) { push(p, pn); push(q, qn); push(r, rn); } else { push(p, pn); push(r, rn); push(q, qn); }
        };
        tri(A, nA, B, nB, C, nC); tri(A, nA, C, nC, D, nD);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
    return g;
  }
  const revolveX = (profile, seg) => { const g = revolve(profile, seg); g.rotateZ(-Math.PI / 2); return g; }; // profil: [r, x]
  const cylX = (r, len, seg = 32) => { const g = new T.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; };
  const tubeX = (rIn, rOut, len, seg = 40) => revolveX([[rIn, -len / 2], [rOut, -len / 2], [rOut, len / 2], [rIn, len / 2]], seg);
  const tubeY = (rIn, rOut, y0, y1, seg = 40) => revolve([[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1]], seg);
  const boxG = (w, h, d) => new T.BoxGeometry(w, h, d);

  const mkShape = (pts) => { const s = new T.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); return s; };
  const holePath = (h) => {
    const p = new T.Path();
    if (h.circle) p.absarc(h.circle[0], h.circle[1], h.circle[2], 0, TAU, true);
    else { h.pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); }
    return p;
  };
  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const ex = (shape, depth) => new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });
  function mkS(outline, holes) { const s = mkShape(outline); (holes || []).forEach(h => s.holes.push(holePath(h))); return s; }
  // YZ düzleminde (z,y) çokgeni x boyunca depth kalınlıkta, x=0 merkezli
  function extYZ(outline, holes, depth) { const g = ex(mkS(outline, holes), depth); g.rotateY(-Math.PI / 2); g.translate(depth / 2, 0, 0); return fixOrient(g); }
  // XZ düzleminde (x,z) çokgeni y0..y0+depth
  function extXZ(outline, holes, depth, y0) {
    const f = p => [p[0], -p[1]];
    const o = outline.map(f), hs = (holes || []).map(h => h.circle ? { circle: [h.circle[0], -h.circle[1], h.circle[2]] } : { pts: h.pts.map(f) });
    const g = ex(mkS(o, hs), depth); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return fixOrient(g);
  }
  // XY düzleminde (x,y) çokgeni z0..z0+depth
  function extXY(outline, holes, depth, z0) { const g = ex(mkS(outline, holes), depth); g.translate(0, 0, z0); return fixOrient(g); }

  function convexHull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  const circPts = (cy, cz, r, n = 28) => Array.from({ length: n }, (_, i) => [cz + r * Math.sin(i / n * TAU), cy + r * Math.cos(i / n * TAU)]); // (z,y)

  // Dişli profili (z,y) — açı: +y'den +z'ye
  function gearOutline(N, rp, m) {
    const rr = rp - 1.25 * m, rt = rp + m, p = TAU / N, pts = [];
    for (let i = 0; i < N; i++) {
      const a = i * p;
      for (const [r, da] of [[rr, -0.30], [rt, -0.15], [rt, 0.15], [rr, 0.30]]) {
        const an = a + da * p; pts.push([r * Math.sin(an), r * Math.cos(an)]);
      }
    }
    return pts;
  }
  // (y,z) kutupsal -> (z,y) şekil noktası
  const polarZY = (R, a) => [R * Math.sin(a), R * Math.cos(a)];

  // Helis yay eğrisi
  class Helix extends T.Curve {
    constructor(r, h, coils) { super(); this.r = r; this.h = h; this.c = coils; }
    getPoint(t, out = new T.Vector3()) { const a = t * this.c * TAU; return out.set(this.r * Math.cos(a), t * this.h, this.r * Math.sin(a)); }
  }

  root.EngineGeo = { fixOrient, revolve, revolveX, cylX, tubeX, tubeY, boxG, extYZ, extXZ, extXY, mkS, rectPts, convexHull, circPts, gearOutline, polarZY, Helix, ex, mkShape, holePath };
})(window);
