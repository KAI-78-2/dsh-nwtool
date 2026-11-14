#!/usr/bin/env node
/**
 * Copy `locale/messages.json` into the client half.
 *
 * The browser half cannot read files, so the catalog is embedded in client.js
 * between two markers. The Host half reads the JSON directly, which keeps one
 * source of truth: edit the JSON, run this script, and both halves agree.
 *
 *   node scripts/sync-messages.mjs          # rewrite client.js
 *   node scripts/sync-messages.mjs --check  # exit 1 when client.js is stale
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const messagesPath = path.join(root, 'locale', 'messages.json')
const clientPath = path.join(root, 'client.js')

const START = '/* i18n:messages:start */'
const END = '/* i18n:messages:end */'

const check = process.argv.includes('--check')

const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'))
const languages = Object.keys(messages).sort()
const total = languages.reduce((count, language) => count + Object.keys(messages[language]).length, 0)

const block = `${START}\n    const MESSAGES = ${JSON.stringify(messages, null, 2).replace(/\n/g, '\n    ')}\n    ${END}`

const source = fs.readFileSync(clientPath, 'utf8')
const start = source.indexOf(START)
const end = source.indexOf(END)
if (start < 0 || end < start) {
  console.error(`client.js is missing the ${START} … ${END} markers`)
  process.exit(1)
}

const current = source.slice(start, end + END.length)
if (check) {
  if (current !== block) {
    console.error('client.js is stale: run `node scripts/sync-messages.mjs`')
    process.exit(1)
  }
  console.log(`messages in sync: ${languages.join(', ')} (${total} keys)`)
  process.exit(0)
}

if (current === block) {
  console.log(`already in sync: ${languages.join(', ')} (${total} keys)`)
  process.exit(0)
}

fs.writeFileSync(clientPath, source.slice(0, start) + block + source.slice(end + END.length), 'utf8')
console.log(`embedded ${languages.join(', ')} (${total} keys) into client.js`)
