#!/usr/bin/env bash
# Upload dist-store zip to Chrome Web Store (requires OAuth client + refresh token).
# Docs: https://developer.chrome.com/docs/webstore/using-api
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${ROOT}/dist-store/yt-furigana-extension.zip"
ENV_FILE="${ROOT}/store/.env.webstore"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<'EOF'
Missing store/.env.webstore

Create it with:
  EXTENSION_ID=...          # after first manual upload, or leave empty for create
  CLIENT_ID=...
  CLIENT_SECRET=...
  REFRESH_TOKEN=...

Then: npm run pack:store && ./scripts/upload-chrome-store.sh
EOF
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ ! -f "$ZIP" ]]; then
  (cd "$ROOT" && npm run pack:store)
fi

npx --yes chrome-webstore-upload-cli@3 \
  upload \
  --source "$ZIP" \
  ${EXTENSION_ID:+--extension-id "$EXTENSION_ID"} \
  --client-id "$CLIENT_ID" \
  --client-secret "$CLIENT_SECRET" \
  --refresh-token "$REFRESH_TOKEN" \
  --auto-publish=false

echo "Uploaded. Open https://chrome.google.com/webstore/devconsole to submit for review."
