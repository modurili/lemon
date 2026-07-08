/**
 * LocalStorage に保存する軽量データ（設定値のみ）
 * 学習データは一切ここに置かない（db.js / IndexedDB を使う）
 */

const KEYS = {
  GEMINI_API_KEY: "vocab.geminiApiKey",
  THEME: "vocab.theme",
  DAILY_NEW_LIMIT: "vocab.dailyNewLimit",
  SETTINGS: "vocab.settings",
  STUDY_MODE: "vocab.studyMode",
};

export const settings = {
  getApiKey() {
    return localStorage.getItem(KEYS.GEMINI_API_KEY) || "";
  },
  setApiKey(key) {
    localStorage.setItem(KEYS.GEMINI_API_KEY, key || "");
  },
  hasApiKey() {
    return !!this.getApiKey();
  },

  getTheme() {
    return localStorage.getItem(KEYS.THEME) || "auto";
  },
  setTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
  },

  getDailyNewLimit() {
    const v = localStorage.getItem(KEYS.DAILY_NEW_LIMIT);
    return v ? parseInt(v, 10) : 20;
  },
  setDailyNewLimit(n) {
    localStorage.setItem(KEYS.DAILY_NEW_LIMIT, String(n));
  },

  /** "flashcard"（タップで意味表示） | "choice4"（4択） */
  getStudyMode() {
    return localStorage.getItem(KEYS.STUDY_MODE) || "flashcard";
  },
  setStudyMode(mode) {
    localStorage.setItem(KEYS.STUDY_MODE, mode);
  },

  /** デバッグ用: このアプリが使うLocalStorageキーを全削除する */
  clearAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
