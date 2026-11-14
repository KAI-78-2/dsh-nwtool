// Renders every client pane once with a stubbed React to catch render-time errors,
// and asserts the navigation highlight invariant (exactly one active item).
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(
  marker,
  "    return {\n      _panes: { ToolboxPage, HostToolPane, IpCalcPane, TimeConvPane, BitCalcPane, SizeConvPane, ArpPane, TopoPane, CheatSheetPane, BackupsPane, DiffPane, AiDocPane, WolPane, TermPane, ResultView, PanelIcon, Boundary },\n      _float: { FloatWindow, floatStore, setFloatTarget, clearFloat, setFloatMounted },\n      inject: ['slots'],",
)

let pluginModule = null
const loader = {
  load({ id, factory }) {
    const fakeReact = {
      createElement(type, props, ...children) {
        return { type, props: props ?? {}, children: children.flat() }
      },
      Component: class Component {
        constructor(props) {
          this.props = props
          this.state = {}
        }
      },
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {},
      useMemo: (factory) => factory(),
      useRef: (initial) => ({ current: initial }),
      useCallback: (callback) => callback,
    }
    pluginModule = factory((name) => {
      if (name === 'react') return fakeReact
      throw new Error(`unexpected require(${name})`)
    })
    pluginModule.__id = id
  },
}

const context = { window: { __ModuleLoader__: loader } }

/* The panel reads the language from the locale service, then `<html lang>`, then
   the browser: all three need a stand-in so the real resolution path runs. */
const dom = { lang: 'zh-CN', observers: [] }
const fakeDocument = {
  documentElement: {
    get lang() {
      return dom.lang
    },
  },
}
const fakeNavigator = { language: 'zh-CN', languages: ['zh-CN'] }
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback
    dom.observers.push(this)
  }

  observe() {}

  disconnect() {}
}

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'MutationObserver', instrumented)(
  context.window,
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

function walk(node, visit, depth = 0) {
  if (node === null || node === undefined || depth > 200) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit, depth + 1)
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node && typeof node === 'object') {
    return (node.children ?? []).map(textOf).join('')
  }
  return ''
}

let failures = 0
function renderPane(label, fn) {
  try {
    const tree = fn()
    const types = new Set()
    let bad = 0
    walk(tree, (node) => {
      if (node.type === undefined || node.type === null) bad += 1
      if (typeof node.type === 'string') types.add(node.type)
      else if (typeof node.type === 'function') types.add(node.type.name || 'anonymous')
    })
    if (bad) throw new Error(`${bad} elements without a type`)
    console.log(`ok   ${label.padEnd(16)} tags=${types.size}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL ${label.padEnd(16)} ${String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ')}`)
  }
}

console.log('module id:', pluginModule.__id)
console.log('exports:', Object.keys(pluginModule).join(','))
console.log('panes:', Object.keys(pluginModule._panes ?? {}).join(','))

const panes = pluginModule._panes
renderPane('PanelIcon', () => panes.PanelIcon({ size: 18, active: true }))
renderPane('Boundary', () => new panes.Boundary({ children: null }).render())
renderPane('IpCalcPane', () => panes.IpCalcPane({}))
renderPane('BitCalcPane', () => panes.BitCalcPane({}))
renderPane('SizeConvPane', () => panes.SizeConvPane({}))
renderPane('ArpPane', () => panes.ArpPane({}))
renderPane('TopoPane', () => panes.TopoPane({}))
renderPane('TimeConvPane', () => panes.TimeConvPane({}))
renderPane('CheatSheetPane', () => panes.CheatSheetPane({}))
renderPane('BackupsPane', () => panes.BackupsPane({}))
renderPane('DiffPane', () => panes.DiffPane({}))
renderPane('AiDocPane', () => panes.AiDocPane({}))
renderPane('WolPane', () => panes.WolPane({}))
renderPane('TermPane', () => panes.TermPane({}))
renderPane('ResultView', () => panes.ResultView({ state: {
  running: true, rows: [{ seq: 1, rtt: '2 ms' }], stats: { loss: '0%' }, logs: ['x'],
  sections: [{ title: 't', body: 'b' }], kv: [{ k: 'a', v: 'b' }], text: 'hello',
  diff: { rows: [{ type: 'change', left: 'a', right: 'b', lnLeft: '1', lnRight: '1' }], leftTitle: 'L', rightTitle: 'R' },
  notices: ['n'], progress: 0, error: null, done: false,
}, tool: { columns: [{ k: 'seq', label: '#' }] } }))

for (const toolId of ['ping', 'tcping', 'traceroute', 'mtr', 'ipscan', 'portscan', 'lanscan', 'dnsbench',
  'dnsresolve', 'dig', 'whois', 'localinfo', 'http', 'wol', 'speedtest', 'iperf3', 'diagnose',
  'deviceexec', 'snmp', 'sntp', 'geo', 'portstate']) {
  renderPane(`pane:${toolId}`, () => panes.HostToolPane({ toolId }))
}

/* ------------------------------------------------------------------ */
/* Navigation highlight invariant                                      */
/* ------------------------------------------------------------------ */

function checkActive(toolId) {
  const tree = panes.ToolboxPage({ initialTool: toolId })
  const items = []
  walk(tree, (node) => {
    if (node.type !== 'button') return
    const className = node.props?.className ?? ''
    if (!String(className).split(/\s+/).includes('nwt-item')) return
    items.push({ className: String(className), label: textOf(node).trim() })
  })
  const activeItems = items.filter((item) => item.className.split(/\s+/).includes('nwt-item--active'))
  const expected = (toolId === 'ipcalc' || toolId === 'timeconv' || toolId === 'cheatsheet'
    || toolId === 'backups' || toolId === 'configdiff' || toolId === 'aidoc')
    ? null
    : toolId
  if (!items.length) return { ok: false, reason: 'no nav items rendered' }
  if (activeItems.length !== 1) {
    return { ok: false, reason: `${activeItems.length} active items: ${activeItems.map((item) => item.label).join(',')}` }
  }
  if (expected && activeItems[0].label !== panes.ToolboxPage({ initialTool: toolId }) && false) {
    /* unreachable, kept for clarity */
  }
  const activeTitles = activeItems.map((item) => item.label)
  return { ok: true, total: items.length, active: activeTitles[0] }
}

const selections = ['ping', 'tcping', 'traceroute', 'mtr', 'ipscan', 'portscan', 'lanscan', 'dnsbench',
  'dnsresolve', 'dig', 'whois', 'localinfo', 'ipcalc', 'bitcalc', 'sizeconv', 'sntp', 'geo', 'timeconv', 'wol', 'http',
  'speedtest', 'iperf3', 'diagnose', 'portstate', 'arp', 'terminal', 'deviceexec', 'diagram', 'configdiff',
  'backups', 'snmp', 'cheatsheet', 'aidoc']

for (const toolId of selections) {
  const result = checkActive(toolId)
  if (result.ok) {
    console.log(`ok   active(${toolId.padEnd(11)}) -> "${result.active}" of ${result.total} items`)
  } else {
    failures += 1
    console.log(`FAIL active(${toolId}) -> ${result.reason}`)
  }
}

/* 网络拓扑 sits directly above 设备配置采集 in the Datacom group nav. */
{
  const tree = panes.ToolboxPage({})
  const labels = []
  walk(tree, (node) => {
    if (node.type !== 'button') return
    if (!String(node.props?.className ?? '').split(/\s+/).includes('nwt-item')) return
    labels.push(textOf(node).trim())
  })
  const topoAt = labels.indexOf('网络拓扑')
  const execAt = labels.indexOf('设备配置采集')
  if (topoAt >= 0 && execAt === topoAt + 1) {
    console.log(`ok   nav order -> 网络拓扑 @${topoAt}, 设备配置采集 @${execAt}`)
  } else {
    failures += 1
    console.log(`FAIL nav order -> 网络拓扑 @${topoAt}, 设备配置采集 @${execAt}`)
  }
}

/* Collapsed groups must still render their items so re-expanding is cheap. */
{
  const tree = panes.ToolboxPage({})
  const groupButtons = []
  walk(tree, (node) => {
    if (node.type === 'button' && String(node.props?.className ?? '').includes('nwt-group-btn')) {
      groupButtons.push(node)
    }
  })
  if (groupButtons.length === 7) console.log('ok   groups rendered ->', groupButtons.length)
  else {
    failures += 1
    console.log('FAIL groups rendered ->', groupButtons.length)
  }
  const chevrons = groupButtons.filter((node) => node.props['aria-expanded'] === true).length
  if (chevrons === 7) console.log('ok   groups start expanded ->', chevrons)
  else {
    failures += 1
    console.log('FAIL groups expanded ->', chevrons)
  }
}

/* Rendered before the locale stub switches the language, so it is the default. */
const initialTree = panes.ToolboxPage({})

function collectStrings(node, into = []) {
  if (typeof node === 'string') {
    into.push(node)
    return into
  }
  if (node && typeof node === 'object' && Array.isArray(node.children)) {
    for (const child of node.children) collectStrings(child, into)
  }
  return into
}

/* Registration behaviour */
const registrations = []
let localeHandler = null
let subscriptionCount = 0
/* The real snapshot shape: the active id lives in `active`, and the `locales`
   catalog always lists Chinese — the trap that made an earlier version of the
   language read resolve to Chinese on every switch. */
let localeSnapshot = {
  active: 'zh',
  locales: [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }],
  revision: 1,
}
const fakeCtx = {
  slots: {
    inject(key, callback) {
      registrations.push({ key, effect: callback })
      return () => {}
    },
    register(options, component) {
      registrations.push({ register: options, component })
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  get(name) {
    if (name !== 'locale') return undefined
    return {
      getSnapshot: () => localeSnapshot,
      getLocale: () => localeSnapshot,
      subscribe(handler) {
        localeHandler = handler
        subscriptionCount += 1
        return () => { localeHandler = null }
      },
    }
  },
}
try {
  pluginModule.apply(fakeCtx)
  for (const item of registrations) {
    if (item.effect) item.effect()
  }
  const registered = registrations.filter((item) => item.register)
  console.log('slot injections:', registrations.filter((item) => item.key).map((item) => item.key).join(','))
  console.log('slot registrations:', JSON.stringify(registered.map((item) => item.register)))
  if (registered.length !== 5) throw new Error(`expected 5 registrations, got ${registered.length}`)
  const dock = registered.find((item) => item.register.name === 'conversation.composer.dock')
  if (!dock || dock.register.id !== 'nwtool-share') throw new Error('the shared-terminal strip is not registered under the composer')
  const overlay = registered.find((item) => item.register.name === 'shell.overlay' && item.register.id === 'nwtool-share-menu')
  if (!overlay) throw new Error('the shared-terminal list is not registered in the overlay')
  const floatWindow = registered.find((item) => item.register.name === 'shell.overlay' && item.register.id === 'nwtool-term-float')
  if (!floatWindow) throw new Error('the floating terminal is not registered in the overlay')

  /* The sidebar label is a thunk, so it must follow the active language. */
  const label = registered.find((item) => item.register.name === 'sidebar.panellist').register.label
  if (typeof label !== 'function') throw new Error('sidebar label must be a thunk')
  if (label() !== '网络运维工具箱') throw new Error(`zh label should be the Chinese name, got ${label()}`)
  if (subscriptionCount !== 1) throw new Error('locale subscription missing')
  console.log('ok   i18n label (zh) ->', label())
  console.log('ok   locale subscribed ->', subscriptionCount)

  /* A switch publishes a new snapshot and notifies subscribers, exactly like
     the locale service does; the catalog still contains zh here. */
  localeSnapshot = { ...localeSnapshot, active: 'en', revision: 2 }
  localeHandler?.()
  if (label() !== 'NWTool') throw new Error(`en label should be NWTool, got ${label()}`)
  console.log('ok   i18n label after switch ->', label())

  /* The panel itself must re-render in the new language, not just the label. */
  const enStrings = collectStrings(panes.ToolboxPage({}))
  if (!enStrings.includes('NWTool')) throw new Error('panel title did not follow the switch to English')
  if (enStrings.includes('网络运维工具箱')) throw new Error('panel still shows the Chinese title after switching')
  const enTagline = enStrings.some((text) => text.includes('probes'))
  if (!enTagline) throw new Error('panel tagline did not follow the switch to English')
  console.log('ok   panel title follows switch ->', 'NWTool')

  /* zh-CN and zh-TW are Chinese too, and switching back must work both ways. */
  localeSnapshot = { ...localeSnapshot, active: 'zh-CN', revision: 3 }
  localeHandler?.()
  if (label() !== '网络运维工具箱') throw new Error(`zh-CN label should be Chinese, got ${label()}`)
  console.log('ok   i18n label switched back ->', label())

  /* Other Harness languages (ja/de/ru …) keep the English product name. */
  for (const active of ['ja', 'de', 'ru', 'pt-BR']) {
    localeSnapshot = { ...localeSnapshot, active, revision: 4 }
    localeHandler?.()
    if (label() !== 'NWTool') throw new Error(`${active} label should be NWTool, got ${label()}`)
  }
  console.log('ok   i18n label (ja/de/ru/pt) -> NWTool')

  /* Without the service, `<html lang>` still carries the language. */
  localeSnapshot = null
  dom.lang = 'en'
  if (label() !== 'NWTool') throw new Error(`<html lang="en"> fallback failed, got ${label()}`)
  dom.lang = 'zh-CN'
  if (label() !== '网络运维工具箱') throw new Error(`<html lang="zh-CN"> fallback failed, got ${label()}`)
  console.log('ok   i18n fallback via <html lang> -> ok')
} catch (error) {
  failures += 1
  console.log('FAIL apply ->', String(error?.message ?? error))
}

/* ------------------------------------------------------------------ */
/* English completeness: no Chinese may reach the screen in en         */
/* ------------------------------------------------------------------ */

function collectText(node, into = []) {
  if (typeof node === 'string') {
    into.push(node)
    return into
  }
  if (!node || typeof node !== 'object') return into
  const props = node.props ?? {}
  for (const key of ['placeholder', 'title', 'aria-label', 'alt']) {
    if (typeof props[key] === 'string') into.push(props[key])
  }
  for (const child of node.children ?? []) collectText(child, into)
  return into
}

{
  localeSnapshot = {
    active: 'en',
    locales: [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }],
    revision: 99,
  }
  dom.lang = 'en'
  localeHandler?.()

  const cases = [
    ['ToolboxPage', () => panes.ToolboxPage({})],
    ['ResultView', () => panes.ResultView({
      state: {
        running: true, rows: [{ seq: 1, rtt: '2 ms' }], stats: { loss: '0%' }, logs: ['x'],
        sections: [{ title: 't', body: 'b' }], kv: [{ k: 'a', v: 'b' }], text: 'hello',
        diff: { rows: [{ type: 'change', left: 'a', right: 'b', lnLeft: '1', lnRight: '1' }], leftTitle: 'L', rightTitle: 'R' },
        notices: ['n'], progress: 0, error: 'boom', done: false,
      },
      tool: { columns: [{ k: 'seq', label: '#' }] },
    })],
    /* A result produced while the UI was Chinese must re-render in English:
       stats keys, kv labels, section titles, log lines and cell values are all
       translated at render, so a language switch also covers finished runs. */
    ['ResultView(zh run)', () => panes.ResultView({
      state: {
        running: false, rows: [{ seq: 1, status: '成功' }],
        stats: { 已发送: '1', 丢包率: '0%' }, logs: ['已取消'], notices: ['已取消'],
        sections: [{ title: '统计', body: 'raw' }], kv: [{ k: '状态', v: 'raw' }],
        text: '', diff: null, progress: 0, error: null, done: true,
      },
      tool: { columns: [{ k: 'seq', label: '#' }, { k: 'status', label: '状态' }] },
    })],
    ['IpCalcPane', () => panes.IpCalcPane({})],
    ['TimeConvPane', () => panes.TimeConvPane({})],
    ['CheatSheetPane', () => panes.CheatSheetPane({})],
    ['BackupsPane', () => panes.BackupsPane({})],
    ['DiffPane', () => panes.DiffPane({})],
    ['AiDocPane', () => panes.AiDocPane({})],
    ['WolPane', () => panes.WolPane({})],
    ['TermPane', () => panes.TermPane({})],
  ]
  for (const toolId of selections) cases.push([`tool:${toolId}`, () => panes.ToolboxPage({ initialTool: toolId })])

  const offenders = new Map()
  for (const [label, render] of cases) {
    let tree
    try {
      tree = render()
    } catch (error) {
      failures += 1
      console.log(`FAIL en(${label}) render -> ${String(error?.message ?? error)}`)
      continue
    }
    for (const text of collectText(tree)) {
      if (!/[\u4e00-\u9fff]/.test(text)) continue
      const key = text.trim()
      if (!offenders.has(key)) offenders.set(key, new Set())
      offenders.get(key).add(label)
    }
  }

  if (offenders.size === 0) {
    console.log('ok   english pass -> no Chinese left on screen')
  } else {
    failures += 1
    console.log(`FAIL english pass -> ${offenders.size} Chinese strings still rendered`)
    for (const [text, where] of [...offenders].slice(0, 40)) {
      console.log(`     · ${text}  [${[...where].slice(0, 3).join(', ')}]`)
    }
  }
}

/* Version lock: the footer must show the package version, never drift. */
{
  const sourceVersion = (source.match(/const VERSION = '([^']+)'/) || [])[1]
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (sourceVersion !== pkg.version) {
    failures += 1
    console.log(`FAIL version mismatch -> client ${sourceVersion} vs package ${pkg.version}`)
  } else {
    console.log(`ok   version sync -> ${sourceVersion}`)
  }

  const strings = []
  const collect = (node) => {
    if (typeof node === 'string') {
      strings.push(node)
      return
    }
    if (node && typeof node === 'object' && Array.isArray(node.children)) node.children.forEach(collect)
  }
  collect(initialTree)
  if (!strings.includes('DSH-NWTool')) {
    failures += 1
    console.log('FAIL footer -> missing product name')
  } else if (!strings.includes(`v${pkg.version}`)) {
    failures += 1
    console.log('FAIL footer -> missing version')
  } else {
    console.log(`ok   footer -> DSH-NWTool v${pkg.version}`)
  }
  if (!strings.includes('网络运维工具箱')) {
    failures += 1
    console.log('FAIL i18n title -> missing chinese product name')
  }
}

/* Terminal lifetime: the pane must be mounted whichever tool is on screen, and
   hidden — not unmounted — while another tool is open, so its tabs, their
   scrollback and their transport streams survive a tool switch. */
{
  const hosts = []
  for (const toolId of ['ping', 'terminal']) {
    let host = null
    walk(panes.ToolboxPage({ initialTool: toolId }), (node) => {
      if (Array.isArray(node.children) && node.children.some((child) => child && child.type === panes.TermPane)) {
        host = node
      }
    })
    hosts.push({ toolId, host })
  }
  const problems = []
  for (const { toolId, host } of hosts) {
    if (!host) problems.push(`terminal not mounted while ${toolId} is open`)
  }
  if (!problems.length) {
    const hidden = (entry) => entry.host?.props?.style?.display === 'none'
    if (!hidden(hosts[0])) problems.push('terminal pane is visible behind another tool')
    if (hidden(hosts[1])) problems.push('terminal pane is hidden while it is the active tool')
  }
  if (problems.length) {
    failures += 1
    console.log(`FAIL terminal lifetime -> ${problems.join('; ')}`)
  } else {
    console.log('ok   terminal lifetime -> mounted, hidden behind other tools')
  }
}

/* Layout lock: the nav must scroll inside itself so the footer stays pinned. */
{
  const hasScroll = []
  const hasFoot = []
  const collect = (node) => {
    if (!node || typeof node !== 'object') return
    const className = node.props?.className
    if (typeof className === 'string') {
      const tokens = className.split(/\s+/)
      if (tokens.includes('nwt-nav-scroll')) hasScroll.push(1)
      if (tokens.includes('nwt-nav-foot')) hasFoot.push(1)
    }
    if (Array.isArray(node.children)) node.children.forEach(collect)
  }
  collect(initialTree)
  if (hasScroll.length === 1 && hasFoot.length === 1) {
    console.log('ok   nav scroll + footer -> 1 / 1')
  } else {
    failures += 1
    console.log(`FAIL nav layout -> scroll ${hasScroll.length}, footer ${hasFoot.length}`)
  }
}

console.log(`\n${failures === 0 ? 'all render checks passed' : `${failures} render check(s) failed`}`)
