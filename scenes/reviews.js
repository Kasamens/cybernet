/* Review days: "which concept is at work?" quizzes.
 * The week's concepts stand as neon pillars. Pick one (buttons below the stage); the right pillar rises and
 * turns green, a wrong pick dims and shows a hint. Each answer links back to its day.
 * Built so far: review 1. Reviews 2–4 unlock as their weeks are built (add a questions list + register below).
 */
import { CN } from '../js/engine.js';
import * as progress from '../js/progress.js';

const NAMES = {
  'packets': ['Packets', 1], 'ip-routing': ['IP & routing', 2], 'dns': ['DNS', 3],
  'tcp-ports': ['TCP & ports', 4], 'tls-https': ['TLS / HTTPS', 5], 'firewalls-nat': ['Firewalls & NAT', 6],
};
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function quiz(reviewId, questions, options) {
  return function mount(ctx) {
    const { THREE: T, glow: G, V } = ctx, S = ctx.scene, ui = ctx.ui;
    const narrow = ctx.narrow(), n = options.length, cols = narrow ? 2 : 3, rows = Math.ceil(n / cols);
    const DX = narrow ? 2.7 : 3.1, DZ = narrow ? 3 : 2.7, H0 = 0.8, UP = 2.6, DOWN = 0.2;
    S.fog = new T.Fog(0, 14, 34);
    S.add(G.grid(30, 24, 1));

    const geo = new T.BoxGeometry(1.3, 1, 1.3);
    const pillars = options.map((id, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const g = G.wire(geo, 'trust', { fill: 'surface', fillOpacity: 0.92 });
      const x = (c - (cols - 1) / 2) * DX, z = (r - (rows - 1) / 2) * DZ;
      g.position.set(x, 0, z); S.add(g);
      const b = G.bloom('trust', 2.4, 0.18); b.position.set(x, 0.2, z); S.add(b);
      const t = ctx.tag(NAMES[id][0], V(x, 0, z));
      return { id, g, b, t, h: 0.01, th: H0, x, z };
    });
    ctx.fit(cols * DX + 0.6, rows * DZ * 0.8 + 1.4, V(0, 0.9, 0.5), V(0, 1.1, 1));

    const qEl = ui.add(ui.el('p', 'review-q')); qEl.setAttribute('aria-live', 'polite');
    const choices = ui.add(ui.el('div', 'review-choices')); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Which concept?');
    const fb = ui.add(ui.el('p', 'feedback')); fb.setAttribute('aria-live', 'polite');
    const next = ui.button('Next question', () => {
      if (finished) start();
      else if (qi + 1 < order.length) ask(qi + 1);
      else end();
    }, { ghost: true });

    let order = [], qi = 0, score = 0, answered = false, finished = false, btns = [];
    function start() {
      order = shuffle(questions); score = 0; finished = false;
      ask(0);
    }
    function ask(i) {
      qi = i; answered = false;
      const Q = order[i];
      qEl.innerHTML = `<span class="eyebrow">Scenario ${i + 1} of ${order.length}</span>`;
      qEl.appendChild(document.createTextNode(Q.q));
      fb.textContent = ''; next.hidden = true;
      choices.textContent = '';
      btns = options.map(id => {
        const b = ui.el('button', 'chip', NAMES[id][0]); b.type = 'button';
        b.addEventListener('click', () => answer(id)); choices.appendChild(b); return b;
      });
      pillars.forEach(p => { p.th = H0; p.g.setKey('trust'); p.b.setKey('trust'); p.t.cls(''); });
      report();
    }
    function answer(id) {
      if (answered) return;
      answered = true;
      const Q = order[qi], right = id === Q.a;
      if (right) score++;
      btns.forEach((b, i) => { b.disabled = true; if (options[i] === Q.a) b.classList.add('right'); else if (options[i] === id) b.classList.add('wrong'); });
      pillars.forEach(p => {
        if (p.id === Q.a) { p.th = UP; p.g.setKey('ok'); p.b.setKey('ok'); p.t.cls('ok'); }
        else if (p.id === id) { p.th = DOWN; p.g.setKey('alert'); p.b.setKey('alert'); p.t.cls('alert'); }
        else p.th = DOWN;
      });
      fb.innerHTML = `<strong>${right ? 'Right.' : 'Not quite.'}</strong> `;
      fb.appendChild(document.createTextNode(Q.why + ' '));
      const a = document.createElement('a'); a.href = '#' + Q.a; a.textContent = `Revisit day ${NAMES[Q.a][1]}: ${NAMES[Q.a][0]}`;
      fb.appendChild(a);
      next.hidden = false; next.textContent = qi + 1 < order.length ? 'Next question' : 'See my score';
      next.focus();
      report();
    }
    function end() {
      progress.setQuiz(reviewId, score, order.length);
      qEl.innerHTML = `<span class="eyebrow">Done</span>`;
      qEl.appendChild(document.createTextNode(`You matched ${score} of ${order.length} scenarios.`));
      choices.textContent = '';
      fb.textContent = score === order.length ? 'A clean sweep. On to next week.' : 'Each scenario links back to its day if you want another look.';
      finished = true; next.textContent = 'Try again'; next.hidden = false;
      pillars.forEach(p => { p.th = H0; p.g.setKey('trust'); p.b.setKey('trust'); p.t.cls(''); });
      report(true);
    }
    function report(final) {
      ctx.readout('q', 'Scenario', final ? 'finished' : `${qi + 1} of ${order.length}`);
      ctx.readout('s', 'Score', `${score}`, score ? 'ok' : '');
      const best = progress.quiz(reviewId);
      ctx.readout('b', 'Best so far', best ? `${best.best} of ${best.of}` : '(first try)');
    }

    ctx.onFrame(dt => {
      const k = ctx.reduce ? 1 : Math.min(1, dt * 6);
      pillars.forEach(p => {
        p.h += (p.th - p.h) * k;
        p.g.scale.set(1, Math.max(0.01, p.h), 1); p.g.position.y = p.h / 2;
        p.t.pos.set(p.x, 0.05, p.z + 1.05); // label on the floor in front, so a rising pillar never covers it
      });
    });
    start();
  };
}

const week1 = [
  { q: 'A photo arrives on your friend’s phone complete and in the right order, even though one piece took a slower path and arrived last.', a: 'packets',
    why: 'Data is split into numbered packets that can travel separately and be reassembled.' },
  { q: 'A cable between two cities is cut, yet websites still load, just a little more slowly.', a: 'ip-routing',
    why: 'Routers forward packets hop by hop and can send them around a broken link.' },
  { q: 'You type a shop’s name into your browser. Before anything loads, your computer quietly asks which number that name belongs to.', a: 'dns',
    why: 'DNS turns human-friendly names into IP addresses.' },
  { q: 'Before any page data flows, your laptop and a server exchange three short messages: “hello”, “hello back”, “great, let’s talk”.', a: 'tcp-ports',
    why: 'That’s the TCP handshake (SYN, SYN-ACK, ACK) that opens a reliable connection.' },
  { q: 'On café Wi-Fi, someone else on the network can tell you connected to your bank, but can’t read your balance or your password.', a: 'tls-https',
    why: 'HTTPS encrypts what you send; the site’s name is still visible, the contents aren’t.' },
  { q: 'Your TV, laptop and phone all appear online under the same public address, and an unexpected connection attempt from the internet is simply dropped.', a: 'firewalls-nat',
    why: 'NAT lets devices share one address, and the firewall blocks unsolicited inbound traffic by default.' },
];

CN.register({
  id: 'review-1',
  prompt: '<strong>How it works:</strong> read the scenario, then pick the concept at work. The matching pillar rises.',
  mount: quiz('review-1', week1, ['packets', 'ip-routing', 'dns', 'tcp-ports', 'tls-https', 'firewalls-nat']),
  body: `
    <p class="lede">Six everyday moments, six week 1 concepts. Matching a real situation to the idea behind it is the best test of whether the idea has stuck.</p>
    <h2>How the week fits together</h2>
    <p>Opening one web page uses all of them in order: <b>DNS</b> finds the address, <b>routing</b> carries <b>packets</b> there, a <b>TCP handshake</b> opens a connection on the right <b>port</b>, <b>TLS</b> makes it private, and your router’s <b>firewall and NAT</b> sit at the edge of your home, letting the replies back in and keeping strangers out.</p>
  `,
});
