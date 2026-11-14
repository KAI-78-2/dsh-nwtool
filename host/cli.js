/**
 * Device CLI access for Datacom operations.
 *
 * Telnet is implemented directly on a TCP socket (RFC 854 byte framing and
 * option refusal). SSH is delegated to a local client binary because a real
 * SSH transport cannot be written in a few hundred dependency-free lines:
 * PuTTY's `plink` is preferred when present, OpenSSH `ssh` is the fallback.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { t } from './i18n.js'
import { isWindows, runProcess, sleep } from './util.js'

const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251
const SB = 250
const SE = 240

/** Prompt shapes seen on VRP/Comware/IOS/NX-OS/EOS devices. */
/* Device prompts (`<HUAWEI>`, `[SW1]`, `Switch#`, `R1(config)#`) and the Linux
   shell prompt (`root@host:~#`, `user@host:/var/log$`). Keeping the line short
   and ending on # > or $ keeps ordinary command output out of the match. */
const PROMPT_RE = /(?:^|[\n\r])[ \t]*(?:[<\[][^<>\[\]\r\n]{1,48}[>\]]|[\w.@:/~\-]{1,72}(?:\([^)\r\n]{1,48}\))?[>#$])[ \t\r]*$/
export const MORE_RE = /-{2,}\s*More\s*-{2,}|<---\s*More\s*--->|--More--|---- More ----|Press any key/i

class TelnetFilter {
  constructor(write) {
    this.write = write
    this.state = 'data'
    this.verb = 0
    this.decoder = new TextDecoder('gbk')
  }

  push(buffer) {
    const out = []
    for (const byte of buffer) {
      switch (this.state) {
        case 'data':
          if (byte === IAC) this.state = 'iac'
          else out.push(byte)
          break
        case 'iac':
          if (byte === IAC) {
            out.push(255)
            this.state = 'data'
          } else if (byte === WILL || byte === WONT || byte === DO || byte === DONT) {
            this.verb = byte
            this.state = 'opt'
          } else if (byte === SB) {
            this.state = 'sb'
          } else {
            this.state = 'data'
          }
          break
        case 'opt':
          if (this.verb === WILL) this.write(Buffer.from([IAC, DONT, byte]))
          else if (this.verb === DO) this.write(Buffer.from([IAC, WONT, byte]))
          this.state = 'data'
          break
        case 'sb':
          if (byte === IAC) this.state = 'sbIac'
          break
        case 'sbIac':
          this.state = byte === SE ? 'data' : 'sb'
          break
        default:
          this.state = 'data'
      }
    }
    return this.decoder.decode(Buffer.from(out), { stream: true })
  }
}

class TelnetChannel {
  constructor(host, port, timeoutMs) {
    this.host = host
    this.port = port
    this.timeoutMs = timeoutMs
    this.socket = null
    this.listeners = []
    this.filter = new TelnetFilter((buffer) => this.socket?.write(buffer))
  }

  async open() {
    const { host, port } = this
    await new Promise((resolve, reject) => {
      const socket = new net.Socket()
      this.socket = socket
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(t('连接 ${host}:${port} 超时', { host, port })))
      }, this.timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        const reason = error?.message ?? error
        reject(new Error(t('连接失败: ${reason}', { reason })))
      })
      socket.on('data', (chunk) => {
        const text = this.filter.push(chunk)
        if (!text) return
        for (const listener of this.listeners) listener(text)
      })
      socket.connect(this.port, this.host)
    })
  }

  onData(listener) {
    this.listeners.push(listener)
  }

  write(text) {
    try {
      this.socket?.write(text)
    } catch {
      /* ignore */
    }
  }

  close() {
    try {
      this.socket?.destroy()
    } catch {
      /* ignore */
    }
    this.listeners = []
  }
}

class ProcessChannel {
  constructor(child, marker) {
    this.child = child
    this.marker = marker
    this.listeners = []
    this.decoder = new TextDecoder('utf8')
    const forward = (chunk) => {
      const text = this.decoder.decode(chunk, { stream: true })
      if (text) for (const item of this.listeners) item(text)
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
  }

  onData(listener) {
    this.listeners.push(listener)
  }

  write(text) {
    try {
      this.child.stdin?.write(text.replace(/\r?\n/g, this.marker))
    } catch {
      /* ignore */
    }
  }

  close() {
    try {
      this.child.kill()
    } catch {
      /* ignore */
    }
    this.listeners = []
  }
}

/* ------------------------------------------------------------------ */
/* CLI session                                                         */
/* ------------------------------------------------------------------ */

export class CliSession {
  constructor(channel, options = {}) {
    this.channel = channel
    this.buffer = ''
    this.newline = options.newline ?? '\r\n'
    this.closed = false
    channel.onData((text) => {
      /* Devices send plain text; a Linux shell may colour its prompt, and the
         escape codes would hide it from the prompt matcher. */
      this.buffer += stripAnsi(text)
      if (this.buffer.length > 1024 * 1024) this.buffer = this.buffer.slice(-512 * 1024)
    })
  }

  clear() {
    this.buffer = ''
  }

  async waitFor(predicate, timeoutMs, description) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (this.closed) throw new Error(t('连接已关闭'))
      const matched = predicate(this.buffer)
      if (matched) return matched
      if (Date.now() > deadline) {
        throw new Error(t('等待${description}超时（${timeoutMs} ms）', { description, timeoutMs }))
      }
      await sleep(80)
    }
  }

  async waitForPrompt(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (this.closed) throw new Error(t('连接已关闭'))
      const moreMatch = MORE_RE.exec(this.buffer)
      if (moreMatch) {
        this.channel.write(' ')
        this.buffer = this.buffer.slice(0, moreMatch.index) + this.buffer.slice(moreMatch.index + moreMatch[0].length)
        await sleep(100)
        continue
      }
      if (looksLikePrompt(this.buffer)) return this.buffer
      if (Date.now() > deadline) return this.buffer
      await sleep(80)
    }
  }

  async send(line) {
    this.channel.write(`${line}${this.newline === '\r\n' ? '\r\n' : '\n'}`)
  }

  async command(line, timeoutMs = 25000) {
    this.clear()
    await this.send(line)
    await sleep(120)
    const output = await this.waitForPrompt(timeoutMs)
    return stripEcho(stripAnsi(output), line)
  }

  close() {
    this.closed = true
    this.channel.close()
  }
}

/* A colourised bash prompt interleaves SGR sequences with the text, and ends a
   line with keypad/cursor-mode escapes (`ESC =`, `ESC [K`). Rather than listing
   them, drop OSC/CSI and every single-character escape, then any stray ESC. */
export function stripAnsi(text) {
  return String(text ?? '')
    .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[()#][0-9A-Za-z]/g, '')
    .replace(/\u001b[=>78NOcZ\\]/g, '')
    .replace(/\u001b/g, '')
}

/**
 * Does this buffer end on a device or shell prompt? Exported for the self-check:
 * a colourised bash prompt and a VRP prompt look nothing alike, and both must be
 * recognised or a login wait times out.
 */
export function looksLikePrompt(text) {
  return PROMPT_RE.test(stripAnsi(String(text ?? '')))
}

function stripEcho(output, line) {
  const lines = output.split(/\r?\n/)
  const first = lines[0]?.trim() ?? ''
  if (first === line.trim() || first.endsWith(line.trim())) {
    lines.shift()
  }
  return lines.join('\n').replace(/\s+$/, '')
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

const USER_PROMPT = /(?:username|user ?name|login|用户名|帐号|账号)\s*[:：]\s*$/im
const PASSWORD_PROMPT = /(?:password|密码)\s*[:：]\s*$/im
const EN_PASSWORD_PROMPT = /(?:password)\s*[:：]\s*$/im

export async function openTelnet(device, signal) {
  const channel = new TelnetChannel(device.host, Number(device.port) || 23, Number(device.timeout) || 8000)
  await channel.open()
  const session = new CliSession(channel, { newline: '\r\n' })
  await loginOnSession(session, device, signal)
  return session
}

async function loginOnSession(session, device, signal) {
  const timeout = Number(device.timeout) || 12000
  await sleep(300)

  const sawLogin = await session.waitFor(
    (buffer) => USER_PROMPT.test(buffer) || PASSWORD_PROMPT.test(buffer) || looksLikePrompt(buffer),
    timeout,
    t('登录提示'),
  )
  if (PASSWORD_PROMPT.test(sawLogin) && !USER_PROMPT.test(sawLogin)) {
    await session.send(String(device.password ?? ''))
  } else if (USER_PROMPT.test(sawLogin)) {
    await session.send(String(device.username ?? ''))
    const afterUser = await session.waitFor(
      (buffer) => PASSWORD_PROMPT.test(buffer),
      timeout,
      t('密码提示'),
    )
    if (afterUser) await session.send(String(device.password ?? ''))
  }

  await session.waitForPrompt(timeout)

  if (device.enablePassword) {
    const current = session.buffer
    if (!/[#\]]\s*$/.test(current.trim()) && />\s*$/.test(current.trim())) {
      await session.command(device.protocol === 'telnet' && /cisco|ios/i.test(String(device.vendor ?? '')) ? 'enable' : 'super', 8000).catch(() => '')
      const needsPassword = await session.waitFor((buffer) => EN_PASSWORD_PROMPT.test(buffer), 3000, t('提权密码')).catch(() => '')
      if (needsPassword) {
        await session.send(String(device.enablePassword))
        await session.waitForPrompt(8000)
      }
    }
  }

  // Disable paging so long outputs arrive in one piece.
  await session.send('screen-length 0 temporary')
  await sleep(250)
  await session.send('terminal length 0')
  await sleep(250)
  session.clear()
}

/* ------------------------------------------------------------------ */
/* SSH                                                                 */
/* ------------------------------------------------------------------ */

let sshToolCache

async function detectSshTool() {
  if (sshToolCache !== undefined) return sshToolCache
  const plink = await runProcess('plink', ['-V'], { timeoutMs: 5000 })
  if (!plink.spawnError) {
    sshToolCache = 'plink'
    return sshToolCache
  }
  const ssh = await runProcess('ssh', ['-V'], { timeoutMs: 5000 })
  if (!ssh.spawnError) {
    sshToolCache = 'ssh'
    return sshToolCache
  }
  sshToolCache = null
  return sshToolCache
}

async function makeAskpass(password) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nwtool-askpass-'))
  const passFile = path.join(dir, 'pass.txt')
  await fs.writeFile(passFile, password, 'utf8')
  if (isWindows()) {
    const cmd = path.join(dir, 'askpass.cmd')
    await fs.writeFile(cmd, `@echo off\r\ntype "${passFile}"\r\n`, 'utf8')
    return { program: cmd, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
  }
  const script = path.join(dir, 'askpass.sh')
  await fs.writeFile(script, `#!/bin/sh\nexec cat "${passFile}"\n`, 'utf8')
  await fs.chmod(script, 0o700)
  return { program: script, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}

export async function openSsh(device, signal) {
  const tool = await detectSshTool()
  if (!tool) {
    throw new Error(t('未找到 SSH 客户端：请安装 PuTTY 的 plink.exe 或启用 Windows 自带 OpenSSH 客户端'))
  }

  const host = device.host
  const port = String(Number(device.port) || 22)
  const username = String(device.username ?? '')
  const password = String(device.password ?? '')
  let args
  let env = {}
  let cleanup = null
  let marker = '\n'

  if (tool === 'plink') {
    args = ['-ssh', '-l', username, '-P', port, '-t']
    if (device.keyPath) args.push('-i', String(device.keyPath))
    if (password) args.push('-pw', password)
    args.push(host)
  } else {
    args = [
      '-tt',
      '-p', port,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=' + (isWindows() ? 'NUL' : '/dev/null'),
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=15',
    ]
    if (device.keyPath) args.push('-i', String(device.keyPath))
    if (password) {
      const askpass = await makeAskpass(password)
      cleanup = askpass.cleanup
      env = {
        SSH_ASKPASS: askpass.program,
        SSH_ASKPASS_REQUIRE: 'force',
        DISPLAY: ':0',
        // Older OpenSSH only calls askpass when no DISPLAY is set on some builds;
        // setting both keeps password auth deterministic.
      }
      args.push('-o', 'PreferredAuthentications=password,keyboard-interactive')
      args.push('-o', 'PubkeyAuthentication=no')
    } else {
      /* No secret to answer with: refuse to prompt, otherwise ssh waits on a
         console prompt nobody can see and the call hangs instead of failing. */
      args.push('-o', 'BatchMode=yes')
    }
    args.push(`${username}@${host}`)
  }

  const child = spawn(tool, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const channel = new ProcessChannel(child, marker)
  const session = new CliSession(channel, { newline: '\n' })

  if (tool === 'plink') {
    // PuTTY asks to store an unseen host key; answer yes so batch use works.
    channel.write('y\n')
    await sleep(300)
  }

  try {
    await loginOnSession(session, { ...device, timeout: Number(device.timeout) || 15000 }, signal)
  } catch (error) {
    session.close()
    if (cleanup) await cleanup().catch(() => {})
    throw error
  }
  session.cleanup = cleanup
  return session
}

/* ------------------------------------------------------------------ */
/* Batch execution                                                     */
/* ------------------------------------------------------------------ */

export function splitCommands(input) {
  if (Array.isArray(input)) return input.map((line) => String(line)).filter((line) => line.trim())
  return String(input ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

/**
 * Run `commands` on each device and yield per-device results.
 * `onDevice(device, text, error)` is called as each device settles.
 */
export async function runOnDevices(devices, commands, options = {}) {
  const { concurrency = 3, signal, onDevice, onLog } = options
  const list = Array.from(devices)
  const results = []
  let cursor = 0
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      if (index >= list.length) return
      const device = list[index]
      const label = `${device.name || device.host}`
      const { host, port, protocol } = device
      onLog?.(t('[${label}] 连接 ${host}:${port} (${protocol})', { label, host, port, protocol }))
      let session = null
      let output = ''
      let error = null
      try {
        session = device.protocol === 'ssh' ? await openSsh(device, signal) : await openTelnet(device, signal)
        const commandCount = commands.length
        onLog?.(t('[${label}] 登录成功，开始执行 ${count} 条命令', { label, count: commandCount }))
        const chunks = []
        for (const command of commands) {
          if (signal?.aborted) break
          onLog?.(`[${label}] > ${command}`)
          const result = await session.command(command, Number(device.commandTimeout) || 30000)
          chunks.push(`${result}`)
        }
        output = chunks.join('\n\n')
      } catch (err) {
        error = String(err?.message ?? err)
        onLog?.(t('[${label}] 失败: ${error}', { label, error }))
      } finally {
        if (session) {
          session.close()
          if (session.cleanup) await session.cleanup().catch(() => {})
        }
      }
      const record = { device: label, host: device.host, port: device.port, protocol: device.protocol, output, error }
      results.push(record)
      onDevice?.(record)
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(Math.max(1, concurrency), list.length); i += 1) workers.push(worker())
  await Promise.all(workers)
  return results
}
