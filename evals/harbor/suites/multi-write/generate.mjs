// Multi-write suite: one session edits SEVERAL files. Read file, replace a
// token, write it back; repeat for N files; report the total. This is where the
// write-arg drop (D3) compounds: after the agent writes file 1, that completed
// write_file call's `content` arg lingers in history for every later step (read
// file 2, write file 2, read file 3, ...). With N writes the first program's
// content rides along for ~2N more model calls. The `adorned` arm drops each
// completed write's content; `baseline` keeps them all. The single-write
// agentic-coding suite can't show this — the saving only applies to one call.
//
//   node generate.mjs --count 3 --files 4 --out ./out [--seed 42]
//
// Grading: the agent must end with `REPLACEMENTS=<total>` summed across all
// files, which requires seeing every whole file (truncating the read loses
// middle occurrences and miscounts).

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

function sourceLine(rng, i, carriesToken) {
  const fns = ['handleRequest', 'parseConfig', 'buildIndex', 'flushQueue', 'retryWithBackoff']
  const fn = fns[Math.floor(rng() * fns.length)]
  if (carriesToken) {
    return `  const client = new ACME_OLD(config.endpoint); // line ${i}, wires ${fn}`
  }
  return `  // ${fn}: step ${i} handled in ${Math.floor(rng() * 500)}ms, retries=${Math.floor(rng() * 4)}`
}

function makeSource(rng, outDir, tag) {
  const totalLines = 110 + Math.floor(rng() * 90)
  const k = 8 + Math.floor(rng() * 12)
  const positions = new Set()
  while (positions.size < k) positions.add(Math.floor(rng() * totalLines))
  const lines = []
  for (let i = 0; i < totalLines; i++) lines.push(sourceLine(rng, i, positions.has(i)))
  const srcPath = path.join(outDir, `mw-${tag}-src.txt`)
  const outPath = path.join(outDir, `mw-${tag}-out.txt`)
  writeFileSync(srcPath, lines.join('\n') + '\n')
  return { srcPath: path.resolve(srcPath), outPath: path.resolve(outPath), k }
}

function makeTask(n, files, rng, outDir) {
  const id = `mw-${String(n).padStart(3, '0')}`
  const specs = []
  for (let f = 0; f < files; f++) specs.push(makeSource(rng, outDir, `${String(n).padStart(3, '0')}-${f}`))
  const total = specs.reduce((s, x) => s + x.k, 0)

  const fileList = specs.map((s, i) => `  ${i + 1}. read ${s.srcPath}, replace, write the result to ${s.outPath}`).join('\n')
  const prompt =
    `Using ONLY the read_file and write_file tools (no shell), process these ${files} files one at a time. ` +
    `For EACH file: read it, replace every occurrence of the exact string "ACME_OLD" with "ACME_NEW", ` +
    `and write the COMPLETE modified file to its output path:\n${fileList}\n` +
    `After all ${files} files are written, output exactly one line and nothing else: ` +
    `REPLACEMENTS=<n>, where <n> is the TOTAL number of replacements across all files.`

  return {
    id,
    suite: 'multi-write',
    prompt,
    cwd: path.resolve(outDir),
    answer: `REPLACEMENTS=${total}`,
    disableShell: true,
    files: specs.map((s) => ({ src: s.srcPath, out: s.outPath, k: s.k })),
    replacements: total,
  }
}

function main() {
  const count = Number(arg('--count', '3'))
  const files = Number(arg('--files', '4'))
  const outDir = arg('--out', path.join(path.dirname(new URL(import.meta.url).pathname), 'out'))
  const seed = Number(arg('--seed', '42'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, files, rng, outDir)
    writeFileSync(path.join(outDir, `task-${String(n).padStart(3, '0')}.json`), JSON.stringify(task, null, 2) + '\n')
  }
  console.log(`Wrote ${count} multi-write tasks (${files} files each) to ${outDir} (seed ${seed}).`)
}

main()
