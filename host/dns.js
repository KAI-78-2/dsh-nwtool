/**
 * DNS engines: raw UDP queries (dig-style), system resolver lookups, a public
 * resolver benchmark and domain registration (WHOIS/RDAP) lookups.
 *
 * The raw query path exists because the Node resolver cannot show a record's
 * TTL, response flags or the authority section, and cannot disable recursion.
 */
import dgram from 'node:dgram'
import dns from 'node:dns'
import net from 'node:net'

import { PUBLIC_DNS } from './data.js'
import { t } from './i18n.js'
import { systemDnsServers } from './net.js'
import { isAbortError, isIPv4, isIPv6, pool, round } from './util.js'

const TYPE_CODES = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, HINFO: 13, MX: 15, TXT: 16, RP: 17, AFSDB: 18,
  SIG: 24, KEY: 25, AAAA: 28, LOC: 29, SRV: 33, NAPTR: 35, KX: 36, CERT: 37, DNAME: 39,
  OPT: 41, DS: 43, SSHFP: 44, IPSECKEY: 45, RRSIG: 46, NSEC: 47, DNSKEY: 48, DHCID: 49,
  NSEC3: 50, NSEC3PARAM: 51, TLSA: 52, SMIMEA: 53, HIP: 55, CDS: 59, CDNSKEY: 60, OPENPGPKEY: 61,
  CSYNC: 62, ZONEMD: 63, SVCB: 64, HTTPS: 65, SPF: 99, EUI48: 108, EUI64: 109, TKEY: 249,
  TSIG: 250, IXFR: 251, AXFR: 252, MAILB: 253, MAILA: 254, ANY: 255, URI: 256, CAA: 257,
}

const CODE_TYPES = Object.fromEntries(Object.entries(TYPE_CODES).map(([name, code]) => [code, name]))

const RCODE_TEXT = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
  6: 'YXDOMAIN',
  7: 'YXRRSET',
  8: 'NXRRSET',
  9: 'NOTAUTH',
  10: 'NOTZONE',
}

/* ------------------------------------------------------------------ */
/* Wire format                                                         */
/* ------------------------------------------------------------------ */

function encodeName(name) {
  const trimmed = String(name).trim().replace(/\.$/, '')
  if (!trimmed) return Buffer.from([0])
  const parts = trimmed.split('.')
  const chunks = []
  for (const part of parts) {
    const label = Buffer.from(part, 'utf8')
    if (label.length === 0 || label.length > 63) throw new Error(t('无效域名标签: ${part}', { part }))
    chunks.push(Buffer.from([label.length]), label)
  }
  chunks.push(Buffer.from([0]))
  return Buffer.concat(chunks)
}

function buildQuery(name, typeCode, recursionDesired, requestId, edns = true) {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(requestId, 0)
  header.writeUInt16BE(recursionDesired ? 0x0100 : 0x0000, 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(0, 6)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(edns ? 1 : 0, 10)
  const question = Buffer.alloc(4)
  question.writeUInt16BE(typeCode, 0)
  question.writeUInt16BE(1, 2)
  const parts = [header, encodeName(name), question]
  if (edns) {
    const opt = Buffer.alloc(11)
    opt.writeUInt8(0, 0)
    opt.writeUInt16BE(41, 1)
    opt.writeUInt16BE(4096, 3)
    opt.writeUInt32BE(0, 5)
    opt.writeUInt16BE(0, 9)
    parts.push(opt)
  }
  return Buffer.concat(parts)
}

function readName(buffer, offset) {
  const labels = []
  let cursor = offset
  let jumped = false
  let safety = 0
  let nextOffset = offset
  while (safety < 128) {
    safety += 1
    if (cursor >= buffer.length) break
    const length = buffer[cursor]
    if (length === 0) {
      cursor += 1
      if (!jumped) nextOffset = cursor
      break
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= buffer.length) break
      const pointer = ((length & 0x3f) << 8) | buffer[cursor + 1]
      if (!jumped) nextOffset = cursor + 2
      jumped = true
      cursor = pointer
      continue
    }
    if (cursor + 1 + length > buffer.length) break
    labels.push(buffer.toString('utf8', cursor + 1, cursor + 1 + length))
    cursor += 1 + length
    if (!jumped) nextOffset = cursor
  }
  return { name: labels.join('.'), offset: nextOffset }
}

function formatIPv6(buffer) {
  const groups = []
  for (let i = 0; i < 16; i += 2) groups.push(buffer.readUInt16BE(i).toString(16))
  let bestStart = -1
  let bestLength = 0
  let currentStart = -1
  let currentLength = 0
  for (let i = 0; i < 8; i += 1) {
    if (groups[i] === '0') {
      if (currentStart < 0) currentStart = i
      currentLength += 1
      if (currentLength > bestLength) {
        bestLength = currentLength
        bestStart = currentStart
      }
    } else {
      currentStart = -1
      currentLength = 0
    }
  }
  if (bestLength < 2) return groups.join(':')
  const before = groups.slice(0, bestStart).join(':')
  const after = groups.slice(bestStart + bestLength).join(':')
  return `${before}::${after}`
}

function readRecordData(buffer, type, start, length) {
  const end = start + length
  switch (type) {
    case 1:
      if (length !== 4) return buffer.toString('hex', start, end)
      return `${buffer[start]}.${buffer[start + 1]}.${buffer[start + 2]}.${buffer[start + 3]}`
    case 28:
      if (length !== 16) return buffer.toString('hex', start, end)
      return formatIPv6(buffer.subarray(start, end))
    case 2:
    case 5:
    case 12:
    case 39:
      return readName(buffer, start).name
    case 15: {
      const preference = buffer.readUInt16BE(start)
      return `${preference} ${readName(buffer, start + 2).name}`
    }
    case 16: {
      const parts = []
      let cursor = start
      while (cursor < end) {
        const size = buffer[cursor]
        cursor += 1
        parts.push(buffer.toString('utf8', cursor, Math.min(cursor + size, end)))
        cursor += size
      }
      return `"${parts.join('')}"`
    }
    case 6: {
      const mname = readName(buffer, start)
      const rname = readName(buffer, mname.offset)
      let cursor = rname.offset
      const values = []
      for (let i = 0; i < 5 && cursor + 4 <= end; i += 1) {
        values.push(buffer.readUInt32BE(cursor))
        cursor += 4
      }
      return `${mname.name} ${rname.name} ${values.join(' ')}`
    }
    case 33: {
      const priority = buffer.readUInt16BE(start)
      const weight = buffer.readUInt16BE(start + 2)
      const port = buffer.readUInt16BE(start + 4)
      return `${priority} ${weight} ${port} ${readName(buffer, start + 6).name}`
    }
    case 257: {
      const flags = buffer[start]
      const tagLength = buffer[start + 1]
      const tag = buffer.toString('utf8', start + 2, start + 2 + tagLength)
      const value = buffer.toString('utf8', start + 2 + tagLength, end)
      return `${flags} ${tag} "${value}"`
    }
    case 43:
      return buffer.toString('hex', start, end)
    default:
      return buffer.toString('hex', start, end)
  }
}

function parseMessage(buffer, requestId) {
  if (buffer.length < 12) throw new Error(t('响应过短'))
  const id = buffer.readUInt16BE(0)
  if (id !== requestId) throw new Error(t('事务 ID 不匹配'))
  const flags = buffer.readUInt16BE(2)
  const questionCount = buffer.readUInt16BE(4)
  const answerCount = buffer.readUInt16BE(6)
  const authorityCount = buffer.readUInt16BE(8)
  const additionalCount = buffer.readUInt16BE(10)

  let offset = 12
  const questions = []
  for (let i = 0; i < questionCount; i += 1) {
    const { name, offset: next } = readName(buffer, offset)
    offset = next
    const type = buffer.readUInt16BE(offset)
    const klass = buffer.readUInt16BE(offset + 2)
    offset += 4
    questions.push({ name, type: CODE_TYPES[type] ?? String(type), class: klass })
  }

  const readSection = (count) => {
    const records = []
    for (let i = 0; i < count; i += 1) {
      if (offset + 10 > buffer.length) break
      const { name, offset: next } = readName(buffer, offset)
      offset = next
      const type = buffer.readUInt16BE(offset)
      const klass = buffer.readUInt16BE(offset + 2)
      const ttl = buffer.readUInt32BE(offset + 4)
      const dataLength = buffer.readUInt16BE(offset + 8)
      offset += 10
      const dataStart = offset
      offset += dataLength
      if (type === 41) {
        records.push({ name, type: 'OPT', ttl: 0, value: `udp-size ${klass}`, class: klass })
        continue
      }
      records.push({
        name,
        type: CODE_TYPES[type] ?? String(type),
        class: klass,
        ttl,
        value: readRecordData(buffer, type, dataStart, dataLength),
      })
    }
    return records
  }

  const answers = readSection(answerCount)
  const authority = readSection(authorityCount)
  const additional = readSection(additionalCount)

  return {
    id,
    flags: {
      qr: Boolean(flags & 0x8000),
      aa: Boolean(flags & 0x0400),
      tc: Boolean(flags & 0x0200),
      rd: Boolean(flags & 0x0100),
      ra: Boolean(flags & 0x0080),
    },
    rcode: flags & 0x000f,
    rcodeText: RCODE_TEXT[flags & 0x000f] ?? String(flags & 0x000f),
    questions,
    answers,
    authority,
    additional,
  }
}

/* ------------------------------------------------------------------ */
/* Raw UDP query                                                       */
/* ------------------------------------------------------------------ */

export function rawDnsQuery(options = {}) {
  const {
    name,
    type = 'A',
    server,
    port = 53,
    timeoutMs = 3000,
    recursion = true,
    signal,
  } = options
  const typeCode = TYPE_CODES[String(type).toUpperCase()]
  if (!typeCode) throw new Error(t('不支持的记录类型: ${type}', { type }))
  const requestId = Math.floor(Math.random() * 65535)

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(isIPv6(server) ? 'udp6' : 'udp4')
    const started = Date.now()
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => finish(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const timer = setTimeout(() => finish(new Error(t('查询超时'))), Math.max(200, timeoutMs))
    signal?.addEventListener?.('abort', onAbort, { once: true })

    socket.once('error', (error) => finish(error))
    socket.on('message', (message) => {
      try {
        const parsed = parseMessage(message, requestId)
        finish(null, { ...parsed, ms: Date.now() - started, server, queryTime: new Date().toISOString() })
      } catch (error) {
        finish(error)
      }
    })

    let query
    try {
      query = buildQuery(name, typeCode, recursion, requestId)
    } catch (error) {
      finish(error)
      return
    }
    socket.send(query, port, server, (error) => {
      if (error) finish(error)
    })
  })
}

/* ------------------------------------------------------------------ */
/* System resolver                                                     */
/* ------------------------------------------------------------------ */

export async function systemResolverAddress() {
  const picked = await pickServer()
  return picked.server
}

export async function dnsResolve(params, emit) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写域名'))
  const types = Array.isArray(params.types) && params.types.length ? params.types : ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
  const picked = await pickServer(host)
  const server = picked.server
  const typeList = types.join(' / ')
  emit({ t: 'log', d: t('解析 ${host} · ${types}（DNS ${server}）', { host, types: typeList, server }) })
  let found = 0
  for (const type of types) {
    const kind = String(type).toUpperCase()
    if (!TYPE_CODES[kind]) {
      emit({ t: 'rows', d: [{ type: kind, ttl: '-', value: t('不支持的记录类型'), extra: '-' }] })
      continue
    }
    try {
      const response = await rawDnsQuery({ name: host, type: kind, server: picked.server, timeoutMs: 4000 })
      if (response.rcode !== 0) {
        emit({ t: 'rows', d: [{ type: kind, ttl: '-', value: `${response.rcodeText}（${picked.server}）`, extra: '-' }] })
        continue
      }
      if (!response.answers.length) {
        emit({ t: 'rows', d: [{ type: kind, ttl: '-', value: t('无记录'), extra: '-' }] })
        continue
      }
      for (const record of response.answers) {
        found += 1
        emit({
          t: 'rows',
          d: [{ type: record.type, ttl: record.ttl, value: record.value, extra: record.name }],
        })
      }
    } catch (error) {
      const reason = error?.message ?? error
      emit({ t: 'rows', d: [{ type: kind, ttl: '-', value: t('查询失败: ${reason}', { reason }), extra: '-' }] })
    }
  }
  if (!found) emit({ t: 'notice', d: t('没有查询到任何记录') })
  emit({ t: 'done', d: { found } })
}

/* ------------------------------------------------------------------ */
/* Resolver selection                                                  */
/* ------------------------------------------------------------------ */

let resolverCache = null

/**
 * Find a resolver that actually answers. Node's `dns.getServers()` can report a
 * loopback shim that refuses every query, so the adapter list is probed in
 * order with a raw UDP query and the first responder is cached briefly.
 */
export async function pickServer(probeHost = 'www.baidu.com') {
  if (resolverCache && Date.now() - resolverCache.at < 60000) return resolverCache
  const servers = await systemDnsServers()
  const failures = []
  for (const server of servers) {
    try {
      const response = await rawDnsQuery({ name: probeHost, type: 'A', server, timeoutMs: 1500 })
      if (response.rcode === 0 || response.rcode === 3) {
        resolverCache = { server, at: Date.now(), failures }
        return resolverCache
      }
      failures.push(`${server}: ${response.rcodeText}`)
    } catch (error) {
      failures.push(`${server}: ${String(error?.message ?? error)}`)
    }
  }
  resolverCache = { server: '223.5.5.5', at: Date.now(), failures }
  resolverCache.failures.push(t('回退到公共 DNS 223.5.5.5'))
  return resolverCache
}

/* ------------------------------------------------------------------ */
/* dig                                                                 */
/* ------------------------------------------------------------------ */

export async function dig(params, emit) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写域名或 IP'))
  const type = String(params.type ?? 'A').toUpperCase()
  const server = String(params.server ?? '').trim() || (await systemResolverAddress())
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 3000, 200), 15000)
  const recursion = params.recursion !== false

  const recursionText = recursion ? t('开启') : t('关闭')
  emit({ t: 'log', d: t('; <<>> dig ${type} ${host} @${server} （递归 ${state}）', { type, host, server, state: recursionText }) })
  let response
  try {
    response = await rawDnsQuery({ name: host, type, server, timeoutMs, recursion })
  } catch (error) {
    const reason = error?.message ?? error
    throw new Error(t('查询 ${server} 失败: ${reason}', { server, reason }))
  }

  const flags = response.flags
  const headerLines = [
    `;; ->>HEADER<<- opcode: QUERY, status: ${response.rcodeText}, id: ${response.id}`,
    `;; flags:${flags.qr ? ' qr' : ''}${flags.aa ? ' aa' : ''}${flags.tc ? ' tc' : ''}${flags.rd ? ' rd' : ''}${flags.ra ? ' ra' : ''}; QUERY: 1, ANSWER: ${response.answers.length}, AUTHORITY: ${response.authority.length}, ADDITIONAL: ${response.additional.length}`,
    '',
    ';; QUESTION SECTION:',
    ...response.questions.map((question) => `;${question.name}. IN ${question.type}`),
    '',
    ';; ANSWER SECTION:',
  ]
  const answerLines = response.answers.length
    ? response.answers.map((record) => `${record.name}.\t${record.ttl}\tIN\t${record.type}\t${record.value}`)
    : [t('（无应答记录）')]
  const authorityLines = response.authority.length
    ? ['', ';; AUTHORITY SECTION:', ...response.authority.map((record) => `${record.name}.\t${record.ttl}\tIN\t${record.type}\t${record.value}`)]
    : []
  const additionalLines = response.additional.length
    ? ['', ';; ADDITIONAL SECTION:', ...response.additional.map((record) => `${record.name}.\t${record.ttl}\tIN\t${record.type}\t${record.value}`)]
    : []

  const text = [...headerLines, ...answerLines, ...authorityLines, ...additionalLines,
    '', `;; Query time: ${response.ms} ms`, `;; SERVER: ${server}#53(${isIPv6(server) ? 'udp6' : 'udp'})`, `;; WHEN: ${response.queryTime}`].join('\n')

  emit({ t: 'text', d: text })
  emit({ t: 'stats', d: {
    [t('状态')]: response.rcodeText,
    [t('应答')]: response.answers.length,
    [t('权威')]: flags.aa ? t('是') : t('否'),
    [t('耗时')]: `${response.ms} ms`,
  } })
  emit({ t: 'done', d: { rcode: response.rcode } })
}

/* ------------------------------------------------------------------ */
/* Public resolver benchmark                                           */
/* ------------------------------------------------------------------ */

export async function dnsBench(params, emit, signal) {
  const domain = String(params.domain ?? 'www.baidu.com').trim() || 'www.baidu.com'
  const type = String(params.type ?? 'A').toUpperCase()
  const rounds = Math.min(Math.max(Number(params.rounds) || 2, 1), 5)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 2500, 300), 10000)
  const servers = Array.isArray(params.servers) && params.servers.length
    ? params.servers.map((ip) => ({ ip: String(ip), name: t('自定义'), region: '-', note: '-' }))
    : PUBLIC_DNS

  const serverCount = servers.length
  emit({ t: 'log', d: t('测试 ${domain} 的 ${type} 记录 · ${count} 个公共 DNS · 每个 ${rounds} 次', { domain, type, count: serverCount, rounds }) })

  const results = []
  let done = 0
  await pool(servers, 12, async (entry) => {
    if (signal?.aborted) return
    const samples = []
    let answers = []
    let error = null
    let rcode = null
    for (let i = 0; i < rounds; i += 1) {
      try {
        const response = await rawDnsQuery({
          name: domain,
          type,
          server: entry.ip,
          timeoutMs,
          recursion: true,
          signal,
        })
        rcode = response.rcodeText
        samples.push(response.ms)
        if (response.answers.length) {
          answers = response.answers.map((record) => record.value)
        }
        if (response.rcode !== 0) {
          error = response.rcodeText
          break
        }
      } catch (err) {
        if (isAbortError(err)) return
        error = String(err?.message ?? err)
        break
      }
    }
    done += 1
    const best = samples.length ? Math.min(...samples) : null
    const avg = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null
    const reason = error ?? rcode ?? t('未知')
    const result = {
      ip: entry.ip,
      name: entry.name,
      region: entry.region,
      best,
      avg,
      rcode: rcode ?? '-',
      error,
      answers: answers.slice(0, 3).join(', ') || (error ?? '-'),
      ok: Boolean(samples.length) && !error,
    }
    results.push(result)
    emit({
      t: 'rows',
      d: [{
        server: `${entry.name} (${entry.ip})`,
        region: entry.region,
        best: best === null ? '-' : `${best} ms`,
        avg: avg === null ? '-' : `${round(avg, 1)} ms`,
        answers: result.answers,
        status: result.ok ? t('可用') : t('失败: ${reason}', { reason }),
      }],
    })
    emit({ t: 'stats', d: { [t('进度')]: `${done}/${servers.length}` } })
  }, signal)

  const usable = results.filter((item) => item.ok)
  usable.sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity))
  if (usable.length) {
    emit({ t: 'stats', d: {
      [t('最快')]: `${usable[0].name} ${round(usable[0].avg, 1)} ms`,
      [t('可用数量')]: `${usable.length}/${results.length}`,
    } })
  } else {
    emit({ t: 'notice', d: t('没有任何公共 DNS 返回结果，请检查本机出网与 53/UDP 策略') })
  }
  emit({ t: 'done', d: { usable: usable.length, total: results.length } })
}

/* ------------------------------------------------------------------ */
/* WHOIS / RDAP                                                        */
/* ------------------------------------------------------------------ */

function rawWhois(server, query, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const chunks = []
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      if (error) reject(error)
      else resolve(Buffer.concat(chunks).toString('utf8'))
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => socket.write(`${query}\r\n`))
    socket.on('data', (chunk) => {
      chunks.push(chunk)
      if (Buffer.concat(chunks).length > 512 * 1024) finish()
    })
    socket.once('timeout', () => finish(new Error(t('whois 查询超时'))))
    socket.once('error', (error) => finish(error))
    socket.once('close', () => finish())
    socket.connect(43, server)
  })
}

async function rdapLookup(domain) {
  const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(12000),
    headers: { accept: 'application/rdap+json, application/json', 'user-agent': 'dsh-nwtool' },
  })
  if (!response.ok) throw new Error(`RDAP HTTP ${response.status}`)
  const data = await response.json()
  const events = new Map()
  for (const event of data.events ?? []) {
    if (event.eventAction && event.eventDate) events.set(event.eventAction, event.eventDate)
  }
  const nameservers = (data.nameservers ?? []).map((item) => item.ldhName).filter(Boolean)
  const statuses = data.status ?? []
  const entities = []
  for (const entity of data.entities ?? []) {
    const roles = entity.roles ?? []
    const handle = entity.handle ?? ''
    const vcard = entity.vcardArray?.[1] ?? []
    const fn = vcard.find((item) => item[0] === 'fn')?.[3]
    const org = vcard.find((item) => item[0] === 'org')?.[3]
    entities.push(`${roles.join('/') || 'entity'}: ${fn ?? org ?? handle ?? '-'}`)
  }
  return {
    source: 'RDAP',
    domain: data.ldhName ?? domain,
    statuses,
    registrar: entities.filter((item) => item.startsWith('registrar')).join('; ') || '-',
    entities,
    nameservers,
    created: events.get('registration') ?? '-',
    updated: events.get('last changed') ?? '-',
    expires: events.get('expiration') ?? '-',
  }
}

async function whoisLookupRaw(domain) {
  const tld = domain.split('.').pop()
  let server = null
  try {
    const ianaText = await rawWhois('whois.iana.org', tld, 8000)
    const match = /^refer:\s*(\S+)/im.exec(ianaText) ?? /^whois:\s*(\S+)/im.exec(ianaText)
    if (match) server = match[1].trim()
  } catch {
    server = null
  }
  if (!server) {
    const fallback = { com: 'whois.verisign-grs.com', net: 'whois.verisign-grs.com', org: 'whois.pir.org', cn: 'whois.cnnic.cn', io: 'whois.nic.io', dev: 'whois.nic.google', app: 'whois.nic.google' }
    server = fallback[tld] ?? `whois.nic.${tld}`
  }
  const text = await rawWhois(server, domain, 15000)
  return { source: `WHOIS (${server})`, text }
}

export async function domainLookup(params, emit) {
  const domain = String(params.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!domain || !domain.includes('.')) throw new Error(t('请填写完整域名，例如 example.com'))

  emit({ t: 'log', d: t('查询 ${domain} 的注册信息', { domain }) })
  let done = false
  try {
    const rdap = await rdapLookup(domain)
    emit({ t: 'kv', d: [
      { k: t('域名'), v: rdap.domain },
      { k: t('注册商'), v: rdap.registrar },
      { k: t('创建时间'), v: rdap.created },
      { k: t('更新时间'), v: rdap.updated },
      { k: t('到期时间'), v: rdap.expires },
      { k: t('状态'), v: rdap.statuses.join(', ') || '-' },
      { k: t('NS 服务器'), v: rdap.nameservers.join(', ') || '-' },
      { k: t('数据来源'), v: rdap.source },
    ] })
    if (rdap.entities.length) {
      emit({ t: 'sections', d: [{ title: t('相关实体'), body: rdap.entities.join('\n') }] })
    }
    done = true
  } catch (error) {
    const reason = error?.message ?? error
    emit({ t: 'notice', d: t('RDAP 查询失败（${reason}），改用 whois 43 端口', { reason }) })
  }

  if (!done) {
    try {
      const whois = await whoisLookupRaw(domain)
      emit({ t: 'sections', d: [{ title: whois.source, body: whois.text }] })
      done = true
    } catch (error) {
      const reason = error?.message ?? error
      throw new Error(t('WHOIS 查询失败: ${reason}', { reason }))
    }
  }
  emit({ t: 'done', d: {} })
}

/* ------------------------------------------------------------------ */
/* Reverse lookup helper used by the scanners                          */
/* ------------------------------------------------------------------ */

export async function reverseLookup(ip) {
  try {
    const names = await dns.promises.reverse(ip)
    return names[0] ?? ''
  } catch {
    return ''
  }
}
