/**
 * Interactive device sessions for the Datacom tools.
 *
 * Two transports:
 *  - Telnet on a raw TCP socket, RFC 854 framing implemented here, so a switch
 *    that only offers Telnet still gets a real terminal.
 *  - SSH delegated to a local client binary: PuTTY's `plink` when present,
 *    OpenSSH `ssh` otherwise. A complete SSH transport is not something a
 *    dependency-free plugin can carry.
 *
 * Bytes travel unchanged in both directions: the browser decodes, because a
 * Chinese Windows console may speak GBK while a Linux box speaks UTF-8, and one
 * session must be able to switch between the two without reconnecting.
 *
 * Security: the upgrade handler owns the raw socket with no peer scope, so the
 * gate is built here — same-origin check, plus a cookie the browser has already
 * used to reach the API, plus a single-use ticket. A peer that never received a
 * ticket from a legitimate page cannot open a shell.
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { t } from './i18n.js'
import { OutputHistory } from './history.js'
import { looksLikePrompt, MORE_RE, stripAnsi } from './cli.js'
import { appendAgentAudit, pruneTranscripts, Transcript } from './transcript.js'
import { sleep } from './util.js'

const STATE_DIR = path.join(os.homedir(), '.dsh-nwtool')
const DEVICE_FILE = path.join(STATE_DIR, 'devices.json')
const KEY_FILE = path.join(STATE_DIR, 'secret.key')
const KNOWN_HOSTS_FILE = path.join(STATE_DIR, 'known_hosts')

const MAX_DEVICES = 200
const MAX_SESSIONS = 8

/* The model may drive a shared session; these bound how long it holds the
   keyboard and how long a dangerous command waits for a human answer. */
const AGENT_IDLE_MS = 400
const AGENT_MAX_WAIT_MS = 30_000
const AGENT_DEFAULT_WAIT_MS = 15_000
const APPROVAL_WAIT_MS = 90_000

const DANGER_RE = /\b(?:reboot|reload|shutdown|erase|format|restore|rollback)\b|\bfactory-?reset\b|\breset\s+saved-configuration\b|\bdelete\b|\bundo\s+all\b/i

const KEY_BYTES = {
  enter: '\r',
  space: ' ',
  tab: '\t',
  escape: '\u001b',
  backspace: '\u007f',
  'ctrl-c': '\u0003',
  'ctrl-d': '\u0004',
  'ctrl-z': '\u001a',
  'ctrl-l': '\u000c',
  up: '\u001b[A',
  down: '\u001b[B',
}

/* ------------------------------------------------------------------ */
/* Secrets at rest                                                     */
/* ------------------------------------------------------------------ */

let cachedKey = null

async function loadKey() {
  if (cachedKey) return cachedKey
  await fsp.mkdir(STATE_DIR, { recursive: true })
  try {
    const raw = await fsp.readFile(KEY_FILE)
    if (raw.length === 32) {
      cachedKey = raw
      return cachedKey
    }
  } catch {
    /* first run */
  }
  const key = crypto.randomBytes(32)
  await fsp.writeFile(KEY_FILE, key, { mode: 0o600 })
  cachedKey = key
  return key
}

/**
 * Encrypt a stored password with a local key file.
 *
 * This protects a copied `devices.json` from being read elsewhere; it does not
 * protect against code running as the same user, which can read the key too.
 */
function seal(plain, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

function unseal(payload, key) {
  const [version, iv, tag, data] = String(payload).split(':')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error(t('密码密文格式不正确'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

/* ------------------------------------------------------------------ */
/* Device book                                                         */
/* ------------------------------------------------------------------ */

const PROTOCOLS = new Set(['ssh', 'telnet'])
const AUTH_MODES = new Set(['prompt', 'saved', 'key', 'agent'])
const MAX_GROUP_LENGTH = 40

/** A group name is free text; '' is the unnamed default bucket. */
function normalizeGroup(value) {
  const group = String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim()
  return group.slice(0, MAX_GROUP_LENGTH)
}

function normalizeDevice(input, options = {}) {
  const requireName = options.requireName !== false
  const device = {
    id: String(input.id ?? '').trim(),
    name: String(input.name ?? '').trim(),
    host: String(input.host ?? '').trim(),
    port: Number(input.port ?? 0),
    protocol: String(input.protocol ?? 'ssh').trim().toLowerCase(),
    username: String(input.username ?? '').trim(),
    authMode: String(input.authMode ?? 'prompt').trim().toLowerCase(),
    keyPath: String(input.keyPath ?? '').trim(),
    note: String(input.note ?? '').trim(),
    group: normalizeGroup(input.group),
    /* Carried only so a ticket can resolve the stored secret at connect time. */
    secret: typeof input.secret === 'string' ? input.secret : null,
  }
  if (requireName && !device.name) throw new Error(t('请填写设备名称'))
  if (!device.host) throw new Error(t('请填写设备地址'))
  if (!PROTOCOLS.has(device.protocol)) throw new Error(t('协议只能是 ssh 或 telnet'))
  if (!AUTH_MODES.has(device.authMode)) throw new Error(t('认证方式不正确'))
  if (device.protocol === 'telnet' && (device.authMode === 'key' || device.authMode === 'agent')) {
    throw new Error(t('Telnet 不支持密钥或 agent 认证'))
  }
  if (device.authMode === 'key' && !device.keyPath) throw new Error(t('请填写私钥路径'))
  if (!Number.isInteger(device.port) || device.port < 1 || device.port > 65535) {
    device.port = device.protocol === 'telnet' ? 23 : 22
  }
  return device
}

async function readBook() {
  try {
    const parsed = JSON.parse(await fsp.readFile(DEVICE_FILE, 'utf8'))
    return Array.isArray(parsed?.devices) ? parsed.devices : []
  } catch {
    return []
  }
}

async function writeBook(devices) {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  await fsp.writeFile(DEVICE_FILE, `${JSON.stringify({ devices }, null, 2)}\n`, { mode: 0o600 })
}

/** Never hand the ciphertext or the ciphertext's presence for 'prompt' devices. */
function publicDevice(device) {
  const { secret, ...rest } = device
  return { ...rest, hasSecret: Boolean(secret) }
}

export async function listDevices() {
  /* Records written before groups existed still land in the default bucket. */
  return (await readBook()).map((device) => publicDevice({ ...device, group: normalizeGroup(device.group) }))
}

export async function saveDevice(input) {
  const devices = await readBook()
  const device = normalizeDevice(input)
  const key = await loadKey()
  const now = new Date().toISOString()

  const existingIndex = device.id ? devices.findIndex((item) => item.id === device.id) : -1
  if (device.id && existingIndex < 0) throw new Error(t('设备不存在'))

  const previous = existingIndex >= 0 ? devices[existingIndex] : null
  const record = {
    ...device,
    id: device.id || crypto.randomUUID(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastConnectedAt: previous?.lastConnectedAt ?? null,
    secret: previous?.secret ?? null,
  }

  if (device.authMode === 'saved') {
    const password = input.password
    if (typeof password === 'string' && password.length) record.secret = seal(password, key)
    else if (!previous?.secret) throw new Error(t('请填写要保存的密码'))
  } else {
    record.secret = null
  }
  if (device.protocol === 'telnet' && record.authMode === 'saved' && !record.secret) {
    throw new Error(t('请填写要保存的密码'))
  }

  if (existingIndex >= 0) devices[existingIndex] = record
  else {
    if (devices.length >= MAX_DEVICES) throw new Error(t('设备数量已达上限（${max}）', { max: MAX_DEVICES }))
    devices.push(record)
  }
  await writeBook(devices)
  return publicDevice(record)
}

export async function deleteDevice(id) {
  const devices = await readBook()
  const next = devices.filter((item) => item.id !== id)
  if (next.length === devices.length) throw new Error(t('设备不存在'))
  await writeBook(next)
  return { ok: true }
}

/** The stored record, ciphertext included, for opening a session. */
export async function readDeviceRecord(id) {
  const devices = await readBook()
  const device = devices.find((item) => item.id === id)
  if (!device) throw new Error(t('设备不存在'))
  return device
}

/** Remember when a device was last used, without failing the connection. */
async function touchDevice(id) {
  if (!id) return
  try {
    const devices = await readBook()
    const device = devices.find((item) => item.id === id)
    if (!device) return
    device.lastConnectedAt = new Date().toISOString()
    await writeBook(devices)
  } catch {
    /* a book that cannot be written must not break the session */
  }
}

/** Resolve the secret to use for one connection, in memory only. */
export async function resolveSecret(device, providedPassword) {
  const provided = String(providedPassword ?? '')
  switch (device.authMode) {
    case 'prompt':
      return provided
    case 'agent':
      return ''
    case 'key':
      /* The provided value is the key passphrase and may legitimately be empty. */
      return provided
    case 'saved': {
      if (!device.secret) throw new Error(t('该设备没有保存密码，请改成每次输入'))
      return unseal(device.secret, await loadKey())
    }
    default:
      return provided
  }
}

/* ------------------------------------------------------------------ */
/* Upgrade gate                                                        */
/* ------------------------------------------------------------------ */

/** Cookies the browser has already used to reach the API, most recent last. */
const seenCookies = new Set()

export function noteRequestCookie(req) {
  const cookie = req?.headers?.cookie
  if (!cookie) return
  seenCookies.add(cookie)
  if (seenCookies.size > 64) seenCookies.delete(seenCookies.values().next().value)
}

function isLoopback(socket) {
  const address = socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Decide whether a terminal request may open or drive a session.
 *
 * The browser transport is plain HTTP streaming, so this gate guards the API
 * calls themselves:
 *  - a peer on this machine is trusted, because it can already run shells; this
 *    also covers desktop shells whose Origin is `null` or `file://`;
 *  - any other peer must present a cookie this browser already used, and a
 *    same-origin page.
 * A session id adds a second, unguessable requirement for input and resize.
 */
export function requestVerdict(req) {
  const loopback = isLoopback(req.socket)
  const cookie = req.headers.cookie ?? ''
  const knownCookie = Boolean(cookie) && seenCookies.has(cookie)
  if (loopback) return 'ok'
  if (!knownCookie) return 'cookie'
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return 'origin'
    } catch {
      return 'origin'
    }
  }
  return 'ok'
}

/** The last refused terminal request, for `term.diag`. */
let lastRefusal = null
/** The last accepted terminal request: proves a request actually arrived. */
let lastUpgrade = null

export function noteRefusal(verdict, req) {
  lastRefusal = {
    at: new Date().toISOString(),
    verdict,
    origin: req.headers.origin ?? null,
    host: req.headers.host ?? null,
    remote: req.socket?.remoteAddress ?? null,
    hasCookie: Boolean(req.headers.cookie),
    url: String(req.url ?? '').slice(0, 120),
  }
}

export function noteAccepted(req, detail = {}) {
  lastUpgrade = {
    at: new Date().toISOString(),
    origin: req.headers.origin ?? null,
    host: req.headers.host ?? null,
    remote: req.socket?.remoteAddress ?? null,
    ...detail,
  }
}

export function diagnose(req) {
  return {
    verdict: requestVerdict(req),
    origin: req.headers.origin ?? null,
    host: req.headers.host ?? null,
    remote: req.socket?.remoteAddress ?? null,
    hasCookie: Boolean(req.headers.cookie),
    sessions: sessions.size,
    detached: detachedCount(),
    lastRefusal,
    lastUpgrade,
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Drop the echoed command line and the blank padding around the answer. */
function cleanCommandEcho(text, command) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
  while (lines.length && lines[0].trim() === command) lines.shift()
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251
const SB = 250
const SE = 240
const OPT_ECHO = 1
const OPT_SGA = 3
const OPT_NAWS = 31

/**
 * Telnet byte pump: strips negotiation from the server stream, answers every
 * option with a refusal except window size, which it accepts so `top`/`vim` lay
 * themselves out for the real screen.
 */
class TelnetPump {
  constructor(socket, size) {
    this.socket = socket
    this.state = 'data'
    this.verb = 0
    this.cols = size.cols
    this.rows = size.rows
    this.naws = false
    this.pending = []
  }

  /** Feed server bytes, return the plain data bytes to hand to the browser. */
  push(buffer) {
    const out = Buffer.alloc(buffer.length)
    let length = 0
    for (const byte of buffer) {
      switch (this.state) {
        case 'data':
          if (byte === IAC) this.state = 'iac'
          else out[length++] = byte
          break
        case 'iac':
          if (byte === IAC) {
            out[length++] = 255
            this.state = 'data'
          } else if (byte === WILL || byte === WONT || byte === DO || byte === DONT) {
            this.verb = byte
            this.state = 'option'
          } else if (byte === SB) {
            this.state = 'sub'
          } else {
            this.state = 'data'
          }
          break
        case 'option':
          this.negotiate(this.verb, byte)
          this.state = 'data'
          break
        case 'sub':
          if (byte === IAC) this.state = 'subIac'
          break
        case 'subIac':
          this.state = byte === SE ? 'data' : 'sub'
          break
        default:
          this.state = 'data'
      }
    }
    return out.subarray(0, length)
  }

  negotiate(verb, option) {
    if (verb === DO && option === OPT_NAWS) {
      if (!this.naws) {
        this.naws = true
        this.socket.write(Buffer.from([IAC, WILL, OPT_NAWS]))
        this.sendSize()
      }
      return
    }
    if (verb === DO || verb === WILL) {
      this.socket.write(Buffer.from([IAC, verb === DO ? WONT : DONT, option]))
    }
  }

  sendSize() {
    if (!this.naws) return
    const payload = Buffer.from([
      IAC, SB, OPT_NAWS,
      (this.cols >> 8) & 0xff, this.cols & 0xff,
      (this.rows >> 8) & 0xff, this.rows & 0xff,
      IAC, SE,
    ])
    this.socket.write(payload)
  }

  resize(cols, rows) {
    this.cols = cols
    this.rows = rows
    this.sendSize()
  }
}

function connectTelnet(device, size) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: device.host, port: device.port })
    const pump = new TelnetPump(socket, size)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(t('连接 ${host}:${port} 超时', { host: device.host, port: device.port })))
    }, 12_000)

    socket.once('connect', () => {
      clearTimeout(timer)
      /* Ask for the two options a Linux telnetd wants; switches ignore them. */
      socket.write(Buffer.from([IAC, WILL, OPT_ECHO, IAC, WILL, OPT_SGA, IAC, WONT, OPT_ECHO]))
      resolve({ socket, pump })
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(t('连接失败: ${reason}', { reason: error?.message ?? String(error) })))
    })
    socket.setNoDelay(true)
  })
}

let sshBinary = null

async function sshClient() {
  if (sshBinary) return sshBinary
  const candidates = process.platform === 'win32'
    ? [{ bin: 'plink.exe', kind: 'plink' }, { bin: 'ssh.exe', kind: 'openssh' }]
    : [{ bin: 'plink', kind: 'plink' }, { bin: 'ssh', kind: 'openssh' }]
  for (const candidate of candidates) {
    const ok = await new Promise((resolve) => {
      let child
      try {
        child = spawn(candidate.bin, ['-V'], { stdio: 'ignore', windowsHide: true })
      } catch {
        resolve(false)
        return
      }
      child.once('error', () => resolve(false))
      child.once('exit', () => resolve(true))
      setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* already gone */
        }
        resolve(false)
      }, 4000)
    })
    if (ok) {
      sshBinary = candidate
      return sshBinary
    }
  }
  throw new Error(t('未找到 SSH 客户端：请安装 PuTTY 的 plink.exe 或启用 Windows 自带 OpenSSH 客户端'))
}

/** Askpass helper: OpenSSH cannot read a password from a pipe. */
async function writeAskpass() {
  await fsp.mkdir(STATE_DIR, { recursive: true })
  if (process.platform === 'win32') {
    const file = path.join(STATE_DIR, 'askpass.cmd')
    await fsp.writeFile(file, '@echo off\r\necho %NWTOOL_SSH_PASSWORD%\r\n', { mode: 0o700 })
    return file
  }
  const file = path.join(STATE_DIR, 'askpass.sh')
  await fsp.writeFile(file, '#!/bin/sh\nprintf \'%s\\n\' "$NWTOOL_SSH_PASSWORD"\n', { mode: 0o700 })
  return file
}

/**
 * How OpenSSH is invoked for a device.
 *
 * The rule that matters: **never let ssh fall back to its own console prompt**.
 * With `stdin` a pipe and no askpass, `ssh` blocks forever on a prompt that
 * never reaches us — the session looks connected (green dot) while the screen
 * stays empty, because not a single byte is produced. So a password attempt
 * always goes through the askpass helper (an empty password simply fails
 * authentication), and when there is nothing to answer with, `BatchMode=yes`
 * makes ssh fail fast instead of waiting.
 */
export function sshInvocation(device, client, password) {
  const args = []
  const env = {}
  const secret = String(password ?? '')
  const passwordAuth = device.authMode !== 'key' && device.authMode !== 'agent'
  const useAskpass = passwordAuth || Boolean(secret)

  if (client.kind === 'plink') {
    args.push('-ssh', '-P', String(device.port), '-t', '-batch')
    if (device.username) args.push('-l', device.username)
    if (device.authMode === 'key') args.push('-i', device.keyPath)
    if (secret && passwordAuth) args.push('-pw', secret)
    args.push(device.host)
    return { args, env, useAskpass: false }
  }

  args.push('-tt', '-p', String(device.port))
  if (device.username) args.push('-l', device.username)
  if (device.authMode === 'key') args.push('-i', device.keyPath)
  args.push(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${KNOWN_HOSTS_FILE}`,
    '-o', 'ServerAliveInterval=30',
    '-o', 'NumberOfPasswordPrompts=1',
    '-o', 'ConnectTimeout=10',
  )
  if (!useAskpass) args.push('-o', 'BatchMode=yes')
  args.push(device.host)
  return { args, env, useAskpass }
}

async function connectSsh(device, password, size) {
  const client = await sshClient()
  const invocation = sshInvocation(device, client, password)
  const env = { ...process.env, ...invocation.env }

  if (invocation.useAskpass) {
    const askpass = await writeAskpass()
    env.SSH_ASKPASS = askpass
    env.SSH_ASKPASS_REQUIRE = 'force'
    env.NWTOOL_SSH_PASSWORD = String(password ?? '')
  }

  const args = invocation.args

  const child = spawn(client.bin, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env,
  })

  await new Promise((resolve, reject) => {
    const fail = (error) => reject(new Error(t('连接失败: ${reason}', { reason: error?.message ?? String(error) })))
    child.once('error', fail)
    child.once('spawn', resolve)
    setTimeout(() => resolve(), 4000)
  })

  return { child, size }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export const HISTORY_BYTES = 256 * 1024
/**
 * How long a session outlives the page that was watching it. Long enough to
 * spend a while in another workspace session and come back — the floating
 * window keeps its own stream attached, so it is never swept while it is open.
 */
export const DETACH_TTL_MS = 20 * 60 * 1000

const sessions = new Map()

class Session {
  constructor(id, device) {
    this.id = id
    this.device = device
    this.startedAt = Date.now()
    this.lastAt = Date.now()
    this.detachedAt = Date.now()
    this.closed = false
    this.history = new OutputHistory(HISTORY_BYTES)
    this.subscribers = new Set()
    this.socket = null
    this.child = null
    this.pump = null
    this.size = null
    /* Sharing is off until a person says otherwise from the tab strip. */
    this.shared = false
    this.agent = { running: false, line: '', cancel: false, startedAt: 0 }
    this.approvals = new Map()
    this.agentListeners = new Set()
    this.transcript = new Transcript({ host: device.host, sessionId: id, startedAt: this.startedAt })
  }

  get attached() {
    return this.subscribers.size > 0
  }

  /**
   * Hand the output to a freshly (re)attached reader: everything it has not seen
   * yet, then the live stream. Replay is synchronous, so a chunk produced
   * mid-subscribe cannot slip in front of it.
   */
  subscribe(listener, since = 0) {
    if (this.closed) {
      try {
        listener(null, 'closed')
      } catch {
        /* the reader is gone already */
      }
      return () => {}
    }
    const replay = this.history.read(since)
    for (const chunk of replay.chunks) {
      try {
        listener(chunk)
      } catch {
        /* one stalled reader must not stop the replay */
      }
    }
    this.subscribers.add(listener)
    this.detachedAt = 0
    const release = () => {
      if (!this.subscribers.delete(listener)) return
      if (!this.subscribers.size && !this.closed) this.detachedAt = Date.now()
    }
    return release
  }

  feed(chunk) {
    if (this.closed) return
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (!data.length) return
    this.lastAt = Date.now()
    this.history.append(data)
    this.transcript.write(data)
    for (const listener of this.subscribers) {
      try {
        listener(data)
      } catch {
        /* a reader that threw is dropped by its own stream handler */
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Model access                                                      */
  /* ---------------------------------------------------------------- */

  /** Browser-side listeners for agent/approval events (one per attached stream). */
  onEvent(listener) {
    this.agentListeners.add(listener)
    return () => {
      this.agentListeners.delete(listener)
    }
  }

  emitEvent(event) {
    for (const listener of [...this.agentListeners]) {
      try {
        listener(event)
      } catch {
        /* that stream is already gone */
      }
    }
  }

  /** Turning sharing off also releases anything the model is currently holding. */
  setShared(value) {
    const next = Boolean(value)
    this.shared = next
    if (!next) {
      for (const [id, pending] of [...this.approvals]) {
        this.approvals.delete(id)
        this.emitEvent({ t: 'approval-done', d: { id, allow: false } })
        pending.resolve({ allow: false, reason: 'unshared' })
      }
      if (this.agent.running) this.agent.cancel = true
    }
    this.emitEvent({ t: 'share', d: { shared: next } })
    return next
  }

  /** Plain text of the recent output, plus the cursor to continue from. */
  readText(options = {}) {
    const since = Math.max(0, Number(options.since) || 0)
    const limit = Math.min(400, Math.max(1, Number(options.lines) || 80))
    const replay = this.history.read(since)
    const text = stripAnsi(Buffer.concat(replay.chunks).toString('utf8')).replace(/\r/g, '')
    const all = text.split('\n')
    while (all.length && !all[all.length - 1].trim()) all.pop()
    return {
      text: all.slice(-limit).join('\n'),
      cursor: this.history.seq,
      truncated: replay.skipped || all.length > limit,
    }
  }

  requestApproval(line) {
    /* Nobody is watching the page: do not hold the call for 90 seconds. */
    if (!this.agentListeners.size) return Promise.resolve({ allow: false, reason: 'unwatched' })
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      const timer = setTimeout(() => {
        this.approvals.delete(id)
        this.emitEvent({ t: 'approval-done', d: { id, allow: false } })
        resolve({ allow: false, reason: 'timeout' })
      }, APPROVAL_WAIT_MS)
      if (typeof timer.unref === 'function') timer.unref()
      this.approvals.set(id, {
        line,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
      })
      this.emitEvent({ t: 'approval', d: { id, line, expiresIn: APPROVAL_WAIT_MS } })
    })
  }

  approve(approvalId, allow) {
    const id = String(approvalId ?? '')
    const pending = this.approvals.get(id)
    if (!pending) return false
    this.approvals.delete(id)
    this.emitEvent({ t: 'approval-done', d: { id, allow: Boolean(allow) } })
    pending.resolve({ allow: Boolean(allow), reason: Boolean(allow) ? 'approved' : 'denied' })
    return true
  }

  cancelAgent() {
    if (!this.agent.running) return false
    this.agent.cancel = true
    return true
  }

  /** The last stream left while a command was waiting for a verdict. */
  cancelUnwatchedApprovals() {
    if (this.agentListeners.size) return
    for (const [id, pending] of [...this.approvals]) {
      this.approvals.delete(id)
      this.emitEvent({ t: 'approval-done', d: { id, allow: false } })
      pending.resolve({ allow: false, reason: 'unwatched' })
    }
  }

  /**
   * Type one line, wait for the device to settle, and return what came back.
   * A device that pages its output gets a space, the way a person does it.
   */
  async runLine(line, options = {}) {
    if (this.closed) throw new Error(t('连接已关闭'))
    if (!this.shared) throw new Error(t('该会话没有共享给 DSH（在终端标签上点「共享给 DSH」）'))
    if (this.agent.running) throw new Error(t('DSH 正在执行上一条命令，请稍候'))
    const command = String(line ?? '').replace(/[\r\n]+/g, ' ').trim()
    if (!command) throw new Error(t('命令不能为空'))

    let decision = 'shared'
    if (DANGER_RE.test(command)) {
      const verdict = await this.requestApproval(command)
      decision = verdict.reason
      if (!verdict.allow) {
        appendAgentAudit({ host: this.device.host, sessionId: this.id, line: command, decision })
        throw new Error(verdict.reason === 'timeout'
          ? t('危险命令未获授权（页面长时间没有响应）')
          : t('危险命令未获授权：${line}', { line: command }))
      }
    }
    appendAgentAudit({ host: this.device.host, sessionId: this.id, line: command, decision })

    const start = this.history.seq
    this.agent = { running: true, line: command, cancel: false, startedAt: Date.now() }
    this.emitEvent({ t: 'agent', d: { state: 'running', line: command } })
    try {
      this.write(`${command}\r`)
      const result = await this.waitForSettle(start, options.waitMs)
      return {
        text: cleanCommandEcho(result.text, command),
        cursor: this.history.seq,
        timedOut: result.timedOut,
        cancelled: this.agent.cancel,
      }
    } finally {
      this.agent = { running: false, line: '', cancel: false, startedAt: 0 }
      this.emitEvent({ t: 'agent', d: { state: 'idle', line: command } })
    }
  }

  async waitForSettle(start, waitMs) {
    const cap = Math.min(AGENT_MAX_WAIT_MS, Math.max(2000, Number(waitMs) || AGENT_DEFAULT_WAIT_MS))
    const deadline = Date.now() + cap
    let lastSeq = start
    let lastChange = Date.now()
    while (Date.now() < deadline) {
      if (this.closed) break
      if (this.agent.cancel) {
        this.write('\u0003')
        break
      }
      const raw = stripAnsi(Buffer.concat(this.history.read(start).chunks).toString('utf8'))
      if (MORE_RE.test(raw.slice(-400))) {
        this.write(' ')
        lastSeq = this.history.seq
        lastChange = Date.now()
        await sleep(120)
        continue
      }
      if (this.history.seq !== lastSeq) {
        lastSeq = this.history.seq
        lastChange = Date.now()
      }
      const quiet = Date.now() - lastChange
      const hasOutput = this.history.seq > start
      if (hasOutput && quiet >= AGENT_IDLE_MS && looksLikePrompt(raw)) break
      if (hasOutput && quiet >= 1200) break
      await sleep(100)
    }
    return {
      text: stripAnsi(Buffer.concat(this.history.read(start).chunks).toString('utf8')),
      timedOut: Date.now() >= deadline,
    }
  }

  info() {
    return {
      id: this.id,
      name: this.device.name || `${this.device.username || 'root'}@${this.device.host}`,
      host: this.device.host,
      port: this.device.port,
      protocol: this.device.protocol,
      state: this.attached ? 'attached' : 'detached',
      startedAt: this.startedAt,
      lastAt: this.lastAt,
      detachedAt: this.detachedAt || 0,
      seq: this.history.seq,
      history: this.history.bytes,
      shared: this.shared,
      agent: this.agent.running ? 'running' : 'idle',
      transcript: this.transcript.path,
    }
  }

  finish(reason) {
    if (this.closed) return
    this.closed = true
    sessions.delete(this.id)
    this.transcript.close()
    for (const [id, pending] of [...this.approvals]) {
      this.approvals.delete(id)
      this.emitEvent({ t: 'approval-done', d: { id, allow: false } })
      pending.resolve({ allow: false, reason: 'closed' })
    }
    this.agentListeners.clear()
    const listeners = [...this.subscribers]
    this.subscribers.clear()
    for (const listener of listeners) {
      try {
        listener(null, reason)
      } catch {
        /* the response stream is already gone */
      }
    }
    try {
      this.socket?.destroy()
    } catch {
      /* ignore */
    }
    try {
      this.child?.kill()
    } catch {
      /* ignore */
    }
  }

  write(bytes) {
    if (this.closed) return
    try {
      if (this.socket) this.socket.write(bytes)
      else this.child?.stdin?.write(bytes)
    } catch {
      this.finish('write-failed')
    }
  }

  resize(cols, rows) {
    this.size = { cols, rows }
    this.pump?.resize(cols, rows)
  }
}

/** Start one session from a device description. */
export async function startSession(entry) {
  if (sessions.size >= MAX_SESSIONS) throw new Error(t('同时打开的会话过多（上限 ${max}）', { max: MAX_SESSIONS }))
  ensureSweeper()
  void pruneTranscripts()
  const id = crypto.randomUUID()
  const session = new Session(id, entry.device)
  sessions.set(id, session)

  try {
    if (entry.device.protocol === 'telnet') {
      const { socket, pump } = await connectTelnet(entry.device, { cols: entry.cols, rows: entry.rows })
      session.socket = socket
      session.pump = pump
      socket.on('data', (chunk) => session.feed(pump.push(chunk)))
      socket.on('close', () => session.finish('closed'))
      socket.on('error', () => session.finish('error'))
    } else {
      const password = await resolveSecret(entry.device, entry.password)
      /* Dialling without the password the user said they would type only ends
         in a rejected login (or, worse, a console prompt nobody can see). */
      if (entry.device.authMode === 'prompt' && !password) {
        throw new Error(t('没有输入密码：这台设备设成「每次输入密码」，请先在工具栏填入密码再连接'))
      }
      const { child } = await connectSsh(entry.device, password, { cols: entry.cols, rows: entry.rows })
      session.child = child
      child.stdout.on('data', (chunk) => session.feed(chunk))
      child.stderr.on('data', (chunk) => session.feed(chunk))
      child.on('exit', (code) => session.finish(`exit:${code}`))
      child.on('error', () => session.finish('spawn-failed'))
      session.resize(entry.cols, entry.rows)
    }
    void touchDevice(entry.device.id)
    return session
  } catch (error) {
    session.closed = true
    sessions.delete(id)
    throw error
  }
}

export function closeSession(id) {
  sessions.get(id)?.finish('client-closed')
}

/** Open a session straight from a device description (used by the panel and tests). */
export async function openSession(input, password, size = {}) {
  return startSession({
    device: normalizeDevice(input, { requireName: false }),
    password: String(password ?? ''),
    cols: clamp(Number(size.cols ?? 100), 20, 400),
    rows: clamp(Number(size.rows ?? 30), 8, 200),
  })
}

export function sessionCount() {
  return sessions.size
}

/** Look up a live session for an input/resize/close call. */
export function sessionById(id) {
  return sessions.get(String(id ?? '')) ?? null
}

/**
 * Sessions the browser may still re-attach to. A detached one is not dead: its
 * transport keeps running until the idle sweep or an explicit close.
 */
export function listSessions() {
  return [...sessions.values()].map((session) => session.info())
}

export function detachedCount() {
  return [...sessions.values()].filter((session) => !session.attached).length
}

/* ------------------------------------------------------------------ */
/* Model-facing access to a shared session                             */
/* ------------------------------------------------------------------ */

/** Resolve a session id, a name/host fragment, or the single shared session. */
export function findSession(selector) {
  const text = String(selector ?? '').trim()
  if (text) {
    const exact = sessions.get(text)
    if (exact) return exact
    const matches = [...sessions.values()].filter((session) => {
      const info = session.info()
      return info.name.toLowerCase().includes(text.toLowerCase()) || String(info.host).includes(text)
    })
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new Error(t('有多个会话匹配「${text}」，请用会话 id', { text }))
    throw new Error(t('找不到会话「${text}」', { text }))
  }
  const shared = [...sessions.values()].filter((session) => session.shared)
  if (shared.length === 1) return shared[0]
  if (!shared.length) throw new Error(t('没有共享给 DSH 的会话（在终端标签上点「共享给 DSH」）'))
  throw new Error(t('有多个共享会话，请用 session 参数指定其中一个'))
}

function requireShared(session) {
  if (!session.shared) throw new Error(t('该会话没有共享给 DSH（在终端标签上点「共享给 DSH」）'))
  return session
}

export function setSessionShared(id, shared) {
  const session = sessions.get(String(id ?? ''))
  if (!session) throw new Error(t('会话不存在'))
  return session.setShared(shared)
}

export function approveSessionAction(id, approvalId, allow) {
  const session = sessions.get(String(id ?? ''))
  if (!session) throw new Error(t('会话不存在'))
  return session.approve(approvalId, allow)
}

export function cancelSessionAgent(id) {
  const session = sessions.get(String(id ?? ''))
  if (!session) return false
  return session.cancelAgent()
}

export function readSessionOutput(selector, options = {}) {
  const session = requireShared(findSession(selector))
  return {
    ...session.readText(options),
    id: session.id,
    name: session.info().name,
    host: session.device.host,
    shared: session.shared,
  }
}

export async function sendSessionLine(selector, line, options = {}) {
  const session = requireShared(findSession(selector))
  const result = await session.runLine(line, options)
  return { ...result, id: session.id, name: session.info().name, host: session.device.host }
}

export function sendSessionKey(selector, key) {
  const session = requireShared(findSession(selector))
  const name = String(key ?? '').toLowerCase()
  const bytes = KEY_BYTES[name]
  if (!bytes) throw new Error(t('不支持的按键：${key}', { key: name || '(empty)' }))
  session.write(bytes)
  appendAgentAudit({ host: session.device.host, sessionId: session.id, line: `key:${name}`, decision: 'shared' })
  return { id: session.id, name: session.info().name, host: session.device.host, key: name }
}

let sweeper = null

function ensureSweeper() {
  if (sweeper) return
  sweeper = setInterval(reapIdleSessions, 30_000)
  if (typeof sweeper.unref === 'function') sweeper.unref()
}

function reapIdleSessions() {
  const now = Date.now()
  for (const session of [...sessions.values()]) {
    if (session.closed || session.attached) continue
    if (now - (session.detachedAt || session.lastAt) < DETACH_TTL_MS) continue
    /* The page that owned this session never came back; do not leave the device
       logged in forever. */
    session.finish('idle')
  }
}

/** Close every session; called on plugin unload. */
export function disposeSessions() {
  if (sweeper) {
    clearInterval(sweeper)
    sweeper = null
  }
  for (const session of [...sessions.values()]) session.finish('disposed')
}
