/**
 * Datacom operations: batch configuration collection, archived backups, config
 * diff, SNMP v2c identification and the VRP/IOS command reference.
 *
 * The SNMP client is a minimal BER encoder/decoder for GET requests, which is
 * all a device inventory needs and avoids a dependency on net-snmp.
 */
import dgram from 'node:dgram'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { CHEATSHEET } from './data.js'
import { t } from './i18n.js'
import { runOnDevices, splitCommands } from './cli.js'
import { isAbortError, pool, runProcess } from './util.js'

/* ------------------------------------------------------------------ */
/* Backup storage                                                      */
/* ------------------------------------------------------------------ */

export function backupRoot() {
  return path.join(os.homedir(), '.dsh-nwtool', 'backups')
}

async function ensureBackupDir() {
  const dir = backupRoot()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function indexFile() {
  return path.join(backupRoot(), 'index.json')
}

async function readIndex() {
  try {
    const text = await fs.readFile(indexFile(), 'utf8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeIndex(entries) {
  await ensureBackupDir()
  await fs.writeFile(indexFile(), JSON.stringify(entries, null, 2), 'utf8')
}

function sanitizeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64) || 'device'
}

function stamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export async function saveBackup({ host, label, vendor, commands, content }) {
  await ensureBackupDir()
  const id = `${sanitizeName(label || host)}_${stamp()}.txt`
  const deviceLabel = label || host
  const collectedAt = new Date().toLocaleString('zh-CN')
  const commandText = commands.join(' ; ')
  const header = [
    t('# 设备: ${deviceLabel}', { deviceLabel }),
    t('# 地址: ${host}', { host }),
    ...(vendor ? [t('# 厂商: ${vendor}', { vendor })] : []),
    t('# 采集时间: ${collectedAt}', { collectedAt }),
    t('# 命令: ${commandText}', { commandText }),
    '',
  ].join('\n')
  const body = `${header}${content}`
  await fs.writeFile(path.join(backupRoot(), id), body, 'utf8')
  const entries = await readIndex()
  const meta = {
    id,
    label: label || host,
    host,
    vendor: vendor ?? '',
    savedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(body, 'utf8'),
    lines: body.split('\n').length,
    commands,
  }
  entries.unshift(meta)
  await writeIndex(entries.slice(0, 500))
  return meta
}

export async function listBackups() {
  const entries = await readIndex()
  const dir = backupRoot()
  let files = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return []
  }
  const available = new Set(files)
  return entries.filter((entry) => available.has(entry.id))
}

export async function readBackup(id) {
  const safe = path.basename(String(id))
  const file = path.join(backupRoot(), safe)
  return fs.readFile(file, 'utf8')
}

export async function deleteBackup(id) {
  const safe = path.basename(String(id))
  await fs.rm(path.join(backupRoot(), safe), { force: true })
  const entries = await readIndex()
  await writeIndex(entries.filter((entry) => entry.id !== safe))
}

export async function searchBackups({ id, text, pattern, context = 2 }) {
  let content = text
  if (content === undefined) {
    if (!id) throw new Error(t('需要指定备份文件或直接提供内容'))
    content = await readBackup(id)
  }
  const needle = String(pattern ?? '')
  if (!needle) throw new Error(t('需要搜索关键词'))
  const lines = String(content).split(/\r?\n/)
  const matches = []
  const regex = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  for (let i = 0; i < lines.length; i += 1) {
    if (!regex.test(lines[i])) continue
    const from = Math.max(0, i - context)
    const to = Math.min(lines.length - 1, i + context)
    matches.push({
      line: i + 1,
      text: lines[i],
      around: lines.slice(from, to + 1).join('\n'),
    })
    if (matches.length >= 200) break
  }
  return matches
}

/* ------------------------------------------------------------------ */
/* Config diff                                                         */
/* ------------------------------------------------------------------ */

function lcsOperations(left, right) {
  const n = left.length
  const m = right.length
  if (n === 0 && m === 0) return []
  if (n === 0) return right.map((line) => ({ type: 'add', right: line }))
  if (m === 0) return left.map((line) => ({ type: 'del', left: line }))

  // Guard the quadratic table: a huge config falls back to a prefix/suffix and
  // set comparison instead of allocating hundreds of MB.
  if (n * m > 4_000_000) {
    const ops = []
    const rightSet = new Set(right)
    const leftSet = new Set(left)
    for (const line of left) ops.push(rightSet.has(line) ? { type: 'same', left: line, right: line } : { type: 'del', left: line })
    for (const line of right) if (!leftSet.has(line)) ops.push({ type: 'add', right: line })
    return ops
  }

  const width = m + 1
  const table = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = left[i] === right[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      ops.push({ type: 'same', left: left[i], right: right[j] })
      i += 1
      j += 1
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: 'del', left: left[i] })
      i += 1
    } else {
      ops.push({ type: 'add', right: right[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'del', left: left[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'add', right: right[j] })
    j += 1
  }
  return ops
}

/** Side-by-side aligned diff rows. Adjacent delete/add pairs become `change`. */
export function diffText(leftText, rightText) {
  const left = String(leftText ?? '').split(/\r?\n/)
  const right = String(rightText ?? '').split(/\r?\n/)

  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1

  const leftMiddle = left.slice(prefix, left.length - suffix)
  const rightMiddle = right.slice(prefix, right.length - suffix)
  const middleOps = lcsOperations(leftMiddle, rightMiddle)

  const ops = [
    ...left.slice(0, prefix).map((line) => ({ type: 'same', left: line, right: line })),
    ...middleOps,
    ...left.slice(left.length - suffix).map((line) => ({ type: 'same', left: line, right: line })),
  ]

  // Pair each run of non-identical lines: removals fill the left column and
  // additions the right one, so a rewritten line reads as one `change` row.
  const paired = []
  let index = 0
  while (index < ops.length) {
    if (ops[index].type === 'same') {
      paired.push({ type: 'same', left: ops[index].left ?? null, right: ops[index].right ?? null })
      index += 1
      continue
    }
    const deletions = []
    const additions = []
    while (index < ops.length && ops[index].type !== 'same') {
      if (ops[index].type === 'del') deletions.push(ops[index].left)
      else additions.push(ops[index].right)
      index += 1
    }
    const count = Math.max(deletions.length, additions.length)
    for (let k = 0; k < count; k += 1) {
      const hasLeft = k < deletions.length
      const hasRight = k < additions.length
      paired.push({
        type: hasLeft && hasRight ? 'change' : hasLeft ? 'del' : 'add',
        left: hasLeft ? deletions[k] : null,
        right: hasRight ? additions[k] : null,
      })
    }
  }

  let leftLine = 1
  let rightLine = 1
  const rows = paired.map((row) => {
    const entry = {
      type: row.type,
      left: row.left ?? '',
      right: row.right ?? '',
      lnLeft: row.left === null ? '' : String(leftLine),
      lnRight: row.right === null ? '' : String(rightLine),
    }
    if (row.left !== null) leftLine += 1
    if (row.right !== null) rightLine += 1
    return entry
  })

  const stats = {
    added: rows.filter((row) => row.type === 'add').length,
    removed: rows.filter((row) => row.type === 'del').length,
    changed: rows.filter((row) => row.type === 'change').length,
    same: rows.filter((row) => row.type === 'same').length,
  }
  return { rows, stats }
}

export async function configDiff(params, emit) {
  let left = params.leftText
  let right = params.rightText
  if ((left === undefined || left === '') && params.leftId) left = await readBackup(params.leftId)
  if ((right === undefined || right === '') && params.rightId) right = await readBackup(params.rightId)
  if (left === undefined || right === undefined) throw new Error(t('需要两份配置内容或两个备份文件'))

  const result = diffText(left, right)
  const changed = result.rows.filter((row) => row.type !== 'same')
  emit({ t: 'diff', d: {
    rows: result.rows,
    leftTitle: params.leftTitle ?? t('左侧配置'),
    rightTitle: params.rightTitle ?? t('右侧配置'),
  } })
  emit({ t: 'stats', d: {
    [t('新增')]: result.stats.added,
    [t('删除')]: result.stats.removed,
    [t('修改')]: result.stats.changed,
    [t('相同行')]: result.stats.same,
    [t('差异行')]: changed.length,
  } })
  emit({ t: 'done', d: result.stats })
}

/* ------------------------------------------------------------------ */
/* SNMP v2c                                                            */
/* ------------------------------------------------------------------ */

function encodeLength(length) {
  if (length < 0x80) return Buffer.from([length])
  const bytes = []
  let value = length
  while (value > 0) {
    bytes.unshift(value & 0xff)
    value = Math.floor(value / 256)
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function tlv(tag, content) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content])
}

function encodeInteger(value) {
  const bytes = []
  let v = Math.floor(Number(value))
  if (v === 0) bytes.push(0)
  while (v > 0) {
    bytes.unshift(v & 0xff)
    v = Math.floor(v / 256)
  }
  if (bytes.length === 0) bytes.push(0)
  if (bytes[0] & 0x80) bytes.unshift(0)
  return tlv(0x02, Buffer.from(bytes))
}

function encodeOid(oid) {
  const arcs = String(oid).split('.').map(Number)
  if (arcs.length < 2 || arcs.some((arc) => !Number.isInteger(arc))) throw new Error(t('无效 OID: ${oid}', { oid }))
  const parts = [40 * arcs[0] + arcs[1]]
  for (let index = 2; index < arcs.length; index += 1) {
    let value = arcs[index]
    const stack = []
    do {
      stack.unshift(value & 0x7f)
      value = Math.floor(value / 128)
    } while (value > 0)
    for (let i = 0; i < stack.length - 1; i += 1) stack[i] |= 0x80
    parts.push(...stack)
  }
  return tlv(0x06, Buffer.from(parts))
}

function decodeOid(buffer, start, end) {
  if (start >= end) return ''
  const first = buffer[start]
  const arcs = [Math.floor(first / 40), first % 40]
  let value = 0
  for (let index = start + 1; index < end; index += 1) {
    const byte = buffer[index]
    value = value * 128 + (byte & 0x7f)
    if (!(byte & 0x80)) {
      arcs.push(value)
      value = 0
    }
  }
  return arcs.join('.')
}

function readTlv(buffer, offset) {
  const tag = buffer[offset]
  let length = buffer[offset + 1]
  let cursor = offset + 2
  if (length & 0x80) {
    const count = length & 0x7f
    length = 0
    for (let i = 0; i < count; i += 1) {
      length = length * 256 + buffer[cursor]
      cursor += 1
    }
  }
  return { tag, length, start: cursor, end: cursor + length }
}

function decodeUnsigned(buffer, start, end) {
  let value = 0
  for (let i = start; i < end; i += 1) value = value * 256 + buffer[i]
  return value
}

function decodeValue(buffer, tlvValue) {
  const { tag, start, end } = tlvValue
  switch (tag) {
    case 0x02: {
      const unsigned = decodeUnsigned(buffer, start, end)
      const bits = (end - start) * 8
      return unsigned >= 2 ** (bits - 1) ? unsigned - 2 ** bits : unsigned
    }
    case 0x04:
      return buffer.toString('utf8', start, end).replace(/\u0000+$/, '')
    case 0x05:
      return null
    case 0x06:
      return decodeOid(buffer, start, end)
    case 0x40:
      return [buffer[start], buffer[start + 1], buffer[start + 2], buffer[start + 3]].join('.')
    case 0x41:
    case 0x42:
    case 0x43:
    case 0x45:
      return decodeUnsigned(buffer, start, end)
    case 0x80:
      return 'noSuchObject'
    case 0x81:
      return 'noSuchInstance'
    case 0x82:
      return 'endOfMibView'
    default:
      return buffer.toString('hex', start, end)
  }
}

function buildSnmpGet(community, oids, requestId) {
  const varbinds = Buffer.concat(oids.map((oid) => tlv(0x30, Buffer.concat([
    encodeOid(oid),
    tlv(0x05, Buffer.alloc(0)),
  ]))))
  const pdu = tlv(0xa0, Buffer.concat([
    encodeInteger(requestId),
    encodeInteger(0),
    encodeInteger(0),
    tlv(0x30, varbinds),
  ]))
  return tlv(0x30, Buffer.concat([
    encodeInteger(1), // SNMPv2c
    tlv(0x04, Buffer.from(community, 'utf8')),
    pdu,
  ]))
}

export function snmpGet({ host, community = 'public', oids, port = 161, timeoutMs = 3000, retries = 1 }) {
  const requestId = Math.floor(Math.random() * 0x7fffffff)
  const message = buildSnmpGet(community, oids, requestId)

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    let settled = false
    let attempts = 0
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setInterval(() => {
      attempts += 1
      if (attempts > retries) {
        finish(new Error(t('${host} 未响应 SNMP 请求（community=${community}）', { host, community })))
        return
      }
      socket.send(message, port, host, (error) => {
        if (error) finish(error)
      })
    }, Math.max(300, timeoutMs))

    socket.once('error', (error) => finish(error))
    socket.on('message', (buffer) => {
      try {
        const outer = readTlv(buffer, 0)
        let cursor = outer.start
        const version = readTlv(buffer, cursor)
        cursor = version.end
        const communityTlv = readTlv(buffer, cursor)
        cursor = communityTlv.end
        const pdu = readTlv(buffer, cursor)
        cursor = pdu.start
        cursor = readTlv(buffer, cursor).end // request-id
        const errorStatus = readTlv(buffer, cursor)
        cursor = errorStatus.end
        cursor = readTlv(buffer, cursor).end // error-index
        const varbindList = readTlv(buffer, cursor)
        const values = []
        let offset = varbindList.start
        while (offset < varbindList.end) {
          const varbind = readTlv(buffer, offset)
          let inner = varbind.start
          const oidTlv = readTlv(buffer, inner)
          inner = oidTlv.end
          const valueTlv = readTlv(buffer, inner)
          values.push({
            oid: decodeOid(buffer, oidTlv.start, oidTlv.end),
            value: decodeValue(buffer, valueTlv),
            type: valueTlv.tag,
          })
          offset = varbind.end
        }
        const status = decodeUnsigned(buffer, errorStatus.start, errorStatus.end)
        if (status !== 0) {
          finish(new Error(t('设备返回 SNMP 错误码 ${status}', { status })))
          return
        }
        finish(null, values)
      } catch (error) {
        const problem = error?.message ?? error
        finish(new Error(t('SNMP 响应解析失败: ${problem}', { problem })))
      }
    })
    socket.send(message, port, host, (error) => {
      if (error) finish(error)
    })
  })
}

const SYSTEM_OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  sysServices: '1.3.6.1.2.1.1.7.0',
}

function formatUptime(centiseconds) {
  if (typeof centiseconds !== 'number') return '-'
  const totalSeconds = Math.floor(centiseconds / 100)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return t('${days}天 ${hours}时 ${minutes}分 ${seconds}秒', { days, hours, minutes, seconds })
}

function guessVendor(descr, objectId) {
  const text = `${descr ?? ''} ${objectId ?? ''}`.toLowerCase()
  if (/huawei|versatile routing|vrp/.test(text)) return 'Huawei'
  if (/h3c|comware/.test(text)) return 'H3C'
  if (/ruijie|rgos/.test(text)) return 'Ruijie'
  if (/cisco|ios|nx-os|adaptive security/.test(text)) return 'Cisco'
  if (/juniper|junos/.test(text)) return 'Juniper'
  if (/mikrotik|routeros/.test(text)) return 'MikroTik'
  if (/fortinet|fortigate/.test(text)) return 'Fortinet'
  if (/h3c|hp comware/.test(text)) return 'H3C'
  if (/zte|zxros/.test(text)) return 'ZTE'
  if (/fiberhome/.test(text)) return 'FiberHome'
  return t('未知')
}

export async function snmpIdentify(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写设备地址'))
  const community = String(params.community ?? 'public')
  const port = Number(params.port) || 161
  const timeoutMs = Number(params.timeout) || 3000

  emit({ t: 'log', d: `SNMP v2c GET ${host}:${port}（community=${community}）` })
  let values
  try {
    values = await snmpGet({
      host,
      community,
      port,
      timeoutMs,
      oids: Object.values(SYSTEM_OIDS),
    })
  } catch (error) {
    emit({ t: 'notice', d: t('请确认：设备已启用 SNMP v2c、community 正确（默认 public）、UDP 161 未被 ACL 或防火墙拦截、管理口路由可达。') })
    throw error
  }
  const byOid = new Map(values.map((item) => [item.oid, item.value]))
  const descr = byOid.get(SYSTEM_OIDS.sysDescr)
  const objectId = byOid.get(SYSTEM_OIDS.sysObjectID)
  const uptime = byOid.get(SYSTEM_OIDS.sysUpTime)
  const vendor = guessVendor(descr, objectId)

  emit({ t: 'kv', d: [
    { k: t('地址'), v: host },
    { k: t('厂商推断'), v: vendor },
    { k: 'sysName', v: String(byOid.get(SYSTEM_OIDS.sysName) ?? '-') },
    { k: 'sysDescr', v: String(descr ?? '-') },
    { k: 'sysObjectID', v: String(objectId ?? '-') },
    { k: t('运行时长'), v: formatUptime(uptime) },
    { k: 'sysContact', v: String(byOid.get(SYSTEM_OIDS.sysContact) ?? '-') },
    { k: 'sysLocation', v: String(byOid.get(SYSTEM_OIDS.sysLocation) ?? '-') },
    { k: 'sysServices', v: String(byOid.get(SYSTEM_OIDS.sysServices) ?? '-') },
  ] })
  emit({ t: 'done', d: { vendor, sysName: byOid.get(SYSTEM_OIDS.sysName) ?? null } })
}

/** Identify a list of addresses, used by the LAN scanner follow-up and agents. */
export async function snmpIdentifyMany(params, emit, signal) {
  const hosts = Array.isArray(params.hosts) ? params.hosts.map(String) : String(params.hosts ?? '').split(/[\s,]+/).filter(Boolean)
  if (!hosts.length) throw new Error(t('请提供至少一个地址'))
  const community = String(params.community ?? 'public')
  await pool(hosts, 8, async (host) => {
    if (signal?.aborted) return
    try {
      const values = await snmpGet({ host, community, oids: [SYSTEM_OIDS.sysDescr, SYSTEM_OIDS.sysName], timeoutMs: Number(params.timeout) || 1500 })
      const byOid = new Map(values.map((item) => [item.oid, item.value]))
      const descr = String(byOid.get(SYSTEM_OIDS.sysDescr) ?? '')
      emit({
        t: 'rows',
        d: [{
          host,
          name: String(byOid.get(SYSTEM_OIDS.sysName) ?? '-'),
          vendor: guessVendor(descr, ''),
          descr: descr.slice(0, 120),
        }],
      })
    } catch (error) {
      if (isAbortError(error)) return
      const problem = error?.message ?? error
      emit({ t: 'rows', d: [{ host, name: '-', vendor: '-', descr: t('无响应 (${problem})', { problem }) }] })
    }
  }, signal)
  emit({ t: 'done', d: { count: hosts.length } })
}

/* ------------------------------------------------------------------ */
/* Device batch execution                                              */
/* ------------------------------------------------------------------ */

/**
 * Parse a device list where each line is
 *   host[:port] [ssh|telnet] [user] [password]
 * Shared defaults from the form fill in omitted fields.
 */
export function parseDeviceLines(text, defaults = {}) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  const devices = []
  for (const line of lines) {
    const tokens = line.split(/\s+/)
    let hostPart = tokens.shift()
    let protocol = defaults.protocol ?? 'telnet'
    let username = defaults.username ?? ''
    let password = defaults.password ?? ''
    const hostMatch = /^([^:]+)(?::(\d+))?$/.exec(hostPart)
    const host = hostMatch ? hostMatch[1] : hostPart
    let port = hostMatch?.[2] ? Number(hostMatch[2]) : null
    for (const token of tokens) {
      if (/^(ssh|telnet)$/i.test(token)) {
        protocol = token.toLowerCase()
        continue
      }
      if (username === (defaults.username ?? '')) {
        username = token
        continue
      }
      password = token
    }
    if (!port) port = protocol === 'ssh' ? 22 : 23
    devices.push({
      name: host,
      host,
      port,
      protocol,
      username,
      password,
      vendor: defaults.vendor ?? '',
      enablePassword: defaults.enablePassword ?? '',
    })
  }
  return devices
}

function looksLikeConfig(output) {
  return /current-configuration|running-config|Running configuration|sysname|hostname|interface \S+/i.test(output)
}

export async function deviceExec(params, emit, signal) {
  const defaults = {
    protocol: params.protocol ?? 'telnet',
    username: params.username ?? '',
    password: params.password ?? '',
    vendor: params.vendor ?? '',
    enablePassword: params.enablePassword ?? '',
  }
  const devices = Array.isArray(params.devices) && params.devices.length
    ? params.devices.map((device) => ({
      name: device.name ?? device.host,
      host: device.host,
      port: Number(device.port) || (device.protocol === 'ssh' ? 22 : 23),
      protocol: device.protocol ?? defaults.protocol,
      username: device.username ?? defaults.username,
      password: device.password ?? defaults.password,
      vendor: device.vendor ?? defaults.vendor,
      enablePassword: device.enablePassword ?? defaults.enablePassword,
      timeout: device.timeout,
      commandTimeout: device.commandTimeout,
    }))
    : parseDeviceLines(params.deviceText, defaults)

  if (!devices.length) throw new Error(t('请至少填写一台设备'))
  const commands = splitCommands(params.commands)
  if (!commands.length) throw new Error(t('请填写要执行的命令'))
  const concurrency = Math.min(Math.max(Number(params.concurrency) || 2, 1), 8)
  const save = params.save !== false

  const deviceCount = devices.length
  const commandCount = commands.length
  emit({ t: 'log', d: t('共 ${deviceCount} 台设备 · ${commandCount} 条命令 · 并发 ${concurrency}', { deviceCount, commandCount, concurrency }) })

  await runOnDevices(devices, commands, {
    concurrency,
    signal,
    onLog: (line) => emit({ t: 'log', d: line }),
    onDevice: () => {},
  }).then(async (results) => {
    for (const result of results) {
      const deviceName = result.device
      const errorText = result.error
      const ok = !errorText
      emit({
        t: 'rows',
        d: [{
          device: deviceName,
          address: `${result.host}:${result.port}`,
          protocol: result.protocol,
          lines: ok ? String(result.output.split('\n').length) : '-',
          status: ok ? t('成功') : t('失败: ${errorText}', { errorText }),
        }],
      })
      if (!ok) continue
      if (save) {
        try {
          const meta = await saveBackup({
            host: result.host,
            label: deviceName,
            vendor: params.vendor ?? '',
            commands,
            content: result.output,
          })
          emit({ t: 'log', d: t('[${deviceName}] 已备份 → ${id}', { deviceName, id: meta.id }) })
        } catch (error) {
          const problem = error?.message ?? error
          emit({ t: 'notice', d: t('[${deviceName}] 备份保存失败: ${problem}', { deviceName, problem }) })
        }
      }
      const title = `${deviceName} (${result.host})`
      emit({ t: 'sections', d: [{ title, body: result.output || t('（无输出）') }] })
      if (looksLikeConfig(result.output)) emit({ t: 'log', d: t('[${deviceName}] 输出看起来包含设备配置', { deviceName }) })
    }
    const failed = results.filter((result) => result.error).length
    emit({ t: 'stats', d: { [t('设备')]: results.length, [t('成功')]: results.length - failed, [t('失败')]: failed } })
    emit({ t: 'done', d: { total: results.length, failed } })
  })
}

/* ------------------------------------------------------------------ */
/* Command reference                                                   */
/* ------------------------------------------------------------------ */

export function searchCheatsheet(query, category) {
  const text = String(query ?? '').trim().toLowerCase()
  return CHEATSHEET.filter((row) => {
    if (category && category !== '全部' && row.cat !== category) return false
    if (!text) return true
    return `${row.cat} ${row.purpose} ${row.vrp} ${row.ios}`.toLowerCase().includes(text)
  })
}

export async function iperfServerCheck() {
  const version = await runProcess('iperf3', ['--version'], { timeoutMs: 5000, encoding: 'buffer' })
  return !version.spawnError
}
