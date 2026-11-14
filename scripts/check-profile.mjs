#!/usr/bin/env node
/**
 * Preflight check for the DSH profile manifests.
 *
 * The desktop host reads `<DSH_HOME>/profiles/<name>/package.json` with a plain
 * `JSON.parse`, and starts *before* any plugin is loaded. Two things in that
 * file are therefore fatal at startup and not recoverable from inside a plugin:
 *
 *   1. a UTF-8 BOM — `JSON.parse` rejects U+FEFF with "Unexpected token '﻿'";
 *   2. a dependency that is declared but missing from `node_modules`.
 *
 * Hand-editing the manifest (adding a plugin by hand, renaming a package) is
 * where both come from, so run this after any manual change and before the next
 * restart:
 *
 *   node scripts/check-profile.mjs              # report only
 *   node scripts/check-profile.mjs --fix        # strip a BOM in place
 *   node scripts/check-profile.mjs --home <dir> # profile root, else $DSH_HOME
 *
 * `--fix` only removes the three BOM bytes; the rest of the file is untouched,
 * so formatting and field order survive. Nothing else is ever rewritten.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BOM = Buffer.from([0xef, 0xbb, 0xbf])
const argv = process.argv.slice(2)
const fix = argv.includes('--fix')
const homeFlag = argv.findIndex((arg) => arg === '--home')
const homeArg = argv.find((arg) => arg.startsWith('--home='))?.slice('--home='.length)
  ?? (homeFlag >= 0 ? argv[homeFlag + 1] : '')
const home = path.resolve(homeArg || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))

let failures = 0
let fixes = 0

const ok = (label, detail = '') => console.log(`ok   ${label}${detail ? `  ${detail}` : ''}`)
const warn = (label, detail = '') => console.log(`warn ${label}${detail ? `  ${detail}` : ''}`)
const fail = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? `  ${detail}` : ''}`)
}

/** First line/column of a JSON syntax error, so the fix is obvious. */
function locate(text, error) {
  const match = /position (\d+)/.exec(String(error?.message ?? ''))
  if (!match) return ''
  const offset = Number(match[1])
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - before.lastIndexOf('\n')
  return `（第 ${line} 行第 ${column} 列）`
}

/**
 * Inspect one JSON file the host parses. `fatal` says whether a problem here
 * can stop the app from starting at all.
 */
function checkJsonFile(file, label, { fatal = true, expectObject = true } = {}) {
  let bytes
  try {
    bytes = fs.readFileSync(file)
  } catch (error) {
    fail(label, `读不到：${error?.code ?? error}`)
    return null
  }

  let text = bytes.toString('utf8')
  if (bytes.subarray(0, 3).equals(BOM)) {
    if (fix && fatal) {
      try {
        fs.writeFileSync(file, bytes.subarray(3))
        fixes += 1
        text = bytes.subarray(3).toString('utf8')
        ok(`${label} BOM 已剥离`, file)
      } catch (error) {
        fail(`${label} 有 UTF-8 BOM，且未能写入`, String(error?.message ?? error))
        return null
      }
    } else {
      const detail = '文件以 UTF-8 BOM 开头；主机用 JSON.parse 读取，会直接抛 "Unexpected token \'﻿\'" 并停止启动'
      if (fatal) fail(`${label} 有 UTF-8 BOM`, `${detail}（加 --fix 去掉）`)
      else warn(`${label} 有 UTF-8 BOM`, detail)
      return null
    }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (fatal) fail(`${label} 不是合法 JSON`, `${error.message}${locate(text, error)}`)
    else warn(`${label} 不是合法 JSON`, error.message)
    return null
  }
  if (expectObject && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
    if (fatal) fail(`${label} 顶层必须是对象`, `实际是 ${Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed}`)
    else warn(`${label} 顶层必须是对象`)
    return null
  }
  ok(label, path.relative(home, file) || file)
  return parsed
}

/** Dependencies whose target directory is gone break the next boot. */
function checkDependencies(profileDir, manifest) {
  const deps = { ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}) }
  const names = Object.keys(deps)
  if (!names.length) {
    ok('dependencies', '（无）')
    return
  }
  let missing = 0
  for (const name of names) {
    const dir = path.join(profileDir, 'node_modules', ...name.split('/'))
    if (!fs.existsSync(dir)) {
      fail(`依赖 ${name} 没有装上`, `${deps[name]} → ${path.relative(home, dir)}`)
      missing += 1
      continue
    }
    const manifestPath = path.join(dir, 'package.json')
    if (fs.existsSync(manifestPath)) checkJsonFile(manifestPath, `依赖 ${name} 的 package.json`)
  }
  if (!missing) ok('dependencies', `${names.length} 个都在 node_modules 里`)
}

console.log(`DSH home: ${home}`)
if (!fs.existsSync(home)) {
  console.log(`\n找不到 ${home}：还没运行过 DSH，或设置了 DSH_HOME。`)
  process.exit(failures ? 1 : 0)
}

const profilesDir = path.join(home, 'profiles')
const profiles = fs.existsSync(profilesDir)
  ? fs.readdirSync(profilesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : []

if (!profiles.length) {
  console.log(`\n${profilesDir} 下没有 profile。`)
  process.exit(failures ? 1 : 0)
}

for (const name of profiles) {
  const dir = path.join(profilesDir, name)
  console.log(`\nprofile ${name}`)
  const manifestPath = path.join(dir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    fail('缺少 package.json', '主机启动时会读这个文件')
    continue
  }
  const manifest = checkJsonFile(manifestPath, 'package.json', { fatal: true })
  if (manifest) checkDependencies(dir, manifest)

  /* YAML is parsed by a real YAML parser, which tolerates a BOM; report it so
     the file stays consistent with everything else, but do not call it fatal. */
  for (const file of ['cordis.yml', 'cordis.patch.yml']) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) continue
    const bytes = fs.readFileSync(full)
    if (bytes.subarray(0, 3).equals(BOM)) {
      if (fix) {
        fs.writeFileSync(full, bytes.subarray(3))
        fixes += 1
        ok(`${file} BOM 已剥离`)
      } else {
        warn(`${file} 有 UTF-8 BOM`, 'YAML 能解析，但和仓库里其余文件不一致')
      }
    } else {
      ok(file)
    }
  }
}

console.log('')
if (fixes) console.log(`已修复 ${fixes} 个文件。`)
if (failures) {
  console.log(`${failures} 个问题会让 DSH 下次启动失败，请先处理（BOM 可以加 --fix）。`)
  process.exit(1)
}
console.log('profile 清单没有问题，可以放心重启。')
