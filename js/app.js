import { db, getDueCards, getNewCards, logReview, incrementTodayStats, getTodayStats, getStreakDays, getMasteredCount, getStrugglingWords, clearAiCache, clearAllIndexedDbData } from "./db.js";
import { fsrs, Rating } from "./fsrs.js";
import { settings } from "./settings.js";
import { speak } from "./speech.js";
import { ai } from "./ai.js";
import { importDeckFromCsv } from "./import.js";
import { reminders, startReminderWatcher } from "./reminders.js";

const app = document.getElementById("app");

// ---------- 初期化 ----------

async function ensureSeedData() {
  const count = await db.count(db.STORES.WORDS);
  if (count > 0) return;

  const res = await fetch("./data/sample-deck.json");
  const { deck, words } = await res.json();

  await db.put(db.STORES.DECKS, deck);

  const now = new Date();
  for (const w of words) {
    await db.put(db.STORES.WORDS, { ...w, deckId: deck.id });
    const card = fsrs.createEmptyCard(now);
    await db.put(db.STORES.CARDS, { wordId: w.id, deckId: deck.id, ...card });
  }
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("Service Worker登録失敗", e);
    }
  }
}

// ---------- 状態 ----------

let session = null; // { queue: [{word, card}], index, results: {newLearned, reviewed, correct} }

// ---------- ホーム画面 ----------

async function renderHome() {
  const [dueCards, newCards, todayStats, streak, mastered] = await Promise.all([
    getDueCards(),
    getNewCards(settings.getDailyNewLimit()),
    getTodayStats(),
    getStreakDays(),
    getMasteredCount(),
  ]);

  const totalTodo = dueCards.length + newCards.length;

  app.innerHTML = `
    <div class="top-bar">
      <div class="brand">単語学習</div>
      <button class="icon-btn" id="settingsBtn" aria-label="設定">${iconGear()}</button>
    </div>

    <div class="stats-row">
      <div class="stat-cell"><div class="value accent">${totalTodo}</div><div class="label">今日残り</div></div>
      <div class="stat-cell"><div class="value">${todayStats.reviewed}</div><div class="label">今日の進捗</div></div>
      <div class="stat-cell"><div class="value">${mastered}</div><div class="label">習得単語</div></div>
      <div class="stat-cell"><div class="value">${streak}</div><div class="label">連続日数</div></div>
    </div>

    <div class="home-view">
      <div class="hero-block">
        <h1>${totalTodo > 0 ? `今日は ${totalTodo} 語、待っています。` : "今日の分は終わりました。"}</h1>
        <p>${totalTodo > 0 ? "開いたらすぐ始まります。テンポよく進めましょう。" : "また明日、新しい単語が待っています。"}</p>
      </div>
      <button class="start-btn" id="startBtn" ${totalTodo === 0 ? "disabled" : ""}>
        ${totalTodo > 0 ? "学習を始める" : "今日の分は完了"}
        <span class="sub">${totalTodo > 0 ? `復習 ${dueCards.length} ・ 新規 ${newCards.length}` : ""}</span>
      </button>
      ${totalTodo === 0 ? '<div class="empty-note">お疲れさまでした。</div>' : ""}
      ${settings.hasApiKey() ? '<button class="text-link-btn" id="weaknessBtn">苦手な単語を分析する</button>' : ""}
    </div>
  `;

  document.getElementById("settingsBtn").onclick = renderSettings;
  const startBtn = document.getElementById("startBtn");
  if (totalTodo > 0) {
    startBtn.onclick = () => startSession(dueCards, newCards);
  }
  const weaknessBtn = document.getElementById("weaknessBtn");
  if (weaknessBtn) weaknessBtn.onclick = renderWeaknessAnalysis;
}

// ---------- 苦手分析 ----------

async function renderWeaknessAnalysis() {
  app.innerHTML = `
    <div class="top-bar">
      <button class="icon-btn" id="closeBtn" aria-label="閉じる">${iconClose()}</button>
      <div class="brand">苦手分析</div>
      <div style="width:36px"></div>
    </div>
    <div class="settings-view">
      <div class="ai-result" id="weaknessResult">分析中…</div>
    </div>
  `;
  document.getElementById("closeBtn").onclick = renderHome;

  const struggling = await getStrugglingWords();
  const resultEl = document.getElementById("weaknessResult");

  if (struggling.length === 0) {
    resultEl.textContent = "まだ間違えた単語が十分にありません。学習を進めると、ここで苦手傾向を分析できます。";
    return;
  }

  try {
    const text = await ai.analyzeWeaknesses(struggling);
    resultEl.textContent = text;
  } catch (e) {
    resultEl.textContent = `分析に失敗しました: ${e.message}`;
  }
}

// ---------- 学習セッション ----------

async function startSession(dueCards, newCards) {
  const words = await db.getAll(db.STORES.WORDS);
  const wordMap = Object.fromEntries(words.map((w) => [w.id, w]));

  const queue = [...dueCards, ...newCards]
    .map((card) => ({ card, word: wordMap[card.wordId] }))
    .filter((item) => item.word);

  // シャッフル（新規と復習を混在させ、単調にならないようにする）
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  session = {
    queue,
    total: queue.length,
    index: 0,
    correct: 0,
    newLearned: 0,
    startedAt: Date.now(),
    cardShownAt: Date.now(),
  };

  renderStudy();
}

function renderStudy() {
  const item = session.queue[session.index];
  if (!item) {
    renderDone();
    return;
  }

  session.cardShownAt = Date.now();

  if (settings.getStudyMode() === "choice4") {
    renderChoice4();
  } else {
    renderFlashcard();
  }
}

function renderStudyShell(innerHtml) {
  const remaining = session.total - session.index;
  const progressPct = Math.round((session.index / session.total) * 100);

  app.innerHTML = `
    <div class="study-view">
      <div class="study-topbar">
        <button class="icon-btn" id="backBtn" aria-label="戻る">${iconClose()}</button>
        <div class="remaining-pill">残り ${remaining} 語</div>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
      ${innerHtml}
    </div>
  `;

  document.getElementById("backBtn").onclick = () => {
    if (confirm("学習を中断しますか？ここまでの進捗は保存されています。")) {
      session = null;
      renderHome();
    }
  };
}

function renderFlashcard() {
  const item = session.queue[session.index];
  const { word } = item;

  renderStudyShell(`
      <div class="flashcard" id="flashcard">
        <button class="speak-btn" id="speakBtn" aria-label="発音">${iconSpeaker()}</button>
        <div class="headword">${escapeHtml(word.headword)}</div>
        ${word.phonetic ? `<div class="phonetic">${escapeHtml(word.phonetic)}</div>` : ""}
        ${word.pos ? `<div class="pos-badge">${escapeHtml(word.pos)}</div>` : ""}
        <div class="answer-area" id="answerArea" style="display:none">
          <div class="divider"></div>
          <div class="meaning">${escapeHtml(word.meaning)}</div>
          ${
            word.example
              ? `<div class="example"><div class="en">${escapeHtml(word.example)}</div><div>${escapeHtml(word.exampleTranslation || "")}</div></div>`
              : ""
          }
        </div>
      </div>

      <div class="tap-hint" id="tapHint">タップして意味を表示</div>
      <div class="rating-row" id="ratingRow" style="display:none">
        <button class="rating-btn again" data-rating="1">もう一度<span class="interval" id="ivl-1"></span></button>
        <button class="rating-btn hard" data-rating="2">難しい<span class="interval" id="ivl-2"></span></button>
        <button class="rating-btn good" data-rating="3">普通<span class="interval" id="ivl-3"></span></button>
        <button class="rating-btn easy" data-rating="4">簡単<span class="interval" id="ivl-4"></span></button>
      </div>

      ${renderAiPanelHtml()}
  `);

  document.getElementById("speakBtn").onclick = (e) => {
    e.stopPropagation();
    speak(word.headword);
  };

  const flashcard = document.getElementById("flashcard");
  flashcard.addEventListener("click", revealAnswer, { once: true });
}

function renderAiPanelHtml() {
  return `
      <div class="ai-panel" id="aiPanel" style="display:none">
        <div class="ai-btn-row">
          <button class="ai-chip" data-ai="example" ${settings.hasApiKey() ? "" : "disabled"}><span class="press-ring"></span><span class="chip-label">例文</span></button>
          <button class="ai-chip" data-ai="etymology" ${settings.hasApiKey() ? "" : "disabled"}><span class="press-ring"></span><span class="chip-label">語源</span></button>
          <button class="ai-chip" data-ai="synonyms" ${settings.hasApiKey() ? "" : "disabled"}><span class="press-ring"></span><span class="chip-label">類義語</span></button>
        </div>
        ${settings.hasApiKey() ? '<div class="ai-hint-note">長押しで再生成できます</div>' : '<div class="ai-hint-note">設定画面でAPIキーを登録すると使えます</div>'}
        <div class="ai-result" id="aiResult" style="display:none"></div>
      </div>
  `;
}

function revealAnswer() {
  document.getElementById("answerArea").style.display = "block";
  document.getElementById("tapHint").style.display = "none";
  const ratingRow = document.getElementById("ratingRow");
  ratingRow.style.display = "grid";
  document.getElementById("aiPanel").style.display = "block";

  // 各評価を選んだ場合の次回間隔をプレビュー表示する
  const item = session.queue[session.index];
  for (const r of [1, 2, 3, 4]) {
    const { card } = fsrs.repeat(item.card, r, new Date());
    document.getElementById(`ivl-${r}`).textContent = formatInterval(card.scheduledDays);
  }

  ratingRow.querySelectorAll(".rating-btn").forEach((btn) => {
    btn.onclick = () => submitRating(Number(btn.dataset.rating));
  });

  bindAiChips(item.word);
}

/** AIチップに「タップ=通常生成／長押し=強制再生成」を割り当てる */
function bindAiChips(word) {
  const LONG_PRESS_MS = 550;

  document.querySelectorAll(".ai-chip").forEach((btn) => {
    let pressTimer = null;
    let didLongPress = false;

    const start = () => {
      if (btn.disabled) return;
      didLongPress = false;
      btn.classList.add("pressing");
      pressTimer = setTimeout(() => {
        didLongPress = true;
        btn.classList.remove("pressing");
        runAiAction(btn.dataset.ai, word, true);
      }, LONG_PRESS_MS);
    };
    const cancel = () => {
      clearTimeout(pressTimer);
      btn.classList.remove("pressing");
    };
    const end = () => {
      clearTimeout(pressTimer);
      btn.classList.remove("pressing");
      if (!didLongPress) {
        runAiAction(btn.dataset.ai, word, false);
      }
    };

    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("pointercancel", cancel);
  });
}

async function runAiAction(kind, word, forceRefresh) {
  const resultEl = document.getElementById("aiResult");
  const chips = document.querySelectorAll(".ai-chip");
  const activeChip = Array.from(chips).find((c) => c.dataset.ai === kind);

  chips.forEach((c) => (c.disabled = true));
  if (activeChip) activeChip.classList.add("loading");

  resultEl.style.display = "flex";
  resultEl.className = "ai-result loading-text";
  resultEl.innerHTML = `生成中 <span class="dot-flash"><span></span><span></span><span></span></span>`;

  try {
    let text;
    if (kind === "example") text = await ai.generateExample(word, forceRefresh);
    else if (kind === "etymology") text = await ai.explainEtymology(word, forceRefresh);
    else if (kind === "synonyms") text = await ai.generateSynonyms(word, forceRefresh);
    resultEl.className = "ai-result";
    resultEl.textContent = text;
  } catch (e) {
    resultEl.className = "ai-result";
    resultEl.textContent = `AI機能でエラーが発生しました: ${e.message}`;
  } finally {
    chips.forEach((c) => (c.disabled = !settings.hasApiKey()));
    if (activeChip) activeChip.classList.remove("loading");
  }
}

function formatInterval(days) {
  if (days < 1) return "10分後";
  if (days === 1) return "1日後";
  if (days < 30) return `${days}日後`;
  if (days < 365) return `${Math.round(days / 30)}ヶ月後`;
  return `${(days / 365).toFixed(1)}年後`;
}

async function submitRating(rating) {
  const item = session.queue[session.index];
  const wasNew = item.card.state === 0;
  const responseTimeMs = Date.now() - session.cardShownAt;

  const { card, log } = fsrs.repeat(item.card, rating, new Date());
  await db.put(db.STORES.CARDS, { ...item.card, ...card, wordId: item.card.wordId, deckId: item.card.deckId });
  await logReview(item.card.wordId, log.rating, log.elapsedDays, log.scheduledDays, responseTimeMs);

  const correct = rating >= Rating.GOOD;
  await incrementTodayStats({ isNew: wasNew, correct });

  if (correct) session.correct += 1;
  if (wasNew) session.newLearned += 1;

  // Again評価は今回のキューの少し後ろに再度差し込む（今日中にもう一度出す）
  if (rating === Rating.AGAIN) {
    const reinsertAt = Math.min(session.queue.length, session.index + 3);
    session.queue.splice(reinsertAt, 0, { ...item, card: { ...item.card, ...card } });
  }

  session.index += 1;
  renderStudy();
}

// ---------- 4択モード ----------

async function renderChoice4() {
  const item = session.queue[session.index];
  const { word } = item;

  const allWords = await db.getAll(db.STORES.WORDS);
  const distractors = shuffle(allWords.filter((w) => w.id !== word.id && w.meaning))
    .slice(0, 3)
    .map((w) => w.meaning);

  // 単語帳が小さくダミー選択肢が3つ集まらない場合は、それでも出題を続ける
  const options = shuffle([word.meaning, ...distractors]);

  renderStudyShell(`
      <div class="flashcard" id="flashcard" style="min-height:200px">
        <button class="speak-btn" id="speakBtn" aria-label="発音">${iconSpeaker()}</button>
        <div class="headword">${escapeHtml(word.headword)}</div>
        ${word.phonetic ? `<div class="phonetic">${escapeHtml(word.phonetic)}</div>` : ""}
        ${word.pos ? `<div class="pos-badge">${escapeHtml(word.pos)}</div>` : ""}
      </div>

      <div class="choice-list" id="choiceList">
        ${options
          .map((opt, i) => `<button class="choice-btn" data-value="${escapeHtml(opt)}" data-idx="${i}">${escapeHtml(opt)}</button>`)
          .join("")}
      </div>

      <div id="choiceAiWrap"></div>
  `);

  document.getElementById("speakBtn").onclick = (e) => {
    e.stopPropagation();
    speak(word.headword);
  };

  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.onclick = () => handleChoiceAnswer(btn, word, options);
  });
}

function handleChoiceAnswer(selectedBtn, word, options) {
  const buttons = document.querySelectorAll(".choice-btn");
  const isCorrect = selectedBtn.dataset.value === word.meaning;

  buttons.forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.value === word.meaning) {
      btn.classList.add("correct");
    } else if (btn === selectedBtn) {
      btn.classList.add("incorrect");
    }
  });

  // 4択の正誤をFSRS評価にマッピングする（正解=Good、不正解=Again）
  const rating = isCorrect ? Rating.GOOD : Rating.AGAIN;

  const wrap = document.getElementById("choiceAiWrap");
  wrap.innerHTML = `
    ${
      word.example
        ? `<div class="example" style="margin-top:16px;text-align:center"><div class="en">${escapeHtml(word.example)}</div><div>${escapeHtml(word.exampleTranslation || "")}</div></div>`
        : ""
    }
    <button class="choice-continue-btn" id="choiceContinueBtn">次へ</button>
    ${renderAiPanelHtml()}
  `;
  document.getElementById("aiPanel").style.display = "block";
  bindAiChips(word);

  document.getElementById("choiceContinueBtn").onclick = () => submitRating(rating);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 完了画面 ----------

async function renderDone() {
  const accuracy = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;
  const elapsedMin = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));

  app.innerHTML = `
    <div class="done-view">
      <div class="big-number">${session.total}</div>
      <h2>今日の学習が終わりました</h2>
      <p>気づいたら終わっていましたか？</p>
      <div class="done-stats">
        <div class="item"><div class="n">${session.newLearned}</div><div class="l">新規</div></div>
        <div class="item"><div class="n">${accuracy}%</div><div class="l">正答率</div></div>
        <div class="item"><div class="n">${elapsedMin}分</div><div class="l">学習時間</div></div>
      </div>
      <button class="secondary-btn" id="homeBtn">ホームに戻る</button>
    </div>
  `;

  document.getElementById("homeBtn").onclick = () => {
    session = null;
    renderHome();
  };
}

// ---------- 設定画面 ----------

function renderSettings() {
  const mode = settings.getStudyMode();

  app.innerHTML = `
    <div class="top-bar">
      <button class="icon-btn" id="closeBtn" aria-label="閉じる">${iconClose()}</button>
      <div class="brand">設定</div>
      <div style="width:36px"></div>
    </div>
    <div class="settings-view">
      <div class="field-group">
        <label>Gemini APIキー</label>
        <input type="password" id="apiKeyInput" placeholder="AIzaSy..." value="${escapeHtml(settings.getApiKey())}" />
        <div class="hint">例文生成・語源説明などのAI補助機能に使用します。未設定でも通常の学習機能はすべて利用できます。キーは端末内にのみ保存されます。</div>
      </div>
      <div class="field-group">
        <label>1日の新規単語数</label>
        <input type="number" id="dailyLimitInput" min="1" max="200" value="${settings.getDailyNewLimit()}" />
        <div class="hint">1日に新しく学習する単語の上限です。</div>
      </div>
      <div class="field-group">
        <label>出題形式</label>
        <div class="mode-select-row">
          <button type="button" class="mode-option ${mode === "flashcard" ? "active" : ""}" data-mode="flashcard">フラッシュカード</button>
          <button type="button" class="mode-option ${mode === "choice4" ? "active" : ""}" data-mode="choice4">4択</button>
        </div>
        <div class="hint">次に学習を始めたときから反映されます。</div>
      </div>
      <button class="save-btn" id="saveBtn">保存する</button>

      <div class="settings-section-title">学習リマインダー</div>
      <div id="reminderSection"></div>

      <div class="settings-section-title">単語帳</div>
      <button class="secondary-btn" id="importBtn" style="width:100%;margin-bottom:10px">CSVから単語帳をインポート</button>

      <div class="settings-section-title">デバッグ</div>
      <button class="danger-btn" id="clearAiCacheBtn">AI生成キャッシュをクリア</button>
      <button class="danger-btn" id="clearAllBtn">全学習データを削除（IndexedDB + 設定）</button>
    </div>
    <div class="toast" id="toast"></div>
  `;

  renderReminderSection();

  let selectedMode = mode;

  document.getElementById("closeBtn").onclick = renderHome;
  document.querySelectorAll(".mode-option").forEach((btn) => {
    btn.onclick = () => {
      selectedMode = btn.dataset.mode;
      document.querySelectorAll(".mode-option").forEach((b) => b.classList.toggle("active", b === btn));
    };
  });

  document.getElementById("saveBtn").onclick = () => {
    settings.setApiKey(document.getElementById("apiKeyInput").value.trim());
    settings.setDailyNewLimit(parseInt(document.getElementById("dailyLimitInput").value, 10) || 20);
    settings.setStudyMode(selectedMode);
    showToast("保存しました");
  };

  document.getElementById("importBtn").onclick = renderImport;

  document.getElementById("clearAiCacheBtn").onclick = async () => {
    if (!confirm("AI生成キャッシュ（例文・語源・類義語の生成結果）をすべて削除します。よろしいですか？")) return;
    await clearAiCache();
    showToast("AIキャッシュを削除しました");
  };

  document.getElementById("clearAllBtn").onclick = async () => {
    if (!confirm("単語・学習履歴・統計などすべてのデータを削除します。この操作は取り消せません。よろしいですか？")) return;
    await clearAllIndexedDbData();
    settings.clearAll();
    showToast("全データを削除しました");
    setTimeout(() => location.reload(), 800);
  };
}

// ---------- リマインダー ----------

function renderReminderSection() {
  const section = document.getElementById("reminderSection");
  if (!section) return;

  if (!reminders.isSupported()) {
    section.innerHTML = `<div class="hint">このブラウザは通知に対応していません。</div>`;
    return;
  }

  const permission = reminders.getPermission();
  const list = reminders.list();

  section.innerHTML = `
    ${
      permission !== "granted"
        ? `<button class="secondary-btn" id="requestPermBtn" style="width:100%;margin-bottom:14px">通知を許可する</button>
           <div class="hint" style="margin-bottom:14px">リマインダーには通知の許可が必要です。</div>`
        : ""
    }
    <div class="reminder-list" id="reminderList">
      ${
        list.length === 0
          ? `<div class="hint" style="margin-bottom:12px">まだリマインダーが設定されていません。</div>`
          : list
              .map(
                (r) => `
        <div class="reminder-row" data-id="${r.id}">
          <button class="reminder-toggle ${r.enabled ? "on" : ""}" data-id="${r.id}" aria-label="有効・無効"></button>
          <span class="reminder-time">${reminders.formatTime(r.hour, r.minute)}</span>
          <button class="reminder-delete" data-id="${r.id}" aria-label="削除">${iconClose()}</button>
        </div>`
              )
              .join("")
      }
    </div>
    <div class="reminder-add-row">
      <input type="time" id="reminderTimeInput" value="20:00" />
      <button class="reminder-add-btn" id="reminderAddBtn">追加</button>
    </div>
    <div class="hint">アプリを開いている間、設定時刻になると通知します。ブラウザの制約上、完全に閉じている間は通知が届かない場合があります。</div>
  `;

  const requestBtn = document.getElementById("requestPermBtn");
  if (requestBtn) {
    requestBtn.onclick = async () => {
      const result = await reminders.requestPermission();
      if (result === "granted") {
        showToast("通知を許可しました");
        startReminderWatcher();
      } else {
        showToast("通知が許可されませんでした");
      }
      renderReminderSection();
    };
  }

  section.querySelectorAll(".reminder-toggle").forEach((btn) => {
    btn.onclick = () => {
      const enabled = !btn.classList.contains("on");
      reminders.toggle(btn.dataset.id, enabled);
      renderReminderSection();
    };
  });

  section.querySelectorAll(".reminder-delete").forEach((btn) => {
    btn.onclick = () => {
      reminders.remove(btn.dataset.id);
      renderReminderSection();
    };
  });

  document.getElementById("reminderAddBtn").onclick = () => {
    const val = document.getElementById("reminderTimeInput").value;
    if (!val) return;
    const [h, m] = val.split(":").map(Number);
    reminders.add(h, m);
    renderReminderSection();
  };
}

// ---------- インポート画面 ----------

function renderImport() {
  app.innerHTML = `
    <div class="top-bar">
      <button class="icon-btn" id="closeBtn" aria-label="閉じる">${iconClose()}</button>
      <div class="brand">単語帳インポート</div>
      <div style="width:36px"></div>
    </div>
    <div class="settings-view">
      <div class="import-drop">
        CSVファイルを選択してください<br />
        必須列: headword, meaning（例文・発音記号などは任意）
        <input type="file" id="csvInput" accept=".csv,text/csv" />
      </div>
      <div class="field-group">
        <label>単語帳の名前（任意）</label>
        <input type="text" id="deckNameInput" placeholder="例: 高校英単語 応用編" />
      </div>
      <div class="import-result" id="importResult" style="display:none"></div>
    </div>
  `;

  document.getElementById("closeBtn").onclick = renderSettings;
  document.getElementById("csvInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const resultEl = document.getElementById("importResult");
    resultEl.style.display = "block";
    resultEl.textContent = "インポート中…";

    try {
      const text = await file.text();
      const deckName = document.getElementById("deckNameInput").value.trim();
      const { imported, skipped, errors } = await importDeckFromCsv(text, deckName);
      resultEl.textContent =
        `${imported}件の単語をインポートしました。` +
        (skipped > 0 ? `\n${skipped}件はスキップしました。` : "") +
        (errors.length > 0 ? `\n\n詳細:\n${errors.slice(0, 5).join("\n")}` : "");
    } catch (err) {
      resultEl.textContent = `インポートに失敗しました: ${err.message}`;
    }
  };
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---------- アイコン（インラインSVG、外部依存なし） ----------

function iconGear() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
}
function iconClose() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}
function iconSpeaker() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- 起動 ----------

(async function init() {
  await ensureSeedData();
  await registerServiceWorker();
  if (reminders.isSupported() && reminders.getPermission() === "granted") {
    startReminderWatcher();
  }
  await renderHome();
})();
