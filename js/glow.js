/* Neon helpers: a holographic look with no post-processing.
 *   line    crisp core + wide additive halo (dark mode)
 *   wire    glowing edges over a solid fill with a Fresnel rim (edges of the shape glow, like a hologram)
 *   bloom   soft additive sprite
 *   grid    one shader plane: anti-aliased lines via fract()/fwidth(), major lines, distance fade, scan-on reveal
 *   path    a tube along a path with a bright head and a fading tail (packet trails)
 *   pulse   expanding ring when something arrives at a node
 *   stars   a sparse point field above the horizon (dark mode only)
 * Colours are token keys ('trust', 'threat', 'ok', 'alert', 'muted', 'text', 'grid', 'surface', …), so a theme switch
 * recolours everything live. Glow strength follows the --glow token: 0 in Daylight, which renders as flat ink.
 */
export function makeGlow(THREE, L) {
  const { Line2, LineGeometry, LineMaterial, LineSegments2, LineSegmentsGeometry } = L;
  let colors = null, glow = 1, reduce = false, res = new THREE.Vector2(800, 600);
  const tracked = [];   // { mat, key, halo, base } — plain materials whose .color follows a token
  const fns = [];       // custom re-theme callbacks (shader uniforms, blending)
  const lineMats = new Set();
  const tickers = new Set();

  // ---------- tracking ----------
  function track(mat, key, halo = false) {
    const t = { mat, key, halo, base: mat.opacity };
    tracked.push(t);
    if (colors) apply(t);
    if (mat.isLineMaterial) { mat.resolution.copy(res); lineMats.add(mat); }
    return mat;
  }
  function apply(t) {
    if (t.mat.color && colors[t.key]) t.mat.color.copy(colors[t.key]);
    if (t.halo) { t.mat.opacity = t.base * glow; t.mat.visible = glow > 0.01; }
  }
  function onTheme(fn) { fns.push(fn); if (colors) fn(colors, glow); return fn; }
  function retrack(mat, key) { const t = tracked.find(x => x.mat === mat); if (t) { t.key = key; if (colors) apply(t); } }
  const additive = m => { const b = glow > 0.01 ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.blending !== b) { m.blending = b; m.needsUpdate = true; } };

  // ---------- lines ----------
  function lineMat(key, width, halo, extra = {}) {
    const m = new LineMaterial({
      linewidth: halo ? width * 5 : width, worldUnits: false,
      transparent: halo || extra.opacity != null, opacity: halo ? 0.16 : (extra.opacity ?? 1),
      depthWrite: !halo, blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return track(m, key, halo);
  }
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

  // ---------- holographic solids ----------
  const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
  const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
  function fresnelMat(opacity) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uFill: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uGlow: { value: 1 }, uOpacity: { value: opacity },
      }]),
      vertexShader: FOG_V + `varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: FOG_F + `uniform vec3 uFill; uniform vec3 uRim; uniform float uGlow; uniform float uOpacity;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec3 c = uFill + uRim * (0.04 + f * 0.55) * uGlow;
          gl_FragColor = vec4(c, uOpacity);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
      fog: true, transparent: opacity < 1,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
  }
  /** Glowing edges for any geometry, over a fill whose rim glows (Fresnel). */
  function wire(geometry, key = 'trust', { width = 1.6, fill = 'surface', fillOpacity = 1, halo = true } = {}) {
    const g = new THREE.Group();
    let edgeKey = key, fillKey = fill;
    if (fill) {
      const fm = fresnelMat(fillOpacity);
      onTheme((c, gl) => { fm.uniforms.uFill.value.copy(c[fillKey]); fm.uniforms.uRim.value.copy(c[edgeKey]); fm.uniforms.uGlow.value = gl; });
      const mesh = new THREE.Mesh(geometry, fm); g.add(mesh); g.fill = mesh;
      g.retheme = () => { if (colors) { fm.uniforms.uFill.value.copy(colors[fillKey]); fm.uniforms.uRim.value.copy(colors[edgeKey]); } };
    }
    const edges = new THREE.EdgesGeometry(geometry, 20);
    const sg = new LineSegmentsGeometry(); sg.setPositions(edges.attributes.position.array); edges.dispose();
    const core = new LineSegments2(sg, lineMat(key, width, false)); g.add(core);
    let h = null;
    if (halo) { h = new LineSegments2(sg, lineMat(key, width, true)); g.add(h); }
    g.setKey = k => { edgeKey = k; retrack(core.material, k); if (h) retrack(h.material, k); g.retheme && g.retheme(); };
    g.setFill = k => { fillKey = k; g.retheme && g.retheme(); };
    return g;
  }

  // ---------- bloom sprite ----------
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
  function bloom(key = 'trust', size = 1.4, strength = 0.55) {
    const m = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending });
    track(m, key, true);
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1);
    s.setKey = k => retrack(m, k);
    return s;
  }

  // ---------- floor grid (shader) ----------
  /** w × d is the area that matters; the plane extends past it and fades out radially. */
  function grid(w = 20, d = 20, step = 1) {
    const R = Math.max(w, d) * 0.75;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() }, uScan: { value: new THREE.Color() }, uGlow: { value: 1 },
        uCell: { value: step }, uReveal: { value: reduce ? 1e4 : 0 }, uFade: { value: new THREE.Vector2(R * 0.55, R) },
      },
      vertexShader: `varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uScan; uniform float uGlow; uniform float uCell; uniform float uReveal; uniform vec2 uFade;
        varying vec3 vW;
        float gridLine(vec2 p) { vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main() {
          vec2 p = vW.xz / uCell;
          float minor = gridLine(p), major = gridLine(p / 5.0);
          float r = length(vW.xz);
          float shown = 1.0 - smoothstep(uReveal - 1.5, uReveal, r);
          float band = exp(-pow((r - uReveal) * 1.4, 2.0)) * uGlow;
          float a = max(minor * 0.55, major * 0.95) * shown + band * max(minor, 0.08) * 0.9;
          a *= 1.0 - smoothstep(uFade.x, uFade.y, r);
          if (a < 0.003) discard;
          gl_FragColor = vec4(mix(uColor, uScan, clamp(band, 0.0, 1.0)), a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    onTheme((c, gl) => { mat.uniforms.uColor.value.copy(c.grid); mat.uniforms.uScan.value.copy(c.trust); mat.uniforms.uGlow.value = gl; });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), mat);
    plane.rotation.x = -Math.PI / 2; plane.renderOrder = -1;
    // scan-on reveal: a bright ring sweeps out from the centre when the scene opens
    if (!reduce) {
      const t = { tick(dt) { mat.uniforms.uReveal.value += dt * R * 1.1; if (mat.uniforms.uReveal.value > R * 1.3) { mat.uniforms.uReveal.value = 1e4; tickers.delete(t); } } };
      tickers.add(t);
    }
    return plane;
  }

  // ---------- packet trails: a tube with a bright head ----------
  /** set(points) once per trip, then progress(0..1) each frame. Tail length is in world units. */
  function path(key = 'trust', { radius = 0.06, tail = 2.4 } = {}) {
    let k = key;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uHead: { value: 0 }, uLen: { value: 0.3 }, uGlow: { value: 1 } },
      vertexShader: `varying float vU; void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uHead; uniform float uLen; uniform float uGlow; varying float vU;
        void main() {
          if (vU > uHead) discard;
          float t = 1.0 - (uHead - vU) / uLen;
          if (t <= 0.0) discard;
          float a = pow(t, 1.6);
          vec3 c = mix(uColor, vec3(1.0), pow(a, 8.0) * 0.8 * uGlow);
          gl_FragColor = vec4(c, a * (0.45 + 0.55 * uGlow));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    onTheme((c, gl) => { mat.uniforms.uColor.value.copy(c[k]); mat.uniforms.uGlow.value = gl; additive(mat); });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.visible = false; mesh.frustumCulled = false;
    return {
      mesh,
      set(points) {
        mesh.geometry.dispose();
        const cp = new THREE.CurvePath(); let total = 0;
        for (let i = 1; i < points.length; i++) { cp.add(new THREE.LineCurve3(points[i - 1].clone(), points[i].clone())); total += points[i].distanceTo(points[i - 1]); }
        if (!total) { mesh.visible = false; return; }
        mesh.geometry = new THREE.TubeGeometry(cp, Math.min(240, Math.max(16, Math.ceil(total * 10))), radius, 6, false);
        mat.uniforms.uLen.value = Math.min(1, tail / total);
        mat.uniforms.uHead.value = 0;
      },
      progress(p) { mat.uniforms.uHead.value = p; mesh.visible = !reduce && p > 0; },
      hide() { mesh.visible = false; },
      setKey(key2) { k = key2; if (colors) mat.uniforms.uColor.value.copy(colors[k]); },
    };
  }

  // ---------- arrival pulse ----------
  const ringGeo = new THREE.RingGeometry(0.42, 0.52, 48); ringGeo.userData.keep = true;
  function pulse(key = 'trust') {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    track(mat, key); onTheme(() => additive(mat));
    const mesh = new THREE.Mesh(ringGeo, mat); mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
    let life = 0;
    const t = {
      tick(dt) {
        if (life <= 0) return;
        life -= dt;
        const k = 1 - Math.max(life, 0) / 0.7;
        mesh.scale.setScalar(reduce ? 1.4 : 1 + k * 2.2);
        mat.opacity = reduce ? 0.8 : (1 - k) * 0.9;
        if (life <= 0) mesh.visible = false;
      },
    };
    tickers.add(t);
    return { mesh, fire(p, key2) { if (key2) retrack(mat, key2); mesh.position.set(p.x, Math.max(0.03, p.y - 0.45), p.z); mesh.visible = true; life = 0.7; }, setKey: k => retrack(mat, k) };
  }

  // ---------- stars ----------
  function stars(n = 1200, radius = 90) {
    const pos = new Float32Array(n * 3);
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, y = 0.08 + rnd() * 0.9, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * radius, y * radius * 0.6 + 4, Math.sin(th) * r * radius], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    track(mat, 'muted', true);
    const pts = new THREE.Points(geo, mat); pts.renderOrder = -2;
    return pts;
  }

  function flat(points) { const a = []; points.forEach(p => a.push(p.x, p.y, p.z)); return a; }

  return {
    line, wire, bloom, grid, path, pulse, stars, track, recolor: retrack,
    /** engine hooks */
    retheme(c, g) { colors = c; glow = g; tracked.forEach(apply); fns.forEach(fn => fn(c, g)); },
    resize(w, h) { res.set(w, h); lineMats.forEach(m => m.resolution.set(w, h)); },
    tick(dt) { tickers.forEach(t => t.tick(dt)); },
    setReduce(v) { reduce = v; },
    reset() { tracked.length = 0; fns.length = 0; lineMats.clear(); tickers.clear(); },
  };
}
