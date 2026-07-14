# Windows / Linux release smoke checklist

This checklist is a release gate for desktop GUI behavior. CI builds do not count as GUI smoke validation.

## Record for every release

- OS and desktop environment:
- Window manager / Wayland or X11:
- Resolution and display scale:
- Package type and version:
- Result: pass / fail:
- Main-window screenshot:
- Known limitations:

## Windows 11

- [ ] Native title bar: close, minimize, maximize, restore, drag, resize, Alt+F4, Snap Layout.
- [ ] DPI: 100%, 125%, 150%, 175%, 200%; 1366×768 and 1920×1080.
- [ ] Window state: normal, maximized, secondary monitor, unplugged monitor and restart.
- [ ] Single instance: second launch focuses the existing window; hidden/minimized window is restored.
- [ ] Lightweight mode and tray recovery; no orphaned process without a recovery path.
- [ ] IME composition, AltGr, text inputs, terminal focus, F5, Ctrl+R, Ctrl+Shift+R.
- [ ] Windows Terminal with PowerShell, pwsh, and cmd; direct PowerShell/cmd.
- [ ] Paths with spaces, Unicode, `&`, parentheses, quotes, UNC and long paths.
- [ ] NSIS/MSI install, WebView2 online/offline/managed runtime behavior.
- [ ] `Get-AuthenticodeSignature` is `Valid` for every published `.exe`, `.msi`, and NSIS artifact; publisher and timestamp are recorded.

## Linux

- [ ] GNOME Wayland/X11 or KDE representative environment.
- [ ] Native title bar: buttons, drag, resize, maximize, Alt+F4.
- [ ] Multi-monitor restore and unplugged-monitor fallback.
- [ ] Tray available and unavailable; close always leaves a recovery path.
- [ ] Shells: bash, zsh, fish, nu; no-bash fallback.
- [ ] GNOME Terminal, Konsole, x-terminal-emulator, and one modern terminal.
- [ ] URL/default browser and file-manager open with spaces, Unicode, `&`, and parentheses.
- [ ] Compact layout at 768–1119 logical pixels; core actions remain reachable.
- [ ] AppImage/deb/rpm installation and launch.

## Signing prerequisites

The Windows release job must provide these secrets/environment variables without committing certificate material:

- `WINDOWS_SIGNTOOL_PATH`
- `WINDOWS_SIGN_CERT_SHA1`
- `WINDOWS_SIGN_TIMESTAMP_URL`

Without them, the Windows signing script fails closed. Updater signing is separate from Authenticode.
