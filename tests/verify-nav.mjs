// The tool list can fold into a rail so the tool keeps the width. The state is
// remembered across panel mounts, like the collapsed groups already are.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(
  marker,
  "    return {\n      _panes: { ToolboxPage },\n      _meta: { GROUPS, toolMeta },\n      inject: ['slots'],",
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

/* The panes behind the navigation talk to the host on mount; nothing here needs
   a real reply, and the navigation is what this test is about. */
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
const nav = () => byClass('nwt-nav')[0] ?? null
const isRail = () => Boolean(nav() && hasClass(nav(), 'nwt-nav--rail'))
const buttons = () => collect(currentTree, (node) => node.type === 'button')
const byLabel = (label) => buttons().find((button) => button.props['aria-label'] === label) ?? null
const titleText = () => textOf(byClass('nwt-title')[0] ?? {}).trim()

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

const { GROUPS, toolMeta } = pluginModule._meta

mountFresh()
await settle(3)

expect('the list starts expanded', isRail() === false, String(isRail()))
expect('every group is on screen', byClass('nwt-group').length === GROUPS.length,
  `${byClass('nwt-group').length} vs ${GROUPS.length}`)
expect('the collapse button sits in the header', Boolean(byLabel('收起工具列表')), '')
expect('the collapse button offers no expand while expanded', byLabel('展开工具列表') === null, '')

byLabel('收起工具列表').props.onClick()
await settle(2)
expect('collapsing folds the list into a rail', isRail() === true, String(isRail()))
expect('the rail is remembered', store.get('nwtool.nav.collapsed') === '1', String(store.get('nwtool.nav.collapsed')))
expect('the rail offers a way back', Boolean(byLabel('展开工具列表')), '')
expect('the tool buttons stay mounted but hidden by the rail class', byClass('nwt-item').length > 0,
  String(byClass('nwt-item').length))
expect('the guide stays reachable in the rail', byClass('nwt-nav-about').length === 1,
  String(byClass('nwt-nav-about').length))

byLabel('展开工具列表').props.onClick()
await settle(2)
expect('expanding brings the list back', isRail() === false, String(isRail()))
expect('the expanded state is remembered', store.get('nwtool.nav.collapsed') === '0', String(store.get('nwtool.nav.collapsed')))

/* A fresh mount reads the remembered state, like collapsed groups do. */
byLabel('收起工具列表').props.onClick()
await settle(2)
mountFresh()
await settle(3)
expect('the panel reopens folded', isRail() === true, String(isRail()))
expect('a folded panel still shows every group in the tree', byClass('nwt-group').length === GROUPS.length,
  String(byClass('nwt-group').length))

/* A rail that remembers nothing must not trap the user: the way out is there. */
store.delete('nwtool.nav.collapsed')
mountFresh()
await settle(3)
expect('without storage the list starts expanded', isRail() === false, String(isRail()))

/* The two toggles are localized like the rest of the panel. */
dom.lang = 'en'
mountFresh()
await settle(3)
expect('the collapse button speaks English', Boolean(byLabel('Collapse the tool list')),
  buttons().map((button) => String(button.props['aria-label'] ?? '')).filter(Boolean).join('|').slice(0, 80))
byLabel('Collapse the tool list')?.props.onClick()
await settle(2)
expect('so does the expand button', Boolean(byLabel('Expand the tool list')), '')
dom.lang = 'zh-CN'
store.delete('nwtool.nav.collapsed')

/* ------------------------------------------------------------------ */
/* Group glyphs                                                        */
/* ------------------------------------------------------------------ */

/** Flatten an icon's shapes into a comparable string, ignoring its wrapper. */
function iconSignature(node) {
  const svg = collect(node, (child) => child.type === 'svg')[0]
  if (!svg) return ''
  const parts = []
  collect(svg, (child) => {
    parts.push([child.type, child.props?.d, child.props?.points, child.props?.cx, child.props?.cy, child.props?.r].join('~'))
    return false
  })
  return parts.join('|')
}

mountFresh()
await settle(3)
const headingIcons = byClass('nwt-group-icon')
expect('every group heading carries a glyph', headingIcons.length === GROUPS.length,
  `${headingIcons.length} vs ${GROUPS.length}`)
expect('each heading glyph is an svg', headingIcons.every((node) => collect(node, (child) => child.type === 'svg').length === 1), '')
expect('no two groups share a glyph', new Set(headingIcons.map((node) => iconSignature(node))).size === GROUPS.length,
  String(new Set(headingIcons.map((node) => iconSignature(node))).size))
expect('the glyphs are drawn, not empty', headingIcons.every((node) => iconSignature(node).length > 8), '')

byLabel('收起工具列表').props.onClick()
await settle(2)
const railIcons = byClass('nwt-nav-rail-icon')
expect('the folded rail shows one glyph per group', railIcons.length === GROUPS.length,
  `${railIcons.length} vs ${GROUPS.length}`)
expect('each rail glyph is labelled with its group', (() => {
  const labels = railIcons.map((node) => String(node.props['aria-label'] ?? ''))
  return GROUPS.every((group) => labels.includes(group.title))
})(), railIcons.map((node) => node.props['aria-label']).join('|'))
expect('the rail glyphs match the headings', (() => {
  const railSignatures = railIcons.map((node) => iconSignature(node))
  const headingSignatures = headingIcons.map((node) => iconSignature(node))
  return railSignatures.every((signature) => headingSignatures.includes(signature))
})(), '')
expect('the rail marks the group on screen', byClass('nwt-nav-rail-icon--active').length === 1,
  String(byClass('nwt-nav-rail-icon--active').length))

/* A glyph is a shortcut into its group, and it unfolds the list. */
{
  const domainGroup = GROUPS.find((group) => group.id === 'dns')
  const dnsTitle = toolMeta(domainGroup.tools[0]).title
  const target = railIcons[GROUPS.indexOf(domainGroup)]
  target?.props.onClick()
  await settle(2)
  expect('a rail glyph unfolds the list', isRail() === false, String(isRail()))
  expect('a rail glyph opens its group', titleText() === dnsTitle, `${titleText()} vs ${dnsTitle}`)
  expect('the unfolded state is what gets remembered', store.get('nwtool.nav.collapsed') === '0',
    String(store.get('nwtool.nav.collapsed')))
}

console.log(failures === 0 ? '\nnavigation folds away' : `\n${failures} nav check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
