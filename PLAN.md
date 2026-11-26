# CyberNet: plan

CyberNet is a set of interactive 3D explainers for cybersecurity and networking in the age of AI. It is a 28-day course with one concept a day and a review quiz each week. It's a sister site to `mental-models`: static, no build step, served on GitHub Pages.

---

## 1. Audience and promise

**Audience: two layers.**
- **Core layer:** curious non-technical adults (parents, managers, creatives). It uses plain language and everyday stakes: your bank, your email, your family's phones.
- **Under-the-hood layer:** junior devs and students. Each day has a collapsible panel with the real terms (SYN/ACK, CIDR, salts, JWT scopes), a small diagram or snippet and links to the standard or RFC.

**Tone:** a calm, practical guide. It is reassuring and concrete, never fear-mongering. Attacks are shown only as *cause and effect* ("this is what happens and this is what stops it"), never as step-by-step how-tos.

**Promise: after 28 days you can**
1. Explain what actually happens when you open a website: packets, addresses, DNS, handshake, padlock.
2. Tell hashing from encryption, and authentication from authorization, and know why passkeys beat passwords.
3. Spot social-engineering tells, and know which single defences fail on their own (defence in depth, zero trust).
4. Recognise the new AI-era risks (perfect phishing, voice clones, prompt injection, over-permissioned agents, leaky chatbots, poisoned packages) and have one concrete habit for each.
5. Leave with **24 small habits** done, one per concept day, such as turning on passkeys, setting a family code word or checking a backup restores.

---

## 2. Curriculum

| Wk | Day | Concept | Daily habit |
|---|---|---|---|
| **1 · How the network moves** | 1 | Packets | Run a speed test, then explain "latency vs bandwidth" to someone |
| | 2 | IP addresses & routing | Find your device's local IP and your public IP and notice they differ |
| | 3 | DNS | Consider a privacy-respecting DNS resolver on your router or phone |
| | 4 | TCP handshake & ports | Check which apps your firewall allows to accept connections |
| | 5 | TLS / HTTPS | Turn on "HTTPS-only" mode in your browser |
| | 6 | Firewalls & NAT | Change your router's default admin password and update its firmware |
| | 7 | **Review 1** | |
| **2 · Security foundations** | 8 | CIA triad | Name one thing you own where *availability* matters most (and back it up) |
| | 9 | Hashing vs encryption | Turn on full-disk encryption (FileVault / BitLocker / phone default) |
| | 10 | Public-key crypto & signatures | Check a downloaded app's publisher or signature before opening it |
| | 11 | Passwords, MFA & passkeys | Add a passkey or app-based MFA to your main email |
| | 12 | Authentication vs authorization | Review which apps have "Sign in with…" access to your accounts |
| | 13 | Least privilege | Remove admin rights from your everyday computer account |
| | 14 | **Review 2** | |
| **3 · Defending people & systems** | 15 | Phishing & social engineering | Report (don't just delete) the next suspicious message |
| | 16 | Defence in depth | List your three layers for your most important account |
| | 17 | Zero trust | Turn on sign-in alerts for your email and bank |
| | 18 | Updates & vulnerabilities | Turn on automatic updates for your OS, browser and phone |
| | 19 | Backups & ransomware | Do a 3-2-1 check *and test a restore* |
| | 20 | Threat modelling | Write a 4-line threat model: what, from whom, how bad, what you'll do |
| | 21 | **Review 3** | |
| **4 · Security in the age of AI** | 22 | AI-boosted phishing | Agree a "verify on a second channel" rule for money and password requests |
| | 23 | Deepfakes & voice-clone fraud | Set a family code word |
| | 24 | Prompt injection | Before letting an AI summarise a document or page, ask "could this text be giving it orders?" |
| | 25 | Agent permissions | Audit one AI tool's connected accounts and remove what it doesn't need |
| | 26 | Data & model leakage | Check your chatbot's data-training and history settings |
| | 27 | Poisoned supply chain | Pin and verify one dependency, or install apps only from official stores |
| | 28 | **Capstone review** | Print your 24-habit checklist |

---

## 3. Scene concepts

Each scene is one small world: **what you see / what you control / what it teaches.** Every control is a real HTML control (button, slider, toggle, select) in the controls bar. 3D clicking is a shortcut, never the only path. Every scene writes its key state to a live text readout (see §5).

Colour meaning is consistent across scenes, and there is always a shape or label as well as a colour:
- **Cyan, cubes or spheres:** you or trusted traffic.
- **Orange, octahedra:** untrusted or adversary (also used for "caution", such as a busy link).
- **Green tick ring:** verified.
- **Rose, cracked outline:** failure or alert.

### Week 1 · How the network moves
1. **Packets**
   - *See:* a photo tile above a grid city that splits into numbered glowing cubes and flies along light-trail routes to a receiver, where it's reassembled.
   - *Control:* packet size slider, "drop a packet" button, link congestion toggle.
   - *Teaches:* data travels in pieces, packets can arrive out of order and get re-sent, and latency is not the same as bandwidth.
2. **IP & routing**
   - *See:* router towers joined by neon links, with an address label on each house.
   - *Control:* pick a destination, cut or restore links, show hop count.
   - *Teaches:* addresses plus hop-by-hop forwarding, and the network routes around damage.
3. **DNS**
   - *See:* a query beam travelling resolver → root → TLD → authoritative server and back with an address.
   - *Control:* type a name (from a safe example list), toggle the cache, step through the hops.
   - *Teaches:* names map to numbers, and caching makes the second lookup instant.
   - *Under the hood:* record types and TTL.
4. **TCP handshake & ports**
   - *See:* two hosts trading SYN / SYN-ACK / ACK pulses, and a building with numbered doors.
   - *Control:* step the handshake, open or close ports, simulate a lost ACK.
   - *Teaches:* reliable connections start with agreement, and ports are doors to services.
5. **TLS / HTTPS**
   - *See:* message text drifting along a wire past an eavesdropper node. Flip HTTPS on and the text seals into opaque tubes.
   - *Control:* HTTPS toggle, an "inspect certificate" panel, a mismatched-certificate demo.
   - *Teaches:* encryption in transit, plus what the padlock does and doesn't promise (it doesn't mean the site is honest).
6. **Firewalls & NAT**
   - *See:* a home with many devices behind one gate showing a single public address, and a rule wall outside.
   - *Control:* add or remove allow rules, toggle "inbound vs outbound", show the NAT translation table.
   - *Teaches:* default-deny inbound, and why your devices share one address.

### Week 2 · Security foundations
8. **CIA triad**
   - *See:* a data crystal on a three-legged plinth with legs labelled Confidentiality, Integrity and Availability.
   - *Control:* trigger a leak, tamper or outage event, then apply the matching defence.
   - *Teaches:* every incident hits at least one leg, and different defences protect different legs.
9. **Hashing vs encryption**
   - *See:* two machines side by side, a one-way "blender" (hash) and a two-way "lockbox" (encrypt and decrypt).
   - *Control:* type text and see the hash change completely from one character (avalanche). Try to reverse each machine.
   - *Teaches:* hashes are one-way fingerprints and encryption is reversible with a key. Passwords should be *hashed with salt*.
10. **Public-key crypto & signatures**
    - *See:* a stack of open padlocks anyone can take and snap shut, with only one key that opens them, plus a seal stamp.
    - *Control:* send a locked message, sign a message, tamper and re-verify.
    - *Teaches:* the public/private key split, and that signatures prove who sent it and that it wasn't changed.
11. **Passwords, MFA & passkeys**
    - *See:* "guess-time" towers that grow with password length, a second-factor gate, and a passkey that only fits the real site's lock.
    - *Control:* password length and character-set sliders (no text entry of real passwords), MFA toggle, a "lookalike site" demo.
    - *Teaches:* length beats complexity, MFA adds a layer, and passkeys can't be phished.
12. **Authentication vs authorization**
    - *See:* a building with an ID desk at the door (who are you?) and badge-gated rooms (what can you do?).
    - *Control:* choose a role (visitor, staff, admin) and see which rooms light up.
    - *Teaches:* the two questions are separate, and logging in doesn't mean you're allowed everywhere.
13. **Least privilege**
    - *See:* an avatar holding a key ring, with a "blast radius" dome over the rooms a stolen ring could open.
    - *Control:* remove keys, then "steal the ring".
    - *Teaches:* fewer permissions mean a smaller blast radius.

### Week 3 · Defending people & systems
15. **Phishing & social engineering**
    - *See:* a floating message card with inspectable parts: sender, display name vs real address, link text vs real target, urgency.
    - *Control:* hover or tab to inspect each part and flag the tells. A score shows how many you caught.
    - *Teaches:* pressure plus a mismatch is the pattern, so verify on a second channel.
16. **Defence in depth**
    - *See:* stacked translucent shields, and threats (orange octahedra) that pass through holes that differ in each layer.
    - *Control:* toggle layers on and off and run a wave.
    - *Teaches:* no single layer is perfect, and layers with different holes stop more.
17. **Zero trust**
    - *See:* split screen. On one side a castle with a moat where anything inside is trusted. On the other, every request is checked at every door.
    - *Control:* "breach the perimeter" button, then follow lateral movement.
    - *Teaches:* trust no location by default, and verify identity, device and context each time.
18. **Updates & vulnerabilities**
    - *See:* a wall where cracks appear on a timeline, with a patch drone that seals them.
    - *Control:* patch cadence slider (daily → yearly) and a timeline scrubber.
    - *Teaches:* the exposure window is the time between a crack being known and being patched, so auto-update shrinks it.
19. **Backups & ransomware**
    - *See:* a file vault that gets locked (orange padlocks), with backup copies on a second device and an offline island.
    - *Control:* choose which backups exist (0–3, online or offline), trigger a lock event, try to restore.
    - *Teaches:* the 3-2-1 rule, why one copy must be offline, and that only tested backups count.
20. **Threat modelling**
    - *See:* a personal "map" with your assets as glowing nodes.
    - *Control:* pick what you're protecting and from whom (a stranger online, a stolen phone, someone you know). The relevant earlier days' defences light up.
    - *Teaches:* security is about choices for *your* situation, and it ties weeks 1–3 together.

### Week 4 · Security in the age of AI
22. **AI-boosted phishing**
    - *See:* one generic lure that a "rewrite" machine turns into many perfect, personalised messages. The old tells (typos, odd grammar) fade out.
    - *Control:* a "personalisation" slider shows which tells disappear and which remain (a request for money or credentials, urgency, an unverified channel).
    - *Teaches:* stop relying on spotting typos and rely on verification habits.
23. **Deepfakes & voice-clone fraud**
    - *See:* a phone hologram with an "urgent call from family" waveform and the face or voice signature shimmering.
    - *Control:* respond with "call back on the known number" or "ask the code word", and see the scam collapse.
    - *Teaches:* how a voice or face looks or sounds is no longer proof, but process (call-backs, code words) is.
24. **Prompt injection**
    - *See:* an assistant core reading a document stream, with a hidden instruction glowing faintly inside the data.
    - *Control:* toggle "treat data as instructions" (unsafe) vs. "separate channels and confirm actions" (safer), then run the task.
    - *Teaches:* AI can confuse content with commands, so anything it reads is untrusted input and risky actions need confirmation.
    - *Note:* no working injection strings, only a labelled placeholder.
25. **Agent permissions**
    - *See:* an AI agent node with tool cables to email, files, calendar and payments.
    - *Control:* scope each cable (none / read / write), add a human-approval gate, run a "poisoned request".
    - *Teaches:* least privilege applies to agents too, and approval gates contain mistakes.
26. **Data & model leakage**
    - *See:* a text block you "paste" into a chatbot that flows into logs, possible training data and, in the worst case, another user's answer.
    - *Control:* toggle history and training settings and the use of an enterprise vs. consumer plan, and redact sensitive fields first.
    - *Teaches:* treat chatbots as you would a public forum unless settings say otherwise.
27. **Poisoned supply chain**
    - *See:* a conveyor of parts (datasets, packages, model files) flowing into your app, with a few subtly tampered.
    - *Control:* turn on checksums, signatures, version pinning and a "lookalike name" detector, and see which bad parts get caught.
    - *Teaches:* everything you import is a trust decision, so verify provenance. It links back to days 9–10.

### Reviews (days 7, 14, 21, 28)
These reuse the mental-models format:
1. A short scenario card appears.
2. Candidate pillars (the week's concepts) rise from the grid.
3. You pick one. The right pillar lights up with a light-trail, and wrong picks show a one-line hint.
4. Each answer links back to its day.

The day 28 capstone draws from all weeks, with 10 scenarios.

---

## 4. Visual system

**Inspiration, not imitation:** dark grid floors, neon light lines, glowing wireframes and light trails, in the general synthwave or vector-display lineage. It must stay **original**:
- No Tron name, logos, characters, light-cycles, identity discs, suit patterns or Disney assets.
- No copied typefaces.

The wordmark is just "CyberNet" set in the display font with a small original node-and-link glyph.

### Themes
- **Dark is the default and signature look.**
- **Daylight** is a "blueprint" mode: pale grid paper, ink-blue and burnt-orange lines, no glow.
- An **Auto / Daylight / Dark** toggle (Auto follows the OS) is resolved by a tiny head script before first paint, so there's no flash.

### Tokens
Define tokens as plain hex per theme selector, **not** `light-dark()`, so `getComputedStyle` reads resolved values. This was the lesson from mental-models.

| Token | Dark | Daylight | Use |
|---|---|---|---|
| `--bg` | `#05080d` | `#f2f5f7` | page / stage floor |
| `--surface` | `#0c131c` | `#ffffff` | cards, panels |
| `--grid` | `#123040` | `#c9d6df` | floor grid lines (decorative) |
| `--text` | `#e6f1f7` | `#0e2233` | body text |
| `--muted` | `#8fa6b6` | `#4a5f70` | secondary text |
| `--trust` | `#3fe6ff` | `#00708a` | you, trusted traffic, accent |
| `--threat` | `#ff9a4d` | `#b0470c` | untrusted, adversary |
| `--ok` | `#6dffb0` | `#137a43` | verified |
| `--alert` | `#ff5d7a` | `#b3203f` | failure |
| `--glow` | `1` | `0` | glow intensity multiplier for scenes |

All text and semantic colours have been checked against WCAG AA:
- Dark, against `--bg` / `--surface`: 6.3–17.5:1.
- Daylight, against `--bg` / `--surface`: 4.9–16.2:1.

Grid lines are decorative only. Never encode meaning in colour alone: pair it with a shape, label or pattern.

### Fonts
All fonts are self-hosted WOFF2 in `/fonts`, with no Google Fonts request. That's a privacy win and fits the subject.
- **Display:** Chakra Petch, 600 (techy, angular, OFL).
- **Body:** Inter.
- **Mono and readouts:** JetBrains Mono.

### Glow and light (faked, everywhere)
- Lines are drawn as a core plus a wider additive halo pass.
- Nodes are emissive with a soft additive sprite.
- Trails are fading polyline ribbons.
- No post-processing bloom.
- Everything is scaled by `--glow`, so daylight renders crisp ink lines.

### Motion
- Slow, purposeful pulses (packets 1–2 s per hop) and no constant jitter.
- **`prefers-reduced-motion`:**
  - No trails and no idle camera drift.
  - Animations become discrete steps.
  - Every scene has a **Step** button anyway, so reduced motion loses nothing.
- Rendering pauses when the stage is offscreen or the tab is hidden.

---

## 5. Architecture

**Reuse the mental-models architecture** (static shell, shared engine, scene registry, hash routing) with these changes.

### Layout
```
cybernet/
  index.html          shell: sidebar nav / phone top bar, stage, controls, readout, body, pager
  .nojekyll
  favicon.svg
  css/site.css        tokens + layout (moved out of index.html now that it's bigger)
  js/engine.js        CN engine (ES module)
  js/glow.js          neon line/halo/trail helpers
  js/progress.js      localStorage progress + habits
  js/glossary.js      term popovers
  data/glossary.json
  scenes/week1.js … week4.js, reviews.js
  vendor/three/       pinned three.module.min.js + Line2/LineMaterial addons, with VERSION + SHA-256 notes
  fonts/              self-hosted WOFF2
```

### Engine
`CN.register({id, day, week, title, tagline, prompt, body, deeper, habit, glossary, mount(ctx)})` keeps the mental-models shape and adds:
- `deeper`: the under-the-hood HTML.
- `habit`: the daily action.
- `glossary`: the term ids used that day.

`ctx` keeps the mental-models fields:
- `THREE`, `scene`, `camera`, `fit()`, `tag()`, `kit()` (theme-tracked materials), `onFrame`, `onTheme`, `reduce`.
- Auto-disposal on unmount.

It adds:
- `ctx.controls.button/slider/toggle/select(...)`: builds real labelled HTML controls in the controls bar.
- `ctx.readout(key, label, value)`: writes to a visible readout panel next to the stage (the stage's `aria-describedby`), so screen-reader users can read live numbers on demand.
- `ctx.announce(text)`: a separate polite live region for key events only ("packet 4 was lost"). Announcing every changing number would be noise.
- `ctx.step(fn)`: registers the Step action used by reduced motion and keyboard users.
- `ctx.glow`: line, halo and trail helpers from `glow.js`.

### Accessibility (fixes the mental-models gaps from day one)
- The stage is `role="region"` with `aria-label` and `aria-describedby` pointing at the readout, **not** `role="img"`. The canvas itself is `aria-hidden`.
- All interaction is available through HTML controls and the keyboard. Arrow keys page days only when focus isn't in a control.
- **Phones:** the stage comes first, then controls and readout. The intro and prompt collapse into a "What's this?" disclosure below. The top bar has prev/next.
- Narrow stages use fewer columns and a steeper camera, so labels don't collide.

### Other decisions
- **Three.js:** a current, pinned ES module vendored in `/vendor/three`, with no CDN. It loads through `<script type="module">` with an importmap pointing at local files. If WebGL is unavailable, a friendly fallback shows a static diagram and the HTML controls still drive the readout where possible.
- **Routing:** hash routing by lesson id (`#packets`), with `#day-N` accepted as an alias. Unknown hashes show a notice and fall back to day 1.
- **Progress:** visited days, quiz results and ticked habits are stored only in `localStorage` (`cn-progress`). There's a "Reset progress" button, no accounts, no analytics and no third-party requests at all.
- **Security headers (practise what we preach):** a strict CSP meta tag (`default-src 'self'`, no inline script except the hashed theme bootstrap) and `referrer-policy: no-referrer`. External links get `rel="noopener"`.
- **Hosting:** GitHub Pages with `.nojekyll`.

### Build order (when scaffolding)
1. Shell, tokens, theme toggle, fonts and vendored three.
2. The engine, plus glow helpers, the readout and the controls API.
3. Day 1 (Packets) as the reference scene, then Review 1.
4. Progress, habits and the glossary.
5. Remaining scenes, a week at a time, checking phone layout and both themes for each.
