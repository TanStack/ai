// Compares the coverage produced by `test:coverage` against the committed
// baseline in coverage-baseline.json and fails when a package regressed.
//
// Usage:
//   node scripts/coverage-check.mjs            # compare, exit 1 on a drop
//   node scripts/coverage-check.mjs --update   # rewrite the baseline
//
// ponytail: a committed baseline file is the whole ratchet — no coverage
// service and no historical database. Results surface on the PR via
// $GITHUB_STEP_SUMMARY; for per-line annotations, upload the lcov files that
// `test:coverage` already writes.
import {
  appendFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const BASELINE = 'coverage-baseline.json'
const METRICS = ['statements', 'branches', 'functions', 'lines']

// Coverage percentages wobble slightly between runs (v8 attributes some
// bytes differently depending on JIT timing), so require a real drop.
const TOLERANCE = 0.5

const update = process.argv.includes('--update')

/** @returns {Record<string, Record<string, number>>} */
function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

/** Collect the fresh coverage summaries written by this run. */
function readCurrent() {
  const current = {}
  for (const entry of readdirSync('packages', { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const summaryPath = join(
      'packages',
      entry.name,
      'coverage',
      'coverage-summary.json',
    )
    let summary
    try {
      summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    } catch (error) {
      // Not every package is affected on every run — no summary means the
      // package was not measured, which is different from measuring 0%.
      if (error.code === 'ENOENT') continue
      throw error
    }
    // A package with no source loaded reports totals of 0/0 as 100%; that is
    // not a number worth ratcheting against.
    if (summary.total.statements.total === 0) continue
    current[entry.name] = Object.fromEntries(
      METRICS.map((metric) => [metric, summary.total[metric].pct]),
    )
  }
  return current
}

const baseline = readBaseline()
const current = readCurrent()
const names = Object.keys(current).sort()

if (names.length === 0) {
  console.error(
    `No coverage summaries found under packages/*/coverage/. Run \`pnpm test:coverage\` first.`,
  )
  process.exit(1)
}

if (update) {
  const merged = { ...baseline, ...current }
  const sorted = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((key) => [key, merged[key]]),
  )
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`)
  console.log(`Updated ${BASELINE} with ${names.length} package(s).`)
  process.exit(0)
}

const regressions = []
const additions = []
const rows = []

for (const name of names) {
  const before = baseline[name]
  const after = current[name]
  if (!before) {
    additions.push(name)
    rows.push([name, ...METRICS.map((m) => `${after[m].toFixed(2)}%`), 'new'])
    continue
  }
  const deltas = METRICS.map((metric) => after[metric] - before[metric])
  const dropped = METRICS.filter((metric, i) => deltas[i] < -TOLERANCE)
  if (dropped.length > 0) {
    regressions.push({ name, before, after, dropped })
  }
  rows.push([
    name,
    ...METRICS.map((metric, i) => {
      const delta = deltas[i]
      const sign = delta > 0 ? '+' : ''
      return `${after[metric].toFixed(2)}% (${sign}${delta.toFixed(2)})`
    }),
    dropped.length > 0 ? 'DROP' : 'ok',
  ])
}

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
    `\n${additions.length} package(s) missing from ${BASELINE}: ${additions.join(', ')}` +
      `\nRun \`pnpm test:coverage:update\` and commit the baseline.`,
  )
}

// ponytail: $GITHUB_STEP_SUMMARY renders on the run page with no token, no
// permissions and no API call. A sticky PR comment needs `pull-requests:
// write` — add that only if the summary tab turns out to be too easy to miss.
if (process.env.GITHUB_STEP_SUMMARY) {
  const verdict =
    regressions.length > 0
      ? `❌ Coverage dropped in ${regressions.length} package(s).`
      : `✅ Coverage held for ${names.length} measured package(s).`
  const md = [
    `## Coverage`,
    ``,
    verdict,
    ``,
    `Baseline: \`${BASELINE}\`. Fails on a drop of more than ${TOLERANCE}pp. Packages not affected by this PR are not measured and not listed.`,
    ``,
    `| package | ${METRICS.join(' | ')} | |`,
    `| --- | ${METRICS.map(() => '---:').join(' | ')} | --- |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ]
  if (additions.length > 0) {
    md.push(
      ``,
      `> ${additions.length} package(s) are not in the baseline yet: ${additions.join(', ')}.`,
      `> Run \`pnpm test:coverage:update\` and commit the baseline.`,
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
  console.error(
    `\nAdd tests to restore coverage, or run \`pnpm test:coverage:update\` and commit` +
      ` the new baseline if the drop is intentional.`,
  )
  process.exit(1)
}

console.log(`\nCoverage held for ${names.length} measured package(s).`)
