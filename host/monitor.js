/**
 * Side-channel monitoring for the terminal panel.
 *
 * The interactive terminal is a raw byte stream, so running `top` inside it
 * would destroy the user's screen. Instead each monitored tab opens a *second*
 * CLI session (same credentials, own connection) and asks it for one compact
 * sample at a time. That is what the desktop terminal emulators do too.
 *
 * Every vendor answers in a different dialect, so the raw output is parsed on
 * the Host side into one shape:
 *
 *   { vendor, cpu, memory, load, disk[], nic[] }
 *
 * Counters that only make sense as a delta (`/proc/stat`, `/proc/net/dev`) are
 * kept on the monitor session between samples.
 */
import crypto from 'node:crypto'

import { openSsh, openTelnet } from './cli.js'
import { t } from './i18n.js'

const MAX_MONITORS = 8
const monitors = new Map()

/* ------------------------------------------------------------------ */
/* Vendor profiles                                                     */
/* ------------------------------------------------------------------ */

const VENDORS = {
  linux: {
    label: 'Linux',
    /* One command per file: a combined shell line needs a separator token, and
       `echo ==NW==` is rejected outright by zsh. */
    commands: ['cat /proc/stat', 'cat /proc/meminfo', 'cat /proc/loadavg', 'df -P -k', 'cat /proc/net/dev'],
    sample: parseLinuxSample,
  },
  vrp: {
    label: 'Huawei VRP / H3C',
    commands: ['display cpu-usage', 'display memory-usage', 'dir flash:', 'display interface brief'],
    sample: parseVrpSample,
  },
  ios: {
    label: 'Cisco IOS',
    commands: ['show processes cpu | include utilization', 'show memory statistics | include Processor', 'dir flash:', 'show interfaces summary'],
    sample: parseIosSample,
  },
}

/** Identify the device once, so every later sample uses the right dialect. */
const DETECT_COMMANDS = [
  { command: 'display version', vendor: 'vrp', test: /VRP|Versatile Routing Platform|Comware/i },
  { command: 'show version', vendor: 'ios', test: /Cisco IOS|IOS XE|NX-OS/i },
  { command: 'uname -s', vendor: 'linux', test: /Linux/i },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toNumber(raw) {
  const value = Number(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}

function percent(part, total) {
  if (!total || !Number.isFinite(total)) return null
  return Math.max(0, Math.min(100, Math.round((part / total) * 1000) / 10))
}

const SIZE_SCALE = { b: 1, byte: 1, bytes: 1, kb: 1024, k: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }

function bytesFrom(value, unit) {
  const amount = toNumber(value)
  const scale = SIZE_SCALE[String(unit ?? '').trim().toLowerCase()] ?? 1
  return amount * scale
}

/* ------------------------------------------------------------------ */
/* Linux                                                               */
/* ------------------------------------------------------------------ */

export function parseLinuxSample(outputs = [], previous = null) {
  /* One entry per command; a bare string is accepted for older callers. */
  const parts = Array.isArray(outputs) ? outputs : [String(outputs ?? '')]
  const result = { cpu: null, memory: null, load: null, disk: [], nic: [], next: { stat: null, net: {} } }

  /* /proc/stat */
  const cpuLine = /^cpu\s+(.+)$/m.exec(parts[0] ?? '')
  if (cpuLine) {
    const fields = cpuLine[1].trim().split(/\s+/).map(toNumber)
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
    const total = fields.reduce((sum, value) => sum + value, 0)
    result.next.stat = { total, idle }
    if (previous?.stat) {
      const deltaTotal = total - previous.stat.total
      const deltaIdle = idle - previous.stat.idle
      if (deltaTotal > 0) result.cpu = { percent: Math.round((1 - deltaIdle / deltaTotal) * 1000) / 10 }
    }
  }

  /* /proc/meminfo */
  const memTotal = /MemTotal:\s+(\d+)\s*kB/.exec(parts[1] ?? '')
  if (memTotal) {
    const total = toNumber(memTotal[1]) * 1024
    const available = /MemAvailable:\s+(\d+)\s*kB/.exec(parts[1] ?? '')
    const free = /MemFree:\s+(\d+)\s*kB/.exec(parts[1] ?? '')
    const usable = available ? toNumber(available[1]) * 1024 : toNumber(free?.[1]) * 1024
    result.memory = { total, used: Math.max(0, total - usable), free: usable, percent: percent(total - usable, total) }
  }

  /* /proc/loadavg */
  const load = /^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/m.exec(parts[2] ?? '')
  if (load) result.load = { one: Number(load[1]), five: Number(load[2]), fifteen: Number(load[3]) }

  /* df -P -k */
  for (const line of (parts[3] ?? '').split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length < 6) continue
    if (/^Filesystem$/i.test(fields[0])) continue
    if (/^tmpfs|^devtmpfs|^udev|^none$/i.test(fields[0])) continue
    const total = toNumber(fields[1]) * 1024
    if (!total) continue
    const used = toNumber(fields[2]) * 1024
    const free = toNumber(fields[3]) * 1024
    const mount = fields.slice(5).join(' ')
    /* Container layers repeat the host filesystem and only add noise. */
    if (/^overlay$/i.test(fields[0]) && /docker|overlay2/.test(mount)) continue
    result.disk.push({ mount, filesystem: fields[0], total, used, free, percent: toNumber(fields[4].replace('%', '')) })
  }
  result.disk.sort((left, right) => (left.mount === '/' ? -1 : right.mount === '/' ? 1 : right.total - left.total))
  result.disk = result.disk.slice(0, 6)

  /* /proc/net/dev */
  const now = Date.now()
  for (const line of (parts[4] ?? '').split(/\r?\n/)) {
    const match = /^\s*([^:]+):\s*(.+)$/.exec(line)
    if (!match) continue
    const name = match[1].trim()
    if (name === 'lo' || name === 'Inter-|') continue
    /* Container bridges are noise in a link-utilisation list. */
    if (/^(veth|docker|br-|virbr)/i.test(name)) continue
    const fields = match[2].trim().split(/\s+/).map(toNumber)
    if (fields.length < 9) continue
    const rx = fields[0]
    const tx = fields[8]
    result.next.net[name] = { rx, tx, at: now }
    const before = previous?.net?.[name]
    const elapsed = before ? (now - before.at) / 1000 : 0
    result.nic.push({
      name,
      /* /proc/net/dev counts bytes; every other vendor reports bits, so we
         normalise to bits per second here. */
      rxBps: before && elapsed > 0 ? Math.max(0, Math.round(((rx - before.rx) / elapsed) * 8)) : null,
      txBps: before && elapsed > 0 ? Math.max(0, Math.round(((tx - before.tx) / elapsed) * 8)) : null,
      rxTotal: rx,
      txTotal: tx,
      up: true,
    })
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Huawei VRP / H3C                                                    */
/* ------------------------------------------------------------------ */

export function parseVrpSample(outputs) {
  const [cpuText = '', memText = '', dirText = '', intText = ''] = outputs
  const result = { cpu: null, memory: null, load: null, disk: [], nic: [], next: null }

  const cpu = /CPU Usage\s*:\s*(\d+)%/i.exec(cpuText) ?? /CPU utilization[^\d]*(\d+)%/i.exec(cpuText)
  if (cpu) result.cpu = { percent: Number(cpu[1]) }

  const used = /Memory utilization\s*:\s*(\d+)%/i.exec(memText)
  const totalMem = /Total Memory\s*:\s*([\d,]+)\s*(KB|MB|GB)?/i.exec(memText)
  const freeMem = /(?:Total )?Free Memory\s*:\s*([\d,]+)\s*(KB|MB|GB)?/i.exec(memText)
  if (used || totalMem) {
    const total = totalMem ? bytesFrom(totalMem[1], totalMem[2] ?? 'MB') : 0
    const free = freeMem ? bytesFrom(freeMem[1], freeMem[2] ?? 'MB') : 0
    result.memory = {
      total,
      free,
      used: total && free ? Math.max(0, total - free) : 0,
      percent: used ? Number(used[1]) : percent(total - free, total),
    }
  }

  const dir = parseDirOutput(dirText)
  if (dir.total) {
    result.disk.push({ mount: dir.path || 'flash:', total: dir.total, used: dir.total - dir.free, free: dir.free, percent: percent(dir.total - dir.free, dir.total) })
  }

  for (const line of intText.split(/\r?\n/)) {
    const match = /^(\S+)\s+(up|down|\*down|DOWN)\s+(up|down|\*down|DOWN)\s+(\d+)%\s+(\d+)%/.exec(line.trim())
    if (!match) continue
    result.nic.push({
      name: match[1],
      up: /^up$/i.test(match[2]) && /^up$/i.test(match[3]),
      inUti: Number(match[4]),
      outUti: Number(match[5]),
      rxBps: null,
      txBps: null,
    })
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Cisco IOS                                                           */
/* ------------------------------------------------------------------ */

export function parseIosSample(outputs) {
  const [cpuText = '', memText = '', dirText = '', intText = ''] = outputs
  const result = { cpu: null, memory: null, load: null, disk: [], nic: [], next: null }

  const cpu = /five seconds:\s*(\d+)%\/\d+%;\s*one minute:\s*(\d+)%;\s*five minutes:\s*(\d+)%/i.exec(cpuText)
  if (cpu) {
    result.cpu = { percent: Number(cpu[1]) }
    result.load = { one: Number(cpu[2]), five: Number(cpu[3]), fifteen: null }
  }

  const mem = /Processor\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)/i.exec(memText)
  if (mem) {
    const total = toNumber(mem[1])
    const used = toNumber(mem[2])
    const free = toNumber(mem[3])
    result.memory = { total, used, free, percent: percent(used, total) }
  }

  const dir = parseDirOutput(dirText)
  if (dir.total) {
    result.disk.push({ mount: dir.path || 'flash:', total: dir.total, used: dir.total - dir.free, free: dir.free, percent: percent(dir.total - dir.free, dir.total) })
  }

  for (const line of intText.split(/\r?\n/)) {
    const match = /^(\S+)\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+\d+\s+(\d+)\s+\d+/.exec(line.trim())
    if (!match) continue
    if (/^Interface$/i.test(match[1])) continue
    result.nic.push({
      name: match[1],
      up: true,
      rxBps: toNumber(match[2]),
      txBps: toNumber(match[3]),
      inUti: null,
      outUti: null,
    })
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Directory listings                                                  */
/* ------------------------------------------------------------------ */

/** VRP / IOS `dir` output: rows plus the "total (free)" trailer. */
export function parseDirOutput(text) {
  const entries = []
  let total = null
  let free = null
  let path = ''

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const directory = /Directory of\s+(\S+?\/*)\s*$/i.exec(line.trim())
    if (directory) {
      path = directory[1]
      continue
    }
    const summary = /([\d,]+)\s*(KB|bytes?)\s+total\s*\(([\d,]+)\s*(KB|bytes?)\s+free\)/i.exec(line)
    if (summary) {
      total = bytesFrom(summary[1], summary[2])
      free = bytesFrom(summary[3], summary[4])
      continue
    }
    /* "  0  -rw-   1,234  Oct 10 2025 10:00:00  vrpcfg.zip" */
    const vrp = /^\s*(\d+)\s+(-rw-|drwx|-[a-z-]{3}|d[a-z-]{3})\s+([\d,]+|-)\s+([A-Z][a-z]{2}\s+\d+\s+\d{4}\s+[\d:]+)\s+(.+)$/.exec(line)
    if (vrp) {
      const isDir = vrp[2].startsWith('d')
      /* IOS appends a timezone before the name; VRP does not. */
      const name = vrp[5].trim().replace(/^[+-]\d{2}:\d{2}\s+/, '')
      entries.push({
        name,
        type: isDir ? 'dir' : 'file',
        size: isDir ? 0 : toNumber(vrp[3]),
        mtime: vrp[4],
      })
      continue
    }
    /* "1  -rw-  1234560  Nov 12 2026 03:00:00 +08:00  image.bin" */
    const ios = /^\s*\d+\s+(-rw-|drwx|-[a-z-]{3}|d[a-z-]{3})\s+([\d,]+)\s+([A-Z][a-z]{2}\s+\d+\s+\d{4}\s+[\d:]+(?:\s+[+-]\d{2}:\d{2})?)\s+(.+)$/.exec(line)
    if (ios) {
      entries.push({
        name: ios[4].trim(),
        type: ios[1].startsWith('d') ? 'dir' : 'file',
        size: toNumber(ios[2]),
        mtime: ios[3],
      })
    }
  }
  return { entries, total, free, path }
}

/** `ls -la` output, with the symlink target kept. */
export function parseLsOutput(text) {
  const entries = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    if (/^total\s+\d+/i.test(line.trim())) continue
    const match = /^([-dlbcps][rwxsStT-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+([\d,]+)\s+([A-Z][a-z]{2}\s+\d+\s+[\d:]+|\d{4}-\d{2}-\d{2}\s+[\d:]+)\s+(.+)$/.exec(line)
    if (!match) continue
    const mode = match[1]
    let name = match[6]
    let target = ''
    const arrow = name.indexOf(' -> ')
    if (arrow >= 0) {
      target = name.slice(arrow + 4)
      name = name.slice(0, arrow)
    }
    entries.push({
      name,
      type: mode.startsWith('d') ? 'dir' : mode.startsWith('-') ? 'file' : mode.startsWith('l') ? 'link' : 'other',
      size: toNumber(match[4]),
      mode,
      owner: match[2],
      group: match[3],
      mtime: match[5],
      target,
    })
  }
  return { entries }
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

function monitorTarget(device, password) {
  const protocol = String(device.protocol ?? 'ssh').toLowerCase() === 'telnet' ? 'telnet' : 'ssh'
  return {
    host: String(device.host ?? ''),
    port: Number(device.port) || (protocol === 'telnet' ? 23 : 22),
    protocol,
    username: String(device.username ?? ''),
    password: String(password ?? ''),
    keyPath: String(device.keyPath ?? ''),
    timeout: 10000,
    commandTimeout: 20000,
  }
}

export async function openMonitor({ device, password, vendor = 'auto', signal }) {
  if (monitors.size >= MAX_MONITORS) {
    throw new Error(t('同时打开的监控过多（上限 ${max}）', { max: MAX_MONITORS }))
  }
  const target = monitorTarget(device, password)
  const session = target.protocol === 'ssh' ? await openSsh(target, signal) : await openTelnet(target, signal)
  const monitor = {
    id: crypto.randomUUID(),
    session,
    device: target,
    vendor: VENDORS[vendor] ? vendor : '',
    prev: null,
    openedAt: new Date().toISOString(),
    samples: 0,
  }
  try {
    if (!monitor.vendor) {
      for (const probe of DETECT_COMMANDS) {
        let output = ''
        try {
          output = await session.command(probe.command, 12000)
        } catch {
          continue
        }
        if (probe.test.test(output)) {
          monitor.vendor = probe.vendor
          break
        }
      }
      /* Anything that answers neither dialect but is a shell is Linux-like. */
      if (!monitor.vendor) monitor.vendor = 'linux'
    }
  } catch (error) {
    closeMonitor(monitor.id)
    throw error
  }
  monitors.set(monitor.id, monitor)
  return monitor
}

export function monitorById(id) {
  return monitors.get(String(id ?? '')) ?? null
}

export function closeMonitor(id) {
  const monitor = monitors.get(String(id ?? ''))
  if (!monitor) return false
  monitors.delete(monitor.id)
  try {
    monitor.session.close()
  } catch {
    /* already gone */
  }
  Promise.resolve()
    .then(() => monitor.session.cleanup?.())
    .catch(() => {})
  return true
}

export function monitorCount() {
  return monitors.size
}

export function disposeMonitors() {
  for (const id of [...monitors.keys()]) closeMonitor(id)
}

/** One sample: run the vendor's command list and fold the answers together. */
export async function sampleMonitor(id, signal) {
  const monitor = monitorById(id)
  if (!monitor) throw new Error(t('监控会话不存在'))
  const profile = VENDORS[monitor.vendor] ?? VENDORS.linux
  const outputs = []
  for (const command of profile.commands) {
    if (signal?.aborted) throw Object.assign(new Error(t('已取消')), { name: 'AbortError' })
    outputs.push(await monitor.session.command(command, 20000))
  }
  const sample = profile.sample(outputs, monitor.prev)
  monitor.prev = sample.next ?? monitor.prev
  monitor.samples += 1
  return {
    vendor: monitor.vendor,
    vendorLabel: profile.label,
    at: new Date().toISOString(),
    cpu: sample.cpu,
    memory: sample.memory,
    load: sample.load,
    disk: sample.disk ?? [],
    nic: (sample.nic ?? []).slice(0, 8),
    firstSample: monitor.samples === 1,
  }
}

/* ------------------------------------------------------------------ */
/* File browser                                                        */
/* ------------------------------------------------------------------ */

/** A path is sent to a device shell, so it may only contain safe characters. */
export function safePath(raw) {
  const path = String(raw ?? '').trim()
  if (!path) return ''
  if (path.length > 160) throw new Error(t('路径太长'))
  if (!/^[A-Za-z0-9._/\-\\:]+$/.test(path)) {
    throw new Error(t('路径只能包含字母、数字、点、斜杠、冒号、横线: ${path}', { path }))
  }
  if (/^-/.test(path)) throw new Error(t('路径不能以横线开头: ${path}', { path }))
  return path
}

export async function statFile(id, rawPath, signal) {
  const monitor = monitorById(id)
  if (!monitor) throw new Error(t('监控会话不存在'))
  const path = safePath(rawPath)
  if (!path) throw new Error(t('请填写文件路径'))
  if (signal?.aborted) throw Object.assign(new Error(t('已取消')), { name: 'AbortError' })

  if (monitor.vendor === 'linux') {
    const output = await monitor.session.command(`stat -c '%n|%s|%y|%a|%U|%G|%F' ${path}`, 10000)
    const line = output.split(/\r?\n/).find((item) => item.split('|').length >= 7) ?? ''
    const [name, size, mtime, permission, owner, group, kind] = line.split('|')
    return {
      vendor: monitor.vendor,
      name: (name ?? path).trim(),
      size: toNumber(size),
      mtime: (mtime ?? '').trim(),
      permission: (permission ?? '').trim(),
      owner: (owner ?? '').trim(),
      group: (group ?? '').trim(),
      kind: (kind ?? '').trim(),
    }
  }

  const output = await monitor.session.command(`dir ${path}`, 15000)
  const parsed = parseDirOutput(output)
  const entry = parsed.entries.find((item) => item.name === path.split('/').pop()) ?? parsed.entries[0]
  return {
    vendor: monitor.vendor,
    name: entry?.name ?? path,
    size: entry?.size ?? 0,
    mtime: entry?.mtime ?? '',
    permission: '',
    owner: '',
    group: '',
    kind: entry?.type === 'dir' ? t('目录') : t('普通文件'),
  }
}

export async function listFiles(id, rawPath, signal) {
  const monitor = monitorById(id)
  if (!monitor) throw new Error(t('监控会话不存在'))
  const path = safePath(rawPath)
  if (signal?.aborted) throw Object.assign(new Error(t('已取消')), { name: 'AbortError' })

  if (monitor.vendor === 'linux') {
    let current = path
    if (!current) {
      current = (await monitor.session.command('pwd', 10000)).trim().split(/\r?\n/).pop() ?? ''
      if (!/^[A-Za-z0-9._/\-]+$/.test(current)) current = '.'
    }
    const output = await monitor.session.command(`ls -la ${current === '.' ? '.' : current}`, 15000)
    const parsed = parseLsOutput(output)
    return {
      vendor: monitor.vendor,
      path: current,
      parent: current === '/' ? '' : current.replace(/\/?[^/]+\/?$/, '') || '/',
      entries: parsed.entries.sort((left, right) => {
        if (left.type === 'dir' && right.type !== 'dir') return -1
        if (right.type === 'dir' && left.type !== 'dir') return 1
        return left.name.localeCompare(right.name)
      }),
    }
  }

  const command = path ? `dir ${path}` : 'dir'
  const output = await monitor.session.command(command, 15000)
  const parsed = parseDirOutput(output)
  const current = parsed.path || path || ''
  return {
    vendor: monitor.vendor,
    path: current,
    parent: current.includes('/') ? current.replace(/\/?[^/]+\/?$/, '') : '',
    entries: parsed.entries.sort((left, right) => {
      if (left.type === 'dir' && right.type !== 'dir') return -1
      if (right.type === 'dir' && left.type !== 'dir') return 1
      return left.name.localeCompare(right.name)
    }),
    total: parsed.total,
    free: parsed.free,
  }
}
