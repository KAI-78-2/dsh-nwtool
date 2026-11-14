/**
 * Static reference data for the Network Toolbox.
 * Everything here is offline: no lookup calls are made to build these tables.
 */

/** Public resolvers commonly used from mainland China plus a few global ones. */
export const PUBLIC_DNS = [
  { ip: '223.5.5.5', name: 'AliDNS 阿里', region: '全国', note: '阿里公共 DNS 主' },
  { ip: '223.6.6.6', name: 'AliDNS 阿里', region: '全国', note: '阿里公共 DNS 备' },
  { ip: '119.29.29.29', name: 'DNSPod 腾讯', region: '全国', note: '腾讯云公共 DNS 主' },
  { ip: '119.28.28.28', name: 'DNSPod 腾讯', region: '全国', note: '腾讯云公共 DNS 备' },
  { ip: '182.254.116.116', name: 'DNSPod 腾讯', region: '全国', note: '腾讯云公共 DNS 备' },
  { ip: '114.114.114.114', name: '114DNS', region: '全国', note: '114 DNS 主' },
  { ip: '114.114.115.115', name: '114DNS', region: '全国', note: '114 DNS 备' },
  { ip: '180.76.76.76', name: 'BaiduDNS 百度', region: '全国', note: '百度公共 DNS' },
  { ip: '1.2.4.8', name: 'CNNIC sDNS', region: '全国', note: '国家域名云解析主' },
  { ip: '210.2.4.8', name: 'CNNIC sDNS', region: '全国', note: '国家域名云解析备' },
  { ip: '117.50.11.11', name: 'OneDNS', region: '全国', note: 'OneDNS 主' },
  { ip: '117.50.22.22', name: 'OneDNS', region: '全国', note: 'OneDNS 备' },
  { ip: '52.80.66.66', name: 'OneDNS 南北', region: '全国', note: 'OneDNS 南北互通' },
  { ip: '101.226.4.6', name: '电信 DNS', region: '华东', note: '中国电信上海' },
  { ip: '218.30.118.6', name: '电信 DNS', region: '华北', note: '中国电信北京' },
  { ip: '123.125.81.6', name: '联通 DNS', region: '华北', note: '中国联通北京' },
  { ip: '140.207.198.6', name: '联通 DNS', region: '华东', note: '中国联通上海' },
  { ip: '61.139.2.69', name: '电信 DNS', region: '西南', note: '中国电信四川' },
  { ip: '202.96.128.86', name: '电信 DNS', region: '华南', note: '中国电信广东' },
  { ip: '8.8.8.8', name: 'Google DNS', region: '海外', note: 'Google Public DNS 主' },
  { ip: '8.8.4.4', name: 'Google DNS', region: '海外', note: 'Google Public DNS 备' },
  { ip: '1.1.1.1', name: 'Cloudflare', region: '海外', note: 'Cloudflare 1.1.1.1' },
  { ip: '1.0.0.1', name: 'Cloudflare', region: '海外', note: 'Cloudflare 备用' },
  { ip: '9.9.9.9', name: 'Quad9', region: '海外', note: 'IBM Quad9 安全 DNS' },
  { ip: '208.67.222.222', name: 'OpenDNS', region: '海外', note: 'Cisco OpenDNS' },
  { ip: '94.140.14.14', name: 'AdGuard', region: '海外', note: 'AdGuard 去广告 DNS' },
  { ip: '4.2.2.1', name: 'Level3', region: '海外', note: 'Level3 公共 DNS' },
]

/** Well-known TCP/UDP ports used to label scan results. */
export const PORT_NAMES = {
  20: 'FTP-data', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 67: 'DHCP',
  68: 'DHCP', 69: 'TFTP', 80: 'HTTP', 88: 'Kerberos', 110: 'POP3', 111: 'rpcbind', 123: 'NTP',
  135: 'MS-RPC', 137: 'NetBIOS-NS', 138: 'NetBIOS-DGM', 139: 'NetBIOS-SSN', 143: 'IMAP',
  161: 'SNMP', 162: 'SNMP-trap', 179: 'BGP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB',
  465: 'SMTPS', 500: 'IKE', 514: 'Syslog', 515: 'LPD', 548: 'AFP', 554: 'RTSP', 587: 'SMTP-sub',
  623: 'IPMI', 636: 'LDAPS', 873: 'rsync', 993: 'IMAPS', 995: 'POP3S', 1080: 'SOCKS5',
  1194: 'OpenVPN', 1433: 'MSSQL', 1521: 'Oracle', 1701: 'L2TP', 1723: 'PPTP', 1883: 'MQTT',
  2049: 'NFS', 2181: 'ZooKeeper', 2375: 'Docker', 2376: 'Docker-TLS', 3000: 'Grafana/Node',
  3306: 'MySQL', 3389: 'RDP', 5060: 'SIP', 5061: 'SIP-TLS', 5432: 'PostgreSQL', 5672: 'RabbitMQ',
  5900: 'VNC', 5985: 'WinRM', 5986: 'WinRM-TLS', 6379: 'Redis', 7001: 'WebLogic',
  8080: 'HTTP-alt', 8081: 'HTTP-alt', 8086: 'InfluxDB', 8443: 'HTTPS-alt', 8888: 'HTTP-alt',
  9000: 'SonarQube', 9090: 'Prometheus/Web', 9200: 'Elasticsearch', 9300: 'ES-transport',
  11211: 'Memcached', 27017: 'MongoDB', 27018: 'MongoDB',
}

export function portLabel(port) {
  const name = PORT_NAMES[port]
  return name ? `${port} (${name})` : String(port)
}

/** Common scan presets shown as one-click buttons in the port scanner. */
export const PORT_PRESETS = {
  web: [80, 443, 8080, 8443, 8000, 8888, 3000, 9000],
  remote: [22, 23, 3389, 5900, 5985, 5986],
  windows: [135, 139, 445, 3389, 5985, 5986, 1433, 1521],
  database: [1433, 1521, 3306, 5432, 6379, 27017, 9200, 11211, 2181],
  network: [22, 23, 161, 179, 830, 2000, 5060],
  datacom: [22, 23, 80, 443, 161, 830, 2000, 8080, 8443],
  top: [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 161, 389, 443, 445, 465, 587, 636, 873, 993,
    995, 1433, 1521, 1723, 2049, 2375, 3306, 3389, 5060, 5432, 5900, 6379, 8080, 8443, 9200, 11211, 27017],
}

/**
 * A trimmed IEEE OUI table covering the vendors an enterprise network team
 * meets most often. Unknown prefixes report as unidentified instead of being
 * guessed.
 */

/**
 * A deliberately small offline OUI table: only vendors whose prefixes are
 * widely documented are listed here. Anything else is resolved by the online
 * OUI lookup the LAN scanner offers, so an unknown prefix never produces a
 * guessed vendor name.
 */
export const OUI_VENDORS = {
  // Cisco
  '00000C': 'Cisco', '0001C7': 'Cisco', '0002FC': 'Cisco', '0003E3': 'Cisco', '0004C0': 'Cisco',
  '000A41': 'Cisco', '000B46': 'Cisco', '000C85': 'Cisco', '000D28': 'Cisco', '000F23': 'Cisco',
  '0011BC': 'Cisco', '0012DA': 'Cisco', '0013C3': 'Cisco', '0016C7': 'Cisco', '0018B9': 'Cisco',
  '001A2F': 'Cisco', '001B0C': 'Cisco', '001B53': 'Cisco', '001C0E': 'Cisco', '001D45': 'Cisco',
  '001E13': 'Cisco', '001F26': 'Cisco', '0021A0': 'Cisco', '0022BD': 'Cisco', '00259C': 'Cisco-Linksys',
  '0026CB': 'Cisco', '0050F2': 'Cisco', '00D0BC': 'Cisco', '00FEC8': 'Cisco', '1CAA07': 'Cisco',
  '2C542D': 'Cisco', '44D3CA': 'Cisco', '481D70': 'Cisco', '58971E': 'Cisco', '6C416A': 'Cisco',
  // Intel
  '0002B3': 'Intel', '0007E9': 'Intel', '001320': 'Intel', '00A0C9': 'Intel', '00AA00': 'Intel',
  // Virtualization
  '000C29': 'VMware', '005056': 'VMware', '000569': 'VMware', '080027': 'Oracle VirtualBox',
  '525400': 'QEMU/KVM', '00155D': 'Microsoft Hyper-V',
  // Apple
  '000A27': 'Apple', '0017F2': 'Apple', '0019E3': 'Apple', '001B63': 'Apple', '001CB3': 'Apple',
  '001E52': 'Apple', '001F5B': 'Apple', '0021E9': 'Apple', '002312': 'Apple', '002436': 'Apple',
  '002500': 'Apple', '0026B0': 'Apple', '003065': 'Apple', '003EE1': 'Apple', '0050E4': 'Apple',
  // HP / Dell / servers
  '0017A4': 'HP', '0025B3': 'HP', '9457A5': 'HP', '001AA0': 'Dell', '001C23': 'Dell',
  '1866DA': 'Dell', '246E96': 'Dell', '3417EB': 'Dell', '20040F': 'Dell',
  // Network vendors
  '0010DB': 'Juniper', '307C5E': 'Juniper', '000FE2': 'H3C', '002389': 'H3C',
  '00E0FC': 'Huawei', '00259E': 'Huawei', '002568': 'Huawei', '000B86': 'Aruba',
  '00090F': 'Fortinet', '000C42': 'Routerboard/MikroTik', '24A43C': 'Ubiquiti',
  '0418D6': 'Ubiquiti', '0080C8': 'D-Link', '001CF0': 'D-Link', '00E04C': 'Realtek',
}

/**
 * Huawei VRP / H3C Comware against Cisco IOS and NX-OS.
 * `cat` groups rows in the UI; `vrp` and `ios` hold the command pair.
 */
export const CHEATSHEET = [
  { cat: '基础', purpose: '查看系统版本', vrp: 'display version', ios: 'show version' },
  { cat: '基础', purpose: '查看当前时间', vrp: 'display clock', ios: 'show clock' },
  { cat: '基础', purpose: '查看设备名称', vrp: 'display current-configuration | include sysname', ios: 'show run | include hostname' },
  { cat: '基础', purpose: '设备重命名', vrp: 'sysname <name>', ios: 'hostname <name>' },
  { cat: '基础', purpose: '保存配置', vrp: 'save', ios: 'write memory / copy running-config startup-config' },
  { cat: '基础', purpose: '进入系统视图', vrp: 'system-view', ios: 'configure terminal' },
  { cat: '基础', purpose: '返回上一层', vrp: 'quit', ios: 'exit' },
  { cat: '基础', purpose: '返回用户视图', vrp: 'return (Ctrl+Z)', ios: 'end (Ctrl+Z)' },
  { cat: '基础', purpose: '取消/撤销命令', vrp: 'undo <command>', ios: 'no <command>' },
  { cat: '基础', purpose: '重启设备', vrp: 'reboot', ios: 'reload' },
  { cat: '基础', purpose: '查看配置', vrp: 'display current-configuration', ios: 'show running-config' },
  { cat: '基础', purpose: '查看开机配置', vrp: 'display saved-configuration', ios: 'show startup-config' },
  { cat: '基础', purpose: '关闭分屏', vrp: 'screen-length 0 temporary', ios: 'terminal length 0' },
  { cat: '基础', purpose: '查看日志', vrp: 'display logbuffer', ios: 'show logging' },
  { cat: '基础', purpose: '清空计数', vrp: 'reset counters interface', ios: 'clear counters' },

  { cat: '接口', purpose: '查看接口摘要', vrp: 'display ip interface brief', ios: 'show ip interface brief' },
  { cat: '接口', purpose: '查看接口详情', vrp: 'display interface GigabitEthernet0/0/1', ios: 'show interfaces GigabitEthernet0/1' },
  { cat: '接口', purpose: '进入接口', vrp: 'interface GigabitEthernet0/0/1', ios: 'interface GigabitEthernet0/1' },
  { cat: '接口', purpose: '配置 IP 地址', vrp: 'ip address 10.1.1.1 24', ios: 'ip address 10.1.1.1 255.255.255.0' },
  { cat: '接口', purpose: '启用接口', vrp: 'undo shutdown', ios: 'no shutdown' },
  { cat: '接口', purpose: '关闭接口', vrp: 'shutdown', ios: 'shutdown' },
  { cat: '接口', purpose: '接口描述', vrp: 'description To-Core', ios: 'description To-Core' },
  { cat: '接口', purpose: '查看接口速率/双工', vrp: 'display interface GigabitEthernet0/0/1 | include speed', ios: 'show interfaces GigabitEthernet0/1 | include BW' },
  { cat: '接口', purpose: '配置速率双工', vrp: 'speed 1000 / duplex full', ios: 'speed 1000 / duplex full' },
  { cat: '接口', purpose: '查看 MAC 地址表', vrp: 'display mac-address', ios: 'show mac address-table' },
  { cat: '接口', purpose: '查看光模块信息', vrp: 'display transceiver interface', ios: 'show interfaces transceiver' },
  { cat: '接口', purpose: '查看接口错误统计', vrp: 'display interface | include error', ios: 'show interfaces counters errors' },
  { cat: '接口', purpose: '清空接口计数', vrp: 'reset counters interface GigabitEthernet0/0/1', ios: 'clear counters GigabitEthernet0/1' },

  { cat: 'VLAN', purpose: '创建 VLAN', vrp: 'vlan 10', ios: 'vlan 10' },
  { cat: 'VLAN', purpose: 'VLAN 命名', vrp: 'name Office', ios: 'name Office' },
  { cat: 'VLAN', purpose: '查看 VLAN', vrp: 'display vlan', ios: 'show vlan brief' },
  { cat: 'VLAN', purpose: 'Access 口', vrp: 'port link-type access / port default vlan 10', ios: 'switchport mode access / switchport access vlan 10' },
  { cat: 'VLAN', purpose: 'Trunk 口', vrp: 'port link-type trunk / port trunk allow-pass vlan 10 20', ios: 'switchport trunk encapsulation dot1q / switchport mode trunk / switchport trunk allowed vlan 10,20' },
  { cat: 'VLAN', purpose: 'Hybrid 口（华为特有）', vrp: 'port link-type hybrid / port hybrid vlan 10 untagged', ios: '无对应（用 access/trunk 组合）' },
  { cat: 'VLAN', purpose: '查看 Trunk 放通', vrp: 'display port vlan', ios: 'show interfaces trunk' },
  { cat: 'VLAN', purpose: 'VLANIF / SVI', vrp: 'interface Vlanif10 / ip address 10.1.10.1 24', ios: 'interface Vlan10 / ip address 10.1.10.1 255.255.255.0' },
  { cat: 'VLAN', purpose: '查看接口 VLAN 归属', vrp: 'display port vlan active', ios: 'show interfaces switchport' },
  { cat: 'VLAN', purpose: '批量创建 VLAN', vrp: 'vlan batch 10 to 20', ios: 'vlan 10-20' },

  { cat: '链路聚合', purpose: '创建 Eth-Trunk', vrp: 'interface Eth-Trunk1', ios: 'interface Port-channel1' },
  { cat: '链路聚合', purpose: '加入成员口', vrp: 'interface GigabitEthernet0/0/1 / eth-trunk 1', ios: 'interface range Gi0/1-2 / channel-group 1 mode active' },
  { cat: '链路聚合', purpose: 'LACP 模式', vrp: 'mode lacp-static', ios: 'channel-group 1 mode active' },
  { cat: '链路聚合', purpose: '手工模式', vrp: 'mode manual load-balance', ios: 'channel-group 1 mode on' },
  { cat: '链路聚合', purpose: '查看聚合状态', vrp: 'display eth-trunk 1', ios: 'show etherchannel summary' },
  { cat: '链路聚合', purpose: '负载分担方式', vrp: 'load-balance src-dst-ip', ios: 'port-channel load-balance src-dst-ip' },

  { cat: 'STP', purpose: '查看生成树', vrp: 'display stp brief', ios: 'show spanning-tree summary' },
  { cat: 'STP', purpose: '查看 STP 详情', vrp: 'display stp', ios: 'show spanning-tree detail' },
  { cat: 'STP', purpose: '设置根桥', vrp: 'stp root primary', ios: 'spanning-tree vlan 10 root primary' },
  { cat: 'STP', purpose: '设置优先级', vrp: 'stp priority 4096', ios: 'spanning-tree vlan 10 priority 4096' },
  { cat: 'STP', purpose: '开启 RSTP/MSTP', vrp: 'stp mode rstp / stp mode mstp', ios: 'spanning-tree mode rapid-pvst' },
  { cat: 'STP', purpose: '边缘端口', vrp: 'stp edged-port enable', ios: 'spanning-tree portfast' },
  { cat: 'STP', purpose: 'BPDU 保护', vrp: 'stp bpdu-protection', ios: 'spanning-tree portfast bpduguard default' },
  { cat: 'STP', purpose: '全局关闭 STP', vrp: 'undo stp enable', ios: 'no spanning-tree vlan 10' },

  { cat: '路由', purpose: '查看路由表', vrp: 'display ip routing-table', ios: 'show ip route' },
  { cat: '路由', purpose: '静态路由', vrp: 'ip route-static 0.0.0.0 0 10.1.1.254', ios: 'ip route 0.0.0.0 0.0.0.0 10.1.1.254' },
  { cat: '路由', purpose: '删除静态路由', vrp: 'undo ip route-static 0.0.0.0 0 10.1.1.254', ios: 'no ip route 0.0.0.0 0.0.0.0 10.1.1.254' },
  { cat: '路由', purpose: 'OSPF 进程', vrp: 'ospf 1 router-id 1.1.1.1', ios: 'router ospf 1 / router-id 1.1.1.1' },
  { cat: '路由', purpose: 'OSPF 区域与网段', vrp: 'area 0 / network 10.1.1.0 0.0.0.255', ios: 'network 10.1.1.0 0.0.0.255 area 0' },
  { cat: '路由', purpose: '查看 OSPF 邻居', vrp: 'display ospf peer brief', ios: 'show ip ospf neighbor' },
  { cat: '路由', purpose: '查看 OSPF 接口', vrp: 'display ospf interface', ios: 'show ip ospf interface brief' },
  { cat: '路由', purpose: 'BGP 邻居', vrp: 'bgp 65001 / peer 10.1.1.2 as-number 65002', ios: 'router bgp 65001 / neighbor 10.1.1.2 remote-as 65002' },
  { cat: '路由', purpose: '查看 BGP 邻居', vrp: 'display bgp peer', ios: 'show ip bgp summary' },
  { cat: '路由', purpose: '路由重分发', vrp: 'import-route static', ios: 'redistribute static' },
  { cat: '路由', purpose: '查看路由协议', vrp: 'display ip routing-table protocol ospf', ios: 'show ip route ospf' },
  { cat: '路由', purpose: 'VRRP（华为）/ HSRP（思科）', vrp: 'vrrp vrid 1 virtual-ip 10.1.1.254', ios: 'standby 1 ip 10.1.1.254' },
  { cat: '路由', purpose: '查看 VRRP', vrp: 'display vrrp', ios: 'show standby brief' },

  { cat: 'ACL', purpose: '创建基本 ACL', vrp: 'acl number 2000', ios: 'access-list 1 permit 10.1.1.0 0.0.0.255' },
  { cat: 'ACL', purpose: '创建高级 ACL', vrp: 'acl number 3000', ios: 'ip access-list extended 100' },
  { cat: 'ACL', purpose: 'ACL 规则', vrp: 'rule 5 permit source 10.1.1.0 0.0.0.255', ios: 'permit ip 10.1.1.0 0.0.0.255 any' },
  { cat: 'ACL', purpose: '接口应用 ACL', vrp: 'traffic-filter inbound acl 3000', ios: 'ip access-group 100 in' },
  { cat: 'ACL', purpose: '查看 ACL', vrp: 'display acl all', ios: 'show access-lists' },
  { cat: 'ACL', purpose: 'ACL 计数', vrp: 'display acl 3000', ios: 'show access-lists 100' },

  { cat: 'NAT', purpose: 'NAT 地址池', vrp: 'nat address-group 1 200.1.1.10 200.1.1.20', ios: 'ip nat pool POOL 200.1.1.10 200.1.1.20 netmask 255.255.255.0' },
  { cat: 'NAT', purpose: '源 NAT', vrp: 'nat outbound 2000 address-group 1', ios: 'ip nat inside source list 1 pool POOL overload' },
  { cat: 'NAT', purpose: '接口 Easy-IP', vrp: 'nat outbound 2000', ios: 'ip nat inside source list 1 interface Gi0/1 overload' },
  { cat: 'NAT', purpose: 'NAT 内外接口', vrp: 'nat inside / nat outside', ios: 'ip nat inside / ip nat outside' },
  { cat: 'NAT', purpose: '服务器映射', vrp: 'nat server protocol tcp global 200.1.1.10 80 inside 10.1.1.10 80', ios: 'ip nat inside source static tcp 10.1.1.10 80 200.1.1.10 80' },
  { cat: 'NAT', purpose: '查看 NAT 会话', vrp: 'display nat session all', ios: 'show ip nat translations' },

  { cat: 'DHCP', purpose: '开启 DHCP', vrp: 'dhcp enable', ios: 'service dhcp' },
  { cat: 'DHCP', purpose: '地址池', vrp: 'ip pool p1 / network 10.1.10.0 mask 255.255.255.0', ios: 'ip dhcp pool p1 / network 10.1.10.0 255.255.255.0' },
  { cat: 'DHCP', purpose: '网关与 DNS', vrp: 'gateway-list 10.1.10.1 / dns-list 223.5.5.5', ios: 'default-router 10.1.10.1 / dns-server 223.5.5.5' },
  { cat: 'DHCP', purpose: '接口启用', vrp: 'interface Vlanif10 / dhcp select global', ios: 'interface Vlan10 / ip helper-address 10.1.1.5（中继）' },
  { cat: 'DHCP', purpose: '查看地址分配', vrp: 'display ip pool', ios: 'show ip dhcp binding' },
  { cat: 'DHCP', purpose: '排除地址', vrp: 'dhcp server excluded-ip-address 10.1.10.1 10.1.10.10', ios: 'ip dhcp excluded-address 10.1.10.1 10.1.10.10' },

  { cat: '用户管理', purpose: '创建本地用户', vrp: 'aaa / local-user admin password irreversible-cipher <pwd>', ios: 'username admin privilege 15 secret <pwd>' },
  { cat: '用户管理', purpose: '用户级别', vrp: 'local-user admin privilege level 15', ios: 'username admin privilege 15' },
  { cat: '用户管理', purpose: '配置 SSH', vrp: 'stelnet server enable / ssh user admin authentication-type password', ios: 'ip domain-name lab / crypto key generate rsa / line vty 0 4 / transport input ssh' },
  { cat: '用户管理', purpose: '配置 Telnet', vrp: 'telnet server enable / user-interface vty 0 4 / protocol inbound telnet', ios: 'line vty 0 4 / transport input telnet' },
  { cat: '用户管理', purpose: 'VTY 认证', vrp: 'user-interface vty 0 4 / authentication-mode aaa', ios: 'line vty 0 4 / login local' },
  { cat: '用户管理', purpose: '特权密码', vrp: 'super password cipher <pwd>', ios: 'enable secret <pwd>' },
  { cat: '用户管理', purpose: '查看在线用户', vrp: 'display users', ios: 'show users' },
  { cat: '用户管理', purpose: 'AAA 认证模板', vrp: 'domain default_admin / authentication-scheme default', ios: 'aaa new-model / aaa authentication login default local' },

  { cat: '诊断', purpose: 'Ping', vrp: 'ping -c 4 -s 1472 8.8.8.8', ios: 'ping 8.8.8.8 repeat 4 size 1472' },
  { cat: '诊断', purpose: '指定源 Ping', vrp: 'ping -a 10.1.1.1 8.8.8.8', ios: 'ping 8.8.8.8 source 10.1.1.1' },
  { cat: '诊断', purpose: 'Traceroute', vrp: 'tracert -m 30 8.8.8.8', ios: 'traceroute 8.8.8.8' },
  { cat: '诊断', purpose: '查看 ARP', vrp: 'display arp all', ios: 'show arp / show ip arp' },
  { cat: '诊断', purpose: '清空 ARP', vrp: 'reset arp all', ios: 'clear arp-cache' },
  { cat: '诊断', purpose: '查看 CPU', vrp: 'display cpu-usage', ios: 'show processes cpu sorted' },
  { cat: '诊断', purpose: '查看内存', vrp: 'display memory-usage', ios: 'show processes memory' },
  { cat: '诊断', purpose: '查看风扇/温度', vrp: 'display fan / display temperature', ios: 'show environment all' },
  { cat: '诊断', purpose: '抓包', vrp: 'capture-packet interface GigabitEthernet0/0/1', ios: 'monitor capture CAP interface Gi0/1 both' },
  { cat: '诊断', purpose: '查看邻居 LLDP', vrp: 'display lldp neighbor brief', ios: 'show lldp neighbors' },
  { cat: '诊断', purpose: '开启 LLDP', vrp: 'lldp enable', ios: 'lldp run' },
  { cat: '诊断', purpose: '查看 NTP', vrp: 'display ntp-service status', ios: 'show ntp status' },
  { cat: '诊断', purpose: '配置 NTP', vrp: 'ntp-service unicast-server 10.1.1.5', ios: 'ntp server 10.1.1.5' },
  { cat: '诊断', purpose: '查看 SNMP 配置', vrp: 'display snmp-agent sys-info', ios: 'show snmp' },
  { cat: '诊断', purpose: '配置 SNMP v2c', vrp: 'snmp-agent sys-info version v2c / snmp-agent community read <ro>', ios: 'snmp-server community <ro> RO' },

  { cat: '文件/升级', purpose: '查看文件', vrp: 'dir', ios: 'dir flash:' },
  { cat: '文件/升级', purpose: '查看剩余空间', vrp: 'dir /all', ios: 'dir flash: | include bytes' },
  { cat: '文件/升级', purpose: 'FTP 上传', vrp: 'ftp 10.1.1.5 / put vrpcfg.zip', ios: 'copy ftp: flash:' },
  { cat: '文件/升级', purpose: 'TFTP 上传', vrp: 'tftp 10.1.1.5 put vrpcfg.zip', ios: 'copy tftp: flash:' },
  { cat: '文件/升级', purpose: '指定启动文件', vrp: 'startup system-software <file>.cc', ios: 'boot system flash:<file>' },
  { cat: '文件/升级', purpose: '查看启动项', vrp: 'display startup', ios: 'show boot' },
  { cat: '文件/升级', purpose: '删除文件', vrp: 'delete /unreserved <file>', ios: 'delete /force flash:<file>' },
  { cat: '文件/升级', purpose: '格式化', vrp: 'reset saved-configuration', ios: 'erase startup-config' },

  { cat: '堆叠/HA', purpose: '查看堆叠', vrp: 'display stack / display device', ios: 'show switch / show module' },
  { cat: '堆叠/HA', purpose: '堆叠优先级', vrp: 'stack slot 0 priority 200', ios: 'switch 1 priority 15' },
  { cat: '堆叠/HA', purpose: '双机热备', vrp: 'hrp enable / hrp interface GigabitEthernet1/0/1 remote 10.1.1.2', ios: 'HSRP/VRRP + SSO（平台相关）' },
  { cat: '堆叠/HA', purpose: '查看 HA 状态', vrp: 'display hrp state', ios: 'show redundancy status' },

  { cat: '安全', purpose: '端口安全', vrp: 'port-security enable / port-security max-mac-num 2', ios: 'switchport port-security / switchport port-security maximum 2' },
  { cat: '安全', purpose: 'DHCP Snooping', vrp: 'dhcp snooping enable', ios: 'ip dhcp snooping' },
  { cat: '安全', purpose: '动态 ARP 检测', vrp: 'arp anti-attack check user-bind enable', ios: 'ip arp inspection vlan 10' },
  { cat: '安全', purpose: '端口隔离', vrp: 'port-isolate enable group 1', ios: 'switchport protected' },
  { cat: '安全', purpose: '风暴抑制', vrp: 'storm-control broadcast min-rate 1000', ios: 'storm-control broadcast level 5' },
  { cat: '安全', purpose: '关闭未用端口', vrp: 'interface range GigabitEthernet0/0/1 to 0/0/8 / shutdown', ios: 'interface range Gi0/1-8 / shutdown' },

  { cat: 'IPv6', purpose: '开启 IPv6', vrp: 'ipv6', ios: 'ipv6 unicast-routing' },
  { cat: 'IPv6', purpose: '接口地址', vrp: 'ipv6 enable / ipv6 address 2001:db8::1/64', ios: 'ipv6 address 2001:db8::1/64' },
  { cat: 'IPv6', purpose: '查看 IPv6 路由', vrp: 'display ipv6 routing-table', ios: 'show ipv6 route' },
  { cat: 'IPv6', purpose: 'IPv6 邻居', vrp: 'display ipv6 neighbors', ios: 'show ipv6 neighbors' },
]
