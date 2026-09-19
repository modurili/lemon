/* Store: localStorage永続化。キー 'etan.v1'
   { decks, cards, progress, activity{'YYYY-MM-DD':n}, settings, overrides, reviews[] } */
'use strict';
const KEY = 'etan.v1';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultSettings() {
  return {
    dailyGoal: 5, newPerDay: 5,
    mode: 'mix', // recog | recall | cloze | mix
    exDisplay: 'highlight', // highlight | blank (詳細画面の初期表示)
    remindTime: '', notifyOn: false,
    accent: '#5bb88a',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    if (!d.settings) d.settings = defaultSettings();
    d.decks ||= {}; d.cards ||= {}; d.progress ||= {};
    d.activity ||= {}; d.overrides ||= {}; d.reviews ||= []; d.deckGone ||= {};
    return d;
  } catch { return blank(); }
}
function blank() {
  return { decks: {}, cards: {}, progress: {}, activity: {}, settings: defaultSettings(), overrides: {}, reviews: [], deckGone: {} };
}

let mem = load();
let t = null;
function save() {
  clearTimeout(t);
  t = setTimeout(() => {
    try {
      if (mem.reviews.length > 5000) mem.reviews = mem.reviews.slice(-5000);
      localStorage.setItem(KEY, JSON.stringify(mem));
    } catch (e) { console.warn('save failed', e); }
  }, 150);
}
function saveNow() {
  clearTimeout(t);
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { console.warn('save failed', e); }
}

window.EtanStore = { mem, save, saveNow, todayKey, defaultSettings, KEY };
