// The VT engine that renders the terminal: a resizeable cell grid, incremental
// parsing across chunk boundaries, and the sequences a device CLI actually emits.
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const marker = "    return {\n      inject: ['slots'],"
if (!source.includes(marker)) {
  console.log('FAIL could not find the plugin return block to instrument')
  process.exit(1)
}
const instrumented = source.replace(marker, "    return {\n      _vt: { createScreen, screenRows, SCROLLBACK_LINES },\n      inject: ['slots'],")

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  Component: class {
    constructor(props) { this.props = props }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (initial) => ({ current: initial }),
  useCallback: (callback) => callback,
}

let module_ = null
const loader = {
  load({ id, factory }) {
    module_ = factory((name) => {
      if (name === 'react') return fakeReact
      throw new Error(`unexpected require(${name})`)
    })
    module_.__id = id
  },
}
const win = { __ModuleLoader__: loader }
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'MutationObserver', instrumented)(
  win,
  { documentElement: { lang: 'zh-CN' } },
  { language: 'zh-CN', languages: ['zh-CN'] },
  class { observe() {} disconnect() {} },
)

const { createScreen, screenRows, SCROLLBACK_LINES } = module_._vt

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

/** Read the visible text of one row, wide characters excluded from the pad. */
const rowText = (screen, y) => screen.lines[y].map((cell) => (cell.cont ? '' : cell.ch)).join('').replace(/\s+$/, '')

/* 1. Plain text and the cursor */
{
  const screen = createScreen(20, 4)
  screen.write('hello')
  expect('text lands at the origin', rowText(screen, 0) === 'hello')
  expect('cursor advanced', screen.cursor.x === 5 && screen.cursor.y === 0, `${screen.cursor.x},${screen.cursor.y}`)
  screen.write('\r\nworld')
  expect('carriage return and line feed', rowText(screen, 1) === 'world', JSON.stringify(rowText(screen, 1)))
}

/* 2. Cursor addressing */
{
  const screen = createScreen(20, 5)
  screen.write('\x1b[3;5HX')
  expect('CSI row;col positions the cursor', screen.lines[2][4].ch === 'X', screen.lines[2].map((c) => c.ch).join('').trim())
  screen.write('\x1b[HY')
  expect('CSI H without params homes', screen.lines[0][0].ch === 'Y')
}

/* 3. Colours */
{
  const screen = createScreen(20, 3)
  screen.write('\x1b[31mR\x1b[0mN')
  expect('basic SGR colour applied', screen.lines[0][0].fg && screen.lines[0][0].fg.startsWith('#'), screen.lines[0][0].fg)
  expect('SGR reset clears the colour', screen.lines[0][1].fg === null)
  screen.write('\x1b[1;4mB')
  expect('bold and underline tracked', screen.lines[0][2].bold === true && screen.lines[0][2].underline === true)
  screen.write('\x1b[38;5;196mT')
  expect('256-colour SGR applied', screen.lines[0][3].fg === 'rgb(255,0,0)', screen.lines[0][3].fg)
}

/* 4. Erase */
{
  const screen = createScreen(10, 3)
  screen.write('abcdef\x1b[3D\x1b[K')
  expect('erase to end of line', rowText(screen, 0) === 'abc', JSON.stringify(rowText(screen, 0)))
  screen.write('\x1b[2J')
  expect('erase display clears everything', screen.lines.every((line) => line.every((cell) => cell.ch === ' ')))
}

/* 5. Scrolling */
{
  const screen = createScreen(10, 3)
  screen.write('one\r\ntwo\r\nthree\r\nfour')
  expect('scrolling pushes the top line away', rowText(screen, 0) === 'two' && rowText(screen, 2) === 'four',
    [rowText(screen, 0), rowText(screen, 1), rowText(screen, 2)].join('|'))
}

/* 6. Wide characters */
{
  const screen = createScreen(10, 2)
  screen.write('中文ok')
  expect('CJK takes two cells', screen.lines[0][0].ch === '中' && screen.lines[0][1].cont === true, screen.lines[0][1].ch === '' ? 'continuation' : 'missing')
  expect('text after CJK lands on the right column', screen.lines[0][4].ch === 'o', screen.lines[0][4].ch)
}

/* 7. Split escape sequences across chunks */
{
  const screen = createScreen(10, 3)
  screen.write('\x1b[3')
  screen.write('1mX')
  expect('escape sequence split across writes still applies', screen.lines[0][0].ch === 'X' && screen.lines[0][0].fg !== null)
  screen.write('\x1b')
  screen.write('[2;2HY')
  expect('CSI split at the introducer still positions', screen.lines[1][1].ch === 'Y')
}

/* 8. Alternate screen */
{
  const screen = createScreen(10, 3)
  screen.write('main')
  screen.write('\x1b[?1049h')
  screen.write('alt')
  expect('alternate screen starts blank', rowText(screen, 0) === 'alt', JSON.stringify(rowText(screen, 0)))
  screen.write('\x1b[?1049l')
  expect('leaving the alternate screen restores the main buffer', rowText(screen, 0) === 'main', JSON.stringify(rowText(screen, 0)))
}

/* 9. Cursor visibility and resize */
{
  const screen = createScreen(10, 3)
  screen.write('\x1b[?25l')
  expect('cursor can be hidden', screen.cursor.visible === false)
  screen.write('\x1b[?25h')
  expect('cursor can be shown again', screen.cursor.visible === true)
  screen.write('hello')
  const changed = screen.resize(25, 12)
  expect('resize reports a change', changed === true)
  expect('resize keeps the content', rowText(screen, 0) === 'hello')
  expect('resize adjusts the scroll region', screen.bottom === 11 && screen.lines.length === 12, `${screen.bottom}/${screen.lines.length}`)
  const tooSmall = screen.resize(5, 2)
  expect('resize clamps to a usable minimum', tooSmall === true && screen.cols === 20 && screen.rows === 8, `${screen.cols}x${screen.rows}`)
}

/* 10. OSC title sequence must be swallowed, not printed */
{
  const screen = createScreen(20, 2)
  screen.write('\x1b]0;my title\x07visible')
  expect('OSC title is not printed', rowText(screen, 0) === 'visible', JSON.stringify(rowText(screen, 0)))
}

/* 10b. Scrollback: the lines that leave the top are kept for reading later. */
{
  const runsText = (runs) => runs.map((run) => run.text).join('').replace(/\s+$/, '')
  const screen = createScreen(12, 3)
  for (let i = 1; i <= 6; i += 1) screen.write(`line-${i}\r\n`)
  expect('scrolled-off lines land in the scrollback', screen.scrollback.length === 4, String(screen.scrollback.length))
  expect('the oldest line is kept first', runsText(screen.scrollback[0]) === 'line-1', runsText(screen.scrollback[0]))
  expect('the newest scrolled-off line is last', runsText(screen.scrollback[3]) === 'line-4', runsText(screen.scrollback[3]))
  expect('history is stored as render runs', Array.isArray(screen.scrollback[0])
    && typeof screen.scrollback[0][0]?.text === 'string')
  expect('history never carries the cursor', screen.scrollback.every((line) => line.every((run) => !run.style?.animation)))
  const deep = screen.scrollback.length
  screen.resize(20, 5)
  expect('resizing keeps the scrollback', screen.scrollback.length === deep, String(screen.scrollback.length))
}

/* 10c. The alternate screen and scroll regions are repaints, not history. */
{
  const screen = createScreen(12, 3)
  screen.write('main-1\r\nmain-2\r\nmain-3\r\nmain-4')
  const before = screen.scrollback.length
  screen.write('\x1b[?1049h')
  for (let i = 0; i < 12; i += 1) screen.write(`alt-${i}\r\n`)
  expect('the alternate screen does not pollute the scrollback', screen.scrollback.length === before,
    `${screen.scrollback.length}/${before}`)
  screen.write('\x1b[?1049l')
  expect('leaving the alternate screen keeps the scrollback', screen.scrollback.length === before)

  const region = createScreen(12, 4)
  region.write('\x1b[2;3r')
  region.write('\x1b[3;1H')
  region.write('\r\n\r\n')
  expect('a scroll region inside the screen is not history', region.scrollback.length === 0,
    String(region.scrollback.length))
}

/* 10d. The scrollback is bounded. */
{
  const screen = createScreen(8, 2)
  for (let i = 0; i < SCROLLBACK_LINES + 40; i += 1) screen.write(`x${i}\r\n`)
  expect('the scrollback is capped', screen.scrollback.length === SCROLLBACK_LINES,
    `${screen.scrollback.length} vs ${SCROLLBACK_LINES}`)
}

/* 11. Render runs collapse styles and expose the cursor */
{
  const screen = createScreen(10, 2)
  screen.write('\x1b[32mab\x1b[0mc')
  const rows = screenRows(screen)
  expect('render runs collapse equal styles', rows[0][0].text === 'ab', JSON.stringify(rows[0].map((run) => run.text)))
  const withoutCursor = rows[0].filter((run) => !(run.style && run.style.animation))
  expect('render text matches the grid', withoutCursor.map((run) => run.text).join('').trimEnd() === 'abc',
    JSON.stringify(withoutCursor.map((run) => run.text).join('')))
  const hasCursor = rows[0].some((run) => run.style && run.style.animation)
  expect('cursor cell is marked for the caret animation', hasCursor)
}

console.log(failures === 0 ? '\nVT engine behaves' : `\n${failures} VT check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
