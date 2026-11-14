// The usage guide in the left footer: one button beside the version opens a
// sheet with the about section, every tool's note (generated from the same
// tables the panel renders) and the agent tools the model can call.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(
  marker,
  "    return {\n      _panes: { ToolboxPage },\n      _meta: { TOOL_COUNT, AGENT_TOOLS, GROUPS, TOOL_NOTES, toolMeta },\n      inject: ['slots'],",
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

/** Start from a clean hook table, as a fresh mount would. */
function mountFresh() {
  hookSlots = []
  effectQueue = []
  currentComponent = null
  currentTree = null
  renderComponent(pluginModule._panes.ToolboxPage)
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
    const previous = hookSlots[index]
    const changed = !previous || !deps || deps.length !== previous.deps?.length
      || deps.some((item, position) => !Object.is(item, previous.deps?.[position]))
    if (!changed) return
    effectQueue.push(() => {
      if (typeof previous?.cleanup === 'function') previous.cleanup()
      const cleanup = run()
      hookSlots[index] = { deps: deps ?? [], cleanup: typeof cleanup === 'function' ? cleanup : null }
    })
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
/* Capture and bubble listeners are kept apart, the way a browser keeps them:
   the panel's copy handler is a capture listener and stays registered. */
const listeners = new Map()
const listenerKey = (type, capture) => `${type}|${capture ? 'capture' : 'bubble'}`
const fakeDocument = {
  documentElement: {
    get lang() {
      return dom.lang
    },
  },
  addEventListener(type, handler, options) {
    const key = listenerKey(type, options === true || options?.capture === true)
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(handler)
  },
  removeEventListener(type, handler, options) {
    listeners.get(listenerKey(type, options === true || options?.capture === true))?.delete(handler)
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

/* Nothing in the guide needs the network; the mounted panes behind it do. */
function jsonResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) }
}
globalThis.fetch = async (url, options = {}) => {
  const body = (() => {
    try {
      return JSON.parse(options.body ?? '{}')
    } catch {
      return {}
    }
  })()
  if (body.op === 'devices.list') return jsonResponse({ devices: [] })
  if (body.op === 'term.list') return jsonResponse({ sessions: [] })
  return jsonResponse({})
}

const fakeCtx = {
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register() {
      return () => {}
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  get() {
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

const tokens = (node) => String(node.props?.className ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, name) => tokens(node).includes(name)
const byClass = (name) => collect(currentTree, (node) => hasClass(node, name))
const buttons = () => collect(currentTree, (node) => node.type === 'button')
const labelsOf = (label) => buttons().filter((button) => textOf(button).trim() === label)
const sheet = () => byClass('nwt-about-sheet')[0] ?? null
const titleText = () => textOf(byClass('nwt-title')[0] ?? {}).trim()

async function settle(turns = 4) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function pressEscape() {
  for (const [key, handlers] of listeners) {
    if (!key.startsWith('keydown|')) continue
    for (const handler of handlers) handler({ key: 'Escape' })
  }
}

/** Bubble-phase keydown listeners, i.e. the ones the guide registers. */
function bubbleKeydownCount() {
  return (listeners.get('keydown|bubble') ?? new Set()).size
}

function cjkOnly(text) {
  return /[\u4e00-\u9fff]/.test(String(text))
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

const { TOOL_COUNT, AGENT_TOOLS, GROUPS } = pluginModule._meta

mountFresh()
await settle(3)

const aboutButton = () => byClass('nwt-nav-about')[0] ?? null
expect('the footer carries a guide button beside the version', Boolean(aboutButton()),
  textOf(byClass('nwt-nav-foot')[0] ?? {}))
expect('the guide button sits after the version', (() => {
  const foot = byClass('nwt-nav-foot')[0] ?? {}
  const names = (foot.children ?? []).map((child) => String(child?.props?.className ?? ''))
  return names.join('|') === 'nwt-nav-foot-name|nwt-nav-foot-version|nwt-nav-about'
})(), (byClass('nwt-nav-foot')[0]?.children ?? []).map((child) => child?.props?.className).join('|'))
expect('the button is labelled in the UI language', textOf(aboutButton() ?? {}).trim() === '说明',
  textOf(aboutButton() ?? {}))
expect('the sheet starts closed', sheet() === null, String(sheet()))

aboutButton().props.onClick()
await settle(2)
expect('clicking it opens the sheet', Boolean(sheet()), String(Boolean(sheet())))
expect('the sheet is a dialog', byClass('nwt-about')[0]?.props.role === 'dialog')
expect('the sheet names itself', textOf(byClass('nwt-about-title')[0] ?? {}).includes('关于与使用说明'),
  textOf(byClass('nwt-about-title')[0] ?? {}))
expect('the sheet shows the version', textOf(byClass('nwt-about-version')[0] ?? {}).startsWith('v'),
  textOf(byClass('nwt-about-version')[0] ?? {}))

const body = textOf(byClass('nwt-about-body')[0] ?? {})
expect('the lead counts every tool', body.includes(String(TOOL_COUNT)) && TOOL_COUNT === 33, String(TOOL_COUNT))
expect('the lead counts the agent tools', body.includes(`${AGENT_TOOLS.length} 个 Agent 工具`), String(AGENT_TOOLS.length))
expect('the about section lists what it is and where data lives', body.includes('~/.dsh-nwtool')
  && body.includes('主机侧'), '')

const toolRows = byClass('nwt-about-row--tool')
expect('every tool has a row', toolRows.length === TOOL_COUNT, `${toolRows.length} vs ${TOOL_COUNT}`)
expect('each row names the tool and explains it', toolRows.every((row) => {
  const name = textOf(byClass('nwt-about-name').find((node) => row.children?.includes(node)) ?? {})
  const text = textOf(row).trim()
  return Boolean(name) && text.length > name.length
}), '')
expect('the rows are grouped like the sidebar', (() => {
  const headings = byClass('nwt-about-h').map((node) => textOf(node).trim())
  return GROUPS.every((group) => headings.includes(group.title))
})(), byClass('nwt-about-h').map((node) => textOf(node).trim()).join(' | '))
expect('the notes are the same ones the panel shows', (() => {
  const notes = byClass('nwt-about-text').map((node) => textOf(node).trim())
  return notes.some((note) => note.startsWith('单包默认 32 字节'))
})(), '')

const agentRows = byClass('nwt-about-row--agent')
expect('every agent tool has a row', agentRows.length === AGENT_TOOLS.length && AGENT_TOOLS.length === 20,
  `${agentRows.length} vs ${AGENT_TOOLS.length}`)
expect('the agent rows use the real tool names', (() => {
  const names = byClass('nwt-about-code').map((node) => textOf(node).trim())
  return names.length === AGENT_TOOLS.length && names.every((name) => name.startsWith('nwtool_'))
})(), byClass('nwt-about-code').map((node) => textOf(node).trim()).join(','))
expect('the agent section says what those tools are for', textOf(currentTree).includes('注册给模型'), '')

/* A row is a shortcut into the tool it documents. */
{
  const pingRow = toolRows.find((row) => textOf(byClass('nwt-about-name').find((node) => row.children?.includes(node)) ?? {}).trim() === 'Ping')
  expect('the ping row exists', Boolean(pingRow), '')
  pingRow?.props.onClick()
  await settle(2)
  expect('clicking a row opens that tool', titleText() === 'Ping', titleText())
  expect('and closes the sheet', sheet() === null, String(sheet()))
}

/* Every way out works. */
aboutButton().props.onClick()
await settle(2)
labelsOf('×')[0]?.props.onClick()
await settle(1)
expect('the close button closes it', sheet() === null, String(sheet()))

aboutButton().props.onClick()
await settle(2)
pressEscape()
await settle(1)
expect('Escape closes it', sheet() === null, String(sheet()))
expect('the keyboard listener is released', bubbleKeydownCount() === 0, String(bubbleKeydownCount()))

aboutButton().props.onClick()
await settle(2)
let stopped = false
sheet()?.props.onClick({ stopPropagation: () => { stopped = true } })
await settle(1)
expect('a click inside the sheet does not dismiss it', stopped === true && Boolean(sheet()),
  `${stopped}/${Boolean(sheet())}`)
byClass('nwt-about')[0]?.props.onClick()
await settle(1)
expect('a click on the backdrop dismisses it', sheet() === null, String(sheet()))

/* The guide is localized like the rest of the panel. */
dom.lang = 'en'
mountFresh()
await settle(3)
byClass('nwt-nav-about')[0]?.props.onClick()
await settle(2)
const english = textOf(sheet() ?? {})
expect('the guide opens in English too', Boolean(sheet()), String(Boolean(sheet())))
expect('no Chinese is left in the sheet', !cjkOnly(english), english.slice(0, 60))
expect('the English guide keeps every tool', byClass('nwt-about-row--tool').length === TOOL_COUNT,
  String(byClass('nwt-about-row--tool').length))
expect('the English guide keeps every agent tool', byClass('nwt-about-row--agent').length === AGENT_TOOLS.length,
  String(byClass('nwt-about-row--agent').length))
dom.lang = 'zh-CN'

console.log(failures === 0 ? '\nusage guide behaves' : `\n${failures} about check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
