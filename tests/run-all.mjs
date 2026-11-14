#!/usr/bin/env node
/**
 * Run every verification script.
 *
 *   node tests/run-all.mjs            # offline checks (the default gate)
 *   node tests/run-all.mjs --live     # also the two that need a running GUI
 *
 * The offline checks touch nothing outside a temporary directory: no device is
 * dialled and no real ~/.dsh-nwtool state is read or written. The live ones
 * talk to `http://127.0.0.1:$NWTOOL_PORT/nwtool/api`, so set NWTOOL_PORT to the
 * port the DSH Web GUI is serving (the URL printed by `dsh web`).
 *
 * Everything is resolved relative to this file, so the command works from any
 * working directory.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const live = process.argv.includes('--live')

/** Scripts that need the GUI running; they are skipped unless --live. */
const LIVE_ONLY = new Set(['verify-term-live.mjs'])

const scripts = fs.readdirSync(HERE)
  .filter((name) => /^verify-.*\.mjs$/.test(name))
  .sort()

const offline = scripts.filter((name) => !LIVE_ONLY.has(name))
const online = scripts.filter((name) => LIVE_ONLY.has(name))

if (live && !process.env.NWTOOL_PORT) {
  console.log('NWTOOL_PORT is not set; the live checks need the port the DSH Web GUI serves.')
  process.exit(1)
}

const results = []
function run(name) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [path.join(HERE, name)], {
    cwd: HERE,
    encoding: 'utf8',
    env: process.env,
    timeout: 180000,
  })
  const ok = result.status === 0
  const tail = String(result.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? ''
  const err = String(result.stderr ?? '').trim()
  results.push({ name, ok, ms: Date.now() - started, tail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(24)} ${String(Date.now() - started).padStart(5)} ms  ${tail}`)
  if (!ok && err) console.log(`     ${err.split('\n').slice(0, 4).join('\n     ')}`)
  return ok
}

console.log(`offline checks (${offline.length})`)
for (const name of offline) run(name)

if (live) {
  console.log(`\nlive checks (${online.length}) against port ${process.env.NWTOOL_PORT}`)
  for (const name of online) run(name)
} else if (online.length) {
  console.log(`\nskipped ${online.length} live check(s): ${online.join(', ')} (use --live)`)
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length} run, ${results.length - failed.length} passed, ${failed.length} failed`)
if (failed.length) {
  console.log(`failed: ${failed.map((item) => item.name).join(', ')}`)
  process.exit(1)
}
