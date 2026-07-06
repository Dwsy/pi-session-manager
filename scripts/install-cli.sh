#!/usr/bin/env bash
# Pi Session Manager CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
#        curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes

set -euo pipefail

REPO="dwsy/pi-session-manager"
API_URL="https://api.github.com/repos/${REPO}"
DEFAULT_PREFIX="${INSTALL_PREFIX:-$HOME/.local/bin}"
PREFIX="$DEFAULT_PREFIX"
VERSION="latest"
LANGUAGE="auto"
ASSUME_YES=0
RUN_XATTR=1
VERIFY_AFTER=1
SHOW_HELP=0

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' NC=''
fi

msg() {
  local key="$1"
  case "$LANGUAGE:$key" in
    zh:title) echo "Pi Session Manager CLI 安装器" ;;
    zh:usage) cat <<'EOF'
用法:
  install-cli.sh [选项]

选项:
  --yes              非交互安装，使用默认值
  --prefix <路径>    安装目录，默认 ~/.local/bin
  --version <版本>   指定 GitHub Release tag，默认 latest
  --lang <zh|en>     指定显示语言
  --no-xattr         macOS 下跳过 xattr quarantine 清理
  --no-verify        安装后跳过 pi-session-cli --version 验证
  --help             显示帮助

示例:
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --prefix /usr/local/bin --lang en
EOF
      ;;
    zh:unsupported) echo "不支持的平台" ;;
    zh:detecting) echo "检测平台" ;;
    zh:platform) echo "平台" ;;
    zh:fetch_latest) echo "获取最新版本" ;;
    zh:version) echo "版本" ;;
    zh:install_dir) echo "安装目录" ;;
    zh:prompt_prefix) echo "安装到此目录？" ;;
    zh:creating_dir) echo "创建安装目录" ;;
    zh:downloading) echo "下载 CLI" ;;
    zh:download_failed) echo "下载失败" ;;
    zh:checksum) echo "校验 SHA256" ;;
    zh:checksum_ok) echo "校验通过" ;;
    zh:checksum_skip) echo "未找到 SHA256 文件，跳过校验" ;;
    zh:checksum_bad) echo "SHA256 校验失败" ;;
    zh:installing) echo "安装二进制" ;;
    zh:sudo) echo "需要 sudo 写入安装目录" ;;
    zh:xattr) echo "macOS: 清理 com.apple.quarantine 属性" ;;
    zh:xattr_skip) echo "macOS: 跳过 xattr 清理" ;;
    zh:xattr_missing) echo "macOS: 未找到 xattr，跳过 quarantine 清理" ;;
    zh:path_missing) echo "安装目录不在 PATH 中" ;;
    zh:path_hint) echo "请把下面这行加入 shell 配置文件" ;;
    zh:verify) echo "验证安装" ;;
    zh:verify_ok) echo "安装验证通过" ;;
    zh:verify_fail) echo "安装完成，但验证命令失败" ;;
    zh:done) echo "CLI 安装完成" ;;
    zh:run) echo "运行" ;;
    en:title) echo "Pi Session Manager CLI installer" ;;
    en:usage) cat <<'EOF'
Usage:
  install-cli.sh [options]

Options:
  --yes              Non-interactive install with defaults
  --prefix <path>    Install directory, default ~/.local/bin
  --version <tag>    GitHub Release tag, default latest
  --lang <zh|en>     Display language
  --no-xattr         Skip macOS xattr quarantine cleanup
  --no-verify        Skip pi-session-cli --version after install
  --help             Show help

Examples:
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes
  curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --prefix /usr/local/bin --lang en
EOF
      ;;
    en:unsupported) echo "Unsupported platform" ;;
    en:detecting) echo "Detecting platform" ;;
    en:platform) echo "Platform" ;;
    en:fetch_latest) echo "Fetching latest version" ;;
    en:version) echo "Version" ;;
    en:install_dir) echo "Install directory" ;;
    en:prompt_prefix) echo "Install to this directory?" ;;
    en:creating_dir) echo "Creating install directory" ;;
    en:downloading) echo "Downloading CLI" ;;
    en:download_failed) echo "Download failed" ;;
    en:checksum) echo "Verifying SHA256" ;;
    en:checksum_ok) echo "Checksum verified" ;;
    en:checksum_skip) echo "No SHA256 file found, skipping checksum" ;;
    en:checksum_bad) echo "SHA256 checksum failed" ;;
    en:installing) echo "Installing binary" ;;
    en:sudo) echo "sudo is required to write install directory" ;;
    en:xattr) echo "macOS: clearing com.apple.quarantine attribute" ;;
    en:xattr_skip) echo "macOS: skipping xattr cleanup" ;;
    en:xattr_missing) echo "macOS: xattr not found, skipping quarantine cleanup" ;;
    en:path_missing) echo "Install directory is not in PATH" ;;
    en:path_hint) echo "Add this line to your shell profile" ;;
    en:verify) echo "Verifying install" ;;
    en:verify_ok) echo "Install verified" ;;
    en:verify_fail) echo "Installed, but verification command failed" ;;
    en:done) echo "CLI install complete" ;;
    en:run) echo "Run" ;;
  esac
}

info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
ok() { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
err() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

select_language() {
  if [[ "$LANGUAGE" != "auto" ]]; then
    return
  fi

  case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
    zh*|ZH*) LANGUAGE="zh" ;;
    *) LANGUAGE="en" ;;
  esac
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y) ASSUME_YES=1; shift ;;
      --prefix)
        if [[ $# -lt 2 ]]; then
          err "--prefix requires a path"
          exit 1
        fi
        PREFIX="$2"
        shift 2
        ;;
      --version)
        if [[ $# -lt 2 ]]; then
          err "--version requires a tag"
          exit 1
        fi
        VERSION="$2"
        shift 2
        ;;
      --lang)
        if [[ $# -lt 2 || ! "$2" =~ ^(zh|en)$ ]]; then
          err "--lang requires zh or en"
          exit 1
        fi
        LANGUAGE="$2"
        shift 2
        ;;
      --no-xattr) RUN_XATTR=0; shift ;;
      --no-verify) VERIFY_AFTER=0; shift ;;
      --help|-h)
        SHOW_HELP=1
        shift
        ;;
      *)
        err "Unknown option: $1"
        exit 1
        ;;
    esac
  done
}

detect_platform() {
  local os arch
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)

  case "$os:$arch" in
    darwin:arm64|darwin:aarch64) echo "macos-arm64" ;;
    darwin:x86_64) echo "macos-x64" ;;
    linux:x86_64|linux:amd64) echo "linux-x64" ;;
    *) echo "unsupported" ;;
  esac
}

fetch_latest_version() {
  local latest_url response version

  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" 2>/dev/null || true)
  version=$(printf '%s\n' "$latest_url" | sed -n 's#.*/releases/tag/\([^/?#]*\).*#\1#p' | sed -n '1p')

  if [[ -z "$version" ]]; then
    response=$(curl -fsSL "$API_URL/releases/latest" 2>/dev/null || true)
    version=$(printf '%s\n' "$response" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed -n '1p')
  fi

  if [[ -z "$version" ]]; then
    err "$(msg fetch_latest) failed"
    exit 1
  fi

  printf '%s\n' "$version"
}

has_tty() {
  [[ -r /dev/tty && -w /dev/tty ]]
}

read_tty() {
  local prompt="$1"
  local value
  printf "%s" "$prompt" > /dev/tty
  IFS= read -r value < /dev/tty
  printf '%s\n' "$value"
}

confirm() {
  local prompt="$1"
  if [[ "$ASSUME_YES" -eq 1 ]] || ! has_tty; then
    return 0
  fi

  local answer
  answer=$(read_tty "$prompt [Y/n] ")
  case "$answer" in
    n|N|no|NO|No) return 1 ;;
    *) return 0 ;;
  esac
}

prepare_install_dir() {
  info "$(msg install_dir): ${CYAN}${PREFIX}${NC}"
  if ! confirm "$(msg prompt_prefix)"; then
    PREFIX=$(read_tty "$(msg install_dir): ")
  fi

  if [[ -z "$PREFIX" ]]; then
    err "$(msg install_dir) is empty"
    exit 1
  fi

  if [[ ! -d "$PREFIX" ]]; then
    info "$(msg creating_dir): ${CYAN}${PREFIX}${NC}"
    mkdir -p "$PREFIX"
  fi
}

sha256_file() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi

  err "No SHA256 tool found: shasum or sha256sum"
  exit 1
}

verify_checksum() {
  local file="$1"
  local checksum_file="$2"

  if [[ ! -s "$checksum_file" ]]; then
    warn "$(msg checksum_skip)"
    return
  fi

  info "$(msg checksum)"
  local expected actual
  expected=$(awk '{print $1}' "$checksum_file")
  actual=$(sha256_file "$file")

  if [[ "$expected" != "$actual" ]]; then
    err "$(msg checksum_bad)"
    err "Expected: $expected"
    err "Actual:   $actual"
    exit 1
  fi

  ok "$(msg checksum_ok)"
}

install_binary() {
  local source_path="$1"
  local target_path="$2"

  chmod +x "$source_path"

  info "$(msg installing): ${CYAN}${target_path}${NC}"
  if [[ -w "$PREFIX" || "$EUID" -eq 0 ]]; then
    mv "$source_path" "$target_path"
  else
    info "$(msg sudo)"
    sudo mv "$source_path" "$target_path"
  fi

  chmod +x "$target_path" 2>/dev/null || sudo chmod +x "$target_path"
}

clear_macos_quarantine() {
  local target_path="$1"
  local platform="$2"

  if [[ "$platform" != macos-* ]]; then
    return
  fi

  if [[ "$RUN_XATTR" -eq 0 ]]; then
    warn "$(msg xattr_skip)"
    return
  fi

  if ! command -v xattr >/dev/null 2>&1; then
    warn "$(msg xattr_missing)"
    return
  fi

  info "$(msg xattr)"
  if xattr -dr com.apple.quarantine "$target_path" 2>/dev/null; then
    return
  fi

  sudo xattr -dr com.apple.quarantine "$target_path" 2>/dev/null || warn "$(msg xattr_skip)"
}

check_path() {
  case ":$PATH:" in
    *":$PREFIX:"*) return ;;
  esac

  warn "$(msg path_missing): ${CYAN}${PREFIX}${NC}"
  info "$(msg path_hint):"
  printf "  export PATH=\"%s:\$PATH\"\n" "$PREFIX"
}

verify_install() {
  local target_path="$1"
  if [[ "$VERIFY_AFTER" -eq 0 ]]; then
    return
  fi

  info "$(msg verify)"
  if "$target_path" --version >/dev/null 2>&1; then
    ok "$(msg verify_ok): $("$target_path" --version 2>/dev/null)"
  else
    warn "$(msg verify_fail)"
  fi
}

cleanup_tmpdir() {
  if [[ -n "${TMPDIR_TO_CLEAN:-}" && -d "$TMPDIR_TO_CLEAN" ]]; then
    rm -rf "$TMPDIR_TO_CLEAN"
  fi
}

main() {
  parse_args "$@"
  select_language

  if [[ "$SHOW_HELP" -eq 1 ]]; then
    msg usage
    exit 0
  fi

  info "$(msg title)"

  info "$(msg detecting)"
  local platform
  platform=$(detect_platform)
  if [[ "$platform" == "unsupported" ]]; then
    err "$(msg unsupported): $(uname -s) $(uname -m)"
    exit 1
  fi
  ok "$(msg platform): ${CYAN}${platform}${NC}"

  local version="$VERSION"
  if [[ "$version" == "latest" ]]; then
    info "$(msg fetch_latest)"
    version=$(fetch_latest_version)
  fi
  ok "$(msg version): ${CYAN}${version}${NC}"

  prepare_install_dir

  local asset_name="pi-session-cli-${platform}"
  local download_url="https://github.com/${REPO}/releases/download/${version}/${asset_name}"
  local sha_url="${download_url}.sha256"
  local tmpdir
  tmpdir=$(mktemp -d)
  TMPDIR_TO_CLEAN="$tmpdir"
  trap cleanup_tmpdir EXIT

  info "$(msg downloading): ${CYAN}${asset_name}${NC}"
  if ! curl -fsSL "$download_url" -o "${tmpdir}/${asset_name}"; then
    err "$(msg download_failed): $download_url"
    exit 1
  fi

  curl -fsSL "$sha_url" -o "${tmpdir}/${asset_name}.sha256" 2>/dev/null || true
  verify_checksum "${tmpdir}/${asset_name}" "${tmpdir}/${asset_name}.sha256"

  local target_path="${PREFIX}/pi-session-cli"
  install_binary "${tmpdir}/${asset_name}" "$target_path"
  clear_macos_quarantine "$target_path" "$platform"
  verify_install "$target_path"
  check_path

  ok "$(msg done): ${CYAN}${target_path}${NC}"
  info "$(msg run): ${CYAN}pi-session-cli${NC}"
}

main "$@"
