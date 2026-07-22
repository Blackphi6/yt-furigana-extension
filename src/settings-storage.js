/**
 * 設定の読み書き。資格情報は sync（Google アカウント同期）に置かず local に保存する。
 */
import {
  DEFAULT_SETTINGS,
  normalizeStoredEngine
} from "./default-settings.js";

export const SECRET_SETTING_KEYS = ["readingApiKey", "licenseKey"];

/**
 * sync + local をマージ。旧 sync 上のキーがあれば local へ移行して sync から消す。
 * @returns {Promise<typeof DEFAULT_SETTINGS & Record<string, unknown>>}
 */
export async function getMergedSettings() {
  const sync = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const localSecrets = await chrome.storage.local.get({
    readingApiKey: "",
    licenseKey: ""
  });

  let readingApiKey = String(localSecrets.readingApiKey || "");
  let licenseKey = String(localSecrets.licenseKey || "");
  const syncApi = String(sync.readingApiKey || "");
  const syncLicense = String(sync.licenseKey || "");

  // sync に残っている秘密は local へ寄せ、sync スロットは常に空にする
  if (syncApi || syncLicense) {
    if (!readingApiKey && syncApi) readingApiKey = syncApi;
    if (!licenseKey && syncLicense) licenseKey = syncLicense;
    await chrome.storage.local.set({ readingApiKey, licenseKey });
    await chrome.storage.sync.set({ readingApiKey: "", licenseKey: "" });
  }

  const engine = normalizeStoredEngine(sync.engine);
  if (engine !== sync.engine) {
    await chrome.storage.sync.set({ engine });
  }

  return {
    ...DEFAULT_SETTINGS,
    ...sync,
    engine,
    readingApiKey,
    licenseKey
  };
}

/**
 * 非秘密設定は sync、秘密は local。sync 上の秘密スロットは空にする。
 * @param {Record<string, unknown>} settings
 */
export async function saveMergedSettings(settings) {
  const readingApiKey = String(settings.readingApiKey || "").trim();
  const licenseKey = String(settings.licenseKey || "").trim();

  const syncPayload = { ...settings };
  delete syncPayload.readingApiKey;
  delete syncPayload.licenseKey;
  syncPayload.readingApiKey = "";
  syncPayload.licenseKey = "";

  await chrome.storage.local.set({ readingApiKey, licenseKey });
  await chrome.storage.sync.set(syncPayload);
}
