// Terminal-bench-style suite: this is the regime Strands' 77%/28% comes from.
// The agent runs shell commands whose stdout is large but DISPOSABLE -- verbose
// build/test logs -- and the answer is a small summary line at the tail. This is
// where size-based tool-result truncation is nearly free: head_tail keeps the
// tail (the summary), clips the noise, and the answer still survives.
//
// Contrast with the multi-write/agentic suites, where the truncated field was
// LOAD-BEARING and truncation backfired. Same mechanism, opposite outcome --
// the workload decides. Running both is the honest way to bound the claim.
//
//   node generate.mjs --count 3 --cmds 3 --out ./out [--seed 42]
//
// Each task: run N noisy scripts (each prints ~thousands of log lines then a
// `SUMMARY: warnings=<w>` line LAST), report the total warnings. Shell is ON.
// Grading: final line `WARNINGS=<total>`.

import { mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import path from 'node:path'

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? dflt : process.argv[i + 1]
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A script that emits a big noisy log and ends with the load-bearing summary.
// The summary is the LAST line, so a tail-preserving preview always keeps it.
function makeScript(outDir, tag, lines, warnings) {
  const p = path.join(outDir, `build-${tag}.sh`)
  const body = [
    '#!/usr/bin/env bash',
    'set -e',
    `for i in $(seq 1 ${lines}); do`,
    '  echo "[compile] module_$i.o  ok  ($(( (i * 7) % 1000 ))ms)  flags=-O2 -Wall -Wextra"',
    'done',
    `echo "SUMMARY: warnings=${warnings} errors=0 built ${lines} modules"`,
  ].join('\n')
  writeFileSync(p, body + '\n')
  chmodSync(p, 0o755)
  return { path: path.resolve(p), warnings }
}

function makeTask(n, cmds, rng, outDir) {
  const id = `tb-${String(n).padStart(3, '0')}`
  const scripts = []
  for (let c = 0; c < cmds; c++) {
    const lines = 1200 + Math.floor(rng() * 1600) // ~1200-2800 noisy lines -> well over 1500 tokens
    const warnings = 1 + Math.floor(rng() * 40)
    scripts.push(makeScript(outDir, `${String(n).padStart(3, '0')}-${c}`, lines, warnings))
  }
  const total = scripts.reduce((s, x) => s + x.warnings, 0)
  const list = scripts.map((s, i) => `  ${i + 1}. bash ${s.path}`).join('\n')

  const prompt =
    `Run these ${cmds} build scripts with the run_shell tool, one at a time:\n${list}\n` +
    `Each prints a long build log and ends with a line like "SUMMARY: warnings=<w> ...". ` +
    `Read the warning count from each script's summary line. When all ${cmds} have run, ` +
    `output exactly one line and nothing else: WARNINGS=<n>, where <n> is the TOTAL number ` +
    `of warnings across all scripts.`

  return {
    id,
    suite: 'terminal-bench',
    prompt,
    cwd: path.resolve(outDir),
    answer: `WARNINGS=${total}`,
    // shell ON (default); this is the whole point of the suite
    scripts: scripts.map((s) => ({ path: s.path, warnings: s.warnings })),
    warnings: total,
  }
}

function main() {
  const count = Number(arg('--count', '3'))
  const cmds = Number(arg('--cmds', '3'))
  const outDir = arg('--out', path.join(path.dirname(new URL(import.meta.url).pathname), 'out'))
  const seed = Number(arg('--seed', '42'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, cmds, rng, outDir)
    writeFileSync(path.join(outDir, `task-${String(n).padStart(3, '0')}.json`), JSON.stringify(task, null, 2) + '\n')
  }
  console.log(`Wrote ${count} terminal-bench tasks (${cmds} noisy commands each) to ${outDir} (seed ${seed}).`)
}

main()
