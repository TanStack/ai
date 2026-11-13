// E2 — the Node agent Harbor uploads and runs inside a task container, also
// runnable standalone for a `--smoke` test. It builds a chat() agent whose
// tools are a shell tool and a file-editor tool, selects an arm by env, runs
// the task, and writes a result + events record with the full §7 token split.
//
// Arms are selected by env/config, nothing else changes. System prompt and
// turn limits are held constant across arms.
//
// Usage:
//   ARM=adorned MODEL=claude-sonnet-4-6 node tanstack_ai_runner.mjs --smoke task.json
//   (Harbor path: reads the task from argv/stdin per the BaseInstalledAgent
//    contract — see tanstack_ai.py — and writes result.json + events.jsonl.)

import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chat, maxIterations } from '@tanstack/ai'
import { optimize } from '@tanstack/ai-optimize'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { armSpec } from './arms.mjs'
import { makeTools } from './tools.mjs'

const SYSTEM_PROMPT =
  'You are a precise command-line agent. Use the tools to inspect files and run ' +
  'commands. When you have the answer, state it plainly as the final message. ' +
  'If a tool result shows a "[Truncated for context: ...]" or "[Dropped for ' +
  'context: ...]" marker and you need the elided part, call retrieve_context ' +
  'with the ref in the marker.'

const TURN_LIMIT = Number(process.env.TURN_LIMIT ?? 30)

// --- minimal .env.local loader (keys live at the repo root) ----------------
function loadEnvLocal() {
  // walk up to find .env.local
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, '.env.local')
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m && process.env[m[1]] === undefined)
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      return
    }
    dir = path.dirname(dir)
  }
}

// --- adapter resolution (model ladder; never Fable-anchored) ---------------
async function resolveAdapter(model) {
  if (model.startsWith('gemini-')) {
    // geminiText() reads GOOGLE_API_KEY, then GEMINI_API_KEY, from the env.
    const { geminiText } = await import('@tanstack/ai-gemini')
    return geminiText(model)
  }
  if (model.startsWith('gpt-') || model.startsWith('o')) {
    const { openaiText } = await import('@tanstack/ai-openai')
    return openaiText(model)
  }
  // claude-* and claude-fable-5 are served by the Anthropic adapter.
  const { anthropicText } = await import('@tanstack/ai-anthropic')
  return anthropicText(model)
}

// --- usage + event collection ----------------------------------------------
function makeUsageMiddleware(collector) {
  return {
    name: 'eval-usage',
    onIteration() {
      collector.steps += 1
    },
    onUsage(_ctx, usage) {
      collector.input += usage.inputTokens ?? usage.promptTokens ?? 0
      collector.output += usage.outputTokens ?? usage.completionTokens ?? 0
      collector.cacheRead +=
        usage.cacheReadTokens ?? usage.cachedInputTokens ?? 0
      collector.cacheWrite +=
        usage.cacheWriteTokens ?? usage.cacheCreationTokens ?? 0
    },
  }
}

function buildAgent(arm, cwd, events, includeShell) {
  const { codeMode, config } = armSpec(arm)
  const systemPrompts = [SYSTEM_PROMPT]

  // In code mode the agent sees one tool, execute_typescript, that runs its
  // program in a QuickJS sandbox; the file tools become external_* functions.
  let agentTools
  if (codeMode) {
    const fileTools = makeTools(cwd, { includeShell: false })
    const cm = createCodeMode({
      driver: createQuickJSIsolateDriver(),
      tools: fileTools,
    })
    systemPrompts.push(cm.systemPrompt)
    agentTools = cm.tools
  } else {
    agentTools = makeTools(cwd, { includeShell })
  }

  if (!config) return { tools: agentTools, middleware: [], systemPrompts }
  const opt = optimize(agentTools, {
    ...config,
    onEvent: (e) => events.push(e),
  })
  return { tools: opt.tools, middleware: [opt.middleware], systemPrompts }
}

// --- grading + truncation-attributed failure classification ----------------
function classify(task, finalText, events) {
  const solved =
    typeof task.answer === 'string' &&
    finalText.toLowerCase().includes(task.answer.toLowerCase())
  if (solved) return { solved: true, failureClass: null }

  const retrievals = events.filter((e) => e.type === 'retrieved')
  const projections = events.filter((e) => e.type === 'projected')
  // Heuristic classification (the brief's named failure metric):
  //  - missing-middle: a field was truncated, the needle was likely in it, and
  //    it was never retrieved.
  //  - failed-retrieval: retrieval happened but the task still failed.
  let failureClass = 'other'
  if (projections.length > 0 && retrievals.length === 0)
    failureClass = 'missing-middle'
  else if (retrievals.length > 0) failureClass = 'failed-retrieval'
  return { solved: false, failureClass }
}

export async function runTask(task, { arm, model }) {
  const cwd = task.cwd ?? process.cwd()
  const events = []
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, steps: 0 }
  const { tools, middleware, systemPrompts } = buildAgent(
    arm,
    cwd,
    events,
    task.disableShell !== true,
  )
  const adapter = await resolveAdapter(model)

  let finalText = ''
  const stream = chat({
    adapter,
    model,
    systemPrompts,
    messages: [{ role: 'user', content: task.prompt }],
    threadId: `eval-${task.id}`,
    tools,
    middleware: [makeUsageMiddleware(usage), ...middleware],
    agentLoopStrategy: maxIterations(TURN_LIMIT),
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'TEXT_MESSAGE_CONTENT' &&
      typeof chunk.delta === 'string'
    )
      finalText += chunk.delta
  }

  const { solved, failureClass } = classify(task, finalText, events)
  const cacheHitRate = usage.input > 0 ? usage.cacheRead / usage.input : 0

  return {
    taskId: task.id,
    suite: task.suite ?? 'unknown',
    arm,
    model,
    implementation: {
      language: 'typescript',
      package: '@tanstack/ai-optimize',
      version: packageVersion(),
    },
    outcome: solved ? 'solved' : 'failed',
    failureClass,
    tokens: {
      input: usage.input,
      output: usage.output,
      cache_read: usage.cacheRead,
      cache_write: usage.cacheWrite,
      steps: usage.steps,
      cache_hit_rate: Number(cacheHitRate.toFixed(4)),
    },
    truncation: {
      projections: events.filter((e) => e.type === 'projected').length,
      retrievals: events.filter((e) => e.type === 'retrieved').length,
    },
  }
}

function packageVersion() {
  try {
    const p = new URL(
      '../../packages/ai-optimize/package.json',
      import.meta.url,
    )
    return JSON.parse(readFileSync(p, 'utf8')).version
  } catch {
    return 'unknown'
  }
}

async function main() {
  loadEnvLocal()
  const arm = process.env.ARM ?? 'baseline'
  const model = process.env.MODEL ?? 'claude-sonnet-4-6'
  const smokeIdx = process.argv.indexOf('--smoke')
  if (smokeIdx === -1) {
    // TODO(harbor): read the task from Harbor's container contract (argv/stdin)
    // and write the trajectory files Harbor converts. See tanstack_ai.py.
    console.error(
      'Harbor container mode not wired yet. Use --smoke <task.json> for a local run.',
    )
    process.exit(2)
  }
  const taskPath = process.argv[smokeIdx + 1]
  const task = JSON.parse(await readFile(taskPath, 'utf8'))
  const record = await runTask(task, { arm, model })
  // One line of per-trial JSONL to stdout (the §7 split).
  process.stdout.write(JSON.stringify(record) + '\n')
}

// Only run the CLI when invoked directly (not when imported by run-matrix.mjs).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
