#!/usr/bin/env node
/**
 * Stripe billing dry-run via Python reading-engine (no Stripe keys).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = path.join(root, ".venv-reading", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python3";

const code = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "reading-engine"))})
# Ensure dry-run
os.environ.pop("STRIPE_SECRET_KEY", None)
os.environ.pop("STRIPE_PRICE_ID", None)
from reading_engine.stripe_billing import create_checkout_session, get_order

result = create_checkout_session(
    success_url="https://example.test/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url="https://example.test/pricing.html",
    customer_email="test@example.com",
)
assert result["mode"] == "dry-run", result
assert result["licenseKey"].startswith("ytfp_"), result
assert result["sessionId"] in result["url"], result
order = get_order(result["sessionId"])
assert order and order["licenseKey"] == result["licenseKey"], order
print(json.dumps({"ok": True, "sessionId": result["sessionId"], "licenseKey": result["licenseKey"]}))
`;

const run = spawnSync(python, ["-c", code], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: path.join(root, "reading-engine") }
});

if (run.status !== 0) {
  console.error(run.stderr || run.stdout || "stripe dry-run failed");
  process.exit(run.status || 1);
}

console.log(run.stdout.trim());
console.log("Stripe billing dry-run tests passed.");
