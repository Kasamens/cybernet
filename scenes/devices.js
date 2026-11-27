/* Network device models, built from simple shapes in the conventions every network diagram uses
 * (the same ones simulators like Packet Tracer follow): a router is a puck with arrows on top, a switch is a
 * flat slab with parallel arrows, a firewall is a brick wall, the internet is a cloud, data units are envelopes.
 * These are original low-poly models, not copied icon artwork.
 *
 * Every device is a Group whose origin sits on the floor, with userData.h (height) and setKey(tokenKey).
 * Usage: const D = devices(ctx); node(ctx, D.router(), 'trust', x, z, { label: 'Router A' })
 */
export function devices(ctx) {
  const { THREE: T, glow: G } = ctx;

  function assemble(parts, h, fixed = []) {
    const g = new T.Group();
    parts.concat(fixed).forEach(p => g.add(p));
    g.userData.h = h;
    g.setKey = k => parts.forEach(p => p.setKey && p.setKey(k));
    return g;
  }
  function solid(geo, key, x, y, z, opts) { const w = G.wire(geo, key, opts); w.position.set(x, y, z); return w; }
  // flat arrow from (ax, az) to (bx, bz) at height y, pushed as segment pairs
  function arrow(out, ax, az, bx, bz, y, head = 0.13) {
    out.push(ax, y, az, bx, y, bz);
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const hx = bx - ux * head, hz = bz - uz * head, px = -uz * head * 0.75, pz = ux * head * 0.75;
    out.push(bx, y, bz, hx + px, y, hz + pz, bx, y, bz, hx - px, y, hz - pz);
  }
  // rectangle outline on a vertical face at depth z (screens, bays)
  function rect(out, x0, y0, x1, y1, z) {
    out.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z);
  }

  return {
    /** Router: a short cylinder with four arrows on top, two pointing in and two pointing out. */
    router(key = 'trust', s = 1) {
      const r = 0.55 * s, h = 0.42 * s, y = h + 0.012, a = r * 0.2, b = r * 0.85, seg = [];
      arrow(seg, a, 0, b, 0, y); arrow(seg, -a, 0, -b, 0, y);
      arrow(seg, 0, b, 0, a, y); arrow(seg, 0, -b, 0, -a, y);
      return assemble([solid(new T.CylinderGeometry(r, r, h, 28), key, 0, h / 2, 0), G.segments(seg, key, { width: 1.8 })], h);
    },

    /** Switch: a flat slab with four parallel arrows, alternating direction. */
    switch(key = 'trust', s = 1) {
      const w = 1.3 * s, h = 0.3 * s, d = 0.8 * s, y = h + 0.012, seg = [];
      [-0.27, -0.09, 0.09, 0.27].forEach((z, i) => (i % 2 ? arrow(seg, w * 0.35, z * s, -w * 0.35, z * s, y, 0.11) : arrow(seg, -w * 0.35, z * s, w * 0.35, z * s, y, 0.11)));
      return assemble([solid(new T.BoxGeometry(w, h, d), key, 0, h / 2, 0), G.segments(seg, key, { width: 1.6 })], h);
    },

    /** Firewall: a brick wall running along x. Mortar lines on both faces and the top. */
    firewall(key = 'trust', len = 1.4, h = 0.9, d = 0.32) {
      const seg = [], rows = Math.max(2, Math.round(h / 0.3)), rh = h / rows, bl = 0.46;
      for (const z of [d / 2 + 0.006, -d / 2 - 0.006]) {
        for (let r = 1; r < rows; r++) seg.push(-len / 2, r * rh, z, len / 2, r * rh, z);
        for (let r = 0; r < rows; r++) {
          for (let x = -len / 2 + (r % 2 ? bl / 2 : bl); x < len / 2 - 0.05; x += bl) seg.push(x, r * rh, z, x, (r + 1) * rh, z);
        }
      }
      return assemble([solid(new T.BoxGeometry(len, h, d), key, 0, h / 2, 0, { fill: 'surface', fillOpacity: 0.85 }), G.segments(seg, key, { width: 1.2 })], h);
    },

    /** Server: a tower with drive bays on the front and a status light. */
    server(key = 'trust', s = 1) {
      const w = 0.8 * s, h = 1.5 * s, d = 1 * s, z = d / 2 + 0.006, seg = [];
      for (let i = 0; i < 3; i++) { const y0 = h * (0.56 + i * 0.12); rect(seg, -w * 0.32, y0, w * 0.32, y0 + h * 0.07, z); }
      for (let i = 0; i < 4; i++) { const y = h * (0.12 + i * 0.05); seg.push(-w * 0.3, y, z, w * 0.3, y, z); }
      const led = new T.Mesh(new T.SphereGeometry(0.045 * s, 8, 6), G.track(new T.MeshBasicMaterial(), 'ok'));
      led.position.set(w * 0.3, h * 0.94, z);
      return assemble([solid(new T.BoxGeometry(w, h, d), key, 0, h / 2, 0), G.segments(seg, key, { width: 1.2 })], h, [led]);
    },

    /** Laptop: a base with a keyboard outline and a screen hinged open at the back. */
    laptop(key = 'trust', s = 1) {
      const w = 1.15 * s, d = 0.8 * s, t = 0.07 * s, sh = 0.74 * s, seg = [], scr = [];
      // keyboard area on the base top
      seg.push(-w * 0.4, t + 0.01, -d * 0.36, w * 0.4, t + 0.01, -d * 0.36, w * 0.4, t + 0.01, -d * 0.36, w * 0.4, t + 0.01, 0.02,
        w * 0.4, t + 0.01, 0.02, -w * 0.4, t + 0.01, 0.02, -w * 0.4, t + 0.01, 0.02, -w * 0.4, t + 0.01, -d * 0.36);
      seg.push(-w * 0.14, t + 0.01, d * 0.14, w * 0.14, t + 0.01, d * 0.14); // trackpad edge
      const base = solid(new T.BoxGeometry(w, t, d), key, 0, t / 2, 0);
      const lid = new T.Group(); lid.position.set(0, t, -d / 2); lid.rotation.x = -0.22;
      const screen = solid(new T.BoxGeometry(w, sh, 0.05 * s), key, 0, sh / 2, 0);
      rect(scr, -w * 0.43, sh * 0.08, w * 0.43, sh * 0.92, 0.031 * s);
      const bezel = G.segments(scr, key, { width: 1.2 });
      lid.add(screen, bezel);
      lid.setKey = k => { screen.setKey(k); bezel.setKey(k); };
      return assemble([base, G.segments(seg, key, { width: 1.1 }), lid], sh * 0.95 + t);
    },

    /** Phone: an upright slab with a screen outline, tilted slightly back. */
    phone(key = 'trust', s = 1) {
      const w = 0.42 * s, h = 0.82 * s, t = 0.06 * s, seg = [];
      rect(seg, -w * 0.4, h * 0.1, w * 0.4, h * 0.88, t / 2 + 0.006);
      seg.push(-w * 0.1, h * 0.05, t / 2 + 0.006, w * 0.1, h * 0.05, t / 2 + 0.006);
      const g = new T.Group(); g.rotation.x = -0.18;
      const body = solid(new T.BoxGeometry(w, h, t), key, 0, h / 2, 0), screen = G.segments(seg, key, { width: 1.2 });
      g.add(body, screen); g.setKey = k => { body.setKey(k); screen.setKey(k); };
      return assemble([g], h);
    },

    /** TV: a wide thin screen on a stand. */
    tv(key = 'trust', s = 1) {
      const w = 1.5 * s, sh = 0.88 * s, t = 0.07 * s, lift = 0.24 * s, seg = [];
      rect(seg, -w * 0.46, lift + sh * 0.07, w * 0.46, lift + sh * 0.93, t / 2 + 0.006);
      return assemble([
        solid(new T.BoxGeometry(w, sh, t), key, 0, lift + sh / 2, 0),
        solid(new T.BoxGeometry(0.08 * s, lift, 0.08 * s), key, 0, lift / 2, 0, { halo: false }),
        solid(new T.BoxGeometry(0.55 * s, 0.03 * s, 0.28 * s), key, 0, 0.015 * s, 0, { halo: false }),
        G.segments(seg, key, { width: 1.2 }),
      ], lift + sh);
    },

    /** The internet: a cloud of overlapping low-poly puffs. */
    cloud(key = 'trust', s = 1) {
      const puffs = [[0, 0.62, 0, 0.6], [-0.62, 0.42, 0.05, 0.44], [0.64, 0.44, 0, 0.46], [-0.28, 0.86, -0.05, 0.42], [0.3, 0.9, 0.05, 0.4]];
      return assemble(puffs.map(([x, y, z, r]) => solid(new T.IcosahedronGeometry(r * s, 1), key, x * s, y * s, z * s, { fill: 'surface', fillOpacity: 0.9, width: 1, halo: false })), 1.3 * s);
    },

    /** A data unit (packet or message): an envelope that faces the camera. */
    envelope(key = 'text', s = 1) {
      const w = 0.5 * s, h = 0.32 * s, t = 0.04 * s, z = t / 2 + 0.004;
      const mat = G.track(new T.MeshBasicMaterial(), key);
      const body = new T.Mesh(new T.BoxGeometry(w, h, t), mat);
      const flap = G.segments([-w / 2, h / 2, z, 0, 0, z, 0, 0, z, w / 2, h / 2, z], 'bg', { width: 1.6 });
      const g = new T.Group(); g.add(body, flap);
      g.userData.h = h;
      g.setKey = k => G.recolor(mat, k);
      return g;
    },
  };
}
