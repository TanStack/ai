// Code-mode suite: the agent works entirely through execute_typescript. Code
// mode already keeps file contents in the sandbox, so the model context is tiny
// -- that's code mode's own win. This suite isolates what optimize() adds ON TOP
// of code mode: the `logs`. Real agents console.log liberally to debug ("let me
// see what I'm working with"), and those dumps are pure noise once the step is
// done. The task tells the agent to log each file's content as it processes it;
// `cm-adorned` clips those logs (head_tail), `cm-baseline` carries every dump
// for the rest of the run. The returned count stays whole, so no accuracy loss.
//
//   node generate.mjs --count 3 --files 3 --out ./out [--seed 42]
//
// Grading: final line `REPLACEMENTS=<total>`.

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
  const fns = [
    'handleRequest',
    'parseConfig',
    'buildIndex',
    'flushQueue',
    'retryWithBackoff',
  ]
  const fn = fns[Math.floor(rng() * fns.length)]
  if (carriesToken)
    return `  const client = new ACME_OLD(config.endpoint); // line ${i}, wires ${fn}`
  return `  // ${fn}: step ${i} handled in ${Math.floor(rng() * 500)}ms, retries=${Math.floor(rng() * 4)}`
}

function makeSource(rng, outDir, tag) {
  const totalLines = 200 + Math.floor(rng() * 160)
  const k = 10 + Math.floor(rng() * 16)
  const positions = new Set()
  while (positions.size < k) positions.add(Math.floor(rng() * totalLines))
  const lines = []
  for (let i = 0; i < totalLines; i++)
    lines.push(sourceLine(rng, i, positions.has(i)))
  const srcPath = path.join(outDir, `cm-${tag}-src.txt`)
  const outPath = path.join(outDir, `cm-${tag}-out.txt`)
  writeFileSync(srcPath, lines.join('\n') + '\n')
  return { srcPath: path.resolve(srcPath), outPath: path.resolve(outPath), k }
}

function makeTask(n, files, rng, outDir) {
  const id = `cm-${String(n).padStart(3, '0')}`
  const specs = []
  for (let f = 0; f < files; f++)
    specs.push(makeSource(rng, outDir, `${String(n).padStart(3, '0')}-${f}`))
  const total = specs.reduce((s, x) => s + x.k, 0)
  const fileList = specs
    .map(
      (s, i) => `  ${i + 1}. read ${s.srcPath}, write result to ${s.outPath}`,
    )
    .join('\n')

  const prompt =
    `Process these ${files} files. For EACH file: read it, replace every occurrence of "ACME_OLD" ` +
    `with "ACME_NEW", and write the COMPLETE result to its output path:\n${fileList}\n` +
    `IMPORTANT: for debugging, console.log the FULL content of each file (both before and after the ` +
    `replacement) as you process it, so the work is auditable. When all files are done, output exactly ` +
    `one line and nothing else: REPLACEMENTS=<n>, the TOTAL replacements across all files.`

  return {
    id,
    suite: 'code-mode',
    prompt,
    cwd: path.resolve(outDir),
    answer: `REPLACEMENTS=${total}`,
    disableShell: true,
    codeModeOnly: true, // meaningful only under code-mode arms
    files: specs.map((s) => ({ src: s.srcPath, out: s.outPath, k: s.k })),
    replacements: total,
  }
}

function main() {
  const count = Number(arg('--count', '3'))
  const files = Number(arg('--files', '3'))
  const outDir = arg(
    '--out',
    path.join(path.dirname(new URL(import.meta.url).pathname), 'out'),
  )
  const seed = Number(arg('--seed', '77'))
  mkdirSync(outDir, { recursive: true })
  const rng = mulberry32(seed)
  for (let n = 0; n < count; n++) {
    const task = makeTask(n, files, rng, outDir)
    writeFileSync(
      path.join(outDir, `task-${String(n).padStart(3, '0')}.json`),
      JSON.stringify(task, null, 2) + '\n',
    )
  }
  console.log(
    `Wrote ${count} code-mode tasks (${files} files each) to ${outDir} (seed ${seed}).`,
  )
}

main()
