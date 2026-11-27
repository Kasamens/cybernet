/* CyberNet engine: scene registry, routing, nav, renderer, controls, readout, theme, render loop.
 *
 * Scene contract (scenes/*.js):
 *   CN.register({ id, day, week, title, tagline, prompt, body, deeper, habit, mount(ctx) })
 *   Registering an id twice merges the fields, so scenes/catalog.js can declare every day's metadata
 *   and a week file can add the real mount/body later. A day with no mount shows the "planned" scene.
 *
 * ctx (passed to mount):
 *   THREE, scene, camera, renderer, host (stage element), reduce (prefers-reduced-motion), colors (THREE.Color by token)
 *   onFrame(fn(dt, t)), onTheme(fn(colors)), onResize(fn(w, h)), fit(w, h, target?, dir?), narrow()
 *   tag(html, pos?, cls?) -> { el, pos, set(html), show(bool), cls(name) }   HTML label pinned to a 3D point
 *   ui.button / ui.toggle / ui.slider / ui.select / ui.chips / ui.note / ui.el   real, labelled HTML controls
 *   step(fn, label?)       a Step button (keyboard and reduced-motion users never need animation)
 *   readout(key, label, value, tone?)   visible state panel next to the stage (the stage's aria-describedby)
 *   announce(text)         polite screen-reader announcement for key events (not every frame)
 *   glow                   neon helpers from glow.js: line, wire, bloom, grid, trail
 *   V(x, y, z)             shorthand for new THREE.Vector3
 * Everything added to ctx.scene is disposed on unmount; controls, tags and readout are cleared.
 * mount may return { dispose() } for anything else.
 */
import * as progress from './progress.js';
import { enhanceTerms, loadGlossary } from './glossary.js';

const defs = new Map();
export const WEEKS = { 1: 'How the network moves', 2: 'Security foundations', 3: 'Defending people & systems', 4: 'Security in the age of AI' };
const TOKENS = ['bg', 'surface', 'surface-2', 'grid', 'text', 'muted', 'trust', 'threat', 'ok', 'alert'];

export const CN = {
  register(def) {
    if (!def || !def.id) throw new Error('CN.register needs an id');
    defs.set(def.id, Object.assign(defs.get(def.id) || {}, def));
  },
  start,
};

const $ = id => document.getElementById(id);
const list = () => [...defs.values()].sort((a, b) => a.day - b.day);
const pad = n => String(n).padStart(2, '0');
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

let THREE = null, glow = null, renderer = null, camera = null, scene = null;
let colors = {}, glowAmt = 1, current = null, mounted = null, lastFit = null, stageVisible = true, mountedNarrow = null, remountT = 0;
const isNarrow = () => { const h = $('stage'); return h.clientWidth / Math.max(h.clientHeight, 1) < 1.25; };
let frameFns = [], themeFns = [], resizeFns = [], tags = [];

// ---------- boot ----------
async function start() {
  wireChrome();
  loadGlossary();
  try {
    THREE = await import('three');
    const [a, b, c, d, e] = await Promise.all(['Line2', 'LineGeometry', 'LineMaterial', 'LineSegments2', 'LineSegmentsGeometry']
      .map(n => import(`three/addons/lines/${n}.js`)));
    const { makeGlow } = await import('./glow.js');
    glow = makeGlow(THREE, { ...a, ...b, ...c, ...d, ...e });
    initRenderer();
  } catch (err) {
    console.warn('CyberNet: 3D unavailable', err);
    THREE = null;
    stageMessage('The 3D scene could not start in this browser (WebGL or modules unavailable). The lesson text and controls below still work.');
  }
  show(location.hash.slice(1), false);
  if (renderer) loop();
}

function stageMessage(text) {
  const host = $('stage');
  let m = $('stage-msg');
  if (!m) { m = document.createElement('p'); m.id = 'stage-msg'; m.className = 'stage-msg'; host.appendChild(m); }
  m.textContent = text;
}

function initRenderer() {
  const host = $('stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.tabIndex = -1;
  const m = $('stage-msg'); if (m) m.remove();
  host.appendChild(renderer.domElement);
  const leads = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leads.id = 'leads'; leads.setAttribute('class', 'leads'); leads.setAttribute('aria-hidden', 'true');
  host.appendChild(leads);
  const tagLayer = document.createElement('div'); tagLayer.className = 'tags'; tagLayer.id = 'tags'; tagLayer.setAttribute('aria-hidden', 'true');
  host.appendChild(tagLayer);
  host.appendChild($('hud'));
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  readTokens();
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(es => { stageVisible = es[0].isIntersecting; }).observe(host);
  resize();
}

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  TOKENS.forEach(k => {
    const v = cs.getPropertyValue('--' + k).trim();
    if (THREE) (colors[k] ||= new THREE.Color()).set(v || '#888888');
  });
  glowAmt = parseFloat(cs.getPropertyValue('--glow')) || 0;
  if (!THREE) return;
  if (glow) glow.retheme(colors, glowAmt);
  if (renderer) renderer.setClearColor(colors.bg, 1);
  if (scene && scene.fog) scene.fog.color.copy(colors.bg);
  themeFns.forEach(fn => safe(fn, colors));
}

function resize() {
  if (!renderer) return;
  const host = $('stage'), w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  glow.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  if (lastFit) fitCamera(...lastFit);
  resizeFns.forEach(fn => safe(fn, w, h));
  placeTags();
  // scenes lay out differently on narrow (phone) stages: rebuild when the stage crosses that line
  if (current && mountedNarrow !== null && isNarrow() !== mountedNarrow) { clearTimeout(remountT); remountT = setTimeout(() => mount(current), 150); }
}

function fitCamera(w, h, target, dir) {
  lastFit = [w, h, target, dir];
  const v = THREE.MathUtils.degToRad(camera.fov) / 2;
  const dist = Math.max((h / 2) / Math.tan(v), (w / 2) / (Math.tan(v) * camera.aspect)) * 1.08;
  camera.position.copy(target).addScaledVector(dir.clone().normalize(), dist);
  camera.lookAt(target);
}

// ---------- mounting ----------
function unmount() {
  if (mounted && mounted.dispose) safe(() => mounted.dispose());
  mounted = null;
  if (scene) {
    scene.traverse(o => {
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach(m => { if (m.map && !m.map.userData.keep) m.map.dispose(); m.dispose(); });
    });
  }
  frameFns = []; themeFns = []; resizeFns = []; tags = []; lastFit = null;
  if (glow) glow.reset();
  const tl = $('tags'); if (tl) tl.textContent = '';
  const ld = $('leads'); if (ld) ld.textContent = '';
  sceneT = 0;
  $('controls').textContent = '';
  $('readout-list').textContent = '';
}

function mount(def) {
  unmount();
  const controls = $('controls');
  if (!THREE) {
    if (def.mount) note(controls, 'Controls for this scene need the 3D view, which is unavailable here.');
    return;
  }
  scene = new THREE.Scene();
  glow.setReduce(mq.matches);
  scene.add(glow.stars());
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(4, 10, 6); scene.add(dl);
  camera.position.set(0, 6, 14); camera.lookAt(0, 0, 0);
  mountedNarrow = isNarrow();
  const ctx = makeCtx();
  try {
    mounted = (def.mount || plannedScene)(ctx, def) || null;
  } catch (err) {
    console.error(err);
    unmount();
    note(controls, 'This scene failed to load. The lesson text below still applies.');
  }
  readTokens();
}

function makeCtx() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const ctx = {
    THREE, renderer, camera, glow, colors, V,
    get scene() { return scene; },
    host: $('stage'),
    reduce: mq.matches,
    narrow: isNarrow,
    onFrame: fn => frameFns.push(fn),
    onTheme: fn => themeFns.push(fn),
    onResize: fn => resizeFns.push(fn),
    fit: (w, h, target = V(), dir = V(0, 0.75, 1)) => fitCamera(w, h, target, dir),
    tag(html, pos = V(), cls = '', { lead = null } = {}) {
      const el = document.createElement('div'); el.className = 'tag ' + cls; el.innerHTML = html;
      $('tags').appendChild(el);
      // lead: [dx, dy] px. The label sits off the anchor, joined to it by a thin leader line with a dot.
      let ln = null;
      if (lead) {
        const NS = 'http://www.w3.org/2000/svg';
        ln = document.createElementNS(NS, 'g'); ln.setAttribute('class', 'lead ' + cls);
        ln.append(document.createElementNS(NS, 'line'), document.createElementNS(NS, 'circle'));
        ln.lastChild.setAttribute('r', '2.2');
        $('leads').appendChild(ln);
      }
      const t = { el, ln, lead, pos: pos.clone ? pos.clone() : V(...pos), set(h) { if (el.innerHTML !== h) el.innerHTML = h; return t; },
        show(b) { el.hidden = !b; if (ln) ln.style.display = b ? '' : 'none'; return t; },
        cls(c) { el.className = 'tag ' + c; if (ln) ln.setAttribute('class', 'lead ' + c); return t; } };
      tags.push(t); return t;
    },
    readout(key, label, value, tone = '') {
      const listEl = $('readout-list');
      let dd = listEl.querySelector(`dd[data-k="${key}"]`);
      if (!dd) {
        const dt = document.createElement('dt'); dt.textContent = label;
        dd = document.createElement('dd'); dd.dataset.k = key;
        listEl.append(dt, dd);
      }
      const s = String(value);
      if (dd.textContent !== s) dd.textContent = s;
      if (dd.className !== tone) dd.className = tone;
    },
    announce,
    step(fn, label = 'Step ▸') { return ctx.ui.button(label, fn, { ghost: true, title: 'Advance the scene by one step' }); },
    ui: makeUI(),
  };
  return ctx;
}

let uid = 0;
function makeUI() {
  const host = $('controls');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const add = e => { host.appendChild(e); return e; };
  return {
    el, add,
    button(label, fn, { ghost = false, title } = {}) {
      const b = el('button', 'btn' + (ghost ? ' ghost' : ''), label); b.type = 'button';
      if (title) b.title = title;
      b.addEventListener('click', () => fn(b)); return add(b);
    },
    toggle(label, init, fn) {
      const l = el('label', 'switch'), i = el('input'); i.type = 'checkbox'; i.checked = !!init; i.setAttribute('role', 'switch');
      i.addEventListener('change', () => fn(i.checked)); l.append(i, document.createTextNode(label)); add(l);
      return { input: i, set(v) { i.checked = v; } };
    },
    slider({ label, min, max, step = 1, value, fmt = v => v, on }) {
      const id = 'cn-s' + (++uid), l = el('label', 'ctl'), i = el('input'), o = el('output');
      i.type = 'range'; i.id = id; Object.assign(i, { min, max, step, value });
      o.htmlFor = id; o.textContent = fmt(+value);
      i.setAttribute('aria-valuetext', fmt(+value));
      i.addEventListener('input', () => { const v = +i.value; o.textContent = fmt(v); i.setAttribute('aria-valuetext', fmt(v)); on(v); });
      l.append(document.createTextNode(label), i, o); add(l);
      return { input: i, set(v) { i.value = v; o.textContent = fmt(v); } };
    },
    select(label, options, init, fn) {
      const l = el('label', 'ctl'), s = el('select');
      options.forEach(o => { const op = el('option', '', o.label); op.value = o.value; s.appendChild(op); });
      s.value = init; s.addEventListener('change', () => fn(s.value));
      l.append(document.createTextNode(label), s); add(l);
      return { input: s, set(v) { s.value = v; } };
    },
    chips(label, opts, init, fn) {
      const g = el('div', 'group'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
      const bs = opts.map(o => { const b = el('button', 'chip', o.label); b.type = 'button'; b.addEventListener('click', () => { set(o.value); fn(o.value); }); g.appendChild(b); return [o.value, b]; });
      function set(v) { bs.forEach(([val, b]) => b.setAttribute('aria-pressed', String(val === v))); }
      set(init); add(g); return { set };
    },
    note(text) { return add(el('p', 'controls-note', text)); },
  };
}
function note(host, text) { const p = document.createElement('p'); p.className = 'controls-note'; p.textContent = text; host.appendChild(p); }

let annT = 0;
function announce(text) {
  const a = $('announce'); a.textContent = '';
  clearTimeout(annT); annT = setTimeout(() => { a.textContent = text; }, 60);
}

// The placeholder world for days whose scene isn't built yet.
function plannedScene(ctx, def) {
  const { THREE: T, glow: G, V } = ctx;
  const S = ctx.scene;
  S.fog = new T.Fog(0x000000, 10, 26);
  S.add(G.grid(24, 24, 1));
  const shape = G.wire(new T.IcosahedronGeometry(1.5, 0), 'trust', { fill: 'surface', fillOpacity: 0.85 });
  shape.position.y = 2; S.add(shape);
  const b = G.bloom('trust', 5, 0.25); b.position.copy(shape.position); S.add(b);
  ctx.tag('Scene in progress', V(0, 4.1, 0), 'trust');
  ctx.fit(9, 6, V(0, 1.6, 0), V(0, 0.55, 1));
  ctx.onFrame((dt, t) => { if (!ctx.reduce) { shape.rotation.y = t * 0.3; shape.rotation.x = Math.sin(t * 0.4) * 0.2; } });
  ctx.readout('status', 'Status', 'Planned, not built yet', 'threat');
  ctx.readout('week', 'Week', `${def.week}: ${WEEKS[def.week]}`);
  if (def.scene) ctx.readout('plan', 'Scene', def.scene);
  ctx.ui.note('This day’s interactive world is on the build list. The lesson outline and today’s habit below are ready.');
}

// ---------- page ----------
function resolve(hash) {
  const all = list();
  const m = /^day-(\d+)$/.exec(hash || '');
  if (m) return all.find(d => d.day === +m[1]);
  return defs.get(hash);
}

function show(hash, userNav = true) {
  const all = list();
  let def = resolve(hash), missing = false;
  if (!def) { missing = !!hash; def = all[0]; history.replaceState(null, '', '#' + def.id); }
  current = def;

  const notice = $('notice');
  notice.textContent = '';
  if (missing) { const p = document.createElement('p'); p.className = 'notice'; p.textContent = `There’s no lesson called “${hash}”, so here’s day 1.`; notice.appendChild(p); }

  $('day').textContent = def.kind === 'review' ? `Day ${def.day} · Week ${def.week} review` : `Day ${def.day} · Week ${def.week}: ${WEEKS[def.week]}`;
  $('title').textContent = def.title;
  $('tagline').textContent = def.tagline || '';
  $('prompt').innerHTML = def.prompt || '';
  $('prompt').hidden = !def.prompt;
  $('stage').setAttribute('aria-label', `Interactive scene: ${def.title}`);
  document.title = `Day ${def.day}: ${def.title} · CyberNet`;
  $('nav-current').textContent = `Day ${def.day}: ${def.title}`;
  $('hud-l').textContent = `CyberNet // Day ${pad(def.day)} // ${def.title}`;

  const body = $('body');
  body.innerHTML = def.body || plannedBody(def);
  enhanceTerms(body);
  body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  renderExtras(def);
  renderPager(def, all);
  progress.visit(def.id);
  buildNav();
  mount(def);
  if (userNav) { window.scrollTo(0, 0); $('title').setAttribute('tabindex', '-1'); $('title').focus({ preventScroll: true }); }
}

function plannedBody(def) {
  if (def.kind === 'review') return `<p class="lede">${def.tagline || ''}</p>
    <p><em>This review quiz unlocks once week ${def.week}’s lessons are built. Each scenario will ask which concept from the week is at work, and link back to that day.</em></p>`;
  return `<p class="lede">${def.tagline || ''}</p>
    <h2>What you’ll see</h2><p>${def.scene || 'To be designed.'}</p>
    ${def.teaches ? `<h2>What it teaches</h2><p>${def.teaches}</p>` : ''}
    <p><em>This lesson is planned. Its interactive scene and full explainer are still being built.</em></p>`;
}

function renderExtras(def) {
  const x = $('extras'); x.textContent = '';
  if (def.deeper) {
    const d = document.createElement('details'); d.className = 'deeper body';
    d.innerHTML = `<summary>Under the hood (for the technically curious)</summary><div class="inner">${def.deeper}</div>`;
    enhanceTerms(d);
    x.appendChild(d);
  }
  if (def.habit) {
    const id = 'habit-' + def.id;
    const box = document.createElement('div'); box.className = 'habit body';
    const i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.checked = progress.habitDone(def.id);
    const l = document.createElement('label'); l.htmlFor = id;
    l.innerHTML = `<span class="k">Do this today</span>`; l.appendChild(document.createTextNode(def.habit));
    i.addEventListener('change', () => { progress.setHabit(def.id, i.checked); buildNav(); announce(i.checked ? 'Habit ticked off.' : 'Habit unticked.'); });
    box.append(i, l); x.appendChild(box);
  }
}

function renderPager(def, all) {
  const i = all.indexOf(def), prev = all[i - 1], next = all[i + 1];
  const pager = $('pager'); pager.textContent = '';
  const link = (d, cls, label) => {
    const a = document.createElement('a'); a.href = '#' + d.id; a.className = cls;
    a.innerHTML = `<span class="eyebrow">${label} · Day ${d.day}</span>`; a.appendChild(document.createTextNode(d.title)); return a;
  };
  pager.appendChild(prev ? link(prev, 'prev', '‹ Previous') : Object.assign(document.createElement('span'), { className: 'blank' }));
  pager.appendChild(next ? link(next, 'next', 'Next ›') : Object.assign(document.createElement('span'), { className: 'blank' }));
  const mp = $('m-prev'), mn = $('m-next');
  mp.href = prev ? '#' + prev.id : '#'; mp.setAttribute('aria-disabled', String(!prev));
  mn.href = next ? '#' + next.id : '#'; mn.setAttribute('aria-disabled', String(!next));
}

function buildNav() {
  const nav = $('nav'), all = list(); nav.textContent = '';
  Object.keys(WEEKS).forEach(w => {
    const days = all.filter(d => d.week === +w); if (!days.length) return;
    const h = document.createElement('h2'); h.textContent = `Week ${w} · ${WEEKS[w]}`; nav.appendChild(h);
    const ol = document.createElement('ol');
    days.forEach(d => {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + d.id;
      if (current && d.id === current.id) a.setAttribute('aria-current', 'page');
      const st = status(d);
      a.innerHTML = `<span class="n">${pad(d.day)}</span><span class="${d.mount ? '' : 'soon'}"></span><span class="st ${st.done ? 'done' : ''}" aria-hidden="true">${st.icon}</span>`;
      a.children[1].textContent = d.title;
      const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = [d.mount ? '' : ' (planned)', st.label].join(''); a.appendChild(sr);
      li.appendChild(a); ol.appendChild(li);
    });
    nav.appendChild(ol);
  });
  const sum = progress.summary(all);
  $('progress-sum').firstChild.textContent = `${sum.habits}/${sum.habitTotal} habits · ${sum.visited}/${all.length} days visited. Saved on this device only.`;
  $('progress-bar').style.width = `${Math.round(100 * sum.habits / Math.max(1, sum.habitTotal))}%`;
}
function status(d) {
  if (d.kind === 'review') { const q = progress.quiz(d.id); return q ? { icon: `${q.best}/${q.of}`, done: q.best === q.of, label: `, best score ${q.best} of ${q.of}` } : { icon: '', label: '' }; }
  if (progress.habitDone(d.id)) return { icon: '✓', done: true, label: ', habit done' };
  if (progress.visited(d.id)) return { icon: '·', label: ', visited' };
  return { icon: '', label: '' };
}

// ---------- chrome: theme, nav toggle, keys, hash ----------
function wireChrome() {
  const root = document.documentElement;
  const btns = [...document.querySelectorAll('.theme button')];
  const os = window.matchMedia('(prefers-color-scheme: light)');
  const apply = mode => {
    root.dataset.mode = mode;
    root.dataset.theme = mode === 'light' || (mode === 'auto' && os.matches) ? 'light' : 'dark';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    readTokens();
  };
  btns.forEach(b => b.addEventListener('click', () => { try { localStorage.setItem('cn-theme', b.dataset.mode); } catch (e) {} apply(b.dataset.mode); }));
  os.addEventListener('change', () => { if (root.dataset.mode === 'auto') apply('auto'); });
  apply(root.dataset.mode || 'auto');

  const aside = $('sidebar'), tog = $('nav-toggle');
  const setOpen = o => { aside.classList.toggle('open', o); tog.setAttribute('aria-expanded', String(o)); };
  tog.addEventListener('click', () => setOpen(!aside.classList.contains('open')));
  $('nav').addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && aside.classList.contains('open')) { setOpen(false); tog.focus(); } });
  document.addEventListener('click', e => { if (aside.classList.contains('open') && !aside.contains(e.target) && !tog.contains(e.target)) setOpen(false); });

  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest('input, select, textarea, [contenteditable], [role="slider"]')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = list(), i = all.indexOf(current), to = all[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (to) { e.preventDefault(); location.hash = to.id; }
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  mq.addEventListener('change', () => current && mount(current));

  $('reset').addEventListener('click', () => {
    if (!confirm('Clear your saved progress (visited days, habits and quiz scores) on this device?')) return;
    progress.reset(); buildNav(); renderExtras(current); announce('Progress cleared.');
  });
  // other modules (quizzes) can ask the nav to refresh
  document.addEventListener('cn:progress', buildNav);
}

// ---------- loop ----------
const tmpV = { v: null };
let sceneT = 0, hudT = 0;
function placeTags() {
  if (!tags.length || !camera) return;
  const host = $('stage'), w = host.clientWidth, h = host.clientHeight;
  const v = tmpV.v ||= new THREE.Vector3();
  tags.forEach(t => {
    if (t.el.hidden) return;
    v.copy(t.pos).project(camera);
    const behind = v.z > 1;
    const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    const dx = t.lead ? t.lead[0] : 0, dy = t.lead ? t.lead[1] : 0;
    t.el.style.visibility = behind ? 'hidden' : '';
    t.el.style.transform = `translate(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px) translate(-50%, ${t.lead ? '-100%' : '-50%'})`;
    if (t.ln) {
      const [l, c] = t.ln.children;
      l.setAttribute('x1', x.toFixed(1)); l.setAttribute('y1', y.toFixed(1)); l.setAttribute('x2', (x + dx).toFixed(1)); l.setAttribute('y2', (y + dy).toFixed(1));
      c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
      t.ln.style.visibility = behind ? 'hidden' : '';
    }
  });
}
function loop() {
  let last = performance.now(), t = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden || !stageVisible || !scene) return;
    t += dt; sceneT += dt;
    glow.tick(dt);
    if ((hudT -= dt) <= 0) { hudT = 0.1; $('hud-t').textContent = `T+${sceneT.toFixed(1).padStart(4, '0')}s`; }
    frameFns = frameFns.filter(fn => { try { fn(dt, t); return true; } catch (err) { console.error(err); return false; } });
    placeTags();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}
function safe(fn, ...a) { try { return fn(...a); } catch (err) { console.error(err); } }
