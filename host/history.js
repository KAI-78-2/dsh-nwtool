/**
 * Bounded byte history for one interactive session.
 *
 * The browser owns the screen, so a detached session cannot be repainted from
 * anywhere else: the Host keeps the raw byte stream instead, and a re-attaching
 * browser rebuilds its grid by replaying it. Bytes are stored exactly as they
 * arrived — ANSI included — because the decoder on the other side has to see
 * complete escape sequences, not lines.
 *
 * A monotonic `seq` (total bytes ever appended) lets a client ask for "only what
 * I have not seen yet"; when the buffer had to drop older bytes the answer says
 * so, so the caller can tell the user the scrollback was trimmed.
 */
export class OutputHistory {
  constructor(limit = 256 * 1024) {
    this.limit = Math.max(16, Number(limit) || 0)
    this.chunks = []
    this.bytes = 0
    this.seq = 0
  }

  /** First byte still retained; equal to `seq` when nothing was dropped. */
  get firstSeq() {
    return this.chunks.length ? this.chunks[0].seq : this.seq
  }

  append(chunk) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    if (!data.length) return
    this.chunks.push({ seq: this.seq, data })
    this.seq += data.length
    this.bytes += data.length
    this.trim()
  }

  trim() {
    while (this.bytes > this.limit && this.chunks.length > 1) {
      const first = this.chunks.shift()
      this.bytes -= first.data.length
    }
    if (this.bytes <= this.limit || !this.chunks.length) return
    /* One oversized chunk: keep its tail, and prefer a line start so the replay
       does not begin in the middle of an escape sequence. */
    const only = this.chunks[0]
    const excess = this.bytes - this.limit
    let cut = excess
    const newline = only.data.indexOf(0x0a, excess)
    if (newline >= 0 && newline - excess < 4096) cut = newline + 1
    only.data = only.data.subarray(cut)
    only.seq += cut
    this.bytes -= cut
  }

  /**
   * Everything from `since` on. `skipped` means bytes the caller asked for were
   * already dropped, so the replay is a suffix of what it wanted.
   */
  read(since = 0) {
    const requested = Math.max(0, Number(since) || 0)
    const first = this.firstSeq
    const from = Math.max(requested, first)
    const chunks = []
    for (const entry of this.chunks) {
      const end = entry.seq + entry.data.length
      if (end <= from) continue
      chunks.push(from <= entry.seq ? entry.data : entry.data.subarray(from - entry.seq))
    }
    return { chunks, from, skipped: requested < first, seq: this.seq }
  }

  /** Drop everything; a new subscriber after this starts from an empty screen. */
  clear() {
    this.chunks = []
    this.bytes = 0
    this.seq = 0
  }
}
