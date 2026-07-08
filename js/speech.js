/**
 * 音声読み上げ: 標準ではブラウザのSpeech Synthesis APIを使う（無料・API不要）
 */
export function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}
