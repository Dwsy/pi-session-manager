# Pi Session Manager CLI installer for Windows
# Usage: iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
#        $env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

param(
    [string]$Prefix = $env:PSM_INSTALL_PREFIX,
    [string]$Version = $env:PSM_INSTALL_VERSION,
    [ValidateSet("auto", "zh", "en")]
    [string]$Lang = $(if ($env:PSM_INSTALL_LANG) { $env:PSM_INSTALL_LANG } else { "auto" }),
    [switch]$Yes = ($env:PSM_INSTALL_YES -eq "1"),
    [switch]$NoVerify = ($env:PSM_INSTALL_NO_VERIFY -eq "1"),
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$Repo = "dwsy/pi-session-manager"
$ApiUrl = "https://api.github.com/repos/$Repo"

if ([string]::IsNullOrWhiteSpace($Prefix)) {
    $Prefix = Join-Path $env:LOCALAPPDATA "PiSessionManager\bin"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = "latest"
}

function Select-Language {
    if ($Lang -ne "auto") { return $Lang }

    $culture = [System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName
    if ($culture -eq "zh") { return "zh" }
    return "en"
}

$Script:Language = Select-Language

function Text($Key) {
    $zh = @{
        Title = "Pi Session Manager CLI 安装器"
        Usage = @"
用法:
  install-cli.ps1 [选项]

选项:
  -Yes              非交互安装，使用默认值
  -Prefix <路径>    安装目录，默认 `%LOCALAPPDATA`%\PiSessionManager\bin
  -Version <版本>   指定 GitHub Release tag，默认 latest
  -Lang <zh|en>     指定显示语言
  -NoVerify         安装后跳过 pi-session-cli --version 验证
  -Help             显示帮助

curl / PowerShell 一键安装:
  iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

非交互安装:
  `$env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

环境变量:
  PSM_INSTALL_YES=1
  PSM_INSTALL_LANG=zh|en
  PSM_INSTALL_PREFIX=C:\Tools
  PSM_INSTALL_VERSION=v0.6.9
"@
        Unsupported = "不支持的平台"
        Platform = "平台"
        FetchLatest = "获取最新版本"
        Version = "版本"
        InstallDir = "安装目录"
        PromptPrefix = "安装到此目录？"
        CreatingDir = "创建安装目录"
        Downloading = "下载 CLI"
        DownloadFailed = "下载失败"
        Checksum = "校验 SHA256"
        ChecksumOk = "校验通过"
        ChecksumSkip = "未找到 SHA256 文件，跳过校验"
        ChecksumBad = "SHA256 校验失败"
        Installing = "安装二进制"
        Unblock = "Windows: 清理 Mark-of-the-Web 限制"
        PathMissing = "安装目录不在 PATH 中"
        PathAdded = "已加入用户 PATH，重启终端后生效"
        Verify = "验证安装"
        VerifyOk = "安装验证通过"
        VerifyFail = "安装完成，但验证命令失败"
        Done = "CLI 安装完成"
        Run = "运行"
    }

    $en = @{
        Title = "Pi Session Manager CLI installer"
        Usage = @"
Usage:
  install-cli.ps1 [options]

Options:
  -Yes              Non-interactive install with defaults
  -Prefix <path>    Install directory, default `%LOCALAPPDATA`%\PiSessionManager\bin
  -Version <tag>    GitHub Release tag, default latest
  -Lang <zh|en>     Display language
  -NoVerify         Skip pi-session-cli --version after install
  -Help             Show help

curl / PowerShell one-line install:
  iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

Non-interactive install:
  `$env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex

Environment variables:
  PSM_INSTALL_YES=1
  PSM_INSTALL_LANG=zh|en
  PSM_INSTALL_PREFIX=C:\Tools
  PSM_INSTALL_VERSION=v0.6.9
"@
        Unsupported = "Unsupported platform"
        Platform = "Platform"
        FetchLatest = "Fetching latest version"
        Version = "Version"
        InstallDir = "Install directory"
        PromptPrefix = "Install to this directory?"
        CreatingDir = "Creating install directory"
        Downloading = "Downloading CLI"
        DownloadFailed = "Download failed"
        Checksum = "Verifying SHA256"
        ChecksumOk = "Checksum verified"
        ChecksumSkip = "No SHA256 file found, skipping checksum"
        ChecksumBad = "SHA256 checksum failed"
        Installing = "Installing binary"
        Unblock = "Windows: clearing Mark-of-the-Web restriction"
        PathMissing = "Install directory is not in PATH"
        PathAdded = "Added to user PATH; restart terminal to use it"
        Verify = "Verifying install"
        VerifyOk = "Install verified"
        VerifyFail = "Installed, but verification command failed"
        Done = "CLI install complete"
        Run = "Run"
    }

    if ($Script:Language -eq "zh") { return $zh[$Key] }
    return $en[$Key]
}

function Write-Info($Message) { Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Fail($Message) { Write-Host "[ERROR] $Message" -ForegroundColor Red }

if ($Help) {
    Write-Host (Text "Usage")
    exit 0
}

function Confirm($Prompt) {
    if ($Yes) { return $true }

    $answer = Read-Host "$Prompt [Y/n]"
    if ($answer -match '^(n|N|no|NO|No)$') { return $false }
    return $true
}

function Get-Platform {
    if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
        return "unsupported"
    }

    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -eq "AMD64" -or $arch -eq "x86_64") { return "windows-x64" }
    return "unsupported"
}

function Get-LatestVersion {
    $latestUrl = "https://github.com/$Repo/releases/latest"

    try {
        $response = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing
        $effectiveUrl = $null

        if ($response.BaseResponse.ResponseUri) {
            $effectiveUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
        } elseif ($response.BaseResponse.RequestMessage.RequestUri) {
            $effectiveUrl = $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
        }

        if ($effectiveUrl -match '/releases/tag/([^/?#]+)') {
            return $Matches[1]
        }
    } catch {
        # Fall back to API below.
    }

    try {
        $apiResponse = Invoke-RestMethod -Uri "$ApiUrl/releases/latest" -UseBasicParsing
        if ($apiResponse.tag_name) { return $apiResponse.tag_name }
    } catch {
        throw "$(Text 'FetchLatest') failed"
    }

    throw "$(Text 'FetchLatest') failed"
}

function Prepare-InstallDir {
    Write-Info "$(Text 'InstallDir'): $Prefix"
    if (-not (Confirm (Text "PromptPrefix"))) {
        $script:Prefix = Read-Host (Text "InstallDir")
    }

    if ([string]::IsNullOrWhiteSpace($script:Prefix)) {
        throw "$(Text 'InstallDir') is empty"
    }

    if (-not (Test-Path $script:Prefix)) {
        Write-Info "$(Text 'CreatingDir'): $script:Prefix"
        New-Item -ItemType Directory -Path $script:Prefix -Force | Out-Null
    }
}

function Test-Checksum($FilePath, $ChecksumPath) {
    if (-not (Test-Path $ChecksumPath)) {
        Write-Warn (Text "ChecksumSkip")
        return
    }

    Write-Info (Text "Checksum")
    $expected = ((Get-Content -Path $ChecksumPath -Raw) -split '\s+')[0].Trim().ToLowerInvariant()
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($expected -ne $actual) {
        Write-Fail (Text "ChecksumBad")
        Write-Fail "Expected: $expected"
        Write-Fail "Actual:   $actual"
        exit 1
    }

    Write-Ok (Text "ChecksumOk")
}

function Add-ToPath($InstallDir) {
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
        $parts = $userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    if ($parts -contains $InstallDir) { return }

    Write-Warn "$(Text 'PathMissing'): $InstallDir"
    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $InstallDir } else { "$userPath;$InstallDir" }
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Ok (Text "PathAdded")
}

function Install-Cli($ReleaseVersion, $Platform) {
    $assetName = "pi-session-cli-$Platform.exe"
    $downloadUrl = "https://github.com/$Repo/releases/download/$ReleaseVersion/$assetName"
    $shaUrl = "$downloadUrl.sha256"
    $tmpdir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null

    try {
        $tmpFile = Join-Path $tmpdir $assetName
        $shaFile = Join-Path $tmpdir "$assetName.sha256"
        $targetPath = Join-Path $script:Prefix "pi-session-cli.exe"

        Write-Info "$(Text 'Downloading'): $assetName"
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpFile -UseBasicParsing
        } catch {
            Write-Fail "$(Text 'DownloadFailed'): $downloadUrl"
            exit 1
        }

        try {
            Invoke-WebRequest -Uri $shaUrl -OutFile $shaFile -UseBasicParsing
        } catch {
            # Checksum is optional for older releases.
        }

        Test-Checksum -FilePath $tmpFile -ChecksumPath $shaFile

        Write-Info "$(Text 'Installing'): $targetPath"
        Move-Item -Path $tmpFile -Destination $targetPath -Force

        if (Get-Command Unblock-File -ErrorAction SilentlyContinue) {
            Write-Info (Text "Unblock")
            Unblock-File -Path $targetPath -ErrorAction SilentlyContinue
        }

        if (-not $NoVerify) {
            Write-Info (Text "Verify")
            try {
                $versionOutput = & $targetPath --version
                Write-Ok "$(Text 'VerifyOk'): $versionOutput"
            } catch {
                Write-Warn (Text "VerifyFail")
            }
        }

        Add-ToPath -InstallDir $script:Prefix
        Write-Ok "$(Text 'Done'): $targetPath"
        Write-Info "$(Text 'Run'): pi-session-cli"
    } finally {
        if (Test-Path $tmpdir) {
            Remove-Item -Path $tmpdir -Recurse -Force
        }
    }
}

Write-Info (Text "Title")

$platform = Get-Platform
if ($platform -eq "unsupported") {
    Write-Fail "$(Text 'Unsupported'): $env:PROCESSOR_ARCHITECTURE"
    exit 1
}
Write-Ok "$(Text 'Platform'): $platform"

$releaseVersion = $Version
if ($releaseVersion -eq "latest") {
    Write-Info (Text "FetchLatest")
    $releaseVersion = Get-LatestVersion
}
Write-Ok "$(Text 'Version'): $releaseVersion"

Prepare-InstallDir
Install-Cli -ReleaseVersion $releaseVersion -Platform $platform
