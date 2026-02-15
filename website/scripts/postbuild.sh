#!/bin/bash
# Post-build: add root index.html redirect and .nojekyll for GitHub Pages
set -e

OUT_DIR="out"

# Root redirect to /en/
cat > "$OUT_DIR/index.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    var lang = navigator.language || navigator.userLanguage || 'en';
    var target = lang.startsWith('zh') ? '/cn/' : '/en/';
    window.location.replace(target);
  </script>
  <meta http-equiv="refresh" content="0;url=/en/">
</head>
<body>
  <p>Redirecting to <a href="/en/">English</a> | <a href="/cn/">中文</a></p>
</body>
</html>
EOF

# Also copy en.html as docs/index.html redirect if missing
if [ ! -f "$OUT_DIR/docs/index.html" ] && [ -f "$OUT_DIR/en/docs.html" ]; then
  mkdir -p "$OUT_DIR/docs"
  cat > "$OUT_DIR/docs/index.html" << 'EOF'
<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=/en/docs"></head></html>
EOF
fi

# GitHub Pages: disable Jekyll processing
touch "$OUT_DIR/.nojekyll"

echo "✅ Post-build complete"
