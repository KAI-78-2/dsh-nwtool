/**
 * One dispatch table shared by the Web panel and the agent tools, so a tool
 * behaves identically whether a person or the model invokes it.
 */
import * as datacom from './datacom.js'
import * as dnsTools from './dns.js'
import * as geo from './geo.js'
import * as httpTools from './http.js'
import { t } from './i18n.js'
import * as local from './local.js'
import * as net from './net.js'
import * as sntp from './sntp.js'

export const TOOL_RUNNERS = {
  ping: net.ping,
  tcping: net.tcping,
  traceroute: net.traceroute,
  mtr: net.mtr,
  ipscan: net.ipScan,
  portscan: net.portScan,
  lanscan: net.lanScan,
  wol: net.wakeOnLan,
  localinfo: net.localInfo,
  speedtest: net.speedTest,
  iperf3: net.iperf3,
  diagnose: net.diagnose,
  dnsresolve: dnsTools.dnsResolve,
  dig: dnsTools.dig,
  dnsbench: dnsTools.dnsBench,
  whois: dnsTools.domainLookup,
  http: httpTools.httpRequest,
  deviceexec: datacom.deviceExec,
  configdiff: datacom.configDiff,
  snmp: datacom.snmpIdentify,
  snmpmany: datacom.snmpIdentifyMany,
  sntp: sntp.sntpQuery,
  geo: geo.ipGeo,
  portstate: local.portState,
  arp: local.arpTable,
}

export function hasTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOL_RUNNERS, name)
}

export async function runTool(name, params, emit, signal) {
  const runner = TOOL_RUNNERS[name]
  if (!runner) throw new Error(t('未知工具: ${name}', { name }))
  await runner(params ?? {}, emit, signal)
}

/**
 * Collect the events of one run into a compact result for agent tool output.
 * Long row lists and section bodies are truncated so a scan cannot flood the
 * model context.
 */
export async function runToolBuffered(name, params, signal, limits = {}) {
  const maxRows = limits.maxRows ?? 120
  const maxSectionLines = limits.maxSectionLines ?? 120
  const events = []
  let rows = []
  const stats = {}
  const logs = []
  const sections = []
  const kv = []
  let text = null
  let diff = null
  const notices = []
  let done = null

  const emit = (event) => {
    events.push(event)
    switch (event.t) {
      case 'rows':
        rows = event.replace ? [...event.d] : [...rows, ...event.d]
        break
      case 'clear':
        rows = []
        break
      case 'stats':
        Object.assign(stats, event.d)
        break
      case 'log':
        if (logs.length < 400) logs.push(String(event.d))
        break
      case 'sections':
        for (const section of event.d) {
          const lines = String(section.body ?? '').split('\n')
          const suffix = t('…（共 ${count} 行，已截断）', { count: lines.length })
          const truncated = lines.length > maxSectionLines ? `\n${suffix}` : ''
          sections.push({
            title: section.title,
            body: lines.slice(0, maxSectionLines).join('\n') + truncated,
          })
        }
        break
      case 'kv':
        kv.push(...event.d)
        break
      case 'text':
        text = String(event.d)
        break
      case 'diff':
        diff = event.d
        break
      case 'notice':
        notices.push(String(event.d))
        break
      case 'done':
        done = event.d
        break
      default:
        break
    }
  }

  await runTool(name, params, emit, signal)

  return {
    tool: name,
    rows: rows.slice(0, maxRows),
    rowCount: rows.length,
    stats,
    logs,
    sections,
    kv,
    text,
    diff: diff ? { stats: diffStats(diff.rows), rows: diff.rows.filter((row) => row.type !== 'same').slice(0, 200) } : null,
    notices,
    done,
  }
}

function diffStats(rows) {
  return {
    added: rows.filter((row) => row.type === 'add').length,
    removed: rows.filter((row) => row.type === 'del').length,
    changed: rows.filter((row) => row.type === 'change').length,
    same: rows.filter((row) => row.type === 'same').length,
  }
}

/** Render one buffered run as plain text for a model-facing tool result. */
export function formatBufferedResult(result) {
  const parts = []
  if (result.kv.length) {
    for (const item of result.kv) parts.push(`${item.k}: ${item.v}`)
  }
  if (result.stats && Object.keys(result.stats).length) {
    const summary = Object.entries(result.stats).map(([key, value]) => `${key}=${value}`).join('  ')
    parts.push('', t('统计: ${summary}', { summary }))
  }
  if (result.rows.length) {
    const keys = [...new Set(result.rows.flatMap((row) => Object.keys(row)))]
    parts.push('', keys.join('\t'))
    for (const row of result.rows) parts.push(keys.map((key) => String(row[key] ?? '')).join('\t'))
    if (result.rowCount > result.rows.length) parts.push(t('…（共 ${count} 行，已截断）', { count: result.rowCount }))
  }
  if (result.text) parts.push('', result.text)
  if (result.diff) {
    const { added, removed, changed } = result.diff.stats
    parts.push('', t('差异统计: 新增 ${added} / 删除 ${removed} / 修改 ${changed}', { added, removed, changed }))
    for (const row of result.diff.rows.slice(0, 80)) {
      parts.push(`- ${row.left}`, `+ ${row.right}`)
    }
  }
  for (const section of result.sections) {
    parts.push('', `## ${section.title}`, section.body)
  }
  if (result.notices.length) parts.push('', ...result.notices.map((notice) => t('注意: ${notice}', { notice })))
  if (result.logs.length) parts.push('', ...result.logs.slice(-60))
  return parts.join('\n').trim()
}
