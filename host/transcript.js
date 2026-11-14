/**
 * On-disk transcripts of interactive terminal sessions.
 *
 * One line per terminal line, ANSI stripped, and secrets masked before anything
 * touches the disk: a network configuration is full of `cipher` blobs, and a log
 * that outlives the session must not become a password archive.
 *
 * Retention is bounded twice — by age and by total size — and pruning runs in the
 * background so a chatty device can never make the directory grow forever.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { stripAnsi } from './cli.js'

export const TRANSCRIPT_DAYS = 30
export const TRANSCRIPT_MAX_BYTES = 128 * 1024 * 1024

const LOG_DIR = path.join(os.homedir(), '.dsh-nwtool', 'term')

export function transcriptDir() {
  return LOG_DIR
}

/* Keywords whose value must never reach the disk. Everything after the keyword
   is masked, which can over-redact a harmless sentence like "Password
   authentication" — the safe direction. */
const SECRET_RE = /(^|\s)(password|passwd|pwd|secret|cipher|pre-shared-key|community|authentication-key|md5|sha256|encryption-key)(\s+)(\S.*)$/i

export function redactLine(line) {
  const text = String(line ?? '')
  /* Mask only the line body: a trailing newline is what makes `$` miss. */
  const newline = /(\r?\n)$/.exec(text)
  const body = newline ? text.slice(0, -newline[0].length) : text
  const redacted = body.replace(SECRET_RE, (match, lead, keyword) => `${lead}${keyword} ****`)
  return newline ? redacted + newline[0] : redacted
}

function fileNameFor(host, sessionId, startedAt) {
  const at = new Date(startedAt)
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
  ].join('') + `-${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}${String(at.getSeconds()).padStart(2, '0')}`
  const safeHost = String(host ?? 'device').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 48)
  const shortId = String(sessionId ?? '').slice(0, 8) || 'session'
  return `${stamp}-${safeHost}-${shortId}.log`
}

/** One session's transcript. Writes are queued by a stream; failures are fatal only to logging. */
export class Transcript {
  constructor({ host, sessionId, startedAt = Date.now() }) {
    this.path = path.join(LOG_DIR, fileNameFor(host, sessionId, startedAt))
    this.buffer = ''
    this.stream = null
    this.failed = false
    this.closed = false
  }

  open() {
    if (this.stream || this.failed || this.closed) return this.stream
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true })
      this.stream = fs.createWriteStream(this.path, { flags: 'a', mode: 0o600 })
      this.stream.on('error', () => {
        this.failed = true
      })
    } catch {
      this.failed = true
    }
    return this.stream
  }

  write(chunk) {
    if (this.failed || this.closed) return
    /* Raw text until a line ends: stripping per chunk would break an escape
       sequence that the network split across two reads. */
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '')
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const raw = this.buffer.slice(0, index + 1)
      this.buffer = this.buffer.slice(index + 1)
      this.append(raw)
      index = this.buffer.indexOf('\n')
    }
    if (this.buffer.length > 8192) {
      this.append(this.buffer)
      this.buffer = ''
    }
  }

  append(raw) {
    const stream = this.open()
    if (!stream) return
    const text = stripAnsi(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    try {
      stream.write(redactLine(text))
    } catch {
      this.failed = true
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    if (this.buffer) {
      this.append(this.buffer)
      this.buffer = ''
    }
    try {
      this.stream?.end()
    } catch {
      /* ignore */
    }
    this.stream = null
  }
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

let lastPrune = 0

/** Delete transcripts past their age, then the oldest ones until the directory fits. */
export async function pruneTranscripts({ force = false } = {}) {
  const now = Date.now()
  if (!force && now - lastPrune < 60 * 60 * 1000) return { removed: 0 }
  lastPrune = now
  let removed = 0
  try {
    const names = await fsp.readdir(LOG_DIR)
    const files = []
    let total = 0
    for (const name of names) {
      if (!name.endsWith('.log')) continue
      const full = path.join(LOG_DIR, name)
      try {
        const stat = await fsp.stat(full)
        if (!stat.isFile()) continue
        files.push({ full, size: stat.size, mtime: stat.mtimeMs })
        total += stat.size
      } catch {
        /* vanished between readdir and stat */
      }
    }
    files.sort((left, right) => left.mtime - right.mtime)
    for (const file of files) {
      const expired = now - file.mtime > TRANSCRIPT_DAYS * 24 * 60 * 60 * 1000
      const tooBig = total > TRANSCRIPT_MAX_BYTES
      if (!expired && !tooBig) break
      await fsp.rm(file.full, { force: true })
      total -= file.size
      removed += 1
    }
  } catch {
    /* no directory yet */
  }
  return { removed }
}

/* ------------------------------------------------------------------ */
/* Audit of commands issued by the model                               */
/* ------------------------------------------------------------------ */

function auditPath(at = Date.now()) {
  const date = new Date(at)
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return path.join(LOG_DIR, `agent-${stamp}.log`)
}

/** One line per model-issued command, with the approval verdict. */
export function appendAgentAudit({ host, sessionId, line, decision, at = Date.now() }) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const stamp = new Date(at).toISOString()
    const record = `${stamp}\t${host ?? '-'}\t${String(sessionId ?? '').slice(0, 8)}\t${decision}\t${redactLine(String(line ?? '').replace(/\s+/g, ' ').slice(0, 400))}\n`
    fs.appendFileSync(auditPath(at), record, { mode: 0o600 })
  } catch {
    /* logging is best effort */
  }
}
