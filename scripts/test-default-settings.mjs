import {
  DEFAULT_SETTINGS,
  isLlmEngine,
  isReadingApiEngine,
  isRemoteEngine,
  listInstalledModelNames,
  pickPreferredOllamaModel,
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

if (
  shouldUseRemoteConversion({ engine: "reading-api", readingApiUrl: "" }) ||
  shouldUseRemoteConversion({ engine: "reading-api" })
) {
  throw new Error("reading-api without URL must stay local");
}

if (
  !shouldUseRemoteConversion({
    engine: "reading-api",
    readingApiUrl: "http://127.0.0.1:8765"
  })
) {
  throw new Error("reading-api with URL should use remote");
}

if (!shouldUseRemoteConversion({ engine: "ollama" })) {
  throw new Error("ollama should use remote conversion");
}

if (shouldUseRemoteConversion({ engine: "kuromoji" })) {
  throw new Error("kuromoji must stay local");
}

if (DEFAULT_SETTINGS.learningInboxEnabled !== true) {
  throw new Error("learningInboxEnabled should default to true (opt-out model)");
}

console.log("Default settings tests passed.");
