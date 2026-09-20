/* 英単語ドリル app.js — バニラJS。GitHub Pages静的ホスティング想定(相対パスのみ) */
'use strict';
const Store = window.EtanStore;
const CSV = window.EtanCSV;
const SRS = window.EtanSRS;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* アイコン */
const IC = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-4.94M9.9 4.24A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="m2 2 20 20"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  say: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>',
};

/* オリジナル選択UI(セグメント) */
function segInit(id, val, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.val = val;
  [...el.querySelectorAll('button')].forEach((b) => {
    const on = b.dataset.v === val;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
    b.onclick = () => {
      el.dataset.val = b.dataset.v;
      [...el.querySelectorAll('button')].forEach((x) => {
        const o = x === b;
        x.classList.toggle('on', o);
        x.setAttribute('aria-checked', o);
      });
      onChange?.();
    };
  });
}
function segVal(id) { return document.getElementById(id)?.dataset.val; }

/* アクセントカラー: 設定値+ライト/ダークから派生変数を計算 */
function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
}
function mixCss(h1, h2, t) {
  const a = hexRgb(h1), b = hexRgb(h2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ')})`;
}
function rgbaCss(h, a) {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function applyAccent() {
  const acc = Store.mem.settings.accent || '#5bb88a';
  const light = window.matchMedia('(prefers-color-scheme: light)').matches;
  const st = document.documentElement.style;
  st.setProperty('--acc', acc);
  st.setProperty('--grad', `linear-gradient(135deg, ${acc}, ${mixCss(acc, '#0f172a', 0.38)})`);
  st.setProperty('--acc-tx', mixCss(acc, light ? '#000000' : '#ffffff', light ? 0.32 : 0.45));
  st.setProperty('--acc-lt', mixCss(acc, light ? '#000000' : '#ffffff', light ? 0.10 : 0.25));
  st.setProperty('--acc-dk', mixCss(acc, '#000000', 0.30));
  st.setProperty('--glow', rgbaCss(acc, light ? 0.12 : 0.16));
  st.setProperty('--acc-shadow', rgbaCss(acc, light ? 0.25 : 0.45));
  [7, 10, 12, 14, 16, 25, 35, 40, 60].forEach((p) => st.setProperty(`--t${p}`, rgbaCss(acc, p / 100)));
}

/* オリジナル確認モーダル */
const IC_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg>';
function askConfirm({ title, body, okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const veil = $('#cfVeil');
    $('#cfTitle').textContent = title;
    $('#cfBody').textContent = body;
    const ok = $('#cfOk');
    ok.textContent = okText;
    ok.classList.toggle('danger-ok', danger);
    $('#cfIcon').innerHTML = IC_WARN;
    $('#cfIcon').classList.toggle('danger', danger);
    veil.hidden = false;
    const done = (v) => { veil.hidden = true; resolve(v); };
    $('#cfCancel').onclick = () => done(false);
    ok.onclick = () => done(true);
    veil.onclick = (e) => { if (e.target === veil) done(false); };
  });
}

/* 通知送信: SW経由を優先(失敗時は従来方式) */
function iconURL() { try { return new URL('./icons/icon-192.png', location.href).href; } catch { return './icons/icon-192.png'; } }
async function fireNotification(title, body) {
  try {
    if ('serviceWorker' in navigator && window.Notification?.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title, { body, icon: iconURL(), tag: 'lemon-remind' });
        return true;
      }
    }
  } catch { /* フォールバックへ */ }
  try {
    new Notification(title, { body, icon: iconURL() });
    return true;
  } catch { return false; }
}

/* はてなバブルのはみ出し補正 */
function fitBubble(wrap) {
  const b = wrap.querySelector('.bubble');
  if (!b) return;
  b.style.marginLeft = '0px';
  wrap.classList.remove('below');
  requestAnimationFrame(() => {
    // 上に空きがなければ下開きに反転
    if (wrap.getBoundingClientRect().top < b.offsetHeight + 16) wrap.classList.add('below');
    // visualViewport基準: バブルのはみ出しでlayout viewportが広がっても狂わない
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const r = b.getBoundingClientRect();
    let dx = 0;
    if (r.left < 8) dx = 8 - r.left;
    else if (r.right > vw - 8) dx = vw - 8 - r.right;
    if (dx) b.style.marginLeft = dx + 'px';
  });
}
function closeHelps() {
  $$('.helpwrap.open').forEach((x) => { x.classList.remove('open', 'below'); const b = x.querySelector('.bubble'); if (b) b.style.marginLeft = '0px'; });
}

/* 画面端で切れない汎用ポップオーバー(草タップ等) */
let popEl = null, popAnchor = null;
function showPopover(anchor, html) {
  if (popAnchor === anchor && popEl) { hidePopover(); return; }
  hidePopover();
  popAnchor = anchor;
  popEl = document.createElement('div');
  popEl.className = 'gpop';
  popEl.innerHTML = html;
  popEl.style.visibility = 'hidden';
  document.body.appendChild(popEl);
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const r = anchor.getBoundingClientRect();
  const pw = popEl.offsetWidth, ph = popEl.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), Math.max(8, vw - pw - 8));
  let y = r.top - ph - 8;
  if (y < 8) y = r.bottom + 8;
  if (y + ph > vh - 8) y = Math.max(8, vh - ph - 8);
  popEl.style.left = `${x}px`;
  popEl.style.top = `${y}px`;
  popEl.style.visibility = '';
}
function hidePopover() { if (popEl) popEl.remove(); popEl = null; popAnchor = null; }

/* その日の記録 */
function dayStats(key) {
  const n = Store.mem.activity[key] || 0;
  const revs = Store.mem.reviews.filter((r) => Store.todayKey(new Date(r.t)) === key);
  const good = revs.filter((r) => r.grade >= 2).length;
  return { n, total: revs.length, good };
}

/* 次回間隔の表示(Anki式: ボタンに次回表示) */
function fmtDue(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'すぐ';
  if (m < 60) return `${m}分後`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}時間後`;
  const d = h / 24;
  if (d < 45) return `${Math.round(d)}日後`;
  if (d < 365) return `${Math.round(d / 30.4)}ヶ月後`;
  return `${(d / 365).toFixed(1)}年後`;
}

/* アクションバー(下部固定): 出題ボタン→採点ボタンの切替 */
function setBar(html) {
  const bar = $('#actionBar');
  bar.innerHTML = html;
  bar.hidden = false;
}
function gradeBarHTML() {
  const c = ses.q[ses.i];
  const nowMs = Date.now();
  const iv = [0, 2].map((g) => fmtDue(SRS.gradeCard(Store.mem.progress[c.id], g, nowMs).due - nowMs));
  return `<div class="grade" id="grades">
    <button class="g0" data-g="0">忘れた<small>${iv[0]}</small></button>
    <button class="g3" data-g="2">わかった<small>${iv[1]}</small></button>
  </div>`;
}
function showGrades() {
  setBar(gradeBarHTML());
  $$('#actionBar #grades button').forEach((b) => (b.onclick = () => answer(parseInt(b.dataset.g, 10))));
}

/* 正誤フラッシュ(○✕オーバーレイ+枠グロー) */
function flashJudge(ok) {
  const card = $('#cardBox .card');
  if (!card) return;
  card.classList.remove('flash-ok', 'flash-ng');
  void card.offsetWidth;
  card.classList.add(ok ? 'flash-ok' : 'flash-ng');
  const ov = document.createElement('div');
  ov.className = 'judge-ov ' + (ok ? 'ok' : 'ng');
  ov.textContent = ok ? '○' : '✕';
  card.appendChild(ov);
  setTimeout(() => ov.remove(), 800);
}

/* 自動読み上げ: 設定ON時のみ。出題側の想起・穴埋めでは呼ばない(回答バレ防止) */
function autoSpeak(list) {
  if (!Store.mem.settings.autoSpeak) return;
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    list.filter(Boolean).forEach((t) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'en-US';
      u.rate = 0.92;
      speechSynthesis.speak(u);
    });
  } catch { /* 未対応端末 */ }
}

/* オリジナルドロップダウン */
function ddSetup(id) {
  const root = document.getElementById(id);
  if (!root || root._setup) return;
  root._setup = true;
  root.querySelector('.dd-btn').onclick = (e) => {
    e.stopPropagation();
    const was = root.classList.contains('open');
    closeDDs();
    if (!was) { root.classList.add('open'); root.querySelector('.dd-list').hidden = false; }
  };
}
function ddSet(id, { value, options, onPick }) {
  const root = document.getElementById(id);
  if (!root) return;
  root._val = value;
  root.querySelector('.dd-btn span').textContent = options.find((o) => o.v === value)?.t ?? '';
  const list = root.querySelector('.dd-list');
  list.innerHTML = options.map((o) =>
    `<button type="button" data-v="${esc(o.v)}" class="${o.v === value ? 'on' : ''}">${o.v === value ? '✓ ' : ''}${esc(o.t)}</button>`).join('');
  [...list.querySelectorAll('button')].forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    onPick?.(b.dataset.v);
  }));
}
function closeDDs() {
  $$('.dd.open').forEach((r) => { r.classList.remove('open'); const l = r.querySelector('.dd-list'); if (l) l.hidden = true; });
}

/* オリジナルスイッチ */
function swInit(id, on, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.on = on ? '1' : '';
  el.classList.toggle('on', !!on);
  el.setAttribute('aria-checked', !!on);
  el.onclick = () => {
    const v = !(el.dataset.on === '1');
    el.dataset.on = v ? '1' : '';
    el.classList.toggle('on', v);
    el.setAttribute('aria-checked', v);
    onChange?.();
  };
}
function swVal(id) { return document.getElementById(id)?.dataset.on === '1'; }

/* 時刻ホイール */
const WROW_H = 44, WHEEL_H = 132;
function wheelBuild(id, min, max) {
  const el = document.getElementById(id);
  if (!el || el.dataset.built) return;
  el.dataset.built = '1';
  const pad = (WHEEL_H - WROW_H) / 2;
  let h = `<div style="height:${pad}px;flex-shrink:0"></div>`;
  for (let v = min; v <= max; v++) h += `<div class="wrow" data-v="${v}">${String(v).padStart(2, '0')}</div>`;
  h += `<div style="height:${pad}px;flex-shrink:0"></div>`;
  el.innerHTML = h;
  el.addEventListener('scroll', () => wheelMark(el), { passive: true });
}
function wheelMark(el) {
  const i = Math.round(el.scrollTop / WROW_H);
  [...el.querySelectorAll('.wrow')].forEach((r, idx) => r.classList.toggle('sel', idx === i));
}
function wheelSet(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  const rows = [...el.querySelectorAll('.wrow')];
  const idx = rows.findIndex((r) => +r.dataset.v === v);
  if (idx >= 0) { el.scrollTop = idx * WROW_H; wheelMark(el); }
}
function wheelGet(id) {
  const el = document.getElementById(id);
  const rows = [...el.querySelectorAll('.wrow')];
  if (!rows.length) return 0;
  return +rows[Math.min(rows.length - 1, Math.max(0, Math.round(el.scrollTop / WROW_H)))].dataset.v;
}
function wheelTime() {
  return String(wheelGet('whHour')).padStart(2, '0') + ':' + String(wheelGet('whMin')).padStart(2, '0');
}

/* ---------- 例文ハイライト / 穴埋め ---------- */
// nは1始まりの「何語目」。空白区切りトークン基準。
function splitKeep(s) { return String(s || '').split(/(\s+)/); }
function targetTokenIdx(parts, n) {
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!/^\s*$/.test(parts[i]) && parts[i] !== '') { w++; if (w === n) return i; }
  }
  return -1;
}
function highlightExample(sentence, n) {
  if (!sentence) return '';
  const parts = splitKeep(sentence);
  if (!n || n < 1) return esc(sentence);
  const t = targetTokenIdx(parts, n);
  if (t === -1) return esc(sentence);
  return parts.map((p, i) => (i === t ? `<mark>${esc(p)}</mark>` : esc(p))).join('');
}
function blankExample(sentence, n) {
  if (!sentence) return '';
  const parts = splitKeep(sentence);
  const t = targetTokenIdx(parts, n);
  if (t === -1) return esc(sentence);
  const tok = parts[t];
  // 語の綴り部分だけ伏せ、句読点は残す (例: "semester." -> "________.")
  const masked = tok.replace(/[A-Za-z][A-Za-z'-]*/g, (m) => '_'.repeat(Math.max(3, m.length)));
  return parts.map((p, i) => (i === t ? `<span class="blank">${esc(masked)}</span>` : esc(p))).join('');
}

/* ---------- TTS ---------- */
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) { toast('この端末は音声再生に未対応です'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /^[ -~。、]+$/.test(text) && /[a-zA-Z]/.test(text) ? 'en-US' : (/[ぁ-んァ-ン一-鿿]/.test(text) ? 'ja-JP' : 'en-US');
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch { /* noop */ }
}

let toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 2200);
}

/* ---------- PWAインストール ---------- */
let deferredPrompt = null;
function initInstall() {
  const btns = [$('#installBtn'), $('#installBtn2')].filter(Boolean);
  const card = $('#installCard');
  const show = () => btns.forEach((b) => (b.hidden = false));
  const hideAll = () => {
    btns.forEach((b) => (b.hidden = true));
    if (card) card.hidden = true; // インストール後は案内カードごと消す
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; show();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; hideAll(); toast('インストールしました'); });
  btns.forEach((b) => b.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') hideAll();
      deferredPrompt = null;
    } else {
      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      toast(isiOS ? '共有 →「ホーム画面に追加」でアプリ化できます' : 'ブラウザメニューの「インストール/ホーム画面に追加」を使ってください');
    }
  }));
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) hideAll();
  else show(); // 未インストール時は案内を表示(ボタンは環境に応じた手順トースト付)
}

/* ---------- データ読込(CSVモジュール式) ---------- */
async function loadBundled() {
  // カスタム教材(前回取込)を先に復元
  for (const [id, d] of Object.entries(Store.mem.decks)) {
    if (d.custom && d.csvText) {
      const { cards, errors } = CSV.rowsToCards(CSV.parseCSV(d.csvText), id);
      cards.forEach((c) => (Store.mem.cards[c.id] = c));
      if (errors.length) console.warn(id, errors);
    }
  }
  try {
    const res = await fetch('./data/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    const mani = await res.json();
    Store.mem.deckGone ||= {};
    for (const d of mani.decks || []) {
      if (Store.mem.deckGone[d.id]) { // ユーザーが削除した初期教材は復活させない
        delete Store.mem.decks[d.id];
        Object.keys(Store.mem.cards).forEach((k) => { if (Store.mem.cards[k].deckId === d.id) delete Store.mem.cards[k]; });
        continue;
      }
      Store.mem.decks[d.id] ||= { id: d.id, title: d.title, file: d.file, enabled: d.enabled !== false, custom: false };
      const deck = Store.mem.decks[d.id];
      deck.title = d.title || deck.title; deck.file = d.file || deck.file;
      if (deck.enabled === undefined) deck.enabled = true;
      if (!deck.enabled) continue;
      try {
        const r = await fetch('./' + d.file.replace(/^\.\//, ''), { cache: 'no-store' });
        if (!r.ok) throw new Error('csv ' + r.status);
        const text = await r.text();
        const { cards, errors } = CSV.rowsToCards(CSV.parseCSV(text), d.id);
        // 同deckの古いカードを入れ替え
        Object.keys(Store.mem.cards).forEach((k) => { if (Store.mem.cards[k].deckId === d.id) delete Store.mem.cards[k]; });
        cards.forEach((c) => (Store.mem.cards[c.id] = c));
        deck.count = cards.length;
        if (errors.length) console.warn(d.id, errors);
      } catch (e) { console.warn('deck load failed', d.id, e); }
    }
  } catch (e) {
    console.warn('bundled manifest load failed (file://直開きの可能性):', e);
  }
  Store.save();
}

const visibleCards = () => Object.values(Store.mem.cards).filter((c) => Store.mem.decks[c.deckId]?.enabled && !Store.mem.overrides[c.id]?.excluded);
const effMeaning = (c) => Store.mem.overrides[c.id]?.meaning || c.meaning;

/* ---------- 今日キュー ---------- */
function buildQueue() {
  const now = Date.now();
  const cards = visibleCards();
  const due = cards.filter((c) => { const p = Store.mem.progress[c.id]; return p && p.due <= now; })
    .sort((a, b) => Store.mem.progress[a.id].due - Store.mem.progress[b.id].due);
  const fresh = cards.filter((c) => !Store.mem.progress[c.id]).slice(0, Store.mem.settings.newPerDay);
  return [...due, ...fresh].slice(0, 60);
}

/* ---------- セッション ---------- */
let ses = null;
function modeFor(i) {
  const m = Store.mem.settings.mode;
  if (m !== 'mix') return m;
  return ['recog', 'recall', 'cloze'][i % 3];
}
function startSession() {
  const q = buildQueue();
  if (!q.length) { toast('今日の分は完了です。お疲れさまでした'); return; }
  ses = { q, i: 0, done: 0, revealed: false, last: null };
  showView('learn');
  renderCard();
}
function renderCard() {
  const box = $('#cardBox');
  const prog = $('#sesProg');
  const un = $('#sesUndo');
  if (un) un.disabled = !(ses && ses.last);
  if (!ses || ses.i >= ses.q.length) {
    box.innerHTML = `<div class="card"><h2>セッション完了</h2><p>お疲れさまでした。短時間でも毎日続けることが定着につながります。</p><div class="row"><button class="primary grow" id="backHome">ホームへ</button></div></div>`;
    prog.style.width = '100%';
    $('#actionBar').hidden = true;
    $('#backHome').onclick = () => showView('home');
    renderHome(); renderStats();
    return;
  }
  const c = ses.q[ses.i];
  const mode = modeFor(ses.i);
  prog.style.width = `${(ses.i / ses.q.length) * 100}%`;
  $('#sesInfo').textContent = `${ses.i + 1} / ${ses.q.length}`;
  const mp = $('#sesMode');
  mp.textContent = modeName(mode);
  mp.className = 'modepill m-' + mode;
  ses.mode = mode; ses.revealed = false; ses.userOk = null;

  const sayBtn = (t, label, cls = '') => `<button class="saybtn ${cls}" data-say="${esc(t)}" title="${label}" aria-label="${label}">${IC.say}</button>`;
  const cardMenu = `
    <button class="cardmenu-btn" id="cardMenuBtn" aria-label="単語メニュー">…</button>
    <div class="cardmenu" id="cardMenu" hidden>
      <label class="f" for="cmMemo">メモ</label>
      <textarea id="cmMemo" placeholder="覚え方など">${esc(Store.mem.overrides[c.id]?.memo || '')}</textarea>
      <div class="row"><button class="small grow" id="cmSaveMemo">メモ保存</button></div>
    </div>`;
  // 例文2つのうち片方をランダム選択(なければある方、なければnull)
  const pick = (() => {
    const opts = [
      c.ex1 ? { sent: c.ex1, ja: c.ex1ja, n: c.ex1n } : null,
      c.ex2 ? { sent: c.ex2, ja: c.ex2ja, n: c.ex2n } : null,
    ].filter(Boolean);
    if (!opts.length) return null;
    return opts[Math.floor(Math.random() * opts.length)];
  })();
  const pickExBlock = (blank, withJa) => {
    if (!pick) return '';
    const body = blank ? blankExample(pick.sent, pick.n) : highlightExample(pick.sent, pick.n);
    return `<div class="ex"><div${blank ? ' style="font-size:17px"' : ''}>${body}</div>${withJa && pick.ja ? `<div class="ja">${esc(pick.ja)}</div>` : ''}${sayBtn(pick.sent, '例文を聞く', 'top')}</div>`;
  };
  const altLine = c.alt?.length ? `<div class="altline">${esc(c.alt.join(' / '))}</div>` : '';
  const etymBlock = c.etym ? `<div class="mini-label">由来・語源</div><p class="small muted" style="margin:0 0 4px">${esc(c.etym)}</p>` : '';
  const noteBlock = c.note ? `<div class="mini-label">備考</div><p class="small muted" style="margin:0">${esc(c.note)}</p>` : '';
  const deckMeta = c.pos ? `<div class="center-row"><span class="pos">${esc(c.pos)}</span></div>` : '';

  if (mode === 'recog') {
    // 答え合わせ前: 品詞・英単語・例文片方 / 後: 訳・他の訳・例文訳・由来・備考(英文の重複なし)
    box.innerHTML = `
      <div class="card">
        ${cardMenu}
        ${deckMeta}
        <div class="wordrow"><div class="word">${esc(c.word)}</div>${sayBtn(c.word, '発音を聞く')}</div>
        <div id="ans" hidden>
          <div class="meaning">${esc(effMeaning(c))}</div>
          ${altLine}
          ${pick?.ja ? `<div class="ja">${esc(pick.ja)}</div>` : ''}
          ${etymBlock}
          ${noteBlock}
        </div>
        ${pickExBlock(false, false)}
      </div>`;
    setBar(`<button class="primary grow wide" id="reveal">意味を見る</button>`);
    autoSpeak([c.word]);
    $('#reveal').onclick = () => {
      $('#ans').hidden = false;
      ses.revealed = true;
      showGrades();
      autoSpeak([c.word, pick?.sent]);
    };
  } else if (mode === 'recall') {
    // 前: 品詞・訳・他の訳 / 後: 英単語・例文片方・例文訳・由来・備考
    box.innerHTML = `
      <div class="card">
        ${cardMenu}
        ${deckMeta}
        <div class="meaning">${esc(effMeaning(c))}</div>
        ${altLine}
        <input type="text" id="tin" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="type the word" enterkeyhint="done" aria-label="英語スペル">
        <div id="ans" hidden>
          <div class="wordrow"><div class="word">${esc(c.word)}</div>${sayBtn(c.word, '発音を聞く')}</div>
          ${pickExBlock(false, true)}
          ${etymBlock}
          ${noteBlock}
          <div id="judge" class="small"></div>
        </div>
      </div>`;
    setBar(`<button class="primary grow wide" id="check">答え合わせ</button>`);
    $('#check').onclick = () => {
      const v = $('#tin').value.trim().toLowerCase();
      const ok = v === c.word.toLowerCase();
      ses.userOk = ok;
      $('#ans').hidden = false;
      $('#judge').innerHTML = ok ? '<span class="ok">正解です</span>' : `<span class="ng">不正解</span> <span class="muted">正: ${esc(c.word)}</span>`;
      flashJudge(ok);
      showGrades();
      autoSpeak([c.word, pick?.sent]);
    };
  } else {
    // 穴埋め 前: 例文片方(虫食い)・例文訳 / 後: 英単語・訳・他の訳・由来・備考
    box.innerHTML = `
      <div class="card">
        ${cardMenu}
        ${pickExBlock(true, true)}
        <div class="muted small">${esc(effMeaning(c))} <span class="pos">${esc(c.pos || '')}</span></div>
        <input type="text" id="tin" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="fill the blank" enterkeyhint="done" aria-label="空欄に入る単語">
        <div id="ans" hidden>
          <div class="wordrow"><div class="word">${esc(c.word)}</div>${sayBtn(c.word, '発音を聞く')}</div>
          <div class="meaning">${esc(effMeaning(c))}</div>
          ${altLine}
          ${etymBlock}
          ${noteBlock}
          <div id="judge" class="small"></div>
        </div>
      </div>`;
    setBar(`<button class="primary grow wide" id="check">答え合わせ</button>`);
    $('#check').onclick = () => {
      const v = $('#tin').value.trim().toLowerCase();
      const ok = v === c.word.toLowerCase();
      ses.userOk = ok;
      $('#ans').hidden = false;
      $('#judge').innerHTML = ok ? '<span class="ok">正解です</span>' : `<span class="ng">不正解</span> <span class="muted">正: ${esc(c.word)}</span>`;
      flashJudge(ok);
      showGrades();
      autoSpeak([c.word, pick?.sent]);
    };
  }
  $$('#cardBox [data-say]').forEach((b) => (b.onclick = () => speak(b.dataset.say)));
  const tin = $('#tin');
  if (tin) {
    tin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#check')?.click(); } });
    setTimeout(() => { try { tin.focus({ preventScroll: true }); } catch { tin.focus(); } }, 150);
  }
  const menuBtn = $('#cardMenuBtn'), menu = $('#cardMenu');
  if (menuBtn && menu) {
    menuBtn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    $('#cmSaveMemo').onclick = () => {
      Store.mem.overrides[c.id] = { ...(Store.mem.overrides[c.id] || {}), memo: $('#cmMemo').value };
      Store.save(); toast('メモを保存しました'); menu.hidden = true;
    };
  }
}
function modeName(m) { return { recog: '認識', recall: '想起', cloze: '文脈穴埋め' }[m] || m; }

function answer(g) {
  const c = ses.q[ses.i];
  // 入力モードで未判定なら自動提案(正=Good, 誤=Again)を尊重しつつ押された値を採用
  if ((ses.mode === 'recall' || ses.mode === 'cloze') && ses.userOk !== null) {
    if (ses.userOk && g === 0) { /* 明示操作を優先 */ }
  }
  if (ses.mode === 'recog' && !ses.revealed) return;
  const prevSt = Store.mem.progress[c.id] ? { ...Store.mem.progress[c.id] } : null;
  Store.mem.progress[c.id] = SRS.gradeCard(Store.mem.progress[c.id], g);
  Store.mem.reviews.push({ t: Date.now(), cardId: c.id, grade: g });
  const k = Store.todayKey();
  Store.mem.activity[k] = (Store.mem.activity[k] || 0) + 1;
  Store.save();
  ses.last = { cardId: c.id, prev: prevSt, day: k };
  ses.i++; ses.done++;
  renderCard(); renderHome(); renderStats();
}

/* 直前の採点を1手だけ取り消す(AnkiのUndo相当) */
function undoLast() {
  if (!ses || !ses.last) return;
  const { cardId, prev, day } = ses.last;
  if (prev) Store.mem.progress[cardId] = prev;
  else delete Store.mem.progress[cardId];
  Store.mem.reviews.pop();
  if (Store.mem.activity[day] > 1) Store.mem.activity[day]--;
  else delete Store.mem.activity[day];
  Store.save();
  ses.last = null;
  ses.i = Math.max(0, ses.i - 1);
  toast('直前の採点を取り消しました');
  renderCard(); renderHome(); renderStats();
}

/* ---------- 画面遷移 ---------- */
function showView(name) {
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
  $$('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  document.body.classList.toggle('on-learn', name === 'learn');
  if (name !== 'learn') {
    $('#actionBar').hidden = true;
    try { speechSynthesis.cancel(); } catch { /* noop */ }
  }
  if (name === 'home') renderHome();
  if (name === 'list') renderList();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  window.scrollTo({ top: 0 });
}

/* ---------- ホーム(習慣化) ---------- */
function streak() {
  let s = 0, gaps = 0;
  for (let back = 0; back < 365; back++) {
    const d = new Date(); d.setDate(d.getDate() - back);
    const k = Store.todayKey(d);
    if (Store.mem.activity[k]) s++;
    else if (back === 0) continue; // 今日未実施は継続扱い
    else if (gaps < 1) gaps++; // 1日のお休みは許容(寛容型ストリーク)
    else break;
  }
  return s;
}
function renderHome() {
  const q = buildQueue();
  const dueN = q.filter((c) => Store.mem.progress[c.id]).length;
  const newN = q.filter((c) => !Store.mem.progress[c.id]).length;
  const today = Store.mem.activity[Store.todayKey()] || 0;
  const goal = Store.mem.settings.dailyGoal || 5;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const total = visibleCards().length;
  $('#qDue').textContent = dueN;
  $('#qNew').textContent = newN;
  $('#todayBar').style.width = pct + '%';
  $('#todayTxt').textContent = `${today} / ${goal} 語 (${pct}%)`;
  $('#streakTxt').textContent = `${streak()}日継続中(1日休みOK)`;
  $('#totalTxt').textContent = `登録 ${total}語 ・ 教材 ${Object.values(Store.mem.decks).filter((d) => d.enabled).length}件`;
  // 週ドット
  const week = [];
  for (let back = 6; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    week.push(`<span class="dot ${Store.mem.activity[Store.todayKey(d)] ? 'hit' : ''}"></span>`);
  }
  $('#weekDots').innerHTML = week.join('');
  $('#startBtn').onclick = startSession;
}

/* ---------- 一覧・検索・詳細 ---------- */
let listDeckF = '', listStF = '';
const ST_OPTS = [
  { v: '', t: '全状態' }, { v: 'new', t: '未学習' }, { v: 'due', t: '復習期' }, { v: 'mature', t: '定着' },
];
function renderList() {
  const kw = ($('#q').value || '').toLowerCase();
  const deckF = listDeckF, stF = listStF;
  const now = Date.now();
  const deckOpts = [{ v: '', t: '全教材' }].concat(
    Object.values(Store.mem.decks).filter((d) => d.enabled).map((d) => ({ v: d.id, t: d.title }))
  );
  if (!deckOpts.some((o) => o.v === deckF)) listDeckF = '';
  ddSet('ddDeck', { value: listDeckF, options: deckOpts, onPick: (v) => { listDeckF = v; renderList(); } });
  ddSet('ddState', { value: listStF, options: ST_OPTS, onPick: (v) => { listStF = v; renderList(); } });
  const cards = visibleCards()
    .filter((c) => !kw || c.word.toLowerCase().includes(kw) || effMeaning(c).includes(kw) || (c.alt || []).join(' ').includes(kw))
    .filter((c) => !listDeckF || c.deckId === listDeckF)
    .filter((c) => {
      if (!listStF) return true;
      const p = Store.mem.progress[c.id];
      if (listStF === 'new') return !p;
      if (listStF === 'due') return p && p.due <= now;
      if (listStF === 'mature') return p && p.interval >= 21 && p.due > now;
      return true;
    })
    .slice(0, 300);
  $('#listCount').textContent = `${cards.length}件${visibleCards().length > 300 ? '(先頭300件)' : ''}`;
  $('#listBox').innerHTML = cards.map((c) => {
    const p = Store.mem.progress[c.id];
    const st = SRS.statusOf(p);
    const pill = { new: '未学習', due: '復習期', relearn: '再学習', young: '学習中', mature: '定着' }[st];
    return `<div class="card" data-id="${esc(c.id)}" style="cursor:pointer">
      <div class="row"><strong>${esc(c.word)}</strong><span class="grow"></span>${c.pos ? `<span class="pos">${esc(c.pos)}</span>` : ''}
      <span class="pill">${pill}</span><button class="saybtn" data-say="${esc(c.word)}" title="発音を聞く" aria-label="${esc(c.word)}の発音を聞く">${IC.say}</button></div>
      <div class="row" style="margin-top:2px"><span class="muted grow">${esc(effMeaning(c))}</span><span class="muted small">#${esc(c.seq)}</span></div></div>`;
  }).join('') || '<p class="muted">該当なし。CSVを取り込むか検索条件を変えてください。</p>';
  $$('#listBox .card').forEach((el) => (el.onclick = () => openDetail(el.dataset.id)));
  $$('#listBox [data-say]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.say); }));
}

function openDetail(id) {
  const c = Store.mem.cards[id];
  if (!c) return;
  const ov = Store.mem.overrides[id] || {};
  const p = Store.mem.progress[id];
  const dlg = $('#detail');
  const showBlank = Store.mem.settings.exDisplay === 'blank';
  const exHtml = [1, 2].map((w) => {
    const sent = w === 1 ? c.ex1 : c.ex2, ja = w === 1 ? c.ex1ja : c.ex2ja, n = w === 1 ? c.ex1n : c.ex2n;
    if (!sent) return '';
    return `<div class="ex" data-ex="${w}"><div>${showBlank ? blankExample(sent, n) : highlightExample(sent, n)}</div>
      <div class="ja">${esc(ja)}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="saybtn" data-say="${esc(sent)}" title="例文を聞く" aria-label="例文を聞く">${IC.say}</button></div></div>`;
  }).join('');
  $('#detailBody').innerHTML = `
    <div class="row"><span class="pos">${esc(c.pos || '')}</span><span class="muted small">${esc(c.deckId)} #${esc(c.seq)}</span></div>
    <div class="wordrow"><div class="word">${esc(c.word)}</div><button class="saybtn" id="sayW" title="発音を聞く" aria-label="発音を聞く">${IC.say}</button></div>
    <div class="row"><span class="pill">${p ? `間隔${p.interval}日・次回${new Date(p.due).toLocaleDateString('ja-JP')}` : '未学習'}</span></div>
    <div class="meaning">${esc(effMeaning(c))}</div>
    ${c.alt?.length ? `<div class="muted small">${esc(c.alt.join(' / '))}</div>` : ''}
    <div class="row" style="margin:8px 0">
      <button class="small" id="tglEx">表示切替: ${showBlank ? '穴埋め' : 'ハイライト'}</button>
      <span class="helpwrap"><button class="help" type="button" aria-label="ヘルプ">?</button><span class="bubble">出題時は穴埋め・確認時はハイライトが基本です。</span></span>
    </div>
    <div id="exs">${exHtml}</div>
    ${c.etym ? `<div class="card"><h2>由来・語源</h2><p class="small">${esc(c.etym)}</p></div>` : ''}
    ${c.note ? `<div class="card"><h2>備考</h2><p class="small">${esc(c.note)}</p></div>` : ''}
    <label class="f" for="memo">メモ(自分用・端末保存)</label>
    <textarea id="memo" placeholder="覚え方・注意点など">${esc(ov.memo || '')}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="small grow" id="saveMemo">メモ保存</button>
    </div>`;
  $('#sayW').onclick = () => speak(c.word);
  $$('#detailBody [data-say]').forEach((b) => (b.onclick = () => speak(b.dataset.say)));
  let blank = showBlank;
  $('#tglEx').onclick = () => {
    blank = !blank;
    $('#tglEx').textContent = `表示切替: ${blank ? '穴埋め' : 'ハイライト'}`;
    $$('#exs .ex').forEach((box) => {
      const w = +box.dataset.ex;
      const sent = w === 1 ? c.ex1 : c.ex2, n = w === 1 ? c.ex1n : c.ex2n;
      box.firstElementChild.innerHTML = blank ? blankExample(sent, n) : highlightExample(sent, n);
    });
  };
  $('#saveMemo').onclick = () => {
    Store.mem.overrides[id] = { ...(Store.mem.overrides[id] || {}), memo: $('#memo').value };
    Store.save(); toast('メモを保存しました');
  };
  if (!dlg.open) dlg.showModal();
}

/* ---------- 統計 ---------- */
function renderStats() {
  const now = Date.now();
  const cards = visibleCards();
  const ps = cards.map((c) => Store.mem.progress[c.id]).filter(Boolean);
  const dueN = ps.filter((p) => p.due <= now).length;
  const matureN = ps.filter((p) => p.interval >= 21).length;
  const last30 = Store.mem.reviews.filter((r) => now - r.t < 30 * 86400000);
  const good = last30.filter((r) => r.grade >= 2).length;
  const ret = last30.length ? Math.round((good / last30.length) * 100) : 0;
  $('#stDue').textContent = dueN;
  $('#stMature').textContent = matureN;
  $('#stTotal').textContent = cards.length;
  $('#stRet').textContent = last30.length ? `${ret}%(${last30.length}件)` : '—';
  renderGrass();
}

/* 草(学習記録カレンダー): GitHub風フル再現(月・曜日ラベル+タップ詳細) */
function renderGrass() {
  const box = $('#grass');
  if (!box) return;
  const WEEKS = 17;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - start.getDay()); // 直前の日曜に揃える
  const cols = [];
  let total = 0, max = 1;
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(dt.getDate() + w * 7 + d);
      if (dt > today) { col.push(null); continue; }
      const v = Store.mem.activity[Store.todayKey(dt)] || 0;
      col.push({ dt, v });
      total += v; max = Math.max(max, v);
    }
    cols.push(col);
  }
  const lv = (v) => (v === 0 ? '' : 'lv' + Math.min(4, Math.ceil((v / max) * 4)));
  box.innerHTML = cols.map((col) => col.map((c) => {
    if (!c) return '<i class="none"></i>';
    return `<i data-d="${Store.todayKey(c.dt)}" class="${lv(c.v)}"></i>`;
  }).join('')).join('');
  const M = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  let lastM = -1;
  $('#grassMonths').innerHTML = cols.map((col) => {
    const first = col.find((c) => c);
    if (!first) return '<span></span>';
    const m = first.dt.getMonth();
    if (m === lastM) return '<span></span>';
    lastM = m;
    return `<span>${M[m]}</span>`;
  }).join('');
  $('#grassTotal').textContent = `${total}語`;
  const d0 = new Date(today); d0.setDate(d0.getDate() - (WEEKS * 7 - 1));
  $('#grassRange').textContent = `過去${WEEKS}週(${d0.getMonth() + 1}/${d0.getDate()}〜)の学習量`;
  fitGrass();
}

/* 草のマスを横幅いっぱいにフィット */
function fitGrass() {
  const scroll = document.querySelector('.calscroll');
  const wrap = document.querySelector('.calwrap');
  if (!scroll || !wrap) return;
  const WEEKS = 17, gap = 3;
  const avail = scroll.clientWidth;
  if (!avail) return;
  const cell = Math.min(20, Math.max(10, Math.floor((avail - (WEEKS - 1) * gap) / WEEKS)));
  wrap.style.setProperty('--cell', `${cell}px`);
}

function onGrassTap(e) {
  const cell = e.target.closest('i[data-d]');
  if (!cell) return;
  const [y, mo, da] = cell.dataset.d.split('-').map(Number);
  const dt = new Date(y, mo - 1, da);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  const st = dayStats(cell.dataset.d);
  const acc = st.total ? `・正答率${Math.round((st.good / st.total) * 100)}%` : '';
  showPopover(cell, `<b>${mo}/${da}(${wd})</b><br>${st.n}語学習${acc}<br><span class="muted">${st.total}件の採点</span>`);
}

/* ---------- 設定・教材管理 ---------- */
function renderSettings() {
  const s = Store.mem.settings;
  $('#setGoal').value = s.dailyGoal; $('#setNew').value = s.newPerDay;
  segInit('segMode', s.mode, scheduleSettingsSave);
  segInit('segEx', s.exDisplay, scheduleSettingsSave);
  swInit('swNotify', !!s.notifyOn, scheduleSettingsSave);
  swInit('swAuto', s.autoSpeak !== false, scheduleSettingsSave);
  const curAcc = (s.accent || '#5bb88a').toLowerCase();
  $$('#swAcc button').forEach((b) => {
    b.classList.toggle('on', b.dataset.c.toLowerCase() === curAcc);
    b.onclick = () => {
      Store.mem.settings.accent = b.dataset.c;
      applyAccent();
      Store.save();
      $$('#swAcc button').forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  $('#timeView').textContent = s.remindTime || '07:00';
  $('#timeEdit').hidden = true;
  $('#timeView').hidden = false;
  timeTouched = false;
  updateNotifyState();
  const gone = Object.keys(Store.mem.deckGone || {});
  const decks = Object.values(Store.mem.decks);
  const restore = gone.length
    ? `<div class="restore-row"><button class="small ghost" id="restoreDecks">初期教材を復元(${gone.length}件)</button></div>` : '';
  $('#deckBox').innerHTML = restore + (decks.map((d) => `
    <div class="card"><div class="row"><strong>${esc(d.title)}</strong><span class="grow"></span>
      <span class="pill">${d.enabled ? '有効' : '無効'}</span></div>
    <div class="muted small">${esc(d.id)} ・ ${d.custom ? '取込教材' : esc(d.file || '')} ・ ${d.count ?? Object.values(Store.mem.cards).filter((c) => c.deckId === d.id).length}語</div>
    <div class="deckops">
      <button class="iconbtn ${d.enabled ? '' : 'off'}" data-act="toggle" data-id="${esc(d.id)}" title="${d.enabled ? '無効にする' : '有効にする'}" aria-label="${d.enabled ? '無効にする' : '有効にする'}">${d.enabled ? IC.eye : IC.eyeOff}</button>
      <span class="grow"></span>
      <button class="iconbtn" data-act="export" data-id="${esc(d.id)}" title="CSVで書き出す" aria-label="CSVで書き出す">${IC.download}</button>
      <button class="iconbtn danger" data-act="del" data-id="${esc(d.id)}" title="削除する" aria-label="削除する">${IC.trash}</button>
    </div></div>`).join('') || '<p class="muted">教材がありません。CSVを取り込むか初期教材を復元してください。</p>');
  $$('#deckBox button').forEach((b) => {
    if (b.id === 'restoreDecks') { b.onclick = restoreBundled; return; }
    b.onclick = () => deckAction(b.dataset.act, b.dataset.id);
  });
}

function restoreBundled() {
  Store.mem.deckGone = {};
  Store.saveNow();
  location.reload();
}

async function deckAction(act, id) {
  const d = Store.mem.decks[id];
  if (!d) return;
  if (act === 'toggle') { d.enabled = !d.enabled; Store.save(); renderSettings(); renderHome(); }
  if (act === 'del') {
    const n = Object.values(Store.mem.cards).filter((c) => c.deckId === id).length;
    const ok = await askConfirm({
      title: '教材を削除',
      body: `「${d.title}」(${n}語)を端末から削除します。${d.custom ? '' : '初期教材も完全に消去されます(「初期教材を復元」から戻せます)。'}この操作は取り消せません。`,
      okText: '削除する', danger: true,
    });
    if (!ok) return;
    const ids = new Set(Object.values(Store.mem.cards).filter((c) => c.deckId === id).map((c) => c.id));
    Object.keys(Store.mem.cards).forEach((k) => { if (Store.mem.cards[k].deckId === id) delete Store.mem.cards[k]; });
    ids.forEach((cid) => { delete Store.mem.progress[cid]; delete Store.mem.overrides[cid]; });
    Store.mem.reviews = Store.mem.reviews.filter((r) => !ids.has(r.cardId));
    if (!d.custom) { Store.mem.deckGone ||= {}; Store.mem.deckGone[id] = 1; }
    delete Store.mem.decks[id];
    Store.save(); renderSettings(); renderHome(); renderList(); toast('教材を削除しました');
  }
  if (act === 'export') {
    const cards = Object.values(Store.mem.cards).filter((c) => c.deckId === id)
      .map((c) => ({ ...c, meaning: effMeaning(c) }));
    const blob = new Blob([CSV.cardsToCSV(cards)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

async function importFile(file) {
  const text = await file.text();
  if (text.length > 2_000_000) { toast('2MB超のため取込できません(分割してください)'); return; }
  const id = 'custom_' + Date.now().toString(36);
  const { cards, errors } = CSV.rowsToCards(CSV.parseCSV(text), id);
  if (!cards.length) { toast('有効な単語がありません: ' + errors.slice(0, 2).join(' / ')); return; }
  Store.mem.decks[id] = { id, title: file.name.replace(/\.csv$/i, ''), enabled: true, custom: true, csvText: text, count: cards.length };
  cards.forEach((c) => (Store.mem.cards[c.id] = c));
  Store.save(); renderSettings(); renderHome();
  $('#importMsg').innerHTML = `<span class="ok">${esc(cards.length)}語を取り込みました</span>${errors.length ? `<br><span class="muted small">注意: ${esc(errors.slice(0, 3).join(' / '))}${errors.length > 3 ? ` 他${errors.length - 3}件` : ''}</span>` : ''}
    <table class="prev" style="margin-top:8px"><tr><th>英単語</th><th>訳</th><th>例文1</th></tr>${cards.slice(0, 3).map((c) => `<tr><td>${esc(c.word)}</td><td>${esc(effMeaning(c))}</td><td>${esc((c.ex1 || '').slice(0, 30))}</td></tr>`).join('')}</table>`;
}

/* 設定の自動保存(保存ボタンなし) */
let settingsT = null;
let timeTouched = false;
function scheduleSettingsSave() {
  clearTimeout(settingsT);
  settingsT = setTimeout(collectSettings, 600);
}
async function collectSettings() {
  Store.mem.settings.dailyGoal = Math.max(1, +$('#setGoal').value || 5);
  Store.mem.settings.newPerDay = Math.max(1, +$('#setNew').value || 5);
  Store.mem.settings.mode = segVal('segMode') || 'mix';
  Store.mem.settings.exDisplay = segVal('segEx') || 'highlight';
  if (timeTouched) Store.mem.settings.remindTime = wheelTime();
  Store.mem.settings.notifyOn = swVal('swNotify');
  Store.mem.settings.autoSpeak = swVal('swAuto');
  if (Store.mem.settings.notifyOn && 'Notification' in window) {
    let p = Notification.permission;
    if (p === 'default') {
      try { p = await Notification.requestPermission(); } catch { p = Notification.permission; }
    }
    if (p !== 'granted') {
      Store.mem.settings.notifyOn = false;
      swInit('swNotify', false, scheduleSettingsSave);
      toast('通知が許可されませんでした');
    }
  }
  Store.save(); scheduleNotify(); renderHome();
  updateNotifyState();
}

/* ---------- 通知(習慣化リマインド) ---------- */
let notifyTimer = null;
function scheduleNotify() {
  clearTimeout(notifyTimer);
  const s = Store.mem.settings;
  if (!s.notifyOn || !s.remindTime || !('Notification' in window)) return;
  const [h, m] = s.remindTime.split(':').map(Number);
  const next = new Date(); next.setHours(h, m, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  notifyTimer = setTimeout(async () => {
    // その日にやることがあるときだけ通知(静かな習慣化)
    try {
      if (buildQueue().length) {
        await fireNotification('lemon', `今日の${Store.mem.settings.dailyGoal}語、2分だけやりませんか?`);
      }
    } catch { /* 権限なし */ }
    scheduleNotify();
  }, next - Date.now());
}

function updateNotifyState() {
  const el = $('#notifyState');
  if (!el) return;
  if (!('Notification' in window)) { el.textContent = 'このブラウザは通知に未対応です'; return; }
  el.textContent = '許可状態: ' + ({ granted: '許可済み', denied: '拒否されています', default: '未確認' })[Notification.permission];
}

async function testNotify() {
  if (!('Notification' in window)) { toast('このブラウザは通知に未対応です'); return; }
  let p = Notification.permission;
  if (p === 'default') {
    try { p = await Notification.requestPermission(); } catch { p = Notification.permission; }
  }
  updateNotifyState();
  if (p !== 'granted') {
    toast('通知が許可されていません。端末の設定から許可してください');
    return;
  }
  const sent = await fireNotification(
    'lemon テスト通知',
    '通知は正常です。リマインドもこの表示で届きます(アプリを開いている間のみ有効)。'
  );
  toast(sent ? 'テスト通知を送信しました' : '通知の表示に失敗しました');
}

/* ---------- 起動 ---------- */
async function boot() {
  initInstall();
  applyAccent();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => applyAccent();
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW登録失敗', e); }
  }
  await loadBundled();
  $$('nav.tabs button').forEach((b) => (b.onclick = () => {
    if (b.dataset.view === 'learn') {
      if (!ses || ses.i >= ses.q.length) { startSession(); return; }
      renderCard(); // セッション継続中は再描画してアクションバーを復元
    }
    showView(b.dataset.view);
  }));
  $('#btnGoList').onclick = () => showView('list');
  $('#btnGoDecks').onclick = () => showView('settings');
  $('#q').addEventListener('input', renderList);
  ddSetup('ddDeck'); ddSetup('ddState');
  wheelBuild('whHour', 0, 23); wheelBuild('whMin', 0, 59);
  // 設定は自動保存(保存ボタンなし)
  $('#setGoal').addEventListener('input', scheduleSettingsSave);
  $('#setNew').addEventListener('input', scheduleSettingsSave);
  ['whHour', 'whMin'].forEach((id) => document.getElementById(id).addEventListener('scroll', scheduleSettingsSave, { passive: true }));
  $('#timeView').onclick = () => {
    $('#timeView').hidden = true; $('#timeEdit').hidden = false;
    timeTouched = true;
    const [hh, mm] = (Store.mem.settings.remindTime || '07:00').split(':').map(Number);
    requestAnimationFrame(() => {
      wheelSet('whHour', Number.isFinite(hh) ? hh : 7);
      wheelSet('whMin', Number.isFinite(mm) ? mm : 0);
    });
  };
  $('#timeDone').onclick = () => {
    Store.mem.settings.remindTime = wheelTime(); // 非表示にするとscrollTopが読めなくなるため先に確保
    timeTouched = false;
    $('#timeEdit').hidden = true; $('#timeView').hidden = false;
    clearTimeout(settingsT);
    collectSettings();
    renderSettings();
  };
  $('#sesQuit').onclick = () => { ses = null; try { speechSynthesis.cancel(); } catch { /* noop */ } showView('home'); toast('セッションを終了しました'); };
  $('#sesUndo').onclick = undoLast;
  $('#grass').addEventListener('click', onGrassTap);
  let rszT = null;
  window.addEventListener('resize', () => { clearTimeout(rszT); rszT = setTimeout(fitGrass, 200); });
  window.addEventListener('scroll', hidePopover, { passive: true, capture: true });
  $('#csvFile').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  $('#testNotify').onclick = testNotify;
  // はてなヘルプ: タップで開閉(ホバーはCSS)、他所タップで閉じる。端切れ補正つき
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd')) closeDDs();
    const cm = $('#cardMenu');
    if (cm && !cm.hidden && !e.target.closest('#cardMenu,#cardMenuBtn')) cm.hidden = true;
    if (popEl && !e.target.closest('.gpop') && !e.target.closest('#grass')) hidePopover();
    const h = e.target.closest('.help');
    if (h) {
      const w = h.closest('.helpwrap');
      const was = w.classList.contains('open');
      closeHelps();
      if (!was) { w.classList.add('open'); fitBubble(w); }
      return;
    }
    if (!e.target.closest('.helpwrap')) closeHelps();
  });
  $('#closeDetail').onclick = () => $('#detail').close();
  $('#resetAll').onclick = async () => {
    const nCards = Object.keys(Store.mem.cards).length;
    const nRev = Store.mem.reviews.length;
    const nDays = Object.keys(Store.mem.activity).length;
    const ok = await askConfirm({
      title: '学習履歴を全消去',
      body: `登録 ${nCards}語・回答履歴 ${nRev}件・学習記録 ${nDays}日分をすべて消去します。取込教材も消え、初期状態に戻ります。この操作は取り消せません。`,
      okText: 'すべて消去する', danger: true,
    });
    if (!ok) return;
    localStorage.removeItem(Store.KEY);
    location.reload();
  };
  renderHome(); renderStats(); scheduleNotify();
  showView('home');
  if (!Object.keys(Store.mem.cards).length) {
    toast('CSVが未読込です。設定→教材管理から取り込んでください');
  }
}
document.addEventListener('DOMContentLoaded', boot);
