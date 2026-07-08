/**
 * 単語帳インポート機能
 * CSV形式の単語帳を読み込み、単語データ・FSRSカードとしてIndexedDBへ登録する。
 *
 * 期待するCSVヘッダー（順不同、一部省略可）:
 * headword,pos,meaning,example,exampleTranslation,phonetic,cefr
 *
 * 必須列: headword, meaning
 * それ以外は空でも可（あとでAI補助機能により生成・保存できる）
 */

import { db } from "./db.js";
import { fsrs } from "./fsrs.js";

/** シンプルなCSVパーサー（ダブルクォート囲み・カンマエスケープに対応） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // 改行コードを統一
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const FIELD_ALIASES = {
  headword: ["headword", "word", "英単語", "単語"],
  pos: ["pos", "品詞"],
  meaning: ["meaning", "意味", "日本語訳", "訳"],
  example: ["example", "例文"],
  exampleTranslation: ["exampleTranslation", "例文和訳", "例文訳"],
  phonetic: ["phonetic", "発音記号", "発音"],
  cefr: ["cefr", "cefrLevel", "cefrレベル"],
};

function resolveHeaderMap(headerRow) {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  const map = {};
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.some((a) => a.toLowerCase() === h));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

/**
 * CSVテキストから単語帳をインポートする
 * @returns {{deckId: string, imported: number, skipped: number, errors: string[]}}
 */
export async function importDeckFromCsv(csvText, deckName) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSVにデータ行がありません（ヘッダー行 + 1行以上が必要です）");
  }

  const headerMap = resolveHeaderMap(rows[0]);
  if (headerMap.headword === undefined || headerMap.meaning === undefined) {
    throw new Error(
      "CSVに必須列（英単語・意味）が見つかりません。列名を headword, meaning のように設定してください。"
    );
  }

  const deckId = `deck-${Date.now()}`;
  const deck = { id: deckId, name: deckName || `インポート単語帳 (${new Date().toLocaleDateString("ja-JP")})` };
  await db.put(db.STORES.DECKS, deck);

  const now = new Date();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const headword = (cols[headerMap.headword] || "").trim();
    const meaning = (cols[headerMap.meaning] || "").trim();

    if (!headword || !meaning) {
      skipped += 1;
      errors.push(`${i + 1}行目: headwordまたはmeaningが空のためスキップしました`);
      continue;
    }

    const wordId = `w-${deckId}-${i}`;
    const word = {
      id: wordId,
      deckId,
      headword,
      meaning,
      pos: headerMap.pos !== undefined ? (cols[headerMap.pos] || "").trim() : "",
      example: headerMap.example !== undefined ? (cols[headerMap.example] || "").trim() : "",
      exampleTranslation:
        headerMap.exampleTranslation !== undefined ? (cols[headerMap.exampleTranslation] || "").trim() : "",
      phonetic: headerMap.phonetic !== undefined ? (cols[headerMap.phonetic] || "").trim() : "",
      cefr: headerMap.cefr !== undefined ? (cols[headerMap.cefr] || "").trim() : "",
    };

    await db.put(db.STORES.WORDS, word);
    const card = fsrs.createEmptyCard(now);
    await db.put(db.STORES.CARDS, { wordId, deckId, ...card });
    imported += 1;
  }

  return { deckId, imported, skipped, errors };
}
