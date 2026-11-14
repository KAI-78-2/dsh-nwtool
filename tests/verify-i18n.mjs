// Guard for the plugin's localization: every t() call resolves, the dictionary
// stays in sync with the browser half, placeholders survive translation, no
// Chinese output string is left unwrapped in the Host half, and every piece of
// Chinese reference data is translatable.
//
// The behavioural half of this guard lives in verify-client-render.mjs: it
// renders every pane with the UI language set to English and fails on any
// Chinese text that still reaches the screen.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { scanFile, SOURCE_FILES, DATA_FILES, MODEL_FILES, pluginPath } from './scan-i18n.mjs'

let failures = 0
let warnings = 0

function fail(message) {
  failures += 1
  console.log(`FAIL ${message}`)
}

function warn(message) {
  warnings += 1
  console.log(`warn ${message}`)
}

const messagesPath = pluginPath('locale/messages.json')
if (!fs.existsSync(messagesPath)) {
  console.log('FAIL locale/messages.json is missing')
  process.exit(1)
}

let catalog
try {
  catalog = JSON.parse(fs.readFileSync(messagesPath, 'utf8'))
} catch (error) {
  console.log(`FAIL locale/messages.json is not valid JSON: ${error.message}`)
  process.exit(1)
}

const languages = Object.keys(catalog)
const english = catalog.en ?? {}
console.log(`dictionary: ${languages.join(', ')} · ${Object.keys(english).length} entries`)
if (!languages.includes('en')) fail('dictionary has no "en" table')

/* 1. Every Host-half output string is wrapped, and every t() key resolves. */
const usedKeys = new Set()
for (const file of SOURCE_FILES) {
  const { keys, unwrapped } = scanFile(file)
  for (const key of keys) usedKeys.add(key)
  for (const hit of unwrapped) {
    fail(`${file}:${hit.line} Chinese output is not wrapped in t(): ${JSON.stringify(hit.text.slice(0, 80))}`)
  }
}

const missing = [...usedKeys].filter((key) => typeof english[key] !== 'string')
if (missing.length === 0) {
  console.log(`ok   t() call sites -> ${usedKeys.size} distinct keys, all translated`)
} else {
  fail(`${missing.length} t() keys have no English translation`)
  for (const key of missing.slice(0, 25)) console.log(`     missing: ${JSON.stringify(key)}`)
}

/* 2. Chinese reference data is translated where it renders, so every data string
      still needs a dictionary entry — otherwise it would stay Chinese forever. */
const dataKeys = new Set()
for (const file of DATA_FILES) {
  if (!fs.existsSync(pluginPath(file))) continue
  const { clean } = scanFile(file)
  for (const match of clean.matchAll(/'([^'\n]*[\u4e00-\u9fff][^'\n]*)'/g)) dataKeys.add(match[1])
  for (const match of clean.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) dataKeys.add(match[1])
}
const missingData = [...dataKeys].filter((key) => typeof english[key] !== 'string')
if (missingData.length === 0) {
  console.log(`ok   reference data -> ${dataKeys.size} strings translatable`)
} else {
  fail(`${missingData.length} reference-data strings have no translation`)
  for (const key of missingData.slice(0, 20)) console.log(`     missing: ${JSON.stringify(key)}`)
}

/* 3. Model-facing text is deliberately not localized: tool descriptions and
      schemas go to the model, not to the screen. Nothing to check. */
for (const file of MODEL_FILES) {
  if (!fs.existsSync(pluginPath(file))) warn(`${file} is missing`)
}

/* 4. Placeholders must survive translation. */
const placeholderNames = (text) => [...String(text).matchAll(/\$\{([^}]*)\}|\{(\w+)\}/g)]
  .map((match) => (match[1] ?? match[2]).trim()).sort()

let problems = 0
for (const [key, value] of Object.entries(english)) {
  if (typeof value !== 'string') {
    problems += 1
    fail(`translation is not a string: ${JSON.stringify(key)}`)
    continue
  }
  const source = placeholderNames(key)
  const translated = placeholderNames(value)
  if (source.length !== translated.length) {
    problems += 1
    fail(`placeholder count differs: ${JSON.stringify(key)} -> ${JSON.stringify(value)}`)
    continue
  }
  if (source.join('|') !== translated.join('|')) {
    problems += 1
    fail(`placeholder names differ: ${JSON.stringify(key)} -> ${JSON.stringify(value)}`)
  }
  if (/[\u4e00-\u9fff]/.test(value)) {
    problems += 1
    fail(`translation still contains Chinese: ${JSON.stringify(key)} -> ${JSON.stringify(value)}`)
  }
}
if (problems === 0) console.log('ok   placeholders and translations -> consistent')

/* 5. The browser half must carry an identical copy of the dictionary. */
try {
  const output = execFileSync(process.execPath, [pluginPath('scripts/sync-messages.mjs'), '--check'], { encoding: 'utf8' })
  if (!output.includes('in sync')) fail(`sync check said: ${output.trim()}`)
  else console.log(`ok   embedded copy -> ${output.trim()}`)
} catch (error) {
  fail(`client.js dictionary is stale — run node scripts/sync-messages.mjs (${String(error.stdout ?? error.message).trim()})`)
}

console.log(failures === 0 ? `\ni18n looks consistent${warnings ? ` (${warnings} warnings)` : ''}` : `\n${failures} i18n check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
