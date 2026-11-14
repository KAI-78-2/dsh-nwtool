/**
 * Agent-facing tools. These are the same engines the panel calls, wrapped with
 * a model-readable schema so the assistant can run diagnostics itself
 * (Datacom ⑥ "接入 DSH，工具调用").
 */
import { CHEATSHEET } from './data.js'
import * as datacom from './datacom.js'
import { formatBufferedResult, runToolBuffered } from './engine.js'
import { t } from './i18n.js'
import * as term from './term.js'
import { expandTargets, intToIPv4, ipv4ToInt, isIPv4, maskToPrefix, subnetInfo } from './util.js'

function textTool({ name, description, parameters, timeoutMs = 180000, run }) {
  return {
    name,
    description,
    parameters,
    timeoutMs,
    output: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      render: (_args, value) => [
        { type: 'text', text: typeof value?.text === 'string' ? value.text : JSON.stringify(value ?? {}) },
      ],
    },
    async execute(args, exec) {
      const text = await run(args ?? {}, exec?.signal)
      return { text }
    },
  }
}

function buffered(tool, params, signal, limits) {
  return runToolBuffered(tool, params, signal, limits).then((result) => {
    const body = formatBufferedResult(result)
    return body || '（没有输出）'
  })
}

const HOST_PROP = { type: 'string', description: '目标主机名或 IP 地址' }

export function createToolDefinitions() {
  return [
    textTool({
      name: 'nwtool_ping',
      description: 'Ping a host over ICMP and report per-packet round-trip time, TTL and loss statistics. Use this to test reachability and latency.',
      parameters: {
        type: 'object',
        properties: {
          host: HOST_PROP,
          count: { type: 'number', description: 'Packet count, 1-100 (default 4)' },
          timeout: { type: 'number', description: 'Per-packet timeout in milliseconds (default 1000)' },
          size: { type: 'number', description: 'Payload size in bytes (default 32)' },
        },
        required: ['host'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('ping', { ...args, count: Math.min(Number(args.count) || 20, 100) }, signal),
    }),

    textTool({
      name: 'nwtool_tcping',
      description: 'Measure TCP connect latency to a host and port. Works when ICMP is filtered.',
      parameters: {
        type: 'object',
        properties: {
          host: HOST_PROP,
          port: { type: 'number', description: 'TCP port' },
          count: { type: 'number', description: 'Attempts, 1-50 (default 4)' },
          timeout: { type: 'number', description: 'Connect timeout in milliseconds (default 2000)' },
        },
        required: ['host', 'port'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('tcping', args, signal),
    }),

    textTool({
      name: 'nwtool_traceroute',
      description: 'Trace the network path to a host hop by hop with per-hop round-trip time and loss.',
      parameters: {
        type: 'object',
        properties: {
          host: HOST_PROP,
          maxHops: { type: 'number', description: 'Maximum hops (default 30)' },
          timeout: { type: 'number', description: 'Per-hop timeout in milliseconds (default 1500)' },
        },
        required: ['host'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('traceroute', args, signal),
    }),

    textTool({
      name: 'nwtool_dns',
      description: 'Query DNS for a name. Set `server` to query a specific resolver with a raw DNS message (dig semantics); omit it to use the system resolver.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Domain name to query' },
          type: { type: 'string', description: 'Record type such as A, AAAA, CNAME, MX, TXT, NS, SOA, SRV, ANY' },
          server: { type: 'string', description: 'Resolver IP address; omit to use the system resolver' },
          recursion: { type: 'boolean', description: 'Ask the resolver to recurse (default true)' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      run: (args, signal) => {
        if (args.server) return buffered('dig', args, signal)
        return buffered('dnsresolve', { host: args.name, types: [String(args.type ?? 'A').toUpperCase()] }, signal)
      },
    }),

    textTool({
      name: 'nwtool_http_request',
      description: 'Send an HTTP request from the machine running the harness and return status, headers, timing and body. Useful to check an API or web service.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Absolute http/https URL' },
          method: { type: 'string', description: 'HTTP method (default GET)' },
          headers: { type: 'object', description: 'Request headers as a name/value object', additionalProperties: true },
          body: { type: 'string', description: 'Request body for non-GET requests' },
          followRedirects: { type: 'boolean', description: 'Follow redirects (default true)' },
        },
        required: ['url'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('http', args, signal),
    }),

    textTool({
      name: 'nwtool_port_scan',
      description: 'TCP connect scan one host for open ports.',
      parameters: {
        type: 'object',
        properties: {
          host: HOST_PROP,
          ports: { type: 'string', description: 'Ports or ranges, such as "22,80,443" or "1-1024"' },
          timeout: { type: 'number', description: 'Connect timeout in milliseconds (default 800)' },
          concurrency: { type: 'number', description: 'Parallel probes (default 128)' },
        },
        required: ['host', 'ports'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('portscan', args, signal, { maxRows: 200 }),
    }),

    textTool({
      name: 'nwtool_ip_scan',
      description: 'Discover live hosts inside a subnet, address range or single address.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'CIDR (10.0.0.0/24), range (10.0.0.1-10.0.0.50) or a single address' },
          mode: { type: 'string', description: 'tcp, icmp or both (default tcp)' },
          ports: { type: 'string', description: 'Probe ports for tcp mode (default 80,443,22,445,3389)' },
          timeout: { type: 'number', description: 'Per-probe timeout in milliseconds (default 400)' },
        },
        required: ['target'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('ipscan', args, signal, { maxRows: 200 }),
    }),

    textTool({
      name: 'nwtool_subnet_calc',
      description: 'Pure subnet math: network, broadcast, usable range, wildcard mask and binary notation. Accepts an address with a prefix of either type.',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IPv4 address' },
          prefix: { type: 'number', description: 'Prefix length 0-32' },
          mask: { type: 'string', description: 'Mask in dotted form, used when prefix is omitted' },
          splitDepth: { type: 'number', description: 'Also list subnets after this many extra split bits, 1-4' },
        },
        required: ['ip'],
        additionalProperties: false,
      },
      run: (args) => {
        if (!isIPv4(args.ip)) throw new Error('需要合法的 IPv4 地址')
        const prefix = Number.isInteger(Number(args.prefix)) ? Number(args.prefix) : maskToPrefix(args.mask ?? '255.255.255.0')
        const info = subnetInfo(args.ip, prefix)
        const lines = Object.entries(info)
          .filter(([key]) => key !== 'binary')
          .map(([key, value]) => `${key}: ${value}`)
        lines.push(`binary.address: ${info.binary.address}`)
        lines.push(`binary.mask:    ${info.binary.mask}`)
        lines.push(`binary.network: ${info.binary.network}`)
        if (args.splitDepth) {
          const depth = Math.min(Math.max(Number(args.splitDepth), 1), 4)
          lines.push('', '子网划分:')
          const start = ipv4ToInt(info.network)
          for (let extra = 1; extra <= depth; extra += 1) {
            if (prefix + extra > 32) break
            const count = 2 ** extra
            const step = 2 ** (32 - prefix - extra)
            for (let index = 0; index < Math.min(count, 32); index += 1) {
              lines.push(`  ${intToIPv4(start + index * step)}/${prefix + extra}`)
            }
            if (count > 32) lines.push(`  …（共 ${count} 个子网）`)
          }
        }
        return lines.join('\n')
      },
    }),
    textTool({
      name: 'nwtool_sntp',
      description: 'Query NTP/SNTP servers over UDP and report how far this machine clock is off, with the round-trip delay and the server stratum. Read-only: the system clock is never changed.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'One or more servers, comma or space separated (default ntp.aliyun.com)' },
          port: { type: 'number', description: 'UDP port (default 123)' },
          timeout: { type: 'number', description: 'Per-server timeout in milliseconds (default 2500)' },
        },
        additionalProperties: false,
      },
      run: (args, signal) => buffered('sntp', args, signal),
    }),

    textTool({
      name: 'nwtool_ip_geolocation',
      description: 'Look up an IP address location, ISP and ASN from public providers. Private and reserved ranges are classified locally. Omit the address to look up this machine public egress IP first.',
      parameters: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IPv4 address; omit for this machine public egress' },
          timeout: { type: 'number', description: 'Per-provider timeout in milliseconds (default 5000)' },
        },
        additionalProperties: false,
      },
      run: (args, signal) => buffered('geo', args, signal),
    }),

    textTool({
      name: 'nwtool_local_ports',
      description: 'List the TCP/UDP sockets of the machine running the harness: local and remote address, state, owning process and PID. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'all, listen or established (default all)' },
          filter: { type: 'string', description: 'Keyword matched against address, port, process or PID' },
          limit: { type: 'number', description: 'Maximum rows (default 400)' },
        },
        additionalProperties: false,
      },
      run: (args, signal) => buffered('portstate', { ...args, limit: Math.min(Number(args.limit) || 200, 400) }, signal, { maxRows: 200 }),
    }),

    textTool({
      name: 'nwtool_arp_table',
      description: 'Read the ARP / neighbour cache of the machine running the harness: address, MAC, vendor and interface. Read-only: adding or deleting entries needs administrator rights and is only available in the panel.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: (_args, signal) => buffered('arp', { action: 'list' }, signal),
    }),
  ]
}

/* ------------------------------------------------------------------ */
/* Datacom tools                                                       */
/* ------------------------------------------------------------------ */

export function createDatacomToolDefinitions() {
  return [
    textTool({
      name: 'nwtool_backup_list',
      description: 'List configuration backups captured by the network toolbox, newest first.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        const backups = await datacom.listBackups()
        if (!backups.length) return '还没有任何备份。可在“设备配置采集”中执行采集，或让 agent 调用 nwtool_device_exec。'
        return backups
          .map((item) => `${item.id}\t${item.label}\t${item.host}\t${item.savedAt}\t${item.lines} 行\t${item.commands.join(' ; ')}`)
          .join('\n')
      },
    }),

    textTool({
      name: 'nwtool_backup_read',
      description: 'Read one stored configuration backup by id. Output is capped so it stays reviewable.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Backup id from nwtool_backup_list' },
          offset: { type: 'number', description: 'First line to return, 1-based (default 1)' },
          limit: { type: 'number', description: 'Maximum lines to return (default 200, max 800)' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      run: async (args) => {
        const content = await datacom.readBackup(args.id)
        const lines = content.split('\n')
        const offset = Math.max(1, Number(args.offset) || 1)
        const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 800)
        const slice = lines.slice(offset - 1, offset - 1 + limit)
        return `# ${args.id}（共 ${lines.length} 行，显示 ${offset}-${offset - 1 + slice.length}）\n${slice.join('\n')}`
      },
    }),

    textTool({
      name: 'nwtool_config_search',
      description: 'Search a configuration (a stored backup id or raw text) for a keyword and return matching lines with context.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Backup id to search' },
          text: { type: 'string', description: 'Raw configuration text to search instead of a backup' },
          pattern: { type: 'string', description: 'Keyword to find (case-insensitive)' },
          context: { type: 'number', description: 'Context lines before and after each match (default 2)' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
      run: async (args) => {
        const matches = await datacom.searchBackups(args)
        if (!matches.length) return `没有找到包含“${args.pattern}”的行`
        return matches.map((match) => `--- 第 ${match.line} 行 ---\n${match.around}`).join('\n')
      },
    }),

    textTool({
      name: 'nwtool_config_diff',
      description: 'Compare two configurations, either two stored backups or two raw texts, and report added/removed/changed lines.',
      parameters: {
        type: 'object',
        properties: {
          leftId: { type: 'string', description: 'Backup id for the left side' },
          rightId: { type: 'string', description: 'Backup id for the right side' },
          leftText: { type: 'string', description: 'Raw text for the left side' },
          rightText: { type: 'string', description: 'Raw text for the right side' },
        },
        additionalProperties: false,
      },
      run: (args, signal) => buffered('configdiff', args, signal),
    }),

    textTool({
      name: 'nwtool_device_exec',
      description: 'Run a list of read-only CLI commands on one or more network devices over SSH or Telnet, optionally archiving each output as a configuration backup. Prefer read-only commands (display/show).',
      parameters: {
        type: 'object',
        properties: {
          deviceText: { type: 'string', description: 'One device per line: host[:port] [ssh|telnet] [user] [password]' },
          commands: { type: 'string', description: 'One command per line, executed in order' },
          protocol: { type: 'string', description: 'Default protocol for devices without one (telnet or ssh)' },
          username: { type: 'string', description: 'Default username' },
          password: { type: 'string', description: 'Default password' },
          concurrency: { type: 'number', description: 'Devices in parallel, 1-8 (default 2)' },
          save: { type: 'boolean', description: 'Archive the output as a backup (default true)' },
        },
        required: ['deviceText', 'commands'],
        additionalProperties: false,
      },
      run: (args, signal) => buffered('deviceexec', args, signal, { maxSectionLines: 60 }),
    }),

    textTool({
      name: 'nwtool_snmp_identify',
      description: 'Identify one or more devices with SNMP v2c GET on the standard SYSTEM group: sysName, sysDescr, sysObjectID and uptime.',
      parameters: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Device address (single host)' },
          hosts: { type: 'string', description: 'Comma or space separated addresses (batch)' },
          community: { type: 'string', description: 'SNMP v2c community (default public)' },
          timeout: { type: 'number', description: 'Per-request timeout in milliseconds (default 3000)' },
        },
        additionalProperties: false,
      },
      run: (args, signal) => {
        if (args.hosts) return buffered('snmpmany', args, signal)
        return buffered('snmp', args, signal)
      },
    }),

    textTool({
      name: 'nwtool_command_reference',
      description: 'Look up the equivalent command across Huawei VRP/H3C Comware and Cisco IOS/NX-OS, for example "undo" vs "no" or "port link-type" vs "switchport mode".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword in the purpose or either command column, such as vlan, trunk, ospf, 保存' },
          category: { type: 'string', description: 'Optional category filter such as 路由, VLAN, ACL' },
        },
        additionalProperties: false,
      },
      run: async (args) => {
        const rows = datacom.searchCheatsheet(args.query, args.category)
        if (!rows.length) return `没有匹配“${args.query ?? ''}”的命令`
        return rows
          .slice(0, 120)
          .map((row) => `[${row.cat}] ${row.purpose}\n  VRP/H3C: ${row.vrp}\n  IOS/NX-OS: ${row.ios}`)
          .join('\n')
          .concat(`\n\n共 ${rows.length} 条（词表共 ${CHEATSHEET.length} 条）`)
      },
    }),

    textTool({
      name: 'nwtool_terminal',
      description: [
        'See or drive a live terminal session from the user\'s DSH web terminal panel (网络运维工具箱 → 终端 / 设备簿).',
        'Only sessions the user has explicitly shared are accessible: default is private, and the tool refuses otherwise.',
        'Actions: list (sessions and their share state), read (last lines of a session; pass the returned cursor as since to fetch only new output),',
        'send (type one command line, wait for the device prompt to settle, return the new output), key (send one control key: space for paging, ctrl-c to interrupt, enter, tab, escape, up, down).',
        'Dangerous commands (reboot/reload/erase/format/factory-reset/reset saved-configuration/delete/undo all) are held until the user approves them in the page; do not retry a refused command.',
        'The user can revoke sharing or press "收回控制" at any time, which interrupts the command.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'read', 'send', 'key'],
            description: 'What to do with the shared terminal session',
          },
          session: {
            type: 'string',
            description: 'Session id, or a fragment of the device name/host. Omit when exactly one session is shared.',
          },
          lines: { type: 'number', description: 'read: how many lines to return (default 80, max 400)' },
          since: { type: 'number', description: 'read: byte cursor from a previous read; returns only newer output' },
          line: { type: 'string', description: 'send: the command line to type (one line, CR is added automatically)' },
          key: {
            type: 'string',
            enum: ['enter', 'space', 'tab', 'escape', 'backspace', 'ctrl-c', 'ctrl-d', 'ctrl-z', 'ctrl-l', 'up', 'down'],
            description: 'key: the control key to send',
          },
          waitMs: { type: 'number', description: 'send: how long to wait for output to settle (default 15000, max 30000)' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      run: async (args) => {
        const action = String(args.action ?? '').toLowerCase()
        try {
          if (action === 'list') {
            const sessions = term.listSessions()
            if (!sessions.length) return t('终端里没有已连接的会话。先在「网络运维工具箱 → 终端 / 设备簿」里连接设备，再在标签上点「共享给 DSH」。')
            return sessions
              .map((session) => `${session.shared ? '[已共享]' : '[未共享]'} ${session.name} · ${session.host}:${session.port} · ${session.protocol} · ${session.state} · id=${session.id}`)
              .concat(t('共 ${count} 个会话；只有已共享的可以读取和操作。', { count: sessions.length }))
              .join('\n')
          }
          if (action === 'read') {
            const result = term.readSessionOutput(args.session, { since: args.since, lines: args.lines })
            const body = result.text || t('（没有输出）')
            return [
              `[${result.name} · ${result.host}]`,
              body,
              t('（光标 ${cursor}${truncated}）', {
                cursor: result.cursor,
                truncated: result.truncated ? t('，更早的输出已省略') : '',
              }),
            ].join('\n')
          }
          if (action === 'send') {
            if (!String(args.line ?? '').trim()) return t('send 需要 line 参数')
            const result = await term.sendSessionLine(args.session, args.line, { waitMs: args.waitMs })
            const body = result.text || t('（没有输出）')
            const notes = []
            if (result.cancelled) notes.push(t('用户已收回控制，命令被中断'))
            else if (result.timedOut) notes.push(t('等待超时，输出可能还没结束'))
            return [
              `[${result.name} · ${result.host}]`,
              `$ ${String(args.line).trim()}`,
              body.length > 12000 ? `${body.slice(0, 12000)}\n…` : body,
              ...(notes.length ? [`（${notes.join('；')}）`] : []),
              t('（光标 ${cursor}）', { cursor: result.cursor }),
            ].join('\n')
          }
          if (action === 'key') {
            const result = term.sendSessionKey(args.session, args.key)
            return t('已向 ${name} 发送按键 ${key}', { name: result.name, key: result.key })
          }
          return t('未知动作：${action}', { action })
        } catch (error) {
          return t('失败：${reason}', { reason: String(error?.message ?? error) })
        }
      },
    }),
  ]
}

/** Expand a target expression for callers that want the address list. */
export function describeTargets(expression, limit = 1024) {
  return expandTargets(expression, limit)
}
