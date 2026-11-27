/* Week 1 · How the network moves: days 1–6 (packets, IP & routing, DNS, TCP & ports, TLS/HTTPS, firewalls & NAT).
 * Numbers are illustrative: real packets are about 1,500 bytes and cross a link in microseconds.
 */
import { CN } from '../js/engine.js';
import { term } from '../js/glossary.js';
import { makeClock, mover, node, arc, flash, shortestPath } from './kit.js';

const MESSAGE = 'MEET ME AT THE CAFE AT 8';
const split = (s, n) => Array.from({ length: n }, (_, i) => s.slice(Math.round(i * s.length / n), Math.round((i + 1) * s.length / n)));

CN.register({
  id: 'packets',
  prompt: '<strong>Try this:</strong> send the message, then switch on <em>Lose a packet</em> and send again. Watch your friend’s computer notice the gap and ask for that piece again.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene;
    const narrow = ctx.narrow(), sx = narrow ? 0.6 : 1;
    S.fog = new T.Fog(0, 16, 40);
    S.add(G.grid(34, 20, 1));

    // ---- the world: you, your friend, three routes through routers ----
    const Y = 0.55, PY = 0.95;
    const SND = V(-6.6 * sx, Y, 0), RCV = V(6.6 * sx, Y, 0);
    const routes = [
      { name: 'north', pts: [SND, V(-2.6 * sx, Y, -3.3), V(2.6 * sx, Y, -3.3), RCV] },
      { name: 'middle', pts: [SND, V(0, Y, 0), RCV] },
      { name: 'south', pts: [SND, V(-2.6 * sx, Y, 3.3), V(2.6 * sx, Y, 3.3), RCV] },
    ];
    routes.forEach(r => {
      r.seg = []; r.len = 0;
      for (let i = 1; i < r.pts.length; i++) { const l = r.pts[i].distanceTo(r.pts[i - 1]); r.seg.push(l); r.len += l; }
      r.line = G.line(r.pts, 'trust', { width: 1.6 }); S.add(r.line);
    });
    const routerGeo = new T.CylinderGeometry(0.42, 0.42, 0.7, 6);
    const routers = [];
    routes.forEach(r => r.pts.slice(1, -1).forEach(p => {
      const m = G.wire(routerGeo, 'trust'); m.position.copy(p).setY(0.35); S.add(m); routers.push(m);
    }));
    const hostGeo = new T.BoxGeometry(1.5, 1.1, 1.5);
    const sender = G.wire(hostGeo, 'trust'); sender.position.set(SND.x - 0.9, 0.55, 0); S.add(sender);
    const receiver = G.wire(hostGeo, 'trust'); receiver.position.set(RCV.x + 0.9, 0.55, 0); S.add(receiver);
    const rBloom = G.bloom('trust', 4.2, 0.22); rBloom.position.copy(receiver.position); S.add(rBloom);
    ctx.tag('You', V(sender.position.x, 1.8, 0), 'trust');
    const FRIEND = narrow ? 'Friend' : 'Your friend';
    const rTag = ctx.tag(FRIEND, V(receiver.position.x, 1.8, 0), 'trust');
    if (!narrow) ctx.tag('Router', V(0, 1.35, 0), 'bare');
    const busyTag = ctx.tag('Busy link · 3× slower', V(-2.2 * sx, 1.2, 0.2), 'threat').show(false);

    // ---- the receiver's inbox: one slot per packet, along the front ----
    const slotGeo = new T.BoxGeometry(0.46, 0.46, 0.46);
    const slots = Array.from({ length: 10 }, () => {
      const g = G.wire(slotGeo, 'muted', { fill: 'surface', halo: false }); S.add(g);
      const t = ctx.tag('', V(), 'bare'); return { g, t };
    });
    const inboxTag = ctx.tag('Inbox, in order', V(), 'bare');

    // ---- packet pool (10 originals + 4 resends), so repeated sends never allocate ----
    const pGeo = new T.BoxGeometry(0.36, 0.36, 0.36);
    const pool = Array.from({ length: 14 }, () => {
      const mat = G.track(new T.MeshBasicMaterial(), 'text');
      const obj = new T.Mesh(pGeo, mat); obj.visible = false; S.add(obj);
      const ring = G.wire(new T.TorusGeometry(0.34, 0.03, 4, 16), 'ok', { fill: null, halo: false }); ring.visible = false; obj.add(ring);
      const b = G.bloom('trust', 1.3, 0.6); b.visible = false; S.add(b);
      const tr = G.path('trust'); S.add(tr.mesh);
      const tag = ctx.tag('', V(), 'bare').show(false);
      return { obj, ring, b, tr, tag, state: 'idle', wi: 0 };
    });
    const ringPool = Array.from({ length: 6 }, () => { const r = G.pulse('trust'); S.add(r.mesh); return r; });
    let ringI = 0;
    const rings = { fire: (p, k = 'trust') => ringPool[ringI++ % ringPool.length].fire(p, k) };
    const lostMark = G.wire(new T.OctahedronGeometry(0.42), 'alert', { fill: 'surface' }); lostMark.visible = false; S.add(lostMark);
    const lostTag = ctx.tag('Lost', V(), 'alert').show(false);
    const req = { obj: G.wire(new T.SphereGeometry(0.2, 8, 6), 'trust', { fill: 'trust' }), state: 'idle', d: 0, seq: -1 };
    req.obj.visible = false; S.add(req.obj);
    const reqTag = ctx.tag('', V(), 'trust').show(false);

    // ---- state ----
    const SPEED = 3.2;
    let N = 6, dropOn = false, busy = false, running = true;
    let simT = 0, chunks = [], got = [], order = [], resent = 0, outOfOrder = 0, maxSeen = -1, done = false, waitT = 0, lostT = 0, okT = 0;
    let rng = 1;
    const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;

    function layoutSlots() {
      const gap = narrow ? 0.62 : 0.7, z = 5.4, x0 = -(N - 1) / 2 * gap;
      slots.forEach((s, i) => {
        const on = i < N; s.g.visible = on; s.t.show(on && !narrow);
        s.g.position.set(x0 + i * gap, 0.3, z); s.t.pos.set(x0 + i * gap, -0.25, z + 0.35);
      });
      inboxTag.pos.set(x0 - gap * 0.9 - (narrow ? 0.4 : 0.8), 0.3, z);
      inboxTag.set(narrow ? 'Inbox' : 'Inbox, in order');
    }
    function pointAt(r, d, snap) {
      if (snap) { let acc = 0, i = 0; while (i < r.seg.length && acc + r.seg[i] <= d) acc += r.seg[i++]; return r.pts[i].clone().setY(PY); }
      let acc = 0;
      for (let i = 0; i < r.seg.length; i++) {
        if (d <= acc + r.seg[i]) return r.pts[i].clone().lerp(r.pts[i + 1], (d - acc) / r.seg[i]).setY(PY);
        acc += r.seg[i];
      }
      return r.pts[r.pts.length - 1].clone().setY(PY);
    }
    const speed = ri => SPEED * (busy && ri === 1 ? 0.33 : 1);

    function send() {
      rng = 1 + Math.floor(Math.random() * 1e6);
      simT = 0; chunks = split(MESSAGE, N); got = new Array(N).fill(false); order = []; resent = 0; outOfOrder = 0; maxSeen = -1; done = false; waitT = 0;
      pool.forEach(p => { p.state = 'idle'; p.obj.visible = p.b.visible = false; p.tr.hide(); p.tag.show(false); });
      req.state = 'idle'; req.obj.visible = false; reqTag.show(false);
      const dropSeq = dropOn ? Math.floor(rand() * N) : -1;
      for (let i = 0; i < N; i++) {
        const p = pool[i], ri = Math.floor(rand() * 3);
        Object.assign(p, { seq: i, ri, d: 0, launch: i * 0.32, state: 'wait', resend: false, dropAt: i === dropSeq ? routes[ri].seg[0] : null });
        p.ring.visible = false;
      }
      layoutSlots();
      slots.forEach((s, i) => { s.g.setKey('muted'); s.g.setFill('surface'); s.t.set(i < N ? '·' : ''); });
      receiver.setKey('trust'); rTag.set(FRIEND).cls('trust');
      ctx.announce(`Sending “${MESSAGE}” as ${N} packets.`);
    }

    function launchResend(seq) {
      const p = pool.find(q => q.state === 'idle' && pool.indexOf(q) >= 10) || pool.find(q => q.state === 'idle');
      if (!p) return;
      const ri = busy ? (rand() < 0.5 ? 0 : 2) : 1;
      Object.assign(p, { seq, ri, d: 0, launch: simT, state: 'wait', resend: true, dropAt: null });
      p.ring.visible = true; resent++;
    }

    function advance(dt) {
      simT += dt;
      let active = 0;
      pool.forEach(p => {
        if (p.state === 'wait' && simT >= p.launch) { p.state = 'fly'; p.wi = 0; p.tr.set(routes[p.ri].pts.map(q => q.clone().setY(PY))); }
        if (p.state !== 'fly') { if (p.state === 'wait') active++; return; }
        active++;
        const r = routes[p.ri];
        p.d += speed(p.ri) * dt;
        if (p.dropAt != null && p.d >= p.dropAt) {
          p.state = 'lost'; p.obj.visible = p.b.visible = false; p.tag.show(false); p.tr.hide();
          lostMark.position.copy(r.pts[1]).setY(1.1); lostMark.visible = true; lostT = 1.8;
          lostTag.pos.copy(r.pts[1]).setY(1.9); lostTag.set(`#${p.seq + 1} lost`).show(true);
          ctx.announce(`Packet ${p.seq + 1} was lost at a router.`);
          return;
        }
        if (p.d >= r.len) {
          p.state = 'idle'; p.obj.visible = p.b.visible = false; p.tag.show(false); p.tr.hide(); rings.fire(RCV.clone().setY(PY), 'ok');
          if (!got[p.seq]) {
            got[p.seq] = true; order.push(p.seq);
            if (p.seq < maxSeen) outOfOrder++;
            maxSeen = Math.max(maxSeen, p.seq);
            const s = slots[p.seq]; s.g.setKey('ok'); s.g.setFill('ok'); s.t.set(chunks[p.seq].replace(/ /g, '␣'));
          }
          return;
        }
        const pos = pointAt(r, p.d, ctx.reduce);
        p.obj.position.copy(pos); p.b.position.copy(pos); p.obj.visible = true; p.b.visible = true;
        p.tag.pos.copy(pos).setY(PY + 0.55); p.tag.set(p.resend ? `#${p.seq + 1} again` : `#${p.seq + 1}`).show(!narrow || p.resend);
        p.tr.progress(p.d / r.len);
        // a router ring pulses as each packet passes through it
        let wi = 0, acc = 0; while (wi < r.seg.length && acc + r.seg[wi] <= p.d) acc += r.seg[wi++];
        if (wi > p.wi) { p.wi = wi; if (wi < r.pts.length - 1) rings.fire(r.pts[wi].clone().setY(PY)); }
        if (!ctx.reduce) p.obj.rotation.y += dt * 2;
      });

      // receiver: once nothing else is coming, ask again for anything missing (that's what TCP does)
      if (!done && active === 0 && req.state === 'idle') {
        const missing = got.findIndex(g => !g);
        if (missing === -1) finish();
        else if ((waitT += dt) > 0.7) {
          waitT = 0; req.state = 'fly'; req.d = 0; req.seq = missing; req.obj.visible = true;
          reqTag.set(`Missing #${missing + 1}, send again?`).show(true);
          ctx.announce(`Your friend noticed packet ${missing + 1} is missing and asked for it again.`);
        }
      }
      if (req.state === 'fly') {
        const r = routes[1], back = r.len - req.d;
        req.d += SPEED * 1.6 * dt;
        const pos = pointAt(r, Math.max(0, back), ctx.reduce); req.obj.position.copy(pos);
        reqTag.pos.copy(pos).setY(PY + 0.7);
        if (req.d >= r.len) { req.state = 'idle'; req.obj.visible = false; reqTag.show(false); launchResend(req.seq); }
      }
      if (lostT > 0 && (lostT -= dt) <= 0) { lostMark.visible = false; lostTag.show(false); }
      if (okT > 0 && (okT -= dt) <= 0) receiver.setKey('trust');
      if (lostMark.visible && !ctx.reduce) lostMark.rotation.y += dt * 3;
      report(active);
    }

    function finish() {
      done = true; okT = 2.5;
      receiver.setKey('ok'); rTag.set(narrow ? 'Done ✓' : 'Message complete ✓').cls('ok');
      ctx.announce(`All ${N} packets arrived${outOfOrder ? `, ${outOfOrder} out of order,` : ' in order'}${resent ? ` with ${resent} re-sent` : ''}. Reassembled: ${MESSAGE}.`);
    }

    function report(active) {
      ctx.readout('msg', 'Message', `“${MESSAGE}”`);
      ctx.readout('n', 'Packets', `${N} × about ${Math.round(MESSAGE.length / N)} characters`);
      ctx.readout('fly', 'In flight', String(pool.filter(p => p.state === 'fly').length + (req.state === 'fly' ? 1 : 0)));
      ctx.readout('order', 'Arrival order', order.length ? order.map(s => '#' + (s + 1)).join(' ') : '(none yet)');
      ctx.readout('ooo', 'Out of order', String(outOfOrder), outOfOrder ? 'threat' : '');
      ctx.readout('re', 'Re-sent', String(resent), resent ? 'trust' : '');
      ctx.readout('rebuilt', 'Reassembled', chunks.map((c, i) => got[i] ? c : '_'.repeat(c.length)).join(''), done ? 'ok' : '');
      ctx.readout('t', 'Time', `${simT.toFixed(1)} s (slowed down a lot)`);
    }

    // ---- controls (every action is an HTML control) ----
    const ui = ctx.ui;
    ui.button('Send message', send);
    ui.slider({ label: 'Packets', min: 3, max: 10, value: N, fmt: v => `${v}`, on: v => { N = v; send(); } });
    ui.toggle('Lose a packet', dropOn, v => { dropOn = v; send(); });
    ui.toggle('Middle link busy', busy, v => {
      busy = v; routes[1].line.setKey(v ? 'threat' : 'trust'); busyTag.show(v);
      ctx.announce(v ? 'The middle link is now busy and three times slower.' : 'The middle link is back to normal speed.');
    });
    const pause = ui.toggle('Pause', false, v => { running = !v; stepBtn.disabled = running; });
    const stepBtn = ctx.step(() => advance(0.25));
    stepBtn.disabled = true;
    if (ctx.reduce) ui.note('Reduced motion is on: packets jump from router to router instead of gliding, and trails are off.');

    ctx.fit(narrow ? 12.5 : 18.5, narrow ? 12.5 : 9, V(0, 0.4, 1.2), narrow ? V(0, 1.7, 1) : V(0, 1.15, 1));
    ctx.onFrame(dt => { if (running) advance(dt); });
    send();
    return { dispose() { pause.input.checked = false; } };
  },

  body: `
    <p class="lede">When you send a photo, a message or a video call, it doesn’t travel as one solid thing. It’s cut into small, numbered pieces called ${term('packet', 'packets')}, and each piece finds its own way across the network.</p>
    <h2>Why cut things up?</h2>
    <p>Imagine posting a whole book as one parcel that blocks a road until it arrives. Packets are more like postcards: many people’s postcards share the same roads, a broken road only delays a few, and a lost postcard can be re-sent without starting the whole book again.</p>
    <ul class="points">
      <li><b>Numbered</b>Each packet says “piece 3 of 6”, so the receiver can put them back in order even when they arrive jumbled.</li>
      <li><b>Independent</b>Each packet may take a different route through ${term('router', 'routers')}. A busy link slows some pieces, not all of them.</li>
      <li><b>Recoverable</b>If a piece goes missing, the receiver notices the gap and asks for it again. That’s called ${term('retransmit', 'retransmission')}.</li>
    </ul>
    <h2>Fast, or big?</h2>
    <p>Two different things make the internet feel quick. ${term('latency', 'Latency')} is how long one packet takes to make the trip. ${term('bandwidth', 'Bandwidth')} is how many packets can flow at once. A video call cares most about latency; downloading a film cares most about bandwidth. In the scene, the busy middle link adds latency for anything that takes it.</p>
    <h2>Why this matters for security</h2>
    <p>Because packets pass through many machines you don’t control, anything not encrypted can be read along the way. That’s why day 5 (HTTPS) matters, and why everything in this course starts with the humble packet.</p>
  `,
  deeper: `
    <p>What the scene simplifies:</p>
    <ul>
      <li><b>Size.</b> A typical packet carries up to about 1,500 bytes (the Ethernet MTU), so even this short message would fit in one. We split it up so you can watch.</li>
      <li><b>Layers.</b> Each packet has an IP header (source and destination ${term('ip-address', 'addresses')}, time-to-live) and, inside that, a ${term('tcp', 'TCP')} header with a sequence number and acknowledgement fields.</li>
      <li><b>Loss recovery.</b> Real TCP doesn’t wait for “nothing else is coming”. The receiver acknowledges what it has; the sender re-sends after a timeout or after several duplicate acknowledgements (fast retransmit).</li>
      <li><b>Not every app re-sends.</b> ${term('udp', 'UDP')} skips all of this, which is why a glitchy video call drops a moment of picture rather than freezing to wait for it.</li>
    </ul>
    <p>Try it at home: <code>ping example.com</code> shows latency per packet; <code>traceroute example.com</code> (or <code>tracert</code> on Windows) shows the routers along one path.</p>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc791" rel="noopener">RFC 791 (IP)</a>, <a href="https://www.rfc-editor.org/rfc/rfc9293" rel="noopener">RFC 9293 (TCP)</a>.</p>
  `,
});

// ======================================================================
// Day 2 · IP addresses & routing
// Addresses come from the ranges reserved for documentation (192.0.2.x, 198.51.100.x, 203.0.113.x).
// ======================================================================
CN.register({
  id: 'ip-routing',
  prompt: '<strong>Try this:</strong> send a packet to the shop, then press <em>Cut a link on the route</em> and send again. No router knows the whole map; each one only picks the next hop.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), sx = narrow ? 0.62 : 1;
    S.fog = new T.Fog(0, 18, 44);
    S.add(G.grid(36, 22, 1));

    const routerGeo = new T.CylinderGeometry(0.45, 0.45, 0.7, 6), hostGeo = new T.BoxGeometry(1.2, 0.9, 1.2);
    const N = {};
    const R = { A: [-4.6, 0], B: [-1.4, -3], C: [-1.4, 3], F: [0.6, 0], D: [3, -3], E: [3, 3], G: [4.9, 0] };
    Object.entries(R).forEach(([k, [x, z]]) => { N[k] = node(ctx, routerGeo, 'trust', x * sx, z, { label: k, tagCls: 'bare', tagY: 1.05 }); });
    const HOSTS = {
      you: { x: -8, z: 0, ip: '192.0.2.10', name: 'You', via: 'A' },
      shop: { x: 8, z: -3.4, ip: '203.0.113.7', name: 'Shop', via: 'D' },
      friend: { x: 8.3, z: 0, ip: '198.51.100.23', name: 'Friend', via: 'G' },
      news: { x: 8, z: 3.4, ip: '203.0.113.80', name: 'News site', via: 'E' },
    };
    Object.entries(HOSTS).forEach(([k, h]) => {
      N[k] = node(ctx, hostGeo, 'trust', h.x * sx, h.z, { label: narrow ? h.name : `${h.name}<br>${h.ip}`, tagCls: k === 'you' ? 'trust' : '' });
    });
    const LINKS = [['A', 'B'], ['A', 'C'], ['A', 'F'], ['B', 'F'], ['C', 'F'], ['B', 'D'], ['C', 'E'], ['F', 'D'], ['F', 'E'], ['D', 'G'], ['E', 'G']]
      .map(([a, b]) => ({ a, b, cut: false }));
    const HOSTLINKS = Object.entries(HOSTS).map(([k, h]) => ({ a: k, b: h.via, cut: false, fixed: true }));
    [...LINKS, ...HOSTLINKS].forEach(l => {
      const pa = N[l.a].p.clone().setY(0.45), pb = N[l.b].p.clone().setY(0.45);
      l.line = G.line([pa, pb], 'trust', { width: 1.6 }); S.add(l.line);
      l.mark = ctx.tag('✕ cut', pa.clone().lerp(pb, 0.5).setY(0.9), 'alert').show(false);
    });
    const linkName = l => `${l.a}–${l.b}`;
    const findLink = (a, b) => [...LINKS, ...HOSTLINKS].find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    function adj() {
      const m = {};
      [...LINKS, ...HOSTLINKS].forEach(l => { if (l.cut) return; (m[l.a] ||= []).push(l.b); (m[l.b] ||= []).push(l.a); });
      // hosts have a single link each, so they can only ever be endpoints, never shortcuts
      return m;
    }

    let dest = 'shop', at = null, hops = 0, decision = '(none yet)', status = 'Ready';
    const pkt = mover(ctx, { key: 'text', glow: 'trust' });
    const lost = flash(ctx, 'alert');
    const SPEED = 4;

    function highlight() {
      [...LINKS, ...HOSTLINKS].forEach(l => { l.line.setKey(l.cut ? 'alert' : 'trust'); l.mark.show(l.cut); });
      const from = at || 'you';
      const path = shortestPath(adj(), from, dest);
      if (path) for (let i = 1; i < path.length; i++) findLink(path[i - 1], path[i]).line.setKey('ok');
      report(path);
    }
    function send() {
      at = 'you'; hops = 0; decision = 'You hand the packet to your router, A.'; status = 'Travelling';
      Object.values(N).forEach(n => n.look('trust'));
      highlight();
      hop('A');
      ctx.announce(`Sending a packet to ${HOSTS[dest].name} at ${HOSTS[dest].ip}.`);
    }
    function hop(next) {
      const from = at;
      pkt.go([N[from].p.clone().setY(0.95), N[next].p.clone().setY(0.95)], SPEED, () => arrive(next), `to ${HOSTS[dest].ip}`);
    }
    function arrive(n) {
      at = n; hops++;
      if (n === dest) {
        status = 'Delivered'; decision = `${HOSTS[dest].name} recognises its own address and accepts the packet.`;
        N[n].look('ok'); at = null; highlight();
        ctx.announce(`Delivered to ${HOSTS[dest].name} in ${hops} hops.`);
        return;
      }
      const path = shortestPath(adj(), n, dest);
      if (!path) {
        status = 'Unreachable'; decision = `Router ${n} has no working route to ${HOSTS[dest].ip}, so it drops the packet and reports back.`;
        lost.at(N[n].p.clone().setY(1.2), 'No route'); at = null; highlight();
        ctx.announce(`Destination unreachable: router ${n} has no route left.`);
        return;
      }
      const next = path[1];
      decision = `Router ${n}: “${HOSTS[dest].ip}? Best next hop is ${HOSTS[next] ? HOSTS[next].name : 'router ' + next}.”`;
      N[n].look('ok');
      highlight();
      hop(next);
    }
    function report(path) {
      const name = k => (HOSTS[k] ? HOSTS[k].name : k);
      ctx.readout('dest', 'Destination', `${HOSTS[dest].name} · ${HOSTS[dest].ip}`);
      ctx.readout('route', at ? 'Route from here' : 'Planned route', path ? path.map(name).join(' → ') : 'none: unreachable', path ? 'ok' : 'alert');
      ctx.readout('hops', 'Hops so far', String(hops));
      ctx.readout('last', 'Latest decision', decision);
      ctx.readout('cut', 'Links cut', LINKS.filter(l => l.cut).map(linkName).join(', ') || 'none', LINKS.some(l => l.cut) ? 'alert' : '');
      ctx.readout('status', 'Status', status, status === 'Delivered' ? 'ok' : status === 'Unreachable' ? 'alert' : '');
    }
    function setCut(l, v) {
      l.cut = v; updateLinkBtn(); highlight();
      ctx.announce(`Link ${linkName(l)} ${v ? 'cut' : 'restored'}.`);
    }

    ui.select('Send to', Object.entries(HOSTS).filter(([k]) => k !== 'you').map(([k, h]) => ({ label: `${h.name} (${h.ip})`, value: k })), dest, v => { dest = v; at = null; pkt.hide(); highlight(); });
    ui.button('Send packet', send);
    ui.button('Cut a link on the route', () => {
      const path = shortestPath(adj(), at || 'you', dest);
      const c = path && path.slice(1).map((n, i) => findLink(path[i], n)).filter(l => !l.fixed && !l.cut);
      if (c && c.length) setCut(c[Math.floor(c.length / 2)], true);
      else ctx.announce('No cuttable link left on the route.');
    }, { ghost: true });
    const pick = ui.select('Link', LINKS.map((l, i) => ({ label: linkName(l), value: String(i) })), '0', () => updateLinkBtn());
    const linkBtn = ui.button('Cut', () => { const l = LINKS[+pick.input.value]; setCut(l, !l.cut); }, { ghost: true });
    function updateLinkBtn() { linkBtn.textContent = LINKS[+pick.input.value].cut ? 'Restore' : 'Cut'; }
    ui.button('Restore all', () => { LINKS.forEach(l => { l.cut = false; }); updateLinkBtn(); highlight(); ctx.announce('All links restored.'); }, { ghost: true });
    makeClock(ctx, dt => { pkt.update(dt); lost.update(dt); });

    ctx.fit(narrow ? 12.5 : 21, narrow ? 12 : 9.5, V(0, 0.4, 0.8), narrow ? V(0, 1.7, 1) : V(0, 1.2, 1));
    highlight();
  },
  body: `
    <p class="lede">Every device on a network has an ${term('ip-address', 'IP address')}, a number like <code>203.0.113.7</code>. Every packet carries the address it’s going to. That’s all a ${term('router', 'router')} needs.</p>
    <h2>Nobody holds the whole map</h2>
    <p>A router doesn’t plan a packet’s full journey. It looks at the destination address, checks its own table and passes the packet one step closer: the <em>next hop</em>. The next router does the same. Thousands of small, local decisions add up to a route across the world.</p>
    <ul class="points">
      <li><b>Addresses</b>Like postal addresses, they’re organised in blocks, so a router can say “anything starting 203.0.113 goes that way”.</li>
      <li><b>Hop by hop</b>Each router only answers one question: which neighbour is closer to this address?</li>
      <li><b>Self-healing</b>When a link fails, routers learn it and quietly send traffic another way. That resilience was a design goal from the start.</li>
    </ul>
    <h2>Why this matters for security</h2>
    <p>Your packets pass through routers run by many different organisations, and you can’t choose them. Assume anything unencrypted can be seen in transit. Addresses also reveal roughly where a device is, which is one reason privacy tools hide or share them.</p>
  `,
  deeper: `
    <ul>
      <li><b>Prefixes.</b> Addresses are grouped into blocks written like <code>203.0.113.0/24</code> (CIDR notation): the first 24 bits name the network, the rest name the device.</li>
      <li><b>Routing tables and longest match.</b> A router picks the most specific matching prefix, with a default route (<code>0.0.0.0/0</code>) for everything else.</li>
      <li><b>Learning routes.</b> Inside one organisation, protocols like OSPF share link state. Between organisations, BGP announces which networks can be reached through whom. Route-origin validation (RPKI) helps stop networks claiming address space that isn’t theirs.</li>
      <li><b>TTL.</b> Each packet carries a hop limit that every router decrements, so a packet caught in a loop eventually dies. <code>traceroute</code> uses this to reveal each hop.</li>
      <li><b>IPv6.</b> 128-bit addresses like <code>2001:db8::1</code>, with the same ideas at a vastly bigger scale.</li>
    </ul>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc4632" rel="noopener">RFC 4632 (CIDR)</a>, <a href="https://www.rfc-editor.org/rfc/rfc5737" rel="noopener">RFC 5737 (documentation addresses)</a>.</p>
  `,
});

// ======================================================================
// Day 3 · DNS
// Names use the reserved .example domain; timings are typical-ish, not measured.
// ======================================================================
CN.register({
  id: 'dns',
  prompt: '<strong>Try this:</strong> look up <em>shop.example</em> and count the messages. Then look it up again: the resolver remembers, so the second answer is almost instant.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), sx = narrow ? 0.6 : 1;
    S.fog = new T.Fog(0, 18, 44);
    S.add(G.grid(34, 22, 1));
    const NAMES = { 'shop.example': '203.0.113.7', 'news.example': '198.51.100.42', 'bank.example': '192.0.2.55' };
    const TTL = 30; // seconds of scene time (real records often say 300 s or more)

    const box = new T.BoxGeometry(1.3, 1, 1.3), tower = new T.BoxGeometry(1, 2, 1), cyl = new T.CylinderGeometry(0.7, 0.7, 1.4, 8);
    const P = {
      laptop: node(ctx, box, 'trust', -7.4 * sx, 2, { label: narrow ? 'Laptop' : 'Your laptop', tagCls: 'trust' }),
      resolver: node(ctx, cyl, 'trust', -2.6 * sx, 2, { label: 'Resolver', bloom: 3 }),
      root: node(ctx, tower, 'trust', 2 * sx, -3.6, { label: 'Root server' }),
      tld: node(ctx, tower, 'trust', 6.4 * sx, 0, { label: '.example servers' }),
      auth: node(ctx, tower, 'trust', 2.6 * sx, 4.4, { label: 'shop.example’s name server' }),
    };
    const COST = { laptop: 8, root: 25, tld: 30, auth: 40 }; // one-way milliseconds to/from the resolver
    [['laptop', 'resolver'], ['resolver', 'root'], ['resolver', 'tld'], ['resolver', 'auth']].forEach(([a, b]) => {
      S.add(G.line([P[a].p.clone().setY(0.05), P[b].p.clone().setY(0.05)], 'muted', { width: 1, halo: false }));
    });

    let name = 'shop.example', cacheOn = true, cache = new Map(), simT = 0;
    let plan = [], qi = 0, wait = 0, busy = false, ms = 0, sent = 0, answer = '(none yet)', viaCache = false;
    const msg = mover(ctx, { key: 'trust', glow: 'trust', shape: 'sphere', size: 0.4 });

    function build() {
      const ip = NAMES[name], c = cache.get(name);
      const hit = cacheOn && c && c.expires > simT;
      viaCache = !!hit;
      if (hit) return [
        ['laptop', 'resolver', `Where is ${name}?`, 'q'],
        ['resolver', 'laptop', `${ip} (remembered)`, 'a'],
      ];
      return [
        ['laptop', 'resolver', `Where is ${name}?`, 'q'],
        ['resolver', 'root', `Where is ${name}?`, 'q'],
        ['root', 'resolver', 'Ask the .example servers', 'r'],
        ['resolver', 'tld', `Where is ${name}?`, 'q'],
        ['tld', 'resolver', `Ask ${name}’s name server`, 'r'],
        ['resolver', 'auth', `Where is ${name}?`, 'q'],
        ['auth', 'resolver', `${ip}, keep for ${TTL}s`, 'a'],
        ['resolver', 'laptop', `${ip}`, 'a'],
      ];
    }
    function lookup() {
      plan = build(); qi = 0; wait = 0; busy = true; ms = 0; sent = 0; answer = '(waiting)';
      P.auth.tag.set(narrow ? 'Name server' : `${name}’s name server`);
      Object.values(P).forEach(n => n.look('trust'));
      next();
      ctx.announce(viaCache ? `Looking up ${name}. The resolver has it cached.` : `Looking up ${name}. The resolver has to ask around.`);
    }
    function next() {
      if (qi >= plan.length) return finish();
      const [a, b, text, kind] = plan[qi];
      const key = kind === 'a' ? 'ok' : kind === 'r' ? 'muted' : 'trust';
      msg.look(key, key === 'muted' ? 'trust' : key).tagClass(key === 'muted' ? '' : key);
      P[b].look('trust');
      msg.go(arc(ctx, P[a].p.clone().setY(1.1), P[b].p.clone().setY(1.1), 1.4), 10, () => {
        ms += COST[a === 'resolver' ? b : a] || 8; sent++;
        P[b].look(kind === 'a' ? 'ok' : 'trust');
        qi++; wait = 0.25;
      }, text);
    }
    function finish() {
      busy = false;
      const ip = NAMES[name];
      answer = `${name} → ${ip}`;
      if (cacheOn && !viaCache) cache.set(name, { ip, expires: simT + TTL });
      P.laptop.tag.set(`${narrow ? 'Laptop' : 'Your laptop'}<br>→ ${ip}`);
      ctx.announce(`${name} is ${ip}. ${sent} messages, about ${ms} milliseconds${viaCache ? ', answered from the cache' : ''}.`);
    }
    function advance(dt) {
      simT += dt;
      msg.update(dt);
      if (busy && !msg.active && (wait -= dt) <= 0 && qi > 0) next();
      [...cache].forEach(([k, v]) => { if (v.expires <= simT) cache.delete(k); });
      P.resolver.tag.set(narrow ? `Resolver (${cache.size})` : `Resolver · cache: ${cache.size}`);
      report();
    }
    function report() {
      ctx.readout('name', 'Looking up', name);
      ctx.readout('ans', 'Answer', answer, answer.includes('→') ? 'ok' : '');
      ctx.readout('n', 'Messages', `${sent}${busy ? ' so far' : ''}`);
      ctx.readout('ms', 'Time (simulated)', `${ms} ms${viaCache && !busy && sent ? ' (from cache)' : ''}`, viaCache && !busy && sent ? 'ok' : '');
      ctx.readout('cache', 'Resolver cache', cache.size ? [...cache].map(([k, v]) => `${k} → ${v.ip} (forgets in ${Math.ceil(v.expires - simT)} s)`).join('; ') : (cacheOn ? 'empty' : 'switched off'));
    }

    ui.select('Name', Object.keys(NAMES).map(n => ({ label: n, value: n })), name, v => { name = v; answer = '(none yet)'; sent = 0; ms = 0; });
    ui.button('Look it up', () => { if (!busy) lookup(); });
    ui.toggle('Resolver cache', cacheOn, v => { cacheOn = v; if (!v) cache.clear(); });
    ui.button('Clear cache', () => { cache.clear(); ctx.announce('Cache cleared.'); }, { ghost: true });
    makeClock(ctx, advance);
    ctx.fit(narrow ? 12.5 : 18, narrow ? 13 : 10.5, V(0, 0.8, 0.6), narrow ? V(0, 1.6, 1) : V(0, 1.1, 1));
    report();
  },
  body: `
    <p class="lede">Computers find each other by number, but people remember names. ${term('dns', 'DNS')}, the Domain Name System, is the internet’s phone book: it turns <code>shop.example</code> into an address like <code>203.0.113.7</code>.</p>
    <h2>Asking around</h2>
    <p>Your device asks one helper, its ${term('resolver', 'resolver')}. If the resolver doesn’t already know the answer, it works down a chain. The <b>root</b> servers know who runs each ending (like <code>.com</code> or <code>.example</code>). Those servers know who runs each name. That name’s own server gives the final answer.</p>
    <ul class="points">
      <li><b>Hierarchy</b>No single server knows every name. Each level only points to the next one down.</li>
      <li><b>Caching</b>Answers come with a “keep this for N seconds” label (the TTL), so the next lookup is almost free.</li>
      <li><b>Every visit starts here</b>Nearly everything you do online begins with a DNS lookup, often several per page.</li>
    </ul>
    <h2>Why this matters for security</h2>
    <p>Whoever answers your DNS questions can see which sites you look up, and a wrong answer can send you to the wrong place. That’s why resolvers you can trust matter, and why many devices now encrypt lookups. HTTPS (day 5) is the backstop: even if DNS sends you somewhere wrong, the impostor can’t show a valid certificate for the real name.</p>
  `,
  deeper: `
    <ul>
      <li><b>Record types.</b> <code>A</code> (IPv4 address), <code>AAAA</code> (IPv6), <code>CNAME</code> (alias), <code>MX</code> (mail server), <code>TXT</code> (text, often used to prove domain ownership), <code>NS</code> (who is authoritative).</li>
      <li><b>Recursive vs authoritative.</b> Your resolver does the legwork (recursion). Authoritative servers only answer for the names they’re responsible for.</li>
      <li><b>Privacy.</b> Classic DNS is unencrypted UDP on port 53. DNS over HTTPS (DoH) and DNS over TLS (DoT) encrypt the question between you and the resolver.</li>
      <li><b>Integrity.</b> DNSSEC lets resolvers verify answers are signed by the zone’s owner, defending against forged or poisoned answers.</li>
    </ul>
    <p>Try it: <code>dig example.com</code> or <code>nslookup example.com</code> shows the answer and its TTL; <code>dig +trace example.com</code> walks the chain from the root.</p>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc1034" rel="noopener">RFC 1034</a>, <a href="https://www.rfc-editor.org/rfc/rfc8484" rel="noopener">RFC 8484 (DoH)</a>.</p>
  `,
});

// ======================================================================
// Day 4 · TCP handshake & ports
// Sequence numbers are random starting points, as in real TCP; ports are the common defaults.
// ======================================================================
CN.register({
  id: 'tcp-ports',
  prompt: '<strong>Try this:</strong> connect to port 443 and watch the three-step handshake. Then try port 3306, which is closed, and switch on <em>Lose the final ACK</em> to see the server ask again.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), sx = narrow ? 0.55 : 1;
    S.fog = new T.Fog(0, 16, 40);
    S.add(G.grid(30, 18, 1));
    const PORTS = [
      { n: 22, svc: 'Remote admin (SSH)', open: false },
      { n: 25, svc: 'Mail (SMTP)', open: false },
      { n: 80, svc: 'Web (HTTP)', open: true },
      { n: 443, svc: 'Secure web (HTTPS)', open: true },
      { n: 3306, svc: 'Database (MySQL)', open: false },
    ];
    const client = node(ctx, new T.BoxGeometry(1.4, 1, 1.4), 'trust', -6.5 * sx, 0, { label: 'Your laptop', tagCls: 'trust' });
    const SX = 5.6 * sx;
    const server = ctx.glow.wire(new T.BoxGeometry(2.2, 3.4, 2.6), 'trust', { fill: 'surface' });
    server.position.set(SX + 1.1, 1.7, 0); S.add(server);
    ctx.tag(narrow ? 'Server' : 'Server · shop.example', V(SX + 1.1, 3.9, 0), '');
    const doorGeo = new T.BoxGeometry(1.1, 0.46, 0.12); // doors on the front face, so the camera sees them
    PORTS.forEach((p, i) => {
      p.y = 0.42 + i * 0.64;
      p.door = G.wire(doorGeo, 'muted', { fill: 'surface' }); p.door.position.set(SX + 1.1, p.y, 1.32); S.add(p.door);
      p.tag = ctx.tag(String(p.n), V(SX - 0.45, p.y, 1.32), 'bare');
      p.at = V(SX + 0.5, p.y, 1.5);
    });
    S.add(G.line([client.p.clone().setY(0.05), V(SX, 0.05, 0)], 'muted', { width: 1, halo: false }));

    let port = PORTS[3], loseAck = false, cState = 'CLOSED', sState = 'LISTEN', last = '(none yet)', count = 0;
    let busy = false, timers = [], cSeq = 0, sSeq = 0, dataLeft = 0;
    const m1 = mover(ctx, { key: 'trust', glow: 'trust', shape: 'sphere', size: 0.42 });
    const m2 = mover(ctx, { key: 'text', glow: 'trust', size: 0.3 });
    const lost = flash(ctx, 'alert');
    const later = (t, fn) => timers.push({ t, fn });

    function paintDoors() {
      PORTS.forEach(p => { const live = busy && p === port && cState === 'ESTABLISHED'; p.door.setKey(p.open ? 'ok' : 'muted'); p.tag.cls(p === port ? (p.open ? 'ok' : 'alert') : 'bare'); if (live) p.door.setKey('trust'); });
    }
    function beam(fromClient, label, key, done, opts) {
      const a = fromClient ? client.p.clone().setY(port.y + 0.2) : port.at, b = fromClient ? port.at : client.p.clone().setY(port.y + 0.2);
      m1.look(key).tagClass(key === 'text' ? '' : key).go(arc(ctx, a, b, 0.9), 8, () => { count++; last = label; done && done(); }, label, opts);
    }
    function connect() {
      if (busy) return;
      busy = true; timers = []; count = 0; dataLeft = 0; m2.hide();
      cSeq = 1000 + Math.floor(Math.random() * 8000); sSeq = 1000 + Math.floor(Math.random() * 8000);
      cState = 'SYN-SENT'; sState = port.open ? 'LISTEN' : 'nothing listening';
      paintDoors();
      ctx.announce(`Connecting to port ${port.n}, ${port.svc}.`);
      beam(true, `SYN seq=${cSeq}`, 'trust', () => {
        if (!port.open) {
          later(0.3, () => beam(false, 'RST: nothing here', 'alert', () => {
            cState = 'CLOSED'; busy = false; paintDoors();
            ctx.announce(`Port ${port.n} is closed. The server refused the connection.`);
          }));
          return;
        }
        sState = 'SYN-RECEIVED';
        later(0.3, synAck);
      });
    }
    function synAck(again) {
      beam(false, `SYN-ACK seq=${sSeq} ack=${cSeq + 1}${again ? ' (again)' : ''}`, 'trust', () => {
        later(0.3, () => {
          if (loseAck && !again) {
            beam(true, `ACK ack=${sSeq + 1}`, 'trust', null, { stopAt: 0.5, onStop: mm => {
              mm.hide(); lost.at(mm.position.clone(), 'ACK lost'); count++;
              cState = 'ESTABLISHED'; last = 'ACK lost on the way';
              ctx.announce('The final ACK was lost. The server waits, then sends its SYN-ACK again.');
              later(1.4, () => synAck(true));
            } });
            return;
          }
          beam(true, `ACK ack=${sSeq + 1}`, 'trust', established);
        });
      });
    }
    function established() {
      cState = sState = 'ESTABLISHED'; paintDoors();
      ctx.announce(`Connected to port ${port.n}. Data can flow.`);
      dataLeft = 3; later(0.3, sendData);
    }
    function sendData() {
      if (!dataLeft) { busy = false; paintDoors(); return; }
      const fromClient = dataLeft % 2 === 1;
      const a = fromClient ? client.p.clone().setY(port.y + 0.2) : port.at, b = fromClient ? port.at : client.p.clone().setY(port.y + 0.2);
      m2.go([a, b], 9, () => { count++; last = fromClient ? 'data → server' : 'data → you'; dataLeft--; later(0.15, sendData); }, 'data');
    }
    function advance(dt) {
      m1.update(dt); m2.update(dt); lost.update(dt);
      timers = timers.filter(t => { if ((t.t -= dt) > 0) return true; t.fn(); return false; });
      ctx.readout('port', 'Port', `${port.n} · ${port.svc}`);
      ctx.readout('door', 'That door is', port.open ? 'open (a service is listening)' : 'closed', port.open ? 'ok' : 'alert');
      ctx.readout('c', 'Your laptop', cState, cState === 'ESTABLISHED' ? 'ok' : '');
      ctx.readout('s', 'Server', sState, sState === 'ESTABLISHED' ? 'ok' : '');
      ctx.readout('last', 'Last message', last);
      ctx.readout('count', 'Messages', String(count));
      ctx.readout('open', 'Open doors', PORTS.filter(p => p.open).map(p => p.n).join(', ') || 'none');
    }

    function stop() { busy = false; timers = []; m1.hide(); m2.hide(); dataLeft = 0; cState = 'CLOSED'; sState = port.open ? 'LISTEN' : 'nothing listening'; }
    ui.select('Connect to', PORTS.map((p, i) => ({ label: `${p.n} · ${p.svc}`, value: String(i) })), '3', v => { port = PORTS[+v]; stop(); last = '(none yet)'; count = 0; paintDoors(); });
    ui.button('Connect', connect);
    ui.toggle('Lose the final ACK', loseAck, v => { loseAck = v; });
    const doors = ui.add(ui.el('div', 'group')); doors.setAttribute('role', 'group'); doors.setAttribute('aria-label', 'Open or close server ports');
    PORTS.forEach(p => {
      const b = ui.el('button', 'chip', `${p.n} ${p.open ? 'open' : 'closed'}`); b.type = 'button'; b.setAttribute('aria-pressed', String(p.open));
      b.addEventListener('click', () => { stop(); p.open = !p.open; b.textContent = `${p.n} ${p.open ? 'open' : 'closed'}`; b.setAttribute('aria-pressed', String(p.open)); if (p === port) sState = p.open ? 'LISTEN' : 'nothing listening'; paintDoors(); ctx.announce(`Port ${p.n} is now ${p.open ? 'open' : 'closed'}.`); });
      doors.appendChild(b);
    });
    makeClock(ctx, advance);
    paintDoors();
    ctx.fit(narrow ? 11.5 : 19.5, narrow ? 9 : 7.5, V(0.5 * sx, 1.4, 0.4), narrow ? V(0, 0.9, 1) : V(0, 0.6, 1));
  },
  body: `
    <p class="lede">Before your browser and a website exchange a single byte of the page, they shake hands. ${term('tcp', 'TCP')} opens every reliable connection with three short messages, and every connection is aimed at a numbered door called a ${term('port', 'port')}.</p>
    <h2>Three steps to agree</h2>
    <p><b>SYN</b>: “I’d like to talk; I’ll number my bytes from here.” <b>SYN-ACK</b>: “Got it; here’s my starting number.” <b>ACK</b>: “Got yours too.” Now both sides know the other is there and listening, and how to number everything that follows, so lost pieces can be noticed and re-sent (day 1).</p>
    <ul class="points">
      <li><b>Ports are doors</b>One server can run many services: web on 443, mail on 25, remote admin on 22. Each listens behind its own door.</li>
      <li><b>Closed doors answer “no”</b>Knock on a port where nothing listens and you get a reset (RST) straight away.</li>
      <li><b>Lost messages are retried</b>If a handshake message goes missing, the side waiting for it tries again after a pause.</li>
    </ul>
    <h2>Why this matters for security</h2>
    <p>Every open port is a door that anyone on the internet can knock on, and automated scanners knock on all of them, all day. The safest service is one that isn’t exposed at all: close what you don’t use, and keep things like databases and admin panels off the public internet. Day 6’s firewall is how you enforce that.</p>
  `,
  deeper: `
    <ul>
      <li><b>Sequence numbers.</b> Each side picks a random initial sequence number (ISN). Acknowledgements say “I’ve received everything up to byte N−1; send N next”. Randomness makes it hard for an outsider to forge packets in someone else’s connection.</li>
      <li><b>States.</b> CLOSED → SYN-SENT → ESTABLISHED on the client; LISTEN → SYN-RECEIVED → ESTABLISHED on the server. Closing uses FIN/ACK in each direction.</li>
      <li><b>Port ranges.</b> 0–1023 are “well-known” service ports; your side of a connection uses a temporary high port (49152–65535 by default on many systems).</li>
      <li><b>SYN floods.</b> Half-open connections use server memory, so servers defend with SYN cookies that avoid storing state until the final ACK.</li>
      <li><b>QUIC.</b> HTTP/3 runs over QUIC (on UDP), which folds the transport and encryption handshakes together to save round trips.</li>
    </ul>
    <p>See your own connections: <code>netstat -an</code> or <code>ss -tan</code> lists them with their states.</p>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc9293" rel="noopener">RFC 9293 (TCP)</a>.</p>
  `,
});

// ======================================================================
// Day 5 · TLS / HTTPS
// The "password" is a made-up example. The certificate authority is fictional.
// ======================================================================
CN.register({
  id: 'tls-https',
  prompt: '<strong>Try this:</strong> send the messages with HTTPS off and read what the eavesdropper sees. Switch HTTPS on and send again. Then pick the <em>lookalike</em> site: the padlock still appears, which is exactly the point.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), sx = narrow ? 0.58 : 1;
    S.fog = new T.Fog(0, 16, 40);
    S.add(G.grid(30, 18, 1));
    const Y = 0.9;
    const you = node(ctx, new T.BoxGeometry(1.4, 1, 1.4), 'trust', -6.6 * sx, 0, { label: 'Your browser', tagCls: 'trust' });
    const site = node(ctx, new T.BoxGeometry(1.6, 1.8, 1.6), 'trust', 6.6 * sx, 0, { label: 'shop.example' });
    const A = V(-5.7 * sx, Y, 0), B = V(5.6 * sx, Y, 0);
    S.add(G.line([A.clone().setY(0.3), B.clone().setY(0.3)], 'trust', { width: 1.4 }));
    const eve = node(ctx, new T.OctahedronGeometry(0.75), 'threat', 0, -3.4, { y: 0.2, label: narrow ? 'Eavesdropper' : 'Eavesdropper on the café Wi-Fi', tagCls: 'threat', bloom: 2.6 });
    S.add(G.line([eve.p.clone().setY(0.3), V(0, 0.3, 0)], 'threat', { width: 1, halo: false }));
    const sees = ctx.tag('Sees: nothing yet', V(0, 0.05, -1.7), 'threat');
    const len = B.x - A.x;
    const tunnel = G.wire(new T.CylinderGeometry(0.55, 0.55, len, 10, 1, true), 'ok', { fill: 'ok', fillOpacity: 0.1, width: 1 });
    tunnel.rotation.z = Math.PI / 2; tunnel.position.set((A.x + B.x) / 2, Y, 0); tunnel.visible = false; S.add(tunnel);
    const lock = ctx.tag('', V(you.p.x, 1.95, 0), '').show(false);

    const SITES = {
      real: { host: 'shop.example', cert: 'shop.example', issuer: 'Example Trust CA (fictional)', valid: true, note: 'This is the shop you meant.' },
      lookalike: { host: 'shop-example.net', cert: 'shop-example.net', issuer: 'Example Trust CA (fictional)', valid: true, note: 'Valid certificate, padlock shown, but this is a different site that just looks similar.' },
      mismatch: { host: 'shop.example', cert: 'other.example', issuer: 'Example Trust CA (fictional)', valid: false, note: 'The certificate is for another name, so the browser stops and warns you.' },
    };
    const MSGS = ['GET /account', 'password: correct-horse (example)', 'order: 2 tickets'];
    let https = false, which = 'real', secure = false, busy = false, seen = 'nothing yet', step = '', certText = '(not checked)';
    let queue = [], timers = [];
    const later = (t, fn) => timers.push({ t, fn });
    const m = mover(ctx, { key: 'text', glow: 'trust', size: 0.36 });
    const lost = flash(ctx, 'alert');
    const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(' ');

    function sendAll() {
      if (busy) return;
      busy = true; timers = [];
      const s = SITES[which];
      site.tag.set(s.host);
      if (https && !secure) handshake(s);
      else { queue = MSGS.slice(); nextMsg(); }
    }
    function handshake(s) {
      m._text = null; step = 'TLS handshake'; ctx.announce('Starting the TLS handshake.');
      m.look('trust').tagClass('trust').go([A, B], 6, () => {
        m.look('text').tagClass('').go([B, A], 6, () => {
          certText = `issued to ${s.cert} by ${s.issuer}`;
          if (s.cert !== s.host) {
            lost.at(V(A.x + 2.6 * sx, 1.2, 0), 'Name mismatch', 2.4);
            lock.set('⚠ Not secure: blocked').cls('alert').show(true);
            step = 'Blocked by the browser'; busy = false;
            ctx.announce('Warning: the certificate is for a different name. The browser blocks the connection and sends nothing.');
            return;
          }
          m.look('ok').tagClass('ok').go([A, B], 6, () => {
            secure = true; tunnel.visible = true; step = 'Encrypted tunnel ready';
            lock.set(`Padlock · ${s.host}`).cls('ok').show(true);
            ctx.announce(`Certificate checked for ${s.host}. The connection is now encrypted.`);
            queue = MSGS.slice(); later(0.3, nextMsg);
          }, 'Keys agreed');
        }, `Certificate: ${s.cert}`);
      }, 'Hello, let’s use TLS');
    }
    let sniffed = false;
    function nextMsg() {
      if (!queue.length) { busy = false; step = 'Sent'; return; }
      const text = queue.shift(); sniffed = false;
      step = `Sending “${text}”`;
      m.look(secure ? 'ok' : 'text', secure ? 'ok' : 'trust').tagClass(secure ? 'ok' : '');
      m.go([A, B], 4.5, () => later(0.25, nextMsg), secure ? 'sealed' : text);
      m._text = text;
    }
    function advance(dt) {
      m.update(dt); lost.update(dt);
      timers = timers.filter(t => { if ((t.t -= dt) > 0) return true; t.fn(); return false; });
      if (m.active && m._text && !sniffed && m.position.x >= 0) {
        sniffed = true;
        seen = secure ? hex(10) + '…' : m._text;
        sees.set(`Sees: ${seen}`);
        ctx.announce(secure ? 'The eavesdropper copied the packet but sees only scrambled bytes.' : `The eavesdropper read: ${m._text}.`);
      }
      const s = SITES[which];
      ctx.readout('site', 'Site', s.host);
      ctx.readout('conn', 'Connection', secure ? 'HTTPS (encrypted)' : https ? 'HTTPS (not yet connected)' : 'HTTP (readable by anyone on the path)', secure ? 'ok' : https ? '' : 'threat');
      ctx.readout('cert', 'Certificate', certText, certText.startsWith('issued') ? (s.cert === s.host ? 'ok' : 'alert') : '');
      ctx.readout('lock', 'Padlock', secure ? 'shown' : 'not shown');
      ctx.readout('eve', 'Eavesdropper sees', seen, secure ? 'ok' : seen === 'nothing yet' ? '' : 'threat');
      ctx.readout('step', 'Now', step || 'Ready');
      ctx.readout('note', 'Note', https ? s.note : 'Without HTTPS there’s no certificate to check at all.');
    }
    function reset() {
      secure = false; tunnel.visible = false; lock.show(false); busy = false; timers = []; queue = []; m.hide(); m._text = null;
      seen = 'nothing yet'; sees.set('Sees: nothing yet'); certText = '(not checked)'; step = '';
      site.tag.set(SITES[which].host);
    }

    ui.toggle('HTTPS', https, v => { https = v; reset(); ctx.announce(v ? 'HTTPS on.' : 'HTTPS off.'); });
    ui.select('Site', [
      { label: 'shop.example (the real shop)', value: 'real' },
      { label: 'shop-example.net (a lookalike)', value: 'lookalike' },
      { label: 'shop.example, wrong certificate', value: 'mismatch' },
    ], which, v => { which = v; reset(); });
    ui.button('Send messages', sendAll);
    makeClock(ctx, advance);
    ctx.fit(narrow ? 10.5 : 17, narrow ? 10 : 8.5, V(0, 0.8, -1), narrow ? V(0, 1.4, 1) : V(0, 0.95, 1));
  },
  body: `
    <p class="lede">The padlock in your browser means one specific thing: the connection between you and the named site is encrypted, and the site proved it owns that name. It does <em>not</em> mean the site is honest.</p>
    <h2>Two jobs in one handshake</h2>
    <p>${term('tls', 'TLS')} first checks the site’s ${term('certificate', 'certificate')}, a digital ID card signed by an authority your device already trusts. Then both sides agree on fresh keys and seal everything that follows. Anyone in between (the café Wi-Fi, an internet provider, a compromised router) sees only scrambled bytes.</p>
    <ul class="points">
      <li><b>Private</b>Passwords, card numbers and messages can’t be read on the way.</li>
      <li><b>Untampered</b>Changes in transit are detected, so nobody can quietly edit a page or a download.</li>
      <li><b>Named</b>You’re talking to whoever controls <em>that exact name</em>. A wrong certificate gets a full-page warning: don’t click past it.</li>
    </ul>
    <h2>What the padlock can’t tell you</h2>
    <p>Anyone can get a valid certificate for a name they own, including <code>shop-example.net</code>. Scammers use HTTPS too. Read the name in the address bar, especially before you log in or pay. On day 11 you’ll meet passkeys, which check the name for you.</p>
  `,
  deeper: `
    <ul>
      <li><b>TLS 1.3 handshake.</b> ClientHello and ServerHello exchange key shares (usually elliptic-curve Diffie–Hellman), so both sides derive the same secret without ever sending it. The server proves its identity by signing the handshake with its certificate’s private key. That’s one round trip before data flows.</li>
      <li><b>The chain of trust.</b> Your device ships with root certificate authorities; sites present a chain from their own certificate up to one of those roots. Certificate Transparency logs make mis-issued certificates publicly visible.</li>
      <li><b>What still leaks.</b> The IP address you connect to, the timing and size of traffic, and often the site name itself (sent in the Server Name Indication unless Encrypted Client Hello is used).</li>
      <li><b>HSTS.</b> Sites can tell browsers “always use HTTPS for me”, which defeats attempts to downgrade you to plain HTTP.</li>
    </ul>
    <p>Look for yourself: click the padlock (or the site-settings icon) in your browser’s address bar to see who a certificate was issued to and by whom.</p>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc8446" rel="noopener">RFC 8446 (TLS 1.3)</a>, <a href="https://www.rfc-editor.org/rfc/rfc6797" rel="noopener">RFC 6797 (HSTS)</a>.</p>
  `,
});

// ======================================================================
// Day 6 · Firewalls & NAT
// Home addresses are private (192.168.1.x); public ones come from the documentation ranges.
// ======================================================================
CN.register({
  id: 'firewalls-nat',
  prompt: '<strong>Try this:</strong> have the phone visit the news site and watch the router swap its address on the way out and back. Then let the stranger knock on port 22, and see what changes when you forward that port.',
  mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), sx = narrow ? 0.56 : 1;
    S.fog = new T.Fog(0, 18, 44);
    S.add(G.grid(34, 22, 1));
    const PUBLIC = '203.0.113.5';
    const dev = new T.BoxGeometry(1.1, 0.8, 1.1), srv = new T.BoxGeometry(1.2, 1.4, 1.2);
    const HX = -6.8 * sx, RX = -1.6 * sx, WX = -0.4 * sx, NX = 7 * sx;
    const home = [V(-9.2 * sx, 0.04, -4.4), V(-0.9 * sx, 0.04, -4.4), V(-0.9 * sx, 0.04, 4.4), V(-9.2 * sx, 0.04, 4.4), V(-9.2 * sx, 0.04, -4.4)];
    S.add(G.line(home, 'trust', { width: 1.2, halo: false }));
    ctx.tag(narrow ? 'Home' : 'Your home · private addresses', V(-5 * sx, 0.1, 4.9), 'bare');
    const D = {
      laptop: { n: node(ctx, dev, 'trust', HX, -3, { label: narrow ? 'Laptop' : 'Laptop<br>192.168.1.10' }), ip: '192.168.1.10', name: 'Laptop' },
      phone: { n: node(ctx, dev, 'trust', HX, 0, { label: narrow ? 'Phone' : 'Phone<br>192.168.1.11' }), ip: '192.168.1.11', name: 'Phone' },
      tv: { n: node(ctx, dev, 'trust', HX, 3, { label: narrow ? 'TV' : 'TV<br>192.168.1.12' }), ip: '192.168.1.12', name: 'TV' },
    };
    const router = node(ctx, new T.BoxGeometry(1, 0.7, 1.6), 'trust', RX, 0, { label: narrow ? 'Router' : `Router<br>public ${PUBLIC}`, tagCls: 'trust', bloom: 2.4 });
    const wall = G.wire(new T.BoxGeometry(0.08, 2.2, 8.6), 'trust', { fill: 'trust', fillOpacity: 0.07, width: 1 });
    wall.position.set(WX, 1.1, 0); S.add(wall);
    ctx.tag('Firewall', V(WX, 2.6, -3.8), 'bare');
    const SV = {
      news: { n: node(ctx, srv, 'trust', NX, -3.4, { label: narrow ? 'News' : 'News site<br>198.51.100.20' }), ip: '198.51.100.20', port: 443 },
      game: { n: node(ctx, srv, 'trust', NX, 0, { label: narrow ? 'Game' : 'Game server<br>198.51.100.77' }), ip: '198.51.100.77', port: 3074 },
    };
    const stranger = node(ctx, new T.OctahedronGeometry(0.7), 'threat', NX, 3.6, { y: 0.1, label: 'Stranger', tagCls: 'threat', bloom: 2.4 });
    const Y = 0.85, RP = V(RX, Y, 0);
    Object.values(D).forEach(d => S.add(G.line([d.n.p.clone().setY(0.05), RP.clone().setY(0.05)], 'muted', { width: 1, halo: false })));
    [...Object.values(SV).map(s => s.n), stranger].forEach(n => S.add(G.line([RP.clone().setY(0.05), n.p.clone().setY(0.05)], 'muted', { width: 1, halo: false })));

    let nat = [], nextPort = 40001, forward = false, last = '(none yet)', dropped = 0;
    const pool = Array.from({ length: 4 }, () => mover(ctx, { key: 'text', glow: 'trust', size: 0.34 }));
    const free = () => pool.find(p => !p.active) || pool[0];
    const wallHit = flash(ctx, 'alert');
    const at = n => n.p.clone().setY(Y);

    function visit(dk, sk) {
      const d = D[dk], s = SV[sk], m = free();
      const local = 50000 + Math.floor(Math.random() * 9000);
      m.look('text', 'trust').tagClass('');
      m.go([at(d.n), RP], 5, () => {
        let row = nat.find(r => r.ip === d.ip && r.local === local);
        if (!row) { row = { dev: d.name, ip: d.ip, local, pub: nextPort++, to: `${s.ip}:${s.port}` }; nat.push(row); }
        last = `Out: ${d.ip}:${local} rewritten to ${PUBLIC}:${row.pub}`;
        ctx.announce(`The router rewrote the ${d.name.toLowerCase()}'s private address to ${PUBLIC} port ${row.pub} and noted it in its table.`);
        m.go([RP, at(s.n)], 5, () => {
          m.look('ok', 'ok').tagClass('ok');
          m.go([at(s.n), RP], 5, () => {
            last = `Back: ${PUBLIC}:${row.pub} matches the table, so it goes to the ${d.name.toLowerCase()}`;
            m.go([RP, at(d.n)], 5, () => { d.n.look('ok'); later(1, () => d.n.look('trust')); ctx.announce(`The reply reached the ${d.name.toLowerCase()}.`); }, `to ${d.ip}:${local}`);
          }, `reply to ${PUBLIC}:${row.pub}`);
        }, `from ${PUBLIC}:${row.pub}`);
      }, `from ${d.ip}:${local}`);
    }
    function knock() {
      const m = free();
      m.look('threat', 'threat').tagClass('threat');
      m.go([at(stranger), V(WX + 0.15, Y, 0)], 5, () => {
        if (!forward) {
          dropped++; wallHit.at(V(WX + 0.5, 1.4, 0), 'Dropped');
          last = `In: unsolicited packet to ${PUBLIC}:22. No table entry, no rule: dropped.`;
          ctx.announce('The firewall dropped the stranger’s packet. Nobody inside asked for it.');
          return;
        }
        last = `In: port 22 is forwarded, so the router sends it to the laptop.`;
        m.go([V(WX + 0.15, Y, 0), RP, at(D.laptop.n)], 5, () => {
          D.laptop.n.look('threat'); later(1.6, () => D.laptop.n.look('trust'));
          ctx.announce('The stranger reached the laptop’s remote-admin door. Forwarding a port opens it to the whole internet.');
        }, 'to laptop:22');
      }, `to ${PUBLIC}:22`);
    }
    let timers = [];
    const later = (t, fn) => timers.push({ t, fn });
    function advance(dt) {
      pool.forEach(p => p.update(dt)); wallHit.update(dt);
      timers = timers.filter(t => { if ((t.t -= dt) > 0) return true; t.fn(); return false; });
      ctx.readout('pub', 'Public address', `${PUBLIC} (shared by every device)`);
      ctx.readout('nat', 'NAT table', nat.length ? nat.map(r => `${r.dev} ${r.ip}:${r.local} ↔ :${r.pub} (${r.to})`).join('; ') : 'empty');
      ctx.readout('rules', 'Firewall rules', `Inbound: allow replies only${forward ? '; forward 22 → laptop' : ''}`, forward ? 'threat' : 'ok');
      ctx.readout('drop', 'Dropped knocks', String(dropped));
      ctx.readout('last', 'Last event', last);
    }

    ui.button('Phone → news site', () => visit('phone', 'news'));
    ui.button('Laptop → game server', () => visit('laptop', 'game'), { ghost: true });
    ui.button('TV → news site', () => visit('tv', 'news'), { ghost: true });
    ui.button('Stranger knocks on port 22', knock, { ghost: true });
    ui.toggle('Forward port 22 to the laptop (risky)', forward, v => { forward = v; wall.setKey(v ? 'threat' : 'trust'); ctx.announce(v ? 'Port 22 now forwards to the laptop.' : 'Port forwarding removed.'); });
    ui.button('Clear NAT table', () => { nat = []; ctx.announce('NAT table cleared.'); }, { ghost: true });
    makeClock(ctx, advance);
    ctx.fit(narrow ? 12 : 21, narrow ? 12 : 10, V(-0.6 * sx, 0.6, 0.6), narrow ? V(0, 1.6, 1) : V(0, 1.15, 1));
  },
  body: `
    <p class="lede">Your home network has a front door: the router. Two quiet features there do a lot of protecting. ${term('nat', 'NAT')} lets every device share one public address, and the ${term('firewall', 'firewall')} turns away traffic nobody inside asked for.</p>
    <h2>One address, many devices</h2>
    <p>Inside your home, devices use private addresses like <code>192.168.1.11</code> that mean nothing on the internet. When the phone talks to a website, the router swaps in the home’s single public address and writes a note in its table. When the reply comes back, the note says which device asked.</p>
    <ul class="points">
      <li><b>Default deny</b>A packet arriving from outside with no matching note is just dropped. Strangers can’t start a conversation with your TV.</li>
      <li><b>Replies get through</b>Because the router remembers who asked, answers to your own requests are let back in automatically.</li>
      <li><b>Forwarding opens doors</b>A port-forward rule deliberately lets outsiders reach one device. Use it rarely, and never for remote-admin services.</li>
    </ul>
    <h2>Why this matters for security</h2>
    <p>Automated scanners knock on every public address all the time. A router with default settings blocks almost all of it, but only if the router itself is looked after: change its admin password, keep its firmware updated, and turn off features you don’t use, such as remote administration or automatic port opening (UPnP).</p>
  `,
  deeper: `
    <ul>
      <li><b>Stateful filtering.</b> The firewall tracks connections (source, destination, ports, protocol) and allows return traffic for ones initiated from inside. That table is the same idea as the NAT table here.</li>
      <li><b>Private ranges.</b> <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code> and <code>192.168.0.0/16</code> are reserved for private networks and never routed on the public internet.</li>
      <li><b>NAT isn’t a security feature by design</b>; it exists because IPv4 ran short of addresses. With IPv6, devices often have public addresses, so the router’s firewall rules do the real protecting.</li>
      <li><b>Host firewalls.</b> Your laptop has its own firewall too, which matters on networks you don’t control, like hotels and cafés.</li>
      <li><b>Egress rules.</b> Organisations also filter what leaves the network, to limit what malware can reach.</li>
    </ul>
    <p>Standards: <a href="https://www.rfc-editor.org/rfc/rfc1918" rel="noopener">RFC 1918 (private addresses)</a>, <a href="https://www.rfc-editor.org/rfc/rfc4787" rel="noopener">RFC 4787 (NAT behaviour)</a>.</p>
  `,
});
