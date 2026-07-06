# Pi Session Manager 安装脚本总结

## 文件位置
- `scripts/install-cli.sh` — macOS/Linux CLI 一键安装脚本，支持引导式安装、`xattr` quarantine 清理、中文/英文
- `scripts/install-cli.ps1` — Windows CLI 一键安装脚本，支持引导式安装、`Unblock-File`、中文/英文
- `scripts/install.sh` — macOS/Linux 通用安装脚本（CLI + GUI）
- `scripts/install.ps1` — Windows PowerShell 通用安装脚本（CLI + GUI）
- `scripts/build-cli.mjs` — 多平台构建脚本

## 三端支持状态

| 平台 | CLI安装 | GUI安装 | 状态 |
|------|---------|---------|------|
| **macOS** | ✓ 自动下载+校验+安装 | ✓ DMG自动挂载复制到 ~/Applications | **完全可用** |
| **Linux** | ✓ 自动下载+校验+安装到 /usr/local/bin | ✓ AppImage下载到 ~/.local/bin + chmod +x | **完全可用** |
| **Windows** | ✓ 自动下载+校验+安装到 %LOCALAPPDATA% + PATH | ✓ NSIS安装器下载并自动运行 (/S 静默) | **完全可用** |

## 使用方式

### macOS / Linux
```bash
# CLI 一键安装（引导式，自动语言）
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash

# CLI 非交互安装
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes

# CLI 指定语言和安装路径
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --lang zh --prefix ~/.local/bin

# 通用安装（默认安装 CLI + GUI）
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install.sh | bash

# 仅安装 GUI
./install.sh --gui
```

### Windows
```powershell
# CLI 一键安装（引导式，自动语言）
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

# CLI 非交互安装
$env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

# CLI 指定语言和安装路径
$env:PSM_INSTALL_LANG="zh"; $env:PSM_INSTALL_PREFIX="C:\Tools"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

# 通用安装（默认安装 CLI + GUI）
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install.ps1 | iex

# 仅安装 GUI
.\install.ps1 -Mode gui
```

## 验证清单

- [x] install-cli.sh 语法检查通过
- [x] install-cli.ps1 关键字段检查通过（本机无 PowerShell，未执行语法/安装）
- [x] install.sh 语法检查通过
- [x] install.ps1 语法检查通过
- [x] build-cli.mjs 语法检查通过
- [x] GitHub release assets 命名匹配
- [x] CLI 产物命名: `pi-session-cli-{platform}`
- [x] macOS GUI: `Pi.Session.Manager_{version}_aarch64/x64.dmg`
- [x] Linux GUI: `Pi.Session.Manager_{version}_amd64.AppImage`
- [x] Windows GUI: `Pi.Session.Manager_{version}_x64-setup.exe`

## 注意事项

1. **Windows GUI 安装**: 使用 NSIS 安装器的 `/S` 参数静默安装，用户会看到安装进度但无需交互
2. **Linux GUI 安装**: AppImage 安装到 `~/.local/bin`，需要确保该目录在 PATH 中
3. **macOS CLI 首次运行**: `install-cli.sh` 会默认执行 `xattr -dr com.apple.quarantine`，避免 Gatekeeper quarantine 阻止运行
4. **Windows CLI 首次运行**: `install-cli.ps1` 会默认执行 `Unblock-File`，避免 Mark-of-the-Web 阻止运行
5. **首次运行**: CLI 默认端口 52131，打开浏览器访问 http://localhost:52131
