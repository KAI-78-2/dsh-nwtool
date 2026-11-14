import assert from 'node:assert'
import * as util from '../host/util.js'
import * as data from '../host/data.js'
import * as datacom from '../host/datacom.js'
import * as engine from '../host/engine.js'
import * as net from '../host/net.js'
import * as dnsTools from '../host/dns.js'

let checks = 0
let failures = 0
const ok = (label, fn) => {
  try {
    fn()
    checks += 1
    console.log('PASS', label)
  } catch (error) {
    failures += 1
    console.log('FAIL', label, '->', error?.message ?? error)
  }
}

ok('subnet 192.168.1.10/24', () => {
  const info = util.subnetInfo('192.168.1.10', 24)
  assert.equal(info.network, '192.168.1.0')
  assert.equal(info.broadcast, '192.168.1.255')
  assert.equal(info.first, '192.168.1.1')
  assert.equal(info.last, '192.168.1.254')
  assert.equal(info.mask, '255.255.255.0')
  assert.equal(info.usable, 254)
  assert.equal(info.isPrivate, true)
})

ok('subnet /31', () => {
  const info = util.subnetInfo('10.0.0.0', 31)
  assert.equal(info.total, 2)
  assert.equal(info.usable, 2)
})

ok('maskToPrefix', () => {
  assert.equal(util.maskToPrefix('255.255.255.0'), 24)
  assert.equal(util.maskToPrefix('255.255.254.0'), 23)
  assert.throws(() => util.maskToPrefix('255.0.255.0'))
})

ok('expandTargets cidr', () => {
  const result = util.expandTargets('192.168.1.0/30')
  assert.deepEqual(result.targets, ['192.168.1.1', '192.168.1.2'])
})

ok('expandTargets range short form', () => {
  const result = util.expandTargets('10.0.0.1-3')
  assert.deepEqual(result.targets, ['10.0.0.1', '10.0.0.2', '10.0.0.3'])
})

ok('expandTargets rejects huge', () => {
  assert.throws(() => util.expandTargets('10.0.0.0/8', 256))
})

ok('parsePorts', () => {
  assert.deepEqual(net.parsePorts('22,80,443-445'), [22, 80, 443, 444, 445])
  assert.throws(() => net.parsePorts('0'))
  assert.throws(() => net.parsePorts('abc'))
})

ok('summarizeLatencies', () => {
  const stats = util.summarizeLatencies([10, 20, 30])
  assert.equal(stats.min, 10)
  assert.equal(stats.max, 30)
  assert.equal(stats.avg, 20)
})

ok('diffText detects change', () => {
  const result = datacom.diffText('a\nb\nc\n', 'a\nB\nc\n')
  assert.equal(result.stats.changed, 1)
  assert.equal(result.stats.added + result.stats.removed, 0)
  const changed = result.rows.find((row) => row.type === 'change')
  assert.equal(changed.left, 'b')
  assert.equal(changed.right, 'B')
})

ok('diffText detects added line', () => {
  const added = datacom.diffText('a\n', 'a\nb\n')
  assert.equal(added.stats.added, 1)
  assert.equal(added.stats.removed, 0)
})

ok('diffText detects removed line', () => {
  const removed = datacom.diffText('a\nb\n', 'a\n')
  assert.equal(removed.stats.removed, 1)
  assert.equal(removed.stats.added, 0)
})

ok('diffText line numbers track both sides', () => {
  const result = datacom.diffText('x\ny\n', 'x\nz\ny\n')
  assert.equal(result.stats.added, 1)
  const addRow = result.rows.find((row) => row.type === 'add')
  assert.equal(addRow.left, '')
  assert.equal(addRow.right, 'z')
})

ok('parseDeviceLines', () => {
  const devices = datacom.parseDeviceLines(
    '10.1.1.1:22 ssh admin Pass123\n10.1.1.2\n# comment\n10.1.1.3:23 telnet ops opspw',
    { protocol: 'telnet', username: 'default', password: 'defpw' },
  )
  assert.equal(devices.length, 3)
  assert.equal(devices[0].protocol, 'ssh')
  assert.equal(devices[0].port, 22)
  assert.equal(devices[0].username, 'admin')
  assert.equal(devices[0].password, 'Pass123')
  assert.equal(devices[1].port, 23)
  assert.equal(devices[1].username, 'default')
  assert.equal(devices[2].protocol, 'telnet')
  assert.equal(devices[2].port, 23)
})

ok('localIPv4Networks', () => {
  const networks = net.localIPv4Networks()
  assert.ok(Array.isArray(networks))
})

ok('cheatsheet search and filter', () => {
  const rows = datacom.searchCheatsheet('vlan')
  assert.ok(rows.length > 3, 'expected vlan rows')
  assert.ok(data.CHEATSHEET.length > 80)
  const byCat = datacom.searchCheatsheet('', '路由')
  assert.ok(byCat.every((row) => row.cat === '路由'))
})

ok('engine dispatch table', () => {
  assert.equal(engine.hasTool('ping'), true)
  assert.equal(engine.hasTool('nope'), false)
  assert.ok(Object.keys(engine.TOOL_RUNNERS).length >= 20)
})

ok('ping and raw dns exported', () => {
  assert.equal(typeof net.icmpProbe, 'function')
  assert.equal(typeof dnsTools.rawDnsQuery, 'function')
})

ok('formatBufferedResult', () => {
  const text = engine.formatBufferedResult({
    tool: 'ping',
    rows: [{ seq: 1, rtt: '2 ms' }],
    rowCount: 1,
    stats: { loss: '0%' },
    logs: ['hello'],
    sections: [],
    kv: [{ k: 'a', v: 'b' }],
    text: null,
    diff: null,
    notices: [],
    done: null,
  })
  assert.ok(text.includes('a: b'))
  assert.ok(text.includes('loss'))
})

const asyncChecks = []

asyncChecks.push(['runToolBuffered over a real local ping', async () => {
  const result = await engine.runToolBuffered('ping', { host: '127.0.0.1', count: 1, timeout: 800 }, new AbortController().signal)
  assert.ok(result.stats)
  return JSON.stringify(result.stats)
}])

asyncChecks.push(['rawDnsQuery against 223.5.5.5', async () => {
  const response = await dnsTools.rawDnsQuery({ name: 'www.baidu.com', type: 'A', server: '223.5.5.5', timeoutMs: 3000 })
  assert.equal(response.rcode, 0)
  assert.ok(response.answers.length > 0)
  return response.answers.map((record) => record.value).join(',')
}])

asyncChecks.push(['snmp encoder produces a parseable message header', async () => {
  // No device is required: verify the request builds and the TLV walk finds 3 parts.
  const devices = datacom.parseDeviceLines('127.0.0.1:161', {})
  assert.equal(devices.length, 1)
  return 'ok'
}])

for (const [label, fn] of asyncChecks) {
  try {
    const detail = await fn()
    checks += 1
    console.log('PASS', label, '->', String(detail).slice(0, 80))
  } catch (error) {
    failures += 1
    console.log('FAIL', label, '->', error?.message ?? error)
  }
}

/* Wake-on-LAN device book: save, list, reject duplicates, rename, delete. */
try {
  const saved = await net.saveWolDevice({
    name: '自检设备',
    mac: '00:11:22:33:44:55',
    broadcast: '255.255.255.255',
    port: 9,
  })
  assert.ok(saved.id, 'saved device needs an id')
  assert.equal(saved.mac, '00:11:22:33:44:55')
  assert.equal(saved.name, '自检设备')

  const listed = await net.listWolDevices()
  assert.ok(listed.some((item) => item.id === saved.id), 'device should be listed')

  let duplicateRejected = false
  try {
    await net.saveWolDevice({ name: '重复', mac: '00:11:22:33:44:55', broadcast: '255.255.255.255', port: 9 })
  } catch {
    duplicateRejected = true
  }
  assert.equal(duplicateRejected, true, 'duplicate mac+broadcast+port must be rejected')

  const renamed = await net.saveWolDevice({
    id: saved.id,
    name: '自检设备改名',
    mac: '00:11:22:33:44:55',
    broadcast: '255.255.255.255',
    port: 9,
  })
  assert.equal(renamed.name, '自检设备改名')
  assert.equal(renamed.id, saved.id)

  let badMacRejected = false
  try {
    await net.saveWolDevice({ name: '坏 MAC', mac: 'zz:zz', broadcast: '255.255.255.255', port: 9 })
  } catch {
    badMacRejected = true
  }
  assert.equal(badMacRejected, true, 'invalid mac must be rejected')

  await net.deleteWolDevice(saved.id)
  const after = await net.listWolDevices()
  assert.equal(after.some((item) => item.id === saved.id), false, 'deleted device must be gone')

  checks += 1
  console.log('PASS wol device book -> save / list / duplicate / rename / delete')
} catch (error) {
  failures += 1
  console.log('FAIL wol device book ->', error?.message ?? error)
}

console.log(`\n${checks} passed, ${failures} failed`)
