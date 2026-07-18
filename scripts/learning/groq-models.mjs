/**
 * Prefer primary Groq roles; if a model id is missing on this key, swap that role
 * from fallback_models (keeps the loop green after Groq deprecations).
 *
 * @param {{ models?: object, fallback_models?: object }} groqConfig
 * @param {Set<string>} available
 * @param {{ fast?: boolean }} [opts]
 * @returns {{ generator: string, verifier: string, arbitrator: string, swapped: string[] }}
 */
export function resolveGroqModelSet(groqConfig, available, opts = {}) {
  const primary = opts.fast
    ? groqConfig.fallback_models || groqConfig.models
    : groqConfig.models;
  const fallback = groqConfig.fallback_models || {};
  if (!primary?.generator?.id) {
    throw new Error("synth-config.json に groq.models がありません");
  }

  const pick = (role) => {
    const want = primary[role]?.id;
    if (want && available.has(want)) {
      return { id: want, swapped: false };
    }
    const alt = fallback[role]?.id;
    if (alt && available.has(alt)) {
      return { id: alt, swapped: true, from: want, to: alt };
    }
    const listed = [...available].filter((id) => !id.includes("whisper")).sort();
    throw new Error(
      `Groq に ${role} 用モデルがありません (wanted=${want || "?"}` +
        (alt ? `, fallback=${alt}` : "") +
        `).\n利用可能: ${listed.slice(0, 20).join(", ") || "(none)"}`
    );
  };

  const g = pick("generator");
  const v = pick("verifier");
  const a = pick("arbitrator");
  const swapped = [];
  if (g.swapped) swapped.push(`generator ${g.from} → ${g.id}`);
  if (v.swapped) swapped.push(`verifier ${v.from} → ${v.id}`);
  if (a.swapped) swapped.push(`arbitrator ${a.from} → ${a.id}`);
  return {
    generator: g.id,
    verifier: v.id,
    arbitrator: a.id,
    swapped,
  };
}
