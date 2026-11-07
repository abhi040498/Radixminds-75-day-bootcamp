import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sensitiveName = /(secret|key|token|password|supabase|razorpay|origin|url)/i
const candidates = new Map()

function add(name, value, source) {
  if (!sensitiveName.test(name) || typeof value !== 'string' || value.length < 5) return
  if (/^(true|false|null|undefined)$/i.test(value.trim())) return
  const entries = candidates.get(name) ?? new Map()
  entries.set(value, source)
  candidates.set(name, entries)
}

// Include values already supplied to this process, then local ignored env files.
for (const [name, value] of Object.entries(process.env)) add(name, value, 'process environment')
const localEnvFiles = existsSync(root) ? readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example') : []
for (const filename of localEnvFiles) {
  const envPath = path.join(root, filename)
  if (!existsSync(envPath)) continue
  try {
    for (const [name, value] of Object.entries(parse(readFileSync(envPath)))) add(name, value, filename)
  } catch {
    // Do not echo parser errors: they can include the offending source line.
    console.error(`Could not parse ${filename}; values were not displayed.`)
  }
}

let trackedFiles = []
try {
  trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean)
} catch {
  console.error('Could not enumerate Git-tracked files; no scan was performed.')
  process.exit(2)
}

const scanFiles = new Set(trackedFiles)
function addGeneratedFiles(directory) {
  const fullDirectory = path.join(root, directory)
  if (!existsSync(fullDirectory)) return
  for (const entry of readdirSync(fullDirectory)) {
    const relative = path.join(directory, entry)
    const full = path.join(root, relative)
    if (statSync(full).isDirectory()) addGeneratedFiles(relative)
    else scanFiles.add(relative)
  }
}
addGeneratedFiles('dist')
addGeneratedFiles(path.join('server', 'dist'))

const configuredNames = new Set(candidates.keys())
function classification(name, value) {
  const trimmed = value.trim()
  if (trimmed === name || configuredNames.has(trimmed)) return 'variable-name collision'
  if (/^(example[-_]|placeholder|replace-me|change-me|your[-_])/i.test(trimmed)) return 'placeholder'
  if (name === 'SUPABASE_PUBLIC_KEY') return 'public Supabase key'
  if (/^https?:\/\//i.test(trimmed)) return 'public URL/configuration'
  if (/^(eyJ[A-Za-z0-9_-]{20,}\.|sb_secret_|rzp_live_|sk_live_)/i.test(trimmed)) return 'credential-shaped value'
  return 'configured value'
}

const matches = new Map()
for (const relative of scanFiles) {
  const full = path.join(root, relative)
  let lines
  try {
    lines = readFileSync(full, 'utf8').split(/\r?\n/)
  } catch {
    continue
  }
  for (const [name, values] of candidates) {
    for (const [value] of values) {
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(value)) continue
        const kind = classification(name, value)
        matches.set(`${name}\0${relative}\0${index + 1}\0${kind}`, { name, relative, line: index + 1, kind })
      }
    }
  }
}

if (matches.size === 0) {
  console.log(`No local configured-value matches found across ${scanFiles.size} tracked/generated files.`)
} else {
  for (const match of matches.values()) {
    console.log(`${match.name} | ${match.relative}:${match.line} | ${match.kind}`)
  }
}
const secretAliasNames = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
const configuredAliases = secretAliasNames.filter(name => candidates.has(name))
if (configuredAliases.length > 1) {
  const aliasValues = configuredAliases.map(name => new Set(candidates.get(name).keys()))
  const valuesDiffer = aliasValues[0].size !== aliasValues[1].size
    || [...aliasValues[0]].some(value => !aliasValues[1].has(value))
  console.log(`${configuredAliases.join(' + ')} | local alias check | ${valuesDiffer ? 'both configured with differing local values' : 'both configured with the same local value'}`)
} else if (configuredAliases.length === 1) {
  console.log(`${configuredAliases[0]} | local alias check | only one supported database secret alias is configured locally`)
} else {
  console.log('SUPABASE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY | local alias check | neither supported database secret alias is configured locally')
}
console.log('Values are never printed. Netlify dashboard values are only checked if they are explicitly present in this local process environment or local ignored env files.')
