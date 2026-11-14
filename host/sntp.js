/**
 * SNTP (RFC 4330) over UDP: how far off is this machine's clock?
 *
 * One 48-byte packet to port 123 and the four timestamps it echoes back are
 * enough to compute the offset and the round-trip delay. Nothing here needs
 * privileges — it is an ordinary unprivileged UDP socket — so this works on a
 * locked-down desktop as long as UDP 123 is not filtered.
 */
import dgram from 'node:dgram'

import { t } from './i18n.js'
import { clampNumber } from './util.js'

const NTP_PORT = 123
/** Seconds between the NTP epoch (1900) and the Unix epoch (1970). */
const NTP_UNIX_DELTA = 2208988800
const PACKET_SIZE = 48

function readTimestamp(buffer, offset) {
  const seconds = buffer.readUInt32BE(offset)
  const fraction = buffer.readUInt32BE(offset + 4)
  return (seconds - NTP_UNIX_DELTA) * 1000 + (fraction * 1000) / 2 ** 32
}

function writeTimestamp(buffer, offset, milliseconds) {
  const seconds = milliseconds / 1000 + NTP_UNIX_DELTA
  const whole = Math.floor(seconds)
  buffer.writeUInt32BE(whole >>> 0, offset)
  buffer.writeUInt32BE(Math.round((seconds - whole) * 2 ** 32) >>> 0, offset + 4)
}

/** Ask one server for the time; resolves with the four-timestamp result. */
function queryServer(host, { port = NTP_PORT, timeoutMs = 2500, signal } = {}) {
  return new Promise((resolve, reject) => {
    const packet = Buffer.alloc(PACKET_SIZE)
    /* LI 0, version 4, mode 3 (client); transmit timestamp filled in below. */
    packet[0] = 0x23
    const sentAt = Date.now()
    writeTimestamp(packet, 40, sentAt)

    const family = host.includes(':') ? 'udp6' : 'udp4'
    const socket = dgram.createSocket(family)
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      try {
        socket.close()
      } catch {
        /* already closed */
      }
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => finish(new Error(t('已取消')))
    const timer = setTimeout(() => {
      finish(new Error(t('${host} 未在 ${timeout} ms 内响应 SNTP 请求', { host, timeout: timeoutMs })))
    }, Math.max(300, timeoutMs))
    signal?.addEventListener?.('abort', onAbort, { once: true })

    socket.once('error', (error) => finish(error))
    socket.on('message', (message) => {
      /* Received first: the reply's own timestamps must be read against it. */
      const receivedAt = Date.now()
      if (message.length < PACKET_SIZE) {
        finish(new Error(t('SNTP 响应长度不合法（${size} 字节）', { size: message.length })))
        return
      }
      const mode = message[0] & 0x07
      const version = (message[0] >> 3) & 0x07
      if (mode !== 4) {
        finish(new Error(t('SNTP 响应模式不合法（mode=${mode}）', { mode })))
        return
      }
      const stratum = message[1]
      if (stratum === 0) {
        const code = message.toString('latin1', 12, 16).replace(/\u0000+$/, '')
        finish(new Error(t('服务器拒绝服务（KoD ${code}）', { code })))
        return
      }
      const receivedByServer = readTimestamp(message, 32)
      const transmittedByServer = readTimestamp(message, 40)
      const offset = ((receivedByServer - sentAt) + (transmittedByServer - receivedAt)) / 2
      const delay = (receivedAt - sentAt) - (transmittedByServer - receivedByServer)
      const rootDelay = message.readUInt32BE(4) / 65536
      const rootDispersion = message.readUInt32BE(8) / 65536
      finish(null, {
        host,
        version,
        stratum,
        offset,
        delay,
        rootDelay,
        rootDispersion,
        refId: message.toString('latin1', 12, 16).replace(/\u0000+$/, '').trim(),
        serverTime: transmittedByServer,
        receivedAt,
      })
    })

    socket.send(packet, port, host, (error) => {
      if (error) finish(error)
    })
  })
}

function formatMs(value) {
  const rounded = Math.round(Number(value) * 10) / 10
  return `${rounded >= 0 ? '+' : ''}${rounded} ms`
}

export function formatStamp(milliseconds) {
  const date = new Date(milliseconds)
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export async function sntpQuery(params = {}, emit, signal) {
  const servers = String(params.server ?? 'ntp.aliyun.com')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
  if (!servers.length) throw new Error(t('请填写 SNTP 服务器'))
  const port = clampNumber(Number(params.port) || NTP_PORT, 1, 65535, NTP_PORT)
  const timeoutMs = clampNumber(Number(params.timeout) || 2500, 500, 15000, 2500)

  emit({ t: 'log', d: t('向 ${count} 台服务器请求 SNTP（UDP ${port}）', { count: servers.length, port }) })
  const localBefore = Date.now()
  const offsets = []
  let answered = 0

  for (const server of servers) {
    if (signal?.aborted) break
    try {
      const result = await queryServer(server, { port, timeoutMs, signal })
      answered += 1
      offsets.push(result.offset)
      emit({
        t: 'rows',
        d: [{
          server,
          offset: formatMs(result.offset),
          delay: formatMs(result.delay),
          stratum: String(result.stratum),
          version: String(result.version),
          serverTime: formatStamp(result.serverTime),
          status: t('成功'),
        }],
      })
    } catch (error) {
      emit({
        t: 'rows',
        d: [{
          server,
          offset: '-',
          delay: '-',
          stratum: '-',
          version: '-',
          serverTime: '-',
          status: t('失败: ${error}', { error: String(error?.message ?? error) }),
        }],
      })
    }
  }

  const average = offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : 0
  const spread = offsets.length > 1 ? Math.max(...offsets) - Math.min(...offsets) : 0
  emit({
    t: 'kv',
    d: [
      { k: t('本机时间'), v: formatStamp(localBefore) },
      { k: t('平均偏移'), v: formatOffset(average) },
      { k: t('服务器间最大差异'), v: formatMs(spread) },
      { k: t('时钟状态'), v: clockVerdict(average, offsets.length) },
    ],
  })
  emit({
    t: 'stats',
    d: { [t('服务器')]: servers.length, [t('应答')]: answered, [t('无响应')]: servers.length - answered },
  })
  emit({ t: 'done', d: { servers: servers.length, answered } })
}

function formatOffset(value) {
  if (!Number.isFinite(value)) return '-'
  return formatMs(value)
}

/** Turn the offset into the sentence a person actually wants. */
function clockVerdict(offset, samples) {
  if (!samples) return t('没有服务器应答，无法判断')
  const absolute = Math.abs(offset)
  const direction = offset > 0 ? t('慢') : t('快')
  if (absolute < 500) return t('本机时钟准确（偏差 ${value}）', { value: formatMs(Math.abs(offset)) })
  if (absolute < 5000) return t('本机时钟比标准时间${direction} ${value}', { direction, value: formatMs(absolute) })
  return t('本机时钟偏差较大：比标准时间${direction} ${value}', { direction, value: formatMs(absolute) })
}
