/* Neon helpers: faked glow, no post-processing.
 * Every line is a crisp core plus (in dark mode) a wide, faint, additive halo pass.
 * Nodes get an additive sprite bloom. Trails are polylines whose colour fades to the floor colour.
 * All colours are token keys ('trust', 'threat', 'ok', 'alert', 'muted', 'text', 'grid', 'surface'…),
 * so a theme switch recolours everything live. The halo strength follows the --glow token (0 in Daylight).
 */
export function makeGlow(THREE, L) {
  const { Line2, LineGeometry, LineMaterial, LineSegments2, LineSegmentsGeometry } = L;
  let colors = null, glow = 1, res = new THREE.Vector2(800, 600);
  const tracked = [];   // { mat, key, halo?: bool, base?: opacity }
  const lineMats = new Set();
  const trails = [];

  let haloTex = null;
  function haloTexture() {
    if (haloTex) return haloTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c); haloTex.userData.keep = true;
    return haloTex;
  }

  function track(mat, key, halo = false) {
    const base = mat.opacity;
    tracked.push({ mat, key, halo, base });
    if (colors) apply({ mat, key, halo, base });
    if (mat.isLineMaterial) { mat.resolution.copy(res); lineMats.add(mat); }
    return mat;
  }
  function apply(t) {
    if (t.mat.color && colors[t.key]) t.mat.color.copy(colors[t.key]);
    if (t.halo) { t.mat.opacity = t.base * glow; t.mat.visible = glow > 0.01; }
  }

  function lineMat(key, width, halo, extra = {}) {
    const m = new LineMaterial({
      linewidth: halo ? width * 5 : width, worldUnits: false,
      transparent: halo || extra.opacity != null, opacity: halo ? 0.16 : (extra.opacity ?? 1),
      depthWrite: !halo, blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexColors: !!extra.vertexColors,
    });
    return track(m, key, halo);
  }

  /** A neon polyline through points (Vector3[]). Returns a Group with .setKey(key) and .setPoints(pts). */
  function line(points, key = 'trust', { width = 2, halo = true, opacity } = {}) {
    const g = new THREE.Group();
    const geo = new LineGeometry(); geo.setPositions(flat(points));
    const core = new Line2(geo, lineMat(key, width, false, { opacity })); core.computeLineDistances();
    g.add(core);
    let h = null;
    if (halo) { h = new Line2(geo, lineMat(key, width, true)); g.add(h); }
    g.setKey = k => { retrack(core.material, k); if (h) retrack(h.material, k); };
    g.setPoints = pts => { geo.setPositions(flat(pts)); core.computeLineDistances(); };
    g.core = core;
    return g;
  }

  /** Glowing edges for any geometry (wireframe look), with an optional solid fill behind them. */
  function wire(geometry, key = 'trust', { width = 1.6, fill = 'surface', fillOpacity = 1, halo = true } = {}) {
    const g = new THREE.Group();
    if (fill) {
      const fm = track(new THREE.MeshBasicMaterial({ transparent: fillOpacity < 1, opacity: fillOpacity, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), fill);
      const mesh = new THREE.Mesh(geometry, fm); g.add(mesh); g.fill = mesh;
    }
    const edges = new THREE.EdgesGeometry(geometry, 20);
    const sg = new LineSegmentsGeometry(); sg.setPositions(edges.attributes.position.array); edges.dispose();
    const core = new LineSegments2(sg, lineMat(key, width, false)); g.add(core);
    let h = null;
    if (halo) { h = new LineSegments2(sg, lineMat(key, width, true)); g.add(h); }
    g.setKey = k => { retrack(core.material, k); if (h) retrack(h.material, k); };
    g.setFill = k => { if (g.fill) retrack(g.fill.material, k); };
    return g;
  }

  /** A soft additive bloom sprite (dark mode only). */
  function bloom(key = 'trust', size = 1.4, strength = 0.55) {
    const m = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending });
    track(m, key, true);
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1);
    s.setKey = k => retrack(m, k);
    return s;
  }

  /** Floor grid (thin 1px lines, the decorative --grid token). */
  function grid(w = 20, d = 20, step = 1) {
    const pts = [];
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, 0, -d / 2, x, 0, d / 2);
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) pts.push(-w / 2, 0, z, w / 2, 0, z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }), 'grid');
    return new THREE.LineSegments(geo, m);
  }

  /** A light trail: call .push(vec3) each frame; .clear() to reset. Colour fades from key to the floor colour. */
  function trail(key = 'trust', n = 22, width = 3) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const geo = new LineGeometry(); geo.setPositions(pos); geo.setColors(col);
    // white base colour: the vertex colours carry the hue (untracked, but it still needs the resolution)
    const mat = new LineMaterial({ color: 0xffffff, linewidth: width, worldUnits: false, vertexColors: true });
    mat.resolution.copy(res); lineMats.add(mat);
    const obj = new Line2(geo, mat); obj.frustumCulled = false; obj.visible = false;
    const pts = []; let k = key;
    const tmp = new THREE.Color();
    const t = {
      obj,
      setKey(key2) { k = key2; },
      push(v) {
        pts.unshift(v.x, v.y, v.z); if (pts.length > n * 3) pts.length = n * 3;
        const m = pts.length / 3; if (m < 2) return;
        for (let i = 0; i < n; i++) { const j = Math.min(i, m - 1) * 3; pos[i * 3] = pts[j]; pos[i * 3 + 1] = pts[j + 1]; pos[i * 3 + 2] = pts[j + 2]; }
        for (let i = 0; i < n; i++) { tmp.copy(colors[k]).lerp(colors.bg, Math.min(1, i / (n - 1)) ** 0.8); col.set([tmp.r, tmp.g, tmp.b], i * 3); }
        writeSegments(geo, 'instanceStart', pos, n);
        writeSegments(geo, 'instanceColorStart', col, n);
        obj.visible = true;
      },
      clear() { pts.length = 0; obj.visible = false; },
    };
    trails.push(t);
    return t;
  }
  // Line2 stores segments [p0,p1, p1,p2, …] in an interleaved buffer; rewrite it in place (no reallocation per frame).
  function writeSegments(geo, attr, src, n) {
    const a = geo.attributes[attr]; if (!a) return;
    const arr = a.data.array;
    for (let i = 0; i < n - 1; i++) { arr.set(src.subarray(i * 3, i * 3 + 3), i * 6); arr.set(src.subarray(i * 3 + 3, i * 3 + 6), i * 6 + 3); }
    a.data.needsUpdate = true;
  }

  function retrack(mat, key) { const t = tracked.find(x => x.mat === mat); if (t) { t.key = key; if (colors) apply(t); } }
  function flat(points) { const a = []; points.forEach(p => a.push(p.x, p.y, p.z)); return a; }

  return {
    line, wire, bloom, grid, trail, track, recolor: retrack,
    /** engine hooks */
    retheme(c, g) { colors = c; glow = g; tracked.forEach(apply); },
    resize(w, h) { res.set(w, h); lineMats.forEach(m => m.resolution.set(w, h)); },
    reset() { tracked.length = 0; lineMats.clear(); trails.length = 0; },
  };
}
