// SNTP / geolocation / local sockets / ARP.
//
// The point is behaviour, not shape: a real UDP exchange with a fake time
// server, the offline geolocation path, this machine's own socket and neighbour
// tables, and the vendor parsers driven by captured CLI output.
import dgram from 'node:dgram'

import { ipGeo } from '../host/geo.js'
import { withLanguage } from '../host/i18n.js'
import { arpTable, parseArpUnix, parseArpWindows, portState } from '../host/local.js'
import { sntpQuery } from '../host/sntp.js'

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

function collector() {
  const events = []
  return { events, emit: (event) => events.push(event), of: (type) => events.filter((event) => event.t === type) }
}

/* ------------------------------------------------------------------ */
/* SNTP against a fake time server                                     */
/* ------------------------------------------------------------------ */

const NTP_DELTA = 2208988800

function writeStamp(buffer, offset, ms) {
  const seconds = ms / 1000 + NTP_DELTA
  const whole = Math.floor(seconds)
  buffer.writeUInt32BE(whole >>> 0, offset)
  buffer.writeUInt32BE(Math.round((seconds - whole) * 2 ** 32) >>> 0, offset + 4)
}

const SKEW_MS = 5000

const timeServer = dgram.createSocket('udp4')
timeServer.on('error', () => {})
timeServer.on('message', (message, remote) => {
  const reply = Buffer.alloc(48)
  reply[0] = 0x24 // LI 0, version 4, mode 4 (server)
  reply[1] = 2 // stratum 2
  reply[2] = 6 // poll
  writeStamp(reply, 16, Date.now()) // reference
  writeStamp(reply, 24, message.readUInt32BE(40) * 1000 - NTP_DELTA * 1000) // originate
  writeStamp(reply, 32, Date.now() + SKEW_MS) // receive (server thinks it is ahead)
  writeStamp(reply, 40, Date.now() + SKEW_MS) // transmit
  timeServer.send(reply, remote.port, remote.address)
})

const killed = dgram.createSocket('udp4')
killed.on('error', () => {})
killed.on('message', (message, remote) => {
  const reply = Buffer.alloc(48)
  reply[0] = 0x24
  reply[1] = 0 // stratum 0 = Kiss-o'-Death
  reply.write('RATE', 12, 'latin1')
  killed.send(reply, remote.port, remote.address)
})

const timePort = await new Promise((resolve) => timeServer.bind(0, '127.0.0.1', () => resolve(timeServer.address().port)))
const killedPort = await new Promise((resolve) => killed.bind(0, '127.0.0.1', () => resolve(killed.address().port)))

try {
  const sink = collector()
  await withLanguage('en', () => sntpQuery({ server: '127.0.0.1', port: timePort, timeout: 2000 }, sink.emit))
  const row = sink.of('rows')[0]?.d?.[0]
  expect('sntp gets an answer', row?.status === 'Success', JSON.stringify(row?.status))
  const offset = Number(String(row?.offset ?? '').replace(/[^\d.-]/g, ''))
  expect('sntp offset is close to the server skew', Math.abs(offset - SKEW_MS) < 500, `${row?.offset}`)
  expect('sntp reports the stratum', row?.stratum === '2', String(row?.stratum))
  expect('sntp explains the clock', sink.of('kv').length > 0, sink.of('kv')[0]?.d?.map((item) => `${item.k}=${item.v}`).join('; ').slice(0, 80))
} catch (error) {
  bad('sntp', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

try {
  const sink = collector()
  await withLanguage('zh', () => sntpQuery({ server: '127.0.0.1', port: killedPort, timeout: 1500 }, sink.emit))
  const status = sink.of('rows')[0]?.d?.[0]?.status ?? ''
  expect('sntp reports a KoD refusal', status.includes('失败'), status.slice(0, 60))
} catch (error) {
  bad('sntp KoD', String(error?.message ?? error))
}

try {
  const started = Date.now()
  const sink = collector()
  await withLanguage('zh', () => sntpQuery({ server: '127.0.0.1', port: 9, timeout: 600 }, sink.emit))
  const elapsed = Date.now() - started
  expect('sntp times out instead of hanging', elapsed < 5000, `${elapsed} ms`)
  expect('sntp failure is reported per server', String(sink.of('rows')[0]?.d?.[0]?.status ?? '').includes('失败'))
} catch (error) {
  bad('sntp timeout', String(error?.message ?? error))
}

timeServer.close()
killed.close()

/* ------------------------------------------------------------------ */
/* Geolocation                                                         */
/* ------------------------------------------------------------------ */

const realFetch = globalThis.fetch
let fetchCalls = []
let fetchPayload = null

globalThis.fetch = async (url) => {
  fetchCalls.push(String(url))
  return { ok: true, status: 200, text: async () => JSON.stringify(fetchPayload) }
}

try {
  fetchCalls = []
  const sink = collector()
  await withLanguage('zh', () => ipGeo({ ip: '192.168.1.5' }, sink.emit))
  const kv = sink.of('kv')[0]?.d ?? []
  const type = kv.find((item) => item.k === '类型')?.v ?? ''
  expect('geolocation classifies private ranges locally', type.includes('私有地址'), type)
  expect('geolocation does not call out for private ranges', fetchCalls.length === 0, String(fetchCalls.length))

  fetchCalls = []
  fetchPayload = {
    status: 'success',
    country: 'China',
    countryCode: 'CN',
    regionName: 'Beijing',
    city: 'Beijing',
    isp: 'China Telecom',
    org: 'China Telecom',
    as: 'AS4134',
    timezone: 'Asia/Shanghai',
    lat: 39.9,
    lon: 116.4,
    query: '8.8.8.8',
  }
  const sink2 = collector()
  await withLanguage('en', () => ipGeo({ ip: '8.8.8.8' }, sink2.emit))
  const info = sink2.of('kv')[0]?.d ?? []
  expect('geolocation uses the first provider', fetchCalls[0]?.includes('ip-api.com'), fetchCalls[0]?.slice(0, 40))
  expect('geolocation reports the city', info.find((item) => item.v === 'Beijing'))
  expect('geolocation reports the source', info.some((item) => item.v === 'ip-api.com'))

  /* A failing provider must fall through to the next one. */
  let attempt = 0
  globalThis.fetch = async (url) => {
    attempt += 1
    fetchCalls.push(String(url))
    if (attempt === 1) return { ok: false, status: 429, text: async () => 'rate limited' }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ country_name: 'Japan', region: 'Tokyo', city: 'Tokyo', org: 'Example', ip: '1.1.1.1' }),
    }
  }
  fetchCalls = []
  const sink3 = collector()
  await withLanguage('en', () => ipGeo({ ip: '1.1.1.1' }, sink3.emit))
  const info3 = sink3.of('kv')[0]?.d ?? []
  expect('geolocation falls back to the next provider', fetchCalls.length === 2, String(fetchCalls.length))
  expect('geolocation reports the fallback source', info3.some((item) => item.v === 'ipapi.co'),
    JSON.stringify(info3.map((item) => item.v).slice(-3)))
} catch (error) {
  bad('geolocation', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
} finally {
  globalThis.fetch = realFetch
}

/* ------------------------------------------------------------------ */
/* Local sockets and ARP cache                                         */
/* ------------------------------------------------------------------ */

try {
  const sink = collector()
  await withLanguage('en', () => portState({ state: 'listen', limit: 20 }, sink.emit))
  const rows = sink.of('rows')[0]?.d ?? []
  expect('port state lists listening sockets', rows.length > 0, `${rows.length} rows`)
  expect('port state names the process when it can', rows.every((row) => typeof row.process === 'string'))
  const stats = sink.of('stats')[0]?.d ?? {}
  expect('port state counts what it found', Number(stats.Listening) > 0, JSON.stringify(stats))
} catch (error) {
  bad('port state', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

/* Windows `arp -a`, two interface blocks and both entry types. */
const arpFixture = [
  '',
  '接口: 192.168.1.5 --- 0x8',
  '  Internet 地址         物理地址              类型',
  '  192.168.1.1           00-11-22-33-44-55     动态',
  '  192.168.1.20          00-aa-bb-cc-dd-ee     静态',
  '  192.168.1.255         ff-ff-ff-ff-ff-ff     静态',
  '',
].join('\r\n')
const parsedArp = parseArpWindows(arpFixture)
expect('arp parser reads windows entries', parsedArp.length === 3, JSON.stringify(parsedArp.map((entry) => entry.address)))
expect('arp parser keeps the interface', parsedArp[0]?.interface === '192.168.1.5', parsedArp[0]?.interface)
expect('arp parser keeps the entry type', parsedArp[0]?.type === '动态', parsedArp[0]?.type)

const neighFixture = [
  '192.168.1.1 dev eth0 lladdr 00:11:22:33:44:55 REACHABLE',
  '192.168.1.9 dev eth0  FAILED',
  'fe80::1 dev eth0 lladdr 00:11:22:33:44:66 router STALE',
].join('\n')
/* `ip neigh` also carries IPv6 entries; ARP is IPv4, so those are skipped. */
const parsedNeigh = parseArpUnix(neighFixture)
expect('arp parser reads linux neighbours', parsedNeigh.length === 2, JSON.stringify(parsedNeigh.map((entry) => entry.address)))
expect('arp parser skips IPv6 neighbours', !parsedNeigh.some((entry) => entry.address.includes(':')))
expect('arp parser keeps the neighbour state', parsedNeigh[0]?.state === 'REACHABLE', parsedNeigh[0]?.state)
expect('arp parser marks an unresolved neighbour', parsedNeigh[1]?.mac === null, String(parsedNeigh[1]?.mac))

try {
  const sink = collector()
  await withLanguage('en', () => arpTable({ action: 'list' }, sink.emit))
  const rows = sink.of('rows')[0]?.d ?? []
  expect('arp table runs on this machine', Array.isArray(rows), `${rows.length} rows`)
  expect('arp rows carry a vendor column', rows.every((row) => typeof row.vendor === 'string'))
} catch (error) {
  bad('arp table', String(error?.message ?? error))
}

/* ------------------------------------------------------------------ */

console.log(failures === 0 ? '\nthe new engines behave' : `\n${failures} new-engine check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
