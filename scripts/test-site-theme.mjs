/**
 * theme.js の pref → resolved ロジック単体テスト
 */
import assert from "node:assert/strict";
import {
  normalizeThemePref,
  resolveTheme,
  applyThemeToDocument,
  setThemePref,
  THEME_STORAGE_KEY,
} from "../site/theme.js";

assert.equal(normalizeThemePref("light"), "light");
assert.equal(normalizeThemePref("DARK"), "dark");
assert.equal(normalizeThemePref("system"), "system");
assert.equal(normalizeThemePref(""), "system");
assert.equal(normalizeThemePref("nope"), "system");

assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");

{
  /** @type {Record<string, string>} */
  const store = {};
  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
  };
  const attrs = new Map();
  const style = { colorScheme: "" };
  const doc = {
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => attrs.get(k) ?? null,
      style,
    },
    querySelector: () => null,
  };
  const env = {
    storage,
    matchMedia: (q) => ({ matches: q.includes("dark") }),
  };
  const applied = applyThemeToDocument(/** @type {any} */ (doc), env);
  assert.equal(applied.pref, "system");
  assert.equal(applied.resolved, "dark");
  assert.equal(attrs.get("data-theme"), "dark");
  assert.equal(attrs.get("data-theme-pref"), "system");

  const next = setThemePref("light", /** @type {any} */ (doc), env);
  assert.equal(store[THEME_STORAGE_KEY], "light");
  assert.equal(next.resolved, "light");
  assert.equal(attrs.get("data-theme"), "light");
}

console.log("test-site-theme: ok");
