// The floating terminal: a pinned session that stays on screen in the frame
// overlay while the main slot shows a conversation. It owns a second attach
// stream (the Host replays from its buffer), can be typed into, answers a
// dangerous-command approval, and hands the session back to the panel on mount.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(
  marker,
  "    return {\n      _float: { FloatWindow, floatStore, setFloatTarget, clearFloat, setFloatMounted },\n      inject: ['slots'],",
)

/* ------------------------------------------------------------------ */
/* Minimal hooks runtime (one component at a time)                     */
/* ------------------------------------------------------------------ */

let hookSlots = []
let hookIndex = 0
let effectQueue = []
let rendering = false
let pendingRender = false
let currentTree = null
let currentComponent = null

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
      currentTree = expand(currentComponent({}))
      const queued = effectQueue
      effectQueue = []
      for (const run of queued) run()
    } while (pendingRender)
  } finally {
    rendering = false
  }
}

function renderComponent(component) {
  if (currentComponent !== component) {
    hookSlots = []
    effectQueue = []
    currentComponent = component
  }
  renderOnce()
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
  addEventListener() {},
  removeEventListener() {},
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
  { __ModuleLoader__: loader, localStorage, innerWidth: 1280, innerHeight: 800 },
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

/* ------------------------------------------------------------------ */
/* Fake transport                                                      */
/* ------------------------------------------------------------------ */

const calls = []
const inputs = []
const approvals = []
const shares = []
const panels = []
let registeredFloat = null

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
  if (body.op === 'term.attach') {
    if (body.id === 'sess-gone') {
      return streamResponse([
        { t: 'ready', d: { sessionId: 'sess-gone' } },
        { t: 'exit', d: 'closed' },
      ], options.signal)
    }
    return streamResponse([
      { t: 'ready', d: { sessionId: 'sess-1', shared: false, agent: 'idle' } },
      { t: 'data', d: btoa('attach-banner\r\n$ ') },
      { t: 'approval', d: { id: 'ap-1', line: 'reboot' } },
    ], options.signal)
  }
  if (body.op === 'term.input') {
    inputs.push(atob(body.data))
    return jsonResponse({ ok: true })
  }
  if (body.op === 'term.approve') {
    approvals.push(body)
    return jsonResponse({ ok: true })
  }
  if (body.op === 'term.share') {
    shares.push({ id: body.id, shared: body.shared })
    return jsonResponse({ ok: true, shared: body.shared })
  }
  if (body.op === 'term.resize') return jsonResponse({ ok: true })
  if (body.op === 'term.close') return jsonResponse({ ok: true })
  return jsonResponse({})
}

globalThis.fetch = fakeFetch

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
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
const byClass = (name) => collect(currentTree, (node) => hasClass(node, name))
const textareas = () => collect(currentTree, (node) => node.type === 'textarea')

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

const fakeCtx = {
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      if (options.id === 'nwtool-term-float') registeredFloat = component
      return () => {}
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  get(name) {
    if (name === 'layout') return { selectPanel: (id) => panels.push(id) }
    return undefined
  },
}

pluginModule.apply(fakeCtx)
const float = pluginModule._float

expect('the floating window is registered in the frame overlay', registeredFloat === float.FloatWindow,
  String(Boolean(registeredFloat)))

renderComponent(registeredFloat)
await settle(2)
expect('nothing floats until a session is pinned', currentTree === null, String(currentTree))

/* The panel is on screen when the user pins a tab, so it keeps the stream. */
float.setFloatMounted(true)
await settle(1)
float.setFloatTarget({ id: 'sess-1', title: 'SW-Core', host: '192.0.2.10', port: 22 })
await settle(2)
expect('the panel keeps ownership while it is on screen', currentTree === null, String(currentTree))
expect('the pin is remembered across a reload', (() => {
  const stored = JSON.parse(store.get('nwtool.float.v1') ?? '{}')
  return stored.enabled === true && stored.target?.id === 'sess-1'
})(), store.get('nwtool.float.v1'))

/* Switch to a conversation: the panel goes away and the float attaches. */
float.setFloatMounted(false)
await settle(6)
expect('the window appears once the panel is gone', byClass('nwt-float').length === 1,
  String(byClass('nwt-float').length))
const attach = calls.filter((call) => call.op === 'term.attach')
expect('it attaches to the same Host session from the beginning', attach.length === 1
  && attach[0].id === 'sess-1' && attach[0].since === 0, `${attach.length}:${attach.map((call) => `${call.id}@${call.since}`).join(',')}`)
expect('it asks for a compact grid', attach[0]?.cols > 20 && attach[0]?.rows > 3,
  `${attach[0]?.cols}x${attach[0]?.rows}`)
expect('the replayed output is on screen', textOf(byClass('nwt-float-grid')[0] ?? {}).includes('attach-banner'),
  textOf(byClass('nwt-float-grid')[0] ?? {}).slice(0, 40))
expect('the header names the device', textOf(byClass('nwt-float-name')[0] ?? {}).includes('SW-Core'),
  textOf(byClass('nwt-float-name')[0] ?? {}))
expect('the header shows the address', textOf(byClass('nwt-float-host')[0] ?? {}).includes('192.0.2.10'),
  textOf(byClass('nwt-float-host')[0] ?? {}))
expect('it opens in the top-right corner', (() => {
  const node = byClass('nwt-float')[0]
  return node?.props.style?.left === '824px' && node?.props.style?.top === '56px'
})(), JSON.stringify(byClass('nwt-float')[0]?.props.style ?? {}))

/* Sharing is reachable from the window itself, before the panel button. */
expect('the window can share the session with DSH', labelsOf('共享给 DSH').length === 1,
  [...new Set(buttons().map((node) => textOf(node).trim()))].join('|'))
labelsOf('共享给 DSH')[0]?.props.onClick()
await settle(2)
expect('sharing is sent to the host', shares.length === 1 && shares[0].id === 'sess-1' && shares[0].shared === true,
  JSON.stringify(shares[0] ?? {}))
expect('the button now offers to unshare', labelsOf('取消共享').length === 1,
  [...new Set(buttons().map((node) => textOf(node).trim()))].join('|'))
labelsOf('取消共享')[0]?.props.onClick()
await settle(2)
expect('revoking is sent to the host', shares.length === 2 && shares[1].shared === false, JSON.stringify(shares[1] ?? {}))
expect('the button is back to sharing', labelsOf('共享给 DSH').length === 1)
expect('the share button sits left of the panel button', (() => {
  const header = byClass('nwt-float-head')[0] ?? {}
  const labels = collect(header, (node) => node.type === 'button').map((node) => textOf(node).trim())
  return labels.join('|') === '共享给 DSH|面板|×'
})(), collect(byClass('nwt-float-head')[0] ?? {}, (node) => node.type === 'button').map((node) => textOf(node).trim()).join('|'))

/* Typing and pasting go to the device, not to the conversation. */
{
  const textarea = textareas()[0]
  expect('a connected float offers a keyboard sink', Boolean(textarea))
  textarea?.props.onInput({ target: { value: 'show clock\r' } })
  await settle(1)
  expect('typing reaches the session', inputs.join('|').includes('show clock\r'), JSON.stringify(inputs))
  textarea?.props.onPaste({
    clipboardData: { getData: () => 'a\nb' },
    preventDefault() {},
  })
  await settle(1)
  expect('pasting reaches the session with CR line ends', inputs.join('|').includes('a\rb'), JSON.stringify(inputs))
  let prevented = false
  textarea?.props.onKeyDown({
    key: 'v', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false,
    preventDefault: () => { prevented = true },
  })
  expect('Ctrl+V is left to the browser here too', prevented === false)
}

/* A dangerous command asked by DSH can be answered without the panel. */
expect('the approval request appears in the window', byClass('nwt-float-approval').length === 1)
expect('it shows the command', textOf(byClass('nwt-float-approval-cmd')[0] ?? {}).includes('reboot'),
  textOf(byClass('nwt-float-approval-cmd')[0] ?? {}))
labelsOf('允许执行')[0]?.props.onClick()
await settle(2)
expect('allowing it is sent for that session', approvals.length === 1
  && approvals[0].id === 'sess-1' && approvals[0].approvalId === 'ap-1' && approvals[0].allow === true,
JSON.stringify(approvals[0] ?? {}))
expect('the request is cleared afterwards', byClass('nwt-float-approval').length === 0)

/* The way back: the panel is selected and lands on the terminal. */
labelsOf('面板')[0]?.props.onClick()
await settle(1)
expect('the panel button selects the toolbox', panels.join(',') === 'nwtool', panels.join(','))
expect('it remembers to land on the terminal', store.get('nwtool.tool.last') === 'terminal',
  String(store.get('nwtool.tool.last')))

/* The panel taking over closes the window; the pin is what survives. */
float.setFloatMounted(true)
await settle(2)
expect('mounting the panel hides the float', currentTree === null, String(currentTree))
float.setFloatMounted(false)
await settle(4)
expect('leaving again brings the same window back', byClass('nwt-float').length === 1)

/* Closing the window unpins; the session is left for the panel. */
const closeButton = buttons().find((button) => button.props['aria-label'] === '取消浮窗')
expect('the window offers a close button', Boolean(closeButton))
closeButton?.props.onClick()
await settle(2)
expect('closing the window unpins the session', float.floatStore.enabled === false
  && float.floatStore.target === null, JSON.stringify(float.floatStore.target))
expect('the window is gone', currentTree === null, String(currentTree))
expect('the pin is cleared in storage', JSON.parse(store.get('nwtool.float.v1') ?? '{}').enabled === false,
  store.get('nwtool.float.v1'))

/* A session that is gone explains itself instead of showing a dead terminal. */
float.setFloatTarget({ id: 'sess-gone', title: 'CORE-1', host: '192.0.2.11', port: 22 })
await settle(6)
expect('an ended session is reported', textOf(currentTree).includes('会话已结束'),
  textOf(byClass('nwt-float-note')[0] ?? {}))
expect('an ended session offers the panel', labelsOf('回面板').length === 1)
expect('an ended session cannot be typed into', textareas().length === 0, String(textareas().length))
expect('an ended session offers no sharing toggle', labelsOf('共享给 DSH').length === 0, '')
float.clearFloat()
await settle(2)

console.log(failures === 0 ? '\nfloating terminal behaves' : `\n${failures} float check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
