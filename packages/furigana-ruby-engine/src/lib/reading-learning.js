import { normalizeReading } from "./reading-normalize.js";

export const LEARNING_INBOX_KEY = "learningInbox";
export const LEARNING_INBOX_LIMIT = 500;

/**
 * @typedef {{ surface: string, reading: string }} ExpectItem
 * @typedef {{ id: string, text: string, expect: ExpectItem[] }} SeedCase
 * @typedef {{
 *   phrases?: Record<string, string>,
 *   contextRules?: Array<{ surface: string, reading: string, weight?: number, cues?: string[] }>
 * }} LearnedOverrides
 * @typedef {{
 *   ts: string,
 *   kind: string,
 *   text: string,
 *   surface?: string,
 *   reading?: string,
 *   want?: string,
 *   source?: string,
 *   videoUrl?: string,
 *   id?: string
 * }} LearningEvent
 */

export function emptyLearnedOverrides() {
  return { version: 1, updatedAt: null, phrases: {}, contextRules: [] };
}

/**
 * @param {Map<string, string>} manualMap
 * @param {Array<object>} contextRules
 * @param {LearnedOverrides | null | undefined} learned
 */
export function mergeLearnedOverrides(manualMap, contextRules, learned) {
  if (!learned) {
    return { phraseCount: 0, ruleCount: 0 };
  }

  let phraseCount = 0;
  let ruleCount = 0;

  for (const [phrase, reading] of Object.entries(learned.phrases || {})) {
    if (!phrase || !reading) continue;
    manualMap.set(phrase, normalizeReading(reading));
    phraseCount += 1;
  }

  for (const rule of learned.contextRules || []) {
    if (!rule?.surface || !rule?.reading) continue;
    contextRules.push({
      surface: rule.surface,
      reading: normalizeReading(rule.reading),
      weight: rule.weight ?? 3,
      cues: Array.isArray(rule.cues) ? rule.cues : []
    });
    ruleCount += 1;
  }

  return { phraseCount, ruleCount };
}

/**
 * HTML の ruby から surface→reading を粗い抽出する。
 * @param {string} html
 * @returns {Map<string, string>}
 */
export function extractReadingsFromRubyHtml(html) {
  const map = new Map();
  const re = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gs;
  let match;
  while ((match = re.exec(html))) {
    const surface = match[1].replace(/<[^>]+>/g, "");
    const reading = normalizeReading(match[2]);
    if (surface && reading) map.set(surface, reading);
  }
  // wrapFuriganaWord の data-* も拾う（ルビ無し・unset 以外）
  const attrRe =
    /data-surface="([^"]*)"\s+data-reading="([^"]*)"/g;
  while ((match = attrRe.exec(String(html || "")))) {
    const surface = match[1];
    const reading = normalizeReading(match[2]);
    if (surface && reading) map.set(surface, reading);
  }
  return map;
}

/**
 * expect が得られた読みに含まれるか。
 * phrase 全体一致、または surface がキー、または reading が surface の読みに含まれる。
 * 複合語内の連濁（旗頭の「がしら」↔「かしら」）も濁点を無視して照合する。
 * @param {Map<string, string>} gotMap
 * @param {ExpectItem} expect
 */
export function readingMatchesExpect(gotMap, expect) {
  const want = normalizeReading(expect.reading);
  const surface = expect.surface;
  if (!want || !surface) return false;

  if (gotMap.has(surface) && normalizeReading(gotMap.get(surface)) === want) {
    return true;
  }

  const wantFold = stripVoicing(want);
  for (const [gotSurface, gotReading] of gotMap) {
    if (!(surface.includes(gotSurface) || gotSurface.includes(surface))) {
      continue;
    }
    const got = normalizeReading(gotReading);
    if (!got) continue;
    if (got === want || want.includes(got) || got.includes(want)) {
      return true;
    }
    // 語内漢字採点: 連濁・清濁の差だけなら一致とみなす
    const gotFold = stripVoicing(got);
    if (
      gotFold === wantFold ||
      wantFold.includes(gotFold) ||
      gotFold.includes(wantFold)
    ) {
      return true;
    }
  }

  return false;
}

/** 濁点・半濁点を落として連濁照合用にする */
function stripVoicing(reading) {
  const map = {
    が: "か",
    ぎ: "き",
    ぐ: "く",
    げ: "け",
    ご: "こ",
    ざ: "さ",
    じ: "し",
    ず: "す",
    ぜ: "せ",
    ぞ: "そ",
    だ: "た",
    ぢ: "ち",
    づ: "つ",
    で: "て",
    ど: "と",
    ば: "は",
    び: "ひ",
    ぶ: "ふ",
    べ: "へ",
    ぼ: "ほ",
    ぱ: "は",
    ぴ: "ひ",
    ぷ: "ふ",
    ぺ: "へ",
    ぽ: "ほ"
  };
  return String(reading || "").replace(
    /[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/g,
    (ch) => map[ch] || ch
  );
}

/**
 * @param {string} html
 * @param {ExpectItem[]} expectList
 */
export function evaluateRubyAgainstExpect(html, expectList) {
  const gotMap = extractReadingsFromRubyHtml(html);
  const results = expectList.map((expect) => ({
    ...expect,
    ok: readingMatchesExpect(gotMap, expect),
    got: gotMap.get(expect.surface) || null
  }));
  return {
    ok: results.every((item) => item.ok),
    results,
    gotMap
  };
}

/**
 * 同一 (surface, reading) の提案を集計し、昇格候補を返す。
 * source: seed / user / g2p は 1 票でも候補化。
 * @param {Array<{ surface: string, reading: string, source?: string, text?: string, cues?: string[], asPhrase?: boolean }>} proposals
 * @param {{ minVotes?: number, preferPhraseLength?: number }} [options]
 */
export function aggregatePromotionCandidates(proposals, options = {}) {
  const minVotes = options.minVotes ?? 2;
  const groups = new Map();

  for (const proposal of proposals) {
    if (!proposal?.surface || !proposal?.reading) continue;
    const surface = proposal.surface;
    const reading = normalizeReading(proposal.reading);
    const key = `${surface}::${reading}`;
    const current = groups.get(key) || {
      surface,
      reading,
      votes: 0,
      sources: new Set(),
      texts: [],
      cues: new Set(),
      asPhrase: false
    };
    current.votes += 1;
    if (proposal.source) current.sources.add(proposal.source);
    if (proposal.text) current.texts.push(proposal.text);
    if (proposal.asPhrase) current.asPhrase = true;
    for (const cue of proposal.cues || []) current.cues.add(cue);
    groups.set(key, current);
  }

  const promoted = [];
  /** @type {Map<string, Set<string>>} */
  const readingsBySurface = new Map();
  for (const item of groups.values()) {
    if (!isPrivilegedPromotion(item) && item.votes < minVotes) continue;
    const set = readingsBySurface.get(item.surface) || new Set();
    set.add(item.reading);
    readingsBySurface.set(item.surface, set);
  }

  for (const item of groups.values()) {
    const privileged = isPrivilegedPromotion(item);
    if (!privileged && item.votes < minVotes) continue;

    const ambiguous =
      (readingsBySurface.get(item.surface)?.size || 0) > 1;
    const cues = [...item.cues];
    if (cues.length === 0) {
      for (const text of item.texts) {
        const around = text.replace(item.surface, " ").trim().slice(0, 12);
        if (around) cues.push(around);
      }
    }

    // 同形異音や文脈付き学習はフレーズ上書き禁止（最後の1読みが全文を汚染する）
    // g2p の複合語提案 (asPhrase) はキューがあっても phrase 優先
    const usePhrase =
      !ambiguous &&
      (item.asPhrase ||
        (cues.length === 0 &&
          item.surface.length >= (options.preferPhraseLength ?? 4)));

    if (usePhrase) {
      promoted.push({
        type: "phrase",
        surface: item.surface,
        reading: item.reading,
        votes: item.votes,
        sources: [...item.sources]
      });
    } else {
      const finalCues = cues.length > 0 ? cues : [item.surface];
      // 長いキューを優先（「小さな社」が「社は」で押し出されないように）
      finalCues.sort((a, b) => b.length - a.length || a.localeCompare(b));
      promoted.push({
        type: "context",
        surface: item.surface,
        reading: item.reading,
        weight: privileged ? 5 : 3,
        cues: finalCues.slice(0, 12),
        votes: item.votes,
        sources: [...item.sources]
      });
    }
  }

  return promoted;
}

function isPrivilegedPromotion(item) {
  return (
    item.sources.has("seed") ||
    item.sources.has("user") ||
    item.sources.has("g2p")
  );
}

/**
 * @param {LearnedOverrides} base
 * @param {ReturnType<typeof aggregatePromotionCandidates>} candidates
 */
export function applyPromotionCandidates(base, candidates) {
  const next = {
    version: base.version ?? 1,
    updatedAt: new Date().toISOString(),
    phrases: { ...(base.phrases || {}) },
    contextRules: [...(base.contextRules || [])]
  };

  for (const candidate of candidates) {
    if (candidate.type === "phrase") {
      const prev = next.phrases[candidate.surface];
      const prevNorm = prev ? normalizeReading(prev) : "";
      const nextNorm = normalizeReading(candidate.reading);
      // 既存フレーズと読みが衝突する場合は phrase 上書きせず context へ
      if (prevNorm && prevNorm !== nextNorm) {
        const exists = next.contextRules.find(
          (rule) =>
            rule.surface === candidate.surface &&
            normalizeReading(rule.reading) === nextNorm
        );
        const cues = (candidate.cues || []).length
          ? candidate.cues
          : [candidate.surface];
        if (exists) {
          const merged = new Set([...(exists.cues || []), ...cues]);
          exists.cues = [...merged]
            .sort((a, b) => b.length - a.length || a.localeCompare(b))
            .slice(0, 16);
        } else {
          next.contextRules.push({
            surface: candidate.surface,
            reading: candidate.reading,
            weight: candidate.weight || 5,
            cues
          });
        }
        continue;
      }
      next.phrases[candidate.surface] = candidate.reading;
      continue;
    }

    const exists = next.contextRules.find(
      (rule) =>
        rule.surface === candidate.surface &&
        normalizeReading(rule.reading) === candidate.reading
    );
    if (exists) {
      // 同表層・同読みは cues を統合（短い旧キューだけの取り残しを防ぐ）
      const merged = new Set([...(exists.cues || []), ...(candidate.cues || [])]);
      exists.cues = [...merged]
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .slice(0, 16);
      if ((candidate.weight || 0) > (exists.weight || 0)) {
        exists.weight = candidate.weight;
      }
      continue;
    }
    next.contextRules.push({
      surface: candidate.surface,
      reading: candidate.reading,
      weight: candidate.weight,
      cues: candidate.cues
    });
  }

  return next;
}

/**
 * ベンチが悪化していないか。
 * @param {{ passed: number, total: number }} before
 * @param {{ passed: number, total: number }} after
 */
export function passesPromotionGate(before, after) {
  if (after.total === 0) return false;
  if (after.passed < before.passed) return false;
  return after.passed / after.total >= before.passed / Math.max(before.total, 1);
}

/**
 * @param {LearningEvent[]} inbox
 * @param {LearningEvent} event
 */
export function appendLearningEvent(inbox, event, limit = LEARNING_INBOX_LIMIT) {
  const next = [...inbox, event];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

/** 文脈ルール対象の表層（曖昧語）一覧 */
export function ambiguousSurfacesFromRules(contextRules) {
  return [...new Set(contextRules.map((rule) => rule.surface))];
}

/**
 * 曖昧語の出現を学習サンプル化する。
 * @param {string} text
 * @param {Map<string, string>} readingMap
 * @param {string[]} ambiguousSurfaces
 * @param {{ videoUrl?: string }} [meta]
 */
export function buildAmbiguousSamples(text, readingMap, ambiguousSurfaces, meta = {}) {
  const samples = [];
  const ts = new Date().toISOString();

  for (const surface of ambiguousSurfaces) {
    if (!text.includes(surface)) continue;
    const reading = readingMap.get(surface);
    if (!reading) continue;
    samples.push({
      ts,
      kind: "ambiguous",
      text,
      surface,
      reading: normalizeReading(reading),
      source: "runtime",
      videoUrl: meta.videoUrl || ""
    });
  }

  return samples;
}
