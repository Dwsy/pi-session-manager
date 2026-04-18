# Pi Session Manager 安装脚本总结

## 文件位置
- `scripts/install.sh` — macOS/Linux 安装脚本
- `scripts/install.ps1` — Windows PowerShell 安装脚本
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
# 一键安装（默认安装 CLI + GUI）
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install.sh | bash

# 仅安装 CLI
./install.sh --cli

# 仅安装 GUI
./install.sh --gui

# 自定义安装路径
./install.sh --prefix ~/.local/bin
```

### Windows
```powershell
# 一键安装（默认安装 CLI + GUI）
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install.ps1 | iex

# 仅安装 CLI
.\install.ps1 -Mode cli

# 仅安装 GUI
.\install.ps1 -Mode gui

# 自定义安装路径
.\install.ps1 -Prefix C:\Tools
```

## 验证清单

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
3. **首次运行**: CLI 默认端口 52131，打开浏览器访问 http://localhost:52131
