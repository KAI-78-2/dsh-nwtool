// Host-half localization: every engine must speak English when the browser asks
// for English, and keep speaking Chinese otherwise. This is the behavioural
// counterpart to verify-i18n.mjs, which only checks that every string is wrapped.
import { runTool } from '../host/engine.js'
import { withLanguage } from '../host/i18n.js'

const cases = [
  ['ping', { host: '127.0.0.1', count: 1, timeout: 800 }],
  ['tcping', { host: '127.0.0.1', port: 8434, count: 1, timeout: 1200 }],
  ['traceroute', { host: '127.0.0.1', maxHops: 3, timeout: 700 }],
  ['ipscan', { target: '127.0.0.0/30', mode: 'tcp', timeout: 250 }],
  ['portscan', { host: '127.0.0.1', ports: '8434', timeout: 600 }],
  ['dnsresolve', { host: 'www.baidu.com', types: ['A', 'NS'] }],
  ['dig', { host: 'www.baidu.com', type: 'A', server: '223.5.5.5' }],
  ['localinfo', {}],
  ['wol', { mac: '00:11:22:33:44:55' }],
  ['snmp', { host: '127.0.0.1', community: 'public', timeout: 600 }],
  ['configdiff', { leftText: 'interface Gi0/1\n speed 100', rightText: 'interface Gi0/1\n speed auto' }],
  ['iperf3', { host: '127.0.0.1', duration: 1 }],
  ['sntp', { server: '127.0.0.1', port: 9, timeout: 500 }],
  ['geo', { ip: '192.168.1.5' }],
  ['portstate', { state: 'listen', limit: 15 }],
  ['arp', { action: 'list' }],
]

const CJK = /[\u4e00-\u9fff]/

/**
 * Adapter names come from the operating system, not from this plugin: on a
 * Chinese Windows the NIC is literally called "以太网 8" whatever language the
 * panel is in. Everything else with Chinese in it must have been translated.
 */
const OS_DATA = /^(以太网|WLAN|无线网络连接|蓝牙网络连接|本地连接|vEthernet|以太网 \d)/

function collect(value, into) {
  if (typeof value === 'string') {
    into.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, into)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item, into)
  }
}

async function capture(language, tool, params) {
  const strings = []
  try {
    await withLanguage(language, () => runTool(tool, params, (event) => {
      collect(event.d, strings)
    }, new AbortController().signal))
  } catch {
    /* failures still render text; the strings are what matter */
  }
  return strings
}

let failures = 0
for (const [tool, params] of cases) {
  const english = await capture('en', tool, params)
  const chinese = await capture('zh', tool, params)

  const leaks = [...new Set(english.filter((text) => CJK.test(text) && !OS_DATA.test(text)))]
  const translated = english.filter((text) => text.trim()).length
  if (leaks.length === 0) {
    console.log(`ok   ${tool.padEnd(12)} en=${String(translated).padStart(3)} strings, no Chinese`)
  } else {
    failures += 1
    console.log(`FAIL ${tool.padEnd(12)} ${leaks.length} Chinese strings in English output`)
    for (const text of leaks.slice(0, 8)) console.log(`     · ${text.slice(0, 120)}`)
  }

  /* Sanity: the Chinese run must still be Chinese wherever the English run had text. */
  if (translated > 0 && chinese.length === 0) {
    failures += 1
    console.log(`FAIL ${tool.padEnd(12)} produced no output in Chinese`)
  }
}

console.log(failures === 0 ? `\n${cases.length} engines speak both languages` : `\n${failures} engine(s) leak Chinese`)
process.exit(failures === 0 ? 0 : 1)
