/* SRS(間隔反復): SM-2簡易版。fsrs.js等への差し替え可能な境界に分離。
   grade: 0 Again / 1 Hard / 2 Good / 3 Easy
   state: { ease, interval(日), reps, lapses, due(ms), lastGrade } */
'use strict';
const DAY = 86400000;
const MIN_EASE = 1.3, MAX_IVL = 180;

function defaultState(now) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, lastGrade: null };
}

function gradeCard(prev, grade, now = Date.now()) {
  const s = { ...(prev || defaultState(now)) };
  if (grade === 0) {
    s.lapses += 1;
    s.ease = Math.max(MIN_EASE, s.ease - 0.2);
    s.interval = 0; // 10分後に再出題
    s.due = now + 10 * 60 * 1000;
  } else {
    s.reps += 1;
    if (grade === 1) s.ease = Math.max(MIN_EASE, s.ease - 0.05);
    if (grade === 3) s.ease = s.ease + 0.15;
    let ivl;
    if (s.interval === 0) ivl = grade === 1 ? 1 : grade === 2 ? 1 : 4;
    else if (grade === 1) ivl = Math.max(1, s.interval * 1.2);
    else if (grade === 2) ivl = s.interval * s.ease;
    else ivl = s.interval * s.ease * 1.3;
    // 初回Goodの次を少し伸ばす(1→3日)など忘却曲線の拡張間隔
    if (s.reps === 1 && grade === 2) ivl = 3;
    if (s.reps === 1 && grade === 3) ivl = 7;
    s.interval = Math.min(MAX_IVL, Math.round(ivl * 10) / 10);
    s.due = now + s.interval * DAY;
  }
  s.lastGrade = grade;
  return s;
}

function statusOf(state, now = Date.now()) {
  if (!state) return 'new';
  if (state.due <= now) return state.reps === 0 && state.lapses > 0 ? 'relearn' : (state.reps === 0 ? 'new' : 'due');
  return state.interval >= 21 ? 'mature' : 'young';
}

window.EtanSRS = { gradeCard, defaultState, statusOf, DAY };
