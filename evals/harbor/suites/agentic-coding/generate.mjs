// Agentic-coding suite: read a large file, transform it, write a large file.
// This exercises the realistic coding loop the feature targets:
//   - read_file content is load-bearing while editing -> keep it whole
//   - write_file content is redundant once on disk -> drop the completed call's
//     args from history (D3), AFTER the write has gone back to the model.
//
//   node generate.mjs --count 3 --out ./out [--seed 42]
//
// Each task writes:
//   out/source-NNN.txt   a large source file with K occurrences of ACME_OLD
//   out/task-NNN.json     { id, suite, prompt, cwd, answer, disableShell, ... }
//
// Grading: the agent must report `REPLACEMENTS=<K>` where K is the exact count,
// which requires seeing the WHOLE file. An arm that truncates the read result
// (global / universal) loses middle occurrences and reports the wrong count.

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

// A line of plausible source, occasionally carrying the token to replace.
function sourceLine(rng, i, carriesToken) {
  const fns = ['handleRequest', 'parseConfig', 'buildIndex', 'flushQueue', 'retryWithBackoff']
  const fn = fns[Math.floor(rng() * fns.length)]
  if (carriesToken) {
    return `  const client = new ACME_OLD(config.endpoint); // line ${i}, wires ${fn}`
  }
  return `  // ${fn}: step ${i} handled in ${Math.floor(rng() * 500)}ms, retries=${Math.floor(rng() * 4)}`
}

function makeTask(n, rng, outDir) {
  const id = `ac-${String(n).padStart(3, '0')}`
  const totalLines = 260 + Math.floor(rng() * 220)
  // Scatter K occurrences across the whole file (including the middle).
  const k = 14 + Math.floor(rng() * 20)
  const positions = new Set()
  while (positions.size < k) positions.add(Math.floor(rng() * totalLines))

  const lines = []
  for (let i = 0; i < totalLines; i++) lines.push(sourceLine(rng, i, positions.has(i)))
  const sourcePath = path.join(outDir, `source-${String(n).padStart(3, '0')}.txt`)
  const outputPath = path.join(outDir, `output-${String(n).padStart(3, '0')}.txt`)
  writeFileSync(sourcePath, lines.join('\n') + '\n')

  const prompt =
    `Using ONLY the read_file and write_file tools (no shell), read the file at ` +
    `${path.resolve(sourcePath)}. Replace every occurrence of the exact string ` +
    `"ACME_OLD" with "ACME_NEW". Write the COMPLETE modified file to ` +
    `${path.resolve(outputPath)}. Then, as your final message, output exactly one ` +
    `line and nothing else: REPLACEMENTS=<n>, where <n> is how many replacements you made.`

  return {
    id,
    suite: 'agentic-coding',
    prompt,
    cwd: path.resolve(outDir),
    answer: `REPLACEMENTS=${k}`,
    disableShell: true, // force content through read_file / write_file, not grep/sed
    replacements: k,
    totalLines,
    sourcePath: path.resolve(sourcePath),
    outputPath: path.resolve(outputPath),
  }
}

function main() {
  const count = Number(arg('--count', '3'))
  const outDir = arg('--out', path.join(path.dirname(new URL(import.meta.url).pathname), 'out'))
  const seed = Number(arg('--seed', '42'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, rng, outDir)
    writeFileSync(path.join(outDir, `task-${String(n).padStart(3, '0')}.json`), JSON.stringify(task, null, 2) + '\n')
  }
  console.log(`Wrote ${count} agentic-coding tasks + sources to ${outDir} (seed ${seed}).`)
}

main()
