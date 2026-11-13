// E3 — the held-out middle-critical suite generator. Synthetic tasks whose tool
// outputs are large with the decisive fact buried mid-output: long logs with
// one load-bearing line at a controlled depth. NEVER used for tuning.
//
//   node generate.mjs --count 12 --out ./out [--seed 42]
//
// Each task writes:
//   out/fixture-NNN.log   a long log with the needle at a controlled depth
//   out/task-NNN.json     { id, suite, prompt, cwd, answer, needleDepth }

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? dflt : process.argv[i + 1]
}

// Deterministic PRNG so the suite is reproducible (no Math.random).
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

const SERVICES = ['api', 'worker', 'scheduler', 'auth', 'billing', 'ingest']
const LEVELS = ['INFO', 'DEBUG', 'WARN', 'TRACE']

function noiseLine(rng, i) {
  const svc = SERVICES[Math.floor(rng() * SERVICES.length)]
  const lvl = LEVELS[Math.floor(rng() * LEVELS.length)]
  return `2026-11-12T10:${String(i % 60).padStart(2, '0')}:00Z ${lvl} ${svc}: request ${Math.floor(rng() * 1e6)} handled in ${Math.floor(rng() * 500)}ms`
}

function makeTask(n, rng, outDir) {
  const id = `mc-${String(n).padStart(3, '0')}`
  const token = `SECRET-${Math.floor(rng() * 1e9).toString(36).toUpperCase()}`
  const totalLines = 400 + Math.floor(rng() * 600)
  // Controlled depth: bury the needle away from both ends.
  const depth = 0.25 + rng() * 0.5
  const needleAt = Math.floor(totalLines * depth)

  const lines = []
  for (let i = 0; i < totalLines; i++) {
    lines.push(i === needleAt ? `2026-11-12T10:30:00Z INFO billing: provisioning token issued value=${token}` : noiseLine(rng, i))
  }
  const logPath = path.join(outDir, `fixture-${String(n).padStart(3, '0')}.log`)
  writeFileSync(logPath, lines.join('\n') + '\n')

  const prompt =
    `Read the log file at ${path.resolve(logPath)} and find the single provisioning ` +
    `token. Report ONLY the token value (the string after "value=").`

  return {
    id,
    suite: 'middle-critical',
    prompt,
    cwd: path.resolve(outDir),
    answer: token,
    needleDepth: Number(depth.toFixed(3)),
    totalLines,
  }
}

function main() {
  const count = Number(arg('--count', '12'))
  const outDir = arg('--out', path.join(path.dirname(new URL(import.meta.url).pathname), 'out'))
  const seed = Number(arg('--seed', '42'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, rng, outDir)
    writeFileSync(path.join(outDir, `task-${String(n).padStart(3, '0')}.json`), JSON.stringify(task, null, 2) + '\n')
  }
  console.log(`Wrote ${count} middle-critical tasks + fixtures to ${outDir} (seed ${seed}).`)
}

main()
