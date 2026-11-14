// Scan the plugin sources for translation call sites and for Chinese literals
// that are still unwrapped. Shared by the merge step and by verify-i18n.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The plugin root: one level above this file. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Resolve a plugin-relative name (e.g. `host/net.js`) against the plugin root. */
export function pluginPath(relative) {
  return path.isAbsolute(relative) ? relative : path.join(ROOT, relative)
}

export const SOURCE_FILES = [
  'host/net.js',
  'host/dns.js',
  'host/http.js',
  'host/cli.js',
  'host/datacom.js',
  'host/sntp.js',
  'host/geo.js',
  'host/local.js',
  'host/monitor.js',
  'host/engine.js',
  'host/api.js',
]

/** The browser half: reference data stays inline and is translated at render. */
export const CLIENT_FILE = 'client.js'

/** Files whose Chinese text is reference data, translated where it is rendered. */
export const DATA_FILES = ['client.js', 'host/data.js']

/** Model-facing text: tool descriptions go to the model, not to the screen. */
export const MODEL_FILES = ['host/tools.js']

/**
 * Replace comment bodies with spaces, keeping string and regex literals
 * untouched. Regex literals matter: `/^https?:\/\//` contains `\/\/`, and a
 * naive comment scan would swallow the rest of that line — including the copy
 * that follows it.
 */
export function stripComments(text) {
  let out = ''
  let i = 0
  let state = 'code'
  let lastSignificant = ''
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 2; continue }
      if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 2; continue }
      if (ch === '/') {
        /* Division after a value, regex after an operator or a keyword. */
        const regex = /[([{,;:=!&|?+\-*%~^<>]/.test(lastSignificant) || lastSignificant === ''
        if (regex) {
          state = 'regex'
          out += ch
          i += 1
          continue
        }
      }
      if (ch === "'" || ch === '"' || ch === '`') { state = ch; out += ch; i += 1; continue }
      if (!/\s/.test(ch)) lastSignificant = ch
      out += ch
      i += 1
      continue
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += ch } else out += ' '
      i += 1
      continue
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 2; continue }
      out += ch === '\n' ? '\n' : ' '
      i += 1
      continue
    }
    if (state === 'regex') {
      if (ch === '\\') { out += ch + (next ?? ''); i += 2; continue }
      if (ch === '[') { out += ch; i += 1; state = 'regex-class'; continue }
      if (ch === '/') { state = 'code'; out += ch; i += 1; lastSignificant = '/'; continue }
      if (ch === '\n') { state = 'code'; out += ch; i += 1; continue }
      out += ch
      i += 1
      continue
    }
    if (state === 'regex-class') {
      if (ch === '\\') { out += ch + (next ?? ''); i += 2; continue }
      if (ch === ']') state = 'regex'
      out += ch
      i += 1
      continue
    }
    if (ch === '\\') { out += ch + (next ?? ''); i += 2; continue }
    if (ch === state) { state = 'code'; out += ch; i += 1; lastSignificant = ch; continue }
    out += ch
    i += 1
  }
  return out
}

const CJK = /[\u4e00-\u9fff]/

/**
 * Literals compared as identifiers instead of being displayed: the browser
 * translates the label when it renders and sends the raw sentinel back, so
 * wrapping these would break filtering. Keep this list as small as possible.
 */
export const SENTINELS = new Set([
  '全部', // cheat-sheet category sentinel sent back by the browser
  '正常', // diagnose step status: compared, translated by the cell renderer
  '异常',
  '未知',
  '未知厂商', // LAN row vendor placeholder: compared before the online lookup
])

/**
 * Every `t('…')` / `t("…")` / `t(\`…\`)` first argument, as authored. A call site
 * is an explicit request for translation, so it is collected even when the text
 * carries no Han characters (e.g. a template that only re-quotes a name).
 */
export function translationKeys(clean) {
  const keys = []
  const re = /(^|[^.\w$])t\(\s*(['"`])/g
  let match
  while ((match = re.exec(clean)) !== null) {
    const quote = match[2]
    let i = match.index + match[0].length
    let body = ''
    while (i < clean.length) {
      if (clean[i] === '\\') { body += clean[i] + (clean[i + 1] ?? ''); i += 2; continue }
      if (clean[i] === quote) break
      body += clean[i]
      i += 1
    }
    keys.push(body)
  }
  return keys
}

/** String literals with Chinese that no `t(` immediately precedes. */
export function unwrappedLiterals(clean) {
  const hits = []
  let i = 0
  while (i < clean.length) {
    const ch = clean[i]
    if (ch !== "'" && ch !== '"' && ch !== '`') { i += 1; continue }
    const quote = ch
    const start = i
    let j = i + 1
    let body = ''
    while (j < clean.length) {
      if (clean[j] === '\\') { body += clean[j] + (clean[j + 1] ?? ''); j += 2; continue }
      if (clean[j] === quote) break
      body += clean[j]
      j += 1
    }
    if (CJK.test(body)) {
      /* A template that already translates its own fragments is not a leak. */
      if (!body.includes('t(')) {
        const before = clean.slice(Math.max(0, start - 12), start)
        const wrapped = /(^|[^.\w$])t\(\s*$/.test(before)
        if (!wrapped && !SENTINELS.has(body)) {
          const line = clean.slice(0, start).split('\n').length
          hits.push({ line, text: body })
        }
      }
    }
    i = j + 1
  }
  return hits
}

/** Every string literal with Chinese text, wrapped or not. */
export function allLiterals(clean) {
  const hits = []
  let i = 0
  while (i < clean.length) {
    const ch = clean[i]
    if (ch !== "'" && ch !== '"' && ch !== '`') { i += 1; continue }
    const quote = ch
    let j = i + 1
    let body = ''
    while (j < clean.length) {
      if (clean[j] === '\\') { body += clean[j] + (clean[j + 1] ?? ''); j += 2; continue }
      if (clean[j] === quote) break
      body += clean[j]
      j += 1
    }
    if (CJK.test(body)) hits.push(body)
    i = j + 1
  }
  return hits
}

/** Collapse `${whatever}` to `${}` so renames still match a stored translation. */
export function placeholderShape(text) {
  return text.replace(/\$\{[^}]*\}/g, '${}')
}

/** Blank the generated dictionary so the scan only sees hand-written code. */
export function blankMessagesBlock(text) {
  const startMarker = '/* i18n:messages:start */'
  const endMarker = '/* i18n:messages:end */'
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker)
  if (start < 0 || end < start) return text
  const region = text.slice(start, end + endMarker.length)
  return text.slice(0, start) + region.replace(/[^\n]/g, ' ') + text.slice(end + endMarker.length)
}

export function scanFile(file) {
  const clean = stripComments(blankMessagesBlock(fs.readFileSync(pluginPath(file), 'utf8')))
  return {
    keys: translationKeys(clean),
    unwrapped: unwrappedLiterals(clean),
    clean,
  }
}

if (process.argv[1]?.endsWith('scan-i18n.mjs')) {
  const all = new Set()
  let unwrappedTotal = 0
  for (const file of SOURCE_FILES) {
    const { keys, unwrapped } = scanFile(file)
    for (const key of keys) all.add(key)
    unwrappedTotal += unwrapped.length
    console.log(`${file}: t()=${keys.length} unwrapped=${unwrapped.length}`)
    for (const hit of unwrapped.slice(0, 8)) console.log(`   ${hit.line}: ${hit.text.slice(0, 90)}`)
  }
  console.log(`distinct t() keys: ${all.size}; unwrapped literals: ${unwrappedTotal}`)
}
