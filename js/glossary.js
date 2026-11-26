// Shared glossary. In lesson HTML, write ${term('dns', 'DNS')} to get a tappable term with a short definition.
let terms = null, loading = null, wired = false;

export const term = (id, text) => `<button type="button" class="term" data-term="${id}" aria-haspopup="dialog" aria-expanded="false">${text}</button>`;

export function loadGlossary() {
  loading ||= fetch('data/glossary.json').then(r => r.json()).then(j => { terms = j; }).catch(() => { terms = {}; });
  return loading;
}

export function enhanceTerms(root) {
  if (wired) return;
  wired = true;
  const pop = document.getElementById('glossary-pop');
  let opener = null;
  pop.addEventListener('toggle', e => {
    if (e.newState === 'closed' && opener) { opener.setAttribute('aria-expanded', 'false'); opener = null; }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('.term'); if (!b) return;
    await loadGlossary();
    const t = terms[b.dataset.term];
    pop.textContent = '';
    const h = document.createElement('b'); h.textContent = t ? t.term : b.textContent;
    pop.append(h, document.createTextNode(' — ' + (t ? t.def : 'Definition coming soon.')));
    if (pop.matches(':popover-open')) pop.hidePopover();
    opener = b; b.setAttribute('aria-expanded', 'true');
    try { pop.showPopover(); } catch (err) { pop.hidden = false; }
    const r = b.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
    const top = r.bottom + 8 + ph > window.innerHeight ? r.top - ph - 8 : r.bottom + 8;
    pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
  });
}
