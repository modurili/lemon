/**
 * IndexedDB データ層
 * すべての学習データ（単語・履歴・スケジュール・AIキャッシュ・統計）を保存する。
 * LocalStorageはAPIキーや設定などの軽量データのみに使用する（settings.js参照）。
 */

const DB_NAME = "vocab-pwa-db";
const DB_VERSION = 1;

const STORES = {
  WORDS: "words", // 単語データ（英単語・訳・例文・語源など）
  CARDS: "cards", // FSRSの学習状態（wordIdごと）
  REVIEW_LOGS: "reviewLogs", // 復習ログ（正答率・解答時間の分析用）
  AI_CACHE: "aiCache", // AI生成結果のキャッシュ
  STATS: "stats", // 日次統計（連続学習日数など）
  DECKS: "decks", // 単語帳（ワードリスト）のメタ情報
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.WORDS)) {
        const store = db.createObjectStore(STORES.WORDS, { keyPath: "id" });
        store.createIndex("deckId", "deckId", { unique: false });
        store.createIndex("headword", "headword", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CARDS)) {
        const store = db.createObjectStore(STORES.CARDS, { keyPath: "wordId" });
        store.createIndex("due", "due", { unique: false });
        store.createIndex("state", "state", { unique: false });
        store.createIndex("deckId", "deckId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.REVIEW_LOGS)) {
        const store = db.createObjectStore(STORES.REVIEW_LOGS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("wordId", "wordId", { unique: false });
        store.createIndex("reviewedAt", "reviewedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.AI_CACHE)) {
        db.createObjectStore(STORES.AI_CACHE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(STORES.STATS)) {
        db.createObjectStore(STORES.STATS, { keyPath: "date" }); // "YYYY-MM-DD"
      }

      if (!db.objectStoreNames.contains(STORES.DECKS)) {
        db.createObjectStore(STORES.DECKS, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  STORES,

  async put(storeName, value) {
    const store = await tx(storeName, "readwrite");
    return promisifyRequest(store.put(value));
  },

  async putMany(storeName, values) {
    const store = await tx(storeName, "readwrite");
    await Promise.all(values.map((v) => promisifyRequest(store.put(v))));
  },

  async get(storeName, key) {
    const store = await tx(storeName, "readonly");
    return promisifyRequest(store.get(key));
  },

  async getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return promisifyRequest(store.getAll());
  },

  async getAllByIndex(storeName, indexName, query) {
    const store = await tx(storeName, "readonly");
    const index = store.index(indexName);
    return promisifyRequest(index.getAll(query));
  },

  async delete(storeName, key) {
    const store = await tx(storeName, "readwrite");
    return promisifyRequest(store.delete(key));
  },

  async clear(storeName) {
    const store = await tx(storeName, "readwrite");
    return promisifyRequest(store.clear());
  },

  async count(storeName) {
    const store = await tx(storeName, "readonly");
    return promisifyRequest(store.count());
  },
};

// ---- ドメイン固有のヘルパー ----

/** 今日以前が期限の復習待ちカードを取得する */
export async function getDueCards(now = new Date()) {
  const all = await db.getAll(STORES.CARDS);
  return all.filter((c) => new Date(c.due) <= now);
}

/** 新規（未学習）の単語カードを取得する */
export async function getNewCards(limit = 20) {
  const all = await db.getAll(STORES.CARDS);
  return all.filter((c) => c.state === 0).slice(0, limit);
}

/** 復習ログを記録する */
export async function logReview(wordId, rating, elapsedDays, scheduledDays, responseTimeMs) {
  return db.put(STORES.REVIEW_LOGS, {
    wordId,
    rating,
    elapsedDays,
    scheduledDays,
    responseTimeMs,
    reviewedAt: new Date().toISOString(),
  });
}

/** 今日の統計を取得・更新する */
export async function getTodayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.get(STORES.STATS, today);
  return (
    existing || {
      date: today,
      newLearned: 0,
      reviewed: 0,
      correctCount: 0,
      totalCount: 0,
    }
  );
}

export async function incrementTodayStats({ isNew, correct }) {
  const stats = await getTodayStats();
  if (isNew) stats.newLearned += 1;
  stats.reviewed += 1;
  stats.totalCount += 1;
  if (correct) stats.correctCount += 1;
  await db.put(STORES.STATS, stats);
  return stats;
}

/** 連続学習日数を計算する */
export async function getStreakDays() {
  const allStats = await db.getAll(STORES.STATS);
  const datesWithActivity = new Set(
    allStats.filter((s) => s.reviewed > 0).map((s) => s.date)
  );
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (datesWithActivity.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/** 習得単語数（stateがREVIEWかつ安定度が一定以上）を数える */
export async function getMasteredCount(stabilityThreshold = 21) {
  const cards = await db.getAll(STORES.CARDS);
  return cards.filter((c) => c.state === 2 && c.stability >= stabilityThreshold).length;
}

/** 間違えやすい単語（lapsesが多い順）を取得する。AIの苦手分析に使う。 */
export async function getStrugglingWords(limit = 8) {
  const [cards, words] = await Promise.all([db.getAll(STORES.CARDS), db.getAll(STORES.WORDS)]);
  const wordMap = Object.fromEntries(words.map((w) => [w.id, w]));
  return cards
    .filter((c) => c.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit)
    .map((c) => wordMap[c.wordId])
    .filter(Boolean);
}

// ---- デバッグ用ユーティリティ ----

/** AI生成キャッシュのみを全削除する */
export async function clearAiCache() {
  await db.clear(STORES.AI_CACHE);
}

/** IndexedDB内の全データ（単語・学習履歴・統計等）を削除する */
export async function clearAllIndexedDbData() {
  for (const store of Object.values(STORES)) {
    await db.clear(store);
  }
}
