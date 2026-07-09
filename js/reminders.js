/**
 * 学習リマインダー通知
 *
 * ブラウザのPWA通知制約を踏まえた設計:
 * - Notification許可はユーザー操作起点でのみ要求する
 * - 複数の時刻を設定でき、各時刻ごとにON/OFFできる
 * - Service Workerがアイドル状態でも動くよう、定期的な起床チェック（setInterval）と
 *   ページ再訪時チェックの両方で「今日すでに送った時刻」を管理し、重複通知を防ぐ
 * - 完全なバックグラウンド常駐はブラウザ制約上保証できないため、
 *   「アプリを開いている間 or 定期同期が効く環境」でのベストエフォート通知とする
 */

const KEY_REMINDERS = "vocab.reminders"; // [{id, hour, minute, enabled, label}]
const KEY_LAST_FIRED = "vocab.reminders.lastFired"; // {"reminderId": "YYYY-MM-DD"}

function loadReminders() {
  try {
    const raw = localStorage.getItem(KEY_REMINDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReminders(list) {
  localStorage.setItem(KEY_REMINDERS, JSON.stringify(list));
}

function loadLastFired() {
  try {
    const raw = localStorage.getItem(KEY_LAST_FIRED);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLastFired(map) {
  localStorage.setItem(KEY_LAST_FIRED, JSON.stringify(map));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export const reminders = {
  isSupported() {
    return "Notification" in window;
  },

  getPermission() {
    return this.isSupported() ? Notification.permission : "unsupported";
  },

  /** ユーザー操作（ボタン押下）の中から呼び出すこと */
  async requestPermission() {
    if (!this.isSupported()) return "unsupported";
    return Notification.requestPermission();
  },

  list() {
    return loadReminders().sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  },

  add(hour, minute, label = "今日の単語、まだ待ってます") {
    const list = loadReminders();
    const item = { id: `rem-${Date.now()}`, hour, minute, enabled: true, label };
    list.push(item);
    saveReminders(list);
    return item;
  },

  remove(id) {
    saveReminders(loadReminders().filter((r) => r.id !== id));
  },

  toggle(id, enabled) {
    const list = loadReminders();
    const item = list.find((r) => r.id === id);
    if (item) item.enabled = enabled;
    saveReminders(list);
  },

  formatTime(hour, minute) {
    return `${pad2(hour)}:${pad2(minute)}`;
  },
};

/**
 * 現在時刻が各リマインダー時刻を過ぎていて、今日まだ送っていなければ通知を出す。
 * ページが開かれている間、一定間隔でこれを呼ぶことでベストエフォートの通知を実現する。
 */
function checkAndFireDueReminders() {
  if (Notification.permission !== "granted") return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const list = loadReminders();
  const lastFired = loadLastFired();
  let changed = false;

  for (const r of list) {
    if (!r.enabled) continue;
    const remMinutes = r.hour * 60 + r.minute;
    // 通知時刻を過ぎていて、5分以内の遅延なら発火対象とする（アプリを開いた時にまとめて過去分を送らないため）
    const withinFireWindow = nowMinutes >= remMinutes && nowMinutes - remMinutes <= 5;
    if (withinFireWindow && lastFired[r.id] !== today) {
      fireNotification(r);
      lastFired[r.id] = today;
      changed = true;
    }
  }

  if (changed) saveLastFired(lastFired);
}

function fireNotification(reminder) {
  const title = "単語学習の時間です";
  const options = {
    body: reminder.label || "今日の単語、まだ待ってます",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: `vocab-reminder-${reminder.id}`,
  };

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(() => {
      new Notification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}

let watcherStarted = false;

/** アプリ起動時に一度だけ呼ぶ。開いている間、1分おきにリマインダー時刻をチェックする。 */
export function startReminderWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  checkAndFireDueReminders();
  setInterval(checkAndFireDueReminders, 60 * 1000);
}
