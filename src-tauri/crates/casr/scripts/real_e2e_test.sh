#!/usr/bin/env bash
# scripts/real_e2e_test.sh — Real end-to-end integration test harness for casr.
#
# Discovers REAL sessions from installed providers (Claude Code, Codex, Gemini),
# copies them into isolated sandboxes, runs the full 6-path conversion matrix,
# and validates structural correctness + content fidelity of the output.
#
# Safety: Real provider homes (~/.claude, ~/.codex, ~/.gemini) are NEVER written
# to. All conversions happen inside per-test sandbox directories.
#
# Usage:
#   bash scripts/real_e2e_test.sh
#
# Optional:
#   bash scripts/real_e2e_test.sh --verbose
#   CASR_BIN=/path/to/casr bash scripts/real_e2e_test.sh
#   E2E_ARTIFACTS_DIR=/tmp/casr-e2e bash scripts/real_e2e_test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARGO_TARGET="${CARGO_TARGET_DIR:-$PROJECT_ROOT/target}"
CASR="${CASR_BIN:-$CARGO_TARGET/debug/casr}"
VERBOSE="${VERBOSE:-0}"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose) VERBOSE=1; shift ;;
        --casr-bin)
            [[ $# -lt 2 ]] && { echo "ERROR: --casr-bin requires a path" >&2; exit 2; }
            CASR="$2"; shift 2 ;;
        --artifacts-dir)
            [[ $# -lt 2 ]] && { echo "ERROR: --artifacts-dir requires a path" >&2; exit 2; }
            E2E_ARTIFACTS_DIR="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,/^$/s/^# //p' "$0"; exit 0 ;;
        *)
            echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
    esac
done

# ---------------------------------------------------------------------------
# Timestamp + artifacts
# ---------------------------------------------------------------------------
RUN_TS="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACTS_DIR="${E2E_ARTIFACTS_DIR:-$PROJECT_ROOT/artifacts/real-e2e/$RUN_TS}"
mkdir -p "$ARTIFACTS_DIR"

RUN_LOG="$ARTIFACTS_DIR/run.log"
MATRIX_TSV="$ARTIFACTS_DIR/matrix.tsv"
: > "$RUN_LOG"
printf "pair\tstatus\tsource_id\ttarget_id\tconvert_exit\tverify_stages\ttime_ms\tnotes\n" > "$MATRIX_TSV"

# ---------------------------------------------------------------------------
# Colors (disabled if NO_COLOR is set)
# ---------------------------------------------------------------------------
if [[ -z "${NO_COLOR:-}" ]]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    RESET='\033[0m'
else
    GREEN='' RED='' YELLOW='' CYAN='' BOLD='' DIM='' RESET=''
fi

# ---------------------------------------------------------------------------
# Counters (use $((VAR + 1)) not ((VAR++)) per MEMORY.md)
# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL_START_MS=$(date +%s%N | cut -b1-13)

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
ts_now()  { date -u "+%Y-%m-%dT%H:%M:%S.%3NZ"; }
ts_ms()   { date +%s%N | cut -b1-13; }

log_to_file() { printf "%s\n" "$*" >> "$RUN_LOG"; }

log_section() {
    echo -e "\n${CYAN}${BOLD}=== $1 ===${RESET}"
    log_to_file "=== $1 ==="
}

log_step() {
    echo -e "  ${DIM}[$(ts_now)]${RESET} $1"
    log_to_file "[$(ts_now)] $1"
}

log_verbose() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo -e "  ${DIM}$1${RESET}"
    fi
    log_to_file "$1"
}

status_pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "  ${GREEN}PASS${RESET}: $1"
    log_to_file "PASS: $1"
}

status_fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "  ${RED}FAIL${RESET}: $1"
    log_to_file "FAIL: $1"
}

status_skip() {
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo -e "  ${YELLOW}SKIP${RESET}: $1"
    log_to_file "SKIP: $1"
}

# Run casr with full artifact capture. Sets LAST_EXIT, LAST_STDOUT_FILE, LAST_STDERR_FILE, LAST_DURATION_MS.
run_casr() {
    local prefix="$1"; shift
    local stdout_file="${prefix}.stdout.json"
    local stderr_file="${prefix}.stderr.txt"

    log_to_file "CMD: $CASR $*"
    local start_ms
    start_ms=$(ts_ms)

    set +e
    "$CASR" "$@" > "$stdout_file" 2> "$stderr_file"
    LAST_EXIT=$?
    set -e

    local end_ms
    end_ms=$(ts_ms)
    LAST_DURATION_MS=$((end_ms - start_ms))
    LAST_STDOUT_FILE="$stdout_file"
    LAST_STDERR_FILE="$stderr_file"

    log_to_file "EXIT($LAST_EXIT) ${LAST_DURATION_MS}ms: $CASR $*"

    if [[ "$VERBOSE" == "1" ]]; then
        [[ -s "$stdout_file" ]] && echo "    stdout: $(head -3 "$stdout_file")"
        [[ -s "$stderr_file" ]] && echo "    stderr: $(head -3 "$stderr_file")"
        echo "    exit=$LAST_EXIT time=${LAST_DURATION_MS}ms"
    fi
}

# ---------------------------------------------------------------------------
# Provider slugs and homes
# ---------------------------------------------------------------------------
declare -A PROVIDER_SLUG=( [cc]="claude-code" [cod]="codex" [gmi]="gemini" )
declare -A PROVIDER_HOME=(
    [cc]="${CLAUDE_HOME:-$HOME/.claude}"
    [cod]="${CODEX_HOME:-$HOME/.codex}"
    [gmi]="${GEMINI_HOME:-$HOME/.gemini}"
)
declare -A PROVIDER_HOME_VAR=( [cc]="CLAUDE_HOME" [cod]="CODEX_HOME" [gmi]="GEMINI_HOME" )
ALIASES=(cc cod gmi)

# Discovery results (populated in phase 2)
declare -A DISC_SESSION_ID=()
declare -A DISC_SOURCE_PATH=()
declare -A DISC_MESSAGE_COUNT=()
declare -A DISC_WORKSPACE=()
declare -A DISC_READY=()

# ---------------------------------------------------------------------------
# Phase 1: Prerequisites & Build
# ---------------------------------------------------------------------------
phase_prereqs() {
    log_section "Phase 1: Prerequisites & Build"

    # Check jq
    if ! command -v jq > /dev/null 2>&1; then
        echo "ERROR: jq is required but not found." >&2
        exit 1
    fi
    log_step "jq: $(jq --version)"

    # Check sha256sum
    if ! command -v sha256sum > /dev/null 2>&1; then
        echo "ERROR: sha256sum is required but not found." >&2
        exit 1
    fi
    log_step "sha256sum: available"

    # Build casr
    if [[ ! -x "$CASR" ]]; then
        log_step "Building casr..."
        if command -v rch > /dev/null 2>&1; then
            rch exec cargo build --manifest-path "$PROJECT_ROOT/Cargo.toml" 2>&1 | tail -3
        else
            (cd "$PROJECT_ROOT" && cargo build --quiet)
        fi
    fi

    if [[ ! -x "$CASR" ]]; then
        echo "ERROR: casr binary not found at $CASR" >&2
        exit 1
    fi

    local version
    version=$("$CASR" --version 2>&1 || true)
    log_step "casr: $version ($CASR)"
}

# ---------------------------------------------------------------------------
# Phase 2: Discover Real Sessions (direct filesystem, bypasses slow casr list)
# ---------------------------------------------------------------------------

# Discover a CC session: find recent .jsonl files under ~/.claude/projects/
discover_cc() {
    local home="${PROVIDER_HOME[cc]}"
    local projects_dir="$home/projects"
    [[ -d "$projects_dir" ]] || return 1

    # Find recent JSONL files (top-level session files, not subagent files)
    local candidates
    candidates=$(/usr/bin/find "$projects_dir" -maxdepth 3 -name '*.jsonl' -size +1k 2>/dev/null | head -20)
    [[ -z "$candidates" ]] && return 1

    # Score each: extract message count, prefer 5-100 messages with a workspace
    local best_path="" best_msgs=0 best_sid="" best_cwd=""
    while IFS= read -r cand; do
        # Quick message count: count lines with "message" field
        local msgs
        msgs=$(grep -c '"message"' "$cand" 2>/dev/null || echo 0)
        [[ "$msgs" -lt 3 ]] && continue
        [[ "$msgs" -gt 200 ]] && continue

        # Extract session ID and cwd
        local sid cwd
        sid=$(grep -m1 '"sessionId"' "$cand" 2>/dev/null | jq -r '.sessionId // empty' 2>/dev/null || true)
        cwd=$(grep -m1 '"cwd"' "$cand" 2>/dev/null | jq -r '.cwd // empty' 2>/dev/null || true)
        [[ -z "$sid" ]] && continue

        # Prefer sessions with workspace, in the 5-50 message sweet spot
        if [[ -n "$cwd" && "$msgs" -ge 5 && "$msgs" -le 50 ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"; best_cwd="$cwd"
            break
        fi

        # Otherwise take the first reasonable one
        if [[ -z "$best_path" ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"; best_cwd="$cwd"
        fi
    done <<< "$candidates"

    [[ -z "$best_path" ]] && return 1

    DISC_SESSION_ID[cc]="$best_sid"
    DISC_SOURCE_PATH[cc]="$best_path"
    DISC_MESSAGE_COUNT[cc]="$best_msgs"
    DISC_WORKSPACE[cc]="$best_cwd"
    DISC_READY[cc]="1"
    return 0
}

# Discover a Codex session: find recent rollout-*.jsonl files
discover_codex() {
    local home="${PROVIDER_HOME[cod]}"
    local sessions_dir="$home/sessions"
    [[ -d "$sessions_dir" ]] || return 1

    # Find recent rollout files
    local candidates
    candidates=$(/usr/bin/find "$sessions_dir" -name 'rollout-*.jsonl' -size +1k 2>/dev/null | sort -r 2>/dev/null | head -20)
    [[ -z "$candidates" ]] && return 1

    local best_path="" best_msgs=0 best_sid="" best_cwd=""
    while IFS= read -r cand; do
        local msgs
        msgs=$(wc -l < "$cand" 2>/dev/null || echo 0)
        [[ "$msgs" -lt 3 ]] && continue
        [[ "$msgs" -gt 2000 ]] && continue

        # Extract session ID from first line (session_meta)
        local sid cwd
        sid=$(head -1 "$cand" | jq -r '.payload.id // empty' 2>/dev/null || true)
        cwd=$(head -1 "$cand" | jq -r '.payload.cwd // empty' 2>/dev/null || true)
        [[ -z "$sid" ]] && continue

        if [[ -n "$cwd" && "$msgs" -ge 5 && "$msgs" -le 200 ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"; best_cwd="$cwd"
            break
        fi
        if [[ -z "$best_path" ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"; best_cwd="$cwd"
        fi
    done <<< "$candidates"

    [[ -z "$best_path" ]] && return 1

    DISC_SESSION_ID[cod]="$best_sid"
    DISC_SOURCE_PATH[cod]="$best_path"
    DISC_MESSAGE_COUNT[cod]="$best_msgs"
    DISC_WORKSPACE[cod]="$best_cwd"
    DISC_READY[cod]="1"
    return 0
}

# Discover a Gemini session: find recent session-*.json files under ~/.gemini/tmp/
discover_gemini() {
    local home="${PROVIDER_HOME[gmi]}"
    local tmp_dir="$home/tmp"
    [[ -d "$tmp_dir" ]] || return 1

    # Find recent session files
    local candidates
    candidates=$(/usr/bin/find "$tmp_dir" -name 'session-*.json' -size +500c 2>/dev/null | sort -r 2>/dev/null | head -20)
    [[ -z "$candidates" ]] && return 1

    local best_path="" best_msgs=0 best_sid=""
    while IFS= read -r cand; do
        local msgs sid
        msgs=$(jq '.messages | length' "$cand" 2>/dev/null || echo 0)
        [[ "$msgs" -lt 3 ]] && continue
        [[ "$msgs" -gt 200 ]] && continue

        sid=$(jq -r '.sessionId // empty' "$cand" 2>/dev/null || true)
        [[ -z "$sid" ]] && continue

        if [[ "$msgs" -ge 5 && "$msgs" -le 50 ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"
            break
        fi
        if [[ -z "$best_path" ]]; then
            best_path="$cand"; best_msgs="$msgs"; best_sid="$sid"
        fi
    done <<< "$candidates"

    [[ -z "$best_path" ]] && return 1

    DISC_SESSION_ID[gmi]="$best_sid"
    DISC_SOURCE_PATH[gmi]="$best_path"
    DISC_MESSAGE_COUNT[gmi]="$best_msgs"
    DISC_WORKSPACE[gmi]=""
    DISC_READY[gmi]="1"
    return 0
}

phase_discover() {
    log_section "Phase 2: Discover Real Sessions"

    for alias in "${ALIASES[@]}"; do
        local home="${PROVIDER_HOME[$alias]}"
        DISC_READY["$alias"]="0"

        if [[ ! -d "$home" ]]; then
            log_step "$alias: home $home not found — skipping"
            continue
        fi

        log_step "$alias: scanning filesystem for recent sessions..."

        set +e
        case "$alias" in
            cc)  discover_cc ;;
            cod) discover_codex ;;
            gmi) discover_gemini ;;
        esac
        local disc_exit=$?
        set -e

        if [[ "$disc_exit" -ne 0 || "${DISC_READY[$alias]}" != "1" ]]; then
            log_step "$alias: no suitable sessions found"
            continue
        fi

        # Save discovery data
        jq -n \
            --arg sid "${DISC_SESSION_ID[$alias]}" \
            --arg path "${DISC_SOURCE_PATH[$alias]}" \
            --argjson msgs "${DISC_MESSAGE_COUNT[$alias]}" \
            --arg ws "${DISC_WORKSPACE[$alias]:-}" \
            '{session_id: $sid, source_path: $path, messages: $msgs, workspace: $ws}' \
            > "$ARTIFACTS_DIR/discovery_${alias}_selected.json"

        log_step "$alias: selected session=${DISC_SESSION_ID[$alias]} msgs=${DISC_MESSAGE_COUNT[$alias]} ws=${DISC_WORKSPACE[$alias]:-<none>}"
    done

    echo ""
    echo -e "${BOLD}Discovery summary:${RESET}"
    for alias in "${ALIASES[@]}"; do
        if [[ "${DISC_READY[$alias]}" == "1" ]]; then
            echo -e "  ${GREEN}READY${RESET}: $alias — ${DISC_SESSION_ID[$alias]} (${DISC_MESSAGE_COUNT[$alias]} msgs)"
        else
            echo -e "  ${YELLOW}SKIP${RESET}:  $alias — no usable sessions"
        fi
    done
}

# ---------------------------------------------------------------------------
# Session seeding functions
# ---------------------------------------------------------------------------

# Seed a Claude Code session into sandbox.
# CC structure: $CLAUDE_HOME/projects/<project_dir_key>/<session_id>.jsonl
seed_cc_session() {
    local source_path="$1"
    local sandbox_claude="$2"

    # Extract the project key directory from the real path.
    # Real path looks like: ~/.claude/projects/<key>/<uuid>.jsonl
    # or ~/.claude/projects/<key>/<uuid>/subagents/...
    local projects_rel
    projects_rel=$(echo "$source_path" | sed -n 's|.*/.claude/projects/||p')
    if [[ -z "$projects_rel" ]]; then
        return 1
    fi

    # The key is the first path component after projects/
    local project_key
    project_key=$(echo "$projects_rel" | cut -d'/' -f1)
    local filename
    filename=$(basename "$source_path")

    local target_dir="$sandbox_claude/projects/$project_key"
    mkdir -p "$target_dir"
    cp "$source_path" "$target_dir/$filename"
    echo "$target_dir/$filename"
}

# Seed a Codex session into sandbox.
# Codex structure: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl
seed_codex_session() {
    local source_path="$1"
    local sandbox_codex="$2"

    # Extract relative path from sessions/
    local sessions_rel
    sessions_rel=$(echo "$source_path" | sed -n 's|.*/sessions/||p')
    if [[ -z "$sessions_rel" ]]; then
        return 1
    fi

    local target_path="$sandbox_codex/sessions/$sessions_rel"
    mkdir -p "$(dirname "$target_path")"
    cp "$source_path" "$target_path"
    echo "$target_path"
}

# Seed a Gemini session into sandbox.
# Gemini structure: $GEMINI_HOME/tmp/<hash_or_name>/chats/<session-*.json>
seed_gemini_session() {
    local source_path="$1"
    local sandbox_gemini="$2"

    # Extract relative path from tmp/
    local tmp_rel
    tmp_rel=$(echo "$source_path" | sed -n 's|.*/tmp/||p')
    if [[ -z "$tmp_rel" ]]; then
        return 1
    fi

    local target_path="$sandbox_gemini/tmp/$tmp_rel"
    mkdir -p "$(dirname "$target_path")"
    cp "$source_path" "$target_path"
    echo "$target_path"
}

# ---------------------------------------------------------------------------
# Structural validation functions
# ---------------------------------------------------------------------------

# Validate CC JSONL: every line should parse as JSON with sessionId, type, message fields.
validate_cc_jsonl() {
    local filepath="$1"
    local bad_lines=0
    local total_lines=0
    while IFS= read -r line; do
        total_lines=$((total_lines + 1))
        if ! echo "$line" | jq -e 'has("sessionId") and has("type") and has("message")' > /dev/null 2>&1; then
            bad_lines=$((bad_lines + 1))
        fi
    done < "$filepath"

    if [[ "$total_lines" -eq 0 ]]; then
        echo "FAIL:empty file"
        return 1
    fi
    if [[ "$bad_lines" -gt 0 ]]; then
        echo "FAIL:$bad_lines/$total_lines lines missing required fields"
        return 1
    fi
    echo "OK:$total_lines lines valid"
    return 0
}

# Validate Codex JSONL: first line has type=session_meta, rest have response_item or event_msg.
validate_codex_jsonl() {
    local filepath="$1"
    local line_num=0
    local bad_lines=0
    while IFS= read -r line; do
        line_num=$((line_num + 1))
        if [[ "$line_num" -eq 1 ]]; then
            if ! echo "$line" | jq -e '.type == "session_meta"' > /dev/null 2>&1; then
                echo "FAIL:first line not session_meta"
                return 1
            fi
        else
            if ! echo "$line" | jq -e 'has("type")' > /dev/null 2>&1; then
                bad_lines=$((bad_lines + 1))
            fi
        fi
    done < "$filepath"

    if [[ "$line_num" -eq 0 ]]; then
        echo "FAIL:empty file"
        return 1
    fi
    if [[ "$bad_lines" -gt 0 ]]; then
        echo "FAIL:$bad_lines/$line_num lines missing type field"
        return 1
    fi
    echo "OK:$line_num lines valid"
    return 0
}

# Validate Gemini JSON: root object with sessionId and messages array.
validate_gemini_json() {
    local filepath="$1"
    if ! jq -e 'has("sessionId") and (.messages | type == "array")' "$filepath" > /dev/null 2>&1; then
        echo "FAIL:missing sessionId or messages array"
        return 1
    fi
    local msg_count
    msg_count=$(jq '.messages | length' "$filepath")
    echo "OK:$msg_count messages"
    return 0
}

# ---------------------------------------------------------------------------
# Fidelity check via casr info readback
# ---------------------------------------------------------------------------
check_fidelity() {
    local target_alias="$1"
    local target_session_id="$2"
    local source_msg_count="$3"
    local source_workspace="$4"
    local sandbox_dir="$5"
    local artifact_prefix="$6"

    local info_stdout="${artifact_prefix}_target_info.json"
    local info_stderr="${artifact_prefix}_target_info.stderr.txt"

    # Run casr info on the target session, using sandbox env vars
    set +e
    env \
        CLAUDE_HOME="$sandbox_dir/claude" \
        CODEX_HOME="$sandbox_dir/codex" \
        GEMINI_HOME="$sandbox_dir/gemini" \
        "$CASR" --json info "$target_session_id" > "$info_stdout" 2> "$info_stderr"
    local info_exit=$?
    set -e

    if [[ "$info_exit" -ne 0 ]]; then
        echo "FAIL:casr info exit=$info_exit"
        return 1
    fi

    local target_msgs
    target_msgs=$(jq -r '.messages // 0' "$info_stdout" 2>/dev/null || echo "0")

    # Basic sanity: target should have at least 1 message
    if [[ "$target_msgs" -lt 1 ]]; then
        echo "FAIL:target has $target_msgs messages"
        return 1
    fi

    # Use the conversion output message count (from casr) for comparison, not raw file line count.
    # The source_msg_count from discovery is approximate (raw grep/wc count).
    # casr filters out empty/system messages so the converted count is typically lower.
    # We just verify the target has a reasonable number of messages (at least 50% of raw source count).
    if [[ "$source_msg_count" -gt 0 ]]; then
        local min_expected
        min_expected=$(( (source_msg_count * 50) / 100 ))
        if [[ "$min_expected" -lt 1 ]]; then
            min_expected=1
        fi
        if [[ "$target_msgs" -lt "$min_expected" ]]; then
            echo "FAIL:target msgs $target_msgs < 50% of source $source_msg_count"
            return 1
        fi
    fi

    echo "OK:msgs=$target_msgs"
    return 0
}

# ---------------------------------------------------------------------------
# Phase 3: Run 6-Path Conversion Matrix
# ---------------------------------------------------------------------------

run_conversion_pair() {
    local src="$1"
    local tgt="$2"
    local pair="${src}→${tgt}"
    local pair_safe="${src}_to_${tgt}"
    local pair_dir="$ARTIFACTS_DIR/$pair_safe"
    mkdir -p "$pair_dir"

    log_section "Conversion: $pair"

    # Check readiness
    if [[ "${DISC_READY[$src]}" != "1" ]]; then
        status_skip "$pair (source $src has no sessions)"
        printf "%s\tSKIP\t-\t-\t-\t-\t-\tsource unavailable\n" "$pair" >> "$MATRIX_TSV"
        return
    fi

    local source_session_id="${DISC_SESSION_ID[$src]}"
    local source_path="${DISC_SOURCE_PATH[$src]}"
    local source_msg_count="${DISC_MESSAGE_COUNT[$src]}"
    local source_workspace="${DISC_WORKSPACE[$src]:-}"

    log_step "Source: $src session=$source_session_id msgs=$source_msg_count"

    # --- Step A: Create isolated sandbox ---
    local sandbox
    sandbox=$(mktemp -d "${TMPDIR:-/tmp}/casr-e2e-${pair_safe}-XXXXXX")
    mkdir -p "$sandbox/claude" "$sandbox/codex" "$sandbox/gemini"

    log_step "Sandbox: $sandbox"

    # Seed source session into sandbox
    local seeded_path=""
    case "$src" in
        cc)  seeded_path=$(seed_cc_session "$source_path" "$sandbox/claude") ;;
        cod) seeded_path=$(seed_codex_session "$source_path" "$sandbox/codex") ;;
        gmi) seeded_path=$(seed_gemini_session "$source_path" "$sandbox/gemini") ;;
    esac

    if [[ -z "$seeded_path" ]]; then
        status_fail "$pair — failed to seed source session"
        printf "%s\tFAIL\t%s\t-\t-\t-\t-\tseed failed\n" "$pair" "$source_session_id" >> "$MATRIX_TSV"
        rm -rf "$sandbox"
        return
    fi

    log_step "Seeded: $seeded_path"

    # Save source info
    jq -n \
        --arg sid "$source_session_id" \
        --arg path "$source_path" \
        --argjson msgs "$source_msg_count" \
        --arg ws "$source_workspace" \
        --arg seeded "$seeded_path" \
        '{session_id: $sid, source_path: $path, messages: $msgs, workspace: $ws, seeded_path: $seeded}' \
        > "$pair_dir/source_info.json"

    # --- Step B: Run conversion ---
    local convert_start
    convert_start=$(ts_ms)

    local convert_stdout="$pair_dir/convert.stdout.json"
    local convert_stderr="$pair_dir/convert.stderr.txt"

    log_step "Running: casr --json resume $tgt $source_session_id --source $src --force"

    set +e
    env \
        CLAUDE_HOME="$sandbox/claude" \
        CODEX_HOME="$sandbox/codex" \
        GEMINI_HOME="$sandbox/gemini" \
        "$CASR" --json resume "$tgt" "$source_session_id" --source "$src" --force \
        > "$convert_stdout" 2> "$convert_stderr"
    local convert_exit=$?
    set -e

    local convert_end
    convert_end=$(ts_ms)
    local convert_time=$((convert_end - convert_start))

    log_to_file "convert exit=$convert_exit time=${convert_time}ms"

    if [[ "$VERBOSE" == "1" ]]; then
        [[ -s "$convert_stdout" ]] && echo "    stdout: $(head -5 "$convert_stdout")"
        [[ -s "$convert_stderr" ]] && echo "    stderr: $(head -5 "$convert_stderr")"
    fi

    # --- Step C: 4 verification stages ---
    local stages_passed=0
    local stages_total=4
    local verify_notes=""

    # Stage 1: Conversion exit code + JSON fields
    if [[ "$convert_exit" -ne 0 ]]; then
        status_fail "$pair — stage 1: conversion exit=$convert_exit"
        log_verbose "stderr: $(cat "$convert_stderr" 2>/dev/null | head -10)"
        verify_notes="conversion failed exit=$convert_exit"
        printf "%s\tFAIL\t%s\t-\t%d\t%d/%d\t%d\t%s\n" \
            "$pair" "$source_session_id" "$convert_exit" "$stages_passed" "$stages_total" "$convert_time" "$verify_notes" >> "$MATRIX_TSV"
        rm -rf "$sandbox"
        return
    fi

    # Check JSON output has expected fields
    local ok target_session_id written_path
    ok=$(jq -r '.ok // false' "$convert_stdout" 2>/dev/null || echo "false")
    target_session_id=$(jq -r '.target_session_id // empty' "$convert_stdout" 2>/dev/null || echo "")
    written_path=$(jq -r '.written_paths[0] // empty' "$convert_stdout" 2>/dev/null || echo "")

    if [[ "$ok" == "true" && -n "$target_session_id" && -n "$written_path" ]]; then
        stages_passed=$((stages_passed + 1))
        log_step "Stage 1 PASS: exit=0 ok=true target=$target_session_id"
    else
        status_fail "$pair — stage 1: JSON output missing fields (ok=$ok target=$target_session_id)"
        verify_notes="bad json output"
        printf "%s\tFAIL\t%s\t%s\t%d\t%d/%d\t%d\t%s\n" \
            "$pair" "$source_session_id" "$target_session_id" "$convert_exit" "$stages_passed" "$stages_total" "$convert_time" "$verify_notes" >> "$MATRIX_TSV"
        rm -rf "$sandbox"
        return
    fi

    # Stage 2: Output file exists and is > 100 bytes
    if [[ -f "$written_path" ]]; then
        local file_size
        file_size=$(stat -c%s "$written_path" 2>/dev/null || stat -f%z "$written_path" 2>/dev/null || echo 0)
        if [[ "$file_size" -gt 100 ]]; then
            stages_passed=$((stages_passed + 1))
            log_step "Stage 2 PASS: $written_path exists (${file_size} bytes)"
        else
            status_fail "$pair — stage 2: output file too small (${file_size} bytes)"
            verify_notes="output file ${file_size}b < 100b"
        fi
    else
        status_fail "$pair — stage 2: output file not found: $written_path"
        verify_notes="output file missing"
    fi

    # Stage 3: Structural validation
    local struct_result=""
    set +e
    case "$tgt" in
        cc)  struct_result=$(validate_cc_jsonl "$written_path" 2>/dev/null) ;;
        cod) struct_result=$(validate_codex_jsonl "$written_path" 2>/dev/null) ;;
        gmi) struct_result=$(validate_gemini_json "$written_path" 2>/dev/null) ;;
    esac
    [[ -z "$struct_result" ]] && struct_result="FAIL:no output from validator"
    set -e

    if [[ "$struct_result" == OK:* ]]; then
        stages_passed=$((stages_passed + 1))
        log_step "Stage 3 PASS: structural validation ${struct_result#OK:}"
    else
        status_fail "$pair — stage 3: structural validation ${struct_result#FAIL:}"
        verify_notes="${verify_notes:+$verify_notes; }struct: ${struct_result#FAIL:}"
    fi

    # Stage 4: Content fidelity via casr info readback
    local fidelity_result=""
    set +e
    fidelity_result=$(check_fidelity "$tgt" "$target_session_id" "$source_msg_count" "$source_workspace" "$sandbox" "$pair_dir/fidelity" 2>/dev/null)
    [[ -z "$fidelity_result" ]] && fidelity_result="FAIL:no output from fidelity check"
    set -e

    if [[ "$fidelity_result" == OK:* ]]; then
        stages_passed=$((stages_passed + 1))
        log_step "Stage 4 PASS: fidelity ${fidelity_result#OK:}"
    else
        status_fail "$pair — stage 4: fidelity ${fidelity_result#FAIL:}"
        verify_notes="${verify_notes:+$verify_notes; }fidelity: ${fidelity_result#FAIL:}"
    fi

    # Save target info
    jq -n \
        --arg tid "$target_session_id" \
        --arg wp "$written_path" \
        --argjson stages "$stages_passed" \
        --argjson total "$stages_total" \
        --argjson time "$convert_time" \
        --arg struct "$struct_result" \
        --arg fidelity "$fidelity_result" \
        '{target_session_id: $tid, written_path: $wp, stages_passed: $stages, stages_total: $total, convert_time_ms: $time, structural: $struct, fidelity: $fidelity}' \
        > "$pair_dir/target_info.json"

    # Record result
    if [[ "$stages_passed" -eq "$stages_total" ]]; then
        status_pass "$pair — $stages_passed/$stages_total stages passed (${convert_time}ms)"
        printf "%s\tPASS\t%s\t%s\t%d\t%d/%d\t%d\t%s\n" \
            "$pair" "$source_session_id" "$target_session_id" "$convert_exit" "$stages_passed" "$stages_total" "$convert_time" "all stages passed" >> "$MATRIX_TSV"
    else
        status_fail "$pair — $stages_passed/$stages_total stages passed"
        printf "%s\tFAIL\t%s\t%s\t%d\t%d/%d\t%d\t%s\n" \
            "$pair" "$source_session_id" "$target_session_id" "$convert_exit" "$stages_passed" "$stages_total" "$convert_time" "${verify_notes:-partial failure}" >> "$MATRIX_TSV"
    fi

    # Cleanup sandbox
    rm -rf "$sandbox"
}

phase_conversions() {
    log_section "Phase 3: 6-Path Conversion Matrix"

    run_conversion_pair cc  cod
    run_conversion_pair cod cc
    run_conversion_pair cc  gmi
    run_conversion_pair gmi cc
    run_conversion_pair cod gmi
    run_conversion_pair gmi cod
}

# ---------------------------------------------------------------------------
# Phase 4: Generate Report
# ---------------------------------------------------------------------------
phase_report() {
    log_section "Phase 4: Report"

    local total_end_ms
    total_end_ms=$(ts_ms)
    local total_time=$((total_end_ms - TOTAL_START_MS))
    local total_tests=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))

    # Console matrix
    echo ""
    echo -e "${BOLD}Conversion Matrix:${RESET}"
    echo "────────────────────────────────────────────────────────────────"
    printf "  %-12s %-8s %-36s %s\n" "PAIR" "STATUS" "SESSION" "TIME"
    echo "────────────────────────────────────────────────────────────────"
    # Read TSV (skip header)
    tail -n +2 "$MATRIX_TSV" | while IFS=$'\t' read -r pair status sid tid cexit stages time notes; do
        local color=""
        case "$status" in
            PASS) color="$GREEN" ;;
            FAIL) color="$RED" ;;
            SKIP) color="$YELLOW" ;;
        esac
        printf "  %-12s ${color}%-8s${RESET} %-36s %s\n" "$pair" "$status" "${sid:0:36}" "${time}ms"
    done
    echo "────────────────────────────────────────────────────────────────"
    echo ""

    # JSON report
    local report_json="$ARTIFACTS_DIR/report.json"
    jq -n \
        --arg ts "$RUN_TS" \
        --argjson pass "$PASS_COUNT" \
        --argjson fail "$FAIL_COUNT" \
        --argjson skip "$SKIP_COUNT" \
        --argjson total "$total_tests" \
        --argjson time "$total_time" \
        --arg artifacts "$ARTIFACTS_DIR" \
        '{
            timestamp: $ts,
            passed: $pass,
            failed: $fail,
            skipped: $skip,
            total: $total,
            total_time_ms: $time,
            artifacts_dir: $artifacts,
            result: (if $fail > 0 then "FAIL" elif $pass > 0 then "PASS" else "SKIP" end)
        }' > "$report_json"

    # Summary
    echo -e "${BOLD}Summary:${RESET} ${GREEN}${PASS_COUNT} passed${RESET}, ${RED}${FAIL_COUNT} failed${RESET}, ${YELLOW}${SKIP_COUNT} skipped${RESET} (${total_tests} total, ${total_time}ms)"
    echo -e "Artifacts: ${BOLD}${ARTIFACTS_DIR}${RESET}"

    if [[ "$FAIL_COUNT" -gt 0 ]]; then
        echo ""
        echo -e "${RED}${BOLD}Some tests FAILED.${RESET} Check artifacts for details."
    fi
}

# ---------------------------------------------------------------------------
# Trap: always print summary on exit
# ---------------------------------------------------------------------------
cleanup() {
    local exit_code=$?
    if [[ "$exit_code" -ne 0 ]]; then
        echo ""
        echo -e "${RED}${BOLD}Early exit (code $exit_code).${RESET}"
        echo -e "Partial results in: ${ARTIFACTS_DIR}"
        echo -e "${GREEN}${PASS_COUNT} passed${RESET}, ${RED}${FAIL_COUNT} failed${RESET}, ${YELLOW}${SKIP_COUNT} skipped${RESET}"
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo -e "${BOLD}casr real E2E integration test${RESET}"
    echo "Binary: $CASR"
    echo "Artifacts: $ARTIFACTS_DIR"
    echo ""

    phase_prereqs
    phase_discover
    phase_conversions
    phase_report

    if [[ "$FAIL_COUNT" -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
