// Manual probe of the live toolbox endpoint (not part of run-all):
//   node tests/probe-tool.mjs <tool> [lang] [key=value ...]
// The port comes from NWTOOL_PORT (default 8434) so it follows the running GUI.
const [, , tool, ...rest] = process.argv
const port = process.env.NWTOOL_PORT ?? '8434'
const lang = /^(zh|en|ja|de|ru|pt)$/.test(rest[0] ?? '') ? rest.shift() : 'zh'

const params = {}
for (const pair of rest) {
  const index = pair.indexOf('=')
  if (index < 0) continue
  const key = pair.slice(0, index)
  const raw = pair.slice(index + 1)
  if (raw === 'true') params[key] = true
  else if (raw === 'false') params[key] = false
  else if (/^-?\d+(\.\d+)?$/.test(raw)) params[key] = Number(raw)
  else params[key] = raw
}

const response = await fetch(`http://127.0.0.1:${port}/nwtool/api`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-nwtool-lang': lang },
  body: JSON.stringify({ op: 'run', tool, params, lang }),
})

if (!response.ok) {
  console.log('HTTP', response.status, await response.text())
  process.exit(1)
}

const decoder = new TextDecoder()
let buffer = ''
const counts = {}
const strings = []
const collect = (value) => {
  if (typeof value === 'string') strings.push(value)
  else if (Array.isArray(value)) value.forEach(collect)
  else if (value && typeof value === 'object') Object.values(value).forEach(collect)
}

for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true })
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    index = buffer.indexOf('\n')
    if (!line.trim()) continue
    const event = JSON.parse(line)
    counts[event.t] = (counts[event.t] ?? 0) + 1
    /* Rows are reference data: the browser translates each cell when it renders.
       Prose events are written by the Host, so they must already be translated. */
    if (event.t !== 'rows') collect(event.d)
    if (event.t === 'rows') {
      for (const row of event.d) console.log('ROW ', JSON.stringify(row))
    } else if (event.t === 'kv') {
      for (const item of event.d) console.log('KV  ', `${item.k} = ${String(item.v).slice(0, 120)}`)
    } else if (event.t === 'stats') {
      console.log('STAT', JSON.stringify(event.d).slice(0, 300))
    } else if (event.t === 'notice') {
      console.log('NOTE', event.d)
    } else if (event.t === 'log') {
      console.log('LOG ', String(event.d).slice(0, 200))
    } else if (event.t === 'error') {
      console.log('ERR ', event.d)
    } else if (event.t === 'text') {
      console.log('TEXT', String(event.d).split('\n').slice(0, 12).join('\n'))
    } else if (event.t === 'sections') {
      for (const section of event.d) {
        console.log('SECT', section.title, '->', String(section.body).split('\n').slice(0, 4).join(' / ').slice(0, 240))
      }
    } else if (event.t === 'diff') {
      console.log('DIFF', JSON.stringify(event.d.rows.filter((row) => row.type !== 'same')).slice(0, 400))
    } else if (event.t === 'done') {
      console.log('DONE', JSON.stringify(event.d).slice(0, 200))
    }
  }
}
console.log('EVENTS', JSON.stringify(counts))

const leaked = [...new Set(strings.filter((text) => /[\u4e00-\u9fff]/.test(text)))]
if (lang !== 'zh' && leaked.length) {
  console.log(`FAIL ${leaked.length} Chinese strings in a ${lang} run`)
  for (const text of leaked.slice(0, 10)) console.log(`     · ${text.slice(0, 120)}`)
  process.exit(1)
}
console.log(lang === 'zh' ? 'language: zh' : `language: ${lang}, no Chinese leaked`)
