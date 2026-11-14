/**
 * Shared helpers for the Network Toolbox host half.
 * No third-party dependencies: only Node standard library.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* ------------------------------------------------------------------ */
/* IPv4 math                                                           */
/* ------------------------------------------------------------------ */

export function isIPv4(value) {
  if (typeof value !== 'string') return false
  const parts = value.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isIPv6(value) {
  if (typeof value !== 'string') return false
  if (!value.includes(':')) return false
  return /^[0-9a-fA-F:.%]+$/.test(value.trim())
}

export function ipv4ToInt(ip) {
  const parts = ip.trim().split('.').map(Number)
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

export function intToIPv4(value) {
  const n = Number(value) >>> 0
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function prefixToMask(prefix) {
  const p = Number(prefix)
  if (!Number.isInteger(p) || p < 0 || p > 32) throw new Error(`invalid prefix: ${prefix}`)
  if (p === 0) return 0
  return (0xffffffff << (32 - p)) >>> 0
}

export function maskToPrefix(mask) {
  if (!isIPv4(mask)) throw new Error(`invalid mask: ${mask}`)
  const n = ipv4ToInt(mask)
  let prefix = 0
  let seenZero = false
  for (let bit = 31; bit >= 0; bit -= 1) {
    const on = ((n >>> bit) & 1) === 1
    if (on && seenZero) throw new Error(`non-contiguous mask: ${mask}`)
    if (on) prefix += 1
    else seenZero = true
  }
  return prefix
}

export function ipv4ToBinary(ip) {
  return ipv4ToInt(ip).toString(2).padStart(32, '0')
}

/** Full subnet description for one address + prefix pair. */
export function subnetInfo(ip, prefix) {
  const p = Number(prefix)
  const mask = prefixToMask(p)
  const addr = ipv4ToInt(ip)
  const network = (addr & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const size = 2 ** (32 - p)
  const usable = p >= 31 ? size : Math.max(size - 2, 0)
  const first = p >= 31 ? network : network + 1
  const last = p >= 31 ? broadcast : broadcast - 1
  return {
    address: ip,
    prefix: p,
    mask: intToIPv4(mask),
    wildcard: intToIPv4(~mask >>> 0),
    network: intToIPv4(network),
    broadcast: intToIPv4(broadcast),
    first: intToIPv4(first),
    last: intToIPv4(last),
    total: size,
    usable,
    isPrivate: isPrivateIPv4(ip),
    classful: classfulOf(addr),
    binary: {
      address: ipv4ToBinary(ip),
      mask: mask.toString(2).padStart(32, '0'),
      network: network.toString(2).padStart(32, '0'),
    },
  }
}

export function isPrivateIPv4(ip) {
  if (!isIPv4(ip)) return false
  const n = ipv4ToInt(ip)
  const inRange = (base, bits) => {
    const mask = prefixToMask(bits)
    return ((n & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0)
  }
  return (
    inRange('10.0.0.0', 8) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('100.64.0.0', 10) ||
    inRange('224.0.0.0', 4) ||
    inRange('240.0.0.0', 4)
  )
}

function classfulOf(n) {
  const first = (n >>> 24) & 255
  if (first < 128) return 'A'
  if (first < 192) return 'B'
  if (first < 224) return 'C'
  if (first < 240) return 'D (multicast)'
  return 'E (reserved)'
}

/** Split one /prefix into two halves, recursively down to `maxDepth`. */
export function splitSubnet(ip, prefix, maxDepth = 1) {
  const out = []
  const walk = (base, p, depth) => {
    if (depth > maxDepth) return
    const next = p + 1
    if (next > 32) return
    const mask = prefixToMask(next)
    const network = (ipv4ToInt(base) & mask) >>> 0
    const second = (network + 2 ** (32 - next)) >>> 0
    out.push(`${intToIPv4(network)}/${next}`, `${intToIPv4(second)}/${next}`)
    walk(intToIPv4(network), next, depth + 1)
    walk(intToIPv4(second), next, depth + 1)
  }
  walk(ip, Number(prefix), 1)
  return out
}

/**
 * Expand a target expression into a bounded address list.
 * Accepts `10.0.0.1`, `10.0.0.0/24`, `10.0.0.1-10.0.0.40`, `10.0.0.1-40`.
 */
export function expandTargets(expression, limit = 4096) {
  const text = String(expression || '').trim()
  if (!text) throw new Error('target is empty')

  if (text.includes('/')) {
    const [base, prefixText] = text.split('/')
    if (!isIPv4(base)) throw new Error(`invalid IPv4 address: ${base}`)
    const prefix = Number(prefixText)
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`invalid prefix: ${prefixText}`)
    const info = subnetInfo(base, prefix)
    const total = info.total
    const includeAll = prefix >= 31
    const start = includeAll ? ipv4ToInt(info.network) : ipv4ToInt(info.network) + 1
    const end = includeAll ? ipv4ToInt(info.broadcast) : ipv4ToInt(info.broadcast) - 1
    const count = end - start + 1
    if (count > limit) throw new Error(`range too large: ${count} addresses (limit ${limit})`)
    const list = []
    for (let n = start; n <= end; n += 1) list.push(intToIPv4(n))
    return { targets: list, description: `${info.network}/${prefix}`, total }
  }

  if (text.includes('-')) {
    const [left, right] = text.split('-').map((part) => part.trim())
    if (!isIPv4(left)) throw new Error(`invalid IPv4 address: ${left}`)
    const start = ipv4ToInt(left)
    let end
    if (isIPv4(right)) end = ipv4ToInt(right)
    else if (/^\d+$/.test(right)) end = ((start & 0xffffff00) >>> 0) + Number(right)
    else throw new Error(`invalid range end: ${right}`)
    if (end < start) throw new Error('range end is before range start')
    const count = end - start + 1
    if (count > limit) throw new Error(`range too large: ${count} addresses (limit ${limit})`)
    const list = []
    for (let n = start; n <= end; n += 1) list.push(intToIPv4(n))
    return { targets: list, description: `${left} - ${intToIPv4(end)}`, total: count }
  }

  if (!isIPv4(text) && !isIPv6(text)) throw new Error(`invalid address: ${text}`)
  return { targets: [text], description: text, total: 1 }
}

/* ------------------------------------------------------------------ */
/* Concurrency                                                         */
/* ------------------------------------------------------------------ */

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, Math.max(0, ms))
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

export function abortError() {
  const error = new Error('aborted')
  error.name = 'AbortError'
  error.aborted = true
  return error
}

export function isAbortError(error) {
  return Boolean(error && (error.name === 'AbortError' || error.aborted))
}

/** Run `worker` over `items` with a bounded number of in-flight tasks. */
export async function pool(items, limit, worker, signal) {
  const list = Array.from(items)
  const size = Math.max(1, Math.min(Number(limit) || 1, list.length || 1))
  let cursor = 0
  const runners = []
  for (let i = 0; i < size; i += 1) {
    runners.push(
      (async () => {
        for (;;) {
          if (signal?.aborted) return
          const index = cursor
          cursor += 1
          if (index >= list.length) return
          await worker(list[index], index)
        }
      })(),
    )
  }
  await Promise.all(runners)
}

/* ------------------------------------------------------------------ */
/* Process helpers                                                     */
/* ------------------------------------------------------------------ */

export function assertSafeToken(value, field) {
  const text = String(value ?? '')
  if (!text) throw new Error(`${field} is required`)
  if (!/^[A-Za-z0-9._:\-\[\]%/,]+$/.test(text)) throw new Error(`${field} contains unsupported characters: ${text}`)
  return text
}

export function isWindows() {
  return process.platform === 'win32'
}

/**
 * Where a user drops an optional third-party binary (`iperf3.exe`, …) without
 * touching PATH. Kept next to the device book so there is exactly one place to
 * look, and reported verbatim in the panel so the instruction names a real path.
 */
export function toolsDir() {
  return path.join(os.homedir(), '.dsh-nwtool', 'bin')
}

/** Absolute path of one expected binary inside the tools directory. */
export function toolPath(name) {
  return path.join(toolsDir(), isWindows() ? `${name}.exe` : name)
}

/** Prefer the local copy; fall back to PATH (the bare name) when it is absent. */
export function bundledTool(name) {
  const local = toolPath(name)
  try {
    if (fs.existsSync(local)) return local
  } catch {
    /* an unreadable directory just means "not installed here" */
  }
  return name
}

/** Create the drop-in directory so the instruction can point at something real. */
export function ensureToolsDir() {
  try {
    fs.mkdirSync(toolsDir(), { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Spawn one process with array arguments (never a shell string) and collect
 * its output. Resolves with the exit code, stdout, stderr and duration; it
 * never rejects on a non-zero exit code.
 */
export function runProcess(command, args = [], options = {}) {
  const { timeoutMs = 30000, signal, stdin, cwd, env, unsetEnv, encoding = 'buffer', onChunk } = options
  const childEnv = { ...process.env, ...env }
  if (unsetEnv) {
    for (const key of unsetEnv) delete childEnv[key]
  }
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env: childEnv,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(error?.message ?? error), ms: 0, spawnError: true })
      return
    }

    const outChunks = []
    const errChunks = []
    let settled = false
    let timedOut = false

    const finish = (code, extra = {}) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      const stdout = Buffer.concat(outChunks)
      const stderr = Buffer.concat(errChunks)
      resolve({
        ok: code === 0,
        code,
        stdout: encoding === 'utf8' ? stdout.toString('utf8') : stdout,
        stderr: encoding === 'utf8' ? stderr.toString('utf8') : stderr,
        ms: Date.now() - startedAt,
        timedOut,
        ...extra,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish(null, { timedOut: true })
    }, Math.max(1000, timeoutMs))

    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish(null, { aborted: true })
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })

    child.stdout?.on('data', (chunk) => {
      outChunks.push(chunk)
      if (onChunk) {
        try {
          onChunk(chunk)
        } catch {
          /* a streaming consumer must not break the process lifecycle */
        }
      }
    })
    child.stderr?.on('data', (chunk) => errChunks.push(chunk))
    child.on('error', (error) => {
      finish(-1, { spawnError: true, stderr: String(error?.message ?? error) })
    })
    child.on('close', (code) => finish(code))

    if (stdin !== undefined) {
      try {
        child.stdin.end(stdin)
      } catch {
        /* ignore */
      }
    } else {
      try {
        child.stdin.end()
      } catch {
        /* ignore */
      }
    }
  })
}

/** Decode process output that a Windows console may encode as GBK. */
export function decodeText(buffer) {
  if (typeof buffer === 'string') return buffer
  if (!buffer || buffer.length === 0) return ''
  return buffer.toString('utf8')
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function summarizeLatencies(values) {
  if (!values.length) return { min: 0, avg: 0, max: 0, jitter: 0, p95: 0, count: 0 }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let jitterSum = 0
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
    if (i > 0) jitterSum += Math.abs(value - values[i - 1])
  }
  return {
    min: round(min, 2),
    avg: round(sum / values.length, 2),
    max: round(max, 2),
    jitter: round(values.length > 1 ? jitterSum / (values.length - 1) : 0, 2),
    p95: round(percentile(values, 95), 2),
    count: values.length,
  }
}
