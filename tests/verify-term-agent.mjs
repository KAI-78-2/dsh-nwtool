// DSH access to a shared terminal: reading, typing, the dangerous-command
// approval gate, and the redacted on-disk transcript.
//
// Everything runs against a throwaway home directory and a fake Telnet device,
// so no real device is touched and nothing lands in the real ~/.dsh-nwtool.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nwtool-agent-'))
process.env.USERPROFILE = home
process.env.HOME = home

const term = await import('../host/term.js')
const transcript = await import('../host/transcript.js')

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(25)
  }
  return predicate()
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

expect('a cipher blob is masked', transcript.redactLine(' set authentication password cipher %^%#abc%^%#') === ' set authentication password ****',
  transcript.redactLine(' set authentication password cipher %^%#abc%^%#'))
expect('an snmp community is masked', transcript.redactLine('snmp-agent community read public') === 'snmp-agent community ****',
  transcript.redactLine('snmp-agent community read public'))
expect('an enable secret is masked', transcript.redactLine('enable secret 5 $1$abcd$efgh') === 'enable secret ****',
  transcript.redactLine('enable secret 5 $1$abcd$efgh'))
expect('ordinary output is untouched', transcript.redactLine('display version') === 'display version')
expect('a bare prompt does not trip the mask', transcript.redactLine('Password: ') === 'Password: ',
  JSON.stringify(transcript.redactLine('Password: ')))

/* ------------------------------------------------------------------ */
/* Fake device                                                         */
/* ------------------------------------------------------------------ */

const received = []
const receivedText = () => Buffer.concat(received).toString('latin1')

const server = net.createServer((socket) => {
  socket.on('error', () => {})
  socket.write('switch> ')
  socket.on('data', (chunk) => {
    received.push(Buffer.from(chunk))
    const text = chunk.toString('utf8')
    socket.write(chunk)
    if (text.includes('display current-configuration')) {
      socket.write('\r\n sysname CORE-1\r\n set authentication password cipher %^%#topsecret%^%#\r\nswitch> ')
      return
    }
    if (text.includes('display version')) {
      socket.write('\r\nHuawei Versatile Routing Platform V5.10\r\nswitch> ')
      return
    }
    if (text.includes('reboot')) {
      socket.write('\r\nSystem rebooting\r\n')
      return
    }
    if (text.includes('reload')) {
      socket.write('\r\nReload scheduled\r\n')
      return
    }
    socket.write('\r\nswitch> ')
  })
})
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

const session = await term.openSession(
  { name: 'fake-switch', host: '127.0.0.1', port, protocol: 'telnet', authMode: 'prompt' },
  '',
  { cols: 80, rows: 24 },
)
await sleep(300)

/* ------------------------------------------------------------------ */
/* Sharing is the gate                                                 */
/* ------------------------------------------------------------------ */

let refused = null
try {
  await term.sendSessionLine('fake-switch', 'display version')
} catch (error) {
  refused = error
}
expect('an unshared session refuses commands', /共享/.test(refused?.message ?? ''), refused?.message ?? '')
expect('nothing was typed into an unshared session', !receivedText().includes('display version'))

let refusedRead = null
try {
  term.readSessionOutput('fake-switch', { lines: 10 })
} catch (error) {
  refusedRead = error
}
expect('an unshared session refuses reads', /共享/.test(refusedRead?.message ?? ''), refusedRead?.message ?? '')

const shared = term.setSessionShared(session.id, true)
expect('sharing can be turned on', shared === true)
expect('the session list reports the share state', term.listSessions().find((item) => item.id === session.id)?.shared === true)

/* ------------------------------------------------------------------ */
/* Read and type                                                       */
/* ------------------------------------------------------------------ */

const events = []
const release = session.onEvent((event) => events.push(event))

const sent = await term.sendSessionLine('fake-switch', 'display version')
expect('the command reaches the device', receivedText().includes('display version'))
expect('the answer comes back without the echo', sent.text.includes('Huawei Versatile') && !sent.text.startsWith('display version'),
  JSON.stringify(sent.text.slice(0, 50)))
expect('the answer carries a cursor', Number(sent.cursor) > 0, String(sent.cursor))
expect('the model sees running then idle', events.filter((event) => event.t === 'agent').map((event) => event.d.state).join(',') === 'running,idle',
  events.filter((event) => event.t === 'agent').map((event) => event.d.state).join(','))

const read = term.readSessionOutput('fake-switch', { lines: 10 })
expect('read returns the recent output', read.text.includes('Huawei Versatile'), JSON.stringify(read.text.slice(0, 50)))
expect('read returns a cursor', Number(read.cursor) >= Number(sent.cursor), `${read.cursor} vs ${sent.cursor}`)
const readAfter = term.readSessionOutput('fake-switch', { since: read.cursor })
expect('reading from the cursor returns only new output', readAfter.text === '', JSON.stringify(readAfter.text))

term.sendSessionKey('fake-switch', 'ctrl-c')
await sleep(150)
expect('a control key reaches the device', receivedText().includes('\u0003'))

/* ------------------------------------------------------------------ */
/* Dangerous commands                                                  */
/* ------------------------------------------------------------------ */

const deniedCall = term.sendSessionLine('fake-switch', 'reboot')
await waitFor(() => events.some((event) => event.t === 'approval'))
const firstApproval = events.find((event) => event.t === 'approval')
expect('a dangerous command asks the page first', Boolean(firstApproval) && firstApproval.d.line === 'reboot',
  JSON.stringify(firstApproval?.d ?? {}))
expect('the command is held until answered', !receivedText().includes('reboot'))

session.approve(firstApproval.d.id, false)
let denial = null
try {
  await deniedCall
} catch (error) {
  denial = error
}
expect('a refusal blocks the command', /未获授权/.test(denial?.message ?? ''), denial?.message ?? '')
expect('a refused command never reaches the device', !receivedText().includes('reboot'))

const approvedCall = term.sendSessionLine('fake-switch', 'reboot')
await waitFor(() => events.filter((event) => event.t === 'approval').length === 2)
const secondApproval = events.filter((event) => event.t === 'approval').at(-1)
session.approve(secondApproval.d.id, true)
const approved = await approvedCall
expect('an approved command is typed', receivedText().includes('reboot'), '')
expect('the approved command returns its output', approved.text.includes('System rebooting'), JSON.stringify(approved.text.slice(0, 40)))

/* A page that goes away must not leave a command waiting for ever. */
const orphanCall = term.sendSessionLine('fake-switch', 'reload')
await waitFor(() => events.filter((event) => event.t === 'approval').length === 3)
release()
session.cancelUnwatchedApprovals()
let orphan = null
try {
  await orphanCall
} catch (error) {
  orphan = error
}
expect('an unwatched approval is refused at once', /未获授权/.test(orphan?.message ?? ''), orphan?.message ?? '')

/* ------------------------------------------------------------------ */
/* Transcript                                                          */
/* ------------------------------------------------------------------ */

term.setSessionShared(session.id, true)
const config = await term.sendSessionLine('fake-switch', 'display current-configuration')
expect('the configuration came back to the model', config.text.includes('sysname CORE-1'), JSON.stringify(config.text.slice(0, 40)))

term.closeSession(session.id)
await sleep(300)

const logDir = transcript.transcriptDir()
const logs = fs.existsSync(logDir) ? fs.readdirSync(logDir).filter((name) => name.endsWith('.log') && !name.startsWith('agent-')) : []
expect('a transcript file is written', logs.length === 1, logs.join(','))
const logPath = logs.length ? path.join(logDir, logs[0]) : ''
const logText = logPath ? fs.readFileSync(logPath, 'utf8') : ''
expect('the transcript keeps the device output', logText.includes('Huawei Versatile'), JSON.stringify(logText.slice(0, 40)))
expect('the transcript keeps the command', logText.includes('display version'))
expect('the transcript masks the cipher', logText.includes('password ****') && !logText.includes('topsecret'),
  JSON.stringify(logText.split('\n').filter((line) => line.includes('password')).slice(0, 2)))
expect('the transcript is plain text', !logText.includes('\u001b['), 'no escapes')

const auditLogs = fs.readdirSync(logDir).filter((name) => name.startsWith('agent-'))
expect('model-issued commands are audited', auditLogs.length === 1, auditLogs.join(','))
const audit = auditLogs.length ? fs.readFileSync(path.join(logDir, auditLogs[0]), 'utf8') : ''
expect('the audit records the refusal', audit.includes('denied') && audit.includes('reboot'), audit.split('\n')[0] ?? '')
expect('the audit records the approval', audit.includes('approved'), '')

/* Retention: an old transcript is pruned, a fresh one is kept. */
const oldFile = path.join(logDir, '20000101-000000-old_host-deadbeef.log')
fs.writeFileSync(oldFile, 'old session\n')
const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
fs.utimesSync(oldFile, past, past)
const pruned = await transcript.pruneTranscripts({ force: true })
expect('an expired transcript is deleted', pruned.removed >= 1 && !fs.existsSync(oldFile), `removed ${pruned.removed}`)
expect('the fresh transcript survives pruning', fs.existsSync(logPath), logPath)

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

term.disposeSessions()
server.close()
fs.rmSync(home, { recursive: true, force: true })

console.log(failures === 0 ? '\nshared terminal access works' : `\n${failures} agent check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
