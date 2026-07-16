#!/usr/bin/env node
/**
 * Candidate-constrained open-weight synthetic labeling:
 *   generate (family A) → blind verify (family B) → arbitrate (family C)
 * + Sudachi token-boundary gate (never accept「預金」中の「金」)
 *
 * Tuned for this machine: MacBook Pro M3 Pro / 36GB unified memory.
 * Models load ONE AT A TIME via Ollama keep_alive=0 (peak ~13GB).
 *
 * Usage:
 *   npm run learn:synth                # Ollama (this Mac)
 *   npm run learn:synth:cf             # Cloudflare Workers AI (¥0 free tier)
 *   npm run learn:synth -- --fast
 *   npm run learn:synth -- --limit 2 --per-target 2
 */
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBenchTokenizer } from "./bench-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const configPath = path.join(__dirname, "synth-config.json");
const outDir = path.join(root, "data", "learning");
const acceptedPath = path.join(outDir, "synth-accepted.jsonl");
const rejectedPath = path.join(outDir, "synth-rejected.jsonl");
const logPath = path.join(outDir, "synth-log.jsonl");

function parseArgs(argv) {
  const args = {
    fast: false,
    limit: 0,
    perTarget: 0,
    dryRun: false,
    host: "",
    provider: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--fast") args.fast = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i] || 0);
    else if (a === "--per-target") args.perTarget = Number(argv[++i] || 0);
    else if (a === "--host") args.host = argv[++i] || "";
    else if (a === "--provider") args.provider = argv[++i] || "";
    else if (a.startsWith("--provider=")) args.provider = a.slice(11);
  }
  return args;
}

function resolveProvider(cli) {
  if (cli.provider) return cli.provider;
  if (process.env.LEARN_PROVIDER) return process.env.LEARN_PROVIDER;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    return "cloudflare";
  }
  return "ollama";
}

function normalizeReading(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

function extractJsonArray(text) {
  const trimmed = String(text || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }
  // line-ish fallback: "1. ..." / quoted sentences
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^["「]|["」]$/g, "").trim())
    .filter((l) => l.length >= 4 && /[\u4e00-\u9fff]/.test(l));
  return lines;
}

function extractReadingGuess(text, candidates) {
  const n = normalizeReading(text);
  for (const c of candidates) {
    const nc = normalizeReading(c);
    if (n === nc || n.includes(nc)) return nc;
  }
  // look for 「からい」 style
  const m = n.match(/[ぁ-んー]{2,12}/g) || [];
  for (const token of m) {
    if (candidates.map(normalizeReading).includes(token)) return token;
  }
  return null;
}

async function ollamaChat(host, model, messages, { temperature, keepAlive }) {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: keepAlive,
      options: { temperature },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ollama ${model}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data?.message?.content || "";
}

async function ensureOllama(host) {
  const res = await fetch(`${host}/api/tags`);
  if (!res.ok) throw new Error(`Ollama に接続できません: ${host}`);
  const data = await res.json();
  return new Set((data.models || []).map((m) => m.name));
}

function cloudflareCredentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  return { accountId, token };
}

async function cloudflareChat(accountId, token, model, messages, { temperature }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: 512,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`cloudflare ${model}: ${res.status} ${raw.slice(0, 200)}`);
  }
  if (!res.ok || data?.success === false) {
    const err =
      data?.errors?.map((e) => e.message).join("; ") ||
      raw.slice(0, 300) ||
      res.statusText;
    throw new Error(`cloudflare ${model}: ${res.status} ${err}`);
  }
  const result = data?.result;
  if (typeof result === "string") return result;
  if (typeof result?.response === "string") return result.response;
  if (Array.isArray(result?.response)) {
    return result.response.map((x) => x?.content || x).join("\n");
  }
  if (result?.message?.content) return result.message.content;
  return JSON.stringify(result ?? "");
}

async function groqChat(apiKey, model, messages, { temperature }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 512,
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`groq ${model}: ${res.status} ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = data?.error?.message || raw.slice(0, 300) || res.statusText;
    throw new Error(`groq ${model}: ${res.status} ${err}`);
  }
  return data?.choices?.[0]?.message?.content || "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tokenSurface(t) {
  if (typeof t === "string") return t;
  return t?.surface_form || t?.surface || "";
}

function hasTokenBoundary(tokens, surface) {
  return tokens.some((t) => tokenSurface(t) === surface);
}

function surfaceNotSubstringTrap(text, surface, tokens) {
  // 「預金」の中の「金」: surface が文中にあっても、トークン境界で一致しないなら却下
  if (!text.includes(surface)) return false;
  return hasTokenBoundary(tokens, surface);
}

async function appendJsonl(filePath, row) {
  await appendFile(filePath, `${JSON.stringify(row, null, 0)}\n`, "utf8");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const provider = resolveProvider(cli);
  const host = cli.host || config.ollama.host || "http://127.0.0.1:11434";

  let generator;
  let verifier;
  let arbitrator;
  let genTemp;
  let judgeTemp;
  let keepAlive = "0";
  let cfAccountId = "";
  let cfToken = "";
  let groqKey = "";

  if (provider === "groq") {
    const g = config.groq || {};
    const modelSet = cli.fast ? g.fallback_models || g.models : g.models;
    if (!modelSet?.generator) {
      throw new Error("synth-config.json に groq.models がありません");
    }
    generator = modelSet.generator.id;
    verifier = modelSet.verifier.id;
    arbitrator = modelSet.arbitrator.id;
    genTemp = g.temperature ?? 0.7;
    judgeTemp = g.judge_temperature ?? 0.1;
    groqKey = process.env.GROQ_API_KEY || "";
  } else if (provider === "cloudflare") {
    const cf = config.cloudflare || {};
    const modelSet = cli.fast ? cf.fallback_models || cf.models : cf.models;
    if (!modelSet?.generator) {
      throw new Error("synth-config.json に cloudflare.models がありません");
    }
    generator = modelSet.generator.id;
    verifier = modelSet.verifier.id;
    arbitrator = modelSet.arbitrator.id;
    genTemp = cf.temperature ?? 0.7;
    judgeTemp = cf.judge_temperature ?? 0.1;
    ({ accountId: cfAccountId, token: cfToken } = cloudflareCredentials());
  } else if (provider === "ollama") {
    const modelSet = cli.fast ? config.fast_models : config.models;
    generator = modelSet.generator.id;
    verifier = modelSet.verifier.id;
    arbitrator = modelSet.arbitrator.id;
    genTemp = config.ollama.temperature ?? 0.7;
    judgeTemp = config.ollama.judge_temperature ?? 0.1;
    keepAlive = config.ollama.keep_alive ?? "0";
  } else {
    throw new Error(`unknown provider: ${provider} (groq|cloudflare|ollama)`);
  }

  const perTarget =
    cli.perTarget ||
    (provider === "cloudflare" || provider === "groq" ? 1 : config.per_target) ||
    4;
  const skipJudge = new Set(
    (config.skip_llm_judge || []).map((t) => `${t.surface}\0${normalizeReading(t.gold)}`)
  );
  let targets = (config.targets || []).filter((t) => {
    const key = `${t.surface}\0${normalizeReading(t.gold)}`;
    if (skipJudge.has(key)) {
      console.log(`skip LLM target (trust only): ${t.surface}=${t.gold}`);
      return false;
    }
    return true;
  });
  if (cli.limit > 0) targets = targets.slice(0, cli.limit);

  console.log("=== LLM synth (3-family, sequential) ===");
  console.log(`provider=${provider}`);
  if (provider === "ollama") {
    console.log(
      `HW: ${config.hardware.chip} / ${config.hardware.unified_memory_gb}GB`
    );
  } else if (provider === "groq") {
    console.log("HW: Groq free tier (open-weight, no Mac)");
  } else {
    console.log("HW: Cloudflare Workers AI free tier (≤10k neurons/day)");
  }
  console.log(`gen=${generator}  verify=${verifier}  arbitrate=${arbitrator}`);
  console.log(`targets=${targets.length} per_target=${perTarget} fast=${cli.fast}`);
  if ((config.skip_llm_judge || []).length) {
    console.log(
      `trust_only(skip_llm_judge)=${(config.skip_llm_judge || []).map((t) => `${t.surface}=${t.gold}`).join(",")}`
    );
  }

  if (cli.dryRun) {
    if (provider === "groq") {
      console.log(
        groqKey
          ? "dry-run: GROQ_API_KEY present"
          : "dry-run: set GROQ_API_KEY (console.groq.com free)"
      );
    } else if (provider === "cloudflare") {
      console.log(
        cfAccountId && cfToken
          ? "dry-run: Cloudflare credentials present"
          : "dry-run: set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN"
      );
    } else {
      console.log("dry-run: config OK (Ollama 呼び出しなし)");
    }
    return;
  }

  async function chat(model, messages, temperature) {
    if (provider === "groq") {
      const out = await groqChat(groqKey, model, messages, { temperature });
      await sleep(200);
      return out;
    }
    if (provider === "cloudflare") {
      const out = await cloudflareChat(cfAccountId, cfToken, model, messages, {
        temperature,
      });
      await sleep(250);
      return out;
    }
    return ollamaChat(host, model, messages, { temperature, keepAlive });
  }

  if (provider === "groq") {
    if (!groqKey) {
      throw new Error(
        "GROQ_API_KEY が未設定です。https://console.groq.com/keys で無料キーを作成し、\n" +
          "  gh secret set GROQ_API_KEY"
      );
    }
  } else if (provider === "cloudflare") {
    if (!cfAccountId || !cfToken) {
      throw new Error(
        "Cloudflare が未設定です。無料で使うには:\n" +
          "  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN\n" +
          "Actions: Repository secrets に同名で登録"
      );
    }
  } else {
    const available = await ensureOllama(host);
    for (const id of [generator, verifier, arbitrator]) {
      if (!available.has(id)) {
        throw new Error(`モデル未取得: ${id}\n  ollama pull ${id}`);
      }
    }
  }

  await mkdir(outDir, { recursive: true });
  if (!existsSync(acceptedPath)) await writeFile(acceptedPath, "", "utf8");
  if (!existsSync(rejectedPath)) await writeFile(rejectedPath, "", "utf8");

  const tokenize = await createBenchTokenizer();

  let accepted = 0;
  let rejected = 0;
  let authFailures = 0;
  let generateCalls = 0;

  for (const target of targets) {
    const { surface, gold, candidates, hint } = target;
    console.log(`\n--- ${surface}=${gold} (${hint || ""}) ---`);

    const genPrompt = [
      `あなたは日本語の例文作成者です。`,
      `表層「${surface}」を必ず含め、その読みが「${gold}」になる自然な日本語の短い文を ${perTarget} 個作ってください。`,
      `ヒント: ${hint || "なし"}`,
      `制約:`,
      `- 「${surface}」は複合語の一部に埋め込まない（例: 金→預金は禁止）`,
      `- 1文は${config.max_sentence_chars || 60}文字以内`,
      `- 出力は JSON 配列のみ。例: ["文1","文2"]`,
      `- 説明文は書かない`,
    ].join("\n");

    let genRaw = "";
    generateCalls += 1;
    try {
      genRaw = await chat(generator, [{ role: "user", content: genPrompt }], genTemp);
    } catch (err) {
      const msg = String(err.message || err);
      console.error(`generate failed: ${msg}`);
      if (/401|Authentication|Unauthorized|Invalid API Token/i.test(msg)) {
        authFailures += 1;
        if (authFailures >= 2) {
          throw new Error(
            `Cloudflare Auth 失敗が連続しました。API Token を再作成し、` +
              `gh secret set CLOUDFLARE_API_TOKEN で入れ直してください。 (${msg})`
          );
        }
      }
      continue;
    }

    const sentences = extractJsonArray(genRaw)
      .map((s) => (typeof s === "string" ? s : s?.text || s?.sentence || ""))
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, perTarget + 2);

    console.log(`  generated=${sentences.length}`);

    for (const text of sentences) {
      const tokens = tokenize(text) || [];
      const boundaryOk = surfaceNotSubstringTrap(text, surface, tokens);
      if (!boundaryOk) {
        const row = {
          ts: new Date().toISOString(),
          status: "reject",
          reason: "token_boundary",
          text,
          surface,
          gold,
          candidates,
        };
        await appendJsonl(rejectedPath, row);
        rejected += 1;
        console.log(`  REJECT boundary: ${text}`);
        continue;
      }

      const judgePrompt = [
        `次の日本語の文で、表層「${surface}」の読み（ひらがな）を候補から1つだけ選んでください。`,
        `文: ${text}`,
        `候補: ${candidates.join(" / ")}`,
        `出力は読みのひらがな一語だけ。解説禁止。`,
      ].join("\n");

      let verifyRaw = "";
      let arbRaw = "";
      let verifyGuess = null;
      let arbGuess = null;

      try {
        verifyRaw = await chat(
          verifier,
          [{ role: "user", content: judgePrompt }],
          judgeTemp
        );
        verifyGuess = extractReadingGuess(verifyRaw, candidates);
      } catch (err) {
        console.error(`  verify failed: ${err.message}`);
        rejected += 1;
        continue;
      }

      let finalReading = null;
      let source = null;

      if (verifyGuess === normalizeReading(gold)) {
        finalReading = normalizeReading(gold);
        source = "verify_agree";
      } else {
        try {
          arbRaw = await chat(
            arbitrator,
            [{ role: "user", content: judgePrompt }],
            judgeTemp
          );
          arbGuess = extractReadingGuess(arbRaw, candidates);
        } catch (err) {
          console.error(`  arbitrate failed: ${err.message}`);
        }

        if (arbGuess === normalizeReading(gold)) {
          finalReading = normalizeReading(gold);
          source = "arbitrate_agree";
        } else if (
          verifyGuess &&
          arbGuess &&
          verifyGuess === arbGuess &&
          candidates.map(normalizeReading).includes(verifyGuess)
        ) {
          finalReading = null;
          source = "judges_disagree_with_gold";
        } else {
          finalReading = null;
          source = "no_consensus";
        }
      }

      const base = {
        ts: new Date().toISOString(),
        text,
        surface,
        candidates: candidates.map(normalizeReading),
        gold: normalizeReading(gold),
        verify_guess: verifyGuess,
        arbitrate_guess: arbGuess,
        generator,
        verifier,
        arbitrator,
        provider,
        source,
      };

      await appendJsonl(logPath, { ...base, verify_raw: verifyRaw, arb_raw: arbRaw });

      if (finalReading) {
        const row = {
          text,
          surface,
          candidates: base.candidates,
          gold: finalReading,
          source: `llm-synth:${provider}:${source}`,
          note: hint || "",
        };
        await appendJsonl(acceptedPath, row);
        accepted += 1;
        console.log(`  OK [${source}] ${text}`);
      } else {
        await appendJsonl(rejectedPath, {
          ...base,
          status: "reject",
          reason: source,
        });
        rejected += 1;
        console.log(
          `  REJECT ${source}: ${text} (v=${verifyGuess || "?"} a=${arbGuess || "?"})`
        );
      }
    }
  }

  console.log(`\n=== done accepted=${accepted} rejected=${rejected} ===`);
  console.log(`wrote ${acceptedPath}`);
  console.log(`次: npm run learn:merge → corpus/synth-open.jsonl`);
  if (provider === "cloudflare" || provider === "groq") {
    if (generateCalls > 0 && accepted === 0 && rejected === 0) {
      throw new Error(
        "synth produced no accepted/rejected rows — likely provider auth or model failure"
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
