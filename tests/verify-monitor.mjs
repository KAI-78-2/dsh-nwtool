// Side-channel monitoring and the file browser: the vendor parsers, the delta
// maths and the path guard. Everything here is pure — no device is contacted.
import {
  parseDirOutput,
  parseIosSample,
  parseLinuxSample,
  parseLsOutput,
  parseVrpSample,
  safePath,
} from '../host/monitor.js'

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

/* ------------------------------------------------------------------ */
/* Linux                                                               */
/* ------------------------------------------------------------------ */

const linuxFirst = [
  'cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 50 0 50 400 0 0 0 0 0 0',
  'MemTotal:       16316312 kB\nMemFree:          234567 kB\nMemAvailable:    8765432 kB',
  '0.52 0.58 0.59 1/2345 67890',
  [
    'Filesystem     1024-blocks      Used Available Capacity Mounted on',
    '/dev/sda1        102687672  51234568  46218520      53% /',
    'tmpfs              8158156         0   8158156       0% /dev/shm',
    '/dev/sdb1         51474912   1024480  47835696       3% /data',
  ].join('\n'),
  [
    'Inter-|   Receive                                                |  Transmit',
    ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets',
    '    lo:    1234      12    0    0    0     0          0         0     1234      12',
    '  eth0: 987654321  123456    0    0    0     0          0         0  123456789   98765',
  ].join('\n'),
]

const linuxSecond = [
  'cpu  200 0 200 1600 0 0 0 0 0 0',
  linuxFirst[1],
  linuxFirst[2],
  linuxFirst[3],
  linuxFirst[4].replace('  eth0: 987654321', '  eth0: 988654321').replace('  123456789   98765', '  123656789   98765'),
]

const first = parseLinuxSample(linuxFirst)
expect('linux memory comes from meminfo', first.memory?.total === 16316312 * 1024, String(first.memory?.total))
expect('linux memory uses MemAvailable', first.memory?.percent === Math.round(((16316312 - 8765432) / 16316312) * 1000) / 10,
  String(first.memory?.percent))
expect('linux load comes from loadavg', first.load?.one === 0.52, JSON.stringify(first.load))
expect('linux disks are parsed and rooted first', first.disk[0]?.mount === '/' && first.disk.length === 2,
  JSON.stringify(first.disk.map((disk) => disk.mount)))
expect('linux tmpfs is skipped', !first.disk.some((disk) => disk.mount === '/dev/shm'))
expect('linux interface counters are kept', Object.keys(first.next.net).includes('eth0'))
expect('linux cpu needs two samples', first.cpu === null && first.nic[0]?.rxBps === null)

const second = parseLinuxSample(linuxSecond, first.next)
expect('linux cpu is a delta', second.cpu?.percent === 20, String(second.cpu?.percent))
expect('linux nic rate is a delta', second.nic[0]?.rxBps > 0, String(second.nic[0]?.rxBps))

/* ------------------------------------------------------------------ */
/* Huawei VRP                                                          */
/* ------------------------------------------------------------------ */

const vrp = parseVrpSample([
  ['CPU Usage Stat. Cycle: 60 (Second)', 'CPU Usage            : 7%  Max: 12%'].join('\n'),
  ['Memory utilization  : 34%', 'Total Memory        : 1024 MB', 'Total Used Memory   : 348 MB', 'Total Free Memory   : 676 MB'].join('\n'),
  ['Directory of flash:/', '', '  Idx  Attr     Size(Byte)  Date        Time       FileName',
    '    0  -rw-          1,024  Nov 11 2026 10:00:00   vrpcfg.zip',
    '    1  drwx             -   Nov 11 2026 10:00:00   logfile', '',
    '  1,048,576 KB total (524,288 KB free)'].join('\n'),
  ['Interface                   PHY     Protocol InUti OutUti   inErrors  outErrors',
    'GigabitEthernet0/0/1        up      up          4%    12%          0          0',
    'GigabitEthernet0/0/2        down    down        0%     0%          0          0'].join('\n'),
])

expect('vrp cpu usage', vrp.cpu?.percent === 7, String(vrp.cpu?.percent))
expect('vrp memory utilization', vrp.memory?.percent === 34 && vrp.memory.total === 1024 ** 3, String(vrp.memory?.total))
expect('vrp flash total', vrp.disk[0]?.total === 1024 ** 3 && vrp.disk[0].free === 512 * 1024 * 1024, JSON.stringify(vrp.disk[0]))
expect('vrp interfaces with utilisation', vrp.nic.length === 2 && vrp.nic[0].inUti === 4 && vrp.nic[1].up === false,
  JSON.stringify(vrp.nic[1]))

/* ------------------------------------------------------------------ */
/* Cisco IOS                                                           */
/* ------------------------------------------------------------------ */

const ios = parseIosSample([
  'CPU utilization for five seconds: 5%/0%; one minute: 4%; five minutes: 3%',
  'Processor   88D4F2C0  674105364  189221632  484883732  484883732  483000000',
  ['Directory of flash:/', '', '    1  -rw-     1234560  Nov 12 2026 03:00:00 +08:00  c2900-universalk9.bin',
    '    2  -rw-         500  Nov 12 2026 03:00:00 +08:00  startup-config', '',
    '67108864 bytes total (33554432 bytes free)'].join('\n'),
  ['Interface            IHQ   IQD  OHQ   OQD  RXBS RXPS  TXBS TXPS TRTL',
    'GigabitEthernet1     0     0    0     0    1000 1     2000 2    0'].join('\n'),
])

expect('ios cpu five seconds', ios.cpu?.percent === 5, String(ios.cpu?.percent))
expect('ios load uses one and five minutes', ios.load?.one === 4 && ios.load.five === 3, JSON.stringify(ios.load))
expect('ios memory statistics', ios.memory?.total === 674105364 && ios.memory.used === 189221632, JSON.stringify(ios.memory))
expect('ios flash usage', ios.disk[0]?.percent === 50, String(ios.disk[0]?.percent))
expect('ios interface rates', ios.nic[0]?.rxBps === 1000 && ios.nic[0].txBps === 2000, JSON.stringify(ios.nic[0]))

/* ------------------------------------------------------------------ */
/* Directory listings                                                  */
/* ------------------------------------------------------------------ */

const vrpDir = parseDirOutput([
  'Directory of flash:/',
  '',
  '  Idx  Attr     Size(Byte)  Date        Time       FileName',
  '    0  -rw-          1,024  Nov 11 2026 10:00:00   vrpcfg.zip',
  '    1  drwx             -   Nov 11 2026 10:00:00   logfile',
  '',
  '  1,048,576 KB total (524,288 KB free)',
].join('\n'))
expect('vrp dir lists entries', vrpDir.entries.length === 2, JSON.stringify(vrpDir.entries.map((entry) => entry.name)))
expect('vrp dir marks directories', vrpDir.entries[1]?.type === 'dir')
expect('vrp dir carries the total and free space', vrpDir.total === 1024 ** 3 && vrpDir.free === 512 * 1024 * 1024)

const iosDir = parseDirOutput([
  'Directory of flash:/',
  '',
  '    1  -rw-     1234560  Nov 12 2026 03:00:00 +08:00  c2900-universalk9.bin',
  '',
  '67108864 bytes total (33554432 bytes free)',
].join('\n'))
expect('ios dir strips the timezone from names', iosDir.entries[0]?.name === 'c2900-universalk9.bin',
  JSON.stringify(iosDir.entries[0]))
expect('ios dir reads the byte summary', iosDir.total === 67108864, String(iosDir.total))

const lsDir = parseLsOutput([
  'total 28',
  'drwxr-xr-x  2 root root 4096 Nov 12 03:00 bin',
  '-rw-r--r--  1 root root  123 Nov 12 03:00 a.txt',
  'lrwxrwxrwx  1 root root    7 Nov 12 03:00 link -> /usr/bin/x',
  '-rw-r--r--  1 root root  456 Nov 12 03:00 my file.txt',
].join('\n'))
expect('ls lists every entry', lsDir.entries.length === 4, String(lsDir.entries.length))
expect('ls keeps names with spaces', lsDir.entries[3]?.name === 'my file.txt', JSON.stringify(lsDir.entries[3]?.name))
expect('ls separates a symlink target', lsDir.entries[2]?.type === 'link' && lsDir.entries[2].target === '/usr/bin/x')
expect('ls keeps the size and mode', lsDir.entries[1]?.size === 123 && lsDir.entries[1].mode.startsWith('-'))

/* ------------------------------------------------------------------ */
/* Path guard                                                          */
/* ------------------------------------------------------------------ */

const allowed = ['', '/', '/var/log', '.', '..', '/etc/nginx/nginx.conf', 'flash:', 'flash:/logfile', 'C:/Users']
const refused = ['/etc; reboot', '$(reboot)', '`id`', '/var/log | cat', 'a b', '/tmp/&&rm', '/x|y']
expect('safe paths are accepted', allowed.every((item) => safePath(item) === item.trim()), allowed.join(' '))
let refusedCount = 0
for (const item of refused) {
  try {
    safePath(item)
  } catch {
    refusedCount += 1
  }
}
expect('shell metacharacters are refused', refusedCount === refused.length, `${refusedCount}/${refused.length}`)
let longRefused = false
try {
  safePath(`/${'a'.repeat(200)}`)
} catch {
  longRefused = true
}
expect('overlong paths are refused', longRefused)

console.log(failures === 0 ? '\nmonitor and file browser behave' : `\n${failures} monitor check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
