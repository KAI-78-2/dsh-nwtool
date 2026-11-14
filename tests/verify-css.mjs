// Validates the stylesheet that client.js injects.
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const startMarker = 'const CSS = `'
const start = src.indexOf(startMarker)
if (start < 0) {
  console.log('FAIL stylesheet not found')
  process.exit(1)
}
const bodyStart = start + startMarker.length
const end = src.indexOf('`', bodyStart)
const css = src.slice(bodyStart, end)

const open = (css.match(/\{/g) || []).length
const close = (css.match(/\}/g) || []).length
const rules = (css.match(/^[.@][^{]*\{/gm) || []).length
const keyframes = (css.match(/@keyframes/g) || []).length
const colorMix = (css.match(/color-mix\(/g) || []).length
const tokens = [...new Set(css.match(/--dsw-[a-z0-9-]+/g) || [])].sort()
const declarations = css.split('\n').filter((line) => line.trim().endsWith(';')).length
const problems = []

if (open !== close) problems.push(`braces unbalanced (${open} open vs ${close} close)`)
if (/\$\{(?!MONO\})/.test(css)) problems.push('unexpected template interpolation')
if (/\{\s*\}/.test(css)) problems.push('empty rule block')
if (/;;/.test(css)) problems.push('double semicolon')
if (!css.includes('prefers-reduced-motion')) problems.push('missing reduced-motion block')
if (!css.includes('color-mix')) problems.push('no color-mix usage')
if (keyframes < 4) problems.push(`only ${keyframes} keyframes`)

// Every declaration using color-mix should be preceded by a plain fallback in
// the same rule, so the design survives an engine without color-mix.
const lines = css.split('\n')
const missingFallback = []
const seenPlain = new Set()
let selectors = 'outside'
for (const line of lines) {
  const trimmed = line.trim()
  if (trimmed.endsWith('{')) {
    selectors = trimmed.slice(0, -1).trim()
    seenPlain.clear()
    continue
  }
  if (trimmed === '}') {
    selectors = 'outside'
    seenPlain.clear()
    continue
  }
  if (!trimmed.includes(':') || trimmed.startsWith('/*')) continue
  const property = trimmed.split(':')[0].trim()
  const key = `${selectors}|${property}`
  if (trimmed.includes('color-mix(')) {
    if (!seenPlain.has(key)) missingFallback.push(`${selectors} { ${property} }`)
  } else {
    seenPlain.add(key)
  }
}
if (missingFallback.length) problems.push(`color-mix without plain fallback in ${missingFallback.length} place(s)`)

/* Class names used by the components must exist in the stylesheet. */
const defined = new Set((css.match(/\.nwt-[a-zA-Z0-9_-]+/g) || []).map((item) => item.slice(1)))
const used = new Set(
  (src.match(/['"`]nwt-[a-zA-Z0-9_ -]+['"`]/g) || [])
    .join(' ')
    .replace(/['"`]/g, ' ')
    .split(/\s+/)
    .filter((token) => /^nwt-[a-zA-Z0-9_-]+$/.test(token)),
)
const undefinedClasses = [...used].filter((token) => !defined.has(token)).sort()
const unusedClasses = [...defined].filter((token) => !used.has(token)).sort()
if (undefinedClasses.length) problems.push(`classes used but not styled: ${undefinedClasses.join(', ')}`)

/* No green: every literal colour in the stylesheet must sit outside the green
   hue band (75°–170°), and no rule may rotate hue into it. The one deliberate
   exception is the session status dot, which follows the traffic-light
   convention the terminal needs: green means "connected". */
const STATUS_COLOURS = new Set(['#2fbf71'])
function hueOf(hex) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return null
  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  return hue < 0 ? hue + 360 : hue
}
const literals = [...new Set(css.match(/#[0-9a-fA-F]{6}\b/g) || [])]
const greenish = literals.filter((hex) => {
  if (STATUS_COLOURS.has(hex.toLowerCase())) return false
  const hue = hueOf(hex)
  return hue !== null && hue >= 75 && hue <= 170
})
if (greenish.length) problems.push(`green-ish literals present: ${greenish.join(', ')}`)
if (/hue-rotate\s*\(/.test(css)) problems.push('hue-rotate would drift into green')

/* Aurora motion must stay slow; micro-interactions may be short. */
const BACKDROP = {
  'nwt-aura-breathe': 20,
  'nwt-aurora-a': 60,
  'nwt-aurora-b': 60,
  'nwt-aurora-c': 60,
  'nwt-horizon': 18,
}
const durations = []
const slowProblems = []
for (const line of css.split('\n')) {
  if (!line.includes('animation:')) continue
  const seconds = Number((line.match(/(\d+(?:\.\d+)?|\.\d+)s/) || [])[1])
  if (!Number.isFinite(seconds)) continue
  for (const [name, minimum] of Object.entries(BACKDROP)) {
    if (!line.includes(name)) continue
    durations.push(`${name}=${seconds}s`)
    if (seconds < minimum) slowProblems.push(`${name} runs ${seconds}s, expected >= ${minimum}s`)
  }
}
if (slowProblems.length) problems.push(...slowProblems)

/* Lock in the agreed visual weight: a whisper of a backdrop and a heading that
   reads as the parent of the tool list. */
const auraOpacity = Number((css.match(/\.nwt-aura \{[^}]*?opacity:\s*([\d.]+)/) || [])[1])
const breathePeak = Number((css.match(/@keyframes nwt-aura-breathe \{[\s\S]*?50% \{ opacity: ([\d.]+)/) || [])[1])
const groupSize = Number((css.match(/\.nwt-group-btn \{[^}]*?font-size:\s*([\d.]+)px/) || [])[1])
const groupWeight = Number((css.match(/\.nwt-group-btn \{[^}]*?font-weight:\s*(\d+)/) || [])[1])
if (!(auraOpacity <= 0.3)) problems.push(`.nwt-aura opacity ${auraOpacity} is louder than 0.3`)
if (!(breathePeak <= 0.4)) problems.push(`aura breathing peaks at ${breathePeak}, expected <= 0.4`)
if (!(groupSize >= 12.5)) problems.push(`group heading font-size ${groupSize}px, expected >= 12.5px`)
if (!(groupWeight >= 600)) problems.push(`group heading font-weight ${groupWeight}, expected >= 600`)
const groupBlock = (css.match(/\.nwt-group-btn \{[^}]*\}/) || [''])[0]
if (!groupBlock.includes('color: var(--dsw-alias-label-primary)')) problems.push('group heading colour changed')
if (!groupBlock.includes('background: var(--dsw-alias-bg-layer-2)')) problems.push('group capsule background missing')
if (!/\.nwt-group-btn \{[^}]*?border-radius:\s*9px/.test(groupBlock)) problems.push('group capsule radius changed')
const capsuleFill = Number((groupBlock.match(/color-mix\(in srgb, var\(--dsw-alias-bg-layer-2\) (\d+)%/) || [])[1])
if (capsuleFill !== 50) problems.push(`capsule fill is ${capsuleFill}%, expected 50%`)

/* Terminal output must be selectable, and the keyboard sink must not sit on top
   of it: a click-through field keeps copy working without losing key input. */
const screenBlock = (css.match(/\.nwt-term-screen \{[^}]*\}/) || [''])[0]
if (!screenBlock.includes('user-select: text')) problems.push('terminal output is not selectable')
const sinkBlock = (css.match(/\.nwt-term-input \{[^}]*\}/) || [''])[0]
if (!sinkBlock.includes('pointer-events: none')) problems.push('the terminal keyboard sink covers the text')

/* Motion budget: the blur must sit on the ribbons, never on their parent, and
   nothing may re-sample the moving backdrop every frame. */
const auraBlock = (css.match(/\.nwt-aura \{[^}]*\}/) || [''])[0]
const ribbonBlock = (css.match(/\.nwt-aura > span \{[^}]*\}/) || [''])[0]
if (/(^|;)\s*filter:/.test(auraBlock)) problems.push('blur on .nwt-aura re-rasterises the subtree every frame')
if (!/filter:\s*blur\(/.test(ribbonBlock)) problems.push('ribbons lost their own blur')
if (/backdrop-filter/.test(css)) problems.push('backdrop-filter over the animated backdrop re-blurs every frame')
if (css.includes('--nwt-accent')) problems.push('leftover accent variable')
if (/\.nwt-group \+ \.nwt-group \{[^}]*?border-top/.test(css)) problems.push('divider should be gone while capsules are used')

console.log('css bytes:      ', css.length)
console.log('css lines:      ', lines.length)
console.log('rules:          ', rules)
console.log('keyframes:      ', keyframes)
console.log('colour-mix uses:', colorMix, '(fallback misses:', missingFallback.length + ')')
console.log('declarations:   ', declarations)
console.log('braces:         ', `${open} / ${close}`)
console.log('tokens:         ', tokens.length, tokens.join(' '))
console.log('classes:        ', `${defined.size} defined / ${used.size} used`)
console.log('literal colours:', literals.length, literals.join(' '))
console.log('greenish hues:  ', greenish.length ? greenish.join(' ') : 'none')
console.log('animation secs: ', durations.join(', '))
console.log('aura opacity:   ', `${auraOpacity} (breath peak ${breathePeak})`)
console.log('group heading:  ', `${groupSize}px / weight ${groupWeight}`)
if (unusedClasses.length) console.log('unused classes: ', unusedClasses.join(', '))
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nstylesheet looks consistent')
