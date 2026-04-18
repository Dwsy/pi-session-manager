#!/usr/bin/env bash

set -euo pipefail

REPO="Dwsy/pi-session-manager"
INTERVAL=30
LIMIT=20
SHA=""
ONCE=0
WORKFLOW_FILTERS=()
GH_RETRY_COUNT=3
GH_RETRY_DELAY=2

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

log_info() {
  printf "${BLUE}[INFO]${NC} %s\n" "$*"
}

log_ok() {
  printf "${GREEN}[OK]${NC} %s\n" "$*"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$*"
}

log_error() {
  printf "${RED}[ERROR]${NC} %s\n" "$*" >&2
}

usage() {
  cat <<'EOF'
Monitor GitHub Actions runs for a specific commit.

Usage:
  scripts/monitor-gh-runs.sh [options]

Options:
  --repo <owner/name>       GitHub repository (default: Dwsy/pi-session-manager)
  --sha <commit>            Commit SHA to monitor (default: current HEAD)
  --interval <seconds>      Poll interval in seconds (default: 30)
  --limit <n>               Max runs fetched per poll (default: 20)
  --workflow <name>         Limit to workflow name, can be used multiple times
  --once                    Print one snapshot and exit
  -h, --help                Show this help

Examples:
  scripts/monitor-gh-runs.sh
  scripts/monitor-gh-runs.sh --interval 30 --workflow CI --workflow Release
  scripts/monitor-gh-runs.sh --sha f308b84 --once
EOF
}

matches_workflow() {
  local workflow_name="$1"
  if [[ ${#WORKFLOW_FILTERS[@]} -eq 0 ]]; then
    return 0
  fi

  local candidate
  for candidate in "${WORKFLOW_FILTERS[@]}"; do
    if [[ "$workflow_name" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --sha)
      SHA="$2"
      shift 2
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --workflow)
      WORKFLOW_FILTERS+=("$2")
      shift 2
      ;;
    --once)
      ONCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  log_error "gh CLI is required"
  exit 1
fi

if [[ -z "$SHA" ]]; then
  SHA="$(git rev-parse HEAD)"
fi

print_snapshot() {
  local raw_lines=""
  local attempt
  for attempt in $(seq 1 "$GH_RETRY_COUNT"); do
    if raw_lines="$(gh run list \
      --repo "$REPO" \
      --limit "$LIMIT" \
      --json databaseId,workflowName,headSha,status,conclusion,displayTitle,event,createdAt \
      --jq '.[] | select(.headSha == "'"$SHA"'") | [.databaseId, .workflowName, .status, (.conclusion // ""), .event, .createdAt, .displayTitle] | @tsv' 2>/dev/null)"; then
      break
    fi

    if [[ "$attempt" -lt "$GH_RETRY_COUNT" ]]; then
      log_warn "gh API request failed, retrying in ${GH_RETRY_DELAY}s (${attempt}/${GH_RETRY_COUNT})"
      sleep "$GH_RETRY_DELAY"
    else
      log_error "gh API request failed after ${GH_RETRY_COUNT} attempts"
      return 5
    fi
  done

  local filtered_lines=()
  local line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local workflow_name
    workflow_name="$(printf '%s\n' "$line" | cut -f2)"
    if matches_workflow "$workflow_name"; then
      filtered_lines+=("$line")
    fi
  done <<< "$raw_lines"

  printf "\n%s\n" "================================================================"
  log_info "repo=$REPO sha=$SHA time=$(date '+%Y-%m-%d %H:%M:%S')"

  if [[ ${#WORKFLOW_FILTERS[@]} -gt 0 ]]; then
    log_info "workflow filters: ${WORKFLOW_FILTERS[*]}"
  fi

  if [[ ${#filtered_lines[@]} -eq 0 ]]; then
    log_warn "No matching workflow runs found"
    return 2
  fi

  local has_in_progress=0
  local has_failure=0
  local has_cancelled=0
  local has_pending=0
  local has_success=0

  printf "%-12s %-16s %-12s %-12s %-8s %s\n" "Run ID" "Workflow" "Status" "Conclusion" "Event" "Title"
  printf "%-12s %-16s %-12s %-12s %-8s %s\n" "------------" "----------------" "------------" "------------" "--------" "-----"

  for line in "${filtered_lines[@]}"; do
    local run_id workflow_name status conclusion event created_at title
    run_id="$(printf '%s\n' "$line" | cut -f1)"
    workflow_name="$(printf '%s\n' "$line" | cut -f2)"
    status="$(printf '%s\n' "$line" | cut -f3)"
    conclusion="$(printf '%s\n' "$line" | cut -f4)"
    event="$(printf '%s\n' "$line" | cut -f5)"
    created_at="$(printf '%s\n' "$line" | cut -f6)"
    title="$(printf '%s\n' "$line" | cut -f7)"

    printf "%-12s %-16s %-12s %-12s %-8s %s\n" \
      "$run_id" "$workflow_name" "$status" "${conclusion:-"-"}" "$event" "$title"

    case "$status" in
      in_progress|queued|requested|waiting|pending)
        has_in_progress=1
        has_pending=1
        ;;
      completed)
        case "$conclusion" in
          success)
            has_success=1
            ;;
          failure|timed_out|startup_failure|action_required|stale)
            has_failure=1
            ;;
          cancelled|skipped|neutral)
            has_cancelled=1
            ;;
          *)
            has_pending=1
            ;;
        esac
        ;;
      *)
        has_pending=1
        ;;
    esac
  done

  if [[ $has_failure -eq 1 ]]; then
    log_error "Detected failed workflow run"
    return 1
  fi

  if [[ $has_in_progress -eq 1 || $has_pending -eq 1 ]]; then
    log_info "Workflows still running"
    return 3
  fi

  if [[ $has_success -eq 1 && $has_cancelled -eq 0 ]]; then
    log_ok "All matching workflow runs completed successfully"
    return 0
  fi

  if [[ $has_cancelled -eq 1 ]]; then
    log_warn "All matching runs finished, but some were cancelled/skipped"
    return 4
  fi

  log_warn "Workflow state finished with an unexpected combination"
  return 4
}

while true; do
  if print_snapshot; then
    exit 0
  else
    exit_code=$?
  fi
  case "$exit_code" in
    1)
      exit 1
      ;;
    2)
      if [[ $ONCE -eq 1 ]]; then
        exit 2
      fi
      ;;
    3)
      if [[ $ONCE -eq 1 ]]; then
        exit 0
      fi
      ;;
    4)
      exit 4
      ;;
    5)
      exit 5
      ;;
    *)
      exit "$exit_code"
      ;;
  esac

  log_info "Sleeping ${INTERVAL}s before next poll..."
  sleep "$INTERVAL"
done
