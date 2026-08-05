import {
  DEFAULT_SETTINGS,
  ONBOARDING_ENGINE_ACCURACY,
  ONBOARDING_ENGINE_PRIVACY,
  PUBLIC_READING_API_URL,
  isLlmEngine,
  isReadingApiEngine,
  isRemoteEngine,
  listInstalledModelNames,
  needsEngineOnboarding,
  normalizeStoredEngine,
  pickPreferredOllamaModel,
  resolveReadingApiBaseUrl,
  shouldUseRemoteConversion
} from "../src/default-settings.js";

const sampleTags = {
  models: [{ name: "qwen2.5:14b" }, { name: "llama3.2:latest" }]
};

const installed = listInstalledModelNames(sampleTags);

if (!installed.includes("qwen2.5:14b")) {
  throw new Error("listInstalledModelNames failed");
}

if (pickPreferredOllamaModel(installed, "qwen2.5:1.5b") !== "qwen2.5:14b") {
  throw new Error("should pick installed qwen when configured model is missing");
}

if (pickPreferredOllamaModel(["gemma3:4b", "qwen2.5:14b"], "") !== "gemma3:4b") {
  throw new Error("should prefer gemma3:4b when installed");
}

if (pickPreferredOllamaModel(installed, "qwen2.5:14b") !== "qwen2.5:14b") {
  throw new Error("should keep configured model when installed");
}

if (pickPreferredOllamaModel([], "qwen2.5:14b") !== null) {
  throw new Error("empty list should return null");
}

if (!isLlmEngine("ollama") || isLlmEngine("hybrid")) {
  throw new Error("isLlmEngine mismatch");
}

if (!isReadingApiEngine("reading-api") || isReadingApiEngine("kuromoji")) {
  throw new Error("isReadingApiEngine mismatch");
}

if (
  !isRemoteEngine("reading-api") ||
  !isRemoteEngine("ollama") ||
  isRemoteEngine("kuromoji")
) {
  throw new Error("isRemoteEngine mismatch");
}

if (normalizeStoredEngine("reading-api") !== "reading-api") {
  throw new Error("reading-api must stay as opt-in engine");
}
if (normalizeStoredEngine("ollama") !== "kuromoji") {
  throw new Error("ollama must migrate to kuromoji");
}
if (normalizeStoredEngine("sudachi") !== "hybrid") {
  throw new Error("sudachi must migrate to hybrid");
}
if (normalizeStoredEngine("hybrid") !== "hybrid") {
  throw new Error("hybrid must stay hybrid");
}

if (shouldUseRemoteConversion({ engine: "kuromoji" })) {
  throw new Error("kuromoji must stay local");
}
if (shouldUseRemoteConversion({ engine: "hybrid" })) {
  throw new Error("hybrid must stay local");
}
if (shouldUseRemoteConversion({ engine: "ollama" })) {
  throw new Error("ollama must stay local after normalize");
}
if (
  !shouldUseRemoteConversion({ engine: "reading-api" }) ||
  !shouldUseRemoteConversion({
    engine: "reading-api",
    readingApiUrl: "http://127.0.0.1:8765"
  })
) {
  throw new Error("reading-api opt-in must use remote conversion");
}

if (
  resolveReadingApiBaseUrl({ engine: "reading-api", readingApiUrl: "" }) !==
  PUBLIC_READING_API_URL.replace(/\/+$/, "")
) {
  throw new Error("reading-api with empty URL must fall back to public API");
}
if (
  resolveReadingApiBaseUrl({
    engine: "reading-api",
    readingApiUrl: "http://127.0.0.1:8765/"
  }) !== "http://127.0.0.1:8765"
) {
  throw new Error("explicit readingApiUrl must win");
}
if (resolveReadingApiBaseUrl({ engine: "kuromoji", readingApiUrl: "" }) !== "") {
  throw new Error("local engines must not imply public API");
}

if (DEFAULT_SETTINGS.learningInboxEnabled !== true) {
  throw new Error("learningInboxEnabled should default to true (opt-out model)");
}

if (DEFAULT_SETTINGS.contributionEnabled !== false) {
  throw new Error("contributionEnabled should default to false (opt-in)");
}

if (DEFAULT_SETTINGS.sharedPackEnabled !== true) {
  throw new Error("sharedPackEnabled should default to true");
}

if (DEFAULT_SETTINGS.engine !== "kuromoji") {
  throw new Error("default engine must remain kuromoji (local)");
}

if (DEFAULT_SETTINGS.engineOnboardingDone !== false) {
  throw new Error("engine onboarding must start incomplete");
}

if (!needsEngineOnboarding({}) || !needsEngineOnboarding({ engineOnboardingDone: false })) {
  throw new Error("needsEngineOnboarding should be true until done");
}

if (needsEngineOnboarding({ engineOnboardingDone: true })) {
  throw new Error("needsEngineOnboarding should be false after done");
}

if (ONBOARDING_ENGINE_ACCURACY !== "reading-api" || ONBOARDING_ENGINE_PRIVACY !== "kuromoji") {
  throw new Error("onboarding engines must map to reading-api / kuromoji");
}

console.log("Default settings tests passed.");
