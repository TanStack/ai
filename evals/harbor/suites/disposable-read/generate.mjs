// Disposable-read suite: the terminal-bench idea, but forced through read_file
// with no shell. A capable model (Sonnet) pipes shell output (`| tail`) and so
// never pulls a big log into context, which makes the shell-based terminal-bench
// suite invalid on it. Here the agent MUST read a large log file whole; the
// answer is a SUMMARY line at the very end, so a tail-preserving truncation
// (head_tail / the leaves + flatten defaults) keeps the answer while clipping
// the disposable bulk. This is where optimize() should win even on a smart model.
//
//   node generate.mjs --count 2 --lines 2500 --out ./out [--seed 42]
//
// Arms: baseline carries the whole log; `universal` / `global` truncate the read
// (answer survives in the kept tail). Grading: final line `WARNINGS=<n>`.

import { mkdirSync, writeFileSync } from 'node:fs'
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

function logLine(rng, i) {
  const levels = ['INFO', 'DEBUG', 'TRACE', 'WARN']
  const mods = ['compile', 'link', 'bundle', 'resolve', 'emit']
  const lvl = levels[Math.floor(rng() * levels.length)]
  const mod = mods[Math.floor(rng() * mods.length)]
  return `[${lvl}] ${mod}: step ${i} ok in ${Math.floor(rng() * 900)}ms (cache=${rng() > 0.5 ? 'hit' : 'miss'})`
}

function makeTask(n, lines, rng, outDir) {
  const id = `dr-${String(n).padStart(3, '0')}`
  const warnings = 7 + Math.floor(rng() * 90)
  const body = []
  for (let i = 0; i < lines; i++) body.push(logLine(rng, i))
  // The decisive line is LAST, so a tail-preserving preview keeps it.
  body.push(`SUMMARY: warnings=${warnings} errors=0 built ${lines} steps`)
  const logPath = path.join(outDir, `log-${String(n).padStart(3, '0')}.txt`)
  writeFileSync(logPath, body.join('\n') + '\n')

  const prompt =
    `Using ONLY the read_file tool (no shell), read the build log at ` +
    `${path.resolve(logPath)}. Its last line is "SUMMARY: warnings=<n> ...". ` +
    `Report exactly one line and nothing else: WARNINGS=<n>, taking <n> from that summary line.`

  return {
    id,
    suite: 'disposable-read',
    prompt,
    cwd: path.resolve(outDir),
    answer: `WARNINGS=${warnings}`,
    disableShell: true, // force the whole log through read_file; no piping
    logPath: path.resolve(logPath),
    warnings,
    lines,
  }
}

function main() {
  const count = Number(arg('--count', '2'))
  const lines = Number(arg('--lines', '2500'))
  const outDir = arg(
    '--out',
    path.join(path.dirname(new URL(import.meta.url).pathname), 'out'),
  )
  const seed = Number(arg('--seed', '42'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, lines, rng, outDir)
    writeFileSync(
      path.join(outDir, `task-${String(n).padStart(3, '0')}.json`),
      JSON.stringify(task, null, 2) + '\n',
    )
  }
  console.log(
    `Wrote ${count} disposable-read tasks (${lines}-line logs) to ${outDir} (seed ${seed}).`,
  )
}

main()
