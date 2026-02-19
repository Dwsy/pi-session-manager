#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:52131}"
TOKEN="${TOKEN:-}"
AUTH_HEADER=()
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
fi

say() { echo "[$(date +%H:%M:%S)] $*"; }

request() {
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"
  local tmp
  tmp=$(mktemp)
  local code
  if [[ -n "$data" ]]; then
    code=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" \
      "${AUTH_HEADER[@]}" -H "Content-Type: application/json" \
      "$BASE_URL$path" -d "$data")
  else
    code=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" \
      "${AUTH_HEADER[@]}" "$BASE_URL$path")
  fi
  echo "$code|$tmp"
}

check_json_field() {
  local file="$1"; local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json,sys
fp,expr=sys.argv[1],sys.argv[2]
obj=json.load(open(fp))
cur=obj
for p in expr.split('.'):
  if p.endswith(']') and '[' in p:
    k,i=p[:-1].split('[')
    cur=cur.get(k,[])
    cur=cur[int(i)] if len(cur)>int(i) else None
  else:
    cur=cur.get(p) if isinstance(cur,dict) else None
  if cur is None:
    print('MISSING');sys.exit(1)
print('OK')
PY
}

say "BASE_URL=$BASE_URL"

# 1) sessions
r=$(request GET "/v1/sessions")
code=${r%%|*}; body=${r#*|}
say "/v1/sessions -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then check_json_field "$body" "success" >/dev/null; fi

# 2) memory/recall
r=$(request POST "/v1/memory/recall" '{"query":"修复报错","top_k":5}')
code=${r%%|*}; body=${r#*|}
say "/v1/memory/recall -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then
  check_json_field "$body" "data.intent" >/dev/null
  check_json_field "$body" "data.confidence" >/dev/null
fi

# 3) memory/unified
r=$(request POST "/v1/memory/unified" '{"query":"修复报错","top_k":5,"experience_limit":5}')
code=${r%%|*}; body=${r#*|}
say "/v1/memory/unified -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then
  check_json_field "$body" "data.intent" >/dev/null
  check_json_field "$body" "data.next_actions" >/dev/null
  check_json_field "$body" "data.experience" >/dev/null
fi

# 4) experience/extract
r=$(request POST "/v1/experience/extract" '{"limit":5}')
code=${r%%|*}; body=${r#*|}
say "/v1/experience/extract -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then check_json_field "$body" "data.items" >/dev/null; fi

# 5) workflow/route-suggest
r=$(request POST "/v1/workflow/route-suggest" '{"query":"实现接口并测试","top_k":5}')
code=${r%%|*}; body=${r#*|}
say "/v1/workflow/route-suggest -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then check_json_field "$body" "data.next_actions" >/dev/null; fi

# 6) analytics/overview
r=$(request GET "/v1/analytics/overview")
code=${r%%|*}; body=${r#*|}
say "/v1/analytics/overview -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then check_json_field "$body" "data.sessions" >/dev/null; fi

# 7) observability/summary
r=$(request GET "/v1/observability/summary")
code=${r%%|*}; body=${r#*|}
say "/v1/observability/summary -> $code"
[[ "$code" == "200" || "$code" == "401" ]] || { cat "$body"; exit 1; }
if [[ "$code" == "200" ]]; then check_json_field "$body" "data.mode" >/dev/null; fi

say "smoke readonly v1 done"
