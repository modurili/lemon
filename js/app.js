/* 英単語ドリル app.js — バニラJS。GitHub Pages静的ホスティング想定(相対パスのみ) */
'use strict';
const Store = window.EtanStore;
const CSV = window.EtanCSV;
const SRS = window.EtanSRS;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  const show = () => btns.forEach((b) => (b.hidden = false));
  const hide = () => btns.forEach((b) => (b.hidden = true));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; show();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; hide(); toast('インストールしました'); });
  btns.forEach((b) => b.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') hide();
      deferredPrompt = null;
    } else {
      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      toast(isiOS ? '共有 →「ホーム画面に追加」でアプリ化できます' : 'ブラウザメニューの「インストール/ホーム画面に追加」を使ってください');
    }
  }));
  if (window.matchMedia('(display-mode: standalone)').matches) hide();
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
    for (const d of mani.decks || []) {
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
  ses = { q, i: 0, done: 0, revealed: false };
  showView('learn');
  renderCard();
}
function renderCard() {
  const box = $('#cardBox');
  const prog = $('#sesProg');
  if (!ses || ses.i >= ses.q.length) {
    box.innerHTML = `<div class="card"><h2>セッション完了</h2><p>お疲れさまでした。短時間でも毎日続けることが定着につながります。</p><div class="row"><button class="primary grow" id="backHome">ホームへ</button></div></div>`;
    prog.style.width = '100%';
    $('#backHome').onclick = () => showView('home');
    renderHome(); renderStats();
    return;
  }
  const c = ses.q[ses.i];
  const mode = modeFor(ses.i);
  prog.style.width = `${(ses.i / ses.q.length) * 100}%`;
  $('#sesInfo').textContent = `${ses.i + 1} / ${ses.q.length} ・ ${modeName(mode)}`;
  ses.mode = mode; ses.revealed = false; ses.userOk = null;

  const exBlock = (which, blank) => {
    const sent = which === 1 ? c.ex1 : c.ex2;
    const ja = which === 1 ? c.ex1ja : c.ex2ja;
    const n = which === 1 ? c.ex1n : c.ex2n;
    if (!sent) return '';
    return `<div class="ex"><div>${blank ? blankExample(sent, n) : highlightExample(sent, n)}</div><div class="ja">${esc(ja)}</div>
      <div class="row" style="margin-top:6px"><button class="small ghost" data-say="${esc(sent)}">🔊 例文</button></div></div>`;
  };

  if (mode === 'recog') {
    box.innerHTML = `
      <div class="card">
        <span class="pos">${esc(c.pos || '')}</span>
        <div class="word">${esc(c.word)}</div>
        <div class="row"><button class="small" data-say="${esc(c.word)}">🔊 発音</button>
        <span class="muted small">${esc(c.deckId)} #${esc(c.seq)}</span></div>
        ${exBlock(1, false)}
        <div id="ans" hidden>
          <div class="meaning">${esc(effMeaning(c))}</div>
          ${c.alt?.length ? `<div class="muted small">ほか: ${esc(c.alt.join(' / '))}</div>` : ''}
          ${exBlock(2, false)}
          ${c.etym ? `<p class="small muted">語源: ${esc(c.etym)}</p>` : ''}
        </div>
        <div class="row" style="margin-top:10px"><button class="primary grow" id="reveal">意味を見る</button></div>
        <div class="grade" id="grades" hidden>
          <button class="g0" data-g="0">忘れた<small>Again</small></button>
          <button data-g="1">あいまい<small>Hard</small></button>
          <button data-g="2">わかった<small>Good</small></button>
          <button class="g3" data-g="3">余裕<small>Easy</small></button>
        </div>
      </div>`;
    $('#reveal').onclick = () => { $('#ans').hidden = false; $('#grades').hidden = false; $('#reveal').hidden = true; ses.revealed = true; setTimeout(() => $('#grades').scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); };
  } else if (mode === 'recall') {
    box.innerHTML = `
      <div class="card">
        <span class="pos">${esc(c.pos || '')}</span>
        <div class="meaning">${esc(effMeaning(c))}</div>
        ${c.alt?.length ? `<div class="muted small">ほか: ${esc(c.alt.join(' / '))}</div>` : ''}
        <label class="f" for="tin">英語スペルを入力</label>
        <input type="text" id="tin" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="type the word">
        <div class="row" style="margin-top:10px"><button class="primary grow" id="check">答え合わせ</button></div>
        <div id="ans" hidden>
          <div class="word">${esc(c.word)}</div>
          <div class="row"><button class="small" data-say="${esc(c.word)}">🔊 発音</button></div>
          ${exBlock(1, false)}${exBlock(2, false)}
          <div id="judge" class="small"></div>
        </div>
        <div class="grade" id="grades" hidden>
          <button class="g0" data-g="0">忘れた<small>Again</small></button><button data-g="1">あいまい<small>Hard</small></button>
          <button data-g="2">わかった<small>Good</small></button><button class="g3" data-g="3">余裕<small>Easy</small></button>
        </div>
      </div>`;
    $('#check').onclick = () => {
      const v = $('#tin').value.trim().toLowerCase();
      const ok = v === c.word.toLowerCase();
      ses.userOk = ok;
      $('#ans').hidden = false; $('#grades').hidden = false;
      $('#judge').innerHTML = ok ? '<span class="ok">正解です</span>' : `<span class="ng">不正解</span> <span class="muted">正: ${esc(c.word)}</span>`;
      $('#check').hidden = true;
      setTimeout(() => $('#grades').scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    };
  } else {
    // cloze: 例文穴埋め (ハイライトと穴埋めの両対応: 出題時は伏せ、答え合わせ後はハイライト)
    box.innerHTML = `
      <div class="card">
        <div class="ex"><div style="font-size:17px">${blankExample(c.ex1, c.ex1n)}</div><div class="ja">${esc(c.ex1ja)}</div></div>
        <div class="muted">${esc(effMeaning(c))} <span class="pos">${esc(c.pos || '')}</span></div>
        <label class="f" for="tin">空欄に入る単語は?</label>
        <input type="text" id="tin" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="fill the blank">
        <div class="row" style="margin-top:10px"><button class="primary grow" id="check">答え合わせ</button></div>
        <div id="ans" hidden>
          <div class="ex"><div>${highlightExample(c.ex1, c.ex1n)}</div><div class="ja">${esc(c.ex1ja)}</div>
          <div class="row" style="margin-top:6px"><button class="small ghost" data-say="${esc(c.ex1)}">🔊 例文</button></div></div>
          <div class="word">${esc(c.word)}</div>
          <div id="judge" class="small"></div>
        </div>
        <div class="grade" id="grades" hidden>
          <button class="g0" data-g="0">忘れた<small>Again</small></button><button data-g="1">あいまい<small>Hard</small></button>
          <button data-g="2">わかった<small>Good</small></button><button class="g3" data-g="3">余裕<small>Easy</small></button>
        </div>
      </div>`;
    $('#check').onclick = () => {
      const v = $('#tin').value.trim().toLowerCase();
      const ok = v === c.word.toLowerCase();
      ses.userOk = ok;
      $('#ans').hidden = false; $('#grades').hidden = false;
      $('#judge').innerHTML = ok ? '<span class="ok">正解です</span>' : `<span class="ng">不正解</span> <span class="muted">正: ${esc(c.word)}</span>`;
      $('#check').hidden = true;
      setTimeout(() => $('#grades').scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    };
  }
  $$('#cardBox [data-say]').forEach((b) => (b.onclick = () => speak(b.dataset.say)));
  $$('#grades button').forEach((b) => (b.onclick = () => answer(parseInt(b.dataset.g, 10))));
}
function modeName(m) { return { recog: '認識', recall: '想起', cloze: '文脈穴埋め' }[m] || m; }

function answer(g) {
  const c = ses.q[ses.i];
  // 入力モードで未判定なら自動提案(正=Good, 誤=Again)を尊重しつつ押された値を採用
  if ((ses.mode === 'recall' || ses.mode === 'cloze') && ses.userOk !== null) {
    if (ses.userOk && g === 0) { /* 明示操作を優先 */ }
  }
  if (ses.mode === 'recog' && !ses.revealed) return;
  Store.mem.progress[c.id] = SRS.gradeCard(Store.mem.progress[c.id], g);
  Store.mem.reviews.push({ t: Date.now(), cardId: c.id, grade: g });
  const k = Store.todayKey();
  Store.mem.activity[k] = (Store.mem.activity[k] || 0) + 1;
  Store.save();
  ses.i++; ses.done++;
  renderCard(); renderHome(); renderStats();
}

/* ---------- 画面遷移 ---------- */
function showView(name) {
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
  $$('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
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
function renderList() {
  const kw = ($('#q').value || '').toLowerCase();
  const deckF = $('#deckFilter').value;
  const stF = $('#stFilter').value;
  const now = Date.now();
  const cards = visibleCards()
    .filter((c) => !kw || c.word.toLowerCase().includes(kw) || effMeaning(c).includes(kw) || (c.alt || []).join(' ').includes(kw))
    .filter((c) => !deckF || c.deckId === deckF)
    .filter((c) => {
      if (!stF) return true;
      const p = Store.mem.progress[c.id];
      if (stF === 'new') return !p;
      if (stF === 'due') return p && p.due <= now;
      if (stF === 'mature') return p && p.interval >= 21 && p.due > now;
      return true;
    })
    .slice(0, 300);
  $('#deckFilter').innerHTML = '<option value="">全教材</option>' + Object.values(Store.mem.decks).filter((d) => d.enabled)
    .map((d) => `<option value="${esc(d.id)}" ${d.id === deckF ? 'selected' : ''}>${esc(d.title)}</option>`).join('');
  $('#listCount').textContent = `${cards.length}件${visibleCards().length > 300 ? '(先頭300件)' : ''}`;
  $('#listBox').innerHTML = cards.map((c) => {
    const p = Store.mem.progress[c.id];
    const st = SRS.statusOf(p);
    const pill = { new: '未学習', due: '復習期', relearn: '再学習', young: '学習中', mature: '定着' }[st];
    return `<div class="card" data-id="${esc(c.id)}" style="cursor:pointer">
      <div class="row"><strong>${esc(c.word)}</strong><span class="pos">${esc(c.pos || '')}</span>
      <span class="pill">${pill}</span><span class="grow"></span><span class="muted small">#${esc(c.seq)}</span></div>
      <div class="muted">${esc(effMeaning(c))}</div></div>`;
  }).join('') || '<p class="muted">該当なし。CSVを取り込むか検索条件を変えてください。</p>';
  $$('#listBox .card').forEach((el) => (el.onclick = () => openDetail(el.dataset.id)));
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
      <div class="row" style="margin-top:6px"><button class="small ghost" data-say="${esc(sent)}">🔊 例文</button>
      <span class="muted small">${n ? `目標語は${n}語目` : ''}</span></div></div>`;
  }).join('');
  $('#detailBody').innerHTML = `
    <div class="row"><span class="pos">${esc(c.pos || '')}</span><span class="muted small">${esc(c.deckId)} #${esc(c.seq)}</span></div>
    <div class="word">${esc(c.word)}</div>
    <div class="row"><button class="small" id="sayW">🔊 発音</button>
      <span class="pill">${p ? `間隔${p.interval}日・次回${new Date(p.due).toLocaleDateString('ja-JP')}` : '未学習'}</span></div>
    <label class="f">訳</label><div class="meaning">${esc(effMeaning(c))}</div>
    ${c.alt?.length ? `<div class="muted small">ほか: ${esc(c.alt.join(' / '))}</div>` : ''}
    <div class="row" style="margin:8px 0">
      <button class="small" id="tglEx">表示切替: ${showBlank ? '穴埋め' : 'ハイライト'}</button>
      <span class="muted small">出題時は穴埋め・確認時はハイライトが基本です</span>
    </div>
    <div id="exs">${exHtml}</div>
    ${c.etym ? `<div class="card"><h2>由来・語源</h2><p class="small">${esc(c.etym)}</p></div>` : ''}
    ${c.note ? `<div class="card"><h2>備考</h2><p class="small">${esc(c.note)}</p></div>` : ''}
    <label class="f" for="memo">メモ(自分用・端末保存)</label>
    <textarea id="memo" placeholder="覚え方・注意点など">${esc(ov.memo || '')}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="small grow" id="saveMemo">メモ保存</button>
      <button class="small" id="exclude">${ov.excluded ? '除外を解除' : 'この単語を除外'}</button>
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
  $('#exclude').onclick = () => {
    Store.mem.overrides[id] = { ...(Store.mem.overrides[id] || {}), excluded: !ov.excluded };
    Store.save(); dlg.close(); renderList(); renderHome();
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
  const bars = [];
  let mx = 1;
  const vals = [];
  for (let back = 6; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    const v = Store.mem.activity[Store.todayKey(d)] || 0;
    vals.push({ v, today: back === 0, label: `${d.getMonth() + 1}/${d.getDate()}` });
    mx = Math.max(mx, v);
  }
  $('#weekBars').innerHTML = vals.map((x) =>
    `<div class="${x.today ? 'today' : ''}" style="height:${Math.round((x.v / mx) * 80) + 4}px" title="${x.v}語"><span>${x.label}</span></div>`).join('');
}

/* ---------- 設定・教材管理 ---------- */
function renderSettings() {
  const s = Store.mem.settings;
  $('#setGoal').value = s.dailyGoal; $('#setNew').value = s.newPerDay;
  $('#setMode').value = s.mode; $('#setEx').value = s.exDisplay;
  $('#setTime').value = s.remindTime || '';
  $('#setNotify').checked = !!s.notifyOn;
  const decks = Object.values(Store.mem.decks);
  $('#deckBox').innerHTML = decks.map((d) => `
    <div class="card"><div class="row"><strong>${esc(d.title)}</strong><span class="grow"></span>
      <span class="pill">${d.enabled ? '有効' : '無効'}</span></div>
    <div class="muted small">${esc(d.id)} ・ ${d.custom ? '取込教材' : esc(d.file || '')} ・ ${d.count ?? Object.values(Store.mem.cards).filter((c) => c.deckId === d.id).length}語</div>
    <div class="row" style="margin-top:8px">
      <button class="small" data-act="toggle" data-id="${esc(d.id)}">${d.enabled ? '無効化' : '有効化'}</button>
      <button class="small" data-act="export" data-id="${esc(d.id)}">書出</button>
      <button class="small" data-act="del" data-id="${esc(d.id)}">${d.custom ? '削除' : '非表示'}</button>
    </div></div>`).join('') || '<p class="muted">教材がありません。CSVを取り込んでください。</p>';
  $$('#deckBox button').forEach((b) => (b.onclick = () => deckAction(b.dataset.act, b.dataset.id)));
}

function deckAction(act, id) {
  const d = Store.mem.decks[id];
  if (!d) return;
  if (act === 'toggle') { d.enabled = !d.enabled; Store.save(); renderSettings(); renderHome(); }
  if (act === 'del') {
    if (d.custom) {
      Object.keys(Store.mem.cards).forEach((k) => { if (Store.mem.cards[k].deckId === id) delete Store.mem.cards[k]; });
      delete Store.mem.decks[id];
    } else d.enabled = false;
    Store.save(); renderSettings(); renderHome(); renderList(); toast('教材を無効化/削除しました');
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

/* ---------- 通知(習慣化リマインド) ---------- */
let notifyTimer = null;
function scheduleNotify() {
  clearTimeout(notifyTimer);
  const s = Store.mem.settings;
  if (!s.notifyOn || !s.remindTime || !('Notification' in window)) return;
  const [h, m] = s.remindTime.split(':').map(Number);
  const next = new Date(); next.setHours(h, m, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  notifyTimer = setTimeout(() => {
    try { new Notification('英単語ドリル', { body: `今日の${s.dailyGoal}語、2分だけやりませんか?` }); } catch { /* 権限なし */ }
    scheduleNotify();
  }, next - Date.now());
}

/* ---------- 起動 ---------- */
async function boot() {
  initInstall();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW登録失敗', e); }
  }
  await loadBundled();
  $$('nav.tabs button').forEach((b) => (b.onclick = () => { if (b.dataset.view === 'learn' && (!ses || ses.i >= ses.q.length)) { startSession(); return; } showView(b.dataset.view); }));
  $('#btnGoList').onclick = () => showView('list');
  $('#btnGoDecks').onclick = () => showView('settings');
  $('#q').addEventListener('input', renderList);
  $('#deckFilter').addEventListener('change', renderList);
  $('#stFilter').addEventListener('change', renderList);
  $('#saveSettings').onclick = async () => {
    Store.mem.settings.dailyGoal = Math.max(1, +$('#setGoal').value || 5);
    Store.mem.settings.newPerDay = Math.max(1, +$('#setNew').value || 5);
    Store.mem.settings.mode = $('#setMode').value;
    Store.mem.settings.exDisplay = $('#setEx').value;
    Store.mem.settings.remindTime = $('#setTime').value;
    Store.mem.settings.notifyOn = $('#setNotify').checked;
    if (Store.mem.settings.notifyOn && 'Notification' in window) {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { Store.mem.settings.notifyOn = false; toast('通知が許可されませんでした'); }
    }
    Store.save(); scheduleNotify(); renderHome(); toast('設定を保存しました');
  };
  $('#csvFile').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  $('#closeDetail').onclick = () => $('#detail').close();
  $('#resetAll').onclick = () => {
    if (!confirm('学習履歴・設定をすべて消去しますか?')) return;
    localStorage.removeItem(window.EtanStore.KEY);
    location.reload();
  };
  renderHome(); renderStats(); scheduleNotify();
  showView('home');
  if (!Object.keys(Store.mem.cards).length) {
    toast('CSVが未読込です。設定→教材管理から取り込んでください');
  }
}
document.addEventListener('DOMContentLoaded', boot);
