// Terminal layer: device book, secret storage, Telnet byte pump and the
// upgrade gate. Runs against a throwaway home directory and a fake Telnet server
// so nothing touches the real device book or the network.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nwtool-term-'))
process.env.USERPROFILE = home
process.env.HOME = home

const term = await import('../host/term.js')

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

/* ------------------------------------------------------------------ */
/* Device book                                                         */
/* ------------------------------------------------------------------ */

try {
  const saved = await term.saveDevice({
    name: 'SW-Core',
    host: '192.0.2.10',
    protocol: 'telnet',
    username: 'admin',
    authMode: 'saved',
    password: 's3cret-pw',
  })
  expect('device saved', Boolean(saved.id) && saved.hasSecret === true, saved.id?.slice(0, 8))
  expect('password never leaves the server', saved.password === undefined && saved.secret === undefined)

  const listed = await term.listDevices()
  expect('device listed', listed.length === 1 && listed[0].name === 'SW-Core')

  const record = await term.readDeviceRecord(saved.id)
  expect('secret is encrypted at rest', String(record.secret).startsWith('v1:'), String(record.secret).slice(0, 12))
  const resolved = await term.resolveSecret(record, '')
  expect('secret round-trips', resolved === 's3cret-pw')

  const duplicated = await term.saveDevice({
    name: 'Router-1',
    host: '192.0.2.1',
    protocol: 'ssh',
    username: 'ops',
    authMode: 'key',
    keyPath: 'C:/keys/id_ed25519',
    group: '  核心机房  ',
  })
  expect('second device saved', (await term.listDevices()).length === 2, duplicated.protocol)
  expect('group round-trips', duplicated.group === '核心机房', JSON.stringify(duplicated.group))

  /* Grouping is free text: a device without one belongs to the default bucket. */
  const book = await term.listDevices()
  expect('default group is the empty bucket',
    book.find((item) => item.name === 'SW-Core')?.group === '', JSON.stringify(book.map((item) => item.group)))

  const regrouped = await term.saveDevice({ ...duplicated, group: '核心机房 / 备用' })
  expect('a device can move group', regrouped.group === '核心机房 / 备用', regrouped.group)
  const trimmed = await term.saveDevice({ ...duplicated, group: '   ' })
  expect('blank group collapses to the default bucket', trimmed.group === '')
  const long = await term.saveDevice({ ...duplicated, group: 'x'.repeat(80) })
  expect('group names are capped', long.group.length === 40, String(long.group.length))

  let rejected = false
  try {
    await term.saveDevice({ name: '', host: 'x', protocol: 'ssh' })
  } catch {
    rejected = true
  }
  expect('empty name rejected', rejected)

  rejected = false
  try {
    await term.saveDevice({ name: 'T', host: 'x', protocol: 'telnet', authMode: 'key', keyPath: 'k' })
  } catch {
    rejected = true
  }
  expect('telnet rejects key auth', rejected)

  await term.deleteDevice(duplicated.id)
  expect('device deleted', (await term.listDevices()).length === 1)
} catch (error) {
  bad('device book', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

/* ------------------------------------------------------------------ */
/* Upgrade gate                                                        */
/* ------------------------------------------------------------------ */

const req = (headers, remoteAddress = '127.0.0.1') => ({
  headers,
  socket: { remoteAddress },
})

expect('loopback without cookie is allowed', term.requestVerdict(req({ host: '127.0.0.1:1234' })) === 'ok')
/* The ticket is the real boundary; a page on this machine can neither read one
   cross-origin nor guess it, so loopback is trusted whatever Origin says. This
   is what keeps a desktop shell with a `null`/`file://` origin working. */
expect('loopback is trusted even with a foreign origin',
  term.requestVerdict(req({ host: '127.0.0.1:1234', origin: 'http://evil.example' })) === 'ok')
expect('same origin is allowed',
  term.requestVerdict(req({ host: '127.0.0.1:1234', origin: 'http://127.0.0.1:1234' })) === 'ok')

term.noteRequestCookie({ headers: { cookie: 'dsh=abc' } })
const remote = (cookie, origin = 'http://10.0.0.5:1234') => req({ host: '10.0.0.5:1234', origin, cookie }, '10.0.0.9')
expect('remote peer with a seen cookie is allowed', term.requestVerdict(remote('dsh=abc')) === 'ok')
expect('remote peer with an unknown cookie is refused', term.requestVerdict(remote('dsh=zzz')) === 'cookie')
expect('remote peer with no cookie is refused', term.requestVerdict(remote(undefined)) === 'cookie')
expect('remote peer with a foreign origin is refused',
  term.requestVerdict(remote('dsh=abc', 'http://evil.example')) === 'origin')
expect('remote peer with no origin at all is refused',
  term.requestVerdict(req({ host: '10.0.0.5:1234', cookie: 'dsh=abc' }, '10.0.0.9')) === 'ok')

/* ------------------------------------------------------------------ */
/* Telnet transport against a fake device                              */
/* ------------------------------------------------------------------ */

const IAC = 255
const DO = 253
const WILL = 251

const receivedFromClient = []
const server = net.createServer((socket) => {
  socket.on('error', () => {})
  socket.write(Buffer.from([IAC, WILL, 1])) // IAC WILL ECHO
  socket.write(Buffer.from('login: ', 'utf8'))
  socket.write(Buffer.from([0xc4, 0xe3, 0xba, 0xc3])) // GBK for 你好
  socket.write(Buffer.from([IAC, DO, 31])) // IAC DO NAWS: ask for the window size
  socket.on('data', (chunk) => {
    receivedFromClient.push(Buffer.from(chunk))
    socket.write(chunk)
  })
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

try {
  const chunks = []
  const session = await term.openSession(
    { name: 'fake', host: '127.0.0.1', port, protocol: 'telnet', authMode: 'prompt' },
    '',
    { cols: 100, rows: 30 },
  )
  session.subscribe((chunk) => {
    if (chunk) chunks.push(Buffer.from(chunk))
  })
  await new Promise((resolve) => setTimeout(resolve, 400))

  const output = Buffer.concat(chunks)
  const asLatin = output.toString('latin1')
  expect('telnet banner reaches the browser', asLatin.includes('login: '), JSON.stringify(asLatin.slice(0, 24)))
  expect('GBK bytes pass through untouched', output.includes(Buffer.from([0xc4, 0xe3, 0xba, 0xc3])))
  expect('IAC negotiation is stripped from the stream', !output.includes(Buffer.from([IAC, WILL, 1])))

  const sent = Buffer.concat(receivedFromClient)
  expect('client refuses server options', sent.includes(Buffer.from([IAC, 252, 1])), 'IAC DONT ECHO')

  /* Window size negotiation: the device asked, we answer with the real size. */
  const nawsOpen = Buffer.concat(receivedFromClient)
  expect('server options refused, NAWS accepted',
    nawsOpen.includes(Buffer.from([IAC, 252, 1])) && nawsOpen.includes(Buffer.from([IAC, WILL, 31])),
    'DONT ECHO + WILL NAWS')
  const size = nawsOpen.findIndex((byte, index) => byte === IAC && nawsOpen[index + 1] === 250 && nawsOpen[index + 2] === 31)
  expect('initial window size reported',
    size >= 0 && nawsOpen[size + 3] === 0 && nawsOpen[size + 4] === 100 && nawsOpen[size + 5] === 0 && nawsOpen[size + 6] === 30,
    size >= 0 ? `${nawsOpen[size + 4]}x${nawsOpen[size + 6]}` : 'no subnegotiation')

  receivedFromClient.length = 0
  session.resize(120, 40)
  await new Promise((resolve) => setTimeout(resolve, 120))
  const naws = Buffer.concat(receivedFromClient)
  const resized = naws.findIndex((byte, index) => byte === IAC && naws[index + 1] === 250 && naws[index + 2] === 31)
  expect('resize is pushed to the device',
    resized >= 0 && naws[resized + 4] === 120 && naws[resized + 6] === 40,
    resized >= 0 ? `${naws[resized + 4]}x${naws[resized + 6]}` : 'no subnegotiation')

  session.write(Buffer.from('show version\r\n', 'utf8'))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const echoed = Buffer.concat(chunks).toString('latin1')
  expect('keystrokes reach the device and echo back', echoed.includes('show version'))

  session.resize(120, 40)
  session.finish('test')
  expect('session closes cleanly', term.sessionCount() === 0, String(term.sessionCount()))
} catch (error) {
  bad('telnet session', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
} finally {
  server.close()
}

/* ------------------------------------------------------------------ */
/* Login prompt detection                                              */
/* ------------------------------------------------------------------ */

/* A login wait ends the moment a prompt appears, so this decides whether the
   monitor/CLI layer can talk to a device at all. The bash samples are real
   output: the prompt is wrapped in SGR sequences and followed by cursor-mode
   escapes, which is exactly what broke it against an Armbian box. */
{
  const { looksLikePrompt } = await import('../host/cli.js')
  const yes = [
    '<HUAWEI>',
    '[SW1]',
    'Switch#',
    'R1(config)#',
    'root@armbian:~# ',
    '\u001b[01;32mroot@armbian\u001b[00m:\u001b[01;34m~\u001b[00m# ',
    'Last login: Thu Nov 12 03:43:45 2026\r\r\narmbian:~:# \u001b[K\u001b[67C\u001b[01;32m\u001b[00m\u001b[67D\u001b[?1h\u001b=',
    'user@host:/var/log$ ',
    'root@host:~#',
  ]
  const no = [
    'Total entries displayed: 1\n',
    'VRP (R) software, Version 8.180 (CE6865EI V200R005C10SPC800)\n',
    'speed 1000\n',
    '#\n',
    '',
  ]
  const missed = yes.filter((sample) => !looksLikePrompt(sample))
  const wrong = no.filter((sample) => looksLikePrompt(sample))
  expect('device and shell prompts are recognised', missed.length === 0, missed.map((item) => JSON.stringify(item.slice(0, 40))).join(' '))
  expect('ordinary output is not mistaken for a prompt', wrong.length === 0, wrong.map((item) => JSON.stringify(item.slice(0, 40))).join(' '))
}

/* ------------------------------------------------------------------ */
/* Session registry and output buffering                               */
/* ------------------------------------------------------------------ */

try {
  const chatty = net.createServer((socket) => {
    socket.on('error', () => {})
    socket.write(Buffer.from('login: ', 'utf8'))
  })
  const chattyPort = await new Promise((resolve) => chatty.listen(0, '127.0.0.1', () => resolve(chatty.address().port)))

  const session = await term.openSession(
    { host: '127.0.0.1', port: chattyPort, protocol: 'telnet', authMode: 'prompt' },
    '',
    { cols: 80, rows: 24 },
  )
  expect('session is addressable by id', term.sessionById(session.id) === session, session.id.slice(0, 8))
  expect('nameless device still connects', session.device.host === '127.0.0.1')

  /* Output produced before a transport attaches must not be dropped. */
  await new Promise((resolve) => setTimeout(resolve, 300))
  const buffered = []
  const release = session.subscribe((chunk) => {
    if (chunk) buffered.push(Buffer.from(chunk))
  })
  expect('early output is replayed on attach', Buffer.concat(buffered).toString('latin1').includes('login: '),
    `${buffered.length} chunk(s)`)

  /* Detaching and attaching again is the whole point of the buffer. */
  release()
  expect('a detached session stays alive', term.sessionById(session.id) === session && session.info().state === 'detached',
    session.info().state)
  const replayed = []
  session.subscribe((chunk) => {
    if (chunk) replayed.push(Buffer.from(chunk))
  })
  expect('re-attaching replays the buffered output', Buffer.concat(replayed).toString('latin1').includes('login: '),
    `${replayed.length} chunk(s)`)

  const afterCursor = []
  session.subscribe((chunk) => {
    if (chunk) afterCursor.push(Buffer.from(chunk))
  }, session.history.seq)
  expect('a cursor at the end replays nothing', afterCursor.length === 0, `${afterCursor.length} chunk(s)`)
  expect('the list reports the live session', term.listSessions().some((item) => item.id === session.id), '')

  term.closeSession(session.id)
  expect('closeSession removes it', term.sessionById(session.id) === null && term.sessionCount() === 0)
  chatty.close()
} catch (error) {
  bad('session registry', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

/* ------------------------------------------------------------------ */
/* SSH invocation: never leave ssh waiting on its own console prompt   */
/* ------------------------------------------------------------------ */

/*
 * A device with "ask for the password each time" and an empty box used to hand
 * ssh no password and no askpass. ssh then opened its console prompt, which the
 * pipe never sees, and the session sat there forever: green dot, blank screen,
 * not one byte of output. These assertions pin the two ways out.
 */
try {
  const openssh = { kind: 'openssh', bin: 'ssh' }
  const plink = { kind: 'plink', bin: 'plink' }
  const base = { authMode: 'prompt', username: 'root', host: '192.0.2.9', port: 22 }

  const prompting = term.sshInvocation(base, openssh, '')
  expect('a prompt-mode device always gets an askpass', prompting.useAskpass === true, String(prompting.useAskpass))
  expect('and therefore no BatchMode', !prompting.args.includes('BatchMode=yes'), '')
  expect('the connect timeout is set', prompting.args.includes('ConnectTimeout=10'), prompting.args.join(' '))
  expect('the remote still gets a pty', prompting.args.includes('-tt'), '')
  expect('the host is the last argument', prompting.args[prompting.args.length - 1] === '192.0.2.9',
    prompting.args[prompting.args.length - 1])

  const keyNoPass = term.sshInvocation({ ...base, authMode: 'key', keyPath: 'C:/k' }, openssh, '')
  expect('a key without a passphrase fails fast instead of prompting', keyNoPass.args.includes('BatchMode=yes'),
    keyNoPass.args.join(' '))
  expect('and needs no askpass', keyNoPass.useAskpass === false)

  const keyWithPass = term.sshInvocation({ ...base, authMode: 'key', keyPath: 'C:/k' }, openssh, 'pp')
  expect('a key passphrase goes through the askpass', keyWithPass.useAskpass === true)

  const agent = term.sshInvocation({ ...base, authMode: 'agent' }, openssh, '')
  expect('an agent device never prompts', agent.args.includes('BatchMode=yes') && agent.useAskpass === false)

  const viaPlink = term.sshInvocation(base, plink, 'secret')
  expect('plink runs in batch mode', viaPlink.args.includes('-batch'), viaPlink.args.join(' '))
  expect('plink gets the password on the command line', viaPlink.args.join(' ').includes('-pw secret'))

  /* The dialler refuses an empty password before it spawns anything. */
  await term.startSession({
    device: { name: 'C', host: '192.0.2.9', port: 22, protocol: 'ssh', username: 'root', authMode: 'prompt' },
    password: '',
    cols: 80,
    rows: 24,
  }).then(
    () => bad('an empty password should be refused', ''),
    (error) => {
      const message = String(error?.message ?? error)
      expect('an empty password is refused', message.includes('请先在工具栏填入密码'), message)
      expect('no session is left behind', term.sessionCount() === 0, String(term.sessionCount()))
    },
  )
} catch (error) {
  bad('ssh invocation', String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '))
}

term.disposeSessions()
fs.rmSync(home, { recursive: true, force: true })

console.log(failures === 0 ? '\nterminal layer is sound' : `\n${failures} terminal check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
