// The topology library: several named sheets, coercion, caps and migration.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nwtool-diagram-'))
process.env.USERPROFILE = home
process.env.HOME = home

const { loadLibrary, saveLibrary, sanitizeDiagram, sanitizeLibrary, migrateLibrary } = await import('../host/diagram.js')

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

const file = path.join(home, '.dsh-nwtool', 'topology.json')

try {
  const empty = await loadLibrary()
  expect('a missing file means an empty library', empty.diagrams.length === 0 && empty.activeId === '')

  const library = {
    activeId: 's2',
    diagrams: [
      {
        id: 's1',
        name: '核心机房',
        nodes: [
          { id: 'n1', type: 'router', name: 'CORE-1', x: 40, y: 40, deviceId: 'dev-1' },
          { id: 'n2', type: 'switch', name: 'ACC-1', x: 240, y: 180, ip: '10.0.0.9', note: '接入层' },
        ],
        links: [{ id: 'l1', from: 'n1', to: 'n2', style: 'dashed' }],
      },
      {
        id: 's2',
        name: '无线',
        nodes: [
          { id: 'w1', type: 'ac', name: 'AC-1', x: 60, y: 60 },
          { id: 'w2', type: 'ap', name: 'AP-1', x: 260, y: 60 },
        ],
        links: [{ id: 'l2', from: 'w1', to: 'w2' }],
      },
    ],
  }
  const saved = await saveLibrary(library)
  expect('the library keeps both sheets', saved.diagrams.length === 2, String(saved.diagrams.length))
  expect('the open sheet is remembered', saved.activeId === 's2', saved.activeId)

  const reloaded = await loadLibrary()
  expect('sheets round-trip through disk', reloaded.diagrams.length === 2)
  expect('sheet names survive', reloaded.diagrams[0].name === '核心机房', reloaded.diagrams[0].name)
  expect('the second sheet is the open one', reloaded.activeId === 's2')
  expect('node positions survive', reloaded.diagrams[0].nodes[1].x === 240)
  expect('the device binding survives', reloaded.diagrams[0].nodes[0].deviceId === 'dev-1')
  expect('a manual IP survives without a device', reloaded.diagrams[0].nodes[1].ip === '10.0.0.9', reloaded.diagrams[0].nodes[1].ip)
  expect('a device note survives', reloaded.diagrams[0].nodes[1].note === '接入层', reloaded.diagrams[0].nodes[1].note)
  expect('new wireless types survive', reloaded.diagrams[1].nodes[0].type === 'ac' && reloaded.diagrams[1].nodes[1].type === 'ap')
  expect('a dashed link stays dashed', reloaded.diagrams[0].links[0].style === 'dashed', reloaded.diagrams[0].links[0].style)
  expect('a link without a style is solid', reloaded.diagrams[1].links[0].style === 'solid', reloaded.diagrams[1].links[0].style)

  const messy = sanitizeLibrary({
    activeId: 'gone',
    diagrams: [
      { id: 'a', name: '  ', nodes: [{ id: 'n', type: 'banana', name: 'x', x: -5, y: 1e9 }], links: [{ from: 'n', to: 'ghost' }] },
      { id: 'a', name: 'duplicate id', nodes: [], links: [] },
      'not-a-sheet',
      { id: 'b', name: 'b'.repeat(80), nodes: [], links: [] },
    ],
  })
  expect('duplicate sheet ids are dropped', messy.diagrams.length === 2, String(messy.diagrams.length))
  expect('an empty sheet name falls back', messy.diagrams[0].name === '未命名拓扑', messy.diagrams[0].name)
  expect('sheet names are capped', messy.diagrams[1].name.length === 40, String(messy.diagrams[1].name.length))
  expect('an unknown active id falls back to the first sheet', messy.activeId === 'a', messy.activeId)
  expect('an unknown node type falls back to other', messy.diagrams[0].nodes[0].type === 'other')
  expect('coordinates are clamped', messy.diagrams[0].nodes[0].x === 0 && messy.diagrams[0].nodes[0].y <= 4000)
  expect('a link to a missing node is dropped', messy.diagrams[0].links.length === 0)

  /* Frames: dashed group boxes, stored with the sheet. */
  const framed = await saveLibrary({
    activeId: 'f1',
    diagrams: [{
      id: 'f1',
      name: '带框',
      nodes: [],
      links: [],
      frames: [
        { id: 'fr1', x: 60, y: 40, w: 320, h: 200, label: '核心区', color: '#f59e0b' },
        { id: 'fr2', x: -10, y: 9000, w: 10, h: 10, label: '', color: 'not-a-colour' },
      ],
    }],
  })
  const framedReload = await loadLibrary()
  const frames = framedReload.diagrams[0].frames
  expect('frames round-trip through disk', frames.length === 2, String(frames.length))
  expect('the frame note survives', frames[0].label === '核心区', frames[0].label)
  expect('the frame colour survives', frames[0].color === '#f59e0b', frames[0].color)
  expect('frames are positioned on the canvas', frames[0].x === 60 && frames[0].w === 320, `${frames[0].x},${frames[0].w}`)
  expect('a bad colour falls back to the theme', frames[1].color === '', frames[1].color)
  expect('frame coordinates are clamped', frames[1].x === 0 && frames[1].y <= 4000, `${frames[1].x},${frames[1].y}`)
  expect('a frame keeps a usable minimum size', frames[1].w >= 80 && frames[1].h >= 60, `${frames[1].w}x${frames[1].h}`)
  expect('the library still saves', Boolean(framed.updatedAt))


  const migrated = migrateLibrary({
    nodes: [{ id: 'n1', type: 'pc', name: 'PC-1', x: 10, y: 20 }],
    links: [],
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  expect('an old single-canvas file migrates to one sheet', migrated.diagrams.length === 1, String(migrated.diagrams.length))
  expect('the migrated sheet is open', migrated.activeId === migrated.diagrams[0].id)
  expect('the migrated nodes survive', migrated.diagrams[0].nodes[0].name === 'PC-1')
  expect('the migrated sheet has a name', Boolean(migrated.diagrams[0].name), migrated.diagrams[0].name)

  /* A hand-edited file with a broken link must still load its sheets. */
  fs.writeFileSync(file, JSON.stringify({
    activeId: 'x',
    diagrams: [{
      id: 'x',
      name: '手工编辑',
      nodes: [{ id: 'n1', type: 'server', name: 'APP-1', x: 20, y: 30 }],
      links: [{ from: 'n1', to: 'missing' }],
    }],
  }))
  const repaired = await loadLibrary()
  expect('a broken link does not lose the sheet', repaired.diagrams.length === 1 && repaired.diagrams[0].links.length === 0)
  expect('the repaired sheet still opens', repaired.activeId === 'x')

  const single = sanitizeDiagram({ nodes: [{ id: 'a', type: 'switch', name: '', x: 1, y: 2 }] })
  expect('a nameless node falls back to its id', single.nodes[0].name === 'a')
} catch (error) {
  bad('topology library', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

fs.rmSync(home, { recursive: true, force: true })
console.log(failures === 0 ? '\nthe topology library behaves' : `\n${failures} topology check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
