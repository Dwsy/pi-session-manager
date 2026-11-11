#!/usr/bin/env node
// i18n-merge — 把一批翻译合并进 locale 文件，保留原文件的 export 形式、引号风格与 en-US 键顺序。
//
// 翻译文件是 JSON：扁平 { "键路径": "译文" } 或嵌套对象，二者可混。
// 只补翻译里出现的键；未翻译的缺失键保持缺失（下批再补）。
//
// 用法（项目根运行）：
//   node i18n-merge.mjs --lang de-DE --ns command --in /tmp/trans.json
//
// 选项：--base <dir>（默认 src/i18n/locales），--dry-run（只打印不写）

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const base = opt('base', 'src/i18n/locales')
const lang = opt('lang', null)
const ns = opt('ns', null)
const inFile = opt('in', null)
const dryRun = args.includes('--dry-run')

if (!lang || !ns || !inFile) { console.error('需要 --lang --ns --in'); process.exit(1) }

function loadObj(file) {
  let s = readFileSync(file, 'utf8')
  s = s.replace(/export\s+(const\s+\w+\s*=\s*|default\s*)/, '').replace(/as\s+const\s*;?\s*$/, '').trim()
  if (s.endsWith(';')) s = s.slice(0, -1)
  return eval('(' + s + ')')
}

// 扁平 { "a.b.c": v } 转嵌套；已是嵌套的原样
function toNested(flat) {
  const out = {}
  for (const [k, v] of Object.entries(flat)) {
    if (v && typeof v === 'object' && !k.includes('.')) { mergeInto(out, v); continue }
    const parts = k.split('.')
    let cur = out
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {}
    cur[parts[parts.length - 1]] = v
  }
  return out
}
function mergeInto(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object') mergeInto(dst[k] ??= {}, v)
    else dst[k] = v
  }
}

// 按 ref(en-US) 键顺序重建 obj，只保留 obj 里存在的叶子/子树
function orderLike(ref, obj) {
  const out = {}
  for (const k of Object.keys(ref)) {
    if (!(k in obj)) continue
    const rv = ref[k], ov = obj[k]
    if (rv && typeof rv === 'object') { const sub = orderLike(rv, ov ?? {}); if (Object.keys(sub).length) out[k] = sub }
    else out[k] = ov
  }
  // obj 里超出 ref 的键（en 没有的）按原序保留，避免丢数据
  for (const k of Object.keys(obj)) if (!(k in ref)) out[k] = obj[k]
  return out
}

function serialize(obj, indent, quote) {
  const q = quote
  const esc = (s) => q + String(s).replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q).replace(/\n/g, '\\n') + q
  const pad = ' '.repeat(indent)
  const lines = Object.entries(obj).map(([k, v]) => {
    const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : esc(k)
    if (v && typeof v === 'object') return `${pad}${key}: ${serialize(v, indent + 2, q)}`
    return `${pad}${key}: ${esc(v)}`
  })
  return '{\n' + lines.join(',\n') + ',\n' + ' '.repeat(indent - 2) + '}'
}

const curFile = path.join(base, lang, ns + '.ts')
const refObj = loadObj(path.join(base, 'en-US', ns + '.ts'))
const curObj = loadObj(curFile)
const trans = toNested(JSON.parse(readFileSync(inFile, 'utf8')))
const merged = {}
mergeInto(merged, curObj)
mergeInto(merged, trans)
const raw = readFileSync(curFile, 'utf8')
const hasAsConst = /\bas\s+const/.test(raw)
const quote = (raw.match(/: *'/g) || []).length >= (raw.match(/: *"/g) || []).length ? "'" : '"'
const exportDefault = /^\s*export\s+default/.test(raw)
const nameMatch = raw.match(/export\s+const\s+(\w+)\s*=/)
const head = exportDefault ? 'export default' : `export const ${nameMatch ? nameMatch[1] : ns.replace(/-/g, '')} =`

const body = serialize(merged, 2, quote)
const out = `${head} ${body}${hasAsConst ? ' as const' : ''}\n`
if (dryRun) { console.log(out) } else { writeFileSync(curFile, out); console.log(`写入 ${curFile}  (叶子 ${countLeaves(merged)} 个)`) }

function countLeaves(o) { let n = 0; for (const v of Object.values(o)) n += v && typeof v === 'object' ? countLeaves(v) : 1; return n }
