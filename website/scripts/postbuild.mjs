#!/usr/bin/env node

import { writeFileSync, closeSync, openSync } from 'node:fs'
import { join } from 'node:path'

const outDir = 'out'
const base = process.env.GITHUB_ACTIONS ? '/pi-session-manager' : ''

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    var lang = navigator.language || navigator.userLanguage || 'en';
    var target = lang.startsWith('zh') ? '${base}/cn/' : '${base}/en/';
    window.location.replace(target);
  </script>
  <meta http-equiv="refresh" content="0;url=${base}/en/">
</head>
<body>
  <p>Redirecting to <a href="${base}/en/">English</a> | <a href="${base}/cn/">中文</a></p>
</body>
</html>
`

writeFileSync(join(outDir, 'index.html'), html, 'utf8')
closeSync(openSync(join(outDir, '.nojekyll'), 'w'))

console.log(`✅ Post-build complete (basePath=${base || '/'})`)
