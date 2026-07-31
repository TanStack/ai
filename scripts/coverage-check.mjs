// Compares coverage between two runs and fails when a package regressed.
//
// Both sides are measured in the same CI job — the PR head and its merge-base
// with main — so there is no baseline file to keep in sync, no per-platform
// skew, and packages can be added or removed without anyone updating a
// checked-in number.
//
// Usage:
//   node scripts/coverage-check.mjs --collect <dir>          # after a coverage run
//   node scripts/coverage-check.mjs --base <dir> --head <dir>
//
// ponytail: two directories of json-summary files and a subtraction. No
// coverage service, no history, no baseline to maintain.
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

/** Reduce a vitest json-summary to the four totals we compare. */
function totals(summary) {
  // A package with no source loaded reports totals of 0/0 as 100%; that is not
  // a number worth comparing.
  if (summary.total.statements.total === 0) return undefined
  return Object.fromEntries(
    METRICS.map((metric) => [metric, summary.total[metric].pct]),
  )
}

/**
 * Copy this run's summaries into `dir`, one small file per package, so they
 * survive the `git checkout` that happens between the two coverage runs.
 */
function collect(dir) {
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const entry of readdirSync('packages', { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let summary
    try {
      summary = JSON.parse(
        readFileSync(
          join('packages', entry.name, 'coverage', 'coverage-summary.json'),
          'utf8',
        ),
      )
    } catch (error) {
      // No summary means the package was not measured in this run, which is
      // different from it measuring 0%.
      if (error.code === 'ENOENT') continue
      throw error
    }
    const metrics = totals(summary)
    if (!metrics) continue
    writeFileSync(join(dir, `${entry.name}.json`), JSON.stringify(metrics))
    n++
  }
  console.log(`Collected ${n} coverage summary/summaries into ${dir}`)
}

function read(dir) {
  let files
  try {
    files = readdirSync(dir)
  } catch (error) {
    // A missing directory means that side measured nothing at all.
    if (error.code === 'ENOENT') return {}
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
    'Usage: coverage-check.mjs --collect <dir> | --base <dir> --head <dir>',
  )
  process.exit(2)
}

const base = read(baseDir)
const head = read(headDir)
const names = Object.keys(head).sort()

if (names.length === 0) {
  console.log('No packages were measured — nothing to compare.')
  process.exit(0)
}

const regressions = []
const additions = []
const rows = []

for (const name of names) {
  const before = base[name]
  const after = head[name]
  if (!before) {
    // New package, or one whose suite could not be measured on the base
    // commit. There is nothing to regress against.
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

const removed = Object.keys(base)
  .filter((name) => !head[name])
  .sort()

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
if (removed.length > 0) {
  console.log(`\nNot measured on this PR: ${removed.join(', ')}`)
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `## Coverage`,
    ``,
    regressions.length > 0
      ? `❌ Coverage dropped in ${regressions.length} package(s).`
      : `✅ Coverage held across ${names.length} measured package(s).`,
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
    for (const metric of dropped) {
      console.error(
        `  ${name} ${metric}: ${before[metric].toFixed(2)}% -> ${after[metric].toFixed(2)}%`,
      )
    }
  }
  console.error(`\nAdd tests covering the code this PR changed.`)
  process.exit(1)
}

console.log(`\nCoverage held across ${names.length} measured package(s).`)
