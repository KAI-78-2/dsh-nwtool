/**
 * The hand-drawn topologies: a small library of sheets beside the device book.
 *
 * Each sheet is a JSON document of nodes (device, position, type) and links.
 * Positions are canvas pixels, so the file stays human-readable and a hand-edited
 * file still loads. Every field is coerced and capped on the way in — a broken
 * sheet degrades to "what could be read" instead of failing the whole panel.
 *
 * The first version stored a single canvas at the top level; a file in that
 * shape is migrated into a one-sheet library on load.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { t } from './i18n.js'

const STATE_DIR = path.join(os.homedir(), '.dsh-nwtool')
const DIAGRAM_FILE = path.join(STATE_DIR, 'topology.json')

const NODE_TYPES = new Set(['router', 'switch', 'firewall', 'server', 'pc', 'ac', 'ap', 'cloud', 'other'])
const MAX_NODES = 200
const MAX_LINKS = 400
const MAX_FRAMES = 100
const MAX_SHEETS = 30
const MAX_COORD = 4000

function text(value, limit) {
  return String(value ?? '').trim().slice(0, limit)
}

function coordinate(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(MAX_COORD, Math.round(number)))
}

/** Only a plain six-digit hex survives; anything else means "use the theme". */
function frameColor(value) {
  const text = String(value ?? '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : ''
}

/** Coerce whatever arrived into a document that is safe to render and store. */
export function sanitizeDiagram(input) {
  const source = input && typeof input === 'object' ? input : {}
  const nodes = []
  const seen = new Set()
  for (const raw of Array.isArray(source.nodes) ? source.nodes.slice(0, MAX_NODES) : []) {
    if (!raw || typeof raw !== 'object') continue
    const id = text(raw.id, 40)
    if (!id || seen.has(id)) continue
    seen.add(id)
    nodes.push({
      id,
      type: NODE_TYPES.has(raw.type) ? raw.type : 'other',
      name: text(raw.name, 60) || id,
      x: coordinate(raw.x),
      y: coordinate(raw.y),
      deviceId: text(raw.deviceId, 64),
      /* A device does not have to be in the book to carry an address. */
      ip: text(raw.ip, 64),
      note: text(raw.note, 200),
    })
  }

  const known = new Set(nodes.map((node) => node.id))
  const links = []
  const pairs = new Set()
  for (const raw of Array.isArray(source.links) ? source.links.slice(0, MAX_LINKS) : []) {
    if (!raw || typeof raw !== 'object') continue
    const from = text(raw.from, 40)
    const to = text(raw.to, 40)
    if (!known.has(from) || !known.has(to) || from === to) continue
    const key = [from, to].sort().join('|')
    if (pairs.has(key)) continue
    pairs.add(key)
    links.push({
      id: text(raw.id, 40) || `${from}-${to}`,
      from,
      to,
      label: text(raw.label, 40),
      style: raw.style === 'dashed' ? 'dashed' : 'solid',
    })
  }

  /* Rounded frames: group boxes drawn behind everything else. */
  const frames = []
  const seenFrames = new Set()
  for (const raw of Array.isArray(source.frames) ? source.frames.slice(0, MAX_FRAMES) : []) {
    if (!raw || typeof raw !== 'object') continue
    const id = text(raw.id, 40)
    if (!id || seenFrames.has(id)) continue
    seenFrames.add(id)
    frames.push({
      id,
      x: coordinate(raw.x),
      y: coordinate(raw.y),
      w: Math.max(80, coordinate(raw.w)),
      h: Math.max(60, coordinate(raw.h)),
      label: text(raw.label, 80),
      color: frameColor(raw.color),
    })
  }

  return { nodes, links, frames }
}

/** A whole library: several named sheets plus the one that is open. */
export function sanitizeLibrary(input) {
  const source = input && typeof input === 'object' ? input : {}
  const diagrams = []
  const seen = new Set()
  for (const raw of Array.isArray(source.diagrams) ? source.diagrams.slice(0, MAX_SHEETS) : []) {
    if (!raw || typeof raw !== 'object') continue
    const id = text(raw.id, 40)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const doc = sanitizeDiagram(raw)
    diagrams.push({
      id,
      name: text(raw.name, 40) || t('未命名拓扑'),
      nodes: doc.nodes,
      links: doc.links,
      frames: doc.frames,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    })
  }
  const wanted = text(source.activeId, 40)
  const activeId = diagrams.some((sheet) => sheet.id === wanted) ? wanted : (diagrams[0]?.id ?? '')
  return { activeId, diagrams }
}

/** The previous release wrote one canvas at the top level; wrap it as sheet one. */
export function migrateLibrary(parsed) {
  if (parsed && Array.isArray(parsed.diagrams)) return sanitizeLibrary(parsed)
  if (parsed && Array.isArray(parsed.nodes)) {
    return sanitizeLibrary({
      activeId: 'sheet-1',
      diagrams: [{
        id: 'sheet-1',
        name: t('默认拓扑'),
        nodes: parsed.nodes,
        links: parsed.links,
        updatedAt: parsed.updatedAt,
      }],
    })
  }
  return { activeId: '', diagrams: [] }
}

export async function loadLibrary() {
  try {
    return migrateLibrary(JSON.parse(await fs.readFile(DIAGRAM_FILE, 'utf8')))
  } catch {
    /* No file yet, or an unreadable one: start from an empty library. */
    return { activeId: '', diagrams: [] }
  }
}

export async function saveLibrary(input) {
  const library = sanitizeLibrary(input)
  const updatedAt = new Date().toISOString()
  await fs.mkdir(STATE_DIR, { recursive: true })
  const payload = {
    updatedAt,
    activeId: library.activeId,
    diagrams: library.diagrams.map((sheet) => ({ ...sheet, updatedAt })),
  }
  await fs.writeFile(DIAGRAM_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return { ...library, updatedAt, diagrams: payload.diagrams }
}
