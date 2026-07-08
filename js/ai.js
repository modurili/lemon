/**
 * Gemini Flash 連携
 * AIは補助機能であり、通常の学習フローでは一切呼び出さない。
 * 生成結果は必ず IndexedDB (aiCache) に保存し、同じ内容を再生成しない。
 */

import { db } from "./db.js";
import { settings } from "./settings.js";

const MODEL = "gemini-flash-latest";

async function callGemini(prompt) {
  const apiKey = settings.getApiKey();
  if (!apiKey) throw new Error("APIキーが設定されていません");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new Error(
        "APIの利用上限に達しています。Google AI Studioでこのキーの請求設定・無料枠の状態を確認してください（https://ai.dev/rate-limit）。"
      );
    }
    if (res.status === 400 || res.status === 403) {
      throw new Error("APIキーが無効か、権限がありません。設定画面でキーを確認してください。");
    }
    throw new Error(`Gemini APIエラー: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AIからの応答が空でした");

  // MAX_TOKENSで途中終了した場合は、その旨を利用者にわかるようにしておく
  if (candidate.finishReason === "MAX_TOKENS") {
    return text.trim() + "\n\n（※文字数制限のため途中までの表示です）";
  }
  return text.trim();
}

async function withCache(cacheKey, generator, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await db.get(db.STORES.AI_CACHE, cacheKey);
    if (cached) return cached.value;
  }

  const value = await generator();
  await db.put(db.STORES.AI_CACHE, { key: cacheKey, value, createdAt: new Date().toISOString() });
  return value;
}

export const ai = {
  /** 例文生成 */
  async generateExample(word, forceRefresh = false) {
    return withCache(
      `example:${word.id}`,
      async () => {
        const prompt = `英単語 "${word.headword}"（意味: ${word.meaning}）を使った、中級学習者向けの自然な英語例文を1つだけ作成してください。例文とその日本語訳のみを、以下の形式で出力してください（他の説明は不要）:\n英文: ...\n和訳: ...`;
        return callGemini(prompt);
      },
      forceRefresh
    );
  },

  /** 語源説明 */
  async explainEtymology(word, forceRefresh = false) {
    return withCache(
      `etymology:${word.id}`,
      async () => {
        const prompt = `英単語 "${word.headword}" の語源を、日本語で3〜4文程度で分かりやすく説明してください。学習者の記憶に残りやすいように、語根や接頭辞・接尾辞の意味に触れてください。`;
        return callGemini(prompt);
      },
      forceRefresh
    );
  },

  /** 類義語生成 */
  async generateSynonyms(word, forceRefresh = false) {
    return withCache(
      `synonyms:${word.id}`,
      async () => {
        const prompt = `英単語 "${word.headword}"（意味: ${word.meaning}）の類義語を3つ、それぞれニュアンスの違いを日本語で一言添えて挙げてください。簡潔に箇条書きで出力してください。`;
        return callGemini(prompt);
      },
      forceRefresh
    );
  },

  /** 苦手分析（複数の間違えやすい単語をまとめて分析、キャッシュしない） */
  async analyzeWeaknesses(strugglingWords) {
    const wordList = strugglingWords.map((w) => w.headword).join(", ");
    const prompt = `学習者が間違えやすい英単語のリストです: ${wordList}\nこれらの単語に共通する特徴やつまずきやすいポイントを日本語で3文以内で分析し、学習アドバイスを1つ提案してください。`;
    return callGemini(prompt);
  },
};
