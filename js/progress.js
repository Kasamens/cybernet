// Progress lives only in this browser's localStorage under one key. No accounts, nothing sent anywhere.
const KEY = 'cn-progress';
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { visited: s.visited || {}, habits: s.habits || {}, quiz: s.quiz || {} };
  } catch (e) { return { visited: {}, habits: {}, quiz: {} }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: progress just isn't kept */ } }

export const visit = id => { if (!state.visited[id]) { state.visited[id] = true; save(); } };
export const visited = id => !!state.visited[id];
export const habitDone = id => !!state.habits[id];
export const setHabit = (id, on) => { if (on) state.habits[id] = true; else delete state.habits[id]; save(); };
export const quiz = id => state.quiz[id] || null;
export function setQuiz(id, score, of) {
  const q = state.quiz[id];
  if (!q || score > q.best) state.quiz[id] = { best: score, of };
  save();
  document.dispatchEvent(new CustomEvent('cn:progress'));
}
export function reset() { state = { visited: {}, habits: {}, quiz: {} }; save(); }
export function summary(all) {
  const withHabit = all.filter(d => d.habit);
  return {
    visited: all.filter(d => state.visited[d.id]).length,
    habits: withHabit.filter(d => state.habits[d.id]).length,
    habitTotal: withHabit.length,
  };
}
