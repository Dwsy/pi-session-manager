#!/usr/bin/env bash
#
# casr installer — Cross Agent Session Resumer
#
# One-liner install (with cache buster):
#   curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/cross_agent_session_resumer/main/install.sh?$(date +%s)" | bash
#
# Or without cache buster:
#   curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/cross_agent_session_resumer/main/install.sh | bash
#
# Options:
#   --version vX.Y.Z   Install specific version (default: latest)
#   --dest DIR         Install to DIR (default: ~/.local/bin)
#   --system           Install to /usr/local/bin (requires sudo)
#   --easy-mode        Auto-update PATH in shell rc files
#   --yes              Non-interactive; auto-accept install prompts
#   --verify           Run self-test after install
#   --from-source      Build from source instead of downloading binary
#   --quiet            Suppress non-error output
#   --no-gum           Disable gum formatting even if available
#   --no-verify        Skip checksum + signature verification (not recommended)
#   --no-configure     Skip agent auto-configuration (skills/wrappers)
#   --no-skill         Skip skill installation for Claude/Codex
#   --offline TARBALL  Install from local tarball (airgap mode)
#   --force            Reinstall even if same version exists
#
set -euo pipefail
umask 022
shopt -s lastpipe 2>/dev/null || true

# Require bash >= 4.4 for safe empty-array expansion with set -u
if [[ "${BASH_VERSINFO[0]}" -lt 4 || ( "${BASH_VERSINFO[0]}" -eq 4 && "${BASH_VERSINFO[1]}" -lt 4 ) ]]; then
  echo "Error: This installer requires bash >= 4.4 (yours is ${BASH_VERSION})." >&2
  echo "On macOS, install modern bash: brew install bash" >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

VERSION="${VERSION:-}"
OWNER="${OWNER:-Dicklesworthstone}"
REPO="${REPO:-cross_agent_session_resumer}"
BINARY_NAME="casr"
DEST_DEFAULT="$HOME/.local/bin"
DEST="${DEST:-$DEST_DEFAULT}"
EASY=0
ASSUME_YES=0
QUIET=0
VERIFY=0
FROM_SOURCE=0
CHECKSUM="${CHECKSUM:-}"
CHECKSUM_URL="${CHECKSUM_URL:-}"
SIGSTORE_BUNDLE_URL="${SIGSTORE_BUNDLE_URL:-}"
COSIGN_IDENTITY_RE="${COSIGN_IDENTITY_RE:-^https://github.com/${OWNER}/${REPO}/.github/workflows/dist.yml@refs/tags/.*$}"
COSIGN_OIDC_ISSUER="${COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"
ARTIFACT_URL="${ARTIFACT_URL:-}"
LOCK_FILE="/tmp/casr-install.lock"
NO_GUM=0
NO_CHECKSUM=0
NO_CONFIGURE=0
NO_SKILL=0
FORCE_INSTALL=0
OFFLINE_TARBALL=""
PROVIDER_VERSION_TIMEOUT="${CASR_INSTALLER_PROVIDER_VERSION_TIMEOUT:-1}"
SKILL_ARCHIVE_STATUS="not-attempted"
CLAUDE_SKILL_STATUS="not-detected"
CODEX_SKILL_STATUS="not-detected"
CC_WRAPPER_STATUS="not-attempted"
COD_WRAPPER_STATUS="not-attempted"
GMI_WRAPPER_STATUS="not-attempted"

# ═══════════════════════════════════════════════════════════════════════════════
# Output System (Gum + ANSI Dual-Path)
# ═══════════════════════════════════════════════════════════════════════════════

HAS_GUM=0
if command -v gum &>/dev/null && [ -t 1 ]; then
  HAS_GUM=1
fi

log() { [ "$QUIET" -eq 1 ] && return 0; echo -e "$@"; }

info() {
  [ "$QUIET" -eq 1 ] && return 0
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    gum style --foreground 39 "→ $*"
  else
    echo -e "\033[0;34m→\033[0m $*"
  fi
}

ok() {
  [ "$QUIET" -eq 1 ] && return 0
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    gum style --foreground 42 "✓ $*"
  else
    echo -e "\033[0;32m✓\033[0m $*"
  fi
}

warn() {
  [ "$QUIET" -eq 1 ] && return 0
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    gum style --foreground 214 "⚠ $*"
  else
    echo -e "\033[1;33m⚠\033[0m $*"
  fi
}

err() {
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    gum style --foreground 196 "✗ $*" >&2
  else
    echo -e "\033[0;31m✗\033[0m $*" >&2
  fi
}

run_with_spinner() {
  local title="$1"
  shift
  local exit_code=0
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ] && [ "$QUIET" -eq 0 ]; then
    local err_log="$TMP/gum-error.log"
    # Execute the command inside a bash subshell to securely pipe its output to a log file
    # while preserving the exact argument vector ($@) without stringification loss.
    if ! gum spin --spinner dot --title "$title" -- bash -c "\"\$@\" > \"\$0\" 2>&1" "$err_log" "$@"; then
      exit_code=1
    fi
    if [ "$exit_code" -ne 0 ]; then
      err "Command failed: $*"
      [ -f "$err_log" ] && cat "$err_log" >&2
      return $exit_code
    fi
  else
    info "$title"
    "$@" || return $?
  fi
}

# Draw a box around text with automatic width calculation.
# Uses Unicode double-line box characters for consistent visual structure.
# Responsive: clamps to terminal width and truncates long lines.
# Usage: draw_box "color_code" "line1" "line2" ...
draw_box() {
  local color="$1"
  shift
  local lines=("$@")
  local max_width=0
  local esc
  esc=$(printf '\033')
  local strip_ansi_sed="s/${esc}\\[[0-9;]*m//g"

  for line in "${lines[@]}"; do
    local stripped
    stripped=$(printf '%b' "$line" | LC_ALL=C sed "$strip_ansi_sed")
    local len=${#stripped}
    if [ "$len" -gt "$max_width" ]; then
      max_width=$len
    fi
  done

  # Clamp box width to terminal width (leave room for box chars: 2 borders + 4 padding).
  local term_width
  term_width=$(tput cols 2>/dev/null || echo 80)
  local max_content_width=$((term_width - 6))
  if [ "$max_content_width" -lt 20 ]; then
    max_content_width=20
  fi
  if [ "$max_width" -gt "$max_content_width" ]; then
    max_width=$max_content_width
  fi

  local inner_width=$((max_width + 4))
  local border=""
  for ((i=0; i<inner_width; i++)); do
    border+="═"
  done

  printf "\033[%sm╔%s╗\033[0m\n" "$color" "$border"

  for line in "${lines[@]}"; do
    local stripped
    stripped=$(printf '%b' "$line" | LC_ALL=C sed "$strip_ansi_sed")
    local len=${#stripped}
    # Truncate lines that exceed the available width.
    if [ "$len" -gt "$max_width" ]; then
      # Truncate the visible (stripped) content and re-apply to raw line.
      # For simplicity, cut raw line bytes; ANSI codes near the cut may break
      # but this is acceptable for a cosmetic display function.
      line=$(printf '%b' "$line" | cut -c1-"$max_width")
      stripped=$(printf '%b' "$line" | LC_ALL=C sed "$strip_ansi_sed")
      len=${#stripped}
    fi
    local padding=$((max_width - len))
    local pad_str=""
    for ((i=0; i<padding; i++)); do
      pad_str+=" "
    done
    printf "\033[%sm║\033[0m  %b%s  \033[%sm║\033[0m\n" "$color" "$line" "$pad_str" "$color"
  done

  printf "\033[%sm╚%s╝\033[0m\n" "$color" "$border"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Proxy Support
# ═══════════════════════════════════════════════════════════════════════════════

PROXY_ARGS=()

setup_proxy() {
  PROXY_ARGS=()
  if [[ -n "${HTTPS_PROXY:-}" ]]; then
    PROXY_ARGS=(--proxy "$HTTPS_PROXY")
    info "Using HTTPS proxy: $HTTPS_PROXY"
  elif [[ -n "${HTTP_PROXY:-}" ]]; then
    PROXY_ARGS=(--proxy "$HTTP_PROXY")
    info "Using HTTP proxy: $HTTP_PROXY"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Provider Detection
# ═══════════════════════════════════════════════════════════════════════════════

DETECTED_PROVIDERS=()
CLAUDE_VERSION=""
CODEX_VERSION=""
GEMINI_VERSION=""
CURSOR_VERSION=""
AIDER_VERSION=""
AMP_VERSION=""
OPENCODE_VERSION=""

print_provider_scan_notice() {
  [ "$QUIET" -eq 1 ] && return 0

  local line1="Scanning for installed coding agent providers..."
  local line2="casr converts sessions between detected providers."

  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    echo ""
    gum style \
      --border normal \
      --border-foreground 244 \
      --padding "0 1" \
      "$(gum style --foreground 212 --bold 'Provider scan')" \
      "$(gum style --foreground 247 "$line1")" \
      "$(gum style --foreground 245 "$line2")"
    echo ""
  else
    echo ""
    draw_box "0;36" "$line1" "$line2"
    echo ""
  fi
}

try_version() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || return 0

  local timeout_secs="${PROVIDER_VERSION_TIMEOUT:-1}"
  if ! [[ "$timeout_secs" =~ ^[0-9]+$ ]]; then
    timeout_secs=1
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout_secs" "$cmd" --version 2>/dev/null | head -1 || true
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$timeout_secs" "$cmd" --version 2>/dev/null | head -1 || true
  else
    "$cmd" --version 2>/dev/null | head -1 || true
  fi
}

detect_providers() {
  DETECTED_PROVIDERS=()

  # Claude Code (cc)
  if [[ -d "$HOME/.claude" ]] || command -v claude &>/dev/null; then
    DETECTED_PROVIDERS+=("claude-code")
    CLAUDE_VERSION=$(try_version claude)
  fi

  # Codex CLI (cod)
  if [[ -d "$HOME/.codex" ]] || command -v codex &>/dev/null; then
    DETECTED_PROVIDERS+=("codex")
    CODEX_VERSION=$(try_version codex)
  fi

  # Gemini CLI (gmi)
  if [[ -d "$HOME/.gemini" ]] || [[ -d "$HOME/.gemini-cli" ]] || command -v gemini &>/dev/null; then
    DETECTED_PROVIDERS+=("gemini")
    GEMINI_VERSION=$(try_version gemini)
  fi

  # Cursor (cur)
  local cursor_settings_mac="$HOME/Library/Application Support/Cursor/User/settings.json"
  local cursor_settings_linux="$HOME/.config/Cursor/User/settings.json"
  if [[ -d "$HOME/.cursor" ]] || [[ -f "$cursor_settings_mac" ]] || [[ -f "$cursor_settings_linux" ]] || command -v cursor &>/dev/null; then
    DETECTED_PROVIDERS+=("cursor")
    CURSOR_VERSION=$(try_version cursor)
  fi

  # Cline (cln)
  if [[ -d "$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev" ]]; then
    DETECTED_PROVIDERS+=("cline")
  fi

  # Aider (aid)
  if command -v aider &>/dev/null; then
    DETECTED_PROVIDERS+=("aider")
    AIDER_VERSION=$(try_version aider)
  fi

  # Amp (amp)
  if [[ -d "$HOME/.local/share/amp" ]] || command -v amp &>/dev/null; then
    DETECTED_PROVIDERS+=("amp")
    AMP_VERSION=$(try_version amp)
  fi

  # OpenCode (opc)
  if [[ -d "$HOME/.opencode" ]] || command -v opencode &>/dev/null; then
    DETECTED_PROVIDERS+=("opencode")
    OPENCODE_VERSION=$(try_version opencode)
  fi

  # ChatGPT (gpt)
  if [[ -d "$HOME/.chatgpt" ]]; then
    DETECTED_PROVIDERS+=("chatgpt")
  fi
}

print_detected_providers() {
  if [[ ${#DETECTED_PROVIDERS[@]} -eq 0 ]]; then
    warn "No coding agent providers detected"
    info "Install at least two providers to use casr for session conversion"
    return
  fi

  local count=${#DETECTED_PROVIDERS[@]}
  local plural=""
  [[ $count -gt 1 ]] && plural="s"

  format_provider_line() {
    local name="$1"
    local alias="$2"
    local ver="$3"
    local ver_info=""
    [[ -n "$ver" ]] && ver_info=" ($ver)"
    if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
      gum style --foreground 42 "  ✓ ${name} [${alias}]${ver_info}"
    else
      echo -e "  \033[0;32m✓\033[0m ${name} [${alias}]${ver_info}"
    fi
  }

  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    echo ""
    gum style --foreground 39 --bold "Detected ${count} Provider${plural} (casr conversion targets):"
  else
    echo ""
    echo -e "\033[1;34mDetected ${count} Provider${plural} (casr conversion targets):\033[0m"
  fi

  for provider in "${DETECTED_PROVIDERS[@]}"; do
    case "$provider" in
      claude-code) format_provider_line "Claude Code" "cc" "$CLAUDE_VERSION" ;;
      codex)       format_provider_line "Codex CLI"   "cod" "$CODEX_VERSION" ;;
      gemini)      format_provider_line "Gemini CLI"  "gmi" "$GEMINI_VERSION" ;;
      cursor)      format_provider_line "Cursor"      "cur" "$CURSOR_VERSION" ;;
      cline)       format_provider_line "Cline"       "cln" "" ;;
      aider)       format_provider_line "Aider"       "aid" "$AIDER_VERSION" ;;
      amp)         format_provider_line "Amp"         "amp" "$AMP_VERSION" ;;
      opencode)    format_provider_line "OpenCode"    "opc" "$OPENCODE_VERSION" ;;
      chatgpt)     format_provider_line "ChatGPT"     "gpt" "" ;;
    esac
  done
  echo ""

  if [ "$count" -ge 2 ]; then
    info "casr can convert sessions between any pair of detected providers"
  else
    info "Install a second provider to enable cross-provider session conversion"
  fi
}

# Returns 0 if a provider slug is present in DETECTED_PROVIDERS.
has_provider() {
  local needle="$1"
  local provider=""
  for provider in "${DETECTED_PROVIDERS[@]}"; do
    if [ "$provider" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
# Agent Auto-Configuration (Skills + Wrapper Commands)
# ═══════════════════════════════════════════════════════════════════════════════

CASR_SKILL_ARCHIVE=""

write_inline_skill() {
  local dest="$1"
  mkdir -p "$dest"
  cat > "$dest/SKILL.md" <<'SKILL_EOF'
---
name: casr
description: >-
  Cross Agent Session Resumer. Convert and resume sessions across Claude Code,
  Codex, Gemini, and other providers.
---

# casr — Cross Agent Session Resumer

Use `casr` when you need to keep working on the same session but switch providers.

## Fast Path

```bash
casr list
casr info <session-id>
casr -cc <session-id>   # open in Claude Code
casr -cod <session-id>  # open in Codex
casr -gmi <session-id>  # open in Gemini
```

## Helpful Commands

```bash
casr providers
casr list --workspace "$(pwd)" --sort date --limit 20
casr cod resume <session-id> --source cc
casr info <session-id> --json
```

## Notes

- `casr list` is project-scoped to your current working directory by default.
- `-cc`, `-cod`, and `-gmi` auto-detect source provider from the session ID.
- Use `--json` output mode for automation.
SKILL_EOF
}

download_skill_archive() {
  [ "$NO_SKILL" -eq 1 ] && return 1

  local dest="$TMP/casr-skill.tar.gz"
  local urls=(
    "https://github.com/${OWNER}/${REPO}/releases/download/${VERSION}/skill.tar.gz"
    "https://github.com/${OWNER}/${REPO}/releases/latest/download/skill.tar.gz"
  )
  local url=""
  for url in "${urls[@]}"; do
    if curl -fsSL "${PROXY_ARGS[@]}" "$url" -o "$dest" 2>/dev/null; then
      if tar -tzf "$dest" >/dev/null 2>&1; then
        CASR_SKILL_ARCHIVE="$dest"
        SKILL_ARCHIVE_STATUS="downloaded (${url})"
        return 0
      fi
    fi
  done
  SKILL_ARCHIVE_STATUS="bundled inline skill"
  return 1
}

install_skill_for_agent() {
  local agent_label="$1"
  local skills_root="$2"
  local status_var="$3"

  if [ "$NO_SKILL" -eq 1 ]; then
    printf -v "$status_var" '%s' "skipped (--no-skill)"
    return 0
  fi

  if [ -n "$CASR_SKILL_ARCHIVE" ]; then
    mkdir -p "$skills_root"
    if tar -xzf "$CASR_SKILL_ARCHIVE" -C "$skills_root" 2>/dev/null \
      && [ -f "$skills_root/casr/SKILL.md" ]; then
      printf -v "$status_var" '%s' "installed (release skill.tar.gz)"
      return 0
    fi
  fi

  local skill_dir="$skills_root/casr"
  write_inline_skill "$skill_dir"
  if [ -f "$skill_dir/SKILL.md" ]; then
    printf -v "$status_var" '%s' "installed (inline fallback)"
  else
    printf -v "$status_var" '%s' "failed"
    warn "$agent_label skill install failed"
  fi
}

configure_agent_skills() {
  if [ "$NO_CONFIGURE" -eq 1 ]; then
    CLAUDE_SKILL_STATUS="skipped (--no-configure)"
    CODEX_SKILL_STATUS="skipped (--no-configure)"
    SKILL_ARCHIVE_STATUS="skipped (--no-configure)"
    return 0
  fi

  if [ "$NO_SKILL" -eq 1 ]; then
    SKILL_ARCHIVE_STATUS="skipped (--no-skill)"
  fi

  download_skill_archive || true

  if has_provider "claude-code" || [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
    install_skill_for_agent "Claude Code" "$HOME/.claude/skills" CLAUDE_SKILL_STATUS
  else
    CLAUDE_SKILL_STATUS="not-detected"
  fi

  if has_provider "codex" || [ -d "$HOME/.codex" ] || command -v codex >/dev/null 2>&1; then
    install_skill_for_agent "Codex" "$HOME/.codex/skills" CODEX_SKILL_STATUS
  else
    CODEX_SKILL_STATUS="not-detected"
  fi
}

status_path() {
  local path="$1"
  case "$path" in
    "$HOME"/*) printf '%s/%s' '~' "${path#"$HOME"/}" ;;
    *) printf '%s' "$path" ;;
  esac
}

install_wrapper_command() {
  local alias_name="$1"
  local target_name="$2"
  local status_var="$3"
  local wrapper_path="$DEST/$alias_name"
  local marker="# casr-installer-wrapper"
  local target_path=""

  if [ "$NO_CONFIGURE" -eq 1 ]; then
    printf -v "$status_var" '%s' "skipped (--no-configure)"
    return 0
  fi

  if ! target_path=$(command -v "$target_name" 2>/dev/null); then
    printf -v "$status_var" '%s' "skipped (missing '$target_name')"
    return 0
  fi

  if command -v "$alias_name" >/dev/null 2>&1; then
    local current_alias_path=""
    current_alias_path=$(command -v "$alias_name" 2>/dev/null || true)
    if [ "$current_alias_path" != "$wrapper_path" ]; then
      printf -v "$status_var" '%s' "already exists on PATH ($(status_path "$current_alias_path"))"
      return 0
    fi
  fi

  if [ -f "$wrapper_path" ] && ! grep -Fq "$marker" "$wrapper_path" 2>/dev/null; then
    printf -v "$status_var" '%s' "preserved unmanaged ($(status_path "$wrapper_path"))"
    return 0
  fi

  cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
$marker
exec "${target_path}" "\$@"
EOF
  chmod 0755 "$wrapper_path"
  printf -v "$status_var" '%s' "installed ($(status_path "$wrapper_path") -> $target_name)"
}

configure_provider_wrappers() {
  install_wrapper_command "cc" "claude" CC_WRAPPER_STATUS
  install_wrapper_command "cod" "codex" COD_WRAPPER_STATUS
  install_wrapper_command "gmi" "gemini" GMI_WRAPPER_STATUS
}

configure_agents() {
  configure_provider_wrappers
  configure_agent_skills
}

# ═══════════════════════════════════════════════════════════════════════════════
# Version Resolution
# ═══════════════════════════════════════════════════════════════════════════════

resolve_version() {
  if [ -n "$VERSION" ]; then return 0; fi

  info "Resolving latest version..."
  local latest_url="https://api.github.com/repos/${OWNER}/${REPO}/releases/latest"
  local tag
  if tag=$(curl -fsSL --connect-timeout 5 "${PROXY_ARGS[@]}" \
    -H "Accept: application/vnd.github.v3+json" "$latest_url" 2>/dev/null \
    | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'); then
    if [ -n "$tag" ]; then
      VERSION="$tag"
      info "Resolved latest version: $VERSION"
      return 0
    fi
  fi

  # Fallback: redirect-based resolution (handles GitHub API rate limits)
  local redirect_url="https://github.com/${OWNER}/${REPO}/releases/latest"
  if tag=$(curl -fsSL "${PROXY_ARGS[@]}" -o /dev/null -w '%{url_effective}' "$redirect_url" 2>/dev/null \
    | sed -E 's|.*/tag/||'); then
    if [ -n "$tag" ] && [[ "$tag" =~ ^v[0-9] ]] && [[ "$tag" != *"/"* ]]; then
      VERSION="$tag"
      info "Resolved latest version via redirect: $VERSION"
      return 0
    fi
  fi

  VERSION="v0.1.0"
  warn "Could not resolve latest version; defaulting to $VERSION"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Platform Detection
# ═══════════════════════════════════════════════════════════════════════════════

OS=""
ARCH=""
TARGET=""

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64|amd64) ARCH="x86_64" ;;
    arm64|aarch64) ARCH="aarch64" ;;
    *) warn "Unknown architecture $ARCH, using as-is" ;;
  esac

  # WSL detection
  if [[ "$OS" == "linux" ]] && grep -qi microsoft /proc/version 2>/dev/null; then
    warn "WSL detected. casr will work normally; provider paths may differ from Windows host"
  fi

  TARGET=""
  case "${OS}-${ARCH}" in
    linux-x86_64)   TARGET="x86_64-unknown-linux-musl" ;;
    linux-aarch64)  TARGET="aarch64-unknown-linux-musl" ;;
    darwin-x86_64)  TARGET="x86_64-apple-darwin" ;;
    darwin-aarch64) TARGET="aarch64-apple-darwin" ;;
    *) :;;
  esac

  if [ -z "$TARGET" ] && [ "$FROM_SOURCE" -eq 0 ] && [ -z "$ARTIFACT_URL" ] && [ -z "$OFFLINE_TARBALL" ]; then
    warn "No prebuilt binary for ${OS}/${ARCH}; falling back to build-from-source"
    FROM_SOURCE=1
  fi
}

set_artifact_url() {
  TAR=""
  URL=""
  if [ "$FROM_SOURCE" -eq 0 ] && [ -z "$OFFLINE_TARBALL" ]; then
    if [ -n "$ARTIFACT_URL" ]; then
      TAR=$(basename "$ARTIFACT_URL")
      URL="$ARTIFACT_URL"
    elif [ -n "$TARGET" ]; then
      TAR="casr-${TARGET}.tar.xz"
      URL="https://github.com/${OWNER}/${REPO}/releases/download/${VERSION}/${TAR}"
    else
      warn "No prebuilt artifact for ${OS}/${ARCH}; falling back to build-from-source"
      FROM_SOURCE=1
    fi
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# Preflight Checks
# ═══════════════════════════════════════════════════════════════════════════════

check_disk_space() {
  local min_kb=10240  # 10 MB
  local path="$DEST"
  if [ ! -d "$path" ]; then
    path=$(dirname "$path")
  fi
  if command -v df >/dev/null 2>&1; then
    local avail_kb
    avail_kb=$(df -Pk "$path" | awk 'NR==2 {print $4}')
    if [ -n "$avail_kb" ] && [ "$avail_kb" -lt "$min_kb" ]; then
      err "Insufficient disk space in $path (need at least 10MB)"
      exit 1
    fi
  else
    warn "df not found; skipping disk space check"
  fi
}

check_write_permissions() {
  if [ ! -d "$DEST" ]; then
    if ! mkdir -p "$DEST" 2>/dev/null; then
      err "Cannot create $DEST (insufficient permissions)"
      err "Try running with sudo or choose a writable --dest"
      exit 1
    fi
  fi
  if [ ! -w "$DEST" ]; then
    err "No write permission to $DEST"
    err "Try running with sudo or choose a writable --dest"
    exit 1
  fi
}

check_existing_install() {
  if [ -x "$DEST/$BINARY_NAME" ]; then
    local current
    current=$("$DEST/$BINARY_NAME" --version 2>/dev/null | head -1 || echo "")
    if [ -n "$current" ]; then
      info "Existing casr detected: $current"
    fi
  fi
}

check_network() {
  if [ -n "$OFFLINE_TARBALL" ]; then
    info "Offline mode; skipping network preflight"
    return 0
  fi
  if [ "$FROM_SOURCE" -eq 1 ]; then
    return 0
  fi
  if [ -z "$URL" ]; then
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl not found; skipping network check"
    return 0
  fi
  if ! curl -fsSL "${PROXY_ARGS[@]}" --connect-timeout 3 --max-time 5 -o /dev/null "$URL" 2>/dev/null; then
    warn "Network check failed for $URL"
    warn "Continuing; download may fail"
  fi
}

preflight_checks() {
  info "Running preflight checks"
  check_disk_space
  check_write_permissions
  check_existing_install
  check_network
}

# ═══════════════════════════════════════════════════════════════════════════════
# Version Comparison
# ═══════════════════════════════════════════════════════════════════════════════

check_installed_version() {
  local target_version="$1"
  if [ ! -x "$DEST/$BINARY_NAME" ]; then
    return 1
  fi

  local installed_version
  installed_version=$("$DEST/$BINARY_NAME" --version 2>/dev/null | head -1 | sed -E 's/[^0-9]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

  if [ -z "$installed_version" ]; then
    return 1
  fi

  local target_clean="${target_version#v}"
  local installed_clean="${installed_version#v}"

  INSTALLED_CASR_VERSION="$installed_clean"
  version_at_least "$installed_clean" "$target_clean"
}

version_at_least() {
  local installed="$1"
  local target="$2"
  local installed_major installed_minor installed_patch
  local target_major target_minor target_patch

  IFS=. read -r installed_major installed_minor installed_patch _ <<< "$installed"
  IFS=. read -r target_major target_minor target_patch _ <<< "$target"

  for part in \
    "$installed_major" "$installed_minor" "$installed_patch" \
    "$target_major" "$target_minor" "$target_patch"
  do
    [[ "$part" =~ ^[0-9]+$ ]] || return 1
  done

  if ((10#$installed_major != 10#$target_major)); then
    ((10#$installed_major > 10#$target_major))
    return $?
  fi
  if ((10#$installed_minor != 10#$target_minor)); then
    ((10#$installed_minor > 10#$target_minor))
    return $?
  fi
  ((10#$installed_patch >= 10#$target_patch))
}

# ═══════════════════════════════════════════════════════════════════════════════
# Checksum & Signature Verification
# ═══════════════════════════════════════════════════════════════════════════════

verify_checksum() {
  local file="$1"
  local expected="$2"
  local actual=""

  if [ ! -f "$file" ]; then
    err "File not found: $file"
    return 1
  fi

  if command -v sha256sum &>/dev/null; then
    actual=$(sha256sum "$file" | cut -d' ' -f1)
  elif command -v shasum &>/dev/null; then
    actual=$(shasum -a 256 "$file" | cut -d' ' -f1)
  else
    warn "No SHA256 tool found (sha256sum or shasum); skipping verification"
    return 0
  fi

  if [ "$actual" != "$expected" ]; then
    err "Checksum verification FAILED!"
    err "Expected: $expected"
    err "Got:      $actual"
    err "The downloaded file may be corrupted or tampered with."
    rm -f "$file"
    return 1
  fi

  ok "Checksum verified: ${actual:0:16}..."
  return 0
}

verify_sigstore_bundle() {
  local file="$1"
  local artifact_url="$2"

  if ! command -v cosign &>/dev/null; then
    warn "cosign not found; skipping signature verification (install cosign for stronger authenticity checks)"
    return 0
  fi

  local bundle_url="$SIGSTORE_BUNDLE_URL"
  if [ -z "$bundle_url" ]; then
    bundle_url="${artifact_url}.sigstore.json"
  fi

  local bundle_file=""
  bundle_file="$TMP/$(basename "$bundle_url")"
  info "Fetching sigstore bundle from ${bundle_url}"
  if ! curl -fsSL "${PROXY_ARGS[@]}" "$bundle_url" -o "$bundle_file" 2>/dev/null; then
    warn "Sigstore bundle not found; skipping signature verification"
    return 0
  fi

  if ! cosign verify-blob \
    --bundle "$bundle_file" \
    --certificate-identity-regexp "$COSIGN_IDENTITY_RE" \
    --certificate-oidc-issuer "$COSIGN_OIDC_ISSUER" \
    "$file" 2>/dev/null; then
    return 1
  fi

  ok "Signature verified (cosign)"
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# Rust Toolchain (for build-from-source)
# ═══════════════════════════════════════════════════════════════════════════════

ensure_rust() {
  if [ "${RUSTUP_INIT_SKIP:-0}" != "0" ]; then
    info "Skipping rustup install (RUSTUP_INIT_SKIP set)"
    return 0
  fi
  if command -v cargo >/dev/null 2>&1 && rustc --version 2>/dev/null | grep -q nightly; then return 0; fi
  if [ "$ASSUME_YES" -eq 1 ] || [ "$EASY" -eq 1 ]; then
    info "Auto-accepting Rust nightly install (--yes/--easy-mode)"
  else
    if [ -t 0 ]; then
      echo -n "Install Rust nightly via rustup? (y/N): "
      read -r ans
      case "$ans" in y|Y) :;; *) warn "Skipping rustup install"; return 0;; esac
    fi
  fi
  info "Installing rustup (nightly) — casr requires Rust nightly (edition 2024)"
  curl --proto '=https' --tlsv1.2 -sSf "${PROXY_ARGS[@]}" https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain nightly --profile minimal
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi
  export PATH="$HOME/.cargo/bin:$PATH"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PATH Management
# ═══════════════════════════════════════════════════════════════════════════════

maybe_add_path() {
  case ":$PATH:" in
    *:"$DEST":*) return 0 ;;
    *)
      if [ "$EASY" -eq 1 ]; then
        UPDATED=0
        for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
          if [ -e "$rc" ] && [ -w "$rc" ]; then
            if ! grep -F "$DEST" "$rc" >/dev/null 2>&1; then
              echo "export PATH=\"$DEST:\$PATH\"" >> "$rc"
            fi
            UPDATED=1
          fi
        done
        if [ "$UPDATED" -eq 1 ]; then
          warn "PATH updated in ~/.zshrc/.bashrc; restart shell to use casr"
        else
          warn "Add $DEST to PATH to use casr"
        fi
      else
        warn "Add $DEST to PATH to use casr"
      fi
    ;;
  esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# Shell Completions
# ═══════════════════════════════════════════════════════════════════════════════

detect_default_shell() {
  local shell="${SHELL:-}"
  [ -z "$shell" ] && return 1
  shell=$(basename "$shell")
  case "$shell" in
    bash|zsh|fish) echo "$shell"; return 0 ;;
    *) return 1 ;;
  esac
}

install_completions_for_shell() {
  local shell="$1"
  local bin="$DEST/$BINARY_NAME"
  if [ ! -x "$bin" ]; then
    warn "casr binary not found at $bin; skipping completions"
    return 1
  fi

  # Check if the completions subcommand exists
  if ! "$bin" completions --help >/dev/null 2>&1; then
    info "Shell completions: skipped (not supported in this version)"
    return 0
  fi

  local target=""
  case "$shell" in
    bash)
      target="${XDG_DATA_HOME:-$HOME/.local/share}/bash-completion/completions/casr"
      ;;
    zsh)
      target="${XDG_DATA_HOME:-$HOME/.local/share}/zsh/site-functions/_casr"
      ;;
    fish)
      target="${XDG_CONFIG_HOME:-$HOME/.config}/fish/completions/casr.fish"
      ;;
    *)
      return 1
      ;;
  esac

  if ! mkdir -p "$(dirname "$target")" 2>/dev/null; then
    warn "Failed to create completions directory for $shell"
    return 1
  fi

  local output
  if output=$("$bin" completions "$shell" 2>&1) && [ -n "$output" ]; then
    printf '%s\n' "$output" > "$target"
    ok "Installed $shell completions to $target"
    return 0
  fi

  warn "Failed to generate $shell completions"
  return 1
}

maybe_install_completions() {
  local shell=""
  if ! shell=$(detect_default_shell); then
    info "Shell completions: skipped (unknown shell)"
    return 0
  fi

  install_completions_for_shell "$shell" || true
}

# ═══════════════════════════════════════════════════════════════════════════════
# Self-Test
# ═══════════════════════════════════════════════════════════════════════════════

run_self_test() {
  local bin="$DEST/$BINARY_NAME"
  if [ ! -x "$bin" ]; then
    err "Self-test: binary not found at $bin"
    return 1
  fi

  info "Running self-test..."

  # Test 1: --version
  local ver_output
  if ver_output=$("$bin" --version 2>&1); then
    ok "Self-test: --version works ($ver_output)"
  else
    err "Self-test: --version failed"
    return 1
  fi

  # Test 2: providers command
  if "$bin" providers >/dev/null 2>&1; then
    ok "Self-test: providers command works"
  else
    warn "Self-test: providers command returned non-zero (some providers may not be installed)"
  fi

  # Test 3: list command
  if "$bin" list --limit 1 >/dev/null 2>&1; then
    ok "Self-test: list command works"
  else
    warn "Self-test: list command returned non-zero (no sessions found, which is normal)"
  fi

  ok "Self-test complete"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Usage
# ═══════════════════════════════════════════════════════════════════════════════

usage() {
  cat <<EOFU
Usage: install.sh [OPTIONS]

Options:
  --version vX.Y.Z   Install specific version (default: latest)
  --dest DIR         Install to DIR (default: ~/.local/bin)
  --system           Install to /usr/local/bin (requires sudo)
  --easy-mode        Auto-update PATH in shell rc files
  --yes              Non-interactive; auto-accept install prompts
  --verify           Run self-test after install
  --from-source      Build from source instead of downloading binary
  --quiet            Suppress non-error output
  --no-gum           Disable gum formatting even if available
  --no-verify        Skip checksum + signature verification (not recommended)
  --no-configure     Skip agent auto-configuration (skills/wrappers)
  --no-skill         Skip skill installation for Claude/Codex
  --offline TARBALL  Install from local tarball (airgap mode)
  --force            Force reinstall even if same version is installed

Environment:
  VERSION            Override version to install
  ARTIFACT_URL       Override artifact download URL
  CHECKSUM           Override expected SHA256 checksum
  HTTPS_PROXY        HTTPS proxy URL
  HTTP_PROXY         HTTP proxy URL

Examples:
  # Install latest release
  curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/cross_agent_session_resumer/main/install.sh?\$(date +%s)" | bash

  # Install specific version with self-test
  bash install.sh --version v0.2.0 --verify

  # Install system-wide with auto-PATH + non-interactive prompts
  sudo bash install.sh --system --easy-mode --yes

  # Offline / airgap install
  bash install.sh --offline ./casr-x86_64-unknown-linux-musl.tar.xz

  # Build from source (requires Rust nightly)
  bash install.sh --from-source

  # Install but skip any local agent configuration writes
  bash install.sh --no-configure --no-skill
EOFU
}

# ═══════════════════════════════════════════════════════════════════════════════
# Argument Parsing
# ═══════════════════════════════════════════════════════════════════════════════

needs_arg() { if [ $# -lt 2 ] || [[ "$2" == --* ]]; then err "Missing value for $1"; usage; exit 1; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version)      needs_arg "$@"; VERSION="$2"; shift 2 ;;
    --dest)         needs_arg "$@"; DEST="$2"; shift 2 ;;
    --system)       DEST="/usr/local/bin"; shift ;;
    --easy-mode)    EASY=1; shift ;;
    --yes)          ASSUME_YES=1; shift ;;
    --verify)       VERIFY=1; shift ;;
    --artifact-url) needs_arg "$@"; ARTIFACT_URL="$2"; shift 2 ;;
    --checksum)     needs_arg "$@"; CHECKSUM="$2"; shift 2 ;;
    --checksum-url) needs_arg "$@"; CHECKSUM_URL="$2"; shift 2 ;;
    --from-source)  FROM_SOURCE=1; shift ;;
    --quiet|-q)     QUIET=1; shift ;;
    --no-gum)       NO_GUM=1; shift ;;
    --no-verify)    NO_CHECKSUM=1; shift ;;
    --no-configure) NO_CONFIGURE=1; shift ;;
    --no-skill)     NO_SKILL=1; shift ;;
    --force)        FORCE_INSTALL=1; shift ;;
    --offline)      needs_arg "$@"; OFFLINE_TARBALL="$2"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *)
      err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# ═══════════════════════════════════════════════════════════════════════════════
# Main Installation Flow
# ═══════════════════════════════════════════════════════════════════════════════

# Show branded header
if [ "$QUIET" -eq 0 ]; then
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    gum style \
      --border normal \
      --border-foreground 39 \
      --padding "0 1" \
      --margin "1 0" \
      "$(gum style --foreground 42 --bold 'casr installer')" \
      "$(gum style --foreground 245 'Cross Agent Session Resumer')" \
      "$(gum style --foreground 245 'Resume AI coding sessions across providers')"
  else
    echo ""
    echo -e "\033[1;32mcasr installer\033[0m"
    echo -e "\033[0;90mCross Agent Session Resumer\033[0m"
    echo -e "\033[0;90mResume AI coding sessions across providers\033[0m"
    echo ""
  fi
fi

# Detect providers early (informational display)
print_provider_scan_notice
detect_providers
if [ "$QUIET" -eq 0 ]; then
  print_detected_providers
fi

# Setup proxy
setup_proxy

# Resolve version and platform
resolve_version
detect_platform
set_artifact_url

# Ensure destination directory exists
mkdir -p "$DEST" 2>/dev/null || true

# Preflight
preflight_checks

# ═══════════════════════════════════════════════════════════════════════════════
# Atomic Locking (mkdir-based, cross-platform)
# ═══════════════════════════════════════════════════════════════════════════════

LOCK_DIR="${LOCK_FILE}.d"
LOCKED=0
release_lock_dir() {
  rm -f "$LOCK_DIR/pid" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCKED=1
  echo $$ > "$LOCK_DIR/pid"
else
  if [ -f "$LOCK_DIR/pid" ]; then
    OLD_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
    if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
      release_lock_dir
      if mkdir "$LOCK_DIR" 2>/dev/null; then
        LOCKED=1
        echo $$ > "$LOCK_DIR/pid"
      fi
    fi
  fi
  if [ "$LOCKED" -eq 0 ]; then
    err "Another casr installer is running (lock $LOCK_DIR)"
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Temp Directory & Cleanup Trap
# ═══════════════════════════════════════════════════════════════════════════════

TMP=$(mktemp -d)
cleanup() {
  rm -rf "$TMP" 2>/dev/null || true
  if [ "$LOCKED" -eq 1 ]; then
    release_lock_dir
  fi
}
trap cleanup EXIT

# Check if already at target version.
# Keep post-install steps idempotent so installer still refreshes local setup.
INSTALLED_CASR_VERSION=""
if [ "$FORCE_INSTALL" -eq 0 ] && check_installed_version "$VERSION"; then
  ok "casr $INSTALLED_CASR_VERSION is already installed at $DEST/$BINARY_NAME (target $VERSION)"
  info "Use --force to reinstall"
  INSTALL_SOURCE="already installed ($INSTALLED_CASR_VERSION)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Offline Install Path
# ═══════════════════════════════════════════════════════════════════════════════

INSTALL_SOURCE="${INSTALL_SOURCE:-}"

if [ -n "$OFFLINE_TARBALL" ]; then
  if [ ! -f "$OFFLINE_TARBALL" ]; then
    err "Offline tarball not found: $OFFLINE_TARBALL"
    exit 1
  fi
  info "Installing from offline tarball: $OFFLINE_TARBALL"
  cp "$OFFLINE_TARBALL" "$TMP/artifact.tar.xz"
  tar -xf "$TMP/artifact.tar.xz" -C "$TMP"

  BIN="$TMP/$BINARY_NAME"
  if [ ! -x "$BIN" ] && [ -n "$TARGET" ]; then
    BIN="$TMP/casr-${TARGET}/$BINARY_NAME"
  fi
  if [ ! -x "$BIN" ]; then
    BIN=$(find "$TMP" -maxdepth 3 -type f -name "$BINARY_NAME" -perm -111 | head -n 1)
  fi
  [ -x "$BIN" ] || { err "Binary not found in tarball"; exit 1; }

  install -m 0755 "$BIN" "$DEST/$BINARY_NAME"
  ok "Installed to $DEST/$BINARY_NAME (offline)"
  INSTALL_SOURCE="offline tarball"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Download Binary (with build-from-source fallback)
# ═══════════════════════════════════════════════════════════════════════════════

if [ -z "$INSTALL_SOURCE" ] && [ "$FROM_SOURCE" -eq 0 ] && [ -n "$URL" ]; then
  info "Downloading $URL"
  DOWNLOAD_OK=0
  if run_with_spinner "Downloading casr..." \
    curl -fsSL "${PROXY_ARGS[@]}" "$URL" -o "$TMP/$TAR"; then
    DOWNLOAD_OK=1
  fi

  if [ "$DOWNLOAD_OK" -eq 0 ]; then
    # Tier 2: unversioned latest
    TIER2_URL="https://github.com/${OWNER}/${REPO}/releases/latest/download/casr-${TARGET}.tar.xz"
    info "Trying unversioned latest: $TIER2_URL"
    if curl -fsSL "${PROXY_ARGS[@]}" "$TIER2_URL" -o "$TMP/$TAR" 2>/dev/null; then
      DOWNLOAD_OK=1
    fi
  fi

  if [ "$DOWNLOAD_OK" -eq 0 ]; then
    # Tier 3: simple naming
    TIER3_URL="https://github.com/${OWNER}/${REPO}/releases/latest/download/casr-${OS}-${ARCH}.tar.xz"
    info "Trying simple naming: $TIER3_URL"
    if curl -fsSL "${PROXY_ARGS[@]}" "$TIER3_URL" -o "$TMP/$TAR" 2>/dev/null; then
      DOWNLOAD_OK=1
    fi
  fi

  if [ "$DOWNLOAD_OK" -eq 0 ]; then
    warn "No prebuilt binary found; falling back to build-from-source"
    FROM_SOURCE=1
  fi
fi

if [ -z "$INSTALL_SOURCE" ] && [ "$FROM_SOURCE" -eq 1 ]; then
  info "Building from source (requires git, Rust nightly)"
  ensure_rust
  run_with_spinner "Cloning repository..." \
    git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$TMP/src"
  BUILD_TARGET_DIR="$TMP/src/target"
  run_with_spinner "Building from source (this takes a few minutes)..." \
    bash -c "cd \"\$1\" && CARGO_TARGET_DIR=\"\$2\" cargo build --release --bin \"\$3\"" \
      _ "$TMP/src" "$BUILD_TARGET_DIR" "$BINARY_NAME"
  BIN="$BUILD_TARGET_DIR/release/$BINARY_NAME"
  [ -x "$BIN" ] || { err "Build failed: binary not found at $BIN"; exit 1; }
  install -m 0755 "$BIN" "$DEST/$BINARY_NAME"
  ok "Installed to $DEST/$BINARY_NAME (source build)"
  INSTALL_SOURCE="built from source (Rust nightly)"
fi

# Binary download path (not offline, not from-source)
if [ -z "$INSTALL_SOURCE" ]; then
  # ═════════════════════════════════════════════════════════════════════════════
  # Verify Downloaded Artifact
  # ═════════════════════════════════════════════════════════════════════════════

  if [ "$NO_CHECKSUM" -eq 1 ]; then
    warn "Verification skipped (--no-verify)"
  else
    # Fetch checksum
    if [ -z "$CHECKSUM" ]; then
      [ -z "$CHECKSUM_URL" ] && CHECKSUM_URL="${URL}.sha256"
      info "Fetching checksum from ${CHECKSUM_URL}"
      CHECKSUM_FILE="$TMP/checksum.sha256"
      if curl -fsSL "${PROXY_ARGS[@]}" "$CHECKSUM_URL" -o "$CHECKSUM_FILE" 2>/dev/null; then
        CHECKSUM=$(awk '{print $1}' "$CHECKSUM_FILE")
        if [ -z "$CHECKSUM" ]; then
          warn "Empty checksum file; skipping verification"
        fi
      else
        warn "Checksum file not found; skipping checksum verification"
      fi
    fi

    # Verify checksum if available
    if [ -n "$CHECKSUM" ]; then
      if ! verify_checksum "$TMP/$TAR" "$CHECKSUM"; then
        err "Installation aborted due to checksum failure"
        exit 1
      fi
    fi

    # Verify sigstore bundle (best-effort)
    if ! verify_sigstore_bundle "$TMP/$TAR" "$URL"; then
      err "Signature verification failed"
      err "The downloaded file may be corrupted or tampered with."
      exit 1
    fi
  fi

  # ═════════════════════════════════════════════════════════════════════════════
  # Extract & Install Binary
  # ═════════════════════════════════════════════════════════════════════════════

  info "Extracting"
  tar -xf "$TMP/$TAR" -C "$TMP"

  BIN="$TMP/$BINARY_NAME"
  if [ ! -x "$BIN" ] && [ -n "$TARGET" ]; then
    BIN="$TMP/casr-${TARGET}/$BINARY_NAME"
  fi
  if [ ! -x "$BIN" ]; then
    BIN=$(find "$TMP" -maxdepth 3 -type f -name "$BINARY_NAME" -perm -111 | head -n 1)
  fi
  [ -x "$BIN" ] || { err "Binary not found in archive"; exit 1; }

  install -m 0755 "$BIN" "$DEST/$BINARY_NAME"
  ok "Installed to $DEST/$BINARY_NAME"
  INSTALL_SOURCE="prebuilt binary ($VERSION)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Post-Install (shared across all install paths)
# ═══════════════════════════════════════════════════════════════════════════════

maybe_add_path
maybe_install_completions
configure_agents

if [ "$VERIFY" -eq 1 ]; then
  run_self_test
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Final Summary
# ═══════════════════════════════════════════════════════════════════════════════

PROV_LIST=""
if [[ ${#DETECTED_PROVIDERS[@]} -gt 0 ]]; then
  for p in "${DETECTED_PROVIDERS[@]}"; do
    case "$p" in
      claude-code) PROV_LIST+="cc " ;;
      codex)       PROV_LIST+="cod " ;;
      gemini)      PROV_LIST+="gmi " ;;
      cursor)      PROV_LIST+="cur " ;;
      cline)       PROV_LIST+="cln " ;;
      aider)       PROV_LIST+="aid " ;;
      amp)         PROV_LIST+="amp " ;;
      opencode)    PROV_LIST+="opc " ;;
      chatgpt)     PROV_LIST+="gpt " ;;
    esac
  done
  PROV_LIST="${PROV_LIST% }"
else
  PROV_LIST="none detected"
fi

summary_lines=(
  "Binary:           $DEST/$BINARY_NAME"
  "Version:          $VERSION"
  "Install source:   $INSTALL_SOURCE"
  "Providers:        $PROV_LIST"
  "Skill source:     $SKILL_ARCHIVE_STATUS"
  "Claude skill:     $CLAUDE_SKILL_STATUS"
  "Codex skill:      $CODEX_SKILL_STATUS"
  "Wrapper cc:       $CC_WRAPPER_STATUS"
  "Wrapper cod:      $COD_WRAPPER_STATUS"
  "Wrapper gmi:      $GMI_WRAPPER_STATUS"
  ""
  "Get started:"
  "  casr providers"
  "  casr list"
  "  casr -cc <session-id>"
  "  casr -cod <session-id>"
  "  casr -gmi <session-id>"
  ""
  "Managed paths:"
  "  binary:   $(status_path "$DEST/$BINARY_NAME")"
  "  wrappers: $(status_path "$DEST")/{cc,cod,gmi}"
  "  skills:   ~/.claude/skills/casr and ~/.codex/skills/casr"
)

echo ""

if [ "$QUIET" -eq 0 ]; then
  if [ "$HAS_GUM" -eq 1 ] && [ "$NO_GUM" -eq 0 ]; then
    {
      gum style --foreground 42 --bold 'casr installed successfully!'
      echo ""
      for line in "${summary_lines[@]}"; do
        if [ -z "$line" ]; then
          echo ""
          continue
        fi
        if [[ "$line" == "Get started:" ]] || [[ "$line" == "Managed paths:" ]]; then
          gum style --foreground 245 "$line"
        elif [[ "$line" == "  casr "* ]]; then
          gum style --foreground 39 "$line"
        else
          gum style --foreground 245 "$line"
        fi
      done
    } | gum style --border normal --border-foreground 42 --padding "1 2"
  else
    box_lines=("\033[1;32mcasr installed successfully!\033[0m" "")
    for line in "${summary_lines[@]}"; do
      box_lines+=("$line")
    done
    draw_box "0;32" "${box_lines[@]}"
  fi
fi
