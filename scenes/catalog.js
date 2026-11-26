/* Every day's metadata, from PLAN.md §2–3. Week files (week1.js …) merge in the real mount/body/deeper
 * by registering the same id. A day without a mount shows the "planned" scene and an outline body.
 * `scene` = what you'll see and control; `teaches` = the takeaway. Both feed the planned-day outline.
 */
import { CN } from '../js/engine.js';

const days = [
  // Week 1 · How the network moves
  ['packets', 1, 1, 'Packets', 'Everything online travels in small, numbered pieces.',
    'Run a speed test, then explain the difference between latency and bandwidth to someone.',
    'A message splits into glowing packets that race along different routes and are put back together.', 'Data travels in pieces; pieces can arrive out of order or go missing and get re-sent.'],
  ['ip-routing', 2, 1, 'IP addresses & routing', 'Every device has an address; routers pass packets hop by hop.',
    'Find your device’s local IP address and your public IP address, and notice that they differ.',
    'Router towers joined by neon links; pick a destination, cut links and watch traffic find a new path.', 'Addresses plus hop-by-hop forwarding; the network routes around damage.'],
  ['dns', 3, 1, 'DNS', 'The internet’s phone book turns names into numbers.',
    'Consider switching your router or phone to a privacy-respecting DNS resolver.',
    'A lookup beam travels resolver → root → TLD → authoritative and back; toggle the cache and step the hops.', 'Names map to numbers, and caching makes the second lookup instant.'],
  ['tcp-ports', 4, 1, 'TCP handshake & ports', 'Connections start with a three-step agreement, through numbered doors.',
    'Check which apps your computer’s firewall allows to accept incoming connections.',
    'Two hosts trade SYN, SYN-ACK and ACK pulses; a building has numbered doors you can open or close.', 'Reliable connections start with agreement; ports are doors to services.'],
  ['tls-https', 5, 1, 'TLS / HTTPS', 'The padlock means the connection is private, not that the site is honest.',
    'Turn on “HTTPS-only” mode in your browser.',
    'Readable text drifts past an eavesdropper; switch on HTTPS and it seals into opaque tubes. Inspect the certificate.', 'Encryption in transit, and what the padlock does and doesn’t promise.'],
  ['firewalls-nat', 6, 1, 'Firewalls & NAT', 'A gatekeeper at the edge, and many devices sharing one address.',
    'Change your router’s default admin password and update its firmware.',
    'A home of devices behind one gate with a rule wall; edit rules and watch the NAT table.', 'Default-deny for inbound traffic, and why your devices share one public address.'],
  ['review-1', 7, 1, 'Review: how the network moves', 'Six scenarios. Which week 1 concept is at work?', null, null, null, 'review'],

  // Week 2 · Security foundations
  ['cia-triad', 8, 2, 'The CIA triad', 'Confidentiality, integrity, availability: the three things to protect.',
    'Name one thing you own where availability matters most, and back it up.',
    'A data crystal on a three-legged plinth; trigger a leak, tamper or outage and apply the matching defence.', 'Every incident hits at least one leg; different defences protect different legs.'],
  ['hashing-encryption', 9, 2, 'Hashing vs encryption', 'One is a one-way fingerprint; the other is a lock with a key.',
    'Turn on full-disk encryption (FileVault, BitLocker, or your phone’s default).',
    'A one-way “blender” beside a two-way “lockbox”; type text and see one character change the whole hash.', 'Hashes are one-way fingerprints; encryption is reversible with a key; passwords are stored hashed with salt.'],
  ['public-key', 10, 2, 'Public-key crypto & signatures', 'Padlocks anyone can close, keys only one person holds.',
    'Check a downloaded app’s publisher or signature before opening it.',
    'Open padlocks anyone can snap shut but only one key opens, plus a seal you can verify after tampering.', 'Public and private keys; signatures prove who sent a message and that it wasn’t changed.'],
  ['passwords-mfa', 11, 2, 'Passwords, MFA & passkeys', 'Length beats cleverness, and passkeys can’t be phished.',
    'Add a passkey or app-based MFA to your main email account.',
    'Guess-time towers that grow with length, a second-factor gate, and a passkey that only fits the real site.', 'Length beats complexity; MFA adds a layer; passkeys resist phishing.'],
  ['authn-authz', 12, 2, 'Authentication vs authorization', 'Who are you, and what are you allowed to do?',
    'Review which apps have “Sign in with…” access to your accounts, and remove old ones.',
    'An ID desk at the door and badge-gated rooms; choose a role and see which rooms light up.', 'Logging in proves identity; permissions decide access. They are separate checks.'],
  ['least-privilege', 13, 2, 'Least privilege', 'Fewer keys, smaller blast radius.',
    'Use a non-admin account for everyday work on your computer.',
    'A key ring with a blast-radius dome; remove keys, then “steal the ring” and compare.', 'Give every person and program only the access it needs.'],
  ['review-2', 14, 2, 'Review: security foundations', 'Which week 2 concept is at work?', null, null, null, 'review'],

  // Week 3 · Defending people & systems
  ['phishing', 15, 3, 'Phishing & social engineering', 'Pressure plus a mismatch is the pattern.',
    'Report (don’t just delete) the next suspicious message you receive.',
    'A message card with inspectable parts (sender, link target, urgency); find the tells.', 'Check the real sender and link; verify on a second channel when pressured.'],
  ['defence-in-depth', 16, 3, 'Defence in depth', 'No single layer is perfect, so stack layers with different holes.',
    'Write down your three layers of protection for your most important account.',
    'Stacked translucent shields; threats slip through different holes; toggle layers and run a wave.', 'Layers with different weaknesses stop far more than any one layer.'],
  ['zero-trust', 17, 3, 'Zero trust', 'Never trust a location; verify every request.',
    'Turn on sign-in alerts for your email and bank.',
    'Castle-and-moat beside check-every-door; breach the perimeter and compare how far an intruder gets.', 'Verify identity, device and context on every request, not once at the gate.'],
  ['updates', 18, 3, 'Updates & vulnerabilities', 'The danger is the window between a flaw being known and fixed.',
    'Turn on automatic updates for your OS, browser and phone.',
    'A wall where cracks appear over time and a patch drone seals them; change the patch cadence.', 'Auto-updates shrink the exposure window.'],
  ['backups', 19, 3, 'Backups & ransomware', 'Three copies, two kinds of storage, one kept offline.',
    'Do a 3-2-1 check, and test that a restore actually works.',
    'A file vault gets locked; choose which backups exist and try to restore.', 'Keep one copy offline; only tested backups count.'],
  ['threat-modelling', 20, 3, 'Threat modelling', 'What are you protecting, from whom, and how much does it matter?',
    'Write a four-line threat model: what, from whom, how bad, and what you’ll do.',
    'A personal map of your assets; pick a threat and the relevant defences from earlier days light up.', 'Security means choosing defences that fit your situation.'],
  ['review-3', 21, 3, 'Review: defending people & systems', 'Which week 3 concept is at work?', null, null, null, 'review'],

  // Week 4 · Security in the age of AI
  ['ai-phishing', 22, 4, 'AI-boosted phishing', 'Perfect spelling is no longer a sign of safety.',
    'Agree a “verify on a second channel” rule for any request involving money or passwords.',
    'One generic lure becomes many polished, personal ones; the old tells fade while the real ones remain.', 'Rely on verification habits, not on spotting typos.'],
  ['deepfakes', 23, 4, 'Deepfakes & voice-clone fraud', 'A familiar voice is no longer proof.',
    'Set a family code word for emergencies.',
    'An “urgent call from family”; respond with a call-back or a code word and watch the scam collapse.', 'Process beats perception: call back on a known number, and ask for the code word.'],
  ['prompt-injection', 24, 4, 'Prompt injection', 'When an AI reads text, the text can try to give it orders.',
    'Before letting an AI act on a document or page, ask: could this text be giving it orders?',
    'An assistant reads a document with a hidden instruction inside; compare trusting data as commands with keeping them separate.', 'Treat anything an AI reads as untrusted; risky actions need confirmation.'],
  ['agent-permissions', 25, 4, 'Agent permissions', 'Least privilege, for AI agents too.',
    'Audit one AI tool’s connected accounts and remove the access it doesn’t need.',
    'An agent with tool cables to email, files, calendar and payments; scope each one and add approval gates.', 'Scope agents tightly and put people in the loop for risky actions.'],
  ['data-leakage', 26, 4, 'Data & model leakage', 'What you paste can travel further than you think.',
    'Check your chatbot’s data-training and chat-history settings.',
    'Pasted text flows into logs, training data and, at worst, other answers; change settings and redact first.', 'Treat consumer chatbots like a public space unless the settings say otherwise.'],
  ['supply-chain', 27, 4, 'Poisoned supply chain', 'Everything you import is a trust decision.',
    'Install apps only from official stores, or pin and verify one dependency in a project.',
    'A conveyor of datasets, packages and model files with a few tampered; switch on checks and see what’s caught.', 'Verify where things come from with checksums, signatures and pinned versions.'],
  ['review-4', 28, 4, 'Capstone review', 'Ten scenarios from all four weeks.', null, null, null, 'review'],
];

days.forEach(([id, day, week, title, tagline, habit, scene, teaches, kind]) =>
  CN.register({ id, day, week, title, tagline, habit, scene, teaches, kind: kind || 'concept' }));
