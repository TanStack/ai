import { execFileSync } from 'node:child_process'
import {
  parseModels,
  supportsBuiltInServerTools,
  supportsClientToolCalling,
} from './helpers'

const models = parseModels(process.argv.slice(2))

const scripts = [
  'streaming.ts',
  'tool-test.ts',
  'tool-test-optional.ts',
  'tool-test-empty-object.ts',
  'builtin-tools.ts',
  'structured-output.ts',
  'reasoning.ts',
  'multi-turn.ts',
] as const

let failures = 0

for (const model of models) {
  console.log(`\n=== Running Grok live-tests for model: ${model} ===`)

  for (const script of scripts) {
    if (
      (script === 'tool-test.ts' ||
        script === 'tool-test-optional.ts' ||
        script === 'tool-test-empty-object.ts') &&
      !supportsClientToolCalling(model)
    ) {
      console.log(`\n→ ${script}`)
      console.log(
        `SKIP: ${model} does not support client-side tool calling`,
      )
      continue
    }

    if (script === 'builtin-tools.ts' && !supportsBuiltInServerTools(model)) {
      console.log(`\n→ ${script}`)
      console.log(
        `SKIP: ${model} does not advertise built-in server-side tools in this adapter`,
      )
      continue
    }

    console.log(`\n→ ${script}`)
    try {
      execFileSync('pnpm', ['exec', 'tsx', script, '--model', model], {
        stdio: 'inherit',
        env: process.env,
      })
    } catch {
      failures++
      console.error(`FAILED: ${script} on model=${model}`)
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} live test run(s) failed.`)
  process.exit(1)
}

console.log(`\nAll live test runs passed for: ${models.join(', ')}`)
