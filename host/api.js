/**
 * The browser-facing channel: one POST endpoint that streams newline-delimited
 * JSON events, plus a few small request/response operations.
 *
 * Every run is cancellable: when the browser aborts the request the handler
 * aborts the engine's signal, which kills child processes and sockets.
 *
 * The browser states its language on every request; the whole operation runs
 * inside `withLanguage`, so every `t()` below — including the ones deep in the
 * engines and in the stream writer — resolves in that language.
 */
import { CHEATSHEET, PORT_PRESETS, PUBLIC_DNS } from './data.js'
import * as datacom from './datacom.js'
import * as diagram from './diagram.js'
import { runTool } from './engine.js'
import { t, withLanguage } from './i18n.js'
import { deleteWolDevice, listWolDevices, localIPv4Networks, lookupOuiOnline, saveWolDevice } from './net.js'
import * as monitor from './monitor.js'
import * as term from './term.js'

const MAX_BODY = 4 * 1024 * 1024

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error(t('请求体过大')))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error(t('请求体不是合法 JSON')))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Reference tables travel untranslated: the browser translates them at render,
 * which also keeps a language switch working on already-loaded data. */

export function createApiHandler() {
  return async function handleApi(req, res) {
    /* Remember which cookies reach the API: the WebSocket upgrade accepts them
       as proof that the caller is the browser page, not another network peer. */
    term.noteRequestCookie(req)

    /* The header repeats the body's language so even a rejected body can be
       explained in the language the browser is showing. */
    const headerLanguage = req.headers['x-nwtool-lang']

    if (req.method !== 'POST') {
      await withLanguage(headerLanguage, () => sendJson(res, 405, { error: t('只接受 POST 请求') }))
      return
    }

    let payload
    try {
      payload = await withLanguage(headerLanguage, () => readJsonBody(req))
    } catch (error) {
      sendJson(res, 400, { error: String(error?.message ?? error) })
      return
    }

    const op = String(payload.op ?? 'run')
    const language = payload.lang ?? headerLanguage

    try {
      await withLanguage(language, () => handleOperation(op, payload, res, req))
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: String(error?.message ?? error) })
      } else if (!res.writableEnded) {
        res.end()
      }
    }
  }
}

/**
 * The terminal transport: one NDJSON stream per attached session.
 *
 * A WebSocket would be the natural carrier, but a desktop shell may block
 * `ws://` through CSP while ordinary HTTP to the same origin keeps working — so
 * output streams down a normal POST response and keystrokes go back up as small
 * POSTs. Bytes travel base64-encoded so the browser decodes with the encoding it
 * chose.
 *
 * A closed stream does NOT end the session: the Host keeps it (and its byte
 * history) for a while so a browser that lost the panel can re-attach with
 * `term.attach` and replay what it missed.
 */
async function streamSession(req, payload, res, mode) {
  const verdict = term.requestVerdict(req)
  if (verdict !== 'ok') {
    term.noteRefusal(verdict, req)
    sendJson(res, 403, { error: t('终端通道拒绝了这次连接（${reason}）', { reason: verdict }) })
    return
  }

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })

  let finished = false
  const write = (event) => {
    if (finished || res.writableEnded) return
    try {
      res.write(`${JSON.stringify(event)}\n`)
    } catch {
      finished = true
    }
  }

  const cols = payload.cols
  const rows = payload.rows
  let session
  try {
    if (mode === 'attach') {
      session = term.sessionById(payload.id)
      if (!session) throw new Error(t('会话已结束（超过保留时间或已关闭）'))
      session.resize(Number(cols) || 100, Number(rows) || 30)
    } else {
      const device = payload.deviceId
        ? await term.readDeviceRecord(String(payload.deviceId))
        : (payload.device ?? {})
      session = await term.openSession(device, payload.password, { cols, rows })
    }
  } catch (error) {
    write({ t: 'error', d: String(error?.message ?? error) })
    finished = true
    if (!res.writableEnded) res.end()
    return
  }

  term.noteAccepted(req, { session: session.id, host: session.device.host, attach: mode === 'attach' })

  const since = Math.max(0, Number(payload.since) || 0)
  const first = session.history.firstSeq
  const from = Math.max(since, first)
  const info = session.info()
  /* Ready first: the browser needs the id before the replay starts arriving.
     The share and agent state ride along so a second view (the floating
     terminal) starts out with the truth instead of waiting for a change. */
  write({
    t: 'ready',
    d: {
      sessionId: session.id,
      name: info.name,
      host: session.device.host,
      protocol: session.device.protocol,
      attached: mode === 'attach',
      since: from,
      skipped: since < first,
      seq: info.seq,
      shared: Boolean(info.shared),
      agent: info.agent === 'running' ? 'running' : 'idle',
    },
  })

  const release = session.subscribe((chunk, reason) => {
    if (chunk) {
      write({ t: 'data', d: chunk.toString('base64') })
      return
    }
    write({ t: 'exit', d: String(reason ?? 'closed') })
    finished = true
    if (!res.writableEnded) res.end()
  }, since)

  /* Agent state and approval requests travel on the same stream as the bytes, so
     the page can show "DSH is typing" and ask for a dangerous-command verdict
     without polling. */
  const releaseEvents = session.onEvent((event) => write(event))

  res.on('close', () => {
    /* The page navigated away or the panel unmounted: keep the session alive and
       let the idle sweep decide when it is really over. */
    finished = true
    release()
    releaseEvents()
    /* Nothing is watching the approvals any more. */
    session.cancelUnwatchedApprovals()
  })
}

async function handleOperation(op, payload, res, req) {
  switch (op) {
    case 'run': {
      const tool = String(payload.tool ?? '')
      if (!tool) {
        sendJson(res, 400, { error: t('缺少 tool') })
        return
      }
      const controller = new AbortController()
      let finished = false
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      const write = (event) => {
        if (finished || res.writableEnded) return
        try {
          res.write(`${JSON.stringify(event)}\n`)
        } catch {
          finished = true
        }
      }
      res.on('close', () => {
        if (!finished) controller.abort()
      })
      try {
        await runTool(tool, payload.params ?? {}, write, controller.signal)
      } catch (error) {
        if (error?.name === 'AbortError' || error?.aborted) {
          write({ t: 'notice', d: t('已取消') })
        } else {
          write({ t: 'error', d: String(error?.message ?? error) })
        }
      } finally {
        finished = true
        if (!res.writableEnded) res.end()
      }
      return
    }

    case 'backups.list':
      sendJson(res, 200, { backups: await datacom.listBackups() })
      return
    case 'backups.read':
      sendJson(res, 200, { content: await datacom.readBackup(payload.id) })
      return
    case 'backups.delete':
      await datacom.deleteBackup(payload.id)
      sendJson(res, 200, { ok: true })
      return
    case 'backups.search':
      sendJson(res, 200, { matches: await datacom.searchBackups(payload) })
      return
    case 'cheatsheet': {
      sendJson(res, 200, {
        rows: datacom.searchCheatsheet(payload.query, payload.category),
        categories: ['全部', ...new Set(CHEATSHEET.map((row) => row.cat))],
        total: CHEATSHEET.length,
      })
      return
    }
    case 'oui':
      sendJson(res, 200, { vendor: await lookupOuiOnline(payload.mac) })
      return
    case 'wol.list':
      sendJson(res, 200, { devices: await listWolDevices() })
      return
    case 'wol.save':
      sendJson(res, 200, { device: await saveWolDevice(payload.device ?? payload) })
      return
    case 'wol.delete':
      await deleteWolDevice(payload.id)
      sendJson(res, 200, { ok: true })
      return
    case 'networks':
      sendJson(res, 200, { networks: localIPv4Networks(), presets: PORT_PRESETS, publicDns: PUBLIC_DNS })
      return

    case 'diagram.load':
      sendJson(res, 200, { library: await diagram.loadLibrary() })
      return
    case 'diagram.save':
      sendJson(res, 200, { library: await diagram.saveLibrary(payload.library) })
      return

    case 'devices.list':
      sendJson(res, 200, { devices: await term.listDevices() })
      return
    case 'devices.save':
      sendJson(res, 200, { device: await term.saveDevice(payload.device ?? payload) })
      return
    case 'devices.delete':
      await term.deleteDevice(payload.id)
      sendJson(res, 200, { ok: true })
      return
    case 'term.open':
      await streamSession(req, payload, res, 'open')
      return
    case 'term.attach':
      await streamSession(req, payload, res, 'attach')
      return
    case 'term.list':
      sendJson(res, 200, { sessions: term.listSessions() })
      return
    case 'term.share': {
      const session = term.sessionById(payload.id)
      if (!session) {
        sendJson(res, 404, { error: t('会话不存在') })
        return
      }
      sendJson(res, 200, { ok: true, shared: term.setSessionShared(payload.id, payload.shared) })
      return
    }
    case 'term.approve': {
      const session = term.sessionById(payload.id)
      if (!session) {
        sendJson(res, 404, { error: t('会话不存在') })
        return
      }
      const ok = term.approveSessionAction(payload.id, payload.approvalId, payload.allow)
      sendJson(res, 200, { ok })
      return
    }
    case 'term.agent.cancel': {
      const session = term.sessionById(payload.id)
      if (!session) {
        sendJson(res, 404, { error: t('会话不存在') })
        return
      }
      sendJson(res, 200, { ok: term.cancelSessionAgent(payload.id) })
      return
    }
    case 'term.input': {
      const session = term.sessionById(payload.id)
      if (!session) {
        sendJson(res, 404, { error: t('会话不存在') })
        return
      }
      const bytes = Buffer.from(String(payload.data ?? ''), 'base64')
      if (bytes.length) session.write(bytes)
      sendJson(res, 200, { ok: true })
      return
    }
    case 'term.resize': {
      const session = term.sessionById(payload.id)
      if (session) session.resize(Number(payload.cols) || 100, Number(payload.rows) || 30)
      sendJson(res, 200, { ok: true })
      return
    }
    case 'term.close':
      term.closeSession(payload.id)
      sendJson(res, 200, { ok: true })
      return
    case 'term.diag':
      sendJson(res, 200, term.diagnose(req))
      return

    /* The inspector shares the terminal gate: it drives a real device session. */
    case 'term.monitor.open': {
      const verdict = term.requestVerdict(req)
      if (verdict !== 'ok') {
        term.noteRefusal(verdict, req)
        sendJson(res, 403, { error: t('终端通道拒绝了这次连接（${reason}）', { reason: verdict }) })
        return
      }
      const record = payload.deviceId
        ? await term.readDeviceRecord(String(payload.deviceId))
        : (payload.device ?? {})
      const password = await term.resolveSecret(record, payload.password)
      const opened = await monitor.openMonitor({ device: record, password, vendor: payload.vendor })
      term.noteAccepted(req, { monitor: opened.id, host: record.host })
      sendJson(res, 200, {
        id: opened.id,
        vendor: opened.vendor,
        host: record.host,
        name: record.name || `${record.username || 'root'}@${record.host}`,
      })
      return
    }
    case 'term.monitor.sample': {
      const verdict = term.requestVerdict(req)
      if (verdict !== 'ok') {
        sendJson(res, 403, { error: t('终端通道拒绝了这次连接（${reason}）', { reason: verdict }) })
        return
      }
      sendJson(res, 200, { sample: await monitor.sampleMonitor(payload.id) })
      return
    }
    case 'term.monitor.close':
      monitor.closeMonitor(payload.id)
      sendJson(res, 200, { ok: true })
      return
    case 'term.files.list': {
      const verdict = term.requestVerdict(req)
      if (verdict !== 'ok') {
        sendJson(res, 403, { error: t('终端通道拒绝了这次连接（${reason}）', { reason: verdict }) })
        return
      }
      sendJson(res, 200, { listing: await monitor.listFiles(payload.id, payload.path) })
      return
    }
    case 'term.files.info': {
      const verdict = term.requestVerdict(req)
      if (verdict !== 'ok') {
        sendJson(res, 403, { error: t('终端通道拒绝了这次连接（${reason}）', { reason: verdict }) })
        return
      }
      sendJson(res, 200, { info: await monitor.statFile(payload.id, payload.path) })
      return
    }
    default:
      sendJson(res, 400, { error: t('未知操作: {op}', { op }) })
      return
  }
}
