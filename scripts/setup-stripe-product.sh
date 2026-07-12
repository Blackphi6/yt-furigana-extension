#!/usr/bin/env bash
# Create / verify YT Furigana Stripe Product + one-time JPY price.
# Uses the currently logged-in Stripe CLI account (same email as other apps;
# this only adds a separate Product with metadata.app=yt-furigana-extension).
set -euo pipefail

NAME="YT Furigana Premium"
DESC="辞書クラウド同期・共有辞書・ホスト読みAPI（買い切り）"
AMOUNT="${STRIPE_AMOUNT_JPY:-980}"
MODE="${1:-test}" # test | live

ARGS=()
if [[ "$MODE" == "live" ]]; then
  ARGS+=(--live)
fi

echo "== Creating product ($MODE) =="
PROD_JSON=$(stripe products create "${ARGS[@]}" \
  --name="$NAME" \
  --description="$DESC" \
  -d "metadata[app]=yt-furigana-extension" \
  -d "metadata[service]=YT Furigana" \
  -d "metadata[plan]=premium" \
  -d "metadata[billing]=one_time")
PROD_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$PROD_JSON")
echo "product=$PROD_ID"

echo "== Creating one-time price ¥${AMOUNT} =="
PRICE_JSON=$(stripe prices create "${ARGS[@]}" \
  --product="$PROD_ID" \
  --unit-amount="$AMOUNT" \
  --currency=jpy \
  -d "nickname=YT Furigana Premium (JPY one-time)" \
  -d "metadata[app]=yt-furigana-extension" \
  -d "metadata[service]=YT Furigana")
PRICE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$PRICE_JSON")
echo "price=$PRICE_ID"

stripe products update "${ARGS[@]}" "$PROD_ID" --default-price="$PRICE_ID" >/dev/null
echo
echo "OK. Export for reading-engine:"
echo "  export STRIPE_PRICE_ID=$PRICE_ID"
echo "  export STRIPE_PRODUCT_ID=$PROD_ID"
if [[ "$MODE" == "live" ]]; then
  echo "  export STRIPE_SECRET_KEY=sk_live_..."
else
  echo "  export STRIPE_SECRET_KEY=sk_test_..."
fi
