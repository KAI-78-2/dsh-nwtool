/**
 * Translation for everything this plugin renders.
 *
 * Chinese is the source language: every message is authored in Chinese and
 * `locale/messages.json` carries the translations keyed by that exact source
 * text. A lookup walks the active language, then English, then the source text,
 * so a missing translation degrades to Chinese instead of showing a key.
 *
 * The active language arrives with each browser request. `AsyncLocalStorage`
 * carries it through the engine, the child processes and the stream writer
 * without threading a parameter through every function.
 */
import fs from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'

const MESSAGES_URL = new URL('../locale/messages.json', import.meta.url)

/** The authoring language: messages are written in it and translated out of it. */
export const SOURCE_LANGUAGE = 'zh'
/** Used for every language without a table of its own. */
export const FALLBACK_LANGUAGE = 'en'

let catalog = null

function messages() {
  if (catalog) return catalog
  try {
    const parsed = JSON.parse(fs.readFileSync(MESSAGES_URL, 'utf8'))
    catalog = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    catalog = {}
  }
  return catalog
}

/** `zh-CN`, `zh_TW`, `en-US` → `zh` / `en`. */
export function normalizeLanguage(value) {
  const tag = String(value ?? '').trim().toLowerCase().replace(/_/g, '-')
  if (!tag) return SOURCE_LANGUAGE
  return tag.split('-')[0]
}

/** Fill `${name}` and `{name}` placeholders; unknown ones are left untouched. */
export function interpolate(template, params) {
  if (!params) return template
  return template.replace(/\$\{([^}]+)\}|\{(\w+)\}/g, (match, expression, plain) => {
    const key = String(expression ?? plain).trim()
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  })
}

export function translate(text, params, language = activeLanguage()) {
  const source = String(text)
  if (language === SOURCE_LANGUAGE) return interpolate(source, params)
  const table = messages()[language]
  const fallback = messages()[FALLBACK_LANGUAGE]
  const translated = (table && typeof table[source] === 'string' && table[source])
    || (fallback && typeof fallback[source] === 'string' && fallback[source])
    || source
  return interpolate(translated, params)
}

export const t = translate

const context = new AsyncLocalStorage()

/** Run `work` with one language bound to every `t()` inside it. */
export function withLanguage(language, work) {
  return context.run(normalizeLanguage(language), work)
}

export function activeLanguage() {
  return context.getStore() ?? SOURCE_LANGUAGE
}

/** Every language the plugin ships, for the self-check. */
export function languageTables() {
  return messages()
}
