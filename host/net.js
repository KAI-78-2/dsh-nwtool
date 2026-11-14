/**
 * Network engines: ICMP probing, TCP probing, traceroute, MTR, scanning,
 * Wake-on-LAN, local adapter inventory, throughput tests and diagnosis.
 *
 * Every engine follows the same contract:
 *   async function engine(params, emit, signal) -> void
 * `emit(event)` receives view events for the UI stream; `signal` aborts work.
 */
import dns from 'node:dns'
import dgram from 'node:dgram'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { OUI_VENDORS, portLabel } from './data.js'
import { t } from './i18n.js'
import {
  bundledTool,
  ensureToolsDir,
  expandTargets,
  isAbortError,
  isIPv4,
  isIPv6,
  isWindows,
  pool,
  round,
  runProcess,
  sleep,
  subnetInfo,
  summarizeLatencies,
  toolPath,
} from './util.js'

/* ------------------------------------------------------------------ */
/* Console output decoding                                             */
/* ------------------------------------------------------------------ */

const GBK_DECODER = (() => {
  try {
    return new TextDecoder('gbk')
  } catch {
    return null
  }
})()

function decodeConsole(buffer, encoding) {
  if (!buffer || buffer.length === 0) return ''
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer))
  if (encoding === 'utf8') return buf.toString('utf8')
  if (GBK_DECODER) {
    try {
      return GBK_DECODER.decode(buf)
    } catch {
      return buf.toString('utf8')
    }
  }
  return buf.toString('utf8')
}

/* ------------------------------------------------------------------ */
/* ICMP probing through the system ping utility                        */
/* ------------------------------------------------------------------ */

const RE_TTL_ANY = /\bTTL\b/i
const RE_TTL_VALUE = /TTL\s*=\s*(\d+)/i
const RE_RTT = /([=<])\s*(\d+(?:[.,]\d+)?)\s*ms/i
const RE_IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g

function buildPingArgs({ count, timeoutMs, size, ttl, dontFragment, family }) {
  const platform = process.platform
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000))
  if (platform === 'win32') {
    const args = ['-n', String(count), '-w', String(Math.max(200, timeoutMs))]
    if (size) args.push('-l', String(size))
    if (ttl !== undefined && ttl !== null) args.push('-i', String(ttl))
    if (dontFragment) args.push('-f')
    if (family === 4) args.push('-4')
    if (family === 6) args.push('-6')
    return args
  }
  const args = ['-c', String(count), '-W', String(seconds)]
  if (platform === 'darwin') args.push('-t', String(seconds))
  if (size) args.push('-s', String(size))
  if (ttl !== undefined && ttl !== null) {
    args.push(platform === 'darwin' ? '-m' : '-t', String(ttl))
  }
  if (family === 4) args.push('-4')
  if (family === 6) args.push('-6')
  return args
}

function parsePingLine(line, target) {
  if (!RE_TTL_ANY.test(line)) return null
  const ttlMatch = RE_TTL_VALUE.exec(line)
  const rttMatch = RE_RTT.exec(line)
  let rtt = null
  let approximate = false
  if (rttMatch) {
    const value = Number(rttMatch[2].replace(',', '.'))
    rtt = rttMatch[1] === '<' ? Math.min(0.5, value) : value
    approximate = rttMatch[1] === '<'
  }
  const ips = line.match(RE_IPV4) ?? []
  let responder = ips.find((ip) => ip !== target) ?? ips[0] ?? null
  // Windows prints "Reply from <ip>:" — the responder is the first address on
  // the line that is not the destination itself when the destination is local.
  if (target && ips.length && ips[0] === target && ips.length > 1) responder = ips[0]
  return {
    expired: !ttlMatch,
    ttl: ttlMatch ? Number(ttlMatch[1]) : null,
    rtt,
    approximate,
    responder,
    line: line.trim(),
  }
}

/** One ICMP echo through the system ping binary. */
export async function icmpProbe(target, options = {}) {
  const {
    timeoutMs = 1000,
    size = 32,
    ttl = null,
    dontFragment = false,
    family = 0,
    signal,
  } = options
  const numericTarget = isIPv4(target) || isIPv6(target)
  const host = numericTarget ? target : await resolveTarget(target, family)
  const args = buildPingArgs({ count: 1, timeoutMs, size, ttl, dontFragment, family })
  const result = await runProcess('ping', [...args, host], {
    timeoutMs: timeoutMs + 3000,
    signal,
    encoding: 'buffer',
  })
  if (result.spawnError) {
    const detail = String(result.stderr || '').trim()
    return { alive: false, error: t('ping 不可用: ${detail}', { detail }), ms: null }
  }
  const text = `${decodeConsole(result.stdout)}${decodeConsole(result.stderr)}`
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  for (const line of lines) {
    const parsed = parsePingLine(line, host)
    if (parsed) {
      return {
        alive: true,
        expired: parsed.expired,
        from: parsed.responder,
        ms: parsed.rtt,
        approximate: parsed.approximate,
        ttl: parsed.ttl,
        line: parsed.line,
      }
    }
  }
  const unreachable = /无法访问|不可达|unreachable|timed out|超时|100%\s*(loss|丢失)/i.test(text)
  return {
    alive: false,
    from: null,
    ms: null,
    unreachable,
    error: unreachable ? 'timeout' : null,
    ms_elapsed: result.ms,
  }
}

export async function resolveTarget(target, family = 0) {
  if (isIPv4(target) || isIPv6(target)) return target
  const lookup = family === 4 ? dns.promises.lookup(target, { family: 4 }) : dns.promises.lookup(target)
  const answer = await lookup
  return answer.address
}

/* ------------------------------------------------------------------ */
/* Ping                                                                */
/* ------------------------------------------------------------------ */

export async function ping(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写目标地址'))
  const count = Math.min(Math.max(Number(params.count) || 4, 1), 500)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 1000, 100), 20000)
  const intervalMs = Math.min(Math.max(Number(params.interval) || 1000, 100), 60000)
  const size = Math.min(Math.max(Number(params.size) || 32, 0), 65500)
  const family = Number(params.family) || 0

  const resolved = await resolveTarget(host, family)
  const target = resolved !== host ? `${host} (${resolved})` : host
  emit({ t: 'log', d: t('PING ${target} · 大小 ${size} 字节 · ${count} 次', { target, size, count }) })

  const samples = []
  let received = 0
  for (let seq = 1; seq <= count; seq += 1) {
    if (signal?.aborted) break
    const sentAt = Date.now()
    let probe
    try {
      probe = await icmpProbe(resolved, {
        timeoutMs,
        size,
        family,
        signal,
        dontFragment: Boolean(params.dontFragment),
      })
    } catch (error) {
      if (isAbortError(error)) break
      probe = { alive: false, error: String(error?.message ?? error) }
    }
    if (probe.alive) {
      received += 1
      const rtt = probe.ms ?? Date.now() - sentAt
      samples.push(rtt)
      emit({
        t: 'rows',
        d: [{
          seq,
          from: probe.from ?? resolved,
          rtt: `${round(rtt, 2)} ms${probe.approximate ? ' (<1)' : ''}`,
          ttl: probe.ttl ?? '-',
          status: t('成功'),
        }],
      })
    } else {
      emit({
        t: 'rows',
        d: [{ seq, from: probe.from ?? '-', rtt: '*', ttl: '-', status: probe.error === 'timeout' ? t('超时') : (probe.error ?? t('失败')) }],
      })
    }
    const stats = summarizeLatencies(samples)
    emit({
      t: 'stats',
      d: {
        [t('已发送')]: seq,
        [t('已接收')]: received,
        [t('丢包率')]: `${round(((seq - received) / seq) * 100, 1)}%`,
        [t('最小')]: `${stats.min} ms`,
        [t('平均')]: `${stats.avg} ms`,
        [t('最大')]: `${stats.max} ms`,
        [t('抖动')]: `${stats.jitter} ms`,
      },
    })
    if (seq < count) {
      const wait = intervalMs - (Date.now() - sentAt)
      if (wait > 0) {
        try {
          await sleep(wait, signal)
        } catch {
          break
        }
      }
    }
  }

  const stats = summarizeLatencies(samples)
  emit({
    t: 'stats',
    d: {
      [t('丢包率')]: `${round(((count - received) / count) * 100, 1)}%`,
      [t('最小')]: `${stats.min} ms`,
      [t('平均')]: `${stats.avg} ms`,
      [t('最大')]: `${stats.max} ms`,
      [t('抖动')]: `${stats.jitter} ms`,
      P95: `${stats.p95} ms`,
    },
  })
  emit({ t: 'done', d: { received, sent: count, stats } })
}

/* ------------------------------------------------------------------ */
/* TCP probing                                                         */
/* ------------------------------------------------------------------ */

export function tcpProbe(host, port, timeoutMs, signal) {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = new net.Socket()
    let settled = false
    const finish = (ok, error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener?.('abort', onAbort)
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Date.now() - started, error })
    }
    const onAbort = () => finish(false, 'aborted')
    signal?.addEventListener?.('abort', onAbort, { once: true })
    socket.setTimeout(Math.max(50, timeoutMs))
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, 'timeout'))
    socket.once('error', (error) => finish(false, error?.code ?? String(error)))
    try {
      socket.connect(Number(port), host)
    } catch (error) {
      finish(false, String(error?.code ?? error))
    }
  })
}

export async function grabBanner(host, port, timeoutMs = 900) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const chunks = []
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      const text = Buffer.concat(chunks).toString('utf8').replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
      resolve(text.split(/\r?\n/).slice(0, 3).join(' | ').trim().slice(0, 180) || null)
    }
    socket.setTimeout(Math.max(120, timeoutMs))
    socket.once('connect', () => {
      const httpLike = [80, 8080, 8000, 8888, 8008, 9000, 3000].includes(Number(port))
      if (httpLike) socket.write(`HEAD / HTTP/1.0\r\nHost: ${host}\r\nUser-Agent: dsh-nwtool\r\n\r\n`)
    })
    socket.on('data', (chunk) => {
      chunks.push(chunk)
      if (Buffer.concat(chunks).length > 1024) finish()
    })
    socket.once('timeout', finish)
    socket.once('error', finish)
    socket.once('close', finish)
    try {
      socket.connect(Number(port), host)
    } catch {
      finish()
    }
  })
}

export async function tcping(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写目标地址'))
  const port = Number(params.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('请填写 1-65535 的端口'))
  const count = Math.min(Math.max(Number(params.count) || 4, 1), 200)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 2000, 100), 60000)
  const intervalMs = Math.min(Math.max(Number(params.interval) || 1000, 50), 60000)

  const resolved = await resolveTarget(host, Number(params.family) || 0)
  const target = `${host}:${port}${resolved !== host ? ` (${resolved})` : ''}`
  emit({ t: 'log', d: t('TCP ${target} · ${count} 次', { target, count }) })

  const samples = []
  let received = 0
  for (let seq = 1; seq <= count; seq += 1) {
    if (signal?.aborted) break
    const started = Date.now()
    const result = await tcpProbe(resolved, port, timeoutMs, signal)
    if (result.ok) {
      received += 1
      samples.push(result.ms)
      emit({ t: 'rows', d: [{ seq, target: `${resolved}:${port}`, rtt: `${result.ms} ms`, status: t('连接成功') }] })
    } else {
      const detail = result.error
      emit({ t: 'rows', d: [{ seq, target: `${resolved}:${port}`, rtt: '*', status: t('失败 (${detail})', { detail }) }] })
    }
    const stats = summarizeLatencies(samples)
    emit({
      t: 'stats',
      d: {
        [t('已发送')]: seq,
        [t('已接收')]: received,
        [t('丢包率')]: `${round(((seq - received) / seq) * 100, 1)}%`,
        [t('最小')]: `${stats.min} ms`,
        [t('平均')]: `${stats.avg} ms`,
        [t('最大')]: `${stats.max} ms`,
      },
    })
    if (seq < count) {
      const wait = intervalMs - (Date.now() - started)
      if (wait > 0) {
        try {
          await sleep(wait, signal)
        } catch {
          break
        }
      }
    }
  }
  emit({ t: 'done', d: { sent: count, received } })
}

/* ------------------------------------------------------------------ */
/* Traceroute                                                          */
/* ------------------------------------------------------------------ */

const RE_IPV6_ANY = /\b([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})\b/i

/**
 * Parse one line of `tracert` / `traceroute` output.
 *   Windows: `  1     2 ms     5 ms     2 ms  192.168.0.1`
 *   Unix:    ` 1  192.168.1.1  0.123 ms  0.234 ms  0.345 ms`
 * A timeout is a hop line carrying only asterisks.
 */
function parseTracerouteLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  const hopMatch = /^(\d{1,3})\s+(.*)$/.exec(trimmed)
  if (!hopMatch) return null
  const hop = Number(hopMatch[1])
  if (!Number.isInteger(hop) || hop < 1 || hop > 255) return null
  const rest = hopMatch[2]
  const ipv4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(rest)
  const ipv6 = ipv4 ? null : RE_IPV6_ANY.exec(rest)
  const times = []
  for (const match of rest.matchAll(/([\d.]+)\s*ms/gi)) times.push(Number(match[1]))
  if (!ipv4 && !ipv6 && times.length === 0 && !rest.includes('*')) return null
  return { hop, host: ipv4 ? ipv4[1] : (ipv6 ? ipv6[1] : null), times }
}

function tracerouteCommand(target, { maxHops, timeoutMs, family }) {
  if (isWindows()) {
    const args = ['-d', '-h', String(maxHops), '-w', String(Math.round(timeoutMs))]
    if (family === 4) args.push('-4')
    if (family === 6) args.push('-6')
    args.push(target)
    return { command: 'tracert', args }
  }
  const args = ['-n', '-m', String(maxHops), '-w', String(Math.max(1, Math.ceil(timeoutMs / 1000)))]
  if (family === 4) args.push('-4')
  if (family === 6) args.push('-6')
  args.push(target)
  return { command: 'traceroute', args }
}

/**
 * Stream one traceroute run. The platform traceroute utility is used instead of
 * ping with a rising TTL, because only that utility reports a round-trip time
 * for TTL-expired replies.
 */
async function runTraceroute(target, options, signal, onHop) {
  const { maxHops, timeoutMs, family } = options
  const { command, args } = tracerouteCommand(target, { maxHops, timeoutMs, family })
  let buffer = ''
  const handle = (line) => {
    const parsed = parseTracerouteLine(line)
    if (parsed) onHop(parsed)
  }
  const result = await runProcess(command, args, {
    timeoutMs: Math.min(300000, maxHops * 3 * timeoutMs + 20000),
    signal,
    encoding: 'buffer',
    onChunk: (chunk) => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        handle(line)
      }
    },
  })
  if (buffer) handle(buffer)
  return result
}

export async function traceroute(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写目标地址'))
  const maxHops = Math.min(Math.max(Number(params.maxHops) || 30, 1), 64)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 1500, 200), 15000)
  const family = Number(params.family) || 0
  const target = await resolveTarget(host, family)
  const label = target !== host ? `${host} (${target})` : host
  const command = isWindows() ? 'tracert' : 'traceroute'

  emit({ t: 'log', d: t('traceroute ${label} · 最多 ${maxHops} 跳（${command}）', { label, maxHops, command }) })

  let reachedAt = null
  const result = await runTraceroute(target, { maxHops, timeoutMs, family }, signal, (hop) => {
    if (hop.host === target && !reachedAt) reachedAt = hop.hop
    emit({
      t: 'rows',
      d: [{
        hop: hop.hop,
        host: hop.host ?? '*',
        rtt: hop.times.length ? hop.times.map((value) => `${round(value, 1)} ms`).join('  ') : '*  *  *',
        loss: hop.host ? '-' : '100%',
        status: hop.host
          ? (hop.host === target ? (hop.hop === 1 ? t('目标 (本机/直连)') : t('到达目标')) : t('中间跳'))
          : t('无响应'),
      }],
    })
  })
  if (result.spawnError) {
    throw new Error(t('无法执行 ${command}，请确认系统已安装该命令', { command }))
  }
  if (!reachedAt && !signal?.aborted) emit({ t: 'notice', d: t('未确认到达目标，可能已达到最大跳数或路径被防火墙过滤') })
  emit({ t: 'done', d: { reachedAt } })
}

/* ------------------------------------------------------------------ */
/* MTR                                                                 */
/* ------------------------------------------------------------------ */

export async function mtr(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写目标地址'))
  const rounds = Math.min(Math.max(Number(params.rounds) || 10, 1), 1000)
  const maxHops = Math.min(Math.max(Number(params.maxHops) || 30, 1), 64)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 1200, 200), 10000)
  const intervalMs = Math.min(Math.max(Number(params.interval) || 1000, 200), 60000)
  const family = Number(params.family) || 0
  const target = await resolveTarget(host, family)
  const label = target !== host ? `${host} (${target})` : host
  const command = isWindows() ? 'tracert' : 'traceroute'

  emit({ t: 'log', d: t('mtr ${label} · ${rounds} 轮 · 每轮一次 ${command}', { label, rounds, command }) })

  /** hop number -> { host, sent, recv, samples, lastMs } */
  const hops = new Map()
  let lastKnownHop = 0
  let destinationHop = 0

  const render = (roundIndex) => {
    emit({ t: 'clear' })
    const rows = []
    for (let ttl = 1; ttl <= Math.max(lastKnownHop, 1); ttl += 1) {
      const hop = hops.get(ttl)
      if (!hop) {
        rows.push({ hop: ttl, host: '*', loss: '100%', sent: 0, recv: 0, last: '-', avg: '-', best: '-', worst: '-', jitter: '-' })
        continue
      }
      const stats = summarizeLatencies(hop.samples)
      rows.push({
        hop: ttl,
        host: hop.host ?? '*',
        loss: hop.sent ? `${round(((hop.sent - hop.recv) / hop.sent) * 100, 1)}%` : '-',
        sent: hop.sent,
        recv: hop.recv,
        last: hop.lastMs === null ? '-' : `${hop.lastMs} ms`,
        avg: stats.count ? `${stats.avg} ms` : '-',
        best: stats.count ? `${stats.min} ms` : '-',
        worst: stats.count ? `${stats.max} ms` : '-',
        jitter: stats.count > 1 ? `${stats.jitter} ms` : '-',
      })
    }
    emit({ t: 'rows', d: rows, replace: true })
    emit({ t: 'stats', d: { [t('轮次')]: `${roundIndex}/${rounds}`, [t('目标跳数')]: destinationHop || '-' } })
  }

  for (let roundIndex = 1; roundIndex <= rounds; roundIndex += 1) {
    if (signal?.aborted) break
    await runTraceroute(target, { maxHops, timeoutMs, family }, signal, (hop) => {
      const entry = hops.get(hop.hop) ?? { host: null, sent: 0, recv: 0, samples: [], lastMs: null }
      // tracert probes each hop three times per run.
      entry.sent += 3
      if (hop.host) entry.host = hop.host
      entry.recv += hop.times.length
      for (const value of hop.times) entry.samples.push(value)
      if (hop.times.length) entry.lastMs = hop.times[hop.times.length - 1]
      hops.set(hop.hop, entry)
      lastKnownHop = Math.max(lastKnownHop, hop.hop)
      if (hop.host === target && !destinationHop) destinationHop = hop.hop
    })
    render(roundIndex)
    if (roundIndex < rounds) {
      try {
        await sleep(intervalMs, signal)
      } catch {
        break
      }
    }
  }
  if (!destinationHop && !signal?.aborted) {
    emit({ t: 'notice', d: t('未确认到达目标；部分运营商设备不回 ICMP，中间跳出现丢包不代表业务受损。') })
  }
  emit({ t: 'done', d: {} })
}

/* ------------------------------------------------------------------ */
/* Port scanning                                                       */
/* ------------------------------------------------------------------ */

export function parsePorts(expression) {
  const text = String(expression ?? '').trim()
  if (!text) throw new Error(t('请填写端口或端口范围'))
  const ports = new Set()
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map((value) => Number(value))
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 65535 || to < from) {
        throw new Error(t('无效端口范围: ${part}', { part }))
      }
      if (to - from > 65535) throw new Error(t('端口范围过大: ${part}', { part }))
      for (let port = from; port <= to; port += 1) ports.add(port)
    } else {
      const port = Number(part)
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('无效端口: ${part}', { part }))
      ports.add(port)
    }
  }
  return [...ports].sort((a, b) => a - b)
}

export async function portScan(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写目标地址'))
  const ports = parsePorts(params.ports)
  const total = ports.length
  if (total > 5000) throw new Error(t('一次最多扫描 5000 个端口（当前 ${total}）', { total }))
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 800, 50), 20000)
  const concurrency = Math.min(Math.max(Number(params.concurrency) || 128, 1), 512)
  const banner = Boolean(params.banner)
  const resolved = await resolveTarget(host, Number(params.family) || 0)

  emit({ t: 'log', d: t('扫描 ${host} · ${total} 个端口 · 并发 ${concurrency}', { host: resolved, total, concurrency }) })
  let done = 0
  let open = 0
  const startedAt = Date.now()

  await pool(ports, concurrency, async (port) => {
    if (signal?.aborted) return
    const result = await tcpProbe(resolved, port, timeoutMs, signal)
    done += 1
    if (result.ok) {
      open += 1
      let extra = ''
      if (banner) {
        const text = await grabBanner(resolved, port)
        if (text) extra = text
      }
      emit({
        t: 'rows',
        d: [{ port, service: portLabel(port), state: 'open', rtt: `${result.ms} ms`, banner: extra || '-' }],
      })
    }
    if (done % 25 === 0 || done === ports.length) {
      emit({
        t: 'stats',
        d: {
          [t('进度')]: `${done}/${ports.length}`,
          [t('开放')]: open,
          [t('已用时')]: `${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
        },
      })
    }
  }, signal)

  emit({ t: 'stats', d: { [t('完成')]: `${done}/${ports.length}`, [t('开放')]: open } })
  if (open === 0) emit({ t: 'notice', d: t('未发现开放端口（目标可能被防火墙过滤）') })
  emit({ t: 'done', d: { open, total: ports.length } })
}

/* ------------------------------------------------------------------ */
/* IP sweep                                                            */
/* ------------------------------------------------------------------ */

export async function ipScan(params, emit, signal) {
  const expression = String(params.target ?? '').trim()
  if (!expression) throw new Error(t('请填写网段，例如 192.168.1.0/24'))
  const limit = Math.min(Math.max(Number(params.limit) || 1024, 1), 4096)
  const { targets, description } = expandTargets(expression, limit)
  const mode = String(params.mode ?? 'tcp')
  const ports = parsePortsForSweep(params.ports)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 400, 50), 5000)
  const concurrency = Math.min(Math.max(Number(params.concurrency) || 64, 1), 256)

  const total = targets.length
  const portList = ports.join(', ')
  emit({ t: 'log', d: t('扫描 ${description} · ${total} 个地址 · 模式 ${mode} · 探测端口 ${portList}', { description, total, mode, portList }) })

  let done = 0
  let alive = 0
  const startedAt = Date.now()

  await pool(targets, concurrency, async (ip) => {
    if (signal?.aborted) return
    let hit = null
    let detail = ''
    if (mode === 'icmp' || mode === 'both') {
      const result = await icmpProbe(ip, { timeoutMs, signal })
      if (result.alive) {
        hit = result.ms !== null ? `${round(result.ms, 1)} ms` : t('在线')
        detail = `ICMP${result.ttl ? ` TTL=${result.ttl}` : ''}`
      }
    }
    if (!hit && (mode === 'tcp' || mode === 'both')) {
      for (const port of ports) {
        if (signal?.aborted) break
        const result = await tcpProbe(ip, port, timeoutMs, signal)
        if (result.ok) {
          hit = `${result.ms} ms`
          detail = t('TCP ${port} 开放', { port })
          break
        }
      }
    }
    done += 1
    if (hit) {
      alive += 1
      let hostname = ''
      try {
        const names = await dns.promises.reverse(ip)
        hostname = names[0] ?? ''
      } catch {
        hostname = ''
      }
      emit({ t: 'rows', d: [{ ip, status: t('在线'), latency: hit, hostname: hostname || '-', detail }] })
    }
    if (done % 32 === 0 || done === targets.length) {
      emit({
        t: 'stats',
        d: {
          [t('进度')]: `${done}/${targets.length}`,
          [t('在线')]: alive,
          [t('已用时')]: `${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
        },
      })
    }
  }, signal)

  emit({ t: 'stats', d: { [t('完成')]: `${done}/${targets.length}`, [t('在线')]: alive } })
  emit({ t: 'done', d: { alive, total: targets.length } })
}

function parsePortsForSweep(value) {
  if (value === undefined || value === null || value === '') return [80, 443, 22, 445, 3389]
  if (Array.isArray(value)) return value.map(Number).filter((port) => port > 0 && port < 65536)
  try {
    return parsePorts(value).slice(0, 8)
  } catch {
    return [80, 443, 22, 445, 3389]
  }
}

/* ------------------------------------------------------------------ */
/* LAN discovery through the ARP table                                 */
/* ------------------------------------------------------------------ */

function normalizeMac(raw) {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g).join(':')
}

function vendorFor(mac) {
  if (!mac) return ''
  const prefix = mac.replace(/:/g, '').slice(0, 6).toUpperCase()
  return OUI_VENDORS[prefix] ?? ''
}

async function readArpTable() {
  const entries = new Map()
  if (isWindows()) {
    const result = await runProcess('arp', ['-a'], { timeoutMs: 10000, encoding: 'buffer' })
    const text = decodeConsole(result.stdout)
    for (const line of text.split(/\r?\n/)) {
      const match = /(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})/.exec(line)
      if (match) entries.set(match[1], normalizeMac(match[2]))
    }
    return entries
  }
  const result = await runProcess('ip', ['neigh'], { timeoutMs: 10000, encoding: 'buffer' })
  if (result.ok) {
    const text = decodeConsole(result.stdout)
    for (const line of text.split(/\r?\n/)) {
      const match = /^(\d{1,3}(?:\.\d{1,3}){3}).*lladdr\s+([0-9a-fA-F:]{17})/i.exec(line.trim())
      if (match) entries.set(match[1], normalizeMac(match[2]))
    }
    if (entries.size) return entries
  }
  const fallback = await runProcess('arp', ['-an'], { timeoutMs: 10000, encoding: 'buffer' })
  for (const line of decodeConsole(fallback.stdout).split(/\r?\n/)) {
    const match = /\((\d{1,3}(?:\.\d{1,3}){3})\)\s+at\s+([0-9a-fA-F:]+)/i.exec(line)
    if (match) entries.set(match[1], normalizeMac(match[2]))
  }
  return entries
}

export function localIPv4Networks() {
  const out = []
  const interfaces = os.networkInterfaces()
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      out.push({ name, address: address.address, netmask: address.netmask, cidr: address.cidr ?? null, mac: address.mac })
    }
  }
  return out
}

function networkTargetFrom(address, netmask) {
  try {
    const info = subnetInfo(address, maskBitsOf(netmask))
    const size = info.total
    if (size > 4096) return null
    return { cidr: `${info.network}/${info.prefix}`, total: info.total }
  } catch {
    return null
  }
}

function maskBitsOf(netmask) {
  const bits = String(netmask).split('.').map(Number)
  let count = 0
  for (const part of bits) count += part.toString(2).split('').filter((bit) => bit === '1').length
  return count
}

export async function lanScan(params, emit, signal) {
  const networks = localIPv4Networks()
  if (!networks.length) throw new Error(t('没有找到可用的本机 IPv4 网卡'))
  const chosen = params.network ? String(params.network) : null
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 1000, 100), 5000)

  let target = null
  if (chosen) {
    const { targets } = expandTargets(chosen, 4096)
    target = { cidr: chosen, count: targets.length, name: params.interface ?? t('自定义') }
  } else {
    const primary = networks[0]
    const derived = networkTargetFrom(primary.address, primary.netmask)
    if (!derived) throw new Error(t('本机网段过大，请手动填写要扫描的网段'))
    target = { cidr: derived.cidr, count: derived.total, name: primary.name }
  }

  emit({ t: 'log', d: t('局域网扫描 ${cidr}（${name}）· 通过 ARP 表发现主机', { cidr: target.cidr, name: target.name }) })
  const { targets } = expandTargets(target.cidr, 4096)

  const socket = dgram.createSocket('udp4')
  try {
    socket.bind(() => {
      for (const ip of targets) {
        try {
          socket.send(Buffer.from([0]), 9, ip)
        } catch {
          /* ignore */
        }
      }
    })
  } catch {
    /* ignore */
  }
  await sleep(Math.min(timeoutMs, 2000), signal).catch(() => {})
  try {
    socket.close()
  } catch {
    /* ignore */
  }

  const arp = await readArpTable()
  const rows = []
  const wanted = new Set(targets)
  for (const [ip, mac] of arp.entries()) {
    if (!isIPv4(ip)) continue
    if (!wanted.has(ip)) continue
    if (!mac) continue
    if (mac === 'FF:FF:FF:FF:FF:FF') continue
    // Multicast/broadcast MAC prefixes carry no host identity.
    if (/^(01:00:5E|33:33|FF:FF:FF)/i.test(mac)) continue
    rows.push({ ip, mac, vendor: vendorFor(mac) || '未知厂商' })
  }
  if (!rows.length && arp.size === 0) {
    emit({ t: 'notice', d: t('ARP 表为空，可能需要先与本网段通信或提升权限') })
  }

  rows.sort((a, b) => {
    const left = a.ip.split('.').map(Number)
    const right = b.ip.split('.').map(Number)
    for (let i = 0; i < 4; i += 1) if (left[i] !== right[i]) return left[i] - right[i]
    return 0
  })

  const shouldResolve = params.resolveHostname !== false
  await pool(rows, 16, async (row) => {
    if (signal?.aborted) return
    if (shouldResolve) {
      try {
        const names = await dns.promises.reverse(row.ip)
        row.hostname = names[0] ?? '-'
      } catch {
        row.hostname = '-'
      }
    } else {
      row.hostname = '-'
    }
    if (params.onlineOui && row.vendor === '未知厂商') {
      const online = await lookupOuiOnline(row.mac)
      if (online) row.vendor = online
    }
    emit({ t: 'rows', d: [{ ...row, vendor: t(row.vendor) }] })
  }, signal)

  emit({ t: 'stats', d: { [t('网段')]: target.cidr, [t('发现主机')]: rows.length, [t('本机网卡')]: networks.map((item) => item.address).join(', ') } })
  emit({ t: 'done', d: { hosts: rows.length } })
}

/**
 * DNS servers to query, most authoritative first: the addresses the adapters
 * actually use, then whatever Node reports, then public fallbacks. Node can
 * report a loopback resolver (the Windows DNS client shim) which nothing
 * listens on, so adapter data comes first and loopback addresses are dropped.
 */
export async function systemDnsServers() {
  const fromAdapters = []
  try {
    const info = await windowsAdapters()
    for (const adapter of info.adapters ?? []) {
      const list = Array.isArray(adapter.dns) ? adapter.dns : [adapter.dns]
      for (const item of list) {
        const value = String(item ?? '').trim()
        if (isIPv4(value)) fromAdapters.push(value)
      }
    }
  } catch {
    /* adapter discovery is optional here */
  }
  const fromNode = dns
    .getServers()
    .map((server) => server.replace(/^\[|\]$/g, '').split('#')[0].trim())
    .filter((server) => isIPv4(server))
  const ordered = [...new Set([...fromAdapters, ...fromNode])].filter((server) => !server.startsWith('127.'))
  if (!ordered.length) ordered.push('223.5.5.5', '114.114.114.114')
  return ordered
}

export async function lookupOuiOnline(mac) {
  if (!mac) return ''
  const normalized = mac.replace(/[^0-9a-fA-F]/g, '')
  if (normalized.length !== 12) return ''
  try {
    const response = await fetch(`https://api.macvendors.com/${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(4000),
      headers: { 'user-agent': 'dsh-nwtool' },
    })
    if (!response.ok) return ''
    const text = (await response.text()).trim()
    if (!text || /not found|notfound/i.test(text)) return ''
    return text.slice(0, 60)
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* Wake-on-LAN                                                         */
/* ------------------------------------------------------------------ */

export async function wakeOnLan(params, emit) {
  const rawMac = String(params.mac ?? '').trim()
  const mac = normalizeMac(rawMac)
  if (!mac) throw new Error(t('MAC 地址格式不正确，例如 00:11:22:33:44:55'))
  const port = Number(params.port) || 9
  const host = String(params.broadcast ?? '255.255.255.255').trim()

  const bytes = Buffer.from(mac.replace(/:/g, ''), 'hex')
  const packet = Buffer.alloc(6 + 16 * 6, 0xff)
  for (let i = 0; i < 16; i += 1) bytes.copy(packet, 6 + i * 6)

  await new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', (error) => {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      reject(error)
    })
    socket.bind(() => {
      try {
        socket.setBroadcast(true)
      } catch {
        /* ignore */
      }
      socket.send(packet, port, host, (error) => {
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        if (error) reject(error)
        else resolve()
      })
    })
  })

  emit({ t: 'kv', d: [
    { k: t('目标 MAC'), v: mac },
    { k: t('广播地址'), v: `${host}:${port}` },
    { k: t('魔术包大小'), v: t('${size} 字节', { size: packet.length }) },
    { k: t('结果'), v: t('已发送') },
  ] })
  emit({ t: 'log', d: t('魔术包已发送。目标主机需在 BIOS/网卡中开启 Wake-on-LAN，且与本机处于同一广播域。') })
  if (params.deviceId) await touchWolDevice(String(params.deviceId)).catch(() => {})
  emit({ t: 'done', d: { mac, host, port } })
}

/* ------------------------------------------------------------------ */
/* Wake-on-LAN device book                                             */
/* ------------------------------------------------------------------ */

function wolStoreFile() {
  return path.join(os.homedir(), '.dsh-nwtool', 'wol-devices.json')
}

async function readWolDevices() {
  try {
    const parsed = JSON.parse(await fs.readFile(wolStoreFile(), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && item.id) : []
  } catch {
    return []
  }
}

async function writeWolDevices(list) {
  const file = wolStoreFile()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8')
}

function cleanWolInput(payload) {
  const mac = normalizeMac(String(payload.mac ?? ''))
  if (!mac) throw new Error(t('MAC 地址格式不正确，例如 00:11:22:33:44:55'))
  const name = String(payload.name ?? '').trim().slice(0, 40) || mac
  const broadcast = String(payload.broadcast ?? '').trim() || '255.255.255.255'
  if (!isIPv4(broadcast)) throw new Error(t('广播地址不是合法的 IPv4: ${broadcast}', { broadcast }))
  const port = Math.min(Math.max(Number(payload.port) || 9, 1), 65535)
  return { name, mac, broadcast, port }
}

export async function listWolDevices() {
  const list = await readWolDevices()
  return list.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
}

export async function saveWolDevice(payload = {}) {
  const fields = cleanWolInput(payload)
  const list = await readWolDevices()
  const id = String(payload.id ?? '').trim()
  const now = new Date().toISOString()
  const duplicate = (skipIndex) => list.some((item, index) => index !== skipIndex
    && item.mac === fields.mac && item.broadcast === fields.broadcast && item.port === fields.port)

  if (id) {
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) throw new Error(t('要更新的设备不在列表中'))
    if (duplicate(index)) throw new Error(t('${mac} 已在列表中', { mac: fields.mac }))
    list[index] = { ...list[index], ...fields, updatedAt: now }
    await writeWolDevices(list)
    return list[index]
  }

  if (duplicate(-1)) throw new Error(t('${mac} 已经在列表里了', { mac: fields.mac }))
  const device = {
    id: `wol_${Date.now().toString(36)}`,
    ...fields,
    createdAt: now,
    updatedAt: now,
    lastWokenAt: null,
  }
  list.unshift(device)
  await writeWolDevices(list.slice(0, 200))
  return device
}

export async function deleteWolDevice(id) {
  const key = String(id ?? '').trim()
  if (!key) throw new Error(t('缺少设备 id'))
  const list = await readWolDevices()
  const next = list.filter((item) => item.id !== key)
  if (next.length === list.length) throw new Error(t('设备不存在'))
  await writeWolDevices(next)
  return { ok: true }
}

async function touchWolDevice(id) {
  const list = await readWolDevices()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return
  list[index] = { ...list[index], lastWokenAt: new Date().toISOString() }
  await writeWolDevices(list)
}

/* ------------------------------------------------------------------ */
/* Local adapter inventory                                             */
/* ------------------------------------------------------------------ */

const PS_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$rows = @()
foreach ($cfg in Get-NetIPConfiguration) {
  $adapter = Get-NetAdapter -InterfaceIndex $cfg.InterfaceIndex -ErrorAction SilentlyContinue
  $rows += [pscustomobject]@{
    name        = [string]$cfg.InterfaceAlias
    description = [string]$cfg.InterfaceDescription
    mac         = [string]$adapter.MacAddress
    status      = [string]$adapter.Status
    speed       = [string]$adapter.LinkSpeed
    ipv4        = @($cfg.IPv4Address | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" })
    gateway     = @($cfg.IPv4DefaultGateway | ForEach-Object { [string]$_.NextHop })
    dns         = @($cfg.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses } | ForEach-Object { [string]$_ })
  }
}
$rows | ConvertTo-Json -Depth 5 -Compress
`

/** UTF-16LE base64, the form `-EncodedCommand` expects. */
function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * PowerShell candidates in preference order. `-EncodedCommand` is used instead
 * of stdin because Windows PowerShell 5.1 does not reliably execute a
 * multi-line script block fed through `-Command -`.
 */
const PS_CANDIDATES = ['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell']

let adapterHostCache = null
const ADAPTER_CACHE_MS = 60000

async function windowsAdapters(signal) {
  if (!isWindows()) return { adapters: null, diagnostic: null, problems: ['not windows'] }
  if (adapterHostCache && Date.now() - adapterHostCache.at < ADAPTER_CACHE_MS) return adapterHostCache
  const problems = []
  const encoded = encodePowerShell(PS_SCRIPT)
  for (const command of PS_CANDIDATES) {
    const result = await runProcess(command, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      timeoutMs: 25000,
      encoding: 'buffer',
      signal,
    })
    if (result.spawnError) {
      problems.push(t('${command}: 未找到', { command }))
      continue
    }
    const text = decodeConsole(result.stdout, 'utf8').trim()
    if (!text) {
      const stderr = decodeConsole(result.stderr, 'utf8').trim().slice(0, 120)
      const detail = stderr ? ` ${stderr}` : ''
      problems.push(t('${command}: 无输出（退出码 ${code}）${detail}', { command, code: result.code, detail }))
      continue
    }
    const jsonStart = text.indexOf('[')
    const jsonEnd = text.lastIndexOf(']')
    try {
      const body = jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text
      const parsed = JSON.parse(body)
      const adapters = Array.isArray(parsed) ? parsed : [parsed]
      if (!adapters.length) {
        problems.push(t('${command}: 未返回网卡', { command }))
        continue
      }
      adapterHostCache = { adapters, diagnostic: command, problems, at: Date.now() }
      return adapterHostCache
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 80)
      problems.push(t('${command}: 输出解析失败 ${detail}', { command, detail }))
    }
  }
  adapterHostCache = { adapters: null, diagnostic: null, problems, at: Date.now() }
  return adapterHostCache
}

const PUBLIC_IP_PROVIDERS = [
  {
    name: 'myip.ipip.net',
    pick: async () => {
      const response = await fetch('https://myip.ipip.net', {
        signal: AbortSignal.timeout(4000),
        headers: { 'user-agent': 'dsh-nwtool' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(await response.text())
      return match?.[1] ?? null
    },
  },
  {
    name: 'api.ipify.org',
    pick: async () => {
      const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      return String(data.ip ?? '') || null
    },
  },
  {
    name: 'ipinfo.io',
    pick: async () => {
      const response = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      return String(data.ip ?? '') || null
    },
  },
  {
    name: 'ip.3322.net',
    pick: async () => {
      const response = await fetch('http://ip.3322.net', { signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = (await response.text()).trim()
      return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(text) ? text : null
    },
  },
]

/** Public egress address, tried against several providers because any single one may be unreachable. */
export async function publicIp() {
  const failures = []
  for (const provider of PUBLIC_IP_PROVIDERS) {
    try {
      const ip = await provider.pick()
      if (ip) return { ip, source: provider.name, failures }
      failures.push(t('${provider}: 空响应', { provider: provider.name }))
    } catch (error) {
      failures.push(`${provider.name}: ${String(error?.message ?? error).slice(0, 60)}`)
    }
  }
  return { ip: null, source: null, failures }
}

export async function localInfo(params, emit) {
  const networks = localIPv4Networks()
  const { adapters, diagnostic, problems } = await windowsAdapters()
  const rows = []

  if (adapters && adapters.length) {
    for (const adapter of adapters) {
      const ipv4 = Array.isArray(adapter.ipv4) ? adapter.ipv4.filter(Boolean) : [adapter.ipv4].filter(Boolean)
      if (!ipv4.length && !adapter.mac) continue
      rows.push({
        name: adapter.name ?? '-',
        description: adapter.description ?? '-',
        ip: ipv4.join(', ') || '-',
        mac: adapter.mac || '-',
        gateway: (adapter.gateway ?? []).filter(Boolean).join(', ') || '-',
        dns: (adapter.dns ?? []).filter(Boolean).join(', ') || '-',
        status: adapter.status || '-',
        speed: adapter.speed || '-',
      })
    }
  }

  if (!rows.length) {
    for (const item of networks) {
      rows.push({
        name: item.name,
        description: '-',
        ip: `${item.address}/${maskBitsOf(item.netmask)}`,
        mac: item.mac || '-',
        gateway: '-',
        dns: '-',
        status: 'up',
        speed: '-',
      })
    }
    if (isWindows()) {
      const reasons = (problems ?? []).join(' | ') || t('未知原因')
      emit({ t: 'log', d: t('未取得 Windows 网卡详情，已回退到 Node 网卡列表（${reasons}）', { reasons }) })
    }
  } else if (diagnostic) {
    emit({ t: 'log', d: t('网卡详情来源：${diagnostic}', { diagnostic }) })
  }

  emit({ t: 'rows', d: rows })

  const gateway = rows.map((row) => row.gateway).filter((value) => value && value !== '-').join(',').split(',')[0]?.trim()
  const dnsServers = [...new Set(rows.flatMap((row) => (row.dns && row.dns !== '-' ? row.dns.split(',').map((item) => item.trim()) : [])))]
  emit({ t: 'kv', d: [
    { k: t('主机名'), v: os.hostname() },
    { k: t('系统'), v: `${os.type()} ${os.release()} (${process.arch})` },
    { k: t('默认网关'), v: gateway || '-' },
    { k: t('DNS 服务器'), v: dnsServers.join(', ') || '-' },
    { k: t('本机地址'), v: networks.map((item) => item.address).join(', ') || '-' },
  ] })

  const egress = await publicIp()
  if (egress.ip) {
    emit({ t: 'kv', d: [{ k: t('公网出口 IP'), v: egress.ip }, { k: t('出口探测来源'), v: egress.source }] })
  } else {
    const reasons = egress.failures.join('；')
    emit({ t: 'notice', d: t('公网 IP 查询失败：${reasons}', { reasons }) })
  }

  emit({ t: 'done', d: {} })
}

/* ------------------------------------------------------------------ */
/* Throughput test                                                     */
/* ------------------------------------------------------------------ */

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(2)} ${units[index]}`
}

export async function speedTest(params, emit, signal) {
  const downloadUrl = String(params.url ?? 'https://speed.cloudflare.com/__down?bytes=25000000').trim()
  const bytes = Math.min(Math.max(Number(params.bytes) || 25000000, 1000000), 200 * 1024 * 1024)
  const doUpload = params.upload !== false
  const url = downloadUrl.includes('__down') ? `https://speed.cloudflare.com/__down?bytes=${bytes}` : downloadUrl

  emit({ t: 'log', d: t('下载测速 ${url}', { url }) })
  const downloadStarted = Date.now()
  let received = 0
  let lastTick = downloadStarted
  try {
    const response = await fetch(url, { signal, headers: { 'cache-control': 'no-store', 'user-agent': 'dsh-nwtool' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value?.length ?? 0
      const now = Date.now()
      if (now - lastTick > 400) {
        lastTick = now
        const seconds = (now - downloadStarted) / 1000
        const mbps = (received * 8) / seconds / 1e6
        emit({
          t: 'progress',
          d: Math.min(99, Math.round((received / bytes) * 100)),
        })
        emit({ t: 'stats', d: {
          [t('已下载')]: formatBytes(received),
          [t('瞬时速度')]: `${mbps.toFixed(1)} Mbps`,
          [t('已用时')]: `${seconds.toFixed(1)} s`,
        } })
      }
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    const detail = error?.message ?? error
    emit({ t: 'notice', d: t('下载失败: ${detail}', { detail }) })
  }
  const downloadSeconds = Math.max(0.001, (Date.now() - downloadStarted) / 1000)
  const downloadMbps = (received * 8) / downloadSeconds / 1e6
  emit({ t: 'rows', d: [{ item: t('下载'), bytes: formatBytes(received), seconds: `${downloadSeconds.toFixed(2)} s`, mbps: `${downloadMbps.toFixed(2)} Mbps`, mbs: `${(downloadMbps / 8).toFixed(2)} MB/s` }] })

  if (doUpload) {
    const payload = Buffer.alloc(Math.min(bytes, 20 * 1024 * 1024), 0x61)
    const uploadStarted = Date.now()
    try {
      await fetch('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body: payload,
        signal,
        headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
      })
      const uploadSeconds = Math.max(0.001, (Date.now() - uploadStarted) / 1000)
      const uploadMbps = (payload.length * 8) / uploadSeconds / 1e6
      emit({ t: 'rows', d: [{ item: t('上传'), bytes: formatBytes(payload.length), seconds: `${uploadSeconds.toFixed(2)} s`, mbps: `${uploadMbps.toFixed(2)} Mbps`, mbs: `${(uploadMbps / 8).toFixed(2)} MB/s` }] })
    } catch (error) {
      if (isAbortError(error)) throw error
      const detail = error?.message ?? error
      emit({ t: 'notice', d: t('上传失败: ${detail}', { detail }) })
    }
  }
  emit({ t: 'done', d: { downloadMbps: round(downloadMbps, 2) } })
}

/* ------------------------------------------------------------------ */
/* iperf3                                                              */
/* ------------------------------------------------------------------ */

export async function iperf3(params, emit, signal) {
  const host = String(params.host ?? '').trim()
  if (!host) throw new Error(t('请填写 iperf3 服务端地址'))
  const port = Number(params.port) || 5201
  const duration = Math.min(Math.max(Number(params.duration) || 10, 1), 300)
  const streams = Math.min(Math.max(Number(params.streams) || 1, 1), 32)
  const reverse = Boolean(params.reverse)
  const udp = Boolean(params.udp)
  const bandwidth = params.bandwidth ? String(params.bandwidth) : null

  const version = await runProcess(bundledTool('iperf3'), ['--version'], { timeoutMs: 6000, encoding: 'buffer' })
  if (version.spawnError) {
    const target = toolPath('iperf3')
    ensureToolsDir()
    emit({ t: 'notice', d: t('未找到 iperf3 可执行文件。') })
    emit({ t: 'kv', d: [
      { k: t('放置目录'), v: target },
      { k: t('安装方式'), v: t('下载 iperf3 for Windows 压缩包，解压出 iperf3.exe，放到上面的目录里即可；本工具会先查这里，再查 PATH') },
      { k: t('下载地址'), v: 'https://iperf.fr/iperf-download.php' },
      { k: t('服务端启动'), v: 'iperf3 -s' },
    ] })
    emit({ t: 'done', d: { available: false } })
    return
  }

  const args = ['-c', host, '-p', String(port), '-t', String(duration), '-P', String(streams), '-J']
  if (reverse) args.push('-R')
  if (udp) {
    args.push('-u')
    if (bandwidth) args.push('-b', bandwidth)
  }
  const argsLine = args.join(' ')
  emit({ t: 'log', d: t('iperf3 ${args}（测试 ${duration} 秒）', { args: argsLine, duration }) })

  const result = await runProcess(bundledTool('iperf3'), args, {
    timeoutMs: (duration + 30) * 1000,
    signal,
    encoding: 'buffer',
  })
  const text = decodeConsole(result.stdout, 'utf8').trim()
  const errText = decodeConsole(result.stderr, 'utf8').trim()
  let report = null
  const jsonStart = text.indexOf('{')
  if (jsonStart >= 0) {
    try {
      report = JSON.parse(text.slice(jsonStart))
    } catch {
      report = null
    }
  }
  if (!report) {
    if (errText) emit({ t: 'log', d: errText })
    const exitReason = t('退出码 ${code}', { code: result.code })
    const reason = errText || exitReason
    throw new Error(result.ok ? t('iperf3 输出无法解析') : t('iperf3 失败: ${reason}', { reason }))
  }

  const sum = reverse ? (report.end?.sum_received ?? report.end?.sum) : report.end?.sum_received
  const sumSend = report.end?.sum_sent
  const bits = reverse ? sum?.bits_per_second : (sumSend?.bits_per_second ?? sum?.bits_per_second)
  const retransmits = sumSend?.retransmits ?? 0

  emit({ t: 'kv', d: [
    { k: t('方向'), v: reverse ? t('下载 (服务端→本机)') : t('上传 (本机→服务端)') },
    { k: t('协议'), v: udp ? 'UDP' : 'TCP' },
    { k: t('平均带宽'), v: `${((bits ?? 0) / 1e6).toFixed(2)} Mbps` },
    { k: t('传输量'), v: formatBytes(reverse ? (sum?.bytes ?? 0) : (sumSend?.bytes ?? 0)) },
    { k: t('重传'), v: String(retransmits) },
    { k: t('版本'), v: `${report.start?.version ?? ''} ${report.start?.system_info ?? ''}`.trim() || '-' },
  ] })

  for (const interval of report.intervals ?? []) {
    const streamsData = interval.streams?.[0]?.sender
    if (!streamsData) continue
    emit({
      t: 'rows',
      d: [{
        time: `${interval.sum?.start?.toFixed(1) ?? '?'} - ${interval.sum?.end?.toFixed(1) ?? '?'} s`,
        mbps: `${((streamsData.bits_per_second ?? 0) / 1e6).toFixed(2)} Mbps`,
        retrans: String(streamsData.retransmits ?? 0),
      }],
    })
  }
  emit({ t: 'done', d: { mbps: round((bits ?? 0) / 1e6, 2) } })
}

/* ------------------------------------------------------------------ */
/* Network diagnosis                                                   */
/* ------------------------------------------------------------------ */

export async function diagnose(params, emit, signal) {
  const steps = []
  const findings = []
  const push = (name, status, detail) => {
    steps.push({ name, status, detail })
    emit({ t: 'rows', d: [{ step: name, result: t(status), detail }], replace: true })
  }

  const networks = localIPv4Networks()
  if (!networks.length) {
    push(t('本机网络'), '异常', t('没有可用的 IPv4 网卡'))
    findings.push(t('本机没有获得 IPv4 地址，请检查网线/WiFi 与 DHCP。'))
  } else {
    push(t('本机网络'), '正常', networks.map((item) => `${item.name} ${item.address}`).join(', '))
  }

  const adapterInfo = await windowsAdapters()
  const adapters = adapterInfo.adapters
  const gateway = adapters
    ?.map((adapter) => (Array.isArray(adapter.gateway) ? adapter.gateway[0] : adapter.gateway))
    .find((value) => value && isIPv4(String(value)))

  if (gateway) {
    const result = await icmpProbe(gateway, { timeoutMs: 1500, signal })
    if (result.alive) {
      const ms = result.ms ?? '?'
      push(t('默认网关'), '正常', t('${gateway} 可达 ${ms} ms', { gateway, ms }))
    } else {
      push(t('默认网关'), '异常', t('${gateway} 不可达', { gateway }))
      findings.push(t('网关 ${gateway} 不通：问题多半在本机到交换机这一段（网线、VLAN、ARP）。', { gateway }))
    }
  } else {
    push(t('默认网关'), '未知', t('未读取到默认网关'))
  }

  const dnsServers = adapters
    ?.flatMap((adapter) => (Array.isArray(adapter.dns) ? adapter.dns : [adapter.dns]))
    .filter(Boolean) ?? []
  const uniqueDns = [...new Set(dnsServers.map(String).filter((item) => isIPv4(item)))]
  if (uniqueDns.length) {
    const reachable = []
    for (const server of uniqueDns.slice(0, 3)) {
      if (signal?.aborted) break
      const result = await icmpProbe(server, { timeoutMs: 1200, signal })
      if (result.alive) reachable.push(`${server} ${result.ms ?? '?'}ms`)
    }
    push(t('DNS 服务器'), reachable.length ? '正常' : '异常', reachable.join(', ') || uniqueDns.join(', '))
    if (!reachable.length) findings.push(t('DNS 服务器不可达，域名解析会失败，但 IP 直连可能仍然正常。'))
  }

  try {
    const answer = await dns.promises.lookup('www.baidu.com')
    push(t('域名解析'), '正常', `www.baidu.com → ${answer.address}`)
  } catch (error) {
    push(t('域名解析'), '异常', String(error?.code ?? error?.message ?? error))
    findings.push(t('域名解析失败：请检查 DNS 配置或上游 DNS 是否可用。'))
  }

  const targets = [
    { host: '223.5.5.5', label: t('阿里 DNS 223.5.5.5') },
    { host: '114.114.114.114', label: '114 DNS' },
    { host: '8.8.8.8', label: 'Google DNS 8.8.8.8' },
  ]
  const results = []
  for (const target of targets) {
    if (signal?.aborted) break
    const result = await icmpProbe(target.host, { timeoutMs: 1500, signal })
    results.push({ ...target, alive: result.alive, ms: result.ms })
  }
  const aliveCount = results.filter((item) => item.alive).length
  const probeResults = results.map((item) => {
    const state = item.alive ? `${item.ms ?? '?'}ms` : t('不通')
    return `${item.host} ${state}`
  }).join(' · ')
  push(t('外网连通'), aliveCount ? '正常' : '异常', probeResults)
  if (!aliveCount && networks.length) findings.push(t('所有外网探测都不通：问题可能在 ISP 线路或出口设备。'))

  try {
    const tcping = await tcpProbe('www.baidu.com', 443, 3000, signal)
    push(t('TCP 443 出站'), tcping.ok ? '正常' : '异常', tcping.ok ? t('握手 ${ms} ms', { ms: tcping.ms }) : String(tcping.error))
    if (!tcping.ok) findings.push(t('TCP 443 出站失败：可能存在防火墙/代理拦截。'))
  } catch (error) {
    push(t('TCP 443 出站'), '异常', String(error?.message ?? error))
  }

  let egressIpFound = false
  try {
    const egress = await publicIp()
    if (egress.ip) {
      egressIpFound = true
      push(t('公网出口'), '正常', egress.ip)
    } else {
      push(t('公网出口'), '异常', t('无法获取公网 IP'))
    }
  } catch {
    push(t('公网出口'), '异常', t('无法获取公网 IP'))
  }
  if (!egressIpFound) findings.push(t('无法取得公网出口 IP：可能是出口被 NAT 且探测服务不可达，或外网被隔离。'))

  emit({ t: 'stats', d: {
    [t('正常项')]: steps.filter((step) => step.status === '正常').length,
    [t('异常项')]: steps.filter((step) => step.status === '异常').length,
  } })
  emit({ t: 'log', d: t('—— 诊断结论 ——') })
  if (!findings.length) emit({ t: 'log', d: t('未发现明显故障：本机、网关、DNS、外网出口均可达。') })
  for (const finding of findings) emit({ t: 'log', d: `· ${finding}` })
  emit({ t: 'done', d: { steps: steps.length, findings: findings.length } })
}
