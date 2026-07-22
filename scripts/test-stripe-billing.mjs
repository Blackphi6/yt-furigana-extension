/**
 * Stripe billing dry-run via Python reading-engine (no Stripe keys).
 * Also asserts production blocks dry-run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const py = path.join(root, ".venv-reading", "bin", "python");

const run = spawnSync(
  py,
  [
    "-c",
    `
import os
os.environ.pop("STRIPE_SECRET_KEY", None)
os.environ.pop("STRIPE_PRICE_ID", None)
os.environ["YT_FURIGANA_ALLOW_DRY_RUN"] = "1"
os.environ.pop("RENDER", None)
os.environ.pop("YT_FURIGANA_ENV", None)
os.environ.pop("YT_FURIGANA_STRICT", None)
from reading_engine.stripe_billing import create_checkout_session, get_order, _allow_dry_run_checkout
assert _allow_dry_run_checkout() is True
result = create_checkout_session(
    success_url="https://example.com/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url="https://example.com/cancel",
    customer_email="t@example.com",
)
assert result["mode"] == "dry-run", result
assert result["licenseKey"].startswith("ytfp_"), result
order = get_order(result["sessionId"])
assert order and order["licenseKey"] == result["licenseKey"]

os.environ["YT_FURIGANA_ENV"] = "production"
assert _allow_dry_run_checkout() is False
try:
    create_checkout_session(success_url="", cancel_url="")
    raise SystemExit("dry-run should fail in production")
except RuntimeError as exc:
    assert "stripe_not_configured" in str(exc)
print({"ok": True, "sessionId": result["sessionId"], "licenseKey": result["licenseKey"]})
`
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: path.join(root, "reading-engine") }
  }
);

if (run.status !== 0) {
  console.error(run.stderr || run.stdout || "stripe dry-run failed");
  process.exit(run.status || 1);
}
console.log(String(run.stdout || "").trim());
console.log("Stripe billing dry-run tests passed.");
