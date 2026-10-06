/**
 * ローディング表示用の残り時間（経過時間と進捗の比から推定）。
 * @param {number} startedAt 開始時刻（ms）
 * @param {number} done 完了量
 * @param {number} total 全体量
 * @param {number} [now]
 * @returns {string} 例: "残り約12秒" / "残り約3分" / "残り時間を計測中" / ""
 */
export function formatRemaining(startedAt, done, total, now = Date.now()) {
  if (!(total > 0) || !(startedAt > 0)) return "";
  if (done >= total) return "残りわずか";
  if (!(done > 0)) return "残り時間を計測中";
  const sec = Math.ceil((((now - startedAt) / done) * (total - done)) / 1000);
  if (sec < 60) return `残り約${Math.max(1, sec)}秒`;
  return `残り約${Math.ceil(sec / 60)}分`;
}
