#!/bin/sh
# End-to-end check against the running preview URL (Vite + API via same origin).
# Usage: sh ./scripts/e2e-preview-check.sh <base-url>
set -e
BASE="${1:-http://localhost:4000}"
J='-H Content-Type:application/json'
u() { node -e 'console.log(crypto.randomUUID())'; }

echo "== health =="
curl -sf "$BASE/api/health" > /dev/null && echo "health OK"

echo "== create room + 4 members =="
ALICE=$(u); BOB=$(u); CAROL=$(u); DAVE=$(u)
CREATE_RESP=$(curl -sf -X POST "$BASE/api/rooms/create" $J -d "{\"name\":\"E2E\",\"creator_id\":\"$ALICE\",\"creator_name\":\"Alice\"}")
ROOM=$(echo "$CREATE_RESP" | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
CODE=$(echo "$CREATE_RESP" | grep -o '"invite_code":"[A-Z0-9]*"' | cut -d'"' -f4)
[ -n "$ROOM" ] && [ -n "$CODE" ] || { echo "FAIL: create response incomplete"; exit 1; }
for m in "Bob:$BOB" "Carol:$CAROL" "Dave:$DAVE"; do
  NAME="${m%%:*}"; UID="${m#*:}"
  curl -sf -X POST "$BASE/api/rooms/join" $J -d "{\"invite_code\":\"$CODE\",\"user_id\":\"$UID\",\"user_name\":\"$NAME\"}" > /dev/null
done
echo "room $ROOM with 4 members"

echo "== expenses: EQUAL / EXACT / PERCENT / SHARES =="
curl -sf -X POST "$BASE/api/rooms/$ROOM/expenses" $J -d "{\"expense_id\":\"$(u)\",\"paid_by\":\"$ALICE\",\"amount_paise\":100000,\"split_type\":\"EQUAL\",\"participant_ids\":[\"$ALICE\",\"$BOB\",\"$CAROL\",\"$DAVE\"]}" > /dev/null
curl -sf -X POST "$BASE/api/rooms/$ROOM/expenses" $J -d "{\"expense_id\":\"$(u)\",\"paid_by\":\"$BOB\",\"amount_paise\":50000,\"split_type\":\"EXACT\",\"participant_ids\":[\"$ALICE\",\"$BOB\"],\"shares\":[{\"user_id\":\"$ALICE\",\"amount_paise\":30000},{\"user_id\":\"$BOB\",\"amount_paise\":20000}]}" > /dev/null
curl -sf -X POST "$BASE/api/rooms/$ROOM/expenses" $J -d "{\"expense_id\":\"$(u)\",\"paid_by\":\"$CAROL\",\"amount_paise\":9900,\"split_type\":\"PERCENT\",\"participant_ids\":[\"$CAROL\",\"$DAVE\"],\"shares\":[{\"user_id\":\"$CAROL\",\"percent\":50},{\"user_id\":\"$DAVE\",\"percent\":50}]}" > /dev/null
curl -sf -X POST "$BASE/api/rooms/$ROOM/expenses" $J -d "{\"expense_id\":\"$(u)\",\"paid_by\":\"$DAVE\",\"amount_paise\":10000,\"split_type\":\"SHARES\",\"participant_ids\":[\"$ALICE\",\"$BOB\",\"$CAROL\",\"$DAVE\"],\"shares\":[{\"user_id\":\"$ALICE\",\"weight\":1},{\"user_id\":\"$BOB\",\"weight\":2},{\"user_id\":\"$CAROL\",\"weight\":1},{\"user_id\":\"$DAVE\",\"weight\":1}]}" > /dev/null
# EXACT mismatch must 422 and write nothing
MISMATCH_CODE=$(curl -s -o /tmp/mismatch.json -w '%{http_code}' -X POST "$BASE/api/rooms/$ROOM/expenses" $J -d "{\"expense_id\":\"$(u)\",\"paid_by\":\"$ALICE\",\"amount_paise\":10000,\"split_type\":\"EXACT\",\"participant_ids\":[\"$ALICE\",\"$BOB\"],\"shares\":[{\"user_id\":\"$ALICE\",\"amount_paise\":6000},{\"user_id\":\"$BOB\",\"amount_paise\":3999}]}")
[ "$MISMATCH_CODE" = "422" ] || { echo "FAIL: expected 422, got $MISMATCH_CODE"; exit 1; }
grep -q EXACT_SUM_MISMATCH /tmp/mismatch.json || { echo "FAIL: wrong error code"; exit 1; }
echo "EXACT mismatch correctly rejected with 422"

echo "== balances: nets sum to zero =="
BAL=$(curl -sf "$BASE/api/rooms/$ROOM/balances")
echo "$BAL" | grep -q '"nets"' || { echo "FAIL: no nets"; exit 1; }
NET_SUM=$(echo "$BAL" | grep -o '"nets":{[^}]*}' | grep -o ':[0-9-]*' | cut -d: -f2 | node -e 'let s=0;require("fs").readFileSync(0,"utf8").trim().split(/\s+/).forEach(v=>s+=Number(v));console.log(s)')
[ "$NET_SUM" = "0" ] || { echo "FAIL: nets sum to $NET_SUM"; exit 1; }
echo "nets sum to 0"

echo "== settlement lifecycle =="
SID=$(curl -sf -X POST "$BASE/api/rooms/$ROOM/settlements" $J -d "{\"settlement_id\":\"$(u)\",\"from_user\":\"$BOB\",\"to_user\":\"$ALICE\",\"amount_paise\":25000,\"status\":\"PENDING\",\"method\":\"UPI\"}" | grep -o '"settlement_id":"[^"]*"' | cut -d'"' -f4)
[ -n "$SID" ] || { echo "FAIL: no settlement id"; exit 1; }
PENDING_COUNT=$(echo "$BAL" | sed -n 's/.*"pending_count":\([0-9]*\).*/\1/p')
curl -sf -X PATCH "$BASE/api/rooms/$ROOM/settlements/$SID" $J -d '{"status":"COMPLETED"}' | grep -q '"status":"COMPLETED"'
curl -sf -X PATCH "$BASE/api/rooms/$ROOM/settlements/$SID" $J -d '{"status":"VOID"}' | grep -q '"status":"VOID"'
curl -sf -X DELETE "$BASE/api/rooms/$ROOM/settlements/$SID" | grep -q '"status":"VOID"'
echo "PENDING → COMPLETED → VOID → delete-void OK"

echo "ALL E2E CHECKS PASSED"
