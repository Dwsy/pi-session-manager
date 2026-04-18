#!/usr/bin/env bash
#
# Pi Session Manager - Universal Installer
# Supports: macOS (arm64/x64), Linux (x64), Windows (via Git Bash/WSL)
# Usage: curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install.sh | bash
#        ./install.sh [--cli|--gui|--default] [--prefix <path>]

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

REPO="dwsy/pi-session-manager"
API_URL="https://api.github.com/repos/${REPO}"
INSTALL_PREFIX="${INSTALL_PREFIX:-/usr/local/bin}"
DESKTOP_INSTALL_DIR="${DESKTOP_INSTALL_DIR:-$HOME/Applications}"

# ─────────────────────────────────────────────────────────────────────────────
# Colors & Output
# ─────────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  NC='\033[0m' # No Color
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' NC=''
fi

log_info()  { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
log_ok()    { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
log_warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
log_error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

# ─────────────────────────────────────────────────────────────────────────────
# Platform Detection
# ─────────────────────────────────────────────────────────────────────────────

detect_platform() {
  local os arch

  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os" in
    darwin)
      case "$arch" in
        arm64|aarch64) echo "macos-arm64" ;;
        x86_64)        echo "macos-x64" ;;
        *)             echo "unsupported" ;;
      esac
      ;;
    linux)
      case "$arch" in
        x86_64|amd64)  echo "linux-x64" ;;
        aarch64|arm64) echo "linux-arm64" ;;
        *)             echo "unsupported" ;;
      esac
      ;;
    *)
      echo "unsupported"
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument Parsing
# ─────────────────────────────────────────────────────────────────────────────

MODE="default"  # default | cli | gui

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cli)     MODE="cli"; shift ;;
      --gui)     MODE="gui"; shift ;;
      --default) MODE="default"; shift ;;
      --prefix)
        INSTALL_PREFIX="$2"
        shift 2
        ;;
      --help|-h)
        cat << 'EOF'
Pi Session Manager Installer

USAGE:
    install.sh [OPTIONS]

OPTIONS:
    --cli       Install CLI version only (headless server)
    --gui       Install GUI version only (desktop app)
    --default   Install both CLI and GUI (default)
    --prefix    Installation directory (default: /usr/local/bin)
    --help      Show this help message

EXAMPLES:
    # Install both CLI and GUI
    ./install.sh

    # Install CLI only
    ./install.sh --cli

    # Install to custom location
    ./install.sh --prefix ~/.local/bin

EOF
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# GitHub API Helpers
# ─────────────────────────────────────────────────────────────────────────────

fetch_latest_version() {
  local version
  version=$(curl -fsSL "${API_URL}/releases/latest" 2>/dev/null | \
    grep -o '"tag_name": "[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -z "$version" ]]; then
    log_error "Failed to fetch latest version from GitHub"
    exit 1
  fi

  echo "$version"
}

# ─────────────────────────────────────────────────────────────────────────────
# Download & Install
# ─────────────────────────────────────────────────────────────────────────────

download_cli() {
  local version="$1"
  local platform="$2"
  local install_dir="$3"

  local binary_name="pi-session-cli-${platform}"
  local download_url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"
  local sha_url="${download_url}.sha256"

  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '$tmpdir'" EXIT

  log_info "Downloading CLI ${CYAN}${version}${NC} for ${CYAN}${platform}${NC}..."

  if ! curl -fsSL "$download_url" -o "${tmpdir}/${binary_name}" 2>/dev/null; then
    log_error "Failed to download ${binary_name}"
    return 1
  fi

  # Verify checksum if available
  if curl -fsSL "$sha_url" -o "${tmpdir}/${binary_name}.sha256" 2>/dev/null; then
    log_info "Verifying checksum..."
    local expected actual
    expected=$(awk '{print $1}' "${tmpdir}/${binary_name}.sha256")
    actual=$(shasum -a 256 "${tmpdir}/${binary_name}" | awk '{print $1}')

    if [[ "$expected" != "$actual" ]]; then
      log_error "Checksum mismatch!"
      log_error "  Expected: $expected"
      log_error "  Actual:   $actual"
      return 1
    fi
    log_ok "Checksum verified"
  else
    log_warn "No checksum available, skipping verification"
  fi

  # Install
  chmod +x "${tmpdir}/${binary_name}"

  if [[ -w "$install_dir" ]] || [[ "$EUID" -eq 0 ]]; then
    mv "${tmpdir}/${binary_name}" "${install_dir}/pi-session-cli"
  else
    log_info "Requesting sudo privileges for installation..."
    sudo mv "${tmpdir}/${binary_name}" "${install_dir}/pi-session-cli"
  fi

  log_ok "CLI installed to ${CYAN}${install_dir}/pi-session-cli${NC}"
}

download_gui_macos() {
  local version="$1"
  local platform="$2"
  local install_dir="$3"

  local arch_suffix
  [[ "$platform" == "macos-arm64" ]] && arch_suffix="aarch64" || arch_suffix="x64"

  local dmg_name="Pi.Session.Manager_${version#v}_${arch_suffix}.dmg"
  local download_url="https://github.com/${REPO}/releases/download/${version}/${dmg_name}"

  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '$tmpdir'" EXIT

  log_info "Downloading GUI ${CYAN}${version}${NC} for ${CYAN}${platform}${NC}..."

  if ! curl -fsSL "$download_url" -o "${tmpdir}/${dmg_name}" 2>/dev/null; then
    log_error "Failed to download ${dmg_name}"
    return 1
  fi

  log_info "Mounting DMG..."
  local mount_point
  mount_point=$(hdiutil attach "${tmpdir}/${dmg_name}" -nobrowse -readonly | \
    grep -o '/Volumes/.*' | head -1)

  if [[ -z "$mount_point" ]]; then
    log_error "Failed to mount DMG"
    return 1
  fi

  local app_name="Pi Session Manager.app"
  local target_path="${install_dir}/${app_name}"

  if [[ -d "$target_path" ]]; then
    log_warn "Removing existing installation..."
    rm -rf "$target_path"
  fi

  log_info "Installing to ${CYAN}${install_dir}${NC}..."
  cp -R "${mount_point}/${app_name}" "$install_dir/"

  hdiutil detach "$mount_point" -quiet

  log_ok "GUI installed to ${CYAN}${target_path}${NC}"
}

download_gui_linux() {
  local version="$1"
  local install_dir="$2"

  # Tauri AppImage naming: Pi.Session.Manager_{version}_amd64.AppImage
  local appimage_name="Pi.Session.Manager_${version#v}_amd64.AppImage"
  local download_url="https://github.com/${REPO}/releases/download/${version}/${appimage_name}"

  # Fallback to x86_64 naming if amd64 not found
  local alt_name="Pi.Session.Manager_${version#v}_x86_64.AppImage"
  local alt_url="https://github.com/${REPO}/releases/download/${version}/${alt_name}"

  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '$tmpdir'" EXIT

  log_info "Downloading GUI ${CYAN}${version}${NC} for Linux..."

  # Try amd64 first, then x86_64
  if ! curl -fsSL "$download_url" -o "${tmpdir}/${appimage_name}" 2>/dev/null; then
    log_info "Trying alternate naming (x86_64)..."
    appimage_name="$alt_name"
    if ! curl -fsSL "$alt_url" -o "${tmpdir}/${appimage_name}" 2>/dev/null; then
      log_error "Failed to download AppImage"
      log_info "Please download manually from: https://github.com/${REPO}/releases/tag/${version}"
      return 1
    fi
  fi

  # Install to ~/.local/bin
  local bin_dir="$HOME/.local/bin"
  mkdir -p "$bin_dir"

  local target_path="${bin_dir}/pi-session-manager"
  mv "${tmpdir}/${appimage_name}" "$target_path"
  chmod +x "$target_path"

  log_ok "GUI installed to ${CYAN}${target_path}${NC}"
  log_info "Run with: ${CYAN}pi-session-manager${NC}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"

  log_info "Pi Session Manager Installer"
  echo ""

  local platform
  platform=$(detect_platform)

  if [[ "$platform" == "unsupported" ]]; then
    log_error "Unsupported platform: $(uname -s) $(uname -m)"
    exit 1
  fi

  log_info "Detected platform: ${CYAN}${platform}${NC}"
  echo ""

  local version
  version=$(fetch_latest_version)
  log_info "Latest version: ${CYAN}${version}${NC}"
  echo ""

  case "$MODE" in
    cli)
      log_info "Installing CLI only..."
      download_cli "$version" "$platform" "$INSTALL_PREFIX"
      ;;
    gui)
      log_info "Installing GUI only..."
      if [[ "$platform" == macos-* ]]; then
        download_gui_macos "$version" "$platform" "$DESKTOP_INSTALL_DIR"
      elif [[ "$platform" == linux-* ]]; then
        download_gui_linux "$version" "$DESKTOP_INSTALL_DIR"
      fi
      ;;
    default)
      log_info "Installing both CLI and GUI..."
      download_cli "$version" "$platform" "$INSTALL_PREFIX"
      if [[ "$platform" == macos-* ]]; then
        download_gui_macos "$version" "$platform" "$DESKTOP_INSTALL_DIR"
      elif [[ "$platform" == linux-* ]]; then
        download_gui_linux "$version" "$DESKTOP_INSTALL_DIR"
      fi
      ;;
  esac

  echo ""
  log_ok "Installation complete!"
  echo ""

  if [[ "$MODE" == "cli" ]] || [[ "$MODE" == "default" ]]; then
    echo "CLI Quick Start:"
    echo "  ${CYAN}pi-session-cli${NC}"
    echo "  # Open http://localhost:52131 in your browser"
    echo ""
  fi

  if [[ "$MODE" == "gui" ]] || [[ "$MODE" == "default" ]]; then
    if [[ "$platform" == macos-* ]]; then
      echo "GUI: Launch from Applications or run:"
      echo "  ${CYAN}open '${DESKTOP_INSTALL_DIR}/Pi Session Manager.app'${NC}"
    fi
    echo ""
  fi
}

main "$@"
