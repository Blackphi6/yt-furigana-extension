/**
 * Freemium プラン定義。
 * 無料: ローカルふりがな・学習は無制限。
 * Premium: 辞書クラウド同期・共有辞書・ホスト読みAPI。
 */

export const PLAN_FREE = "free";
export const PLAN_PREMIUM = "premium";

export const FREE_FEATURES = Object.freeze([
  "localFurigana",
  "localLearning",
  "localEngines",
  "byoReadingApi"
]);

export const PREMIUM_FEATURES = Object.freeze([
  "dictSync",
  "sharedDict",
  "hostedReadingApi"
]);

/** メンテナーの GitHub Sponsors（変更可） */
export const DEFAULT_SPONSORS_URL = "https://github.com/sponsors/Blackphi6";

/** 公開サイト（GitHub Pages） */
export const DEFAULT_SITE_URL = "https://blackphi6.github.io/yt-furigana-extension";
export const DEFAULT_PRICING_URL = `${DEFAULT_SITE_URL}/pricing.html`;
export const DEFAULT_PRIVACY_URL = `${DEFAULT_SITE_URL}/privacy.html`;
export const DEFAULT_TERMS_URL = `${DEFAULT_SITE_URL}/terms.html`;

/**
 * @param {unknown} value
 * @returns {"free" | "premium"}
 */
export function normalizePlan(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "premium" || raw === "pro" || raw === "paid") return PLAN_PREMIUM;
  return PLAN_FREE;
}

export function isPremiumPlan(plan) {
  return normalizePlan(plan) === PLAN_PREMIUM;
}

/**
 * @param {string} plan
 * @param {string} feature
 */
export function canUseFeature(plan, feature) {
  if (FREE_FEATURES.includes(feature)) return true;
  if (!PREMIUM_FEATURES.includes(feature)) return false;
  return isPremiumPlan(plan);
}

/**
 * @param {{ plan?: string, premiumExpiresAt?: string, licenseKey?: string }} input
 */
export function resolveEntitlement(input = {}) {
  const plan = normalizePlan(input.plan);
  const expiresAt = input.premiumExpiresAt ? Date.parse(input.premiumExpiresAt) : NaN;

  if (plan === PLAN_PREMIUM && Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return {
      plan: PLAN_FREE,
      reason: "expired",
      premiumExpiresAt: input.premiumExpiresAt || null,
      licenseKey: input.licenseKey || ""
    };
  }

  return {
    plan,
    reason: plan === PLAN_PREMIUM ? "active" : "free",
    premiumExpiresAt: input.premiumExpiresAt || null,
    licenseKey: String(input.licenseKey || "").trim()
  };
}

/**
 * ライセンスキーの形だけ検査（真偽はサーバー verify）。
 * 形式: ytfp_ で始まり、全体が十分長い。
 * @param {string} key
 */
export function parseLicenseKeyShape(key) {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (!/^ytfp_[a-z0-9][a-z0-9_\-]{10,}$/i.test(trimmed)) {
    return { ok: false, reason: "shape" };
  }
  return { ok: true, key: trimmed };
}

/**
 * 同期マージ。新しい revisedAt 側の同キーを優先し、無いキーは両方残す。
 * @param {Record<string, string>} local
 * @param {Record<string, string>} remote
 * @param {{ localRevisedAt?: string, remoteRevisedAt?: string }} meta
 */
export function mergeDictPreferNewer(local, remote, meta = {}) {
  const localTime = Date.parse(meta.localRevisedAt || "") || 0;
  const remoteTime = Date.parse(meta.remoteRevisedAt || "") || 0;
  const preferRemote = remoteTime >= localTime;

  /** @type {Record<string, string>} */
  const out = { ...(local || {}) };
  for (const [surface, reading] of Object.entries(remote || {})) {
    if (!surface || !reading) continue;
    if (!(surface in out) || preferRemote) {
      out[surface] = reading;
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} dict
 * @param {string} revisedAt
 */
export function buildSyncPayload(dict, revisedAt) {
  return {
    dict: { ...(dict || {}) },
    revisedAt: revisedAt || new Date().toISOString()
  };
}

/**
 * 共有辞書を Manual map へ適用（既存キーは上書きしない）。
 * @param {Map<string, string>} manualMap
 * @param {Record<string, string>} entries
 * @returns {number} 追加件数
 */
export function applySharedDictEntries(manualMap, entries) {
  let added = 0;
  for (const [surface, reading] of Object.entries(entries || {})) {
    if (!surface || !reading) continue;
    if (manualMap.has(surface)) continue;
    manualMap.set(surface, reading);
    added += 1;
  }
  return added;
}
