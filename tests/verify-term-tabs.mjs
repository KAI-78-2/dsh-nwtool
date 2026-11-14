// Multi-session terminal: tabs, status dots, device grouping.
//
// The render check only proves the first render is well formed. This one drives
// the pane through a tiny hooks runtime (state actually commits, effects run)
// and a fake transport, so opening two sessions, switching, closing and
// regrouping are exercised the way a click would.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(marker, "    return {\n      _panes: { TermPane },\n      _float: { floatStore },\n      inject: ['slots'],")

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

/* The fake createElement leaves function components in place; inline them so the
   tree the helpers walk is made of real elements only. */
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

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'MutationObserver', instrumented)(
  { __ModuleLoader__: loader },
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

/* ------------------------------------------------------------------ */
/* Fake transport                                                      */
/* ------------------------------------------------------------------ */

let book = [
  { id: 'dev-1', name: 'SW-Core', host: '192.0.2.10', port: 22, protocol: 'ssh', username: 'admin', authMode: 'prompt', group: '' },
  { id: 'dev-2', name: 'CORE-1', host: '192.0.2.11', port: 22, protocol: 'ssh', username: 'ops', authMode: 'prompt', group: '核心机房' },
  { id: 'dev-3', name: 'CORE-2', host: '192.0.2.12', port: 22, protocol: 'ssh', username: 'ops', authMode: 'prompt', group: '核心机房' },
]

const calls = []
const sessions = new Map()
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
  if (body.op === 'term.diag') return jsonResponse({ verdict: 'ok', origin: 'test', host: 'test' })
  if (body.op === 'term.open') {
    const id = `sess-${(openCount += 1)}`
    sessions.set(id, { id, closed: false, input: '', request: body })
    return streamResponse([
      { t: 'ready', d: { sessionId: id } },
      { t: 'data', d: btoa(`banner-${id}\r\n`) },
    ], options.signal)
  }
  if (body.op === 'term.close') {
    const session = sessions.get(body.id)
    if (session) session.closed = true
    return jsonResponse({ ok: true })
  }
  if (body.op === 'term.input') {
    const session = sessions.get(body.id)
    if (session) session.input += atob(body.data)
    return jsonResponse({ ok: true })
  }
  if (body.op === 'term.resize') return jsonResponse({ ok: true })
  if (body.op === 'term.monitor.open') {
    return jsonResponse({ id: 'mon-1', vendor: 'linux', vendorLabel: 'Linux', host: '192.0.2.10', name: 'SW-Core' })
  }
  if (body.op === 'term.monitor.sample') {
    return jsonResponse({
      sample: {
        vendor: 'linux',
        vendorLabel: 'Linux',
        at: '2026-11-12T03:00:00.000Z',
        cpu: { percent: 12.5 },
        memory: { percent: 20.2, total: 4096, used: 800, free: 3296 },
        load: { one: 0.2, five: 0.1, fifteen: 0.1 },
        disk: [{ mount: '/', percent: 63, total: 4096, used: 2580, free: 1516 }],
        nic: [{ name: 'eth0', rxBps: 12000, txBps: 3400, inUti: null, outUti: null }],
        firstSample: false,
      },
    })
  }
  if (body.op === 'term.files.list') {
    return jsonResponse({
      listing: {
        vendor: 'linux',
        path: '/',
        parent: '',
        entries: [
          { name: 'etc', type: 'dir', size: 0, mtime: 'Nov 12 03:00' },
          { name: 'hostname', type: 'file', size: 8, mtime: 'Nov 12 03:00', mode: '-rw-r--r--' },
        ],
      },
    })
  }
  if (body.op === 'term.files.info') {
    return jsonResponse({ info: { name: '/hostname', size: 8, kind: 'regular file', permission: '644', owner: 'root', group: 'root', mtime: '' } })
  }
  if (body.op === 'term.monitor.close') return jsonResponse({ ok: true })
  if (body.op === 'devices.save') {
    const device = { ...body.device, id: body.device.id || `dev-${book.length + 10}` }
    const index = book.findIndex((item) => item.id === device.id)
    if (index >= 0) book[index] = device
    else book.push(device)
    return jsonResponse({ device })
  }
  if (body.op === 'devices.delete') {
    book = book.filter((item) => item.id !== body.id)
    return jsonResponse({ ok: true })
  }
  return jsonResponse({})
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
const inputs = () => collect(currentTree, (node) => node.type === 'input')

function labelsOf(node) {
  return buttons().filter((button) => textOf(button).trim() === node)
}

function click(label, index = 0) {
  const found = labelsOf(label)
  if (!found[index]) {
    const available = [...new Set(buttons().map((button) => textOf(button).trim()))].join(' | ')
    throw new Error(`no button "${label}" (available: ${available})`)
  }
  found[index].props.onClick()
}

function selectDevice(name) {
  const item = buttons().find((button) => hasClass(button, 'nwt-term-item') && textOf(button).trim().startsWith(name))
  if (!item) throw new Error(`no device item "${name}"`)
  item.props.onClick()
}

function typeInto(predicate, value, label) {
  const field = inputs().find(predicate)
  if (!field) throw new Error(`no input for ${label}`)
  field.props.onChange({ target: { value } })
}

const tabNames = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-name')).map((node) => textOf(node).trim())
const tabDots = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-dot')).map((node) => {
  if (hasClass(node, 'nwt-term-dot--on')) return 'on'
  if (hasClass(node, 'nwt-term-dot--wait')) return 'wait'
  if (hasClass(node, 'nwt-term-dot--off')) return 'off'
  return '?'
})
const groupHeads = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-group-head'))
const groupNames = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-group-name')).map((node) => textOf(node).trim())
const groupCounts = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-group-count')).map((node) => textOf(node).trim())
const screenText = () => collect(currentTree, (node) => hasClass(node, 'nwt-term-grid')).map(textOf).join('|')

async function settle(turns = 3) {
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
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

renderOnce()
await settle()

expect('device book loads', groupNames().length === 2, groupNames().join(' / '))
expect('default group comes first', groupNames()[0] === '默认分组', groupNames()[0])
expect('named groups are listed', groupNames()[1] === '核心机房', groupNames()[1])
expect('group counts are shown', groupCounts().join(',') === '1,2', groupCounts().join(','))
expect('collapsing a group hides its devices', (() => {
  const before = buttons().filter((node) => hasClass(node, 'nwt-term-item')).length
  groupHeads()[1].props.onClick()
  const after = buttons().filter((node) => hasClass(node, 'nwt-term-item')).length
  groupHeads()[1].props.onClick()
  return before === 3 && after === 1
})())

expect('connect needs a selection', labelsOf('连接').length === 0)

/* A device that asks for a password each time cannot be dialled without one:
   the toolbar box is where it goes, and an empty box is refused up front. */
function typePassword(value) {
  const field = collect(currentTree, (node) => node.type === 'input' && node.props?.type === 'password')[0]
  if (!field) throw new Error('no password field in the toolbar')
  field.props.onChange({ target: { value } })
  return settle(1)
}

selectDevice('SW-Core')
labelsOf('连接')[0].props.onClick()
await settle(1)
expect('an empty password is refused before dialling', tabNames().length === 0 && !sessions.size,
  `${tabNames().length} tabs`)
expect('the refusal says where the password goes', textOf(currentTree).includes('请先在工具栏填入密码'), '')
await typePassword('secret')
expect('with a password the dialog is armed', Boolean(labelsOf('连接')[0]), '')

const firstConnect = labelsOf('连接')[0]
firstConnect.props.onClick()
expect('connecting opens a tab', tabNames().length === 1, tabNames().join(','))
expect('the connect button waits while dialling', (() => {
  const button = labelsOf('连接中…')[0]
  return Boolean(button) && button.props.disabled === true
})())
/* Enter on the focused button fires a second click before the first handshake
   completes; that must not open a second tab. */
firstConnect.props.onClick()
expect('a second Enter does not dial again', tabNames().length === 1, tabNames().join(','))
expect('the toolbar no longer repeats the connection state',
  collect(currentTree, (node) => hasClass(node, 'nwt-chip')).length === 0)
await settle()
expect('the connect button comes back once connected', labelsOf('连接').length === 1 && !labelsOf('连接中…').length)
expect('first session is connected', tabDots()[0] === 'on', tabDots().join(','))
expect('the tab carries the device name', tabNames()[0] === 'SW-Core', tabNames()[0])
expect('the terminal shows the device output', screenText().includes('banner-sess-1'), screenText().slice(0, 40))

selectDevice('CORE-1')
click('连接')
await settle()
expect('a second session opens a second tab', tabNames().length === 2, tabNames().join(','))
expect('both sessions stay connected', tabDots().join(',') === 'on,on', tabDots().join(','))
expect('the new tab becomes active', (() => {
  const active = collect(currentTree, (node) => hasClass(node, 'nwt-term-tab--active'))
  return active.length === 1 && textOf(active[0]).includes('CORE-1')
})())
expect('the first session was not closed', sessions.get('sess-1')?.closed === false)
expect('the view follows the active tab', screenText().includes('banner-sess-2'), screenText().slice(0, 40))

/* Switch back: the first session must still be there, output intact. */
buttons().find((node) => hasClass(node, 'nwt-term-tab-btn') && textOf(node).includes('SW-Core'))?.props.onClick()
await settle()
expect('switching tabs keeps both sessions', tabDots().join(',') === 'on,on', tabDots().join(','))
expect('switching does not close anything', sessions.get('sess-1')?.closed === false && sessions.get('sess-2')?.closed === false)
expect('the old screen is restored', screenText().includes('banner-sess-1'), screenText().slice(0, 40))

/* Input must reach the active session, not the other one. */
const textarea = collect(currentTree, (node) => node.type === 'textarea')[0]
textarea.props.onInput({ target: { value: 'show version\r' } })
await settle(1)
expect('typing goes to the active session', sessions.get('sess-1')?.input === 'show version\r', JSON.stringify(sessions.get('sess-1')?.input))
expect('the background session stays quiet', sessions.get('sess-2')?.input === '', JSON.stringify(sessions.get('sess-2')?.input))

/* Clipboard: paste belongs to the browser (a ^V here would eat it), and Ctrl+C
   keeps meaning interrupt while nothing is selected. */
{
  const key = (props) => {
    const prevented = []
    textarea.props.onKeyDown({
      key: props.key,
      ctrlKey: Boolean(props.ctrlKey),
      metaKey: Boolean(props.metaKey),
      shiftKey: Boolean(props.shiftKey),
      altKey: false,
      preventDefault: () => prevented.push('keydown'),
    })
    return prevented
  }
  expect('Ctrl+V is left to the browser', key({ key: 'v', ctrlKey: true }).length === 0)
  expect('Ctrl+V sends no control code', !String(sessions.get('sess-1')?.input).includes('\x16'),
    JSON.stringify(sessions.get('sess-1')?.input))
  expect('Cmd+V is left to the browser too', key({ key: 'v', metaKey: true }).length === 0)

  let pastePrevented = false
  textarea.props.onPaste({
    clipboardData: { getData: () => 'show clock\r\nshow users\n' },
    preventDefault: () => { pastePrevented = true },
  })
  await settle(1)
  expect('pasted text reaches the session with CR line ends',
    String(sessions.get('sess-1')?.input).endsWith('show clock\rshow users\r'),
    JSON.stringify(sessions.get('sess-1')?.input))
  expect('the paste is not also typed into the field', pastePrevented === true)

  expect('Ctrl+C still interrupts when nothing is selected', key({ key: 'c', ctrlKey: true }).length === 1
    && String(sessions.get('sess-1')?.input).endsWith('\x03'), JSON.stringify(String(sessions.get('sess-1')?.input).slice(-6)))
}

/* Floating window: the tab in front can be pinned to the overlay, and the pin
   is what the float restores when the panel is not on screen. */
{
  const float = pluginModule._float.floatStore
  expect('a connected tab offers a floating window', labelsOf('浮窗').length === 1,
    [...new Set(buttons().map((node) => textOf(node).trim()))].join('|'))
  click('浮窗')
  await settle(1)
  expect('floating pins the active session', float.enabled === true && float.target?.id === 'sess-1',
    JSON.stringify(float.target))
  expect('the button now offers to stop floating', labelsOf('取消浮窗').length === 1)
  expect('the user is told the pin survives the switch', textOf(currentTree).includes('留在右上角'), '')
  click('取消浮窗')
  await settle(1)
  expect('stopping the float unpins the session', float.enabled === false && float.target === null,
    JSON.stringify(float.target))
}

/* Closing one tab leaves the other running. */
collect(currentTree, (node) => hasClass(node, 'nwt-term-tab-x'))[1].props.onClick()
await settle(1)
expect('closing a tab removes only that tab', tabNames().join(',') === 'SW-Core', tabNames().join(','))
expect('the closed session is torn down', sessions.get('sess-2')?.closed === true)
expect('the other session survives the close', sessions.get('sess-1')?.closed === false)
expect('the surviving tab is still connected', tabDots()[0] === 'on', tabDots().join(','))

/* A disconnect keeps the tab and its scrollback, and can be reconnected. */
click('断开')
await settle(1)
expect('disconnecting keeps the tab', tabNames().join(',') === 'SW-Core', tabNames().join(','))
expect('a disconnected tab shows the red dot', tabDots()[0] === 'off', tabDots().join(','))
expect('scrollback survives the disconnect', screenText().includes('banner-sess-1'), screenText().slice(0, 30))
expect('a disconnected tab offers a reconnect', labelsOf('重新连接').length === 1)

click('重新连接')
await settle()
expect('reconnecting reuses the same tab', tabNames().join(',') === 'SW-Core', tabNames().join(','))
expect('reconnecting turns the dot green', tabDots()[0] === 'on', tabDots().join(','))
expect('reconnecting opens a fresh session', sessions.get('sess-3') && sessions.get('sess-3').closed === false)

/* ------------------------------------------------------------------ */
/* Inspector: system monitor and file browser                          */
/* ------------------------------------------------------------------ */

const monitorLabels = () => collect(currentTree, (node) => hasClass(node, 'nwt-mon-label'))
  .map((node) => textOf(node).trim())

click('监控')
await settle(4)
expect('the monitor opens over its own session', calls.some((call) => call.op === 'term.monitor.open'))
const labels = monitorLabels()
expect('the monitor shows cpu', labels.some((line) => line.startsWith('CPU')), labels.join(' | ').slice(0, 80))
expect('the monitor shows the sampled value', labels.some((line) => line.includes('12.5%')), labels.join(' | ').slice(0, 80))
expect('the monitor shows the disk', labels.includes('磁盘'), labels.join(' | ').slice(0, 80))
expect('the monitor button now reads stop', labelsOf('关闭监控').length === 1)

click('关闭监控')
await settle(2)
expect('closing the inspector tears the side channel down', calls.some((call) => call.op === 'term.monitor.close'))

click('文件')
await settle(4)
const fileNames = collect(currentTree, (node) => hasClass(node, 'nwt-file-name')).map((node) => textOf(node).trim())
expect('the file browser lists the directory', fileNames.join(',') === 'etc,hostname', fileNames.join(','))
expect('the file browser marks directories', collect(currentTree, (node) => hasClass(node, 'nwt-file-row--dir')).length === 1)

const hostnameRow = buttons().find((button) => hasClass(button, 'nwt-file-row') && textOf(button).includes('hostname'))
hostnameRow?.props.onClick()
await settle(2)
expect('picking a file loads its stat details', textOf(currentTree).includes('regular file'))
click('关闭文件')
await settle(2)

/* ------------------------------------------------------------------ */
/* Device groups in the form                                           */
/* ------------------------------------------------------------------ */

click('新建')
const newName = (value) => typeInto((node) => node.props.placeholder === '例如：核心交换机', value, 'name')
newName('EDGE-1')
typeInto((node) => node.props.placeholder === '192.168.1.1', '192.0.2.50', 'host')
typeInto((node) => node.props.list === 'nwtool-group-options', '机房 B', 'group')
click('保存设备')
await settle()
const created = calls.filter((call) => call.op === 'devices.save').at(-1)
expect('a new group name is stored as typed', created?.device?.group === '机房 B', JSON.stringify(created?.device?.group))
expect('the new group appears in the book', groupNames().includes('机房 B'), groupNames().join(' / '))
expect('the editor closes after saving', inputs().every((node) => node.props.list !== 'nwtool-group-options'))

/* The localized default name means "no group", never a real bucket. */
click('新建')
newName('EDGE-2')
typeInto((node) => node.props.placeholder === '192.168.1.1', '192.0.2.51', 'host')
typeInto((node) => node.props.list === 'nwtool-group-options', '默认分组', 'group')
click('保存设备')
await settle()
const defaulted = calls.filter((call) => call.op === 'devices.save').at(-1)
expect('typing the default group means the default bucket', defaulted?.device?.group === '', JSON.stringify(defaulted?.device?.group))

/* Editing an existing device can move it to another group. */
selectDevice('EDGE-2')
click('编辑')
expect('editing opens the form for that device', inputs().some((node) => node.props.list === 'nwtool-group-options'))
typeInto((node) => node.props.list === 'nwtool-group-options', '机房 B', 'group')
click('更新设备')
await settle()
const updated = calls.filter((call) => call.op === 'devices.save').at(-1)
expect('editing keeps the device id', Boolean(updated?.device?.id), String(updated?.device?.id))
expect('editing updates in place instead of duplicating', book.length === 5, String(book.length))
expect('editing moves the device to the new group', updated?.device?.group === '机房 B', JSON.stringify(updated?.device?.group))
expect('the vacated bucket count drops', groupCounts().join(',') === '1,2,2', groupCounts().join(','))

/* ------------------------------------------------------------------ */
/* English pass                                                        */
/* ------------------------------------------------------------------ */

dom.lang = 'en'
renderOnce()
expect('the book switches to English', labelsOf('New').length === 1 && labelsOf('新建').length === 0,
  [...new Set(buttons().map((button) => textOf(button).trim()))].join(' | '))
expect('the default group name is translated', groupNames().every((name) => !/[\u4e00-\u9fff]/.test(name))
  || groupNames().includes('机房 B'), groupNames().join(' / '))
dom.lang = 'zh-CN'
renderOnce()
expect('switching back restores Chinese', labelsOf('新建').length === 1)

console.log(failures === 0 ? '\nterminal tabs behave' : `\n${failures} tab check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
