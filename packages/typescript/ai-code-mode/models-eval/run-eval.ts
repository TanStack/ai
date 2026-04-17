/**
 * Code-mode models eval: run each configured model on the database-demo gold prompt,
 * then judge vs gold report (Anthropic Opus + structured scores).
 *
 * Usage (from repo root):
 *   pnpm --filter @tanstack/ai-code-mode-models-eval eval
 *   pnpm --filter @tanstack/ai-code-mode-models-eval eval -- --ollama-only
 *   pnpm --filter @tanstack/ai-code-mode-models-eval eval -- --models openai:gpt-4o,groq:qwen/qwen3-32b
 *   cd packages/typescript/ai-code-mode/models-eval && pnpm eval -- --no-judge
 *
 * Env:
 *   ANTHROPIC_API_KEY — required for judging (unless --no-judge); auto-loaded from
 *     examples/ts-code-mode-web/.env.local (or repo-root .env.local) if present
 *   OPENAI_API_KEY — for OpenAI eval models
 *   GOOGLE_GENERATIVE_AI_API_KEY — for Gemini eval models
 *   XAI_API_KEY — for Grok (xAI) eval models
 *   GROQ_API_KEY — for Groq eval models
 *
 * Each run log JSON under models-eval/log/ includes `messages` (full UIMessage[] from
 * StreamProcessor: user prompt, assistant text, tool-call parts, tool results).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import {
  StreamProcessor,
  chat,
  generateMessageId,
  maxIterations,
  normalizeToUIMessage,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { ollamaText } from '@tanstack/ai-ollama'
import { openaiText } from '@tanstack/ai-openai'
import { createCodeMode } from '@tanstack/ai-code-mode'

import { databaseTools, getSchemaInfoTool } from './database-tools'
import { EVAL_MODELS, getModelCategory, parseModelId } from './eval-config'
import { judgeReports } from './judge'
import {
  computeMetrics,
  computeStarRating,
  formatTypescriptEvidence,
} from './metrics'
import type { JudgeResult } from './judge'
import type { AnyTextAdapter, StreamChunk, UIMessage } from '@tanstack/ai'
import type { EvalProvider, ModelCategory } from './eval-config'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Per-run JSON logs (gitignored); inspect candidate text vs gold when scores look wrong. */
const LOG_DIR = join(__dirname, 'log')

const repoRoot = join(__dirname, '../../../../')

function loadEnvLocalFiles() {
  const paths = [
    join(repoRoot, 'examples/ts-code-mode-web/.env.local'),
    join(repoRoot, 'examples/ts-code-mode-web/.env'),
    join(repoRoot, '.env.local'),
    join(repoRoot, '.env'),
    join(repoRoot, 'packages/typescript/ai-code-mode/.env.local'),
    join(__dirname, '.env.local'),
  ]
  for (const path of paths) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false })
    }
  }
}

loadEnvLocalFiles()

/**
 * Code-mode–accurate copy: top-level tools are only getSchemaInfo + execute_typescript.
 * The web demo's direct-tools prompt incorrectly names `queryTable` as a top-level tool;
 * in code mode, querying happens via external_queryTable *inside* execute_typescript.
 */
const DATABASE_DEMO_SYSTEM_PROMPT = `You are a helpful data analyst assistant working with an in-memory database: tables **customers**, **products**, and **purchases**.

## Top-level tools (these are the only tools you can invoke)

1. **getSchemaInfo** — Returns schema and row counts. Prefer **one call with no table argument** so you receive customers, products, and purchases together.

2. **execute_typescript** — Runs TypeScript in a sandbox. Inside the sandbox you call **external_queryTable** and **external_getSchemaInfo** (same behavior as querying the DB). Use this for every multi-table join, filter, aggregation, and analysis.

## Tables

- **customers** — id, name, email, city, joined
- **products** — id, name, category, price, stock
- **purchases** — id, customer_id, product_id, quantity, total, purchased_at

**Joins:** \`purchases\` does **not** have \`category\`. Category is only on \`products\`. Load \`purchases\` and \`products\`, then join in code with \`product_id\` → \`products.id\` to know each purchase’s category. If you \`external_queryTable({ table: 'purchases', columns: ['category'] })\`, every row will be \`{}\` — that is wrong.

## Strategy

- Call getSchemaInfo once (omit \`table\`) unless you truly need a single table only.
- Use **execute_typescript** with TypeScript that calls \`external_queryTable\` / \`external_getSchemaInfo\` to load rows, join across tables, and compute answers. Do not try to answer from schema alone.
- After the script returns, write a clear final answer (tables, numbers, short summary).
- If something is ambiguous, state assumptions briefly.

## Critical: \`external_queryTable\` (read this — common failures)

This is **not** SQL and **not** a raw string. You must pass a single **object** with a \`table\` field:

\`\`\`typescript
const purchases = await external_queryTable({ table: 'purchases' })
// Result shape: { rows: Array<Record<string, unknown>>, totalMatchingRows: number }
for (const row of purchases.rows) { /* ... */ }
\`\`\`

- Valid \`table\` values: \`customers\` | \`products\` | \`purchases\` only.
- **Never** pass SQL, \`query:\`, \`sql:\`, or iterate the return value directly — use \`.rows\`.
- \`external_getSchemaInfo\` takes \`{}\` for all tables or \`{ table: 'products' }\` for one table.

Put **only valid TypeScript** in \`typescriptCode\`: no markdown fences (\`\`\`), no \`**\` headings inside the code string.`

interface GoldMessagePart {
  type: string
  content?: string
}

interface GoldMessage {
  role: string
  parts?: Array<GoldMessagePart>
}

interface GoldFile {
  prompt: string
  messages: Array<GoldMessage>
}

function loadGoldFile(): GoldFile {
  const path = join(__dirname, 'gold-results', 'db-gold-messages-1.json')
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as GoldFile
}

function extractReportTextFromGold(messages: Array<GoldMessage>): string {
  return messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) =>
      (m.parts ?? [])
        .filter((p) => p.type === 'text' && p.content)
        .map((p) => p.content as string),
    )
    .join('\n\n')
}

/** Same text extraction as the web demo / gold file, from StreamProcessor UIMessages. */
function extractAssistantReportText(messages: Array<UIMessage>): string {
  return messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) =>
      m.parts.filter((p) => p.type === 'text').map((p) => p.content),
    )
    .join('\n\n')
}

let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
} | null = null

function getCodeModeTools() {
  if (!codeModeCache) {
    const driver = createNodeIsolateDriver()
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: databaseTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

function getTextAdapter(
  provider: EvalProvider,
  modelId: string,
): AnyTextAdapter {
  switch (provider) {
    case 'ollama':
      return ollamaText(modelId)
    case 'openai':
      return openaiText(modelId as 'gpt-4o-mini')
    case 'anthropic':
      return anthropicText(modelId as 'claude-haiku-4-5')
    case 'gemini':
      return geminiText(modelId as 'gemini-2.5-flash')
    case 'grok':
      return grokText(modelId as 'grok-3-mini')
    case 'groq':
      return groqText(modelId as 'llama-3.3-70b-versatile')
  }
}

interface EvalRow {
  name: string
  /** Full `provider:model` id */
  model: string
  provider: EvalProvider
  modelId: string
  modelCategory: ModelCategory
  durationMs: number
  ttftMs?: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  tokenEfficiency?: number
  speedTier: number
  tokenEfficiencyTier: number
  stabilityTier: number
  stabilityRate: number
  stabilitySampleSize: number
  totalToolCalls: number
  totalExecuteCalls: number
  successfulExecuteCalls: number
  compilationFailures: number
  runtimeFailures: number
  redundantSchemaChecks: number
  stars?: 1 | 2 | 3
  weightedScore?: number
  error?: string
  judge?: JudgeResult
}

function parseArgs(argv: Array<string>): {
  ollamaOnly: boolean
  noJudge: boolean
  captureOnly: boolean
  judgeLatest: boolean
  rejudge: boolean
  /** If set, only run entries whose \`model\` is in this list */
  modelFilter: Set<string> | null
} {
  let ollamaOnly = false
  let noJudge = false
  let captureOnly = false
  let judgeLatest = false
  let rejudge = false
  let modelFilter: Set<string> | null = null

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ollama-only' || a === '--ollama') ollamaOnly = true
    if (a === '--no-judge') noJudge = true
    if (a === '--capture-only') captureOnly = true
    if (a === '--judge-latest') judgeLatest = true
    if (a === '--rejudge') rejudge = true
    if (a === '--models' || a === '--model') {
      const raw = argv[i + 1]
      if (raw && !raw.startsWith('--')) {
        i += 1
        const ids = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        modelFilter = new Set(ids)
      }
    }
    if (a === '--help' || a === '-h') {
      console.log(`
@tanstack/ai-code-mode-models-eval (pnpm eval from this folder, or pnpm --filter @tanstack/ai-code-mode-models-eval eval)

  --ollama-only   Only run Ollama models from eval-config
  --models <id>   Comma-separated provider:model ids (e.g. openai:gpt-4o,groq:qwen/qwen3-32b)
  --capture-only  Run models and write logs without LLM judging
  --judge-latest  Judge latest captured session from logs (no model runs)
  --rejudge       Re-judge logs even if judge fields already exist
  --no-judge      Skip LLM judging (no ANTHROPIC_API_KEY needed)
  --help          This message
`)
      process.exit(0)
    }
  }
  return {
    ollamaOnly,
    noJudge,
    captureOnly,
    judgeLatest,
    rejudge,
    modelFilter,
  }
}

function slugForFilename(model: string): string {
  return model.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_')
}

interface RunLogPayload {
  writtenAt: string
  sessionStartedAt: string
  entry: { name: string; model: string }
  query: string
  durationMs: number
  ttftMs?: number
  modelCategory: ModelCategory
  promptTokens: number
  completionTokens: number
  totalTokens: number
  tokenEfficiency?: number
  speedTier: number
  tokenEfficiencyTier: number
  stabilityTier: number
  stabilityRate: number
  stabilitySampleSize: number
  totalToolCalls: number
  totalExecuteCalls: number
  successfulExecuteCalls: number
  compilationFailures: number
  runtimeFailures: number
  redundantSchemaChecks: number
  stars?: 1 | 2 | 3
  weightedScore?: number
  candidateReportChars: number
  candidateReportEmpty: boolean
  goldReportChars: number
  error?: string
  judge?: JudgeResult
  noJudge: boolean
  goldReport: string
  candidateReport: string
  /** Full conversation as UIMessage[] (user + assistant turns, tool calls, tool results). */
  messages: Array<UIMessage>
}

interface CanonicalResultsFile {
  generatedAt: string
  sessionStartedAt: string
  methodology: {
    benchmark: string
    scoring: Array<string>
    stability: string
    starWeights: Record<string, number>
  }
  models: Array<EvalRow>
}

function writeRunLog(payload: RunLogPayload): string {
  mkdirSync(LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${stamp}_${slugForFilename(payload.entry.model)}.json`
  const filePath = join(LOG_DIR, fileName)
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return filePath
}

function toEvalRow(payload: RunLogPayload): EvalRow {
  const { provider, modelId } = parseModelId(payload.entry.model)
  return {
    name: payload.entry.name,
    model: payload.entry.model,
    provider,
    modelId,
    modelCategory: payload.modelCategory,
    durationMs: payload.durationMs,
    ttftMs: payload.ttftMs,
    promptTokens: payload.promptTokens,
    completionTokens: payload.completionTokens,
    totalTokens: payload.totalTokens,
    tokenEfficiency: payload.tokenEfficiency,
    speedTier: payload.speedTier,
    tokenEfficiencyTier: payload.tokenEfficiencyTier,
    stabilityTier: payload.stabilityTier,
    stabilityRate: payload.stabilityRate,
    stabilitySampleSize: payload.stabilitySampleSize,
    totalToolCalls: payload.totalToolCalls,
    totalExecuteCalls: payload.totalExecuteCalls,
    successfulExecuteCalls: payload.successfulExecuteCalls,
    compilationFailures: payload.compilationFailures,
    runtimeFailures: payload.runtimeFailures,
    redundantSchemaChecks: payload.redundantSchemaChecks,
    stars: payload.stars,
    weightedScore: payload.weightedScore,
    error: payload.error,
    judge: payload.judge,
  }
}

function isStableRun(payload: RunLogPayload): boolean {
  if (payload.error) return false
  if (payload.candidateReportEmpty) return false
  return payload.successfulExecuteCalls > 0
}

function applyStability(rows: Array<EvalRow>, allLogs: Array<RunLogPayload>) {
  const byModel = new Map<string, Array<RunLogPayload>>()
  for (const log of allLogs) {
    const list = byModel.get(log.entry.model) ?? []
    list.push(log)
    byModel.set(log.entry.model, list)
  }

  for (const row of rows) {
    const history = (byModel.get(row.model) ?? [])
      .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))
      .slice(0, 5)
    const sampleSize = history.length
    const stableCount = history.filter(isStableRun).length
    const rate = sampleSize > 0 ? stableCount / sampleSize : 0
    const tier = Math.max(1, Math.min(5, Math.round(rate * 4 + 1)))
    row.stabilitySampleSize = sampleSize
    row.stabilityRate = Number(rate.toFixed(2))
    row.stabilityTier = tier
  }
}

function finalizeRows(rows: Array<EvalRow>, allLogs: Array<RunLogPayload>) {
  applyStability(rows, allLogs)

  bucketedTiers(
    rows,
    (row) => row.durationMs,
    (row, tier) => {
      row.speedTier = tier
    },
    true,
  )
  bucketedTiers(
    rows,
    (row) => row.tokenEfficiency,
    (row, tier) => {
      row.tokenEfficiencyTier = tier
    },
    true,
  )

  for (const row of rows) {
    if (!row.judge) continue
    const rating = computeStarRating({
      accuracy: row.judge.accuracy,
      comprehensiveness: row.judge.comprehensiveness,
      typescriptQuality: row.judge.typescriptQuality,
      codeModeEfficiency: row.judge.codeModeEfficiency,
      speedTier: row.speedTier,
      tokenEfficiencyTier: row.tokenEfficiencyTier,
      stabilityTier: row.stabilityTier,
      compilationFailures: row.compilationFailures,
      runtimeFailures: row.runtimeFailures,
      totalExecuteCalls: row.totalExecuteCalls,
    })
    row.stars = rating.stars
    row.weightedScore = rating.weightedScore
  }
}

function listRunLogFiles(): Array<string> {
  if (!existsSync(LOG_DIR)) return []
  return readdirSync(LOG_DIR)
    .filter(
      (name) => name.endsWith('.json') && !name.startsWith('results-summary-'),
    )
    .map((name) => join(LOG_DIR, name))
}

function readRunLog(path: string): RunLogPayload | null {
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as RunLogPayload
  } catch {
    return null
  }
}

async function judgeLatestSession(rejudge: boolean): Promise<void> {
  const files = listRunLogFiles()
  const payloads = files
    .map((path) => ({ path, payload: readRunLog(path) }))
    .filter(
      (entry): entry is { path: string; payload: RunLogPayload } =>
        !!entry.payload,
    )

  if (payloads.length === 0) {
    console.error('[models-eval] No run logs found to judge.')
    process.exit(1)
  }

  const latestSession = payloads
    .map((entry) => entry.payload.sessionStartedAt)
    .sort()
    .at(-1)
  if (!latestSession) {
    console.error('[models-eval] Could not determine latest session.')
    process.exit(1)
  }

  const sessionPayloads = payloads.filter(
    (entry) => entry.payload.sessionStartedAt === latestSession,
  )
  const rows: Array<EvalRow> = []

  for (const entry of sessionPayloads) {
    const payload = entry.payload
    if (payload.error) {
      rows.push(toEvalRow(payload))
      continue
    }
    if (payload.judge && !rejudge) {
      rows.push(toEvalRow(payload))
      continue
    }

    const computed = computeMetrics(payload.messages)
    const judged = await judgeReports({
      query: payload.query,
      goldReport: payload.goldReport,
      candidateReport: payload.candidateReport,
      typescriptEvidence: formatTypescriptEvidence(computed.typeScriptAttempts),
    })
    payload.judge = judged
    payload.noJudge = false

    writeFileSync(entry.path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    rows.push(toEvalRow(payload))
    console.log(`  ✓ judged from log: ${payload.entry.model}`)
  }

  finalizeRows(
    rows,
    payloads.map((p) => p.payload),
  )
  const summaryPath = writeResultsSummary(rows, latestSession)
  const canonicalPath = writeCanonicalResults(rows, latestSession)
  printTable(rows)
  console.log(
    `[models-eval] Summary JSON → ${relative(process.cwd(), summaryPath) || summaryPath}`,
  )
  console.log(
    `[models-eval] Canonical results → ${relative(process.cwd(), canonicalPath) || canonicalPath}`,
  )
}

function writeResultsSummary(
  rows: Array<EvalRow>,
  sessionStartedAt: string,
): string {
  const path = join(
    LOG_DIR,
    `results-summary-${sessionStartedAt.replace(/[:.]/g, '-')}.json`,
  )
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        sessionStartedAt,
        createdAt: new Date().toISOString(),
        rows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return path
}

function writeCanonicalResults(
  rows: Array<EvalRow>,
  sessionStartedAt: string,
): string {
  const path = join(__dirname, 'results.json')
  const payload: CanonicalResultsFile = {
    generatedAt: new Date().toISOString(),
    sessionStartedAt,
    methodology: {
      benchmark:
        'Single benchmark prompt over in-memory customers/products/purchases dataset with code-mode execute_typescript tooling.',
      scoring: [
        'accuracy (1-10): factual correctness vs gold reference',
        'comprehensiveness (1-10): complete coverage of user request',
        'typescriptQuality (1-10): quality and clarity of generated TypeScript',
        'codeModeEfficiency (1-10): effectiveness and step efficiency in tool/code usage',
        'speedTier (1-5): relative wall-clock performance bucketed by local/cloud',
        'tokenEfficiencyTier (1-5): relative tokens-per-successful-execution bucketed by local/cloud',
        'stabilityTier (1-5): success consistency over latest 5 logged runs per model',
      ],
      stability:
        'Stable run means: no top-level error, non-empty candidate report, and at least one successful execute_typescript call.',
      starWeights: {
        accuracy: 0.25,
        comprehensiveness: 0.15,
        typescriptQuality: 0.15,
        codeModeEfficiency: 0.1,
        speedTier: 0.1,
        tokenEfficiencyTier: 0.1,
        stabilityTier: 0.15,
      },
    },
    models: rows,
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return path
}

function teeStream(
  stream: AsyncIterable<StreamChunk>,
  onChunk: (chunk: StreamChunk) => void,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        onChunk(chunk)
        yield chunk
      }
    },
  }
}

function bucketedTiers(
  rows: Array<EvalRow>,
  getter: (row: EvalRow) => number | undefined,
  setter: (row: EvalRow, tier: number) => void,
  lowerIsBetter: boolean,
) {
  for (const category of ['local', 'cloud'] as const) {
    const bucket = rows.filter((r) => r.modelCategory === category)
    const values = bucket
      .map((r) => ({ row: r, value: getter(r) }))
      .filter(
        (r): r is { row: EvalRow; value: number } =>
          typeof r.value === 'number',
      )

    if (values.length === 0) continue
    const min = Math.min(...values.map((v) => v.value))
    const max = Math.max(...values.map((v) => v.value))

    for (const entry of values) {
      if (max === min) {
        setter(entry.row, 5)
        continue
      }
      const normalized = lowerIsBetter
        ? (max - entry.value) / (max - min)
        : (entry.value - min) / (max - min)
      const tier = Math.round(1 + normalized * 4)
      setter(entry.row, Math.max(1, Math.min(5, tier)))
    }
  }
}

function printTable(rows: Array<EvalRow>) {
  console.log('\n=== Results ===\n')
  const nameW = 22
  const modelW = 38
  const starsW = 5
  const accW = 4
  const compW = 4
  const tsW = 3
  const cmW = 3
  const msW = 8

  const header = `${'Model'.padEnd(nameW)} ${'Id'.padEnd(modelW)} ${'★'.padStart(starsW)} ${'ms'.padStart(msW)} ${'Acc'.padStart(accW)} ${'Cmp'.padStart(compW)} ${'TS'.padStart(tsW)} ${'CME'.padStart(cmW)} ${'Spd'.padStart(3)} ${'Tok'.padStart(3)} ${'Stb'.padStart(3)}  Error / summary`
  console.log(header)
  console.log('-'.repeat(header.length + 10))

  for (const r of rows) {
    const acc = r.judge?.accuracy !== undefined ? String(r.judge.accuracy) : '-'
    const comp =
      r.judge?.comprehensiveness !== undefined
        ? String(r.judge.comprehensiveness)
        : '-'
    const tsq =
      r.judge?.typescriptQuality !== undefined
        ? String(r.judge.typescriptQuality)
        : '-'
    const cme =
      r.judge?.codeModeEfficiency !== undefined
        ? String(r.judge.codeModeEfficiency)
        : '-'
    const stars = r.stars
      ? `${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}`
      : '-'
    const err = r.error || ''
    const summary = r.judge?.summary
      ? r.judge.summary.replace(/\s+/g, ' ').slice(0, 120)
      : ''
    const tail = err || summary
    console.log(
      `${r.name.slice(0, nameW - 1).padEnd(nameW)} ${r.model.slice(0, modelW - 1).padEnd(modelW)} ${stars.padStart(starsW)} ${String(r.durationMs).padStart(msW)} ${acc.padStart(accW)} ${comp.padStart(compW)} ${tsq.padStart(tsW)} ${cme.padStart(cmW)} ${String(r.speedTier).padStart(3)} ${String(r.tokenEfficiencyTier).padStart(3)} ${String(r.stabilityTier).padStart(3)}  ${tail}`,
    )
  }
  console.log('')
}

async function main() {
  const {
    ollamaOnly,
    noJudge,
    captureOnly,
    judgeLatest,
    rejudge,
    modelFilter,
  } = parseArgs(process.argv.slice(2))

  mkdirSync(LOG_DIR, { recursive: true })
  if (judgeLatest) {
    await judgeLatestSession(rejudge)
    return
  }

  const effectiveNoJudge = noJudge || captureOnly
  const sessionStartedAt = new Date().toISOString()
  console.log(
    `[models-eval] Run logs → ${relative(process.cwd(), LOG_DIR) || LOG_DIR} (gitignored)`,
  )

  if (!effectiveNoJudge && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '[models-eval] ANTHROPIC_API_KEY is not set; judging will fail. Use --no-judge to skip, or set the key.',
    )
  }

  const gold = loadGoldFile()
  const query = gold.prompt
  const goldReport = extractReportTextFromGold(gold.messages)

  const { tool, systemPrompt } = getCodeModeTools()
  const tools = [tool, getSchemaInfoTool]
  const systemPrompts = [DATABASE_DEMO_SYSTEM_PROMPT, systemPrompt]

  let models = ollamaOnly
    ? EVAL_MODELS.filter((m) => m.model.startsWith('ollama:'))
    : EVAL_MODELS

  if (modelFilter && modelFilter.size > 0) {
    models = models.filter((m) => modelFilter.has(m.model))
    if (models.length === 0) {
      console.error(
        '[models-eval] No models matched --models filter. Check eval-config model ids.',
      )
      process.exit(1)
    }
  }

  const rows: Array<EvalRow> = []

  for (const entry of models) {
    const { provider, modelId } = parseModelId(entry.model)
    const modelCategory = getModelCategory(entry.model)
    console.log(`\n→ Running: ${entry.name} (${entry.model})`)
    const adapter = getTextAdapter(provider, modelId)
    const t0 = Date.now()
    let durationMs = 0
    let ttftMs: number | undefined
    let promptTokens = 0
    let completionTokens = 0
    let totalTokens = 0
    let candidateReport = ''
    let messagesLog: Array<UIMessage> = []
    let error: string | undefined

    const userMessage = normalizeToUIMessage(
      { role: 'user', content: query },
      generateMessageId,
    )
    const processor = new StreamProcessor({
      initialMessages: [userMessage],
    })

    try {
      const stream = chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
        tools,
        systemPrompts,
        agentLoopStrategy: maxIterations(15),
        maxTokens: 8192,
        ...(provider === 'ollama'
          ? {
              modelOptions: {
                num_ctx: 32768,
              },
            }
          : {}),
      })
      await processor.process(
        teeStream(stream, (chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT' && ttftMs === undefined) {
            ttftMs = Date.now() - t0
          }
          if (chunk.type === 'RUN_FINISHED' && chunk.usage) {
            promptTokens += chunk.usage.promptTokens
            completionTokens += chunk.usage.completionTokens
            totalTokens += chunk.usage.totalTokens
          }
        }),
      )
      messagesLog = processor.getMessages()
      candidateReport = extractAssistantReportText(messagesLog)
      durationMs = Date.now() - t0
    } catch (e) {
      durationMs = Date.now() - t0
      messagesLog = processor.getMessages()
      error = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${error}`)
    }

    const computed = computeMetrics(messagesLog)
    const tokenEfficiency =
      computed.successfulExecuteCalls > 0
        ? Number((totalTokens / computed.successfulExecuteCalls).toFixed(2))
        : undefined

    let judge: JudgeResult | undefined
    if (!error && !effectiveNoJudge) {
      try {
        judge = await judgeReports({
          query,
          goldReport,
          candidateReport,
          typescriptEvidence: formatTypescriptEvidence(
            computed.typeScriptAttempts,
          ),
        })
        console.log(
          `  ✓ judged: accuracy=${judge.accuracy} comprehensiveness=${judge.comprehensiveness} typescriptQuality=${judge.typescriptQuality} codeModeEfficiency=${judge.codeModeEfficiency} (${durationMs}ms)`,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        error = error ? `${error}; judge: ${msg}` : `judge: ${msg}`
        console.error(`  ✗ judge failed: ${msg}`)
      }
    } else if (!error && effectiveNoJudge) {
      console.log(
        `  ✓ done (${durationMs}ms, ${captureOnly ? '--capture-only' : '--no-judge'})`,
      )
    }

    const logPayload: RunLogPayload = {
      writtenAt: new Date().toISOString(),
      sessionStartedAt,
      entry: {
        name: entry.name,
        model: entry.model,
      },
      query,
      durationMs,
      ttftMs,
      modelCategory,
      promptTokens,
      completionTokens,
      totalTokens,
      tokenEfficiency,
      speedTier: 1,
      tokenEfficiencyTier: 1,
      stabilityTier: 1,
      stabilityRate: 0,
      stabilitySampleSize: 0,
      totalToolCalls: computed.totalToolCalls,
      totalExecuteCalls: computed.totalExecuteCalls,
      successfulExecuteCalls: computed.successfulExecuteCalls,
      compilationFailures: computed.compilationFailures,
      runtimeFailures: computed.runtimeFailures,
      redundantSchemaChecks: computed.redundantSchemaChecks,
      candidateReportChars: candidateReport.length,
      candidateReportEmpty: candidateReport.trim().length === 0,
      goldReportChars: goldReport.length,
      error,
      judge,
      noJudge: effectiveNoJudge,
      goldReport,
      candidateReport,
      messages: messagesLog,
    }

    const logPath = writeRunLog(logPayload)
    const logRel = relative(process.cwd(), logPath) || logPath
    console.log(`  📄 ${logRel}`)

    rows.push({
      name: entry.name,
      model: entry.model,
      provider,
      modelId,
      modelCategory,
      durationMs,
      ttftMs,
      promptTokens,
      completionTokens,
      totalTokens,
      tokenEfficiency,
      speedTier: 1,
      tokenEfficiencyTier: 1,
      stabilityTier: 1,
      stabilityRate: 0,
      stabilitySampleSize: 0,
      totalToolCalls: computed.totalToolCalls,
      totalExecuteCalls: computed.totalExecuteCalls,
      successfulExecuteCalls: computed.successfulExecuteCalls,
      compilationFailures: computed.compilationFailures,
      runtimeFailures: computed.runtimeFailures,
      redundantSchemaChecks: computed.redundantSchemaChecks,
      error,
      judge,
    })
  }

  const allLogs = listRunLogFiles()
    .map((path) => readRunLog(path))
    .filter((log): log is RunLogPayload => !!log)
  finalizeRows(rows, allLogs)
  const summaryPath = writeResultsSummary(rows, sessionStartedAt)
  const canonicalPath = writeCanonicalResults(rows, sessionStartedAt)
  printTable(rows)
  console.log(
    `[models-eval] Summary JSON → ${relative(process.cwd(), summaryPath) || summaryPath}`,
  )
  console.log(
    `[models-eval] Canonical results → ${relative(process.cwd(), canonicalPath) || canonicalPath}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
