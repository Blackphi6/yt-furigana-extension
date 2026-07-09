import { getOllamaTimeoutMs } from "../src/ollama-config.js";

if (getOllamaTimeoutMs("qwen2.5:14b") !== 120000) {
  throw new Error("14b timeout should be 120s");
}
if (getOllamaTimeoutMs("qwen2.5:1.5b") !== 45000) {
  throw new Error("1.5b timeout should be 45s");
}

console.log("Timeout tests passed.");
