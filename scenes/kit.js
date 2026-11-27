/* Small building blocks shared by scenes: things that travel along paths, a pause/step clock,
 * labelled wireframe nodes, arcs and a quick "lost/blocked" flash. All colours are token keys.
 */

/** Pause toggle + Step button + frame driver. advance(dt) is the scene's whole simulation step. */
export function makeClock(ctx, advance, { stepSize = 0.25 } = {}) {
  let running = true;
  const pause = ctx.ui.toggle('Pause', false, v => { running = !v; step.disabled = running; });
  const step = ctx.step(() => advance(stepSize));
  step.disabled = true;
  ctx.onFrame(dt => { if (running) advance(dt); });
  return { pause, step, get running() { return running; } };
}

/** Point at distance d along a polyline; with snap (reduced motion) it jumps between waypoints. */
export function along(pts, seg, d, snap) {
  if (snap) { let acc = 0, i = 0; while (i < seg.length && acc + seg[i] <= d + 1e-6) acc += seg[i++]; return pts[i].clone(); }
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (d <= acc + seg[i]) return pts[i].clone().lerp(pts[i + 1], seg[i] ? (d - acc) / seg[i] : 1);
    acc += seg[i];
  }
  return pts[pts.length - 1].clone();
}

/** Points on a raised arc from a to b (quadratic curve), so messages read as "beams". */
export function arc(ctx, a, b, h = 1.6, n = 18) {
  const m = a.clone().lerp(b, 0.5); m.y += h;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(ctx.V(u * u * a.x + 2 * u * t * m.x + t * t * b.x, u * u * a.y + 2 * u * t * m.y + t * t * b.y, u * u * a.z + 2 * u * t * m.z + t * t * b.z));
  }
  return out;
}

/** A travelling thing (packet, message). go(points, speed, onArrive, label). Call update(dt) from the clock. */
export function mover(ctx, { key = 'text', glow = 'trust', size = 0.34, shape = 'box', trail = true, tagCls = '', pulse = true } = {}) {
  const { THREE: T, glow: G, V } = ctx, S = ctx.scene;
  const geo = shape === 'sphere' ? new T.SphereGeometry(size * 0.6, 12, 8) : shape === 'octa' ? new T.OctahedronGeometry(size * 0.75) : new T.BoxGeometry(size, size, size);
  const mat = G.track(new T.MeshBasicMaterial(), key);
  const obj = new T.Mesh(geo, mat); obj.visible = false; S.add(obj);
  const b = G.bloom(glow, size * 3.6, 0.55); b.visible = false; S.add(b);
  const tr = trail ? G.path(glow) : null; if (tr) S.add(tr.mesh);
  const ring = pulse ? G.pulse(glow) : null; if (ring) S.add(ring.mesh);
  let ringKey = glow;
  const tag = ctx.tag('', V(), tagCls).show(false);
  let pts = [], seg = [], len = 0, d = 0, spd = 1, cb = null, active = false, cut = null, onCut = null;
  const m = {
    obj, tag,
    get active() { return active; },
    get progress() { return len ? d / len : 0; },
    go(points, speed, onArrive, label = '', { stopAt = null, onStop = null } = {}) {
      pts = points.map(p => p.clone()); seg = []; len = 0;
      for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); len += l; }
      d = 0; spd = speed; cb = onArrive; active = true; cut = stopAt; onCut = onStop;
      obj.visible = b.visible = true; tr && tr.set(pts);
      m.label(label); place(); return m;
    },
    label(t) { tag.set(t || '').show(!!t); return m; },
    look(k, glowKey = k) { G.recolor(mat, k); b.setKey(glowKey); tr && tr.setKey(glowKey); ringKey = glowKey; return m; },
    tagClass(c) { tag.cls(c); return m; },
    update(dt) {
      if (!active) return;
      d += spd * dt;
      if (cut != null && d >= cut * len) { d = cut * len; place(); active = false; const f = onCut; onCut = null; f && f(m); return; }
      if (d >= len) { d = len; place(); active = false; m.hide(); if (ring) ring.fire(pts[pts.length - 1], ringKey); const f = cb; cb = null; f && f(m); return; }
      place();
      if (!ctx.reduce) obj.rotation.y += dt * 2;
    },
    hide() { active = false; obj.visible = b.visible = false; tag.show(false); tr && tr.hide(); },
    get position() { return obj.position; },
  };
  function place() {
    const p = along(pts, seg, d, ctx.reduce);
    obj.position.copy(p); b.position.copy(p);
    tag.pos.set(p.x, p.y + 0.62, p.z);
    if (tr) tr.progress(len ? d / len : 0);
  }
  return m;
}

/** A labelled wireframe node: returns { obj, p (anchor point), tag, look(key) }. */
export function node(ctx, geometry, key, x, z, { y = 0, label = '', tagCls = '', tagY = 1.4, fill = 'surface', bloom = 0 } = {}) {
  const { glow: G, V } = ctx;
  const obj = G.wire(geometry, key, { fill });
  geometry.computeBoundingBox();
  const h = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
  obj.position.set(x, y + h / 2, z); ctx.scene.add(obj);
  let bl = null;
  if (bloom) { bl = G.bloom(key, bloom, 0.2); bl.position.copy(obj.position); ctx.scene.add(bl); }
  // label floats above the node on a short leader line (HUD style); tagY nudges it further up
  const tag = label ? ctx.tag(label, V(x, y + h, z), tagCls, { lead: [0, -Math.round(14 + (tagY - 1.4) * 20)] }) : null;
  return { obj, tag, p: V(x, y + Math.min(h, 1) * 0.6, z), look(k) { obj.setKey(k); if (bl) bl.setKey(k); return this; } };
}

/** A brief marker (lost, blocked, dropped) that fades after `life` seconds. Call update(dt). */
export function flash(ctx, key = 'alert') {
  const { THREE: T, glow: G, V } = ctx;
  const obj = G.wire(new T.OctahedronGeometry(0.42), key, { fill: 'surface' }); obj.visible = false; ctx.scene.add(obj);
  const tag = ctx.tag('', V(), key).show(false);
  let t = 0;
  return {
    at(p, text, life = 1.8) { obj.position.copy(p); obj.visible = true; tag.pos.set(p.x, p.y + 0.8, p.z); tag.set(text).show(!!text); t = life; },
    update(dt) { if (t <= 0) return; if (!ctx.reduce) obj.rotation.y += dt * 3; if ((t -= dt) <= 0) { obj.visible = false; tag.show(false); } },
  };
}

/** Breadth-first search for the fewest-hops path in an adjacency map { name: [neighbours] }. */
export function shortestPath(adj, from, to) {
  const prev = { [from]: null }, q = [from];
  while (q.length) {
    const n = q.shift();
    if (n === to) break;
    (adj[n] || []).forEach(m => { if (!(m in prev)) { prev[m] = n; q.push(m); } });
  }
  if (!(to in prev)) return null;
  const path = []; for (let n = to; n != null; n = prev[n]) path.unshift(n);
  return path;
}
