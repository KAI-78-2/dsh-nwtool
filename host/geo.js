/**
 * IP geolocation.
 *
 * Addresses are looked up against public providers from the Host side, so the
 * browser never talks to a third party. Private and special-purpose ranges are
 * answered offline: they have no public location and should not leak to an API.
 * Providers are tried in order and the one that answered is reported, because
 * they disagree about details and honesty about the source matters.
 */
import { t } from './i18n.js'
import { publicIp } from './net.js'
import { clampNumber, isIPv4, isPrivateIPv4 } from './util.js'

/** Ranges that are never routable, with the reason a person needs. */
const SPECIAL_RANGES = [
  { test: (address) => /^0\./.test(address), label: () => t('本网络（0.0.0.0/8）') },
  { test: (address) => isPrivateIPv4(address), label: () => t('私有地址（RFC 1918）') },
  { test: (address) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address), label: () => t('运营商级 NAT（100.64/10）') },
  { test: (address) => /^169\.254\./.test(address), label: () => t('链路本地（169.254/16）') },
  { test: (address) => /^127\./.test(address), label: () => t('本机环回（127/8）') },
  { test: (address) => /^22[4-9]\.|^23\d\.|^24\d\.|^25[0-5]\./.test(address), label: () => t('组播/保留（224/4 以上）') },
]

function classify(address) {
  for (const range of SPECIAL_RANGES) {
    if (range.test(address)) return range.label()
  }
  return ''
}

async function fetchJson(url, timeoutMs, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))
  const onAbort = () => controller.abort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-nwtool/1.0' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}

/** ip-api.com has the richest answer, including a Chinese rendering. */
async function fromIpApi(address, timeoutMs, signal, language) {
  const url = `http://ip-api.com/json/${encodeURIComponent(address)}`
    + `?lang=${language === 'zh' ? 'zh-CN' : 'en'}`
    + '&fields=status,message,country,countryCode,regionName,city,isp,org,as,timezone,lat,lon,query'
  const data = await fetchJson(url, timeoutMs, signal)
  if (data?.status !== 'success') throw new Error(data?.message ?? t('查询失败'))
  return {
    source: 'ip-api.com',
    country: data.country ?? '',
    region: data.regionName ?? '',
    city: data.city ?? '',
    isp: data.isp ?? '',
    org: data.org ?? '',
    asn: data.as ?? '',
    timezone: data.timezone ?? '',
    lat: data.lat,
    lon: data.lon,
    address: data.query ?? address,
  }
}

async function fromIpApiCo(address, timeoutMs, signal) {
  const data = await fetchJson(`https://ipapi.co/${encodeURIComponent(address)}/json/`, timeoutMs, signal)
  if (data?.error) throw new Error(String(data.reason ?? t('查询失败')))
  return {
    source: 'ipapi.co',
    country: data.country_name ?? '',
    region: data.region ?? '',
    city: data.city ?? '',
    isp: data.org ?? '',
    org: data.org ?? '',
    asn: data.asn ?? '',
    timezone: data.timezone ?? '',
    lat: data.latitude,
    lon: data.longitude,
    address: data.ip ?? address,
  }
}

async function fromIpInfo(address, timeoutMs, signal) {
  const data = await fetchJson(`https://ipinfo.io/${encodeURIComponent(address)}/json`, timeoutMs, signal)
  if (data?.error || (!data?.country && !data?.city)) throw new Error(String(data?.error ?? t('查询失败')))
  const [lat, lon] = String(data.loc ?? '').split(',')
  return {
    source: 'ipinfo.io',
    country: data.country ?? '',
    region: data.region ?? '',
    city: data.city ?? '',
    isp: data.org ?? '',
    org: data.org ?? '',
    asn: '',
    timezone: data.timezone ?? '',
    lat: lat ? Number(lat) : '',
    lon: lon ? Number(lon) : '',
    address,
  }
}

export async function ipGeo(params = {}, emit, signal) {
  const language = params.language === 'en' ? 'en' : 'zh'
  const timeoutMs = clampNumber(Number(params.timeout) || 5000, 1500, 20000, 5000)
  let address = String(params.ip ?? '').trim()

  if (!address) {
    emit({ t: 'log', d: t('未填写地址：先查询本机公网出口') })
    const egress = await publicIp()
    if (!egress.ip) {
      throw new Error(t('无法确定本机公网出口地址：${detail}', { detail: egress.failures.join('; ') || t('全部服务无响应') }))
    }
    address = egress.ip
    emit({ t: 'log', d: t('本机公网出口为 ${address}（来源 ${source}）', { address, source: egress.source ?? '-' }) })
  }

  if (/^[0-9.]+$/.test(address) && !isIPv4(address)) throw new Error(t('IPv4 地址格式不正确: ${address}', { address }))
  const special = isIPv4(address) ? classify(address) : ''
  if (special) {
    emit({
      t: 'kv',
      d: [
        { k: t('地址'), v: address },
        { k: t('类型'), v: special },
        { k: t('位置'), v: t('无（内网/保留地址没有公网归属）') },
      ],
    })
    emit({ t: 'stats', d: { [t('地址')]: address, [t('查询来源')]: t('本地判断') } })
    emit({ t: 'done', d: { address, private: true } })
    return
  }

  emit({ t: 'log', d: t('查询 ${address} 的归属地', { address }) })
  const providers = [fromIpApi, fromIpApiCo, fromIpInfo]
  const failures = []
  let info = null
  for (const provider of providers) {
    if (signal?.aborted) throw new Error(t('已取消'))
    try {
      info = await provider(address, timeoutMs, signal, language)
      break
    } catch (error) {
      failures.push(String(error?.message ?? error).slice(0, 120))
    }
  }
  if (!info) {
    throw new Error(t('全部地理定位服务都不可用: ${detail}', { detail: failures.join(' / ') }))
  }

  const rows = [
    { k: t('地址'), v: info.address || address },
    { k: t('国家/地区'), v: info.country || '-' },
    { k: t('省/州'), v: info.region || '-' },
    { k: t('城市'), v: info.city || '-' },
    { k: t('运营商'), v: info.isp || '-' },
    { k: t('组织'), v: info.org || '-' },
    { k: t('ASN'), v: info.asn || '-' },
    { k: t('时区'), v: info.timezone || '-' },
    { k: t('经纬度'), v: info.lat !== '' && info.lon !== '' && info.lat !== undefined ? `${info.lat}, ${info.lon}` : '-' },
    { k: t('数据来源'), v: info.source },
  ]
  emit({ t: 'kv', d: rows })
  emit({ t: 'stats', d: { [t('地址')]: info.address || address, [t('数据来源')]: info.source } })
  if (failures.length) {
    emit({ t: 'notice', d: t('部分服务不可用: ${detail}', { detail: failures.join(' / ') }) })
  }
  emit({ t: 'done', d: { address: info.address || address, source: info.source } })
}
