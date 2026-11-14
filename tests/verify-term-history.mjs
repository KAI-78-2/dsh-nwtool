// Byte history behind session re-attach: what a replayed screen is made of.
import { OutputHistory } from '../host/history.js'

let failures = 0
const ok = (label, detail = '') => console.log(`PASS ${label}${detail ? ` -> ${detail}` : ''}`)
const bad = (label, detail = '') => {
  failures += 1
  console.log(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`)
}
const expect = (label, condition, detail = '') => (condition ? ok(label, detail) : bad(label, detail))
const text = (result) => Buffer.concat(result.chunks).toString('utf8')

/* Order and sequence numbers ------------------------------------------------ */
{
  const history = new OutputHistory(1024)
  history.append('one\n')
  history.append('two\n')
  history.append('three\n')
  expect('all bytes are kept', text(history.read(0)) === 'one\ntwo\nthree\n', JSON.stringify(text(history.read(0))))
  expect('seq counts every byte written', history.seq === 14, String(history.seq))
  expect('nothing was dropped', history.firstSeq === 0, String(history.firstSeq))
  expect('a mid-stream cursor replays only the tail', text(history.read(9)) === 'hree\n', JSON.stringify(text(history.read(9))))
  expect('an exact cursor replays from that byte', text(history.read(8)) === 'three\n', JSON.stringify(text(history.read(8))))
  expect('a cursor past the end replays nothing', text(history.read(99)) === '', JSON.stringify(text(history.read(99))))
}

/* Trimming ---------------------------------------------------------------- */
{
  const history = new OutputHistory(32)
  for (let index = 0; index < 6; index += 1) history.append(`${index}`.padStart(16, '.'))
  expect('the cap is respected', history.bytes <= 32, String(history.bytes))
  expect('the oldest bytes are dropped first', history.firstSeq === 64, String(history.firstSeq))
  expect('the retained tail is intact', text(history.read(0)) === text(history.read(history.firstSeq)))
  const late = history.read(8)
  expect('a cursor below the window is reported as trimmed', late.skipped === true, String(late.skipped))
  expect('a trimmed cursor restarts at the oldest retained byte', late.from === 64, String(late.from))
  const fresh = history.read(70)
  expect('a cursor inside the window is not reported as trimmed', fresh.skipped === false, String(fresh.skipped))
  expect('a cursor inside the window keeps its offset', fresh.from === 70, String(fresh.from))
  expect('a cursor inside the window replays exactly the bytes after it', text(fresh).length === history.seq - 70,
    `${text(fresh).length} vs ${history.seq - 70}`)
}

/* One oversized chunk ------------------------------------------------------ */
{
  const history = new OutputHistory(32)
  history.append(`${'a'.repeat(40)}\n${'b'.repeat(40)}\n${'c'.repeat(10)}`)
  expect('an oversized chunk is cut', history.bytes <= 32, String(history.bytes))
  expect('the cut prefers a line start', text(history.read(0)).startsWith('c'), JSON.stringify(text(history.read(0))))
  expect('the cut advances firstSeq by the same amount', history.firstSeq === history.seq - history.bytes,
    `${history.firstSeq} / ${history.seq} / ${history.bytes}`)
}

/* Edge cases -------------------------------------------------------------- */
{
  const exact = new OutputHistory(16)
  exact.append('0123456789abcdef')
  expect('a full buffer is not trimmed', exact.firstSeq === 0 && exact.bytes === 16, `${exact.firstSeq} ${exact.bytes}`)
  exact.append('g')
  expect('one byte over trims', exact.bytes <= 16 && exact.firstSeq > 0, `${exact.bytes} ${exact.firstSeq}`)

  const empty = new OutputHistory(16)
  expect('an empty history replays nothing', text(empty.read(0)) === '' && empty.seq === 0)
  empty.clear()
  expect('clear resets the cursor', empty.seq === 0 && empty.firstSeq === 0)

  const cleared = new OutputHistory(128)
  cleared.append('hello')
  cleared.clear()
  expect('a cleared history forgets the bytes', text(cleared.read(0)) === '' && cleared.seq === 0, String(cleared.seq))
}

/* A split escape sequence must survive the replay byte-for-byte ------------ */
{
  const history = new OutputHistory(128)
  history.append(Buffer.from([0x1b, 0x5b]))
  history.append(Buffer.from([0x33, 0x32, 0x6d, 0x58]))
  const bytes = Buffer.concat(history.read(0).chunks)
  expect('escape sequences are replayed unchanged', bytes.equals(Buffer.from([0x1b, 0x5b, 0x33, 0x32, 0x6d, 0x58])),
    bytes.toString('hex'))
  expect('replaying from inside an escape starts there', Buffer.concat(history.read(2).chunks).toString('hex') === '33326d58',
    Buffer.concat(history.read(2).chunks).toString('hex'))
}

console.log(failures === 0 ? '\noutput history behaves' : `\n${failures} history check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
