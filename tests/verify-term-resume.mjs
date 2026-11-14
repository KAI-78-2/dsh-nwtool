// Coming back to the toolbox after another workspace session took over the main
// slot: the tabs are remembered in localStorage and the sessions the Host still
// holds are re-attached (with their buffered output replayed) instead of dialled
// again. A session that is gone stays as a closed tab that can be reconnected.
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
      currentTree = expand(pluginModule._panes.TermPane({}))
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

/* The real browser storage, trimmed to what the pane uses. */
const store = new Map()
const localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

const STORAGE_KEY = 'nwtool.tabs.v1'
store.set(STORAGE_KEY, JSON.stringify({
  activeIndex: 0,
  encoding: 'utf-8',
  tabs: [
    {
      title: 'SW-Core', deviceId: 'dev-1', host: '192.0.2.10', port: 22, protocol: 'ssh',
      username: 'admin', authMode: 'saved', sessionId: 'sess-live',
    },
    {
      title: 'CORE-1', deviceId: 'dev-2', host: '192.0.2.11', port: 22, protocol: 'ssh',
      username: 'ops', authMode: 'prompt', sessionId: 'sess-gone',
    },
  ],
}))

const fakeWindow = { __ModuleLoader__: loader, localStorage }

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'MutationObserver', instrumented)(
  fakeWindow,
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

/* ------------------------------------------------------------------ */
/* Fake transport                                                      */
/* ------------------------------------------------------------------ */

const book = [
  { id: 'dev-1', name: 'SW-Core', host: '192.0.2.10', port: 22, protocol: 'ssh', username: 'admin', authMode: 'saved', group: '' },
  { id: 'dev-2', name: 'CORE-1', host: '192.0.2.11', port: 22, protocol: 'ssh', username: 'ops', authMode: 'prompt', group: '' },
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
  if (body.op === 'term.list') {
    return jsonResponse({
      sessions: [
        { id: 'sess-live', name: 'SW-Core', host: '192.0.2.10', protocol: 'ssh', state: 'detached', seq: 64 },
      ],
    })
  }
  if (body.op === 'term.attach') {
    /* A real re-attach replays the whole retained history, not just the last
       screenful: 400 lines is what the pane has to be able to scroll through. */
    let text = ''
    for (let line = 1; line <= 400; line += 1) text += `history-${line}\r\n`
    text += 'replay-banner\r\n'
    return streamResponse([
      { t: 'ready', d: { sessionId: 'sess-live', attached: true, since: 0, skipped: false } },
      { t: 'data', d: btoa(text) },
    ], options.signal)
  }
  if (body.op === 'term.open') {
    const id = `sess-${(openCount += 1)}`
    return streamResponse([
      { t: 'ready', d: { sessionId: id } },
      { t: 'data', d: btoa(`banner-${id}\r\n`) },
    ], options.signal)
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
const tabDots = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-dot')).map((node) => {
  if (hasClass(node, 'nwt-term-dot--on')) return 'on'
  if (hasClass(node, 'nwt-term-dot--wait')) return 'wait'
  if (hasClass(node, 'nwt-term-dot--off')) return 'off'
  return '?'
})
const screenText = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-grid')).map(textOf).join('|')
const stored = () => JSON.parse(store.get(STORAGE_KEY) ?? '{"tabs":[]}')

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
await settle(6)

expect('the remembered tabs come back', tabNames().join(',') === 'SW-Core,CORE-1', tabNames().join(','))
expect('the remembered active tab is restored', (() => {
  const active = collect(currentTree, (node) => hasClass(node, 'nwt-term-tab--active'))
  return active.length === 1 && textOf(active[0]).includes('SW-Core')
})(), '')
expect('the live session is re-attached, not dialled', (() => {
  const attach = calls.filter((call) => call.op === 'term.attach')
  const dialled = calls.filter((call) => call.op === 'term.open')
  return attach.length === 1 && attach[0].id === 'sess-live' && attach[0].since === 0 && dialled.length === 0
})(), JSON.stringify(calls.map((call) => call.op)))
expect('the restored tab is connected', tabDots().join(',') === 'on,off', tabDots().join(','))
expect('the buffered output is replayed into the screen', screenText().includes('replay-banner'), screenText().slice(0, 40))
expect('the user is told what happened', textOf(currentTree).includes('已恢复 1 个标签页'), '')
expect('a session that is gone stays as a closed tab', (() => {
  const closed = collect(currentTree, (node) => hasClass(node, 'nwt-term-tab'))
  return closed.length === 2 && textOf(closed[1]).includes('CORE-1')
})(), '')

/* The surviving tab remembers its session id, so a reload can attach again. */
expect('the session id is written back to storage', stored().tabs[0]?.sessionId === 'sess-live'
  && stored().tabs[1]?.sessionId === 'sess-gone', JSON.stringify(stored().tabs.map((tab) => tab.sessionId)))

/* ------------------------------------------------------------------ */
/* The replay is readable, not just the last screenful                 */
/* ------------------------------------------------------------------ */

const screenNode = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-screen'))[0]
const gridText = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-grid')).map(textOf).join('')
const renderedRows = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-row')).length
const atBottomPill = () => labelsOf('回到底部').length

expect('the replayed tail is on screen', gridText().includes('replay-banner'), gridText().slice(0, 40))
expect('the render window is bounded, not the whole replay', renderedRows() < 60, String(renderedRows()))
expect('the keyboard sink sits beside the canvas, not on top of it', (() => {
  const screen = screenNode()
  const stage = collect(currentTree, (node) => hasClass(node, 'nwt-term-stage'))[0]
  return collect(screen, (node) => node.type === 'textarea').length === 0
    && collect(stage, (node) => node.type === 'textarea').length === 1
})(), '')

/* Scrolling up is what "read the history" means: the oldest replayed line must
   still be reachable, while only the visible window is in the DOM. */
screenNode().props.onScroll({ currentTarget: { scrollTop: 0, clientHeight: 600, scrollHeight: 756 } })
await settle(2)
expect('scrolling up reaches the first replayed line', gridText().includes('history-1'), gridText().slice(0, 40))
expect('the window stays bounded while scrolled up', renderedRows() < 60, String(renderedRows()))
expect('a way back to the newest line appears', atBottomPill() === 1, String(atBottomPill()))

labelsOf('回到底部')[0]?.props.onClick()
await settle(2)
expect('the pill jumps back to the newest line', gridText().includes('replay-banner'), gridText().slice(0, 40))
expect('the pill disappears once the newest line is on screen', atBottomPill() === 0, String(atBottomPill()))

/* Reconnecting a dead tab dials the device it belonged to — but a device that
   asks for a password each time needs it again, and says so instead of dialling
   into ssh's invisible prompt. */
buttons().find((node) => hasClass(node, 'nwt-term-tab-btn') && textOf(node).includes('CORE-1'))?.props.onClick()
await settle(2)
const reconnect = labelsOf('重新连接')[0]
expect('a closed tab offers a reconnect', Boolean(reconnect), '')
reconnect?.props.onClick()
await settle(4)
expect('reconnecting without a password is refused', !calls.some((call) => call.op === 'term.open'),
  JSON.stringify(calls.filter((call) => call.op === 'term.open').map((call) => call.deviceId ?? '(device)')))
expect('the refusal explains what to do', textOf(currentTree).includes('请先在工具栏填入密码'), '')

/* The password box follows the tab, so it is there to fill in. */
{
  const field = collect(currentTree, (node) => node.type === 'input' && node.props?.type === 'password')[0]
  expect('the password box is offered for the tab', Boolean(field), '')
  field?.props.onChange({ target: { value: 'secret' } })
  await settle(2)
}

labelsOf('重新连接')[0]?.props.onClick()
await settle(4)
expect('reconnecting dials the same device', calls.some((call) => call.op === 'term.open' && call.deviceId === 'dev-2'),
  JSON.stringify(calls.filter((call) => call.op === 'term.open').map((call) => call.deviceId ?? '(device)')))
expect('the reconnected tab is live again', tabDots().join(',') === 'on,on', tabDots().join(','))

/* Closing every tab forgets the strip; nothing is resurrected next time. */
collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-x'))[1]?.props.onClick()
await settle(2)
expect('closing one tab keeps the other remembered', stored().tabs.length === 1, JSON.stringify(stored().tabs.length))
collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-x'))[0]?.props.onClick()
await settle(2)
expect('closing the last tab clears the memory', store.has(STORAGE_KEY) === false, String(store.has(STORAGE_KEY)))

console.log(failures === 0 ? '\nremembered tabs resume' : `\n${failures} resume check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
