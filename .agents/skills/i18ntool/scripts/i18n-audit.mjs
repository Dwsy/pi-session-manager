#!/usr/bin/env node
// i18n-audit — i18next locale 翻译缺失审计
//
// 以 en-US 为基准，逐 namespace 对比其它语言，输出完成度与缺失键。
// 用于驱动分批补翻译，并在补完后验证对齐。
//
// 用法（在项目根运行）：
//   node i18n-audit.mjs                          # 概览：每语言完成度 + 缺失计数
//   node i18n-audit.mjs --lang de-DE            # 明细：列出该语言全部缺失键
//   node i18n-audit.mjs --lang de-DE --namespace command   # 聚焦单个 namespace
//   node i18n-audit.mjs --json                  # 机器可读 JSON
//
// 选项：
//   --base <dir>       locale 根目录（默认 src/i18n/locales）
//   --lang <code>      只看某语言（如 de-DE）
//   --namespace <ns>   只看某 namespace（如 command / session / dashboard）
//   --json             输出 JSON

import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const has = (n) => args.includes('--' + n)
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }

const base = opt('base', 'src/i18n/locales')
const onlyLang = opt('lang', null)
const onlyNs = opt('namespace', null)
const asJson = has('json')

// 递归收集叶子键路径（值为非对象的 key）
function keys(o, p = '') {
  let r = []
  for (const k in o) {
    const kp = p ? p + '.' + k : k
    if (o[k] && typeof o[k] === 'object') r = r.concat(keys(o[k], kp))
    else r.push(kp)
  }
  return r
}

// 把 `export const x = {...} [as const]` / `export default {...}` 的对象字面量求值
function loadObj(file) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { return null }
  src = src.replace(/export\s+(const\s+\w+\s*=\s*|default\s*)/, '')
  src = src.replace(/as\s+const\s*;?\s*$/, '').trim()
  if (src.endsWith(';')) src = src.slice(0, -1)
  try { return eval('(' + src + ')') } catch { return null }
}

const langs = readdirSync(base).filter((d) => statSync(path.join(base, d)).isDirectory()).sort()
if (!langs.includes('en-US')) { console.error('基准语言 en-US 不在 ' + base); process.exit(1) }

const nsFiles = readdirSync(path.join(base, 'en-US'))
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .filter((f) => !onlyNs || f.replace(/\.ts$/, '') === onlyNs)
  .sort()

const refTotal = { all: 0 }
for (const f of nsFiles) {
  const o = loadObj(path.join(base, 'en-US', f))
  if (o) refTotal[f.replace(/\.ts$/, '')] = keys(o).length, refTotal.all += keys(o).length
}

const report = {}
for (const l of langs) {
  if (onlyLang && l !== onlyLang) continue
  if (l === 'en-US' && !asJson) continue
  const ns = {}
  let have = 0
  for (const f of nsFiles) {
    const name = f.replace(/\.ts$/, '')
    const refObj = loadObj(path.join(base, 'en-US', f))
    if (!refObj) continue
    const locObj = loadObj(path.join(base, l, f))
    const refK = keys(refObj)
    const locK = locObj ? new Set(keys(locObj)) : new Set()
    const missing = refK.filter((x) => !locK.has(x)).sort()
    have += refK.length - missing.length
    if (missing.length) ns[name] = missing
  }
  report[l] = { have, total: refTotal.all, pct: Math.round((have / refTotal.all) * 100), missing: ns }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else if (onlyLang) {
  const r = report[onlyLang]
  console.log(`# ${onlyLang} — ${r.pct}%  (${r.have}/${r.total})`)
  for (const [ns, miss] of Object.entries(r.missing)) {
    console.log(`\n## ${ns}  (缺 ${miss.length})`)
    for (const k of miss) console.log('  ' + k)
  }
} else {
  console.log('语言     完成   叶子键      缺失namespace数')
  for (const [l, r] of Object.entries(report)) {
    console.log(`${l.padEnd(8)} ${String(r.pct).padStart(3)}%   ${String(r.have).padStart(4)}/${r.total}   ${Object.keys(r.missing).length}`)
  }
}
