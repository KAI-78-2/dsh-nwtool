// Regression sweep over every engine with short parameters.
import { runTool } from '../host/engine.js'

const cases = [
  ['ping', { host: '127.0.0.1', count: 1, timeout: 800 }],
  ['tcping', { host: '127.0.0.1', port: 9106, count: 1, timeout: 1500 }],
  ['traceroute', { host: '127.0.0.1', maxHops: 3, timeout: 700 }],
  ['mtr', { host: '127.0.0.1', rounds: 1, maxHops: 3, timeout: 700 }],
  ['ipscan', { target: '127.0.0.0/30', mode: 'both', timeout: 250 }],
  ['portscan', { host: '127.0.0.1', ports: '9106', timeout: 500 }],
  ['lanscan', { timeout: 600, resolveHostname: false }],
  ['dnsbench', { domain: 'www.baidu.com', rounds: 1, timeout: 1500, servers: ['223.5.5.5', '119.29.29.29'] }],
  ['dnsresolve', { host: 'www.baidu.com', types: ['A', 'NS'] }],
  ['dig', { host: 'www.baidu.com', type: 'A', server: '223.5.5.5' }],
  ['whois', { domain: 'example.com' }],
  ['localinfo', {}],
  ['http', { url: 'https://www.baidu.com', method: 'HEAD' }],
  ['wol', { mac: '00:11:22:33:44:55' }],
  ['iperf3', { host: '127.0.0.1', duration: 1 }],
  ['diagnose', {}],
  ['snmp', { host: '127.0.0.1', community: 'public', timeout: 600 }],
  ['snmpmany', { hosts: '127.0.0.1', community: 'public', timeout: 600 }],
  ['configdiff', { leftText: 'a\nb', rightText: 'a\nc' }],
  ['deviceexec', { deviceText: '127.0.0.1:23', commands: 'display version', save: false }],
]

let failed = 0
for (const [tool, params] of cases) {
  const events = []
  const started = Date.now()
  try {
    await runTool(tool, params, (event) => {
      if (event.t === 'error') events.push(`error:${event.d}`)
      if (event.t === 'notice') events.push(`notice:${event.d}`)
    }, new AbortController().signal)
    const errorEvent = events.find((item) => item.startsWith('error:'))
    const ms = Date.now() - started
    if (errorEvent) {
      failed += 1
      console.log(`FAIL ${tool.padEnd(11)} ${ms}ms ${errorEvent.slice(0, 120)}`)
    } else {
      const notices = events.filter((item) => item.startsWith('notice:')).length
      console.log(`ok   ${tool.padEnd(11)} ${String(ms).padStart(5)}ms events=${events.length} notices=${notices}`)
    }
  } catch (error) {
    failed += 1
    console.log(`THROW ${tool.padEnd(10)} ${String(error?.message ?? error).slice(0, 120)}`)
  }
}
console.log(`\n${cases.length - failed}/${cases.length} engines completed`)
