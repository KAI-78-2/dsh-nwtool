// Runs one engine in-process: node scratch-run.mjs <tool> [key=value ...]
import { runTool } from '../host/engine.js'

const [, , tool, ...pairs] = process.argv
const params = {}
for (const pair of pairs) {
  const index = pair.indexOf('=')
  if (index < 0) continue
  const key = pair.slice(0, index)
  const raw = pair.slice(index + 1)
  if (raw === 'true') params[key] = true
  else if (raw === 'false') params[key] = false
  else if (/^-?\d+(\.\d+)?$/.test(raw)) params[key] = Number(raw)
  else params[key] = raw
}

const emit = (event) => {
  if (event.t === 'rows') {
    for (const row of event.d) console.log('ROW ', JSON.stringify(row))
  } else if (event.t === 'kv') {
    for (const item of event.d) console.log('KV  ', `${item.k} = ${String(item.v).slice(0, 140)}`)
  } else if (event.t === 'stats') {
    console.log('STAT', JSON.stringify(event.d).slice(0, 300))
  } else if (event.t === 'notice') {
    console.log('NOTE', event.d)
  } else if (event.t === 'log') {
    console.log('LOG ', String(event.d).slice(0, 220))
  } else if (event.t === 'error') {
    console.log('ERR ', event.d)
  } else if (event.t === 'text') {
    console.log('TEXT', String(event.d).split('\n').slice(0, 26).join('\n'))
  } else if (event.t === 'sections') {
    for (const section of event.d) {
      console.log('SECT', section.title, '->', String(section.body).split('\n').slice(0, 5).join(' / ').slice(0, 260))
    }
  } else if (event.t === 'diff') {
    console.log('DIFF', JSON.stringify(event.d.rows.filter((row) => row.type !== 'same')).slice(0, 300))
  } else if (event.t === 'done') {
    console.log('DONE', JSON.stringify(event.d).slice(0, 200))
  }
}

try {
  await runTool(tool, params, emit, new AbortController().signal)
} catch (error) {
  console.log('THROWN', String(error?.message ?? error))
}
