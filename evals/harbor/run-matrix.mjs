// Matrix runner: suite x arms x tasks x trials -> one JSONL under results/.
// Runs sequentially (arms share task output paths, and this is kinder to rate
// limits). Resume-friendly: appends; re-running overwrites the named file.
//
//   node run-matrix.mjs \
//     --tasks "suites/multi-write/out/task-*.json" \
//     --arms baseline,adorned,universal,global,cm-baseline,cm-adorned \
//     --model gemini-3.8-flash --trials 3 --out results/multi-write.jsonl
//
// Then: node report.mjs results/multi-write.jsonl

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, globSync } from 'node:fs'
import path from 'node:path'
import { runTask } from './tanstack_ai_runner.mjs'

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? dflt : process.argv[i + 1]
}

async function main() {
  // minimal .env.local loader (mirror the runner; keys live at the repo root)
  const { existsSync } = await import('node:fs')
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, '.env.local')
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      break
    }
    dir = path.dirname(dir)
  }

  const taskGlob = arg('--tasks')
  const arms = arg('--arms', 'baseline,adorned').split(',').map((s) => s.trim()).filter(Boolean)
  const model = arg('--model', 'gemini-3.8-flash')
  const trials = Number(arg('--trials', '3'))
  const outFile = arg('--out', 'results/matrix.jsonl')
  if (!taskGlob) {
    console.error('usage: node run-matrix.mjs --tasks "glob" --arms a,b,c --model M --trials N --out results/x.jsonl')
    process.exit(1)
  }

  const taskFiles = globSync(taskGlob).sort()
  if (taskFiles.length === 0) {
    console.error(`no task files matched ${taskGlob}`)
    process.exit(1)
  }
  mkdirSync(path.dirname(outFile), { recursive: true })
  writeFileSync(outFile, '') // fresh file for this run

  const total = taskFiles.length * arms.length * trials
  let done = 0
  console.error(`matrix: ${taskFiles.length} tasks x ${arms.length} arms x ${trials} trials = ${total} runs on ${model}`)

  for (const tf of taskFiles) {
    const task = JSON.parse(readFileSync(tf, 'utf8'))
    for (const arm of arms) {
      for (let trial = 0; trial < trials; trial++) {
        done += 1
        const tag = `[${done}/${total}] ${task.id} ${arm} t${trial}`
        try {
          const rec = await runTask(task, { arm, model })
          rec.trial = trial
          appendFileSync(outFile, JSON.stringify(rec) + '\n')
          console.error(`${tag} -> ${rec.outcome} in=${rec.tokens.input} proj=${rec.truncation.projections} retr=${rec.truncation.retrievals}`)
        } catch (err) {
          const rec = { taskId: task.id, suite: task.suite, arm, model, trial, outcome: 'error', failureClass: 'runner-error', error: String(err?.message ?? err), tokens: { input: 0, output: 0 }, truncation: { projections: 0, retrievals: 0 } }
          appendFileSync(outFile, JSON.stringify(rec) + '\n')
          console.error(`${tag} -> ERROR ${rec.error}`)
        }
      }
    }
  }
  console.error(`wrote ${outFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
