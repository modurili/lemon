/**
 * FSRS (Free Spaced Repetition Scheduler) v4 実装
 * Anki等で採用されている科学的根拠のある復習アルゴリズム
 * 参考: https://github.com/open-spaced-repetition/fsrs4anki
 *
 * 独自アルゴリズムは作らず、公開されているFSRSのデフォルトパラメータ・計算式に準拠する。
 */

// FSRS v4 デフォルトウェイト（17パラメータ）
const DEFAULT_WEIGHTS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234,
  1.616, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466,
];

const DECAY = -0.5;
const FACTOR = 0.9 ** (1 / DECAY) - 1;

/**
 * 評価（Rating）
 * 1: Again（忘れた）
 * 2: Hard（難しかった）
 * 3: Good（普通に思い出せた）
 * 4: Easy（簡単だった）
 */
export const Rating = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

/**
 * カードの学習状態
 * 0: New（未学習）
 * 1: Learning（学習中）
 * 2: Review（復習中）
 * 3: Relearning（再学習中）
 */
export const State = { NEW: 0, LEARNING: 1, REVIEW: 2, RELEARNING: 3 };

export class FSRS {
  constructor(weights = DEFAULT_WEIGHTS, requestRetention = 0.9, maximumInterval = 36500) {
    this.w = weights;
    this.requestRetention = requestRetention;
    this.maximumInterval = maximumInterval;
  }

  /**
   * 新規カードの初期状態を作成する
   */
  createEmptyCard(now = new Date()) {
    return {
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: State.NEW,
      lastReview: null,
    };
  }

  /**
   * カードを採点し、次回復習日などを更新した新しいカード状態を返す
   * @param {object} card 現在のカード状態
   * @param {number} rating Rating.AGAIN〜EASY
   * @param {Date} now 採点した日時
   * @returns {{card: object, log: object}}
   */
  repeat(card, rating, now = new Date()) {
    const c = { ...card };
    const last = c.lastReview ? new Date(c.lastReview) : null;
    const elapsedDays = last ? Math.max(0, (now - last) / 86400000) : 0;
    c.elapsedDays = elapsedDays;

    if (c.state === State.NEW) {
      c.difficulty = this._initDifficulty(rating);
      c.stability = this._initStability(rating);
    } else {
      c.difficulty = this._nextDifficulty(c.difficulty, rating);
      c.stability = this._nextStability(c.difficulty, c.stability, elapsedDays, rating);
    }

    let interval;
    if (rating === Rating.AGAIN) {
      c.lapses += 1;
      c.state = c.state === State.NEW ? State.LEARNING : State.RELEARNING;
      interval = this._shortTermInterval(rating);
    } else if (c.state === State.NEW || c.state === State.LEARNING || c.state === State.RELEARNING) {
      if (rating === Rating.GOOD || rating === Rating.EASY) {
        c.state = State.REVIEW;
        interval = this._nextInterval(c.stability);
      } else {
        interval = this._shortTermInterval(rating);
      }
    } else {
      c.state = State.REVIEW;
      interval = this._nextInterval(c.stability);
    }

    interval = Math.min(Math.max(1, Math.round(interval)), this.maximumInterval);
    c.scheduledDays = interval;
    c.reps += 1;
    c.lastReview = now.toISOString();
    c.due = new Date(now.getTime() + interval * 86400000).toISOString();

    return {
      card: c,
      log: { rating, elapsedDays, scheduledDays: interval, reviewedAt: now.toISOString() },
    };
  }

  /** 現在の保持率（記憶強度）を0-1で返す */
  getRetrievability(card, now = new Date()) {
    if (card.state === State.NEW || !card.lastReview) return null;
    const elapsed = Math.max(0, (now - new Date(card.lastReview)) / 86400000);
    return (1 + (FACTOR * elapsed) / card.stability) ** DECAY;
  }

  _initStability(rating) {
    return Math.max(this.w[rating - 1], 0.1);
  }

  _initDifficulty(rating) {
    const d = this.w[4] - Math.exp(this.w[5] * (rating - 1)) + 1;
    return this._clampDifficulty(d);
  }

  _clampDifficulty(d) {
    return Math.min(Math.max(d, 1), 10);
  }

  _nextDifficulty(d, rating) {
    const deltaD = -this.w[6] * (rating - 3);
    const dp = d + (deltaD * (10 - d)) / 9;
    const meanReversion = this.w[7] * this._initDifficulty(Rating.EASY) + (1 - this.w[7]) * dp;
    return this._clampDifficulty(meanReversion);
  }

  _nextStability(difficulty, stability, elapsedDays, rating) {
    if (rating === Rating.AGAIN) {
      return this._nextForgetStability(difficulty, stability, this.getRetrievabilityRaw(stability, elapsedDays));
    }
    return this._nextRecallStability(difficulty, stability, this.getRetrievabilityRaw(stability, elapsedDays), rating);
  }

  getRetrievabilityRaw(stability, elapsedDays) {
    if (stability <= 0) return 1;
    return (1 + (FACTOR * elapsedDays) / stability) ** DECAY;
  }

  _nextRecallStability(d, s, r, rating) {
    const hardPenalty = rating === Rating.HARD ? this.w[15] : 1;
    const easyBonus = rating === Rating.EASY ? this.w[16] : 1;
    return (
      s *
      (1 +
        Math.exp(this.w[8]) *
          (11 - d) *
          Math.pow(s, -this.w[9]) *
          (Math.exp((1 - r) * this.w[10]) - 1) *
          hardPenalty *
          easyBonus)
    );
  }

  _nextForgetStability(d, s, r) {
    return (
      this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp((1 - r) * this.w[14])
    );
  }

  _nextInterval(stability) {
    return (stability / FACTOR) * (this.requestRetention ** (1 / DECAY) - 1);
  }

  _shortTermInterval(rating) {
    // Learning/Relearning中の短期間隔（分単位ではなく簡略化して日単位以下は「今日中」として扱う）
    if (rating === Rating.AGAIN) return 1 / 1440 * 10; // 約10分後 → 今日の残り学習に再登場させる想定
    if (rating === Rating.HARD) return 1 / 24 * 6; // 約6時間後
    return 1;
  }
}

export const fsrs = new FSRS();
