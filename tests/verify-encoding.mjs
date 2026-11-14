// Encoding guard for the shipped plugin.
//
// A UTF-8 BOM is enough to stop DSH from starting: the host reads the profile
// manifest and every plugin manifest with a plain `JSON.parse`, which rejects
// U+FEFF. This check keeps the plugin itself from ever carrying one, and keeps
// the repository on the line endings .gitattributes promises.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The plugin root, whatever the working directory happens to be. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.svg', '.html', '.txt'])
const BOM = Buffer.from([0xef, 0xbb, 0xbf])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = walk(ROOT).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))

let failures = 0
const fail = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? `  ${detail}` : ''}`)
}
const ok = (label, detail = '') => console.log(`ok   ${label}${detail ? `  ${detail}` : ''}`)

let withBom = 0
let withCrlf = 0
let withoutNewline = 0
let jsonChecked = 0

for (const file of files) {
  const bytes = fs.readFileSync(file)
  const label = path.relative(ROOT, file)

  if (bytes.subarray(0, 3).equals(BOM)) {
    withBom += 1
    fail(`${label} 带 UTF-8 BOM`, '主机用 JSON.parse 读清单文件时会直接抛错，启动失败')
  }

  /* LF only: .gitattributes declares `* text=auto eol=lf`, so a CRLF file would
     flip back and forth in git and show up as a whole-file diff. */
  if (bytes.includes(0x0d)) {
    withCrlf += 1
    fail(`${label} 含 CR`, '仓库约定 LF 换行')
  }

  if (bytes.length && bytes[bytes.length - 1] !== 0x0a) {
    withoutNewline += 1
    fail(`${label} 结尾没有换行`, '最后一行会和下一处改动粘在一起')
  }

  if (path.extname(file).toLowerCase() === '.json') {
    jsonChecked += 1
    const text = bytes.toString('utf8')
    try {
      JSON.parse(text)
    } catch (error) {
      fail(`${label} 不是合法 JSON`, String(error?.message ?? error))
    }
  }
}

if (!withBom) ok('BOM', `${files.length} 个文本文件都没有 BOM`)
if (!withCrlf) ok('换行', '全部 LF')
if (!withoutNewline) ok('文件结尾', '全部以换行结束')
ok('JSON', `${jsonChecked} 个文件都能解析`)

/* The two manifests the host parses must agree on the package identity. */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const client = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const version = /const VERSION = '([^']+)'/.exec(client)?.[1]
if (version === pkg.version) ok('版本', `${pkg.name} v${pkg.version}`)
else fail('client.js 与 package.json 版本不一致', `${version} vs ${pkg.version}`)

const patch = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
if (patch.includes(`name: '${pkg.name}'`) || patch.includes(`name: "${pkg.name}"`)) {
  ok('cordis.patch.yml', `注册名与 package.json 一致（${pkg.name}）`)
} else {
  fail('cordis.patch.yml 的注册名与 package.json 不一致', pkg.name)
}

console.log(failures === 0 ? '\nencoding looks clean' : `\n${failures} encoding check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
