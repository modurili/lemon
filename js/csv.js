/* CSVパーサ: BOM・クォート・改行セル対応。ヘッダ名(日本語) or 列位置でマッピング */
'use strict';
const HEAD_KEYS = [
  ['seq', ['連番']],
  ['pos', ['何詞', '品詞']],
  ['word', ['英単語']],
  ['meaning', ['訳']],
  ['alt', ['その他の訳']],
  ['ex1', ['例文1']],
  ['ex1ja', ['例文1の訳']],
  ['ex1n', ['例文1の何語目']],
  ['ex2', ['例文2']],
  ['ex2ja', ['例文2の訳']],
  ['ex2n', ['例文2の何語目']],
  ['etym', ['由来', '語源']],
  ['note', ['備考', '類義語', '対義語']],
];

function stripBOM(s) { return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }

// RFC4180簡易パーサ
function parseCSV(text) {
  text = stripBOM(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  row.push(cur); rows.push(row);
  // 末尾の空行除去
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

function mapHeader(header) {
  const idx = {};
  HEAD_KEYS.forEach(([key, words], pos) => {
    let found = header.findIndex((h) => words.some((w) => (h || '').includes(w)));
    idx[key] = found === -1 ? pos : found; // 見つからなければ位置フォールバック
  });
  return idx;
}

function toInt(v) { const n = parseInt(String(v || '').trim(), 10); return Number.isFinite(n) ? n : null; }

// deckId: 教材ID。errors: 検証メッセージ配列
function rowsToCards(rows, deckId) {
  const errors = [];
  if (!rows.length) return { cards: [], errors: ['CSVが空です'] };
  const header = rows[0].map((h) => (h || '').trim());
  const hasHeader = header.some((h) => h.includes('英単語') || h.includes('訳') || h.includes('連番'));
  const idx = mapHeader(header);
  const body = hasHeader ? rows.slice(1) : rows;
  if (!hasHeader) errors.push('ヘッダ行が見つからないため列位置で読み替えました(13列想定)');
  const cards = [];
  body.forEach((r, i) => {
    const line = (hasHeader ? i + 2 : i + 1);
    const word = (r[idx.word] || '').trim();
    const meaning = (r[idx.meaning] || '').trim();
    if (!word && !meaning) return; // 空行スキップ
    if (!word) { errors.push(`${line}行目: 英単語が空です`); return; }
    if (!meaning) errors.push(`${line}行目「${word}」: 訳が空です(空のまま取込)`);
    const seq = toInt(r[idx.seq]) ?? line;
    cards.push({
      id: `${deckId}:${seq}:${word.toLowerCase()}`,
      deckId, seq,
      pos: (r[idx.pos] || '').trim(),
      word,
      meaning,
      alt: (r[idx.alt] || '').split(/[;；]/).map((s) => s.trim()).filter(Boolean),
      ex1: (r[idx.ex1] || '').trim(), ex1ja: (r[idx.ex1ja] || '').trim(), ex1n: toInt(r[idx.ex1n]),
      ex2: (r[idx.ex2] || '').trim(), ex2ja: (r[idx.ex2ja] || '').trim(), ex2n: toInt(r[idx.ex2n]),
      etym: (r[idx.etym] || '').trim(), note: (r[idx.note] || '').trim(),
    });
  });
  return { cards, errors };
}

function cardsToCSV(cards) {
  const H = ['連番', '何詞か（名詞、動詞など）', '英単語', '訳', 'その他の訳をいくつかセミコロン区切りで', '例文1', '例文1の訳', '例文1の何語目にその単語を使ったか', '例文2', '例文2の訳', '例文2の何語目にその単語を使ったか', 'その英単語の由来や語源', 'その他備考あれば（類義語や対義語、名詞化や動詞化したものなど）'];
  const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const lines = [H.map(esc).join(',')];
  cards.forEach((c) => lines.push([
    c.seq, c.pos, c.word, c.meaning, (c.alt || []).join(';'),
    c.ex1, c.ex1ja, c.ex1n ?? '', c.ex2, c.ex2ja, c.ex2n ?? '', c.etym, c.note,
  ].map(esc).join(',')));
  return '﻿' + lines.join('\r\n');
}

window.EtanCSV = { parseCSV, rowsToCards, cardsToCSV };
