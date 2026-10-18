/**
 * 敬称など人名の手がかりの直前の語は、人名辞書の読みを使う（相場さん＝あいばさん、小鳥遊さん＝たかなしさん）。
 * 手がかりが無いときは一般語の読みのまま（株の相場＝そうば）。
 */
import V2_RULES from "../../rules/v2-rules.json" with { type: "json" };
import { getPersonalNameReading } from "./personal-name-phrases.js";
import { MANUAL_PHRASE_READINGS } from "./reading-context.js";

/** 人名のあとにしか付かない語（読み API と共有の規則表）。「様」は神仏（明神様）やお客にも付くので入れない */
export const NAME_CUES = V2_RULES.nameCues;
const MAX_NAME_LENGTH = 4;

/**
 * text の cueStart（手がかりの開始位置）の直前で、最長の人名を探す。
 * @param {string} text
 * @param {number} cueStart
 * @returns {{ start: number, end: number, surface: string, reading: string } | null}
 */
export function findNameBeforeCue(text, cueStart) {
  if (!NAME_CUES.some((cue) => text.startsWith(cue, cueStart))) return null;
  for (let len = Math.min(MAX_NAME_LENGTH, cueStart); len >= 2; len -= 1) {
    const surface = text.slice(cueStart - len, cueStart);
    const reading = getPersonalNameReading(surface);
    if (reading) return { start: cueStart - len, end: cueStart, surface, reading };
  }
  return null;
}

const surfaceOf = (t) => t.surface_form ?? t.surface ?? "";

/**
 * 形態素列（span 付き）に当てる。人名の範囲が語の区切りと合うときだけ、その範囲を1語の人名にする。
 * ユーザー登録・固定句の語は替えない。入力は変更しない。
 * @template {{ surface_form?: string, surface?: string, reading?: string, span?: number[], source?: string }} T
 * @param {T[]} tokens
 * @param {string} text
 * @returns {T[]}
 */
export function applyNameCueReadings(tokens, text) {
  let out = tokens;
  for (const token of tokens) {
    const name = Array.isArray(token.span) ? findNameBeforeCue(text, token.span[0]) : null;
    if (!name) continue;
    const inside = out.filter((t) => Array.isArray(t.span) && t.span[0] >= name.start && t.span[1] <= name.end);
    const aligned =
      inside.length > 0 &&
      inside[0].span[0] === name.start &&
      inside[inside.length - 1].span[1] === name.end &&
      !out.some((t) => Array.isArray(t.span) && t.span[0] < name.start && t.span[1] > name.start);
    if (!aligned) continue;
    const protectedWord = inside.some(
      (t) => t.source === "occurrence" || MANUAL_PHRASE_READINGS.has(surfaceOf(t))
    );
    if (protectedWord || MANUAL_PHRASE_READINGS.has(name.surface)) continue;
    const merged = {
      ...inside[0],
      surface_form: name.surface,
      reading: name.reading,
      pronunciation: name.reading,
      span: [name.start, name.end],
      source: "name_cue"
    };
    out = out.flatMap((t) => (t === inside[0] ? [merged] : inside.includes(t) ? [] : [t]));
  }
  return out;
}
