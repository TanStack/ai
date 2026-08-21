// Compares coverage between two runs and fails when a package regressed.
//
// Both sides are measured in the same CI job — the PR head and its merge-base
// with main — so there is no baseline file to keep in sync, no per-platform
// skew, and packages can be added or removed without anyone updating a
// checked-in number.
//
// Usage:
//   node scripts/coverage-check.mjs --collect <dir> [--expect pkg,pkg]
//   node scripts/coverage-check.mjs --base <dir> --head <dir>
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const METRICS = ['statements', 'branches', 'functions', 'lines']

// Coverage percentages wobble slightly between runs (v8 attributes some bytes
// differently depending on JIT timing), so require a real drop.
const TOLERANCE = 0.5

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function totals(summary) {
  // A package with no source loaded reports totals of 0/0 as 100%; that is not
  // a number worth comparing.
  if (summary.total.statements.total === 0) return undefined
  return Object.fromEntries(
    METRICS.map((metric) => [metric, summary.total[metric].pct]),
  )
}

function packageDirs() {
  const dirs = {}
  for (const entry of readdirSync('packages', { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    dirs[entry.name] = entry.name
    try {
      const pkg = JSON.parse(
        readFileSync(join('packages', entry.name, 'package.json'), 'utf8'),
      )
      if (pkg.name) dirs[pkg.name] = entry.name
    } catch {
      // Directory with no package.json is still collectable by folder name.
    }
  }
  return dirs
}

function expectedDirs() {
  const raw = arg('--expect')
  if (raw === undefined) return undefined
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const dirs = packageDirs()
  const resolved = []
  const unknown = []
  for (const name of names) {
    const dir = dirs[name]
    if (!dir) unknown.push(name)
    else resolved.push(dir)
  }
  if (unknown.length > 0) {
    console.error(`Unknown package(s): ${unknown.join(', ')}`)
    process.exit(1)
  }
  return resolved
}

function readSummary(dirName) {
  try {
    return JSON.parse(
      readFileSync(
        join('packages', dirName, 'coverage', 'coverage-summary.json'),
        'utf8',
      ),
    )
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function collect(dir) {
  mkdirSync(dir, { recursive: true })
  const expected = expectedDirs()
  const names =
    expected ??
    readdirSync('packages', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  const missing = []
  let n = 0
  for (const name of names) {
    const summary = readSummary(name)
    if (!summary) {
      if (expected) missing.push(`${name} (no coverage-summary.json)`)
      continue
    }
    const values = totals(summary)
    if (!values) {
      if (expected) missing.push(`${name} (0 statements)`)
      continue
    }
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(values))
    n++
  }
  if (missing.length > 0) {
    console.error(
      `Coverage collect failed for ${missing.length} package(s):\n  ${missing.join('\n  ')}`,
    )
    process.exit(1)
  }
  console.log(`Collected ${n} coverage summary/summaries into ${dir}`)
}

function read(dir) {
  let files
  try {
    files = readdirSync(dir)
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    throw error
  }
  return Object.fromEntries(
    files
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file.replace(/\.json$/, ''),
        JSON.parse(readFileSync(join(dir, file), 'utf8')),
      ]),
  )
}

const collectDir = arg('--collect')
if (collectDir) {
  collect(collectDir)
  process.exit(0)
}

const baseDir = arg('--base')
const headDir = arg('--head')
if (!baseDir || !headDir) {
  console.error(
    'Usage: coverage-check.mjs --collect <dir> [--expect pkg,pkg] | --base <dir> --head <dir>',
  )
  process.exit(2)
}

const base = read(baseDir)
const head = read(headDir)
const names = Object.keys(head).sort()

if (names.length === 0) {
  console.error('No packages were measured — nothing to compare.')
  process.exit(1)
}

const regressions = []
const additions = []
const rows = []

for (const name of names) {
  const before = base[name]
  const after = head[name]
  if (!before) {
    additions.push(name)
    rows.push([
      name,
      ...METRICS.map((metric) => `${after[metric].toFixed(2)}%`),
      'new',
    ])
    continue
  }
  const deltas = METRICS.map((metric) => after[metric] - before[metric])
  const dropped = METRICS.filter((metric, i) => deltas[i] < -TOLERANCE)
  if (dropped.length > 0) regressions.push({ name, before, after, dropped })
  rows.push([
    name,
    ...METRICS.map((metric, i) => {
      const sign = deltas[i] > 0 ? '+' : ''
      return `${after[metric].toFixed(2)}% (${sign}${deltas[i].toFixed(2)})`
    }),
    dropped.length > 0 ? 'DROP' : 'ok',
  ])
}

for (const name of Object.keys(base)
  .filter((name) => !head[name])
  .sort()) {
  const before = base[name]
  regressions.push({ name, before, after: null, dropped: ['missing'] })
  rows.push([
    name,
    ...METRICS.map((metric) => `missing (${before[metric].toFixed(2)}%)`),
    'DROP',
  ])
}

const compared = names.filter((name) => base[name]).length

const header = ['package', ...METRICS, '']
const widths = header.map((_, column) =>
  Math.max(header[column].length, ...rows.map((row) => row[column].length)),
)
const line = (cells) =>
  cells
    .map((cell, i) => cell.padEnd(widths[i]))
    .join('  ')
    .trimEnd()

console.log(line(header))
console.log(widths.map((width) => '-'.repeat(width)).join('  '))
for (const row of rows) console.log(line(row))

if (additions.length > 0) {
  console.log(
    `\n${additions.length} package(s) had no coverage on the base commit` +
      ` (new, or unmeasurable there): ${additions.join(', ')}`,
  )
}

const headline =
  regressions.length > 0
    ? `❌ Coverage dropped in ${regressions.length} package(s).`
    : compared > 0
      ? `✅ Coverage held across ${compared} compared package(s).`
      : `${additions.length} package(s) are new; nothing to compare against.`

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `## Coverage`,
    ``,
    headline,
    ``,
    `Each package is measured twice in this job — on this PR and on its merge-base` +
      ` with \`main\` — and compared. A drop of more than ${TOLERANCE}pp in any metric fails.` +
      ` Packages your PR doesn't affect are not measured and not listed.`,
    ``,
    `| package | ${METRICS.join(' | ')} | |`,
    `| --- | ${METRICS.map(() => '---:').join(' | ')} | --- |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]
  if (additions.length > 0) {
    md.push(
      ``,
      `> No coverage on the base commit, so nothing to compare against:` +
        ` ${additions.join(', ')}.`,
    )
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`)
}

if (regressions.length > 0) {
  console.error(`\nCoverage dropped in ${regressions.length} package(s):`)
  for (const { name, before, after, dropped } of regressions) {
    if (!after) {
      console.error(`  ${name}: measured on base, missing on this PR`)
      continue
    }
    for (const metric of dropped) {
      console.error(
        `  ${name} ${metric}: ${before[metric].toFixed(2)}% -> ${after[metric].toFixed(2)}%`,
      )
    }
  }
  console.error(`\nAdd tests covering the code this PR changed.`)
  process.exit(1)
}

if (compared === 0) {
  console.log(
    `\n${additions.length} package(s) are new; nothing to compare against.`,
  )
} else {
  console.log(`\nCoverage held across ${compared} compared package(s).`)
}
