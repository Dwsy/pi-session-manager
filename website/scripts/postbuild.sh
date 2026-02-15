#!/bin/bash
# Post-build: add root index.html redirect and .nojekyll for GitHub Pages
set -e

OUT_DIR="out"

if [ -n "$GITHUB_ACTIONS" ]; then
  BASE="/pi-session-manager"
else
  BASE=""
fi

# Root redirect with language detection
cat > "$OUT_DIR/index.html" << EOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    var lang = navigator.language || navigator.userLanguage || 'en';
    var target = lang.startsWith('zh') ? '${BASE}/cn/' : '${BASE}/en/';
    window.location.replace(target);
  </script>
  <meta http-equiv="refresh" content="0;url=${BASE}/en/">
</head>
<body>
  <p>Redirecting to <a href="${BASE}/en/">English</a> | <a href="${BASE}/cn/">中文</a></p>
</body>
</html>
EOF

# GitHub Pages: disable Jekyll processing
touch "$OUT_DIR/.nojekyll"

echo "✅ Post-build complete (basePath=${BASE:-/})"
