/**
 * サイト共通: ライト / ダーク / デバイスに合わせる
 * localStorage key: ytf-theme
 */
export const THEME_STORAGE_KEY = "ytf-theme";
export const THEME_PREFS = /** @type {const} */ (["light", "dark", "system"]);

/**
 * @param {string | null | undefined} raw
 * @returns {"light" | "dark" | "system"}
 */
export function normalizeThemePref(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

/**
 * @param {"light" | "dark" | "system"} pref
 * @param {boolean} systemDark
 * @returns {"light" | "dark"}
 */
export function resolveTheme(pref, systemDark) {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}

/**
 * @param {Document} [doc]
 * @param {{ matchMedia?: (q: string) => { matches: boolean }, storage?: Storage | null }} [env]
 */
export function applyThemeToDocument(doc = document, env = {}) {
  const storage = env.storage === undefined ? globalThis.localStorage : env.storage;
  let pref = "system";
  try {
    pref = normalizeThemePref(storage?.getItem?.(THEME_STORAGE_KEY));
  } catch {
    pref = "system";
  }
  const matchMedia = env.matchMedia || globalThis.matchMedia?.bind(globalThis);
  const systemDark = Boolean(matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  const resolved = resolveTheme(pref, systemDark);
  const root = doc.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = resolved;
  return { pref, resolved };
}

/**
 * @param {"light" | "dark" | "system"} pref
 * @param {Document} [doc]
 * @param {{ storage?: Storage | null }} [env]
 */
export function setThemePref(pref, doc = document, env = {}) {
  const next = normalizeThemePref(pref);
  const storage = env.storage === undefined ? globalThis.localStorage : env.storage;
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return applyThemeToDocument(doc, env);
}

function labelFor(pref, lang = "ja") {
  const en = String(lang || "").toLowerCase().startsWith("en");
  if (pref === "light") return en ? "Light" : "ライト";
  if (pref === "dark") return en ? "Dark" : "ダーク";
  return en ? "Auto" : "自動";
}

/**
 * @param {Document} [doc]
 */
export function mountThemeSwitch(doc = document) {
  const header = doc.querySelector(".site-header");
  if (!header || header.querySelector(".theme-switch")) return null;

  const lang = doc.documentElement.getAttribute("lang") || "ja";
  const wrap = doc.createElement("div");
  wrap.className = "theme-switch";
  wrap.setAttribute("role", "group");
  wrap.setAttribute(
    "aria-label",
    String(lang).toLowerCase().startsWith("en") ? "Color theme" : "表示モード"
  );

  const current =
    normalizeThemePref(doc.documentElement.getAttribute("data-theme-pref")) ||
    "system";

  for (const pref of THEME_PREFS) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "theme-switch__btn";
    btn.dataset.themePref = pref;
    btn.setAttribute("aria-pressed", pref === current ? "true" : "false");
    const en = String(lang).toLowerCase().startsWith("en");
    btn.title =
      pref === "system"
        ? en
          ? "Follow device light/dark setting"
          : "端末のライト／ダーク設定に合わせる"
        : pref === "light"
          ? en
            ? "Light mode"
            : "ライトモード"
          : en
            ? "Dark mode"
            : "ダークモード";
    btn.textContent = labelFor(pref, lang);
    btn.addEventListener("click", () => {
      const { pref: saved } = setThemePref(pref, doc);
      wrap.querySelectorAll(".theme-switch__btn").forEach((el) => {
        const on = el.getAttribute("data-theme-pref") === saved;
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
    wrap.appendChild(btn);
  }

  const nav = header.querySelector(".nav");
  if (nav) nav.insertAdjacentElement("afterend", wrap);
  else header.appendChild(wrap);
  return wrap;
}

function boot() {
  applyThemeToDocument();
  mountThemeSwitch();
  const mq = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", () => {
    if (normalizeThemePref(document.documentElement.getAttribute("data-theme-pref")) === "system") {
      applyThemeToDocument();
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
