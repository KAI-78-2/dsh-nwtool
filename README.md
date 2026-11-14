# 网络运维工具箱（dsh-nwtool）

DeepSeek Harness 插件：在左侧边栏增加一个「网络运维工具箱」入口，主面板提供 **33 个**网络运维与
Datacom 工具；同一套能力又注册成 **20 个 Agent 工具**，模型可以自己调用。

- 面板：侧边栏图标 + 主面板（`sidebar.panellist` / `main` 插槽），另有共享状态条与终端浮窗占用
  `conversation.composer.dock` / `shell.overlay`。
- 网络探测全部在**运行 DSH 的主机侧**执行，不受浏览器跨域限制，也不需要管理员权限。
- **零第三方依赖**：主机侧只 `import` Node 内置模块（`node:net`、`node:dns`、`node:crypto` 等）与
  同目录文件；浏览器侧只 `require('react')`，那是 DSH 在加载时注入的，插件既不自带也不安装它。
  详见[开源与许可](#开源与许可)。
- 运行环境：随 DSH 自带的 Node（18+）运行，无需另外安装 Node 或任何运行时。

## 安装

开发与验证环境：DeepSeek Harness 桌面版 0.2.2-rc.3。

1. 左侧 **Plugins** → **Add plugin**（或右侧箭头 → **Install a third-party plugin**）。
2. 填 `github:KAI-78-2/dsh-nwtool`（完整地址 `https://github.com/KAI-78-2/dsh-nwtool.git` 亦可）。
3. **Install**，装完点 **Enable now**，侧边栏出现「网络运维工具箱」。

固定版本：`github:KAI-78-2/dsh-nwtool#v1.1.0`（旧版：`#v1.0.0`）。命令行（web profile）：
`dsh plugin --profile web add github:KAI-78-2/dsh-nwtool`；desktop profile 请用插件页面。

## 界面

- 侧边栏入口名与面板左上角标题跟随宿主语言：中文显示「网络运维工具箱」，英文（及其它语言）显示「NWTool」。
  语言取自 locale 服务的快照字段 `active`，读不到时依次退到 `<html lang>` 与浏览器语言；
  侧边栏 label 是每次投影都会重新求值的 thunk，因此切换语言不需要刷新页面。
- 左下角固定显示 `DSH-NWTool v<版本>`，版本号与 `package.json` 一致（自检会校验两者同步）。
  旁边的「说明」按钮打开**关于与使用说明**：一句话介绍、运行位置与数据目录、按分组列出全部工具的
  用法要点（点任意一行直接跳到该工具），以及注册给模型的 20 个 Agent 工具及各自用途。
- 左侧分类可折叠，折叠状态记在 `localStorage`（`nwtool.collapsed`），下次打开保持。
  每个分类有自己的图标（Datacom 运维＝叠放的交换机、连通性＝心跳线、扫描＝雷达、域名＝地球、
  本机＝笔记本、实用＝滑杆、诊断＝放大镜），分类标题左侧显示，收起后就是窄条里的那七个图标。
- 整张工具列表也能收起：页头右侧的 `«` 把导航折成 52px 窄条，只留下展开按钮、七个分类图标与「说明」，
  把宽度让给工具本身；再用 `»` 展开。窄条里点某个分类图标＝展开列表并进入该分类的第一个工具，
  当前所在的分类会高亮。收起状态记在 `nwtool.nav.collapsed`，下次打开保持。
- 背景是三层极光帘幕：青色 → 蓝 → 紫 → 品红的光带以 104s / 122s / 138s 缓慢漂移、
  26s 做整体明暗呼吸，全部做了重模糊与上下渐隐遮罩；调色板刻意**不含绿色**，也没有用
  `hue-rotate`（旋转色相会漂到绿色）。界面控件仍只用 `--dsw-alias-*` 变量着色。
- 页头下方有一条极光地平线光带，标题下划线取青→紫渐变。
- 选中态、悬停态、焦点态全部由 CSS 类驱动（`.nwt-item--active`），不依赖内联样式，
  因此切换工具时不可能残留上一项的高亮。
- 切换工具时内容区有入场动画，运行中有脉冲圆点与扫描进度条，表格行、统计标签有微交互。
- 遵循系统"减少动态效果"设置：`prefers-reduced-motion: reduce` 时关闭全部动画与过渡。

## 终端（SSH / Telnet）

`Datacom 运维 → 终端 / 设备簿` 提供一个交互式终端，用来连交换机、路由器与 Linux 主机。

- **Telnet**：直接在 TCP 上自实现 RFC 854（IAC 协商、NAWS 窗口尺寸），不依赖任何外部程序。
- **SSH 不会卡在看不见的提示上**：密码统一交给 askpass 助手（`SSH_ASKPASS_REQUIRE=force`），
  密钥/agent 模式加 `BatchMode=yes`，再加 `ConnectTimeout=10`。这样认证失败会立刻写出
  `Permission denied` 并断开，而不是让 ssh 停在自己的控制台密码提示上——那种情况下会话是"已连接"
  （绿点），但一个字节都不会来。
- **静默会话提示**：连接成功 8 秒内没有任何输出时，标签下方会提示"已连接，但还没有收到任何输出"，
  免得对着空白屏幕猜。
- **编码可切**：传输的是原始字节，主机侧不解码；前端用 `UTF-8` 或 `GBK` 解码，所以同一个会话既能看
  Linux 的 UTF-8 输出，也能看国内交换机的 GBK 中文。切换编码只影响之后的输出。
- **VT100/xterm 子集**：光标定位、SGR 颜色（含 256 色）、清行/清屏、插删行/字符、滚动区域、
  备用屏（`?1049`）、光标显隐、CJK 宽字符双格。遇到不认识的转义序列是忽略而不是画错。
- **复制 / 粘贴**：屏幕内容是可选中的普通文本——鼠标拖选后 `Ctrl+C` 复制（`Ctrl+Shift+C` 亦可），
  `Ctrl+V` 把剪贴板内容送进终端（换行自动转成回车，不会被当成 `^V` 发给设备）。
  只有**没有**选中文本时，`Ctrl+C` 才作为中断信号发出。
- **滚动历史**：滚出屏幕顶部的行会进入前端回滚缓冲（最多 2000 行），鼠标滚轮或滚动条往回翻；
  翻走后右下角出现「回到底部」一键回到最新输出，新输出只在贴底时自动跟随。
- **浮窗**：工具栏点「浮窗」把当前标签钉到右上角的小窗。切到工作区会话（或任何不是工具箱的面板）时，
  小窗自己接一条 `term.attach` 继续显示实时输出；可拖动、可缩放、可直接输入，危险命令的授权也能在小窗里答。
  小窗标题栏里还有「共享给 DSH / 取消共享」，不用切回面板就能放行或收回。工具箱面板回来时小窗自动收回
  并由面板接管；关掉小窗只是取消浮窗，不会断开设备。钉住的会话在 `localStorage` 里存着，在会话里刷新页面也会回来。
- **设备簿**：名称/地址/端口/协议/用户名/认证方式，密码三选一——
  `每次输入`（不落盘）、`保存密码`（本机 `~/.dsh-nwtool/devices.json`，AES-256-GCM + 本机密钥文件加密）、
  `SSH 私钥`、`SSH agent`。
  `每次输入` 的设备**必须先在上方密码框填入密码再点连接**：空密码会被直接拒绝并提示，
  重连时同样要重新填（密码不落盘，自然也不会被记住）。
- **多会话标签页**：每点一次「连接」就多一个标签，各自挂着独立的传输流。切标签只是换前台，
  后台会话照常收输出，标签自己保留整屏内容与滚动历史；切到工作区再回来会从 Host 缓冲重放
  （Host 保留最近 256 KB 原始字节），无人在看时会话仍保留 **20 分钟**，只有点 `×` 才会断开并关闭。
  标签上的圆点表示状态：绿色已连接、黄色连接中、红色已断开（可一键重连，屏幕内容不丢）。
- **设备分组**：新建/编辑设备时可以选已有分组，也可以直接输入新名称（输入不存在的名字即建新分组）；
  空名归入「默认分组」。设备簿里按分组折叠显示，默认分组排在最前。
- **侧边栏监控**：CPU / 内存 / 负载 / 磁盘 / 网卡，5 秒轮询。Linux 读 `/proc` + `df`，华为 VRP/H3C 用
  `display cpu-usage` / `display memory-usage` / `dir` / `display interface brief`，思科 IOS 用
  `show processes cpu` / `show memory statistics` / `dir` / `show interfaces summary`。
  监控走**独立于交互终端的第二条连接**（同一套凭据），所以轮询命令不会打断你正在 `top` 或 `vi` 的画面。
- **文件浏览**：Linux 用 `ls -la` 列目录、点文件再用 `stat -c` 取详情；VRP/IOS 用 `dir`。
  纯只读；路径只允许字母、数字和 `. / \ : -`，`;` `|` `$` 之类的命令注入字符直接拒绝。

### 传输方式

终端**不走 WebSocket**：桌面壳的 CSP 会拦掉 `ws://`。实际用的是同一套 HTTP 通道——

- 下行：`POST /nwtool/api {op:'term.open'}` 返回 NDJSON 流，`ready` / `data`(base64) / `exit` / `error`；
- 上行：`POST {op:'term.input'|'term.resize'|'term.close'}`，按会话 id 寻址。

字节以 base64 传输，前端按所选编码解码，所以 GBK 与 UTF-8 都不会在传输层被改写。

### 安全模型

终端能在本机开 shell，所以做了两道门：

1. **对端信任**：来自本机回环地址的请求放行（本机进程本来就能开 shell，也兼容桌面壳里
   `Origin: null` 的情况）；非本机请求必须带上浏览器已经用过的 Cookie，且 Origin 与 Host 一致。
2. **会话能力**：`term.input` / `term.resize` / `term.close` 必须携带 `term.open` 返回的随机
   sessionId（122 位），猜不到也拿不到别人的。

已知限制：SSH 会话的窗口尺寸在连接时确定，拖拽面板不会实时重排（Telnet 走 NAWS 实时更新）；
切回某个标签页时会按当前容器尺寸重新握手一次。交互式终端依赖本机装有 `plink` 或 `ssh`。

## 多语言（i18n）

中文是**源语言**：所有文案直接以中文写在代码里，`locale/messages.json` 的 `en` 表按中文原文做映射，
查询顺序是「当前语言 → 英文 → 中文原文」，所以漏翻只会退回中文，不会露出 key。

- 客户端 `t('中文')`、主机侧 `import { t } from './i18n.js'`，两边共用同一份词典。
- 带变量时用 `${name}` 占位：`t('已发送 ${count} 次', { count })`，翻译里同样保留占位符。
- 主机侧的语言由浏览器请求里的 `lang` 决定，通过 `AsyncLocalStorage` 贯穿整条调用链，不需要层层传参。
- 参考数据（公共 DNS 备注、命令速查表）保持中文原文，由客户端在**渲染时**翻译，因此切换语言时已加载的数据也会跟着变。
- 模型调用的工具描述（`host/tools.js`）不参与本地化：它们面向模型而不是界面。

**改文案的流程**：直接在代码里写中文并用 `t()` 包起来 → 在 `locale/messages.json` 的 `en` 表加一行
`"中文原文": "English"` → `node scripts/sync-messages.mjs` 把词典内联进 `client.js` → 跑自检。

自检分三路，覆盖「静态 + 行为」两层：

- `tests/verify-i18n.mjs`：主机侧每条中文输出都包了 `t()`、每个 `t()` 的 key 都有英文、占位符两边一致、内联副本与 JSON 同步。
- `tests/verify-client-render.mjs`：以英文渲染**每一个面板**，屏幕上不允许出现任何中文——这条是「新增文案默认 i18n」的硬约束。
- `tests/verify-host-i18n.mjs`：16 个引擎分别在 `en` / `zh` 下各跑一遍，英文输出不得含中文（操作系统自带的网卡名等数据除外）。

## 自检

24 个脚本都在 [`tests/`](tests) 里，一条命令跑完（从任何目录执行都可以）：

```bash
node tests/run-all.mjs              # 23 个离线检查
NWTOOL_PORT=<GUI 端口> node tests/run-all.mjs --live   # 另加真机终端通道
```

| 脚本 | 检查什么 |
| --- | --- |
| `verify-encoding` | 无 BOM、全 LF、JSON 可解析、版本与注册名一致 |
| `verify-css` | 样式表括号/回退/配色规范，用到的 class 都有定义 |
| `verify-client-render` | 每个面板都能渲染；英文模式下不许出现中文 |
| `verify-i18n` / `verify-host-i18n` | 词典完整性、占位符；16 个引擎中英双语都干净 |
| `verify-vt` | 自研 VT 引擎：光标、颜色、回滚、备用屏、宽字符 |
| `verify-term*` | 会话生命周期、历史重放、多标签、共享、浮窗、授权 |
| `verify-about` / `verify-nav` | 使用说明面板、导航收起与分类图标 |
| `verify-host-*` / `verify-newtools` / `verify-monitor` / `verify-diagram` / `verify-topo-ui` | 各引擎与拓扑、监控、命令行工具的逻辑 |
| `verify-term-live` | 真机终端通道（需要 GUI 在跑，`--live` 才跑） |

`tests/probe-tool.mjs` 是手动探测单个工具的小工具（`node tests/probe-tool.mjs ping host=1.1.1.1`），
不参与 `run-all`。

> 这些脚本**不会**被装进用户环境：`package.json` 的 `files` 只列了运行期需要的文件，
> 而 `tests/` 不在其中——走插件页安装（pnpm 打包）时不会下载它们。git clone 或下载源码可以看到。


## 工具清单

共 33 个，按侧边栏分组：

| 分组 | 工具 | 实现要点 |
| --- | --- | --- |
| Datacom | 终端 / 设备簿 | 自研 VT100 子集 + 多会话标签页，设备分组保存，可钉成右上角浮窗 |
| | 设备配置采集 | SSH/Telnet 批量执行命令，自动处理 `---- More ----`，归档备份 |
| | 网络拓扑 | 手工绘制的简易拓扑：多张图纸、设备图标、缩放、虚线分组框，右键关联设备簿、双击跳到终端 |
| | SNMP 设备识别 | 纯 JS SNMP v2c GET，读 SYSTEM 组并推断厂商 |
| | 配置对比 | 两份配置并排 diff（LCS，按删除/新增/修改着色） |
| | 配置备份库 | 列出/查看/删除本机归档的配置 |
| | VRP / IOS 命令速查 | 128 条华为 VRP/H3C 与思科 IOS/NX-OS 命令对照，可搜索 |
| | 配置发送 DSH 提问 | 选备份生成提示词，复制到剪贴板并新建会话 |
| 连通性 | Ping | 系统 `ping` 逐包探测，解析 RTT/TTL，统计丢包与抖动 |
| | TCPing | TCP connect 计时，ICMP 被过滤时判断可达性 |
| | Traceroute | 系统 `tracert` / `traceroute`，逐跳地址与 RTT |
| | MTR | 多轮 traceroute，统计每跳丢包率、平均/最好/最差/抖动 |
| 扫描 | IP 扫描 | 网段/范围并发探测，TCP 或 ICMP，反解主机名 |
| | 端口扫描 | TCP connect 扫描，可选 banner 抓取 |
| | 扫描局域网 | UDP 触发 ARP + 读 ARP 表，反解主机名，OUI 厂商 |
| | 全国公共 DNS 测试 | 27 个公共 DNS 并发测解析时延并排序 |
| 域名 | 域名解析 | 原始 DNS 报文查询 A/AAAA/CNAME/MX/TXT/NS/SOA/SRV/CAA/PTR |
| | dig | 指定 DNS 服务器/类型/递归，输出含 TTL、标志位、权威段 |
| | WHOIS | RDAP（JSON）优先，回退 whois:43 原始文本 |
| | IP 地理定位 | 归属地/运营商/ASN，多服务回退；内网地址本地判断不外发 |
| 本机与二层 | 本机 IP 详细信息 | `Get-NetIPConfiguration` + 公网出口 IP（多探测源） |
| | 本机端口状态 | `netstat -ano` / `ss -tunap` 解析：监听、连接、进程、PID |
| | ARP 列表 | 点「查看列表」读缓存；选中一行后可删除单条，另有添加与全部删除（需提权） |
| 实用 | IP 计算器 | 纯本地：掩码换算、网络/广播、可用范围、二进制、子网划分 |
| | 进制换算器 | 纯本地：32 位整数四进制互转、逐位开关、移位与逻辑运算 |
| | 字节单位换算器 | 字节/比特与 KB·MiB 两套单位互转，附「标称容量 vs 系统显示」换算 |
| | SNTP 查询 | UDP 123 取时：本机时钟偏移、往返时延、层级 |
| | 时间转化 | 纯本地：时间戳/日期/时区/相对时间 |
| | 网络唤醒 | UDP 魔术包（6×FF + 16×MAC），设备可命名保存、一键唤醒、记录上次唤醒时间 |
| | HTTP 工具 | 主机侧发请求，状态/响应头/耗时/正文，NDJSON 流式回传 |
| | 网络测速 | HTTP 大文件上下行吞吐（默认 Cloudflare 端点） |
| | iperf3 | 调用本机 `iperf3`，解析 `-J` JSON |
| 综合 | 网络诊断 | 网卡 → 网关 → DNS → 解析 → 外网 → TCP 出站 → 公网出口，输出结论 |

## Agent 工具

一共 20 个，Agent 可以直接调用：

`nwtool_ping`、`nwtool_tcping`、`nwtool_traceroute`、`nwtool_dns`、`nwtool_http_request`、
`nwtool_port_scan`、`nwtool_ip_scan`、`nwtool_subnet_calc`、`nwtool_sntp`、
`nwtool_ip_geolocation`、`nwtool_local_ports`、`nwtool_arp_table`、
`nwtool_backup_list`、`nwtool_backup_read`、`nwtool_config_search`、`nwtool_config_diff`、
`nwtool_device_exec`、`nwtool_snmp_identify`、`nwtool_command_reference`、`nwtool_terminal`。

`nwtool_terminal` 只对**用户明确共享**的终端会话生效（共享开关默认关闭），危险命令仍要在页面上放行；
其余工具都是只读或本地计算，唯一的例外是 `nwtool_device_exec`（只读命令）与 ARP 写入（面板内，需提权）。

## 结构

```
index.js           Host 入口：注册 HTTP 端点与 Agent 工具
host/util.js       IPv4 运算、并发池、进程执行
host/i18n.js       主机侧翻译与 AsyncLocalStorage 语言上下文
host/data.js       公共 DNS 列表、OUI 子集、VRP/IOS 命令表、端口名
host/net.js        ICMP/TCP 探测、traceroute、MTR、扫描、WOL、网卡、测速、诊断
host/dns.js        DNS 报文编解码、dig、公共 DNS 测速、WHOIS/RDAP
host/http.js       HTTP 请求引擎
host/cli.js        Telnet 客户端、SSH 子进程、设备会话与分页处理
host/term.js       交互终端：设备簿（分组）、密码加密存储、Telnet/SSH 会话注册表（无人观看时保留 20 分钟）
host/history.js    会话的 256 KB 字节环形缓冲，供重新接上时重放
host/transcript.js 会话转录与模型命令审计（30 天 / 128 MB 自动清理，密码类字段打码）
host/sntp.js       SNTP 取时（UDP 123），四时间戳算偏移与往返时延
host/geo.js        IP 归属地：多服务回退，内网地址本地判断
host/local.js      本机套接字表（netstat/ss）与 ARP / 邻居表读写
host/diagram.js    网络拓扑画布的存取与校验（~/.dsh-nwtool/topology.json）
host/monitor.js    终端侧边栏：分厂商采样 CPU/内存/磁盘/网卡，文件浏览与 stat
host/datacom.js    备份归档、配置 diff、SNMP、命令速查、批量执行
host/engine.js     面板与 Agent 共用的工具调度表
host/api.js        POST /nwtool/api，NDJSON 流式事件
host/tools.js      Agent 工具定义
locale/messages.json  英文词典（中文为源语言）
scripts/sync-messages.mjs  把词典内联进 client.js
scripts/check-profile.mjs   启动前自检：profile 清单有没有 BOM、依赖有没有装丢
tests/             24 个自检脚本 + run-all.mjs（不随插件安装，见「自检」）
client.js          侧边栏图标 + 主面板 + 框架浮层（共享状态条、终端浮窗），纯 React.createElement，无构建步骤
LICENSE            MIT
```

面板与 Host 之间只有一条通道：`POST /nwtool/api`，请求体 `{op:'run', tool, params}`，
响应是按行分隔的 JSON 事件（`rows` / `stats` / `kv` / `sections` / `text` / `diff` /
`notice` / `error` / `done`）。浏览器中断请求即取消主机侧任务。

## 已知限制（有意为之）

- **SSH 不内置协议栈**：手写 SSH 传输层不现实。SSH 交给本机客户端——优先 PuTTY 的 `plink`
  （支持密码），否则用系统 `ssh`（`SSH_ASKPASS` 传递密码，需要 OpenSSH 8.4+）。Telnet 为原生实现。
- **iperf3 不内嵌二进制**：调用官方 `iperf3.exe`。把解压出来的 `iperf3.exe` 放到
  `%USERPROFILE%\.dsh-nwtool\bin\`（工具会先查这里，再查 PATH），面板会直接显示这个完整路径。
- **不做 SYN 快扫 / 原始套接字抓包**：需要管理员权限与原生 socket，Node 不提供。
- **拓扑靠手绘，不自动发现**：网络拓扑是一张可编辑的图纸，支持多张图纸（各自命名、随时切换），
  位置与关联都存在 `~/.dsh-nwtool/topology.json`；设备与设备簿的关联是手工指定的。
  自动发现（LLDP/CDP）需要管理员权限或设备凭据，本版未包含；旧版的单画布文件会自动迁移成一张图纸。
- **ARP 写入需要提权**：查看缓存不需要权限；添加静态条目、删除单条、全部清空在 Windows 需管理员、
  Linux 需 root。失败时把系统原话回显出来，不会假装成功。
- **监控与文件浏览要占用第二条连接**：为了不干扰交互终端的画面，侧边栏另开一条 CLI 会话（同一凭据），
  上限 8 条；关掉侧边栏或关闭标签页即断开。IOS 的网卡速率依赖 `show interfaces summary`，
  老平台没有该命令时只显示 CPU/内存/磁盘。
- **OUI 厂商库是精简子集**：离线只内置常见厂商，其余需在「扫描局域网」里开启在线查询
  （`api.macvendors.com`）。
- **中间跳 RTT 依赖系统 traceroute**：Windows 的 `ping` 对 TTL 超时回复不给时延，因此
  traceroute/MTR 使用 `tracert`，它才提供每跳 RTT。
- **发送给 DSH 的配置只能走剪贴板**：DSH 没有向已有输入框注入文本的插件接口，所以是
  「复制提示词 / 复制并新建会话」。

## 故障排查

### 启动瞬间崩溃：`Unexpected token '﻿'`

```
DesktopHostFatalError: Unexpected token '﻿', "﻿{
  "name"... is not valid JSON
    at readProfileManifest (.../dsh-app-boot/lib/index.js)
```

这不是插件的问题，但会让 DSH 起不来：`~/.dsh/profiles/<名字>/package.json` 被存成了
**UTF-8 带 BOM**。主机在加载任何插件之前就用 `JSON.parse` 读这个文件，而 `JSON.parse`
不接受开头的 U+FEFF。DSH 自己写这个文件时不会加 BOM——只在用编辑器/`Set-Content` 手工改过它
（比如手动加插件、改包名）之后才会出现。

排查与修复：

```bash
node scripts/check-profile.mjs          # 只检查，指出是哪个文件、哪一行
node scripts/check-profile.mjs --fix    # 去掉 BOM（只删 3 个字节，其余内容不动）
```

脚本同时会检查清单里声明的依赖是否真的在 `node_modules` 里——手工 `link:` 后指向不存在的目录，
同样会让下次启动失败。**在任何手工改动 `~/.dsh/profiles/*/package.json` 之后、重启之前跑一遍。**

保存这类文件时请用「UTF-8（无 BOM）」；PowerShell 5.1 的 `Set-Content` / `Out-File` 默认带 BOM，
`pwsh 7`、VS Code 默认不带。

## 安全说明

- 端点 `/nwtool/api` 只监听本机 DSH 的 Web 服务，**没有额外鉴权**：任何能在该端口发起请求的
  本机进程都可以调用这些网络能力（与浏览器同源页面一致）。请勿把 DSH Web 端口暴露到公网。
- **设备密码**：默认只在内存中使用（`每次输入`），不落盘、不写日志。选择 `保存密码` 时，密码用
  AES-256-GCM 加密后存进 `~/.dsh-nwtool/devices.json`，密钥在同目录的 `secret.key`。这能防止
  `devices.json` 被拷走后直接读出密码，但**挡不住以同一用户身份运行的代码**（它也能读到密钥）。
- **终端转录**：每个终端会话都会在 `~/.dsh-nwtool/term/` 落一份文本转录，保留 30 天、总量上限
  128 MB，超限自动清理；`password` / `secret` / `community` 一类的赋值会被打码成 `****`。
  模型代你输入的命令另外记在 `agent-YYYYMMDD.log`，便于事后核对。
- 配置文件备份存放在 `~/.dsh-nwtool/backups`，已保存的唤醒设备存放在 `~/.dsh-nwtool/wol-devices.json`。

## 开源与许可

MIT，见 [LICENSE](LICENSE)。

**没有引入任何第三方 npm 依赖**——`package.json` 里没有 `dependencies` / `devDependencies`，
插件目录里也没有 `node_modules`：它不安装任何东西，也没有构建步骤。逐项说明「零依赖」的边界：

| 东西 | 是否随插件分发 | 说明 |
| --- | --- | --- |
| Node 内置模块 | 否 | 只用 `node:net`、`node:dgram`、`node:dns`、`node:fs`、`node:crypto`、`node:child_process`、`node:os`、`node:path`、`node:url`、`node:async_hooks`，由 DSH 自带运行时提供 |
| `react` | 否 | 浏览器侧唯一的外部模块，由 DSH 在 `__ModuleLoader__` 里注入；插件不打包、不安装、不锁定版本 |
| 系统命令 | 否 | `ping`、`tracert`/`traceroute`、`netstat`/`ss`、`arp`、`ssh`、`plink`、`iperf3` 都是用户机器上已有的程序，各自遵循其自身许可证；缺了某个只影响对应工具 |
| 在线数据源 | 否 | RDAP（各注册局公开接口）、`api.macvendors.com`（厂商查询）、`myip.ipip.net` / `api.ipify.org` / `ipinfo.io`（公网 IP） |

因此本插件的代码全部为原创实现，不承担第三方代码的分发义务；但它调用的上述外部程序并非本插件所有。
