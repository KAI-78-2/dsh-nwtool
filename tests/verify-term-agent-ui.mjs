// The DSH-sharing UI on a terminal tab: the share toggle, the badge, the
// dangerous-command approval dialog, the "DSH is typing" lock, and taking the
// keyboard back. Driven through a tiny hooks runtime with a fake transport.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(marker, "    return {\n      _panes: { TermPane },\n      inject: ['slots'],")

/* ------------------------------------------------------------------ */
/* Minimal hooks runtime                                               */
/* ------------------------------------------------------------------ */

const hookSlots = []
let hookIndex = 0
let effectQueue = []
let rendering = false
let pendingRender = false
let currentTree = null
let attention = 0

function schedule() {
  pendingRender = true
  if (rendering) return
  renderOnce()
}

function renderOnce() {
  if (rendering) return
  rendering = true
  try {
    do {
      pendingRender = false
      hookIndex = 0
      currentTree = expand(pluginModule._panes.TermPane({ onAttention: () => { attention += 1 } }))
      const queued = effectQueue
      effectQueue = []
      for (const run of queued) run()
    } while (pendingRender)
  } finally {
    rendering = false
  }
}

function expand(node, depth = 0) {
  if (depth > 40) throw new Error('component tree did not settle')
  if (Array.isArray(node)) return node.map((child) => expand(child, depth + 1))
  if (!node || typeof node !== 'object') return node
  const children = node.children ?? []
  if (typeof node.type === 'function') {
    const props = { ...node.props, children: children.length === 1 ? children[0] : children }
    return expand(node.type(props), depth + 1)
  }
  return { ...node, children: children.map((child) => expand(child, depth + 1)) }
}

const react = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  Component: class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }
  },
  useState(initial) {
    const index = hookIndex++
    if (!hookSlots[index]) {
      hookSlots[index] = { value: typeof initial === 'function' ? initial() : initial }
    }
    const slot = hookSlots[index]
    const setValue = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next
      if (Object.is(value, slot.value)) return
      slot.value = value
      schedule()
    }
    return [slot.value, setValue]
  },
  useRef(initial) {
    const index = hookIndex++
    if (!hookSlots[index]) hookSlots[index] = { current: initial }
    return hookSlots[index]
  },
  useEffect(run, deps) {
    const index = hookIndex++
    const previous = hookSlots[index]?.deps
    const changed = !previous || !deps || deps.length !== previous.length
      || deps.some((item, position) => !Object.is(item, previous[position]))
    if (changed) effectQueue.push(run)
    hookSlots[index] = { deps: deps ?? [] }
  },
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
}

let pluginModule = null
const loader = {
  load({ id, factory }) {
    pluginModule = factory((name) => {
      if (name === 'react') return react
      throw new Error(`unexpected require(${name})`)
    })
    pluginModule.__id = id
  },
}

const dom = { lang: 'zh-CN' }
const fakeDocument = {
  documentElement: {
    get lang() {
      return dom.lang
    },
  },
}
const fakeNavigator = { language: 'zh-CN', languages: ['zh-CN'] }
class FakeMutationObserver {
  observe() {}

  disconnect() {}
}

const store = new Map()
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'MutationObserver', instrumented)(
  { __ModuleLoader__: loader, localStorage },
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

/* ------------------------------------------------------------------ */
/* Fake transport                                                      */
/* ------------------------------------------------------------------ */

const book = [
  { id: 'dev-1', name: 'SW-Core', host: '192.0.2.10', port: 22, protocol: 'ssh', username: 'admin', authMode: 'saved', group: '' },
]

const calls = []
let openCount = 0

function jsonResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) }
}

function abortError() {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}

function streamResponse(events, signal) {
  const chunk = events.map((event) => `${JSON.stringify(event)}\n`).join('')
  let sent = false
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => new Promise((resolve, reject) => {
          if (!sent) {
            sent = true
            resolve({ done: false, value: new TextEncoder().encode(chunk) })
            return
          }
          if (signal?.aborted) {
            reject(abortError())
            return
          }
          signal?.addEventListener('abort', () => reject(abortError()), { once: true })
        }),
      }),
    },
  }
}

async function fakeFetch(url, options = {}) {
  const body = JSON.parse(options.body)
  calls.push(body)
  if (body.op === 'devices.list') return jsonResponse({ devices: book })
  if (body.op === 'term.list') return jsonResponse({ sessions: [] })
  if (body.op === 'term.share') return jsonResponse({ ok: true, shared: body.shared })
  if (body.op === 'term.approve') return jsonResponse({ ok: true })
  if (body.op === 'term.agent.cancel') return jsonResponse({ ok: true })
  if (body.op === 'term.open') {
    const id = `sess-${(openCount += 1)}`
    const events = [
      { t: 'ready', d: { sessionId: id } },
      { t: 'data', d: btoa(`banner-${id}\r\n`) },
    ]
    /* The first session already comes back shared and mid-command, as if the
       page had been reloaded while the model was working. */
    if (id === 'sess-1') {
      events.push({ t: 'share', d: { shared: true } })
      events.push({ t: 'agent', d: { state: 'running', line: 'reboot' } })
      events.push({ t: 'approval', d: { id: 'ap-1', line: 'reboot', expiresIn: 90000 } })
    }
    return streamResponse(events, options.signal)
  }
  if (body.op === 'term.diag') return jsonResponse({ verdict: 'ok' })
  return jsonResponse({ ok: true })
}

globalThis.fetch = fakeFetch

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object') return (node.children ?? []).map(textOf).join('')
  return ''
}

function collect(node, predicate, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, out)
    return out
  }
  if (!node || typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  for (const child of node.children ?? []) collect(child, predicate, out)
  return out
}

const tokens = (node) => String(node.props?.className ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, name) => tokens(node).includes(name)
const buttons = () => collect(currentTree, (node) => node.type === 'button')
const labelsOf = (label) => buttons().filter((button) => textOf(button).trim() === label)
const tabNames = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-name')).map((node) => textOf(node).trim())

async function settle(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

renderOnce()
await settle()

function selectDevice() {
  const item = buttons().find((button) => hasClass(button, 'nwt-term-item'))
  item?.props.onClick()
}

selectDevice()
labelsOf('连接')[0]?.props.onClick()
await settle(6)

expect('a session tab opens', tabNames().join(',') === 'SW-Core', tabNames().join(','))
expect('a shared tab carries a badge', collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-share')).length === 1)
expect('the toolbar offers to stop sharing', labelsOf('取消共享').length === 1,
  [...new Set(buttons().map((button) => textOf(button).trim()))].join(' | '))
expect('the typing indicator is visible', collect(currentTree, (node) => hasClass(node, 'nwt-term-agent')).length === 1)
expect('the user can take the keyboard back', labelsOf('收回控制').length === 1)

const textarea = collect(currentTree, (node) => node.type === 'textarea')[0]
expect('human input is locked while the model types', textarea?.props.readOnly === true, String(textarea?.props.readOnly))

const dialog = collect(currentTree, (node) => hasClass(node, 'nwt-term-approval'))[0]
expect('a dangerous command asks for approval', Boolean(dialog), '')
expect('the dialog shows the exact command', textOf(dialog ?? {}).includes('reboot'), textOf(dialog ?? {}).slice(0, 80))
expect('the dialog can be answered both ways', labelsOf('允许执行').length === 1 && labelsOf('拒绝').length === 1)
expect('the terminal pane is brought forward for the answer', attention > 0, String(attention))

labelsOf('拒绝')[0]?.props.onClick()
await settle(2)
const answers = calls.filter((call) => call.op === 'term.approve')
expect('refusing sends the verdict to the host', answers.length === 1 && answers[0].allow === false && answers[0].approvalId === 'ap-1',
  JSON.stringify(answers[0] ?? {}))
expect('the dialog closes after the answer', collect(currentTree, (node) => hasClass(node, 'nwt-term-approval')).length === 0)

labelsOf('收回控制')[0]?.props.onClick()
await settle(2)
expect('taking back control cancels the command', calls.some((call) => call.op === 'term.agent.cancel'))

/* A second, unshared tab: the switch is off until the user turns it on. */
selectDevice()
labelsOf('连接')[0]?.props.onClick()
await settle(6)
expect('the second tab is not shared', labelsOf('共享给 DSH').length === 1,
  [...new Set(buttons().map((button) => textOf(button).trim()))].join(' | '))
expect('only the shared tab shows a badge', collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-share')).length === 1)

labelsOf('共享给 DSH')[0]?.props.onClick()
await settle(3)
const shares = calls.filter((call) => call.op === 'term.share')
expect('turning sharing on tells the host', shares.length === 1 && shares[0].shared === true, JSON.stringify(shares[0] ?? {}))
expect('the toolbar flips to stop sharing', labelsOf('取消共享').length === 1)

console.log(failures === 0 ? '\nshared terminal UI behaves' : `\n${failures} sharing check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
