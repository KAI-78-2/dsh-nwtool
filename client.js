/**
 * Network operations toolbox — Web half.
 *
 * Registers a sidebar panel icon and the main panel it opens. All network work
 * happens on the Host through `POST /nwtool/api`, which streams NDJSON events
 * so a scan or an MTR run renders while it is still running.
 *
 * Visual state (selection, hover, focus, motion) is expressed exclusively
 * through CSS classes so a re-render can never leave a stale highlight behind.
 */
window.__ModuleLoader__.load({
  id: 'dsh-nwtool',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = React

    const API = '/nwtool/api'
    const PANEL_ID = 'nwtool'
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
    const PRODUCT = 'DSH-NWTool'
    const VERSION = '1.0.0'

    /* ------------------------------------------------------------ */
    /* Language                                                      */
    /* ------------------------------------------------------------ */

    /**
     * Translation: Chinese is the source language, so every message in this file
     * is authored in Chinese and `locale/messages.json` maps that exact text to
     * other languages. The catalog below is generated — run
     * `node scripts/sync-messages.mjs` after editing the JSON; never edit the
     * marked block by hand.
     */
    /* i18n:messages:start */
    const MESSAGES = {
      "en": {
        "# 厂商: ${vendor}": "# Vendor: ${vendor}",
        "# 命令: ${commandText}": "# Commands: ${commandText}",
        "# 地址: ${host}": "# Address: ${host}",
        "# 设备: ${deviceLabel}": "# Device: ${deviceLabel}",
        "# 采集时间: ${collectedAt}": "# Collected at: ${collectedAt}",
        "${action}「${name}」": "${action} \"${name}\"",
        "${amount} 分钟${past}": "${amount} minutes ${past}",
        "${amount} 天${past}": "${amount} days ${past}",
        "${amount} 小时${past}": "${amount} hours ${past}",
        "${amount} 秒${past}": "${amount} seconds ${past}",
        "${command}: 无输出（退出码 ${code}）${detail}": "${command}: no output (exit code ${code})${detail}",
        "${command}: 未找到": "${command}: not found",
        "${command}: 未返回网卡": "${command}: no adapters returned",
        "${command}: 输出解析失败 ${detail}": "${command}: failed to parse output ${detail}",
        "${count} 份": "${count} backups",
        "${count} 台": "${count} devices",
        "${count} 条": "${count} rows",
        "${days}天 ${hours}时 ${minutes}分 ${seconds}秒": "${days}d ${hours}h ${minutes}m ${seconds}s",
        "${elapsed} ms（首字节 ${firstByte} ms）": "${elapsed} ms (first byte ${firstByte} ms)",
        "${gateway} 不可达": "${gateway} unreachable",
        "${gateway} 可达 ${ms} ms": "${gateway} reachable in ${ms} ms",
        "${host} 未响应 SNMP 请求（community=${community}）": "${host} did not respond to SNMP request (community=${community})",
        "${host} 未在 ${timeout} ms 内响应 SNTP 请求": "${host} did not answer the SNTP request within ${timeout} ms",
        "${label} 已复制到剪贴板": "${label} copied to clipboard",
        "${mac} 已在列表中": "${mac} is already in the list",
        "${mac} 已经在列表里了": "${mac} already exists in the list",
        "${provider}: 空响应": "${provider}: empty response",
        "${question}\\n\\n以下是设备配置（来自备份 ${selected}）：\\n\\n\\`\\`\\`\\n${content.slice(0, 60000)}\\n\\`\\`\\`": "${question}\\n\\nHere is the device configuration (from backup ${selected}):\\n\\n\\`\\`\\`\\n${content.slice(0, 60000)}\\n\\`\\`\\`",
        "${size} 字节": "${size} bytes",
        "+1 天": "+1 day",
        "+1 小时": "+1 hour",
        "10.0.0.0/24 或 10.0.0.1-100": "10.0.0.0/24 or 10.0.0.1-100",
        "114 DNS 主": "114 DNS Primary",
        "114 DNS 备": "114 DNS Secondary",
        "22,80,443 或 1-1024": "22,80,443 or 1-1024",
        "32 位整数在十进制/十六进制/二进制/八进制之间换算，可逐位开关，也能做移位与逻辑运算。": "Convert a 32-bit integer between decimal, hexadecimal, binary and octal, toggle individual bits, and run shifts or logic operations.",
        "32 位整数换算与按位切换：十进制/十六进制/二进制/八进制互转、逐位开关、移位与逻辑运算。": "32-bit integer conversion and bit toggling: decimal, hex, binary and octal, one switch per bit, shifts and logic operations.",
        "32 位无符号整数。点任意一位翻转（高位在左）；有符号十进制按二进制补码解释。": "A 32-bit unsigned integer. Click any bit to toggle it (most significant first); the signed decimal reading uses two’s complement.",
        "8.8.8.8 或 www.baidu.com": "8.8.8.8 or www.baidu.com",
        "; <<>> dig ${type} ${host} @${server} （递归 ${state}）": "; <<>> dig ${type} ${host} @${server} (recursion ${state})",
        "AAA 认证模板": "AAA authentication template",
        "ACL 规则": "ACL rules",
        "ACL 计数": "ACL counters",
        "ARP 列表": "ARP table",
        "ARP 缓存是空的（没有最近通信过的邻居）": "The ARP cache is empty (no neighbour has been contacted recently)",
        "ARP 表为空，可能需要先与本网段通信或提升权限": "ARP table is empty; you may need traffic on this subnet first or elevated privileges",
        "ASN": "ASN",
        "Access 口": "Access port",
        "AdGuard 去广告 DNS": "AdGuard Ad-blocking DNS",
        "AliDNS 阿里": "AliDNS Alibaba",
        "BGP 邻居": "BGP neighbor",
        "BPDU 保护": "BPDU protection",
        "BaiduDNS 百度": "BaiduDNS",
        "B（字节）": "B (bytes)",
        "CPU / 内存 / 负载 / 磁盘 / 网卡": "CPU / memory / load / disk / network",
        "Cloudflare 备用": "Cloudflare Backup",
        "DNS 服务器": "DNS server",
        "DNS 服务器不可达，域名解析会失败，但 IP 直连可能仍然正常。": "DNS server unreachable; name resolution will fail, but direct IP connections may still work.",
        "DNS 服务器（留空用系统）": "DNS server (blank = system)",
        "DNSPod 腾讯": "DNSPod Tencent",
        "Datacom · 探测 · 诊断": "Datacom · probes · diagnostics",
        "Datacom 运维": "Datacom operations",
        "FTP 上传": "FTP upload",
        "GB（1000³）": "GB (1000³)",
        "GiB（1024³）": "GiB (1024³)",
        "Google Public DNS 主": "Google Public DNS Primary",
        "Google Public DNS 备": "Google Public DNS Secondary",
        "HSRP/VRRP + SSO（平台相关）": "HSRP/VRRP + SSO (platform-dependent)",
        "HTTP 大文件上下行吞吐，默认走 Cloudflare 端点；单节点结果不能代表整条链路带宽。": "Up/down throughput over a large HTTP transfer, using Cloudflare endpoints by default. A single node does not represent the whole path.",
        "HTTP 工具": "HTTP tools",
        "Hybrid 口（华为特有）": "Hybrid port (Huawei-specific)",
        "IBM Quad9 安全 DNS": "IBM Quad9 Secure DNS",
        "ICMP 回环测试：逐包往返时间、TTL 与丢包统计。使用系统 ping，无需管理员权限。": "ICMP echo test: per-packet round-trip time, TTL and loss statistics. Uses system ping; no administrator privileges required.",
        "IP 地址": "IP address",
        "IP 地址格式不正确": "Invalid IP address format",
        "IP 地址（未关联时可手填）": "IP address (fill in when not bound)",
        "IP 地址（添加 / 删除时必填）": "IP address (required to add or delete)",
        "IP 地址（添加时必填）": "IP address (required to add)",
        "IP 地址（留空 = 本机公网出口）": "IP address (empty = this machine public egress)",
        "IP 地理定位": "IP geolocation",
        "IP 扫描": "IP scan",
        "IP 计算器": "IP calculator",
        "IPv4 地址格式不正确: ${address}": "Not a valid IPv4 address: ${address}",
        "IPv6 邻居": "IPv6 neighbor",
        "KB（1000）": "KB (1000)",
        "KiB（1024）": "KiB (1024)",
        "LACP 模式": "LACP mode",
        "LCS 逐行对比，按新增/删除/修改着色；左右两侧都可以直接粘文本，也可以选两份备份。": "Line-by-line LCS diff coloured by added/removed/changed. Either side accepts pasted text or a stored backup.",
        "LLDP / CDP 拓扑": "LLDP / CDP topology",
        "Level3 公共 DNS": "Level3 Public DNS",
        "MAC 地址": "MAC address",
        "MAC 地址格式不正确，例如 00:11:22:33:44:55": "Invalid MAC address format, e.g. 00:11:22:33:44:55",
        "MAC 地址（添加时必填）": "MAC address (required to add)",
        "MB（1000²）": "MB (1000²)",
        "MiB（1024²）": "MiB (1024²)",
        "NAT 内外接口": "NAT inside/outside interfaces",
        "NAT 地址池": "NAT address pool",
        "NS 服务器": "NS servers",
        "OSPF 区域与网段": "OSPF area and subnet",
        "OSPF 进程": "OSPF process",
        "OneDNS 主": "OneDNS Primary",
        "OneDNS 南北": "OneDNS North-South",
        "OneDNS 南北互通": "OneDNS North-South Interconnect",
        "OneDNS 备": "OneDNS Secondary",
        "PING ${target} · 大小 ${size} 字节 · ${count} 次": "PING ${target} · size ${size} bytes · ${count} times",
        "RDAP 查询失败（${reason}），改用 whois 43 端口": "RDAP query failed (${reason}); falling back to whois port 43",
        "SNMP v2c GET 读 SYSTEM 组（sysName / sysDescr / sysObjectID / 运行时长），并据此推断厂商。": "SNMP v2c GET on the SYSTEM group (sysName / sysDescr / sysObjectID / uptime), and guesses the vendor from it.",
        "SNMP v2c 读取 SYSTEM 组：sysName / sysDescr / sysObjectID / 运行时长，比 MAC 猜厂商准确得多。": "Reads the SNMP v2c SYSTEM group: sysName / sysDescr / sysObjectID / uptime, far more accurate than guessing the vendor from a MAC.",
        "SNMP 响应解析失败: ${problem}": "SNMP response parse failed: ${problem}",
        "SNMP 设备识别": "SNMP device identification",
        "SNTP 响应模式不合法（mode=${mode}）": "The SNTP reply has an invalid mode (mode=${mode})",
        "SNTP 响应长度不合法（${size} 字节）": "The SNTP reply has an invalid length (${size} bytes)",
        "SNTP 查询": "SNTP query",
        "SSH 与 Telnet 交互终端：保存设备、一键连接交换机与 Linux 主机，支持 UTF-8/GBK 编码切换。": "Interactive SSH and Telnet terminal: save devices, connect to switches and Linux hosts in one click, and switch between UTF-8 and GBK.",
        "SSH 私钥": "SSH private key",
        "SSH/Telnet 批量执行命令，自动翻页；输出可归档到本机备份库，供配置对比与提问使用。": "Runs commands over SSH/Telnet in batch with automatic paging; the output can be archived as a backup for diffing and questions.",
        "SSH/Telnet 批量连接华为 VRP、H3C、思科 IOS/NX-OS，执行命令、自动处理分页并把配置归档到本地。": "Connects to Huawei VRP, H3C and Cisco IOS/NX-OS devices in bulk over SSH/Telnet, runs commands, handles paging automatically and archives configurations locally.",
        "SYN 快扫与原始套接字抓包未包含在内。": "SYN fast scan and raw-socket packet capture are not included.",
        "TB（1000⁴）": "TB (1000⁴)",
        "TCP": "TCP",
        "TCP ${port} 开放": "TCP ${port} open",
        "TCP ${target} · ${count} 次": "TCP ${target} · ${count} attempts",
        "TCP 443 出站": "TCP 443 outbound",
        "TCP 443 出站失败：可能存在防火墙/代理拦截。": "TCP 443 outbound failed: a firewall or proxy may be blocking it.",
        "TCP connect 扫描（不需管理员权限），可选取 banner 识别服务。": "TCP connect scan (no administrator privileges needed); optionally grabs banners to identify services.",
        "TCP connect 扫描，会与目标建立完整连接；开启 banner 抓取会多花几百毫秒，但能看出协议与版本。": "A TCP connect scan establishes a full connection. Grabbing banners costs a few hundred milliseconds but reveals the protocol and version.",
        "TCP 探测端口": "TCP probe ports",
        "TCP 模式只探测列出的端口，ICMP 模式需要系统允许发 ping。同一网段建议先用「扫描局域网」，快得多。": "TCP mode only probes the listed ports; ICMP mode needs ping to be allowed. On the local subnet \"Scan LAN\" is much faster.",
        "TCP 端口探测": "TCP port probe",
        "TFTP 上传": "TFTP upload",
        "TiB（1024⁴）": "TiB (1024⁴)",
        "Trunk 口": "Trunk port",
        "UDP": "UDP",
        "UDP 带宽（如 100M）": "UDP bandwidth (e.g. 100M)",
        "UDP 模式": "UDP mode",
        "UDP 端口": "UDP port",
        "UTC+9 东京": "UTC+9 Tokyo",
        "UTC-5 纽约": "UTC-5 New York",
        "Unix 毫秒": "Unix milliseconds",
        "Unix 秒": "Unix seconds",
        "VLAN 命名": "VLAN naming",
        "VRP / IOS 命令速查": "VRP / IOS command reference",
        "VRRP（华为）/ HSRP（思科）": "VRRP (Huawei) / HSRP (Cisco)",
        "VTY 认证": "VTY authentication",
        "WHOIS 查询失败: ${reason}": "WHOIS query failed: ${reason}",
        "[${deviceName}] 备份保存失败: ${problem}": "[${deviceName}] failed to save backup: ${problem}",
        "[${deviceName}] 已备份 → ${id}": "[${deviceName}] backed up → ${id}",
        "[${deviceName}] 输出看起来包含设备配置": "[${deviceName}] output appears to contain device configuration",
        "[${label}] ${command} 失败: ${error}": "[${label}] ${command} failed: ${error}",
        "[${label}] ${command} 得到 ${count} 条邻居": "[${label}] ${command} returned ${count} neighbour(s)",
        "[${label}] 失败: ${error}": "[${label}] failed: ${error}",
        "[${label}] 登录成功，开始执行 ${count} 条命令": "[${label}] login succeeded, executing ${count} commands",
        "[${label}] 连接 ${host}:${port} (${protocol})": "[${label}] connecting to ${host}:${port} (${protocol})",
        "[${label}] 采集失败: ${error}": "[${label}] collection failed: ${error}",
        "interface Vlan10 / ip helper-address 10.1.1.5（中继）": "interface Vlan10 / ip helper-address 10.1.1.5 (relay)",
        "iperf3 ${args}（测试 ${duration} 秒）": "iperf3 ${args} (${duration} s test)",
        "iperf3 失败: ${reason}": "iperf3 failed: ${reason}",
        "iperf3 输出无法解析": "Cannot parse iperf3 output",
        "mtr ${label} · ${rounds} 轮 · 每轮一次 ${command}": "mtr ${label} · ${rounds} rounds · one ${command} per round",
        "ping 不可用: ${detail}": "ping unavailable: ${detail}",
        "traceroute ${label} · 最多 ${maxHops} 跳（${command}）": "traceroute ${label} · up to ${maxHops} hops (${command})",
        "vlan、trunk、ospf、undo、保存…": "vlan, trunk, ospf, undo, save…",
        "whois 查询超时": "whois query timed out",
        "—— 诊断结论 ——": "—— Diagnosis ——",
        "…（共 ${count} 行，已截断）": "…(total ${count} rows, truncated)",
        "一次最多扫描 5000 个端口（当前 ${total}）": "Up to 5000 ports per scan (currently ${total})",
        "上一级": "Up one level",
        "上传": "Upload",
        "上传 (本机→服务端)": "Upload (local→server)",
        "上传失败: ${detail}": "Upload failed: ${detail}",
        "上次唤醒": "Last wake",
        "下载": "Download",
        "下载 (服务端→本机)": "Download (server→local)",
        "下载 iperf3 for Windows 压缩包，解压出 iperf3.exe，放到上面的目录里即可；本工具会先查这里，再查 PATH": "Download the iperf3 for Windows archive, extract iperf3.exe and put it in the directory above; this tool looks there first, then on PATH",
        "下载 iperf3 for Windows 并解压，把 iperf3.exe 放进 PATH 或与本工具同目录": "Download iperf3 for Windows, unzip it, and put iperf3.exe in PATH or in the same directory as this tool",
        "下载地址": "Download URL",
        "下载失败: ${detail}": "Download failed: ${detail}",
        "下载测速 ${url}": "Download test ${url}",
        "下载量": "Download size",
        "不支持的记录类型": "Unsupported record type",
        "不支持的记录类型: ${type}": "Unsupported record type: ${type}",
        "不通": "Unreachable",
        "与另一个值运算": "Operate with another value",
        "丢包": "Loss",
        "丢包率": "Loss",
        "中国电信上海": "China Telecom Shanghai",
        "中国电信北京": "China Telecom Beijing",
        "中国电信四川": "China Telecom Sichuan",
        "中国电信广东": "China Telecom Guangdong",
        "中国联通上海": "China Unicom Shanghai",
        "中国联通北京": "China Unicom Beijing",
        "中间跳": "Intermediate hop",
        "为什么硬盘标称和系统显示不一样": "Why the label and the operating system disagree",
        "主机名": "Hostname",
        "事务 ID 不匹配": "Transaction ID mismatch",
        "二进制": "Binary",
        "二进制地址": "Binary address",
        "二进制掩码": "Binary mask",
        "二进制网络": "Binary network",
        "云": "Cloud",
        "交换机": "Switch",
        "仅已建立": "Established only",
        "仅监听": "Listening only",
        "从粘贴内容解析出 ${count} 条邻居": "Parsed ${count} neighbour(s) from the pasted text",
        "以下设备没有返回邻居: ${list}": "These devices returned no neighbours: ${list}",
        "优先 RDAP（JSON 接口），失败再回退到 whois:43 原始文本；域名与 IP 都接受。": "Tries RDAP (JSON) first and falls back to raw whois:43 text. Domains and IP addresses are both accepted.",
        "优先使用 RDAP（JSON 结构），失败时回退到 whois 43 端口原始文本。": "Prefers RDAP (JSON structure) and falls back to raw whois text on port 43.",
        "会话不存在": "Session not found",
        "会话已结束": "Session ended",
        "会话已结束（${reason}）": "Session ended (${reason})",
        "传输量": "Traffic",
        "位宽": "Bit width",
        "位置": "Location",
        "位计算器": "Bit calculator",
        "例如：机房核心交换机": "e.g. Data center core switch",
        "例如：核心交换机": "e.g. Core switch",
        "依据": "Detected by",
        "保存中…": "Saving…",
        "保存密码（本机加密）": "Save password (encrypted locally)",
        "保存设备": "Save device",
        "保存配置": "Save configuration",
        "修改": "Changed",
        "值": "Value",
        "停止": "Stop",
        "先 ICMP 再 TCP": "ICMP then TCP",
        "先向网段发 UDP 触发 ARP，再读本机 ARP 表，所以只限同一广播域；跨网段请用 IP 扫描。厂商来自离线 OUI 子集。": "Sends UDP across the subnet to populate ARP, then reads the local ARP table, so it only covers one broadcast domain; use IP scan across subnets. Vendors come from the offline OUI subset.",
        "先在列表里选中一台设备": "Select a device in the list first",
        "先在列表里选中一条": "Select a row in the table first",
        "先填写 IP 与 MAC": "Fill in both IP and MAC first",
        "先连接一台设备": "Connect a device first",
        "全国": "Nationwide",
        "全国公共 DNS 测试": "Nationwide public DNS test",
        "全局关闭 STP": "Disable STP globally",
        "全部": "All",
        "全部删除": "Delete all",
        "全部地理定位服务都不可用: ${detail}": "No geolocation provider is reachable: ${detail}",
        "全部服务无响应": "every provider was silent",
        "八进制": "Octal",
        "公网 IP 查询失败：${reasons}": "Public IP lookup failed: ${reasons}",
        "公网出口": "Public egress",
        "公网出口 IP": "Public egress IP",
        "共": "Total",
        "共 ${count} 台设备，并发 ${concurrency}": "${count} device(s), concurrency ${concurrency}",
        "共 ${deviceCount} 台设备 · ${commandCount} 条命令 · 并发 ${concurrency}": "${deviceCount} devices · ${commandCount} commands · Concurrency ${concurrency}",
        "共 ${total} 条，只显示前 ${shown} 条": "${total} entries; showing the first ${shown}",
        "关联设备": "Bound device",
        "关联设备…": "Bind a device…",
        "关键字（地址 / 端口 / 进程）": "Keyword (address / port / process)",
        "关闭": "off",
        "关闭分屏": "Disable paging",
        "关闭接口": "Shut down interface",
        "关闭文件": "Close files",
        "关闭未用端口": "Shut down unused ports",
        "关闭标签页": "Close tab",
        "关闭监控": "Stop monitoring",
        "其他": "Other",
        "内存": "Memory",
        "写入 ARP 缓存需要管理员权限，请以管理员身份运行 DSH 后重试": "Writing the ARP cache needs administrator rights: restart DSH as administrator and retry",
        "写入邻居表需要 root 权限，请用 sudo 启动 DSH 后重试": "Writing the neighbour table needs root: start DSH with sudo and retry",
        "出口探测来源": "Egress probe source",
        "分类": "Category",
        "分组": "Group",
        "列出本机 TCP/UDP 套接字：监听端口、已建立连接、对应进程与 PID。只读，不修改任何配置。": "List this machine TCP/UDP sockets: listening ports, established connections, owning process and PID. Read-only; nothing is changed.",
        "列出本机网卡、地址、网关、DNS、MAC 与公网出口 IP。Windows 下读取 Get-NetIPConfiguration。": "Lists local NICs, addresses, gateway, DNS, MAC and public egress IP. On Windows it reads Get-NetIPConfiguration.",
        "创建 Eth-Trunk": "Create Eth-Trunk",
        "创建 VLAN": "Create VLAN",
        "创建基本 ACL": "Create basic ACL",
        "创建时间": "Created",
        "创建本地用户": "Create local user",
        "创建高级 ACL": "Create advanced ACL",
        "删除": "Delete",
        "删除全部": "Delete all",
        "删除单条": "Delete one entry",
        "删除失败: ${detail}": "Delete failed: ${detail}",
        "删除拓扑": "Delete topology",
        "删除文件": "Delete file",
        "删除矩形框": "Delete frame",
        "删除设备": "Delete device",
        "删除连线": "Delete link",
        "删除选中的条目": "Delete the selected entry",
        "删除静态路由": "Delete static route",
        "到期时间": "Expires",
        "到达目标": "Target reached",
        "刷新": "Refresh",
        "前": "ago",
        "前缀": "Prefix",
        "前缀长度 (0-32)": "Prefix length (0-32)",
        "前缀长度需为 0-32": "Prefix length must be 0-32",
        "加入成员口": "Add member ports",
        "动态": "Dynamic",
        "动态 ARP 检测": "Dynamic ARP inspection",
        "包大小 (字节)": "Packet size (bytes)",
        "北京时间 (UTC+8)": "Beijing time (UTC+8)",
        "匹配": "Match",
        "区域": "Region",
        "十六进制": "Hexadecimal",
        "十六进制字节": "Hexadecimal bytes",
        "十六进制（按字节）": "Hexadecimal (by byte)",
        "十进制": "Decimal",
        "十进制（KB/MB/GB/TB）与二进制（KiB/MiB/GiB/TiB）两套口径同时给出；硬盘标称差是单位不同，不是容量缩水。": "Both decimal (KB/MB/GB/TB) and binary (KiB/MiB/GiB/TiB) readings are shown; the drive-size difference is the unit, not lost capacity.",
        "十进制（无符号）": "Decimal (unsigned)",
        "十进制（有符号）": "Decimal (signed)",
        "华东": "East China",
        "华为 VRP / H3C": "Huawei VRP / H3C",
        "华为 VRP / H3C Comware 与思科 IOS / NX-OS 的命令对照，支持中英文关键字与分类过滤。": "Command equivalents across Huawei VRP / H3C Comware and Cisco IOS / NX-OS, searchable by keyword in Chinese or English and filterable by category.",
        "华为 VRP/H3C Comware 与思科 IOS/NX-OS 命令对照，可搜索。": "Searchable command mapping between Huawei VRP/H3C Comware and Cisco IOS/NX-OS.",
        "华北": "North China",
        "华南": "South China",
        "协议": "Protocol",
        "单个地址，或用下方批量框": "Single address, or use the batch box below",
        "单位": "Unit",
        "单包超时 (ms)": "Per-packet timeout (ms)",
        "单包默认 32 字节、间隔 1 秒。RTT 从系统 ping 输出解析，<1 表示不足 1 ms；测 MTU 可以把包大小调到 1400 再试。": "32-byte packets, one per second by default. RTT is parsed from the system ping output; <1 means under 1 ms. To probe the MTU, try a packet size around 1400.",
        "单跳超时 (ms)": "Per-hop timeout (ms)",
        "厂商": "Vendor",
        "厂商推断": "Vendor inference",
        "厂商标称用 10 进制（1 GB = 1000³ 字节），操作系统按 2 进制显示（1 GiB = 1024³ 字节），差额来自换算口径而不是容量缩水。": "Vendors advertise decimal units (1 GB = 1000³ bytes) while the operating system displays binary ones (1 GiB = 1024³ bytes); the difference is the unit, not lost capacity.",
        "双击跳到终端": "Double-click to jump to the terminal",
        "双机热备": "Dual-node hot standby",
        "反向（下载）": "Reverse (download)",
        "反填掩码（可选）": "Backfill mask (optional)",
        "反解主机名": "Reverse hostname",
        "发 6 个 FF + 16 次 MAC 的魔术包（UDP 9）。目标机需要在 BIOS 和网卡驱动里都开启网络唤醒。": "Sends the 6×FF + 16×MAC magic packet on UDP 9. The target must have wake-on-LAN enabled in both the BIOS and the NIC driver.",
        "发现主机": "Hosts found",
        "发送": "Sent",
        "发送 UDP 魔术包（6×FF + 16 次 MAC）。可把设备连同名称一起保存，之后在下方列表里一键唤醒。": "Sends a UDP magic packet (6×FF + MAC × 16). Save devices with names, then wake them with one click in the list below.",
        "发送中…": "Sending…",
        "取消": "Cancel",
        "取消/撤销命令": "Cancel/undo command",
        "取消关联": "Unbind",
        "取消画框": "Stop drawing",
        "取消编辑": "Cancel edit",
        "取消连线": "Stop linking",
        "取消选中": "Clear the selection",
        "只接受 POST 请求": "Only POST requests are accepted",
        "只支持 http/https 地址": "Only http/https URLs are supported",
        "只读取时间，不修改系统时钟。UDP 123 被防火墙挡住时会显示无响应，换一台服务器再试。": "Only reads the time; the system clock is never changed. If UDP 123 is blocked the server shows no answer, so try another one.",
        "只读本机套接字表，不发起任何连接。Windows 下 PID 通过 tasklist 映射成进程名。": "Reads the local socket table and opens no connections. On Windows the PID is mapped to a process name through tasklist.",
        "可用": "Available",
        "可用主机数": "Usable hosts",
        "可用数量": "Usable",
        "可用范围": "Usable range",
        "右": "Right",
        "右侧内容": "Right content",
        "右侧备份": "Right backup",
        "右侧配置": "Right configuration",
        "右移 (>>)": "Shift right (>>)",
        "右键关联设备": "Right-click to bind a device",
        "同时打开的监控过多（上限 ${max}）": "Too many monitors are open at the same time (limit ${max})",
        "同时测试上传": "Test upload too",
        "名称": "Name",
        "后": "from now",
        "向 ${count} 台服务器请求 SNTP（UDP ${port}）": "Asking ${count} server(s) over SNTP (UDP ${port})",
        "向 NTP/SNTP 服务器取时，算出本机时钟快慢与请求往返时延。只读时间，不会修改系统时钟。": "Ask an NTP/SNTP server for the time and compute how far this clock is off, plus the round-trip delay. It only reads time; the system clock is never changed.",
        "否": "No",
        "启用接口": "Enable interface",
        "命令（每行一条）": "Commands (one per line)",
        "响应体": "Response body",
        "响应体（截断）": "Response body (truncated)",
        "响应头": "Response headers",
        "响应过短": "Response too short",
        "唤醒": "Wake",
        "回退到公共 DNS 223.5.5.5": "Falling back to public DNS 223.5.5.5",
        "国家/地区": "Country/Region",
        "国家域名云解析主": "National Domain Cloud DNS Primary",
        "国家域名云解析备": "National Domain Cloud DNS Secondary",
        "在新标签页中连接": "Connect in a new tab",
        "在画布上拖出一个矩形框，用来圈出一片区域": "Drag on the canvas to lay out a frame around an area",
        "在线": "Online",
        "在线查询未知厂商": "Look up unknown vendors online",
        "在终端中打开": "Open in terminal",
        "地址": "Address",
        "地址总数": "Total addresses",
        "地址池": "Address pool",
        "城市": "City",
        "域名": "Domain",
        "域名与地址": "Domains & addresses",
        "域名查询 (WHOIS)": "Domain lookup (WHOIS)",
        "域名解析": "DNS lookup",
        "域名解析失败：请检查 DNS 配置或上游 DNS 是否可用。": "Name resolution failed: check the DNS configuration or whether the upstream DNS is reachable.",
        "基于 HTTP 大文件上下行的吞吐测试（默认 Cloudflare 测速端点），不依赖 Ookla 私有协议。": "Throughput test over large HTTP uploads/downloads (Cloudflare endpoint by default), with no dependency on Ookla's proprietary protocol.",
        "基础": "Basic",
        "堆叠/HA": "Stacking/HA",
        "堆叠优先级": "Stack priority",
        "填写参数后开始执行": "Fill in parameters to start",
        "填写完成后点右上角「连接」": "Fill this in, then click Connect",
        "填好名称和 MAC 后点「保存设备」，之后就能在表格里一键唤醒。": "Fill in the name and MAC, click \"Save device\", then wake it from the table with one click.",
        "备份存放在 ~/.dsh-nwtool/backups，可搜索、查看与删除；旁边可以一键交给大模型分析。": "Backups live in ~/.dsh-nwtool/backups and can be searched, read and deleted; one click hands one to the model for analysis.",
        "备注": "Note",
        "复制失败：${detail}": "Copy failed: ${detail}",
        "复制并新建会话": "Copy and start new session",
        "复制提示词": "Copy prompt",
        "复制配置": "Copy config",
        "外网连通": "Internet reachable",
        "多标签交互终端。监控与文件浏览各用一条独立连接，不会打断当前画面；关掉标签才会断开。": "A tabbed interactive terminal. Monitoring and file browsing each use their own connection so the screen is never disturbed; a session ends only when its tab is closed.",
        "大小": "Size",
        "失败": "Failed",
        "失败 (${detail})": "Failed (${detail})",
        "失败: ${errorText}": "Failed: ${errorText}",
        "失败: ${error}": "Failed: ${error}",
        "失败: ${reason}": "Failed: ${reason}",
        "子网掩码": "Subnet mask",
        "字节 (B)": "Bytes (B)",
        "字节、比特与 KB/MB/GB/TB、KiB/MiB/GiB/TiB 互转，并算清「标称 500GB 为什么只显示 465GiB」。": "Convert between bytes, bits, KB/MB/GB/TB and KiB/MiB/GiB/TiB, and see why a \"500 GB\" drive shows as 465 GiB.",
        "字节单位换算器": "Byte unit converter",
        "安全": "Security",
        "安装方式": "Installation",
        "完成": "Done",
        "实用工具": "Utilities",
        "实线": "Solid",
        "容量": "Size",
        "密码": "Password",
        "密码提示": "Password prompt",
        "密码（不保存）": "Password (not stored)",
        "密码（保存到本机）": "Password (stored locally)",
        "对指定 TCP 端口做连接计时，ICMP 被过滤时判断可达性最有效。": "Times TCP connections to a specified port; the most reliable reachability check when ICMP is filtered.",
        "对比中…": "Comparing…",
        "对端端口": "Remote port",
        "对网段/地址范围并发探测，列出在线主机。TCP 模式无需权限，ICMP 模式更贴近传统 ping 扫描。": "Concurrently probes a subnet/address range and lists online hosts. TCP mode needs no privileges; ICMP mode is closer to a classic ping sweep.",
        "局域网扫描 ${cidr}（${name}）· 通过 ARP 表发现主机": "LAN scan ${cidr} (${name}) · Discover hosts via the ARP table",
        "层级": "Stratum",
        "展开分组": "Expand group",
        "展开设备簿": "Expand the device list",
        "工具": "Tools",
        "左": "Left",
        "左侧内容": "Left content",
        "左侧备份": "Left backup",
        "左侧配置": "Left configuration",
        "左移 (<<)": "Shift left (<<)",
        "差异统计: 新增 ${added} / 删除 ${removed} / 修改 ${changed}": "Diff stats: added ${added} / removed ${removed} / changed ${changed}",
        "差异行": "Diff lines",
        "差额": "Difference",
        "已下载": "Downloaded",
        "已保存": "Saved",
        "已保存「${name}」": "Saved \"${name}\"",
        "已保存设备": "Device saved",
        "已关联": "Bound",
        "已删除 ${address} 的条目": "Deleted the entry for ${address}",
        "已删除「${name}」": "Deleted \"${name}\"",
        "已发送": "Sent",
        "已取消": "Cancelled",
        "已建立": "Established",
        "已接收": "Received",
        "已断开连接": "Disconnected",
        "已暂停": "Paused",
        "已更新": "Updated",
        "已添加 ${address} → ${mac}": "Added ${address} → ${mac}",
        "已清空 ARP 缓存": "Cleared the ARP cache",
        "已用时": "Elapsed",
        "已连接": "Connected",
        "已选中「${name}」，点「连接」建立会话": "Selected \"${name}\". Press Connect to open a session.",
        "带宽": "Bandwidth",
        "常见服务": "Common services",
        "平均": "Average",
        "平均偏移": "Average offset",
        "平均带宽": "Average bandwidth",
        "并发": "Concurrency",
        "并发查询多个公共 DNS 的同一批域名，按平均时延排序。结果受本地出口线路与运营商缓存影响。": "Queries the same names against several public resolvers in parallel and sorts by average latency. Results depend on your uplink and carrier caching.",
        "并发流": "Parallel streams",
        "并发测试主流公共 DNS 的解析时延，按最快排序，用于挑选本地最优解析器。": "Concurrently tests resolution latency of major public DNS services, sorted fastest first, to pick the best local resolver.",
        "并发设备数": "Concurrent devices",
        "并排高亮两份配置/备份的差异，定位接口、ACL 等具体变动。": "Highlights the differences between two configurations/backups side by side to pinpoint changes to interfaces, ACLs and more.",
        "广播地址": "Broadcast address",
        "广播地址不是合法的 IPv4: ${broadcast}": "Broadcast address is not a valid IPv4 address: ${broadcast}",
        "应答": "Reply",
        "开启": "on",
        "开启 DHCP": "Enable DHCP",
        "开启 IPv6": "Enable IPv6",
        "开启 LLDP": "Enable LLDP",
        "开启 RSTP/MSTP": "Enable RSTP/MSTP",
        "开始": "Start",
        "开始对比": "Compare",
        "开放": "Open",
        "异常项": "Problems",
        "归属地来自公共 API（多源回退），内网与保留地址在本地判断、不外发。不同服务的数据会有出入。": "Location data comes from public APIs with fallbacks; private and reserved ranges are classified locally and never sent. Providers disagree about details.",
        "归档为配置备份": "Archive as configuration backup",
        "当前时间": "Current time",
        "往返时延": "Round-trip delay",
        "往返时间": "Round-trip time",
        "快": "fast",
        "思科 IOS / NX-OS": "Cisco IOS / NX-OS",
        "总量": "Total",
        "恢复 100%": "Reset to 100%",
        "慢": "slow",
        "成功": "Success",
        "或者粘贴一份 LLDP/CDP 输出": "Or paste an LLDP/CDP output",
        "所有外网探测都不通：问题可能在 ISP 线路或出口设备。": "All internet probes failed: the issue may be the ISP line or the egress device.",
        "所有探测都在运行 DSH 的主机侧执行：Ping 通过系统 ping，端口扫描为 TCP connect 模式，均不需要管理员权限；": "All probes run on the host running DSH: Ping uses the system ping, port scans use TCP connect mode, and neither requires administrator rights;",
        "手工模式": "Manual mode",
        "手工绘制的简易拓扑：摆放路由器/交换机/服务器/PC、连线成图，右键可关联设备簿里的设备，双击跳到终端。": "A simple hand-drawn topology: place routers, switches, servers and PCs, link them, right-click to bind a saved device, and double-click to jump to the terminal.",
        "手工绘制的简易拓扑：摆放路由器、交换机、无线 AC/AP、服务器与 PC，连线成图；右键可关联设备簿里的设备，双击跳到终端。": "A simple hand-drawn topology: place routers, switches, wireless ACs/APs, servers and PCs, then link them; right-click to bind a saved device and double-click to jump to the terminal.",
        "执行中…": "Running…",
        "执行日志（${count} 条）": "Execution log (${count} entries)",
        "扫描 ${description} · ${total} 个地址 · 模式 ${mode} · 探测端口 ${portList}": "Scanning ${description} · ${total} addresses · Mode ${mode} · Probe ports ${portList}",
        "扫描 ${host} · ${total} 个端口 · 并发 ${concurrency}": "Scanning ${host} · ${total} ports · Concurrency ${concurrency}",
        "扫描与发现": "Scan & discovery",
        "扫描局域网": "Scan LAN",
        "批量创建 VLAN": "Create VLANs in bulk",
        "批量地址（空格/逗号分隔）": "Batch addresses (space/comma separated)",
        "找不到树根「${root}」。可选节点: ${list}": "No node named ${root}. Available nodes: ${list}",
        "抓包": "Packet capture",
        "抓取 banner": "Grab banner",
        "抖动": "Jitter",
        "拆成 ${count} 个 /${prefix}": "Split into ${count} × /${prefix}",
        "拓扑": "Topology",
        "拓扑 1": "Topology 1",
        "拓扑图": "Topology sheet",
        "拖动改变大小": "Drag to resize",
        "拖动移动设备，工具栏「连线」后依次点两台设备即可连线；右键设备可关联设备簿里的条目，双击跳转到终端并选中它。图会自动存到 ~/.dsh-nwtool/topology.json。": "Drag to move a device; press \"Link\" and click two devices to connect them. Right-click a device to bind a device-book entry, double-click to jump to the terminal with it selected. The sketch is saved to ~/.dsh-nwtool/topology.json.",
        "拖动移动，右键关联设备，双击跳到终端": "Drag to move · right-click to bind · double-click to jump",
        "指定启动文件": "Set startup file",
        "指定源 Ping": "Ping from source",
        "按 网卡 → 网关 → DNS → 域名解析 → 外网 → TCP 出站 → 公网出口 的顺序编排，每步给结论，便于定位断点。": "Runs adapter → gateway → DNS → resolution → internet → TCP egress → public address in order, with a verdict per step so the break point is obvious.",
        "按位与 (AND)": "Bitwise AND",
        "按位取反": "Bitwise NOT",
        "按位异或 (XOR)": "Bitwise XOR",
        "按位或 (OR)": "Bitwise OR",
        "按字节反转": "Byte-swapped",
        "按设备名 / 地址过滤": "Filter by device name / address",
        "按轮次重复路由追踪，统计每跳丢包率、平均/最好/最差时延与抖动。每一轮相当于一次完整的 tracert。": "Repeats route tracing by round, collecting per-hop loss rate, average/best/worst latency and jitter. Each round is a full tracert.",
        "排除地址": "Excluded addresses",
        "探测方式": "Probe mode",
        "接口": "Interface",
        "接口 Easy-IP": "Interface Easy-IP",
        "接口启用": "Enable on interface",
        "接口地址": "Interface address",
        "接口应用 ACL": "Apply ACL to interface",
        "接口描述": "Interface description",
        "接收": "Received",
        "提权密码": "Enable password",
        "提示词": "Prompt",
        "提示：DSH 没有向已有输入框注入文本的插件接口，因此这里把配置和问题整理成提示词放进剪贴板；新建会话后直接粘贴即可。": "Note: DSH has no plugin API for injecting text into an existing input box, so the configuration and question are combined into a prompt and placed on the clipboard; just paste it after starting a new session.",
        "握手 ${ms} ms": "Handshake ${ms} ms",
        "握手成功即算通，耗时含三次握手。端口未开放会得到 RST 而不是超时，可据此区分“被防火墙过滤”和“没有服务”。": "A completed handshake counts as reachable, and the time includes the three-way handshake. A closed port answers with RST rather than timing out, which separates \"filtered\" from \"no service\".",
        "搜索命令 / 用途": "Search command / purpose",
        "操作": "Action",
        "操作失败（${code}）: ${output}": "The operation failed (${code}): ${output}",
        "操作数不是合法的 32 位值": "The operand is not a valid 32-bit value",
        "操作数（同进制）": "Operand (same base)",
        "收起": "Collapse",
        "收起分组": "Collapse group",
        "收起设备簿": "Collapse the device list",
        "放大": "Zoom in",
        "放置目录": "Drop-in directory",
        "数值差": "Numeric gap",
        "数据来源": "Source",
        "文件": "File",
        "文件/升级": "Files/Upgrade",
        "文件浏览": "File browser",
        "断开": "Disconnect",
        "新增": "Added",
        "新建": "New",
        "新建拓扑": "New topology",
        "新建设备": "New device",
        "方向": "Direction",
        "方法": "Method",
        "无响应": "No response",
        "无响应 (${problem})": "No response (${problem})",
        "无对应（用 access/trunk 组合）": "No equivalent (use an access/trunk combination)",
        "无效 OID: ${oid}": "Invalid OID: ${oid}",
        "无效域名标签: ${part}": "Invalid domain label: ${part}",
        "无效端口: ${part}": "Invalid port: ${part}",
        "无效端口范围: ${part}": "Invalid port range: ${part}",
        "无法取得公网出口 IP：可能是出口被 NAT 且探测服务不可达，或外网被隔离。": "Could not obtain the public egress IP: egress may be behind NAT and the probe service unreachable, or the internet may be isolated.",
        "无法执行 ${command}，请确认系统已安装该命令": "Cannot run ${command}; make sure the command is installed",
        "无法确定本机公网出口地址：${detail}": "Could not determine the public egress address: ${detail}",
        "无法获取公网 IP": "Unable to get public IP",
        "无法解析输入的时间": "Unable to parse the input time",
        "无线 AP": "Wireless AP",
        "无线AC": "Wireless Controller",
        "无线控制器": "Wireless Controller",
        "无记录": "No records",
        "无（内网/保留地址没有公网归属）": "None (private and reserved addresses have no public location)",
        "日期时间（优先于此）": "Date/time (takes priority)",
        "时区": "Time zone",
        "时延": "Latency",
        "时钟状态": "Clock status",
        "时间区间": "Interval",
        "时间戳与日期互转、时区换算、相对时间，纯本地计算。": "Timestamp/date conversion, time zone conversion and relative time, all computed locally.",
        "时间戳（秒或毫秒）": "Timestamp (seconds or milliseconds)",
        "时间转化": "Time conversion",
        "是": "Yes",
        "显示在矩形框底部": "Shown at the bottom of the frame",
        "显示在线中间": "Shown at the middle of the line",
        "显示在设备下方": "Shown under the device",
        "普通文件": "Regular file",
        "暂停": "Pause",
        "更新时间": "Updated",
        "更新设备": "Update device",
        "最多显示": "Show at most",
        "最大": "Max",
        "最大跳数": "Max hops",
        "最好": "Best",
        "最小": "Min",
        "最差": "Worst",
        "最快": "Fastest",
        "最终地址": "Final URL",
        "最近": "Last",
        "服务器": "Server",
        "服务器拒绝服务（KoD ${code}）": "The server refused service (KoD ${code})",
        "服务器时间": "Server time",
        "服务器映射": "Server mapping",
        "服务器间最大差异": "Largest spread between servers",
        "服务器（逗号分隔可查多台）": "Servers (comma-separated to check several)",
        "服务端启动": "Start server",
        "服务端地址": "Server address",
        "未与根相连：": "Not reachable from the root:",
        "未关联": "Not bound",
        "未发现开放端口（目标可能被防火墙过滤）": "No open ports found (the target may be filtered by a firewall)",
        "未发现明显故障：本机、网关、DNS、外网出口均可达。": "No obvious fault found: the local host, gateway, DNS, and internet egress are all reachable.",
        "未取得 Windows 网卡详情，已回退到 Node 网卡列表（${reasons}）": "Could not read the Windows adapter details; falling back to the Node adapter list (${reasons})",
        "未命名会话": "Untitled session",
        "未命名拓扑": "Untitled topology",
        "未填写地址：先查询本机公网出口": "No address given: looking up the public egress address first",
        "未找到 SSH 客户端：请安装 PuTTY 的 plink.exe 或启用 Windows 自带 OpenSSH 客户端": "SSH client not found: install PuTTY's plink.exe or enable the built-in Windows OpenSSH client",
        "未找到 iperf3 可执行文件。": "The iperf3 executable was not found.",
        "未知": "Unknown",
        "未知原因": "unknown reason",
        "未知工具: ${name}": "Unknown tool: ${name}",
        "未知操作: {op}": "Unknown operation: ${op}",
        "未确认到达目标，可能已达到最大跳数或路径被防火墙过滤": "Target reachability not confirmed; the maximum number of hops may have been reached or the path may be filtered by a firewall",
        "未确认到达目标；部分运营商设备不回 ICMP，中间跳出现丢包不代表业务受损。": "Target reachability not confirmed; some carrier devices do not respond to ICMP, so packet loss at intermediate hops does not necessarily mean the service is affected.",
        "未能获取连接票据": "Could not obtain a connection ticket",
        "未读取到默认网关": "Could not read the default gateway",
        "未连接": "Disconnected",
        "未连通": "Unreachable",
        "本地判断": "Local classification",
        "本地地址": "Local address",
        "本地时间": "Local time",
        "本机 IP 详细信息": "Local IP details",
        "本机与二层": "Local host & L2",
        "本机偏移": "Local offset",
        "本机公网出口为 ${address}（来源 ${source}）": "Public egress is ${address} (from ${source})",
        "本机地址": "Local address",
        "本机时区": "Local time zone",
        "本机时钟偏差较大：比标准时间${direction} ${value}": "This clock is far off: ${value} ${direction} of standard time",
        "本机时钟准确（偏差 ${value}）": "This clock is accurate (off by ${value})",
        "本机时钟比标准时间${direction} ${value}": "This clock is ${value} ${direction} of standard time",
        "本机时间": "Local time",
        "本机没有获得 IPv4 地址，请检查网线/WiFi 与 DHCP。": "This machine has no IPv4 address; check the network cable/WiFi and DHCP.",
        "本机环回（127/8）": "Loopback (127/8)",
        "本机端口状态": "Local port state",
        "本机网卡": "Local adapters",
        "本机网段过大，请手动填写要扫描的网段": "Local subnet is too large; enter the subnet to scan manually",
        "本机网络": "Local network",
        "本端端口": "Local port",
        "本网络（0.0.0.0/8）": "This network (0.0.0.0/8)",
        "权威": "Authoritative",
        "条目": "Entries",
        "来源": "Source",
        "构造原始 DNS 报文：可指定 DNS 服务器、记录类型与是否递归，输出含 TTL、标志位与权威段。": "Builds raw DNS messages: specify the DNS server, record type and recursion; output includes TTL, flags and the authority section.",
        "查 A/AAAA/CNAME/MX/TXT/NS/SOA/SRV/CAA/PTR，直接展示原始应答记录与 TTL。": "Queries A/AAAA/CNAME/MX/TXT/NS/SOA/SRV/CAA/PTR and shows the raw answer records and TTL directly.",
        "查看": "View",
        "查看 ACL": "View ACL",
        "查看 ARP": "View ARP",
        "查看 BGP 邻居": "View BGP neighbors",
        "查看 CPU": "View CPU",
        "查看 HA 状态": "View HA status",
        "查看 IPv6 路由": "View IPv6 routes",
        "查看 MAC 地址表": "View MAC address table",
        "查看 NAT 会话": "View NAT sessions",
        "查看 NTP": "View NTP",
        "查看 OSPF 接口": "View OSPF interfaces",
        "查看 OSPF 邻居": "View OSPF neighbors",
        "查看 SNMP 配置": "View SNMP configuration",
        "查看 STP 详情": "View STP details",
        "查看 Trunk 放通": "View Trunk allowed VLANs",
        "查看 VLAN": "View VLAN",
        "查看 VRRP": "View VRRP",
        "查看、搜索、删除本机归档的设备配置备份。": "View, search and delete locally archived device configuration backups.",
        "查看不需要权限；添加、删除与清空需要管理员权限（Windows）或 root（Linux），失败时会原样回显系统提示。": "Reading needs no privileges; adding, deleting and clearing need administrator rights (Windows) or root (Linux). A refusal is echoed exactly as the system reported it.",
        "查看光模块信息": "View optical module info",
        "查看内存": "View memory",
        "查看列表": "Show the table",
        "查看剩余空间": "View free space",
        "查看启动项": "View boot items",
        "查看在线用户": "View online users",
        "查看地址分配": "View address assignments",
        "查看堆叠": "View stacking",
        "查看开机配置": "Show startup configuration",
        "查看当前时间": "Show current time",
        "查看接口 VLAN 归属": "View interface VLAN assignment",
        "查看接口摘要": "View interface summary",
        "查看接口详情": "View interface details",
        "查看接口速率/双工": "View interface speed/duplex",
        "查看接口错误统计": "View interface error statistics",
        "查看文件": "View files",
        "查看日志": "Show logs",
        "查看本机 ARP / 邻居缓存，可添加静态条目、删除单条或清空。写入缓存需要管理员权限，失败时会如实报告。": "Inspect the local ARP / neighbour cache and add a static entry, delete one, or clear it. Writing needs administrator rights; a refusal is reported as it happened.",
        "查看本机 ARP / 邻居缓存；添加静态条目、删除选中条目或清空整张表。写入需要管理员权限。": "Inspect the local ARP / neighbour cache; add a static entry, delete the selected one, or clear the table. Writing needs administrator rights.",
        "查看生成树": "View spanning tree",
        "查看系统版本": "Show system version",
        "查看聚合状态": "View aggregation status",
        "查看设备名称": "Show device name",
        "查看路由协议": "View routing protocols",
        "查看路由表": "View routing table",
        "查看邻居 LLDP": "View LLDP neighbors",
        "查看配置": "Show configuration",
        "查看风扇/温度": "View fans/temperature",
        "查询 ${address} 的归属地": "Looking up the location of ${address}",
        "查询 ${domain} 的注册信息": "Look up registration info for ${domain}",
        "查询 ${server} 失败: ${reason}": "Query of ${server} failed: ${reason}",
        "查询 IP 的归属地、运营商与 ASN；留空则先查本机公网出口。内网与保留地址在本地判断，不外发任何请求。": "Look up an IP address location, ISP and ASN; leave it empty to look up this machine public egress first. Private and reserved ranges are classified locally and never sent anywhere.",
        "查询失败": "Lookup failed",
        "查询失败: ${reason}": "Query failed: ${reason}",
        "查询来源": "Lookup source",
        "查询超时": "Query timed out",
        "标称单位": "Rated unit",
        "标称容量": "Rated capacity",
        "标称读数": "Rated reading",
        "树根（设备名，留空 = 自动选连接最多的一台）": "Root (device name; empty = the node with the most links)",
        "根": "Root",
        "格式化": "Format",
        "检查项": "Check",
        "次数": "Count",
        "正在读取 ARP 缓存…": "Reading the ARP cache…",
        "正在读取目录…": "Reading the directory…",
        "正在采样…": "Sampling…",
        "正常项": "Healthy",
        "每 5 秒刷新": "Refreshing every 5 s",
        "每一轮都是一次完整路由追踪，按跳统计。中间跳偶发丢包通常只是控制面限速，末跳丢包才是真丢包。": "Each round is a full path trace, aggregated per hop. Occasional loss at middle hops is usually control-plane rate limiting; loss at the last hop is real.",
        "每个测几轮": "Rounds per DNS",
        "每次输入密码": "Ask every time",
        "比特 (bit)": "Bits (bit)",
        "没有从粘贴内容里解析出 LLDP/CDP 邻居": "No LLDP/CDP neighbour could be parsed from the pasted text",
        "没有任何公共 DNS 返回结果，请检查本机出网与 53/UDP 策略": "No public DNS returned results; check local outbound connectivity and 53/UDP policy",
        "没有可用的 IPv4 网卡": "No usable IPv4 adapter",
        "没有找到可用的本机 IPv4 网卡": "No usable local IPv4 adapter found",
        "没有服务器应答，无法判断": "No server answered, so the clock cannot be judged",
        "没有查询到任何记录": "No records found",
        "没有符合筛选条件的条目": "No entry matches the filter",
        "没有读到任何套接字，可能缺少 netstat/ss 命令": "No socket could be read; the netstat/ss command may be missing",
        "没有采集到任何邻居关系。请确认设备已开启 LLDP/CDP（display lldp / show lldp），或改用粘贴模式": "No neighbour relationship was collected. Make sure LLDP/CDP is enabled on the devices (display lldp / show lldp), or use paste mode.",
        "注册商": "Registrar",
        "注意: ${notice}": "Note: ${notice}",
        "测试 ${domain} 的 ${type} 记录 · ${count} 个公共 DNS · 每个 ${rounds} 次": "Test ${type} record of ${domain} · ${count} public DNS servers · ${rounds} rounds each",
        "测试域名": "Test domain",
        "测试时长 (s)": "Duration (s)",
        "浏览器不支持流式响应": "Browser does not support streaming responses",
        "浏览设备上的文件": "Browse the files on the device",
        "海外": "Overseas",
        "添加": "Add",
        "添加静态 ARP 条目": "Add a static ARP entry",
        "添加静态条目": "Add a static entry",
        "清空": "Clear",
        "清空 ARP": "Clear ARP",
        "清空失败（${code}）: ${output}": "Clearing failed (${code}): ${output}",
        "清空接口计数": "Clear interface counters",
        "清空整张 ARP 缓存": "Clear the whole ARP cache",
        "清空计数": "Clear counters",
        "源 NAT": "Source NAT",
        "点「查看列表」读取本机 ARP 缓存": "Click Show the table to read the local ARP cache",
        "点任意一位翻转（高位在左）": "Click a bit to toggle it (most significant bit on the left)",
        "点左上角的设备类型开始画：拖动移动，工具栏「连线」后依次点两台设备": "Pick a device type in the top-left to start: drag to move, press \"Link\" then click two devices to connect them.",
        "版本": "Version",
        "特权密码": "Privilege password",
        "状态": "Status",
        "用户名": "Username",
        "用户管理": "User management",
        "用户级别": "User privilege level",
        "用途": "Purpose",
        "电信 DNS": "China Telecom DNS",
        "画框": "Draw frame",
        "登录提示": "Login prompt",
        "百度公共 DNS": "Baidu Public DNS",
        "监听": "Listening",
        "监控": "Monitor",
        "监控会话不存在": "The monitor session does not exist",
        "监控会话尚未就绪": "The monitor session is not ready yet",
        "目录": "Directory",
        "目标": "Target",
        "目标 (本机/直连)": "Target (local/direct)",
        "目标 MAC": "Target MAC",
        "目标地址": "Target host",
        "目标跳数": "Target hops",
        "相关实体": "Related entities",
        "相同行": "Same lines",
        "相对时间": "Relative time",
        "省/州": "Region",
        "瞬时速度": "Instant speed",
        "矩形框": "Frame",
        "确定": "OK",
        "确定要删除「${name}」这张拓扑？": "Delete the topology \"${name}\"?",
        "确定要删除这条 ARP 条目？": "Delete this ARP entry?",
        "确定要清空整张拓扑图？": "Clear the whole topology?",
        "确定要清空本机 ARP 缓存？清空后与邻居的通信会重新学习，期间可能短暂中断。": "Clear the local ARP cache? Traffic to neighbours relearns it and may pause briefly while it does.",
        "确定要清空这张拓扑？": "Clear this topology?",
        "磁盘": "Disk",
        "私有地址": "Private address",
        "私有地址（RFC 1918）": "Private address (RFC 1918)",
        "私钥路径": "Private key path",
        "端口": "Port",
        "端口/范围": "Ports/range",
        "端口安全": "Port security",
        "端口扫描": "Port scan",
        "端口范围过大: ${part}": "Port range too large: ${part}",
        "端口隔离": "Port isolation",
        "第 ${index} 位（权重 ${weight}）": "Bit ${index} (weight ${weight})",
        "等待 ARP (ms)": "ARP wait (ms)",
        "等待${description}超时（${timeoutMs} ms）": "Timed out waiting for ${description} (${timeoutMs} ms)",
        "筛选": "Filter",
        "类型": "Type",
        "粘贴数据对应的设备名": "Device name the pasted data belongs to",
        "粘贴的数据": "Pasted data",
        "精简版 Postman：构造请求、查看状态/响应头/耗时并在 Host 侧发出（不受浏览器跨域限制）。": "A lean Postman: build a request, inspect status/response headers/timing and send it from the Host side (no browser CORS limits).",
        "系统": "System",
        "系统显示": "Shown by the OS",
        "系统监控": "System monitor",
        "纯本地计算。时间戳支持秒与毫秒，时区换算以浏览器所在时区为基准。": "Pure local arithmetic. Timestamps accept seconds or milliseconds, and time-zone conversion is relative to the browser zone.",
        "纯本地计算，不发任何网络请求。「额外划分层数」最多 4 层，每层最多列出 16 个网段。": "Pure local arithmetic, no network requests. \"Extra split depth\" goes up to 4 levels and lists at most 16 subnets per level.",
        "纯本地计算：掩码换算、网络/广播地址、可用范围、二进制与子网划分，不发任何网络请求。": "Pure local computation: mask conversion, network/broadcast addresses, usable range, binary and subnetting, with no network requests.",
        "线型": "Line style",
        "组播/保留（224/4 以上）": "Multicast/reserved (224/4 and above)",
        "组织": "Organization",
        "细节": "Details",
        "终端 / 设备簿": "Terminal / devices",
        "终端输入": "Terminal input",
        "终端连接失败": "Terminal connection failed",
        "终端连接失败（${detail}）": "Terminal connection failed (${detail})",
        "终端通道拒绝了这次连接（${reason}）": "The terminal channel refused this connection (${reason})",
        "经纬度": "Coordinates",
        "结果": "Result",
        "统计: ${summary}": "Stats: ${summary}",
        "继续": "Resume",
        "综合诊断": "Diagnostics",
        "编排式诊断：本机网卡 → 网关 → DNS → 域名解析 → 外网连通 → TCP 出站 → 公网出口，并给出可读结论。": "Orchestrated diagnosis: local NIC → gateway → DNS → name resolution → internet reachability → TCP egress → public egress, with readable conclusions.",
        "编码": "Encoding",
        "编辑": "Edit",
        "编辑设备": "Edit device",
        "编辑选中的设备": "Edit the selected device",
        "缩小": "Zoom out",
        "缺少 tool": "Missing tool",
        "缺少设备 id": "Missing device id",
        "网关": "Gateway",
        "网关 ${gateway} 不通：问题多半在本机到交换机这一段（网线、VLAN、ARP）。": "Gateway ${gateway} unreachable: the problem is most likely between this machine and the switch (cable, VLAN, ARP).",
        "网关与 DNS": "Gateway and DNS",
        "网卡": "NIC",
        "网卡、网关、DNS 与公网出口都取自本机。「公网出口」会依次请求多个探测源，失败的那几个会列出来。": "Adapters, gateways, DNS and the public egress address all come from this machine. The egress lookup tries several providers and lists the ones that failed.",
        "网卡详情来源：${diagnostic}": "Adapter details source: ${diagnostic}",
        "网段": "Subnet",
        "网段或范围": "Subnet or range",
        "网段（留空自动）": "Subnet (blank = auto)",
        "网络唤醒 (WOL)": "Wake-on-LAN (WOL)",
        "网络地址": "Network address",
        "网络拓扑": "Network topology",
        "网络测速": "Speed test",
        "网络诊断": "Network diagnostics",
        "网络运维工具箱": "NWTool",
        "网络运维工具箱渲染失败": "Network Operations Toolbox failed to render",
        "置位数": "Bits set",
        "耗时": "Duration",
        "联通 DNS": "China Unicom DNS",
        "腾讯云公共 DNS 主": "Tencent Cloud Public DNS Primary",
        "腾讯云公共 DNS 备": "Tencent Cloud public DNS (backup)",
        "自动": "Auto",
        "自定义": "Custom",
        "自定义采集命令（留空 = 自动探测）": "Custom collection command (empty = auto-detect)",
        "自己拼 DNS 报文，可指定服务器、类型与递归位；输出含 flags、ANSWER/AUTHORITY 段与每条记录的 TTL。": "Builds the DNS message itself, so you choose the server, the type and the recursion bit; the output shows flags, the ANSWER/AUTHORITY sections and each TTL.",
        "节点": "Nodes",
        "虚线": "Dashed",
        "行数": "Lines",
        "西南": "Southwest",
        "要更新的设备不在列表中": "The device to update is not in the list",
        "要问的问题": "Question",
        "解析 ${host} · ${types}（DNS ${server}）": "Resolve ${host} · ${types} (DNS ${server})",
        "解析结果": "Resolution result",
        "认证方式": "Authentication",
        "记录所属": "Record owner",
        "记录类型": "Record type",
        "设备": "Device",
        "设备不存在": "Device not found",
        "设备名称": "Device name",
        "设备地址": "Device address",
        "设备清单（每行：host[:port] [ssh|telnet] [用户名] [密码]）": "Device list (one per line: host[:port] [ssh|telnet] [username] [password])",
        "设备簿": "Devices",
        "设备簿是空的": "The device book is empty",
        "设备簿里没有这台设备，可能已被删除": "That device is not in the book; it may have been deleted",
        "设备返回 SNMP 错误码 ${status}": "Device returned SNMP error code ${status}",
        "设备配置采集": "Device configuration collection",
        "设备重命名": "Rename device",
        "设置优先级": "Set priority",
        "设置根桥": "Set root bridge",
        "诊断": "Diagnostics",
        "说明": "Description",
        "请分析这份设备配置：指出潜在风险、冗余配置和可以优化的地方。": "Analyze this device configuration: point out potential risks, redundant configuration, and areas for optimization.",
        "请填写 1-65535 的端口": "Enter a port between 1 and 65535",
        "请填写 SNTP 服务器": "Enter at least one SNTP server",
        "请填写 iperf3 服务端地址": "Enter the iperf3 server address",
        "请填写一个非负数字": "Enter a non-negative number",
        "请填写合法的 IPv4 地址: ${address}": "Enter a valid IPv4 address: ${address}",
        "请填写合法的 MAC 地址（如 00-11-22-33-44-55）": "Enter a valid MAC address (such as 00-11-22-33-44-55)",
        "请填写域名": "Enter a domain",
        "请填写域名或 IP": "Enter a domain or IP",
        "请填写完整域名，例如 example.com": "Enter a full domain, e.g. example.com",
        "请填写文件路径": "Enter a file path",
        "请填写目标地址": "Enter target host",
        "请填写端口或端口范围": "Enter a port or port range",
        "请填写网段，例如 192.168.1.0/24": "Enter a subnet, e.g. 192.168.1.0/24",
        "请填写要执行的命令": "Enter the commands to execute",
        "请填写设备地址": "Enter a device address",
        "请填写设备清单，或粘贴一份 LLDP/CDP 输出": "Enter a device list, or paste an LLDP/CDP output",
        "请填写请求地址": "Enter a request URL",
        "请提供至少一个地址": "Provide at least one address",
        "请求体": "Request body",
        "请求体不是合法 JSON": "Request body is not valid JSON",
        "请求体过大": "Request body too large",
        "请求失败: ${reason}": "Request failed: ${reason}",
        "请求头（每行 key: value）": "Headers (one key: value per line)",
        "请求由主机侧发出，因此不受浏览器跨域限制。请求头每行一条 key: value，重定向可选择是否跟随。": "The request is sent from the Host side, so browser CORS does not apply. One key: value header per line; redirects can be followed or not.",
        "请求超时（${timeoutMs} ms）": "Request timed out (${timeoutMs} ms)",
        "请求递归 (RD)": "Request recursion (RD)",
        "请确认：设备已启用 SNMP v2c、community 正确（默认 public）、UDP 161 未被 ACL 或防火墙拦截、管理口路由可达。": "Please confirm: SNMP v2c is enabled on the device, the community is correct (default public), UDP 161 is not blocked by an ACL or firewall, and the management interface route is reachable.",
        "请至少填写一台设备": "Enter at least one device",
        "读 arp -a / ip neigh 的结果；添加、删除、清空属于写操作，需要管理员（Windows）或 root（Linux）。": "Reads the output of arp -a / ip neigh. Adding, deleting and clearing are writes and need administrator rights (Windows) or root (Linux).",
        "读取 ARP / 邻居表": "Reading the ARP / neighbour table",
        "读取交换机上的 LLDP/CDP 邻居表（也可直接粘贴现成输出），合并成拓扑图并从指定树根画成树。不是抓包：需要设备登录凭据。": "Read the LLDP/CDP neighbour tables from switches (or paste an existing output), merge them into one graph and draw it as a tree from the root you choose. This is not packet capture: it needs device credentials.",
        "读取失败: ${detail}": "Read failed: ${detail}",
        "读取本机套接字表": "Reading the local socket table",
        "读设备现有的 LLDP/CDP 邻居表再拼图，不是抓包：需要设备登录凭据，或者直接粘贴一份输出。": "Reads the LLDP/CDP neighbour tables the devices already keep and merges them. Not packet capture: it needs device credentials, or paste an output instead.",
        "调用本机 iperf3 二进制（-J 解析 JSON）。未安装时给出获取方式，不内嵌第三方执行文件。": "Runs the local iperf3 binary (-J JSON parsing). If it is not installed, shows how to get it; no third-party executables are bundled.",
        "调用本机 iperf3 并解析 -J JSON。没装的话，把 iperf3.exe 放到面板提示的目录里即可。": "Runs the local iperf3 and parses its -J JSON. If it is missing, drop iperf3.exe into the directory the panel names.",
        "调用系统 tracert / traceroute；中间设备不回 TTL 超时包时该跳显示 *，末跳不通说明目标不可达。": "Runs the system tracert / traceroute. A hop that does not answer with an ICMP TTL expiry is shown as *; a missing last hop means the target is unreachable.",
        "负载": "Load",
        "负载分担方式": "Load balancing mode",
        "走系统解析器。要指定 DNS 服务器、看 TTL 与权威段，请改用 dig。": "Uses the system resolver. To choose a DNS server or read TTLs and the authority section, use dig.",
        "超时": "Timeout",
        "超时 (ms)": "Timeout (ms)",
        "跟随重定向": "Follow redirects",
        "路径不能以横线开头: ${path}": "A path may not start with a dash: ${path}",
        "路径只能包含字母、数字、点、斜杠、冒号、横线: ${path}": "A path may only contain letters, digits, dots, slashes, colons and dashes: ${path}",
        "路径太长": "The path is too long",
        "路由": "Route",
        "路由器": "Router",
        "路由重分发": "Route redistribution",
        "跳": "Hop",
        "轮次": "Rounds",
        "轮间隔 (ms)": "Round interval (ms)",
        "输入新名称即可创建分组": "Type a new name to create a group",
        "输入进制": "Input base",
        "输出行数": "Output lines",
        "边缘端口": "Edge port",
        "运算": "Operation",
        "运营商": "ISP",
        "运营商级 NAT（100.64/10）": "Carrier-grade NAT (100.64/10)",
        "运行中": "Running",
        "运行时长": "Uptime",
        "返回": "Back",
        "返回上一层": "Go up one level",
        "返回用户视图": "Return to user view",
        "还没有保存的设备": "No saved devices yet",
        "这个值不是 32 位整数，或与所选进制不符": "This is not a 32-bit integer, or it does not match the selected base",
        "这台设备还没关联设备簿条目，右键可以先关联": "This device is not bound to a device-book entry yet; right-click to bind one",
        "进入接口": "Enter interface",
        "进入系统视图": "Enter system view",
        "进制换算器": "Base converter",
        "进度": "Progress",
        "进程": "Process",
        "远端地址": "Remote address",
        "连接": "Connect",
        "连接 ${host}:${port} 超时": "Connection to ${host}:${port} timed out",
        "连接中…": "Connecting…",
        "连接失败: ${reason}": "Connection failed: ${reason}",
        "连接已关闭": "Connection closed",
        "连接成功": "Connected",
        "连接耗时": "Connect time",
        "连接超时 (ms)": "Connect timeout (ms)",
        "连线": "Link",
        "连线模式：依次点两台设备": "Link mode: click two devices in order",
        "连通性检测": "Connectivity check",
        "退出码 ${code}": "exit code ${code}",
        "选一份备份生成提示词，复制后在新的会话里提问；不会自动把整份配置发出去。": "Pick a backup to build a prompt, copy it and ask in a new session. The full configuration is never sent automatically.",
        "选中一个设备或连线来编辑": "Select a device or a link to edit it",
        "选中一份备份作为上下文，一键复制提示词并在新会话中向大模型提问。": "Select a backup as context, copy the prompt in one click and ask the model in a new session.",
        "选中这一条": "Select this row",
        "选择备份": "Select backup",
        "选择左侧设备，或点「新建」添加一个": "Pick a device on the left, or click New to add one",
        "逐跳显示路径与每一跳的往返时延（调用系统 tracert / traceroute，无需管理员权限）。": "Shows the path hop by hop with per-hop round-trip latency (uses system tracert / traceroute; no administrator privileges required).",
        "通过 ARP 表发现在线主机（Windows 下免管理员），可反解主机名并查厂商。": "Discovers online hosts via the ARP table (no admin needed on Windows); can reverse-resolve hostnames and look up vendors.",
        "通配符掩码": "Wildcard mask",
        "速率": "Speed",
        "邻居": "Neighbour",
        "部分服务不可用: ${detail}": "Some providers were unavailable: ${detail}",
        "配置 IP 地址": "Configure IP address",
        "配置 NTP": "Configure NTP",
        "配置 SNMP v2c": "Configure SNMP v2c",
        "配置 SSH": "Configure SSH",
        "配置 Telnet": "Configure Telnet",
        "配置内容": "Config content",
        "配置备份库": "Configuration backup library",
        "配置对比 (Diff)": "Configuration diff",
        "配置行数": "Config lines",
        "配置速率双工": "Configure speed and duplex",
        "采集时间": "Collected",
        "重传": "Retransmits",
        "重启设备": "Reboot device",
        "重命名": "Rename",
        "重新连接": "Reconnect",
        "链路": "Links",
        "链路本地（169.254/16）": "Link-local (169.254/16)",
        "链路聚合": "Link aggregation",
        "错误：${error}": "Error: ${error}",
        "间隔 (ms)": "Interval (ms)",
        "防火墙": "Firewall",
        "阿里 DNS 223.5.5.5": "Alibaba DNS 223.5.5.5",
        "阿里公共 DNS 主": "Alibaba Public DNS Primary",
        "阿里公共 DNS 备": "Alibaba Public DNS Secondary",
        "需要两份配置内容或两个备份文件": "Two configuration contents or two backup files required",
        "需要指定备份文件或直接提供内容": "Specify a backup file or provide content directly",
        "需要搜索关键词": "Search keyword required",
        "静态": "Static",
        "静态路由": "Static route",
        "预览 ${selected}": "Preview ${selected}",
        "颜色": "Colour",
        "额外划分层数": "Extra split depth",
        "风暴抑制": "Storm suppression",
        "魔术包大小": "Magic packet size",
        "魔术包已发送。目标主机需在 BIOS/网卡中开启 Wake-on-LAN，且与本机处于同一广播域。": "Magic packet sent. The target host must have Wake-on-LAN enabled in the BIOS/NIC and be in the same broadcast domain as this machine.",
        "默认分组": "Default group",
        "默认协议": "Default protocol",
        "默认密码": "Default password",
        "默认用户名": "Default username",
        "默认网关": "Default gateway",
        "（不使用备份）": "(No backup)",
        "（二进制内容 ${bytes}，未显示）": "(binary content ${bytes}, not shown)",
        "（已截断显示）": "(truncated)",
        "（手动粘贴）": "(paste manually)",
        "（无应答记录）": "(no answer records)",
        "（无输出）": "(no output)",
        "（无）": "(none)",
        "（未解析）": "(unresolved)",
        "（根）": " (root)",
        "（没有节点）": "(no nodes)",
        "上次的会话已结束，可以重新连接": "The previous session has ended; you can reconnect",
        "已恢复 ${count} 个标签页，后台会话仍在运行": "Restored ${count} tab(s); the sessions kept running in the background",
        "上次的会话已结束，标签页保留，可重新连接": "The previous sessions have ended; the tabs are kept so you can reconnect",
        "超过保留时间，会话已回收": "kept for too long after the page left, so it was reclaimed",
        "工具箱已重载": "the toolbox was reloaded",
        "会话已结束（超过保留时间或已关闭）": "The session has ended (its retention window passed or it was closed)",
        "多标签交互终端。监控与文件浏览各用一条独立连接，不会打断当前画面；切换工作区再回来会自动接回原会话，关掉标签才会真正断开。": "A tabbed interactive terminal. Monitoring and file browsing each use their own connection so the screen is never disturbed; switching workspace sessions and coming back re-attaches the running sessions, and a tab only ends when it is closed.",
        "共享给 DSH": "Share with DSH",
        "取消共享": "Stop sharing",
        "共享给 DSH：允许它读取当前屏幕并代你输入命令": "Share with DSH: let it read this screen and type commands for you",
        "取消共享：DSH 将无法读取或操作这个会话": "Stop sharing: DSH can no longer read or drive this session",
        "已共享给 DSH": "Shared with DSH",
        "DSH 操作中": "DSH is typing",
        "收回控制": "Take back control",
        "DSH 请求执行危险命令": "DSH wants to run a dangerous command",
        "允许执行": "Allow",
        "拒绝": "Refuse",
        "只会执行这一次；拒绝后 DSH 不会重试。": "Approved for this one time only; DSH does not retry a refusal.",
        "该会话没有共享给 DSH（在终端标签上点「共享给 DSH」）": "This session is not shared with DSH (click \"Share with DSH\" on its tab)",
        "DSH 正在执行上一条命令，请稍候": "DSH is still running the previous command; try again shortly",
        "命令不能为空": "The command is empty",
        "危险命令未获授权（页面长时间没有响应）": "The dangerous command was not approved (the page did not answer)",
        "危险命令未获授权：${line}": "The dangerous command was not approved: ${line}",
        "有多个会话匹配「${text}」，请用会话 id": "Several sessions match \"${text}\"; pass a session id",
        "找不到会话「${text}」": "No session matches \"${text}\"",
        "没有共享给 DSH 的会话（在终端标签上点「共享给 DSH」）": "No session is shared with DSH (click \"Share with DSH\" on a tab)",
        "有多个共享会话，请用 session 参数指定其中一个": "Several sessions are shared; name one with the session argument",
        "不支持的按键：${key}": "Unsupported key: ${key}",
        "终端里没有已连接的会话。先在「网络运维工具箱 → 终端 / 设备簿」里连接设备，再在标签上点「共享给 DSH」。": "No terminal session is connected. Open \"Network Operations Toolbox → Terminal / devices\", connect a device, then click \"Share with DSH\" on its tab.",
        "共 ${count} 个会话；只有已共享的可以读取和操作。": "${count} session(s); only shared ones can be read or driven.",
        "（没有输出）": "(no output)",
        "（光标 ${cursor}${truncated}）": "(cursor ${cursor}${truncated})",
        "，更早的输出已省略": ", earlier output was dropped",
        "send 需要 line 参数": "send needs a line argument",
        "用户已收回控制，命令被中断": "The user took back control and the command was interrupted",
        "等待超时，输出可能还没结束": "The wait timed out; more output may still arrive",
        "（光标 ${cursor}）": "(cursor ${cursor})",
        "已向 ${name} 发送按键 ${key}": "Sent key ${key} to ${name}",
        "未知动作：${action}": "Unknown action: ${action}",
        "失败：${reason}": "Failed: ${reason}",
        "多标签交互终端。监控与文件浏览各用一条独立连接，不会打断当前画面；切换工作区再回来会自动接回原会话（离开后保留 20 分钟），关掉标签才会真正断开。把某个标签「共享给 DSH」后，它可以读取该会话并代你输入命令，危险命令需要你在页面上确认。点「浮窗」可以把当前标签钉到右上角小窗，切到工作区会话后继续显示。": "A tabbed interactive terminal. Monitoring and file browsing each use their own connection so the screen is never disturbed; switching workspace sessions and coming back re-attaches the running sessions (they are kept for 20 minutes after you leave), and a tab only ends when it is closed. A tab shared with DSH can be read and driven by the model; dangerous commands wait for your approval in the page. The Float button pins the current tab to a corner window that stays visible while a workspace session is shown.",
        "正在操作 ${name}": "Using ${name} now",
        "已共享 ${count} 个终端：${names}": "${count} terminal(s) shared with DSH: ${names}",
        "打开终端": "Open terminal",
        "全部取消共享": "Stop sharing all",
        "查看共享给 DSH 的终端": "Show the terminals shared with DSH",
        "${count} 个终端": "${count} terminal(s)",
        "配置发送 DSH 提问": "Send config to DSH",
        "回到底部": "Back to newest line",
        "更早的输出已被裁剪，只保留最近的会话历史": "Older output was trimmed; only the recent session history is left",
        "终端": "Terminal",
        "浮窗": "Float",
        "取消浮窗": "Stop floating",
        "浮窗终端": "Floating terminal",
        "已取消浮窗": "Floating window closed",
        "已浮窗：切到工作区会话后，这个终端会留在右上角": "Floating: this terminal stays in the top-right corner when you switch to a workspace session",
        "取消浮窗：切走后不再保留小窗": "Stop floating: the corner window will not be kept when you switch away",
        "浮窗：切到工作区会话后，这个终端留在右上角继续显示": "Float: keep this terminal in the top-right corner when you switch to a workspace session",
        "回到工具箱面板": "Back to the toolbox panel",
        "面板": "Panel",
        "回面板": "Open panel",
        "共享设置失败": "Could not change sharing",
        "关于与使用说明": "About & usage guide",
        "工具怎么用": "How each tool works",
        "打开这个工具": "Open this tool",
        "Agent 工具": "Agent tools",
        "这是装在 DeepSeek Harness 里的网络运维工作台：${tools} 个网络与 Datacom 工具收在一个面板里，同一套能力又注册成 ${agents} 个 Agent 工具，DSH 可以直接调用。": "A network operations workbench inside DeepSeek Harness: ${tools} network and Datacom tools in one panel, with the same capabilities registered as ${agents} agent tools that DSH can call directly.",
        "面板与模型共用同一套引擎：同一个工具既能在面板里点，也能被 DSH 直接调用。": "The panel and the model share one engine: every tool can be clicked in the panel or called by DSH directly.",
        "网络探测都在运行 DSH 的主机侧执行，不受浏览器跨域限制，通常也不需要管理员权限。": "All network probes run on the host that runs DSH, so browser CORS never applies and administrator rights are usually not needed.",
        "零第三方依赖：只用 Node 标准库与系统自带命令；SSH 依赖本机的 plink 或 ssh，iperf3 需要自备可执行文件。": "No third-party dependencies: only the Node standard library and the commands the OS already ships. SSH relies on a local plink or ssh, and iperf3 needs its own executable.",
        "数据都放在 ~/.dsh-nwtool：配置备份、拓扑图纸、设备簿与终端转录。": "Everything lives under ~/.dsh-nwtool: configuration backups, topology drawings, the device book and terminal transcripts.",
        "界面语言跟随 DSH，切换不需要刷新页面；设备密码可加密保存，也可以每次输入。": "The UI follows the DSH language and switches without a reload; device passwords can be stored encrypted or typed each time.",
        "下面这些工具注册给模型，可以直接在对话里让它调用，也可以写进提示词让它自己挑。描述里的「只读」表示不会改动设备或本机状态。": "These tools are registered for the model: it can call them from a conversation, or pick one from a prompt. 'Read-only' in a description means the device and this machine are not modified.",
        "对主机做 ICMP 探测，返回每包往返时延、TTL 与丢包统计。": "Ping a host over ICMP and return per-packet round-trip time, TTL and loss statistics.",
        "对指定 TCP 端口测量连接耗时，ICMP 被过滤时也能判断可达性。": "Measure TCP connect time to a port; works when ICMP is filtered.",
        "逐跳追踪到目标的路径，给出每跳往返时延与丢包。": "Trace the path hop by hop with per-hop round-trip time and loss.",
        "查询域名解析；指定 server 时用原始 DNS 报文（等价 dig），省略则用系统解析器。": "Resolve a name; pass a server to query it with a raw DNS message (dig semantics), or omit it to use the system resolver.",
        "从运行 DSH 的主机发 HTTP 请求，返回状态码、响应头、耗时与正文，适合验证 API。": "Send an HTTP request from the machine running DSH and return status, headers, timing and body — handy for checking an API.",
        "对单台主机做 TCP connect 扫描，列出开放端口。": "TCP connect scan of one host, listing open ports.",
        "在网段、地址范围或单个地址中发现存活主机。": "Discover live hosts in a subnet, an address range or a single address.",
        "纯子网计算：网络地址、广播地址、可用范围、通配符掩码与二进制。": "Pure subnet math: network and broadcast address, usable range, wildcard mask and binary notation.",
        "通过 UDP 查询 NTP/SNTP，报告本机时钟偏差、往返时延与服务器层级；只读，不改系统时钟。": "Query NTP/SNTP over UDP and report the local clock offset, round-trip delay and server stratum. Read-only: the system clock is never changed.",
        "查询 IP 的归属地、运营商与 ASN；内网与保留地址在本地判断，不外发。": "Look up an IP's location, ISP and ASN; private and reserved ranges are classified locally and never sent out.",
        "列出本机 TCP/UDP 套接字：本地与对端地址、状态、所属进程与 PID。只读。": "List the local TCP/UDP sockets: local and remote address, state, owning process and PID. Read-only.",
        "读取本机 ARP / 邻居缓存：地址、MAC、厂商与接口。只读，增删需要管理员权限。": "Read the local ARP / neighbour cache: address, MAC, vendor and interface. Read-only; adding or deleting entries needs administrator rights.",
        "列出已归档的设备配置备份，最新的在前。": "List archived device configuration backups, newest first.",
        "按 id 读取一份配置备份，输出有长度上限，便于逐段审阅。": "Read one stored backup by id; the output is capped so it stays reviewable.",
        "在一份配置（备份 id 或原始文本）里搜关键字，返回命中行与上下文。": "Search a configuration (a backup id or raw text) for a keyword and return the matching lines with context.",
        "对比两份配置（两份备份或两段文本），报告新增、删除与修改的行。": "Compare two configurations (two backups or two texts) and report added, removed and changed lines.",
        "通过 SSH/Telnet 在一台或多台设备上执行一组只读命令，可把输出归档成备份。": "Run a set of read-only commands on one or more devices over SSH/Telnet, optionally archiving the output as a backup.",
        "用 SNMP v2c GET 读 SYSTEM 组，识别设备名称、描述、型号与运行时长。": "Identify devices with SNMP v2c GET on the SYSTEM group: name, description, model and uptime.",
        "查同一功能在华为 VRP/H3C Comware 与思科 IOS/NX-OS 里的等价命令。": "Look up the equivalent command across Huawei VRP / H3C Comware and Cisco IOS / NX-OS.",
        "查看或操作你共享给 DSH 的终端会话；默认不共享，只有你明确共享的会话可用。": "See or drive a terminal session you shared with DSH. Sessions are private by default; only the ones you explicitly shared are reachable."
      }
    }
    /* i18n:messages:end */

    /** The language messages are authored in; lookups in it return the source. */
    const SOURCE_LANGUAGE = 'zh'
    const FALLBACK_LANGUAGE = 'en'

    /*
     * The Harness owns the preference. `ctx.get('locale')` is the optional read
     * (no hard dependency) and its snapshot carries the active id under
     * `active` — `zh`, `en`, `ja`, … The first version of this block looked for
     * `id`/`locale`/`lang` and then scanned the snapshot text, where the
     * `locales` catalog always contains `zh`, so every switch resolved to
     * Chinese. `<html lang>` is the second signal: the locale plugin points it
     * at the active language, which keeps the panel honest even if the service
     * is unreachable.
     */

    const languageListeners = new Set()
    const languageTeardowns = []
    let localeFace = null
    let hostContext = null
    let faceWatched = false
    let documentWatched = false

    function tagOf(value) {
      return String(value ?? '').trim().toLowerCase().replace(/_/g, '-')
    }

    /** Fill `${name}` and `{name}` placeholders; unknown ones are left untouched. */
    function interpolate(template, params) {
      if (!params) return template
      return template.replace(/\$\{([^}]+)\}|\{(\w+)\}/g, (match, expression, plain) => {
        const key = String(expression ?? plain).trim()
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
      })
    }

    /**
     * Translate one authored message. The active language wins, English stands in
     * for every language without its own table, and the Chinese source is the
     * last resort — a missing entry can never blank out the UI.
     */
    function t(text, params) {
      const source = String(text)
      const language = currentLanguage()
      if (language === SOURCE_LANGUAGE) return interpolate(source, params)
      const table = MESSAGES[language]
      const fallback = MESSAGES[FALLBACK_LANGUAGE]
      const translated = (table && typeof table[source] === 'string' && table[source])
        || (fallback && typeof fallback[source] === 'string' && fallback[source])
        || source
      return interpolate(translated, params)
    }

    /** Cache the locale service; a shell without one simply never resolves it. */
    function readLocaleFace() {
      if (localeFace) return localeFace
      try {
        const face = hostContext?.get?.('locale')
        if (face && typeof face.subscribe === 'function') localeFace = face
      } catch {
        /* no locale service in this shell */
      }
      return localeFace
    }

    /** `LocaleSnapshot` is exactly `{ active, locales, revision }`. */
    function snapshotTag() {
      const face = readLocaleFace()
      if (!face) return ''
      try {
        const snapshot = face.getSnapshot?.() ?? face.getLocale?.()
        for (const value of [snapshot?.active, snapshot?.id, snapshot?.locale, snapshot?.lang]) {
          const tag = tagOf(value)
          if (tag) return tag
        }
      } catch {
        /* a broken face must not break the panel */
      }
      return ''
    }

    function documentTag() {
      try {
        return tagOf(document.documentElement?.lang)
      } catch {
        return ''
      }
    }

    function browserTag() {
      try {
        if (Array.isArray(navigator.languages) && navigator.languages.length) return tagOf(navigator.languages[0])
        return tagOf(navigator.language)
      } catch {
        return ''
      }
    }

    /** Resolved on every read, so a label thunk can never show a stale language. */
    function currentLanguage() {
      const tag = snapshotTag() || documentTag() || browserTag()
      return tag ? tag.split('-')[0] : FALLBACK_LANGUAGE
    }

    function announceLanguage() {
      for (const listener of languageListeners) listener()
    }

    /** Idempotent: apply() arms it early, the panel rearms it on mount. */
    function watchLanguage() {
      const face = readLocaleFace()
      if (face && !faceWatched) {
        try {
          const off = face.subscribe(announceLanguage)
          if (typeof off === 'function') languageTeardowns.push(off)
          faceWatched = true
        } catch {
          /* ignore a face that refuses subscribers */
        }
      }
      if (!documentWatched) {
        try {
          if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver(announceLanguage)
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
            languageTeardowns.push(() => observer.disconnect())
          }
          documentWatched = true
        } catch {
          /* no DOM observer in this shell */
        }
      }
    }

    function releaseLanguageWatch() {
      while (languageTeardowns.length) {
        const off = languageTeardowns.pop()
        try {
          off()
        } catch {
          /* ignore a disposer that throws on teardown */
        }
      }
      faceWatched = false
      documentWatched = false
    }

    function useLanguage() {
      const [language, setLanguage] = useState(currentLanguage)
      useEffect(() => {
        const listener = () => setLanguage(currentLanguage())
        languageListeners.add(listener)
        watchLanguage()
        listener()
        return () => { languageListeners.delete(listener) }
      }, [])
      return language
    }

    /* ------------------------------------------------------------ */
    /* Stylesheet                                                    */
    /* ------------------------------------------------------------ */

    const CSS = `
.nwt-root {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
  isolation: isolate;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}

/* Aurora backdrop -------------------------------------------------
   Artwork, not chrome: the ribbon palette is literal so the curtain can hold
   cyan -> blue -> violet -> magenta. No green, and no hue-rotate anywhere,
   because a rotating hue would drift into green. */
.nwt-aura {
  position: absolute;
  inset: -34% -18%;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  opacity: 0.26;
  animation: nwt-aura-breathe 26s ease-in-out infinite;
}
.nwt-aura > span {
  position: absolute;
  display: block;
  border-radius: 50%;
  /* The blur belongs to each ribbon, not to their parent: a filtered parent must
     rasterise its whole subtree again on every frame, which is what made the
     drift look steppy. Per-ribbon, the texture is cached and only transforms. */
  filter: blur(30px);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 32%, #000 68%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 32%, #000 68%, transparent 100%);
}
.nwt-aura > span:nth-child(1) {
  top: -6%;
  left: -12%;
  width: 124%;
  height: 54%;
  background: linear-gradient(96deg, transparent 2%, #22d3ee 22%, #38bdf8 38%, transparent 58%, #6366f1 78%, transparent 96%);
  animation: nwt-aurora-a 104s ease-in-out infinite;
}
.nwt-aura > span:nth-child(2) {
  top: 24%;
  left: -20%;
  width: 140%;
  height: 60%;
  opacity: 0.72;
  background: linear-gradient(84deg, transparent 2%, #818cf8 20%, transparent 44%, #a855f7 62%, #e879f9 78%, transparent 98%);
  animation: nwt-aurora-b 138s ease-in-out infinite;
}
.nwt-aura > span:nth-child(3) {
  top: 56%;
  left: -8%;
  width: 116%;
  height: 48%;
  opacity: 0.66;
  background: linear-gradient(102deg, transparent 0%, #60a5fa 18%, #8b5cf6 34%, transparent 56%, #ec4899 84%, transparent 100%);
  animation: nwt-aurora-c 122s ease-in-out infinite;
}
@keyframes nwt-aurora-a {
  0%, 100% { transform: translate3d(-6%, 0, 0) rotate(-12deg) scaleY(1); }
  50% { transform: translate3d(8%, -4%, 0) rotate(-7deg) scaleY(1.18); }
}
@keyframes nwt-aurora-b {
  0%, 100% { transform: translate3d(5%, 2%, 0) rotate(9deg) scaleY(1.06); }
  50% { transform: translate3d(-9%, -3%, 0) rotate(5deg) scaleY(0.92); }
}
@keyframes nwt-aurora-c {
  0%, 100% { transform: translate3d(0, 3%, 0) rotate(-5deg) scaleY(0.96); }
  50% { transform: translate3d(10%, -6%, 0) rotate(-1deg) scaleY(1.12); }
}
@keyframes nwt-aura-breathe {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.36; }
}

/* Navigation ------------------------------------------------------ */
.nwt-nav {
  position: relative;
  z-index: 1;
  width: 218px;
  flex: 0 0 218px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 72%, transparent);
}
.nwt-nav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px 14px;
  scrollbar-width: thin;
}
.nwt-nav-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px 11px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
}
.nwt-nav-foot-name { font-weight: 600; }
.nwt-nav-foot-version { font-family: ${MONO}; opacity: 0.72; }
/* The guide sits next to the version, where the eye already goes for "what is
   this thing". It opens inside the panel, so it never covers another panel. */
.nwt-nav-about {
  margin-left: auto;
  flex: none;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 10.5px;
  line-height: 1.5;
  cursor: pointer;
}
.nwt-nav-about:hover {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.nwt-nav-about:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* About / usage guide --------------------------------------------- */
.nwt-about {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 18px;
  background: var(--dsw-alias-bg-base);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent);
}
.nwt-about-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 780px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 20px 44px -24px rgba(0, 0, 0, .6);
  animation: nwt-pane-in .22s cubic-bezier(.2, .7, .2, 1) both;
}
.nwt-about-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 9px 10px 9px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 60%, transparent);
}
.nwt-about-title { font-size: 13px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.nwt-about-version { font-family: ${MONO}; font-size: 10.5px; color: var(--dsw-alias-label-secondary); opacity: .8; }
.nwt-about-spacer { flex: 1; }
.nwt-about-body { flex: 1; min-height: 0; overflow-y: auto; padding: 13px 15px 18px; scrollbar-width: thin; }
.nwt-about-lead {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--dsw-alias-label-primary);
}
.nwt-about-list {
  margin: 0 0 6px;
  padding-left: 17px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--dsw-alias-label-secondary);
}
.nwt-about-h {
  margin: 18px 0 7px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.nwt-about-sub { margin: 0 0 8px; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary); }
.nwt-about-group { display: block; }
.nwt-about-row {
  display: grid;
  grid-template-columns: minmax(84px, 32%) minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  align-items: baseline;
  padding: 4px 6px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
.nwt-about-row--tool { cursor: pointer; }
.nwt-about-row--tool:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-about-row--agent { grid-template-columns: minmax(112px, 42%) minmax(0, 1fr); }
.nwt-about-name { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.nwt-about-code {
  font-family: ${MONO};
  font-size: 11px;
  color: var(--dsw-alias-label-primary);
  word-break: break-all;
}
.nwt-about-text { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.nwt-about-row--tool:hover .nwt-about-text { color: var(--dsw-alias-label-primary); }
.nwt-nav-head {
  padding: 4px 10px 12px;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.nwt-nav-head small {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
.nwt-group { margin-top: 2px; }
.nwt-group + .nwt-group { margin-top: 10px; }
/* The heading is a filled capsule, so the level is read from its surface
   rather than from the text colour. */
.nwt-group-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  margin: 0;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 50%, transparent);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-align: left;
  cursor: pointer;
  transition: color .16s ease, background .16s ease, border-color .16s ease;
}
.nwt-group-btn:hover {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 68%, transparent);
  border-color: var(--dsw-alias-border-l2);
}
.nwt-group-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.nwt-chev {
  flex: 0 0 auto;
  transition: transform .24s cubic-bezier(.4, 0, .2, 1);
}
.nwt-group--closed .nwt-chev { transform: rotate(-90deg); }
.nwt-count {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
  opacity: .7;
}
.nwt-group-body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows .26s cubic-bezier(.4, 0, .2, 1), opacity .2s ease;
}
.nwt-group--closed .nwt-group-body { grid-template-rows: 0fr; opacity: 0; }
.nwt-group-inner { min-height: 0; overflow: hidden; }

.nwt-item {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  margin: 1px 0;
  padding: 7px 10px 7px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
.nwt-item::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 2px;
  background: var(--dsw-alias-brand-primary);
  transform: translateY(-50%);
  opacity: 0;
  transition: height .22s cubic-bezier(.4, 0, .2, 1), opacity .22s ease;
}
.nwt-item:hover {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
  transform: translateX(1px);
}
.nwt-item:hover::before { height: 12px; opacity: .45; }
.nwt-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.nwt-item--active {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, var(--dsw-alias-bg-layer-1));
  border-color: var(--dsw-alias-border-l2);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
  box-shadow: 0 2px 14px -8px var(--dsw-alias-brand-primary);
  font-weight: 600;
}
.nwt-item--active::before { height: 18px; opacity: 1; }
/* :hover is more specific than a plain class, so the selected item needs its
   own hover rule or hovering it would look un-selected again. */
.nwt-item--active:hover {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, var(--dsw-alias-bg-layer-1));
  border-color: var(--dsw-alias-border-l2);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 46%, transparent);
}

/* Content --------------------------------------------------------- */
.nwt-main {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.nwt-head {
  position: relative;
  padding: 15px 20px 11px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent);
}
/* A faint aurora horizon under the header. */
.nwt-head::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, #22d3ee 24%, #a855f7 54%, #e879f9 76%, transparent 100%);
  opacity: 0.28;
  animation: nwt-horizon 22s ease-in-out infinite;
}
@keyframes nwt-horizon {
  0%, 100% { opacity: 0.18; }
  50% { opacity: 0.32; }
}
.nwt-crumb {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--dsw-alias-label-secondary);
}
.nwt-crumb b { font-weight: 500; }
.nwt-title {
  margin: 3px 0 0;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.nwt-title::after {
  content: '';
  display: block;
  width: 38px;
  height: 2px;
  margin-top: 6px;
  border-radius: 2px;
  background: linear-gradient(90deg, #22d3ee, #8b5cf6 62%, transparent);
  opacity: 0.85;
}
.nwt-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  max-width: 78ch;
}
.nwt-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 15px 20px 52px;
  scrollbar-width: thin;
}
.nwt-pane { animation: nwt-pane-in .3s cubic-bezier(.2, .7, .2, 1) both; }
@keyframes nwt-pane-in {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: none; }
}

/* Blocks ---------------------------------------------------------- */
.nwt-card {
  padding: 14px;
  margin-bottom: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 84%, transparent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
  animation: nwt-pane-in .32s cubic-bezier(.2, .7, .2, 1) both;
}
.nwt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(186px, 1fr));
  gap: 11px;
}
.nwt-field { display: flex; flex-direction: column; gap: 5px; }
.nwt-field--wide { grid-column: 1 / -1; }
.nwt-label {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  letter-spacing: 0.01em;
}
.nwt-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease;
}
.nwt-input:hover { border-color: var(--dsw-alias-border-l2); }
.nwt-input:focus {
  border-color: var(--dsw-alias-brand-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 62%, var(--dsw-alias-border-l1));
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
}
.nwt-input--mono { font-family: ${MONO}; resize: vertical; }
.nwt-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 15px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}
.nwt-switch input { width: 15px; height: 15px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.nwt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-top: 13px; }

/* Buttons --------------------------------------------------------- */
.nwt-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: transform .13s ease, box-shadow .18s ease, background .16s ease, border-color .16s ease;
}
.nwt-btn:hover { transform: translateY(-1px); box-shadow: 0 5px 14px -8px rgba(0, 0, 0, .55); }
.nwt-btn:active { transform: translateY(0) scale(.985); box-shadow: none; }
.nwt-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.nwt-btn--primary {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary);
  background: linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 78%, var(--dsw-alias-bg-base)), var(--dsw-alias-brand-primary));
  color: var(--dsw-alias-bg-base);
  font-weight: 600;
  box-shadow: 0 6px 18px -10px var(--dsw-alias-brand-primary);
}
.nwt-btn--primary:hover { box-shadow: 0 9px 22px -10px var(--dsw-alias-brand-primary); }
.nwt-btn--ghost { background: transparent; border-color: var(--dsw-alias-border-l1); }
.nwt-btn--small { padding: 4px 10px; font-size: 11.5px; }
.nwt-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Running indicator ---------------------------------------------- */
.nwt-running {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 11px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.nwt-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  animation: nwt-pulse 1.4s ease-in-out infinite;
}
@keyframes nwt-pulse {
  0%, 100% { opacity: .35; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.nwt-progress {
  position: relative;
  flex: 1;
  height: 2px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--dsw-alias-border-l1);
}
.nwt-progress::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 42%;
  background: linear-gradient(90deg, transparent, var(--dsw-alias-brand-primary), transparent);
  animation: nwt-sweep 1.35s cubic-bezier(.4, 0, .2, 1) infinite;
}
@keyframes nwt-sweep {
  from { transform: translateX(-105%); }
  to { transform: translateX(250%); }
}

/* Chips, key/value, tables --------------------------------------- */
.nwt-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
.nwt-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent);
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  animation: nwt-chip-in .26s cubic-bezier(.2, .7, .2, 1) both;
}
.nwt-chip b { font-weight: 500; color: var(--dsw-alias-label-secondary); }
@keyframes nwt-chip-in {
  from { opacity: 0; transform: translateY(3px) scale(.97); }
  to { opacity: 1; transform: none; }
}

.nwt-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(238px, 1fr));
  gap: 3px 18px;
  margin-bottom: 14px;
}
.nwt-kv-row {
  display: flex;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--dsw-alias-border-l1);
  animation: nwt-pane-in .28s ease both;
}
.nwt-kv-k { flex: 0 0 auto; min-width: 86px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nwt-kv-v {
  font-family: ${MONO};
  font-size: 12px;
  word-break: break-all;
}

.nwt-table-wrap {
  margin-bottom: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  overflow: auto;
  max-height: 430px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 66%, transparent);
}
.nwt-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
.nwt-th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 11px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
}
.nwt-td {
  padding: 6px 11px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-family: ${MONO};
  font-size: 11.5px;
  vertical-align: top;
  word-break: break-all;
  transition: background .14s ease;
}
.nwt-tr:last-child .nwt-td { border-bottom: 0; }
.nwt-tr:hover .nwt-td {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
}

/* Text, logs, notices -------------------------------------------- */
.nwt-pre {
  margin: 0 0 14px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent);
  font-family: ${MONO};
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow: auto;
}
.nwt-details {
  margin-bottom: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent);
  overflow: hidden;
}
.nwt-details > summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  transition: background .15s ease;
}
.nwt-details > summary::-webkit-details-marker { display: none; }
.nwt-details > summary::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--dsw-alias-label-secondary);
  border-bottom: 1.5px solid var(--dsw-alias-label-secondary);
  transform: rotate(-45deg);
  transition: transform .2s ease;
}
.nwt-details[open] > summary::before { transform: rotate(45deg); }
.nwt-details > summary:hover {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 62%, transparent);
}
.nwt-details-body {
  margin: 0;
  padding: 0 13px 12px;
  font-family: ${MONO};
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 340px;
  overflow: auto;
}
.nwt-log-line {
  font-family: ${MONO};
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  animation: nwt-log-in .18s ease both;
}
@keyframes nwt-log-in {
  from { opacity: 0; transform: translateX(-3px); }
  to { opacity: 1; transform: none; }
}
.nwt-notice {
  margin-bottom: 9px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-warn-primary);
  border-left-width: 3px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);
  font-size: 12px;
  animation: nwt-pane-in .26s ease both;
}
.nwt-error {
  margin-bottom: 11px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-left-width: 3px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  font-size: 12px;
  animation: nwt-pane-in .26s ease both;
}
.nwt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 44px 20px;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
  text-align: center;
}
.nwt-empty svg { opacity: .5; }
.nwt-foot {
  margin-top: 26px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  opacity: .85;
  max-width: 92ch;
}

/* Diff ------------------------------------------------------------ */
.nwt-diff-wrap {
  margin-bottom: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  overflow: auto;
  max-height: 500px;
}
.nwt-diff { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-family: ${MONO}; font-size: 11.5px; }
.nwt-diff td { padding: 2px 9px; vertical-align: top; white-space: pre-wrap; word-break: break-all; }
.nwt-diff .nwt-line-no { width: 44px; color: var(--dsw-alias-label-secondary); opacity: .7; }
.nwt-diff-add {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent);
}
.nwt-diff-del {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent);
}
.nwt-diff-change {
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 15%, transparent);
}

/* Scrollbars ------------------------------------------------------ */
.nwt-nav-scroll::-webkit-scrollbar, .nwt-body::-webkit-scrollbar,
.nwt-table-wrap::-webkit-scrollbar, .nwt-diff-wrap::-webkit-scrollbar,
.nwt-pre::-webkit-scrollbar, .nwt-details-body::-webkit-scrollbar,
.nwt-term-screen::-webkit-scrollbar, .nwt-float-screen::-webkit-scrollbar { width: 9px; height: 9px; }
.nwt-nav-scroll::-webkit-scrollbar-thumb, .nwt-body::-webkit-scrollbar-thumb,
.nwt-table-wrap::-webkit-scrollbar-thumb, .nwt-diff-wrap::-webkit-scrollbar-thumb,
.nwt-pre::-webkit-scrollbar-thumb, .nwt-details-body::-webkit-scrollbar-thumb,
.nwt-term-screen::-webkit-scrollbar-thumb, .nwt-float-screen::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 9px;
  background-clip: content-box;
  background-color: var(--dsw-alias-border-l2);
}
.nwt-nav-scroll::-webkit-scrollbar-track, .nwt-body::-webkit-scrollbar-track,
.nwt-table-wrap::-webkit-scrollbar-track, .nwt-diff-wrap::-webkit-scrollbar-track,
.nwt-pre::-webkit-scrollbar-track, .nwt-details-body::-webkit-scrollbar-track,
.nwt-term-screen::-webkit-scrollbar-track, .nwt-float-screen::-webkit-scrollbar-track { background: transparent; }

/* Terminal */
.nwt-select {
  appearance: none; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  padding: 6px 10px; font: inherit; font-size: 13px; cursor: pointer;
}
.nwt-select:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* Native dropdown popups follow color-scheme, not the CSS colours: without it
   the list renders white-on-white in the dark theme. A datalist popup follows
   the colour scheme of the input it belongs to, so inputs need it too. */
.nwt-root select, .nwt-root input { color-scheme: light; }
[data-ds-dark-theme] .nwt-root select, [data-ds-dark-theme] .nwt-root input { color-scheme: dark; }
.nwt-root option {
  background-color: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.nwt-term-hint {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; flex: 1; min-width: 0; min-height: 0; padding: 24px;
  border-radius: 10px; border: 1px dashed var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); font-size: 13px; text-align: center;
}
/* The pane parent has no fixed height, so the terminal must bring its own:
   height:100% would collapse the screen to nothing once the form is hidden. */
.nwt-term {
  display: flex; gap: 12px;
  height: clamp(420px, 62vh, 760px);
  min-height: 0; margin-bottom: 8px;
}
.nwt-term-side {
  display: flex; flex-direction: column; gap: 8px;
  width: 176px; flex: none; min-height: 0;
}
.nwt-term-side-head {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary);
  letter-spacing: .04em;
}
.nwt-term-side-actions { display: flex; align-items: center; gap: 2px; }
.nwt-term-side-actions .nwt-btn { padding-left: 6px; padding-right: 6px; }
.nwt-term-pass { width: 150px; }
.nwt-term--collapsed .nwt-term-main { min-height: 0; }
.nwt-term-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; }
.nwt-term-item {
  display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
  padding: 8px 10px; border-radius: 8px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit;
  transition: background .18s ease, border-color .18s ease;
}
.nwt-term-item b { font-size: 13px; font-weight: 600; }
.nwt-term-item small { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nwt-term-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-term-item--active,
.nwt-term-item--active:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-secondary);
}
.nwt-term-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 10px 2px; }
/* Grouped book: one collapsible block per group name. */
.nwt-term-group { display: flex; flex-direction: column; gap: 4px; }
.nwt-term-group-head {
  display: flex; align-items: center; gap: 4px; width: 100%;
  border: none; background: transparent; padding: 2px 0; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font: inherit;
  font-size: 11px; font-weight: 600; letter-spacing: .03em; text-align: left;
}
.nwt-term-group-head:hover { color: var(--dsw-alias-label-primary); }
.nwt-term-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nwt-term-group-count { font-size: 10px; font-weight: 400; opacity: .7; }
.nwt-term-group--closed .nwt-chev { transform: rotate(-90deg); }
.nwt-term-tabs {
  display: flex; align-items: center; gap: 4px;
  overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; flex: none;
  scrollbar-width: thin;
}
.nwt-term-tab {
  display: flex; align-items: center; gap: 2px; flex: none; max-width: 210px;
  height: 28px; padding: 0 3px 0 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  transition: background .18s ease, border-color .18s ease;
}
.nwt-term-tab:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-term-tab--active,
.nwt-term-tab--active:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-secondary);
}
.nwt-term-tab-btn {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  border: none; background: transparent; padding: 0; cursor: pointer;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
}
.nwt-term-tab-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nwt-term-tab-share {
  flex: none; padding: 0 4px; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-secondary);
  font-size: 9px; font-weight: 700; letter-spacing: .04em; line-height: 14px;
}
.nwt-term-tab-x {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 18px; height: 18px; border: none; border-radius: 4px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; line-height: 1;
  cursor: pointer; padding: 0;
}
.nwt-term-tab-x:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nwt-term-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-secondary); }
.nwt-term-dot--on { background: #2fbf71; box-shadow: 0 0 0 2px rgba(47, 191, 113, .18); }
.nwt-term-dot--off { background: #e5534b; box-shadow: 0 0 0 2px rgba(229, 83, 75, .16); }
.nwt-term-dot--wait { background: #d0a215; animation: nwt-caret 1.1s steps(1) infinite; }
.nwt-term-main { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; min-height: 0; }
.nwt-term-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nwt-term-spacer { flex: 1; }
.nwt-term-agent {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  padding: 2px 8px; border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-primary); font-size: 11px; font-weight: 600;
}
.nwt-term-agent-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: #d0a215; animation: nwt-caret 1.1s steps(1) infinite;
}
.nwt-term-approval { width: 420px; max-width: 100%; grid-template-columns: minmax(0, 1fr); }
.nwt-term-approval-cmd {
  margin: 0; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  white-space: pre-wrap; word-break: break-all;
}
/* Ambient strip under the composer while a device console is shared with DSH. */
.nwt-share-trigger {
  display: inline-flex; align-items: center; gap: 5px;
  height: 20px; padding: 0 8px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font-family: inherit; font-size: 11px; line-height: 1; cursor: pointer;
}
.nwt-share-trigger:hover,
.nwt-share-trigger--open { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nwt-share-trigger-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: #d0a215; animation: nwt-caret 1.1s steps(1) infinite;
}
.nwt-share-trigger-text { white-space: nowrap; }
.nwt-share-trigger-caret { font-size: 9px; opacity: .7; }
/* The list, drawn as a frame-wide overlay so the composer cannot clip it. */
.nwt-share-backdrop { position: fixed; inset: 0; z-index: 60; }
.nwt-share-menu {
  position: fixed; z-index: 61; padding: 6px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .32);
  color: var(--dsw-alias-label-primary);
  font-size: 12px; line-height: 1.4;
}
.nwt-share-menu-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 4px 8px 6px;
}
.nwt-share-menu-title { font-weight: 600; }
.nwt-share-menu-count { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.nwt-share-menu-list {
  display: flex; flex-direction: column; gap: 1px;
  padding-bottom: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.nwt-share-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 7px; }
.nwt-share-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-share-row-dot { width: 6px; height: 6px; border-radius: 2px; flex: none; background: #4c8dff; }
.nwt-share-row-dot--busy { background: #d0a215; animation: nwt-caret 1.1s steps(1) infinite; }
.nwt-share-row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nwt-share-row-host {
  margin-left: auto; color: var(--dsw-alias-label-secondary);
  font-size: 11px; font-variant-numeric: tabular-nums;
}
.nwt-share-menu-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; padding: 6px 2px 0;
}
.nwt-share-action {
  border: none; background: transparent; color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 12px; padding: 3px 8px; border-radius: 6px; cursor: pointer;
}
.nwt-share-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-share-action--danger { color: #e5534b; }
.nwt-term-encoding { width: auto; min-width: 96px; }
.nwt-term-body { display: flex; gap: 12px; flex: 1; min-height: 0; position: relative; }
/* The editor is a popup so a running session keeps its terminal underneath. */
.nwt-term-modal {
  position: absolute; inset: 0; z-index: 6;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 8px; overflow: auto;
  background: var(--dsw-alias-bg-base);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 90%, transparent);
}
.nwt-term-modal .nwt-term-form {
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; padding: 12px;
}
.nwt-term-form {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px; align-content: start; width: 344px; flex: none; overflow-y: auto;
}
.nwt-term-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nwt-term-field--wide { grid-column: 1 / -1; }
.nwt-term-field .nwt-label { font-size: 12px; }
.nwt-term-form-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nwt-term-form-title {
  grid-column: 1 / -1; font-size: 13px; font-weight: 650;
  color: var(--dsw-alias-label-primary); padding-bottom: 2px;
}
.nwt-term-info {
  display: flex; flex-direction: column; gap: 4px; align-items: center;
  color: var(--dsw-alias-label-secondary); font-size: 12px;
}
.nwt-term-info b { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 650; }
.nwt-term-actions { grid-column: 1 / -1; display: flex; gap: 8px; padding-top: 4px; }
/* The canvas sits in a stage so the keyboard sink and the "newest line" pill
   can float beside it instead of on top of the text the user wants to copy. */
.nwt-term-stage { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; }
.nwt-term-screen {
  position: relative; flex: 1; min-width: 0; min-height: 0; overflow: auto;
  border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1);
  background: #0b0f14; padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px; line-height: 18px; white-space: pre; cursor: text;
  user-select: text; overscroll-behavior: contain;
}
.nwt-term-grid { display: flex; flex-direction: column; }
.nwt-term-screen--idle .nwt-term-grid { opacity: .68; }
/* Scrollback spacers: the grid is virtualised, so the height above and below
   the rendered window is held open by an empty block of exact line height. */
.nwt-term-gap { flex: none; }
/* Session state banner: a frozen tab keeps its last screen and offers a retry. */
.nwt-term-banner {
  position: absolute; z-index: 3; left: 50%; top: 10px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; max-width: 92%;
  padding: 5px 8px 5px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary); font-size: 12px;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  white-space: nowrap; box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
}
.nwt-term-banner small {
  max-width: 320px; overflow: hidden; text-overflow: ellipsis;
  font-size: 11px; opacity: .85;
}
.nwt-term-row { height: 18px; min-height: 18px; flex: none; }
.nwt-term-jump {
  position: absolute; right: 12px; bottom: 10px; z-index: 4;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 11px; cursor: pointer; white-space: nowrap;
  box-shadow: 0 4px 14px -8px rgba(0, 0, 0, .5);
}
.nwt-term-jump:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
/* The keyboard sink: focusable (keys, IME and paste need a real field) but
   transparent to the pointer, so a drag selects the text under it. */
.nwt-term-input {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; border: none; resize: none; background: transparent;
  color: transparent; caret-color: transparent; font: inherit; padding: 8px;
  pointer-events: none;
}
.nwt-term-probe {
  position: absolute; left: -9999px; top: 0; visibility: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px;
}

/* Floating terminal: the same live session kept in view while the workspace
   shows a conversation. It lives in the frame overlay, which is click-through,
   so the window opts itself back into pointer events. */
.nwt-float {
  position: fixed; z-index: 60; display: flex; flex-direction: column;
  min-width: 280px; min-height: 150px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px);
  overflow: hidden; resize: both;
  border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 97%, transparent);
  box-shadow: 0 22px 52px -24px rgba(0, 0, 0, .6);
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  pointer-events: auto;
}
.nwt-float-head {
  display: flex; align-items: center; gap: 7px; flex: none;
  padding: 5px 5px 5px 10px; cursor: grab; user-select: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
}
.nwt-float-head:active { cursor: grabbing; }
.nwt-float-name {
  flex: 0 1 auto; min-width: 0; max-width: 150px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-primary);
}
.nwt-float-host {
  flex: 0 1 auto; min-width: 0; max-width: 120px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums;
}
.nwt-float-spacer { flex: 1; min-width: 4px; }
.nwt-float-activity { font-size: 10.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.nwt-float-btn {
  flex: none; border: none; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
  line-height: 1.4; padding: 2px 6px; cursor: pointer; white-space: nowrap;
}
.nwt-float-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nwt-float-btn:disabled { opacity: .5; cursor: default; }
.nwt-float-body { position: relative; display: flex; flex: 1; min-height: 0; }
.nwt-float-screen {
  flex: 1; min-width: 0; min-height: 0; overflow: auto;
  padding: 6px; background: #0b0f14; white-space: pre; cursor: text;
  user-select: text;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px; line-height: 16px;
}
.nwt-float-grid { display: flex; flex-direction: column; }
.nwt-float-row { height: 16px; min-height: 16px; flex: none; }
.nwt-float-probe {
  position: absolute; left: -9999px; top: 0; visibility: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
}
.nwt-float-input {
  position: absolute; inset: 0; width: 100%; height: 100%; padding: 6px;
  opacity: 0; border: none; resize: none; background: transparent;
  color: transparent; caret-color: transparent; font: inherit;
  pointer-events: none;
}
.nwt-float-note {
  flex: none; display: flex; align-items: center; gap: 8px;
  padding: 5px 8px 5px 10px; border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2); font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.nwt-float-note-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nwt-float-note--error { color: #e5534b; }
.nwt-float-approval {
  flex: none; padding: 6px 10px 7px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.nwt-float-approval-title { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.nwt-float-approval-cmd {
  margin: 4px 0 6px; max-height: 56px; overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
  color: #e5534b; white-space: pre-wrap; word-break: break-all;
}
.nwt-float-actions { display: flex; gap: 6px; }
.nwt-float-action {
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 11.5px; padding: 2px 8px; cursor: pointer;
}
.nwt-float-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-float-action--primary {
  border-color: transparent; background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base); font-weight: 600;
}

/* Right-hand inspector: live load and the device file tree. */
.nwt-term-inspector {
  display: flex; flex-direction: column; gap: 8px; flex: none;
  width: 244px; min-height: 0; overflow-y: auto;
  padding-left: 12px; border-left: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
}
.nwt-term-inspector-head {
  display: flex; align-items: center; gap: 6px; flex: none;
  font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary);
  letter-spacing: .03em;
}
.nwt-mon-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.nwt-mon-meta-text { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nwt-mon-item { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.nwt-mon-label {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-size: 11px; color: var(--dsw-alias-label-secondary);
}
.nwt-mon-label b {
  color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.nwt-mon-bar { height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.nwt-mon-bar span {
  display: block; height: 100%; border-radius: 3px;
  background: var(--dsw-alias-brand-primary);
  transition: width .4s cubic-bezier(.4, 0, .2, 1);
}
.nwt-mon-sub { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.nwt-mon-section { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.nwt-mon-row { display: flex; align-items: baseline; gap: 6px; font-size: 11px; }
.nwt-mon-row-name {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.nwt-mon-row-value { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.nwt-mon-row small { color: var(--dsw-alias-label-secondary); opacity: .8; }
.nwt-mon-foot { margin-top: auto; padding-top: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nwt-files-bar { display: flex; align-items: center; gap: 4px; flex: none; }
.nwt-files-bar .nwt-input { flex: 1; min-width: 0; font-size: 12px; }
.nwt-files { display: flex; flex-direction: column; gap: 1px; overflow-y: auto; min-height: 80px; flex: 1; }
.nwt-file-row {
  display: flex; align-items: center; gap: 6px; width: 100%;
  border: none; background: transparent; padding: 4px 6px; border-radius: 6px;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
  text-align: left; cursor: pointer;
}
.nwt-file-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-file-row--dir .nwt-file-name { font-weight: 600; }
.nwt-file-row--active { background: var(--dsw-alias-bg-layer-2); }
.nwt-file-icon { width: 10px; flex: none; color: var(--dsw-alias-label-secondary); }
.nwt-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nwt-file-row small { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.nwt-file-detail {
  display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; flex: none;
  border-radius: 8px; background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary); font-size: 11px;
}
.nwt-file-detail-name { color: var(--dsw-alias-label-primary); font-weight: 600; word-break: break-all; }

/* Bit calculator: one button per bit, four byte groups. */
.nwt-bits { display: flex; flex-wrap: wrap; gap: 14px; margin: 2px 0 4px; }
.nwt-bitgroup { display: flex; gap: 2px; }
.nwt-bit {
  width: 20px; height: 26px; padding: 0; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.nwt-bit:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-bit--on,
.nwt-bit--on:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-secondary);
  color: var(--dsw-alias-label-primary); font-weight: 600;
}

/* A quiet paragraph of explanation under a form. */
.nwt-hint { font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }

/* ARP table: one clickable row per cache entry. */
.nwt-arp { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; }
.nwt-arp-row {
  display: grid; grid-template-columns: 1.1fr 1.2fr 1fr .6fr 1fr;
  gap: 10px; align-items: center; width: 100%;
  padding: 6px 10px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.nwt-arp-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-arp-row--head {
  cursor: default; font-size: 11px; font-weight: 600;
  color: var(--dsw-alias-label-secondary); letter-spacing: .03em;
  border-bottom: 1px solid var(--dsw-alias-border-l1); border-radius: 0;
  padding-bottom: 6px;
}
.nwt-arp-row--head:hover { background: transparent; }
.nwt-arp-row small { color: var(--dsw-alias-label-secondary); }
.nwt-arp-row--active,
.nwt-arp-row--active:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-secondary);
}
.nwt-arp-ip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* Topology sketch: a scrollable canvas with absolutely placed nodes. */
.nwt-topo { position: relative; display: flex; flex-direction: column; gap: 10px; }
.nwt-topo-bar { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; }
.nwt-topo-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.nwt-topo-palette { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.nwt-topo-sheet { width: auto; min-width: 150px; max-width: 240px; }
.nwt-topo-sheet-name { width: 190px; }
.nwt-topo-zoom { display: flex; align-items: center; gap: 2px; }
.nwt-topo-zoom-value {
  min-width: 46px; padding: 3px 4px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.nwt-topo-zoom-value:hover { border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.nwt-topo-save { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nwt-topo-body { display: flex; gap: 12px; align-items: stretch; min-height: 0; }
.nwt-topo-viewport {
  flex: 1; min-width: 0; overflow: auto; max-height: calc(72vh);
  border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1);
  background-image:
    radial-gradient(circle at 1px 1px, var(--dsw-alias-border-l1) 1px, transparent 0);
  background-size: 22px 22px;
}
.nwt-topo-stage { position: relative; }
.nwt-topo-canvas { position: relative; transform-origin: top left; }
.nwt-topo-links { position: absolute; inset: 0; pointer-events: none; }
.nwt-topo-link-hit { stroke: transparent; stroke-width: 14; pointer-events: stroke; cursor: pointer; }
.nwt-topo-link-line { stroke: var(--dsw-alias-border-l2); stroke-width: 2; }
.nwt-topo-link-line--active { stroke: var(--dsw-alias-brand-primary); stroke-width: 3; }
.nwt-topo-node {
  position: absolute; display: flex; align-items: center; gap: 7px;
  padding: 5px 8px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font-size: 12px;
  cursor: grab; user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .08);
  transition: border-color .18s ease, box-shadow .18s ease;
}
.nwt-topo-node:hover { border-color: var(--dsw-alias-label-secondary); }
.nwt-topo-node--active {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2), 0 6px 18px rgba(0, 0, 0, .16);
}
.nwt-topo-node--source { border-color: var(--dsw-alias-brand-primary); border-style: dashed; }
.nwt-topo-icon { flex: none; }
.nwt-topo-node-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.nwt-topo-node--router .nwt-topo-icon { color: #6366f1; }
.nwt-topo-node--switch .nwt-topo-icon { color: #22d3ee; }
.nwt-topo-node--firewall .nwt-topo-icon { color: #ec4899; }
.nwt-topo-node--server .nwt-topo-icon { color: #a855f7; }
.nwt-topo-node--pc .nwt-topo-icon { color: #38bdf8; }
.nwt-topo-node--ac .nwt-topo-icon { color: #f59e0b; }
.nwt-topo-node--ap .nwt-topo-icon { color: #fb923c; }
.nwt-topo-node--cloud .nwt-topo-icon { color: #818cf8; }
.nwt-topo-node--other .nwt-topo-icon { color: var(--dsw-alias-label-secondary); }
.nwt-topo-node-name {
  font-weight: 600; font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nwt-topo-node-sub {
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* A note sits outside the device box, under it. */
.nwt-topo-node-note {
  position: absolute; left: 50%; top: calc(100% + 3px); transform: translateX(-50%);
  max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 1px 6px; border-radius: 5px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px; pointer-events: none;
}
.nwt-topo-node-ip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.nwt-topo-note-input { font-size: 12px; }
.nwt-topo-link-label {
  position: absolute; transform: translate(-50%, -50%);
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 1px 7px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px; pointer-events: none;
}
.nwt-topo-link-note { font-size: 12px; }
/* Group frames: dashed rounded boxes that live behind the drawing. */
.nwt-topo-frame {
  position: absolute; border: 1.5px dashed; border-radius: 16px;
  box-sizing: border-box; pointer-events: none;
}
.nwt-topo-frame--active { border-width: 2px; }
.nwt-topo-frame--draft { border-style: solid; background: transparent; }
/* Only the border and the label take the mouse, so lines inside stay clickable. */
.nwt-topo-frame-edge { position: absolute; pointer-events: auto; cursor: grab; }
.nwt-topo-frame-edge--top { left: 14px; right: 14px; top: -5px; height: 10px; }
.nwt-topo-frame-edge--bottom { left: 14px; right: 14px; bottom: -5px; height: 10px; }
.nwt-topo-frame-edge--left { top: 14px; bottom: 14px; left: -5px; width: 10px; }
.nwt-topo-frame-edge--right { top: 14px; bottom: 14px; right: -5px; width: 10px; }
.nwt-topo-frame-label {
  position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%);
  max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 1px 8px; border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  font-size: 11px; font-weight: 600; pointer-events: auto; cursor: grab;
}
.nwt-topo-frame-grip {
  position: absolute; right: -5px; bottom: -5px; width: 12px; height: 12px;
  border-radius: 3px; cursor: nwse-resize;
  border: 1px solid var(--dsw-alias-bg-base);
  background: var(--dsw-alias-label-secondary);
}
.nwt-topo-frame-note { font-size: 12px; }
.nwt-topo-frame-color { height: 30px; padding: 2px; cursor: pointer; }
.nwt-topo-link-style { width: auto; min-width: 110px; }
.nwt-topo-empty {
  position: absolute; left: 24px; top: 24px; max-width: 420px;
  font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary);
}
.nwt-topo-side {
  display: flex; flex-direction: column; gap: 8px; flex: none; width: 210px;
  padding: 10px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
}
.nwt-topo-side-title { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-secondary); }
.nwt-topo-field { display: flex; flex-direction: column; gap: 4px; }
.nwt-topo-field .nwt-label { font-size: 11px; }
.nwt-topo-help { margin-top: auto; }
/* The menu is positioned relative to the pane, not the viewport: a transformed
   ancestor would otherwise move a fixed menu far away from the cursor. */
.nwt-topo-menu {
  position: absolute; z-index: 41; min-width: 200px; max-width: 260px; max-height: 300px;
  overflow-y: auto; padding: 5px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
  display: flex; flex-direction: column; gap: 1px;
}
.nwt-topo-menu-title {
  font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary);
  padding: 4px 7px 6px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nwt-topo-menu-item {
  display: flex; align-items: baseline; gap: 6px; width: 100%;
  border: none; background: transparent; border-radius: 6px; padding: 6px 8px;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
  text-align: left; cursor: pointer;
}
.nwt-topo-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.nwt-topo-menu-item small { color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
.nwt-topo-menu-item--muted { color: var(--dsw-alias-label-secondary); }
.nwt-topo-menu-item--danger { color: var(--dsw-alias-state-error-primary); }
.nwt-topo-menu-empty { padding: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }

@media (prefers-reduced-motion: reduce) {
  .nwt-aura, .nwt-aura span, .nwt-head::after, .nwt-dot, .nwt-progress::after,
  .nwt-pane, .nwt-card, .nwt-chip, .nwt-kv-row, .nwt-log-line,
  .nwt-notice, .nwt-error, .nwt-term-row span, .nwt-term-dot--wait { animation: none !important; }
  .nwt-item, .nwt-btn, .nwt-group-body, .nwt-chev, .nwt-term-item,
  .nwt-term-tab, .nwt-term-dot, .nwt-mon-bar span, .nwt-bit { transition: none !important; }
}

@keyframes nwt-caret { 0%, 49% { opacity: 1 } 50%, 100% { opacity: .15 } }
`

    /* The panel is not the only place these classes are used: the shared-terminal
       strip lives under the composer, where the panel (and its <style> node) is
       unmounted. Install the sheet once with the plugin instead. */
    const STYLE_ID = 'nwtool-styles'

    function installStyles() {
      try {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return () => {}
        if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return () => {}
        const node = document.createElement('style')
        node.id = STYLE_ID
        node.textContent = CSS
        if (document.head?.appendChild) document.head.appendChild(node)
        return () => {
          try {
            node.remove()
          } catch {
            /* already gone */
          }
        }
      } catch {
        return () => {}
      }
    }

    /* ------------------------------------------------------------ */
    /* Small helpers                                                 */
    /* ------------------------------------------------------------ */

    function cn(...values) {
      return values.filter(Boolean).join(' ')
    }

    function Icon({ name, size = 16 }) {
      const paths = {
        network: [
          h('path', { key: 'a', d: 'M5 5 L12 12 L19 5' }),
          h('path', { key: 'b', d: 'M5 19 L12 12 L19 19' }),
          h('path', { key: 'c', d: 'M5 5 L5 19' }),
          h('path', { key: 'd', d: 'M19 5 L19 19' }),
        ],
        chevron: [h('polyline', { key: 'a', points: '7 10 12 15 17 10' })],
      }
      const dots = {
        network: [
          h('circle', { key: '1', cx: 5, cy: 5, r: 1.6 }),
          h('circle', { key: '2', cx: 19, cy: 5, r: 1.6 }),
          h('circle', { key: '3', cx: 5, cy: 19, r: 1.6 }),
          h('circle', { key: '4', cx: 19, cy: 19, r: 1.6 }),
        ],
      }
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        ...(paths[name] ?? []),
        h('g', { fill: 'currentColor', stroke: 'none' }, ...(dots[name] ?? [])),
      )
    }

    function Btn({ children, onClick, variant, size, disabled, type = 'button', title, ariaLabel }) {
      return h(
        'button',
        {
          type,
          onClick,
          disabled,
          title,
          'aria-label': ariaLabel,
          className: cn(
            'nwt-btn',
            variant === 'primary' && 'nwt-btn--primary',
            variant === 'ghost' && 'nwt-btn--ghost',
            size === 'small' && 'nwt-btn--small',
          ),
        },
        children,
      )
    }

    function Field({ field, value, onChange }) {
      if (field.type === 'switch') {
        return h(
          'label',
          { className: 'nwt-switch' },
          h('input', {
            type: 'checkbox',
            checked: value === undefined ? Boolean(field.default) : Boolean(value),
            onChange: (event) => onChange(event.target.checked),
          }),
          h('span', null, t(field.label)),
        )
      }
      let control
      if (field.type === 'select') {
        control = h(
          'select',
          {
            className: 'nwt-input',
            value: value ?? field.default ?? '',
            onChange: (event) => onChange(event.target.value),
          },
          (field.options ?? []).map((option) => h('option', { key: option.value, value: option.value }, t(option.label))),
        )
      } else if (field.type === 'textarea') {
        control = h('textarea', {
          className: 'nwt-input nwt-input--mono',
          rows: field.rows ?? 4,
          value: value ?? field.default ?? '',
          placeholder: t(field.placeholder ?? ''),
          spellCheck: false,
          onChange: (event) => onChange(event.target.value),
        })
      } else {
        control = h('input', {
          className: 'nwt-input',
          type: field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text',
          value: value ?? field.default ?? '',
          placeholder: t(field.placeholder ?? ''),
          min: field.min,
          max: field.max,
          spellCheck: false,
          onChange: (event) => onChange(event.target.value),
        })
      }
      return h(
        'div',
        { className: cn('nwt-field', field.wide && 'nwt-field--wide') },
        h('label', { className: 'nwt-label' }, t(field.label)),
        control,
      )
    }

    /* ------------------------------------------------------------ */
    /* Event stream                                                  */
    /* ------------------------------------------------------------ */

    function emptyState() {
      return {
        running: false,
        rows: [],
        stats: {},
        logs: [],
        sections: [],
        kv: [],
        text: null,
        diff: null,
        notices: [],
        progress: 0,
        error: null,
        done: false,
      }
    }

    function reduceEvent(state, event) {
      switch (event.t) {
        case 'rows':
          return { ...state, rows: event.replace ? [...event.d] : state.rows.concat(event.d) }
        case 'clear':
          return { ...state, rows: [] }
        case 'stats':
          return { ...state, stats: { ...state.stats, ...event.d } }
        case 'log':
          return { ...state, logs: state.logs.length > 600 ? state.logs : state.logs.concat([String(event.d)]) }
        case 'sections':
          return { ...state, sections: state.sections.concat(event.d) }
        case 'kv':
          return { ...state, kv: state.kv.concat(event.d) }
        case 'text':
          return { ...state, text: String(event.d) }
        case 'diff':
          return { ...state, diff: event.d }
        case 'notice':
          return { ...state, notices: state.notices.concat([String(event.d)]) }
        case 'progress':
          return { ...state, progress: Number(event.d) || 0 }
        case 'error':
          return { ...state, error: String(event.d), running: false }
        case 'done':
          return { ...state, done: true, running: false }
        default:
          return state
      }
    }

    async function streamEvents(body, onEvent, signal) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nwtool-lang': currentLanguage() },
        body: JSON.stringify({ ...body, lang: currentLanguage() }),
        signal,
      })
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch {
          /* ignore */
        }
        throw new Error(message)
      }
      if (!response.body) throw new Error(t('浏览器不支持流式响应'))
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line.trim()) continue
          try {
            onEvent(JSON.parse(line))
          } catch {
            /* ignore a partial line */
          }
        }
      }
    }

    async function postJson(body) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nwtool-lang': currentLanguage() },
        body: JSON.stringify({ ...body, lang: currentLanguage() }),
      })
      const text = await response.text()
      let data = null
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || `HTTP ${response.status}`)
      }
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
      return data
    }

    function useRunner() {
      const [state, setState] = useState(emptyState)
      const abortRef = useRef(null)
      const stop = useCallback(() => {
        abortRef.current?.abort()
        setState((prev) => ({ ...prev, running: false }))
      }, [])
      const run = useCallback(async (tool, params) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setState({ ...emptyState(), running: true })
        try {
          await streamEvents(
            { op: 'run', tool, params },
            (event) => setState((prev) => reduceEvent(prev, event)),
            controller.signal,
          )
        } catch (error) {
          if (error?.name === 'AbortError') {
            setState((prev) => ({ ...prev, running: false }))
            return
          }
          setState((prev) => ({ ...prev, running: false, error: String(error?.message ?? error) }))
          return
        }
        setState((prev) => ({ ...prev, running: false }))
      }, [])
      return { state, run, stop }
    }

    /* ------------------------------------------------------------ */
    /* Result rendering                                              */
    /* ------------------------------------------------------------ */

    function StatsChips({ stats }) {
      const entries = Object.entries(stats ?? {})
      if (!entries.length) return null
      return h(
        'div',
        { className: 'nwt-chips' },
        entries.map(([key, value], index) => h(
          'span',
          { key, className: 'nwt-chip', style: { animationDelay: `${Math.min(index * 18, 180)}ms` } },
          h('b', null, `${t(key)}:`),
          String(value),
        )),
      )
    }

    function KvGrid({ items }) {
      if (!items?.length) return null
      return h(
        'div',
        { className: 'nwt-kv' },
        items.map((item, index) => h(
          'div',
          { key: `${item.k}-${index}`, className: 'nwt-kv-row' },
          h('span', { className: 'nwt-kv-k' }, t(item.k)),
          h('span', { className: 'nwt-kv-v' }, String(item.v ?? '-')),
        )),
      )
    }

    function DataTable({ columns, rows }) {
      if (!rows.length) return null
      const cols = columns ?? Object.keys(rows[0]).map((key) => ({ k: key, label: key }))
      return h(
        'div',
        { className: 'nwt-table-wrap' },
        h(
          'table',
          { className: 'nwt-table' },
          h('thead', null, h('tr', null, cols.map((col) => h('th', { key: col.k, className: 'nwt-th' }, t(col.label))))),
          h(
            'tbody',
            null,
            rows.map((row, index) => h(
              'tr',
              { key: index, className: 'nwt-tr' },
              cols.map((col) => h(
                'td',
                { key: col.k, className: 'nwt-td' },
                row[col.k] === undefined || row[col.k] === '' ? '-' : t(String(row[col.k])),
              )),
            )),
          ),
        ),
      )
    }

    function Sections({ sections }) {
      if (!sections?.length) return null
      return h(
        'div',
        null,
        sections.map((section, index) => h(
          'details',
          { key: `${section.title}-${index}`, className: 'nwt-details', open: sections.length <= 2 },
          h('summary', null, t(section.title)),
          h('pre', { className: 'nwt-details-body' }, section.body),
        )),
      )
    }

    function DiffView({ diff }) {
      if (!diff) return null
      const rows = diff.rows ?? []
      const rowClass = (type) => (type === 'add'
        ? 'nwt-diff-add'
        : type === 'del'
          ? 'nwt-diff-del'
          : type === 'change'
            ? 'nwt-diff-change'
            : null)
      return h(
        'div',
        { className: 'nwt-diff-wrap' },
        h(
          'table',
          { className: 'nwt-diff' },
          h('thead', null, h('tr', null,
            h('th', { className: 'nwt-th nwt-line-no' }, '#'),
            h('th', { className: 'nwt-th' }, t(diff.leftTitle ?? '左')),
            h('th', { className: 'nwt-th nwt-line-no' }, '#'),
            h('th', { className: 'nwt-th' }, t(diff.rightTitle ?? '右')))),
          h(
            'tbody',
            null,
            rows.map((row, index) => h(
              'tr',
              { key: index },
              h('td', { className: cn('nwt-line-no', rowClass(row.type)) }, row.lnLeft ?? ''),
              h('td', { className: rowClass(row.type) }, row.left ?? ''),
              h('td', { className: cn('nwt-line-no', rowClass(row.type)) }, row.lnRight ?? ''),
              h('td', { className: rowClass(row.type) }, row.right ?? ''),
            )),
          ),
        ),
      )
    }

    function RunningBar() {
      return h(
        'div',
        { className: 'nwt-running' },
        h('span', { className: 'nwt-dot' }),
        h('span', null, t('运行中')),
        h('span', { className: 'nwt-progress' }),
      )
    }

    function ResultView({ state, tool }) {
      const showTable = tool?.columns && state.rows.length > 0
      const hasAnything = state.rows.length || state.kv.length || state.text || state.diff
        || state.sections.length || state.logs.length || state.notices.length || state.error
        || Object.keys(state.stats).length
      return h(
        'div',
        null,
        state.error ? h('div', { className: 'nwt-error' }, t('错误：${error}', { error: state.error })) : null,
        state.running ? h(RunningBar) : null,
        h(KvGrid, { items: state.kv }),
        h(StatsChips, { stats: state.stats }),
        state.notices.length
          ? h('div', null, state.notices.map((notice, index) => h('div', { key: index, className: 'nwt-notice' }, t(notice))))
          : null,
        showTable ? h(DataTable, { columns: tool.columns, rows: state.rows }) : null,
        state.diff ? h(DiffView, { diff: state.diff }) : null,
        state.text ? h('pre', { className: 'nwt-pre' }, state.text) : null,
        h(Sections, { sections: state.sections }),
        state.logs.length
          ? h(
            'details',
            { className: 'nwt-details', open: state.logs.length < 12 },
            h('summary', null, t('执行日志（${count} 条）', { count: state.logs.length })),
            h(
              'div',
              { className: 'nwt-details-body' },
              state.logs.map((line, index) => h('div', { key: index, className: 'nwt-log-line' }, t(line))),
            ),
          )
          : null,
        !hasAnything && !state.running
          ? h(
            'div',
            { className: 'nwt-empty' },
            h(Icon, { name: 'network', size: 26 }),
            h('span', null, t('填写参数后开始执行')),
          )
          : null,
      )
    }

    /* ------------------------------------------------------------ */
    /* Tool catalogue                                                */
    /* ------------------------------------------------------------ */

    const FAMILY_OPTIONS = [
      { value: '0', label: '自动' },
      { value: '4', label: 'IPv4' },
      { value: '6', label: 'IPv6' },
    ]

    const TOOLS = {
      ping: {
        title: 'Ping',
        desc: 'ICMP 回环测试：逐包往返时间、TTL 与丢包统计。使用系统 ping，无需管理员权限。',
        fields: [
          { k: 'host', label: '目标地址', type: 'text', default: '223.5.5.5', placeholder: '8.8.8.8 或 www.baidu.com' },
          { k: 'count', label: '次数', type: 'number', default: 4, min: 1, max: 500 },
          { k: 'timeout', label: '单包超时 (ms)', type: 'number', default: 1000, min: 100, max: 20000 },
          { k: 'interval', label: '间隔 (ms)', type: 'number', default: 1000, min: 100, max: 60000 },
          { k: 'size', label: '包大小 (字节)', type: 'number', default: 32, min: 0, max: 65500 },
          { k: 'family', label: '协议', type: 'select', options: FAMILY_OPTIONS, default: '0' },
        ],
        columns: [
          { k: 'seq', label: '#' },
          { k: 'from', label: '来源' },
          { k: 'rtt', label: 'RTT' },
          { k: 'ttl', label: 'TTL' },
          { k: 'status', label: '状态' },
        ],
      },
      tcping: {
        title: 'TCPing',
        desc: '对指定 TCP 端口做连接计时，ICMP 被过滤时判断可达性最有效。',
        fields: [
          { k: 'host', label: '目标地址', type: 'text', default: 'www.baidu.com' },
          { k: 'port', label: '端口', type: 'number', default: 443, min: 1, max: 65535 },
          { k: 'count', label: '次数', type: 'number', default: 4, min: 1, max: 200 },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 2000, min: 100, max: 60000 },
          { k: 'interval', label: '间隔 (ms)', type: 'number', default: 1000, min: 50, max: 60000 },
        ],
        columns: [
          { k: 'seq', label: '#' },
          { k: 'target', label: '目标' },
          { k: 'rtt', label: '连接耗时' },
          { k: 'status', label: '状态' },
        ],
      },
      traceroute: {
        title: 'Traceroute',
        desc: '逐跳显示路径与每一跳的往返时延（调用系统 tracert / traceroute，无需管理员权限）。',
        fields: [
          { k: 'host', label: '目标地址', type: 'text', default: '223.5.5.5' },
          { k: 'maxHops', label: '最大跳数', type: 'number', default: 30, min: 1, max: 64 },
          { k: 'timeout', label: '单跳超时 (ms)', type: 'number', default: 1500, min: 200, max: 15000 },
          { k: 'family', label: '协议', type: 'select', options: FAMILY_OPTIONS, default: '0' },
        ],
        columns: [
          { k: 'hop', label: '跳' },
          { k: 'host', label: '地址' },
          { k: 'rtt', label: '往返时间' },
          { k: 'loss', label: '丢包' },
          { k: 'status', label: '说明' },
        ],
      },
      mtr: {
        title: 'MTR',
        desc: '按轮次重复路由追踪，统计每跳丢包率、平均/最好/最差时延与抖动。每一轮相当于一次完整的 tracert。',
        fields: [
          { k: 'host', label: '目标地址', type: 'text', default: '223.5.5.5' },
          { k: 'rounds', label: '轮次', type: 'number', default: 10, min: 1, max: 1000 },
          { k: 'maxHops', label: '最大跳数', type: 'number', default: 30, min: 1, max: 64 },
          { k: 'timeout', label: '单跳超时 (ms)', type: 'number', default: 1200, min: 200, max: 10000 },
          { k: 'interval', label: '轮间隔 (ms)', type: 'number', default: 1000, min: 200, max: 60000 },
        ],
        columns: [
          { k: 'hop', label: '跳' },
          { k: 'host', label: '地址' },
          { k: 'loss', label: '丢包' },
          { k: 'sent', label: '发送' },
          { k: 'recv', label: '接收' },
          { k: 'last', label: '最近' },
          { k: 'avg', label: '平均' },
          { k: 'best', label: '最好' },
          { k: 'worst', label: '最差' },
          { k: 'jitter', label: '抖动' },
        ],
      },
      ipscan: {
        title: 'IP 扫描',
        desc: '对网段/地址范围并发探测，列出在线主机。TCP 模式无需权限，ICMP 模式更贴近传统 ping 扫描。',
        fields: [
          { k: 'target', label: '网段或范围', type: 'text', default: '192.168.1.0/24', placeholder: '10.0.0.0/24 或 10.0.0.1-100' },
          {
            k: 'mode',
            label: '探测方式',
            type: 'select',
            default: 'tcp',
            options: [
              { value: 'tcp', label: 'TCP 端口探测' },
              { value: 'icmp', label: 'ICMP Ping' },
              { value: 'both', label: '先 ICMP 再 TCP' },
            ],
          },
          { k: 'ports', label: 'TCP 探测端口', type: 'text', default: '80,443,22,445,3389' },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 400, min: 50, max: 5000 },
          { k: 'concurrency', label: '并发', type: 'number', default: 64, min: 1, max: 256 },
        ],
        columns: [
          { k: 'ip', label: '地址' },
          { k: 'status', label: '状态' },
          { k: 'latency', label: '时延' },
          { k: 'hostname', label: '反解主机名' },
          { k: 'detail', label: '依据' },
        ],
      },
      portscan: {
        title: '端口扫描',
        desc: 'TCP connect 扫描（不需管理员权限），可选取 banner 识别服务。',
        fields: [
          { k: 'host', label: '目标地址', type: 'text', default: '192.168.1.1' },
          { k: 'ports', label: '端口/范围', type: 'text', default: '22,80,443,8080', placeholder: '22,80,443 或 1-1024' },
          { k: 'timeout', label: '连接超时 (ms)', type: 'number', default: 800, min: 50, max: 20000 },
          { k: 'concurrency', label: '并发', type: 'number', default: 128, min: 1, max: 512 },
          { k: 'banner', label: '抓取 banner', type: 'switch', default: false },
        ],
        columns: [
          { k: 'port', label: '端口' },
          { k: 'service', label: '常见服务' },
          { k: 'state', label: '状态' },
          { k: 'rtt', label: '耗时' },
          { k: 'banner', label: 'Banner' },
        ],
      },
      lanscan: {
        title: '扫描局域网',
        desc: '通过 ARP 表发现在线主机（Windows 下免管理员），可反解主机名并查厂商。',
        fields: [
          { k: 'network', label: '网段（留空自动）', type: 'text', default: '', placeholder: '192.168.1.0/24' },
          { k: 'timeout', label: '等待 ARP (ms)', type: 'number', default: 1200, min: 100, max: 5000 },
          { k: 'resolveHostname', label: '反解主机名', type: 'switch', default: true },
          { k: 'onlineOui', label: '在线查询未知厂商', type: 'switch', default: false },
        ],
        columns: [
          { k: 'ip', label: '地址' },
          { k: 'mac', label: 'MAC' },
          { k: 'vendor', label: '厂商' },
          { k: 'hostname', label: '主机名' },
        ],
      },
      dnsbench: {
        title: '全国公共 DNS 测试',
        desc: '并发测试主流公共 DNS 的解析时延，按最快排序，用于挑选本地最优解析器。',
        fields: [
          { k: 'domain', label: '测试域名', type: 'text', default: 'www.baidu.com' },
          {
            k: 'type',
            label: '记录类型',
            type: 'select',
            default: 'A',
            options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((value) => ({ value, label: value })),
          },
          { k: 'rounds', label: '每个测几轮', type: 'number', default: 2, min: 1, max: 5 },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 2500, min: 300, max: 10000 },
        ],
        columns: [
          { k: 'server', label: 'DNS' },
          { k: 'region', label: '区域' },
          { k: 'best', label: '最快' },
          { k: 'avg', label: '平均' },
          { k: 'answers', label: '解析结果' },
          { k: 'status', label: '状态' },
        ],
      },
      dnsresolve: {
        title: '域名解析',
        desc: '查 A/AAAA/CNAME/MX/TXT/NS/SOA/SRV/CAA/PTR，直接展示原始应答记录与 TTL。',
        fields: [
          { k: 'host', label: '域名', type: 'text', default: 'www.example.com' },
          { k: 'types', label: '记录类型', type: 'text', default: 'A,AAAA,CNAME,MX,TXT,NS' },
        ],
        columns: [
          { k: 'type', label: '类型' },
          { k: 'ttl', label: 'TTL' },
          { k: 'value', label: '值' },
          { k: 'extra', label: '记录所属' },
        ],
      },
      dig: {
        title: 'dig',
        desc: '构造原始 DNS 报文：可指定 DNS 服务器、记录类型与是否递归，输出含 TTL、标志位与权威段。',
        fields: [
          { k: 'host', label: '域名', type: 'text', default: 'www.baidu.com' },
          {
            k: 'type',
            label: '记录类型',
            type: 'select',
            default: 'A',
            options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA', 'PTR', 'ANY'].map((value) => ({ value, label: value })),
          },
          { k: 'server', label: 'DNS 服务器（留空用系统）', type: 'text', default: '223.5.5.5' },
          { k: 'recursion', label: '请求递归 (RD)', type: 'switch', default: true },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 3000, min: 200, max: 15000 },
        ],
      },
      whois: {
        title: '域名查询 (WHOIS)',
        desc: '优先使用 RDAP（JSON 结构），失败时回退到 whois 43 端口原始文本。',
        fields: [{ k: 'domain', label: '域名', type: 'text', default: 'example.com', wide: true }],
      },
      localinfo: {
        title: '本机 IP 详细信息',
        desc: '列出本机网卡、地址、网关、DNS、MAC 与公网出口 IP。Windows 下读取 Get-NetIPConfiguration。',
        fields: [],
        columns: [
          { k: 'name', label: '网卡' },
          { k: 'ip', label: 'IPv4' },
          { k: 'mac', label: 'MAC' },
          { k: 'gateway', label: '网关' },
          { k: 'dns', label: 'DNS' },
          { k: 'status', label: '状态' },
          { k: 'speed', label: '速率' },
        ],
      },
      http: {
        title: 'HTTP 工具',
        desc: '精简版 Postman：构造请求、查看状态/响应头/耗时并在 Host 侧发出（不受浏览器跨域限制）。',
        fields: [
          { k: 'url', label: '地址', type: 'text', default: 'https://api.ipify.org?format=json', wide: true },
          {
            k: 'method',
            label: '方法',
            type: 'select',
            default: 'GET',
            options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((value) => ({ value, label: value })),
          },
          { k: 'followRedirects', label: '跟随重定向', type: 'switch', default: true },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 20000, min: 1000, max: 120000 },
          { k: 'headers', label: '请求头（每行 key: value）', type: 'textarea', default: '', wide: true, rows: 3 },
          { k: 'body', label: '请求体', type: 'textarea', default: '', wide: true, rows: 4 },
        ],
      },
      wol: {
        title: '网络唤醒 (WOL)',
        desc: '发送 UDP 魔术包（6×FF + 16 次 MAC）。可把设备连同名称一起保存，之后在下方列表里一键唤醒。',
        fields: [
          { k: 'mac', label: '目标 MAC', type: 'text', default: '', placeholder: '00:11:22:33:44:55' },
          { k: 'broadcast', label: '广播地址', type: 'text', default: '255.255.255.255' },
          { k: 'port', label: '端口', type: 'number', default: 9, min: 1, max: 65535 },
        ],
      },
      speedtest: {
        title: '网络测速',
        desc: '基于 HTTP 大文件上下行的吞吐测试（默认 Cloudflare 测速端点），不依赖 Ookla 私有协议。',
        fields: [
          {
            k: 'bytes',
            label: '下载量',
            type: 'select',
            default: '25000000',
            options: [
              { value: '10000000', label: '10 MB' },
              { value: '25000000', label: '25 MB' },
              { value: '50000000', label: '50 MB' },
              { value: '100000000', label: '100 MB' },
            ],
          },
          { k: 'upload', label: '同时测试上传', type: 'switch', default: true },
        ],
        columns: [
          { k: 'item', label: '方向' },
          { k: 'bytes', label: '传输量' },
          { k: 'seconds', label: '耗时' },
          { k: 'mbps', label: 'Mbps' },
          { k: 'mbs', label: 'MB/s' },
        ],
      },
      iperf3: {
        title: 'iperf3',
        desc: '调用本机 iperf3 二进制（-J 解析 JSON）。未安装时给出获取方式，不内嵌第三方执行文件。',
        fields: [
          { k: 'host', label: '服务端地址', type: 'text', default: '192.168.1.100' },
          { k: 'port', label: '端口', type: 'number', default: 5201, min: 1, max: 65535 },
          { k: 'duration', label: '测试时长 (s)', type: 'number', default: 10, min: 1, max: 300 },
          { k: 'streams', label: '并发流', type: 'number', default: 1, min: 1, max: 32 },
          { k: 'reverse', label: '反向（下载）', type: 'switch', default: false },
          { k: 'udp', label: 'UDP 模式', type: 'switch', default: false },
          { k: 'bandwidth', label: 'UDP 带宽（如 100M）', type: 'text', default: '' },
        ],
        columns: [
          { k: 'time', label: '时间区间' },
          { k: 'mbps', label: '带宽' },
          { k: 'retrans', label: '重传' },
        ],
      },
      diagnose: {
        title: '网络诊断',
        desc: '编排式诊断：本机网卡 → 网关 → DNS → 域名解析 → 外网连通 → TCP 出站 → 公网出口，并给出可读结论。',
        fields: [],
        columns: [
          { k: 'step', label: '检查项' },
          { k: 'result', label: '结果' },
          { k: 'detail', label: '细节' },
        ],
      },
      deviceexec: {
        title: '设备配置采集',
        desc: 'SSH/Telnet 批量连接华为 VRP、H3C、思科 IOS/NX-OS，执行命令、自动处理分页并把配置归档到本地。',
        fields: [
          {
            k: 'deviceText',
            label: '设备清单（每行：host[:port] [ssh|telnet] [用户名] [密码]）',
            type: 'textarea',
            default: '192.168.1.1 telnet admin\n192.168.1.2:22 ssh admin admin123',
            wide: true,
            rows: 4,
          },
          {
            k: 'protocol',
            label: '默认协议',
            type: 'select',
            default: 'telnet',
            options: [{ value: 'telnet', label: 'Telnet' }, { value: 'ssh', label: 'SSH' }],
          },
          { k: 'username', label: '默认用户名', type: 'text', default: '' },
          { k: 'password', label: '默认密码', type: 'password', default: '' },
          {
            k: 'commands',
            label: '命令（每行一条）',
            type: 'textarea',
            default: 'display version\ndisplay current-configuration',
            wide: true,
            rows: 5,
          },
          { k: 'concurrency', label: '并发设备数', type: 'number', default: 2, min: 1, max: 8 },
          { k: 'save', label: '归档为配置备份', type: 'switch', default: true },
        ],
        columns: [
          { k: 'device', label: '设备' },
          { k: 'address', label: '地址' },
          { k: 'protocol', label: '协议' },
          { k: 'lines', label: '输出行数' },
          { k: 'status', label: '状态' },
        ],
      },
      snmp: {
        title: 'SNMP 设备识别',
        desc: 'SNMP v2c 读取 SYSTEM 组：sysName / sysDescr / sysObjectID / 运行时长，比 MAC 猜厂商准确得多。',
        fields: [
          { k: 'host', label: '设备地址', type: 'text', default: '192.168.1.1', placeholder: '单个地址，或用下方批量框' },
          { k: 'hosts', label: '批量地址（空格/逗号分隔）', type: 'text', default: '', wide: true },
          { k: 'community', label: 'Community', type: 'text', default: 'public' },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 3000, min: 500, max: 15000 },
        ],
        columns: [
          { k: 'host', label: '地址' },
          { k: 'name', label: 'sysName' },
          { k: 'vendor', label: '厂商' },
          { k: 'descr', label: 'sysDescr' },
        ],
      },
      sntp: {
        title: 'SNTP 查询',
        desc: '向 NTP/SNTP 服务器取时，算出本机时钟快慢与请求往返时延。只读时间，不会修改系统时钟。',
        fields: [
          { k: 'server', label: '服务器（逗号分隔可查多台）', type: 'text', default: 'ntp.aliyun.com, time.windows.com', wide: true },
          { k: 'port', label: 'UDP 端口', type: 'number', default: 123, min: 1, max: 65535 },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 2500, min: 500, max: 15000 },
        ],
        columns: [
          { k: 'server', label: '服务器' },
          { k: 'offset', label: '本机偏移' },
          { k: 'delay', label: '往返时延' },
          { k: 'stratum', label: '层级' },
          { k: 'version', label: '版本' },
          { k: 'serverTime', label: '服务器时间' },
          { k: 'status', label: '状态' },
        ],
      },
      geo: {
        title: 'IP 地理定位',
        desc: '查询 IP 的归属地、运营商与 ASN；留空则先查本机公网出口。内网与保留地址在本地判断，不外发任何请求。',
        fields: [
          { k: 'ip', label: 'IP 地址（留空 = 本机公网出口）', type: 'text', default: '', placeholder: '8.8.8.8' },
          { k: 'timeout', label: '超时 (ms)', type: 'number', default: 5000, min: 1500, max: 20000 },
        ],
        columns: [],
      },
      portstate: {
        title: '本机端口状态',
        desc: '列出本机 TCP/UDP 套接字：监听端口、已建立连接、对应进程与 PID。只读，不修改任何配置。',
        fields: [
          {
            k: 'state',
            label: '筛选',
            type: 'select',
            default: 'all',
            options: [
              { value: 'all', label: '全部' },
              { value: 'listen', label: '仅监听' },
              { value: 'established', label: '仅已建立' },
            ],
          },
          { k: 'filter', label: '关键字（地址 / 端口 / 进程）', type: 'text', default: '' },
          { k: 'limit', label: '最多显示', type: 'number', default: 400, min: 20, max: 5000 },
        ],
        columns: [
          { k: 'protocol', label: '协议' },
          { k: 'local', label: '本地地址' },
          { k: 'remote', label: '远端地址' },
          { k: 'state', label: '状态' },
          { k: 'pid', label: 'PID' },
          { k: 'process', label: '进程' },
        ],
      },
    }

    const GROUPS = [
      { id: 'datacom', title: 'Datacom 运维', tools: ['terminal', 'diagram', 'deviceexec', 'snmp', 'configdiff', 'backups', 'cheatsheet', 'aidoc'] },
      { id: 'connect', title: '连通性检测', tools: ['ping', 'tcping', 'traceroute', 'mtr'] },
      { id: 'scan', title: '扫描与发现', tools: ['ipscan', 'portscan', 'lanscan', 'dnsbench'] },
      { id: 'dns', title: '域名与地址', tools: ['dnsresolve', 'dig', 'whois', 'geo'] },
      { id: 'host', title: '本机与二层', tools: ['localinfo', 'portstate', 'arp'] },
      { id: 'util', title: '实用工具', tools: ['ipcalc', 'bitcalc', 'sizeconv', 'sntp', 'timeconv', 'wol', 'http', 'speedtest', 'iperf3'] },
      { id: 'diag', title: '综合诊断', tools: ['diagnose'] },
    ]

    const EXTRA_TITLES = {
      terminal: { title: '终端 / 设备簿', desc: 'SSH 与 Telnet 交互终端：保存设备、一键连接交换机与 Linux 主机，支持 UTF-8/GBK 编码切换。' },
      ipcalc: { title: 'IP 计算器', desc: '纯本地计算：掩码换算、网络/广播地址、可用范围、二进制与子网划分，不发任何网络请求。' },
      bitcalc: { title: '进制换算器', desc: '32 位整数在十进制/十六进制/二进制/八进制之间换算，可逐位开关，也能做移位与逻辑运算。' },
      sizeconv: { title: '字节单位换算器', desc: '字节、比特与 KB/MB/GB/TB、KiB/MiB/GiB/TiB 互转，并算清「标称 500GB 为什么只显示 465GiB」。' },
      diagram: { title: '网络拓扑', desc: '手工绘制的简易拓扑：摆放路由器、交换机、无线 AC/AP、服务器与 PC，连线成图；右键可关联设备簿里的设备，双击跳到终端。' },
      arp: { title: 'ARP 列表', desc: '查看本机 ARP / 邻居缓存；添加静态条目、删除选中条目或清空整张表。写入需要管理员权限。' },
      timeconv: { title: '时间转化', desc: '时间戳与日期互转、时区换算、相对时间，纯本地计算。' },
      configdiff: { title: '配置对比 (Diff)', desc: '并排高亮两份配置/备份的差异，定位接口、ACL 等具体变动。' },
      backups: { title: '配置备份库', desc: '查看、搜索、删除本机归档的设备配置备份。' },
      cheatsheet: { title: 'VRP / IOS 命令速查', desc: '华为 VRP/H3C Comware 与思科 IOS/NX-OS 命令对照，可搜索。' },
      aidoc: { title: '配置发送 DSH 提问', desc: '选中一份备份作为上下文，一键复制提示词并在新会话中向大模型提问。' },
    }

    function toolMeta(id) {
      return TOOLS[id] ?? { ...(EXTRA_TITLES[id] ?? { title: id, desc: '' }), fields: [] }
    }

    /**
     * The quiet line under each tool. It used to be one paragraph about DSH
     * running probes on the host, which said nothing useful on most pages; it is
     * now specific to what the tool on screen actually does and how to read it.
     */
    const TOOL_NOTES = {
      ping: '单包默认 32 字节、间隔 1 秒。RTT 从系统 ping 输出解析，<1 表示不足 1 ms；测 MTU 可以把包大小调到 1400 再试。',
      tcping: '握手成功即算通，耗时含三次握手。端口未开放会得到 RST 而不是超时，可据此区分“被防火墙过滤”和“没有服务”。',
      traceroute: '调用系统 tracert / traceroute；中间设备不回 TTL 超时包时该跳显示 *，末跳不通说明目标不可达。',
      mtr: '每一轮都是一次完整路由追踪，按跳统计。中间跳偶发丢包通常只是控制面限速，末跳丢包才是真丢包。',
      ipscan: 'TCP 模式只探测列出的端口，ICMP 模式需要系统允许发 ping。同一网段建议先用「扫描局域网」，快得多。',
      portscan: 'TCP connect 扫描，会与目标建立完整连接；开启 banner 抓取会多花几百毫秒，但能看出协议与版本。',
      lanscan: '先向网段发 UDP 触发 ARP，再读本机 ARP 表，所以只限同一广播域；跨网段请用 IP 扫描。厂商来自离线 OUI 子集。',
      dnsbench: '并发查询多个公共 DNS 的同一批域名，按平均时延排序。结果受本地出口线路与运营商缓存影响。',
      dnsresolve: '走系统解析器。要指定 DNS 服务器、看 TTL 与权威段，请改用 dig。',
      dig: '自己拼 DNS 报文，可指定服务器、类型与递归位；输出含 flags、ANSWER/AUTHORITY 段与每条记录的 TTL。',
      whois: '优先 RDAP（JSON 接口），失败再回退到 whois:43 原始文本；域名与 IP 都接受。',
      localinfo: '网卡、网关、DNS 与公网出口都取自本机。「公网出口」会依次请求多个探测源，失败的那几个会列出来。',
      geo: '归属地来自公共 API（多源回退），内网与保留地址在本地判断、不外发。不同服务的数据会有出入。',
      portstate: '只读本机套接字表，不发起任何连接。Windows 下 PID 通过 tasklist 映射成进程名。',
      arp: '读 arp -a / ip neigh 的结果；添加、删除、清空属于写操作，需要管理员（Windows）或 root（Linux）。',
      ipcalc: '纯本地计算，不发任何网络请求。「额外划分层数」最多 4 层，每层最多列出 16 个网段。',
      bitcalc: '32 位无符号整数。点任意一位翻转（高位在左）；有符号十进制按二进制补码解释。',
      sizeconv: '十进制（KB/MB/GB/TB）与二进制（KiB/MiB/GiB/TiB）两套口径同时给出；硬盘标称差是单位不同，不是容量缩水。',
      diagram: '拖动移动设备，工具栏「连线」后依次点两台设备即可连线；右键设备可关联设备簿里的条目，双击跳转到终端并选中它。图会自动存到 ~/.dsh-nwtool/topology.json。',
      sntp: '只读取时间，不修改系统时钟。UDP 123 被防火墙挡住时会显示无响应，换一台服务器再试。',
      timeconv: '纯本地计算。时间戳支持秒与毫秒，时区换算以浏览器所在时区为基准。',
      wol: '发 6 个 FF + 16 次 MAC 的魔术包（UDP 9）。目标机需要在 BIOS 和网卡驱动里都开启网络唤醒。',
      http: '请求由主机侧发出，因此不受浏览器跨域限制。请求头每行一条 key: value，重定向可选择是否跟随。',
      speedtest: 'HTTP 大文件上下行吞吐，默认走 Cloudflare 端点；单节点结果不能代表整条链路带宽。',
      iperf3: '调用本机 iperf3 并解析 -J JSON。没装的话，把 iperf3.exe 放到面板提示的目录里即可。',
      diagnose: '按 网卡 → 网关 → DNS → 域名解析 → 外网 → TCP 出站 → 公网出口 的顺序编排，每步给结论，便于定位断点。',
      deviceexec: 'SSH/Telnet 批量执行命令，自动翻页；输出可归档到本机备份库，供配置对比与提问使用。',
      topo: '读设备现有的 LLDP/CDP 邻居表再拼图，不是抓包：需要设备登录凭据，或者直接粘贴一份输出。',
      snmp: 'SNMP v2c GET 读 SYSTEM 组（sysName / sysDescr / sysObjectID / 运行时长），并据此推断厂商。',
      configdiff: 'LCS 逐行对比，按新增/删除/修改着色；左右两侧都可以直接粘文本，也可以选两份备份。',
      backups: '备份存放在 ~/.dsh-nwtool/backups，可搜索、查看与删除；旁边可以一键交给大模型分析。',
      cheatsheet: '华为 VRP / H3C Comware 与思科 IOS / NX-OS 的命令对照，支持中英文关键字与分类过滤。',
      aidoc: '选一份备份生成提示词，复制后在新的会话里提问；不会自动把整份配置发出去。',
      terminal: '多标签交互终端。监控与文件浏览各用一条独立连接，不会打断当前画面；切换工作区再回来会自动接回原会话（离开后保留 20 分钟），关掉标签才会真正断开。把某个标签「共享给 DSH」后，它可以读取该会话并代你输入命令，危险命令需要你在页面上确认。点「浮窗」可以把当前标签钉到右上角小窗，切到工作区会话后继续显示。',
    }

    function groupOf(toolId) {
      return GROUPS.find((group) => group.tools.includes(toolId))?.title ?? '工具'
    }

    /** Everything the panel can do, counted once so the guide cannot drift. */
    const TOOL_COUNT = GROUPS.reduce((total, group) => total + group.tools.length, 0)

    /**
     * What the plugin is, in the order a newcomer needs it: where it runs, what
     * it needs, where the data goes. Rendered with t(), so it follows the UI
     * language like every other line.
     */
    const ABOUT_POINTS = [
      '面板与模型共用同一套引擎：同一个工具既能在面板里点，也能被 DSH 直接调用。',
      '网络探测都在运行 DSH 的主机侧执行，不受浏览器跨域限制，通常也不需要管理员权限。',
      '零第三方依赖：只用 Node 标准库与系统自带命令；SSH 依赖本机的 plink 或 ssh，iperf3 需要自备可执行文件。',
      '数据都放在 ~/.dsh-nwtool：配置备份、拓扑图纸、设备簿与终端转录。',
      '界面语言跟随 DSH，切换不需要刷新页面；设备密码可加密保存，也可以每次输入。',
    ]

    /**
     * The model-facing half, mirrored for the usage guide. The browser cannot
     * read the Host half, so the names are repeated here; the authoritative
     * descriptions (English, aimed at the model) live in host/tools.js.
     */
    const AGENT_TOOLS = [
      { name: 'nwtool_ping', note: '对主机做 ICMP 探测，返回每包往返时延、TTL 与丢包统计。' },
      { name: 'nwtool_tcping', note: '对指定 TCP 端口测量连接耗时，ICMP 被过滤时也能判断可达性。' },
      { name: 'nwtool_traceroute', note: '逐跳追踪到目标的路径，给出每跳往返时延与丢包。' },
      { name: 'nwtool_dns', note: '查询域名解析；指定 server 时用原始 DNS 报文（等价 dig），省略则用系统解析器。' },
      { name: 'nwtool_http_request', note: '从运行 DSH 的主机发 HTTP 请求，返回状态码、响应头、耗时与正文，适合验证 API。' },
      { name: 'nwtool_port_scan', note: '对单台主机做 TCP connect 扫描，列出开放端口。' },
      { name: 'nwtool_ip_scan', note: '在网段、地址范围或单个地址中发现存活主机。' },
      { name: 'nwtool_subnet_calc', note: '纯子网计算：网络地址、广播地址、可用范围、通配符掩码与二进制。' },
      { name: 'nwtool_sntp', note: '通过 UDP 查询 NTP/SNTP，报告本机时钟偏差、往返时延与服务器层级；只读，不改系统时钟。' },
      { name: 'nwtool_ip_geolocation', note: '查询 IP 的归属地、运营商与 ASN；内网与保留地址在本地判断，不外发。' },
      { name: 'nwtool_local_ports', note: '列出本机 TCP/UDP 套接字：本地与对端地址、状态、所属进程与 PID。只读。' },
      { name: 'nwtool_arp_table', note: '读取本机 ARP / 邻居缓存：地址、MAC、厂商与接口。只读，增删需要管理员权限。' },
      { name: 'nwtool_backup_list', note: '列出已归档的设备配置备份，最新的在前。' },
      { name: 'nwtool_backup_read', note: '按 id 读取一份配置备份，输出有长度上限，便于逐段审阅。' },
      { name: 'nwtool_config_search', note: '在一份配置（备份 id 或原始文本）里搜关键字，返回命中行与上下文。' },
      { name: 'nwtool_config_diff', note: '对比两份配置（两份备份或两段文本），报告新增、删除与修改的行。' },
      { name: 'nwtool_device_exec', note: '通过 SSH/Telnet 在一台或多台设备上执行一组只读命令，可把输出归档成备份。' },
      { name: 'nwtool_snmp_identify', note: '用 SNMP v2c GET 读 SYSTEM 组，识别设备名称、描述、型号与运行时长。' },
      { name: 'nwtool_command_reference', note: '查同一功能在华为 VRP/H3C Comware 与思科 IOS/NX-OS 里的等价命令。' },
      { name: 'nwtool_terminal', note: '查看或操作你共享给 DSH 的终端会话；默认不共享，只有你明确共享的会话可用。' },
    ]

    /* ------------------------------------------------------------ */
    /* IP calculator                                                 */
    /* ------------------------------------------------------------ */

    function ipToInt(ip) {
      const parts = ip.trim().split('.').map(Number)
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
      return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
    }

    function intToIp(value) {
      const n = Number(value) >>> 0
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
    }

    function maskToPrefix(mask) {
      const n = ipToInt(mask)
      if (n === null) return null
      let prefix = 0
      let seenZero = false
      for (let bit = 31; bit >= 0; bit -= 1) {
        const on = ((n >>> bit) & 1) === 1
        if (on && seenZero) return null
        if (on) prefix += 1
        else seenZero = true
      }
      return prefix
    }

    function IpCalcPane() {
      const [ip, setIp] = useState('192.168.10.25')
      const [prefix, setPrefix] = useState('24')
      const [splitBits, setSplitBits] = useState('2')

      const result = useMemo(() => {
        const value = ipToInt(ip)
        const bits = Number(prefix)
        if (value === null) return { error: 'IP 地址格式不正确' }
        if (!Number.isInteger(bits) || bits < 0 || bits > 32) return { error: '前缀长度需为 0-32' }
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
        const network = (value & mask) >>> 0
        const broadcast = (network | (~mask >>> 0)) >>> 0
        const total = 2 ** (32 - bits)
        const usable = bits >= 31 ? total : Math.max(total - 2, 0)
        const first = bits >= 31 ? network : network + 1
        const last = bits >= 31 ? broadcast : broadcast - 1
        const splits = []
        const depth = Math.min(Math.max(Number(splitBits) || 0, 0), 4)
        for (let extra = 1; extra <= depth; extra += 1) {
          if (bits + extra > 32) break
          const count = 2 ** extra
          const step = 2 ** (32 - bits - extra)
          const groups = []
          for (let index = 0; index < Math.min(count, 16); index += 1) {
            groups.push(`${intToIp(network + index * step)}/${bits + extra}`)
          }
          splits.push({ title: t('拆成 ${count} 个 /${prefix}', { count, prefix: bits + extra }), groups, more: count > 16 })
        }
        return {
          rows: [
            ['地址', ip],
            ['前缀', `/${bits}`],
            ['子网掩码', intToIp(mask)],
            ['通配符掩码', intToIp(~mask >>> 0)],
            ['网络地址', intToIp(network)],
            ['广播地址', intToIp(broadcast)],
            ['可用范围', usable ? `${intToIp(first)} - ${intToIp(last)}` : t('（无）')],
            ['地址总数', String(total)],
            ['可用主机数', String(usable)],
            ['私有地址', /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? t('是') : t('否')],
            ['二进制地址', value.toString(2).padStart(32, '0')],
            ['二进制掩码', mask.toString(2).padStart(32, '0')],
            ['二进制网络', network.toString(2).padStart(32, '0')],
          ],
          splits,
        }
      }, [ip, prefix, splitBits])

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('IP 地址')),
              h('input', { className: 'nwt-input', value: ip, spellCheck: false, onChange: (event) => setIp(event.target.value) })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('前缀长度 (0-32)')),
              h('input', { className: 'nwt-input', type: 'number', min: 0, max: 32, value: prefix, onChange: (event) => setPrefix(event.target.value) })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('反填掩码（可选）')),
              h('input', {
                className: 'nwt-input',
                placeholder: '255.255.255.0',
                onChange: (event) => {
                  if (!event.target.value.trim()) return
                  const derived = maskToPrefix(event.target.value)
                  if (derived !== null) setPrefix(String(derived))
                },
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('额外划分层数')),
              h('input', { className: 'nwt-input', type: 'number', min: 0, max: 4, value: splitBits, onChange: (event) => setSplitBits(event.target.value) })),
          ),
        ),
        result.error
          ? h('div', { className: 'nwt-error' }, t(result.error))
          : h(
            'div',
            null,
            h('div', { className: 'nwt-kv' }, result.rows.map(([key, value]) => h(
              'div',
              { key, className: 'nwt-kv-row' },
              h('span', { className: 'nwt-kv-k' }, t(key)),
              h('span', { className: 'nwt-kv-v' }, value),
            ))),
            result.splits.map((split) => h(
              'div',
              { key: split.title, className: 'nwt-card' },
              h('div', { className: 'nwt-label', style: { marginBottom: 7 } }, split.title),
              h('pre', { className: 'nwt-pre', style: { marginBottom: 0, maxHeight: 200 } },
                split.groups.join('\n') + (split.more ? '\n…' : '')),
            )),
          ),
      )
    }

    /* ------------------------------------------------------------ */
    /* Bit calculator                                                */
    /* ------------------------------------------------------------ */

    const BIT_BASES = [
      { value: 'hex', label: '十六进制' },
      { value: 'dec', label: '十进制' },
      { value: 'bin', label: '二进制' },
      { value: 'oct', label: '八进制' },
    ]

    const BIT_OPERATORS = [
      { value: 'and', label: '按位与 (AND)' },
      { value: 'or', label: '按位或 (OR)' },
      { value: 'xor', label: '按位异或 (XOR)' },
      { value: 'shl', label: '左移 (<<)' },
      { value: 'shr', label: '右移 (>>)' },
    ]

    /** 32-bit unsigned value out of whatever the user typed, or null. */
    function parseBitInput(text, base) {
      const cleaned = String(text ?? '').trim().replace(/[\s_]/g, '')
      if (!cleaned) return 0
      let value
      if (base === 'hex') {
        const hex = cleaned.replace(/^0x/i, '')
        if (!/^[0-9a-f]+$/i.test(hex) || hex.length > 8) return null
        value = parseInt(hex, 16)
      } else if (base === 'bin') {
        const bin = cleaned.replace(/^0b/i, '')
        if (!/^[01]+$/.test(bin) || bin.length > 32) return null
        value = parseInt(bin, 2)
      } else if (base === 'oct') {
        const oct = cleaned.replace(/^0o/i, '')
        if (!/^[0-7]+$/.test(oct) || oct.length > 11) return null
        value = parseInt(oct, 8)
      } else {
        if (!/^\d+$/.test(cleaned)) return null
        value = Number(cleaned)
      }
      if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) return null
      return value >>> 0
    }

    function formatBitValue(value, base) {
      if (base === 'hex') return (value >>> 0).toString(16).toUpperCase()
      if (base === 'bin') return (value >>> 0).toString(2)
      if (base === 'oct') return (value >>> 0).toString(8)
      return String(value >>> 0)
    }

    function popcount(value) {
      let count = 0
      let rest = value >>> 0
      while (rest) {
        count += rest & 1
        rest >>>= 1
      }
      return count
    }

    function BitCalcPane() {
      const [text, setText] = useState('C0A80101')
      const [base, setBase] = useState('hex')
      const [operand, setOperand] = useState('FF')
      const [operator, setOperator] = useState('and')

      const value = parseBitInput(text, base)
      const other = parseBitInput(operand, base)

      const toggleBit = (index) => {
        if (value === null) return
        const mask = 2 ** index
        const next = (value ^ mask) >>> 0
        setText(formatBitValue(next, base))
      }

      const result = useMemo(() => {
        if (value === null || other === null) return null
        const shift = other & 31
        switch (operator) {
          case 'or': return (value | other) >>> 0
          case 'xor': return (value ^ other) >>> 0
          case 'shl': return (value << shift) >>> 0
          case 'shr': return value >>> shift
          default: return (value & other) >>> 0
        }
      }, [value, other, operator])

      const rows = value === null ? [] : [
        [t('十进制（无符号）'), String(value)],
        [t('十进制（有符号）'), String(value | 0)],
        [t('十六进制'), `0x${value.toString(16).toUpperCase()}`],
        [t('十六进制（按字节）'), [24, 16, 8, 0].map((shift) => ((value >>> shift) & 255).toString(16).toUpperCase().padStart(2, '0')).join(' ')],
        [t('二进制'), [24, 16, 8, 0].map((shift) => ((value >>> shift) & 255).toString(2).padStart(8, '0')).join(' ')],
        [t('八进制'), `0${value.toString(8)}`],
        [t('置位数'), String(popcount(value))],
        [t('位宽'), String(value === 0 ? 0 : 32 - Math.clz32(value))],
        [t('按字节反转'), `0x${((value & 0xff) << 24 | (value & 0xff00) << 8 | (value >>> 8) & 0xff00 | (value >>> 24) & 0xff).toString(16).toUpperCase().padStart(8, '0')}`],
        [t('按位取反'), `0x${(~value >>> 0).toString(16).toUpperCase()}`],
      ]

      const indices = Array.from({ length: 32 }, (_, index) => 31 - index)
      const chunks = [0, 1, 2, 3].map((group) => indices.slice(group * 8, group * 8 + 8))

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('值')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: text,
                spellCheck: false,
                placeholder: base === 'hex' ? 'C0A80101' : base === 'bin' ? '1100000010101000' : '3232235777',
                onChange: (event) => setText(event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('输入进制')),
              h('select', {
                className: 'nwt-select',
                value: base,
                onChange: (event) => setBase(event.target.value),
              }, BIT_BASES.map((item) => h('option', { key: item.value, value: item.value }, t(item.label))))),
          ),
        ),
        value === null
          ? h('div', { className: 'nwt-error' }, t('这个值不是 32 位整数，或与所选进制不符'))
          : h(
            'div',
            null,
            h(
              'div',
              { className: 'nwt-card' },
              h('div', { className: 'nwt-label', style: { marginBottom: 7 } }, t('点任意一位翻转（高位在左）')),
              h(
                'div',
                { className: 'nwt-bits' },
                chunks.map((chunk, group) => h(
                  'div',
                  { key: group, className: 'nwt-bitgroup' },
                  chunk.map((index) => {
                    const on = ((value >>> index) & 1) === 1
                    return h('button', {
                      key: index,
                      type: 'button',
                      className: cn('nwt-bit', on && 'nwt-bit--on'),
                      title: t('第 ${index} 位（权重 ${weight}）', { index, weight: 2 ** index }),
                      onClick: () => toggleBit(index),
                    }, on ? '1' : '0')
                  }),
                )),
              ),
            ),
            h('div', { className: 'nwt-kv' }, rows.map(([key, text2]) => h(
              'div',
              { key, className: 'nwt-kv-row' },
              h('span', { className: 'nwt-kv-k' }, key),
              h('span', { className: 'nwt-kv-v', style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, text2),
            ))),
            h(
              'div',
              { className: 'nwt-card' },
              h('div', { className: 'nwt-label', style: { marginBottom: 7 } }, t('与另一个值运算')),
              h(
                'div',
                { className: 'nwt-grid' },
                h('div', { className: 'nwt-field' },
                  h('label', { className: 'nwt-label' }, t('运算')),
                  h('select', {
                    className: 'nwt-select',
                    value: operator,
                    onChange: (event) => setOperator(event.target.value),
                  }, BIT_OPERATORS.map((item) => h('option', { key: item.value, value: item.value }, t(item.label))))),
                h('div', { className: 'nwt-field' },
                  h('label', { className: 'nwt-label' }, t('操作数（同进制）')),
                  h('input', {
                    className: 'nwt-input nwt-input--mono',
                    value: operand,
                    spellCheck: false,
                    onChange: (event) => setOperand(event.target.value),
                  })),
              ),
              other === null
                ? h('div', { className: 'nwt-error', style: { marginTop: 10 } }, t('操作数不是合法的 32 位值'))
                : h('div', { className: 'nwt-kv', style: { marginTop: 10 } }, h(
                  'div',
                  { className: 'nwt-kv-row' },
                  h('span', { className: 'nwt-kv-k' }, t('结果')),
                  h('span', { className: 'nwt-kv-v', style: { fontFamily: 'ui-monospace, Consolas, monospace' } },
                    `${result} · 0x${result.toString(16).toUpperCase()} · ${result.toString(2).padStart(32, '0')}`),
                )),
            ),
          ),
      )
    }

    /* ------------------------------------------------------------ */
    /* Size unit converter                                           */
    /* ------------------------------------------------------------ */

    const SIZE_UNITS = [
      { value: 'B', label: 'B（字节）', scale: 1 },
      { value: 'KB', label: 'KB（1000）', scale: 1000 },
      { value: 'MB', label: 'MB（1000²）', scale: 1000 ** 2 },
      { value: 'GB', label: 'GB（1000³）', scale: 1000 ** 3 },
      { value: 'TB', label: 'TB（1000⁴）', scale: 1000 ** 4 },
      { value: 'KiB', label: 'KiB（1024）', scale: 1024 },
      { value: 'MiB', label: 'MiB（1024²）', scale: 1024 ** 2 },
      { value: 'GiB', label: 'GiB（1024³）', scale: 1024 ** 3 },
      { value: 'TiB', label: 'TiB（1024⁴）', scale: 1024 ** 4 },
    ]

    /** Trim a float to something readable without lying about the magnitude. */
    function formatNumber(value) {
      if (!Number.isFinite(value)) return '-'
      if (value === 0) return '0'
      if (Math.abs(value) >= 1e15 || Math.abs(value) < 1e-6) return value.toExponential(3)
      const rounded = Math.round(value * 1e6) / 1e6
      return String(rounded)
    }

    function formatGrouped(value) {
      const text = formatNumber(value)
      if (!/^\d+$/.test(text)) return text
      return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function SizeConvPane() {
      const [amount, setAmount] = useState('1')
      const [unit, setUnit] = useState('GiB')
      const [nominal, setNominal] = useState('500')
      const [nominalUnit, setNominalUnit] = useState('GB')

      const chosen = SIZE_UNITS.find((item) => item.value === unit) ?? SIZE_UNITS[0]
      const number = Number(String(amount).replace(/[\s,_]/g, ''))
      const bytes = Number.isFinite(number) && number >= 0 ? number * chosen.scale : null

      const rows = bytes === null ? [] : [
        [t('字节 (B)'), formatGrouped(bytes)],
        [t('比特 (bit)'), formatGrouped(bytes * 8)],
        ['KB（1000）', formatNumber(bytes / 1000)],
        ['MB（1000²）', formatNumber(bytes / 1000 ** 2)],
        ['GB（1000³）', formatNumber(bytes / 1000 ** 3)],
        ['TB（1000⁴）', formatNumber(bytes / 1000 ** 4)],
        ['KiB（1024）', formatNumber(bytes / 1024)],
        ['MiB（1024²）', formatNumber(bytes / 1024 ** 2)],
        ['GiB（1024³）', formatNumber(bytes / 1024 ** 3)],
        ['TiB（1024⁴）', formatNumber(bytes / 1024 ** 4)],
        [t('十六进制字节'), `0x${Math.round(bytes).toString(16).toUpperCase()}`],
      ]

      const nominalScale = nominalUnit === 'TB' ? 1000 ** 4 : 1000 ** 3
      const nominalBytes = (Number(nominal) || 0) * nominalScale
      /* Two readings of the same bytes: decimal (GB) and binary (GiB). */
      const decimalGB = nominalBytes / 1000 ** 3
      const displayedGiB = nominalBytes / 1024 ** 3
      const difference = decimalGB - displayedGiB
      const differencePercent = decimalGB > 0 ? (difference / decimalGB) * 100 : 0

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('容量')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: amount,
                spellCheck: false,
                onChange: (event) => setAmount(event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('单位')),
              h('select', {
                className: 'nwt-select',
                value: unit,
                onChange: (event) => setUnit(event.target.value),
              }, SIZE_UNITS.map((item) => h('option', { key: item.value, value: item.value }, t(item.label))))),
          ),
        ),
        bytes === null
          ? h('div', { className: 'nwt-error' }, t('请填写一个非负数字'))
          : h(
            'div',
            null,
            h('div', { className: 'nwt-kv' }, rows.map(([key, value]) => h(
              'div',
              { key, className: 'nwt-kv-row' },
              h('span', { className: 'nwt-kv-k' }, key),
              h('span', { className: 'nwt-kv-v', style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, value),
            ))),
            h(
              'div',
              { className: 'nwt-card' },
              h('div', { className: 'nwt-label', style: { marginBottom: 7 } }, t('为什么硬盘标称和系统显示不一样')),
              h(
                'div',
                { className: 'nwt-grid' },
                h('div', { className: 'nwt-field' },
                  h('label', { className: 'nwt-label' }, t('标称容量')),
                  h('input', {
                    className: 'nwt-input nwt-input--mono',
                    value: nominal,
                    spellCheck: false,
                    onChange: (event) => setNominal(event.target.value),
                  })),
                h('div', { className: 'nwt-field' },
                  h('label', { className: 'nwt-label' }, t('标称单位')),
                  h('select', {
                    className: 'nwt-select',
                    value: nominalUnit,
                    onChange: (event) => setNominalUnit(event.target.value),
                  }, h('option', { value: 'GB' }, 'GB'), h('option', { value: 'TB' }, 'TB'))),
              ),
              h('div', { className: 'nwt-kv', style: { marginTop: 10 } },
                h('div', { className: 'nwt-kv-row' },
                  h('span', { className: 'nwt-kv-k' }, t('标称读数')),
                  h('span', { className: 'nwt-kv-v', style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, `${formatNumber(decimalGB)} GB`)),
                h('div', { className: 'nwt-kv-row' },
                  h('span', { className: 'nwt-kv-k' }, t('系统显示')),
                  h('span', { className: 'nwt-kv-v', style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, `${formatNumber(displayedGiB)} GiB`)),
                h('div', { className: 'nwt-kv-row' },
                  h('span', { className: 'nwt-kv-k' }, t('数值差')),
                  h('span', { className: 'nwt-kv-v' },
                    `${formatNumber(difference)} GB（${formatNumber(differencePercent)}%）`))),
              h('div', { className: 'nwt-hint', style: { marginTop: 8 } },
                t('厂商标称用 10 进制（1 GB = 1000³ 字节），操作系统按 2 进制显示（1 GiB = 1024³ 字节），差额来自换算口径而不是容量缩水。')),
            ),
          ),
      )
    }

    /* ------------------------------------------------------------ */
    /* Time converter                                                */
    /* ------------------------------------------------------------ */

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function formatLocal(date) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} `
        + `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    }

    function TimeConvPane() {
      const [timestamp, setTimestamp] = useState(String(Math.floor(Date.now() / 1000)))
      const [dateText, setDateText] = useState('')

      const fromTimestamp = useMemo(() => {
        const raw = String(timestamp).trim()
        if (!/^-?\d+$/.test(raw)) return null
        let ms = Number(raw)
        if (String(raw).replace('-', '').length <= 10) ms *= 1000
        const date = new Date(ms)
        return Number.isNaN(date.getTime()) ? null : date
      }, [timestamp])

      const fromText = useMemo(() => {
        const raw = String(dateText).trim()
        if (!raw) return null
        const normalized = raw.replace(/\//g, '-').replace('T', ' ')
        const date = new Date(normalized)
        return Number.isNaN(date.getTime()) ? null : date
      }, [dateText])

      const date = fromText ?? fromTimestamp
      const zones = [
        { label: '本机时区', offset: -new Date().getTimezoneOffset() },
        { label: 'UTC', offset: 0 },
        { label: '北京时间 (UTC+8)', offset: 480 },
        { label: 'UTC-5 纽约', offset: -300 },
        { label: 'UTC+9 东京', offset: 540 },
      ]

      const rows = date
        ? [
          ['Unix 秒', String(Math.floor(date.getTime() / 1000))],
          ['Unix 毫秒', String(date.getTime())],
          ['本地时间', formatLocal(date)],
          ['ISO 8601', date.toISOString()],
          ...zones.map((zone) => {
            const shifted = new Date(date.getTime() + zone.offset * 60000)
            return [zone.label, `${formatLocal(shifted)} (UTC${zone.offset >= 0 ? '+' : '-'}${pad2(Math.abs(Math.trunc(zone.offset / 60)))}:${pad2(Math.abs(zone.offset % 60))})`]
          }),
          ['相对时间', (() => {
            const diff = Date.now() - date.getTime()
            const past = diff >= 0 ? t('前') : t('后')
            const abs = Math.abs(diff) / 1000
            if (abs < 60) return t('${amount} 秒${past}', { amount: Math.round(abs), past })
            if (abs < 3600) return t('${amount} 分钟${past}', { amount: Math.round(abs / 60), past })
            if (abs < 86400) return t('${amount} 小时${past}', { amount: Math.round(abs / 3600), past })
            return t('${amount} 天${past}', { amount: Math.round(abs / 86400), past })
          })()],
        ]
        : []

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('时间戳（秒或毫秒）')),
              h('input', { className: 'nwt-input nwt-input--mono', value: timestamp, spellCheck: false, onChange: (event) => setTimestamp(event.target.value) })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('日期时间（优先于此）')),
              h('input', {
                className: 'nwt-input',
                value: dateText,
                placeholder: '2024-05-01 12:00:00',
                spellCheck: false,
                onChange: (event) => setDateText(event.target.value),
              })),
          ),
          h(
            'div',
            { className: 'nwt-actions' },
            h(Btn, { onClick: () => { setTimestamp(String(Math.floor(Date.now() / 1000))); setDateText('') } }, t('当前时间')),
            h(Btn, {
              onClick: () => {
                setTimestamp(String(Math.floor((Date.now() + 3600000) / 1000)))
                setDateText('')
              },
            }, t('+1 小时')),
            h(Btn, {
              onClick: () => {
                setTimestamp(String(Math.floor((Date.now() + 86400000) / 1000)))
                setDateText('')
              },
            }, t('+1 天')),
          ),
        ),
        rows.length
          ? h('div', { className: 'nwt-kv' }, rows.map(([key, value]) => h(
            'div',
            { key, className: 'nwt-kv-row' },
            h('span', { className: 'nwt-kv-k' }, t(key)),
            h('span', { className: 'nwt-kv-v' }, value),
          )))
          : h('div', { className: 'nwt-error' }, t('无法解析输入的时间')),
      )
    }

    /* ------------------------------------------------------------ */
    /* Cheat sheet                                                   */
    /* ------------------------------------------------------------ */

    function CheatSheetPane() {
      const [query, setQuery] = useState('')
      const [category, setCategory] = useState('全部')
      const [rows, setRows] = useState([])
      const [categories, setCategories] = useState(['全部'])
      const [error, setError] = useState(null)

      useEffect(() => {
        let cancelled = false
        postJson({ op: 'cheatsheet', query, category })
          .then((data) => {
            if (cancelled) return
            setRows(data.rows ?? [])
            if (data.categories?.length) setCategories(data.categories)
          })
          .catch((problem) => { if (!cancelled) setError(String(problem?.message ?? problem)) })
        return () => { cancelled = true }
      }, [query, category])

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('搜索命令 / 用途')),
              h('input', {
                className: 'nwt-input',
                value: query,
                placeholder: t('vlan、trunk、ospf、undo、保存…'),
                spellCheck: false,
                onChange: (event) => setQuery(event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('分类')),
              h('select', { className: 'nwt-input', value: category, onChange: (event) => setCategory(event.target.value) },
                categories.map((item) => h('option', { key: item, value: item }, t(item))))),
          ),
        ),
        error ? h('div', { className: 'nwt-error' }, error) : null,
        h('div', { className: 'nwt-chips' }, h('span', { className: 'nwt-chip' }, h('b', null, t('匹配')), t('${count} 条', { count: rows.length }))),
        h(
          'div',
          { className: 'nwt-table-wrap' },
          h(
            'table',
            { className: 'nwt-table' },
            h('thead', null, h('tr', null,
              h('th', { className: 'nwt-th' }, t('分类')),
              h('th', { className: 'nwt-th' }, t('用途')),
              h('th', { className: 'nwt-th' }, t('华为 VRP / H3C')),
              h('th', { className: 'nwt-th' }, t('思科 IOS / NX-OS')))),
            h('tbody', null, rows.map((row, index) => h(
              'tr',
              { key: index, className: 'nwt-tr' },
              h('td', { className: 'nwt-td' }, t(row.cat)),
              h('td', { className: 'nwt-td' }, t(row.purpose)),
              h('td', { className: 'nwt-td' }, row.vrp),
              h('td', { className: 'nwt-td' }, row.ios),
            ))),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------ */
    /* Backup-backed panes                                           */
    /* ------------------------------------------------------------ */

    function useBackups() {
      const [backups, setBackups] = useState([])
      const [error, setError] = useState(null)
      const [tick, setTick] = useState(0)
      useEffect(() => {
        let cancelled = false
        postJson({ op: 'backups.list' })
          .then((data) => { if (!cancelled) setBackups(data.backups ?? []) })
          .catch((problem) => { if (!cancelled) setError(String(problem?.message ?? problem)) })
        return () => { cancelled = true }
      }, [tick])
      return { backups, error, reload: () => setTick((value) => value + 1) }
    }

    function BackupsPane() {
      const { backups, error, reload } = useBackups()
      const [preview, setPreview] = useState(null)
      const [query, setQuery] = useState('')

      const view = async (id) => {
        try {
          const data = await postJson({ op: 'backups.read', id })
          setPreview({ id, content: data.content })
        } catch (problem) {
          const detail = problem?.message ?? problem
          setPreview({ id, content: t('读取失败: ${detail}', { detail }) })
        }
      }

      const remove = async (id) => {
        try {
          await postJson({ op: 'backups.delete', id })
          if (preview?.id === id) setPreview(null)
          reload()
        } catch (problem) {
          const detail = problem?.message ?? problem
          setPreview({ id, content: t('删除失败: ${detail}', { detail }) })
        }
      }

      const filtered = query
        ? backups.filter((item) => `${item.id} ${item.label} ${item.host}`.toLowerCase().includes(query.toLowerCase()))
        : backups

      return h(
        'div',
        null,
        error ? h('div', { className: 'nwt-error' }, error) : null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-actions', style: { marginTop: 0 } },
            h('input', {
              className: 'nwt-input',
              style: { maxWidth: 280 },
              value: query,
              placeholder: t('按设备名 / 地址过滤'),
              onChange: (event) => setQuery(event.target.value),
            }),
            h(Btn, { onClick: reload, variant: 'ghost' }, t('刷新')),
            h('span', { className: 'nwt-chip' }, h('b', null, t('共')), t('${count} 份', { count: backups.length })),
          ),
        ),
        h(
          'div',
          { className: 'nwt-table-wrap' },
          h(
            'table',
            { className: 'nwt-table' },
            h('thead', null, h('tr', null,
              h('th', { className: 'nwt-th' }, t('文件')),
              h('th', { className: 'nwt-th' }, t('设备')),
              h('th', { className: 'nwt-th' }, t('地址')),
              h('th', { className: 'nwt-th' }, t('采集时间')),
              h('th', { className: 'nwt-th' }, t('行数')),
              h('th', { className: 'nwt-th' }, t('操作')))),
            h('tbody', null, filtered.map((item) => h(
              'tr',
              { key: item.id, className: 'nwt-tr' },
              h('td', { className: 'nwt-td' }, item.id),
              h('td', { className: 'nwt-td' }, item.label),
              h('td', { className: 'nwt-td' }, item.host),
              h('td', { className: 'nwt-td' }, String(item.savedAt ?? '').replace('T', ' ').slice(0, 19)),
              h('td', { className: 'nwt-td' }, String(item.lines ?? '')),
              h(
                'td',
                { className: 'nwt-td' },
                h('span', { className: 'nwt-actions', style: { marginTop: 0, gap: 6 } },
                  h(Btn, { onClick: () => view(item.id), variant: 'ghost', size: 'small' }, t('查看')),
                  h(Btn, { onClick: () => remove(item.id), variant: 'ghost', size: 'small' }, t('删除'))),
              ),
            ))),
          ),
        ),
        preview
          ? h(
            'details',
            { className: 'nwt-details', open: true },
            h('summary', null, preview.id),
            h('pre', { className: 'nwt-details-body' }, preview.content),
          )
          : null,
      )
    }

    function DiffPane() {
      const { backups } = useBackups()
      const [leftId, setLeftId] = useState('')
      const [rightId, setRightId] = useState('')
      const [leftText, setLeftText] = useState('')
      const [rightText, setRightText] = useState('')
      const { state, run, stop } = useRunner()

      const load = async (id, side) => {
        if (!id) return
        try {
          const data = await postJson({ op: 'backups.read', id })
          if (side === 'left') setLeftText(data.content)
          else setRightText(data.content)
        } catch {
          /* ignore */
        }
      }

      const start = () => run('configdiff', {
        leftId,
        rightId,
        leftText,
        rightText,
        leftTitle: leftId || '左侧配置',
        rightTitle: rightId || '右侧配置',
      })

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('左侧备份')),
              h('select', {
                className: 'nwt-input',
                value: leftId,
                onChange: (event) => { setLeftId(event.target.value); load(event.target.value, 'left') },
              },
              h('option', { value: '' }, t('（手动粘贴）')),
              backups.map((item) => h('option', { key: item.id, value: item.id }, `${item.label} · ${item.id}`)))),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('右侧备份')),
              h('select', {
                className: 'nwt-input',
                value: rightId,
                onChange: (event) => { setRightId(event.target.value); load(event.target.value, 'right') },
              },
              h('option', { value: '' }, t('（手动粘贴）')),
              backups.map((item) => h('option', { key: item.id, value: item.id }, `${item.label} · ${item.id}`)))),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('左侧内容')),
              h('textarea', {
                className: 'nwt-input nwt-input--mono',
                style: { minHeight: 120 },
                value: leftText,
                spellCheck: false,
                onChange: (event) => setLeftText(event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('右侧内容')),
              h('textarea', {
                className: 'nwt-input nwt-input--mono',
                style: { minHeight: 120 },
                value: rightText,
                spellCheck: false,
                onChange: (event) => setRightText(event.target.value),
              })),
          ),
          h(
            'div',
            { className: 'nwt-actions' },
            h(Btn, { onClick: start, variant: 'primary', disabled: state.running }, state.running ? t('对比中…') : t('开始对比')),
            state.running ? h(Btn, { onClick: stop, variant: 'ghost' }, t('停止')) : null,
          ),
        ),
        h(ResultView, { state, tool: toolMeta('configdiff') }),
      )
    }

    function AiDocPane({ onOpenSession }) {
      const { backups } = useBackups()
      const [selected, setSelected] = useState('')
      const [content, setContent] = useState('')
      const [question, setQuestion] = useState(t('请分析这份设备配置：指出潜在风险、冗余配置和可以优化的地方。'))
      const [copied, setCopied] = useState(null)

      const copy = async (text, label) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(t('${label} 已复制到剪贴板', { label: t(label) }))
        } catch (problem) {
          const detail = problem?.message ?? problem
          setCopied(t('复制失败：${detail}', { detail }))
        }
        setTimeout(() => setCopied(null), 3000)
      }

      const load = async (id) => {
        setSelected(id)
        if (!id) {
          setContent('')
          return
        }
        try {
          const data = await postJson({ op: 'backups.read', id })
          setContent(data.content ?? '')
        } catch (problem) {
          const detail = problem?.message ?? problem
          setContent(t('读取失败: ${detail}', { detail }))
        }
      }

      const prompt = content
        ? `${question}\n\n以下是设备配置（来自备份 ${selected}）：\n\n\`\`\`\n${content.slice(0, 60000)}\n\`\`\``
        : question

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('选择备份')),
              h('select', { className: 'nwt-input', value: selected, onChange: (event) => load(event.target.value) },
                h('option', { value: '' }, t('（不使用备份）')),
                backups.map((item) => h('option', { key: item.id, value: item.id }, `${item.label} · ${item.id}`)))),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('要问的问题')),
              h('input', { className: 'nwt-input', value: question, onChange: (event) => setQuestion(event.target.value) })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('配置行数')),
              h('input', { className: 'nwt-input', value: content ? String(content.split('\n').length) : '0', readOnly: true })),
          ),
          h(
            'div',
            { className: 'nwt-actions' },
            h(Btn, { onClick: () => copy(content, '配置内容'), disabled: !content }, t('复制配置')),
            h(Btn, { onClick: () => copy(prompt, '提示词'), variant: 'primary' }, t('复制提示词')),
            onOpenSession ? h(Btn, {
              onClick: async () => {
                await copy(prompt, '提示词')
                onOpenSession()
              },
              variant: 'ghost',
            }, t('复制并新建会话')) : null,
          ),
          copied ? h('div', { className: 'nwt-log-line', style: { marginTop: 9 } }, copied) : null,
          h('div', { className: 'nwt-log-line', style: { marginTop: 9 } },
            t('提示：DSH 没有向已有输入框注入文本的插件接口，因此这里把配置和问题整理成提示词放进剪贴板；新建会话后直接粘贴即可。')),
        ),
        selected && content
          ? h(
            'details',
            { className: 'nwt-details', open: false },
            h('summary', null, t('预览 ${selected}', { selected })),
            h('pre', { className: 'nwt-details-body' }, content.slice(0, 20000)),
          )
          : null,
      )
    }

    /* ------------------------------------------------------------ */
    /* Wake-on-LAN device book                                       */
    /* ------------------------------------------------------------ */

    function formatStamp(value) {
      if (!value) return '-'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return '-'
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    const EMPTY_WOL_FORM = { name: '', mac: '', broadcast: '255.255.255.255', port: '9' }

    function WolPane() {
      const { state, run, stop } = useRunner()
      const [devices, setDevices] = useState([])
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [busyId, setBusyId] = useState('')
      const [editingId, setEditingId] = useState('')
      const [form, setForm] = useState(EMPTY_WOL_FORM)

      const load = useCallback(async () => {
        try {
          const data = await postJson({ op: 'wol.list' })
          setDevices(data.devices ?? [])
        } catch (problem) {
          setError(String(problem?.message ?? problem))
        }
      }, [])

      useEffect(() => { load() }, [load])

      const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

      const resetForm = () => {
        setEditingId('')
        setForm(EMPTY_WOL_FORM)
      }

      const sendWake = (source, deviceId) => run('wol', {
        mac: source.mac,
        broadcast: source.broadcast || '255.255.255.255',
        port: Number(source.port) || 9,
        deviceId,
      })

      const wakeSaved = async (device) => {
        setNotice(null)
        setError(null)
        setBusyId(device.id)
        try {
          await sendWake(device, device.id)
          await load()
        } finally {
          setBusyId('')
        }
      }

      const save = async () => {
        setNotice(null)
        setError(null)
        try {
          const device = {
            name: form.name,
            mac: form.mac,
            broadcast: form.broadcast,
            port: Number(form.port) || 9,
          }
          if (editingId) device.id = editingId
          const data = await postJson({ op: 'wol.save', device })
          const action = editingId ? t('已更新') : t('已保存')
          setNotice(t('${action}「${name}」', { action, name: data.device.name }))
          resetForm()
          await load()
        } catch (problem) {
          setError(String(problem?.message ?? problem))
        }
      }

      const edit = (device) => {
        setNotice(null)
        setError(null)
        setEditingId(device.id)
        setForm({
          name: device.name ?? '',
          mac: device.mac ?? '',
          broadcast: device.broadcast ?? '255.255.255.255',
          port: String(device.port ?? 9),
        })
      }

      const remove = async (device) => {
        setNotice(null)
        setError(null)
        try {
          await postJson({ op: 'wol.delete', id: device.id })
          if (editingId === device.id) resetForm()
          setNotice(t('已删除「${name}」', { name: device.name }))
          await load()
        } catch (problem) {
          setError(String(problem?.message ?? problem))
        }
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('设备名称')),
              h('input', {
                className: 'nwt-input',
                value: form.name,
                placeholder: t('例如：机房核心交换机'),
                spellCheck: false,
                onChange: (event) => setField('name', event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('MAC 地址')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: form.mac,
                placeholder: '00:11:22:33:44:55',
                spellCheck: false,
                onChange: (event) => setField('mac', event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('广播地址')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: form.broadcast,
                spellCheck: false,
                onChange: (event) => setField('broadcast', event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('端口')),
              h('input', {
                className: 'nwt-input',
                type: 'number',
                min: 1,
                max: 65535,
                value: form.port,
                onChange: (event) => setField('port', event.target.value),
              })),
          ),
          h(
            'div',
            { className: 'nwt-actions' },
            h(Btn, { variant: 'primary', onClick: () => sendWake(form) }, t('唤醒')),
            h(Btn, { onClick: save }, editingId ? t('更新设备') : t('保存设备')),
            editingId ? h(Btn, { variant: 'ghost', onClick: resetForm }, t('取消编辑')) : null,
            state.running ? h(Btn, { variant: 'ghost', onClick: stop }, t('停止')) : null,
          ),
          notice ? h('div', { className: 'nwt-log-line', style: { marginTop: 9 } }, notice) : null,
          error ? h('div', { className: 'nwt-error', style: { marginTop: 9 } }, error) : null,
        ),
        h(ResultView, { state, tool: toolMeta('wol') }),
        h(
          'div',
          { className: 'nwt-chips', style: { marginTop: 18 } },
          h('span', { className: 'nwt-chip' }, h('b', null, t('已保存设备')), t('${count} 台', { count: devices.length })),
        ),
        devices.length
          ? h(
            'div',
            { className: 'nwt-table-wrap' },
            h(
              'table',
              { className: 'nwt-table' },
              h('thead', null, h('tr', null,
                h('th', { className: 'nwt-th' }, t('名称')),
                h('th', { className: 'nwt-th' }, 'MAC'),
                h('th', { className: 'nwt-th' }, t('广播地址')),
                h('th', { className: 'nwt-th' }, t('端口')),
                h('th', { className: 'nwt-th' }, t('上次唤醒')),
                h('th', { className: 'nwt-th' }, t('操作')))),
              h('tbody', null, devices.map((device) => h(
                'tr',
                { key: device.id, className: 'nwt-tr' },
                h('td', { className: 'nwt-td' }, device.name),
                h('td', { className: 'nwt-td' }, device.mac),
                h('td', { className: 'nwt-td' }, device.broadcast),
                h('td', { className: 'nwt-td' }, String(device.port)),
                h('td', { className: 'nwt-td' }, formatStamp(device.lastWokenAt)),
                h(
                  'td',
                  { className: 'nwt-td' },
                  h(
                    'span',
                    { className: 'nwt-actions', style: { marginTop: 0, gap: 6 } },
                    h(Btn, {
                      onClick: () => wakeSaved(device),
                      variant: 'ghost',
                      size: 'small',
                      disabled: busyId === device.id,
                    }, busyId === device.id ? t('发送中…') : t('唤醒')),
                    h(Btn, { onClick: () => edit(device), variant: 'ghost', size: 'small' }, t('编辑')),
                    h(Btn, { onClick: () => remove(device), variant: 'ghost', size: 'small' }, t('删除')),
                  ),
                ),
              ))),
            ),
          )
          : h(
            'div',
            { className: 'nwt-empty' },
            h(Icon, { name: 'network', size: 24 }),
            h('span', null, t('还没有保存的设备')),
            h('span', { style: { fontSize: 11.5, opacity: 0.8 } },
              t('填好名称和 MAC 后点「保存设备」，之后就能在表格里一键唤醒。')),
          ),
      )
    }

    /* ------------------------------------------------------------ */
    /* Generic host tool pane                                        */
    /* ------------------------------------------------------------ */

    function HostToolPane({ toolId }) {
      const tool = toolMeta(toolId)
      const { state, run, stop } = useRunner()
      const [values, setValues] = useState(() => {
        const initial = {}
        for (const field of tool.fields ?? []) initial[field.k] = field.default ?? ''
        return initial
      })

      const setValue = (key, value) => setValues((prev) => ({ ...prev, [key]: value }))

      const start = () => {
        const params = {}
        for (const field of tool.fields ?? []) {
          const raw = values[field.k]
          if (field.type === 'switch') {
            params[field.k] = raw === undefined ? Boolean(field.default) : Boolean(raw)
          } else if (field.type === 'number') {
            if (raw === '' || raw === undefined) continue
            params[field.k] = Number(raw)
          } else {
            params[field.k] = raw ?? ''
          }
        }
        if (toolId === 'dnsresolve') {
          const types = String(params.types ?? 'A').split(/[,\s]+/).filter(Boolean)
          params.types = types.length ? types : ['A']
        }
        if (toolId === 'http') {
          params.headers = String(params.headers ?? '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const index = line.indexOf(':')
              return index < 0 ? null : { k: line.slice(0, index).trim(), v: line.slice(index + 1).trim() }
            })
            .filter(Boolean)
        }
        /* A destructive action asks first; the message is built when clicked so
           it follows the current language. */
        if (typeof tool.confirm === 'function') {
          const message = tool.confirm(params)
          if (message && typeof window.confirm === 'function' && !window.confirm(message)) return
        }
        run(toolId, params)
      }

      const noFields = !(tool.fields ?? []).length

      return h(
        'div',
        null,
        h(
          'form',
          {
            className: 'nwt-card',
            onSubmit: (event) => { event.preventDefault(); start() },
          },
          noFields
            ? null
            : h(
              'div',
              { className: 'nwt-grid' },
              tool.fields.map((field) => h(Field, {
                key: field.k,
                field,
                value: values[field.k],
                onChange: (next) => setValue(field.k, next),
              })),
            ),
          h(
            'div',
            { className: 'nwt-actions', style: noFields ? { marginTop: 0 } : null },
            h(Btn, { type: 'submit', variant: 'primary', disabled: state.running }, state.running ? t('执行中…') : t('开始')),
            state.running ? h(Btn, { onClick: stop, variant: 'ghost' }, t('停止')) : null,
          ),
        ),
        h(ResultView, { state, tool }),
      )
    }

    /* ------------------------------------------------------------ */
    /* ARP table                                                     */
    /* ------------------------------------------------------------ */

    function ArpPane() {
      const [rows, setRows] = useState([])
      const [picked, setPicked] = useState(null)
      const [ip, setIp] = useState('')
      const [mac, setMac] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [loaded, setLoaded] = useState(false)

      const execute = (params) => {
        setBusy(true)
        setError('')
        setNotice('')
        const collected = []
        let failure = ''
        return streamEvents({ op: 'run', tool: 'arp', params }, (event) => {
          if (event.t === 'rows') collected.push(...event.d)
          else if (event.t === 'log' || event.t === 'notice') setNotice(String(event.d ?? ''))
          else if (event.t === 'error') failure = String(event.d ?? '')
        })
          .then(() => {
            if (failure) {
              setError(failure)
              return
            }
            setRows(collected)
            setPicked(null)
            setLoaded(true)
          })
          .catch((problem) => setError(String(problem?.message ?? problem)))
          .finally(() => setBusy(false))
      }

      useEffect(() => { execute({ action: 'list' }) }, [])

      const canAdd = Boolean(ip.trim() && mac.trim()) && !busy
      const add = () => {
        if (!canAdd) return
        execute({ action: 'add', ip: ip.trim(), mac: mac.trim() }).then(() => {
          setIp('')
          setMac('')
        })
      }
      const removeOne = () => {
        if (!picked || busy) return
        execute({ action: 'del', ip: picked.address })
      }
      const removeAll = () => {
        if (busy) return
        const message = t('确定要清空本机 ARP 缓存？清空后与邻居的通信会重新学习，期间可能短暂中断。')
        if (typeof window.confirm === 'function' && !window.confirm(message)) return
        execute({ action: 'flush' })
      }

      return h(
        'div',
        null,
        h(
          'div',
          { className: 'nwt-card' },
          h(
            'div',
            { className: 'nwt-grid' },
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('IP 地址（添加时必填）')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: ip,
                spellCheck: false,
                placeholder: '192.168.1.20',
                onChange: (event) => setIp(event.target.value),
              })),
            h('div', { className: 'nwt-field' },
              h('label', { className: 'nwt-label' }, t('MAC 地址（添加时必填）')),
              h('input', {
                className: 'nwt-input nwt-input--mono',
                value: mac,
                spellCheck: false,
                placeholder: '00-11-22-33-44-55',
                onChange: (event) => setMac(event.target.value),
              })),
          ),
          h(
            'div',
            { className: 'nwt-actions' },
            h(Btn, { variant: 'primary', onClick: () => execute({ action: 'list' }), disabled: busy },
              busy ? t('执行中…') : t('查看列表')),
            h(Btn, {
              variant: 'ghost',
              onClick: add,
              disabled: !canAdd,
              title: canAdd ? t('添加静态 ARP 条目') : t('先填写 IP 与 MAC'),
            }, t('添加')),
            h(Btn, {
              variant: 'ghost',
              onClick: removeOne,
              disabled: !picked || busy,
              title: picked ? t('删除选中的条目') : t('先在列表里选中一条'),
            }, t('删除单条')),
            h(Btn, {
              variant: 'ghost',
              onClick: removeAll,
              disabled: busy,
              title: t('清空整张 ARP 缓存'),
            }, t('删除全部')),
          ),
        ),
        error ? h('div', { className: 'nwt-error' }, error) : null,
        notice ? h('div', { className: 'nwt-notice' }, notice) : null,
        rows.length
          ? h(
            'div',
            { className: 'nwt-arp' },
            h(
              'div',
              { className: 'nwt-arp-row nwt-arp-row--head' },
              h('span', null, t('IP 地址')),
              h('span', null, t('MAC 地址')),
              h('span', null, t('厂商')),
              h('span', null, t('类型')),
              h('span', null, t('接口')),
            ),
            rows.map((row) => {
              const key = `${row.address}|${row.interface}`
              const active = picked && picked.address === row.address && picked.interface === row.interface
              return h(
                'button',
                {
                  key,
                  type: 'button',
                  className: cn('nwt-arp-row', active && 'nwt-arp-row--active'),
                  onClick: () => setPicked(active ? null : row),
                  title: active ? t('取消选中') : t('选中这一条'),
                },
                h('span', { className: 'nwt-arp-ip' }, row.address),
                h('span', null, row.mac),
                h('span', null, row.vendor),
                h('span', null, row.type),
                h('span', null, row.interface),
              )
            }),
          )
          : h('div', { className: 'nwt-term-empty' },
            busy ? t('正在读取 ARP 缓存…') : (loaded ? t('ARP 缓存是空的（没有最近通信过的邻居）') : t('点「查看列表」读取本机 ARP 缓存'))),
        h('div', { className: 'nwt-hint', style: { marginTop: 12 } },
          t('查看不需要权限；添加、删除与清空需要管理员权限（Windows）或 root（Linux），失败时会原样回显系统提示。')),
      )
    }

    /* ------------------------------------------------------------ */
    /* Topology sketch                                               */
    /* ------------------------------------------------------------ */

    const TOPO_TYPES = [
      { id: 'router', label: '路由器', short: 'RT' },
      { id: 'switch', label: '交换机', short: 'SW' },
      { id: 'firewall', label: '防火墙', short: 'FW' },
      { id: 'server', label: '服务器', short: 'SRV' },
      { id: 'pc', label: 'PC', short: 'PC' },
      { id: 'ac', label: '无线AC', short: 'AC' },
      { id: 'ap', label: '无线 AP', short: 'AP' },
      { id: 'cloud', label: '云', short: 'CL' },
      { id: 'other', label: '其他', short: 'Other' },
    ]

    /* Literal class names: the stylesheet checker needs to see each one used. */
    const TOPO_TYPE_CLASS = {
      router: 'nwt-topo-node--router',
      switch: 'nwt-topo-node--switch',
      firewall: 'nwt-topo-node--firewall',
      server: 'nwt-topo-node--server',
      pc: 'nwt-topo-node--pc',
      ac: 'nwt-topo-node--ac',
      ap: 'nwt-topo-node--ap',
      cloud: 'nwt-topo-node--cloud',
      other: 'nwt-topo-node--other',
    }

    const TOPO_W = 1600
    const TOPO_H = 1000
    const TOPO_NODE_W = 122
    const TOPO_NODE_H = 54

    function topoTypeOf(id) {
      return TOPO_TYPES.find((type) => type.id === id) ?? TOPO_TYPES[TOPO_TYPES.length - 1]
    }

    /** One icon per device class, drawn with the same stroke weight. */
    function TopoIcon({ type, size = 24 }) {
      const shapes = {
        router: [
          h('circle', { key: 'c', cx: 12, cy: 12, r: 7 }),
          h('path', { key: 'n', d: 'M12 5.5v4.5' }), h('path', { key: 'n2', d: 'M10.3 8.3 L12 10 L13.7 8.3' }),
          h('path', { key: 's', d: 'M12 18.5v-4.5' }), h('path', { key: 's2', d: 'M10.3 15.7 L12 14 L13.7 15.7' }),
          h('path', { key: 'w', d: 'M5.5 12h4.5' }), h('path', { key: 'w2', d: 'M8.3 10.3 L10 12 L8.3 13.7' }),
          h('path', { key: 'e', d: 'M18.5 12h-4.5' }), h('path', { key: 'e2', d: 'M15.7 10.3 L14 12 L15.7 13.7' }),
        ],
        switch: [
          h('rect', { key: 'r', x: 2.5, y: 7, width: 19, height: 10, rx: 2 }),
          h('path', { key: 'a', d: 'M6 10.6 L9.4 13.4' }), h('path', { key: 'b', d: 'M9.4 10.6 L6 13.4' }),
          h('path', { key: 'c', d: 'M14.6 10.6 L18 13.4' }), h('path', { key: 'd', d: 'M18 10.6 L14.6 13.4' }),
        ],
        firewall: [
          h('rect', { key: 'r', x: 3, y: 4, width: 18, height: 16, rx: 1.6 }),
          h('path', { key: 'a', d: 'M3 9h18' }), h('path', { key: 'b', d: 'M3 14h18' }),
          h('path', { key: 'c', d: 'M8 4v5' }), h('path', { key: 'd', d: 'M16 4v5' }),
          h('path', { key: 'e', d: 'M12 9v5' }), h('path', { key: 'f', d: 'M8 14v6' }), h('path', { key: 'g', d: 'M16 14v6' }),
        ],
        server: [
          h('rect', { key: 'r', x: 5, y: 2.5, width: 14, height: 19, rx: 2 }),
          h('path', { key: 'a', d: 'M5 8.2h14' }), h('path', { key: 'b', d: 'M5 13.4h14' }),
          h('circle', { key: 'c', cx: 8.4, cy: 5.4, r: 0.9 }), h('circle', { key: 'd', cx: 8.4, cy: 10.6, r: 0.9 }),
          h('path', { key: 'e', d: 'M11 5.4h5' }), h('path', { key: 'f', d: 'M11 10.6h5' }),
        ],
        pc: [
          h('rect', { key: 'r', x: 2.5, y: 4, width: 19, height: 12, rx: 1.6 }),
          h('path', { key: 'a', d: 'M9 20h6' }), h('path', { key: 'b', d: 'M12 16v4' }),
        ],
        ac: [
          h('rect', { key: 'r', x: 2.5, y: 9, width: 19, height: 8, rx: 2 }),
          h('path', { key: 'a', d: 'M8 9V5' }), h('path', { key: 'b', d: 'M16 9V5' }),
          h('path', { key: 'c', d: 'M6 5h4' }), h('path', { key: 'd', d: 'M14 5h4' }),
          h('circle', { key: 'e', cx: 8.2, cy: 13.4, r: 1 }),
          h('circle', { key: 'f', cx: 12, cy: 13.4, r: 1 }),
          h('circle', { key: 'g', cx: 15.8, cy: 13.4, r: 1 }),
        ],
        ap: [
          h('path', { key: 'a', d: 'M12 21v-8' }),
          h('path', { key: 'b', d: 'M8.6 13.4a4.8 4.8 0 0 1 6.8 0' }),
          h('path', { key: 'c', d: 'M5.8 10.4a8.8 8.8 0 0 1 12.4 0' }),
          h('circle', { key: 'd', cx: 12, cy: 13, r: 1.1 }),
        ],
        cloud: [
          h('path', { key: 'a', d: 'M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z' }),
        ],
        other: [
          h('path', { key: 'a', d: 'M12 3.4 20 8v8l-8 4.6L4 16V8z' }),
          h('path', { key: 'b', d: 'M9.6 9.4a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.8.6-.8 1.1v.8' }),
          h('circle', { key: 'c', cx: 12, cy: 16.4, r: 0.9 }),
        ],
      }
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className: 'nwt-topo-icon',
          'aria-hidden': true,
        },
        ...(shapes[type] ?? shapes.other),
      )
    }

    const ZOOM_STEPS = [0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

    /* Frames are group boxes: a dashed rounded rectangle behind the drawing. */
    const TOPO_FRAME_COLOR = '#64748b'
    /* Literal names again, so the stylesheet checker sees each edge used. */
    const TOPO_FRAME_EDGE = {
      top: 'nwt-topo-frame-edge--top',
      right: 'nwt-topo-frame-edge--right',
      bottom: 'nwt-topo-frame-edge--bottom',
      left: 'nwt-topo-frame-edge--left',
    }

    function hexToRgba(hex, alpha) {
      const text = String(hex ?? '').replace('#', '')
      if (!/^[0-9a-fA-F]{6}$/.test(text)) return 'transparent'
      const r = parseInt(text.slice(0, 2), 16)
      const g = parseInt(text.slice(2, 4), 16)
      const b = parseInt(text.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    function TopoPane({ onFocusDevice } = {}) {
      const [library, setLibrary] = useState({ activeId: '', diagrams: [] })
      const [loaded, setLoaded] = useState(false)
      const [devices, setDevices] = useState([])
      const [selected, setSelected] = useState(null)
      const [linkMode, setLinkMode] = useState(false)
      const [linkFrom, setLinkFrom] = useState('')
      const [menu, setMenu] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [saveState, setSaveState] = useState('')
      const [zoom, setZoom] = useState(1)
      const [renaming, setRenaming] = useState(null)
      const [frameMode, setFrameMode] = useState(false)
      const [draft, setDraft] = useState(null)
      const canvasRef = useRef(null)
      const rootRef = useRef(null)
      const menuRef = useRef(null)
      const dragRef = useRef(null)
      const draftRef = useRef(null)
      const seqRef = useRef(0)
      /* The very last state, so leaving the tool never loses the final edit. */
      const latestRef = useRef(library)
      latestRef.current = library
      const loadedRef = useRef(false)

      const sheet = library.diagrams.find((item) => item.id === library.activeId) ?? null
      const nodes = sheet?.nodes ?? []
      const links = sheet?.links ?? []
      const frames = sheet?.frames ?? []

      useEffect(() => {
        postJson({ op: 'diagram.load' })
          .then((data) => {
            const lib = data.library ?? { activeId: '', diagrams: [] }
            const diagrams = Array.isArray(lib.diagrams) ? lib.diagrams : []
            if (!diagrams.length) {
              const id = `s${Date.now().toString(36)}`
              setLibrary({ activeId: id, diagrams: [{ id, name: t('拓扑 1'), nodes: [], links: [], frames: [] }] })
            } else {
              setLibrary({ activeId: lib.activeId || diagrams[0].id, diagrams })
            }
            loadedRef.current = true
            setLoaded(true)
          })
          .catch((problem) => setError(String(problem?.message ?? problem)))
        postJson({ op: 'devices.list' })
          .then((data) => setDevices(data.devices ?? []))
          .catch(() => { /* the book is optional for drawing */ })
      }, [])

      /* Autosave: one write per settled edit, not one per mouse move. */
      useEffect(() => {
        if (!loaded) return undefined
        setSaveState(t('保存中…'))
        const timer = setTimeout(() => {
          postJson({ op: 'diagram.save', library })
            .then(() => setSaveState(t('已保存')))
            .catch((problem) => {
              setSaveState('')
              setError(String(problem?.message ?? problem))
            })
        }, 600)
        return () => clearTimeout(timer)
      }, [library, loaded])

      /* Leaving the tool inside the debounce window must not lose the edit. */
      useEffect(() => () => {
        if (!loadedRef.current) return
        postJson({ op: 'diagram.save', library: latestRef.current }).catch(() => {})
      }, [])

      const nextId = (prefix) => {
        seqRef.current += 1
        return `${prefix}${Date.now().toString(36)}${seqRef.current}`
      }

      /** Every edit lands on the sheet that is currently open. */
      const updateSheet = (updater) => setLibrary((prev) => ({
        ...prev,
        diagrams: prev.diagrams.map((item) => (item.id === prev.activeId ? updater(item) : item)),
      }))

      const setNodes = (updater) => updateSheet((current) => ({ ...current, nodes: updater(current.nodes) }))
      const setLinks = (updater) => updateSheet((current) => ({ ...current, links: updater(current.links) }))
      const setFrames = (updater) => updateSheet((current) => ({ ...current, frames: updater(current.frames ?? []) }))

      const patchNode = (id, patch) => setNodes((list) => list.map((node) => (node.id === id ? { ...node, ...patch } : node)))

      const removeNode = (id) => {
        updateSheet((current) => ({
          ...current,
          nodes: current.nodes.filter((node) => node.id !== id),
          links: current.links.filter((link) => link.from !== id && link.to !== id),
        }))
      }

      const removeLink = (id) => setLinks((list) => list.filter((link) => link.id !== id))

      const patchLink = (id, patch) => setLinks((list) => list.map((link) => (link.id === id ? { ...link, ...patch } : link)))

      const patchFrame = (id, patch) => setFrames((list) => list.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)))

      const removeFrame = (id) => setFrames((list) => list.filter((frame) => frame.id !== id))

      const addFrame = (box) => {
        const frame = {
          id: nextId('f'),
          x: Math.round(box.x),
          y: Math.round(box.y),
          w: Math.round(box.w),
          h: Math.round(box.h),
          label: '',
          color: TOPO_FRAME_COLOR,
        }
        setFrames((list) => list.concat([frame]))
        setSelected({ kind: 'frame', id: frame.id })
        return frame
      }

      const addNode = (type) => {
        const index = nodes.length
        const node = {
          id: nextId('n'),
          type,
          name: `${t(topoTypeOf(type).label)} ${index + 1}`,
          x: 40 + (index % 5) * 170,
          y: 32 + Math.floor(index / 5) * 120,
          deviceId: '',
          note: '',
        }
        setNodes((list) => list.concat([node]))
        setSelected({ kind: 'node', id: node.id })
      }

      const addLink = (from, to) => {
        if (!from || !to || from === to) return
        setLinks((list) => {
          const exists = list.some((link) => (link.from === from && link.to === to) || (link.from === to && link.to === from))
          return exists ? list : list.concat([{ id: nextId('l'), from, to, label: '', style: 'solid' }])
        })
      }

      const bindDevice = (nodeId, deviceId) => {
        const device = devices.find((item) => item.id === deviceId)
        patchNode(nodeId, device ? { deviceId: device.id, name: device.name || device.host } : { deviceId: '' })
      }

      /* --- sheets ------------------------------------------------- */

      const addSheet = () => {
        const id = nextId('s')
        const name = `${t('拓扑')} ${library.diagrams.length + 1}`
        setLibrary((prev) => ({
          activeId: id,
          diagrams: prev.diagrams.concat([{ id, name, nodes: [], links: [], frames: [] }]),
        }))
        setSelected(null)
        setLinkFrom('')
        setNotice('')
      }

      const selectSheet = (id) => {
        setLibrary((prev) => ({ ...prev, activeId: id }))
        setSelected(null)
        setLinkFrom('')
        setNotice('')
      }

      const deleteSheet = () => {
        if (!sheet) return
        const message = t('确定要删除「${name}」这张拓扑？', { name: sheet.name })
        if (typeof window.confirm === 'function' && !window.confirm(message)) return
        setLibrary((prev) => {
          const rest = prev.diagrams.filter((item) => item.id !== prev.activeId)
          if (rest.length) return { activeId: rest[0].id, diagrams: rest }
          const id = nextId('s')
          return { activeId: id, diagrams: [{ id, name: t('拓扑 1'), nodes: [], links: [], frames: [] }] }
        })
        setSelected(null)
        setLinkFrom('')
      }

      const commitRename = () => {
        if (!renaming) return
        const name = String(renaming.name ?? '').trim() || t('未命名拓扑')
        setLibrary((prev) => ({
          ...prev,
          diagrams: prev.diagrams.map((item) => (item.id === renaming.id ? { ...item, name } : item)),
        }))
        setRenaming(null)
      }

      const clearAll = () => {
        if (typeof window.confirm === 'function' && !window.confirm(t('确定要清空这张拓扑？'))) return
        updateSheet((current) => ({ ...current, nodes: [], links: [], frames: [] }))
        setSelected(null)
        setLinkFrom('')
      }

      /* --- interaction -------------------------------------------- */

      const onNodeDown = (event, node) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const rect = canvasRef.current?.getBoundingClientRect?.() ?? { left: 0, top: 0 }
        /* The canvas is CSS-scaled, so divide by zoom to get canvas pixels. */
        const scale = zoom || 1
        const drag = {
          id: node.id,
          dx: (event.clientX - rect.left) / scale - node.x,
          dy: (event.clientY - rect.top) / scale - node.y,
          moved: false,
        }
        dragRef.current = drag
        const onMove = (moveEvent) => {
          const current = dragRef.current
          if (!current) return
          const x = (moveEvent.clientX - rect.left) / scale - current.dx
          const y = (moveEvent.clientY - rect.top) / scale - current.dy
          if (Math.abs(x - node.x) > 1 || Math.abs(y - node.y) > 1) current.moved = true
          const clampedX = Math.max(0, Math.min(TOPO_W - TOPO_NODE_W, x))
          const clampedY = Math.max(0, Math.min(TOPO_H - TOPO_NODE_H, y))
          setNodes((list) => list.map((item) => (item.id === current.id ? { ...item, x: clampedX, y: clampedY } : item)))
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          const current = dragRef.current
          dragRef.current = null
          if (!current || current.moved) return
          if (linkMode) {
            if (!linkFrom) {
              setLinkFrom(node.id)
              return
            }
            addLink(linkFrom, node.id)
            setLinkFrom('')
            return
          }
          setSelected({ kind: 'node', id: node.id })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      const selectedNode = selected?.kind === 'node' ? nodes.find((node) => node.id === selected.id) ?? null : null
      const selectedLink = selected?.kind === 'link' ? links.find((link) => link.id === selected.id) ?? null : null
      const selectedFrame = selected?.kind === 'frame' ? frames.find((frame) => frame.id === selected.id) ?? null : null
      const menuNode = menu ? nodes.find((node) => node.id === menu.nodeId) ?? null : null

      /** Place the menu next to the cursor, in pane coordinates. */
      const openMenu = (event, nodeId) => {
        const host = rootRef.current?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 900, height: 600 }
        const width = host.width || 900
        const height = host.height || 600
        setMenu({
          nodeId,
          x: Math.max(4, Math.min(event.clientX - host.left, width - 250)),
          y: Math.max(4, Math.min(event.clientY - host.top, height - 300)),
          mode: 'node',
        })
      }

      /* A click anywhere else closes the menu; no full-screen backdrop needed. */
      useEffect(() => {
        if (!menu) return undefined
        const onDown = (event) => {
          const inside = menuRef.current?.contains?.(event.target) ?? false
          if (!inside) setMenu(null)
        }
        window.addEventListener('mousedown', onDown)
        return () => window.removeEventListener('mousedown', onDown)
      }, [menu])

      /** Frames sit behind the drawing: drag the box, click it to select. */
      const onFrameDown = (event, frame) => {
        if (event.button !== 0 || frameMode) return
        event.preventDefault()
        event.stopPropagation()
        const rect = canvasRef.current?.getBoundingClientRect?.() ?? { left: 0, top: 0 }
        const scale = zoom || 1
        const drag = {
          id: frame.id,
          dx: (event.clientX - rect.left) / scale - frame.x,
          dy: (event.clientY - rect.top) / scale - frame.y,
          x0: frame.x,
          y0: frame.y,
          moved: false,
        }
        dragRef.current = drag
        const onMove = (moveEvent) => {
          const current = dragRef.current
          if (!current) return
          const x = (moveEvent.clientX - rect.left) / scale - current.dx
          const y = (moveEvent.clientY - rect.top) / scale - current.dy
          if (Math.abs(x - current.x0) > 1 || Math.abs(y - current.y0) > 1) current.moved = true
          const clampedX = Math.max(0, Math.min(TOPO_W - frame.w, x))
          const clampedY = Math.max(0, Math.min(TOPO_H - frame.h, y))
          setFrames((list) => list.map((item) => (item.id === current.id
            ? { ...item, x: Math.round(clampedX), y: Math.round(clampedY) }
            : item)))
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          const current = dragRef.current
          dragRef.current = null
          if (current && !current.moved) setSelected({ kind: 'frame', id: current.id })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      /** The little grip at the bottom-right corner resizes the frame. */
      const onFrameResize = (event, frame) => {
        event.preventDefault()
        event.stopPropagation()
        const rect = canvasRef.current?.getBoundingClientRect?.() ?? { left: 0, top: 0 }
        const scale = zoom || 1
        const startX = (event.clientX - rect.left) / scale
        const startY = (event.clientY - rect.top) / scale
        const onMove = (moveEvent) => {
          const x = (moveEvent.clientX - rect.left) / scale
          const y = (moveEvent.clientY - rect.top) / scale
          const w = Math.max(80, Math.min(TOPO_W - frame.x, frame.w + (x - startX)))
          const h = Math.max(60, Math.min(TOPO_H - frame.y, frame.h + (y - startY)))
          setFrames((list) => list.map((item) => (item.id === frame.id
            ? { ...item, w: Math.round(w), h: Math.round(h) }
            : item)))
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      /** Drawing mode: drag on empty canvas to lay out a new frame. */
      const onCanvasDown = (event) => {
        if (!frameMode || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const rect = canvasRef.current?.getBoundingClientRect?.() ?? { left: 0, top: 0 }
        const scale = zoom || 1
        const startX = (event.clientX - rect.left) / scale
        const startY = (event.clientY - rect.top) / scale
        const box = { x: startX, y: startY, w: 0, h: 0 }
        draftRef.current = box
        setDraft(box)
        const onMove = (moveEvent) => {
          const x = (moveEvent.clientX - rect.left) / scale
          const y = (moveEvent.clientY - rect.top) / scale
          const next = {
            x: Math.max(0, Math.min(startX, x)),
            y: Math.max(0, Math.min(startY, y)),
            w: Math.abs(x - startX),
            h: Math.abs(y - startY),
          }
          draftRef.current = next
          setDraft(next)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          const current = draftRef.current
          draftRef.current = null
          setDraft(null)
          setFrameMode(false)
          if (current && current.w >= 60 && current.h >= 40) addFrame(current)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      const inspector = h(
        'div',
        { className: 'nwt-topo-side' },
        selectedNode
          ? [
            h('div', { key: 'title', className: 'nwt-topo-side-title' }, t('设备')),
            h('label', { key: 'name', className: 'nwt-topo-field' },
              h('span', { className: 'nwt-label' }, t('名称')),
              h('input', {
                className: 'nwt-input',
                value: selectedNode.name,
                onChange: (event) => patchNode(selectedNode.id, { name: event.target.value }),
              })),
            h('label', { key: 'type', className: 'nwt-topo-field' },
              h('span', { className: 'nwt-label' }, t('类型')),
              h('select', {
                className: 'nwt-select',
                value: selectedNode.type,
                onChange: (event) => patchNode(selectedNode.id, { type: event.target.value }),
              }, TOPO_TYPES.map((type) => h('option', { key: type.id, value: type.id }, t(type.label))))),
            h('label', { key: 'device', className: 'nwt-topo-field' },
              h('span', { className: 'nwt-label' }, t('关联设备')),
              h('select', {
                className: 'nwt-select',
                value: selectedNode.deviceId ?? '',
                onChange: (event) => bindDevice(selectedNode.id, event.target.value),
              },
                h('option', { value: '' }, t('未关联')),
                devices.map((device) => h('option', { key: device.id, value: device.id }, device.name || device.host)))),
            h('label', { key: 'ip', className: 'nwt-topo-field' },
              h('span', { className: 'nwt-label' }, t('IP 地址（未关联时可手填）')),
              h('input', {
                className: 'nwt-input nwt-topo-node-ip',
                value: selectedNode.ip ?? '',
                spellCheck: false,
                placeholder: '192.168.1.1',
                onChange: (event) => patchNode(selectedNode.id, { ip: event.target.value }),
              })),
            h('label', { key: 'note', className: 'nwt-topo-field' },
              h('span', { className: 'nwt-label' }, t('备注')),
              h('input', {
                className: 'nwt-input nwt-topo-note-input',
                value: selectedNode.note ?? '',
                placeholder: t('显示在设备下方'),
                onChange: (event) => patchNode(selectedNode.id, { note: event.target.value }),
              })),
            selectedNode.deviceId
              ? h(Btn, {
                key: 'jump',
                variant: 'ghost',
                size: 'small',
                onClick: () => onFocusDevice?.(selectedNode.deviceId),
              }, t('在终端中打开'))
              : null,
            h(Btn, {
              key: 'delete',
              variant: 'ghost',
              size: 'small',
              onClick: () => {
                removeNode(selectedNode.id)
                setSelected(null)
              },
            }, t('删除设备')),
          ]
          : selectedLink
            ? [
              h('div', { key: 'title', className: 'nwt-topo-side-title' }, t('连线')),
              h('div', { key: 'pair', className: 'nwt-hint' },
                `${nodes.find((node) => node.id === selectedLink.from)?.name ?? '?'} — ${nodes.find((node) => node.id === selectedLink.to)?.name ?? '?'}`),
              h('label', { key: 'label', className: 'nwt-topo-field' },
                h('span', { className: 'nwt-label' }, t('备注')),
                h('input', {
                  className: 'nwt-input nwt-topo-link-note',
                  value: selectedLink.label ?? '',
                  placeholder: t('显示在线中间'),
                  onChange: (event) => patchLink(selectedLink.id, { label: event.target.value }),
                })),
              h('label', { key: 'style', className: 'nwt-topo-field' },
                h('span', { className: 'nwt-label' }, t('线型')),
                h('select', {
                  className: 'nwt-select nwt-topo-link-style',
                  value: selectedLink.style === 'dashed' ? 'dashed' : 'solid',
                  onChange: (event) => patchLink(selectedLink.id, { style: event.target.value }),
                },
                  h('option', { value: 'solid' }, t('实线')),
                  h('option', { value: 'dashed' }, t('虚线')))),
              h(Btn, {
                key: 'delete',
                variant: 'ghost',
                size: 'small',
                onClick: () => {
                  removeLink(selectedLink.id)
                  setSelected(null)
                },
              }, t('删除连线')),
            ]
          : selectedFrame
            ? [
              h('div', { key: 'title', className: 'nwt-topo-side-title' }, t('矩形框')),
              h('label', { key: 'label', className: 'nwt-topo-field' },
                h('span', { className: 'nwt-label' }, t('备注')),
                h('input', {
                  className: 'nwt-input nwt-topo-frame-note',
                  value: selectedFrame.label ?? '',
                  placeholder: t('显示在矩形框底部'),
                  onChange: (event) => patchFrame(selectedFrame.id, { label: event.target.value }),
                })),
              h('label', { key: 'color', className: 'nwt-topo-field' },
                h('span', { className: 'nwt-label' }, t('颜色')),
                h('input', {
                  type: 'color',
                  className: 'nwt-input nwt-topo-frame-color',
                  value: selectedFrame.color || TOPO_FRAME_COLOR,
                  onChange: (event) => patchFrame(selectedFrame.id, { color: event.target.value }),
                })),
              h('div', { key: 'size', className: 'nwt-hint' },
                `${Math.round(selectedFrame.w)} × ${Math.round(selectedFrame.h)}`),
              h(Btn, {
                key: 'delete',
                variant: 'ghost',
                size: 'small',
                onClick: () => {
                  removeFrame(selectedFrame.id)
                  setSelected(null)
                },
              }, t('删除矩形框')),
            ]
            : h('div', { className: 'nwt-hint' }, t('选中一个设备或连线来编辑')),
        h('div', { className: 'nwt-hint nwt-topo-help' },
          linkMode
            ? t('连线模式：依次点两台设备')
            : t('拖动移动，右键关联设备，双击跳到终端')),
      )

      const zoomLabel = `${Math.round(zoom * 100)}%`
      const zoomIndex = ZOOM_STEPS.indexOf(zoom)

      return h(
        'div',
        { ref: rootRef, className: 'nwt-topo' },
        h(
          'div',
          { className: 'nwt-card nwt-topo-bar' },
          h(
            'div',
            { className: 'nwt-topo-row' },
            renaming
              ? [
                h('input', {
                  key: 'name',
                  className: 'nwt-input nwt-topo-sheet-name',
                  value: renaming.name,
                  autoFocus: true,
                  onChange: (event) => setRenaming({ ...renaming, name: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') setRenaming(null)
                  },
                }),
                h(Btn, { key: 'ok', variant: 'primary', size: 'small', onClick: commitRename }, t('确定')),
                h(Btn, { key: 'cancel', variant: 'ghost', size: 'small', onClick: () => setRenaming(null) }, t('取消')),
              ]
              : [
                h('select', {
                  key: 'select',
                  className: 'nwt-select nwt-topo-sheet',
                  value: library.activeId,
                  'aria-label': t('拓扑图'),
                  onChange: (event) => selectSheet(event.target.value),
                }, library.diagrams.map((item) => h('option', { key: item.id, value: item.id }, item.name))),
                h(Btn, { key: 'new', variant: 'ghost', size: 'small', onClick: addSheet }, t('新建拓扑')),
                h(Btn, {
                  key: 'rename',
                  variant: 'ghost',
                  size: 'small',
                  disabled: !sheet,
                  onClick: () => setRenaming({ id: library.activeId, name: sheet?.name ?? '' }),
                }, t('重命名')),
                h(Btn, {
                  key: 'delete',
                  variant: 'ghost',
                  size: 'small',
                  disabled: !sheet,
                  onClick: deleteSheet,
                }, t('删除拓扑')),
              ],
            h('span', { className: 'nwt-term-spacer' }),
            saveState ? h('span', { className: 'nwt-topo-save' }, saveState) : null,
          ),
          h(
            'div',
            { className: 'nwt-topo-row' },
            h('div', { className: 'nwt-topo-palette' },
              TOPO_TYPES.map((type) => h(Btn, {
                key: type.id,
                variant: 'ghost',
                size: 'small',
                onClick: () => addNode(type.id),
              }, `+ ${t(type.label)}`))),
            h('span', { className: 'nwt-term-spacer' }),
            h(
              'div',
              { className: 'nwt-topo-zoom' },
              h(Btn, {
                variant: 'ghost',
                size: 'small',
                disabled: zoomIndex <= 0,
                onClick: () => setZoom(ZOOM_STEPS[Math.max(0, zoomIndex - 1)]),
                title: t('缩小'),
                ariaLabel: t('缩小'),
              }, '−'),
              h('button', {
                type: 'button',
                className: 'nwt-topo-zoom-value',
                title: t('恢复 100%'),
                onClick: () => setZoom(1),
              }, zoomLabel),
              h(Btn, {
                variant: 'ghost',
                size: 'small',
                disabled: zoomIndex >= ZOOM_STEPS.length - 1,
                onClick: () => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1)]),
                title: t('放大'),
                ariaLabel: t('放大'),
              }, '+'),
            ),
            h(Btn, {
              variant: linkMode ? 'primary' : 'ghost',
              size: 'small',
              onClick: () => {
                setLinkMode((value) => !value)
                setFrameMode(false)
                setLinkFrom('')
              },
            }, linkMode ? t('取消连线') : t('连线')),
            h(Btn, {
              variant: frameMode ? 'primary' : 'ghost',
              size: 'small',
              onClick: () => {
                setFrameMode((value) => !value)
                setLinkMode(false)
                setLinkFrom('')
              },
              title: t('在画布上拖出一个矩形框，用来圈出一片区域'),
            }, frameMode ? t('取消画框') : t('画框')),
            h(Btn, {
              variant: 'ghost',
              size: 'small',
              onClick: clearAll,
              disabled: !nodes.length,
            }, t('清空')),
          ),
        ),
        error ? h('div', { className: 'nwt-error' }, error) : null,
        notice ? h('div', { className: 'nwt-notice' }, notice) : null,
        h(
          'div',
          { className: 'nwt-topo-body' },
          h(
            'div',
            {
              className: 'nwt-topo-viewport',
              onMouseDown: () => {
                setMenu(null)
                setSelected(null)
              },
            },
            h(
              'div',
              {
                className: 'nwt-topo-stage',
                style: {
                  width: `${Math.round(TOPO_W * zoom)}px`,
                  height: `${Math.round(TOPO_H * zoom)}px`,
                },
              },
              h(
                'div',
                {
                  className: 'nwt-topo-canvas',
                  ref: canvasRef,
                  onMouseDown: onCanvasDown,
                  style: {
                    width: `${TOPO_W}px`,
                    height: `${TOPO_H}px`,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                  },
                },
                /* Frames are the backdrop: painted first, and only their border
                   and label take the mouse, so a line crossing a frame stays
                   clickable. */
                frames.map((frame) => {
                  const active = selected?.kind === 'frame' && selected.id === frame.id
                  const tint = frame.color || TOPO_FRAME_COLOR
                  const grab = (event) => onFrameDown(event, frame)
                  const edge = (side) => h('div', {
                    key: side,
                    className: cn('nwt-topo-frame-edge', TOPO_FRAME_EDGE[side]),
                    style: { pointerEvents: frameMode ? 'none' : 'auto' },
                    onMouseDown: grab,
                  })
                  return h(
                    'div',
                    {
                      key: frame.id,
                      className: cn('nwt-topo-frame', active && 'nwt-topo-frame--active'),
                      style: {
                        left: `${frame.x}px`,
                        top: `${frame.y}px`,
                        width: `${frame.w}px`,
                        height: `${frame.h}px`,
                        borderColor: tint,
                        background: hexToRgba(tint, 0.06),
                      },
                    },
                    edge('top'),
                    edge('right'),
                    edge('bottom'),
                    edge('left'),
                    frame.label
                      ? h('div', {
                        className: 'nwt-topo-frame-label',
                        style: { color: tint, pointerEvents: frameMode ? 'none' : 'auto' },
                        onMouseDown: grab,
                      }, frame.label)
                      : null,
                    active
                      ? h('div', {
                        className: 'nwt-topo-frame-grip',
                        title: t('拖动改变大小'),
                        onMouseDown: (event) => onFrameResize(event, frame),
                      })
                      : null,
                  )
                }),
                draft
                  ? h('div', {
                    className: 'nwt-topo-frame nwt-topo-frame--draft',
                    style: {
                      left: `${draft.x}px`,
                      top: `${draft.y}px`,
                      width: `${draft.w}px`,
                      height: `${draft.h}px`,
                      borderColor: TOPO_FRAME_COLOR,
                    },
                  })
                  : null,
                h(
                  'svg',
                  { className: 'nwt-topo-links', width: TOPO_W, height: TOPO_H },
                  links.map((link) => {
                    const from = nodes.find((node) => node.id === link.from)
                    const to = nodes.find((node) => node.id === link.to)
                    if (!from || !to) return null
                    const x1 = from.x + TOPO_NODE_W / 2
                    const y1 = from.y + TOPO_NODE_H / 2
                    const x2 = to.x + TOPO_NODE_W / 2
                    const y2 = to.y + TOPO_NODE_H / 2
                    const active = selected?.kind === 'link' && selected.id === link.id
                    return h(
                      'g',
                      { key: link.id },
                      h('line', {
                        x1, y1, x2, y2,
                        className: 'nwt-topo-link-hit',
                        onClick: (event) => {
                          event.stopPropagation()
                          setSelected({ kind: 'link', id: link.id })
                        },
                      }),
                      h('line', {
                        x1, y1, x2, y2,
                        className: cn('nwt-topo-link-line', active && 'nwt-topo-link-line--active'),
                        strokeDasharray: link.style === 'dashed' ? '8 5' : undefined,
                      }),
                    )
                  }),
                ),
                links.map((link) => {
                  const from = nodes.find((node) => node.id === link.from)
                  const to = nodes.find((node) => node.id === link.to)
                  if (!from || !to || !link.label) return null
                  return h('div', {
                    key: `label-${link.id}`,
                    className: 'nwt-topo-link-label',
                    style: {
                      left: `${(from.x + to.x) / 2 + TOPO_NODE_W / 2}px`,
                      top: `${(from.y + to.y) / 2 + TOPO_NODE_H / 2}px`,
                    },
                    title: link.label,
                  }, link.label)
                }),
                nodes.map((node) => {
                  const type = topoTypeOf(node.type)
                  const bound = devices.find((device) => device.id === node.deviceId)
                  const address = bound?.host || node.ip || ''
                  return h(
                    'div',
                    {
                      key: node.id,
                      className: cn(
                        'nwt-topo-node',
                        TOPO_TYPE_CLASS[node.type] ?? TOPO_TYPE_CLASS.other,
                        selected?.kind === 'node' && selected.id === node.id && 'nwt-topo-node--active',
                        linkFrom === node.id && 'nwt-topo-node--source',
                      ),
                      style: { left: `${node.x}px`, top: `${node.y}px`, width: `${TOPO_NODE_W}px`, height: `${TOPO_NODE_H}px` },
                      title: node.deviceId ? t('双击跳到终端') : t('右键关联设备'),
                      onMouseDown: (event) => onNodeDown(event, node),
                      onDoubleClick: (event) => {
                        event.stopPropagation()
                        if (node.deviceId) {
                          onFocusDevice?.(node.deviceId)
                          return
                        }
                        setNotice(t('这台设备还没关联设备簿条目，右键可以先关联'))
                      },
                      onContextMenu: (event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        openMenu(event, node.id)
                      },
                    },
                    h(TopoIcon, { type: node.type, size: 26 }),
                    h(
                      'div',
                      { className: 'nwt-topo-node-text' },
                      h('span', { className: 'nwt-topo-node-name' }, node.name),
                      h('small', { className: 'nwt-topo-node-sub' },
                        `${type.short} · ${address || t(type.label)}`),
                    ),
                    node.note
                      ? h('div', { className: 'nwt-topo-node-note' }, node.note)
                      : null,
                  )
                }),
                nodes.length
                  ? null
                  : h('div', { className: 'nwt-topo-empty' },
                    t('点左上角的设备类型开始画：拖动移动，工具栏「连线」后依次点两台设备')),
              ),
            ),
          ),
          inspector,
        ),
        menu
          ? (() => {
            const items = menu.mode === 'devices'
              ? [
                devices.length
                  ? devices.map((device) => h('button', {
                    key: device.id,
                    type: 'button',
                    className: 'nwt-topo-menu-item',
                    onClick: () => {
                      bindDevice(menu.nodeId, device.id)
                      setMenu(null)
                    },
                  },
                  h('span', null, device.name || device.host),
                  h('small', null, `${device.host}:${device.port}`)))
                  : h('div', { key: 'empty', className: 'nwt-topo-menu-empty' }, t('设备簿是空的')),
                h('button', {
                  key: 'back',
                  type: 'button',
                  className: 'nwt-topo-menu-item nwt-topo-menu-item--muted',
                  onClick: () => setMenu({ ...menu, mode: 'node' }),
                }, t('返回')),
              ]
              : [
                h('button', {
                  key: 'bind',
                  type: 'button',
                  className: 'nwt-topo-menu-item',
                  onClick: () => setMenu({ ...menu, mode: 'devices' }),
                }, t('关联设备…')),
                menuNode?.deviceId
                  ? h('button', {
                    key: 'unbind',
                    type: 'button',
                    className: 'nwt-topo-menu-item',
                    onClick: () => {
                      bindDevice(menu.nodeId, '')
                      setMenu(null)
                    },
                  }, t('取消关联'))
                  : null,
                h('button', {
                  key: 'delete',
                  type: 'button',
                  className: 'nwt-topo-menu-item nwt-topo-menu-item--danger',
                  onClick: () => {
                    removeNode(menu.nodeId)
                    setMenu(null)
                    setSelected(null)
                  },
                }, t('删除设备')),
              ]
            return h(
              'div',
              {
                ref: menuRef,
                className: 'nwt-topo-menu',
                style: { left: `${menu.x}px`, top: `${menu.y}px` },
                onMouseDown: (event) => event.stopPropagation(),
              },
              h('div', { className: 'nwt-topo-menu-title' }, menuNode?.name ?? ''),
              items,
            )
          })()
          : null,
      )
    }


    /* ------------------------------------------------------------ */
    /* Page                                                          */
    /* ------------------------------------------------------------ */

    const COLLAPSE_KEY = 'nwtool.collapsed'

    function readCollapsed() {
      try {
        const raw = window.localStorage.getItem(COLLAPSE_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
      } catch {
        return []
      }
    }

    function writeCollapsed(ids) {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(ids))
      } catch {
        /* storage may be unavailable; collapsing still works for this session */
      }
    }

    /* Which tool was open last. The panel unmounts whenever another workspace
       session takes the main slot, so without this every return lands on Ping. */
    const LAST_TOOL_KEY = 'nwtool.tool.last'

    function readLastTool() {
      try {
        const value = window.localStorage.getItem(LAST_TOOL_KEY)
        return typeof value === 'string' && GROUPS.some((group) => group.tools.includes(value)) ? value : ''
      } catch {
        return ''
      }
    }

    function writeLastTool(id) {
      try {
        window.localStorage.setItem(LAST_TOOL_KEY, String(id))
      } catch {
        /* storage may be unavailable; the panel still works for this visit */
      }
    }

    /* ------------------------------------------------------------ */
    /* Terminal                                                      */
    /* ------------------------------------------------------------ */

    /*
     * A VT100/xterm subset: cursor addressing, SGR colours, erase, insert and
     * delete, scroll regions and the alternate screen. Enough for a switch CLI,
     * a Linux shell, `top` and `vi`; an unknown sequence is skipped rather than
     * drawn wrongly. Wide (CJK) characters occupy two cells, because a Chinese
     * device console would otherwise tear the layout apart.
     */

    const TERM_PALETTE = [
      '#2b2f36', '#ff6b6b', '#63d471', '#e3c46b', '#6aa7ff', '#c98bff', '#4fd6d6', '#d7dce5',
      '#5b6270', '#ff9494', '#8ce6a0', '#f0d98a', '#8fc0ff', '#dcb0ff', '#79e8e8', '#ffffff',
    ]

    /* How many lines may scroll off the top before the oldest is forgotten. The
       Host only replays the last 256 KB of a session, so a deeper buffer would
       mostly hold lines no replay can produce again. */
    const SCROLLBACK_LINES = 2000

    /** Height of one rendered row; mirrored by `.nwt-term-row` in the stylesheet. */
    const TERM_LINE_HEIGHT = 18

    function charWidth(code) {
      if (code === 0x200b || (code >= 0x0300 && code <= 0x036f)) return 0
      if (
        (code >= 0x1100 && code <= 0x115f)
        || (code >= 0x2e80 && code <= 0x303e)
        || (code >= 0x3041 && code <= 0x33ff)
        || (code >= 0x3400 && code <= 0x4dbf)
        || (code >= 0x4e00 && code <= 0x9fff)
        || (code >= 0xa000 && code <= 0xa4cf)
        || (code >= 0xac00 && code <= 0xd7a3)
        || (code >= 0xf900 && code <= 0xfaff)
        || (code >= 0xfe30 && code <= 0xfe4f)
        || (code >= 0xff00 && code <= 0xff60)
        || (code >= 0xffe0 && code <= 0xffe6)
        || (code >= 0x1f300 && code <= 0x1f64f)
        || (code >= 0x1f900 && code <= 0x1f9ff)
      ) return 2
      return 1
    }

    function paletteHex(index) {
      if (index < 16) return TERM_PALETTE[index]
      if (index >= 232) {
        const level = 8 + (index - 232) * 10
        return `rgb(${level},${level},${level})`
      }
      const n = index - 16
      const steps = [0, 95, 135, 175, 215, 255]
      const r = steps[Math.floor(n / 36) % 6]
      const g = steps[Math.floor(n / 6) % 6]
      const b = steps[n % 6]
      return `rgb(${r},${g},${b})`
    }

    function createScreen(cols, rows) {
      const makeLines = (c, r) => Array.from({ length: r }, () => Array.from({ length: c }, () => ({
        ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false,
      })))

      const screen = {
        cols,
        rows,
        lines: makeLines(cols, rows),
        /* Lines that scrolled off the top, as render runs. The alternate screen
           (top, vi, less) never lands here: it is a full-screen repaint whose
           "scrolled" lines are not output the user wants to read again. */
        scrollback: [],
        alt: false,
        cursor: { x: 0, y: 0, visible: true },
        attrs: { fg: null, bg: null, bold: false, underline: false, inverse: false },
        saved: { x: 0, y: 0 },
        top: 0,
        bottom: rows - 1,
        wrap: true,
        pendingWrap: false,
        state: 'ground',
        params: '',
        savedLines: null,
        version: 0,
      }

      const clampCursor = () => {
        screen.cursor.y = Math.min(screen.rows - 1, Math.max(0, screen.cursor.y))
        screen.cursor.x = Math.min(screen.cols - 1, Math.max(0, screen.cursor.x))
      }

      const blank = (line) => {
        for (let x = 0; x < screen.cols; x += 1) {
          line[x].ch = ' '
          line[x].fg = null
          line[x].bg = null
          line[x].bold = false
          line[x].underline = false
          line[x].inverse = false
          line[x].cont = false
        }
      }

      const scrollUp = (count) => {
        /* Only a scroll of the whole primary screen is history. A scroll region
           (a status bar, a pager's footer) and the alternate screen redraw in
           place: their top line is not the oldest output. */
        const record = !screen.alt && screen.top === 0 && screen.bottom === screen.rows - 1
        for (let i = 0; i < count; i += 1) {
          const line = screen.lines[screen.top]
          if (record) {
            screen.scrollback.push(lineRuns(screen, line, -1))
            if (screen.scrollback.length > SCROLLBACK_LINES) screen.scrollback.shift()
          }
          screen.lines.splice(screen.top, 1)
          blank(line)
          screen.lines.splice(screen.bottom, 0, line)
        }
        screen.version += 1
      }

      const scrollDown = (count) => {
        for (let i = 0; i < count; i += 1) {
          const line = screen.lines[screen.bottom]
          screen.lines.splice(screen.bottom, 1)
          blank(line)
          screen.lines.splice(screen.top, 0, line)
        }
        screen.version += 1
      }

      const lineFeed = () => {
        if (screen.cursor.y === screen.bottom) scrollUp(1)
        else screen.cursor.y = Math.min(screen.rows - 1, screen.cursor.y + 1)
        screen.pendingWrap = false
      }

      const putChar = (ch) => {
        const width = charWidth(ch.codePointAt(0) ?? 32)
        if (width === 0) return
        if (screen.pendingWrap) {
          screen.cursor.x = 0
          lineFeed()
        }
        if (width === 2 && screen.cursor.x === screen.cols - 1) {
          screen.cursor.x = 0
          lineFeed()
        }
        const line = screen.lines[screen.cursor.y]
        const cell = line[screen.cursor.x]
        cell.ch = ch
        cell.fg = screen.attrs.fg
        cell.bg = screen.attrs.bg
        cell.bold = screen.attrs.bold
        cell.underline = screen.attrs.underline
        cell.inverse = screen.attrs.inverse
        cell.cont = false
        if (width === 2) {
          const next = line[screen.cursor.x + 1]
          if (next) {
            next.ch = ''
            next.cont = true
            next.fg = cell.fg
            next.bg = cell.bg
          }
        }
        const advance = width
        if (screen.cursor.x + advance >= screen.cols) {
          if (screen.wrap) screen.pendingWrap = true
          else screen.cursor.x = screen.cols - 1
        } else {
          screen.cursor.x += advance
        }
        screen.version += 1
      }

      const eraseInLine = (mode) => {
        const line = screen.lines[screen.cursor.y]
        const from = mode === 1 ? 0 : screen.cursor.x
        const to = mode === 1 ? screen.cursor.x : screen.cols - 1
        for (let x = from; x <= to; x += 1) {
          line[x] = { ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false }
        }
        screen.version += 1
      }

      const eraseInDisplay = (mode) => {
        if (mode === 2 || mode === 3) {
          screen.lines.forEach(blank)
        } else if (mode === 0) {
          eraseInLine(0)
          for (let y = screen.cursor.y + 1; y < screen.rows; y += 1) blank(screen.lines[y])
        } else if (mode === 1) {
          eraseInLine(1)
          for (let y = 0; y < screen.cursor.y; y += 1) blank(screen.lines[y])
        }
        screen.version += 1
      }

      const applySgr = (params) => {
        const codes = params.length ? params : [0]
        for (let i = 0; i < codes.length; i += 1) {
          const code = codes[i]
          if (code === 0) Object.assign(screen.attrs, { fg: null, bg: null, bold: false, underline: false, inverse: false })
          else if (code === 1) screen.attrs.bold = true
          else if (code === 2) screen.attrs.bold = false
          else if (code === 4) screen.attrs.underline = true
          else if (code === 22) { screen.attrs.bold = false }
          else if (code === 24) screen.attrs.underline = false
          else if (code === 7) screen.attrs.inverse = true
          else if (code === 27) screen.attrs.inverse = false
          else if (code >= 30 && code <= 37) screen.attrs.fg = paletteHex(code - 30)
          else if (code === 39) screen.attrs.fg = null
          else if (code >= 40 && code <= 47) screen.attrs.bg = paletteHex(code - 40)
          else if (code === 49) screen.attrs.bg = null
          else if (code >= 90 && code <= 97) screen.attrs.fg = paletteHex(code - 90 + 8)
          else if (code >= 100 && code <= 107) screen.attrs.bg = paletteHex(code - 100 + 8)
          else if (code === 38 || code === 48) {
            const target = code === 38 ? 'fg' : 'bg'
            if (codes[i + 1] === 5) {
              screen.attrs[target] = paletteHex(codes[i + 2] ?? 0)
              i += 2
            } else if (codes[i + 1] === 2) {
              screen.attrs[target] = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`
              i += 4
            }
          }
        }
      }

      const setMode = (params, enable) => {
        for (const code of params) {
          if (code === 7) screen.wrap = enable
          else if (code === 25) screen.cursor.visible = enable
          else if (code === 1049 || code === 47) {
            if (enable && !screen.savedLines) {
              screen.savedLines = screen.lines.map((line) => line.map((cell) => ({ ...cell })))
              screen.lines = makeLines(screen.cols, screen.rows)
              screen.cursor.x = 0
              screen.cursor.y = 0
              screen.alt = true
            } else if (!enable && screen.savedLines) {
              screen.lines = screen.savedLines
              screen.savedLines = null
              screen.alt = false
            }
            screen.version += 1
          }
        }
      }

      const csi = (final, rawParams, prefix) => {
        const parts = rawParams.replace(/^[?>!]/, '').split(';')
        const params = parts.map((part) => (part === '' ? 0 : Number.parseInt(part, 10) || 0))
        const first = params[0] ?? 0
        const count = (value) => (value > 0 ? value : 1)

        switch (final) {
          case 'A': screen.cursor.y = Math.max(0, screen.cursor.y - count(first)); break
          case 'B': screen.cursor.y = Math.min(screen.rows - 1, screen.cursor.y + count(first)); break
          case 'C': screen.cursor.x = Math.min(screen.cols - 1, screen.cursor.x + count(first)); break
          case 'D': screen.cursor.x = Math.max(0, screen.cursor.x - count(first)); break
          case 'E': screen.cursor.y = Math.min(screen.rows - 1, screen.cursor.y + count(first)); screen.cursor.x = 0; break
          case 'F': screen.cursor.y = Math.max(0, screen.cursor.y - count(first)); screen.cursor.x = 0; break
          case 'G': screen.cursor.x = Math.min(screen.cols - 1, Math.max(0, (first || 1) - 1)); break
          case 'd': screen.cursor.y = Math.min(screen.rows - 1, Math.max(0, (first || 1) - 1)); break
          case 'H':
          case 'f': {
            const row = (params[0] || 1) - 1
            const col = (params[1] || 1) - 1
            screen.cursor.y = Math.min(screen.rows - 1, Math.max(0, row))
            screen.cursor.x = Math.min(screen.cols - 1, Math.max(0, col))
            break
          }
          case 'J': eraseInDisplay(first); break
          case 'K': eraseInLine(first); break
          case 'L': {
            for (let i = 0; i < count(first); i += 1) {
              const line = screen.lines[screen.cursor.y]
              screen.lines.splice(screen.cursor.y, 0, line.map(() => ({ ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false })))
              screen.lines.splice(screen.bottom + 1, 1)
            }
            screen.version += 1
            break
          }
          case 'M': {
            for (let i = 0; i < count(first); i += 1) {
              screen.lines.splice(screen.cursor.y, 1)
              screen.lines.splice(screen.bottom, 0, Array.from({ length: screen.cols }, () => ({ ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false })))
            }
            screen.version += 1
            break
          }
          case 'P': {
            const line = screen.lines[screen.cursor.y]
            line.splice(screen.cursor.x, count(first))
            while (line.length < screen.cols) line.push({ ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false })
            screen.version += 1
            break
          }
          case '@': {
            const line = screen.lines[screen.cursor.y]
            const blankCells = Array.from({ length: count(first) }, () => ({ ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false }))
            line.splice(screen.cursor.x, 0, ...blankCells)
            line.length = screen.cols
            screen.version += 1
            break
          }
          case 'S': scrollUp(count(first)); break
          case 'T': scrollDown(count(first)); break
          case 'X': {
            const line = screen.lines[screen.cursor.y]
            for (let i = 0; i < count(first); i += 1) {
              const x = screen.cursor.x + i
              if (x < screen.cols) line[x] = { ch: ' ', fg: null, bg: null, bold: false, underline: false, inverse: false, cont: false }
            }
            screen.version += 1
            break
          }
          case 'm': applySgr(params); break
          case 'r': {
            const top = (params[0] || 1) - 1
            const bottom = (params[1] || screen.rows) - 1
            if (top < bottom) {
              screen.top = Math.max(0, top)
              screen.bottom = Math.min(screen.rows - 1, bottom)
              screen.cursor.x = 0
              screen.cursor.y = screen.top
            }
            break
          }
          case 'h': if (prefix === '?') setMode(params, true); break
          case 'l': if (prefix === '?') setMode(params, false); break
          case 's': screen.saved = { x: screen.cursor.x, y: screen.cursor.y }; break
          case 'u': screen.cursor.x = screen.saved.x; screen.cursor.y = screen.saved.y; break
          default: break
        }
        clampCursor()
      }

      const escFinal = (ch) => {
        if (ch === 'M') {
          if (screen.cursor.y === screen.top) scrollDown(1)
          else screen.cursor.y = Math.max(0, screen.cursor.y - 1)
        } else if (ch === 'D') lineFeed()
        else if (ch === 'E') { lineFeed(); screen.cursor.x = 0 } else if (ch === '7') screen.saved = { x: screen.cursor.x, y: screen.cursor.y }
        else if (ch === '8') { screen.cursor.x = screen.saved.x; screen.cursor.y = screen.saved.y }
        else if (ch === 'c') {
          screen.lines = makeLines(screen.cols, screen.rows)
          screen.cursor = { x: 0, y: 0, visible: true }
          screen.top = 0
          screen.bottom = screen.rows - 1
          /* A full reset drops the alternate buffer; the scrollback is what the
             user came back to read, so it survives the clear. */
          screen.savedLines = null
          screen.alt = false
          screen.version += 1
        }
        clampCursor()
      }

      screen.write = (text) => {
        const chunk = String(text)
        let i = 0
        while (i < chunk.length) {
          const ch = chunk[i]
          const code = ch.charCodeAt(0)
          if (screen.state === 'ground') {
            if (ch === '\x1b') { screen.state = 'esc'; i += 1; continue }
            if (ch === '\r') { screen.cursor.x = 0; screen.pendingWrap = false; i += 1; continue }
            if (ch === '\n' || ch === '\x0b' || ch === '\x0c') { lineFeed(); i += 1; continue }
            if (ch === '\b') { screen.cursor.x = Math.max(0, screen.cursor.x - 1); screen.pendingWrap = false; i += 1; continue }
            if (ch === '\t') { screen.cursor.x = Math.min(screen.cols - 1, (Math.floor(screen.cursor.x / 8) + 1) * 8); i += 1; continue }
            if (code < 32 || code === 0x7f) { i += 1; continue }
            putChar(ch)
            i += 1
            continue
          }
          if (screen.state === 'esc') {
            if (ch === '[') { screen.state = 'csi'; screen.params = ''; i += 1; continue }
            if (ch === ']') { screen.state = 'osc'; i += 1; continue }
            if (ch === '(' || ch === ')' || ch === '#' || ch === '%') { screen.state = 'charset'; i += 1; continue }
            if (ch === '\x1b') { i += 1; continue }
            escFinal(ch)
            screen.state = 'ground'
            i += 1
            continue
          }
          if (screen.state === 'csi') {
            if (code >= 0x30 && code <= 0x3f) {
              if (!screen.params && (ch === '?' || ch === '>' || ch === '!')) screen.params = ch
              else if (!screen.params || screen.params === '?' || screen.params === '>' || screen.params === '!') screen.params += ch
              else screen.params += ch
              i += 1
              continue
            }
            if (code >= 0x20 && code <= 0x2f) { i += 1; continue }
            if (code >= 0x40 && code <= 0x7e) {
              const prefix = screen.params.startsWith('?') ? '?' : ''
              csi(ch, screen.params, prefix)
              screen.state = 'ground'
              i += 1
              continue
            }
            screen.state = 'ground'
            i += 1
            continue
          }
          if (screen.state === 'osc') {
            if (ch === '\x07') { screen.state = 'ground'; i += 1; continue }
            if (ch === '\x1b' && chunk[i + 1] === '\\') { screen.state = 'ground'; i += 2; continue }
            i += 1
            continue
          }
          screen.state = 'ground'
          i += 1
        }
        screen.version += 1
      }

      screen.resize = (nextCols, nextRows) => {
        const cols2 = Math.max(20, Math.min(400, nextCols))
        const rows2 = Math.max(8, Math.min(200, nextRows))
        if (cols2 === screen.cols && rows2 === screen.rows) return false
        const nextLines = makeLines(cols2, rows2)
        for (let y = 0; y < Math.min(rows2, screen.rows); y += 1) {
          for (let x = 0; x < Math.min(cols2, screen.cols); x += 1) nextLines[y][x] = screen.lines[y][x]
        }
        screen.lines = nextLines
        screen.cols = cols2
        screen.rows = rows2
        screen.top = 0
        screen.bottom = rows2 - 1
        screen.cursor.x = Math.min(cols2 - 1, screen.cursor.x)
        screen.cursor.y = Math.min(rows2 - 1, screen.cursor.y)
        screen.version += 1
        return true
      }

      return screen
    }

    /**
     * Render runs for one line, collapsing equal styles. `y = -1` renders a
     * snapshot: the cursor belongs to the live screen, never to scrollback.
     */
    function lineRuns(screen, line, y) {
      const runs = []
      let run = null
      for (let x = 0; x < screen.cols; x += 1) {
        const cell = line[x]
        if (!cell || cell.cont) continue
        const isCursor = y >= 0 && screen.cursor.visible && y === screen.cursor.y && x === Math.min(screen.cursor.x, screen.cols - 1)
        const fg = cell.inverse ? (cell.bg ?? '#0b0f14') : (cell.fg ?? 'inherit')
        const bg = isCursor ? 'var(--dsw-alias-label-primary)' : (cell.inverse ? (cell.fg ?? '#d7dce5') : cell.bg)
        const color = isCursor ? 'var(--dsw-alias-bg-base)' : fg
        const key = `${color}|${bg}|${cell.bold ? 1 : 0}|${cell.underline ? 1 : 0}`
        if (!run || run.key !== key) {
          run = {
            key,
            text: '',
            style: {
              color: color === 'inherit' ? undefined : color,
              background: bg ?? undefined,
              fontWeight: cell.bold ? 600 : undefined,
              textDecoration: cell.underline ? 'underline' : undefined,
              animation: isCursor ? 'nwt-caret 1.1s steps(1) infinite' : undefined,
            },
          }
          runs.push(run)
        }
        run.text += cell.ch || ' '
      }
      return runs
    }

    /** Turn the cell grid into render runs, one array per visible row. */
    function screenRows(screen) {
      const rows = []
      for (let y = 0; y < screen.rows; y += 1) rows.push(lineRuns(screen, screen.lines[y], y))
      return rows
    }

    /* ------------------------------------------------------------ */
    /* Terminal pane                                                 */
    /* ------------------------------------------------------------ */

    const KEY_SEQUENCES = {
      Enter: '\r',
      Backspace: '\x7f',
      Tab: '\t',
      Escape: '\x1b',
      ArrowUp: '\x1b[A',
      ArrowDown: '\x1b[B',
      ArrowRight: '\x1b[C',
      ArrowLeft: '\x1b[D',
      Home: '\x1b[H',
      End: '\x1b[F',
      Insert: '\x1b[2~',
      Delete: '\x1b[3~',
      PageUp: '\x1b[5~',
      PageDown: '\x1b[6~',
    }

    const AUTH_OPTIONS = [
      { value: 'prompt', label: '每次输入密码' },
      { value: 'saved', label: '保存密码（本机加密）' },
      { value: 'key', label: 'SSH 私钥' },
      { value: 'agent', label: 'SSH agent' },
    ]

    /**
     * Keyboard behaviour shared by the terminal panel and the floating window:
     * the browser keeps paste (and the copy of a selection), everything else
     * becomes bytes for the device. `isLocked` mutes the human while the model
     * holds the keyboard or the session is not up.
     */
    function termInputHandlers(send, isLocked) {
      const locked = () => (typeof isLocked === 'function' ? isLocked() : false)
      const onKeyDown = (event) => {
        if (locked()) return
        /* Paste belongs to the browser: turning Ctrl+V into ^V would eat it. */
        if ((event.ctrlKey || event.metaKey) && String(event.key ?? '').toLowerCase() === 'v') return
        if (event.ctrlKey && event.key.length === 1) {
          const code = event.key.toUpperCase().charCodeAt(0) - 64
          if (code >= 0 && code <= 31) {
            event.preventDefault()
            send(String.fromCharCode(code))
            return
          }
        }
        if (event.altKey && event.key.length === 1) {
          event.preventDefault()
          send(`\x1b${event.key}`)
          return
        }
        const sequence = KEY_SEQUENCES[event.key]
        if (sequence) {
          event.preventDefault()
          send(sequence)
        }
      }
      const onInput = (event) => {
        const value = event.target.value
        if (!value || locked()) return
        event.target.value = ''
        send(value)
      }
      const onPaste = (event) => {
        const text = event.clipboardData?.getData('text')
        if (!text || locked()) return
        event.preventDefault()
        send(text.replace(/\r?\n/g, '\r'))
      }
      return { onKeyDown, onInput, onPaste }
    }

    /** The ungrouped bucket is stored as '' and only named when rendered. */
    const DEFAULT_GROUP = '默认分组'

    function emptyDevice() {
      return {
        id: '', name: '', host: '', port: 22, protocol: 'ssh', username: '',
        authMode: 'prompt', keyPath: '', note: '', group: '', password: '',
      }
    }

    /** Label + control, the shape the terminal form needs. */
    function TermField({ label, wide, children }) {
      return h(
        'label',
        { className: cn('nwt-term-field', wide && 'nwt-term-field--wide') },
        h('span', { className: 'nwt-label' }, label),
        children,
      )
    }

    /** Group the book by `group`, keeping the unnamed bucket first. */
    function groupDevices(devices) {
      const buckets = new Map()
      for (const device of devices) {
        const key = String(device?.group ?? '').trim()
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(device)
      }
      return [...buckets.entries()]
        .sort(([left], [right]) => {
          if (!left) return -1
          if (!right) return 1
          return left.localeCompare(right)
        })
        .map(([key, items]) => ({
          id: `group:${key}`,
          name: key,
          label: key || t(DEFAULT_GROUP),
          devices: items,
        }))
    }

    /** A tab title that stays unique while sessions accumulate. */
    function sessionTitleFor(device, tabs) {
      const host = String(device?.host ?? '').trim()
      const user = String(device?.username ?? '').trim()
      const base = String(device?.name ?? '').trim() || (user ? `${user}@${host}` : host) || t('未命名会话')
      if (!tabs.some((tab) => tab.title === base)) return base
      let index = 2
      while (tabs.some((tab) => tab.title === `${base} (${index})`)) index += 1
      return `${base} (${index})`
    }

    function sessionDotClass(status) {
      return cn(
        'nwt-term-dot',
        status === 'connected' ? 'nwt-term-dot--on'
          : status === 'connecting' ? 'nwt-term-dot--wait'
            : 'nwt-term-dot--off',
      )
    }

    function sessionStatusLabel(status) {
      if (status === 'connected') return t('已连接')
      if (status === 'connecting') return t('连接中…')
      return t('未连接')
    }

    /** Host exit reasons are codes; only the ones a person sees are spelled out. */
    function exitReason(reason) {
      const code = String(reason ?? 'closed')
      if (code === 'idle') return t('超过保留时间，会话已回收')
      if (code === 'disposed') return t('工具箱已重载')
      return code
    }

    /** Bytes the way a person reads them. */
    function clientBytes(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
      let index = 0
      let rest = value
      while (rest >= 1024 && index < units.length - 1) {
        rest /= 1024
        index += 1
      }
      const rounded = rest >= 100 ? Math.round(rest) : Math.round(rest * 10) / 10
      return `${rounded} ${units[index]}`
    }

    /** Bit rates for the interface list. */
    function clientRate(bitsPerSecond) {
      const value = Number(bitsPerSecond)
      if (!Number.isFinite(value) || value < 0) return '-'
      if (value < 1000) return `${Math.round(value)} bps`
      if (value < 1000 ** 2) return `${Math.round(value / 1000)} kbps`
      if (value < 1000 ** 3) return `${Math.round(value / 1000 ** 2)} Mbps`
      return `${Math.round(value / 1000 ** 3)} Gbps`
    }

    /* ------------------------------------------------------------------ */
    /* Remembered terminal tabs                                            */
    /* ------------------------------------------------------------------ */

    /* The panel is a "global panel": opening a workspace session switches the
       main slot back to the conversation and unmounts this whole tree, taking
       the tabs with it. The Host keeps the sessions alive for a while, so a tab
       list in localStorage is enough to come back and re-attach. */
    const TAB_STORAGE_KEY = 'nwtool.tabs.v1'

    function tabStorage() {
      try {
        return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
      } catch {
        return null
      }
    }

    function readStoredTabs() {
      const area = tabStorage()
      if (!area) return null
      try {
        const raw = area.getItem(TAB_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const stored = Array.isArray(parsed?.tabs) ? parsed.tabs : []
        const tabs = stored
          .filter((tab) => tab && typeof tab === 'object' && String(tab.host ?? '').trim())
          .map((tab) => ({
            title: String(tab.title ?? ''),
            deviceId: String(tab.deviceId ?? ''),
            host: String(tab.host ?? ''),
            port: Number(tab.port) || 22,
            protocol: String(tab.protocol ?? 'ssh'),
            username: String(tab.username ?? ''),
            authMode: String(tab.authMode ?? 'prompt'),
            sessionId: String(tab.sessionId ?? ''),
          }))
        if (!tabs.length) return null
        return {
          tabs,
          activeIndex: Math.max(0, Number(parsed?.activeIndex) || 0),
          encoding: parsed?.encoding === 'gbk' ? 'gbk' : 'utf-8',
        }
      } catch {
        return null
      }
    }

    function writeStoredTabs(payload) {
      const area = tabStorage()
      if (!area) return
      try {
        if (!payload.tabs.length) area.removeItem(TAB_STORAGE_KEY)
        else area.setItem(TAB_STORAGE_KEY, JSON.stringify(payload))
      } catch {
        /* private mode or quota: restoring is a convenience, not a promise */
      }
    }

    /** Clipboard write with the selection fallback older webviews still need. */
    function writeClipboard(text) {
      const value = String(text ?? '')
      if (!value) return Promise.resolve(false)
      const legacy = () => {
        try {
          if (typeof document?.createElement !== 'function' || !document.body) return false
          const area = document.createElement('textarea')
          area.value = value
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.left = '-9999px'
          document.body.appendChild(area)
          area.select()
          const done = document.execCommand('copy')
          document.body.removeChild(area)
          return Boolean(done)
        } catch {
          return false
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(value).then(() => true).catch(legacy)
      }
      return Promise.resolve(legacy())
    }

    function TermPane({ visible = true, focus = null, onAttention = null } = {}) {
      const [devices, setDevices] = useState([])
      const [selectedId, setSelectedId] = useState('')
      const [formMode, setFormMode] = useState('')
      const [form, setForm] = useState(emptyDevice)
      const [password, setPassword] = useState('')
      const [bookOpen, setBookOpen] = useState(true)
      const [closedGroups, setClosedGroups] = useState([])
      const [notice, setNotice] = useState('')
      const [error, setError] = useState('')
      const [tabs, setTabs] = useState([])
      const [activeKey, setActiveKey] = useState('')
      /* Dangerous commands the model wants to type, waiting for a human verdict. */
      const [approvals, setApprovals] = useState([])
      const [encoding, setEncoding] = useState('utf-8')
      /* Where the canvas is scrolled to. The scrollback is virtualised, so the
         window start is state, not a DOM scroll offset; `key` makes a fresh tab
         start at its newest line instead of inheriting the previous offset. */
      const [scroll, setScroll] = useState({ key: '', stick: true, top: 0 })
      /* Right-hand inspector: system load and the device's file tree. */
      const [inspector, setInspector] = useState('')
      const [monitorInfo, setMonitorInfo] = useState(null)
      const [monitorError, setMonitorError] = useState('')
      const [sample, setSample] = useState(null)
      const [sampleError, setSampleError] = useState('')
      const [paused, setPaused] = useState(false)
      const [files, setFiles] = useState(null)
      const [filesPath, setFilesPath] = useState('')
      const [filesError, setFilesError] = useState('')
      const [filesBusy, setFilesBusy] = useState(false)
      const [pickedFile, setPickedFile] = useState(null)
      const [fileInfo, setFileInfo] = useState(null)
      const [, repaint] = useState(0)
      const runtimesRef = useRef({})
      const seqRef = useRef(0)
      const hostRef = useRef(null)
      const inputRef = useRef(null)
      const screenRef = useRef(null)
      const activeKeyRef = useRef('')
      const visibleRef = useRef(true)
      /* Per-tab side channel: one extra CLI session per tab, plus the vendor it
         reported so reopening the inspector does not re-detect. */
      const monitorsRef = useRef({})
      const vendorsRef = useRef({})
      /* Tabs as of the last commit, plus anything opened since: a handler that
         fired before React re-rendered still sees the connection it just started. */
      const tabsRef = useRef([])
      /* Parsed once per mount, before any effect can overwrite the storage. */
      const storedTabsRef = useRef(undefined)
      if (storedTabsRef.current === undefined) storedTabsRef.current = readStoredTabs()

      activeKeyRef.current = activeKey
      visibleRef.current = visible !== false
      tabsRef.current = tabs

      const bump = () => repaint((value) => value + 1)

      const groups = groupDevices(devices)
      const selected = devices.find((device) => device.id === selectedId) ?? null
      const activeTab = tabs.find((tab) => tab.key === activeKey) ?? null
      const activeRuntime = activeTab ? runtimesRef.current[activeTab.key] ?? null : null
      const liveRows = activeRuntime ? screenRows(activeRuntime.screen) : []
      const backRows = activeRuntime?.screen?.scrollback ?? []
      const totalRows = backRows.length + (activeRuntime?.screen?.rows ?? 0)
      /* Only the window the viewport can show is rendered: a replayed session can
         hold thousands of lines and every incoming chunk repaints this pane. */
      const viewHeight = screenRef.current ? Math.max(0, (screenRef.current.clientHeight || 0) - 16) : 0
      const visibleRows = Math.max(1, Math.ceil(
        (viewHeight || (activeRuntime ? activeRuntime.screen.rows * TERM_LINE_HEIGHT : TERM_LINE_HEIGHT)) / TERM_LINE_HEIGHT,
      ) + 1)
      const scrollSticky = scroll.key !== activeKey || scroll.stick
      const maxTop = Math.max(0, totalRows - visibleRows)
      const topRow = scrollSticky ? maxTop : Math.min(scroll.top, maxTop)
      const windowRows = []
      for (let row = topRow; row < Math.min(totalRows, topRow + visibleRows); row += 1) {
        windowRows.push(row < backRows.length ? backRows[row] : (liveRows[row - backRows.length] ?? []))
      }
      const rowsBelow = Math.max(0, totalRows - topRow - windowRows.length)
      const canScroll = totalRows > visibleRows
      const needsPassword = Boolean(selected)
        && (selected.authMode === 'prompt' || selected.authMode === 'key')

      const loadDevices = () => {
        postJson({ op: 'devices.list' })
          .then((data) => setDevices(data.devices ?? []))
          .catch((problem) => setError(String(problem?.message ?? problem)))
      }

      useEffect(() => { loadDevices() }, [])

      /* This pane owns the terminal streams while it is mounted. The overlay
         only takes over once the main slot shows something else; mounting sets
         the flag back, which makes the float detach and the panel re-attach. */
      useEffect(() => {
        setFloatMounted(true)
        return () => setFloatMounted(false)
      }, [])

      /* The panel is unmounted when another workspace session is picked, but the
         Host keeps the sessions it was watching. Re-attach them instead of
         dialling again; the order is preserved so the tab strip looks unchanged. */
      useEffect(() => {
        const stored = storedTabsRef.current
        if (!stored) return
        let cancelled = false
        const restore = (live) => {
          if (cancelled || tabsRef.current.length) return
          restoreTabs(stored, live)
        }
        postJson({ op: 'term.list' })
          .then((data) => restore(Array.isArray(data?.sessions) ? data.sessions : []))
          .catch(() => restore([]))
        return () => { cancelled = true }
      }, [])

      /* Remember the tab strip across panel unmounts, never the password. */
      useEffect(() => {
        if (!tabs.length) return
        writeStoredTabs({
          activeIndex: Math.max(0, tabs.findIndex((tab) => tab.key === activeKey)),
          encoding,
          tabs: tabs.map((tab) => ({
            title: tab.title,
            deviceId: tab.deviceId,
            host: tab.host,
            port: tab.port,
            protocol: tab.protocol,
            username: tab.username,
            authMode: tab.authMode,
            sessionId: tab.sessionId ?? '',
          })),
        })
      }, [tabs, activeKey, encoding])

      /* Unmounting must not leave a stream (or a side channel) running: drop the
         transport so the Host marks the session detached and keeps it for a
         while, and close the inspector's own CLI session outright. */
      useEffect(() => () => {
        for (const key of Object.keys(runtimesRef.current)) {
          const runtime = runtimesRef.current[key]
          try { runtime?.controller?.abort() } catch { /* already gone */ }
          if (runtime) runtime.controller = null
        }
        for (const key of Object.keys(monitorsRef.current)) {
          const info = monitorsRef.current[key]
          if (info?.id) postJson({ op: 'term.monitor.close', id: info.id }).catch(() => {})
          delete monitorsRef.current[key]
        }
      }, [])

      /* A double-click in the topology pane asks the book to select a device.
         It only selects: starting a session stays the user's decision. */
      useEffect(() => {
        if (!focus?.id) return
        setSelectedId(focus.id)
        setBookOpen(true)
        setFormMode('')
        const device = devices.find((item) => item.id === focus.id)
        setNotice(device
          ? t('已选中「${name}」，点「连接」建立会话', { name: device.name })
          : t('设备簿里没有这台设备，可能已被删除'))
      }, [focus?.nonce])

      /** Selecting a device never touches a running session. */
      const selectDevice = (id) => {
        setSelectedId(id)
        setNotice('')
        setError('')
      }

      const startNew = () => {
        setForm(emptyDevice())
        setFormMode('new')
        setPassword('')
        setError('')
        setNotice('')
        if (!bookOpen) setBookOpen(true)
      }

      const startEdit = () => {
        if (!selected) return
        setForm({ ...emptyDevice(), ...selected, password: '' })
        setFormMode('edit')
        setPassword('')
        setError('')
        setNotice('')
      }

      const cancelForm = () => {
        setFormMode('')
        setForm(emptyDevice())
        setPassword('')
      }

      const toggleGroup = (id) => {
        setClosedGroups((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : prev.concat([id])))
      }

      const save = () => {
        const payload = { ...form }
        delete payload.password
        const group = String(payload.group ?? '').trim()
        /* The localized default name means "no group", never a real bucket. */
        payload.group = group === t(DEFAULT_GROUP) ? '' : group
        if (form.authMode === 'saved') payload.password = form.password
        postJson({ op: 'devices.save', device: payload })
          .then((data) => {
            setNotice(t('已保存「${name}」', { name: data.device?.name ?? form.name }))
            setSelectedId(data.device?.id ?? '')
            setFormMode('')
            setForm(emptyDevice())
            loadDevices()
          })
          .catch((problem) => setError(String(problem?.message ?? problem)))
      }

      const remove = (device) => {
        postJson({ op: 'devices.delete', id: device.id })
          .then(() => {
            setNotice(t('已删除「${name}」', { name: device.name }))
            loadDevices()
            if (selectedId === device.id) {
              setForm(emptyDevice())
              setSelectedId('')
              setFormMode('')
            }
          })
          .catch((problem) => setError(String(problem?.message ?? problem)))
      }

      const patchTab = (key, patch) => {
        setTabs((prev) => prev.map((tab) => (tab.key === key ? { ...tab, ...patch } : tab)))
      }

      const fitSize = () => {
        const host = hostRef.current
        if (!host) return { cols: 100, rows: 30 }
        const probe = host.querySelector('.nwt-term-probe')
        const charWidth = probe ? probe.getBoundingClientRect().width / 10 : 8
        const width = host.clientWidth || 800
        const height = host.clientHeight || 420
        const cols = Math.max(40, Math.min(200, Math.floor((width - 16) / (charWidth || 8))))
        const rows = Math.max(12, Math.min(60, Math.floor((height - 16) / 18)))
        return { cols, rows }
      }

      /** Explain a failed connection instead of a bare "connection failed". */
      const explainFailure = (key) => {
        postJson({ op: 'term.diag' })
          .then((info) => {
            const parts = []
            if (info?.origin || info?.host) parts.push(`origin=${info.origin ?? '-'} host=${info?.host ?? '-'}`)
            if (info?.verdict && info.verdict !== 'ok') parts.push(`verdict=${info.verdict}`)
            if (info?.lastRefusal?.verdict) parts.push(`last=${info.lastRefusal.verdict}`)
            patchTab(key, {
              error: parts.length
                ? t('终端连接失败（${detail}）', { detail: parts.join(' · ') })
                : t('终端连接失败'),
            })
          })
          .catch(() => patchTab(key, { error: t('终端连接失败') }))
      }

      /** Wire one transport stream to one tab; used by connect and reconnect. */
      const attach = (key, runtime, request) => {
        const signal = runtime.controller.signal
        streamEvents(request, (event) => {
          if (event.t === 'ready') {
            runtime.opened = true
            runtime.sessionId = String(event.d?.sessionId ?? '')
            patchTab(key, {
              status: 'connected',
              sessionId: runtime.sessionId,
              error: '',
              notice: '',
            })
            /* The Host keeps only the tail of a long session: say so instead of
               letting the scrollback start mid-command without explanation. */
            if (event.d?.skipped) setNotice(t('更早的输出已被裁剪，只保留最近的会话历史'))
            if (activeKeyRef.current === key) inputRef.current?.focus?.()
            return
          }
          if (event.t === 'data') {
            const raw = atob(String(event.d ?? ''))
            const bytes = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
            runtime.screen.write(runtime.decoder.decode(bytes, { stream: true }))
            /* Only the tab in front of the user needs a repaint; a background
               or hidden session keeps writing into its own grid, and the next
               render shows whatever accumulated. */
            if (activeKeyRef.current === key && visibleRef.current) bump()
            return
          }
          if (event.t === 'share') {
            patchTab(key, { shared: Boolean(event.d?.shared) })
            return
          }
          if (event.t === 'agent') {
            patchTab(key, {
              agent: event.d?.state === 'running' ? 'running' : 'idle',
              agentLine: String(event.d?.line ?? ''),
            })
            return
          }
          if (event.t === 'approval') {
            const approval = {
              id: String(event.d?.id ?? ''),
              line: String(event.d?.line ?? ''),
              tabKey: key,
              sessionId: runtime.sessionId,
            }
            setApprovals((prev) => (prev.some((item) => item.id === approval.id) ? prev : prev.concat([approval])))
            /* The dialog lives in the terminal pane; bring that pane in front so
               the request cannot wait behind another tool. */
            onAttention?.()
            return
          }
          if (event.t === 'approval-done') {
            setApprovals((prev) => prev.filter((item) => item.id !== String(event.d?.id ?? '')))
            return
          }
          if (event.t === 'error') {
            const dead = runtime.sessionId
            runtime.sessionId = ''
            forgetFloatSession(dead)
            setApprovals((prev) => prev.filter((item) => item.tabKey !== key))
            patchTab(key, { status: 'failed', sessionId: '', error: String(event.d ?? '') })
            return
          }
          if (event.t === 'exit') {
            const dead = runtime.sessionId
            runtime.sessionId = ''
            forgetFloatSession(dead)
            setApprovals((prev) => prev.filter((item) => item.tabKey !== key))
            patchTab(key, {
              status: 'closed',
              sessionId: '',
              error: '',
              notice: t('会话已结束（${reason}）', { reason: exitReason(event.d) }),
            })
          }
        }, signal)
          .catch((problem) => {
            if (signal.aborted) return
            const dead = runtime.sessionId
            runtime.sessionId = ''
            forgetFloatSession(dead)
            if (runtime.opened) {
              patchTab(key, { status: 'closed', sessionId: '', error: String(problem?.message ?? problem) })
              return
            }
            patchTab(key, {
              status: 'failed',
              sessionId: '',
              error: String(problem?.message ?? problem) || t('终端连接失败'),
            })
            explainFailure(key)
          })
      }

      /** Is this tab already talking to the device we are about to dial? */
      const sameTarget = (tab, device) => {
        const protocol = String(device?.protocol ?? 'ssh')
        const port = Number(device?.port) || (protocol === 'telnet' ? 23 : 22)
        if (device?.id && tab.deviceId) return tab.deviceId === device.id
        return tab.host === String(device?.host ?? '') && tab.port === port && tab.protocol === protocol
      }

      /** Enough to dial the same target again, without the password. */
      const openRequestFor = (entry, size) => {
        const request = { op: 'term.open', cols: size.cols, rows: size.rows }
        if (entry.deviceId) {
          request.deviceId = entry.deviceId
          return request
        }
        request.device = {
          name: entry.title,
          host: entry.host,
          port: entry.port,
          protocol: entry.protocol,
          username: entry.username,
          authMode: entry.authMode,
        }
        return request
      }

      /**
       * Put the remembered tabs back. The Host still holds the sessions for a
       * while after the panel goes away, so one that is listed is re-attached —
       * its scrollback is replayed from the Host buffer — while a missing one
       * stays as a closed tab the user can dial again.
       */
      const restoreTabs = (stored, live) => {
        const size = fitSize()
        const encodingChoice = stored.encoding === 'gbk' ? 'gbk' : 'utf-8'
        if (encodingChoice !== encoding) setEncoding(encodingChoice)
        const liveById = new Map((Array.isArray(live) ? live : []).map((session) => [String(session?.id ?? ''), session]))
        const nextRuntimes = {}
        const nextTabs = stored.tabs.map((entry) => {
          const key = `s${(seqRef.current += 1)}`
          nextRuntimes[key] = {
            screen: createScreen(size.cols, size.rows),
            sessionId: '',
            controller: new AbortController(),
            decoder: new TextDecoder(encodingChoice),
            opened: false,
            request: openRequestFor(entry, size),
          }
          return {
            key,
            sessionId: entry.sessionId,
            title: entry.title || (entry.username ? `${entry.username}@${entry.host}` : entry.host),
            deviceId: entry.deviceId,
            host: entry.host,
            port: entry.port,
            protocol: entry.protocol,
            username: entry.username,
            authMode: entry.authMode,
            status: 'closed',
            error: '',
            notice: '',
            shared: false,
            agent: 'idle',
            agentLine: '',
          }
        })
        runtimesRef.current = { ...runtimesRef.current, ...nextRuntimes }
        tabsRef.current = nextTabs
        setTabs(nextTabs)
        const index = Math.min(Math.max(0, Number(stored.activeIndex) || 0), nextTabs.length - 1)
        setActiveKey(nextTabs[index]?.key ?? '')
        let attached = 0
        for (const tab of nextTabs) {
          const liveInfo = tab.sessionId ? liveById.get(tab.sessionId) : null
          if (!liveInfo) {
            patchTab(tab.key, { status: 'closed', notice: t('上次的会话已结束，可以重新连接') })
            continue
          }
          attached += 1
          patchTab(tab.key, {
            status: 'connecting',
            shared: Boolean(liveInfo.shared),
            agent: liveInfo.agent === 'running' ? 'running' : 'idle',
          })
          attach(tab.key, nextRuntimes[tab.key], {
            op: 'term.attach',
            id: tab.sessionId,
            cols: size.cols,
            rows: size.rows,
            since: 0,
          })
        }
        setNotice(attached
          ? t('已恢复 ${count} 个标签页，后台会话仍在运行', { count: attached })
          : t('上次的会话已结束，标签页保留，可重新连接'))
        /* A pin whose Host session is gone would only show an ended window. */
        if (floatStore.enabled && floatStore.target?.id && !liveById.has(floatStore.target.id)) clearFloat()
      }

      /** Every connection lives in its own tab and its own transport stream. */
      const connectDevice = (device) => {
        if (!device || !device.host) {
          setError(t('请填写设备地址'))
          return
        }
        /* Enter on the still-focused Connect button fires a second click before
           the first connection is up: one dial at a time per device. */
        if (tabsRef.current.some((tab) => tab.status === 'connecting' && sameTarget(tab, device))) return
        const port = Number(device.port) || (device.protocol === 'telnet' ? 23 : 22)
        const snapshot = {
          id: String(device.id ?? ''),
          name: String(device.name ?? ''),
          host: String(device.host ?? ''),
          port,
          protocol: String(device.protocol ?? 'ssh'),
          username: String(device.username ?? ''),
          authMode: String(device.authMode ?? 'prompt'),
          keyPath: String(device.keyPath ?? ''),
        }
        const size = fitSize()
        const request = { op: 'term.open', cols: size.cols, rows: size.rows }
        /* A saved device resolves its stored secret on the host; everything
           else travels with the snapshot and the typed password. */
        if (snapshot.id && snapshot.authMode !== 'prompt') request.deviceId = snapshot.id
        else request.device = snapshot
        if (snapshot.authMode === 'prompt' || snapshot.authMode === 'key') request.password = password

        const key = `s${(seqRef.current += 1)}`
        const runtime = {
          screen: createScreen(size.cols, size.rows),
          sessionId: '',
          controller: new AbortController(),
          decoder: new TextDecoder(encoding),
          opened: false,
          request,
        }
        runtimesRef.current[key] = runtime
        const tab = {
          key,
          sessionId: '',
          title: sessionTitleFor(device, tabsRef.current),
          deviceId: snapshot.id,
          host: snapshot.host,
          port,
          protocol: snapshot.protocol,
          username: snapshot.username,
          authMode: snapshot.authMode,
          status: 'connecting',
          error: '',
          notice: '',
          shared: false,
          agent: 'idle',
          agentLine: '',
        }
        /* Recorded before the commit so an immediate second click is refused. */
        tabsRef.current = tabsRef.current.concat([tab])
        setTabs((prev) => prev.concat([tab]))
        setActiveKey(key)
        setError('')
        setNotice('')
        attach(key, runtime, request)
      }

      const reconnect = (key) => {
        const runtime = runtimesRef.current[key]
        const tab = tabs.find((item) => item.key === key)
        if (!runtime || !tab) return
        const size = fitSize()
        runtime.screen = createScreen(size.cols, size.rows)
        runtime.decoder = new TextDecoder(encoding)
        runtime.controller = new AbortController()
        runtime.opened = false
        runtime.sessionId = ''
        const request = { ...runtime.request, cols: size.cols, rows: size.rows }
        runtime.request = request
        /* A fresh grid has no history: start at its bottom instead of keeping the
           scroll offset of the session that just ended. */
        setScroll({ key, stick: true, top: 0 })
        patchTab(key, { status: 'connecting', error: '', notice: '' })
        setActiveKey(key)
        attach(key, runtime, request)
      }

      const disconnectTab = (key) => {
        const runtime = runtimesRef.current[key]
        if (runtime) {
          try { runtime.controller?.abort() } catch { /* already gone */ }
          runtime.controller = null
          if (runtime.sessionId) postJson({ op: 'term.close', id: runtime.sessionId }).catch(() => {})
          forgetFloatSession(runtime.sessionId)
          runtime.sessionId = ''
        }
        patchTab(key, { status: 'closed', sessionId: '', error: '', notice: t('已断开连接') })
      }

      const closeTab = (key) => {
        const runtime = runtimesRef.current[key]
        if (runtime) {
          try { runtime.controller?.abort() } catch { /* already gone */ }
          if (runtime.sessionId) postJson({ op: 'term.close', id: runtime.sessionId }).catch(() => {})
          forgetFloatSession(runtime.sessionId)
          delete runtimesRef.current[key]
        }
        releaseMonitors(key)
        delete vendorsRef.current[key]
        const index = tabs.findIndex((tab) => tab.key === key)
        const next = tabs.filter((tab) => tab.key !== key)
        setTabs(next)
        tabsRef.current = next
        /* Closing the last tab means "I am done with these devices"; a remembered
           list that outlives it would resurrect them on the next visit. */
        if (!next.length) writeStoredTabs({ tabs: [] })
        if (activeKey === key) {
          const fallback = next[Math.min(index, next.length - 1)] ?? next[next.length - 1] ?? null
          setActiveKey(fallback?.key ?? '')
        }
      }

      const activateTab = (key) => {
        setActiveKey(key)
        setError('')
        setNotice('')
      }

      /* ------------------------------------------------------------ */
      /* DSH access to this tab                                        */
      /* ------------------------------------------------------------ */

      /** Sharing is per tab, off by default, and revoked on the way out. */
      const toggleShare = () => {
        const tab = activeTab
        if (!tab || tab.status !== 'connected' || !tab.sessionId) return
        const next = !tab.shared
        postJson({ op: 'term.share', id: tab.sessionId, shared: next })
          .then(() => patchTab(tab.key, { shared: next }))
          .catch((problem) => setError(String(problem?.message ?? problem)))
      }

      /* ------------------------------------------------------------ */
      /* Floating window                                               */
      /* ------------------------------------------------------------ */

      /** Whether the tab in front is the one pinned to the overlay. */
      const floated = Boolean(
        activeTab?.sessionId && floatStore.enabled && floatStore.target?.id === activeTab.sessionId,
      )

      /** Pin the tab in front to the floating window (or take it back). */
      const toggleFloat = () => {
        const tab = activeTab
        if (!tab || tab.status !== 'connected' || !tab.sessionId) return
        if (floated) {
          clearFloat()
          setNotice(t('已取消浮窗'))
          return
        }
        setFloatTarget({ id: tab.sessionId, title: tab.title, host: tab.host, port: tab.port, encoding })
        setNotice(t('已浮窗：切到工作区会话后，这个终端会留在右上角'))
      }

      const answerApproval = (approval, allow) => {
        setApprovals((prev) => prev.filter((item) => item.id !== approval.id))
        postJson({
          op: 'term.approve',
          id: approval.sessionId,
          approvalId: approval.id,
          allow,
        }).catch((problem) => setError(String(problem?.message ?? problem)))
      }

      const takeBackControl = () => {
        const tab = tabs.find((item) => item.key === activeKey)
        if (!tab?.sessionId) return
        postJson({ op: 'term.agent.cancel', id: tab.sessionId }).catch(() => {})
      }

      /* ------------------------------------------------------------ */
      /* Inspector: system load and the device file tree               */
      /* ------------------------------------------------------------ */

      const monitorIdFor = (key) => monitorsRef.current[key]?.id ?? ''

      /** Close the side channel for one tab (or every tab when no key is given). */
      const releaseMonitors = (onlyKey) => {
        for (const key of Object.keys(monitorsRef.current)) {
          if (onlyKey && key !== onlyKey) continue
          const info = monitorsRef.current[key]
          if (info?.id) postJson({ op: 'term.monitor.close', id: info.id }).catch(() => {})
          delete monitorsRef.current[key]
        }
        setMonitorInfo(null)
        setSample(null)
        setFiles(null)
        setPickedFile(null)
      }

      /** One monitor session per tab, opened on demand and reused afterwards. */
      const ensureMonitor = (tab) => {
        if (!tab) return Promise.resolve(null)
        const existing = monitorsRef.current[tab.key]
        if (existing) {
          setMonitorInfo(existing)
          return Promise.resolve(existing)
        }
        const runtime = runtimesRef.current[tab.key]
        if (!runtime) return Promise.resolve(null)
        const request = runtime.request ?? {}
        const payload = { op: 'term.monitor.open', vendor: vendorsRef.current[tab.key] ?? 'auto' }
        if (request.deviceId) payload.deviceId = request.deviceId
        else payload.device = request.device
        if (request.password) payload.password = request.password
        setMonitorError('')
        return postJson(payload)
          .then((data) => {
            monitorsRef.current[tab.key] = data
            vendorsRef.current[tab.key] = data.vendor
            setMonitorInfo(data)
            return data
          })
          .catch((problem) => {
            setMonitorError(String(problem?.message ?? problem))
            return null
          })
      }

      const loadFiles = (path, tabKey) => {
        const key = tabKey ?? activeKey
        const id = monitorIdFor(key)
        if (!id) {
          setFilesError(t('监控会话尚未就绪'))
          return Promise.resolve()
        }
        setFilesBusy(true)
        setFilesError('')
        return postJson({ op: 'term.files.list', id, path: String(path ?? '') })
          .then((data) => {
            setFiles(data.listing)
            setFilesPath(data.listing?.path ?? '')
            setPickedFile(null)
          })
          .catch((problem) => setFilesError(String(problem?.message ?? problem)))
          .finally(() => setFilesBusy(false))
      }

      const joinPath = (base, name) => {
        const text = String(base ?? '')
        if (!text) return name
        if (text.endsWith('/') || text.endsWith(':')) return `${text}${name}`
        return `${text}/${name}`
      }

      const openInspector = (name) => {
        const next = inspector === name ? '' : name
        if (!next) {
          releaseMonitors()
          setInspector('')
          return
        }
        setInspector(next)
        const tab = tabsRef.current.find((item) => item.key === activeKey)
        if (!tab || tab.status !== 'connected') {
          setMonitorError(t('先连接一台设备'))
          return
        }
        ensureMonitor(tab).then((info) => {
          if (info && next === 'files') loadFiles('', tab.key)
        })
      }

      /* Polling: five seconds, one sample in flight at a time. */
      useEffect(() => {
        if (inspector !== 'monitor' || paused) return undefined
        const id = monitorIdFor(activeKey)
        if (!id) return undefined
        let cancelled = false
        let busy = false
        const tick = () => {
          if (busy || cancelled) return
          busy = true
          postJson({ op: 'term.monitor.sample', id })
            .then((data) => {
              if (cancelled) return
              setSample(data.sample)
              setSampleError('')
            })
            .catch((problem) => {
              if (!cancelled) setSampleError(String(problem?.message ?? problem))
            })
            .finally(() => { busy = false })
        }
        tick()
        const timer = setInterval(tick, 5000)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [inspector, paused, activeKey, monitorInfo?.id])

      /* The side channel follows the tab it belongs to. */
      useEffect(() => {
        if (inspector) {
          const tab = tabs.find((item) => item.key === activeKey)
          if (!tab || tab.status !== 'connected') {
            releaseMonitors()
            setMonitorError(t('先连接一台设备'))
          }
          return
        }
        if (Object.keys(monitorsRef.current).length) releaseMonitors()
      }, [inspector, activeKey])

      /* A tab keeps its own grid; re-fit it when it comes back to the front —
         including the moment the terminal tool is opened again, which is when a
         restored session first has a real size to lay out for. */
      useEffect(() => {
        if (!activeKey || !visible) return
        const tab = tabs.find((item) => item.key === activeKey)
        const runtime = runtimesRef.current[activeKey]
        if (!tab || !runtime) return
        if (tab.status === 'connected') inputRef.current?.focus?.()
        if (tab.status !== 'connected') return
        const size = fitSize()
        if (!runtime.screen.resize(size.cols, size.rows)) return
        postJson({ op: 'term.resize', id: runtime.sessionId, cols: size.cols, rows: size.rows }).catch(() => {})
        bump()
        /* `status` is a dependency because a restored tab first attaches with the
           fallback size (the layout does not exist yet) and only becomes
           `connected` once the replay starts; that is the moment to re-fit. */
      }, [activeKey, visible, activeTab?.status])

      /* New output keeps the view pinned to the newest line unless the reader has
         scrolled up into the history — nobody is dragged back mid-read. */
      useEffect(() => {
        if (!scrollSticky) return
        const element = screenRef.current
        if (element && element.scrollTop !== element.scrollHeight) element.scrollTop = element.scrollHeight
      })

      /* Copying a selection is the browser's job, with one exception: right after
         a click the keyboard sink still holds focus, and Ctrl+C would then send a
         ^C to the device instead of copying. Own the shortcut whenever the
         selection lives in the canvas. */
      useEffect(() => {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
        const onCopyKey = (event) => {
          if (!(event.ctrlKey || event.metaKey) || String(event.key ?? '').toLowerCase() !== 'c') return
          const selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
          const text = String(selection ?? '')
          if (!text) return
          if (!screenRef.current?.contains?.(selection?.anchorNode ?? null)) return
          event.preventDefault()
          event.stopPropagation()
          writeClipboard(text)
        }
        document.addEventListener('keydown', onCopyKey, true)
        return () => document.removeEventListener('keydown', onCopyKey, true)
      }, [])

      const sendBytes = (payload) => {
        const runtime = activeRuntime
        const id = runtime?.sessionId
        if (!id) return
        const bytes = new TextEncoder().encode(payload)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        postJson({ op: 'term.input', id, data: btoa(binary) }).catch(() => {})
      }

      /* A drag that selected text must keep the selection: focusing the keyboard
         sink collapses it, and the copy that follows would copy nothing. */
      const focusScreen = () => {
        const picked = typeof window !== 'undefined' && window.getSelection ? String(window.getSelection() ?? '') : ''
        if (picked) return
        inputRef.current?.focus?.()
      }

      /* The rendered window is virtualised, so the scroll offset is translated
         back into "first visible row" instead of being read from the grid. */
      const scrollScreen = (event) => {
        const element = event.currentTarget
        const height = Number(element?.clientHeight) || 0
        const offset = Number(element?.scrollTop) || 0
        const atBottom = height > 0 ? offset + height >= (Number(element?.scrollHeight) || 0) - 4 : true
        const line = atBottom ? 0 : Math.max(0, Math.floor((offset - 8) / TERM_LINE_HEIGHT))
        setScroll((prev) => (
          prev.key === activeKey && prev.stick === atBottom && prev.top === line
            ? prev
            : { key: activeKey, stick: atBottom, top: line }
        ))
      }

      const jumpToNewest = () => {
        setScroll({ key: activeKey, stick: true, top: 0 })
        const element = screenRef.current
        if (element) element.scrollTop = element.scrollHeight
      }

      /* While the model is holding the keyboard the human input is muted: two
         writers interleaving on one console is how nonsense gets typed. */
      const agentHolding = () => activeTab?.agent === 'running'

      const termInput = termInputHandlers(sendBytes, () => activeTab?.status !== 'connected' || agentHolding())

      const changeEncoding = (next) => {
        setEncoding(next)
        for (const key of Object.keys(runtimesRef.current)) {
          runtimesRef.current[key].decoder = new TextDecoder(next)
        }
      }

      /* The banner only names the state; the notice strip above carries the
         reason (session ended, disconnected, host refused …). */
      const idleLabel = (status) => (status === 'connecting'
        ? t('连接中…')
        : status === 'failed' ? t('终端连接失败') : t('未连接'))

      /* While this device is being dialled the button waits: a second Enter
         must not open a second tab. */
      const connectingTarget = Boolean(selected)
        && tabs.some((tab) => tab.status === 'connecting' && sameTarget(tab, selected))

      const takeSample = () => {
        const id = monitorIdFor(activeKey)
        if (!id) return
        postJson({ op: 'term.monitor.sample', id })
          .then((data) => {
            setSample(data.sample)
            setSampleError('')
          })
          .catch((problem) => setSampleError(String(problem?.message ?? problem)))
      }

      const monitorPanel = () => {
        const info = sample
        const metric = (label, value, percentValue) => h(
          'div',
          { className: 'nwt-mon-item' },
          h('div', { className: 'nwt-mon-label' }, label, h('b', null, value)),
          percentValue === null || percentValue === undefined
            ? null
            : h('div', { className: 'nwt-mon-bar' }, h('span', { style: { width: `${Math.max(0, Math.min(100, Number(percentValue) || 0))}%` } })),
        )
        return [
          h(
            'div',
            { className: 'nwt-mon-actions' },
            h('span', { className: 'nwt-mon-meta-text' }, monitorInfo?.vendorLabel ?? '-'),
            h('span', { className: 'nwt-term-spacer' }),
            h(Btn, { variant: 'ghost', size: 'small', onClick: () => setPaused((value) => !value) }, paused ? t('继续') : t('暂停')),
            h(Btn, { variant: 'ghost', size: 'small', onClick: takeSample }, t('刷新')),
          ),
          sampleError ? h('div', { className: 'nwt-error' }, sampleError) : null,
          !info && !sampleError ? h('div', { className: 'nwt-term-empty' }, t('正在采样…')) : null,
          info
            ? h(
              'div',
              null,
              metric(t('CPU'), info.cpu?.percent === undefined || info.cpu === null ? '—' : `${info.cpu.percent}%`, info.cpu?.percent),
              metric(
                t('内存'),
                info.memory?.percent === undefined || info.memory === null ? '—' : `${info.memory.percent}%`,
                info.memory?.percent,
              ),
              info.memory
                ? h('small', { className: 'nwt-mon-sub' }, `${clientBytes(info.memory.used)} / ${clientBytes(info.memory.total)}`)
                : null,
              metric(
                t('负载'),
                info.load ? `${info.load.one} ${info.load.five} ${info.load.fifteen ?? '-'}` : '—',
                null,
              ),
              info.disk?.length
                ? h(
                  'div',
                  { className: 'nwt-mon-section' },
                  h('div', { className: 'nwt-mon-label' }, t('磁盘')),
                  info.disk.map((disk) => h(
                    'div',
                    { key: disk.mount, className: 'nwt-mon-row' },
                    h('span', { className: 'nwt-mon-row-name' }, disk.mount),
                    h('span', { className: 'nwt-mon-row-value' }, disk.percent === null ? '-' : `${disk.percent}%`),
                    h('small', null, `${clientBytes(disk.free)} ${t('可用')}`),
                  )),
                )
                : null,
              info.nic?.length
                ? h(
                  'div',
                  { className: 'nwt-mon-section' },
                  h('div', { className: 'nwt-mon-label' }, t('网卡')),
                  info.nic.map((nic) => h(
                    'div',
                    { key: nic.name, className: 'nwt-mon-row' },
                    h('span', { className: 'nwt-mon-row-name' }, nic.name),
                    h(
                      'span',
                      { className: 'nwt-mon-row-value' },
                      nic.rxBps !== null && nic.rxBps !== undefined
                        ? `↓ ${clientRate(nic.rxBps)} ↑ ${clientRate(nic.txBps ?? 0)}`
                        : nic.inUti !== null && nic.inUti !== undefined
                          ? `↓ ${nic.inUti}% ↑ ${nic.outUti ?? 0}%`
                          : '—',
                    ),
                  )),
                )
                : null,
            )
            : null,
          h('div', { className: 'nwt-mon-foot' }, paused ? t('已暂停') : t('每 5 秒刷新')),
        ]
      }

      const filesPanel = () => [
        h(
          'div',
          { className: 'nwt-files-bar' },
          h('input', {
            className: 'nwt-input nwt-input--mono',
            value: filesPath,
            spellCheck: false,
            placeholder: monitorInfo?.vendor === 'linux' ? '/var/log' : 'flash:',
            onChange: (event) => setFilesPath(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                loadFiles(filesPath)
              }
            },
          }),
          h(Btn, {
            variant: 'ghost',
            size: 'small',
            disabled: filesBusy || !files?.parent,
            onClick: () => loadFiles(files?.parent ?? ''),
            title: t('上一级'),
            ariaLabel: t('上一级'),
          }, '↑'),
          h(Btn, { variant: 'ghost', size: 'small', disabled: filesBusy, onClick: () => loadFiles(filesPath) }, '↻'),
        ),
        filesError ? h('div', { className: 'nwt-error' }, filesError) : null,
        !files && !filesError ? h('div', { className: 'nwt-term-empty' }, t('正在读取目录…')) : null,
        files
          ? h(
            'div',
            { className: 'nwt-files' },
            files.entries.map((entry) => h(
              'button',
              {
                key: entry.name,
                type: 'button',
                className: cn(
                  'nwt-file-row',
                  entry.type === 'dir' && 'nwt-file-row--dir',
                  pickedFile?.name === entry.name && 'nwt-file-row--active',
                ),
                title: entry.name,
                onClick: () => {
                  if (entry.type === 'dir') {
                    loadFiles(joinPath(files.path, entry.name))
                    return
                  }
                  setPickedFile(entry)
                  setFileInfo(null)
                  const id = monitorIdFor(activeKey)
                  if (!id) return
                  postJson({ op: 'term.files.info', id, path: joinPath(files.path, entry.name) })
                    .then((data) => setFileInfo(data.info))
                    .catch(() => { /* the list row already shows size and time */ })
                },
              },
              h('span', { className: 'nwt-file-icon' }, entry.type === 'dir' ? '▸' : '·'),
              h('span', { className: 'nwt-file-name' }, entry.name),
              h('small', null, entry.type === 'dir' ? '' : clientBytes(entry.size)),
            )),
          )
          : null,
        pickedFile
          ? h(
            'div',
            { className: 'nwt-file-detail' },
            h('div', { className: 'nwt-file-detail-name' }, pickedFile.name),
            h('small', null, `${clientBytes(pickedFile.size)} · ${pickedFile.mtime ?? ''}`),
            pickedFile.mode ? h('small', null, pickedFile.mode) : null,
            fileInfo?.kind ? h('small', null, fileInfo.kind) : null,
            fileInfo?.permission ? h('small', null, `${fileInfo.permission} · ${fileInfo.owner}:${fileInfo.group}`) : null,
          )
          : null,
        files?.total
          ? h('div', { className: 'nwt-mon-foot' }, `${t('总量')} ${clientBytes(files.total)} · ${t('可用')} ${clientBytes(files.free)}`)
          : null,
      ]

      const inspectorPanel = () => {
        if (!inspector) return null
        return h(
          'div',
          { className: 'nwt-term-inspector' },
          h(
            'div',
            { className: 'nwt-term-inspector-head' },
            h('span', null, inspector === 'monitor' ? t('系统监控') : t('文件浏览')),
            h('span', { className: 'nwt-term-spacer' }),
            h(Btn, {
              variant: 'ghost',
              size: 'small',
              onClick: () => openInspector(inspector),
              title: t('收起'),
              ariaLabel: t('收起'),
            }, '×'),
          ),
          monitorError ? h('div', { className: 'nwt-error' }, monitorError) : null,
          monitorError ? null : (inspector === 'monitor' ? monitorPanel() : filesPanel()),
        )
      }

      const approvalModal = () => {
        const approval = approvals[0]
        if (!approval) return null
        return h(
          'div',
          { className: 'nwt-term-modal', role: 'dialog', 'aria-label': t('DSH 请求执行危险命令') },
          h(
            'div',
            { className: 'nwt-term-form nwt-term-approval' },
            h('div', { className: 'nwt-term-form-title' }, t('DSH 请求执行危险命令')),
            h('pre', { className: 'nwt-term-approval-cmd' }, approval.line),
            h('div', { className: 'nwt-term-form-hint' }, t('只会执行这一次；拒绝后 DSH 不会重试。')),
            h(
              'div',
              { className: 'nwt-term-actions' },
              h(Btn, { variant: 'primary', onClick: () => answerApproval(approval, true) }, t('允许执行')),
              h(Btn, { variant: 'ghost', onClick: () => answerApproval(approval, false) }, t('拒绝')),
            ),
          ),
        )
      }

      return h(
        'div',
        { className: cn('nwt-term', !bookOpen && 'nwt-term--collapsed') },
        bookOpen ? h(
          'div',
          { className: 'nwt-term-side' },
          h('div', { className: 'nwt-term-side-head' },
            h('span', null, t('设备簿')),
            h('div', { className: 'nwt-term-side-actions' },
              h(Btn, { variant: 'ghost', size: 'small', onClick: startNew }, t('新建')),
              h(Btn, {
                variant: 'ghost',
                size: 'small',
                onClick: startEdit,
                disabled: !selected,
                title: selected ? t('编辑选中的设备') : t('先在列表里选中一台设备'),
              }, t('编辑')),
              h(Btn, {
                variant: 'ghost',
                size: 'small',
                onClick: () => setBookOpen(false),
                title: t('收起设备簿'),
                ariaLabel: t('收起设备簿'),
              }, '«'))),
          devices.length
            ? h(
              'div',
              { className: 'nwt-term-list' },
              groups.map((group) => {
                const isClosed = closedGroups.includes(group.id)
                return h(
                  'div',
                  { key: group.id, className: cn('nwt-term-group', isClosed && 'nwt-term-group--closed') },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'nwt-term-group-head',
                      onClick: () => toggleGroup(group.id),
                      'aria-expanded': !isClosed,
                      title: isClosed ? t('展开分组') : t('收起分组'),
                    },
                    h('span', { className: 'nwt-chev' }, h(Icon, { name: 'chevron', size: 11 })),
                    h('span', { className: 'nwt-term-group-name' }, group.label),
                    h('span', { className: 'nwt-term-group-count' }, String(group.devices.length)),
                  ),
                  isClosed ? null : group.devices.map((device) => h(
                    'button',
                    {
                      key: device.id,
                      type: 'button',
                      className: cn('nwt-term-item', selectedId === device.id && 'nwt-term-item--active'),
                      onClick: () => selectDevice(device.id),
                    },
                    h('b', null, device.name),
                    h('small', null, `${device.protocol} · ${device.host}:${device.port}`),
                  )),
                )
              }),
            )
            : h('div', { className: 'nwt-term-empty' }, t('还没有保存的设备')),
        ) : null,
        h(
          'div',
          { className: 'nwt-term-main' },
          h(
            'div',
            { className: 'nwt-term-bar' },
            bookOpen
              ? null
              : h(Btn, {
                variant: 'ghost',
                size: 'small',
                onClick: () => setBookOpen(true),
                title: t('展开设备簿'),
                ariaLabel: t('展开设备簿'),
              }, '»'),
            h('select', {
              className: 'nwt-select nwt-term-encoding',
              value: encoding,
              onChange: (event) => changeEncoding(event.target.value),
              'aria-label': t('编码'),
            },
              h('option', { value: 'utf-8' }, 'UTF-8'),
              h('option', { value: 'gbk' }, 'GBK')),
            h(Btn, {
              variant: 'ghost',
              size: 'small',
              onClick: () => openInspector('monitor'),
              disabled: activeTab?.status !== 'connected',
              title: activeTab?.status === 'connected' ? t('CPU / 内存 / 负载 / 磁盘 / 网卡') : t('先连接一台设备'),
            }, inspector === 'monitor' ? t('关闭监控') : t('监控')),
            h(Btn, {
              variant: 'ghost',
              size: 'small',
              onClick: () => openInspector('files'),
              disabled: activeTab?.status !== 'connected',
              title: activeTab?.status === 'connected' ? t('浏览设备上的文件') : t('先连接一台设备'),
            }, inspector === 'files' ? t('关闭文件') : t('文件')),
            activeTab?.status === 'connected'
              ? h(Btn, {
                variant: 'ghost',
                size: 'small',
                onClick: toggleShare,
                title: activeTab.shared
                  ? t('取消共享：DSH 将无法读取或操作这个会话')
                  : t('共享给 DSH：允许它读取当前屏幕并代你输入命令'),
              }, activeTab.shared ? t('取消共享') : t('共享给 DSH'))
              : null,
            activeTab?.status === 'connected'
              ? h(Btn, {
                variant: 'ghost',
                size: 'small',
                onClick: toggleFloat,
                title: floated
                  ? t('取消浮窗：切走后不再保留小窗')
                  : t('浮窗：切到工作区会话后，这个终端留在右上角继续显示'),
              }, floated ? t('取消浮窗') : t('浮窗'))
              : null,
            h('span', { className: 'nwt-term-spacer' }),
            activeTab?.agent === 'running'
              ? h('span', { className: 'nwt-term-agent', role: 'status' },
                h('span', { className: 'nwt-term-agent-dot', 'aria-hidden': true }),
                t('DSH 操作中'))
              : null,
            activeTab?.agent === 'running'
              ? h(Btn, { variant: 'ghost', size: 'small', onClick: takeBackControl }, t('收回控制'))
              : null,
            needsPassword && activeTab?.status !== 'connected'
              ? h('input', {
                className: 'nwt-input nwt-term-pass',
                type: 'password',
                value: password,
                placeholder: t('密码'),
                'aria-label': t('密码'),
                onChange: (event) => setPassword(event.target.value),
              })
              : null,
            activeTab?.status === 'connected'
              ? h(Btn, { variant: 'ghost', onClick: () => disconnectTab(activeTab.key) }, t('断开'))
              : null,
            selected
              ? h(Btn, {
                variant: 'primary',
                onClick: () => connectDevice(selected),
                disabled: !selected.host || connectingTarget,
                title: t('在新标签页中连接'),
              }, connectingTarget ? t('连接中…') : t('连接'))
              : null,
          ),
          tabs.length
            ? h(
              'div',
              { className: 'nwt-term-tabs', role: 'tablist' },
              tabs.map((tab) => h(
                'div',
                {
                  key: tab.key,
                  className: cn('nwt-term-tab', tab.key === activeKey && 'nwt-term-tab--active'),
                },
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'tab',
                    className: 'nwt-term-tab-btn',
                    'aria-selected': tab.key === activeKey,
                    title: `${tab.title} · ${sessionStatusLabel(tab.status)}`,
                    onClick: () => activateTab(tab.key),
                  },
                  h('span', { className: sessionDotClass(tab.status), 'aria-hidden': true }),
                  h('span', { className: 'nwt-term-tab-name' }, tab.title),
                  tab.shared ? h('span', { className: 'nwt-term-tab-share', title: t('已共享给 DSH') }, 'DSH') : null,
                ),
                h('button', {
                  type: 'button',
                  className: 'nwt-term-tab-x',
                  title: t('关闭标签页'),
                  'aria-label': t('关闭标签页'),
                  onClick: () => closeTab(tab.key),
                }, '×'),
              )),
            )
            : null,
          error ? h('div', { className: 'nwt-error' }, error) : null,
          notice ? h('div', { className: 'nwt-notice' }, notice) : null,
          activeTab?.error && !formMode ? h('div', { className: 'nwt-error' }, activeTab.error) : null,
          activeTab?.notice && !formMode ? h('div', { className: 'nwt-notice' }, activeTab.notice) : null,
          h(
            'div',
            { className: 'nwt-term-body', ref: hostRef },
            h('span', { className: 'nwt-term-probe', 'aria-hidden': true }, '0000000000'),
            formMode ? h(
              'div',
              { className: 'nwt-term-modal', role: 'dialog', 'aria-label': formMode === 'edit' ? t('编辑设备') : t('新建设备') },
              h(
                'div',
                { className: 'nwt-term-form' },
                h('div', { className: 'nwt-term-form-title' }, formMode === 'edit' ? t('编辑设备') : t('新建设备')),
                h(TermField, { label: t('名称') },
                  h('input', { className: 'nwt-input', value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: t('例如：核心交换机') })),
                h(TermField, { label: t('地址') },
                  h('input', { className: 'nwt-input', value: form.host, onChange: (event) => setForm({ ...form, host: event.target.value }), placeholder: '192.168.1.1' })),
                h(TermField, { label: t('端口') },
                  h('input', { className: 'nwt-input', type: 'number', value: form.port, onChange: (event) => setForm({ ...form, port: event.target.value }) })),
                h(TermField, { label: t('协议') },
                  h('select', {
                    className: 'nwt-select',
                    value: form.protocol,
                    onChange: (event) => setForm({ ...form, protocol: event.target.value, port: event.target.value === 'telnet' ? 23 : 22 }),
                  }, h('option', { value: 'ssh' }, 'SSH'), h('option', { value: 'telnet' }, 'Telnet'))),
                h(TermField, { label: t('用户名') },
                  h('input', { className: 'nwt-input', value: form.username, onChange: (event) => setForm({ ...form, username: event.target.value }) })),
                h(TermField, { label: t('认证方式') },
                  h('select', {
                    className: 'nwt-select',
                    value: form.authMode,
                    onChange: (event) => setForm({ ...form, authMode: event.target.value }),
                  }, AUTH_OPTIONS.map((option) => h('option', { key: option.value, value: option.value }, t(option.label))))),
                form.authMode === 'key'
                  ? h(TermField, { label: t('私钥路径') },
                    h('input', { className: 'nwt-input', value: form.keyPath, onChange: (event) => setForm({ ...form, keyPath: event.target.value }), placeholder: '%USERPROFILE%\\.ssh\\id_ed25519' }))
                  : null,
                form.authMode === 'prompt' || form.authMode === 'saved'
                  ? h(TermField, { label: form.authMode === 'saved' ? t('密码（保存到本机）') : t('密码（不保存）') },
                    h('input', { className: 'nwt-input', type: 'password', value: form.password, onChange: (event) => setForm({ ...form, password: event.target.value }) }))
                  : null,
                h(TermField, { label: t('分组'), wide: true },
                  h('input', {
                    className: 'nwt-input',
                    value: form.group,
                    list: 'nwtool-group-options',
                    placeholder: t(DEFAULT_GROUP),
                    onChange: (event) => setForm({ ...form, group: event.target.value }),
                  }),
                  h('small', { className: 'nwt-term-form-hint' }, t('输入新名称即可创建分组'))),
                h('datalist', { id: 'nwtool-group-options' },
                  groups.map((group) => h('option', { key: group.id, value: group.label }))),
                h('div', { className: 'nwt-term-actions' },
                  h(Btn, { onClick: save, variant: 'primary' }, formMode === 'edit' ? t('更新设备') : t('保存设备')),
                  h(Btn, { variant: 'ghost', onClick: cancelForm }, t('取消')),
                  formMode === 'edit' ? h(Btn, { variant: 'ghost', onClick: () => remove(form) }, t('删除')) : null),
              ),
            ) : activeTab ? h(
              'div',
              { className: 'nwt-term-stage' },
              h(
                'div',
                {
                  ref: screenRef,
                  className: cn('nwt-term-screen', activeTab.status !== 'connected' && 'nwt-term-screen--idle'),
                  onClick: focusScreen,
                  onScroll: scrollScreen,
                },
                h(
                  'div',
                  { className: 'nwt-term-grid' },
                  topRow > 0
                    ? h('div', { key: 'gap-above', className: 'nwt-term-gap', style: { height: `${topRow * TERM_LINE_HEIGHT}px` } })
                    : null,
                  windowRows.map((runs, index) => h(
                    'div',
                    { key: topRow + index, className: 'nwt-term-row' },
                    runs.length
                      ? runs.map((run, runIndex) => h('span', { key: runIndex, style: run.style }, run.text))
                      : '\u00a0',
                  )),
                  rowsBelow > 0
                    ? h('div', { key: 'gap-below', className: 'nwt-term-gap', style: { height: `${rowsBelow * TERM_LINE_HEIGHT}px` } })
                    : null,
                ),
              ),
              activeTab.status === 'connected' ? null : h(
                'div',
                { className: 'nwt-term-banner' },
                h('span', null, idleLabel(activeTab.status)),
                activeTab.error ? h('small', null, activeTab.error) : null,
                h(Btn, {
                  variant: 'ghost',
                  size: 'small',
                  onClick: () => reconnect(activeTab.key),
                }, t('重新连接')),
              ),
              canScroll && !scrollSticky
                ? h('button', {
                  type: 'button',
                  className: 'nwt-term-jump',
                  title: t('回到底部'),
                  onClick: jumpToNewest,
                }, t('回到底部'))
                : null,
              activeTab.status === 'connected' ? h('textarea', {
                ref: inputRef,
                className: 'nwt-term-input',
                spellCheck: false,
                autoComplete: 'off',
                readOnly: activeTab.agent === 'running',
                onKeyDown: termInput.onKeyDown,
                onInput: termInput.onInput,
                onPaste: termInput.onPaste,
                'aria-label': t('终端输入'),
              }) : null,
            ) : h(
              'div',
              { className: 'nwt-term-hint' },
              h(Icon, { name: 'network', size: 26 }),
              selected
                ? h('div', { className: 'nwt-term-info' },
                  h('b', null, selected.name),
                  h('span', null, `${selected.protocol.toUpperCase()} · ${selected.username ? `${selected.username}@` : ''}${selected.host}:${selected.port}`),
                  h('span', null, t(AUTH_OPTIONS.find((option) => option.value === selected.authMode)?.label ?? '每次输入密码')))
                : h('span', null, t('选择左侧设备，或点「新建」添加一个'))),
          ),
          approvals.length ? approvalModal() : null,
        ),
        inspectorPanel(),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Shared-terminal status strip                                        */
    /* ------------------------------------------------------------------ */

    /* The workspace session view has no other place to say that device consoles
       are still shared with DSH. The trigger sits in the composer footer; the
       list itself renders in the frame-wide overlay slot, because the composer
       creates a containing block and would clip an absolutely positioned menu. */
    const shareStore = { open: false, trigger: null, sessions: [], listeners: new Set() }

    function notifyShareStore() {
      for (const listener of shareStore.listeners) {
        try {
          listener()
        } catch {
          /* a dead component */
        }
      }
    }

    function refreshSharedSessions() {
      return postJson({ op: 'term.list' })
        .then((data) => {
          shareStore.sessions = (Array.isArray(data?.sessions) ? data.sessions : []).filter((item) => item?.shared)
          if (!shareStore.sessions.length) shareStore.open = false
          notifyShareStore()
        })
        .catch(() => {
          shareStore.sessions = []
          shareStore.open = false
          notifyShareStore()
        })
    }

    function useShareStore() {
      const [, bump] = useState(0)
      useEffect(() => {
        const listener = () => bump((value) => value + 1)
        shareStore.listeners.add(listener)
        return () => shareStore.listeners.delete(listener)
      }, [])
      return shareStore
    }

    function openTerminalPanel() {
      writeLastTool('terminal')
      try {
        const layout = hostContext?.get?.('layout') ?? hostContext?.layout
        layout?.selectPanel?.(PANEL_ID)
      } catch {
        /* the layout service is optional */
      }
    }

    /** Compact trigger in the composer footer: who is shared, and a way in. */
    function SharedDock() {
      const store = useShareStore()

      useEffect(() => {
        refreshSharedSessions()
        const timer = setInterval(refreshSharedSessions, 5000)
        return () => clearInterval(timer)
      }, [])

      const sessions = store.sessions
      if (!sessions.length) return null
      const running = sessions.find((item) => item.agent === 'running') ?? null

      return h(
        'button',
        {
          type: 'button',
          className: cn('nwt-share-trigger', store.open && 'nwt-share-trigger--open'),
          'aria-haspopup': 'menu',
          'aria-expanded': store.open,
          title: t('查看共享给 DSH 的终端'),
          onClick: (event) => {
            shareStore.trigger = event.currentTarget
            shareStore.open = !shareStore.open
            refreshSharedSessions()
            notifyShareStore()
          },
        },
        running ? h('span', { className: 'nwt-share-trigger-dot', 'aria-hidden': true }) : null,
        h('span', { className: 'nwt-share-trigger-text' },
          running
            ? t('正在操作 ${name}', { name: running.name })
            : t('已共享 ${count} 个终端：${names}', {
              count: sessions.length,
              names: sessions.map((item) => item.name).join(' / '),
            })),
        h('span', { className: 'nwt-share-trigger-caret', 'aria-hidden': true }, '▾'),
      )
    }

    /** The list in the overlay: rows like the built-in context menu, plus actions. */
    function SharedMenu() {
      const store = useShareStore()
      const open = store.open && Boolean(store.trigger)

      useEffect(() => {
        if (!open) return undefined
        const closeOn = () => {
          shareStore.open = false
          notifyShareStore()
        }
        const onKey = (event) => {
          if (event?.key === 'Escape') closeOn()
        }
        document.addEventListener?.('keydown', onKey)
        window.addEventListener?.('resize', closeOn)
        return () => {
          document.removeEventListener?.('keydown', onKey)
          window.removeEventListener?.('resize', closeOn)
        }
      }, [open])

      if (!open) return null

      const rect = store.trigger.getBoundingClientRect?.() ?? { left: 0, top: 0, bottom: 0 }
      const width = 288
      const left = Math.max(8, Math.min(rect.left, (window.innerWidth || 1024) - width - 8))
      const bottom = Math.max(8, (window.innerHeight || 768) - rect.top + 6)

      const close = () => {
        shareStore.open = false
        notifyShareStore()
      }

      const revoke = () => {
        Promise.all(store.sessions.map((item) => postJson({ op: 'term.share', id: item.id, shared: false }).catch(() => null)))
          .then(() => {
            close()
            refreshSharedSessions()
          })
      }

      return h(
        'div',
        { className: 'nwt-share-backdrop', onClick: close },
        h(
          'div',
          {
            className: 'nwt-share-menu',
            role: 'menu',
            style: { left: `${left}px`, bottom: `${bottom}px`, width: `${width}px` },
            onClick: (event) => event.stopPropagation(),
          },
          h(
            'div',
            { className: 'nwt-share-menu-head' },
            h('span', { className: 'nwt-share-menu-title' }, t('共享给 DSH')),
            h('span', { className: 'nwt-share-menu-count' }, t('${count} 个终端', { count: store.sessions.length })),
          ),
          h(
            'div',
            { className: 'nwt-share-menu-list' },
            store.sessions.map((item) => h(
              'div',
              { key: item.id, className: 'nwt-share-row', role: 'menuitem' },
              h('span', {
                className: cn('nwt-share-row-dot', item.agent === 'running' && 'nwt-share-row-dot--busy'),
                'aria-hidden': true,
              }),
              h('span', { className: 'nwt-share-row-name' }, item.name),
              h('span', { className: 'nwt-share-row-host' }, item.host),
            )),
          ),
          h(
            'div',
            { className: 'nwt-share-menu-foot' },
            h('button', { type: 'button', className: 'nwt-share-action', onClick: () => { close(); openTerminalPanel() } }, t('打开终端')),
            h('button', {
              type: 'button',
              className: 'nwt-share-action nwt-share-action--danger',
              onClick: revoke,
            }, store.sessions.length > 1 ? t('全部取消共享') : t('取消共享')),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Floating terminal                                                   */
    /* ------------------------------------------------------------------ */

    /*
     * A terminal that stays in view while the main slot shows a conversation.
     * The panel owns the only stream while it is mounted; the moment it goes
     * away the float attaches to the same Host session (a second `term.attach`,
     * replayed from the Host buffer), so the device never notices the switch.
     * The pin is persisted: reloading the page inside a conversation brings the
     * window back instead of losing the device.
     */

    const FLOAT_KEY = 'nwtool.float.v1'
    const FLOAT_WIDTH = 440
    const FLOAT_HEIGHT = 300
    const FLOAT_LINE_HEIGHT = 16

    const floatStore = {
      enabled: false,
      /* TermPane is mounted: the panel owns the stream, the float stays away. */
      panelMounted: false,
      target: null,
      box: null,
      listeners: new Set(),
    }

    function notifyFloatStore() {
      for (const listener of floatStore.listeners) {
        try {
          listener()
        } catch {
          /* a dead component */
        }
      }
    }

    /** Keep the window on screen and usable after a resize or a restored position. */
    function clampFloatBox(box) {
      const raw = box && typeof box === 'object' ? box : {}
      const viewWidth = (typeof window !== 'undefined' && Number(window.innerWidth)) || 1280
      const viewHeight = (typeof window !== 'undefined' && Number(window.innerHeight)) || 800
      const width = Math.min(Math.max(280, Number(raw.w) || FLOAT_WIDTH), Math.max(280, viewWidth - 16))
      const height = Math.min(Math.max(150, Number(raw.h) || FLOAT_HEIGHT), Math.max(150, viewHeight - 16))
      const x = Number.isFinite(Number(raw.x)) ? Number(raw.x) : viewWidth - width - 16
      const y = Number.isFinite(Number(raw.y)) ? Number(raw.y) : 56
      return {
        x: Math.round(Math.min(Math.max(8, x), Math.max(8, viewWidth - width - 8))),
        y: Math.round(Math.min(Math.max(8, y), Math.max(8, viewHeight - height - 8))),
        w: Math.round(width),
        h: Math.round(height),
      }
    }

    function readStoredFloat() {
      try {
        const raw = window.localStorage.getItem(FLOAT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const target = parsed?.target?.id
          ? {
            id: String(parsed.target.id),
            title: String(parsed.target.title ?? ''),
            host: String(parsed.target.host ?? ''),
            port: Number(parsed.target.port) || 0,
            encoding: parsed.target.encoding === 'gbk' ? 'gbk' : 'utf-8',
          }
          : null
        if (!target) return null
        return { enabled: Boolean(parsed.enabled), target, box: clampFloatBox(parsed.box) }
      } catch {
        return null
      }
    }

    function writeStoredFloat() {
      try {
        window.localStorage.setItem(FLOAT_KEY, JSON.stringify({
          enabled: floatStore.enabled,
          target: floatStore.target,
          box: floatStore.box,
        }))
      } catch {
        /* storage may be unavailable; the float still works for this visit */
      }
    }

    /** The panel tells the store whether it is on screen, so only one view runs. */
    function setFloatMounted(value) {
      const next = Boolean(value)
      if (floatStore.panelMounted === next) return
      floatStore.panelMounted = next
      notifyFloatStore()
    }

    /** Pin one session to the floating window; no target means "unpin". */
    function setFloatTarget(target) {
      if (!target?.id) {
        floatStore.enabled = false
        floatStore.target = null
      } else {
        floatStore.enabled = true
        floatStore.target = {
          id: String(target.id),
          title: String(target.title ?? ''),
          host: String(target.host ?? ''),
          port: Number(target.port) || 0,
          /* The panel decodes GBK consoles; the float must agree or it would
             show mojibake for the same session. */
          encoding: target.encoding === 'gbk' ? 'gbk' : 'utf-8',
        }
        if (!floatStore.box) floatStore.box = clampFloatBox(null)
      }
      writeStoredFloat()
      notifyFloatStore()
    }

    function clearFloat() {
      if (!floatStore.enabled && !floatStore.target) return
      floatStore.enabled = false
      floatStore.target = null
      writeStoredFloat()
      notifyFloatStore()
    }

    /** The session a tab would unpin: used by the close/exit paths. */
    function forgetFloatSession(sessionId) {
      if (sessionId && floatStore.target?.id === String(sessionId)) clearFloat()
    }

    function useFloatStore() {
      const [, bump] = useState(0)
      useEffect(() => {
        const listener = () => bump((value) => value + 1)
        floatStore.listeners.add(listener)
        return () => floatStore.listeners.delete(listener)
      }, [])
      return floatStore
    }

    /* A pin from the previous visit survives a reload. */
    {
      const storedFloat = readStoredFloat()
      if (storedFloat) {
        floatStore.enabled = storedFloat.enabled
        floatStore.target = storedFloat.target
        floatStore.box = storedFloat.box
      }
    }

    /** The overlay window: a second view of one Host session. */
    function FloatWindow() {
      const store = useFloatStore()
      useLanguage()
      const target = store.target
      const active = Boolean(store.enabled && target?.id) && !store.panelMounted
      const [status, setStatus] = useState('connecting')
      const [ended, setEnded] = useState('')
      const [approval, setApproval] = useState(null)
      const [agent, setAgent] = useState('idle')
      const [shared, setShared] = useState(false)
      const [shareError, setShareError] = useState('')
      const [, repaint] = useState(0)
      const runtimeRef = useRef(null)
      const boxRef = useRef(null)
      const screenElRef = useRef(null)
      const inputRef = useRef(null)
      const bump = () => repaint((value) => value + 1)

      const sendBytes = (payload) => {
        const id = runtimeRef.current?.sessionId
        if (!id) return
        const bytes = new TextEncoder().encode(payload)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        postJson({ op: 'term.input', id, data: btoa(binary) }).catch(() => {})
      }

      const termInput = termInputHandlers(sendBytes, () => status !== 'connected' || agent === 'running')

      /* The grid has to match the window: measure it the same way the panel does. */
      const measure = () => {
        const element = boxRef.current
        const probe = element?.querySelector?.('.nwt-float-probe')
        const charWidth = (probe ? probe.getBoundingClientRect().width / 10 : 0) || 7.2
        const surface = element?.querySelector?.('.nwt-float-screen')
        const width = surface?.clientWidth || element?.clientWidth || 420
        const height = surface?.clientHeight || element?.clientHeight || 260
        return {
          cols: Math.max(24, Math.min(200, Math.floor((width - 12) / charWidth))),
          rows: Math.max(4, Math.min(80, Math.floor((height - 12) / FLOAT_LINE_HEIGHT))),
        }
      }

      /* One stream per pin: `since: 0` replays what the panel already saw. */
      useEffect(() => {
        if (!active || !target?.id) return undefined
        const size = measure()
        const runtime = {
          screen: createScreen(size.cols, size.rows),
          decoder: new TextDecoder(target.encoding === 'gbk' ? 'gbk' : 'utf-8'),
          controller: new AbortController(),
          sessionId: target.id,
          opened: false,
        }
        runtimeRef.current = runtime
        setStatus('connecting')
        setEnded('')
        setApproval(null)
        setAgent('idle')
        bump()
        streamEvents({
          op: 'term.attach',
          id: target.id,
          cols: size.cols,
          rows: size.rows,
          since: 0,
        }, (event) => {
          if (event.t === 'ready') {
            runtime.opened = true
            runtime.sessionId = String(event.d?.sessionId ?? target.id)
            setStatus('connected')
            /* The window may be the only view of this session: start from the
               host's answer instead of waiting for the next share/agent event. */
            setShared(Boolean(event.d?.shared))
            setAgent(event.d?.agent === 'running' ? 'running' : 'idle')
            bump()
            return
          }
          if (event.t === 'data') {
            const raw = atob(String(event.d ?? ''))
            const bytes = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
            runtime.screen.write(runtime.decoder.decode(bytes, { stream: true }))
            bump()
            return
          }
          if (event.t === 'share') {
            setShared(Boolean(event.d?.shared))
            return
          }
          if (event.t === 'agent') {
            setAgent(event.d?.state === 'running' ? 'running' : 'idle')
            return
          }
          if (event.t === 'approval') {
            setApproval({ id: String(event.d?.id ?? ''), line: String(event.d?.line ?? '') })
            return
          }
          if (event.t === 'approval-done') {
            const done = String(event.d?.id ?? '')
            setApproval((prev) => (prev && prev.id === done ? null : prev))
            return
          }
          if (event.t === 'error') {
            runtime.sessionId = ''
            runtime.opened = false
            setStatus('failed')
            setEnded(String(event.d ?? ''))
            return
          }
          if (event.t === 'exit') {
            runtime.sessionId = ''
            setStatus('ended')
            setEnded(t('会话已结束（${reason}）', { reason: exitReason(event.d) }))
          }
        }, runtime.controller.signal).catch((problem) => {
          if (runtime.controller.signal.aborted) return
          setStatus('failed')
          setEnded(String(problem?.message ?? problem) || t('终端连接失败'))
        })
        return () => {
          try { runtime.controller.abort() } catch { /* already gone */ }
          if (runtimeRef.current === runtime) runtimeRef.current = null
        }
      }, [active, target?.id, target?.encoding])

      /* Dragging the corner changes the box; the grid follows on the next frame.
         The canvas (not the window) is observed so an approval bar shrinking the
         terminal also shrinks the grid. */
      useEffect(() => {
        if (!active || typeof ResizeObserver !== 'function') return undefined
        const element = boxRef.current
        const surface = element?.querySelector?.('.nwt-float-screen')
        if (!element || !surface) return undefined
        let scheduled = false
        const fit = () => {
          scheduled = false
          const runtime = runtimeRef.current
          if (!runtime) return
          const rect = element.getBoundingClientRect?.()
          if (rect && (Math.abs(rect.width - (floatStore.box?.w ?? 0)) > 2 || Math.abs(rect.height - (floatStore.box?.h ?? 0)) > 2)) {
            floatStore.box = clampFloatBox({ ...floatStore.box, w: rect.width, h: rect.height })
            writeStoredFloat()
          }
          const size = measure()
          if (!runtime.screen.resize(size.cols, size.rows)) return
          if (runtime.sessionId) {
            postJson({ op: 'term.resize', id: runtime.sessionId, cols: size.cols, rows: size.rows }).catch(() => {})
          }
          bump()
        }
        const observer = new ResizeObserver(() => {
          if (scheduled) return
          scheduled = true
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fit)
          else fit()
        })
        observer.observe(surface)
        return () => observer.disconnect()
      }, [active])

      /* Copying a selection works even when the hidden keyboard sink has focus. */
      useEffect(() => {
        if (!active || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
        const onCopyKey = (event) => {
          if (!(event.ctrlKey || event.metaKey) || String(event.key ?? '').toLowerCase() !== 'c') return
          const selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
          const text = String(selection ?? '')
          if (!text) return
          if (!screenElRef.current?.contains?.(selection?.anchorNode ?? null)) return
          event.preventDefault()
          event.stopPropagation()
          writeClipboard(text)
        }
        document.addEventListener('keydown', onCopyKey, true)
        return () => document.removeEventListener('keydown', onCopyKey, true)
      }, [active])

      const box = clampFloatBox(store.box)
      const onHeadDown = (event) => {
        if (event?.button !== 0 || event?.target?.closest?.('button')) return
        const element = boxRef.current
        if (!element || typeof document?.addEventListener !== 'function') return
        const rect = element.getBoundingClientRect?.() ?? { left: box.x, top: box.y }
        const offsetX = (event.clientX ?? 0) - rect.left
        const offsetY = (event.clientY ?? 0) - rect.top
        const move = (moveEvent) => {
          floatStore.box = clampFloatBox({
            ...floatStore.box,
            x: (moveEvent.clientX ?? 0) - offsetX,
            y: (moveEvent.clientY ?? 0) - offsetY,
          })
          notifyFloatStore()
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
          writeStoredFloat()
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
        event.preventDefault?.()
      }

      const focusScreen = () => {
        const picked = typeof window !== 'undefined' && window.getSelection ? String(window.getSelection() ?? '') : ''
        if (picked) return
        inputRef.current?.focus?.()
      }

      const answerApproval = (entry, allow) => {
        setApproval(null)
        const id = runtimeRef.current?.sessionId
        if (!id) return
        postJson({ op: 'term.approve', id, approvalId: entry.id, allow }).catch(() => {})
      }

      /* Sharing is the one setting worth reaching without leaving the window:
         a person should not have to go back to the panel to let DSH in. */
      const toggleShare = () => {
        const id = runtimeRef.current?.sessionId
        if (!id) return
        const next = !shared
        postJson({ op: 'term.share', id, shared: next })
          .then((data) => {
            setShared(typeof data?.shared === 'boolean' ? data.shared : next)
            setShareError('')
          })
          .catch((problem) => setShareError(String(problem?.message ?? problem) || t('共享设置失败')))
      }

      useEffect(() => {
        if (!shareError) return undefined
        const timer = setTimeout(() => setShareError(''), 4000)
        return () => clearTimeout(timer)
      }, [shareError])

      /* Only one view of a session at a time: the panel takes it back on mount. */
      if (!active) return null

      const runtime = runtimeRef.current
      const rows = runtime ? screenRows(runtime.screen) : []
      const title = target?.title || target?.host || t('终端')
      const canType = status === 'connected' && agent !== 'running'

      return h(
        'div',
        {
          ref: boxRef,
          className: 'nwt-float',
          style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` },
          role: 'dialog',
          'aria-label': t('浮窗终端'),
        },
        h(
          'div',
          { className: 'nwt-float-head', onMouseDown: onHeadDown },
          h('span', { className: sessionDotClass(status), 'aria-hidden': true }),
          h('span', { className: 'nwt-float-name', title }, title),
          target?.host
            ? h('span', { className: 'nwt-float-host' }, `${target.host}${target.port ? `:${target.port}` : ''}`)
            : null,
          agent === 'running' ? h('span', { className: 'nwt-float-activity' }, t('DSH 操作中')) : null,
          h('span', { className: 'nwt-float-spacer' }),
          status === 'connected'
            ? h('button', {
              type: 'button',
              className: 'nwt-float-btn',
              title: shared
                ? t('取消共享：DSH 将无法读取或操作这个会话')
                : t('共享给 DSH：允许它读取当前屏幕并代你输入命令'),
              onClick: toggleShare,
            }, shared ? t('取消共享') : t('共享给 DSH'))
            : null,
          h('button', {
            type: 'button',
            className: 'nwt-float-btn',
            title: t('回到工具箱面板'),
            onClick: () => openTerminalPanel(),
          }, t('面板')),
          h('button', {
            type: 'button',
            className: 'nwt-float-btn',
            title: t('取消浮窗'),
            'aria-label': t('取消浮窗'),
            onClick: () => clearFloat(),
          }, '×'),
        ),
        h(
          'div',
          { className: 'nwt-float-body' },
          h('span', { className: 'nwt-float-probe', 'aria-hidden': true }, '0000000000'),
          h(
            'div',
            { ref: screenElRef, className: 'nwt-float-screen', onClick: focusScreen },
            h(
              'div',
              { className: 'nwt-float-grid' },
              rows.map((runs, index) => h(
                'div',
                { key: index, className: 'nwt-float-row' },
                runs.length
                  ? runs.map((run, runIndex) => h('span', { key: runIndex, style: run.style }, run.text))
                  : '\u00a0',
              )),
            ),
          ),
          canType ? h('textarea', {
            ref: inputRef,
            className: 'nwt-float-input',
            spellCheck: false,
            autoComplete: 'off',
            onKeyDown: termInput.onKeyDown,
            onInput: termInput.onInput,
            onPaste: termInput.onPaste,
            'aria-label': t('终端输入'),
          }) : null,
        ),
        approval
          ? h(
            'div',
            { className: 'nwt-float-approval', role: 'alertdialog', 'aria-label': t('DSH 请求执行危险命令') },
            h('div', { className: 'nwt-float-approval-title' }, t('DSH 请求执行危险命令')),
            h('pre', { className: 'nwt-float-approval-cmd' }, approval.line),
            h(
              'div',
              { className: 'nwt-float-actions' },
              h('button', {
                type: 'button',
                className: 'nwt-float-action nwt-float-action--primary',
                onClick: () => answerApproval(approval, true),
              }, t('允许执行')),
              h('button', {
                type: 'button',
                className: 'nwt-float-action',
                onClick: () => answerApproval(approval, false),
              }, t('拒绝')),
            ),
          )
          : null,
        shareError
          ? h(
            'div',
            { className: 'nwt-float-note nwt-float-note--error', role: 'status' },
            h('span', { className: 'nwt-float-note-text' }, shareError),
          )
          : null,
        status === 'connected'
          ? null
          : h(
            'div',
            { className: 'nwt-float-note' },
            h('span', { className: 'nwt-float-note-text' },
              status === 'connecting' ? t('连接中…') : (ended || t('会话已结束'))),
            status === 'connecting'
              ? null
              : h('button', {
                type: 'button',
                className: 'nwt-float-action',
                onClick: () => {
                  clearFloat()
                  openTerminalPanel()
                },
              }, t('回面板')),
          ),
      )
    }

    function ToolboxPage(props) {
      const [active, setActive] = useState(() => (props?.initialTool ? props.initialTool : (readLastTool() || 'ping')))
      const [collapsed, setCollapsed] = useState(readCollapsed)
      /* Set by the topology pane: switch to the terminal and select a device. */
      const [focusDevice, setFocusDevice] = useState(null)
      const [aboutOpen, setAboutOpen] = useState(false)
      useLanguage()
      const product = t('网络运维工具箱')
      const tagline = t('Datacom · 探测 · 诊断')
      const openSession = props?.onOpenSession
      const tool = toolMeta(active)
      useEffect(() => { writeLastTool(active) }, [active])

      /* Escape closes the guide, the same key that closes every other sheet. */
      useEffect(() => {
        if (!aboutOpen || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
        const onKey = (event) => {
          if (event?.key === 'Escape') setAboutOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [aboutOpen])

      const openDeviceInTerminal = (deviceId) => {
        setFocusDevice({ id: deviceId, nonce: Date.now() })
        setActive('terminal')
      }

      const toggleGroup = (id) => {
        setCollapsed((prev) => {
          const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
          writeCollapsed(next)
          return next
        })
      }

      /* The guide is generated from the same tables the panel renders, so a new
         tool cannot be added without showing up here. */
      const openTool = (id) => {
        setActive(id)
        setAboutOpen(false)
      }

      const aboutSections = () => {
        const sections = []
        sections.push(h(
          'p',
          { key: 'lead', className: 'nwt-about-lead' },
          t('这是装在 DeepSeek Harness 里的网络运维工作台：${tools} 个网络与 Datacom 工具收在一个面板里，同一套能力又注册成 ${agents} 个 Agent 工具，DSH 可以直接调用。', {
            tools: TOOL_COUNT,
            agents: AGENT_TOOLS.length,
          }),
        ))
        sections.push(h(
          'ul',
          { key: 'points', className: 'nwt-about-list' },
          ABOUT_POINTS.map((line, index) => h('li', { key: index }, t(line))),
        ))
        sections.push(h('div', { key: 'tools-h', className: 'nwt-about-h' }, t('工具怎么用')))
        for (const group of GROUPS) {
          sections.push(h(
            'div',
            { key: `group-${group.id}`, className: 'nwt-about-group' },
            h('div', { className: 'nwt-about-h' }, t(group.title)),
            group.tools.map((id) => h(
              'button',
              {
                key: id,
                type: 'button',
                className: 'nwt-about-row nwt-about-row--tool',
                title: t('打开这个工具'),
                onClick: () => openTool(id),
              },
              h('span', { className: 'nwt-about-name' }, t(toolMeta(id).title)),
              h('span', { className: 'nwt-about-text' }, t(TOOL_NOTES[id] ?? toolMeta(id).desc)),
            )),
          ))
        }
        sections.push(h('div', { key: 'agents-h', className: 'nwt-about-h' }, t('Agent 工具')))
        sections.push(h(
          'p',
          { key: 'agents-sub', className: 'nwt-about-sub' },
          t('下面这些工具注册给模型，可以直接在对话里让它调用，也可以写进提示词让它自己挑。描述里的「只读」表示不会改动设备或本机状态。'),
        ))
        for (const entry of AGENT_TOOLS) {
          sections.push(h(
            'div',
            { key: entry.name, className: 'nwt-about-row nwt-about-row--agent' },
            h('code', { className: 'nwt-about-code' }, entry.name),
            h('span', { className: 'nwt-about-text' }, t(entry.note)),
          ))
        }
        return sections
      }

      return h(
        'div',
        { className: 'nwt-root' },
        h('div', { className: 'nwt-aura', 'aria-hidden': true }, h('span'), h('span'), h('span')),
        h(
          'nav',
          { className: 'nwt-nav' },
          h(
            'div',
            { className: 'nwt-nav-scroll' },
            h('div', { className: 'nwt-nav-head' }, product, h('small', null, tagline)),
            GROUPS.map((group) => {
              const isClosed = collapsed.includes(group.id)
              return h(
                'div',
                { key: group.id, className: cn('nwt-group', isClosed && 'nwt-group--closed') },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'nwt-group-btn',
                    onClick: () => toggleGroup(group.id),
                    'aria-expanded': !isClosed,
                  },
                  h('span', { className: 'nwt-chev' }, h(Icon, { name: 'chevron', size: 12 })),
                  h('span', null, t(group.title)),
                  h('span', { className: 'nwt-count' }, String(group.tools.length)),
                ),
                h(
                  'div',
                  { className: 'nwt-group-body' },
                  h(
                    'div',
                    { className: 'nwt-group-inner' },
                    group.tools.map((id) => h(
                      'button',
                      {
                        key: id,
                        type: 'button',
                        className: cn('nwt-item', active === id && 'nwt-item--active'),
                        'aria-current': active === id ? 'page' : undefined,
                        onClick: () => setActive(id),
                      },
                      t(toolMeta(id).title),
                    )),
                  ),
                ),
              )
            }),
          ),
          h(
            'div',
            { className: 'nwt-nav-foot' },
            h('span', { className: 'nwt-nav-foot-name' }, PRODUCT),
            h('span', { className: 'nwt-nav-foot-version' }, `v${VERSION}`),
            h('button', {
              type: 'button',
              className: 'nwt-nav-about',
              title: t('关于与使用说明'),
              'aria-haspopup': 'dialog',
              'aria-expanded': aboutOpen,
              onClick: () => setAboutOpen(true),
            }, t('说明')),
          ),
        ),
        h(
          'section',
          { className: 'nwt-main' },
          h(
            'header',
            { className: 'nwt-head' },
            h('div', { className: 'nwt-crumb' },
              h('b', null, product),
              h('span', null, '/'),
              h('span', null, t(groupOf(active)))),
            h('h1', { className: 'nwt-title' }, t(tool.title)),
            h('div', { className: 'nwt-desc' }, t(tool.desc)),
          ),
          h(
            'div',
            { className: 'nwt-body' },
            h(
              'div',
              { key: active, className: 'nwt-pane', style: active === 'terminal' ? { display: 'none' } : undefined },
              active === 'terminal'
                ? null
                : active === 'ipcalc'
                  ? h(IpCalcPane)
                  : active === 'bitcalc'
                    ? h(BitCalcPane)
                    : active === 'sizeconv'
                      ? h(SizeConvPane)
                      : active === 'timeconv'
                        ? h(TimeConvPane)
                        : active === 'cheatsheet'
                          ? h(CheatSheetPane)
                          : active === 'backups'
                            ? h(BackupsPane)
                            : active === 'configdiff'
                              ? h(DiffPane)
                              : active === 'aidoc'
                                ? h(AiDocPane, { onOpenSession: openSession })
                                : active === 'wol'
                                  ? h(WolPane)
                                  : active === 'arp'
                                    ? h(ArpPane)
                                    : active === 'diagram'
                                      ? h(TopoPane, { onFocusDevice: openDeviceInTerminal })
                                      : h(HostToolPane, { toolId: active }),
            ),
            /* The terminal stays mounted while another tool is open: its tabs,
               their scrollback and their transport streams must survive, and a
               session ends only when its own tab is closed. */
            h(
              'div',
              { className: 'nwt-pane', style: active === 'terminal' ? undefined : { display: 'none' } },
              h(TermPane, {
                visible: active === 'terminal',
                focus: focusDevice,
                onAttention: () => setActive('terminal'),
              }),
            ),
            TOOL_NOTES[active]
              ? h('div', { className: 'nwt-foot' }, t(TOOL_NOTES[active]))
              : null,
          ),
        ),
        aboutOpen
          ? h(
            'div',
            {
              className: 'nwt-about',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('关于与使用说明'),
              onClick: () => setAboutOpen(false),
            },
            h(
              'div',
              { className: 'nwt-about-sheet', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'nwt-about-head' },
                h('span', { className: 'nwt-about-title' }, t('关于与使用说明')),
                h('span', { className: 'nwt-about-version' }, `v${VERSION}`),
                h('span', { className: 'nwt-about-spacer' }),
                h(Btn, {
                  variant: 'ghost',
                  size: 'small',
                  onClick: () => setAboutOpen(false),
                  title: t('关闭'),
                  ariaLabel: t('关闭'),
                }, '×'),
              ),
              h('div', { className: 'nwt-about-body' }, aboutSections()),
            ),
          )
          : null,
      )
    }

    /* ------------------------------------------------------------ */
    /* Render guard                                                  */
    /* ------------------------------------------------------------ */

    /** Keeps a rendering bug inside the panel instead of blanking the slot. */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            { style: { padding: 16 } },
            h('div', { style: { fontWeight: 600, marginBottom: 6 } }, t('网络运维工具箱渲染失败')),
            h('pre', { className: 'nwt-pre', style: { marginBottom: 0 } },
              String(this.state.error?.stack ?? this.state.error)),
          )
        }
        return this.props.children
      }
    }

    /* ------------------------------------------------------------ */
    /* Sidebar icon                                                  */
    /* ------------------------------------------------------------ */

    function PanelIcon({ size = 18, active = false }) {
      const edge = Number(size) || 18
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          'aria-hidden': true,
          style: {
            display: 'block',
            opacity: active ? 1 : 0.82,
            transition: 'opacity .2s ease, transform .2s ease',
            transform: active ? 'scale(1.06)' : 'none',
          },
        },
        h('g', { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', fill: 'none', opacity: 0.6 },
          h('path', { d: 'M6.5 6.5 L12 12 L17.5 6.5' }),
          h('path', { d: 'M6.5 17.5 L12 12 L17.5 17.5' }),
          h('path', { d: 'M6.5 6.5 L6.5 17.5' }),
          h('path', { d: 'M17.5 6.5 L17.5 17.5' })),
        h('g', { fill: 'currentColor' },
          h('circle', { cx: 6, cy: 6, r: 2.1 }),
          h('circle', { cx: 18, cy: 6, r: 2.1 }),
          h('circle', { cx: 6, cy: 18, r: 2.1 }),
          h('circle', { cx: 18, cy: 18, r: 2.1 }),
          h('circle', { cx: 12, cy: 12, r: 1.6 })),
      )
    }

    /* ------------------------------------------------------------ */
    /* Plugin                                                         */
    /* ------------------------------------------------------------ */

    return {
      inject: ['slots'],
      apply(ctx) {
        const openSession = () => {
          try {
            const workspace = ctx.get?.('uiWorkspace')
            if (workspace?.startSession) {
              workspace.startSession()
              return
            }
          } catch {
            /* fall through to a no-op */
          }
        }

        /* Follow the Harness language: the sidebar label re-resolves it inside
           the thunk, and the panel re-renders through the locale subscription
           or the `<html lang>` write. */
        hostContext = ctx
        watchLanguage()
        if (typeof ctx.effect === 'function') ctx.effect(() => releaseLanguageWatch, 'nwtool: language')

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('网络运维工具箱'),
        }, PanelIcon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, () => h(Boundary, null, h(ToolboxPage, { onOpenSession: openSession }))))

        /* Below the composer, in every workspace session: a reminder that the
           device consoles are still shared, and a way back to them. */
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'nwtool-share',
          order: 30,
        }, SharedDock))

        /* Its list opens in the frame-wide overlay, clear of the composer box. */
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'nwtool-share-menu',
          order: 80,
        }, SharedMenu))

        /* The floating terminal: one pinned session kept in view while the main
           slot shows a conversation instead of the toolbox panel. */
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'nwtool-term-float',
          order: 60,
        }, FloatWindow))

        /* The panel is no longer the only consumer of the stylesheet. */
        if (typeof ctx.effect === 'function') ctx.effect(() => installStyles(), 'nwtool: styles')
      },
    }
  },
})
