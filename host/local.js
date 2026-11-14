/**
 * What this PC is doing on the wire right now: its socket table and its ARP /
 * neighbour cache.
 *
 * The socket table is read from the platform's own tool (netstat / ss) rather
 * than a native module, so the plugin stays dependency-free. The ARP cache is
 * readable without privileges; writing to it is not — Windows and Linux both
 * require an elevated shell — so add/delete report the platform's own refusal
 * instead of pretending it worked.
 */
import { OUI_VENDORS } from './data.js'
import { t } from './i18n.js'
import { clampNumber, isIPv4, isWindows, runProcess } from './util.js'

/**
 * Console output arrives in the OEM code page (GBK on a Chinese Windows), so a
 * latin1 read turns 动态 into mojibake and the entry type is lost.
 */
const CONSOLE_DECODER = (() => {
  try {
    return new TextDecoder('gbk')
  } catch {
    return null
  }
})()

function textOf(buffer) {
  if (typeof buffer === 'string') return buffer
  if (!buffer || !buffer.length) return ''
  if (CONSOLE_DECODER) {
    try {
      return CONSOLE_DECODER.decode(buffer)
    } catch {
      /* fall through to a byte-preserving read */
    }
  }
  return buffer.toString('latin1')
}

function normalizeMac(raw) {
  const hex = String(raw ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g).join(':')
}

function vendorOf(mac) {
  if (!mac) return ''
  return OUI_VENDORS[mac.replace(/:/g, '').slice(0, 6).toUpperCase()] ?? ''
}

/* ------------------------------------------------------------------ */
/* Socket table                                                        */
/* ------------------------------------------------------------------ */

const LISTEN_STATES = new Set(['LISTEN', 'LISTENING', 'UNCONN', 'IDLE'])

function parseNetstatWindows(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(TCP|UDP)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s+(\d+)\s*$/i.exec(line)
    if (!match) continue
    const protocol = match[1].toUpperCase()
    /* UDP lines carry no state column, so the state slot holds the PID there. */
    const state = protocol === 'UDP' ? '' : (match[4] ?? '')
    const pid = protocol === 'UDP' ? match[4] : match[5]
    rows.push({ protocol, local: match[2], remote: match[3], state, pid: String(pid ?? '') })
  }
  return rows
}

function parseSs(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/)
    if (tokens.length < 5) continue
    const protocol = tokens[0].toLowerCase()
    if (!/^(tcp|udp)/.test(protocol)) continue
    const state = tokens[1]
    const local = tokens[4]
    const remote = tokens[5] ?? '*'
    const processMatch = /"([^"]+)",pid=(\d+)/.exec(line)
    rows.push({
      protocol: protocol.startsWith('udp') ? 'UDP' : 'TCP',
      local,
      remote,
      state,
      pid: processMatch?.[2] ?? '',
      process: processMatch?.[1] ?? '',
    })
  }
  return rows
}

/** `netstat -an`, which every platform has in some shape. */
function parseNetstatGeneric(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*(tcp|udp)/i.test(line)) continue
    const tokens = line.trim().split(/\s+/)
    const protocol = tokens[0].toUpperCase()
    const address = tokens.filter((token) => /[.:]\d+$/.test(token) || /^[*\d]/.test(token))
    if (address.length < 2) continue
    const state = tokens[tokens.length - 1]
    rows.push({
      protocol,
      local: address[0],
      remote: address[1] ?? '*',
      state: /^[A-Z_]+$/.test(state) ? state : '',
      pid: '',
    })
  }
  return rows
}

async function processNames(signal) {
  if (!isWindows()) return new Map()
  const result = await runProcess('tasklist', ['/fo', 'csv', '/nh'], { timeoutMs: 15000, signal })
  const names = new Map()
  for (const line of result.stdout.toString('utf8').split(/\r?\n/)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim())
    if (match) names.set(match[2], match[1])
  }
  return names
}

function portOf(address) {
  const match = /:(\d+)$/.exec(String(address ?? ''))
  return match ? Number(match[1]) : null
}

export async function portState(params = {}, emit, signal) {
  const stateFilter = String(params.state ?? 'all')
  const keyword = String(params.filter ?? '').trim().toLowerCase()
  const limit = clampNumber(Number(params.limit) || 400, 20, 5000, 400)

  emit({ t: 'log', d: t('读取本机套接字表') })
  let rows = []
  if (isWindows()) {
    const result = await runProcess('netstat', ['-ano'], { timeoutMs: 20000, signal, encoding: 'buffer' })
    rows = parseNetstatWindows(textOf(result.stdout))
  } else {
    const ss = await runProcess('ss', ['-tunap'], { timeoutMs: 20000, signal, encoding: 'buffer' })
    if (ss.ok) rows = parseSs(textOf(ss.stdout))
    if (!rows.length) {
      const fallback = await runProcess('netstat', ['-an'], { timeoutMs: 20000, signal, encoding: 'buffer' })
      rows = parseNetstatGeneric(textOf(fallback.stdout))
    }
  }
  if (!rows.length) throw new Error(t('没有读到任何套接字，可能缺少 netstat/ss 命令'))
  if (signal?.aborted) throw new Error(t('已取消'))

  const names = await processNames(signal)
  for (const row of rows) {
    if (!row.process) row.process = names.get(row.pid) ?? ''
  }

  const filtered = rows.filter((row) => {
    if (stateFilter === 'listen' && !LISTEN_STATES.has(String(row.state).toUpperCase())) return false
    if (stateFilter === 'established' && !/^ESTABLISHED$/i.test(row.state)) return false
    if (!keyword) return true
    return [row.local, row.remote, row.state, row.pid, row.process]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword))
  })

  const listening = rows.filter((row) => LISTEN_STATES.has(String(row.state).toUpperCase())).length
  const established = rows.filter((row) => /^ESTABLISHED$/i.test(row.state)).length
  emit({
    t: 'stats',
    d: {
      [t('全部')]: rows.length,
      [t('监听')]: listening,
      [t('已建立')]: established,
      [t('TCP')]: rows.filter((row) => row.protocol === 'TCP').length,
      [t('UDP')]: rows.filter((row) => row.protocol === 'UDP').length,
    },
  })

  if (!filtered.length) {
    emit({ t: 'notice', d: t('没有符合筛选条件的条目') })
    emit({ t: 'done', d: { total: rows.length, matched: 0 } })
    return
  }

  const sliced = filtered
    .sort((left, right) => (portOf(left.local) ?? 0) - (portOf(right.local) ?? 0))
    .slice(0, limit)
  emit({
    t: 'rows',
    d: sliced.map((row) => ({
      protocol: row.protocol,
      local: row.local,
      remote: row.remote,
      state: row.state || '-',
      pid: row.pid || '-',
      process: row.process || '-',
    })),
  })
  if (filtered.length > sliced.length) {
    emit({ t: 'notice', d: t('共 ${total} 条，只显示前 ${shown} 条', { total: filtered.length, shown: sliced.length }) })
  }
  emit({ t: 'done', d: { total: rows.length, matched: filtered.length } })
}

/* ------------------------------------------------------------------ */
/* ARP / neighbour cache                                               */
/* ------------------------------------------------------------------ */

function interfaceOf(line) {
  const match = /(?:接口|Interface)\s*:?\s*([0-9.]+)/i.exec(line)
  return match ? match[1] : ''
}

/** Windows `arp -a`: one interface block after another. */
export function parseArpWindows(text) {
  const entries = []
  let iface = ''
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const header = interfaceOf(line)
    if (header) {
      iface = header
      continue
    }
    const match = /(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})\s*(\S+)?/.exec(line)
    if (!match) continue
    entries.push({
      address: match[1],
      mac: normalizeMac(match[2]),
      type: match[3] ?? '',
      interface: iface,
    })
  }
  return entries
}

/** `ip neigh` (Linux) and `arp -an` (BSD/macOS) in one pass. */
export function parseArpUnix(text) {
  const entries = []
  for (const line of text.split(/\r?\n/)) {
    const ipNeigh = /^(\d{1,3}(?:\.\d{1,3}){3})\s+dev\s+(\S+)\s+(?:lladdr\s+([0-9a-fA-F:]{17})\s+)?(\S+)/.exec(line.trim())
    if (ipNeigh) {
      entries.push({
        address: ipNeigh[1],
        mac: normalizeMac(ipNeigh[3]),
        state: ipNeigh[4],
        interface: ipNeigh[2],
        type: '',
      })
      continue
    }
    const bsd = /\((\d{1,3}(?:\.\d{1,3}){3})\)\s+at\s+([0-9a-fA-F:]{17}|\(incomplete\))/.exec(line)
    if (bsd) {
      entries.push({ address: bsd[1], mac: normalizeMac(bsd[2]), state: '', interface: '', type: '' })
    }
  }
  return entries
}

async function readArp(signal) {
  if (isWindows()) {
    const result = await runProcess('arp', ['-a'], { timeoutMs: 15000, signal, encoding: 'buffer' })
    return parseArpWindows(textOf(result.stdout))
  }
  const neigh = await runProcess('ip', ['neigh'], { timeoutMs: 15000, signal, encoding: 'buffer' })
  if (neigh.ok) {
    const rows = parseArpUnix(textOf(neigh.stdout))
    if (rows.length) return rows
  }
  const fallback = await runProcess('arp', ['-an'], { timeoutMs: 15000, signal, encoding: 'buffer' })
  return parseArpUnix(textOf(fallback.stdout))
}

/** `arp -a` prints the entry type in the OS language; say it in ours. */
function typeLabel(raw) {
  const text = String(raw ?? '').toLowerCase()
  if (/static|静态/.test(text)) return t('静态')
  if (/dynamic|动态/.test(text)) return t('动态')
  return raw || '-'
}

function arpRows(entries) {
  return entries.map((entry) => ({
    address: entry.address,
    mac: entry.mac ?? t('（未解析）'),
    vendor: vendorOf(entry.mac) || '-',
    type: typeLabel(entry.state || entry.type),
    interface: entry.interface || '-',
  }))
}

/** Run one cache mutation and return the platform's own message. */
async function mutate(command, args, signal) {
  const result = await runProcess(command, args, { timeoutMs: 20000, signal, encoding: 'buffer' })
  const output = `${textOf(result.stdout)} ${textOf(result.stderr)}`.trim()
  return { ok: result.ok, code: result.code, output }
}

function permissionHint() {
  return isWindows()
    ? t('写入 ARP 缓存需要管理员权限，请以管理员身份运行 DSH 后重试')
    : t('写入邻居表需要 root 权限，请用 sudo 启动 DSH 后重试')
}

export async function arpTable(params = {}, emit, signal) {
  const action = String(params.action ?? 'list')
  emit({ t: 'log', d: t('读取 ARP / 邻居表') })

  if (action === 'add' || action === 'del') {
    const address = String(params.ip ?? '').trim()
    if (!isIPv4(address)) throw new Error(t('请填写合法的 IPv4 地址: ${address}', { address }))
    let result
    if (action === 'add') {
      const mac = normalizeMac(params.mac)
      if (!mac) throw new Error(t('请填写合法的 MAC 地址（如 00-11-22-33-44-55）'))
      const native = isWindows() ? mac.replace(/:/g, '-') : mac.toLowerCase()
      result = isWindows()
        ? await mutate('arp', ['-s', address, native], signal)
        : await mutate('ip', ['neigh', 'replace', address, 'lladdr', native, 'nud', 'permanent'], signal)
      if (result.ok) emit({ t: 'log', d: t('已添加 ${address} → ${mac}', { address, mac: native }) })
    } else {
      result = isWindows()
        ? await mutate('arp', ['-d', address], signal)
        : await mutate('ip', ['neigh', 'del', address], signal)
      if (result.ok) emit({ t: 'log', d: t('已删除 ${address} 的条目', { address }) })
    }
    if (!result.ok) {
      emit({ t: 'error', d: t('操作失败（${code}）: ${output}', { code: result.code, output: result.output || t('（无输出）') }) })
      emit({ t: 'notice', d: permissionHint() })
      return
    }
  }

  if (action === 'flush') {
    const command = isWindows() ? 'netsh' : 'ip'
    const args = isWindows()
      ? ['interface', 'ip', 'delete', 'arpcache']
      : ['neigh', 'flush', 'all']
    let result = await mutate(command, args, signal)
    if (!result.ok && isWindows()) {
      /* Older builds: `arp -d *` clears every entry of every interface. */
      result = await mutate('arp', ['-d', '*'], signal)
    }
    if (!result.ok) {
      emit({ t: 'error', d: t('清空失败（${code}）: ${output}', { code: result.code, output: result.output || t('（无输出）') }) })
      emit({ t: 'notice', d: permissionHint() })
      return
    }
    emit({ t: 'log', d: t('已清空 ARP 缓存') })
  }

  const entries = await readArp(signal)
  if (!entries.length) {
    emit({ t: 'notice', d: t('ARP 缓存是空的（没有最近通信过的邻居）') })
    emit({ t: 'done', d: { count: 0 } })
    return
  }
  const rows = arpRows(entries)
  emit({ t: 'rows', d: rows })
  const staticCount = rows.filter((row) => /static|永久|permanent/i.test(String(row.type))).length
  emit({
    t: 'stats',
    d: { [t('条目')]: rows.length, [t('静态')]: staticCount, [t('动态')]: rows.length - staticCount },
  })
  emit({ t: 'done', d: { count: rows.length, action } })
}
