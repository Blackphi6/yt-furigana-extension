#!/usr/bin/env node
/**
 * JRM-style open-weight synthetic labeling:
 *   generate (family A) → blind verify (family B) → arbitrate (family C)
 * + Sudachi token-boundary gate (never accept「預金」中の「金」)
 *
 * Tuned for this machine: MacBook Pro M3 Pro / 36GB unified memory.
 * Models load ONE AT A TIME via Ollama keep_alive=0 (peak ~13GB).
 *
 * Usage:
 *   npm run learn:synth          # default models
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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--fast") args.fast = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i] || 0);
    else if (a === "--per-target") args.perTarget = Number(argv[++i] || 0);
    else if (a === "--host") args.host = argv[++i] || "";
  }
  return args;
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
  const host = cli.host || config.ollama.host || "http://127.0.0.1:11434";
  const modelSet = cli.fast ? config.fast_models : config.models;
  const generator = modelSet.generator.id;
  const verifier = modelSet.verifier.id;
  const arbitrator = modelSet.arbitrator.id;
  const perTarget = cli.perTarget || config.per_target || 4;
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
  console.log(
    `HW: ${config.hardware.chip} / ${config.hardware.unified_memory_gb}GB`
  );
  console.log(`gen=${generator}  verify=${verifier}  arbitrate=${arbitrator}`);
  console.log(`targets=${targets.length} per_target=${perTarget} fast=${cli.fast}`);
  if ((config.skip_llm_judge || []).length) {
    console.log(
      `trust_only(skip_llm_judge)=${(config.skip_llm_judge || []).map((t) => `${t.surface}=${t.gold}`).join(",")}`
    );
  }

  if (cli.dryRun) {
    console.log("dry-run: config OK (Ollama 呼び出しなし)");
    return;
  }

  const available = await ensureOllama(host);
  for (const id of [generator, verifier, arbitrator]) {
    if (!available.has(id)) {
      throw new Error(`モデル未取得: ${id}\n  ollama pull ${id}`);
    }
  }

  await mkdir(outDir, { recursive: true });
  if (!existsSync(acceptedPath)) await writeFile(acceptedPath, "", "utf8");
  if (!existsSync(rejectedPath)) await writeFile(rejectedPath, "", "utf8");

  const tokenize = await createBenchTokenizer();
  const keepAlive = config.ollama.keep_alive ?? "0";
  const genTemp = config.ollama.temperature ?? 0.7;
  const judgeTemp = config.ollama.judge_temperature ?? 0.1;

  let accepted = 0;
  let rejected = 0;

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
    try {
      genRaw = await ollamaChat(
        host,
        generator,
        [{ role: "user", content: genPrompt }],
        { temperature: genTemp, keepAlive }
      );
    } catch (err) {
      console.error(`generate failed: ${err.message}`);
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
        verifyRaw = await ollamaChat(
          host,
          verifier,
          [{ role: "user", content: judgePrompt }],
          { temperature: judgeTemp, keepAlive }
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
          arbRaw = await ollamaChat(
            host,
            arbitrator,
            [{ role: "user", content: judgePrompt }],
            { temperature: judgeTemp, keepAlive }
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
          // both judges agree on something else → discard for our gold target
          // (don't poison with majority wrong labels on intended gold tasks)
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
        source,
      };

      await appendJsonl(logPath, { ...base, verify_raw: verifyRaw, arb_raw: arbRaw });

      if (finalReading) {
        const row = {
          text,
          surface,
          candidates: base.candidates,
          gold: finalReading,
          source: `llm-synth:${source}`,
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
  console.log(`次: npm run learn:ndl-build の seed に混ぜるか、train に --extra で使う`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
