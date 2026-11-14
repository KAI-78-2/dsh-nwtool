// The topology canvas: add, drag, link, bind and jump.
//
// The render check only proves the first paint. This drives the pane through a
// tiny hooks runtime and a fake transport, so an interaction bug (a click that
// selects nothing, a drag that cannot move, a double-click that jumps nowhere)
// fails here instead of in front of the user.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(marker, "    return {\n      _panes: { TopoPane },\n      inject: ['slots'],")

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
      currentTree = expand(pluginModule._panes.TopoPane(scene.props))
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
    if (!hookSlots[index]) hookSlots[index] = { value: typeof initial === 'function' ? initial() : initial }
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

/* The pane registers window listeners for dragging. */
const listeners = new Map()
const fakeWindow = {
  __ModuleLoader__: loader,
  addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  },
  removeEventListener(type, handler) {
    const list = listeners.get(type) ?? []
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  },
  innerWidth: 1400,
  innerHeight: 900,
  confirm: () => true,
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
  fakeWindow,
  fakeDocument,
  fakeNavigator,
  FakeMutationObserver,
)

function dispatch(type, event) {
  for (const handler of [...(listeners.get(type) ?? [])]) handler(event)
}

/* ------------------------------------------------------------------ */
/* Fake transport                                                      */
/* ------------------------------------------------------------------ */

let calls = []
let stored = { activeId: '', diagrams: [] }

globalThis.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body)
  calls.push(body)
  const reply = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) })
  if (body.op === 'diagram.load') return reply({ library: stored })
  if (body.op === 'devices.list') {
    return reply({
      devices: [
        { id: 'dev-1', name: 'CORE-1', host: '192.0.2.10', port: 22, protocol: 'ssh' },
        { id: 'dev-2', name: 'ACC-1', host: '192.0.2.11', port: 22, protocol: 'ssh' },
      ],
    })
  }
  if (body.op === 'diagram.save') {
    stored = body.library
    return reply({ library: body.library })
  }
  return reply({})
}

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
const nodes = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-node'))
const lines = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-link-line'))

function click(label, index = 0) {
  const found = buttons().filter((button) => textOf(button).trim() === label)
  if (!found[index]) {
    const available = [...new Set(buttons().map((button) => textOf(button).trim()))].join(' | ')
    throw new Error(`no button "${label}" (available: ${available})`)
  }
  found[index].props.onClick()
}

async function settle(turns = 3) {
  for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

const scene = { props: {}, focused: [] }
scene.props = { onFocusDevice: (id) => scene.focused.push(id) }

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

renderOnce()
await settle()
expect('an empty canvas renders', nodes().length === 0 && buttons().some((button) => textOf(button).includes('+ 路由器')))
expect('the palette offers the wireless types',
  buttons().some((button) => textOf(button).includes('+ 无线AC')) && buttons().some((button) => textOf(button).includes('+ 无线 AP')))

click('+ 无线 AP')
const apNode = nodes()[0]
expect('the AP node draws an icon', collect(apNode, (node) => node.type === 'svg').length === 1)
expect('the AP node names its class', textOf(apNode).includes('AP') && textOf(apNode).includes('无线 AP'), textOf(apNode))
click('删除设备')

/* Frames: draw a dashed rounded box, edit its note and colour. */
click('画框')
const canvasBox = collect(currentTree, (node) => hasClass(node, 'nwt-topo-canvas'))[0]
canvasBox.props.onMouseDown({ button: 0, clientX: 50, clientY: 50, preventDefault() {}, stopPropagation() {} })
dispatch('mousemove', { clientX: 400, clientY: 300 })
dispatch('mouseup', {})
const frameBox = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame'))[0]
expect('dragging on the canvas draws a frame', Boolean(frameBox()), String(collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame')).length))
expect('the frame is the default colour', frameBox().props.style.borderColor === '#64748b', frameBox().props.style.borderColor)
const noteField = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-frame-note'))[0]
const colorField = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-frame-color'))[0]
expect('selecting the frame offers note and colour', Boolean(noteField) && Boolean(colorField))
noteField.props.onChange({ target: { value: '核心区' } })
expect('the note is drawn at the bottom of the frame',
  collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame-label')).some((node) => textOf(node) === '核心区'))
colorField.props.onChange({ target: { value: '#f59e0b' } })
expect('the colour is applied to the frame', frameBox().props.style.borderColor === '#f59e0b', frameBox().props.style.borderColor)

click('+ 路由器')
const stacked = collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame') || hasClass(node, 'nwt-topo-node'))
expect('the frame stays behind the devices',
  Boolean(stacked[0]) && hasClass(stacked[0], 'nwt-topo-frame'), tokens(stacked[0]).join(' '))

/* Layering fix: the frame must not swallow clicks meant for a line inside it. */
const layers = collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame') || hasClass(node, 'nwt-topo-links'))
expect('frames are painted below the link layer', hasClass(layers[0], 'nwt-topo-frame'), tokens(layers[0]).join(' '))
const frameEl = collect(currentTree, (node) => hasClass(node, 'nwt-topo-frame'))[0]
expect('a frame body does not catch the mouse', frameEl.props.onMouseDown === undefined)
expect('only the four borders are grabbable',
  collect(frameEl, (node) => hasClass(node, 'nwt-topo-frame-edge')).length === 4)
expect('the palette adds a router', nodes().length === 1, String(nodes().length))
expect('a new node is selectable right away', nodes()[0].props.className.includes('nwt-topo-node--active'))

click('+ 交换机')
expect('a second node is added', nodes().length === 2, String(nodes().length))

/* Drag the first node 200 px right and 120 px down. */
const first = nodes()[0]
first.props.onMouseDown({ button: 0, clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {} })
dispatch('mousemove', { clientX: 300, clientY: 220 })
dispatch('mouseup', {})
const moved = nodes()[0]
expect('dragging moves the node', moved.props.style.left === '240px' && moved.props.style.top === '152px',
  `${moved.props.style.left},${moved.props.style.top}`)

/* Link mode: two clicks build one line. */
click('连线')
nodes()[0].props.onMouseDown({ button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} })
dispatch('mouseup', {})
expect('the first click arms the link', nodes()[0].props.className.includes('nwt-topo-node--source'))
nodes()[1].props.onMouseDown({ button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} })
dispatch('mouseup', {})
expect('two clicks draw a link', lines().length === 1, String(lines().length))
click('取消连线')

/* Right-click a node and bind a saved device. */
nodes()[0].props.onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 120, clientY: 140 })
const menuEl = collect(currentTree, (node) => hasClass(node, 'nwt-topo-menu'))[0]
expect('the menu opens at the cursor', menuEl?.props.style.left === '120px' && menuEl?.props.style.top === '140px',
  `${menuEl?.props.style.left},${menuEl?.props.style.top}`)
expect('the context menu offers a device list', buttons().some((button) => textOf(button).includes('关联设备')))
click('关联设备…')
expect('the menu lists the device book', buttons().some((button) => textOf(button).includes('CORE-1')))
buttons().find((button) => textOf(button).includes('CORE-1') && hasClass(button, 'nwt-topo-menu-item')).props.onClick()
const bound = nodes()[0]
expect('binding writes the device id into the node', textOf(bound).includes('192.0.2.10'), textOf(bound).slice(0, 60))

/* Double-click jumps to the terminal with that device. */
nodes()[0].props.onDoubleClick({ stopPropagation() {} })
expect('double-click jumps with the bound device', scene.focused[0] === 'dev-1', JSON.stringify(scene.focused))

/* An unbound node explains itself instead of doing nothing. */
nodes()[1].props.onDoubleClick({ stopPropagation() {} })
expect('an unbound node explains why nothing happens', textOf(currentTree).includes('右键'))

/* An unbound device takes its own address and note. */
nodes()[1].props.onMouseDown({ button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} })
dispatch('mouseup', {})
const ipField = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-node-ip'))[0]
expect('a device offers a manual IP field', Boolean(ipField))
ipField.props.onChange({ target: { value: '10.0.0.9' } })
expect('an unbound device shows its manual IP', textOf(nodes()[1]).includes('10.0.0.9'), textOf(nodes()[1]).slice(0, 60))
const nodeNote = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-note-input'))[0]
expect('a device offers a note field', Boolean(nodeNote))
nodeNote.props.onChange({ target: { value: '接入层' } })
const noteEl = collect(currentTree, (node) => hasClass(node, 'nwt-topo-node-note'))[0]
expect('the note is drawn under the device', textOf(noteEl) === '接入层', textOf(noteEl))

/* The autosave is debounced, so give the timer its window. */
await new Promise((resolve) => setTimeout(resolve, 750))
await settle(2)
expect('the canvas autosaves',
  calls.some((call) => call.op === 'diagram.save' && call.library?.diagrams?.[0]?.nodes?.length === 2),
  JSON.stringify(stored.diagrams?.[0]?.nodes?.length))

/* Zoom: the − / + buttons scale the canvas and the stage keeps room for it. */
const stage = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-stage'))[0]
const canvas = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-canvas'))[0]
expect('the canvas starts at 100%', canvas().props.style.transform === 'scale(1)')
click('+')
expect('zoom in scales the canvas', canvas().props.style.transform === 'scale(1.1)', canvas().props.style.transform)
expect('the stage grows with the zoom', stage().props.style.width === '1760px', stage().props.style.width)
click('−')
click('−')
expect('zoom out scales the canvas down', canvas().props.style.transform === 'scale(0.9)', canvas().props.style.transform)
click('90%')
expect('clicking the percentage resets to 100%', canvas().props.style.transform === 'scale(1)')

/* Sheets: a second canvas, renamed in place. */
const sheetSelect = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-sheet'))[0]
expect('one sheet exists at first', sheetSelect().children.length === 1, String(sheetSelect().children.length))
click('新建拓扑')
expect('a new sheet is added and opened', sheetSelect().children.length === 2, String(sheetSelect().children.length))
expect('the new sheet starts empty', nodes().length === 0, String(nodes().length))

click('重命名')
const nameInput = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-sheet-name'))[0]
expect('rename shows an input', Boolean(nameInput))
nameInput.props.onChange({ target: { value: '核心机房' } })
click('确定')
expect('the sheet is renamed', textOf(sheetSelect()).includes('核心机房'), textOf(sheetSelect()).slice(0, 40))

/* Back to the first sheet: its two nodes must still be there. */
sheetSelect().props.onChange({ target: { value: sheetSelect().children[0].props.value } })
expect('switching sheets restores the drawing', nodes().length === 2, String(nodes().length))

/* A selected link takes a note, drawn at the middle of the line. */
const hitLine = collect(currentTree, (node) => hasClass(node, 'nwt-topo-link-hit'))[0]
hitLine.props.onClick({ stopPropagation() {} })
const noteInput = collect(currentTree, (node) => node.type === 'input' && hasClass(node, 'nwt-topo-link-note'))[0]
expect('selecting a link offers a note field', Boolean(noteInput))
noteInput.props.onChange({ target: { value: 'trunk 10G' } })
const labelNode = collect(currentTree, (node) => hasClass(node, 'nwt-topo-link-label'))[0]
expect('the note is drawn on the line', textOf(labelNode) === 'trunk 10G', textOf(labelNode))
expect('the note sits at the midpoint', /px$/.test(labelNode?.props.style.left ?? '') && /px$/.test(labelNode?.props.style.top ?? ''),
  `${labelNode?.props.style.left},${labelNode?.props.style.top}`)

/* A selected link can also be drawn solid or dashed. */
const styleSelect = () => collect(currentTree, (node) => node.type === 'select' && hasClass(node, 'nwt-topo-link-style'))[0]
expect('selecting a link offers a line style', Boolean(styleSelect()))
styleSelect().props.onChange({ target: { value: 'dashed' } })
const linkLine = () => collect(currentTree, (node) => hasClass(node, 'nwt-topo-link-line'))[0]
expect('a dashed link is dashed', linkLine().props.strokeDasharray === '8 5', String(linkLine().props.strokeDasharray))
styleSelect().props.onChange({ target: { value: 'solid' } })
expect('a solid link has no dash array', linkLine().props.strokeDasharray === undefined, String(linkLine().props.strokeDasharray))

/* Deleting a node must take its links with it. */
nodes()[0].props.onMouseDown({ button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} })
dispatch('mouseup', {})
click('删除设备')
expect('deleting a node removes its links too', lines().length === 0, String(lines().length))

click('清空')
expect('clear empties the canvas', nodes().length === 0, String(nodes().length))

console.log(failures === 0 ? '\nthe topology canvas behaves' : `\n${failures} topology UI check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
