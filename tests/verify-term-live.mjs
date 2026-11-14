// End-to-end check of the terminal channel against the running GUI:
// open a streamed session over plain HTTP, talk to a fake Telnet device, drive
// it with the input/resize/close operations, then drop the stream the way a
// panel unmount does and re-attach to the same live session.
import net from 'node:net'

const port = process.env.NWTOOL_PORT ?? '2208'
const base = `http://127.0.0.1:${port}`

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))

const api = async (body) => {
  const response = await fetch(`${base}/nwtool/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nwtool-lang': 'zh' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`non-JSON reply (${response.status}): ${text.slice(0, 120)}`)
  }
}

/** Watch one NDJSON response without blocking on its end. */
function watch(response) {
  const decoder = new TextDecoder()
  const events = []
  const chunks = []
  let buffer = ''
  let sessionId = ''
  let ended = false
  const reader = response.body.getReader()

  const done = (async () => {
    try {
      for (;;) {
        const { done: finished, value } = await reader.read()
        if (finished) break
        buffer += decoder.decode(value, { stream: true })
        let index = buffer.indexOf('\n')
        while (index >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          index = buffer.indexOf('\n')
          if (!line.trim()) continue
          const event = JSON.parse(line)
          events.push(event)
          if (event.t === 'ready') sessionId = event.d.sessionId
          if (event.t === 'data') chunks.push(Buffer.from(event.d, 'base64'))
        }
      }
    } catch {
      /* the test dropped the stream on purpose */
    } finally {
      ended = true
    }
  })()

  return {
    done,
    events,
    types: () => events.map((event) => event.t),
    text: () => Buffer.concat(chunks).toString('utf8'),
    get sessionId() {
      return sessionId
    },
    get ended() {
      return ended
    },
    async drop() {
      try {
        await reader.cancel()
      } catch {
        /* already gone */
      }
    },
  }
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

/* A fake device that greets, echoes and reports its window size. */
const seen = []
const device = net.createServer((socket) => {
  socket.on('error', () => {})
  socket.write('\u001b[32mWelcome to FakeSwitch\u001b[0m\r\nswitch> ')
  socket.on('data', (chunk) => {
    seen.push(Buffer.from(chunk))
    socket.write(chunk)
  })
})
const devicePort = await new Promise((resolve) => device.listen(0, '127.0.0.1', () => resolve(device.address().port)))

try {
  /* 1. Open ------------------------------------------------------------- */
  const response = await fetch(`${base}/nwtool/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nwtool-lang': 'zh' },
    body: JSON.stringify({
      op: 'term.open',
      device: { name: 'fake-switch', host: '127.0.0.1', port: devicePort, protocol: 'telnet', authMode: 'prompt' },
      cols: 80,
      rows: 24,
    }),
  })
  expect('stream opens with 200', response.status === 200, String(response.status))
  expect('stream is ndjson', String(response.headers.get('content-type')).includes('ndjson'))

  const first = watch(response)
  await waitFor(() => first.text().includes('Welcome to FakeSwitch'))
  expect('ready event with a session id', Boolean(first.sessionId), first.sessionId.slice(0, 8))
  expect('ready carries the share and agent state',
    first.events.find((event) => event.t === 'ready')?.d?.shared === false
      && first.events.find((event) => event.t === 'ready')?.d?.agent === 'idle',
    JSON.stringify(first.events.find((event) => event.t === 'ready')?.d ?? {}))
  expect('device banner reaches the browser', first.text().includes('Welcome to FakeSwitch'), JSON.stringify(first.text().slice(0, 36)))
  expect('escape sequences survive the stream', first.text().includes('\u001b[32m'))

  const sessionId = first.sessionId
  const input = Buffer.from('show version\r', 'utf8').toString('base64')
  const inputResult = await api({ op: 'term.input', id: sessionId, data: input })
  expect('input accepted', inputResult.ok === true)
  await waitFor(() => first.text().includes('show version'))
  expect('keystrokes reach the device and echo back', first.text().includes('show version'))

  const resize = await api({ op: 'term.resize', id: sessionId, cols: 100, rows: 30 })
  expect('resize accepted', resize.ok === true)

  /* 2. The panel goes away: the stream is dropped, the session is not ------ */
  await first.drop()
  await new Promise((resolve) => setTimeout(resolve, 400))
  const listed = await api({ op: 'term.list' })
  const detached = (listed.sessions ?? []).find((session) => session.id === sessionId)
  expect('the session outlives its stream', Boolean(detached), JSON.stringify((listed.sessions ?? []).map((session) => session.state)))
  expect('the session is reported as detached', detached?.state === 'detached', String(detached?.state))
  expect('the host still counts its bytes', Number(detached?.seq) > 0, String(detached?.seq))

  /* 3. Re-attach: the scrollback comes back before any new output ---------- */
  const resumed = watch(await fetch(`${base}/nwtool/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nwtool-lang': 'zh' },
    body: JSON.stringify({ op: 'term.attach', id: sessionId, since: 0, cols: 100, rows: 30 }),
  }))
  await waitFor(() => resumed.text().includes('show version'))
  expect('re-attach keeps the same session id', resumed.sessionId === sessionId, resumed.sessionId)
  expect('re-attach replays the banner', resumed.text().includes('Welcome to FakeSwitch'), JSON.stringify(resumed.text().slice(0, 40)))
  expect('re-attach replays what the stream missed', resumed.text().includes('show version'))
  expect('re-attach reports it is a re-attach', resumed.events.find((event) => event.t === 'ready')?.d?.attached === true)
  const listedAgain = await api({ op: 'term.list' })
  expect('the session is attached again', (listedAgain.sessions ?? []).find((session) => session.id === sessionId)?.state === 'attached',
    JSON.stringify((listedAgain.sessions ?? []).map((session) => session.state)))

  /* 4. The re-attached session is still writable --------------------------- */
  await api({ op: 'term.input', id: sessionId, data: Buffer.from('display clock\r', 'utf8').toString('base64') })
  await waitFor(() => resumed.text().includes('display clock'))
  expect('keystrokes still reach the device after re-attach', resumed.text().includes('display clock'))

  /* 5. Two viewers at once: the panel and the floating window both attach --- */
  const float = watch(await fetch(`${base}/nwtool/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nwtool-lang': 'zh' },
    body: JSON.stringify({ op: 'term.attach', id: sessionId, since: 0, cols: 60, rows: 18 }),
  }))
  await waitFor(() => float.text().includes('display clock'))
  expect('a second view can attach to the same session', float.sessionId === sessionId, float.sessionId.slice(0, 8))
  expect('the second view is replayed from the beginning', float.text().includes('Welcome to FakeSwitch'),
    JSON.stringify(float.text().slice(0, 40)))
  expect('the second view gets its own size', float.events.find((event) => event.t === 'ready')?.d?.attached === true)
  await api({ op: 'term.input', id: sessionId, data: Buffer.from('dual-view\r', 'utf8').toString('base64') })
  await waitFor(() => float.text().includes('dual-view'))
  expect('both views receive the same new output',
    resumed.text().includes('dual-view') && float.text().includes('dual-view'))
  await float.drop()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const afterFloat = await api({ op: 'term.list' })
  expect('dropping the float leaves the panel attached',
    (afterFloat.sessions ?? []).find((session) => session.id === sessionId)?.state === 'attached',
    JSON.stringify((afterFloat.sessions ?? []).map((session) => session.state)))

  /* 6. An explicit close is still an explicit close ------------------------ */
  const unshared = (await api({ op: 'term.list' })).sessions?.find((session) => session.id === sessionId)
  expect('a new session starts unshared', unshared?.shared === false, String(unshared?.shared))
  const share = await api({ op: 'term.share', id: sessionId, shared: true })
  expect('sharing can be enabled', share.shared === true, JSON.stringify(share))
  const shared = (await api({ op: 'term.list' })).sessions?.find((session) => session.id === sessionId)
  expect('the share state shows up in the list', shared?.shared === true, String(shared?.shared))
  const unshare = await api({ op: 'term.share', id: sessionId, shared: false })
  expect('sharing can be revoked', unshare.shared === false, JSON.stringify(unshare))

  await api({ op: 'term.close', id: sessionId })
  await waitFor(() => resumed.ended)
  expect('close ends the attached stream', resumed.types().includes('exit'), resumed.types().join(','))
  const afterClose = await api({ op: 'term.list' })
  expect('a closed session is gone from the list', !(afterClose.sessions ?? []).some((session) => session.id === sessionId))

  /* 7. Attaching to what is gone explains itself --------------------------- */
  const missing = watch(await fetch(`${base}/nwtool/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nwtool-lang': 'zh' },
    body: JSON.stringify({ op: 'term.attach', id: 'nope', since: 0 }),
  }))
  await waitFor(() => missing.ended)
  expect('attaching to a finished session reports an error', missing.types().includes('error'), missing.types().join(','))
  expect('the error explains the retention window', String(missing.events[0]?.d ?? '').includes('保留时间'),
    String(missing.events[0]?.d ?? '').slice(0, 40))

  const unknown = await api({ op: 'term.input', id: 'nope', data: '' })
  expect('unknown session is refused', Boolean(unknown.error), unknown.error)
} catch (error) {
  bad('live terminal', String(error?.message ?? error))
} finally {
  device.close()
}

console.log(failures === 0 ? '\nlive terminal channel works' : `\n${failures} live check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
