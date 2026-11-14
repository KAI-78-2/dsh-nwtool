/**
 * HTTP request engine used by the HTTP tool and by agent tools.
 * Implemented on the global fetch so it can follow redirects, stream and
 * measure time-to-first-byte without extra dependencies.
 */
import { t } from './i18n.js'
import { isAbortError } from './util.js'

const MAX_BODY_BYTES = 512 * 1024

function headersToObject(input) {
  const out = {}
  if (!input) return out
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || !entry.k) continue
      out[String(entry.k)] = String(entry.v ?? '')
    }
    return out
  }
  for (const [key, value] of Object.entries(input)) out[key] = String(value)
  return out
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export async function httpRequest(params, emit, signal) {
  const rawUrl = String(params.url ?? '').trim()
  if (!rawUrl) throw new Error(t('请填写请求地址'))
  const url = /^[a-z]+:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`
  if (!/^https?:\/\//i.test(url)) throw new Error(t('只支持 http/https 地址'))

  const method = String(params.method ?? 'GET').toUpperCase()
  const headers = headersToObject(params.headers)
  const timeoutMs = Math.min(Math.max(Number(params.timeout) || 20000, 1000), 120000)
  const followRedirects = params.followRedirects !== false
  let body = params.body
  if (typeof body === 'string' && body.trim() === '') body = undefined
  if (body !== undefined && method === 'GET') body = undefined

  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    const text = String(body).trim()
    headers['content-type'] = text.startsWith('{') || text.startsWith('[')
      ? 'application/json'
      : 'text/plain; charset=utf-8'
  }

  emit({ t: 'log', d: `${method} ${url}` })
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  let firstByteAt = null

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : String(body),
      redirect: followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
    })
    firstByteAt = Date.now()
    const chunks = []
    let received = 0
    let truncated = false
    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value?.length ?? 0
        if (received <= MAX_BODY_BYTES) chunks.push(Buffer.from(value))
        else truncated = true
      }
    }
    const elapsed = Date.now() - started
    const buffer = Buffer.concat(chunks)
    const contentType = response.headers.get('content-type') ?? ''

    const firstByteMs = firstByteAt - started
    emit({ t: 'kv', d: [
      { k: t('状态'), v: `${response.status} ${response.statusText}` },
      { k: t('耗时'), v: t('${elapsed} ms（首字节 ${firstByte} ms）', { elapsed, firstByte: firstByteMs }) },
      { k: t('大小'), v: `${formatBytes(received)}${truncated ? t('（已截断显示）') : ''}` },
      { k: t('类型'), v: contentType || '-' },
      { k: t('最终地址'), v: response.url },
    ] })

    const headerLines = []
    response.headers.forEach((value, key) => headerLines.push(`${key}: ${value}`))
    emit({ t: 'sections', d: [{ title: t('响应头'), body: headerLines.join('\n') || t('（无）') }] })

    const isText = !/^(image|audio|video|application\/(pdf|zip|octet-stream))/i.test(contentType)
    const binarySize = formatBytes(buffer.length)
    const display = isText ? buffer.toString('utf8') : t('（二进制内容 ${bytes}，未显示）', { bytes: binarySize })
    let shown = display
    if (params.prettyJson !== false && /json/i.test(contentType)) {
      try {
        shown = JSON.stringify(JSON.parse(display), null, 2)
      } catch {
        shown = display
      }
    }
    const bodyTitle = truncated ? t('响应体（截断）') : t('响应体')
    emit({ t: 'sections', d: [{ title: bodyTitle, body: shown.slice(0, MAX_BODY_BYTES), lang: 'text' }] })
    emit({ t: 'done', d: { status: response.status, ms: elapsed, bytes: received } })
  } catch (error) {
    if (isAbortError(error) || error?.name === 'AbortError') {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      throw new Error(t('请求超时（${timeoutMs} ms）', { timeoutMs }))
    }
    const reason = error?.message ?? error
    throw new Error(t('请求失败: ${reason}', { reason }))
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}
