// The ambient strip in the workspace session view: which device consoles are
// still shared with DSH, the list it opens (frame-wide overlay, not clipped by
// the composer), a way back to the terminal, and a way to stop sharing.
// Also checks that the panel remembers the last tool, so "Open terminal" lands
// on the terminal instead of Ping.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(marker, "    return {\n      _panes: { SharedDock, SharedMenu, ToolboxPage },\n      inject: ['slots'],")

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
/* Fake transport and services                                         */
/* ------------------------------------------------------------------ */

const calls = []
const panels = []
let sessions = []
let registeredDock = null
let registeredMenu = null

function jsonResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) }
}

async function fakeFetch(url, options = {}) {
  const body = JSON.parse(options.body)
  calls.push(body)
  if (body.op === 'term.list') return jsonResponse({ sessions })
  if (body.op === 'term.share') {
    const target = sessions.find((item) => item.id === body.id)
    if (target) target.shared = Boolean(body.shared)
    return jsonResponse({ ok: true, shared: Boolean(body.shared) })
  }
  return jsonResponse({})
}

globalThis.fetch = fakeFetch

const fakeCtx = {
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      if (options.name === 'conversation.composer.dock') registeredDock = component
      if (options.name === 'shell.overlay' && options.id === 'nwtool-share-menu') registeredMenu = component
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

const classesOf = (node) => String(node.props?.className ?? '').split(/\s+/).filter(Boolean)
const byClass = (name) => collect(currentTree, (node) => classesOf(node).includes(name))
const buttons = () => collect(currentTree, (node) => node.type === 'button')
const labelsOf = (label) => buttons().filter((button) => textOf(button).trim() === label)

const fakeTrigger = {
  getBoundingClientRect: () => ({ left: 480, top: 738, right: 620, bottom: 758, width: 140, height: 20 }),
}

function clickTrigger() {
  const trigger = byClass('nwt-share-trigger')[0]
  if (!trigger) throw new Error('no share trigger on screen')
  trigger.props.onClick({ currentTarget: fakeTrigger })
}

async function settle(turns = 4) {
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

expect('the strip is registered under the composer', registeredDock === pluginModule._panes.SharedDock,
  String(Boolean(registeredDock)))
expect('the list is registered in the frame overlay', registeredMenu === pluginModule._panes.SharedMenu,
  String(Boolean(registeredMenu)))

sessions = [
  { id: 's1', name: 'test2', host: '192.0.2.11', shared: true, agent: 'idle' },
  { id: 's2', name: 'SW-Core', host: '192.0.2.10', shared: false, agent: 'idle' },
]

renderComponent(registeredDock)
await settle(5)
expect('the trigger lists the shared device', textOf(currentTree).includes('test2') && !textOf(currentTree).includes('SW-Core'),
  textOf(currentTree))
expect('the trigger says how many are shared', textOf(currentTree).includes('1 个终端'), textOf(currentTree))
expect('the trigger is a button that opens the list', byClass('nwt-share-trigger').length === 1)

clickTrigger()
await settle(2)
renderComponent(registeredMenu)
await settle(2)
expect('the list opens', byClass('nwt-share-menu').length === 1)
expect('the list has a heading', byClass('nwt-share-menu-title').length === 1)
expect('the list counts the devices', textOf(byClass('nwt-share-menu-count')[0] ?? {}).includes('1 个终端'),
  textOf(byClass('nwt-share-menu-count')[0] ?? {}))
const rows = byClass('nwt-share-row').map((row) => textOf(row).trim())
expect('the list shows one row per device', rows.length === 1 && rows[0].includes('test2') && rows[0].includes('192.0.2.11'),
  rows.join(' | '))
expect('the list offers a way back', labelsOf('打开终端').length === 1)
expect('a single device can be unshared from the list', labelsOf('取消共享').length === 1)

labelsOf('打开终端')[0]?.props.onClick()
await settle(2)
expect('opening the terminal selects the panel', panels.join(',') === 'nwtool', panels.join(','))
expect('the panel remembers to land on the terminal', store.get('nwtool.tool.last') === 'terminal', String(store.get('nwtool.tool.last')))
renderComponent(registeredMenu)
await settle(2)
expect('the list closes after an action', currentTree === null)

/* Reopen and revoke: the host is told, and the trigger disappears. */
renderComponent(registeredDock)
await settle(2)
clickTrigger()
await settle(2)
renderComponent(registeredMenu)
await settle(2)
labelsOf('取消共享')[0]?.props.onClick()
await settle(4)
const revoke = calls.filter((call) => call.op === 'term.share')
expect('unsharing is sent to the host', revoke.length === 1 && revoke[0].shared === false && revoke[0].id === 's1',
  JSON.stringify(revoke[0] ?? {}))
renderComponent(registeredDock)
await settle(3)
expect('the trigger disappears once nothing is shared', currentTree === null)

/* Two devices, one of them busy: the trigger switches to the activity text. */
sessions = [
  { id: 's1', name: 'test2', host: '192.0.2.11', shared: true, agent: 'running' },
  { id: 's2', name: 'SW-Core', host: '192.0.2.10', shared: true, agent: 'idle' },
]
await new Promise((resolve) => setTimeout(resolve, 5200))
renderComponent(registeredDock)
await settle(3)
expect('the trigger notices a new share on its own', textOf(currentTree).includes('test2'), textOf(currentTree))
expect('it shows what DSH is doing', textOf(currentTree).includes('正在操作 test2'), textOf(currentTree))
expect('a busy session gets the activity dot', byClass('nwt-share-trigger-dot').length === 1)

clickTrigger()
await settle(2)
renderComponent(registeredMenu)
await settle(2)
expect('the list shows both devices', byClass('nwt-share-row').length === 2, String(byClass('nwt-share-row').length))
expect('the busy row is marked', byClass('nwt-share-row-dot--busy').length === 1)
expect('several devices can be unshared at once', labelsOf('全部取消共享').length === 1)

/* The panel's last-tool memory: a stored tool is reopened, an unknown one is not. */
function renderToolboxWith(stored) {
  hookIndex = 0
  hookSlots = []
  currentComponent = null
  store.set('nwtool.tool.last', stored)
  const tree = expand(pluginModule._panes.ToolboxPage({}))
  const title = collect(tree, (node) => classesOf(node).includes('nwt-title'))[0]
  return textOf(title ?? '').trim()
}
const remembered = renderToolboxWith('terminal')
expect('the panel reopens on the remembered tool', remembered.includes('终端'), remembered)
const fallback = renderToolboxWith('not-a-tool')
expect('an unknown remembered tool falls back to Ping', fallback.includes('Ping'), fallback)

console.log(failures === 0 ? '\nshared-terminal strip behaves' : `\n${failures} dock check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
